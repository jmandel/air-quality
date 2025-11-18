# SQLite Query Examples in Shelley Prompt

## Overview

Enhanced the Shelley LLM prompt with comprehensive, debugged SQLite examples to improve code generation quality.

## What Was Added

### 4 Complete Working Examples

**Example 1: Simple Query with Statistics**
- Basic prepared statement usage
- Reading from `readings` table
- Calculating avg/max/min
- Proper status colors based on thresholds

**Example 2: Using Aggregated Data**
- Query `readings_aggregated` for performance
- Per-minute summaries for longer time ranges
- Computing statistics from aggregated data

**Example 3: Multiple Sensors with Charts**
- Querying multiple sensors
- Creating line charts
- Formatting time-series data
- Multiple series on one chart

**Example 4: Time-Based Comparisons**
- Today vs yesterday logic
- Calculating start-of-day timestamps
- Computing percentage changes
- Trend indicators (up/down arrows)

### Additional Reference Material

**Complete Sensor ID Mapping**
```
1=co2_ppm, 2=co_ppm, 3=pm2_5_ug_m3, 4=pm10_ug_m3, 5=pm1_ug_m3, 
6=pm4_ug_m3, 7=pm0_3_to_1_ug_m3, 8=pm1_to_2_5_ug_m3, 
9=pm2_5_to_4_ug_m3, 10=pm4_to_10_ug_m3, 11=ethanol_ppm, 12=nh3_ppm, 
13=no2_ppm, 14=h2_ppm, 15=ch4_ppm, 16=sen55_temp_c, 17=dps_temp_c, 
18=sen55_humidity_pct, 19=sen55_voc_index, 20=sen55_nox_index, 
21=pressure_hpa, 22=wifi_rssi_dbm, 23=esp_temp_c
```

**Best Practices**
- Always use prepared statements: `db.prepare(sql).all(params)`
- Use `.all()` for multiple rows, `.get()` for single row
- Close database with `db.close()` when done
- Timestamps are in milliseconds
- For time ranges > 2 hours, use `readings_aggregated`
- Raw data has 7-day retention, aggregates are permanent

## Example Code Structure

All examples follow this proven pattern:

```typescript
import { Database } from "bun:sqlite";

// 1. Open database (readonly)
const db = new Database("/db/db.sqlite", { readonly: true });

// 2. Calculate time range using Date.now()
const now = Date.now();
const oneHourAgo = now - (60 * 60 * 1000);

// 3. Query with prepared statement
const stmt = db.prepare(`
  SELECT ts, value 
  FROM readings 
  WHERE sensor_id = ? AND ts >= ?
  ORDER BY ts ASC
`);

const readings = stmt.all(1, oneHourAgo);

// 4. Process data
const values = readings.map(r => r.value);
const avg = values.reduce((a, b) => a + b, 0) / values.length;

// 5. Format as DashboardResponse
const response = {
  summary: "...",
  blocks: [...]
};

// 6. Output JSON
console.log(JSON.stringify(response, null, 2));

// 7. Close database
db.close();
```

## Benefits

### Before
- LLM had to guess SQLite API syntax
- No concrete patterns to follow
- Frequent errors with prepared statements
- Inconsistent time calculations
- Wrong table selection (raw vs aggregated)

### After
- ✅ Concrete, working code to adapt
- ✅ Proper prepared statement syntax
- ✅ Clear sensor ID mappings
- ✅ Time calculation patterns
- ✅ Performance guidance (when to use aggregated data)
- ✅ Complete response formatting examples

## Testing Methodology

All examples were:
1. Written as standalone scripts
2. Executed against real database
3. Verified to produce correct output
4. Tested with actual sensor data

Example test run:
```bash
$ bun run /tmp/test-complete.ts
{
  "summary": "CO₂ averaged 774 ppm over the last hour",
  "blocks": [
    {
      "type": "metric",
      "title": "Average CO₂",
      "value": 774,
      "unit": "ppm",
      "status": "success"
    },
    {
      "type": "metric",
      "title": "Peak CO₂",
      "value": 807,
      "unit": "ppm"
    }
  ]
}
```

## Prompt Structure

The enhanced prompt now includes:

```
1. User question
2. Database schema
3. Available sensors with thresholds
4. Current time context
5. Task description
6. Reusable script guidance
7. 🆕 COMPLETE WORKING EXAMPLES (4 examples)
8. 🆕 SENSOR ID REFERENCE
9. 🆕 SQLITE TIPS
10. Dashboard schema
11. Final instruction
```

## Impact

This should significantly improve:
- **Code quality** - LLM has proven patterns to follow
- **First-time success rate** - Fewer syntax errors
- **Query performance** - Better table selection
- **Response formatting** - Consistent dashboard structure
- **Time handling** - Proper dynamic calculations

---

**Commit:** fffc21e  
**File:** `ask-stream-route-sandbox.ts`  
**Lines Added:** ~194 lines of examples and reference material
