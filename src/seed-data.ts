// Seed data for sensors table
// Sensor names match the JSON field names from Apollo AIR-1 device exactly

export const SENSOR_SEED_DATA = [
  // === CO2 (SCD40 sensor) ===
  { id: 1, name: 'co2_ppm', display_name: 'CO₂', unit: 'ppm' },

  // === Temperature & Humidity (SEN55 sensor) ===
  { id: 2, name: 'sen55_temp_c', display_name: 'Temperature (SEN55)', unit: '°C' },
  { id: 3, name: 'sen55_humidity_pct', display_name: 'Humidity', unit: '%' },

  // === VOC & NOx Indices (SEN55 sensor) ===
  { id: 4, name: 'voc_index', display_name: 'VOC Index', unit: '' },
  { id: 5, name: 'nox_index', display_name: 'NOx Index', unit: '' },

  // === Pressure & Temperature (DPS310 barometric sensor) ===
  { id: 6, name: 'pressure_hpa', display_name: 'Pressure', unit: 'hPa' },
  { id: 7, name: 'dps_temp_c', display_name: 'Temperature (DPS310)', unit: '°C' },

  // === Particulate Matter Mass (SEN55 sensor, µg/m³) ===
  { id: 8, name: 'pm1', display_name: 'PM 1.0', unit: 'µg/m³' },
  { id: 9, name: 'pm2_5', display_name: 'PM 2.5', unit: 'µg/m³' },
  { id: 10, name: 'pm4', display_name: 'PM 4.0', unit: 'µg/m³' },
  { id: 11, name: 'pm10', display_name: 'PM 10', unit: 'µg/m³' },

  // === Particulate Matter Counts (SEN55 sensor, µg/m³ bins) ===
  { id: 12, name: 'pm0_3_to_1', display_name: 'PM 0.3-1.0μm', unit: 'µg/m³' },
  { id: 13, name: 'pm1_to_2_5', display_name: 'PM 1.0-2.5μm', unit: 'µg/m³' },
  { id: 14, name: 'pm2_5_to_4', display_name: 'PM 2.5-4.0μm', unit: 'µg/m³' },
  { id: 15, name: 'pm4_to_10', display_name: 'PM 4.0-10μm', unit: 'µg/m³' },

  // === Gas Sensors (MICS-4514 sensor, ppm) ===
  { id: 16, name: 'no2', display_name: 'NO₂', unit: 'ppm' },
  { id: 17, name: 'co', display_name: 'CO', unit: 'ppm' },
  { id: 18, name: 'h2', display_name: 'Hydrogen', unit: 'ppm' },
  { id: 19, name: 'ethanol', display_name: 'Ethanol', unit: 'ppm' },
  { id: 20, name: 'ch4', display_name: 'Methane', unit: 'ppm' },
  { id: 21, name: 'nh3', display_name: 'Ammonia', unit: 'ppm' },

  // === System Diagnostics (ESP32) ===
  { id: 22, name: 'esp_temp_c', display_name: 'ESP Temperature', unit: '°C' },
  { id: 23, name: 'wifi_rssi_dbm', display_name: 'Signal Strength', unit: 'dBm' },
  { id: 24, name: 'uptime_s', display_name: 'Uptime', unit: 'seconds' },
];
