-- Skimmer monitor schema
-- Apply to the same Postgres instance used by the sump pump monitor:
--   psql "$DATABASE_URL" -f schema.sql

CREATE TABLE IF NOT EXISTS skimmer_readings (
  ts          TIMESTAMPTZ PRIMARY KEY DEFAULT now(),
  level_mm    REAL NOT NULL,
  temp_c      REAL,
  humidity    REAL,
  battery_v   REAL,
  fills_today INT
);

CREATE TABLE IF NOT EXISTS skimmer_events (
  ts       TIMESTAMPTZ PRIMARY KEY DEFAULT now(),
  category TEXT NOT NULL,   -- 'fill', 'alert', 'error', 'calibrate'
  payload  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS skimmer_readings_ts ON skimmer_readings (ts DESC);
CREATE INDEX IF NOT EXISTS skimmer_events_cat_ts ON skimmer_events (category, ts DESC);
