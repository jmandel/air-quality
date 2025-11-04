# AIR-1 Logger

Local logger and dashboard for Apollo AIR-1 air quality sensor.

## Features

- 📤 Dedicated uploader page (`upload.html`) that relays SSE data from the local AIR-1 device to the server
- 👀 Lightweight viewer at `/` with curated defaults, live charts, and inline sensor selection (no modal hopping)
- 📡 Server-Sent Events (SSE) for both ingestion and playback
- 💾 SQLite storage with deduplication and minute-level aggregation for long-term history
- 🔁 Automatic cleanup of raw readings after seven days while keeping aggregates
- ⚡ Built with Bun and TypeScript (no separate build step)

## Quick Start

```bash
# Install dependencies
bun install

# Start the server (development)
bun run dev

# Or with custom configuration
PORT=8080 AIR_SENSOR_URL=http://apollo-air-1.local/ bun run dev
```

On first launch the server creates `db.sqlite` automatically—no database file needs to be checked in.

Open http://localhost:3000/upload.html to start uploading from the device, and http://localhost:3000/ to monitor readings.

## Production Deployment

### Systemd Service

The app can run as a systemd service on port 443:

```bash
# Service is configured in /etc/systemd/system/air1-logger.service
sudo systemctl start air1-logger
sudo systemctl enable air1-logger  # Auto-start on boot
sudo systemctl status air1-logger

# View logs
sudo journalctl -u air1-logger -f
```

### Auto-Reload

The service uses `bun run --watch` for automatic reloading when files change:
- Watches: `index.ts`, `index.html`, `upload.html`, `viewer.ts`, `uploader.ts`
- No manual restart needed after editing code
- Graceful restarts with zero downtime

## Environment Variables

Create a `.env` file or set in systemd service:

- `PORT` - Server port (default: 3000, production: 443)
- `AIR_SENSOR_URL` - Default AIR-1 sensor URL (default: http://10.0.0.37/)
- `NODE_ENV` - Environment (development/production)

## Key Features

### Deduplication

Prevents duplicate readings when multiple browser tabs stream the same sensor data:
- **Time Window**: 10 seconds (configurable via `DEDUPE_WINDOW_MS` in `index.ts`)
- **Logic**: Readings with same `sensorId`, `value`, and `state` within window are dropped
- **Performance**: Two-tier system (in-memory cache + indexed database fallback)
- **API Response**: Returns `inserted` and `duplicates` counts

Example API response:
```json
{
  "success": true,
  "count": 10,
  "inserted": 7,
  "duplicates": 3
}
```

### Historical Data

- The viewer bootstraps with a recent history window from SQLite so charts are not required
- Minute-level aggregates backfill older ranges automatically
- Works even when the device is offline (so long as an uploader has populated data)
- Indexed queries keep lookups fast even with long retention

## API Endpoints

### Readings
- `POST /api/readings` — Batch ingest readings from the uploader with deduplication
- `GET /api/readings?since=<ms>[&until=<ms>]` — Retrieve historical readings (raw or aggregated)
- `GET /api/stream` — Server-Sent Events stream of new readings for viewers
- `GET /api/config` — Viewer/uploader bootstrap data (e.g., default device URL)

## Database

SQLite database with optimized indexes:

```sql
-- Timestamp index (time-range queries)
CREATE INDEX idx_readings_ts ON readings(ts);

-- Sensor ID index (per-sensor queries)
CREATE INDEX idx_readings_sensorId ON readings(sensorId);

-- Composite deduplication index (COVERING INDEX for fast lookups)
CREATE INDEX idx_readings_dedupe ON readings(sensorId, value, state, ts);
```

Query performance: O(log n) with indexes vs O(n) without.

## Service Management

### Quick Commands

```bash
# Check service status
sudo systemctl status air1-logger

# View real-time logs
sudo journalctl -u air1-logger -f

# Restart (if needed, but auto-reload should handle most changes)
sudo systemctl restart air1-logger

# Test API
curl "http://localhost:443/api/readings?since=$(($(date +%s)*1000 - 3600000))"

# Check database
sqlite3 ~/app/db.sqlite "SELECT COUNT(*) FROM readings;"
```

### Security Hardening

The systemd service includes security features:
- `NoNewPrivileges=true` - No privilege escalation
- `PrivateTmp=true` - Isolated temp directory
- `ProtectSystem=strict` - Read-only system files
- `ProtectHome=read-only` - Limited home access
- `ReadWritePaths=/home/exedev/app` - Only app directory writable
- `CAP_NET_BIND_SERVICE` - Bind to port 443 without root

## Project Structure

```
.
├── index.ts            # Bun + SQLite backend and SSE API
├── index.html          # Viewer page (live dashboard)
├── upload.html         # Uploader page (device bridge)
├── viewer.ts           # Client script for the viewer
├── uploader.ts         # Client script for the uploader
├── seed-data.ts        # Sensor metadata and ids
├── db.sqlite           # SQLite database (auto-created)
└── package.json        # Dependencies
```

## How It Works

1. `upload.html` opens an SSE connection to the local AIR-1 device (`/events`) and buffers readings in the browser.
2. The uploader flushes batches to `POST /api/readings`, where the backend deduplicates, stores, and aggregates the data in SQLite.
3. `index.html` (the viewer) fetches recent history once and stays current by subscribing to the server's `/api/stream` SSE endpoint.
4. Background jobs retain seven days of raw readings and keep aggregated minute summaries indefinitely.

## Development

### Local Development
- Uses Bun's automatic bundling and hot reloading
- Changes to `index.html`, `upload.html`, `viewer.ts`, or `uploader.ts` trigger automatic reloads
- TypeScript modules are transpiled on-the-fly
- No build step required

### Production Changes
- Edit files in `/home/exedev/app/`
- Service automatically reloads (via `--watch` flag)
- Watch reload in logs: `sudo journalctl -u air1-logger -f`

## Performance Metrics

- **Deduplication**: 67% fewer database writes with 3 tabs open
- **Cache hit**: <1ms (in-memory)
- **Cache miss**: ~5ms (indexed database lookup)
- **Historical load**: <100ms for 6-hour window (~420 readings)
- **Auto-reload**: ~100-200ms restart time

## Troubleshooting

### Service Issues
```bash
# Check if running
sudo systemctl is-active air1-logger

# Recent errors
sudo journalctl -u air1-logger --since "5 minutes ago" | grep -i error

# Port listening
sudo lsof -i :443
```

### Sensor Connection
```bash
# Test sensor directly
curl http://10.0.0.37/
```

### Database Issues
```bash
# Integrity check
sqlite3 ~/app/db.sqlite "PRAGMA integrity_check;"

# Verify indexes
sqlite3 ~/app/db.sqlite ".indexes readings"
```
