# Viewing Device Submissions

The `/api/submit` endpoint now logs detailed information about every device submission for later review.

## Quick View

### View recent submissions (default: last 10 minutes)
```bash
/home/exedev/app/view-submissions.sh
```

### View submissions from a specific time
```bash
/home/exedev/app/view-submissions.sh "30 minutes ago"
/home/exedev/app/view-submissions.sh "1 hour ago"
/home/exedev/app/view-submissions.sh "today"
```

### Follow live submissions
```bash
/home/exedev/app/view-submissions.sh -f
# or
/home/exedev/app/view-submissions.sh --follow
```

## Example Output

```json
{
  "timestamp": "2025-11-15T18:17:15.965Z",
  "device": "apollo-air-1",
  "fw_version": "25.8.6.1",
  "device_timestamp": "2025-11-15T12:17:13Z",
  "inserted": 16,
  "duplicates": 0,
  "errors": 0,
  "measurements": {
    "co2_ppm": 1170,
    "pressure_hpa": 967.6014,
    "dps_temp_c": 30.60374,
    "voc_index": 99,
    "nox_index": 1,
    "pm_ug_m3": {
      "pm1": 3.6,
      "pm2_5": 4,
      "pm4": 4.2,
      "pm10": 4.3,
      "pm0_3_to_1": 3.6,
      "pm1_to_2_5": 0.4,
      "pm2_5_to_4": 0.2,
      "pm4_to_10": 0.1
    }
  },
  "diagnostics": {
    "esp_temp_c": 37.1,
    "wifi_rssi_dbm": -60,
    "uptime_s": 242.622,
    "sleep_duration_min": 5,
    "prevent_sleep": true,
    "ota_mode": false,
    "voc_quality": "Normal"
  }
}
```

## Manual Journal Access

### View submission summary logs
```bash
sudo journalctl -u air1-logger | grep "📥 Device submission"
```

### View detailed submission logs
```bash
sudo journalctl -u air1-logger | grep "📋 Submission details"
```

### View recent logs with time filtering
```bash
sudo journalctl -u air1-logger --since "10 minutes ago" | grep "Device submission"
```

### Follow live logs
```bash
sudo journalctl -u air1-logger -f
```

## Log Format

Each submission generates two log lines:

1. **Summary line** (always shown):
   ```
   📥 Device submission: apollo-air-1 - 16 inserted, 0 duplicates, 0 errors
   ```

2. **Detail line** (JSON format):
   ```
   📋 Submission details: {"timestamp":"2025-11-15T18:17:15.965Z",...}
   ```

The detail line includes:
- Server timestamp (when received)
- Device name and firmware version
- Device timestamp (from sensor)
- Insert/duplicate/error counts
- Complete measurements payload
- Complete diagnostics payload

## Analyzing Submissions

### Count submissions per device
```bash
sudo journalctl -u air1-logger --since "1 hour ago" | \
  grep "Device submission" | \
  awk -F': ' '{print $2}' | \
  awk '{print $1}' | \
  sort | uniq -c
```

### Find errors
```bash
sudo journalctl -u air1-logger --since "1 hour ago" | \
  grep "Device submission" | \
  grep -v "0 errors"
```

### Extract all measurements
```bash
sudo journalctl -u air1-logger --since "1 hour ago" | \
  grep "📋 Submission details" | \
  sed 's/.*📋 Submission details: //' | \
  jq '.measurements'
```
