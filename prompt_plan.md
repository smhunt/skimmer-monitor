# Prompt Plan: Skimmer Water Level Monitor

## Goal

Wireless in-skimmer water level monitor with auto-fill control, integrating with existing EcoWorks pool ecosystem (MQTT, Postgres, MCP server) and Home Assistant.

## Phases

### Phase 1: Firmware Foundation ✅
- [x] Project scaffold (Particle Workbench layout)
- [x] Core sensor reads (VL53L1X median filter, SHT41)
- [x] Particle Cloud variables and functions
- [x] MQTT publishing
- [x] Sleep cycle with retained state
- [x] Auto-fill control with safety interlocks

### Phase 2: Bench Test
- [ ] Wire breadboard prototype
- [ ] Verify ToF readings against tape measure (±2 mm target)
- [ ] Test relay control with multimeter (no valve attached)
- [ ] Confirm MQTT messages reach broker
- [ ] Test wake/sleep current draw (target: ~1.5 mA average)
- [ ] Run rate-of-rise abort with simulated stuck valve

### Phase 3: Calibration
- [ ] Install glass window in enclosure
- [ ] Measure WINDOW_OFFSET_MM empirically
- [ ] Run `calibrate` cloud function with empty skimmer
- [ ] Verify level readings match manual measurement at 3 known levels

### Phase 4: Deployment
- [ ] Drill skimmer lid (or fabricate replacement)
- [ ] Mount sensor, route relay control to hose bib valve
- [ ] Install Gore-Tex vent and silica gel
- [ ] Solar panel mount (south-facing on equipment pad)
- [ ] OTA flash to deployed device

### Phase 5: Integration
- [ ] Postgres ingest script (clone from sump pump pattern)
- [ ] Home Assistant entities + Lovelace card
- [ ] Extend MCP server with skimmer tools:
  - `get_skimmer_level`
  - `get_fill_history(days)`
  - `force_fill`
  - `get_evaporation_rate(days)`
- [ ] Custom dashboard widget at 10.10.10.24:3025

### Phase 6: Anomaly Detection
- [ ] 7-day rolling baseline of daily fill volume
- [ ] Alert on >2σ deviation (potential leak)
- [ ] Weekly evaporation trend (correlate with temperature)
- [ ] Compare against weather API rainfall data

## Out of Scope (For Now)

- pH/ORP sensors — separate module
- Flow rate metering — separate module
- Multi-skimmer support (single skimmer pool)

## Risk Register

| Risk | Mitigation |
|------|-----------|
| Water valve stuck open | Rate-of-rise check + max duration timeout |
| Sensor failure during fill | Lost-comms detection — stop fill on watchdog |
| Battery dies overnight | Solar panel + low-battery alerts + lockout |
| Condensation on window | Gore-Tex vent + silica + humidity alert |
| RF blocked by skimmer | External antenna routed to deck level |
