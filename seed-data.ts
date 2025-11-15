// Seed data for sensors table
// Sensor names match the JSON field names from Apollo AIR-1 device for consistency

export const SENSOR_SEED_DATA = [
  // Gas sensors (ppm)
  { id: 1, name: 'co2_ppm', display_name: 'CO₂', unit: 'ppm' },
  { id: 2, name: 'co_ppm', display_name: 'CO', unit: 'ppm' },
  { id: 3, name: 'ethanol_ppm', display_name: 'Ethanol', unit: 'ppm' },
  { id: 4, name: 'nh3_ppm', display_name: 'Ammonia', unit: 'ppm' },
  { id: 5, name: 'no2_ppm', display_name: 'NO₂', unit: 'ppm' },
  { id: 6, name: 'ch4_ppm', display_name: 'Methane', unit: 'ppm' },
  { id: 7, name: 'h2_ppm', display_name: 'Hydrogen', unit: 'ppm' },

  // Particulate matter mass (µg/m³)
  { id: 8, name: 'pm1_ug_m3', display_name: 'PM 1.0', unit: 'µg/m³' },
  { id: 9, name: 'pm2_5_ug_m3', display_name: 'PM 2.5', unit: 'µg/m³' },
  { id: 10, name: 'pm4_ug_m3', display_name: 'PM 4.0', unit: 'µg/m³' },
  { id: 11, name: 'pm10_ug_m3', display_name: 'PM 10', unit: 'µg/m³' },

  // Particulate count (number/cm³)
  { id: 12, name: 'pm0_3_to_1_num', display_name: 'PM 0.3-1.0μm', unit: '#/cm³' },
  { id: 13, name: 'pm1_to_2_5_num', display_name: 'PM 1.0-2.5μm', unit: '#/cm³' },
  { id: 14, name: 'pm2_5_to_4_num', display_name: 'PM 2.5-4.0μm', unit: '#/cm³' },
  { id: 15, name: 'pm4_to_10_num', display_name: 'PM 4.0-10μm', unit: '#/cm³' },

  // Environmental sensors
  { id: 16, name: 'sen55_temp_c', display_name: 'Temperature', unit: '°C' },
  { id: 17, name: 'esp_temp_c', display_name: 'ESP Temperature', unit: '°C' },
  { id: 18, name: 'sen55_humidity_pct', display_name: 'Humidity', unit: '%' },
  { id: 19, name: 'dps310_pressure_hpa', display_name: 'Pressure', unit: 'hPa' },
  { id: 20, name: 'sen55_voc_index', display_name: 'VOC Index', unit: 'index' },
  { id: 21, name: 'sen55_nox_index', display_name: 'NOx Index', unit: 'index' },

  // System sensors
  { id: 22, name: 'wifi_rssi_dbm', display_name: 'Signal Strength', unit: 'dBm' },
  { id: 23, name: 'uptime_s', display_name: 'Uptime', unit: 'seconds' },

  // Additional sensors (for future use)
  { id: 24, name: 'online', display_name: 'Online Status', unit: null },
  { id: 25, name: 'sleep_duration_min', display_name: 'Sleep Duration', unit: 'minutes' },
  { id: 26, name: 'prevent_sleep', display_name: 'Prevent Sleep', unit: null },
  { id: 27, name: 'voc_quality', display_name: 'VOC Quality', unit: null },
  { id: 28, name: 'sen55_temp_offset_c', display_name: 'Temp Offset', unit: '°C' },
  { id: 29, name: 'sen55_hum_offset_pct', display_name: 'Humidity Offset', unit: '%' },
];
