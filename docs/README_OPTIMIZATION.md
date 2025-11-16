# Database Optimization - Quick Summary

## What This Does

Reduces AIR-1 sensor database storage from **5.4 GB/year → 346 MB/year (94% reduction)**.

## Key Changes

1. **Sensors table**: Maps "sensor-co2" → integer ID, stores units ("ppm") once
2. **Real-time aggregation**: Creates minutely summaries for ALL data  
3. **7-day raw retention**: Keep full resolution recent, delete old raw data
4. **Clean schema**: Remove redundant sensorId text, state, eventId columns

## Units Approach

✅ **Units stored as TEXT in sensors.unit column** (e.g., "ppm", "°C", "µg/m³")  
❌ **NOT a separate unit_id or units table** - keep it simple, canonical

## Implementation

See **IMPLEMENTATION_PLAN.md** for complete step-by-step guide.

### Quick Start

1. **Backup**: `cp db.sqlite db.sqlite.backup`
2. **Phase 1**: Create sensors table, migrate
3. **Phase 2**: Enable real-time aggregation  
4. **Phase 3**: Enable daily cleanup
5. **Phase 4**: Update API queries

## Storage Timeline

| Time | Raw | Aggregated | Total |
|------|-----|------------|-------|
| Day 7 | 84 MB | 3.5 MB | 88 MB |
| Month 1 | 60 MB | 21 MB | 81 MB |
| Year 1 | 60 MB | 286 MB | **346 MB** |

Raw table stays ~60 MB (7 days rolling window).  
Aggregated grows slowly (~24 MB/month).

## Data Flow

```
SSE Event → Store in readings (raw)
         ↓
         → Add to aggregation buffer
         ↓
Every 60s → Flush to readings_aggregated (minutely summaries)
         ↓
After 7d → Delete from readings (raw)
```

## Queries

- **Recent data (<7 days)**: Use `readings` table (full resolution, every ~10s)
- **Historical (>7 days)**: Use `readings_aggregated` table (minutely summaries)
- **API**: `getReadings()` function automatically routes to correct table

## Files Removed

Cleaned up redundant planning docs:
- ~~IMPLEMENTATION_PLAN_REVISED.md~~
- ~~AGGREGATION_CORRECTION.md~~
- ~~AGGREGATION_DETAILS.md~~
- ~~OPTIMIZATION_PLAN.md~~
- ~~PLAN_SUMMARY.txt~~
- ~~ANALYSIS_SUMMARY.md~~

**Single source of truth**: `IMPLEMENTATION_PLAN.md`
