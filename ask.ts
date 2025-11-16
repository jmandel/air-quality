import { DashboardResponse, Block } from "./dashboard-types";

const queryInput = document.getElementById("query-input") as HTMLInputElement;
const askBtn = document.getElementById("ask-btn") as HTMLButtonElement;
const loadingEl = document.getElementById("loading") as HTMLDivElement;
const progressEl = document.getElementById("progress-messages") as HTMLDivElement;
const errorEl = document.getElementById("error") as HTMLDivElement;
const dashboardEl = document.getElementById("dashboard") as HTMLDivElement;
const historyCatalogEl = document.getElementById("history-catalog") as HTMLDivElement;
const historyListEl = document.getElementById("history-list") as HTMLDivElement;
const starredSectionEl = document.getElementById("starred-section") as HTMLDivElement;
const starredChipsEl = document.getElementById("starred-chips") as HTMLDivElement;

function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

// Example chip handlers
document.querySelectorAll(".example-chip").forEach((chip) => {
  chip.addEventListener("click", () => {
    const query = chip.getAttribute("data-query");
    if (query) {
      queryInput.value = query;
      queryInput.focus();
    }
  });
});

// Ask button handler
askBtn.addEventListener("click", () => {
  const query = queryInput.value.trim();
  if (!query) return;
  askQuestion(query);
});

// Enter key handler
queryInput.addEventListener("keypress", (e) => {
  if (e.key === "Enter") {
    askBtn.click();
  }
});

function askQuestion(query: string) {
  // Reset UI
  errorEl.classList.add("hidden");
  dashboardEl.classList.add("hidden");
  loadingEl.classList.remove("hidden");
  progressEl.textContent = ""; // Clear previous content
  askBtn.disabled = true;

  let dashboardResult: DashboardResponse | null = null;

  const eventSource = new EventSource(`/api/ask/stream?q=${encodeURIComponent(query)}`);

  // Capture ALL streaming output in a single scrolling view
  eventSource.addEventListener("status", (e: any) => {
    const data = JSON.parse(e.data);
    progressEl.textContent += `${data}\n`;
    progressEl.scrollTop = progressEl.scrollHeight;
  });
  
  eventSource.addEventListener("cached", (e: any) => {
    progressEl.textContent += "♻️ Using cached script\n";
    progressEl.scrollTop = progressEl.scrollHeight;
  });
  
  eventSource.addEventListener("shelley_progress", (e: any) => {
    const data = JSON.parse(e.data);
    progressEl.textContent += `${data}\n`;
    progressEl.scrollTop = progressEl.scrollHeight;
  });
  
  eventSource.addEventListener("shelley_complete", (e: any) => {
    const data = JSON.parse(e.data);
    progressEl.textContent += `✅ Script generated (${data.outputLength} bytes)\n`;
    progressEl.scrollTop = progressEl.scrollHeight;
  });
  
  eventSource.addEventListener("script_created", (e: any) => {
    const data = JSON.parse(e.data);
    progressEl.textContent += `📄 Script created (${data.size} bytes)\n`;
    progressEl.scrollTop = progressEl.scrollHeight;
  });
  
  eventSource.addEventListener("script_progress", (e: any) => {
    const data = JSON.parse(e.data);
    progressEl.textContent += `${data}\n`;
    progressEl.scrollTop = progressEl.scrollHeight;
  });
  
  eventSource.addEventListener("script_complete", (e: any) => {
    progressEl.textContent += "✅ Analysis complete\n";
    progressEl.scrollTop = progressEl.scrollHeight;
  });
  
  eventSource.addEventListener("result", (e: any) => {
    dashboardResult = JSON.parse(e.data);
  });
  
  eventSource.addEventListener("saved", (e: any) => {
    progressEl.textContent += "💾 Saved to history\n";
    progressEl.scrollTop = progressEl.scrollHeight;
    eventSource.close();
    
    if (dashboardResult) {
      loadingEl.classList.add("hidden");
      askBtn.disabled = false;
      renderDashboard(dashboardResult);
      loadHistory();
    }
  });
  
  eventSource.addEventListener("error", (e: any) => {
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

function renderDashboard(answer: DashboardResponse) {
  let html = "";

  // Render summary
  if (answer.summary) {
    html += `
      <div class="summary">
        ${escapeHtml(answer.summary)}
      </div>
    `;
  }

  // Render blocks
  if (answer.blocks && answer.blocks.length > 0) {
    html += '<div class="tiles">';
    for (const block of answer.blocks) {
      html += renderBlock(block);
    }
    html += "</div>";
  }

  dashboardEl.innerHTML = html;
  dashboardEl.classList.remove("hidden");

  // Render any charts after DOM is ready
  setTimeout(() => {
    answer.blocks?.forEach((block, index) => {
      if (block.type === "chart" && block.chartData) {
        renderChart(`chart-${index}`, block.chartData, block.chartType || "line");
      }
    });
  }, 0);
}

function renderBlock(block: Block): string {
  switch (block.type) {
    case "text":
      return `
        <div class="tile text-${block.variant || "info"}">
          <div class="tile-title">${escapeHtml(block.title)}</div>
          <div class="text-content">
            ${escapeHtml(block.content)}
          </div>
        </div>
      `;

    case "metric": {
      const statusClass = block.status ? ` ${block.status}` : "";
      const trendHtml = block.trend
        ? `
          <div class="metric-trend">
            <span class="trend-arrow ${block.trend.direction}">${getTrendArrow(block.trend.direction)}</span>
            <span>${block.trend.label}</span>
          </div>
        `
        : "";
      
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
      const chartId = `chart-${Math.random().toString(36).substr(2, 9)}`;
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

function getTrendArrow(direction: "up" | "down" | "stable"): string {
  switch (direction) {
    case "up": return "↑";
    case "down": return "↓";
    case "stable": return "→";
  }
}

function renderChart(elementId: string, chartData: any, chartType: string) {
  const canvas = document.getElementById(elementId) as HTMLCanvasElement;
  if (!canvas) return;

  // Use Chart.js if available
  if (typeof (window as any).Chart !== "undefined") {
    new (window as any).Chart(canvas, {
      type: chartType,
      data: chartData,
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: true,
            position: "bottom",
          },
        },
      },
    });
  }
}

// Load history
async function loadHistory() {
  try {
    const response = await fetch("/api/ask/history");
    if (!response.ok) throw new Error("Failed to load history");
    
    const {items: history} = await response.json();
    
    if (history.length === 0) {
      historyCatalogEl.classList.add("hidden");
      return;
    }

    // Filter starred queries
    const starred = history.filter((item: any) => item.starred);
    
    if (starred.length > 0) {
      starredChipsEl.innerHTML = starred
        .map((item: any) => `<span class="starred-chip" data-id="${item.id}">${escapeHtml(item.question)}</span>`)
        .join("");
      
      starredSectionEl.classList.remove("hidden");
      
      // Add click handlers to starred chips
      starredChipsEl.querySelectorAll(".starred-chip").forEach((chip) => {
        chip.addEventListener("click", () => {
          const id = chip.getAttribute("data-id");
          if (id) loadHistoryItem(id);
        });
      });
    }

    // Render full history
    historyListEl.innerHTML = history
      .map((item: any) => {
        const starIcon = item.starred ? "⭐" : "☆";
        const timeStr = new Date(item.timestamp).toLocaleString();
        return `
          <div class="history-item">
            <div class="history-item-question" data-id="${item.id}">${escapeHtml(item.question)}</div>
            <div class="history-item-time">${timeStr}</div>
            <div class="history-item-actions">
              <button class="history-btn star-btn ${item.starred ? "starred" : ""}" data-id="${item.id}" title="${item.starred ? "Unstar" : "Star"}">${starIcon}</button>
              <button class="history-btn delete-btn" data-id="${item.id}" title="Delete">🗑️</button>
            </div>
          </div>
        `;
      })
      .join("");

    historyCatalogEl.classList.remove("hidden");

    // Add event listeners
    historyListEl.querySelectorAll(".history-item-question").forEach((el) => {
      el.addEventListener("click", () => {
        const id = el.getAttribute("data-id");
        if (id) loadHistoryItem(id);
      });
    });

    historyListEl.querySelectorAll(".star-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = btn.getAttribute("data-id");
        if (id) {
          await fetch(`/api/ask/star/${id}`, { method: "POST" });
          loadHistory();
        }
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

async function loadHistoryItem(id: string) {
  try {
    const response = await fetch(`/api/ask/item/${id}`);
    if (!response.ok) throw new Error("Failed to load history item");
    
    const item = await response.json();
    
    queryInput.value = item.question;
    errorEl.classList.add("hidden");
    loadingEl.classList.add("hidden");
    renderDashboard(item.latestAnswer);
  } catch (err) {
    console.error("Failed to load history item:", err);
    errorEl.textContent = "Failed to load history item";
    errorEl.classList.remove("hidden");
  }
}

// Load history on page load
loadHistory();
