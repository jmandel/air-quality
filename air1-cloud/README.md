# Apollo AIR-1 Cloud Integration

This directory contains ESPHome configuration for the Apollo AIR-1 air quality monitor with cloud data posting via HTTP JSON.

## Architecture

```
air1-cloud/
├── air1_cloud.yaml              # Your config (WiFi creds, HTTP posting logic)
│       ↓ includes
└── vendor-apollo/               # Apollo repo via git subtree
    └── Integrations/ESPHome/
        ├── AIR-1.yaml           # Apollo's main config (esphome, logger, ota, wifi)
        │       ↓ includes
        └── Core.yaml            # Sensor definitions (8 IDs added in commit 09feede)
```

**Git Subtree Strategy:**
Apollo's repo is merged into `vendor-apollo/` using `git subtree`. Your 8 sensor ID additions are tracked in your repo's history alongside your main code. You can pull Apollo updates using `git subtree pull`.

## Why This Approach?

The Apollo AIR-1's official ESPHome config (`Core.yaml`) defines all sensors but **omits `id:` fields** on some sensors (SEN55 temp/humidity, MICS-4514 gas sensors). Without IDs, those sensors:

- ✅ Appear in Home Assistant (via SSE/API)
- ✅ Show in the web UI
- ❌ **Cannot be referenced in custom ESPHome code** (like HTTP JSON payloads)

To get *everything* into our cloud JSON while keeping track of upstream changes, we:

1. **Merge Apollo's repo via git subtree** into `vendor-apollo/`
2. **Track our 8 sensor ID additions** in regular commits alongside our main code
3. **Pull Apollo updates** using `git subtree pull` when they release new versions

**Why git subtree?**
- ✅ Single repo - no submodule complexity
- ✅ Your changes and vendor code in one history
- ✅ Easy to clone/share (no submodule init needed)
- ✅ Can still pull upstream updates
- ✅ Normal git workflow for everything

## Changes From Vendor Config

All changes are in commit `09feede` (viewable with `git show 09feede`). We add **only** these sensor IDs:

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

When Apollo releases a new version, pull their changes using git subtree:

```bash
# From repo root
git subtree pull --prefix air1-cloud/vendor-apollo \
  https://github.com/ApolloAutomation/AIR-1.git main --squash

# Git will merge Apollo's changes with your local modifications
# If conflicts occur, resolve them normally:
# 1. Edit conflicting files (keep your 8 sensor IDs!)
# 2. git add <resolved-files>
# 3. git commit

# Rebuild
cd air1-cloud
uvx --with pip esphome run air1_cloud.yaml
```

**Conflict resolution** (rare, since we only touch 8 lines):
- If Apollo changes the same sensor sections, git will mark conflicts
- Keep both their changes AND your `id:` additions
- Test the build after resolving

**If Apollo adds new sensors** you want in JSON:
1. Edit `air1-cloud/vendor-apollo/Integrations/ESPHome/Core.yaml`
2. Add `id:` fields to the new sensors
3. Commit: `git commit -am "Add IDs for new Apollo sensors"`
4. Update JSON payload in `air1_cloud.yaml` to include new fields

## Troubleshooting

### Build fails with "ID not found"

An upstream change may have removed/renamed a sensor. Check recent changes:

```bash
# View recent commits affecting vendor-apollo
git log --oneline air1-cloud/vendor-apollo/ -5

# See what changed in Core.yaml
git diff HEAD~1 air1-cloud/vendor-apollo/Integrations/ESPHome/Core.yaml
```

Update `air1_cloud.yaml` to match Apollo's new sensor IDs.

### HTTP POSTs fail

1. Check network: `ping your-server.com` from another device
2. Check endpoint URL in `air1_cloud.yaml`
3. Check logs: `uvx --with pip esphome logs air1_cloud.yaml`

### Missing sensor data in JSON

Sensor might not have an `id:` field. Add it:

```bash
# Edit the file
vim air1-cloud/vendor-apollo/Integrations/ESPHome/Core.yaml
# Add id: xyz_sensor to the sensor definition

# Commit
git add air1-cloud/vendor-apollo/Integrations/ESPHome/Core.yaml
git commit -m "Add ID for XYZ sensor"
```

## Files

- `air1_cloud.yaml` – Main ESPHome config (WiFi, HTTP, interval posting)
- `vendor-apollo/` – Apollo's AIR-1 repo merged via git subtree (8 sensor IDs added)
- `README.md` – This file
- `.gitignore` – Excludes ESPHome build artifacts

**View your sensor ID changes:**
```bash
# See the commit that added sensor IDs
git show 09feede

# Or view all changes to vendor-apollo
git log --oneline air1-cloud/vendor-apollo/
```

## License

The overlay configs in this directory are provided as-is for educational purposes.

The Apollo AIR-1 vendor firmware is licensed under Apollo Automation's terms (see `vendor-apollo/License.md`).
