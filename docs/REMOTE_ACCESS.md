# Remote Access Feature

## Overview

The AIR-1 Logger now supports **real-time updates for remote clients** who cannot directly access the hardware device. This is achieved through a server-side SSE (Server-Sent Events) broadcasting system.

## How It Works

### Architecture

```
┌─────────────────┐
│  AIR-1 Device   │
│  (Hardware)     │
└────────┬────────┘
         │ SSE Stream
         │
         ▼
┌─────────────────┐         ┌─────────────────┐
│  Local Client   │         │ Remote Client   │
│  (Same Network) │         │ (Internet)      │
└────────┬────────┘         └────────┬────────┘
         │                           │
         │ Upload Data               │ SSE Stream
         │                           │
         ▼                           ▼
┌──────────────────────────────────────────────┐
│            Server (index.ts)                 │
│  • Stores readings in SQLite                 │
│  • Broadcasts to connected SSE clients       │
│  • Provides /api/stream endpoint             │
└──────────────────────────────────────────────┘
```

### Two Connection Modes

1. **Device Mode** (Default)
   - Client connects directly to the hardware device
   - Best for local clients on the same network
   - Lowest latency
   - Client uploads data to server for storage

2. **Server Mode** (New!)
   - Client connects to the server's `/api/stream` endpoint
   - For remote clients outside the local network
   - Receives real-time updates broadcast by the server
   - No manual refresh needed

## Usage

### For Remote Clients

1. Open the AIR-1 Logger web interface
2. Check the **"Use server stream (for remote access)"** checkbox
3. Click **Start Logging**
4. You'll now receive real-time updates from the server!

### For Local Clients (Default)

- Leave the checkbox unchecked
- Enter your device URL (or use default)
- Click Start Logging
- You'll connect directly to the device

## Technical Details

### Backend Changes (index.ts)

1. **SSE Broadcasting System**
   ```typescript
   interface SSEClient {
     id: string;
     controller: ReadableStreamDefaultController;
     connectedAt: number;
   }
   
   const sseClients = new Map<string, SSEClient>();
   ```

2. **New Endpoint**: `GET /api/stream`
   - Server-Sent Events endpoint
   - Streams real-time sensor data
   - Automatic heartbeat every 30 seconds
   - Graceful disconnect handling

3. **Broadcasting**
   - When data is POST'd to `/api/readings`, it's broadcast to all connected SSE clients
   - Only non-duplicate readings are broadcast
   - Events match the device's format for compatibility

### Frontend Changes (sync.tsx)

1. **Connection Mode State**
   ```typescript
   const [connectionMode, setConnectionMode] = useState<"device" | "server">("device");
   const [useServerStream, setUseServerStream] = useState(false);
   ```

2. **Dynamic URL Selection**
   - In server mode: connects to `${API_BASE}/stream`
   - In device mode: connects to the device URL

3. **UI Toggle**
   - Checkbox to switch between modes
   - Status indicator shows current mode
   - Device URL input disabled when using server stream

## Benefits

✅ **Remote access** - View real-time data from anywhere
✅ **No manual refresh** - Automatic updates
✅ **Zero impact** on local clients
✅ **Backward compatible** - Existing setup works unchanged
✅ **Scalable** - Multiple remote viewers can connect
✅ **Low latency** - SSE provides near-real-time updates

## API Reference

### GET /api/stream

Server-Sent Events endpoint for real-time sensor data.

**Headers:**
```
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive
```

**Events:**

1. **connected** - Initial connection confirmation
   ```
   event: connected
   data: {"clientId":"uuid","timestamp":1234567890}
   ```

2. **state** - Sensor reading (matches device format)
   ```
   event: state
   data: {"id":"sensor-co2","value":450,"state":"OK"}
   id: 1234567890:sensor-co2
   ```

3. **ping** - Heartbeat (every 30 seconds)
   ```
   event: ping
   data: 1234567890
   ```

### Testing with curl

```bash
# Connect to the stream
curl -N -H "Accept: text/event-stream" http://localhost:443/api/stream

# You should see:
# event: connected
# data: {"clientId":"...","timestamp":...}
# 
# event: ping
# data: ...
```

## Monitoring

Check connected clients in the server logs:
```bash
sudo journalctl -u air1-logger -f | grep "Client"
```

You'll see:
- `🔌 Client <uuid> connected to SSE stream (total: N)`
- `🔌 Client <uuid> disconnected (total: N)`

## Troubleshooting

### Remote client not receiving updates

1. **Check if data is being uploaded**
   ```bash
   curl http://localhost:443/api/readings/count
   ```

2. **Verify SSE endpoint is accessible**
   ```bash
   curl -N http://localhost:443/api/stream
   ```

3. **Check server logs**
   ```bash
   sudo journalctl -u air1-logger -n 50
   ```

### Connection keeps disconnecting

- Check network stability
- Verify firewall allows outbound connections
- Check browser console for errors

## Performance

- **Overhead**: Minimal - broadcasts only to active clients
- **Latency**: Typically < 1 second from upload to broadcast
- **Scalability**: Tested with multiple simultaneous clients
- **Heartbeat**: 30-second keepalive prevents connection timeout

## Future Enhancements

Possible improvements:
- Auto-detect mode (try device first, fallback to server)
- Selective sensor subscriptions (subscribe to specific sensors)
- Historical playback over SSE
- Compression for high-frequency data
- WebSocket alternative for bidirectional communication
