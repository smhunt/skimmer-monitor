# MQTT Topic Schema

## Published Topics (device → broker)

| Topic | Payload | Frequency | Description |
|-------|---------|-----------|-------------|
| `pool/skimmer/level` | float (mm) | Every wake (5 min) | Current water level from skimmer bottom |
| `pool/skimmer/temperature` | float (°C) | Every wake | Enclosure temperature |
| `pool/skimmer/humidity` | float (%) | Every wake | Enclosure relative humidity |
| `pool/skimmer/battery` | float (V) | Every wake | Battery voltage |
| `pool/skimmer/fills_today` | int | Every wake | Daily fill count |
| `pool/skimmer/total_fills` | int | Every wake | Lifetime fill count |

### Chemistry topics (pool-health expansion, PH-1)

Published by the chemistry sense board once bench-ready (PH-2); see
`docs/pool-health-build-plan.md`. MQTT `+` matches a single level, so
`pool/skimmer/+` does **not** catch these — the ingest bridge subscribes
`pool/skimmer/chem/+` separately and writes them to `chem_readings`.

| Topic | Payload | Frequency | Description |
|-------|---------|-----------|-------------|
| `pool/skimmer/chem/orp` | float (mV) | ~60 s while circulating | Oxidation-reduction potential (sanitizer proxy) |
| `pool/skimmer/chem/ph` | float | ~60 s | pH |
| `pool/skimmer/chem/water_temp` | float (°C) | ~60 s | Pool water temperature |
| `pool/skimmer/chem/tds` | float (ppm) | ~5 min | Total dissolved solids / salinity |
| `pool/skimmer/chem/turbidity` | float (NTU) | ~5 min | Clarity (nephelometric) |
| `pool/skimmer/chem/flow` | bool | on change | Circulation flow present |

## Particle Cloud Events (device → cloud)

| Event | Payload | Trigger |
|-------|---------|---------|
| `skimmer/reading` | JSON | Every wake — full sensor snapshot |
| `skimmer/fill` | "start" or "stop" | Fill cycle state change |
| `skimmer/alert` | string | Anomaly detected (see below) |
| `skimmer/calibrate` | string | Calibration function called |
| `skimmer/error` | string | Sensor init failure |
| `skimmer/health` | JSON | Analyzer health score + top recommendation (pool-health) |
| `skimmer/chem-alert` | string | Chemistry out of band (e.g. pH < 7.2, ORP < 650 mV) |
| `skimmer/clarity-alert` | string | Turbidity rising toward algae threshold |

The three pool-health events reuse the `skimmer_events` table (categories
`health` / `chem-alert` / `clarity-alert`) — no new events table.

### Alert payloads

- `condensation` — humidity > 85% inside enclosure
- `low-battery` — battery voltage < 3.5V
- `no-rise-aborting` — fill running but water not rising (stuck valve/no supply)
- `max-fills-exceeded` — daily fill count limit reached (possible leak)

## Subscribed Topics (broker → device)

Reserved for future use. The MQTT callback is wired up but doesn't currently process any commands. Use Particle.function() calls for remote control instead — they're more reliable across NAT.

## Example Payloads

### `skimmer/reading` (JSON event):
```json
{
  "level_mm": 142.3,
  "temp_c": 24.7,
  "humidity": 62.1,
  "battery_v": 3.92,
  "fills_today": 1,
  "total_fills": 47
}
```

### MQTT raw payloads (one value per topic):
```
pool/skimmer/level         142.3
pool/skimmer/temperature   24.7
pool/skimmer/humidity      62.1
pool/skimmer/battery       3.92
pool/skimmer/fills_today   1
pool/skimmer/total_fills   47
```

### Chemistry raw payloads (one value per topic):
```
pool/skimmer/chem/orp         712
pool/skimmer/chem/ph          7.4
pool/skimmer/chem/water_temp  26.1
pool/skimmer/chem/tds         340
pool/skimmer/chem/turbidity   0.8
pool/skimmer/chem/flow        true
```

## Retention Policy Recommendations

In your Mosquitto config or HA MQTT settings:

- `pool/skimmer/level` — retain ON (last-known-good for dashboards)
- `pool/skimmer/battery` — retain ON
- `pool/skimmer/fills_today` — retain ON
- `skimmer/alert` — retain OFF (don't replay old alerts on subscribe)
- `skimmer/fill` — retain OFF

## Integrating with Existing Postgres

If you're piping to the same Postgres instance as the sump pump monitor, suggested schema:

```sql
CREATE TABLE skimmer_readings (
  ts          TIMESTAMPTZ PRIMARY KEY DEFAULT now(),
  level_mm    REAL NOT NULL,
  temp_c      REAL,
  humidity    REAL,
  battery_v   REAL,
  fills_today INT
);

CREATE TABLE skimmer_events (
  ts       TIMESTAMPTZ PRIMARY KEY DEFAULT now(),
  category TEXT NOT NULL,   -- 'fill', 'alert', 'error'
  payload  TEXT NOT NULL
);

CREATE INDEX skimmer_readings_ts ON skimmer_readings (ts DESC);
CREATE INDEX skimmer_events_cat_ts ON skimmer_events (category, ts DESC);
```

The pool-health expansion adds a `chem_readings` table alongside these. For the
authoritative, current schema (including `chem_readings`) apply
`integration/schema.sql` rather than the snippet above.

See `integration/src/ingest.ts` for a TypeScript MQTT-to-Postgres bridge that matches the sump pump monitor pattern, and `integration/README.md` for setup. The same package provides an MCP server (`integration/src/mcp-server.ts`) exposing skimmer tools to Claude.
