# AIR Quality Logger Deployment

## Overview

This VM hosts the AIR-1 air quality logger application with direct ESPHome device support.

## Directory Structure

```
/home/exedev/
├── app/                          # Main application (git working directory)
│   ├── .git/                    # Git repository
│   ├── index.ts                 # Main server
│   ├── index.html / viewer.ts   # Main viewer page
│   ├── ask.html / ask.ts        # Ask/query page with dashboards
│   ├── upload.html / uploader.ts # Upload page
│   ├── db.sqlite                # SQLite database
│   └── *.md                     # Documentation
└── src/
    └── airq.bare/               # Bare git repo for push/pull
```

**All development and changes happen in `/home/exedev/app/`**

## Access URLs

- **Viewer**: http://air443.exe.dev:3000/
- **Ask Page**: http://air443.exe.dev:3000/ask
- **Uploader**: http://air443.exe.dev:3000/upload.html
- **API**: http://air443.exe.dev:3000/api/

## Features

### Direct ESPHome Submission

The logger supports direct submissions from ESPHome devices via the `/api/submit` endpoint.

**ESPHome Configuration**: See [app/API_SUBMIT.md](../app/API_SUBMIT.md)

### Natural Language Query Interface

Ask questions about your air quality data and get interactive dashboard responses with:
- **Text tiles**: Info/warning/success/error messages
- **Metric tiles**: Giant numeric displays with status colors and trends
- **Chart tiles**: Interactive Chart.js visualizations with threshold annotations

**Try it**: http://air443.exe.dev:3000/ask

### Real-time Viewer

Live dashboard showing all 23 sensors with automatic updates via Server-Sent Events.

**Access**: http://air443.exe.dev:3000/

## Service Management

```bash
# Status
sudo systemctl status air1-logger

# Logs
sudo journalctl -u air1-logger -f

# Restart
sudo systemctl restart air1-logger
```

## Development Workflow

### Making Changes

```bash
# Work in the app directory
cd /home/exedev/app

# Edit files
vim index.ts  # or ask.ts, viewer.ts, etc.

# Service auto-reloads via --watch

# Commit changes
git add <files>
git commit -m "Description"
git push
```

### Deployment from Remote

```bash
# Push changes to bare repo
git push exedev@exe.dev:src/airq.bare master

# On VM: Pull changes into app/
cd /home/exedev/app
git pull

# Service auto-reloads
```

## Technical Details

- **Service**: `air1-logger.service`
- **Port**: 3000
- **Runtime**: Bun v1.3.2+
- **Database**: SQLite at `/home/exedev/app/db.sqlite`
- **Working Directory**: `/home/exedev/app/`
- **Architecture**: TypeScript modules with Bun bundling

### Features

✅ Direct ESPHome device submissions
✅ Natural language query interface with dashboards
✅ Browser-based SSE uploader
✅ Real-time viewer dashboard
✅ 10-second deduplication window
✅ Automatic aggregation
✅ 7-day raw data + permanent aggregates
✅ Auto-reload on code changes
✅ 23 sensors tracked (CO₂, PM, VOC, NOx, gases, etc.)

## API Endpoints

- `POST /api/submit` - Direct ESPHome device submissions
- `POST /api/readings` - Batch readings from browser uploader
- `GET /api/readings` - Query historical data
- `GET /api/stream` - Server-Sent Events for live updates
- `GET /api/config` - Configuration data
- `GET /api/ask?q=question` - Natural language queries

## Documentation

All documentation is in `/home/exedev/app/`:

- **API_SUBMIT.md** - ESPHome submission endpoint
- **API_ASK.md** - Natural language query API
- **DASHBOARD_TILES.md** - Dashboard tile schema and examples
- **DASHBOARD_SCHEMA.md** - Complete TypeScript interfaces
- **SHELLEY_INTEGRATION.md** - LLM integration architecture
- **SENSOR_MAPPING.md** - Sensor name mappings
- **README.md** - Full application documentation
- **README_OPTIMIZATION.md** - Performance notes
- **REMOTE_ACCESS.md** - Remote access setup

## Git Remotes

The bare repo at `/home/exedev/src/airq.bare` serves as the central repository:

```bash
# From your local machine
git remote add air443 exedev@exe.dev:src/airq.bare
git push air443 master

# Clone fresh
git clone exedev@exe.dev:src/airq.bare airq
```
