# Auto-Reload Configuration

## Current Setup

The service now automatically reloads when files change:

### Watched Files
- `index.ts` - Backend (watched by bun --watch)
- `sync.tsx` - Frontend (watched by inotify → triggers index.ts reload)
- `index.html` - HTML entry (watched by inotify → triggers index.ts reload)

### How It Works

1. **dev.sh script** runs two processes:
   - `bun --watch index.ts` - Main server with built-in watch
   - `inotifywait` - Watches sync.tsx and index.html

2. When sync.tsx or index.html changes:
   - inotifywait detects the change
   - Script touches index.ts
   - bun's watch sees index.ts changed
   - Server reloads automatically

### Testing

To test auto-reload:

```bash
# Make a change to sync.tsx
echo "// test" >> ~/app/sync.tsx

# Watch logs
sudo journalctl -u air1-logger -f

# You should see: "🔄 Detected change, triggering reload..."
# Followed by: "🚀 Server running at..."
```

### Manual Reload

If auto-reload doesn't trigger, you can manually restart:

```bash
# Option 1: Touch index.ts to trigger bun's watch
touch ~/app/index.ts

# Option 2: Restart the service
sudo systemctl restart air1-logger
```

### Files

- **/home/exedev/app/dev.sh** - Watch script
- **/etc/systemd/system/air1-logger.service** - Service definition

### Service Structure

```
dev.sh (PID 2014)
├── bun --watch index.ts (PID 2017)
└── inotifywait loop (PID 2018)
```

### Troubleshooting

**Auto-reload not working:**

1. Check if inotifywait is running:
```bash
ps aux | grep inotifywait
```

2. Check logs:
```bash
sudo journalctl -u air1-logger -f
```

3. Test inotifywait manually:
```bash
inotifywait -e modify ~/app/sync.tsx &
echo "test" >> ~/app/sync.tsx
```

4. Restart service:
```bash
sudo systemctl restart air1-logger
```

**Browser still showing old code:**

The browser caches JavaScript. Do a **hard refresh**:
- Chrome/Edge/Firefox: `Ctrl+Shift+R` (or `Cmd+Shift+R` on Mac)
- Or: F12 → Right-click refresh → "Empty Cache and Hard Reload"

## Summary

✅ Auto-reload enabled for all files
✅ No manual restarts needed
✅ Service uses inotify for efficient file watching
✅ Production-ready configuration
