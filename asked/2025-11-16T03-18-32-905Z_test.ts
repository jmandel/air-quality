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
  
  // Get sensor count
  const sensorCount = db.query("SELECT COUNT(*) as count FROM sensors").get() as { count: number };
  
  // Get total readings count
  const readingsCount = db.query("SELECT COUNT(*) as count FROM readings").get() as { count: number };
  
  // Get most recent reading timestamp
  const latestReading = db.query("SELECT MAX(ts) as latest FROM readings").get() as { latest: number };
  
  const response: DashboardResponse = {
    summary: "✓ System test successful - Database is connected and operational",
    blocks: [
      {
        type: "text",
        title: "Test Status",
        content: "The air quality monitoring system is operational. Database connection successful.",
        variant: "success"
      },
      {
        type: "metric",
        title: "Available Sensors",
        value: sensorCount.count,
        unit: "sensors",
        status: "good"
      },
      {
        type: "metric",
        title: "Total Readings",
        value: readingsCount.count,
        unit: "readings",
        status: "good"
      },
      {
        type: "text",
        title: "Latest Data",
        content: `Most recent reading: ${new Date(latestReading.latest).toISOString()}`,
        variant: "info"
      },
      {
        type: "text",
        title: "Ready for Queries",
        content: "You can now ask questions about:\n• CO₂ levels (co2_ppm)\n• PM 2.5 (pm2_5_ug_m3)\n• Temperature (sen55_temp_c)\n• Humidity (sen55_humidity_pct)\n• VOC Index (sen55_voc_index)\n• And 18 more sensors",
        variant: "info"
      }
    ]
  };
  
  console.log(JSON.stringify(response, null, 2));
  db.close();
  
} catch (error) {
  console.error("Error:", error);
  console.log(JSON.stringify({
    summary: "Error during test",
    blocks: [{
      type: "text",
      title: "Error",
      content: String(error),
      variant: "error"
    }]
  }));
}
