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
    throw new Error("CO2 sensor not found");
  }
  
  const sensorId = (sensor as any).id;
  const displayName = (sensor as any).display_name;
  const unit = (sensor as any).unit;
  
  // Get current value
  const current = db.query("SELECT value, ts FROM readings WHERE sensor_id = ? ORDER BY ts DESC LIMIT 1").get(sensorId);
  
  if (!current) {
    throw new Error("No CO2 readings found");
  }
  
  const currentValue = (current as any).value;
  const currentTs = (current as any).ts;
  
  // Determine status based on thresholds
  let status: "good" | "warning" | "critical" = "good";
  if (currentValue > 1000) {
    status = "critical";
  } else if (currentValue >= 800) {
    status = "warning";
  }
  
  // Get 6 hours of data for chart
  const sixHoursAgo = 1763241460770;
  const recentData = db.query(`
    SELECT ts, value 
    FROM readings 
    WHERE sensor_id = ? AND ts >= ?
    ORDER BY ts ASC
  `).all(sensorId, sixHoursAgo);
  
  // Calculate trend (compare current to 1 hour ago)
  const oneHourAgo = currentTs - (60 * 60 * 1000);
  const hourAgoReading = db.query(
    "SELECT value FROM readings WHERE sensor_id = ? AND ts <= ? ORDER BY ts DESC LIMIT 1"
  ).get(sensorId, oneHourAgo);
  
  let trend = undefined;
  if (hourAgoReading) {
    const hourAgoValue = (hourAgoReading as any).value;
    const change = currentValue - hourAgoValue;
    const percentage = Math.abs((change / hourAgoValue) * 100);
    
    if (Math.abs(change) > 10) {
      trend = {
        direction: change > 0 ? "up" : "down" as "up" | "down",
        percentage: Math.round(percentage * 10) / 10,
        period: "1h"
      };
    } else {
      trend = {
        direction: "stable" as "stable",
        period: "1h"
      };
    }
  }
  
  const response: DashboardResponse = {
    summary: `Current ${displayName} is ${Math.round(currentValue)} ${unit} (${status})`,
    blocks: [
      {
        type: "metric",
        title: `Current ${displayName}`,
        value: Math.round(currentValue),
        unit: unit,
        status: status,
        trend: trend
      },
      {
        type: "chart",
        title: `${displayName} - Last 6 Hours`,
        chartType: "line",
        xAxis: { label: "Time", type: "time" },
        yAxis: { label: "Concentration", unit: unit },
        series: [{
          name: displayName,
          color: status === "critical" ? "#ef4444" : status === "warning" ? "#f59e0b" : "#3b82f6",
          data: (recentData as any[]).map(r => ({
            x: new Date(r.ts).toISOString(),
            y: r.value
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
    summary: "Error analyzing CO₂ data",
    blocks: [{
      type: "text",
      title: "Error",
      content: String(error),
      variant: "error"
    }]
  }, null, 2));
}
