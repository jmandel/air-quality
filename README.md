# AIR-1 Logger

Local logger and dashboard for Apollo AIR-1 air quality sensor.

## Features

- 📤 Dedicated uploader page (`upload.html`) that relays SSE data from the local AIR-1 device to the server
- 👀 Lightweight viewer at `/` with curated defaults, live charts, and inline sensor selection (no modal hopping)
- 🤖 **Natural language query interface** (`/ask`) - ask questions about your data in plain English
  - Powered by Claude AI via Shelley
  - Generates custom analysis scripts on-the-fly
  - Interactive dashboards with charts, metrics, and trends
  - **Fully sandboxed execution** (bubblewrap) for security
- 📡 Server-Sent Events (SSE) for both ingestion and playback
- 💾 SQLite storage with deduplication and minute-level aggregation for long-term history
- 🔁 Automatic cleanup of raw readings after seven days while keeping aggregates
- ⚡ Built with Bun and TypeScript (no separate build step)
- 🔒 **Secure by design** - sandboxed code execution, read-only database access

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
- `POST /api/submit` — **Direct submission from ESPHome devices** (see [API_SUBMIT.md](API_SUBMIT.md))
- `POST /api/readings` — Batch ingest readings from the uploader with deduplication
- `GET /api/readings?since=<ms>[&until=<ms>]` — Retrieve historical readings (raw or aggregated)
- `GET /api/stream` — Server-Sent Events stream of new readings for viewers
- `GET /api/config` — Viewer/uploader bootstrap data (e.g., default device URL)

### Natural Language Queries (Ask Feature)
- `GET /api/ask/stream?q=<query>` — SSE stream for query processing (sandboxed)
- `GET /api/ask/history` — List all saved queries
- `GET /api/ask/history/:id` — Retrieve specific query result
- `DELETE /api/ask/history/:id` — Delete saved query
- `PATCH /api/ask/history/:id` — Star/unstar query

See [Natural Language Query Interface](#natural-language-query-interface-ask-feature) section below for details.

## Natural Language Query Interface (Ask Feature)

The app includes an intelligent query interface that lets you ask questions about your air quality data in natural language. Powered by Claude AI via Shelley, it generates custom TypeScript scripts to analyze your data and presents results in interactive dashboards.

### Key Features

- **Natural Language Queries**: Ask questions like "What's the current CO2 level?" or "Show me PM2.5 trends over the last 6 hours"
- **Interactive Dashboards**: Results displayed as metric tiles, text summaries, and Chart.js visualizations
- **Real-time Script Generation**: Shelley AI generates custom analysis scripts for each query
- **Query Caching**: Previously generated scripts are cached for faster responses
- **History**: All queries saved with star/delete functionality

### How It Works

```
User Query → Shelley AI → TypeScript Script → Execute → Dashboard
```

1. **User submits query** via `/ask` page
2. **Shelley generates script** that queries the database and outputs JSON
3. **Script executes** and returns dashboard data (metrics, charts, text)
4. **Frontend renders** interactive dashboard with Chart.js
5. **Results cached** for future identical queries

Example query flow:
```
Q: "What is the current CO2 level?"

→ Shelley generates: analyze.ts
   - Queries most recent CO2 reading from database
   - Calculates trend vs 1 hour ago
   - Determines status (good/warning/critical)
   - Outputs JSON with metric tile

→ Frontend displays:
   ┌─────────────────────┐
   │ Current CO₂         │
   │   858 ppm           │
   │   WARNING           │
   │   ↑ 8.3% vs 1h ago  │
   └─────────────────────┘
```

### Sandboxed Execution (Security)

**ALL code generation and execution runs in isolated sandboxes** using bubblewrap (the same technology that powers Flatpak). This provides strong security guarantees:

#### Shelley Script Generation Sandbox
When Shelley generates analysis scripts, it runs in an isolated environment:

```bash
bwrap (bubblewrap)
├── /usr, /lib, /bin (read-only system files)
├── /etc/resolv.conf, /etc/ssl (DNS & SSL for API calls)
├── /work/ (temporary directory for generated scripts)
└── Network: ENABLED (needs to call Claude API)
```

**Isolation guarantees:**
- ✅ Can call Claude API to generate scripts
- ✅ Can write scripts to `/work/analyze.ts`
- ❌ Cannot access `/home`, `/root`, or system files
- ❌ Cannot modify system configuration
- ❌ Dies automatically if parent process dies

#### Script Execution Sandbox
Generated scripts run in an even more restricted sandbox:

```bash
bwrap (bubblewrap)
├── /usr, /lib, /bin (read-only system files)
├── /bun/ (Bun runtime, read-only)
├── /db/db.sqlite (database, READ-ONLY, direct mount)
├── /work/ (temporary directory for script & outputs)
└── Network: DISABLED (no outbound connections)
```

**Isolation guarantees:**
- ✅ Can read database (mounted read-only at `/db/db.sqlite`)
- ✅ Can write to temporary `/work/` directory
- ✅ Can use Bun runtime and system libraries
- ❌ Cannot modify database (read-only mount)
- ❌ Cannot access network (--unshare-net)
- ❌ Cannot access `/home`, `/root`, `/etc/shadow`
- ❌ Cannot write to system directories
- ❌ Cannot survive parent process death

#### Performance Impact

The sandboxing adds minimal overhead:

| Operation | Time | Notes |
|-----------|------|-------|
| Sandbox setup | ~10ms | Bubblewrap namespace creation |
| DB mount | ~0ms | Direct read-only bind mount (no copy!) |
| Shelley generation | ~8-20s | Unchanged (Claude API latency) |
| Script execution | ~40-60ms | Unchanged (query complexity) |
| **Total overhead** | **~10ms** | **Negligible!** |

**Key optimization:** The database is mounted directly via read-only bind mount (`--ro-bind`), not copied. This means zero overhead regardless of database size (works equally fast with 2 MB or 200 MB databases).

#### Implementation Details

**Files:**
- `bubblewrap-sandbox.ts` - Core sandbox module
  - `runShelleyInSandbox()` - Generate scripts in isolation
  - `runInSandbox()` - Execute scripts in isolation
  - `createShelleyConfig()` - Fresh token per request
- `ask-stream-sandbox.ts` - Sandboxed streaming execution
- `ask-stream-route-sandbox.ts` - Sandboxed route handler

**Security features:**
- Fresh authentication token generated per request (no reuse)
- Token embedded in sandbox-only config file
- Scripts cannot access token or credentials
- Automatic cleanup of temporary files
- Timeout protection (180s generation, 30s execution)

**Testing:**
See `test-sandbox/` directory for comprehensive tests:
- Basic bubblewrap functionality
- Bun execution in sandbox
- Shelley execution with API calls
- Full cycle: generation + execution + DB access
- Filesystem isolation verification

**Documentation:**
- [SANDBOX_INTEGRATION.md](SANDBOX_INTEGRATION.md) - Production integration guide
- [SANDBOX_SUMMARY.md](SANDBOX_SUMMARY.md) - Development summary
- [test-sandbox/README.md](test-sandbox/README.md) - Test implementation

#### Rollback Plan

If issues arise, the sandboxed version can be quickly disabled:

```bash
cd ~/app
git revert HEAD  # Reverts to unsandboxed version
sudo systemctl restart air1-logger
```

The unsandboxed version still works but lacks the security isolation.

### Dashboard Tiles

The ask feature supports three types of dashboard tiles:

#### 1. Metric Tiles
Large numeric displays with status and trend:
```typescript
{
  type: "metric",
  title: "Current CO₂",
  value: 858,
  unit: "ppm",
  status: "warning",  // good | warning | critical
  trend: {
    direction: "up",  // up | down | stable
    percentage: 8.3,
    period: "vs 1h ago"
  }
}
```

#### 2. Chart Tiles
Interactive Chart.js visualizations with threshold lines:
```typescript
{
  type: "chart",
  title: "CO₂ - Last 6 Hours",
  chartType: "line",  // line | bar | area
  xAxis: { label: "Time", type: "time" },
  yAxis: { label: "Concentration", unit: "ppm" },
  series: [{
    name: "CO₂",
    color: "#f59e0b",
    data: [
      { x: "2025-11-16T10:00:00Z", y: 750 },
      { x: "2025-11-16T11:00:00Z", y: 820 },
      // ...
    ]
  }],
  annotations: [{
    type: "threshold",
    value: 800,
    label: "Warning Threshold",
    color: "#f59e0b"
  }]
}
```

**Chart features:**
- Thick lines (3px) for visibility
- Large, bold axis labels (16pt)
- Threshold annotations with colored labels
- No animations (instant rendering)
- Hover tooltips
- Legend with large text

#### 3. Text Tiles
Formatted text with color coding:
```typescript
{
  type: "text",
  title: "Air Quality Status",
  content: "The air quality is **good** right now. All sensors are reporting normal values.",
  variant: "success"  // info | warning | success | error
}
```

### API Endpoints

#### Stream API (SSE)
```
GET /api/ask/stream?q=<query>
```

Server-Sent Events stream with real-time progress:
- `status` - Progress messages
- `shelley_progress` - Script generation updates
- `script_created` - Script generated successfully
- `script_complete` - Script executed successfully
- `result` - Dashboard data (JSON)
- `saved` - Query saved to history
- `error` - Error messages

Example:
```javascript
const eventSource = new EventSource(
  `/api/ask/stream?q=${encodeURIComponent("what is current co2")}`
);

eventSource.addEventListener('result', (e) => {
  const dashboard = JSON.parse(e.data);
  renderDashboard(dashboard);
});
```

#### History API
```
GET /api/ask/history
GET /api/ask/history/:id
DELETE /api/ask/history/:id
PATCH /api/ask/history/:id (star/unstar)
```

### Query Examples

Try these queries:

**Current Status:**
- "What is the current CO2 level?"
- "Is the air quality good right now?"
- "Show me current PM2.5"

**Trends:**
- "Show CO2 trends over the last 6 hours"
- "How has temperature changed today?"
- "Compare PM2.5 levels now vs yesterday"

**Analysis:**
- "What's the average CO2 level today?"
- "Show me all sensors that are above warning levels"
- "When was the last time CO2 was critical?"

**Charts:**
- "Chart all air quality metrics for the last hour"
- "Show me a graph of VOC levels today"
- "Plot temperature and humidity together"

### Configuration

The ask feature is configured in the main server (`index.ts`):

```typescript
"/api/ask/stream": {
  async GET(req) {
    const { handleAskStreamSandboxed } = await import("./ask-stream-route-sandbox");
    return await handleAskStreamSandboxed(req);
  }
}
```

Database schema is passed to Shelley in the prompt:
- Sensor table structure
- Readings table structure (ts in milliseconds)
- Available sensors with thresholds
- Current time for temporal queries

### Troubleshooting

#### Sandboxing Issues

If queries fail with sandbox errors:

```bash
# Check bwrap is setuid
ls -l /usr/bin/bwrap
# Should show: -rwsr-xr-x (note the 's')

# If not, enable setuid
sudo chmod u+s /usr/bin/bwrap

# Test basic sandbox
bwrap --ro-bind /usr /usr --ro-bind /lib /lib \
  --proc /proc --dev /dev --tmpfs /tmp \
  /bin/echo "Sandbox works!"
```

#### Script Generation Fails

```bash
# Check Shelley logs
sudo journalctl -u air1-logger | grep -i shelley

# Check token generation
sudo /usr/local/bin/generate-gateway-token

# Test manual Shelley call
shelley -config /exe.dev/shelley.json prompt "test query"
```

#### Database Access Issues

```bash
# Verify database exists and is readable
ls -l /home/exedev/app/db.sqlite

# Check database integrity
sqlite3 /home/exedev/app/db.sqlite "PRAGMA integrity_check;"

# Verify sensors table
sqlite3 /home/exedev/app/db.sqlite "SELECT COUNT(*) FROM sensors;"
```

#### Query Cache Issues

Clear cached queries:
```bash
rm -rf /home/exedev/app/asked/
```

Or delete individual cached queries via the web UI.


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

### Data Collection & Monitoring

1. `upload.html` opens an SSE connection to the local AIR-1 device (`/events`) and buffers readings in the browser.
2. The uploader flushes batches to `POST /api/readings`, where the backend deduplicates, stores, and aggregates the data in SQLite.
3. `index.html` (the viewer) fetches recent history once and stays current by subscribing to the server's `/api/stream` SSE endpoint.
4. Background jobs retain seven days of raw readings and keep aggregated minute summaries indefinitely.

### Natural Language Queries (Ask Feature)

1. User submits a natural language question via `/ask` page (e.g., "What's the current CO2 level?")
2. **Shelley AI generates a custom TypeScript script** (sandboxed with bubblewrap)
   - Runs in isolated environment with network access (needs Claude API)
   - Writes analysis script to temporary `/work/` directory
   - Cannot access system files or sensitive data
3. **Generated script executes** (sandboxed with bubblewrap)
   - Runs in isolated environment with NO network access
   - Database mounted read-only at `/db/db.sqlite` (direct mount, zero copy)
   - Queries data and outputs JSON dashboard specification
   - Cannot modify database or access system files
4. **Frontend renders dashboard** with interactive charts, metrics, and text tiles
5. **Query cached** for faster future responses to identical questions

All code generation and execution is fully sandboxed for security. See [Natural Language Query Interface](#natural-language-query-interface-ask-feature) section above for details.

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
