# Dynamic Schema Generation

## Problem

The Shelley prompt previously had hardcoded database schema and sensor information:

```typescript
DATABASE SCHEMA:
- Table: sensors
  Columns: id (INTEGER PRIMARY KEY), name (TEXT), display_name (TEXT), unit (TEXT)
  
AVAILABLE SENSORS (name → display_name, unit):
- co2_ppm → "CO₂", ppm (good < 800, warning 800-1000, critical > 1000)
- pm2_5_ug_m3 → "PM 2.5", µg/m³ (good < 12, warning 12-35, critical > 35)
(+ 18 more sensors available)  // ❌ Not helpful!
```

**Issues:**
- ❌ Duplication - schema exists in code and database
- ❌ Drift risk - code could get out of sync with database  
- ❌ Incomplete - showed only 5 sensors, said "+ 18 more"
- ❌ Manual maintenance - any schema change requires code update
- ❌ Missing sensor IDs - LLM had to guess or count

## Solution

Now dynamically queries the database to build the schema section:

```typescript
function buildSchemaSection(): string {
  const db = new Database("/home/exedev/app/db.sqlite", { readonly: true });
  
  try {
    // Get all sensors from database
    const sensors = db.query("SELECT * FROM sensors ORDER BY id").all();
    
    // Get table schemas via PRAGMA
    const readingsSchema = db.query("PRAGMA table_info(readings)").all();
    const aggSchema = db.query("PRAGMA table_info(readings_aggregated)").all();
    
    // Get indexes from sqlite_master
    const indexes = db.query(`
      SELECT name, tbl_name 
      FROM sqlite_master 
      WHERE type='index' AND sql IS NOT NULL
    `).all();
    
    // Build formatted schema string
    let schema = "DATABASE SCHEMA:\n\n";
    
    // Format readings table
    schema += "Table: readings (raw sensor data, 7-day retention)\n";
    schema += "Columns:\n";
    readingsSchema.forEach((col: any) => {
      schema += `  - ${col.name}: ${col.type}${col.pk ? ' PRIMARY KEY' : ''}...\n`;
    });
    
    // Format aggregated table
    schema += "Table: readings_aggregated (...)\n";
    // ...
    
    // List ALL sensors with IDs
    schema += "AVAILABLE SENSORS:\n\n";
    sensors.forEach(s => {
      schema += `${s.id}. ${s.name} → "${s.display_name}" (${s.unit})\n`;
    });
    
    return schema;
  } finally {
    db.close();
  }
}

const schemaSection = buildSchemaSection();
const prompt = `...${schemaSection}...`;
```

## What Gets Generated

### Complete Table Schemas

```
Table: readings (raw sensor data, 7-day retention)
Columns:
  - id: INTEGER PRIMARY KEY
  - ts: INTEGER NOT NULL
  - sensor_id: INTEGER NOT NULL
  - value: REAL
Note: ts is milliseconds since epoch (e.g., Date.now())

Table: readings_aggregated (per-minute summaries, permanent retention)
Columns:
  - id: INTEGER PRIMARY KEY
  - minute_ts: INTEGER NOT NULL
  - sensor_id: INTEGER NOT NULL
  - avg_value: REAL NOT NULL
  - min_value: REAL NOT NULL
  - max_value: REAL NOT NULL
  - sample_count: INTEGER NOT NULL
Note: Use this table for queries > 2 hours for better performance

Indexes on readings: idx_readings_ts, idx_readings_sensor_id, idx_readings_sensor_ts
Indexes on readings_aggregated: idx_agg_minute_ts, idx_agg_sensor_id, idx_agg_lookup
```

### Complete Sensor List (All 29 Sensors)

```
AVAILABLE SENSORS:

1. co2_ppm → "CO₂" (ppm)
2. co_ppm → "CO" (ppm)
3. ethanol_ppm → "Ethanol" (ppm)
4. nh3_ppm → "Ammonia" (ppm)
5. no2_ppm → "NO₂" (ppm)
6. ch4_ppm → "Methane" (ppm)
7. h2_ppm → "Hydrogen" (ppm)
8. pm1_ug_m3 → "PM 1.0" (µg/m³)
9. pm2_5_ug_m3 → "PM 2.5" (µg/m³)
10. pm4_ug_m3 → "PM 4.0" (µg/m³)
11. pm10_ug_m3 → "PM 10" (µg/m³)
12. pm0_3_to_1_num → "PM 0.3-1.0μm" (#/cm³)
13. pm1_to_2_5_num → "PM 1.0-2.5μm" (#/cm³)
14. pm2_5_to_4_num → "PM 2.5-4.0μm" (#/cm³)
15. pm4_to_10_num → "PM 4.0-10μm" (#/cm³)
16. sen55_temp_c → "Temperature" (°C)
17. esp_temp_c → "ESP Temperature" (°C)
18. sen55_humidity_pct → "Humidity" (%)
19. dps310_pressure_hpa → "Pressure" (hPa)
20. sen55_voc_index → "VOC Index" (index)
21. sen55_nox_index → "NOx Index" (index)
22. wifi_rssi_dbm → "Signal Strength" (dBm)
23. uptime_s → "Uptime" (seconds)
24. online → "Online Status" (n/a)
25. sleep_duration_min → "Sleep Duration" (minutes)
26. prevent_sleep → "Prevent Sleep" (n/a)
27. voc_quality → "VOC Quality" (n/a)
28. sen55_temp_offset_c → "Temp Offset" (°C)
29. sen55_hum_offset_pct → "Humidity Offset" (%)

COMMON SENSOR THRESHOLDS:
- CO₂ (id=1): good <800ppm, warning 800-1000, critical >1000
- PM2.5 (id=9): good <12, warning 12-35, critical >35 µg/m³
- VOC Index (id=20): good <100, warning 100-250, critical >250
- Temperature (id=16): typical 20-30°C
- Humidity (id=18): comfortable 40-60%
```

## Benefits

### For Development

✅ **Single source of truth** - database is the schema  
✅ **No drift** - code always reflects actual database  
✅ **Auto-updated** - adding sensors automatically appears in prompts  
✅ **Less maintenance** - no manual schema copying  

### For LLM

✅ **Complete information** - sees all 29 sensors with IDs  
✅ **Accurate schema** - actual column types and constraints  
✅ **Index awareness** - knows which indexes exist for optimization  
✅ **Clear mappings** - sensor_id=1 is CO₂, etc.  

### For Users

✅ **Better code generation** - LLM has complete sensor list  
✅ **Fewer errors** - correct sensor IDs from the start  
✅ **More features** - can use all sensors, not just common 5  

## Implementation Details

**When:** Schema is queried once per request, during prompt building  
**Where:** `ask-stream-route-sandbox.ts`, `buildSchemaSection()` function  
**Cost:** ~2ms query time, negligible overhead  
**Caching:** Could be added if needed, but not necessary for current load  

## Testing

```bash
# Verify schema generation
bun run /tmp/extract-schema.ts

# Should show all 29 sensors with correct IDs
# Should show actual table schemas from PRAGMA
# Should list all indexes
```

## Future Enhancements

Potential improvements:
- Cache schema for N minutes (low priority, fast enough)
- Add statistics (row counts, date ranges)
- Include example queries for common patterns
- Show data quality metrics

---

**Commit:** f814648  
**File:** `ask-stream-route-sandbox.ts`  
**Lines Changed:** +82, -16  
**Impact:** LLM now has complete, accurate database schema
