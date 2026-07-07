# Calibration Procedure

Run this after final assembly with the glass window installed. The window adds a small but measurable offset to ToF readings, and the skimmer-specific geometry determines `SKIMMER_DEPTH_MM`.

## Required Equipment

- Tape measure (mm-graduated)
- Tape or marker to denote water levels on skimmer wall
- USB cable to the Photon (for serial monitor)
- Optional: container that fits inside skimmer for controlled-level testing

## Step 1: Empty Skimmer Baseline

With skimmer fully drained and lid installed:

```bash
particle call <device-name> calibrate
```

Returns the baseline distance from sensor to skimmer bottom in mm.

Note this value. It becomes your `SKIMMER_DEPTH_MM`.

Also record:
- Air temperature (affects ToF slightly)
- Time of day (sun angle can confuse ToF if light leaks past window)

## Step 2: Three-Point Linearity Check

Fill skimmer to three known levels and measure:

| Target Level | Manual Measurement | Sensor Reading | Delta |
|--------------|-------------------|----------------|-------|
| 50 mm | _____ mm | _____ mm | _____ mm |
| 100 mm | _____ mm | _____ mm | _____ mm |
| 150 mm | _____ mm | _____ mm | _____ mm |

To get a sensor reading without auto-fill firing:

```bash
particle get <device-name> level_mm
```

Acceptable delta: ±3 mm at each point. Larger deltas indicate:
- Window offset not properly compensated → adjust `WINDOW_OFFSET_MM`
- Sensor not perpendicular to water → re-mount
- Foam/scum on water surface → ToF reads top of foam, not water surface (clean skimmer)

## Step 3: Temperature Compensation Check

If your delta increased significantly at elevated temperatures (>35°C in enclosure), the VL53L1X temperature drift is noticeable. The SHT41 reading lets you compensate in firmware. Add to `readDistanceMedian()`:

```cpp
// Approximate ToF drift: ~0.04 mm per °C from 25°C reference
float compensated = raw_distance + 0.04 * (current_temp - 25.0);
```

For pool auto-fill control, you can usually skip this — the 1-2 mm drift is within your acceptable accuracy band.

## Step 4: Window Offset Calibration

If you have access to a precision distance reference (a flat target at known distance):

1. Remove sensor from enclosure
2. Measure bare sensor reading at 100mm from target
3. Reinstall in enclosure with window
4. Measure again at 100mm from target
5. `WINDOW_OFFSET_MM = bare_reading - window_reading`

For 1mm borosilicate glass, expect 0-2 mm offset.

## Step 5: Document Final Values

Update `src/config.h`:

```cpp
#define SKIMMER_DEPTH_MM        <your measured value>
#define WINDOW_OFFSET_MM        <your measured offset>
```

Reflash:

```bash
particle compile photon . --saveTo firmware.bin   # or `photon2` for the Photon 2
particle flash <device-name> firmware.bin
```

## Step 6: Fill Cycle Verification (DRY RUN)

**With the fill valve disconnected from water supply** but connected to the relay:

1. Trigger a forced fill: `particle call <device-name> fill`
2. Observe relay clicks ON, LED indicator on relay
3. After 2 minutes with no rise, firmware should abort and publish `no-rise-aborting`
4. Verify abort message in particle subscribe stream

Only after this dry-run passes, connect the actual water supply.

## Step 7: Full System Test

Drain skimmer to below `LOW_WATER_TRIGGER_MM` (default 80 mm).

1. Watch firmware detect low water on next wake
2. Confirm fill cycle starts
3. Confirm fill stops at `FILL_TARGET_MM` (default 150 mm)
4. Confirm `fills_today` counter increments
5. Verify MQTT messages flow correctly

If anything misbehaves, re-engage the manual valve shutoff at the equipment pad before debugging.

## Long-Term Recalibration

ToF sensors are very stable, but:

- Replace silica gel annually — moisture changes ToF reading slightly
- Inspect window for biofilm/calcium deposits annually
- Re-run Step 2 every spring at pool opening

A ±5 mm year-over-year drift is normal. Larger drift indicates window contamination or sensor degradation.
