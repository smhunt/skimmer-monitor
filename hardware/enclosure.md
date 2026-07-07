# Enclosure & Mounting

## Skimmer Lid Modification

Two options:

### Option A: Drill existing lid
- 25mm hole saw, drill perpendicular to lid surface
- Sand edges smooth
- Mount enclosure to top of lid with marine silicone
- ToF window faces down through the hole

### Option B: Fabricate replacement lid (preferred)
- 6mm HDPE sheet, cut to match original lid shape
- CNC or carefully drilled mounting holes for enclosure
- HDPE is UV-stable, chlorine-resistant, easy to machine
- Original lid kept as backup

## Window Installation

The ToF needs a clear optical path. Use 1mm borosilicate glass (not acrylic — acrylic yellows under UV and pool chemicals):

1. Cut 25mm disc to fit enclosure underside
2. Apply continuous bead of marine-grade silicone around perimeter
3. Press into recess, wipe excess
4. Cure 24 hours before pressure testing
5. Submerge in water for 1 hour to verify seal — no bubbles, no condensation inside

## Internal Layout

```
┌─────────────────────────────────┐
│  Antenna pigtail through gland  │
│                                 │
│   ┌──────────┐    ┌─────────┐  │
│   │  Photon  │    │ TP4056  │  │
│   └─────┬────┘    └────┬────┘  │
│         │              │       │
│   ┌─────┴──────┐  ┌────┴────┐  │
│   │ Sensors    │  │ Battery │  │
│   │ on protob. │  │ holder  │  │
│   └─────┬──────┘  └─────────┘  │
│         │                       │
│         ▼ ToF aimed down        │
│   ┌──────────┐                  │
│   │  Window  │ ← 1mm boro       │
│   └──────────┘                  │
│   Silica gel + Gore-Tex vent    │
└─────────────────────────────────┘
        │
        ▼ Cable gland for relay wires
```

## Critical Weatherproofing

The skimmer environment is hot, humid, and chlorinated. Failures come from:

1. **Condensation inside enclosure** — moisture migrates through any opening. Counter with:
   - Silica gel desiccant packet (replace yearly)
   - Gore-Tex vent (McMaster 5181K11) — equalizes pressure without admitting liquid
   - Apply silicone after assembly on a low-humidity day

2. **UV degradation of cable jackets** — even inside the skimmer, sunlight scatters off water. Use silicone or PTFE-jacketed wire, not standard PVC.

3. **Chlorine attack on metals** — brass cable glands corrode fast. Use nylon or stainless 316.

4. **Thermal cycling fatigue** — 0°C to 40°C diurnal swings work on every seal. Don't over-tighten lid screws.

## Antenna Placement

The skimmer is a Faraday-cage-ish environment surrounded by water-saturated concrete and a metal grate above. Options ranked by signal:

1. **External antenna routed to deck level** (best) — 30cm pigtail through cable gland, antenna magnet-mounts to nearest metal surface or sits in a small weatherproof dome
2. **Antenna mounted to underside of skimmer lid, just above water line** — works if you have line-of-sight to an indoor AP within ~5m
3. **Onboard PCB antenna** (fallback) — works for some installations but YMMV

Run a Wi-Fi signal test before sealing everything up. The Photon's `WiFi.RSSI()` should report better than -75 dBm consistently. If it drops below -85, the connection becomes unreliable.

## Mounting the Sensor PCB

The VL53L1X must be:
- Rigid (not floating in foam) — vibration affects accuracy
- Perpendicular to water surface (within ±5°)
- Aimed straight down with no obstructions in the 27° cone

Cut a small standoff (3D printed PETG is fine) that holds the breakout against the underside of the lid with the sensor lens centered on the glass window. Hot glue or silicone for vibration damping.

## Pre-Deployment Checklist

- [ ] All cable glands tightened
- [ ] Lid gasket seated properly
- [ ] Silica gel inside enclosure
- [ ] Gore-Tex vent installed and not blocked
- [ ] Window seal cured 24+ hours
- [ ] Water immersion test passed
- [ ] Wi-Fi RSSI better than -75 dBm in installed location
- [ ] Solar panel oriented for direct sun (south-facing in Ontario)
- [ ] Battery fully charged before installation
