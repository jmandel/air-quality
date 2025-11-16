# `/api/submit` - ESPHome Direct Submission Endpoint

## Overview

The `/api/submit` endpoint allows ESPHome devices (like the Apollo AIR-1) to submit air quality measurements directly to the server without requiring a web browser as an intermediary.

## Endpoint

**POST** `/api/submit`

## Request Format

The endpoint expects JSON data in the following structure:

```json
{
  "device": "apollo-air-1",
  "fw_version": "25.8.6.1",
  "description": "apollo-air-1 made by Apollo Automation",
  "timestamp": "2025-11-15T21:03:12Z",
  "measurements": {
    "co2_ppm": 587,
    "pressure_hpa": 1019.4,
    "dps_temp_c": 26.9,
    "voc_index": 29,
    "nox_index": 1,
    "pm_ug_m3": {
      "pm1": 16.9,
      "pm2_5": 18.0,
      "pm4": 18.2,
      "pm10": 18.3,
      "pm0_3_to_1": 16.9,
      "pm1_to_2_5": 1.1,
      "pm2_5_to_4": 0.2,
      "pm4_to_10": 0.1
    }
  },
  "diagnostics": {
    "esp_temp_c": 44.8,
    "wifi_rssi_dbm": -61,
    "uptime_s": 123,
    "sleep_duration_min": 5,
    "prevent_sleep": false,
    "ota_mode": false,
    "voc_quality": "Improved"
  }
}
```

### Required Fields

## Important: Server Time Usage

**All readings are timestamped with server time (Date.now()) when received, regardless of the `timestamp` field in the submission.**

This design choice:
- Eliminates issues with device clock drift or timezone misconfiguration
- Ensures consistent time handling across all data
- Simplifies querying and aggregation
- The device's claimed timestamp is logged for reference but not used for storage

If you need accurate device-side timestamps, ensure your device's NTP is properly configured. The claimed timestamp will appear in server logs for debugging.


- `measurements` (object): Container for sensor measurements

### Optional Fields

- `timestamp` (string, ISO 8601 format): Device timestamp (logged but not used - server time is used instead)
- `measurements` (object): Container for sensor measurements

### Measurements Fields (all optional)

Core measurements:
- `co2_ppm`: CO₂ concentration in parts per million
- `pressure_hpa`: Atmospheric pressure in hectopascals
- `dps_temp_c`: Temperature in Celsius
- `voc_index`: Volatile Organic Compounds index
- `nox_index`: Nitrogen Oxides index

Particulate Matter (`pm_ug_m3` object):
- `pm1`, `pm2_5`, `pm4`, `pm10`: Mass concentration in µg/m³
- `pm0_3_to_1`, `pm1_to_2_5`, `pm2_5_to_4`, `pm4_to_10`: Particle count

### Diagnostics Fields (all optional)

- `esp_temp_c`: ESP32 temperature
- `wifi_rssi_dbm`: WiFi signal strength
- `uptime_s`: Device uptime in seconds
- Additional metadata fields are accepted but not stored

## Response Format

### Success Response

```json
{
  "success": true,
  "device": "apollo-air-1",
  "timestamp": "2025-11-15T21:03:12Z",
  "inserted": 16,
  "duplicates": 0,
  "errors": 0,
  "message": "Processed 16 sensor readings"
}
```

- `inserted`: Number of new readings stored
- `duplicates`: Number of duplicate readings skipped
- `errors`: Number of readings that failed to process

### Error Response

```json
{
  "error": "Missing required fields: measurements and timestamp"
}
```

HTTP status codes:
- `200`: Success
- `400`: Bad request (invalid data)
- `500`: Server error

## Features

### Deduplication

The endpoint uses the same 10-second deduplication window as the `/api/readings` endpoint. Duplicate readings (same sensor, value, and timestamp within 10 seconds) are automatically skipped.

### Aggregation

All submitted readings are automatically:
1. Stored as raw data (7-day retention)
2. Aggregated into minute-level summaries (permanent retention)
3. Broadcast to connected SSE clients in real-time

### Broadcasting

Successfully inserted readings are immediately broadcast to all connected viewers via Server-Sent Events, providing real-time updates without polling.

## ESPHome Configuration

Add this to your ESPHome YAML configuration:

```yaml
substitutions:
  cloud_endpoint: "http://air443.exe.dev:3000/api/submit"

# ... sensor definitions ...

interval:
  - interval: 60s
    then:
      - http_request.post:
          url: ${cloud_endpoint}
          request_headers:
            Content-Type: application/json
          json: |-
            root["device"]      = "${name}";
            root["fw_version"]  = "${version}";
            root["description"] = "${device_description}";
            
            if (id(sntp_time).now().is_valid()) {
              root["timestamp"] = id(sntp_time).now().strftime("%FT%TZ");
            }
            
            auto meas = root.createNestedObject("measurements");
            meas["co2_ppm"]       = id(co2).state;
            meas["pressure_hpa"]  = id(dps310pressure).state;
            meas["dps_temp_c"]    = id(dps310temperature).state;
            meas["voc_index"]     = id(sen55_voc).state;
            meas["nox_index"]     = id(sen55_nox).state;
            
            auto pm = meas.createNestedObject("pm_ug_m3");
            pm["pm1"]        = id(pm_1_0).state;
            pm["pm2_5"]      = id(pm_2_5).state;
            pm["pm4"]        = id(pm_4_0).state;
            pm["pm10"]       = id(pm_10_0).state;
            pm["pm0_3_to_1"] = id(pm0_3_to_1).state;
            pm["pm1_to_2_5"] = id(pm1_to_2_5).state;
            pm["pm2_5_to_4"] = id(pm2_5_to_4).state;
            pm["pm4_to_10"]  = id(pm4_to_10).state;
            
            auto diag = root.createNestedObject("diagnostics");
            diag["esp_temp_c"]    = id(sys_esp_temperature).state;
            diag["wifi_rssi_dbm"] = id(wifi_signal_db).state;
            diag["uptime_s"]      = id(sys_uptime).state;
```

## Testing

### Using curl

```bash
curl -X POST http://air443.exe.dev:3000/api/submit \
  -H "Content-Type: application/json" \
  -d '{
    "device": "test-device",
    "timestamp": "2025-11-15T21:03:12Z",
    "measurements": {
      "co2_ppm": 587,
      "voc_index": 29,
      "pm_ug_m3": {
        "pm2_5": 18.0
      }
    }
  }'
```

### Check the logs

```bash
sudo journalctl -u air1-logger -f
```

Look for lines like:
```
📥 Device submission: apollo-air-1 - 16 inserted, 0 duplicates, 0 errors
```

## Comparison with `/api/readings`

| Feature | `/api/submit` | `/api/readings` |
|---------|---------------|-----------------|
| Input format | ESPHome JSON structure | Array of `{sensorId, value, ts}` |
| Use case | Direct device submission | Browser-based uploader |
| Sensor mapping | Automatic from ESPHome fields | Manual via `sensorId` |
| Timestamp format | ISO 8601 string | Unix milliseconds |
| Response | Detailed stats | Basic count |

Both endpoints:
- Support deduplication
- Trigger real-time broadcasting
- Store raw + aggregated data
- Respect the same retention policies
