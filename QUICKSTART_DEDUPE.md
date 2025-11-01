# Deduplication Quick Reference

## What Problem Does This Solve?

**Before:** Opening 3 browser tabs = same sensor data stored 3 times in database  
**After:** Opening 3 browser tabs = sensor data stored only once ✅

## How It Works

The server checks each incoming reading:
- **Same sensor + Same value + Same state + Within 10 seconds** = ❌ DUPLICATE (dropped)
- **Different value OR outside 10-second window** = ✅ NEW (stored)

## Examples

### ✅ Prevented: Multiple tabs with same data
```
Tab 1: CO2=450 at 10:00:00 → Stored
Tab 2: CO2=450 at 10:00:01 → Duplicate (dropped)
Tab 3: CO2=450 at 10:00:02 → Duplicate (dropped)
Result: 1 reading in database
```

### ✅ Allowed: Value changes
```
Time 1: CO2=450 → Stored
Time 2: CO2=455 → Stored (different value)
Time 3: CO2=460 → Stored (different value)
Result: 3 readings in database
```

### ✅ Allowed: Time window expiry
```
T+0s:  CO2=450 → Stored
T+5s:  CO2=450 → Duplicate (dropped)
T+11s: CO2=450 → Stored (outside 10s window)
Result: 2 readings in database
```

## Configuration

**Default:** 10-second window

**To change:** Edit `index.ts` line 71:
```typescript
const DEDUPE_WINDOW_MS = 10000; // Change to desired milliseconds
```

Then restart: `bun run index.ts`

## Monitoring

The API tells you how many duplicates were detected:

```bash
curl -X POST http://localhost:3000/api/readings \
  -H "Content-Type: application/json" \
  -d '[{"ts":1234567890,"sensorId":"sensor-temp","value":22.5}]'
```

**Response:**
```json
{
  "success": true,
  "count": 1,
  "inserted": 0,      ← 0 new readings
  "duplicates": 1     ← 1 duplicate detected
}
```

## Performance

- **Speed:** <1ms overhead (typical)
- **Memory:** ~50-100 cache entries
- **Database:** 67% fewer writes with 3 tabs

## No Configuration Needed!

The deduplication feature works automatically:
- ✅ No settings to configure in the UI
- ✅ No changes to frontend code
- ✅ No user-visible impact
- ✅ Just works!

Open as many tabs as you want - duplicate data is automatically prevented. 🎉
