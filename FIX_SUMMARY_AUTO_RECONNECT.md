# Fix: Auto-Reconnect and Data Refresh for Server View Mode

## Problem

When a client was not uploading data and just wanted to see data from the server (server view mode), the dashboard would:
1. Load historical data once at startup
2. Connect to the server's EventSource stream
3. Never receive updates again if:
   - The connection dropped
   - No new data was being uploaded by other clients
   - The stream had any temporary issues

This resulted in a "frozen" dashboard that never updated with new data.

## Root Cause

The EventSource connection error handler would set status to "disconnected" but never attempt to reconnect. The dashboard would remain in a disconnected state indefinitely, showing only the initial historical data load.

## Solution

Added three key mechanisms to `sync.tsx`:

### 1. Automatic Reconnection with Exponential Backoff

When the EventSource connection drops in server view mode, the app now automatically attempts to reconnect with exponential backoff (2s, 4s, 8s, 16s, max 30s).

```typescript
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

The reconnect counter resets to 0 when data is successfully received, ensuring quick reconnection after temporary network issues.

### 2. Periodic Data Freshness Check

Every 30 seconds, the app checks if any data has been received in the last 60 seconds. If not, it triggers a refresh of historical data from the server:

```typescript
useEffect(() => {
  if (!isLogging || uploadMode) return;
  
  dataFreshnessTimerRef.current = setInterval(() => {
    const timeSinceLastData = Date.now() - lastDataTimestamp.current;
    
    if (timeSinceLastData > 60000) {
      console.log("⏱️  No recent updates, refreshing historical data...");
      setHistoricalLoaded(false); // Trigger reload
    }
  }, 30000);
}, [isLogging, uploadMode]);
```

This ensures that even if the live stream isn't pushing data, the dashboard will periodically fetch fresh data from the database.

### 3. Data Reception Tracking

The app now tracks when data was last received via the EventSource stream:

```typescript
es.addEventListener("state", (ev: any) => {
  // ... existing code ...
  lastDataTimestamp.current = ts;
  reconnectAttempts.current = 0; // Reset on successful data
});
```

## Behavior

### Server View Mode (Default)
- Auto-connects to `/api/stream` on page load
- Auto-reconnects if connection drops
- Periodically refreshes data if stream is quiet

### Device Upload Mode (Explicit)
- Connects to physical device's `/events` endpoint
- Does NOT auto-reconnect (intentional - device might be offline)
- User must manually start/stop

## Testing

After deploying this fix:
1. Open dashboard in browser
2. Observe console logs showing successful connection
3. If another client is uploading data, updates should appear in real-time
4. If connection drops, watch for reconnect attempts in console
5. If no data for 60s, historical data should refresh

## Files Changed

- `sync.tsx`: Added reconnection logic and data freshness checks

## Deployment

The service auto-restarts via `dev.sh` which watches for changes to `sync.tsx` and triggers Bun to reload.
