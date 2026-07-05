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

## Particle Cloud Events (device → cloud)

| Event | Payload | Trigger |
|-------|---------|---------|
| `skimmer/reading` | JSON | Every wake — full sensor snapshot |
| `skimmer/fill` | "start" or "stop" | Fill cycle state change |
| `skimmer/alert` | string | Anomaly detected (see below) |
| `skimmer/calibrate` | string | Calibration function called |
| `skimmer/error` | string | Sensor init failure |

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

See `integration/src/ingest.ts` for a TypeScript MQTT-to-Postgres bridge that matches the sump pump monitor pattern, and `integration/README.md` for setup. The same package provides an MCP server (`integration/src/mcp-server.ts`) exposing skimmer tools to Claude.
