import { Chart } from "chart.js/auto";
import annotationPlugin from "chartjs-plugin-annotation";
import "chartjs-adapter-date-fns";

Chart.register(annotationPlugin);

// TypeScript interfaces matching dashboard-types.ts
console.log("🚀 ask.ts module loading...");
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

// DOM elements
const queryInput = document.getElementById("query-input") as HTMLInputElement;
const askBtn = document.getElementById("ask-btn") as HTMLButtonElement;
const loadingEl = document.getElementById("loading") as HTMLElement;
const errorEl = document.getElementById("error") as HTMLElement;
const dashboardEl = document.getElementById("dashboard") as HTMLElement;

// State
const charts: Chart[] = [];

// Initialize
function init() {
  // Example chip click handlers
  document.querySelectorAll(".example-chip").forEach((chip) => {
console.log("ask.ts module loaded");
    chip.addEventListener("click", () => {
      const query = chip.getAttribute("data-query");
      if (query) {
        queryInput.value = query;
        askQuestion();
      }
    });
  });

  // Enter key handler
  queryInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
      askQuestion();
    }
  });

  // Ask button handler
  askBtn.addEventListener("click", askQuestion);

  // Focus input on load
  queryInput.focus();
}

async function askQuestion() {
  const query = queryInput.value.trim();
  if (!query) return;

  // Show loading, hide previous results
  loadingEl.classList.remove("hidden");
  errorEl.classList.add("hidden");
  dashboardEl.classList.add("hidden");
  dashboardEl.innerHTML = "";
  askBtn.disabled = true;

  // Destroy existing charts
  charts.forEach((chart) => chart.destroy());
  charts.length = 0;

  try {
    const response = await fetch(
      `/api/ask?q=${encodeURIComponent(query)}`
    );
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Request failed");
    }

    renderDashboard(data.answer);
  } catch (error: any) {
    errorEl.textContent = `Error: ${error.message}`;
    errorEl.classList.remove("hidden");
  } finally {
    loadingEl.classList.add("hidden");
    askBtn.disabled = false;
  }
}

function renderDashboard(answer: DashboardResponse | string) {
  // Handle plain text answers
  if (typeof answer === "string") {
    dashboardEl.innerHTML = `
      <div class="tile text-info">
        <div class="tile-title">Response</div>
        <div class="text-content">${escapeHtml(answer)}</div>
      </div>
    `;
    dashboardEl.classList.remove("hidden");
    return;
  }

  // Handle dashboard responses
  let html = "";

  // Summary
  if (answer.summary) {
    html += `<div class="summary">${escapeHtml(answer.summary)}</div>`;
  }

  // Tiles container
  html += '<div class="tiles">';

  for (const block of answer.blocks) {
    if (block.type === "text") {
      html += renderTextTile(block);
    } else if (block.type === "metric") {
      html += renderMetricTile(block);
    } else if (block.type === "chart") {
      html += renderChartTile(block);
    }
  }

  html += "</div>";

  dashboardEl.innerHTML = html;
  dashboardEl.classList.remove("hidden");

  // Render charts after DOM is ready
  setTimeout(() => renderAllCharts(answer.blocks), 0);
}

function renderTextTile(block: TextBlock): string {
  const variant = block.variant || "info";
  const title = block.title
    ? `<div class="tile-title">${escapeHtml(block.title)}</div>`
    : "";
  return `
    <div class="tile text-${variant}">
      ${title}
      <div class="text-content">${escapeHtml(block.content)}</div>
    </div>
  `;
}

function renderMetricTile(block: MetricBlock): string {
  const status = block.status || "";
  const statusClass = status ? `metric ${status}` : "metric";
  const trend = block.trend ? renderTrend(block.trend) : "";

  return `
    <div class="tile ${statusClass}">
      <div class="tile-title">${escapeHtml(block.title)}</div>
      <div class="metric-value">
        ${block.value.toLocaleString()}
        <span class="metric-unit">${escapeHtml(block.unit)}</span>
      </div>
      ${trend}
    </div>
  `;
}

function renderTrend(trend: MetricBlock["trend"]): string {
  if (!trend) return "";

  const arrows = {
    up: "↑",
    down: "↓",
    stable: "→",
  };

  const percentage = trend.percentage
    ? `${trend.direction === "down" ? "-" : "+"}${trend.percentage.toFixed(1)}%`
    : "";

  return `
    <div class="metric-trend">
      <span class="trend-arrow ${trend.direction}">${arrows[trend.direction]}</span>
      ${percentage ? `<span>${percentage}</span>` : ""}
      ${trend.period ? `<span>${escapeHtml(trend.period)}</span>` : ""}
    </div>
  `;
}

function renderChartTile(block: ChartBlock): string {
  const chartId = `chart-${Math.random().toString(36).substr(2, 9)}`;
  return `
    <div class="tile chart" data-chart-id="${chartId}" data-chart='${escapeHtml(JSON.stringify(block))}'>
      <div class="tile-title">${escapeHtml(block.title)}</div>
      <div class="chart-container">
        <canvas id="${chartId}"></canvas>
      </div>
    </div>
  `;
}

function renderAllCharts(blocks: DashboardResponse["blocks"]) {
  const chartBlocks = blocks.filter((b) => b.type === "chart") as ChartBlock[];

  for (const block of chartBlocks) {
    const tiles = document.querySelectorAll(".tile.chart");
    for (const tile of tiles) {
      const chartData = JSON.parse(
        tile.getAttribute("data-chart") || "{}"
      ) as ChartBlock;
      if (chartData.title === block.title) {
        const chartId = tile.getAttribute("data-chart-id");
        if (chartId) {
          renderChart(chartId, chartData);
        }
      }
    }
  }
}

function renderChart(chartId: string, chartData: ChartBlock) {
  const canvas = document.getElementById(chartId) as HTMLCanvasElement;
  if (!canvas) {
    console.error("Canvas not found:", chartId);
    return;
  }

  // Prepare datasets
  const datasets = chartData.series.map((series) => ({
    label: series.name,
    data: series.data.map((d) => ({ x: d.x, y: d.y })),
    borderColor: series.color || "#38bdf8",
    backgroundColor: series.color
      ? `${series.color}33`
      : "rgba(56, 189, 248, 0.2)",
    borderWidth: 3,
    tension: 0.4,
    fill: chartData.chartType === "area",
  }));

  // Prepare annotations
  const annotations: any = {};
  if (chartData.annotations) {
    chartData.annotations.forEach((ann, i) => {
      annotations[`line${i}`] = {
        type: "line",
        yMin: ann.value,
        yMax: ann.value,
        borderColor: ann.color || "#f59e0b",
        borderWidth: 2,
        borderDash: [5, 5],
        label: {
          display: true,
          content: ann.label,
          position: "start",
          backgroundColor: ann.color || "#f59e0b",
          color: "#0f172a",
        },
      };
    });
  }

  const chart = new Chart(canvas, {
    type: chartData.chartType === "bar" ? "bar" : "line",
    data: { datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          labels: { color: "#f8fafc" },
        },
        annotation: {
          annotations,
        },
      },
      scales: {
        x: {
          type: chartData.xAxis.type === "time" ? "time" : "category",
          title: {
            display: true,
            text: chartData.xAxis.label,
            color: "#94a3b8",
          },
          ticks: { color: "#94a3b8" },
          grid: { color: "#223352" },
        },
        y: {
          title: {
            display: true,
            text:
              chartData.yAxis.label +
              (chartData.yAxis.unit ? ` (${chartData.yAxis.unit})` : ""),
            color: "#94a3b8",
          },
          min: chartData.yAxis.min,
          max: chartData.yAxis.max,
          ticks: { color: "#94a3b8" },
          grid: { color: "#223352" },
        },
      },
    },
  });

  charts.push(chart);
}

function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

// Start the app
init();
