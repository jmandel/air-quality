# Apollo AIR-1 Cloud Integration

This directory contains ESPHome configuration for the Apollo AIR-1 air quality monitor with cloud data posting via HTTP JSON.

## Architecture

```
air1-cloud/
├── air1_cloud.yaml              # Your config (WiFi creds, HTTP posting logic)
│       ↓ includes
└── vendor-apollo/               # Apollo repo as git submodule
    └── Integrations/ESPHome/
        ├── AIR-1.yaml           # Apollo's main config (esphome, logger, ota, wifi)
        │       ↓ includes
        └── Core.yaml            # Sensor definitions
                                 # On branch: local-with-sensor-ids
                                 # (8 sensor IDs added via git commit)
```

**Git Strategy:**
The `vendor-apollo/` submodule tracks a custom branch (`local-with-sensor-ids`) with Core.yaml modified to add 8 sensor IDs. AIR-1.yaml includes Core.yaml, so you get the full Apollo automation logic plus your sensor IDs.

## Why This Approach?

The Apollo AIR-1's official ESPHome config (`Core.yaml`) defines all sensors but **omits `id:` fields** on some sensors (SEN55 temp/humidity, MICS-4514 gas sensors). Without IDs, those sensors:

- ✅ Appear in Home Assistant (via SSE/API)
- ✅ Show in the web UI
- ❌ **Cannot be referenced in custom ESPHome code** (like HTTP JSON payloads)

To get *everything* into our cloud JSON while keeping track of upstream changes, we:

1. **Fork Apollo's repo in a git submodule** (`vendor-apollo/`)
2. **Create a custom branch** (`local-with-sensor-ids`) with a single commit that adds 8 sensor IDs
3. **Use git to manage updates**: fetch upstream → merge/rebase our branch → resolve conflicts if any

**Why not ESPHome package overlays?** ESPHome doesn't support patching existing sensors - you can't add an `id:` to an already-defined sensor through package merging. Git gives us proper version control and merge tooling.

## Changes From Vendor Config

All changes are in one git commit in the `local-with-sensor-ids` branch. We add **only** these sensor IDs:

| Sensor | ID Added | Reason |
|--------|----------|--------|
| SEN55 temperature | `sen55_temperature` | HTTP JSON access |
| SEN55 humidity | `sen55_humidity` | HTTP JSON access |
| MICS-4514 NO₂ | `gas_no2` | HTTP JSON access |
| MICS-4514 CO | `gas_co` | HTTP JSON access |
| MICS-4514 H₂ | `gas_h2` | HTTP JSON access |
| MICS-4514 Ethanol | `gas_ethanol` | HTTP JSON access |
| MICS-4514 Methane | `gas_ch4` | HTTP JSON access |
| MICS-4514 Ammonia | `gas_nh3` | HTTP JSON access |

**No behavioral changes** – all sensors work exactly as before. IDs are purely for internal references.

## JSON Payload Structure

Every 60 seconds (while awake), the device POSTs to your configured endpoint:

```json
{
  "device": "apollo-air-1",
  "fw_version": "25.8.6.1",
  "description": "apollo-air-1 made by Apollo Automation - version 25.8.6.1",
  "timestamp": "2025-11-15T21:03:12Z",
  "measurements": {
    "co2_ppm": 587,
    "pressure_hpa": 1019.4,
    "dps_temp_c": 26.9,
    "sen55_temp_c": 26.4,
    "sen55_humidity_pct": 33.1,
    "voc_index": 29,
    "nox_index": 1,
    "pm_ug_m3": {
      "pm1": 3.2,
      "pm2_5": 3.4,
      "pm4": 3.4,
      "pm10": 3.4,
      "pm0_3_to_1": 3.2,
      "pm1_to_2_5": 0.2,
      "pm2_5_to_4": 0.0,
      "pm4_to_10": 0.0
    },
    "gases_ppm": {
      "no2": 0.01,
      "co": 0.02,
      "h2": 0.00,
      "ethanol": 0.00,
      "ch4": 0.00,
      "nh3": 0.00
    }
  },
  "diagnostics": {
    "esp_temp_c": 44.8,
    "wifi_rssi_dbm": -56,
    "uptime_s": 148,
    "online": false,
    "sleep_duration_min": 5,
    "prevent_sleep": true,
    "voc_quality": "Improved",
    "sen55_temp_offset_c": 0.0,
    "sen55_hum_offset_pct": 0.0
  }
}
```

## Setup

### 1. Update WiFi & Endpoint

Edit `air1_cloud.yaml`:

```yaml
substitutions:
  cloud_endpoint: "https://your-server.com/api/ingest"

wifi:
  ssid: "your-network"
  password: "your-password"
```

### 2. Build & Flash

First time (via USB):

```bash
cd air1-cloud
uvx --with pip esphome run air1_cloud.yaml --device /dev/ttyACM0
```

Subsequent updates (OTA):

```bash
uvx --with pip esphome run air1_cloud.yaml --device 192.168.x.y
```

### 3. Monitor

```bash
# Watch logs
uvx --with pip esphome logs air1_cloud.yaml --device 192.168.x.y

# Or check your web server for incoming JSON POSTs
```

## Updating From Upstream

When Apollo releases a new version, use git to merge changes:

```bash
cd air1-cloud/vendor-apollo

# Fetch latest from Apollo's repo
git fetch origin main

# Option 1: Rebase your changes on top of new upstream (cleaner history)
git rebase origin/main
# If conflicts: resolve them, then: git rebase --continue

# Option 2: Merge upstream into your branch (preserves history)
git merge origin/main
# If conflicts: resolve them, then: git commit

# Verify the changes
git log --oneline --graph -10

cd ../..

# Rebuild with updated code
cd air1-cloud
uvx --with pip esphome run air1_cloud.yaml
```

**If there are conflicts** (rare, since we only touch 8 lines):
- Git will mark the conflicts in `Core.yaml`
- Manually resolve, keeping both upstream changes AND your sensor IDs
- Test the build afterward

**If Apollo adds new sensors** you want in JSON:
1. Add IDs to them in `vendor-apollo/Integrations/ESPHome/Core.yaml`
2. Commit: `git commit -am "Add IDs for new X sensor"`
3. Update JSON payload in `air1_cloud.yaml`

## Troubleshooting

### Build fails with "ID not found"

An upstream change may have renamed a sensor ID. Check what changed:

```bash
cd air1-cloud/vendor-apollo
git log --oneline -5
git diff HEAD~1 Integrations/ESPHome/Core.yaml
```

Update `air1_cloud.yaml` to match the new ID.

### HTTP POSTs fail

1. Check network: `ping your-server.com` from another device
2. Check endpoint URL in `air1_cloud.yaml`
3. Check logs: `uvx --with pip esphome logs air1_cloud.yaml`

### Missing sensor data in JSON

Sensor might not have an ID. Add it in the submodule:

```bash
cd air1-cloud/vendor-apollo
# Edit Integrations/ESPHome/Core.yaml and add id: field
git commit -am "Add ID for XYZ sensor"
cd ../..
```

## Files

- `air1_cloud.yaml` – Main ESPHome config (WiFi, HTTP, interval posting)
- `vendor-apollo/` – Git submodule on branch `local-with-sensor-ids` (Apollo's code + 8 sensor IDs)
- `README.md` – This file
- `.gitignore` – Excludes ESPHome build artifacts

**View your changes:**
```bash
cd air1-cloud/vendor-apollo
git log --oneline --graph
git show HEAD  # See the sensor ID commit
```

## License

The overlay configs in this directory are provided as-is for educational purposes.

The Apollo AIR-1 vendor firmware is licensed under Apollo Automation's terms (see `vendor-apollo/License.md`).
