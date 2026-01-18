/**
 * Ask Stream Route - Uses Shelley API to generate Vega-Lite visualizations
 */

import { mkdtemp, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { spawn } from "bun";
import { findPreviousScript } from "./ask-history-lookup";
import { saveToHistory } from "./ask-history";
import { createConversation, streamConversation, extractFinalResponse } from "./shelley-api";
import vegaTypesSource from "./vega-types.ts" with { type: "text" };

const DB_PATH = process.cwd() + "/db.sqlite";
const BUN_PATH = process.env.HOME + "/.bun/bin/bun";

function buildSchemaSection(): string {
  const { Database } = require("bun:sqlite");
  const db = new Database(DB_PATH, { readonly: true });
  
  try {
    const sensors = db.query("SELECT * FROM sensors ORDER BY id").all() as Array<{
      id: number;
      name: string;
      display_name: string | null;
      unit: string | null;
    }>;
    
    let schema = "AVAILABLE SENSORS:\n\n";
    sensors.forEach(s => {
      const display = s.display_name || s.name;
      const unit = s.unit || "(unitless)";
      schema += `${s.id}. ${s.name} → "${display}" (${unit})\n`;
    });
    
    schema += "\nCOMMON THRESHOLDS:\n";
    schema += "- CO₂ (id=1): good <800ppm, warning 800-1000, critical >1000\n";
    schema += "- PM2.5 (id=9): good <12, warning 12-35, critical >35 µg/m³\n";
    schema += "- VOC Index (id=4): good <100, warning 100-250, critical >250\n";
    
    return schema;
  } finally {
    db.close();
  }
}

function buildPrompt(question: string, analyzePath: string): string {
  const now = new Date().toISOString();
  const nowMs = Date.now();
  const schemaSection = buildSchemaSection();
  
  return `You are helping analyze air quality data. Output a SINGLE Vega-Lite specification.

USER QUESTION: "${question}"

DATABASE: /db/db.sqlite (SQLite, read-only)
- readings (ts INTEGER ms, sensor_id INTEGER, value REAL)
- readings_aggregated (minute_ts, sensor_id, avg_value, min_value, max_value, sample_count)  
- sensors (id, name, display_name, unit)

${schemaSection}

CURRENT TIME: ${now} (${nowMs} ms)

TASK: Write TypeScript to ${analyzePath} that outputs a SINGLE Vega-Lite JSON spec.

RULES:
- Use Date.now() for timestamps (not hardcoded)
- Database path: /db/db.sqlite
- Output ONLY the Vega-Lite JSON to stdout
- Use vconcat/hconcat for multiple charts
- Use text marks for metrics/labels
- Use title.text and title.subtitle for summary

EXAMPLE:
\`\`\`typescript
import { Database } from "bun:sqlite";
const db = new Database("/db/db.sqlite", { readonly: true });
const now = Date.now();
const hourAgo = now - 60 * 60 * 1000;

const data = db.query("SELECT ts, value FROM readings WHERE sensor_id = 1 AND ts >= ? ORDER BY ts")
  .all(hourAgo) as Array<{ts: number, value: number}>;
const current = data[data.length - 1]?.value ?? 0;

const spec = {
  "$schema": "https://vega.github.io/schema/vega-lite/v5.json",
  "title": { "text": "CO₂ Level: " + current + " ppm", "subtitle": "Last hour trend" },
  "width": "container",
  "height": 300,
  "data": { "values": data.map(d => ({ t: new Date(d.ts).toISOString(), v: d.value })) },
  "mark": { "type": "line", "strokeWidth": 2 },
  "encoding": {
    "x": { "field": "t", "type": "temporal", "title": "Time" },
    "y": { "field": "v", "type": "quantitative", "title": "ppm", "scale": { "zero": false } }
  }
};
console.log(JSON.stringify(spec));
db.close();
\`\`\`

Write script for: "${question}"`;
}

/**
 * Run script in bubblewrap sandbox
 */
async function runInSandbox(scriptPath: string, workDir: string): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const bunDir = process.env.HOME + "/.bun";
  
  const bwrapArgs = [
    "--ro-bind", "/usr", "/usr",
    "--ro-bind", "/lib", "/lib",
    "--ro-bind", "/lib64", "/lib64",
    "--ro-bind", "/bin", "/bin",
    "--bind", workDir, "/work",
    "--ro-bind", bunDir, "/bun",
    "--ro-bind", DB_PATH, "/db/db.sqlite",
    "--dev-bind", "/dev", "/dev",
    "--proc", "/proc",
    "--tmpfs", "/tmp",
    "--unshare-net",
    "--die-with-parent",
    "--chdir", "/work",
  ];
  
  const proc = spawn(["bwrap", ...bwrapArgs, "/bun/bin/bun", "/work/analyze.ts"], {
    stdout: "pipe",
    stderr: "pipe",
    env: { PATH: "/bun/bin:/usr/bin:/bin", HOME: "/tmp" }
  });
  
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited
  ]);
  
  return { stdout, stderr, exitCode: exitCode || 0 };
}

export async function handleAskStreamVega(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const query = url.searchParams.get("q") || url.searchParams.get("query");
  const historyId = url.searchParams.get("id");
  
  if (!query && !historyId) {
    return Response.json({ error: "Missing query parameter" }, { status: 400 });
  }
  
  const tempDir = await mkdtemp(join(tmpdir(), "airq-ask-"));
  const analyzePath = join(tempDir, "analyze.ts");
  
  let useCachedScript = false;
  let scriptContent: string | undefined;
  let actualQuery = query;
  
  // Check for cached script
  if (historyId) {
    const { getHistoryMetadata, ASKED_DIR } = await import("./ask-history");
    const metadata = await getHistoryMetadata(historyId);
    if (!metadata) {
      return Response.json({ error: "History item not found" }, { status: 404 });
    }
    actualQuery = metadata.question;
    const scriptPath = join(ASKED_DIR, `${historyId}.ts`);
    const { existsSync } = await import("fs");
    if (existsSync(scriptPath)) {
      scriptContent = await Bun.file(scriptPath).text();
      useCachedScript = true;
    }
  } else if (query) {
    const previousScript = await findPreviousScript(query);
    if (previousScript) {
      scriptContent = previousScript.scriptContent;
      useCachedScript = true;
    }
  }
  
  // Create SSE stream
  const stream = new ReadableStream({
    async start(controller) {
      const send = (type: string, data: any) => {
        controller.enqueue(new TextEncoder().encode(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`));
      };
      
      try {
        let finalScriptContent = scriptContent;
        
        if (useCachedScript && scriptContent) {
          send("status", "Using cached script...");
          await writeFile(analyzePath, scriptContent);
        } else {
          send("status", "Calling Shelley to generate analysis...");
          
          const prompt = buildPrompt(actualQuery || query!, analyzePath);
          const cwd = tempDir;
          
          // Create conversation via Shelley API
          const conversationId = await createConversation(prompt, cwd, "claude-sonnet-4.5");
          send("shelley_started", { conversationId });
          
          // Stream progress
          for await (const event of streamConversation(conversationId, 180000)) {
            if (event.type === "tool_use") {
              send("shelley_progress", { type: "tool", tool: event.data.tool });
            } else if (event.type === "tool_result") {
              send("shelley_progress", { type: "tool_done", preview: event.data.preview });
            } else if (event.type === "agent_text") {
              send("shelley_progress", { type: "thinking", text: event.data.text });
            } else if (event.type === "complete") {
              send("shelley_complete", { conversationId });
              break;
            }
          }
          
          // Check if script was created
          const scriptExists = await Bun.file(analyzePath).exists();
          if (!scriptExists) {
            throw new Error("Shelley did not create the analyze script");
          }
          
          finalScriptContent = await Bun.file(analyzePath).text();
          send("script_created", { size: finalScriptContent.length });
        }
        
        // Execute script in sandbox
        send("status", "Executing analysis script...");
        const result = await runInSandbox(analyzePath, tempDir);
        
        if (result.exitCode !== 0) {
          throw new Error(`Script failed: ${result.stderr}`);
        }
        
        // Parse result
        const vegaResponse = JSON.parse(result.stdout.trim());
        send("result", vegaResponse);
        
        // Send script content
        if (finalScriptContent) {
          send("script", { content: finalScriptContent });
        }
        
        // Save to history
        if (finalScriptContent) {
          const histId = await saveToHistory(
            actualQuery || query!,
            vegaResponse,
            `api-${Date.now()}`,
            finalScriptContent,
            useCachedScript
          );
          send("saved", { historyId: histId });
        }
        
        controller.close();
      } catch (error: any) {
        send("error", { message: error.message });
        controller.close();
      } finally {
        await rm(tempDir, { recursive: true, force: true }).catch(() => {});
      }
    }
  });
  
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive"
    }
  });
}
