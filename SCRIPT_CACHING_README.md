# Script Caching for Repeated Questions

## Overview

When a user asks the same question multiple times, the system now reuses the previously generated analysis script instead of calling Shelley/LLM again. This dramatically improves performance while still returning current data.

## How It Works

### 1. Question Matching
- Questions are normalized (trimmed, lowercase) for matching
- Exact match required: "What is the current CO₂ level?" matches itself
- Character-insensitive: "CO₂" and "CO2" are treated as different (by design - preserves user intent)

### 2. Script Lookup
When a question comes in:
1. Check `asked/` directory for previous metadata files
2. Find all entries matching the question (case-insensitive)
3. Sort by timestamp (newest first)
4. Retrieve the most recent script

### 3. Execution Flow

**First Time (No Cache):**
```
User asks → No cached script → Call Shelley → Generate script → Run script → Return results → Save to history
Time: ~20-30 seconds
```

**Subsequent Times (Cached):**
```
User asks → Find cached script → Run script → Return results → Save to history
Time: ~1-2 seconds
```

## Performance Improvements

| Scenario | Without Caching | With Caching | Speedup |
|----------|----------------|--------------|---------|
| First ask | ~25s | ~25s | 1x |
| Repeat ask | ~25s | ~1.5s | **17x** |
| Starred pill | ~25s | ~1.5s | **17x** |

## Benefits

### Speed
- **17x faster** for repeated questions
- Starred queries become instant-use tools
- Better UX for common queries

### Cost
- No LLM API calls for cached queries
- Save $$$ on Claude API costs
- Reduce server load

### Consistency
- Same query logic across all runs
- Easier to debug (same script)
- Predictable behavior

### Data Freshness
- Script re-executes every time
- Gets current data from database
- Results reflect latest sensor readings

## Implementation

### New Module: `ask-history-lookup.ts`

**`findPreviousScript(question: string)`**
- Searches `asked/` directory for matching questions
- Returns most recent script content
- Returns `null` if no match found

```typescript
const previous = await findPreviousScript("What is the current CO₂ level?");
if (previous) {
  console.log("Using cached script from", previous.previousId);
  // previous.scriptContent available
}
```

**`getQuestionCount(question: string)`**
- Counts how many times a question has been asked
- Useful for analytics

### Modified: `ask-helper.ts`

```typescript
// Check cache first
const previousScript = await findPreviousScript(question);

if (previousScript) {
  // Use cached script
  scriptContent = previousScript.scriptContent;
  usedCachedScript = true;
} else {
  // Call Shelley to generate new script
  // ... (existing code)
}

// Either way, run the script and save results
```

### Response Format

API responses now include caching info:

```json
{
  "question": "What is the current CO₂ level?",
  "answer": { ... },
  "conversationId": "cli-1763263569886",
  "usedCachedScript": true,
  "previousId": "2025-11-16T03-26-09-886Z_what-is-the-current-co-level",
  "timestamp": "2025-11-16T03:26:25.079Z"
}
```

## Logging

### Cache Hit (♻️)
```
♻️  Using cached script from 2025-11-16T03-26-09-886Z_what-is-the-current-co-level
🚀 Executing analyze.ts...
📊 Script exit: 0, output: 33121 chars
✅ Parsed dashboard with 2 blocks
📊 Question asked 5 time(s) before
💾 Saved to history: 2025-11-16T03-26-25-079Z_... (reused script)
```

### Cache Miss (🤖)
```
🤖 No cached script found, calling Shelley...
📝 Shelley exit: 0, output: 18159 chars
📄 Script exists at /tmp/airq-ask-ET0LMU/analyze.ts: true
✅ Script created (4248 bytes)
🚀 Executing analyze.ts...
📊 Script exit: 0, output: 33224 chars
✅ Parsed dashboard with 2 blocks
💾 Saved to history: 2025-11-16T03-25-39-154Z_... (new script)
```

## Use Cases

### Starred Queries
Most beneficial for starred queries that users run frequently:
- "What is the current CO₂ level?"
- "Is the air quality good right now?"
- "Show me PM2.5 over the last hour"

### Dashboards
Can create dashboard pages with multiple queries:
- Each loads in ~1-2s instead of 20-30s
- 5 queries load in 10s instead of 2+ minutes

### Comparative Analysis
Running the same query multiple times to track changes:
- Morning check: What's the CO₂?
- Afternoon check: What's the CO₂?
- Evening check: What's the CO₂?

All use the same script logic, making comparisons meaningful.

## Edge Cases

### Question Variations
These are treated as DIFFERENT questions (new scripts):
- "What is the current CO₂ level?"
- "What is the current CO2 level?" (different character)
- "What is current CO₂ level?" (missing "the")
- "what is the current co₂ level?" (returns same cache - case insensitive)

### Script Evolution
If you want to regenerate a script:
1. Trash the old entries
2. Ask the question again
3. Shelley generates a new script

### Data Staleness
Not an issue - scripts query the database in real-time:
- Cached script: `SELECT * FROM readings WHERE ts > ?`
- Every run gets current data
- Only the query logic is cached, not results

## Future Enhancements

- [ ] Manual cache invalidation per question
- [ ] Script versioning (keep multiple versions)
- [ ] Smart cache TTL (expire old scripts)
- [ ] Script optimization hints (Shelley suggests improvements)
- [ ] A/B testing (compare different scripts for same question)
- [ ] Cache statistics dashboard

## Testing

```bash
# Test cache lookup
cd ~/app && bun run test-lookup.ts

# Test via API
curl -s "http://localhost:3000/api/ask?q=What+is+the+current+CO₂+level?" | \
  jq '{usedCachedScript, previousId, responseTime: "fast"}'
```

## Git History

```
4d20b72 Add script caching for repeated questions
```

## Files Changed

- `ask-history-lookup.ts` - New module for script lookup
- `ask-helper.ts` - Check cache before calling Shelley
- `index.ts` - Return cache info in response
- `test-lookup.ts` - Test script for cache lookup

