# Changelog

## [Unreleased] — AI pool-health system (pool-first)
### Added
- **Design & roadmap** for an additive AI-driven pool-health system that tracks water
  chemistry, clarity, circulation, and equipment health — advisory/observational only, the
  safety-critical level + auto-fill firmware untouched:
  - `docs/smart-skimmer-ai-vision.md` — four-pillar vision, isolated sense-board architecture,
    analyzer-vs-Claude AI split
  - `docs/spa-health-monitor.md` — spa/hot-tub variant (planned later add-on)
  - `docs/pool-health-build-plan.md` — the build plan of record; phases PH-0…PH-5
- **Decision (2026-09-06):** build **pool-first**, add the spa as a later front-end on the
  same shared brain.
- **PH-1 data contract** (software, no hardware):
  - `chem_readings` table + index in `integration/schema.sql` (additive/idempotent)
  - Ingest bridge subscribes `pool/skimmer/chem/+` and writes `chem_readings`
  - `get_chem_history(days)` MCP tool (hourly ORP/pH/temp/TDS/turbidity trends)
  - `pool/skimmer/chem/*` topics + health/chem-alert/clarity-alert events documented in
    `docs/mqtt-schema.md`
- **PH-3 chemistry core** (software, deterministic): `integration/src/analyzer/chemistry.ts` —
  Langelier Saturation Index, chlorine dose calculator, and pH-adjustment estimate; all pure,
  unit-checked, clamped, advisory-only. 12 unit tests (`npm test`); added `test` + `typecheck`
  npm scripts.

## [0.2.0] - 2026-07-05
### Added
- `integration/` package: MQTT→Postgres ingestion bridge as a runnable TypeScript project (moved from `scripts/postgres-ingest.ts`)
- Skimmer MCP server (`integration/src/mcp-server.ts`) with tools: `get_skimmer_level`, `get_fill_history`, `force_fill`, `get_evaporation_rate`
- `integration/schema.sql` — Postgres schema for `skimmer_readings` and `skimmer_events`
### Fixed
- `project.properties` VL53L1X dependency: `SparkFun_VL53L1X=4.0.0` did not exist in the Particle registry; corrected to `SparkFun_VL53L1X_Arduino_Library=1.2.9`

## [0.1.0] - 2026-06-02
### Added
- Initial firmware scaffold: VL53L1X median-filtered level sensing, SHT41 environment monitoring, auto-fill control with safety interlocks, dual Particle Cloud + MQTT publishing, sleep cycle with retained state
- Hardware BOM, wiring guide, enclosure notes, calibration procedure
