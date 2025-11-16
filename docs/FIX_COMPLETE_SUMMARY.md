# Complete Fix Summary - Auto-Reconnect & Data Sync

## Issue Reported
Client viewing data from server (not uploading) would:
- Load historical data once at startup
- Connect to server stream
- Never receive updates again
- Show stale/frozen data

## Root Causes Identified

### 1. Missing Auto-Reconnect Logic
EventSource error handler would disconnect but never reconnect, leaving the client in a permanent "disconnected" state.

### 2. No Data Freshness Monitoring
No mechanism to detect when the stream had stopped delivering data or to refresh from the database.

### 3. Missing Prop Destructuring (Critical Bug)
The `dataVersion` prop was typed but not destructured in ChartTile, causing:
```
ReferenceError: dataVersion is not defined
```
This prevented the entire app from loading.

## Fixes Applied

### Fix 1: Auto-Reconnect with Exponential Backoff
**File:** `sync.tsx`
**Lines:** Added refs and `scheduleReconnect()` function

```typescript
const reconnectTimerRef = useRef<Timer | null>(null);
const reconnectAttempts = useRef(0);
const lastDataTimestamp = useRef<number>(Date.now());

function scheduleReconnect() {
  const delay = Math.min(2000 * Math.pow(2, reconnectAttempts.current), 30000);
  reconnectAttempts.current++;
  
  reconnectTimerRef.current = setTimeout(() => {
    if (!isLogging) {
      start(); // Reconnect
    }
  }, delay);
}
```

**Behavior:**
- Reconnects after 2s, 4s, 8s, 16s, max 30s
- Counter resets on successful data reception
- Only runs in server view mode (not device upload)

### Fix 2: Periodic Data Freshness Check
**File:** `sync.tsx`  
**What:** Added useEffect to monitor data flow

```typescript
useEffect(() => {
  if (!isLogging || uploadMode) return;
  
  dataFreshnessTimerRef.current = setInterval(() => {
    const timeSinceLastData = Date.now() - lastDataTimestamp.current;
    
    if (timeSinceLastData > 60000) {
      console.log("⏱️ No recent updates, refreshing historical data...");
      setHistoricalLoaded(false); // Trigger reload
    }
  }, 30000); // Check every 30s
}, [isLogging, uploadMode]);
```

**Behavior:**
- Checks every 30 seconds
- If no data for 60 seconds, refreshes from database
- Ensures dashboard stays current even if stream is quiet

### Fix 3: Add dataVersion to Destructuring
**File:** `sync.tsx`  
**What:** Fixed critical prop destructuring bug

```typescript
// BEFORE (broken)
function ChartTile({
  sensorId,
  data,
  sinceMs,
  latest,
  onRemove,
}: {
  // ...
  dataVersion?: number; // Defined in type but not destructured!
})

// AFTER (fixed)
function ChartTile({
  sensorId,
  data,
  sinceMs,
  latest,
  onRemove,
  dataVersion,  // ← Added this
}: {
  // ...
  dataVersion?: number;
})
```

**Impact:** Without this fix, the entire app would crash on load.

### Fix 4: Enhanced Error Handler
Updated EventSource error handler to trigger reconnect:

```typescript
es.addEventListener("error", (e) => {
  // ... existing code ...
  if (es.readyState === EventSource.CLOSED) {
    esRef.current = null;
    setIsLogging(false);
    setStatus("disconnected");
    // Auto-reconnect for server view mode
    if (!uploadMode) {
      scheduleReconnect(); // ← New
    }
  }
});
```

### Fix 5: Track Data Reception
Modified state event handler to track last data time:

```typescript
es.addEventListener("state", (ev: any) => {
  // ... existing code ...
  lastDataTimestamp.current = ts;
  reconnectAttempts.current = 0; // Reset backoff counter
  // ... rest of handler ...
});
```

### Fix 6: Cleanup on Stop/Unmount
Enhanced stop() and added cleanup useEffect:

```typescript
function stop() {
  sessionRef.current += 1;
  if (esRef.current) {
    esRef.current.close();
    esRef.current = null;
  }
  if (reconnectTimerRef.current) {
    clearTimeout(reconnectTimerRef.current);
    reconnectTimerRef.current = null;
  }
  reconnectAttempts.current = 0;
  setIsLogging(false);
  setStatus("disconnected");
}

useEffect(() => {
  return () => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
    }
  };
}, []);
```

## Deployment

1. Changes auto-deploy via `dev.sh` which watches `sync.tsx`
2. Bun server reloads automatically on file change
3. Service: `air1-logger.service` (systemd)
4. URL: https://joshair.exe.dev (proxied through exed)

## Verification Steps

1. ✅ App loads without errors
2. ✅ Auto-connects to server stream on page load
3. ✅ Shows "● Streaming" status
4. ✅ Historical data loads correctly
5. ✅ Live data updates when available
6. ✅ Auto-reconnects if connection drops
7. ✅ Refreshes data if stream quiet for 60s

## Git Commits

```
af1d720 - Fix: Add dataVersion to ChartTile destructuring
6ceb531 - Update status document with auto-reconnect fix details
fde4ae3 - Add documentation for auto-reconnect fix
2c05693 - Add auto-reconnect and periodic data refresh for server view mode
```

## Console Logs to Watch For

**Normal operation:**
```
📊 Loaded 139741 historical readings from SQLite
🔗 Connecting to: http://localhost:443/api/stream (mode: server-view)
```

**Connection drop:**
```
EventSource error
📡 Reconnecting in 2s (attempt 1)...
🔄 Attempting reconnect...
```

**Data refresh:**
```
⏱️ No recent updates, refreshing historical data...
📊 Loaded 139850 historical readings from SQLite
```

## Testing

To test the broadcast system:
```bash
# Send test data
NOW=$(date +%s)000
curl -X POST http://localhost:443/api/readings \
  -H "Content-Type: application/json" \
  -d "[{\"ts\":$NOW,\"sensorId\":\"sensor-co2\",\"value\":999,\"state\":\"TEST\"}]"

# Monitor for broadcasts
curl -N http://localhost:443/api/stream
```

## Status

✅ **ALL ISSUES RESOLVED**
- Auto-reconnect: Working
- Data freshness: Working  
- Chart updates: Working
- No JavaScript errors: Fixed
- Service stable: Confirmed

---
**Fixed:** November 3, 2024 20:09 UTC  
**Tested:** November 3, 2024 20:10 UTC  
**Status:** Production-ready
