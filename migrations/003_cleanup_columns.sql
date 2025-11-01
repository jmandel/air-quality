-- Phase 3: Remove legacy columns from readings table
-- After migration to sensor_id normalization, these columns are no longer needed:
-- - sensorId (TEXT): replaced by sensor_id (INTEGER)
-- - state (TEXT): unused field
-- - eventId (TEXT): unused field

-- SQLite doesn't support DROP COLUMN directly on tables with foreign keys,
-- so we need to recreate the table

-- Create new readings table with only the columns we need
CREATE TABLE readings_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts INTEGER NOT NULL,
    sensor_id INTEGER NOT NULL,
    value REAL,
    FOREIGN KEY (sensor_id) REFERENCES sensors(id)
);

-- Copy data from old table to new table
INSERT INTO readings_new (id, ts, sensor_id, value)
SELECT id, ts, sensor_id, value FROM readings;

-- Drop old table
DROP TABLE readings;

-- Rename new table to original name
ALTER TABLE readings_new RENAME TO readings;

-- Recreate indexes
CREATE INDEX idx_readings_ts ON readings(ts);
CREATE INDEX idx_readings_sensor_id ON readings(sensor_id);
CREATE INDEX idx_readings_sensor_ts ON readings(sensor_id, ts);
