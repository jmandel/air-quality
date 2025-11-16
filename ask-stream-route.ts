import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { findPreviousScript } from "./ask-history-lookup";
import { streamShelleyExecution } from "./ask-stream";
import { saveToHistory } from "./ask-history";

export async function handleAskStream(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const query = url.searchParams.get("q") || url.searchParams.get("query");
  
  if (!query) {
    return Response.json({ 
      error: "Missing query parameter. Use ?q=your_question" 
    }, { status: 400 });
  }
  
  // Create temp directory
  const tempDir = await mkdtemp(join(tmpdir(), "airq-ask-"));
  const analyzePath = join(tempDir, "analyze.ts");
  
  // Check for cached script
  const previousScript = await findPreviousScript(query);
  const useCachedScript = !!previousScript;
  const scriptContent = previousScript?.scriptContent;
  
  // Build prompt (only if not cached)
  const now = new Date().toISOString();
  const nowMs = Date.now();
  const sixHoursAgo = nowMs - (6 * 60 * 60 * 1000);
  
  const prompt = `You are helping analyze air quality data from an Apollo AIR-1 sensor.

USER QUESTION: "${query}"

DATABASE LOCATION: /home/exedev/app/db.sqlite

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
Write a TypeScript script called "analyze.ts" and save it to: ${analyzePath}

The script MUST:
1. Query /home/exedev/app/db.sqlite using bun:sqlite
2. Answer the user's question with data
3. Output ONLY valid JSON to stdout (use console.write(), NOT console.log)
4. Follow the EXACT DashboardResponse schema below

REQUIRED OUTPUT SCHEMA:

interface DashboardResponse {
  summary: string;  // Brief summary text
  blocks: Array<TextBlock | MetricBlock | ChartBlock>;
}

interface TextBlock {
  type: "text";
  title?: string;
  content: string;  // Main text (can use markdown)
  variant?: "info" | "warning" | "success" | "error";
}

interface MetricBlock {
  type: "metric";
  title: string;
  value: number;
  unit: string;
  status?: "good" | "warning" | "critical";
  trend?: {
    direction: "up" | "down" | "stable";
    percentage?: number;
    period?: string;
  };
}

interface ChartBlock {
  type: "chart";
  title: string;
  chartType: "line" | "bar" | "area";
  xAxis: { label: string; type: "time" | "category" };
  yAxis: { label: string; unit?: string; min?: number; max?: number };
  series: Array<{
    name: string;
    color?: string;
    data: Array<{ x: string | number; y: number }>;
  }>;
  annotations?: Array<{
    type: "threshold";
    value: number;
    label: string;
    color?: string;
  }>;
}

EXAMPLE OUTPUT:
{
  "summary": "Current CO₂ level is 450 ppm (good)",
  "blocks": [
    {
      "type": "metric",
      "title": "Current CO₂",
      "value": 450,
      "unit": "ppm",
      "status": "good"
    },
    {
      "type": "chart",
      "title": "CO₂ - Last Hour",
      "chartType": "line",
      "xAxis": { "label": "Time", "type": "time" },
      "yAxis": { "label": "CO₂", "unit": "ppm" },
      "series": [{
        "name": "CO₂",
        "data": [
          { "x": "2025-11-15T20:00:00Z", "y": 420 },
          { "x": "2025-11-15T20:30:00Z", "y": 450 }
        ]
      }]
    }
  ]
}

Now write analyze.ts to ${analyzePath} that answers: "${query}"`;
  
  // Create SSE stream
  const stream = new ReadableStream({
    async start(controller) {
      try {
        let finalScriptContent = scriptContent;
        let dashboardResult: any;
        
        for await (const event of streamShelleyExecution(
          query,
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
            query,
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
