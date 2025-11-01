# Quick Reference - AIR-1 Logger

## 🚀 Quick Commands

### Service Control
```bash
# Check status
sudo systemctl status air1-logger

# View real-time logs
sudo journalctl -u air1-logger -f

# Restart service (rarely needed)
sudo systemctl restart air1-logger

# Stop service
sudo systemctl stop air1-logger

# Start service
sudo systemctl start air1-logger
```

### File Editing (Auto-Reload)
```bash
# Edit backend
nano ~/app/index.ts
# Save - service auto-reloads!

# Edit frontend
nano ~/app/sync.tsx
# Save - service auto-reloads!

# Watch reload happen
sudo journalctl -u air1-logger -f
```

### Database Queries
```bash
# Total readings
sqlite3 ~/app/db.sqlite "SELECT COUNT(*) FROM readings;"

# Readings in last hour
sqlite3 ~/app/db.sqlite "SELECT COUNT(*) FROM readings WHERE ts > $(date +%s000) - 3600000;"

# Readings by sensor
sqlite3 ~/app/db.sqlite "SELECT sensorId, COUNT(*) FROM readings GROUP BY sensorId;"

# Database size
du -h ~/app/db.sqlite
```

### API Testing
```bash
# Test API
curl http://localhost:443/api/config | jq

# Get historical data (last 6 hours)
curl "http://localhost:443/api/readings?since=$(($(date +%s000) - 21600000))" | jq 'length'

# Get reading count
curl http://localhost:443/api/readings/count | jq

# Test deduplication
curl -X POST http://localhost:443/api/readings \
  -H "Content-Type: application/json" \
  -d '[{"ts":1234567890,"sensorId":"test","value":42,"state":"ok"}]' | jq
```

## 📍 Important Locations

| Item | Location |
|------|----------|
| Service file | `/etc/systemd/system/air1-logger.service` |
| App directory | `/home/exedev/app/` |
| Database | `/home/exedev/app/db.sqlite` |
| Logs | `journalctl -u air1-logger` |
| Backend code | `/home/exedev/app/index.ts` |
| Frontend code | `/home/exedev/app/sync.tsx` |

## 🌐 Access URLs

| Type | URL |
|------|-----|
| Local | `http://localhost:443/` |
| External | `https://joshair.exe.dev/` |
| API | `http://localhost:443/api/` |

## 🔍 Quick Checks

### Is service running?
```bash
sudo systemctl is-active air1-logger
# Expected: active
```

### Is port listening?
```bash
sudo lsof -i :443
# Expected: bun process on port 443
```

### Any recent errors?
```bash
sudo journalctl -u air1-logger --since "5 minutes ago" | grep -i error
# Expected: (no output)
```

### Check database indexes
```bash
sqlite3 ~/app/db.sqlite "SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%';"
# Expected: 3 indexes (ts, sensorId, dedupe)
```

## 🛠️ Common Tasks

### Backup Database
```bash
cp ~/app/db.sqlite ~/backups/db-$(date +%F).sqlite
```

### Clear Old Data (older than 30 days)
```bash
CUTOFF=$(($(date +%s000) - 2592000000))
curl -X DELETE "http://localhost:443/api/readings?before=$CUTOFF"
```

### Export All Data to CSV
```bash
curl http://localhost:443/api/export/csv > air1-data-$(date +%F).csv
```

### Check Memory Usage
```bash
sudo systemctl status air1-logger | grep Memory
```

### Watch Auto-Reload
```bash
# Terminal 1: Watch logs
sudo journalctl -u air1-logger -f

# Terminal 2: Edit a file
nano ~/app/index.ts
# Save and watch Terminal 1 show reload!
```

## 🐛 Troubleshooting

### Service won't start
```bash
sudo journalctl -u air1-logger -n 50
sudo systemctl status air1-logger
```

### Port 443 already in use
```bash
sudo lsof -i :443
# Kill other process or change port in service file
```

### Database locked
```bash
# Check for multiple bun processes
ps aux | grep bun
# Kill all and restart service
sudo pkill bun
sudo systemctl restart air1-logger
```

### Auto-reload not working
```bash
# Verify --watch flag
systemctl cat air1-logger | grep watch
# Should show: --watch index.ts
```

## 📊 Performance Monitoring

```bash
# CPU usage
top -p $(pgrep -f "bun run")

# Memory usage
ps -o rss,cmd -p $(pgrep -f "bun run")

# Service stats
systemd-cgtop -n 1 | grep air1-logger

# Database size over time
watch -n 10 "du -h ~/app/db.sqlite"
```

## 🎯 Key Features

- ✅ **Port 443:** Ready for HTTPS proxy
- ✅ **Auto-reload:** Changes take effect immediately
- ✅ **Indexed queries:** Efficient deduplication (O(log n))
- ✅ **Historical data:** Charts work without sensor
- ✅ **Systemd service:** Auto-start on boot
- ✅ **Security hardened:** Minimal permissions

## 📚 Documentation

- `DEPLOYMENT_SUMMARY.md` - Full deployment details
- `SYSTEMD_SERVICE.md` - Service management guide
- `DEDUPLICATION.md` - Deduplication feature docs
- `QUICKSTART_DEDUPE.md` - Quick deduplication reference
- `INDEX.md` - Documentation index

## 🎉 Success Indicators

```bash
# All should return success
sudo systemctl is-active air1-logger         # active
curl -f http://localhost:443/api/config      # 200 OK
sqlite3 ~/app/db.sqlite "PRAGMA integrity_check;"  # ok
```

## 💡 Pro Tips

1. **Monitor logs during changes:** `sudo journalctl -u air1-logger -f`
2. **Use indexes efficiently:** Always query by timestamp first
3. **Regular backups:** Automate with cron
4. **Check database size:** Set up alerts for growth
5. **Test locally first:** Use curl before connecting sensor

---

**Need more details?** See full documentation in ~/app/
