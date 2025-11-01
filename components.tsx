import { useEffect, useMemo, useRef } from "react";
import { Chart } from "chart.js/auto";
import "chartjs-adapter-date-fns";

export function humanBytes(n: number): string {
  if (!n) return "0 B";
  const u = ["B", "KB", "MB", "GB", "TB"];
  const e = Math.floor(Math.log(n) / Math.log(1024));
  return (n / Math.pow(1024, e)).toFixed(2) + " " + u[e];
}

export function prettyId(id: string) {
  return id
    .replace(/^sensor-/, "")
    .replace(/_weight_concentration$/, "")
    .replace(/__/g, " ")
    .replace(/_/g, " ")
    .replace(/\bco2\b/i, "CO₂")
    .trim();
}

// ---------- Chart component ----------
export function TimeSeriesChart({
  seriesMap,
  sinceMs,
}: {
  seriesMap: Record<string, Array<{ x: number; y: number }>>;
  sinceMs: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<Chart | null>(null);

  const datasets = useMemo(() => {
    const pick = (k: string) => {
      let h = 0;
      for (let i = 0; i < k.length; i++) h = (h * 33 + k.charCodeAt(i)) % 360;
      return `hsl(${h} 70% 55%)`;
    };
    return Object.entries(seriesMap).map(([sensorId, points]) => ({
      label: sensorId.replace(/^sensor-/, ""),
      data: points.filter((p) => p.x >= sinceMs),
      parsing: false,
      borderColor: pick(sensorId),
      pointRadius: 0,
      borderWidth: 1.5,
    }));
  }, [seriesMap, sinceMs]);

  useEffect(() => {
    const ctx = canvasRef.current!.getContext("2d")!;
    const chart = new Chart(ctx, {
      type: "line",
      data: { datasets },
      options: {
        interaction: { mode: "nearest", intersect: false },
        responsive: true,
        animation: false,
        scales: {
          x: {
            type: "time",
            time: { tooltipFormat: "PPpp" },
            grid: {
              color: getComputedStyle(document.documentElement).getPropertyValue("--grid"),
            },
          },
          y: {
            beginAtZero: true,
            grid: {
              color: getComputedStyle(document.documentElement).getPropertyValue("--grid"),
            },
          },
        },
        plugins: {
          legend: { labels: { color: "#cfe0f0" } },
          tooltip: { mode: "index", intersect: false },
        },
      },
    });
    chartRef.current = chart;
    return () => chart.destroy();
  }, []);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    chart.data.datasets = datasets;
    chart.update("none");
  }, [datasets]);

  return <canvas ref={canvasRef} height={260}></canvas>;
}
