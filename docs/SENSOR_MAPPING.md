# Sensor Mapping Reference

## Complete Sensor List and JSON-to-Database Mapping

All sensor names now use transparent 1:1 mapping from JSON field names to database names for consistency.

### JSON Structure

```json
{
  "measurements": {
    "co2_ppm": 1069,
    "pressure_hpa": 967.54,
    "sen55_temp_c": 25.01,
    "sen55_humidity_pct": 35.8,
    "voc_index": 81,
    "nox_index": 1,
    "pm_ug_m3": { "pm1": 3.2, "pm2_5": 3.6, ... },
    "gases_ppm": { "no2": 0.164, "co": 4.23, ... }
  },
  "diagnostics": {
    "esp_temp_c": 37.1,
    "wifi_rssi_dbm": -58,
    "uptime_s": 303.69
  }
}
```

### Complete Mapping Table

| JSON Field | Database Name | Display Name | Unit | Source |
|------------|---------------|--------------|------|--------|
| `co2_ppm` | `co2_ppm` | CO₂ | ppm | measurements |
| `gases_ppm.no2` | `no2_ppm` | NO₂ | ppm | measurements.gases_ppm |
| `gases_ppm.co` | `co_ppm` | CO | ppm | measurements.gases_ppm |
| `gases_ppm.h2` | `h2_ppm` | Hydrogen | ppm | measurements.gases_ppm |
| `gases_ppm.ethanol` | `ethanol_ppm` | Ethanol | ppm | measurements.gases_ppm |
| `gases_ppm.ch4` | `ch4_ppm` | Methane | ppm | measurements.gases_ppm |
| `gases_ppm.nh3` | `nh3_ppm` | Ammonia | ppm | measurements.gases_ppm |
| `pm_ug_m3.pm1` | `pm1_ug_m3` | PM 1.0 | µg/m³ | measurements.pm_ug_m3 |
| `pm_ug_m3.pm2_5` | `pm2_5_ug_m3` | PM 2.5 | µg/m³ | measurements.pm_ug_m3 |
| `pm_ug_m3.pm4` | `pm4_ug_m3` | PM 4.0 | µg/m³ | measurements.pm_ug_m3 |
| `pm_ug_m3.pm10` | `pm10_ug_m3` | PM 10 | µg/m³ | measurements.pm_ug_m3 |
| `pm_ug_m3.pm0_3_to_1` | `pm0_3_to_1_num` | PM 0.3-1.0μm | #/cm³ | measurements.pm_ug_m3 |
| `pm_ug_m3.pm1_to_2_5` | `pm1_to_2_5_num` | PM 1.0-2.5μm | #/cm³ | measurements.pm_ug_m3 |
| `pm_ug_m3.pm2_5_to_4` | `pm2_5_to_4_num` | PM 2.5-4.0μm | #/cm³ | measurements.pm_ug_m3 |
| `pm_ug_m3.pm4_to_10` | `pm4_to_10_num` | PM 4.0-10μm | #/cm³ | measurements.pm_ug_m3 |
| `sen55_temp_c` or `dps_temp_c` | `sen55_temp_c` | Temperature | °C | measurements |
| `sen55_humidity_pct` | `sen55_humidity_pct` | Humidity | % | measurements |
| `pressure_hpa` | `dps310_pressure_hpa` | Pressure | hPa | measurements |
| `voc_index` | `sen55_voc_index` | VOC Index | index | measurements |
| `nox_index` | `sen55_nox_index` | NOx Index | index | measurements |
| `esp_temp_c` | `esp_temp_c` | ESP Temperature | °C | diagnostics |
| `wifi_rssi_dbm` | `wifi_rssi_dbm` | Signal Strength | dBm | diagnostics |
| `uptime_s` | `uptime_s` | Uptime | seconds | diagnostics |

## Naming Convention

- **Gas sensors**: `{gas}_ppm` (e.g., `co2_ppm`, `no2_ppm`)
- **PM mass**: `pm{size}_ug_m3` (e.g., `pm2_5_ug_m3`)
- **PM count**: `pm{range}_num` (e.g., `pm0_3_to_1_num`)
- **Environmental**: `{sensor}_{metric}_{unit}` (e.g., `sen55_temp_c`, `dps310_pressure_hpa`)
- **System**: `{metric}_{unit}` (e.g., `wifi_rssi_dbm`, `uptime_s`)

## Implementation Notes

- **Temperature**: Falls back to `dps_temp_c` if `sen55_temp_c` is not present
- **Transparent mapping**: JSON field names match database sensor names (no translation layer)
- **Null/NaN handling**: Values that are null, undefined, or NaN are automatically skipped
- **Server timestamps**: All readings use server time, ignoring device-provided timestamps

## Total Sensor Count

**23 sensors** actively mapped and stored:
- 7 gas sensors (CO₂, NO₂, CO, H₂, Ethanol, CH₄, NH₃)
- 8 PM sensors (4 mass + 4 count)
- 5 environmental (temp, humidity, pressure, VOC, NOx)
- 3 system (ESP temp, WiFi, uptime)
