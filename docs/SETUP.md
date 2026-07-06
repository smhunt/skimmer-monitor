# End-to-End Setup Guide

From parts on the bench to asking Claude "what's the pool level?". Steps are ordered;
each layer works without the ones after it, so you can stop at any point.

## Prerequisites

- Particle account (free) — https://login.particle.io
- Node.js 18+ and npm
- A host on your LAN running Mosquitto and Postgres (the sump pump monitor host works —
  both services are shared)
- Hardware per [hardware/BOM.md](../hardware/BOM.md) (~CAD $85)

## 1. Hardware Assembly

1. Breadboard first: follow [hardware/breadboard.md](../hardware/breadboard.md) —
   a staged build with a checkpoint after every subsystem.
2. Reference wiring details are in [hardware/wiring.md](../hardware/wiring.md):
   VL53L1X + SHT41 on I²C (D0 SDA / D1 SCL), relay on D7, battery divider on A0.
3. Enclosure and glass window come later (they need calibration, step 7).
4. Run [test/bench-test.md](../test/bench-test.md) in full before any deployment.

## 2. Firmware

```bash
npm install -g particle-cli
particle login                        # interactive — email + password/2FA

# Claim the device (USB, once)
particle usb list
particle device add <device-id> --name skimmer-monitor
particle wifi add                     # provision WiFi credentials

# Configure
$EDITOR src/config.h                  # at minimum: MQTT_BROKER, SKIMMER_DEPTH_MM

# Compile (cloud compiler resolves deps from project.properties) and flash
particle compile photon2 . --saveTo firmware.bin
particle flash --usb firmware.bin     # or OTA: particle flash skimmer-monitor firmware.bin
```

Verify it's alive:

```bash
particle serial monitor --follow      # boot logs over USB
particle subscribe skimmer mine       # cloud events as they publish
particle get skimmer-monitor level_mm # poll a cloud variable
```

## 3. MQTT Broker

Any Mosquitto works. Confirm the device publishes (from any LAN machine):

```bash
mosquitto_sub -h <broker-ip> -t 'pool/skimmer/#' -t 'skimmer/#' -v
# or use the bundled helper:
scripts/monitor.sh <broker-ip>
```

Recommended retention flags per topic are listed in [mqtt-schema.md](mqtt-schema.md).

## 4. Postgres + Ingestion Bridge

On the host running Mosquitto/Postgres:

```bash
git clone https://github.com/smhunt/skimmer-monitor.git
cd skimmer-monitor/integration
npm install

cp .env.example .env                  # set MQTT_URL and DATABASE_URL
psql "$DATABASE_URL" -f schema.sql    # creates skimmer_readings + skimmer_events

npm run ingest                        # foreground test — watch for [ingest] inserted rows
```

When rows appear, daemonize it:

```bash
pm2 start "npx tsx src/ingest.ts" --name skimmer-ingest
pm2 save
```

## 5. Home Assistant

Merge [home-assistant.yaml](home-assistant.yaml) into your HA config (MQTT sensors for
level/temp/humidity/battery, binary sensors for alerts). Restart HA; entities appear
under the `pool_skimmer` prefix.

## 6. MCP Server (Claude Integration)

Get a Particle access token for `force_fill`:

```bash
particle token create --never-expires   # or omit the flag for a 90-day token
```

Register with Claude Code (user scope = every project):

```bash
claude mcp add skimmer --scope user \
  --env DATABASE_URL='postgresql://user:pass@<db-host>:5432/iot' \
  --env PARTICLE_TOKEN='<token>' \
  --env PARTICLE_DEVICE='skimmer-monitor' \
  -- npx tsx /path/to/skimmer-monitor/integration/src/mcp-server.ts

claude mcp get skimmer                  # expect: ✔ Connected
```

Then ask Claude: *"what's the skimmer level?"*, *"any fills this week?"*,
*"what's the evaporation rate lately?"*, or *"top up the pool"* (which the firmware
may still veto — see safety interlocks in [README.md](README.md#safety-interlocks-firmware-enforced)).

The read-only tools work with just `DATABASE_URL`; omit the Particle vars until the
device is claimed and `force_fill` will explain what's missing rather than fail silently.

## 7. Calibration (after enclosure assembly)

The glass window shifts ToF readings slightly. Follow
[calibration.md](calibration.md): drain the skimmer, run
`particle call skimmer-monitor calibrate`, set `SKIMMER_DEPTH_MM` /
`WINDOW_OFFSET_MM` in `config.h`, reflash, then verify at three known water levels
against a tape measure (±2 mm target).

## 8. Deployment

[hardware/enclosure.md](../hardware/enclosure.md) covers lid mounting, the Gore-Tex
vent + silica gel (condensation), external antenna routing, and the solar panel mount.
Before leaving it unattended:

- [ ] Rate-of-rise abort tested with the valve **disconnected**
- [ ] Max-duration timeout observed end-to-end
- [ ] Hardware shutoff accessible at the equipment pad
- [ ] Backflow prevention on the fill line (code requirement in most jurisdictions)

## Troubleshooting

| Symptom | Check |
|---------|-------|
| No MQTT messages | `MQTT_BROKER` IP in config.h; broker reachable from pool WiFi; RF through skimmer lid (external antenna) |
| Cloud vars stale | Device sleeping is normal — values refresh every 5 min wake |
| `tof-init-failed` event | I²C wiring, 3.3 V supply, sensor address conflict |
| Ingest rows missing fields | Fields arrive on separate topics; the 2 s debounce assembles them — partial rows mean dropped packets |
| MCP tools error | `DATABASE_URL` reachable from your Mac? `psql "$DATABASE_URL" -c 'select 1'` |
| `force_fill` returns <0 | An interlock fired: battery low, daily cap hit, or fill already running |
