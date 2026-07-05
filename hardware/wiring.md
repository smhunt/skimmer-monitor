# Wiring Guide

## Photon 2 Pin Assignments

| Pin | Function | Connected To |
|-----|----------|--------------|
| D0  | I²C SDA | VL53L1X SDA, SHT41 SDA |
| D1  | I²C SCL | VL53L1X SCL, SHT41 SCL |
| D7  | Relay control | Opto-isolated relay IN |
| A0  | Battery voltage | Top of 2:1 voltage divider |
| 3V3 | Sensor power | VL53L1X VIN, SHT41 VIN |
| GND | Common ground | All grounds |
| LiPo+/LiPo- | Battery input | 18650 via TP4056 BAT+/BAT- |
| VUSB | Solar charge input | TP4056 IN+ (via 6V→5V regulator if needed) |

## I²C Addresses

| Device | Address |
|--------|---------|
| VL53L1X | 0x29 |
| SHT41 | 0x44 |

No collision — both can share the bus directly.

## Battery Voltage Divider

Photon 2 ADC reads 0-3.3V. 18650 ranges 3.0-4.2V, so use a 2:1 divider:

```
LiPo+ ----[100kΩ]----+---- A0
                    |
                  [100kΩ]
                    |
                   GND
```

100kΩ resistors keep idle current under 25 µA. Don't go lower or you waste battery.

## Relay Wiring

The relay module switches a 24VAC solenoid valve (irrigation type) or 120VAC via a Shelly 1 Plus. Never switch mains directly from a battery-powered enclosure — keep the high-voltage side at the equipment pad.

```
Photon 2 D7  ----[10kΩ]----+---- Relay IN
                          |
                         (optional pull-down 100kΩ to GND)

Photon 2 GND ------- Relay GND
Photon 2 3V3 ------- Relay VCC (most opto-isolated modules accept 3.3V)
```

If your relay module needs 5V on its logic input, use a 2N7000 N-channel MOSFET as level shifter or pick a different module.

## Solar Charging

```
Solar Panel (6V 2W) ----+---- TP4056 IN+
                        |
                      Diode (Schottky 1A reverse-blocking)
                        |
                       GND

TP4056 OUT+ ---- Photon 2 LiPo+
TP4056 OUT- ---- Photon 2 LiPo-
```

The protection circuit on the TP4056 PCB also prevents over-discharge of the 18650. Don't skip the version with built-in protection — the bare TP4056 chip alone doesn't protect the battery.

## External Antenna

The Photon 2 ships with a u.FL/IPEX connector for an external antenna alongside its onboard PCB antenna. To switch to external:

```cpp
// In setup(), before WiFi.on():
WiFi.selectAntenna(ANT_EXTERNAL);
```

Run the antenna pigtail through a cable gland to a 2.4 GHz whip antenna mounted on the pool deck or skimmer lid surface (not buried inside).

## Wiring Order

1. Solder battery holder leads to TP4056 (B+/B-)
2. Solder solar input to TP4056 (IN+/IN-)
3. Solder TP4056 OUT to Photon 2 LiPo+/LiPo-
4. Solder voltage divider to A0
5. Plug VL53L1X and SHT41 into a small protoboard, wire I²C bus + power
6. Wire relay module to D7 + 3V3 + GND
7. Route relay output wires through cable gland before plugging into screw terminals
8. Final assembly: enclosure with silica gel, Gore-Tex vent, sealed lid

Test connectivity with everything bench-mounted before final enclosure assembly.
