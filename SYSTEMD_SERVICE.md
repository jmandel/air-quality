# Systemd Service Setup

The AIR-1 Logger runs as a systemd service on port 443 with automatic file watching and restart capabilities.

## Service Configuration

**File:** `/etc/systemd/system/air1-logger.service`

**Key Features:**
- Runs on port 443 (HTTP only - TLS termination handled by exe.dev proxy)
- Auto-reloads on file changes (using `bun run --watch`)
- Automatic restart on failure
- Runs as `exedev` user with minimal permissions
- Logs to systemd journal

## Service Management

### Check Status
```bash
sudo systemctl status air1-logger
```

### View Logs
```bash
# Real-time logs
sudo journalctl -u air1-logger -f

# Last 100 lines
sudo journalctl -u air1-logger -n 100

# Logs since today
sudo journalctl -u air1-logger --since today
```

### Restart Service
```bash
sudo systemctl restart air1-logger
```

### Stop Service
```bash
sudo systemctl stop air1-logger
```

### Start Service
```bash
sudo systemctl start air1-logger
```

### Disable Service
```bash
sudo systemctl disable air1-logger
```

## Auto-Reload Feature

The service uses `bun run --watch index.ts` which automatically:
- Watches for changes in:
  - `index.ts`
  - `sync.tsx`
  - `index.html`
  - Any imported files
- Reloads the server when files change
- No manual restart needed during development!

## File Changes

To make changes:
1. Edit files in `/home/exedev/app/`
2. Save the file
3. Service automatically reloads (watch the logs!)

```bash
# Watch for auto-reload in action
sudo journalctl -u air1-logger -f
# Then edit a file and save
```

## Port 443 Configuration

The service runs on port 443 using capabilities:
- `AmbientCapabilities=CAP_NET_BIND_SERVICE` allows non-root user to bind to port 443
- HTTP only (no TLS) - exe.dev proxy handles TLS termination
- Accessible at: `https://joshair.exe.dev/` (after proxy configuration)

## Security Features

- **NoNewPrivileges**: Prevents privilege escalation
- **PrivateTmp**: Isolated /tmp directory
- **ProtectSystem**: Read-only system directories
- **ProtectHome**: Read-only home directory (except /home/exedev/app)
- **ReadWritePaths**: Only /home/exedev/app is writable

## Environment Variables

Set in the service file:
```ini
Environment="PORT=443"
Environment="NODE_ENV=production"
```

To modify, edit `/etc/systemd/system/air1-logger.service` and reload:
```bash
sudo systemctl daemon-reload
sudo systemctl restart air1-logger
```

## Troubleshooting

### Service won't start
```bash
# Check for errors
sudo journalctl -u air1-logger -n 50

# Check if port 443 is already in use
sudo lsof -i :443

# Check file permissions
ls -la /home/exedev/app/
```

### Auto-reload not working
```bash
# Check that --watch flag is present
systemctl cat air1-logger | grep ExecStart

# Verify bun version supports --watch
/home/exedev/.bun/bin/bun --version
```

### Database locked errors
```bash
# Check if multiple instances are running
ps aux | grep bun

# Stop all and restart service
sudo pkill bun
sudo systemctl restart air1-logger
```

## Performance Monitoring

```bash
# Memory usage
sudo systemctl status air1-logger | grep Memory

# CPU usage
sudo systemctl status air1-logger | grep CPU

# Full stats
sudo systemd-cgtop -n 1 | grep air1-logger
```

## Backup and Maintenance

### Backup Database
```bash
cp /home/exedev/app/db.sqlite /home/exedev/backups/db-$(date +%F).sqlite
```

### Database Size
```bash
du -h /home/exedev/app/db.sqlite
```

### Check Database Integrity
```bash
sqlite3 /home/exedev/app/db.sqlite "PRAGMA integrity_check;"
```

## Indexes and Performance

The database uses composite indexes for efficient queries:

```sql
-- View indexes
SELECT name, sql FROM sqlite_master WHERE type='index';

-- Deduplication index (most important)
idx_readings_dedupe: (sensorId, value, state, ts)

-- Query plan verification
EXPLAIN QUERY PLAN 
SELECT id FROM readings 
WHERE sensorId = 'sensor-test'
  AND value IS 42.5
  AND state = 'ok'
  AND ts >= 1000000
  AND ts <= 2000000;
```

Expected: `SEARCH readings USING COVERING INDEX idx_readings_dedupe`

## Service File Reference

Full service file:
```ini
[Unit]
Description=AIR-1 Logger Web Application
After=network.target

[Service]
Type=simple
User=exedev
Group=exedev
WorkingDirectory=/home/exedev/app
Environment="PORT=443"
Environment="NODE_ENV=production"
ExecStart=/home/exedev/.bun/bin/bun run --watch index.ts
Restart=always
RestartSec=3
StandardOutput=journal
StandardError=journal
SyslogIdentifier=air1-logger

# Security settings
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=read-only
ReadWritePaths=/home/exedev/app

# Allow binding to port 443
AmbientCapabilities=CAP_NET_BIND_SERVICE

[Install]
WantedBy=multi-user.target
```
