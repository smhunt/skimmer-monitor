# Progress Log: Skimmer Water Level Monitor

## 2026-06-02 — Initial Scaffold

- Created project structure per Particle Workbench conventions
- Wrote `skimmer-monitor.ino` with sensor reads, fill control, dual cloud/MQTT publishing
- Defined `config.h` with all tunable parameters (no magic numbers in main code)
- Documented hardware BOM, wiring, calibration procedure

**Status**: Phase 1 complete. Ready for bench test.

**Next**: Order parts from BC Robotics / Solarbotics. Breadboard prototype.

---

## 2026-07-05 — Integration layer + dependency fix

**What changed**:
- Created `integration/` TypeScript package: MQTT→Postgres ingest bridge (moved from `scripts/postgres-ingest.ts`) + new MCP server with `get_skimmer_level`, `get_fill_history`, `force_fill`, `get_evaporation_rate`
- Added `integration/schema.sql` (readings + events tables from docs/mqtt-schema.md)
- Fixed `project.properties`: `SparkFun_VL53L1X=4.0.0` doesn't exist in the Particle registry — corrected to `SparkFun_VL53L1X_Arduino_Library=1.2.9` (header include unchanged)

**Why**:
- Phase 5 software work that doesn't require hardware; the bad library pin would have failed the first `particle compile`

**Tested**:
- `tsc --noEmit` clean; MCP server smoke-tested over stdio (initialize + tools/list returns all 4 tools)
- Not yet tested against a live broker/database — needs deployment to the Mosquitto/Postgres host

**Open issues**:
- Sump pump monitor repo isn't on this machine; MCP server built standalone here instead of extending it
- `force_fill` needs PARTICLE_TOKEN/PARTICLE_DEVICE configured wherever the MCP server runs

**Next**:
- Deploy ingest bridge to server (10.10.10.24), apply schema.sql, register MCP server with Claude
- Order parts, breadboard prototype (Phase 2)

---

## Checkpoint Template (for future entries)

### YYYY-MM-DD — Brief title

**What changed**:
-

**Why**:
-

**Tested**:
-

**Open issues**:
-

**Next**:
-
