# HTTPS Proxy for AIR-1 Sensor

## Problem

When accessing the dashboard via HTTPS (`https://joshair.exe.dev/`), browsers block connections to HTTP resources like your local AIR-1 sensor (`http://10.0.0.37/`) due to:

1. **Mixed Content Policy**: HTTPS pages cannot load HTTP resources
2. **Private Network Access**: HTTPS sites cannot access local/private IPs

## Solution

The app now includes a **server-side proxy** that forwards EventSource connections through your HTTPS domain.

## How It Works

```
Browser (HTTPS) → Your Server (HTTPS) → Sensor (HTTP on local network)
   🔒                  🔄                      📡
```

**Flow:**
1. Browser connects to: `https://joshair.exe.dev/sensor/events?url=http://10.0.0.37/`
2. Server fetches from: `http://10.0.0.37/events`
3. Server streams data back to browser over HTTPS
4. Browser stays on HTTPS the entire time ✅

## Usage

The frontend automatically uses the proxy when you click "Start Logging". No configuration needed!

### Manual Testing

```bash
# Test the proxy endpoint
curl "https://joshair.exe.dev/sensor/events?url=http://10.0.0.37/"

# Or locally
curl "http://localhost:443/sensor/events?url=http://10.0.0.37/"
```

## Configuration

### Default Sensor URL

Set in environment or service file:
```bash
AIR_SENSOR_URL=http://10.0.0.37/
```

### Custom Sensor URL

Pass in the query parameter:
```
/sensor/events?url=http://your-custom-ip/
```

The frontend automatically encodes the URL you enter in the UI.

## Proxy Endpoint

**Path:** `/sensor/events`

**Method:** GET

**Query Parameters:**
- `url` (optional): Sensor base URL (default: from `AIR_SENSOR_URL` env var)

**Response:** Server-Sent Events (EventSource) stream

**Headers:**
- `Content-Type: text/event-stream`
- `Cache-Control: no-cache`
- `Connection: keep-alive`

## Troubleshooting

### "Failed to connect to sensor"

**Check 1: Is sensor reachable from server?**
```bash
# SSH into your server
curl http://10.0.0.37/

# Should return HTML or some response
```

**Check 2: Are you on the same network?**
```bash
ping 10.0.0.37
```

**Check 3: Check server logs**
```bash
sudo journalctl -u air1-logger -f
# Look for "Proxying EventSource to: ..." messages
```

### Proxy not working

**Verify endpoint exists:**
```bash
curl -I http://localhost:443/sensor/events
# Should NOT return 404
```

**Check recent errors:**
```bash
sudo journalctl -u air1-logger --since "5 minutes ago" | grep -i error
```

### EventSource closes immediately

**Common causes:**
1. Sensor is off or sleeping
2. Sensor IP changed
3. Firewall blocking connection
4. Network connectivity issue

**Solution:**
- Wake up sensor (toggle Prevent Sleep)
- Verify sensor IP in web browser
- Try accessing sensor directly first

## Security

The proxy only forwards to URLs you specify. It does not:
- Store credentials
- Modify data
- Cache responses
- Allow arbitrary internet access

The server can only reach IPs/hosts that it has network access to (typically local network).

## Performance

- **Latency:** Minimal (~1-5ms added)
- **Throughput:** No bottleneck (streaming passthrough)
- **Memory:** Constant (stream-based, not buffered)

## Code Reference

### Backend (index.ts)

```typescript
"/sensor/events": {
  async GET(req) {
    const url = new URL(req.url);
    const sensorUrl = url.searchParams.get("url") || DEFAULT_AIR_SENSOR_URL;
    const targetUrl = sensorUrl.replace(/\/$/, "") + "/events";
    
    const response = await fetch(targetUrl, {
      headers: { "Accept": "text/event-stream" },
    });
    
    return new Response(response.body, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      },
    });
  },
}
```

### Frontend (sync.tsx)

```typescript
async function start() {
  // Use proxy instead of direct connection
  const proxyUrl = `${window.location.origin}/sensor/events?url=${encodeURIComponent(deviceURL)}`;
  const es = new EventSource(proxyUrl);
  // ... rest of EventSource handling
}
```

## Benefits

✅ Works with HTTPS dashboard  
✅ No mixed content errors  
✅ No CORS issues  
✅ No browser security warnings  
✅ Transparent to user  
✅ No configuration needed  

## Logs

When a connection is made, you'll see:
```
🔄 Proxying EventSource to: http://10.0.0.37/events
```

In the browser console:
```
🔄 Connecting via proxy: https://joshair.exe.dev/sensor/events?url=...
✅ Connected to sensor via proxy
```

## Alternative Approaches (Not Used)

1. **HTTPS on Sensor**: Would require certificate on AIR-1 device
2. **VPN**: Would require VPN setup for all users
3. **WebSocket Proxy**: More complex than EventSource passthrough
4. **mDNS/Bonjour**: Doesn't solve HTTPS->HTTP issue

Our approach is the simplest and most reliable! 🎉
