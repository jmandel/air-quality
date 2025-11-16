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
  
// Add this function before the prompt building section

function buildSchemaSection(): string {
  const { Database } = require("bun:sqlite");
  const db = new Database("/home/exedev/app/db.sqlite", { readonly: true });
  
  try {
    // Get all sensors
    const sensors = db.query("SELECT * FROM sensors ORDER BY id").all() as Array<{
      id: number;
      name: string;
      display_name: string | null;
      unit: string | null;
    }>;
    
    // Get table schemas
    const readingsSchema = db.query("PRAGMA table_info(readings)").all();
    const aggSchema = db.query("PRAGMA table_info(readings_aggregated)").all();
    
    // Get indexes
    const indexes = db.query(`
      SELECT name, tbl_name 
      FROM sqlite_master 
      WHERE type='index' AND sql IS NOT NULL
    `).all() as Array<{ name: string; tbl_name: string }>;
    
    // Build schema section
    let schema = "DATABASE SCHEMA:\n\n";
    
    // Readings table
    schema += "Table: readings (raw sensor data, 7-day retention)\n";
    schema += "Columns:\n";
    (readingsSchema as any[]).forEach((col: any) => {
      const pk = col.pk ? " PRIMARY KEY" : "";
      const notnull = col.notnull ? " NOT NULL" : "";
      schema += `  - ${col.name}: ${col.type}${pk}${notnull}\n`;
    });
    schema += "Note: ts is milliseconds since epoch (e.g., Date.now())\n\n";
    
    // Aggregated table
    schema += "Table: readings_aggregated (per-minute summaries, permanent retention)\n";
    schema += "Columns:\n";
    (aggSchema as any[]).forEach((col: any) => {
      const pk = col.pk ? " PRIMARY KEY" : "";
      const notnull = col.notnull ? " NOT NULL" : "";
      schema += `  - ${col.name}: ${col.type}${pk}${notnull}\n`;
    });
    schema += "Note: Use this table for queries > 2 hours for better performance\n\n";
    
    // Indexes
    const readingsIndexes = indexes.filter(i => i.tbl_name === "readings");
    const aggIndexes = indexes.filter(i => i.tbl_name === "readings_aggregated");
    
    schema += "Indexes on readings: ";
    schema += readingsIndexes.map(i => i.name).join(", ") + "\n";
    schema += "Indexes on readings_aggregated: ";
    schema += aggIndexes.map(i => i.name).join(", ") + "\n\n";
    
    // Sensors table  
    schema += "AVAILABLE SENSORS:\n\n";
    sensors.forEach(s => {
      const display = s.display_name || s.name;
      const unit = s.unit || "n/a";
      schema += `${s.id}. ${s.name} → "${display}" (${unit})\n`;
    });
    
    schema += "\nCOMMON SENSOR THRESHOLDS:\n";
    schema += "- CO₂ (id=1): good <800ppm, warning 800-1000, critical >1000\n";
    schema += "- PM2.5 (id=9): good <12, warning 12-35, critical >35 µg/m³\n";
    schema += "- VOC Index (id=20): good <100, warning 100-250, critical >250\n";
    schema += "- Temperature (id=16): typical 20-30°C\n";
    schema += "- Humidity (id=18): comfortable 40-60%\n";
    
    return schema;
  } finally {
    db.close();
  }
}

const schemaSection = buildSchemaSection();
  // IMPORTANT: Update database path to /db/db.sqlite (inside sandbox)
  const prompt = `You are helping analyze air quality data from an Apollo AIR-1 sensor.

USER QUESTION: "${actualQuery || query}"

DATABASE LOCATION: /db/db.sqlite
NOTE: The database is mounted read-only inside the sandbox at /db/db.sqlite

DATABASE SCHEMA:
${schemaSection}

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


COMPLETE WORKING EXAMPLES:

Example 1: Simple query with statistics
```typescript
import { Database } from "bun:sqlite";

const db = new Database("/db/db.sqlite", { readonly: true });
const now = Date.now();
const oneHourAgo = now - (60 * 60 * 1000);

// Use prepared statements for parameterized queries
const stmt = db.prepare(`
  SELECT ts, value 
  FROM readings 
  WHERE sensor_id = ? AND ts >= ?
  ORDER BY ts ASC
`);

const readings = stmt.all(1, oneHourAgo);  // sensor_id=1 is CO₂

// Calculate statistics
const values = readings.map(r => r.value);
const avg = values.reduce((a, b) => a + b, 0) / values.length;
const max = Math.max(...values);

const response = {
  summary: `CO₂ averaged ${Math.round(avg)} ppm in the last hour`,
  blocks: [
    {
      type: "metric",
      title: "Average CO₂",
      value: Math.round(avg),
      unit: "ppm",
      status: avg > 800 ? "warning" : "success"
    }
  ]
};

console.log(JSON.stringify(response, null, 2));
db.close();
```

Example 2: Using aggregated data (faster for longer time ranges)
```typescript
import { Database } from "bun:sqlite";

const db = new Database("/db/db.sqlite", { readonly: true });
const now = Date.now();
const oneDayAgo = now - (24 * 60 * 60 * 1000);

// Aggregated table has per-minute summaries
const stmt = db.prepare(`
  SELECT minute_ts, avg_value, min_value, max_value
  FROM readings_aggregated
  WHERE sensor_id = ? AND minute_ts >= ?
  ORDER BY minute_ts ASC
`);

const aggData = stmt.all(3, oneDayAgo);  // sensor_id=3 is PM2.5

// Calculate daily average from minute averages
const dailyAvg = aggData.reduce((sum, r) => sum + r.avg_value, 0) / aggData.length;

const response = {
  summary: `PM2.5 averaged ${dailyAvg.toFixed(1)} µg/m³ over 24 hours`,
  blocks: [
    {
      type: "metric",
      title: "24h Average PM2.5",
      value: parseFloat(dailyAvg.toFixed(1)),
      unit: "µg/m³",
      status: dailyAvg > 35 ? "danger" : dailyAvg > 12 ? "warning" : "success"
    }
  ]
};

console.log(JSON.stringify(response, null, 2));
db.close();
```

Example 3: Multiple sensors with chart
```typescript
import { Database } from "bun:sqlite";

const db = new Database("/db/db.sqlite", { readonly: true });
const now = Date.now();
const sixHoursAgo = now - (6 * 60 * 60 * 1000);

// Get CO₂ data
const co2Data = db.prepare(`
  SELECT ts, value FROM readings 
  WHERE sensor_id = 1 AND ts >= ? 
  ORDER BY ts ASC
`).all(sixHoursAgo);

// Get temperature data
const tempData = db.prepare(`
  SELECT ts, value FROM readings 
  WHERE sensor_id = 16 AND ts >= ? 
  ORDER BY ts ASC
`).all(sixHoursAgo);

const response = {
  summary: "Temperature and CO₂ levels over 6 hours",
  blocks: [
    {
      type: "chart",
      title: "Environmental Conditions",
      chartType: "line",
      series: [
        {
          name: "CO₂ (ppm)",
          data: co2Data.map(r => ({ x: r.ts, y: r.value })),
          color: "#3b82f6"
        },
        {
          name: "Temperature (°C)",
          data: tempData.map(r => ({ x: r.ts, y: r.value })),
          color: "#f59e0b"
        }
      ],
      xAxis: { type: "time", label: "Time" },
      yAxis: { label: "Value" }
    }
  ]
};

console.log(JSON.stringify(response, null, 2));
db.close();
```

Example 4: Time-based comparisons
```typescript
import { Database } from "bun:sqlite";

const db = new Database("/db/db.sqlite", { readonly: true });
const now = Date.now();

// Today's data
const startOfToday = new Date().setHours(0, 0, 0, 0);
const todayData = db.prepare(`
  SELECT AVG(value) as avg FROM readings 
  WHERE sensor_id = 1 AND ts >= ?
`).get(startOfToday);

// Yesterday's data
const startOfYesterday = startOfToday - (24 * 60 * 60 * 1000);
const yesterdayData = db.prepare(`
  SELECT AVG(value) as avg FROM readings 
  WHERE sensor_id = 1 AND ts >= ? AND ts < ?
`).get(startOfYesterday, startOfToday);

const change = todayData.avg - yesterdayData.avg;
const percentChange = (change / yesterdayData.avg * 100).toFixed(1);

const response = {
  summary: `CO₂ is ${change > 0 ? 'up' : 'down'} ${Math.abs(percentChange)}% vs yesterday`,
  blocks: [
    {
      type: "metric",
      title: "Today's CO₂",
      value: Math.round(todayData.avg),
      unit: "ppm",
      trend: {
        direction: change > 0 ? "up" : "down",
        percentage: Math.abs(parseFloat(percentChange)),
        period: "vs yesterday"
      }
    }
  ]
};

console.log(JSON.stringify(response, null, 2));
db.close();
```

SENSOR IDs (use these in WHERE sensor_id = ?):
1=co2_ppm, 2=co_ppm, 3=pm2_5_ug_m3, 4=pm10_ug_m3, 5=pm1_ug_m3, 
6=pm4_ug_m3, 7=pm0_3_to_1_ug_m3, 8=pm1_to_2_5_ug_m3, 
9=pm2_5_to_4_ug_m3, 10=pm4_to_10_ug_m3, 11=ethanol_ppm, 12=nh3_ppm, 
13=no2_ppm, 14=h2_ppm, 15=ch4_ppm, 16=sen55_temp_c, 17=dps_temp_c, 
18=sen55_humidity_pct, 19=sen55_voc_index, 20=sen55_nox_index, 
21=pressure_hpa, 22=wifi_rssi_dbm, 23=esp_temp_c

TIPS:
- Always use prepared statements: db.prepare(sql).all(params)
- Use .all() for multiple rows, .get() for single row
- Close database with db.close() when done
- Timestamps are in milliseconds
- For time ranges > 2 hours, consider using readings_aggregated table
- readings table has raw data (7-day retention)
- readings_aggregated table has per-minute summaries (permanent retention)

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
          // Send script content as separate event for UI display
          const scriptEvent = `event: script\ndata: ${JSON.stringify({ content: finalScriptContent })}\n\n`;
          controller.enqueue(new TextEncoder().encode(scriptEvent));
          
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
