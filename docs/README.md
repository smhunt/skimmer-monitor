# Architecture & API Documentation

Wireless in-skimmer water level monitor with auto-fill control. This document covers the
system architecture, data flow, and every integration surface. For step-by-step
installation, see [SETUP.md](SETUP.md).

## System Overview

```
 ┌─────────────────────────── Pool skimmer ───────────────────────────┐
 │  ┌──────────────────────────────────────────────────────────────┐  │
 │  │  Photon  ── I²C ── VL53L1X (ToF, through glass window)      │  │
 │  │     │       I²C ── SHT41 (enclosure temp/humidity)           │  │
 │  │     │       A0  ── battery divider (18650 + solar)           │  │
 │  │     └────── D7  ── relay ──► fill valve (hose bib)           │  │
 │  └──────────────────────────────────────────────────────────────┘  │
 └───────────────┬──────────────────────────────┬─────────────────────┘
                 │ WiFi                         │ WiFi
                 ▼                              ▼
        Particle Cloud                 Mosquitto broker
     (variables, functions,           (pool/skimmer/+ topics)
      skimmer/* events)                        │
                 │                    ┌────────┴──────────┐
                 │                    ▼                   ▼
                 │           integration/ingest    Home Assistant
                 │                    │             (docs/home-assistant.yaml)
                 │                    ▼
                 │               Postgres  (skimmer_readings, skimmer_events)
                 │                    │
                 ▼                    ▼
          force_fill tool ◄── skimmer MCP server ──► Claude
                              (integration/src/mcp-server.ts)
```

Every 5 minutes (`SLEEP_DURATION_S`) the device wakes, takes a median-filtered ToF
reading, publishes to both Particle Cloud and MQTT, runs the auto-fill decision, and
sleeps. `retained` variables preserve fill counters across sleep cycles.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| MCU | Original Particle Photon (Device OS 2.x LTS) — primary; also builds for Photon 2 (Device OS 6.x). `SYSTEM_MODE(SEMI_AUTOMATIC)` + threading |
| Level sensing | VL53L1X time-of-flight (SparkFun_VL53L1X_Arduino_Library 1.2.9), 7-sample median |
| Environment | SHT41 (adafruit-sht31 0.0.7) — condensation early warning |
| Power | 18650 Li-ion + 2W solar, 2:1 divider on A0 (see README for the original-Photon power caveat) |
| Transport | Particle Cloud (TLS) + MQTT 0.4.32 → Mosquitto |
| Storage | Postgres (`skimmer_readings`, `skimmer_events`) |
| Ingestion | TypeScript bridge (`integration/src/ingest.ts`), mqtt + pg, PM2 |
| AI access | MCP server over stdio (`integration/src/mcp-server.ts`), @modelcontextprotocol/sdk |
| Dashboards | Home Assistant (MQTT discovery), pool dashboard at 10.10.10.24:3025 |

## File Structure

```
skimmer-monitor/
├── src/
│   ├── skimmer-monitor.ino     Firmware: sensing, auto-fill, publishing, sleep
│   └── config.h                All tunables — no magic numbers in main code
├── integration/
│   ├── src/ingest.ts           MQTT → Postgres bridge (long-lived, PM2)
│   ├── src/mcp-server.ts       MCP server: 4 skimmer tools for Claude
│   ├── src/particle.ts         Particle Cloud function caller
│   ├── src/db.ts               Shared pg pool
│   └── schema.sql              Postgres DDL
├── hardware/                   BOM (Canadian suppliers), wiring, enclosure
├── docs/                       This file, SETUP.md, calibration, MQTT schema, HA config
├── scripts/monitor.sh          CLI MQTT subscriber for bench testing
└── test/bench-test.md          Pre-deployment checklist
```

## Firmware API

### Particle Cloud variables (poll via REST)

| Variable | Type | Description |
|----------|------|-------------|
| `level_mm` | double | Water level, mm above skimmer bottom |
| `temp_c` | double | Enclosure temperature |
| `humidity` | double | Enclosure relative humidity |
| `battery_v` | double | Battery voltage |
| `fills_today` | int | Fill cycles since midnight |
| `total_fills` | int | Lifetime fill cycles |

`GET https://api.particle.io/v1/devices/{device}/level_mm` with a bearer token.

### Particle Cloud functions

| Function | Argument | Returns | Description |
|----------|----------|---------|-------------|
| `fill` | — | ≥0 ok, <0 rejected | Start a fill; all interlocks still apply |
| `stop` | — | ≥0 | Abort any in-progress fill immediately |
| `reset` | — | ≥0 | Zero the daily fill counter |
| `calibrate` | — | baseline mm | Empty-skimmer baseline for `SKIMMER_DEPTH_MM` |

### Events and MQTT topics

See [mqtt-schema.md](mqtt-schema.md) for the full topic table, payload examples, and
retention recommendations. Summary: readings go to `pool/skimmer/<field>` (one float per
topic), lifecycle events to `skimmer/<category>` (`reading` JSON snapshot, `fill`
start/stop, `alert`, `error`).

## Safety Interlocks (firmware-enforced)

These live on the device and **cannot be bypassed** by any cloud/MQTT/MCP caller:

1. `MAX_FILL_DURATION_MS` (10 min) hard timeout aborts any fill
2. `MAX_DAILY_FILLS` (6) cap — exceeding it raises a leak alert and blocks further fills
3. Rate-of-rise check: no `MIN_RISE_MM` rise after `RATE_CHECK_DELAY_MS` → abort (stuck valve / no supply)
4. Battery lockout below `LOW_BATTERY_THRESHOLD` (3.5 V)
5. `fill` / `stop` cloud functions always registered — manual override always available

## Database Schema

Two tables, defined in `integration/schema.sql`:

- `skimmer_readings(ts, level_mm, temp_c, humidity, battery_v, fills_today)` — one row
  per wake cycle, assembled from the multi-topic MQTT publish with a 2 s debounce
- `skimmer_events(ts, category, payload)` — fills, alerts, errors, calibrations

## MCP Server

Registered with Claude Code as `skimmer` (user scope). Tools:

| Tool | Backing | Description |
|------|---------|-------------|
| `get_skimmer_level` | Postgres | Latest snapshot + reading age in minutes |
| `get_fill_history(days)` | Postgres | Paired start/stop fill cycles with durations, plus alerts |
| `force_fill(action)` | Particle Cloud | `fill` or `stop`; reports whether the device accepted it |
| `get_evaporation_rate(days)` | Postgres | Avg daily level drop, excluding days with fills |

Requires `DATABASE_URL`; `force_fill` additionally needs `PARTICLE_TOKEN` and
`PARTICLE_DEVICE`. See [SETUP.md](SETUP.md#6-mcp-server-claude-integration).

## Anomaly Detection (Phase 6, planned)

- 7-day rolling baseline of daily fill volume; alert on >2σ deviation (leak indicator)
- Weekly evaporation trend correlated with temperature
- Rainfall cross-check against weather API
