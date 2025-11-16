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
  
  const sensorId = sensor.id;
  
  // Get current value
  const current = db.query("SELECT value, ts FROM readings WHERE sensor_id = ? ORDER BY ts DESC LIMIT 1").get(sensorId);
  
  if (!current) {
    throw new Error("No CO2 readings found");
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
  
  // Get data from 6 hours ago for trend calculation
  const sixHoursAgo = 1763241460388;
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
    const change = ((current.value - firstValue) / firstValue) * 100;
    const absChange = Math.abs(change);
    
    trend = {
      direction: (absChange < 5 ? "stable" : (change > 0 ? "up" : "down")) as "up" | "down" | "stable",
      percentage: Math.round(absChange * 10) / 10,
      period: "6h"
    };
  }
  
  const response: DashboardResponse = {
    summary: `Current CO₂ level is ${Math.round(current.value)} ppm (${status})`,
    blocks: [
      {
        type: "metric",
        title: "Current CO₂ Level",
        value: Math.round(current.value * 10) / 10,
        unit: sensor.unit,
        status: status,
        trend: trend
      },
      {
        type: "chart",
        title: "CO₂ - Last 6 Hours",
        chartType: "line",
        xAxis: { label: "Time", type: "time" },
        yAxis: { label: "Concentration", unit: sensor.unit },
        series: [{
          name: sensor.display_name,
          color: status === "good" ? "#10b981" : (status === "warning" ? "#f59e0b" : "#ef4444"),
          data: recentData.map(r => ({
            x: new Date(r.ts).toISOString(),
            y: Math.round(r.value * 10) / 10
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
