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
- Deploy ingest bridge to server (10.10.10.24), apply schema.sql
- Order parts, breadboard prototype (Phase 2)

---

## 2026-07-05 — MCP server registered with Claude

**What changed**:
- Registered the skimmer MCP server with Claude Code at user scope:
  `claude mcp add skimmer --scope user -- npx tsx .../integration/src/mcp-server.ts`
- Verified: `claude mcp get skimmer` reports ✔ Connected

**Open issues**:
- `DATABASE_URL` not yet configured — defaults to `postgresql://localhost/iot`; data tools will error until the ingest pipeline is deployed and reachable. Re-register with `--env DATABASE_URL=...` once known.
- `force_fill` requires `PARTICLE_TOKEN` / `PARTICLE_DEVICE` env — add via `--env` after the Photon 2 is claimed.

**Next**:
- Apply schema.sql + run ingest bridge under PM2 on the Mosquitto/Postgres host (10.10.10.24), then re-register MCP server with real DATABASE_URL

---

## 2026-07-06 — Phase 0 spike: Smart Skimmer AI vision

**What changed**:
- Started exploration branch `claude/smart-pool-skimmer-24324s` for an entirely new
  AI-driven pool-health system that follows, tracks, records, and analyzes overall pool
  health — not just water level.
- Wrote `docs/smart-skimmer-ai-vision.md`: motivation, four health pillars (chemistry,
  clarity, circulation, equipment/environment), a separate-power-domain sense-board
  architecture (ESP32-S3 + ORP/pH/temp/TDS/turbidity), a draft MQTT/Postgres data
  contract, an AI layer split between a deterministic analyzer service and Claude via
  new MCP tools, and a phased plan (0→E).

**Why**:
- The skimmer sees 100% of circulated water, making it the ideal listening post for a
  broader health mission. This is a design spike to decide *whether/how* to expand
  without disturbing the safety-critical level + auto-fill firmware.

**Tested**:
- None — documentation-only exploration. No hardware spend, no firmware change.

**Open issues**:
- Probe placement (in-skimmer vs. inline return), probe calibration/drift detection,
  pool-volume input for dose math, weather-API provider + network policy, automated
  dosing deferred pending a separate safety review. See doc §8.

**Next**:
- Review/refine the vision, pick the second MCU, then Phase A sense-board bring-up
  (after the current device clears bench test + deployment, Phases 2–5).

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
