// src/ask.ts
var queryInput = document.getElementById("query-input");
var askBtn = document.getElementById("ask-btn");
var loadingEl = document.getElementById("loading");
var progressEl = document.getElementById("progress-messages");
var errorEl = document.getElementById("error");
var dashboardEl = document.getElementById("dashboard");
var historyCatalogEl = document.getElementById("history-catalog");
var historyListEl = document.getElementById("history-list");
var starredSectionEl = document.getElementById("starred-section");
var starredChipsEl = document.getElementById("starred-chips");
var currentScriptContent = null;
var currentResultJson = null;
function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}
document.querySelectorAll(".example-chip").forEach((chip) => {
  chip.addEventListener("click", () => {
    const query = chip.getAttribute("data-query");
    if (query) {
      queryInput.value = query;
      queryInput.focus();
    }
  });
});
askBtn.addEventListener("click", () => {
  const query = queryInput.value.trim();
  if (!query)
    return;
  askQuestion(query);
});
queryInput.addEventListener("keypress", (e) => {
  if (e.key === "Enter") {
    askBtn.click();
  }
});
var urlParams = new URLSearchParams(window.location.search);
var urlQuery = urlParams.get("q");
if (urlQuery) {
  queryInput.value = urlQuery;
  askQuestion(urlQuery);
}
window.addEventListener("popstate", (e) => {
  if (e.state && e.state.query) {
    queryInput.value = e.state.query;
    askQuestion(e.state.query);
  }
});
function askQuestion(query) {
  const url = new URL(window.location.href);
  url.searchParams.set("q", query);
  window.history.pushState({ query }, "", url);
  errorEl.classList.add("hidden");
  dashboardEl.classList.add("hidden");
  loadingEl.classList.remove("hidden");
  progressEl.textContent = "";
  askBtn.disabled = true;
  let dashboardResult = null;
  const eventSource = new EventSource(`/api/ask/stream?q=${encodeURIComponent(query)}`);
  eventSource.addEventListener("status", (e) => {
    const data = JSON.parse(e.data);
    progressEl.textContent += `${data}
`;
    progressEl.scrollTop = progressEl.scrollHeight;
  });
  eventSource.addEventListener("cached", (e) => {
    progressEl.textContent += `♻️ Using cached script
`;
    progressEl.scrollTop = progressEl.scrollHeight;
  });
  eventSource.addEventListener("shelley_progress", (e) => {
    const data = JSON.parse(e.data);
    progressEl.textContent += `${data}
`;
    progressEl.scrollTop = progressEl.scrollHeight;
  });
  eventSource.addEventListener("shelley_complete", (e) => {
    const data = JSON.parse(e.data);
    progressEl.textContent += `✅ Script generated (${data.outputLength} bytes)
`;
    progressEl.scrollTop = progressEl.scrollHeight;
  });
  eventSource.addEventListener("script_created", (e) => {
    const data = JSON.parse(e.data);
    progressEl.textContent += `\uD83D\uDCC4 Script created (${data.size} bytes)
`;
    progressEl.scrollTop = progressEl.scrollHeight;
  });
  eventSource.addEventListener("script_progress", (e) => {
    const data = JSON.parse(e.data);
    progressEl.textContent += `${data}
`;
    progressEl.scrollTop = progressEl.scrollHeight;
  });
  eventSource.addEventListener("script_complete", (e) => {
    progressEl.textContent += `✅ Analysis complete
`;
    progressEl.scrollTop = progressEl.scrollHeight;
  });
  eventSource.addEventListener("result", (e) => {
    dashboardResult = JSON.parse(e.data);
  });
  eventSource.addEventListener("script", (e) => {
    const data = JSON.parse(e.data);
    currentScriptContent = data.content;
    const scriptPane = document.getElementById("tab-script");
    if (scriptPane) {
      scriptPane.innerHTML = `<pre class="code-block">${escapeHtml(currentScriptContent)}</pre>`;
    }
  });
  eventSource.addEventListener("saved", (e) => {
    progressEl.textContent += `\uD83D\uDCBE Saved to history
`;
    progressEl.scrollTop = progressEl.scrollHeight;
    eventSource.close();
    if (dashboardResult) {
      loadingEl.classList.add("hidden");
      askBtn.disabled = false;
      renderDashboard(dashboardResult);
      loadHistory();
    }
  });
  eventSource.addEventListener("error", (e) => {
    try {
      const data = JSON.parse(e.data);
      errorEl.textContent = `Error: ${data.message || "Unknown error"}`;
    } catch {
      errorEl.textContent = "Error: Connection error";
    }
    errorEl.classList.remove("hidden");
    loadingEl.classList.add("hidden");
    askBtn.disabled = false;
    eventSource.close();
  });
  eventSource.onerror = () => {
    if (eventSource.readyState === EventSource.CLOSED) {
      if (dashboardResult) {
        loadingEl.classList.add("hidden");
        askBtn.disabled = false;
        renderDashboard(dashboardResult);
        loadHistory();
      }
    } else {
      errorEl.textContent = "Error: Connection failed";
      errorEl.classList.remove("hidden");
      loadingEl.classList.add("hidden");
      askBtn.disabled = false;
      eventSource.close();
    }
  };
}
function renderDashboard(answer) {
  currentResultJson = answer;
  let html = `
    <div class="result-tabs">
      <div class="tab-buttons">
        <button class="tab-btn active" data-tab="dashboard">\uD83D\uDCCA Dashboard</button>
        <button class="tab-btn" data-tab="json">\uD83D\uDCCB JSON</button>
        <button class="tab-btn" data-tab="script">\uD83D\uDCBB Script</button>
      </div>
      <div class="tab-content">
        <div class="tab-pane active" id="tab-dashboard">
  `;
  if (answer.summary) {
    html += `
      <div class="summary">
        ${escapeHtml(answer.summary)}
      </div>
    `;
  }
  if (answer.blocks && answer.blocks.length > 0) {
    html += '<div class="tiles">';
    for (let i = 0;i < answer.blocks.length; i++) {
      html += renderBlock(answer.blocks[i], i);
    }
    html += "</div>";
  }
  html += `
        </div>
        <div class="tab-pane" id="tab-json">
          <pre class="code-block">${escapeHtml(JSON.stringify(answer, null, 2))}</pre>
        </div>
        <div class="tab-pane" id="tab-script">
          <pre class="code-block">${currentScriptContent ? escapeHtml(currentScriptContent) : "Loading script..."}</pre>
        </div>
      </div>
    </div>
  `;
  dashboardEl.innerHTML = html;
  dashboardEl.classList.remove("hidden");
  dashboardEl.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const tabName = btn.getAttribute("data-tab");
      dashboardEl.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      dashboardEl.querySelectorAll(".tab-pane").forEach((p) => p.classList.remove("active"));
      const pane = dashboardEl.querySelector(`#tab-${tabName}`);
      if (pane)
        pane.classList.add("active");
    });
  });
  setTimeout(() => {
    answer.blocks?.forEach((block, index) => {
      if (block.type === "chart") {
        renderChart(`chart-${index}`, block);
      }
    });
  }, 0);
}
function renderBlock(block, index) {
  switch (block.type) {
    case "text":
      return `
        <div class="tile text-${block.variant || "info"}">
          <div class="tile-title">${escapeHtml(block.title || "")}</div>
          <div class="text-content">
            ${escapeHtml(block.content)}
          </div>
        </div>
      `;
    case "metric": {
      const statusClass = block.status ? ` ${block.status}` : "";
      const trendHtml = block.trend ? `
          <div class="metric-trend">
            <span class="trend-arrow ${block.trend.direction}">${getTrendArrow(block.trend.direction)}</span>
            <span>${block.trend.label || `${block.trend.percentage || ""}% ${block.trend.period || ""}`}</span>
          </div>
        ` : "";
      return `
        <div class="tile metric${statusClass}">
          <div class="tile-title">${escapeHtml(block.title)}</div>
          <div class="metric-value">
            ${block.value}
            ${block.unit ? `<span class="metric-unit">${escapeHtml(block.unit)}</span>` : ""}
          </div>
          ${trendHtml}
        </div>
      `;
    }
    case "chart": {
      const chartId = index !== undefined ? `chart-${index}` : `chart-${Math.random().toString(36).substr(2, 9)}`;
      return `
        <div class="tile chart">
          <div class="tile-title">${escapeHtml(block.title)}</div>
          <div class="chart-container">
            <canvas id="${chartId}"></canvas>
          </div>
        </div>
      `;
    }
    default:
      return "";
  }
}
function getTrendArrow(direction) {
  switch (direction) {
    case "up":
      return "↑";
    case "down":
      return "↓";
    case "stable":
      return "→";
  }
}
function renderChart(elementId, block) {
  const canvas = document.getElementById(elementId);
  if (!canvas) {
    console.error(`Canvas not found: ${elementId}`);
    return;
  }
  if (typeof window.Chart === "undefined") {
    console.error("Chart.js not loaded");
    canvas.parentElement.innerHTML = `<div style="padding: 20px; color: var(--muted)">Chart.js not loaded</div>`;
    return;
  }
  const Chart = window.Chart;
  const datasets = block.series.map((s) => ({
    label: s.name,
    data: s.data.map((d) => ({ x: d.x, y: d.y })),
    borderColor: s.color || "#3b82f6",
    backgroundColor: s.color ? `${s.color}33` : "#3b82f633",
    borderWidth: 3,
    pointRadius: 0,
    pointHoverRadius: 6,
    tension: 0.2,
    fill: block.chartType === "area"
  }));
  const annotations = {};
  if (block.annotations && block.annotations.length > 0) {
    block.annotations.forEach((ann, idx) => {
      if (ann.type === "threshold") {
        annotations[`line${idx}`] = {
          type: "line",
          yMin: ann.value,
          yMax: ann.value,
          borderColor: ann.color || "#ef4444",
          borderWidth: 2,
          borderDash: [8, 4],
          label: {
            display: true,
            content: ann.label,
            position: "end",
            backgroundColor: ann.color || "#ef4444",
            color: "#fff",
            font: {
              size: 12,
              weight: "bold"
            },
            padding: 6
          }
        };
      }
    });
  }
  new Chart(canvas, {
    type: block.chartType === "area" ? "line" : block.chartType || "line",
    data: { datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      interaction: {
        mode: "index",
        intersect: false
      },
      plugins: {
        legend: {
          display: true,
          position: "bottom",
          labels: {
            font: {
              size: 14,
              weight: "bold"
            },
            color: "#f8fafc",
            padding: 16,
            usePointStyle: true
          }
        },
        annotation: {
          annotations
        }
      },
      scales: {
        x: {
          type: block.xAxis.type === "time" ? "time" : "category",
          title: {
            display: true,
            text: block.xAxis.label,
            font: {
              size: 16,
              weight: "bold"
            },
            color: "#f8fafc",
            padding: { top: 12 }
          },
          ticks: {
            font: {
              size: 13,
              weight: "500"
            },
            color: "#cbd5e1",
            maxRotation: 0,
            autoSkipPadding: 20
          },
          grid: {
            color: "#223352",
            lineWidth: 1
          },
          time: block.xAxis.type === "time" ? {
            displayFormats: {
              hour: "HH:mm",
              minute: "HH:mm"
            }
          } : undefined
        },
        y: {
          title: {
            display: true,
            text: block.yAxis.unit ? `${block.yAxis.label} (${block.yAxis.unit})` : block.yAxis.label,
            font: {
              size: 16,
              weight: "bold"
            },
            color: "#f8fafc",
            padding: { bottom: 12 }
          },
          ticks: {
            font: {
              size: 13,
              weight: "500"
            },
            color: "#cbd5e1",
            padding: 10
          },
          grid: {
            color: "#223352",
            lineWidth: 1
          },
          min: block.yAxis.min,
          max: block.yAxis.max
        }
      }
    }
  });
}
async function loadHistory() {
  try {
    const response = await fetch("/api/ask/history");
    if (!response.ok)
      throw new Error("Failed to load history");
    const { items: history } = await response.json();
    if (history.length === 0) {
      historyCatalogEl.classList.add("hidden");
      return;
    }
    const starred = history.filter((item) => item.starred);
    if (starred.length > 0) {
      starredChipsEl.innerHTML = starred.map((item) => `<span class="starred-chip" data-id="${item.id}">${escapeHtml(item.question)}</span>`).join("");
      starredSectionEl.classList.remove("hidden");
      starredChipsEl.querySelectorAll(".starred-chip").forEach((chip) => {
        chip.addEventListener("click", () => {
          const id = chip.getAttribute("data-id");
          if (id)
            loadHistoryItem(id);
        });
      });
    }
    historyListEl.innerHTML = history.map((item) => {
      const starIcon = item.starred ? "⭐" : "☆";
      const timeStr = new Date(item.timestamp).toLocaleString();
      return `
          <div class="history-item">
            <div class="history-item-question" data-id="${item.id}">${escapeHtml(item.question)}</div>
            <div class="history-item-time">${timeStr}</div>
            <div class="history-item-actions">
              <button class="history-btn star-btn ${item.starred ? "starred" : ""}" data-id="${item.id}" title="${item.starred ? "Unstar" : "Star"}">${starIcon}</button>
              <button class="history-btn delete-btn" data-id="${item.id}" title="Delete">\uD83D\uDDD1️</button>
            </div>
          </div>
        `;
    }).join("");
    historyCatalogEl.classList.remove("hidden");
    historyListEl.querySelectorAll(".history-item-question").forEach((el) => {
      el.addEventListener("click", () => {
        const id = el.getAttribute("data-id");
        if (id)
          loadHistoryItem(id);
      });
    });
    historyListEl.querySelectorAll(".star-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = btn.getAttribute("data-id");
        if (!id)
          return;
        const isStarred = btn.classList.contains("starred");
        const method = isStarred ? "DELETE" : "POST";
        await fetch(`/api/ask/star/${id}`, { method });
        loadHistory();
      });
    });
    historyListEl.querySelectorAll(".delete-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = btn.getAttribute("data-id");
        if (id && confirm("Delete this query from history?")) {
          await fetch(`/api/ask/trash/${id}`, { method: "POST" });
          loadHistory();
        }
      });
    });
  } catch (err) {
    console.error("Failed to load history:", err);
  }
}
async function loadHistoryItem(id) {
  try {
    const metaResponse = await fetch(`/api/ask/history?limit=1000`);
    if (!metaResponse.ok)
      throw new Error("Failed to load history");
    const historyData = await metaResponse.json();
    const item = historyData.items.find((i) => i.id === id);
    if (!item)
      throw new Error("History item not found");
    queryInput.value = item.question;
    askQuestion(item.question);
  } catch (err) {
    console.error("Failed to load history item:", err);
    errorEl.textContent = "Failed to load history item";
    errorEl.classList.remove("hidden");
    loadingEl.classList.add("hidden");
  }
}
loadHistory();
