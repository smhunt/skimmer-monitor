# Changelog

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
