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

## 2026-07-06 — Spa/hot-tub companion doc

**What changed**:
- Added a spa-first market angle to `docs/smart-skimmer-ai-vision.md` (new §9): why hot
  tubs may be the stronger wedge — small volume + high temp make chemistry the whole
  product, year-round use, mains power, no auto-fill safety envelope.
- Wrote `docs/spa-health-monitor.md`: spa-first companion with a draft sensing-head BOM
  (~CAD $230 bench proto), floating-puck-vs-inline placement tradeoff, bromine-vs-chlorine
  dose math (deterministic, advisory-only), data-contract delta (`sanitizer_mode`/`cover`),
  spa-tuned MCP tools, and a shared-brain phased plan (S0–S5).

**Why**:
- The analyzer/MQTT/Postgres/MCP "brain" is market-agnostic; only the sensing front-end and
  sanitizer math diverge. Spa is the leading candidate for the first front-end to ship.

**Tested**:
- None — documentation-only exploration. No hardware spend, no firmware change.

**Open issues**:
- Placement (lead inline for signal quality, productize puck later), probe life at 38 °C,
  strip-calibration UX, dosing liability for water people sit in, sales channel. See
  `spa-health-monitor.md` §9.

**Next**:
- Sean to pick market sequencing (spa-first vs. pool-first) and sensor placement; then
  Phase S1 bench chemistry head (galvanic isolation + calibration is make-or-break).

---

## 2026-07-06 — Ingest pipeline deployed; full stack verified

**What changed**:
- Discovered "the server" 10.10.10.24 is this MacBook Pro — deployment is local
- Provisioned `iot-postgres` (postgres:16-alpine, port 5442, registered in PORTS.md)
  via `integration/docker-compose.yml`; applied schema.sql
- Ingest bridge running under PM2 (`skimmer-ingest`, pm2 save done) against the
  existing Dockerized Mosquitto on 1883
- Re-registered skimmer MCP server with live DATABASE_URL + PARTICLE_DEVICE
- `config.h`: MQTT_BROKER → 10.10.10.24; firmware recompiled clean
- Firmware fixes (earlier today): vendored libs into lib/ (all three
  project.properties pins were stale/nonexistent), forward-declared mqttCallback

**Tested**:
- End-to-end: mosquitto_pub → ingest debounce → Postgres rows → MCP
  `get_skimmer_level` returns the reading over stdio. Smoke rows truncated after.

**Open issues**:
- `PARTICLE_TOKEN` not set — `force_fill` inert until device is claimed
  (`particle token create`, then re-add MCP server with the extra --env)
- PM2 not registered as a launch daemon (`pm2 startup` needs sudo) — ingest won't
  survive a reboot until run

**Next**:
- Order parts, breadboard prototype, bench test (Phase 2)
- Flash firmware.bin over USB once hardware arrives

---

## 2026-07-07 — Original Photon (platform `photon`) is now the primary target

**What changed**:
- Made the **original Particle Photon** the primary build target / deployment
  hardware "for now"; kept the Photon 2 (`photon2`) as a fully supported
  alternative from the same source.
- Verified the firmware compiles clean for `photon` (Device OS 2.3.1) — the
  `SystemSleepConfiguration` sleep API dates to 1.5.0 so it's in-range; all three
  vendored libs build. `Compile succeeded` (Flash 24876 / RAM 1648).
- Binaries: `firmware.bin` rebuilt for `photon` (canonical); saved the prior
  Photon 2 build as `firmware-photon2.bin`.
- Docs/build flipped to lead with `particle compile photon`: README (new
  "Target board & platforms" table), CLAUDE.md, docs/SETUP.md, docs/calibration.md,
  docs/README.md, .ino header. Corrected stale lib versions in README/docs
  (sht31 0.0.7, MQTT 0.4.32) while there.
- Reworked the **power/battery** docs (wiring.md, breadboard.md Stage 5, BOM,
  bench-test.md) — this is the one real hardware difference.

**Why**:
- Original Photon is the board on hand. Firmware is platform-neutral; only the
  build command and power path differ.

**Tested**:
- `particle compile photon` succeeds. No firmware source changes were needed.
- Not yet flashed to hardware.

**Open issues / the real caveat**:
- The original Photon has **no onboard LiPo charging/connector/fuel gauge** and
  VIN needs ≥3.6 V, so it **can't run a single 18650 directly**. Bench = USB;
  battery deploy needs a 5 V boost converter (18650 → TP4056 → boost → VIN), added
  to the BOM. Sleep current is higher than the Photon 2, so battery life will be
  shorter than the 5-month figure. For the outdoor battery/solar deployment the
  Photon 2 remains the better fit — revisit before Phase 4.
- Original Photon is EOL (2.x LTS is maintenance-only); fine for dev, sunset for
  long-term production.

**Next**:
- Bench-test on the original Photon over USB (Phase 2), decide battery path
  (boost-to-VIN on the Photon vs. switch to Photon 2) before deployment.

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
