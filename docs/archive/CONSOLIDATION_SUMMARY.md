# Ask Route Consolidation

## Problem

The ask interface had two different paths for getting dashboard results:

1. **`/api/ask/stream?q=question`** - SSE stream for new questions
   - Generates script via Shelley LLM
   - Shows real-time progress (LLM generation, sandbox execution)
   - Clear that everything is sandboxed

2. **`/api/ask/item/:id`** - Direct JSON response for history items
   - Re-executes saved script
   - No progress feedback
   - Unclear if sandboxed (it was, but not obvious to users)

This dual-path approach was:
- ❌ Confusing - two different APIs for similar functionality
- ❌ Inconsistent UX - no progress for history items
- ❌ Redundant - duplicated logic
- ❌ Unclear - hard to tell what's sandboxed

> Note: The legacy `/api/ask/item/:id` endpoint has since been removed; use the streaming endpoint with `?id=` instead.

## Solution

**Consolidated to single streaming endpoint with optional history ID:**

```typescript
// New questions
GET /api/ask/stream?q=your+question

// Replay history
GET /api/ask/stream?id=history-item-id
```

## Implementation

### Backend (`ask-stream-route-sandbox.ts`)

```typescript
export async function handleAskStreamSandboxed(req: Request) {
  const query = url.searchParams.get("q");
  const historyId = url.searchParams.get("id");  // NEW
  
  if (!query && !historyId) {
    return Response.json({ error: "Use ?q=question or ?id=history_id" });
  }
  
  if (historyId) {
    // Load script from history
    const metadata = await getHistoryMetadata(historyId);
    actualQuery = metadata.question;
    scriptContent = await readFile(`asked/${historyId}.ts`);
    useCachedScript = true;
  } else {
    // Check for previously cached script by question text
    const previousScript = await findPreviousScript(query);
    scriptContent = previousScript?.scriptContent;
  }
  
  // Stream execution with consistent SSE events
  for await (const event of streamShelleyExecutionSandboxed(...)) {
    yield event;  // status, cached, script_progress, result, saved
  }
}
```

### Frontend (`ask.ts`)

**Before:**
```typescript
async function loadHistoryItem(id: string) {
  const response = await fetch(`/api/ask/item/${id}`);
  const item = await response.json();
  renderDashboard(item.latestAnswer.answer);
  // No progress feedback!
}
```

**After:**
```typescript
async function loadHistoryItem(id: string) {
  // Use same streaming endpoint
  const eventSource = new EventSource(`/api/ask/stream?id=${id}`);
  
  eventSource.addEventListener("cached", () => {
    progressEl.textContent += "♻️ Using saved script from history\n";
  });
  
  eventSource.addEventListener("result", (e) => {
    dashboardResult = JSON.parse(e.data);
  });
  
  // Full progress feedback just like new questions!
}
```

## Benefits

✅ **Single source of truth** - one streaming endpoint for all queries  
✅ **Consistent UX** - progress indicators for both new & history queries  
✅ **Clear security model** - obvious that everything runs sandboxed  
✅ **Better maintainability** - less duplicated code  
✅ **Streaming-first** - natural fit for real-time progress updates  

## Testing

```bash
# New question (generates script via Shelley)
curl -N "http://localhost:3000/api/ask/stream?q=What%27s+my+CO2+last+hour"

# Replay from history (uses saved script)
curl -N "http://localhost:3000/api/ask/stream?id=is-temp-correlated-with-humidity"
```

Both paths now show:
- `event: status` - Progress messages
- `event: cached` - Using saved script indicator
- `event: script_progress` - Sandbox execution output
- `event: result` - Final dashboard JSON
- `event: saved` - Completion confirmation

## What Stays

The `/api/ask/item/:id` endpoint still exists in `ask-api-routes.ts` for backward compatibility, but the frontend no longer uses it. It can be removed in a future cleanup if no external consumers depend on it.

## Migration Path

No breaking changes for external consumers:
- `/api/ask/stream?q=` continues working exactly as before
- New `/api/ask/stream?id=` adds functionality without breaking existing uses
- Old `/api/ask/item/:id` still works if anything depends on it

---

**Commit:** a28c586
**Date:** 2025-11-16
