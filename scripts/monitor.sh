#!/usr/bin/env bash
# Live monitor for skimmer events
# Requires: mosquitto-clients, particle-cli

set -euo pipefail

DEVICE_NAME="${1:-skimmer-photon-01}"
MQTT_BROKER="${MQTT_BROKER:-localhost}"

echo "=== Skimmer Monitor: $DEVICE_NAME ==="
echo "MQTT broker: $MQTT_BROKER"
echo ""

# Subscribe to MQTT in background
(
  echo "[MQTT] Subscribing to pool/skimmer/#"
  mosquitto_sub -h "$MQTT_BROKER" -t "pool/skimmer/#" -v | \
    while IFS= read -r line; do
      ts=$(date +"%H:%M:%S")
      echo "[$ts] [MQTT] $line"
    done
) &
MQTT_PID=$!

# Subscribe to Particle Cloud events in foreground
echo "[CLOUD] Subscribing to skimmer/ events"
trap "kill $MQTT_PID 2>/dev/null || true; exit" INT TERM

particle subscribe skimmer mine
