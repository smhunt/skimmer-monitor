# Breadboard Build Guide

Step-by-step bench prototype (Phase 2). No enclosure, no soldering beyond headers,
USB power until the final stage. Each stage ends with a checkpoint — don't move on
until it passes. When the whole board works, hand off to
[test/bench-test.md](../test/bench-test.md).

## What You Need at the Bench

From [BOM.md](BOM.md):

- Particle Photon 2 (headers soldered — see Stage 0)
- SparkFun VL53L1X breakout (SEN-14722)
- Adafruit SHT41 breakout
- Opto-isolated 5V relay module
- 18650 + holder + TP4056 module (Stage 5 only — leave in the box until then)

Bench extras (not in the BOM):

- Full-size breadboard (830 tie points) — half-size works but gets cramped at Stage 4
- Male-male jumper wires; 4 female-male if your relay module has a pin header
- Resistors: 2× 100 kΩ (divider), 1× 10 kΩ (relay input)
- Multimeter
- USB-C cable to your computer

## Stage 0 — Headers and Firmware Prep

1. Solder male headers to the Photon 2, VL53L1X, and SHT41 (all three usually ship
   loose). Flux, one pin first, check alignment, then the rest.
2. Before wiring anything, flash the firmware over USB so the board is known-good:

   ```bash
   particle flash --usb firmware.bin
   particle serial monitor --follow
   ```

   Expect `tof-init-failed` and `sht-init-failed` events — that's correct with no
   sensors attached, and proves the firmware runs and reports.

**✓ Checkpoint:** Photon 2 breathes cyan (Wi-Fi up), serial monitor shows the two
init-failure messages and no crashes.

## Stage 1 — Power Rails

```
Photon 2 3V3  ──► breadboard red (+) rail
Photon 2 GND  ──► breadboard blue (–) rail
```

1. Seat the Photon 2 across the breadboard's center channel, USB connector
   overhanging the edge.
2. Jumper 3V3 → + rail, GND → – rail. If your breadboard has split rails, bridge
   them so both sides are live.

**✓ Checkpoint:** Multimeter reads ~3.3 V between the rails with USB plugged in.

## Stage 2 — I²C Bus + Both Sensors

Both sensors share the bus (VL53L1X @ 0x29, SHT41 @ 0x44 — no collision), and both
breakouts include their own pull-up resistors, so no extra parts are needed.

```
Photon 2 D0 (SDA) ──┬── VL53L1X SDA ──┬── SHT41 SDA
Photon 2 D1 (SCL) ──┼── VL53L1X SCL ──┼── SHT41 SCL
        + rail    ──┼── VL53L1X VIN ──┼── SHT41 VIN
        – rail    ──┴── VL53L1X GND ──┴── SHT41 GND
```

1. Seat both breakouts a few rows apart.
2. Wire power first (VIN → + rail, GND → – rail), then SDA/SCL from D0/D1 to each
   breakout. Keep I²C jumpers under ~15 cm.
3. **Do not remove the protective film from the VL53L1X lens yet** — leave it until
   the checkpoint, peel it only once wiring is done (fingerprints on the lens skew
   readings more than the film does).
4. Reset the Photon 2 and watch the serial monitor.

**✓ Checkpoint:** No init-failure events on boot. Within one wake cycle the serial
log shows a distance reading and plausible temp/humidity (room temp ±2 °C). Point
the ToF sensor at a wall ~20 cm away, verify the reading tracks when you move a
book closer/farther. If either sensor fails init: check VIN/GND first, then look
for swapped SDA/SCL.

## Stage 3 — Battery Voltage Divider

Even on USB power, wire the divider now so A0 isn't floating (floating ADC reads
garbage, and the firmware publishes it as battery voltage).

```
+ rail ──[100 kΩ]──●── A0
                   │
               [100 kΩ]
                   │
                – rail
```

For now the divider top connects to the 3V3 rail (simulating a battery); at Stage 5
it moves to the real battery +.

**✓ Checkpoint:** Serial log / `particle get <device> battery_v` reads ~3.3 V
(3.3 V rail ÷ 2 × 2.0 divider ratio = 3.3). If it reads ~1.65, the firmware's
`BATTERY_DIVIDER_RATIO` isn't being applied — wrong pin.

## Stage 4 — Relay Module (DRY — nothing connected to the contacts)

```
Photon 2 D7 ──[10 kΩ]──► Relay IN
(optional: 100 kΩ from Relay IN to – rail, prevents chatter during boot)

+ rail ──► Relay VCC     (most opto-isolated modules work at 3.3 V)
– rail ──► Relay GND
```

Leave the relay's screw terminals (COM/NO/NC) **empty**. No valve, no load.

If the relay doesn't click at 3.3 V logic, your module needs 5 V — either power
VCC from the Photon 2's VUSB pin (5 V when on USB) keeping IN at 3.3 V logic
(works for opto-isolated inputs), or swap modules per
[wiring.md](wiring.md#relay-wiring).

**✓ Checkpoint:**

```bash
particle call <device> fill    # relay LED on, audible click
particle call <device> stop    # click off immediately
```

Then leave `fill` running: after `RATE_CHECK_DELAY_MS` (2 min) with no level rise,
the firmware must abort on its own and publish `skimmer/alert` = `no-rise-aborting`.
**This is the single most important test on the bench — it's the stuck-valve
safety.** Watch it happen at least twice.

## Stage 5 — Battery Power (optional on the breadboard)

Can be deferred to final assembly, but doing it on the bench catches TP4056 issues
early. This stage needs three solder joints.

1. Solder 18650 holder leads to TP4056 **B+ / B–** (battery side — not OUT).
2. TP4056 **OUT+ / OUT–** → Photon 2 **LiPo+ / LiPo–** (JST connector or pins).
3. Move the divider's top leg from the + rail to **OUT+** (real battery voltage).
4. Insert the (charged) 18650, unplug USB.

**✓ Checkpoint:** Photon 2 boots and connects on battery alone. `battery_v` now
reads actual cell voltage (3.6–4.2 V). Plug USB into the TP4056 input: its charge
LED lights. Solar panel input waits for final assembly ([wiring.md](wiring.md#solar-charging)).

## Bench Layout Reference

```
        USB ↓
 ┌───────────────────────────────────────────┐
 │  [Photon 2]   [VL53L1X]   [SHT41]         │  ← breakouts on the board
 │   D0 D1 D7 A0   (bus)      (bus)          │
 │  ═════════ + rail ════════════════════    │
 │  ═════════ – rail ════════════════════    │
 └───────────────────────────────────────────┘
        │D7→10kΩ                 ToF aimed at a wall/box ~20 cm away
   [Relay module]                (or downward into a bucket for level tests)
    COM/NO/NC empty
```

For a realistic level test before touching the pool: aim the VL53L1X straight down
into a bucket, set `SKIMMER_DEPTH_MM` to the sensor-to-bottom distance, reflash, and
raise the water level with a jug while watching `pool/skimmer/level` on MQTT:

```bash
mosquitto_sub -h 10.10.10.24 -t "pool/skimmer/#" -v
```

## When Everything Passes

Run the full [bench-test checklist](../test/bench-test.md) top to bottom (it adds
the powered-off continuity checks, cloud/MQTT verification, and the complete safety
interlock matrix). Then move to calibration and enclosure:
[docs/calibration.md](../docs/calibration.md), [enclosure.md](enclosure.md).
