// Seed data for sensors table
// This is the canonical list of all sensors in the AIR-1 system

export const SENSOR_SEED_DATA = [
  // Gas sensors (ppm)
  { id: 1, name: 'sensor-co2', display_name: 'CO₂', unit: 'ppm' },
  { id: 2, name: 'sensor-carbon_monoxide', display_name: 'CO', unit: 'ppm' },
  { id: 3, name: 'sensor-ethanol', display_name: 'Ethanol', unit: 'ppm' },
  { id: 4, name: 'sensor-ammonia', display_name: 'Ammonia', unit: 'ppm' },
  { id: 5, name: 'sensor-nitrogen_dioxide', display_name: 'NO₂', unit: 'ppm' },
  { id: 6, name: 'sensor-methane', display_name: 'Methane', unit: 'ppm' },
  { id: 7, name: 'sensor-hydrogen', display_name: 'Hydrogen', unit: 'ppm' },

  // Particulate matter (µg/m³)
  { id: 8, name: 'sensor-pm__1_m_weight_concentration', display_name: 'PM 1.0', unit: 'µg/m³' },
  { id: 9, name: 'sensor-pm__2_5_m_weight_concentration', display_name: 'PM 2.5', unit: 'µg/m³' },
  { id: 10, name: 'sensor-pm__4_m_weight_concentration', display_name: 'PM 4.0', unit: 'µg/m³' },
  { id: 11, name: 'sensor-pm__10_m_weight_concentration', display_name: 'PM 10', unit: 'µg/m³' },

  // Particulate count sensors
  { id: 12, name: 'sensor-pm_0_3_to_1__m', display_name: 'PM 0.3-1.0μm', unit: '#/cm³' },
  { id: 13, name: 'sensor-pm_1_to_2_5__m', display_name: 'PM 1.0-2.5μm', unit: '#/cm³' },
  { id: 14, name: 'sensor-pm_2_5_to_4__m', display_name: 'PM 2.5-4.0μm', unit: '#/cm³' },
  { id: 15, name: 'sensor-pm_4_to_10__m', display_name: 'PM 4.0-10μm', unit: '#/cm³' },

  // Environmental sensors
  { id: 16, name: 'sensor-sen55_temperature', display_name: 'Temperature', unit: '°C' },
  { id: 17, name: 'sensor-esp_temperature', display_name: 'ESP Temperature', unit: '°C' },
  { id: 18, name: 'sensor-sen55_humidity', display_name: 'Humidity', unit: '%' },
  { id: 19, name: 'sensor-dps310_pressure', display_name: 'Pressure', unit: 'hPa' },
  { id: 20, name: 'sensor-sen55_voc', display_name: 'VOC Index', unit: 'index' },
  { id: 21, name: 'sensor-sen55_nox', display_name: 'NOx Index', unit: 'index' },

  // System sensors
  { id: 22, name: 'sensor-rssi', display_name: 'Signal Strength', unit: 'dBm' },
  { id: 23, name: 'sensor-uptime', display_name: 'Uptime', unit: 'seconds' },

  // Additional sensors
  { id: 24, name: 'binary_sensor-online', display_name: 'Online Status', unit: null },
  { id: 25, name: 'button-calibrate_scd40_to_420ppm', display_name: 'Calibrate SCD40', unit: null },
  { id: 26, name: 'button-clean_sen55', display_name: 'Clean SEN55', unit: null },
  { id: 27, name: 'button-esp_reboot', display_name: 'Reboot', unit: null },
  { id: 28, name: 'button-factory_reset_esp', display_name: 'Factory Reset', unit: null },
  { id: 29, name: 'light-rgb_light', display_name: 'RGB Light', unit: null },
  { id: 30, name: 'number-sen55_humidity_offset', display_name: 'Humidity Offset', unit: '%' },
  { id: 31, name: 'number-sen55_temperature_offset', display_name: 'Temperature Offset', unit: '°C' },
  { id: 32, name: 'number-sleep_duration', display_name: 'Sleep Duration', unit: 'seconds' },
  { id: 33, name: 'switch-prevent_sleep', display_name: 'Prevent Sleep', unit: null },
  { id: 34, name: 'text_sensor-voc_quality', display_name: 'VOC Quality', unit: null },
];
