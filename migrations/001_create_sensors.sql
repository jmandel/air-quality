-- Phase 1: Create sensors table and populate with all known sensors
-- This normalizes sensor references from TEXT (24 bytes) to INTEGER (1 byte)

CREATE TABLE IF NOT EXISTS sensors (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,    -- "sensor-co2"
    display_name TEXT,             -- "CO₂"
    unit TEXT                      -- "ppm", "°C", "µg/m³"
);

-- Gas sensors (ppm)
INSERT OR IGNORE INTO sensors (id, name, display_name, unit) VALUES
    (1, 'sensor-co2', 'CO₂', 'ppm'),
    (2, 'sensor-carbon_monoxide', 'CO', 'ppm'),
    (3, 'sensor-ethanol', 'Ethanol', 'ppm'),
    (4, 'sensor-ammonia', 'Ammonia', 'ppm'),
    (5, 'sensor-nitrogen_dioxide', 'NO₂', 'ppm'),
    (6, 'sensor-methane', 'Methane', 'ppm'),
    (7, 'sensor-hydrogen', 'Hydrogen', 'ppm');

-- Particulate matter (µg/m³)
INSERT OR IGNORE INTO sensors (id, name, display_name, unit) VALUES
    (8, 'sensor-pm__1_m_weight_concentration', 'PM 1.0', 'µg/m³'),
    (9, 'sensor-pm__2_5_m_weight_concentration', 'PM 2.5', 'µg/m³'),
    (10, 'sensor-pm__4_m_weight_concentration', 'PM 4.0', 'µg/m³'),
    (11, 'sensor-pm__10_m_weight_concentration', 'PM 10', 'µg/m³');

-- Particulate count sensors (no unit - count)
INSERT OR IGNORE INTO sensors (id, name, display_name, unit) VALUES
    (12, 'sensor-pm_0_3_to_1__m', 'PM 0.3-1.0μm', '#/cm³'),
    (13, 'sensor-pm_1_to_2_5__m', 'PM 1.0-2.5μm', '#/cm³'),
    (14, 'sensor-pm_2_5_to_4__m', 'PM 2.5-4.0μm', '#/cm³'),
    (15, 'sensor-pm_4_to_10__m', 'PM 4.0-10μm', '#/cm³');

-- Environmental sensors
INSERT OR IGNORE INTO sensors (id, name, display_name, unit) VALUES
    (16, 'sensor-sen55_temperature', 'Temperature', '°C'),
    (17, 'sensor-esp_temperature', 'ESP Temperature', '°C'),
    (18, 'sensor-sen55_humidity', 'Humidity', '%'),
    (19, 'sensor-dps310_pressure', 'Pressure', 'hPa'),
    (20, 'sensor-sen55_voc', 'VOC Index', 'index'),
    (21, 'sensor-sen55_nox', 'NOx Index', 'index');

-- System sensors
INSERT OR IGNORE INTO sensors (id, name, display_name, unit) VALUES
    (22, 'sensor-rssi', 'Signal Strength', 'dBm'),
    (23, 'sensor-uptime', 'Uptime', 'seconds');

-- Additional sensors that may exist
INSERT OR IGNORE INTO sensors (id, name, display_name, unit) VALUES
    (24, 'binary_sensor-online', 'Online Status', NULL),
    (25, 'button-calibrate_scd40_to_420ppm', 'Calibrate SCD40', NULL),
    (26, 'button-clean_sen55', 'Clean SEN55', NULL),
    (27, 'button-esp_reboot', 'Reboot', NULL),
    (28, 'button-factory_reset_esp', 'Factory Reset', NULL),
    (29, 'light-rgb_light', 'RGB Light', NULL),
    (30, 'number-sen55_humidity_offset', 'Humidity Offset', '%'),
    (31, 'number-sen55_temperature_offset', 'Temperature Offset', '°C'),
    (32, 'number-sleep_duration', 'Sleep Duration', 'seconds'),
    (33, 'switch-prevent_sleep', 'Prevent Sleep', NULL),
    (34, 'text_sensor-voc_quality', 'VOC Quality', NULL);

-- Add sensor_id column to readings table
ALTER TABLE readings ADD COLUMN sensor_id INTEGER REFERENCES sensors(id);

-- Create indexes for sensor_id
CREATE INDEX IF NOT EXISTS idx_readings_sensor_id ON readings(sensor_id);
CREATE INDEX IF NOT EXISTS idx_readings_sensor_ts ON readings(sensor_id, ts);

-- Populate sensor_id from sensorId
UPDATE readings
SET sensor_id = (SELECT id FROM sensors WHERE sensors.name = readings.sensorId)
WHERE sensor_id IS NULL;
