import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { findPreviousScript } from "./ask-history-lookup";
import { streamShelleyExecutionSandboxed } from "./ask-stream-sandbox";
import dashboardTypesSource from "./dashboard-types.ts" with { type: "text" };
import { saveToHistory } from "./ask-history";

export async function handleAskStreamSandboxed(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const query = url.searchParams.get("q") || url.searchParams.get("query");
  const historyId = url.searchParams.get("id"); // Optional: replay a specific history item
  
  if (!query && !historyId) {
    return Response.json({ 
      error: "Missing query parameter. Use ?q=your_question or ?id=history_id" 
    }, { status: 400 });
  }
  
  // Create temp directory
  const tempDir = await mkdtemp(join(tmpdir(), "airq-ask-"));
  const analyzePath = join(tempDir, "analyze.ts");
  
  let useCachedScript = false;
  let scriptContent: string | undefined;
  let actualQuery = query;
  
  // If history ID provided, load that script directly
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
      const { readFile } = await import("fs/promises");
      scriptContent = await readFile(scriptPath, 'utf-8');
      useCachedScript = true;
    }
  } else {
    // Check for cached script by question text
    const previousScript = await findPreviousScript(query!);
    useCachedScript = !!previousScript;
    scriptContent = previousScript?.scriptContent;
  }
  
  // Build prompt (only if not cached)
  const now = new Date().toISOString();
  const nowMs = Date.now();
  const sixHoursAgo = nowMs - (6 * 60 * 60 * 1000);
  
  // IMPORTANT: Update database path to /db/db.sqlite (inside sandbox)
  const prompt = `You are helping analyze air quality data from an Apollo AIR-1 sensor.

USER QUESTION: "${query}"

DATABASE LOCATION: /db/db.sqlite
NOTE: The database is mounted read-only inside the sandbox at /db/db.sqlite

DATABASE SCHEMA:
- Table: sensors
  Columns: id (INTEGER PRIMARY KEY), name (TEXT), display_name (TEXT), unit (TEXT)
  
- Table: readings  
  Columns: id, ts (INTEGER milliseconds since epoch), sensor_id (FOREIGN KEY), value (REAL)
  Indexes: idx_readings_ts, idx_readings_sensor_id
  Note: ts is stored in milliseconds (e.g., ${nowMs} = ${now})

AVAILABLE SENSORS (name → display_name, unit):
- co2_ppm → "CO₂", ppm (good < 800, warning 800-1000, critical > 1000)
- pm2_5_ug_m3 → "PM 2.5", µg/m³ (good < 12, warning 12-35, critical > 35)
- sen55_temp_c → "Temperature", °C (typical: 20-30)
- sen55_humidity_pct → "Humidity", % (comfortable 40-60)
- sen55_voc_index → "VOC Index", index (good < 100, warning 100-250, critical > 250)
(+ 18 more sensors available)

CURRENT TIME: ${now} (${nowMs} ms)
SIX HOURS AGO: ${sixHoursAgo} ms

YOUR TASK:
Write a TypeScript script called "analyze.ts" and save it to: /work/analyze.ts

The script MUST:
1. Query /db/db.sqlite using bun:sqlite (open in readonly mode)
2. Answer the user's question with data
3. Output ONLY valid JSON to stdout (use console.log())
4. Follow the EXACT DashboardResponse schema below

IMPORTANT - WRITE REUSABLE SCRIPTS:
- If the question mentions "today", "now", "current", or relative times: Calculate these INSIDE the script using Date.now()
- DO NOT hardcode timestamps - scripts are re-executed to get fresh data
- Scripts should produce correct results whenever they run, not just at generation time
- Example: For "today's peak", use: const startOfToday = new Date().setHours(0,0,0,0)

EXAMPLE - BAD (hardcoded):
  const today = 1763308454049; // ❌ Will be wrong when re-run tomorrow

EXAMPLE - GOOD (calculated):
  const now = Date.now();
  const today = new Date().setHours(0, 0, 0, 0); // ✅ Always correct

REQUIRED OUTPUT SCHEMA:

${dashboardTypesSource}

Now write analyze.ts to ${analyzePath} that answers: "${query}"`;
  
  // Create SSE stream
  const stream = new ReadableStream({
    async start(controller) {
      try {
        let finalScriptContent = scriptContent;
        let dashboardResult: any;
        
        for await (const event of streamShelleyExecutionSandboxed(
          actualQuery || query,
          analyzePath,
          tempDir,
          prompt,
          useCachedScript,
          scriptContent
        )) {
          // Send SSE event
          const data = `event: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`;
          controller.enqueue(new TextEncoder().encode(data));
          
          if (event.type === "result") {
            dashboardResult = event.data;
          }
          if (event.type === "done") {
            finalScriptContent = event.data.scriptContent;
          }
        }
        
        // Save to history
        if (dashboardResult && finalScriptContent) {
          const conversationId = `cli-${Date.now()}`;
          const historyId = await saveToHistory(
            actualQuery || query,
            dashboardResult,
            conversationId,
            finalScriptContent,
            useCachedScript
          );
          
          const finalEvent = `event: saved\ndata: ${JSON.stringify({ historyId })}\n\n`;
          controller.enqueue(new TextEncoder().encode(finalEvent));
        }
        
        controller.close();
        
        // Cleanup
        await rm(tempDir, { recursive: true, force: true }).catch(() => {});
      } catch (error: any) {
        const errorEvent = `event: error\ndata: ${JSON.stringify({ message: error.message })}\n\n`;
        controller.enqueue(new TextEncoder().encode(errorEvent));
        controller.close();
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
