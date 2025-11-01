import { serve } from "bun";
import { Database } from "bun:sqlite";
import homepage from "./index.html";

const PORT = parseInt(process.env.PORT || "443", 10);
const DEFAULT_AIR_SENSOR_URL = process.env.AIR_SENSOR_URL || "http://10.0.0.37/";

const db = new Database("db.sqlite");

// Initialize database schema
db.run(`
  CREATE TABLE IF NOT EXISTS readings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts INTEGER NOT NULL,
    sensorId TEXT NOT NULL,
    value REAL,
    state TEXT,
    eventId TEXT
  )
`);

db.run(`
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )
`);

// Indexes for efficient queries
db.run(`CREATE INDEX IF NOT EXISTS idx_readings_ts ON readings(ts)`);
db.run(`CREATE INDEX IF NOT EXISTS idx_readings_sensorId ON readings(sensorId)`);
// Composite index for efficient deduplication queries
db.run(`CREATE INDEX IF NOT EXISTS idx_readings_dedupe ON readings(sensorId, value, state, ts)`);

// Prepared statements
const insertReading = db.prepare(`
  INSERT INTO readings (ts, sensorId, value, state, eventId)
  VALUES (?, ?, ?, ?, ?)
`);

const getReadings = db.prepare(`
  SELECT * FROM readings
  WHERE ts >= ?
  ORDER BY ts ASC
`);

const deleteOldReadings = db.prepare(`
  DELETE FROM readings WHERE ts < ?
`);

const countReadings = db.prepare(`SELECT COUNT(*) as count FROM readings`);

const getSetting = db.prepare(`SELECT value FROM settings WHERE key = ?`);

const setSetting = db.prepare(`
  INSERT INTO settings (key, value) VALUES (?, ?)
  ON CONFLICT(key) DO UPDATE SET value = excluded.value
`);

const getAllReadings = db.prepare(`SELECT * FROM readings ORDER BY id ASC`);

// Efficient deduplication query using composite index
const findDuplicate = db.prepare(`
  SELECT id FROM readings
  WHERE sensorId = ?
    AND value IS ?
    AND state = ?
    AND ts >= ?
    AND ts <= ?
  LIMIT 1
`);

// Deduplication cache: stores recent readings to avoid redundant DB writes
// Key format: "sensorId|value|state"
// Value: timestamp of last seen reading
const dedupeCache = new Map<string, number>();
const DEDUPE_WINDOW_MS = 10000; // 10 seconds

// Clean up old cache entries periodically
setInterval(() => {
  const cutoff = Date.now() - DEDUPE_WINDOW_MS;
  for (const [key, ts] of dedupeCache.entries()) {
    if (ts < cutoff) {
      dedupeCache.delete(key);
    }
  }
}, 30000); // Clean every 30 seconds

function isDuplicate(
  sensorId: string,
  value: number | null,
  state: string,
  ts: number
): boolean {
  const key = `${sensorId}|${value}|${state}`;
  
  // Check in-memory cache first (fast path)
  const lastSeen = dedupeCache.get(key);
  if (lastSeen && Math.abs(ts - lastSeen) < DEDUPE_WINDOW_MS) {
    // Duplicate found in cache
    return true;
  }
  
  // Check database for duplicates within the window (uses composite index)
  const minTs = ts - DEDUPE_WINDOW_MS;
  const maxTs = ts + DEDUPE_WINDOW_MS;
  const existing = findDuplicate.get(sensorId, value, state, minTs, maxTs);
  
  if (existing) {
    // Found in DB, update cache
    dedupeCache.set(key, ts);
    return true;
  }
  
  // Not a duplicate, record in cache
  dedupeCache.set(key, ts);
  return false;
}

const server = serve({
  port: PORT,

  routes: {
    // ** HTML imports **
    // Bundle & route index.html to "/". This uses HTMLRewriter to scan
    // the HTML for `<script>` and `<link>` tags, runs Bun's JavaScript
    // & CSS bundler on them, transpiles any TypeScript, JSX, and TSX,
    // downlevels CSS with Bun's CSS parser and serves the result.
    "/": homepage,

    // Serve and bundle sync.tsx
    "/sync.tsx": async (req) => {
      const file = Bun.file("./sync.tsx");
      return new Response(file);
    },

    // ** Sensor Proxy Endpoint **
    // Proxies EventSource connections to the local AIR-1 sensor
    // This solves mixed content (HTTPS -> HTTP) and CORS issues
    "/sensor/events": {
      async GET(req) {
        const url = new URL(req.url);
        const sensorUrl = url.searchParams.get("url") || DEFAULT_AIR_SENSOR_URL;
        
        // Clean up URL
        const targetUrl = sensorUrl.replace(/\/$/, "") + "/events";
        
        console.log(`🔄 Proxying EventSource to: ${targetUrl}`);
        
        try {
          const response = await fetch(targetUrl, {
            headers: {
              "Accept": "text/event-stream",
            },
          });
          
          if (!response.ok) {
            return new Response(`Failed to connect to sensor: ${response.statusText}`, {
              status: response.status,
            });
          }
          
          // Return the EventSource stream with proper headers
          return new Response(response.body, {
            headers: {
              "Content-Type": "text/event-stream",
              "Cache-Control": "no-cache",
              "Connection": "keep-alive",
              "X-Accel-Buffering": "no", // Disable nginx buffering if behind nginx
            },
          });
        } catch (error: any) {
          console.error(`❌ Proxy error: ${error.message}`);
          return new Response(`Failed to connect to sensor: ${error.message}`, {
            status: 503,
          });
        }
      },
    },

    // ** API endpoints **

    // POST /api/readings - Add new readings (batch)
    "/api/readings": {
      async POST(req) {
        try {
          const readings = await req.json();
          if (!Array.isArray(readings)) {
            return Response.json({ error: "Expected array of readings" }, { status: 400 });
          }

          let inserted = 0;
          let duplicates = 0;

          const transaction = db.transaction((rows) => {
            for (const r of rows) {
              // Check for duplicates
              if (isDuplicate(r.sensorId, r.value ?? null, r.state ?? "", r.ts)) {
                duplicates++;
                continue;
              }
              
              insertReading.run(r.ts, r.sensorId, r.value ?? null, r.state ?? "", r.eventId ?? "");
              inserted++;
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

      // GET /api/readings?since=<timestamp> - Get readings since timestamp
      async GET(req) {
        const url = new URL(req.url);
        const since = url.searchParams.get("since");
        const sinceMs = since ? parseInt(since) : 0;

        const readings = getReadings.all(sinceMs);
        return Response.json(readings);
      },

      // DELETE /api/readings?before=<timestamp> - Delete old readings
      async DELETE(req) {
        const url = new URL(req.url);
        const before = url.searchParams.get("before");
        if (!before) {
          return Response.json({ error: "Missing 'before' parameter" }, { status: 400 });
        }

        const beforeMs = parseInt(before);
        const result = deleteOldReadings.run(beforeMs);

        return Response.json({ success: true, deleted: result.changes });
      },
    },

    // GET /api/readings/count - Get total count
    "/api/readings/count": async (req) => {
      const result = countReadings.get() as { count: number };
      return Response.json({ count: result.count });
    },

    // GET /api/config - Get server configuration
    "/api/config": async (req) => {
      return Response.json({
        defaultSensorUrl: DEFAULT_AIR_SENSOR_URL,
      });
    },

    // GET /api/settings/:key - Get setting
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

      // PUT /api/settings/:key - Set setting
      async PUT(req) {
        const { key } = req.params;
        const value = await req.text();

        setSetting.run(key, value);

        return Response.json({ success: true });
      },
    },

    // GET /api/export/csv - Export all readings as CSV
    "/api/export/csv": async (req) => {
      const readings = getAllReadings.all() as Array<{
        ts: number;
        sensorId: string;
        value: number | null;
        state: string;
      }>;

      const lines = ["ts_ms,sensor_id,value,state"];
      for (const r of readings) {
        const state = (r.state ?? "").replace(/"/g, '""');
        lines.push(`${r.ts},${r.sensorId},${r.value ?? ""},\"${state}\"`);
      }

      return new Response(lines.join("\n"), {
        headers: {
          "Content-Type": "text/csv",
          "Content-Disposition": `attachment; filename="air1_export_${new Date().toISOString().replace(/[:.]/g, "-")}.csv"`,
        },
      });
    },
  },

  // Enable development mode for:
  // - Detailed error messages
  // - Hot reloading
  development: process.env.NODE_ENV !== "production",
});

console.log(`🚀 Server running at http://localhost:${PORT}/`);
console.log(`📊 API available at http://localhost:${PORT}/api`);
console.log(`🔄 Sensor proxy available at /sensor/events`);
console.log(`💾 Database: db.sqlite`);
console.log(`🔄 Deduplication enabled: 10s window (indexed)`);
