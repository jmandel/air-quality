# Tabbed UI for Dashboard Results

## Overview

Added a sleek 3-tab interface to view query results in multiple formats:
- **📊 Dashboard** - Visual tiles, metrics, and charts
- **📋 JSON** - Raw response data
- **💻 Script** - TypeScript code that generated the result

## Implementation

### Backend Changes (`ask-stream-route-sandbox.ts`)

Added new SSE event type to send script content:

```typescript
// After result and before saved
const scriptEvent = `event: script\ndata: ${JSON.stringify({ content: finalScriptContent })}\n\n`;
controller.enqueue(new TextEncoder().encode(scriptEvent));
```

### Frontend Changes (`ask.ts`)

**1. State Management**
```typescript
let currentScriptContent: string | null = null;
let currentResultJson: any | null = null;
```

**2. Script Event Listener**
```typescript
eventSource.addEventListener("script", (e: any) => {
  const data = JSON.parse(e.data);
  currentScriptContent = data.content;
  // Update tab if already rendered
  const scriptPane = document.getElementById("tab-script");
  if (scriptPane) {
    scriptPane.innerHTML = `<pre class="code-block">${escapeHtml(currentScriptContent)}</pre>`;
  }
});
```

**3. Tabbed Render Function**
```typescript
function renderDashboard(answer: DashboardResponse) {
  currentResultJson = answer;
  
  let html = `
    <div class="result-tabs">
      <div class="tab-buttons">
        <button class="tab-btn active" data-tab="dashboard">📊 Dashboard</button>
        <button class="tab-btn" data-tab="json">📋 JSON</button>
        <button class="tab-btn" data-tab="script">💻 Script</button>
      </div>
      <div class="tab-content">
        <div class="tab-pane active" id="tab-dashboard">
          <!-- Existing dashboard tiles -->
        </div>
        <div class="tab-pane" id="tab-json">
          <pre class="code-block">${escapeHtml(JSON.stringify(answer, null, 2))}</pre>
        </div>
        <div class="tab-pane" id="tab-script">
          <pre class="code-block">${currentScriptContent ? escapeHtml(currentScriptContent) : 'Loading script...'}</pre>
        </div>
      </div>
    </div>
  `;
  
  // Attach click handlers for tab switching
  dashboardEl.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      // Switch active tab and pane
    });
  });
}
```

### Styling (`ask.html`)

```css
.result-tabs {
  width: 100%;
}

.tab-buttons {
  display: flex;
  gap: 0.5rem;
  border-bottom: 2px solid var(--border);
}

.tab-btn {
  background: transparent;
  border: none;
  color: var(--muted);
  padding: 0.75rem 1.5rem;
  cursor: pointer;
  transition: all 0.2s;
}

.tab-btn.active {
  color: var(--accent);
  border-bottom: 3px solid var(--accent);
}

.tab-pane {
  display: none;
}

.tab-pane.active {
  display: block;
  animation: fadeIn 0.2s;
}

.code-block {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 1.5rem;
  overflow-x: auto;
  font-family: 'Monaco', 'Menlo', monospace;
  font-size: 0.85rem;
  line-height: 1.6;
  max-height: 600px;
  overflow-y: auto;
}
```

## User Experience

### SSE Event Flow
```
1. status → "Using cached script..."
2. cached → true
3. status → "🔒 Executing script (sandboxed)..."
4. script_complete → { exitCode: 0, outputLength: 689 }
5. result → { summary: "...", blocks: [...] }
6. done → { scriptContent: "..." }
7. script → { content: "import { Database }..." }  ✨ NEW
8. saved → { historyId: "..." }
```

### Tab Interaction

Users can seamlessly switch between views:

1. **Dashboard Tab** (Default)
   - Visual representation
   - Metric tiles with status colors
   - Interactive charts
   - Summary text

2. **JSON Tab**
   - Pretty-printed JSON
   - Full response structure
   - Copy-pasteable
   - Syntax highlighting via `<pre>`

3. **Script Tab**
   - TypeScript source code
   - Shows exactly what generated the dashboard
   - Scroll able for long scripts
   - Monospace font for readability

### Benefits

✅ **Transparency** - See exactly what code ran  
✅ **Debugging** - Inspect raw JSON structure  
✅ **Learning** - Understand how queries work  
✅ **Trust** - Verify sandboxed execution  
✅ **Elegant UX** - Smooth animations, clear visual hierarchy  

## Testing

```bash
# Test the script event
curl -N "http://localhost:3000/api/ask/stream?id=history-item-id" | grep -A1 "^event: script$"

# Output:
# event: script
# data: {"content":"import { Database } from \"bun:sqlite\";..."}
```

## Example Output

```typescript
// Script tab shows the actual TypeScript:
import { Database } from "bun:sqlite";

interface Reading {
  ts: number;
  value: number;
}

interface CorrelationResult {
  correlation: number;
  strength: string;
  description: string;
}

function calculateCorrelation(tempReadings: Reading[], humidityReadings: Reading[]): CorrelationResult {
  // ... full implementation ...
}

const db = new Database("/db/db.sqlite", { readonly: true });
const result = calculateCorrelation(tempReadings, humidityReadings);
console.log(JSON.stringify(response, null, 2));
```

---

**Commit:** 78cbf4b  
**Date:** 2025-11-16  
**Related:** Consolidation commit a28c586
