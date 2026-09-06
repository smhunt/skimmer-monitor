# Skimmer Integration

MQTT→Postgres ingestion bridge and MCP server for the skimmer water level monitor.
Mirrors the sump pump monitor pattern and shares its Mosquitto broker and Postgres instance.

## Setup

```bash
npm install
cp .env.example .env    # fill in broker, database, Particle credentials
psql "$DATABASE_URL" -f schema.sql
```

## Ingestion bridge

Subscribes to `pool/skimmer/+` (readings), `pool/skimmer/chem/+` (chemistry —
pool-health expansion), and `skimmer/+` (events), assembles multi-topic readings
into single rows, and writes to `skimmer_readings` / `chem_readings` /
`skimmer_events`.

```bash
npm run ingest          # dev
pm2 start "npx tsx src/ingest.ts" --name skimmer-ingest   # production
```

## MCP server

Exposes the skimmer to Claude over stdio:

| Tool | Description |
|------|-------------|
| `get_skimmer_level` | Latest sensor snapshot + reading age |
| `get_fill_history(days)` | Fill cycles with durations, plus alerts |
| `force_fill(action)` | Start/stop fill via Particle Cloud (firmware interlocks stay authoritative) |
| `get_evaporation_rate(days)` | Avg daily water loss, fill days excluded |
| `get_chem_history(days)` | Hourly ORP/pH/temp/TDS/turbidity trends + latest snapshot (empty until PH-2) |

Register with Claude Code:

```bash
claude mcp add skimmer -- npx tsx /path/to/skimmer-monitor/integration/src/mcp-server.ts
```

`force_fill` requires `PARTICLE_TOKEN` and `PARTICLE_DEVICE` in the environment.
The read-only tools need only `DATABASE_URL`.

## Environment

| Variable | Default | Used by |
|----------|---------|---------|
| `MQTT_URL` | `mqtt://localhost:1883` | ingest |
| `DATABASE_URL` | `postgresql://localhost/iot` | ingest, MCP |
| `PARTICLE_TOKEN` | — | MCP `force_fill` |
| `PARTICLE_DEVICE` | — | MCP `force_fill` |
