# AIR-1 Logger

Local logger and dashboard for Apollo AIR-1 air quality sensor.

## Features

- 📊 Real-time sensor data streaming via Server-Sent Events (SSE)
- 💾 SQLite database for persistent storage
- 📈 Live charts with Chart.js
- 📥 CSV export
- 🔧 Configurable retention policy
- 🔄 Automatic deduplication (prevents redundant data from multiple tabs)
- ⚡ Built with Bun, TypeScript, and React

## Quick Start

```bash
# Install dependencies
bun install

# Start the server
bun run dev

# Or with custom configuration
PORT=8080 AIR_SENSOR_URL=http://apollo-air-1.local/ bun run dev
```

Open http://localhost:3000 in your browser.

## Environment Variables

Create a `.env` file (see `.env.example`):

- `PORT` - Server port (default: 3000)
- `AIR_SENSOR_URL` - Default AIR-1 sensor URL (default: http://10.0.0.37/)

## Deduplication

The app automatically prevents duplicate readings when multiple browser tabs are streaming the same sensor data. See [DEDUPLICATION.md](./DEDUPLICATION.md) for details.

**TL;DR**: Readings with the same `sensorId`, `value`, and `state` within a 10-second window are silently dropped.

## API Endpoints

### Readings
- `POST /api/readings` - Add sensor readings (batch)
  - Returns: `{success, count, inserted, duplicates}`
- `GET /api/readings?since=<timestamp>` - Get readings since timestamp
- `GET /api/readings/count` - Get total reading count
- `DELETE /api/readings?before=<timestamp>` - Delete old readings

### Settings
- `GET /api/settings/:key` - Get setting value
- `PUT /api/settings/:key` - Set setting value

### Config
- `GET /api/config` - Get server configuration

### Export
- `GET /api/export/csv` - Export all readings as CSV

## Project Structure

```
.
├── index.ts            # Backend API server (Bun + SQLite)
├── sync.tsx            # React frontend application
├── index.html          # HTML entry point
├── db.sqlite           # SQLite database (auto-created)
├── DEDUPLICATION.md    # Deduplication feature documentation
└── package.json        # Dependencies
```

## How It Works

1. The React app connects to your AIR-1 sensor via Server-Sent Events (SSE)
2. Sensor readings are buffered in memory and periodically flushed to the backend
3. The backend stores readings in SQLite with automatic:
   - Deduplication (10-second window)
   - Retention policy (configurable days)
4. Charts update in real-time, showing data from the selected time window
5. All settings (device URL, retention, chart window, selected sensors) are persisted

## Development

The app uses Bun's automatic bundling and hot reloading:
- Changes to `sync.tsx` or `index.html` trigger automatic reloads
- TypeScript and JSX are transpiled on-the-fly
- No build step required!
