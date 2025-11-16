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
  
  // Get CO2 sensor
  const sensor = db.query("SELECT id, display_name, unit FROM sensors WHERE name = ?").get("co2_ppm");
  
  if (!sensor) {
    throw new Error("CO₂ sensor not found");
  }
  
  const sensorId = sensor.id;
  
  // Get current value
  const current = db.query("SELECT value, ts FROM readings WHERE sensor_id = ? ORDER BY ts DESC LIMIT 1").get(sensorId);
  
  if (!current) {
    throw new Error("No CO₂ readings found");
  }
  
  // Determine status based on thresholds
  let status: "good" | "warning" | "critical";
  if (current.value < 800) {
    status = "good";
  } else if (current.value <= 1000) {
    status = "warning";
  } else {
    status = "critical";
  }
  
  // Get 6 hours of data for trend analysis
  const sixHoursAgo = 1763241278962;
  const recentData = db.query(`
    SELECT ts, value 
    FROM readings 
    WHERE sensor_id = ? AND ts >= ?
    ORDER BY ts ASC
  `).all(sensorId, sixHoursAgo);
  
  // Calculate trend
  let trend = undefined;
  if (recentData.length > 1) {
    const firstValue = recentData[0].value;
    const lastValue = current.value;
    const percentageChange = ((lastValue - firstValue) / firstValue) * 100;
    
    let direction: "up" | "down" | "stable";
    if (Math.abs(percentageChange) < 2) {
      direction = "stable";
    } else if (percentageChange > 0) {
      direction = "up";
    } else {
      direction = "down";
    }
    
    trend = {
      direction,
      percentage: Math.abs(Math.round(percentageChange)),
      period: "6h"
    };
  }
  
  const response: DashboardResponse = {
    summary: `Current ${sensor.display_name} level is ${Math.round(current.value)} ${sensor.unit} (${status})`,
    blocks: [
      {
        type: "metric",
        title: `Current ${sensor.display_name}`,
        value: Math.round(current.value),
        unit: sensor.unit,
        status: status,
        trend: trend
      },
      {
        type: "chart",
        title: `${sensor.display_name} - Last 6 Hours`,
        chartType: "line",
        xAxis: { label: "Time", type: "time" },
        yAxis: { label: "Concentration", unit: sensor.unit },
        series: [{
          name: sensor.display_name,
          color: "#3b82f6",
          data: recentData.map(r => ({
            x: new Date(r.ts).toISOString(),
            y: Math.round(r.value)
          }))
        }],
        annotations: [
          {
            type: "threshold",
            value: 800,
            label: "Warning threshold",
            color: "#f59e0b"
          },
          {
            type: "threshold",
            value: 1000,
            label: "Critical threshold",
            color: "#ef4444"
          }
        ]
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
