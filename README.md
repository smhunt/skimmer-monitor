# Skimmer Water Level Monitor

Wireless in-skimmer water level monitor with auto-fill control for residential pools. Particle Photon + VL53L1X time-of-flight sensor + SHT41 environmental sensor. Integrates with Particle Cloud, MQTT/Home Assistant, and any platform that can consume webhooks.

> **Target board:** the primary build target is the **original Particle Photon** (platform `photon`, Device OS 2.x LTS) — the hardware in current use. The **Photon 2** (platform `photon2`, Device OS 6.x) is also fully supported from the same source; the only real difference is the build command and the battery/power subsystem. See [Target board & platforms](#target-board--platforms).

## Features

- **±1 mm accuracy** via VL53L1X laser ranging through a sealed glass window
- **Non-contact sensing** — no electrodes or floats in chlorinated water
- **Auto-fill control** with multiple safety interlocks:
  - Maximum fill duration timeout (10 min)
  - Daily fill count limit (leak detection)
  - Rate-of-rise check (stuck valve detection)
  - Low battery lockout
- **5-month battery life** on 18650 Li-ion (indefinite with 2W solar panel)
- **Multi-platform integration**: Particle Cloud, MQTT, Home Assistant, REST
- **Condensation monitoring** via SHT41 inside the enclosure

## Hardware

See `hardware/BOM.md` for complete bill of materials.

Total cost: ~CAD $85.

## Building

This project builds with the Particle cloud compiler (or Particle Workbench).
Libraries are vendored in `lib/` — no `particle library install` needed.

```bash
# Install Particle CLI
npm install -g particle-cli
particle login

# Compile and flash — original Photon (primary target)
particle compile photon . --saveTo firmware.bin
particle flash <device-name> firmware.bin

# Or build for the Photon 2 instead
particle compile photon2 . --saveTo firmware-photon2.bin
```

The compile commands above produce `firmware.bin` (original Photon) and
`firmware-photon2.bin` (Photon 2) locally — both are build artifacts
(git-ignored), regenerate with the commands above. Or use Particle Workbench
(VS Code extension) — recommended for development.

### Target board & platforms

Both boards run the same source unchanged. Pick your build target:

| | Original Photon (`photon`) — **primary** | Photon 2 (`photon2`) |
|---|---|---|
| Device OS | 2.x LTS (2.3.1) | 6.x |
| Build | `particle compile photon` | `particle compile photon2` |
| I²C / relay / ADC pins | D0/D1, D7, A0 — identical | identical |
| Battery / power | **No onboard LiPo charging or fuel gauge.** VIN is 3.6–5.5 V, so it **can't run directly off a single 18650.** Bench: power over USB. Battery deploy: boost-converter → VIN, or use the Photon 2. | Onboard JST LiPo connector + charging + fuel gauge; runs a single 18650 natively (TP4056 → LiPo pins). |
| Sleep current | Higher — `ULTRA_LOW_POWER` works but draws more; expect shorter runtime than the 5-month figure below. | Lower; 5-month figure applies. |
| Status | End-of-life (2.x LTS is maintenance-only), but fully functional. | Current product; better fit for the battery/solar deployment. |

The battery/solar wiring in `hardware/wiring.md` and `hardware/breadboard.md`
Stage 5 assumes the Photon 2's onboard charging. On the original Photon that
stage differs — see the notes there.

## Configuration

Edit `src/config.h` before flashing. Key parameters:

| Parameter | Default | Description |
|-----------|---------|-------------|
| `SKIMMER_DEPTH_MM` | 250 | Distance from sensor to skimmer bottom |
| `LOW_WATER_TRIGGER_MM` | 80 | Auto-fill activation level |
| `FILL_TARGET_MM` | 150 | Auto-fill cutoff level |
| `MAX_FILL_DURATION_MS` | 600000 | Hard safety timeout (10 min) |
| `SLEEP_DURATION_S` | 300 | Reporting interval (5 min) |
| `MQTT_BROKER` | 192.168.1.10 | Your Mosquitto/HA broker IP |

## Calibration

After installing the enclosure with glass window:

1. Drain skimmer completely
2. Call the calibration function: `particle call <device> calibrate`
3. Note the returned baseline distance
4. Update `SKIMMER_DEPTH_MM` in `config.h`
5. Reflash

The `WINDOW_OFFSET_MM` accounts for the small distance error introduced by ToF refraction through the glass — typically 0-2 mm for 1 mm borosilicate.

## Integration

### Particle Cloud
- REST: `GET https://api.particle.io/v1/devices/{id}/level_mm`
- Functions: `fill`, `stop`, `reset`, `calibrate`
- Events: `skimmer/reading`, `skimmer/fill`, `skimmer/alert`

### MQTT topics
- `pool/skimmer/level` — water level in mm
- `pool/skimmer/temperature` — enclosure temp in °C
- `pool/skimmer/humidity` — enclosure humidity in %
- `pool/skimmer/battery` — battery voltage
- `pool/skimmer/fills_today` — daily fill count
- `pool/skimmer/total_fills` — lifetime fill count

### Home Assistant
See `docs/home-assistant.yaml` for a complete HA configuration.

### Postgres + Claude (MCP)
The `integration/` package ingests MQTT readings into Postgres and exposes the monitor
to Claude via an MCP server (`get_skimmer_level`, `get_fill_history`, `force_fill`,
`get_evaporation_rate`, `get_chem_history`). See `integration/README.md` and `docs/SETUP.md`.

## Roadmap: AI pool-health system

Beyond level + auto-fill, an **additive** AI-driven health system is in progress — tracking
water chemistry, clarity, circulation, and equipment health, with an off-device analyzer +
Claude (via MCP) turning the data into plain-language guidance. It is **advisory and
observational only**; the safety-critical level + auto-fill firmware and its interlocks are
untouched. Being built **pool-first**, with a spa/hot-tub variant planned as a later add-on.

- **[docs/pool-health-build-plan.md](docs/pool-health-build-plan.md)** — build plan of record (phases PH-0…PH-5)
- [docs/smart-skimmer-ai-vision.md](docs/smart-skimmer-ai-vision.md) — vision & architecture
- [docs/spa-health-monitor.md](docs/spa-health-monitor.md) — spa variant (later add-on)

## Documentation

- **[docs/SETUP.md](docs/SETUP.md)** — end-to-end setup: firmware → broker → Postgres → Home Assistant → Claude
- **[docs/README.md](docs/README.md)** — architecture, data flow, full API reference
- [docs/calibration.md](docs/calibration.md) — window offset calibration procedure
- [docs/mqtt-schema.md](docs/mqtt-schema.md) — MQTT topic and payload reference

## Safety Notes

This device controls a water valve. Required safety practices:

1. Hardware shutoff at the equipment pad — never rely solely on firmware
2. Pressure relief on the fill line
3. Backflow prevention required by code in most jurisdictions
4. Test the rate-of-rise safety with the valve disconnected
5. Test the max-duration timeout before trusting overnight operation

## Files

```
skimmer-monitor/
├── src/
│   ├── skimmer-monitor.ino    Main firmware
│   └── config.h                Tunable parameters
├── integration/
│   ├── src/ingest.ts           MQTT → Postgres bridge
│   ├── src/mcp-server.ts       MCP server exposing skimmer tools to Claude
│   └── schema.sql              Postgres schema
├── hardware/
│   ├── BOM.md                  Bill of materials with Canadian suppliers
│   ├── breadboard.md           Staged breadboard build with checkpoints
│   ├── wiring.md               Pin assignments and wiring diagram
│   └── enclosure.md            Mounting and weatherproofing guide
├── docs/
│   ├── SETUP.md                End-to-end setup guide
│   ├── README.md               Architecture and API reference
│   ├── home-assistant.yaml     HA configuration
│   ├── calibration.md          Step-by-step calibration procedure
│   └── mqtt-schema.md          MQTT topic reference
├── scripts/
│   └── monitor.sh              CLI subscriber for testing
├── test/
│   └── bench-test.md           Pre-deployment bench test checklist
├── project.properties          Particle CLI manifest
└── README.md
```

## License

MIT

## Author

EcoWorks Web Architecture Inc.
