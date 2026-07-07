# Claude Code Project Context

## Project: Skimmer Water Level Monitor

Wireless in-skimmer water level monitor with auto-fill control. Particle firmware that integrates with the existing EcoWorks pool monitoring ecosystem.

**Primary target board: the original Particle Photon** (platform `photon`, Device OS 2.x LTS) — the hardware in current use. The Photon 2 (`photon2`, Device OS 6.x) builds from the same source and is kept as a supported alternative. The source is platform-neutral; only the build command and the battery/power wiring differ (the original Photon has no onboard LiPo charging — see README "Target board & platforms"). Prebuilt: `firmware.bin` = original Photon, `firmware-photon2.bin` = Photon 2.

## Related Projects

- **Cottage sump pump monitor** (Particle Photon, Node.js/TypeScript, MQTT, Postgres, MCP server) — same architectural pattern, reuse the MQTT broker and Postgres ingestion layer
- **Custom pool monitoring app** at 10.10.10.24:3025 — extend the existing dashboard with skimmer data
- **OmniLogic pool automation** — runs in parallel; this monitor handles the auto-fill function OmniLogic doesn't expose

## Tech Stack

- Hardware: original Particle Photon (primary; Photon 2 also supported), VL53L1X ToF, SHT41, 18650 Li-ion + solar
- Firmware: C++ on DeviceOS 5.x via Particle Workbench
- Integration: Particle Cloud, MQTT (Mosquitto), Home Assistant
- Optional: TypeScript bridge to existing Postgres + MCP server for Claude queries

## Code Conventions

- C++ style: Particle/Arduino conventions, snake_case for variables, camelCase for functions
- Configuration centralized in `src/config.h` — no magic numbers in main code
- `retained` for values that must survive sleep cycles
- `SYSTEM_THREAD(ENABLED)` and `SYSTEM_MODE(SEMI_AUTOMATIC)` for fast wake/sleep cycles
- All cloud publish events use the `skimmer/` namespace
- All MQTT topics use the `pool/skimmer/` namespace

## Critical Safety Requirements

This firmware controls a water valve. Do NOT modify without preserving these interlocks:

1. `MAX_FILL_DURATION_MS` hard timeout — must always abort fill
2. `MAX_DAILY_FILLS` counter — leak indicator
3. Rate-of-rise check after `RATE_CHECK_DELAY_MS` — stuck valve detection
4. Battery lockout below `LOW_BATTERY_THRESHOLD`
5. Manual override functions `fill` and `stop` must always work via cloud

## Development Workflow

Follow @prompt_plan.md and @progress.md conventions:

1. Read existing `prompt_plan.md` and `progress.md` if present
2. Propose resumption point or new plan
3. Confirm before executing
4. Checkpoint after each logical task
5. Never silently rewrite large sections without summary

## Build & Test

```bash
# Compile — original Photon (primary target); use `photon2` for the Photon 2
particle compile photon . --saveTo firmware.bin

# Flash over USB
particle flash --usb firmware.bin

# Or OTA
particle flash <device-name> firmware.bin

# Monitor logs
particle serial monitor --follow

# Subscribe to events
particle subscribe skimmer mine
```

## Hardware Notes

- I²C bus: D0 (SDA), D1 (SCL) — same pins on the original Photon and Photon 2
- Relay output: D7
- Battery monitor: A0 with 2:1 voltage divider
- 3.3V supply from the Photon's onboard regulator (sufficient for ToF + SHT41)
- External 2.4 GHz antenna recommended for in-skimmer mounting

## Canadian Sourcing

Per Sean's preference, source from Canadian suppliers:
- BC Robotics, Solarbotics, ABRA Electronics for sensors
- DigiKey Canada for connectors
- partselect.ca / AMRE Supply for plumbing fittings

## Open Items

- [ ] Calibrate `WINDOW_OFFSET_MM` after enclosure assembly
- [x] Verify VL53L1X library version — 4.0.0 did not exist; corrected to `SparkFun_VL53L1X_Arduino_Library=1.2.9` (2026-07-05)
- [x] Add Postgres ingestion script matching sump pump monitor pattern — `integration/src/ingest.ts` (2026-07-05)
- [x] MCP server with skimmer tools — built standalone in `integration/src/mcp-server.ts` (sump pump MCP server lives on the cottage server, not this machine)
- [ ] Field test rate-of-rise safety with valve disconnected
- [x] Deploy ingest bridge + schema — running under PM2 on this Mac (10.10.10.24 is the MBP); iot-postgres on port 5442 (2026-07-06)
- [x] `pm2 startup` — launch daemon registered, ingest survives reboot (2026-07-06)
- [ ] Set PARTICLE_TOKEN on the MCP server registration once device is claimed
- [x] Primary target board = original Photon (`particle compile photon`, Device OS 2.3.1); Photon 2 kept as supported alternative. Firmware compiles clean for both, no source change (2026-07-07)
- [ ] **Battery path for the original Photon**: no onboard LiPo charging + VIN ≥3.6 V means it can't run a single 18650 directly — needs a 5 V boost converter (18650 → TP4056 → boost → VIN). Bench runs on USB. Decide boost-to-VIN vs. switch to Photon 2 before Phase 4 deployment
