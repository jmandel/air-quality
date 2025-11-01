-- Phase 2: Create aggregation table for long-term storage
-- Minutely summaries allow 94% storage reduction

CREATE TABLE IF NOT EXISTS readings_aggregated (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    minute_ts INTEGER NOT NULL,
    sensor_id INTEGER NOT NULL,
    avg_value REAL NOT NULL,
    min_value REAL NOT NULL,
    max_value REAL NOT NULL,
    sample_count INTEGER NOT NULL,
    UNIQUE(minute_ts, sensor_id),
    FOREIGN KEY (sensor_id) REFERENCES sensors(id)
);

CREATE INDEX IF NOT EXISTS idx_agg_minute_ts ON readings_aggregated(minute_ts);
CREATE INDEX IF NOT EXISTS idx_agg_sensor_id ON readings_aggregated(sensor_id);
CREATE INDEX IF NOT EXISTS idx_agg_lookup ON readings_aggregated(sensor_id, minute_ts);

-- Backfill historical data into aggregated table
INSERT OR IGNORE INTO readings_aggregated
  (minute_ts, sensor_id, avg_value, min_value, max_value, sample_count)
SELECT
  (ts / 60000) * 60000 as minute_ts,
  sensor_id,
  AVG(value) as avg_value,
  MIN(value) as min_value,
  MAX(value) as max_value,
  COUNT(*) as sample_count
FROM readings
WHERE value IS NOT NULL AND sensor_id IS NOT NULL
GROUP BY minute_ts, sensor_id;
