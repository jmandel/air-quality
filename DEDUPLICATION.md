# Deduplication Feature

## Overview

The web app now implements automatic deduplication to prevent redundant data when multiple browser tabs are streaming the same sensor data simultaneously.

## How It Works

### Deduplication Window
- **Window Size**: 10 seconds
- **Key**: Combination of `sensorId`, `value`, and `state`

### Logic
When a reading is submitted to the API:

1. **Cache Check** (Fast Path): First checks an in-memory cache for recent readings with the same sensor/value/state combination within the 10-second window
2. **Database Check** (Fallback): If not found in cache, queries the database for existing readings within ±10 seconds
3. **Decision**:
   - If a duplicate is found: Silently drops the reading and increments the `duplicates` counter
   - If not a duplicate: Inserts the reading into the database and updates the cache

### Cache Management
- The in-memory cache is automatically cleaned every 30 seconds to remove entries older than the 10-second window
- Cache survives for the lifetime of the server process
- On server restart, the database serves as the source of truth

## API Response

The POST `/api/readings` endpoint now returns additional information:

```json
{
  "success": true,
  "count": 10,        // Total readings in the batch
  "inserted": 8,      // Successfully inserted (new data)
  "duplicates": 2     // Skipped (duplicates)
}
```

## Examples

### Example 1: Multiple Tabs
If you have 3 browser tabs open, all streaming from the same sensor:
- Tab 1 sends: `{sensorId: "sensor-temp", value: 23.5, ts: 1000}`
- Tab 2 sends: `{sensorId: "sensor-temp", value: 23.5, ts: 1001}` ← **DUPLICATE** (within 10s, same value)
- Tab 3 sends: `{sensorId: "sensor-temp", value: 23.5, ts: 1002}` ← **DUPLICATE** (within 10s, same value)

Result: Only 1 reading stored in the database.

### Example 2: Value Changed
- Tab 1 sends: `{sensorId: "sensor-temp", value: 23.5, ts: 1000}`
- Tab 2 sends: `{sensorId: "sensor-temp", value: 24.1, ts: 1001}` ← **NOT DUPLICATE** (different value)

Result: Both readings stored (value changed).

### Example 3: Time Window Expired
- Tab 1 sends: `{sensorId: "sensor-temp", value: 23.5, ts: 1000}`
- Tab 2 sends: `{sensorId: "sensor-temp", value: 23.5, ts: 11500}` ← **NOT DUPLICATE** (>10s elapsed)

Result: Both readings stored (outside time window).

## Benefits

1. **Prevents Database Bloat**: No redundant duplicate entries
2. **Multiple Tab Safety**: Users can open multiple tabs without worrying about data duplication
3. **Efficient**: Fast in-memory cache for common cases, database fallback for edge cases
4. **Transparent**: Silently drops duplicates without affecting the user experience
5. **Informative**: API reports how many duplicates were detected

## Configuration

The deduplication window is currently hardcoded to 10 seconds:

```typescript
const DEDUPE_WINDOW_MS = 10000; // 10 seconds
```

To adjust this value, modify the `DEDUPE_WINDOW_MS` constant in `index.ts` and restart the server.

## Testing

To verify deduplication is working, check the server console output:

```
🚀 Server running at http://localhost:3000/
📊 API available at http://localhost:3000/api
💾 Database: db.sqlite
🔄 Deduplication enabled: 10s window
```

Then send duplicate data and observe the API response showing the duplicate count.
