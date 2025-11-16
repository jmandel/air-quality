# Database Optimization Implementation Plan

## Overview

This plan consolidates ALL database optimization efforts for the AIR-1 sensor monitoring system, achieving **94% storage reduction** (5.4 GB/year → 346 MB/year).

### Key Changes

1. **Normalized sensor references**: Integer IDs (1 byte) vs text (24 bytes)
2. **Static unit storage**: Human-readable units ("ppm") stored ONCE per sensor in sensors table
3. **Real-time aggregation**: Minutely summaries for ALL data from day 1
4. **7-day raw retention**: Full resolution recent, aggregates forever
5. **Clean schema**: Remove redundant state/eventId columns

### SSE Payload

```json
{
  "id": "sensor-co2",      // Sensor identifier
  "name": "CO2",           // Display name  
  "value": 762,            // Numeric (no parsing needed)
  "state": "762 ppm",      // Redundant
  "uom": "ppm"             // Unit (store statically)
}
```

---

## Phase 1: Schema Migration

### 1.1 Create & Populate Sensors Table

```sql
CREATE TABLE sensors (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,    -- "sensor-co2"
    display_name TEXT,             -- "CO₂"
    unit TEXT                      -- "ppm", "°C", "µg/m³" (NOT unit_id)
);

-- Gas sensors (ppm)
INSERT INTO sensors VALUES
    (1, 'sensor-co2', 'CO₂', 'ppm'),
    (2, 'sensor-carbon_monoxide', 'CO', 'ppm'),
    (3, 'sensor-ethanol', 'Ethanol', 'ppm'),
    (4, 'sensor-ammonia', 'Ammonia', 'ppm'),
    (5, 'sensor-nitrogen_dioxide', 'NO₂', 'ppm'),
    (6, 'sensor-methane', 'Methane', 'ppm'),
    (7, 'sensor-hydrogen', 'Hydrogen', 'ppm');

-- Particulate matter
INSERT INTO sensors VALUES
    (8, 'sensor-pm__1_m_weight_concentration', 'PM 1.0', 'µg/m³'),
    (9, 'sensor-pm__2_5_m_weight_concentration', 'PM 2.5', 'µg/m³'),
    (10, 'sensor-pm__4_m_weight_concentration', 'PM 4.0', 'µg/m³'),
    (11, 'sensor-pm__10_m_weight_concentration', 'PM 10', 'µg/m³');

-- Environmental
INSERT INTO sensors VALUES
    (16, 'sensor-sen55_temperature', 'Temperature', '°C'),
    (17, 'sensor-esp_temperature', 'Temperature (ESP)', '°C'),
    (18, 'sensor-sen55_humidity', 'Humidity', '%'),
    (19, 'sensor-dps310_pressure', 'Pressure', 'hPa'),
    (20, 'sensor-sen55_voc', 'VOC Index', 'index'),
    (21, 'sensor-sen55_nox', 'NOx Index', 'index');

-- System
INSERT INTO sensors VALUES
    (22, 'sensor-rssi', 'Signal Strength', 'dBm'),
    (23, 'sensor-uptime', 'Uptime', 'seconds');

-- (See full list in old plan for all 34 sensors)
```

### 1.2 Migrate readings Table

```sql
-- Add column
ALTER TABLE readings ADD COLUMN sensor_id INTEGER REFERENCES sensors(id);
CREATE INDEX idx_readings_sensor_id ON readings(sensor_id);
CREATE INDEX idx_readings_sensor_ts ON readings(sensor_id, ts);

-- Populate
UPDATE readings 
SET sensor_id = (SELECT id FROM sensors WHERE sensors.name = readings.sensorId);

-- Verify
SELECT COUNT(*) FROM readings WHERE sensor_id IS NULL AND sensorId IS NOT NULL;
-- Should return 0
```

### 1.3 Update TypeScript Code

```typescript
// Load sensors at startup
const sensorCache = new Map<string, { sensor_id: number; unit: string | null }>();

const loadSensors = db.prepare(`SELECT id, name, unit FROM sensors`);
for (const sensor of loadSensors.all()) {
  sensorCache.set(sensor.name, { 
    sensor_id: sensor.id, 
    unit: sensor.unit 
  });
}

console.log(`📋 Loaded ${sensorCache.size} sensor mappings`);

// Updated insert
const insertReading = db.prepare(`
  INSERT INTO readings (ts, sensor_id, sensorId, value, state, eventId)
  VALUES (?, ?, ?, ?, ?, ?)
`);

// Process SSE events
function processReading(data: any, ts: number) {
  const sensorInfo = sensorCache.get(data.id);
  if (!sensorInfo) {
    console.warn(`⚠️  Unknown sensor: ${data.id}`);
    return;
  }
  
  if (isDuplicate(sensorInfo.sensor_id, data.value ?? null, data.state ?? "", ts)) {
    return;
  }
  
  insertReading.run(
    ts,
    sensorInfo.sensor_id,
    data.id,              // Keep temporarily
    data.value ?? null,
    data.state ?? "",
    ""                    // eventId doesn't exist
  );
  
  // Add to aggregation
  if (data.value !== null && data.value !== undefined) {
    addToAggregation(ts, sensorInfo.sensor_id, data.value);
  }
}

// Updated dedup
function isDuplicate(sensor_id: number, value: number | null, state: string, ts: number): boolean {
  const key = `${sensor_id}|${value}|${state}`;
  const lastSeen = dedupeCache.get(key);
  if (lastSeen && Math.abs(ts - lastSeen) < DEDUPE_WINDOW_MS) {
    return true;
  }
  dedupeCache.set(key, ts);
  return false;
}
```

---

## Phase 2: Real-Time Aggregation

### 2.1 Create Aggregated Table

```sql
CREATE TABLE readings_aggregated (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    minute_ts INTEGER NOT NULL,
    sensor_id INTEGER NOT NULL,
    avg_value REAL NOT NULL,
    min_value REAL NOT NULL,
    max_value REAL NOT NULL,
    sample_count INTEGER NOT NULL,
    UNIQUE(minute_ts, sensor_id),
    FOREIGN KEY (sensor_id) REFERENCES sensors(id)
);

CREATE INDEX idx_agg_minute_ts ON readings_aggregated(minute_ts);
CREATE INDEX idx_agg_sensor_id ON readings_aggregated(sensor_id);
CREATE INDEX idx_agg_lookup ON readings_aggregated(sensor_id, minute_ts);
```

### 2.2 Implement Aggregation

**Strategy:** Aggregate ALL data from day 1, flush every 60 seconds.

```typescript
interface MinuteAggregation {
  minute_ts: number;
  sensor_id: number;
  values: number[];
}

const aggregationBuffer = new Map<string, MinuteAggregation>();

const upsertAggregation = db.prepare(`
  INSERT INTO readings_aggregated (minute_ts, sensor_id, avg_value, min_value, max_value, sample_count)
  VALUES (?, ?, ?, ?, ?, ?)
  ON CONFLICT(minute_ts, sensor_id) DO UPDATE SET
    avg_value = ((avg_value * sample_count) + (excluded.avg_value * excluded.sample_count)) / 
                (sample_count + excluded.sample_count),
    min_value = MIN(min_value, excluded.min_value),
    max_value = MAX(max_value, excluded.max_value),
    sample_count = sample_count + excluded.sample_count
`);

function addToAggregation(ts: number, sensor_id: number, value: number) {
  const minute_ts = Math.floor(ts / 60000) * 60000;
  const key = `${sensor_id}:${minute_ts}`;
  
  let agg = aggregationBuffer.get(key);
  if (!agg) {
    agg = { minute_ts, sensor_id, values: [] };
    aggregationBuffer.set(key, agg);
  }
  agg.values.push(value);
}

// Flush every 60 seconds
setInterval(() => {
  const now = Date.now();
  const currentMinute = Math.floor(now / 60000) * 60000;
  
  const toFlush: [string, MinuteAggregation][] = [];
  for (const [key, agg] of aggregationBuffer.entries()) {
    if (agg.minute_ts < currentMinute) {
      toFlush.push([key, agg]);
    }
  }
  
  if (toFlush.length === 0) return;
  
  const transaction = db.transaction(() => {
    for (const [key, agg] of toFlush) {
      if (agg.values.length === 0) continue;
      
      const avg = agg.values.reduce((a, b) => a + b, 0) / agg.values.length;
      const min = Math.min(...agg.values);
      const max = Math.max(...agg.values);
      
      upsertAggregation.run(agg.minute_ts, agg.sensor_id, avg, min, max, agg.values.length);
      aggregationBuffer.delete(key);
    }
  });
  
  transaction();
  console.log(`📊 Flushed ${toFlush.length} minute aggregations`);
}, 60000);
```

### 2.3 Backfill Historical Data

```sql
INSERT OR IGNORE INTO readings_aggregated 
  (minute_ts, sensor_id, avg_value, min_value, max_value, sample_count)
SELECT 
  (ts / 60000) * 60000 as minute_ts,
  sensor_id,
  AVG(value) as avg_value,
  MIN(value) as min_value,
  MAX(value) as max_value,
  COUNT(*) as sample_count
FROM readings
WHERE value IS NOT NULL AND sensor_id IS NOT NULL
GROUP BY minute_ts, sensor_id;
```

---

## Phase 3: Data Retention

### 3.1 Daily Cleanup (Delete raw data >7 days)

```typescript
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const deleteOldRawReadings = db.prepare(`DELETE FROM readings WHERE ts < ?`);

const cleanupOldData = () => {
  const sevenDaysAgo = Date.now() - SEVEN_DAYS_MS;
  const result = deleteOldRawReadings.run(sevenDaysAgo);
  console.log(`🧹 Deleted ${result.changes} raw readings older than 7 days`);
};

// Run daily at 2 AM
const scheduleCleanup = () => {
  const now = new Date();
  const next2AM = new Date(now);
  next2AM.setHours(26, 0, 0, 0);
  
  const msUntil2AM = next2AM.getTime() - now.getTime();
  setTimeout(() => {
    cleanupOldData();
    setInterval(cleanupOldData, 24 * 60 * 60 * 1000);
  }, msUntil2AM);
};

scheduleCleanup();

// Run once at startup if old data exists
const oldestReading = db.prepare(`SELECT MIN(ts) as ts FROM readings`).get();
if (oldestReading?.ts && (Date.now() - oldestReading.ts) > SEVEN_DAYS_MS) {
  console.log('🧹 Running initial cleanup...');
  cleanupOldData();
}
```

### 3.2 Weekly VACUUM

```bash
#!/bin/bash
# /home/exedev/app/vacuum.sh
cd /home/exedev/app
sqlite3 db.sqlite "VACUUM;"
echo "$(date): Vacuumed" >> /var/log/air1-vacuum.log
```

Crontab: `0 3 * * 0 /home/exedev/app/vacuum.sh`

---

## Phase 4: Unified Query API

```typescript
function getReadings(since: number, until?: number): any[] {
  const now = Date.now();
  const sevenDaysAgo = now - (7 * 24 * 60 * 60 * 1000);
  const untilTs = until || now;
  const results: any[] = [];
  
  // Raw data (last 7 days, full resolution)
  if (since >= sevenDaysAgo && untilTs >= sevenDaysAgo) {
    const rawQuery = db.prepare(`
      SELECT 
        r.ts, s.name as sensorId, s.display_name as sensorName,
        r.value, s.unit
      FROM readings r
      JOIN sensors s ON r.sensor_id = s.id
      WHERE r.ts >= ? AND r.ts <= ?
      ORDER BY r.ts ASC
    `);
    results.push(...rawQuery.all(Math.max(since, sevenDaysAgo), untilTs));
  }
  
  // Aggregated data (>7 days old, minutely summaries)
  if (since < sevenDaysAgo) {
    const aggQuery = db.prepare(`
      SELECT 
        a.minute_ts as ts, s.name as sensorId, s.display_name as sensorName,
        a.avg_value as value, a.min_value, a.max_value, a.sample_count,
        s.unit, 'aggregated' as data_type
      FROM readings_aggregated a
      JOIN sensors s ON a.sensor_id = s.id
      WHERE a.minute_ts >= ? AND a.minute_ts < ?
      ORDER BY a.minute_ts ASC
    `);
    results.push(...aggQuery.all(since, Math.min(untilTs, sevenDaysAgo)));
  }
  
  return results.sort((a, b) => a.ts - b.ts);
}

// API endpoints
routes["/api/readings"] = {
  async GET(req) {
    const url = new URL(req.url);
    const since = parseInt(url.searchParams.get("since") || "0");
    const until = url.searchParams.get("until") ? parseInt(url.searchParams.get("until")!) : undefined;
    return Response.json(getReadings(since, until));
  }
};

routes["/api/stats"] = async () => {
  const stats = {
    raw_readings: db.prepare(`SELECT COUNT(*) as c FROM readings`).get().c,
    aggregated_minutes: db.prepare(`SELECT COUNT(*) as c FROM readings_aggregated`).get().c,
    oldest_raw: db.prepare(`SELECT MIN(ts) as ts FROM readings`).get().ts,
    oldest_aggregated: db.prepare(`SELECT MIN(minute_ts) as ts FROM readings_aggregated`).get().ts,
    sensors: db.prepare(`SELECT COUNT(*) as c FROM sensors`).get().c,
  };
  return Response.json(stats);
};

routes["/api/sensors"] = async () => {
  return Response.json(db.prepare(`SELECT id, name, display_name, unit FROM sensors ORDER BY id`).all());
};
```

---

## Phase 5: Schema Cleanup (Optional, after 30 days)

```sql
CREATE TABLE readings_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts INTEGER NOT NULL,
    sensor_id INTEGER NOT NULL,
    value REAL,
    FOREIGN KEY (sensor_id) REFERENCES sensors(id)
);

INSERT INTO readings_new (id, ts, sensor_id, value)
SELECT id, ts, sensor_id, value FROM readings;

DROP TABLE readings;
ALTER TABLE readings_new RENAME TO readings;

CREATE INDEX idx_readings_ts ON readings(ts);
CREATE INDEX idx_readings_sensor_id ON readings(sensor_id);
CREATE INDEX idx_readings_sensor_ts ON readings(sensor_id, ts);

VACUUM;
```

---

## Storage Projections

| Time | Raw (7d) | Aggregated | Total | vs Original |
|------|----------|------------|-------|-------------|
| Day 7 | 84 MB | 3.5 MB | 88 MB | baseline |
| Day 14 | 84 MB | 7 MB | 91 MB | -54% |
| Month 1 | 60 MB | 21 MB | 81 MB | -82% |
| Year 1 | 60 MB | 286 MB | **346 MB** | **-94%** |

**Original: 5.4 GB/year → Optimized: 346 MB/year**

---

## Implementation Checklist

### Pre-Deployment
- [ ] Backup: `cp db.sqlite db.sqlite.backup`
- [ ] Review sensor names match SSE

### Phase 1
- [ ] Create sensors table
- [ ] Populate 34 sensors
- [ ] Add sensor_id column
- [ ] Run UPDATE migration
- [ ] Update TypeScript code
- [ ] Deploy & restart
- [ ] Verify new readings have sensor_id

### Phase 2
- [ ] Create readings_aggregated
- [ ] Run backfill (may take minutes)
- [ ] Deploy aggregation code
- [ ] Restart
- [ ] Monitor logs for "Flushed X aggregations"

### Phase 3
- [ ] Deploy cleanup code
- [ ] Test manual cleanup
- [ ] Create vacuum.sh
- [ ] Add to crontab

### Phase 4
- [ ] Deploy unified query
- [ ] Test API endpoints
- [ ] Update frontend if needed

### Phase 5 (after 30 days)
- [ ] Run schema migration
- [ ] VACUUM

---

## Validation

```sql
-- Check migration
SELECT 
  COUNT(*) as total,
  COUNT(sensor_id) as migrated,
  COUNT(*) - COUNT(sensor_id) as missing
FROM readings;

-- Check aggregation coverage
SELECT 
  s.display_name,
  COUNT(*) as minutes,
  MIN(minute_ts) as oldest,
  MAX(minute_ts) as newest
FROM readings_aggregated a
JOIN sensors s ON a.sensor_id = s.id
GROUP BY s.id;

-- Check retention (should be ~7 days)
SELECT 
  julianday('now') - julianday(MIN(ts)/1000.0, 'unixepoch') as oldest_days
FROM readings;
```

---

## Key Points

✅ **Units stored as human-readable text** in sensors.unit column (NOT unit_id)  
✅ **Aggregate ALL data from day 1** (not just >7 days)  
✅ **Keep old columns during migration** for safety  
✅ **No eventId** (doesn't exist in SSE payload)  
✅ **Unified query** seamlessly switches between raw/aggregated  

---

## Rollback

```typescript
// Phase 1: Revert to old insert
const insertReading = db.prepare(`
  INSERT INTO readings (ts, sensorId, value, state, eventId)
  VALUES (?, ?, ?, ?, ?)
`);

// Full restore
// sudo systemctl stop air1-logger
// cp db.sqlite.backup db.sqlite
// sudo systemctl start air1-logger
```
