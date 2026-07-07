# Wiring Guide

## Pin Assignments

D0, D1, D7, A0, 3V3 and GND are identical on the **original Photon** (primary
target) and the **Photon 2**. Only the battery/power input differs — see
[Power Input](#power-input).

| Pin | Function | Connected To |
|-----|----------|--------------|
| D0  | I²C SDA | VL53L1X SDA, SHT41 SDA |
| D1  | I²C SCL | VL53L1X SCL, SHT41 SCL |
| D7  | Relay control | Opto-isolated relay IN |
| A0  | Battery voltage | Top of 2:1 voltage divider |
| 3V3 | Sensor power | VL53L1X VIN, SHT41 VIN |
| GND | Common ground | All grounds |

## Power Input

**This is the one place the two boards diverge.**

- **Original Photon (primary):** *no* onboard LiPo connector, charging, or fuel
  gauge. VIN accepts **3.6–5.5 V**, so a single 18650 (3.0–4.2 V) **cannot drive
  it directly** — it browns out as the cell sags. Options:
  - *Bench / prototyping:* power over **USB** (micro-B). All bench stages run
    this way — simplest.
  - *Battery deploy:* 18650 → TP4056 (protected) → **5 V boost converter** →
    Photon **VIN**. The boost converter is the one extra part vs. the Photon 2.
  - The A0 divider taps the raw cell at TP4056 **OUT+** (before the boost
    converter), not at VIN.
- **Photon 2:** onboard JST **LiPo+/LiPo-** connector + charging + fuel gauge.
  18650 → TP4056 → LiPo pins, no boost converter. (Solar charge input is VUSB
  via a 6 V→5 V regulator.)

## I²C Addresses

| Device | Address |
|--------|---------|
| VL53L1X | 0x29 |
| SHT41 | 0x44 |

No collision — both can share the bus directly.

## Battery Voltage Divider

Both boards' ADC reads 0-3.3V (12-bit). 18650 ranges 3.0-4.2V, so use a 2:1 divider:

```
Battery + ----[100kΩ]----+---- A0
(TP4056 OUT+)
                    |
                  [100kΩ]
                    |
                   GND
```

100kΩ resistors keep idle current under 25 µA. Don't go lower or you waste battery.

## Relay Wiring

The relay module switches a 24VAC solenoid valve (irrigation type) or 120VAC via a Shelly 1 Plus. Never switch mains directly from a battery-powered enclosure — keep the high-voltage side at the equipment pad.

```
Photon D7  ----[10kΩ]----+---- Relay IN
                        |
                       (optional pull-down 100kΩ to GND)

Photon GND ------- Relay GND
Photon 3V3 ------- Relay VCC (most opto-isolated modules accept 3.3V)
```

If your relay module needs 5V on its logic input, use a 2N7000 N-channel MOSFET as level shifter or pick a different module.

## Solar Charging

```
Solar Panel (6V 2W) ----+---- TP4056 IN+
                        |
                      Diode (Schottky 1A reverse-blocking)
                        |
                       GND

TP4056 OUT+ ---- (Photon 2) LiPo+   |   (original Photon) 5V boost converter IN+ → VIN
TP4056 OUT- ---- (Photon 2) LiPo-   |   (original Photon) boost converter IN-  → GND
```

On the **original Photon**, TP4056 OUT can't feed the board directly (VIN needs
≥3.6 V and the cell sags below that) — insert a small 5 V boost converter
between TP4056 OUT and VIN. On the **Photon 2**, TP4056 OUT goes straight to the
LiPo pins.

The protection circuit on the TP4056 PCB also prevents over-discharge of the 18650. Don't skip the version with built-in protection — the bare TP4056 chip alone doesn't protect the battery.

## External Antenna

Both the original Photon and the Photon 2 have a u.FL/IPEX connector for an external antenna alongside an onboard antenna. To switch to external:

```cpp
// In setup(), before WiFi.on():
WiFi.selectAntenna(ANT_EXTERNAL);
```

Run the antenna pigtail through a cable gland to a 2.4 GHz whip antenna mounted on the pool deck or skimmer lid surface (not buried inside).

## Wiring Order

1. Solder battery holder leads to TP4056 (B+/B-)
2. Solder solar input to TP4056 (IN+/IN-)
3. Solder TP4056 OUT to the board's battery input — Photon 2: LiPo+/LiPo-;
   original Photon: 5 V boost converter → VIN (see Power Input)
4. Solder voltage divider to A0 (tap at TP4056 OUT+)
5. Plug VL53L1X and SHT41 into a small protoboard, wire I²C bus + power
6. Wire relay module to D7 + 3V3 + GND
7. Route relay output wires through cable gland before plugging into screw terminals
8. Final assembly: enclosure with silica gel, Gore-Tex vent, sealed lid

Test connectivity with everything bench-mounted before final enclosure assembly.
