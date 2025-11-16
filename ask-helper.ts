import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import type { DashboardResponse } from "./dashboard-types";

export async function askShelley(question: string): Promise<{ 
  answer: DashboardResponse | string, 
  conversationId: string,
  usedMock?: boolean
}> {
  // For now, use basic question-to-sensor mapping until Shelley LLM access is configured
  // TODO: Replace with full Shelley integration once API keys are available
  
  const tempDir = await mkdtemp(join(tmpdir(), "airq-ask-"));
  const analyzePath = join(tempDir, "analyze.ts");
  
  try {
    // Determine which sensor to query based on question keywords
    const sensorConfig = detectSensor(question);
    
    // Generate a simple analyze script
    const script = generateAnalyzeScript(sensorConfig);
    await Bun.write(analyzePath, script);
    
    // Run the analyze script
    const analyzeProc = Bun.spawn([
      "bun",
      analyzePath
    ], {
      stdout: "pipe",
      stderr: "pipe",
      cwd: tempDir,
      env: {
        ...process.env,
        PATH: `${process.env.HOME}/.bun/bin:/usr/local/bin:/usr/bin:/bin`
      }
    });
    
    const jsonOutput = await new Response(analyzeProc.stdout).text();
    const analyzeExit = await analyzeProc.exited;
    
    if (analyzeExit !== 0) {
      const stderrOutput = await new Response(analyzeProc.stderr).text();
      console.error("Script stderr:", stderrOutput);
    }
    
    // Parse the JSON output
    const dashboardResponse = JSON.parse(jsonOutput.trim()) as DashboardResponse;
    
    // Clean up temp directory
    await rm(tempDir, { recursive: true, force: true }).catch(() => {});
    
    return {
      answer: dashboardResponse,
      conversationId: "mock-" + Date.now(),
      usedMock: true
    };
    
  } catch (error) {
    console.error("Error running analyze script:", error);
    
    // Clean up
    await rm(tempDir, { recursive: true, force: true }).catch(() => {});
    
    return {
      answer: `Error: ${error instanceof Error ? error.message : String(error)}`,
      conversationId: "error-" + Date.now(),
      usedMock: true
    };
  }
}

interface SensorConfig {
  name: string;
  displayName: string;
  unit: string;
  warningThreshold?: number;
  criticalThreshold?: number;
  goodBelow?: boolean; // true if lower values are better
}

function detectSensor(question: string): SensorConfig {
  const q = question.toLowerCase();
  
  // CO2 detection
  if (q.includes('co2') || q.includes('co₂') || q.includes('carbon dioxide')) {
    return {
      name: 'co2_ppm',
      displayName: 'CO₂',
      unit: 'ppm',
      warningThreshold: 800,
      criticalThreshold: 1000,
      goodBelow: true
    };
  }
  
  // PM2.5 detection
  if (q.includes('pm2.5') || q.includes('pm 2.5') || q.includes('particulate') || q.includes('particle')) {
    return {
      name: 'pm2_5_ug_m3',
      displayName: 'PM2.5',
      unit: 'µg/m³',
      warningThreshold: 12,
      criticalThreshold: 35,
      goodBelow: true
    };
  }
  
  // Temperature detection
  if (q.includes('temp') || q.includes('hot') || q.includes('cold') || q.includes('warm')) {
    return {
      name: 'sen55_temp_c',
      displayName: 'Temperature',
      unit: '°C'
    };
  }
  
  // Humidity detection
  if (q.includes('humidity') || q.includes('humid') || q.includes('moisture')) {
    return {
      name: 'sen55_humidity_pct',
      displayName: 'Humidity',
      unit: '%'
    };
  }
  
  // VOC detection
  if (q.includes('voc') || q.includes('volatile') || q.includes('smell') || q.includes('odor')) {
    return {
      name: 'sen55_voc_index',
      displayName: 'VOC Index',
      unit: 'index',
      warningThreshold: 100,
      criticalThreshold: 250,
      goodBelow: true
    };
  }
  
  // Air quality general
  if (q.includes('air quality') || q.includes('quality')) {
    return {
      name: 'co2_ppm',
      displayName: 'CO₂',
      unit: 'ppm',
      warningThreshold: 800,
      criticalThreshold: 1000,
      goodBelow: true
    };
  }
  
  // Default to CO2
  return {
    name: 'co2_ppm',
    displayName: 'CO₂',
    unit: 'ppm',
    warningThreshold: 800,
    criticalThreshold: 1000,
    goodBelow: true
  };
}

function generateAnalyzeScript(config: SensorConfig): string {
  const hasThresholds = config.warningThreshold !== undefined;
  
  return `#!/usr/bin/env bun
import { Database } from "bun:sqlite";

interface DashboardResponse {
  summary: string;
  blocks: Array<any>;
}

try {
  const db = new Database("/home/exedev/app/db.sqlite");
  
  // Query recent data
  const rows = db.query(\`
    SELECT r.ts, r.value 
    FROM readings r 
    JOIN sensors s ON r.sensor_id = s.id 
    WHERE s.name = '${config.name}' 
    ORDER BY r.ts DESC 
    LIMIT 20
  \`).all() as Array<{ ts: number, value: number }>;
  
  if (rows.length === 0) {
    throw new Error("No ${config.displayName} data available");
  }
  
  // Calculate metrics
  const current = rows[0];
  const avg = rows.reduce((sum, r) => sum + r.value, 0) / rows.length;
  
  ${hasThresholds ? `
  let status: 'good' | 'warning' | 'critical' = 'good';
  if (current.value ${config.goodBelow ? '>' : '<'} ${config.criticalThreshold}) {
    status = 'critical';
  } else if (current.value ${config.goodBelow ? '>' : '<'} ${config.warningThreshold}) {
    status = 'warning';
  }
  
  const statusText = status === 'good' ? 'good' : status === 'warning' ? 'elevated' : 'high';
  ` : `
  const status: 'good' | 'warning' | 'critical' = 'good';
  const statusText = 'normal';
  `}
  
  // Prepare chart data
  const chartData = rows.reverse().map(row => ({
    x: new Date(row.ts).toISOString(),
    y: Math.round(row.value * 10) / 10
  }));
  
  const response: DashboardResponse = {
    summary: \`Current ${config.displayName} is \${Math.round(current.value * 10) / 10} ${config.unit} (\${statusText}), averaging \${Math.round(avg * 10) / 10} ${config.unit} over recent readings.\`,
    blocks: [
      {
        type: 'metric',
        title: 'Current ${config.displayName}',
        value: Math.round(current.value * 10) / 10,
        unit: '${config.unit}',
        status: status
      },
      {
        type: 'chart',
        title: '${config.displayName} Levels - Recent Readings',
        chartType: 'line',
        xAxis: { label: 'Time', type: 'time' },
        yAxis: { label: '${config.displayName}', unit: '${config.unit}', min: 0 },
        series: [{
          name: '${config.displayName}',
          color: '#3b82f6',
          data: chartData
        }],
        ${hasThresholds ? `
        annotations: [
          { type: 'threshold', value: ${config.warningThreshold}, label: 'Warning (${config.warningThreshold} ${config.unit})', color: '#f59e0b' },
          { type: 'threshold', value: ${config.criticalThreshold}, label: 'Critical (${config.criticalThreshold} ${config.unit})', color: '#ef4444' }
        ]
        ` : 'annotations: []'}
      },
      {
        type: 'text',
        title: 'Interpretation',
        content: ${hasThresholds ? `
          status === 'good' 
            ? '✅ ${config.displayName} is **good**. Levels are normal.'
            : status === 'warning'
            ? '⚠️ ${config.displayName} is **elevated**. Consider monitoring closely.'
            : '🚨 ${config.displayName} is **high**. Action may be needed!'
        ` : `'ℹ️ Current ${config.displayName} reading: ' + Math.round(current.value * 10) / 10 + ' ${config.unit}'`},
        variant: status === 'good' ? 'success' : status === 'warning' ? 'warning' : 'error'
      }
    ]
  };
  
  console.log(JSON.stringify(response, null, 2));
  
  db.close();
  process.exit(0);
} catch (error) {
  console.error("Error:", error);
  
  const errorResponse = {
    summary: "An error occurred analyzing the data",
    blocks: [{
      type: "text",
      title: "Error",
      content: String(error),
      variant: "error"
    }]
  };
  console.log(JSON.stringify(errorResponse));
  process.exit(1);
}
`;
}
