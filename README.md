# Skimmer Water Level Monitor

Wireless in-skimmer water level monitor with auto-fill control for residential pools. Particle Photon 2 + VL53L1X time-of-flight sensor + SHT41 environmental sensor. Integrates with Particle Cloud, MQTT/Home Assistant, and any platform that can consume webhooks.

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

This project uses Particle Workbench + DeviceOS 5.x.

```bash
# Install Particle CLI
npm install -g particle-cli
particle login

# Install dependencies (libraries pinned in project.properties)
particle library install SparkFun_VL53L1X
particle library install adafruit-sht31
particle library install MQTT

# Compile and flash
particle compile photon2 . --saveTo firmware.bin
particle flash <device-name> firmware.bin
```

Or use Particle Workbench (VS Code extension) — recommended for development.

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
├── lib/                        Particle library dependencies
├── hardware/
│   ├── BOM.md                  Bill of materials with Canadian suppliers
│   ├── wiring.md               Pin assignments and wiring diagram
│   └── enclosure.md            Mounting and weatherproofing guide
├── docs/
│   ├── home-assistant.yaml     HA configuration
│   ├── calibration.md          Step-by-step calibration procedure
│   └── mqtt-schema.md          MQTT topic reference
├── scripts/
│   ├── monitor.sh              CLI subscriber for testing
│   └── postgres-ingest.ts      Optional: TS bridge to your existing Postgres
├── test/
│   └── bench-test.md           Pre-deployment bench test checklist
├── project.properties          Particle CLI manifest
└── README.md
```

## License

MIT

## Author

EcoWorks Web Architecture Inc.
