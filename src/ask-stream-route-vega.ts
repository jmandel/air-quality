/**
 * Ask Stream Route - Uses Shelley API to generate Vega-Lite visualizations
 */

import { mkdtemp, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { spawn } from "bun";
import { findPreviousScript } from "./ask-history-lookup";
import { saveToHistory } from "./ask-history";
import { createConversation, streamConversation, extractFinalResponse, setShelleyAPI } from "./shelley-api";
import { startSandboxedShelley, type SandboxedShelley } from "./sandboxed-shelley";
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
  
  return `You are a data visualization expert creating air quality dashboards. Output a SINGLE Vega-Lite specification.

USER QUESTION: "${question}"

DATABASE: ./db.sqlite (SQLite, read-only, in current working directory)
- readings (ts INTEGER ms, sensor_id INTEGER, value REAL)
- readings_aggregated (minute_ts, sensor_id, avg_value, min_value, max_value, sample_count)  
- sensors (id, name, display_name, unit)

${schemaSection}

CURRENT TIME: ${now} (${nowMs} ms)

TASK: Write TypeScript to ${analyzePath} that outputs a SINGLE Vega-Lite JSON spec.

## TECHNICAL RULES
- Use Date.now() for timestamps (not hardcoded values)
- Database path: ./db.sqlite (relative to cwd)
- Output ONLY valid Vega-Lite JSON to stdout
- Always close db connection

## VISUALIZATION DESIGN GUIDE

### Layout Strategy
- Use "vconcat" to stack charts vertically (best for time series comparisons)
- Use "hconcat" for side-by-side comparisons (e.g., current vs average)
- Use "layer" to overlay threshold lines, annotations, or multiple series
- Use "facet" to create small multiples by sensor type

### Title & Summary (IMPORTANT)
- title.text: Key insight or current value (e.g., "CO₂: 650 ppm - Good")
- title.subtitle: Context/range (e.g., "Last 6 hours | Range: 480-720 ppm")
- Make titles answer the user's question directly

### Effective Chart Types
- LINE: Time series trends (use strokeWidth: 2-3 for visibility)
- AREA: Cumulative or range visualization  
- BAR: Comparisons, hourly/daily aggregates
- POINT: Scatter plots for correlation
- RULE: Threshold lines (layer these over main chart)
- TEXT: Big number displays, annotations

### Color Coding (use consistently)
- Good/Normal: #22c55e (green)
- Warning: #f59e0b (amber)  
- Critical/Bad: #ef4444 (red)
- Neutral/Info: #3b82f6 (blue)
- Use color to encode status, not just decoration

### Threshold Lines (very useful for air quality!)
Add horizontal rules for health thresholds:
\`\`\`json
"layer": [
  { /* main chart */ },
  {
    "mark": {"type": "rule", "strokeDash": [4,4], "color": "#f59e0b"},
    "encoding": {"y": {"datum": 800}}
  },
  {
    "mark": {"type": "text", "align": "left", "dx": 5, "color": "#f59e0b"},
    "encoding": {"y": {"datum": 800}, "text": {"value": "Warning: 800 ppm"}}
  }
]
\`\`\`

### Big Number Display (for "current" queries)
Use text marks with large fontSize:
\`\`\`json
{
  "mark": {"type": "text", "fontSize": 72, "fontWeight": "bold"},
  "encoding": {"text": {"value": "650 ppm"}}
}
\`\`\`

### Multi-Sensor Comparison
Use facet or color encoding:
\`\`\`json
"encoding": {
  "color": {"field": "sensor", "type": "nominal"},
  "y": {"field": "value", "type": "quantitative"}
}
\`\`\`

### Sparklines (compact trends)
Small, minimal charts:
\`\`\`json
{"width": 200, "height": 50, "mark": "line", "encoding": {...}}
\`\`\`

### Best Practices
1. Always show units in axis titles or annotations
2. Use "scale": {"zero": false} for narrow-range data (temp, pressure)
3. Add context: min/max/avg in subtitle
4. For status questions, lead with a clear good/warning/critical indicator
5. For trends, show direction with annotations or title
6. Format times nicely: use timeUnit in encoding

## EXAMPLE - Current Value with Trend
\`\`\`typescript
import { Database } from "bun:sqlite";
const db = new Database("./db.sqlite", { readonly: true });
const now = Date.now();
const hourAgo = now - 60 * 60 * 1000;

const data = db.query("SELECT ts, value FROM readings WHERE sensor_id = 1 AND ts >= ? ORDER BY ts")
  .all(hourAgo) as Array<{ts: number, value: number}>;
const current = data[data.length - 1]?.value ?? 0;
const avg = data.reduce((s,d) => s + d.value, 0) / data.length;
const status = current < 800 ? "Good ✅" : current < 1000 ? "Warning ⚠️" : "Poor ❌";

const spec = {
  "$schema": "https://vega.github.io/schema/vega-lite/v5.json",
  "title": { 
    "text": "CO₂: " + Math.round(current) + " ppm - " + status,
    "subtitle": "Avg: " + Math.round(avg) + " ppm | Last hour"
  },
  "width": "container",
  "height": 250,
  "layer": [
    {
      "data": { "values": data.map(d => ({ t: new Date(d.ts).toISOString(), v: d.value })) },
      "mark": { "type": "area", "line": true, "color": "#3b82f6", "opacity": 0.3 },
      "encoding": {
        "x": { "field": "t", "type": "temporal", "title": "Time" },
        "y": { "field": "v", "type": "quantitative", "title": "CO₂ (ppm)", "scale": { "zero": false } }
      }
    },
    {
      "mark": {"type": "rule", "color": "#f59e0b", "strokeDash": [4,4]},
      "encoding": {"y": {"datum": 800}}
    },
    {
      "mark": {"type": "rule", "color": "#ef4444", "strokeDash": [4,4]},
      "encoding": {"y": {"datum": 1000}}
    }
  ]
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
    "--ro-bind", DB_PATH, "/work/db.sqlite",
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
      
      let sandbox: SandboxedShelley | null = null;
      
      try {
        let finalScriptContent = scriptContent;
        
        if (useCachedScript && scriptContent) {
          send("status", "Using cached script...");
          // Fix DB path for sandbox - old scripts may have /db/db.sqlite
          const fixedScript = scriptContent.replace(/"\/db\/db\.sqlite"/g, '"./db.sqlite"');
          await writeFile(analyzePath, fixedScript);
          finalScriptContent = fixedScript;
        } else {
          send("status", "Starting sandboxed Shelley...");
          
          // Start a fresh sandboxed Shelley for this request
          sandbox = await startSandboxedShelley(DB_PATH);
          setShelleyAPI(sandbox.apiUrl);
          
          send("status", "Calling Shelley to generate analysis...");
          
          const prompt = buildPrompt(actualQuery || query!, "/work/analyze.ts");
          // Use /work as cwd - that's where the sandboxed Shelley operates
          const cwd = "/work";
          
          // Create conversation via sandboxed Shelley API
          const conversationId = await createConversation(prompt, cwd, "claude-sonnet-4.5");
          send("shelley_started", { conversationId, port: sandbox.port });
          
          // Stream progress
          for await (const event of streamConversation(conversationId, 180000)) {
            if (event.type === "tool_use") {
              send("shelley_progress", { type: "tool", tool: event.data.tool, input: event.data.input });
            } else if (event.type === "tool_result") {
              send("shelley_progress", { type: "tool_done", preview: event.data.preview });
            } else if (event.type === "agent_text") {
              send("shelley_progress", { type: "thinking", text: event.data.text });
            } else if (event.type === "complete") {
              send("shelley_complete", { conversationId });
              break;
            }
          }
          
          // Check if script was created in the sandbox's work directory
          const sandboxScriptPath = join(sandbox.workDir, "analyze.ts");
          const scriptExists = await Bun.file(sandboxScriptPath).exists();
          if (!scriptExists) {
            throw new Error("Shelley did not create the analyze script");
          }
          
          // Copy script from sandbox to our temp directory
          finalScriptContent = await Bun.file(sandboxScriptPath).text();
          await writeFile(analyzePath, finalScriptContent);
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
        // Clean up sandboxed Shelley if we started one
        if (sandbox) {
          await sandbox.cleanup().catch(() => {});
        }
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
