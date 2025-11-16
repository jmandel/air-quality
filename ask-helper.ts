import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import type { DashboardResponse } from "./dashboard-types";

export async function askShelley(question: string): Promise<{ 
  answer: DashboardResponse | string, 
  conversationId: string,
  scriptPath?: string 
}> {
  // Create temp directory for Shelley to work in
  const tempDir = await mkdtemp(join(tmpdir(), "airq-ask-"));
  const analyzePath = join(tempDir, "analyze.ts");
  
  // Get current time for context
  const now = new Date().toISOString();
  const nowMs = Date.now();
  const sixHoursAgo = nowMs - (6 * 60 * 60 * 1000);
  
  // Craft the comprehensive prompt for Shelley
  const prompt = `You are helping analyze air quality data from an Apollo AIR-1 sensor.

USER QUESTION: "${question}"

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
3. Output ONLY valid JSON to stdout (no console.log, no errors)
4. Follow the DashboardResponse schema

CRITICAL: stdout must be ONLY valid JSON. Use console.error() for debugging.

TYPESCRIPT TEMPLATE:

#!/usr/bin/env bun
import { Database } from "bun:sqlite";

interface DashboardResponse {
  summary: string;
  blocks: Array<TextBlock | MetricBlock | ChartBlock>;
}

interface TextBlock {
  type: "text";
  title?: string;
  content: string;
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

try {
  const db = new Database("/home/exedev/app/db.sqlite");
  
  // Get sensor
  const sensor = db.query("SELECT id, display_name, unit FROM sensors WHERE name = ?").get("co2_ppm");
  const sensorId = sensor.id;
  
  // Get current value
  const current = db.query("SELECT value FROM readings WHERE sensor_id = ? ORDER BY ts DESC LIMIT 1").get(sensorId);
  
  // Get recent data
  const recentData = db.query(\`
    SELECT ts, value 
    FROM readings 
    WHERE sensor_id = ? AND ts >= ?
    ORDER BY ts ASC
  \`).all(sensorId, ${sixHoursAgo});
  
  const response: DashboardResponse = {
    summary: \`Current \${sensor.display_name} is \${current.value} \${sensor.unit}\`,
    blocks: [
      {
        type: "metric",
        title: \`Current \${sensor.display_name}\`,
        value: current.value,
        unit: sensor.unit,
        status: "good"
      },
      {
        type: "chart",
        title: \`\${sensor.display_name} - Recent Readings\`,
        chartType: "line",
        xAxis: { label: "Time", type: "time" },
        yAxis: { label: "Concentration", unit: sensor.unit },
        series: [{
          name: sensor.display_name,
          color: "#3b82f6",
          data: recentData.map(r => ({
            x: new Date(r.ts).toISOString(),
            y: r.value
          }))
        }]
      }
    ]
  };
  
  console.log(JSON.stringify(response, null, 2));
  db.close();
  
} catch (error) {
  console.error("Error:", error);
  console.log(JSON.stringify({
    summary: "Error analyzing data",
    blocks: [{
      type: "text",
      title: "Error",
      content: String(error),
      variant: "error"
    }]
  }));
}

Now write analyze.ts to ${analyzePath} that answers: "${question}"`;

  console.log(`🤖 Calling Shelley CLI...`);

  // Invoke Shelley using CLI
  const shelleyProc = Bun.spawn(["shelley", "-config", "/exe.dev/shelley.json", "-model", "claude-sonnet-4.5", "prompt", "-timeout", "180s", prompt], {
    stdout: "pipe",
    stderr: "pipe",
    cwd: tempDir,
    env: {
      ...process.env,
      PATH: `${process.env.HOME}/.bun/bin:/usr/local/bin:/usr/bin:/bin`
    }
  });
  
  const shelleyStdout = await new Response(shelleyProc.stdout).text();
  const shelleyStderr = await new Response(shelleyProc.stderr).text();
  const shelleyExit = await shelleyProc.exited;
  
  console.log(`📝 Shelley exit: ${shelleyExit}, output: ${shelleyStdout.length} chars`);
  if (shelleyStderr) console.log(`📝 Shelley stderr:\n${shelleyStderr}`);
  
  if (shelleyExit !== 0) {
    throw new Error(`Shelley failed with exit code ${shelleyExit}: ${shelleyStderr}`);
  }
  
  // For conversation ID, we'll use a placeholder since we're not using the HTTP API
  const conversationId = `cli-${Date.now()}`;
  
  // Check if analyze.ts was created
  const scriptExists = await Bun.file(analyzePath).exists();
  console.log(`📄 Script exists at ${analyzePath}: ${scriptExists}`);
  
  if (!scriptExists) {
    console.error("⚠️ analyze.ts was not created by Shelley");
    console.error("📋 Shelley response:\n", shelleyStdout.substring(0, 1000));
    throw new Error("Shelley did not create the analyze script");
  }
  
  const scriptContent = await Bun.file(analyzePath).text();
  console.log(`✅ Script created (${scriptContent.length} bytes)`);
  
  // Run the analyze.ts script
  console.log("🚀 Executing analyze.ts...");
  const analyzeProc = Bun.spawn([`${process.env.HOME}/.bun/bin/bun`, analyzePath], {
    stdout: "pipe",
    stderr: "pipe",
    cwd: tempDir,
    env: {
      ...process.env,
      PATH: `${process.env.HOME}/.bun/bin:/usr/local/bin:/usr/bin:/bin`
    }
  });
  
  const jsonOutput = await new Response(analyzeProc.stdout).text();
  const analyzeStderr = await new Response(analyzeProc.stderr).text();
  const analyzeExit = await analyzeProc.exited;
  
  console.log(`📊 Script exit: ${analyzeExit}, output: ${jsonOutput.length} chars`);
  if (analyzeStderr) console.log(`📊 Stderr:\n${analyzeStderr}`);
  
  if (analyzeExit !== 0) {
    throw new Error(`Analyze script failed with exit code ${analyzeExit}`);
  }
  
  // Parse the JSON output
  const dashboardResponse = JSON.parse(jsonOutput.trim()) as DashboardResponse;
  console.log(`✅ Parsed dashboard with ${dashboardResponse.blocks.length} blocks`);
  
  // Clean up
  await rm(tempDir, { recursive: true, force: true }).catch(() => {});
  
  return {
    answer: dashboardResponse,
    conversationId,
    scriptPath: analyzePath
  };
}
