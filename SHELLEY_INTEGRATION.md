# Shelley Integration - Script Generation System

## Overview

The `/api/ask` endpoint uses Shelley to dynamically generate TypeScript analysis scripts that query the air quality database and produce structured dashboard responses.

## Architecture

```
User Question
     ↓
/api/ask endpoint
     ↓
askShelley() helper
     ↓
Create temp directory
     ↓
Call Shelley CLI with comprehensive prompt
     ↓
Shelley writes analyze.ts script
     ↓
Execute: bun analyze.ts
     ↓
Parse JSON from stdout
     ↓
Return DashboardResponse
     ↓
Clean up temp directory
```

## Key Design Principles

### 1. Pure JSON Output
**CRITICAL**: The generated script must output ONLY valid JSON to stdout.

- **NO** `console.log()` for debugging
- **NO** error messages to stdout
- **YES** Use `console.error()` for debugging (goes to stderr)
- **YES** Handle errors gracefully and return error blocks in JSON

### 2. Database Access
Scripts get full access to the SQLite database at `/home/exedev/app/db.sqlite`

```typescript
import { Database } from "bun:sqlite";
const db = new Database("/home/exedev/app/db.sqlite");
```

### 3. Comprehensive Context
The prompt includes:

- Full database schema (sensors, readings, readings_aggregated)
- All 23 sensor definitions with names, units, display names
- Current timestamp for time-based queries
- Example SQL queries
- Status thresholds (good/warning/critical)
- Color codes for visualizations
- Complete TypeScript interfaces

## The Prompt

### Structure

```typescript
const prompt = `
USER QUESTION: "${question}"

DATABASE LOCATION: /home/exedev/app/db.sqlite

DATABASE SCHEMA:
[Complete schema with tables, columns, indexes]

AVAILABLE SENSORS:
[All 23 sensors with name → display_name, unit]

CURRENT TIME: ${now}

YOUR TASK:
Write analyze.ts that:
1. Queries SQLite
2. Analyzes data
3. Outputs ONLY JSON (no console.log!)
4. Follows DashboardResponse schema

TYPESCRIPT TEMPLATE:
[Complete working template with interfaces]

EXAMPLE QUERIES:
[SQL query examples]

STATUS THRESHOLDS:
[Good/warning/critical values for each sensor]

COLORS:
[Standard color palette]
`;
```

### Critical Instructions

```
CRITICAL RULES:
- NO console.log() statements anywhere
- NO error messages to stdout  
- Use console.error() for debugging (stderr)
- stdout must contain ONLY valid JSON
- Handle errors gracefully
```

## TypeScript Template

The prompt includes a complete working template:

```typescript
#!/usr/bin/env bun
import { Database } from "bun:sqlite";

interface DashboardResponse {
  summary: string;
  blocks: Array<TextBlock | MetricBlock | ChartBlock>;
}

// ... interface definitions ...

try {
  const db = new Database("/home/exedev/app/db.sqlite");
  
  // Query and analyze
  const response: DashboardResponse = {
    summary: "...",
    blocks: [/* ... */]
  };
  
  // ONLY the JSON!
  console.log(JSON.stringify(response, null, 2));
  
  db.close();
  process.exit(0);
  
} catch (error) {
  console.error("Error:", error);  // stderr
  
  // Still output valid JSON to stdout
  const errorResponse: DashboardResponse = { /* ... */ };
  console.log(JSON.stringify(errorResponse));
  process.exit(1);
}
```

## Database Schema Reference

### Tables

**sensors**
- `id` INTEGER PRIMARY KEY
- `name` TEXT (e.g., 'co2_ppm')
- `display_name` TEXT (e.g., 'CO₂')
- `unit` TEXT (e.g., 'ppm')

**readings**
- `id` INTEGER PRIMARY KEY
- `ts` INTEGER (milliseconds timestamp)
- `sensor_id` INTEGER (foreign key)
- `value` REAL
- Indexes: `idx_readings_ts`, `idx_readings_sensor_id`

**readings_aggregated**
- `minute_ts` INTEGER (minute-level timestamp)
- `sensor_id` INTEGER
- `avg_value`, `min_value`, `max_value` REAL
- `sample_count` INTEGER

### Available Sensors

| Name | Display Name | Unit | Typical Range |
|------|--------------|------|---------------|
| co2_ppm | CO₂ | ppm | 400-2000 |
| pm2_5_ug_m3 | PM 2.5 | µg/m³ | 0-100 |
| pm10_ug_m3 | PM 10 | µg/m³ | 0-150 |
| sen55_temp_c | Temperature | °C | 15-35 |
| sen55_humidity_pct | Humidity | % | 20-80 |
| sen55_voc_index | VOC Index | index | 0-500 |
| sen55_nox_index | NOx Index | index | 0-500 |
| dps310_pressure_hpa | Pressure | hPa | 950-1050 |
| no2_ppm | NO₂ | ppm | 0-1 |
| co_ppm | CO | ppm | 0-10 |
| wifi_rssi_dbm | Signal | dBm | -90 to -30 |
| uptime_s | Uptime | seconds | 0+ |

(Plus PM1, PM4, particle counts, and other gas sensors)

## Example SQL Queries

### Current Value
```sql
SELECT value 
FROM readings 
WHERE sensor_id = (SELECT id FROM sensors WHERE name = 'co2_ppm') 
ORDER BY ts DESC 
LIMIT 1
```

### Recent Time Series
```sql
SELECT ts, value 
FROM readings r 
JOIN sensors s ON r.sensor_id = s.id 
WHERE s.name = 'co2_ppm' 
  AND ts >= ?
ORDER BY ts ASC
```

### Average Over Period
```sql
SELECT AVG(value) as avg 
FROM readings 
WHERE sensor_id = ? 
  AND ts >= ? 
  AND ts < ?
```

### Multiple Sensors
```sql
SELECT s.name, s.display_name, s.unit, r.ts, r.value
FROM readings r
JOIN sensors s ON r.sensor_id = s.id
WHERE s.name IN ('co2_ppm', 'pm2_5_ug_m3', 'sen55_temp_c')
  AND ts >= ?
ORDER BY ts DESC
```

## Status Thresholds

Included in prompt for automatic status determination:

### CO₂
- Good: < 800 ppm
- Warning: 800-1000 ppm
- Critical: > 1000 ppm

### PM2.5
- Good: < 12 µg/m³
- Warning: 12-35 µg/m³
- Critical: > 35 µg/m³

### VOC Index
- Good: < 100
- Warning: 100-250
- Critical: > 250

### Temperature
- Good: 20-24°C
- Warning: 24-28°C or < 18°C
- Critical: > 28°C or < 18°C

## Color Palette

Standard colors provided in prompt:

- **Blue** (primary): `#3b82f6`
- **Green** (good): `#22c55e`
- **Amber** (warning): `#f59e0b`
- **Red** (critical/error): `#ef4444`
- **Gray** (muted): `#94a3b8`

## Mock Implementation

Currently using a mock template (`mock-analyze-template.ts`) until Shelley LLM access is configured.

### What the Mock Does

- Queries real CO₂ data from database
- Gets last 20 readings
- Calculates current value and average
- Determines status (good/warning/critical)
- Generates metric card with status
- Creates line chart with 20 data points
- Adds threshold annotations
- Includes status/recommendation text

### Example Output

```json
{
  "summary": "Current CO₂ level is 752 ppm, averaging 757 ppm...",
  "blocks": [
    {
      "type": "metric",
      "title": "Current CO₂",
      "value": 752,
      "unit": "ppm",
      "status": "good"
    },
    {
      "type": "chart",
      "title": "CO₂ Levels - Recent Readings",
      "chartType": "line",
      "series": [/* 20 data points */],
      "annotations": [/* thresholds */]
    },
    {
      "type": "text",
      "content": "Air quality is good...",
      "variant": "success"
    }
  ]
}
```

## Workflow Details

### 1. Create Temp Directory
```typescript
const tempDir = await mkdtemp(join(tmpdir(), "airq-ask-"));
const analyzePath = join(tempDir, "analyze.ts");
```

### 2. Call Shelley (or use mock)
```typescript
const proc = Bun.spawn([
  "shelley", 
  "-config", "/exe.dev/shelley.json",
  "-db", "/home/exedev/app/airq-ask.db",
  "prompt",
  prompt
]);
```

### 3. Execute Generated Script
```typescript
const analyzeProc = Bun.spawn(["bun", analyzePath], {
  stdout: "pipe",
  stderr: "pipe"
});

const jsonOutput = await new Response(analyzeProc.stdout).text();
```

### 4. Parse JSON
```typescript
const dashboardResponse = JSON.parse(jsonOutput.trim()) as DashboardResponse;
```

### 5. Cleanup
```typescript
await rm(tempDir, { recursive: true, force: true });
```

## Future Enhancements

### Immediate
- [ ] Configure Shelley with LLM API access (Claude/GPT)
- [ ] Replace mock with real Shelley-generated scripts
- [ ] Test with various question types

### Medium Term
- [ ] Support for multi-sensor queries
- [ ] Historical trend analysis
- [ ] Comparison queries (today vs yesterday)
- [ ] Predictive analysis

### Advanced
- [ ] Script caching (similar questions → reuse script)
- [ ] Conversation continuity (follow-up questions)
- [ ] Custom time ranges
- [ ] Export capabilities
- [ ] Alert threshold configuration

## Troubleshooting

### Script Errors
Check stderr for debugging output:
```typescript
const stderrOutput = await new Response(analyzeProc.stderr).text();
console.error("Script stderr:", stderrOutput);
```

### Invalid JSON
Ensure stdout contains ONLY JSON:
```typescript
// BAD
console.log("Analyzing data...");
console.log(JSON.stringify(response));

// GOOD
console.error("Analyzing data...");  // Goes to stderr
console.log(JSON.stringify(response)); // Only JSON to stdout
```

### Database Query Issues
Test queries directly:
```bash
sqlite3 /home/exedev/app/db.sqlite
sqlite> SELECT * FROM sensors LIMIT 5;
sqlite> SELECT COUNT(*) FROM readings;
```

### Temp Directory Cleanup
If temp dirs accumulate:
```bash
ls /tmp/airq-ask-* | wc -l
rm -rf /tmp/airq-ask-*
```

## Testing

### Test the Mock
```bash
bun /home/exedev/app/mock-analyze-template.ts | jq .
```

### Test the API
```bash
curl -s "http://localhost:3000/api/ask?q=What+is+the+current+CO2+level?" | jq .
```

### Test the UI
Open http://air443.exe.dev:3000/ask
