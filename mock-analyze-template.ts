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
  
  // Query recent CO2 data
  const co2Rows = db.query(`
    SELECT r.ts, r.value 
    FROM readings r 
    JOIN sensors s ON r.sensor_id = s.id 
    WHERE s.name = 'co2_ppm' 
    ORDER BY r.ts DESC 
    LIMIT 20
  `).all() as Array<{ ts: number, value: number }>;
  
  if (co2Rows.length === 0) {
    throw new Error("No CO2 data available");
  }
  
  // Calculate metrics
  const currentCO2 = co2Rows[0];
  const avgCO2 = co2Rows.reduce((sum, r) => sum + r.value, 0) / co2Rows.length;
  
  let status: 'good' | 'warning' | 'critical' = 'good';
  if (currentCO2.value > 1000) status = 'critical';
  else if (currentCO2.value > 800) status = 'warning';
  
  // Prepare chart data (reverse to show oldest to newest)
  const chartData = co2Rows.reverse().map(row => ({
    x: new Date(row.ts).toISOString(),
    y: Math.round(row.value)
  }));
  
  const response: DashboardResponse = {
    summary: `Current CO₂ is ${Math.round(currentCO2.value)} ppm (${status === 'good' ? 'good' : status === 'warning' ? 'elevated' : 'high'}), averaging ${Math.round(avgCO2)} ppm over recent readings.`,
    blocks: [
      {
        type: 'metric',
        title: 'Current CO₂',
        value: Math.round(currentCO2.value),
        unit: 'ppm',
        status: status
      },
      {
        type: 'chart',
        title: 'CO₂ Levels - Recent Readings',
        chartType: 'line',
        xAxis: { label: 'Time', type: 'time' },
        yAxis: { label: 'Concentration', unit: 'ppm', min: 0 },
        series: [{
          name: 'CO₂',
          color: '#3b82f6',
          data: chartData
        }],
        annotations: [
          { type: 'threshold', value: 800, label: 'Warning (800 ppm)', color: '#f59e0b' },
          { type: 'threshold', value: 1000, label: 'Critical (1000 ppm)', color: '#ef4444' }
        ]
      },
      {
        type: 'text',
        title: 'Interpretation',
        content: status === 'good' 
          ? '✅ Air quality is **good**. Ventilation is adequate.'
          : status === 'warning'
          ? '⚠️ CO₂ is **elevated**. Consider opening windows or increasing ventilation.'
          : '🚨 CO₂ is **high**. Immediate ventilation recommended!',
        variant: status === 'good' ? 'success' : status === 'warning' ? 'warning' : 'error'
      }
    ]
  };
  
  // Output ONLY JSON - nothing else!
  console.log(JSON.stringify(response, null, 2));
  
  db.close();
  process.exit(0);
} catch (error) {
  // Errors go to stderr
  console.error("Error:", error);
  
  // Still output valid JSON on stdout
  const errorResponse: DashboardResponse = {
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
