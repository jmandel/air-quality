import { serve } from "bun";
import { Database } from "bun:sqlite";
import viewerPage from "./index.html";
import uploaderPage from "./upload.html";
import askPage from "./ask.html";
import testStreamPage from "./test-stream.html";
import { SENSOR_SEED_DATA } from "./seed-data";
// Old ask-helper removed - using ask-stream-route-vega.ts now
import { getSensorMetadata, getCurrentZone } from "./sensor-utils";

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

// ==================== SERVER-SENT EVENTS (SSE) BROADCASTING ====================

interface SSEClient {
  id: string;
  controller: ReadableStreamDefaultController;
  connectedAt: number;
}

const sseClients = new Map<string, SSEClient>();

function broadcastToClients(readings: any[]) {
  if (sseClients.size === 0) return;

  const timestamp = Date.now();
  let disconnected: string[] = [];

  for (const [clientId, client] of sseClients.entries()) {
    try {
      // Send each reading as a separate "state" event (matching device format)
      for (const reading of readings) {
        // Calculate state from zone if value is present
        let state = reading.state || "";
        if (reading.value !== null && reading.value !== undefined && reading.sensorId) {
          const metadata = getSensorMetadata(reading.sensorId);
          const zone = getCurrentZone(reading.value, metadata);
          if (zone) {
            state = zone.label;
          }
        }

        const eventData = {
          id: reading.sensorId,
          value: reading.value,
          state,
          ts: reading.ts ?? Date.now(),
        };

        const message = `event: state\ndata: ${JSON.stringify(eventData)}\nid: ${reading.eventId || `${timestamp}:${reading.sensorId}`}\n\n`;
        client.controller.enqueue(new TextEncoder().encode(message));
      }
    } catch (error) {
      console.warn(`Failed to send to client ${clientId}, marking for removal`);
      disconnected.push(clientId);
    }
  }

  // Clean up disconnected clients
  for (const clientId of disconnected) {
    sseClients.delete(clientId);
    console.log(`🔌 Client ${clientId} disconnected (total: ${sseClients.size})`);
  }
}

// Periodic heartbeat to keep connections alive
setInterval(() => {
  if (sseClients.size === 0) return;

  const ping = `event: ping\ndata: ${Date.now()}\n\n`;
  const encoded = new TextEncoder().encode(ping);
  let disconnected: string[] = [];

  for (const [clientId, client] of sseClients.entries()) {
    try {
      client.controller.enqueue(encoded);
    } catch {
      disconnected.push(clientId);
    }
  }

  for (const clientId of disconnected) {
    sseClients.delete(clientId);
  }
}, 30000); // Every 30 seconds

// ==================== HTTP SERVER ====================

const server = serve({
  idleTimeout: 255,
  port: PORT,

  routes: {
    "/": viewerPage,
    "/upload": uploaderPage,
    "/ask": askPage, 
    "/ask.html": askPage,
    "/upload.html": uploaderPage,
    "/test-stream.html": testStreamPage,
    // SSE stream endpoint for remote clients
    "/api/stream": async (req) => {
      const clientId = crypto.randomUUID();
      let heartbeat: Timer | null = null;

      const cleanup = () => {
        if (heartbeat) {
          clearInterval(heartbeat);
          heartbeat = null;
        }
        sseClients.delete(clientId);
      };

      const stream = new ReadableStream({
        start(controller) {
          sseClients.set(clientId, {
            id: clientId,
            controller,
            connectedAt: Date.now(),
          });

          console.log(`🔌 Client ${clientId} connected to SSE stream (total: ${sseClients.size})`);

          // Send initial connection message
          const welcome = `event: connected\ndata: ${JSON.stringify({ clientId, timestamp: Date.now() })}\n\n`;
          controller.enqueue(new TextEncoder().encode(welcome));

          // Send periodic heartbeat to this client
          heartbeat = setInterval(() => {
            try {
              const ping = `event: ping\ndata: ${Date.now()}\n\n`;
              controller.enqueue(new TextEncoder().encode(ping));
            } catch {
              cleanup();
            }
          }, 30000);

          // Cleanup on disconnect
          req.signal.addEventListener("abort", () => {
            cleanup();
            console.log(`🔌 Client ${clientId} disconnected (total: ${sseClients.size})`);
          });
        },
        cancel() {
          // Handle client disconnect/cancel
          cleanup();
          console.log(`🔌 Client ${clientId} cancelled stream (total: ${sseClients.size})`);
        },
      });

      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache, no-store, must-revalidate",
          "Connection": "keep-alive",
          "X-Accel-Buffering": "no",
          "Access-Control-Allow-Origin": "*",
        },
      });
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
          const broadcastReadings: any[] = [];

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

              // Collect for broadcasting
              broadcastReadings.push(r);
            }
          });

          transaction(readings);

          // Broadcast new readings to connected SSE clients
          if (broadcastReadings.length > 0) {
            broadcastToClients(broadcastReadings);
          }

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
    },
    // POST /api/submit - Direct submission from ESPHome device
    "/api/submit": {
      async POST(req) {
        try {
          const data = await req.json();
          
          // Validate required fields
          if (!data.measurements) {
            return Response.json({ 
              error: "Missing required field: measurements" 
            }, { status: 400 });
          }
          // Use server time instead of device timestamp for consistency
          const timestamp = Date.now();
          // Store original device timestamp in logs for reference
          const deviceTimestamp = data.timestamp;

          // Map ESPHome JSON fields to database sensor names (1:1 mapping)
          // DB names match device JSON field names exactly
          //
          // Device JSON structure:
          //   measurements: co2_ppm, pressure_hpa, dps_temp_c, sen55_temp_c, sen55_humidity_pct,
          //                 voc_index, nox_index
          //   measurements.pm_ug_m3: pm1, pm2_5, pm4, pm10, pm0_3_to_1, pm1_to_2_5, pm2_5_to_4, pm4_to_10
          //   measurements.gases_ppm: no2, co, h2, ethanol, ch4, nh3
          //   diagnostics: esp_temp_c, wifi_rssi_dbm, uptime_s
          //
          const sensorMappings: Record<string, any> = {
            // === CO2 (SCD40 sensor) ===
            'co2_ppm': data.measurements.co2_ppm,

            // === Temperature & Humidity (SEN55 sensor) ===
            'sen55_temp_c': data.measurements.sen55_temp_c,
            'sen55_humidity_pct': data.measurements.sen55_humidity_pct,

            // === VOC & NOx Indices (SEN55 sensor) ===
            'voc_index': data.measurements.voc_index,
            'nox_index': data.measurements.nox_index,

            // === Pressure & Temperature (DPS310 barometric sensor) ===
            'pressure_hpa': data.measurements.pressure_hpa,
            'dps_temp_c': data.measurements.dps_temp_c,

            // === Particulate Matter Mass (SEN55 sensor, µg/m³) ===
            'pm1': data.measurements.pm_ug_m3?.pm1,
            'pm2_5': data.measurements.pm_ug_m3?.pm2_5,
            'pm4': data.measurements.pm_ug_m3?.pm4,
            'pm10': data.measurements.pm_ug_m3?.pm10,

            // === Particulate Matter Bins (SEN55 sensor, µg/m³) ===
            'pm0_3_to_1': data.measurements.pm_ug_m3?.pm0_3_to_1,
            'pm1_to_2_5': data.measurements.pm_ug_m3?.pm1_to_2_5,
            'pm2_5_to_4': data.measurements.pm_ug_m3?.pm2_5_to_4,
            'pm4_to_10': data.measurements.pm_ug_m3?.pm4_to_10,

            // === Gas Sensors (MICS-4514 sensor, ppm) ===
            'no2': data.measurements.gases_ppm?.no2,
            'co': data.measurements.gases_ppm?.co,
            'h2': data.measurements.gases_ppm?.h2,
            'ethanol': data.measurements.gases_ppm?.ethanol,
            'ch4': data.measurements.gases_ppm?.ch4,
            'nh3': data.measurements.gases_ppm?.nh3,

            // === System Diagnostics (ESP32) ===
            'esp_temp_c': data.diagnostics?.esp_temp_c,
            'wifi_rssi_dbm': data.diagnostics?.wifi_rssi_dbm,
            'uptime_s': data.diagnostics?.uptime_s,
          };
          let inserted = 0;
          let duplicates = 0;
          let errors = 0;
          const broadcastReadings: any[] = [];

          const transaction = db.transaction(() => {
            for (const [sensorName, value] of Object.entries(sensorMappings)) {
              // Skip if value is null, undefined, or NaN
              if (value == null || (typeof value === 'number' && isNaN(value))) {
                continue;
              }

              const sensorInfo = getSensor(sensorName);
              if (!sensorInfo) {
                console.warn(`Unknown sensor: ${sensorName}`);
                errors++;
                continue;
              }

              // Check for duplicates
              if (isDuplicate(sensorInfo.sensor_id, value, timestamp)) {
                duplicates++;
                continue;
              }

              // Insert raw reading
              insertReading.run(timestamp, sensorInfo.sensor_id, value);
              inserted++;

              // Add to aggregation
              if (value !== null && value !== undefined) {
                addToAggregation(timestamp, sensorInfo.sensor_id, value);
              }

              // Collect for broadcasting to SSE clients
              broadcastReadings.push({
                sensorId: sensorName,
                value: value,
                ts: timestamp
              });
            }
          });

          transaction();

          // Broadcast new readings to connected SSE clients
          if (broadcastReadings.length > 0) {
            broadcastToClients(broadcastReadings);
          }

          // Detailed logging for review
          const logEntry = {
            timestamp: new Date().toISOString(),
            device: data.device || 'unknown',
            fw_version: data.fw_version,
            device_timestamp_claimed: deviceTimestamp,
            server_timestamp_used: timestamp,
            inserted,
            duplicates,
            errors,
            measurements: data.measurements,
            diagnostics: data.diagnostics
          };
          
          console.log(`📥 Device submission: ${data.device || 'unknown'} - ${inserted} inserted, ${duplicates} duplicates, ${errors} errors`);
          console.log(`📋 Submission details: ${JSON.stringify(logEntry)}`);

          return Response.json({
            success: true,
            device: data.device,
            timestamp: data.timestamp,
            inserted,
            duplicates,
            errors,
            message: `Processed ${inserted + duplicates + errors} sensor readings`
          });

          return Response.json({
            success: true,
            device: data.device,
            timestamp: data.timestamp,
            inserted,
            duplicates,
            errors,
            message: `Processed ${inserted + duplicates + errors} sensor readings`
          });
        } catch (error: any) {
          console.error('Error processing device submission:', error);
          return Response.json({ error: error.message }, { status: 500 });
        }
      },
    },




    "/api/ask/stream": {
      async GET(req) {
        try {
          const { handleAskStreamVega } = await import("./ask-stream-route-vega");
          return await handleAskStreamVega(req);
        } catch (error: any) {
          console.error("Error in /api/ask/stream:", error);
          return Response.json({ 
            error: "Internal server error",
            message: error.message 
          }, { status: 500 });
        }
      }
    },
    // Non-streaming /api/ask removed - use /api/ask/stream instead


    "/api/config": async () => {
      return Response.json({
        defaultSensorUrl: DEFAULT_AIR_SENSOR_URL,
        serverTime: Date.now(),
      });
    },
  },


  async fetch(req) {
    // Try to handle ask API routes first
    const { handleAskApiRoute } = await import("./ask-api-routes");
    const askApiResponse = await handleAskApiRoute(req);
    if (askApiResponse) return askApiResponse;
    
    // Fall through to default routing
    return new Response("Not Found", { status: 404 });
  },

  development: true,
});

console.log(`🚀 Server running at http://localhost:${PORT}/`);
console.log(`👀 Viewer available at http://localhost:${PORT}/`);
console.log(`📤 Uploader available at http://localhost:${PORT}/upload.html`);
console.log(`📊 API base at http://localhost:${PORT}/api`);
console.log(`💾 Database: db.sqlite`);
console.log(`🔄 Deduplication: 10s window`);
console.log(`📦 Aggregation: Real-time minutely summaries`);
console.log(`🗄️  Retention: 7 days raw + permanent aggregates`);
