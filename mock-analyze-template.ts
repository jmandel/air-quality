#!/usr/bin/env bun
// This is a template that gets copied and executed
import { Database } from "bun:sqlite";

interface DashboardResponse {
  summary: string;
  blocks: Array<any>;
}

try {
  const db = new Database("/home/exedev/app/db.sqlite");
  
  // Get current CO2
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
  
  const currentCO2 = co2Rows[0];
  const avgCO2 = co2Rows.reduce((sum, r) => sum + r.value, 0) / co2Rows.length;
  
  let status: "good" | "warning" | "critical" = "good";
  if (currentCO2.value > 1000) status = "critical";
  else if (currentCO2.value > 800) status = "warning";
  
  const response: DashboardResponse = {
    summary: `Current CO₂ level is ${Math.round(currentCO2.value)} ppm, averaging ${Math.round(avgCO2)} ppm over recent readings.`,
    blocks: [
      {
        type: "metric",
        title: "Current CO₂",
        value: Math.round(currentCO2.value),
        unit: "ppm",
        status: status
      },
      {
        type: "chart",
        title: "CO₂ Levels - Recent Readings",
        chartType: "line",
        xAxis: { label: "Time", type: "time" },
        yAxis: { label: "CO₂", unit: "ppm", min: 400, max: 1500 },
        series: [{
          name: "CO₂",
          color: "#3b82f6",
          data: co2Rows.reverse().map(r => ({
            x: new Date(r.ts).toISOString(),
            y: Math.round(r.value)
          }))
        }],
        annotations: [
          { type: "threshold", value: 800, label: "Good limit", color: "#f59e0b" },
          { type: "threshold", value: 1000, label: "Warning limit", color: "#ef4444" }
        ]
      },
      {
        type: "text",
        title: status === "good" ? "Status" : "Recommendation",
        content: status === "good" 
          ? "Air quality is good. CO₂ levels are within normal range."
          : status === "warning"
          ? "CO₂ is elevated. Consider opening windows or increasing ventilation."
          : "CO₂ is critically high! Increase ventilation immediately.",
        variant: status === "good" ? "success" : status === "warning" ? "warning" : "error"
      }
    ]
  };
  
  console.log(JSON.stringify(response, null, 2));
  db.close();
  
} catch (error) {
  console.error("Error:", error);
  const errorResponse: DashboardResponse = {
    summary: "Error analyzing data",
    blocks: [{
      type: "text",
      title: "Error",
      content: String(error),
      variant: "error"
    }]
  };
  console.log(JSON.stringify(errorResponse));
}
