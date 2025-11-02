import { serve } from "bun";
import { Database } from "bun:sqlite";
import homepage from "./index.html";
import { SENSOR_SEED_DATA } from "./seed-data";

const PORT = parseInt(process.env.PORT || "443", 10);
const DEFAULT_AIR_SENSOR_URL = process.env.AIR_SENSOR_URL || "http://10.0.0.37/";
const DEDUPE_WINDOW_MS = 10000; // 10 seconds
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

const db = new Database("db.sqlite");

// ==================== SCHEMA INITIALIZATION ====================

// Sensors table - normalized sensor metadata
db.run(`
  CREATE TABLE IF NOT EXISTS sensors (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    display_name TEXT,
    unit TEXT
  )
`);

// Readings table - raw data (7-day retention)
db.run(`
  CREATE TABLE IF NOT EXISTS readings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts INTEGER NOT NULL,
    sensor_id INTEGER NOT NULL,
    value REAL,
    FOREIGN KEY (sensor_id) REFERENCES sensors(id)
  )
`);

// Aggregated readings - minutely summaries (permanent retention)
db.run(`
  CREATE TABLE IF NOT EXISTS readings_aggregated (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    minute_ts INTEGER NOT NULL,
    sensor_id INTEGER NOT NULL,
    avg_value REAL NOT NULL,
    min_value REAL NOT NULL,
    max_value REAL NOT NULL,
    sample_count INTEGER NOT NULL,
    UNIQUE(minute_ts, sensor_id),
    FOREIGN KEY (sensor_id) REFERENCES sensors(id)
  )
`);

// Settings table
db.run(`
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )
`);

// Indexes
db.run(`CREATE INDEX IF NOT EXISTS idx_readings_ts ON readings(ts)`);
db.run(`CREATE INDEX IF NOT EXISTS idx_readings_sensor_id ON readings(sensor_id)`);
db.run(`CREATE INDEX IF NOT EXISTS idx_readings_sensor_ts ON readings(sensor_id, ts)`);
db.run(`CREATE INDEX IF NOT EXISTS idx_agg_minute_ts ON readings_aggregated(minute_ts)`);
db.run(`CREATE INDEX IF NOT EXISTS idx_agg_sensor_id ON readings_aggregated(sensor_id)`);
db.run(`CREATE INDEX IF NOT EXISTS idx_agg_lookup ON readings_aggregated(sensor_id, minute_ts)`);

// ==================== SENSOR CACHE ====================

interface SensorInfo {
  sensor_id: number;
  unit: string | null;
  display_name: string | null;
}

const sensorCache = new Map<string, SensorInfo>();

// Initialize sensors from seed data
function initializeSensors() {
  const insertSensor = db.prepare(`
    INSERT OR IGNORE INTO sensors (id, name, display_name, unit)
    VALUES (?, ?, ?, ?)
  `);

  const transaction = db.transaction(() => {
    for (const sensor of SENSOR_SEED_DATA) {
      insertSensor.run(sensor.id, sensor.name, sensor.display_name, sensor.unit);
    }
  });

  transaction();
}

// Load sensors into cache
function loadSensors() {
  const sensors = db.prepare(`SELECT id, name, unit, display_name FROM sensors`).all() as Array<{
    id: number;
    name: string;
    unit: string | null;
    display_name: string | null;
  }>;

  for (const sensor of sensors) {
    sensorCache.set(sensor.name, {
      sensor_id: sensor.id,
      unit: sensor.unit,
      display_name: sensor.display_name,
    });
  }

  console.log(`📋 Loaded ${sensorCache.size} sensor mappings`);
}

// Initialize and load sensors at startup
initializeSensors();
loadSensors();

// Get sensor info (strict - no auto-registration)
function getSensor(sensorName: string): SensorInfo | null {
  const info = sensorCache.get(sensorName);
  if (!info) {
    console.warn(`⚠️  Unknown sensor: ${sensorName} - skipping reading`);
    return null;
  }
  return info;
}

// ==================== DEDUPLICATION ====================

const dedupeCache = new Map<string, number>();

function isDuplicate(sensor_id: number, value: number | null, ts: number): boolean {
  const key = `${sensor_id}|${value}`;
  const lastSeen = dedupeCache.get(key);

  if (lastSeen && Math.abs(ts - lastSeen) < DEDUPE_WINDOW_MS) {
    return true;
  }

  dedupeCache.set(key, ts);
  return false;
}

// Clean up old cache entries periodically
setInterval(() => {
  const cutoff = Date.now() - DEDUPE_WINDOW_MS;
  for (const [key, ts] of dedupeCache.entries()) {
    if (ts < cutoff) {
      dedupeCache.delete(key);
    }
  }
}, 30000);

// ==================== AGGREGATION ====================

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

// Flush aggregations every 60 seconds
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

// ==================== DATA RETENTION ====================

const deleteOldRawReadings = db.prepare(`DELETE FROM readings WHERE ts < ?`);

function cleanupOldData() {
  const sevenDaysAgo = Date.now() - SEVEN_DAYS_MS;
  const result = deleteOldRawReadings.run(sevenDaysAgo);
  console.log(`🧹 Deleted ${result.changes} raw readings older than 7 days`);

  // Reclaim disk space after deletion
  if (result.changes > 0) {
    db.run("VACUUM");
    console.log(`💾 Database vacuumed to reclaim space`);
  }
}

// Run cleanup daily at 2 AM
function scheduleCleanup() {
  const now = new Date();
  const next2AM = new Date(now);
  next2AM.setHours(2, 0, 0, 0);

  // If 2 AM already passed today, schedule for tomorrow
  if (next2AM.getTime() <= now.getTime()) {
    next2AM.setDate(next2AM.getDate() + 1);
  }

  const msUntil2AM = next2AM.getTime() - now.getTime();
  const hoursUntil = (msUntil2AM / (1000 * 60 * 60)).toFixed(1);
  console.log(`🕐 Next cleanup scheduled in ${hoursUntil} hours (at ${next2AM.toLocaleString()})`);

  setTimeout(() => {
    cleanupOldData();
    setInterval(cleanupOldData, 24 * 60 * 60 * 1000);
  }, msUntil2AM);
}

scheduleCleanup();

// ==================== PREPARED STATEMENTS ====================

const insertReading = db.prepare(`
  INSERT INTO readings (ts, sensor_id, value)
  VALUES (?, ?, ?)
`);

const getSetting = db.prepare(`SELECT value FROM settings WHERE key = ?`);

const setSetting = db.prepare(`
  INSERT INTO settings (key, value) VALUES (?, ?)
  ON CONFLICT(key) DO UPDATE SET value = excluded.value
`);

// ==================== QUERY FUNCTIONS ====================

function getReadings(since: number, until?: number): any[] {
  const now = Date.now();
  const sevenDaysAgo = now - SEVEN_DAYS_MS;
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

// ==================== HTTP SERVER ====================

const server = serve({
  port: PORT,

  routes: {
    "/": homepage,
    },

    // POST readings - store raw + aggregate
    "/api/readings": {
      async POST(req) {
        try {
          const readings = await req.json();
          if (!Array.isArray(readings)) {
            return Response.json({ error: "Expected array of readings" }, { status: 400 });
          }

          let inserted = 0;
          let duplicates = 0;

          const transaction = db.transaction((rows: any[]) => {
            for (const r of rows) {
              const sensorInfo = getSensor(r.sensorId);
              if (!sensorInfo) continue;

              // Check for duplicates
              if (isDuplicate(sensorInfo.sensor_id, r.value ?? null, r.ts)) {
                duplicates++;
                continue;
              }

              // Insert raw reading
              insertReading.run(r.ts, sensorInfo.sensor_id, r.value ?? null);
              inserted++;

              // Add to aggregation
              if (r.value !== null && r.value !== undefined) {
                addToAggregation(r.ts, sensorInfo.sensor_id, r.value);
              }
            }
          });

          transaction(readings);

          return Response.json({
            success: true,
            count: readings.length,
            inserted,
            duplicates
          });
        } catch (error: any) {
          return Response.json({ error: error.message }, { status: 500 });
        }
      },

      // GET readings - unified query (raw + aggregated)
      async GET(req) {
        const url = new URL(req.url);
        const since = parseInt(url.searchParams.get("since") || "0");
        const until = url.searchParams.get("until") ? parseInt(url.searchParams.get("until")!) : undefined;

        const readings = getReadings(since, until);
        return Response.json(readings);
      },

      // DELETE old readings
      async DELETE(req) {
        const url = new URL(req.url);
        const before = url.searchParams.get("before");
        if (!before) {
          return Response.json({ error: "Missing 'before' parameter" }, { status: 400 });
        }

        const beforeMs = parseInt(before);
        const result = deleteOldRawReadings.run(beforeMs);

        return Response.json({ success: true, deleted: result.changes });
      },
    },

    // GET reading count
    "/api/readings/count": async (req) => {
      const raw = db.prepare(`SELECT COUNT(*) as c FROM readings`).get() as { c: number };
      const agg = db.prepare(`SELECT COUNT(*) as c FROM readings_aggregated`).get() as { c: number };
      return Response.json({
        count: raw.c,
        raw_readings: raw.c,
        aggregated_minutes: agg.c,
      });
    },

    // GET server config
    "/api/config": async (req) => {
      return Response.json({
        defaultSensorUrl: DEFAULT_AIR_SENSOR_URL,
      });
    },

    // GET/PUT settings
    "/api/settings/:key": {
      async GET(req) {
        const { key } = req.params;
        const result = getSetting.get(key) as { value: string } | undefined;

        if (!result) {
          return Response.json({ error: "Not found" }, { status: 404 });
        }

        return new Response(result.value, {
          headers: { "Content-Type": "application/json" },
        });
      },

      async PUT(req) {
        const { key } = req.params;
        const value = await req.text();

        setSetting.run(key, value);

        return Response.json({ success: true });
      },
    },

    // GET all sensors
    "/api/sensors": async () => {
      const sensors = db.prepare(`SELECT id, name, display_name, unit FROM sensors ORDER BY id`).all();
      return Response.json(sensors);
    },

    // GET stats
    "/api/stats": async () => {
      const rawCount = db.prepare(`SELECT COUNT(*) as c FROM readings`).get() as { c: number };
      const aggCount = db.prepare(`SELECT COUNT(*) as c FROM readings_aggregated`).get() as { c: number };
      const oldestRaw = db.prepare(`SELECT MIN(ts) as ts FROM readings`).get() as { ts: number | null };
      const oldestAgg = db.prepare(`SELECT MIN(minute_ts) as ts FROM readings_aggregated`).get() as { ts: number | null };
      const sensorCount = db.prepare(`SELECT COUNT(*) as c FROM sensors`).get() as { c: number };

      return Response.json({
        raw_readings: rawCount.c,
        aggregated_minutes: aggCount.c,
        oldest_raw: oldestRaw.ts,
        oldest_aggregated: oldestAgg.ts,
        sensors: sensorCount.c,
      });
    },

    // Export CSV - minutely aggregated data only
    "/api/export/csv": async (req) => {
      // Query all minutely aggregated data from the beginning of time
      const aggQuery = db.prepare(`
        SELECT
          a.minute_ts as ts, s.name as sensorId, s.display_name as sensorName,
          a.avg_value, a.min_value, a.max_value, a.sample_count,
          s.unit
        FROM readings_aggregated a
        JOIN sensors s ON a.sensor_id = s.id
        ORDER BY a.minute_ts ASC, s.name ASC
      `);

      const readings = aggQuery.all();

      const lines = ["ts_ms,sensor_id,sensor_name,avg_value,min_value,max_value,sample_count,unit"];
      for (const r of readings) {
        const unit = r.unit || "";
        lines.push(`${r.ts},${r.sensorId},${r.sensorName},${r.avg_value ?? ""},${r.min_value ?? ""},${r.max_value ?? ""},${r.sample_count},${unit}`);
      }

      return new Response(lines.join("\n"), {
        headers: {
          "Content-Type": "text/csv",
          "Content-Disposition": `attachment; filename="air1_export_${new Date().toISOString().replace(/[:.]/g, "-")}.csv"`,
        },
      });
    },
  },

  development: process.env.NODE_ENV !== "production",
});

console.log(`🚀 Server running at http://localhost:${PORT}/`);
console.log(`📊 API available at http://localhost:${PORT}/api`);
console.log(`💾 Database: db.sqlite`);
console.log(`🔄 Deduplication: 10s window`);
console.log(`📦 Aggregation: Real-time minutely summaries`);
console.log(`🗄️  Retention: 7 days raw + permanent aggregates`);
