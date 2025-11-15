import { mkdtemp, readFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import type { DashboardResponse } from "./dashboard-types";

export async function askShelley(question: string): Promise<{ 
  answer: DashboardResponse | string, 
  conversationId: string,
  rawOutput?: string 
}> {
  // Create temp directory for Shelley to write to
  const tempDir = await mkdtemp(join(tmpdir(), "airq-ask-"));
  const responseFile = join(tempDir, "response.json");
  
  // Get current database stats for context
  const dbPath = "/home/exedev/app/db.sqlite";
  
  // Craft the prompt with instructions
  const prompt = `You are analyzing air quality data from an Apollo AIR-1 sensor.

DATABASE: The sensor readings are stored in SQLite at: ${dbPath}

TEMP DIRECTORY: ${tempDir}
You can write files to this directory. It will be cleaned up after your response.

YOUR TASK:
1. Answer the user's question: "${question}"
2. Query the database if needed to get actual data
3. Write your response to: ${responseFile}

RESPONSE FORMAT:
You MUST write a JSON file following this TypeScript interface:

interface DashboardResponse {
  summary: string;           // Brief text summary
  blocks: DashboardBlock[];  // Visualization blocks
}

type DashboardBlock = TextBlock | MetricBlock | ChartBlock;

interface TextBlock {
  type: 'text';
  title?: string;
  content: string;
  variant?: 'info' | 'warning' | 'success' | 'error';
}

interface MetricBlock {
  type: 'metric';
  title: string;
  value: number;
  unit: string;
  status?: 'good' | 'warning' | 'critical';
  trend?: {
    direction: 'up' | 'down' | 'stable';
    percentage?: number;
    period?: string;
  };
}

interface ChartBlock {
  type: 'chart';
  title: string;
  chartType: 'line' | 'bar' | 'area';
  xAxis: { label: string; type: 'time' | 'category' | 'number'; };
  yAxis: { label: string; unit?: string; min?: number; max?: number; };
  series: Array<{
    name: string;
    color?: string;
    data: Array<{ x: string | number; y: number; }>;
  }>;
  annotations?: Array<{
    type: 'threshold' | 'range';
    value?: number;
    label: string;
    color?: string;
  }>;
}

EXAMPLE RESPONSE:
{
  "summary": "CO₂ is currently at 1050 ppm, slightly elevated.",
  "blocks": [
    {
      "type": "metric",
      "title": "Current CO₂",
      "value": 1050,
      "unit": "ppm",
      "status": "warning"
    },
    {
      "type": "chart",
      "title": "CO₂ Last Hour",
      "chartType": "line",
      "xAxis": { "label": "Time", "type": "time" },
      "yAxis": { "label": "CO₂", "unit": "ppm" },
      "series": [{
        "name": "CO₂",
        "data": [
          { "x": "2025-11-15T20:00:00Z", "y": 1020 },
          { "x": "2025-11-15T21:00:00Z", "y": 1050 }
        ]
      }]
    }
  ]
}

IMPORTANT:
- Always write valid JSON to ${responseFile}
- Use bash/sqlite3 tools to query the database
- Include actual data in charts, not placeholders
- Timestamp format: ISO 8601 (YYYY-MM-DDTHH:mm:ssZ)
- Be concise but informative

Now answer the question and write the response.json file.`;

  const proc = Bun.spawn([
    "shelley", 
    "-model", "predictable",
    "-db", "/home/exedev/app/airq-ask.db",
    "prompt",
    prompt
  ], {
    stdout: "pipe",
    stderr: "pipe",
    env: {
      ...process.env,
      PATH: "/usr/local/bin:/usr/bin:/bin"
    }
  });
  
  const output = await new Response(proc.stdout).text();
  const exitCode = await proc.exited;
  
  if (exitCode !== 0) {
    const error = await new Response(proc.stderr).text();
    throw new Error(`Shelley CLI failed: ${error}`);
  }
  
  // Parse conversation ID from output
  let conversationId = '';
  const lines = output.split('\n');
  for (const line of lines) {
    if (line.startsWith('Created conversation:')) {
      conversationId = line.split(':')[1].trim();
      break;
    }
  }
  
  // Try to read the response.json file
  try {
    const responseJson = await readFile(responseFile, 'utf-8');
    const dashboardResponse = JSON.parse(responseJson) as DashboardResponse;
    
    return {
      answer: dashboardResponse,
      conversationId,
      rawOutput: output
    };
  } catch (error) {
    // If no valid JSON file, fall back to parsing text output
    const assistantLines = [];
    let inAssistantResponse = false;
    
    for (const line of lines) {
      if (line.startsWith('🤖')) {
        inAssistantResponse = true;
        const match = line.match(/🤖\s+\[[\d:]+\]\s+(.+)/);
        if (match) {
          assistantLines.push(match[1]);
        }
      } else if (inAssistantResponse && !line.startsWith('time=') && !line.startsWith('Conversation') && !line.startsWith('To continue:')) {
        if (line.trim()) {
          assistantLines.push(line);
        }
      }
    }
    
    return {
      answer: assistantLines.join('\n').trim(),
      conversationId,
      rawOutput: output
    };
  }
}
