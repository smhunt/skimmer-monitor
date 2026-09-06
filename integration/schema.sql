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

-- --------------------------------------------------------------------------
-- Pool-health expansion (PH-1 data contract). See docs/pool-health-build-plan.md.
-- Additive and idempotent: the level + auto-fill pipeline above is unaffected.
-- Populated by the ingest bridge from pool/skimmer/chem/* once the chemistry
-- sense board (PH-2) is publishing; empty until then.
-- Health/chemistry events ('health', 'chem-alert', 'clarity-alert') reuse the
-- existing skimmer_events table — no new events table needed.
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS chem_readings (
  ts            TIMESTAMPTZ PRIMARY KEY DEFAULT now(),
  orp_mv        REAL,
  ph            REAL,
  water_temp_c  REAL,
  tds_ppm       REAL,
  turbidity_ntu REAL,
  flow          BOOLEAN
);

CREATE INDEX IF NOT EXISTS chem_readings_ts ON chem_readings (ts DESC);
