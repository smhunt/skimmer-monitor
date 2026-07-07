# Bench Test Checklist

Run through this before installing the unit in your skimmer. Each check should pass before moving on.

## Powered Off Checks

- [ ] All solder joints visually inspected (no cold joints, no bridges)
- [ ] Continuity check from battery + to the board's power input (Photon 2: LiPo+; original Photon: boost converter → VIN)
- [ ] No continuity between any power rail and GND (shorts check)
- [ ] Relay output isolated from sensor power (multimeter)
- [ ] I²C SDA/SCL pulled to 3.3V with 4.7kΩ resistors (most breakouts include these — verify)

## First Power-On

Connect via USB, not battery, for initial bring-up.

- [ ] Photon enumerates as USB device
- [ ] Onboard LED breathes cyan after ~30s (Wi-Fi connected)
- [ ] `particle serial monitor` shows no fatal errors
- [ ] No magic smoke 😄

## Sensor Checks

```bash
particle serial monitor --follow
particle call <device> calibrate
```

- [ ] VL53L1X returns a sensible distance (50-500 mm range)
- [ ] SHT41 returns sensible temperature and humidity
- [ ] Readings stable (median over 7 samples, ±2 mm variance)
- [ ] No I²C errors in logs

## Cloud Integration

- [ ] `particle get <device> level_mm` returns a value
- [ ] `particle subscribe skimmer mine` shows `skimmer/reading` events every 5 minutes
- [ ] Webhook (if configured) fires correctly

## MQTT Integration

```bash
mosquitto_sub -h <broker> -t "pool/skimmer/#" -v
```

- [ ] All 6 topics publish on each wake cycle
- [ ] Values match Particle Cloud variables
- [ ] No connection thrashing in Mosquitto logs

## Relay Control (DRY — no water)

- [ ] `particle call <device> fill` clicks relay ON
- [ ] LED on relay module illuminates
- [ ] Multimeter shows continuity on NO contact
- [ ] After 2 minutes with no level rise, firmware aborts
- [ ] `skimmer/alert` event published with "no-rise-aborting"
- [ ] `particle call <device> stop` clicks relay OFF immediately

## Safety Interlocks

- [ ] Max fill duration: trigger fill, wait 11 min, verify auto-stop at 10 min
- [ ] Daily fill count: trigger fills repeatedly, verify lockout at MAX_DAILY_FILLS
- [ ] Low battery lockout: set LOW_BATTERY_THRESHOLD higher than current battery, verify fill won't start
- [ ] Reset counter: `particle call <device> reset` clears `fills_today`

## Battery & Sleep

- [ ] Disconnect USB, run on battery alone (Photon 2: LiPo; original Photon: 18650 → TP4056 → 5V boost → VIN)
- [ ] Board continues to wake on schedule
- [ ] Multimeter on battery line: <0.5 mA average over a full sleep cycle (use a USB power meter or similar)
- [ ] Wake current spike <100 mA (typical 60-80 mA for MCU + ToF)
- [ ] Sleep current: Photon 2 `ULTRA_LOW_POWER` <200 µA; **original Photon is higher** (stop-mode ~1 mA, plus boost-converter quiescent) — expect shorter runtime than the Photon 2 battery-life figures

## Solar Charging (if installed)

- [ ] In direct sun, TP4056 RED LED lights (charging)
- [ ] In direct sun, battery voltage rises over an hour
- [ ] In shade or night, no current flow into solar panel (Schottky diode working)

## Wi-Fi Performance

- [ ] `WiFi.RSSI()` reading better than -75 dBm in installed position
- [ ] No disconnects logged over 24-hour bench run
- [ ] Reconnects within 10s if AP is power-cycled

## 24-Hour Burn-In

Leave the unit running on battery for 24 hours:

- [ ] All readings remain stable
- [ ] No memory leaks (battery voltage decline matches expected ~1.5 mA average)
- [ ] No unexpected reboots in event log
- [ ] MQTT messages continuous

## Sign-Off

| Test | Date | Initials | Notes |
|------|------|----------|-------|
| Bench test complete | | | |
| Ready for skimmer deployment | | | |
