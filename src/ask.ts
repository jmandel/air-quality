import type { VegaLiteSpec } from "./vega-types";

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

// Store current script and result for tab display
let currentScriptContent: string | null = null;
let currentResultJson: any | null = null;

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

// Check URL for query parameter on page load
const urlParams = new URLSearchParams(window.location.search);
const urlQuery = urlParams.get('q');
if (urlQuery) {
  queryInput.value = urlQuery;
  askQuestion(urlQuery);
}

// Handle browser back/forward
window.addEventListener('popstate', (e) => {
  if (e.state && e.state.query) {
    queryInput.value = e.state.query;
    askQuestion(e.state.query);
  }
});

function askQuestion(query: string) {
  // Update URL with query parameter (for sharing/bookmarking)
  const url = new URL(window.location.href);
  url.searchParams.set('q', query);
  window.history.pushState({ query }, '', url);
  
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
    let msg = '';
    
    if (data.type === 'tool') {
      msg = `🔧 ${data.tool}`;
      progressEl.textContent += `${msg}\n`;
    } else if (data.type === 'tool_done') {
      msg = `   → ${data.preview || 'done'}`;
      progressEl.textContent += `${msg}\n`;
    } else if (data.type === 'thinking') {
      msg = `💭 ${data.text}`;
      progressEl.textContent += `${msg}\n`;
    }
    // Skip 'waiting' type - not informative
    
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

  eventSource.addEventListener("script", (e: any) => {
    const data = JSON.parse(e.data);
    currentScriptContent = data.content;
    const scriptPane = document.getElementById("tab-script");
    if (scriptPane) {
      scriptPane.innerHTML = `<pre class="code-block">${escapeHtml(currentScriptContent)}</pre>`;
    }
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

function renderDashboard(spec: VegaLiteSpec) {
  // Store the raw JSON for the JSON tab
  currentResultJson = spec;
  
  // Create tab container with single vega-lite viz
  const html = `
    <div class="result-tabs">
      <div class="tab-buttons">
        <button class="tab-btn active" data-tab="dashboard">📊 Visualization</button>
        <button class="tab-btn" data-tab="json">📋 Spec</button>
        <button class="tab-btn" data-tab="script">💻 Script</button>
      </div>
      <div class="tab-content">
        <div class="tab-pane active" id="tab-dashboard">
          <div id="vega-container" class="vega-main"></div>
        </div>
        <div class="tab-pane" id="tab-json">
          <pre class="code-block">${escapeHtml(JSON.stringify(spec, null, 2))}</pre>
        </div>
        <div class="tab-pane" id="tab-script">
          <pre class="code-block">${currentScriptContent ? escapeHtml(currentScriptContent) : 'Loading script...'}</pre>
        </div>
      </div>
    </div>
  `;

  dashboardEl.innerHTML = html;
  dashboardEl.classList.remove("hidden");
  
  // Attach tab click handlers
  dashboardEl.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tabName = btn.getAttribute('data-tab');
      dashboardEl.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      dashboardEl.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
      const pane = dashboardEl.querySelector(`#tab-${tabName}`);
      if (pane) pane.classList.add('active');
    });
  });
  
  // Render the single Vega-Lite spec
  setTimeout(() => renderVegaLite('vega-container', spec), 0);
}

function renderVegaLite(elementId: string, spec: any) {
  const container = document.getElementById(elementId);
  if (!container) {
    console.error(`Vega container not found: ${elementId}`);
    return;
  }

  // Check if Vega-Lite is available
  if (typeof (window as any).vegaEmbed === "undefined") {
    console.error("Vega-Embed not loaded");
    container.innerHTML = `<div style="padding: 20px; color: var(--muted)">Vega-Lite not loaded</div>`;
    return;
  }

  const vegaEmbed = (window as any).vegaEmbed;

  // Apply dark theme and responsive width
  const themedSpec = {
    ...spec,
    config: {
      ...spec.config,
      background: "transparent",
      axis: {
        labelColor: "#cbd5e1",
        titleColor: "#f8fafc",
        gridColor: "#223352",
        domainColor: "#223352",
      },
      legend: {
        labelColor: "#cbd5e1",
        titleColor: "#f8fafc",
      },
      title: {
        color: "#f8fafc",
      },
    },
  };

  vegaEmbed(container, themedSpec, {
    actions: false,
    renderer: "svg",
    theme: "dark",
  }).catch((err: any) => {
    console.error("Vega-Lite render error:", err);
    container.innerHTML = `<div style="padding: 20px; color: var(--danger)">Failed to render chart: ${err.message}</div>`;
  });
}


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
        if (!id) return;

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

async function loadHistoryItem(id: string) {
  // First fetch metadata to get the question text
  try {
    const metaResponse = await fetch(`/api/ask/history?limit=1000`);
    if (!metaResponse.ok) throw new Error("Failed to load history");
    const historyData = await metaResponse.json();
    const item = historyData.items.find((i: any) => i.id === id);
    if (!item) throw new Error("History item not found");
    
    // Update query input and reuse the normal ask flow (cache keyed by question text)
    queryInput.value = item.question;
    askQuestion(item.question);
    
  } catch (err) {
    console.error("Failed to load history item:", err);
    errorEl.textContent = "Failed to load history item";
    errorEl.classList.remove("hidden");
    loadingEl.classList.add("hidden");
  }
}

// Load history on page load
loadHistory();
