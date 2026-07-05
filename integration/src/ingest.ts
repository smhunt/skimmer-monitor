/**
 * MQTT → Postgres ingestion bridge
 *
 * Mirrors the pattern used by the sump pump monitor.
 * Run as a long-lived process under PM2 or systemd:
 *   npm run ingest
 */

import mqtt from "mqtt";
import { db } from "./db.js";

const MQTT_URL = process.env.MQTT_URL ?? "mqtt://localhost:1883";
const READING_TOPIC = "pool/skimmer/+";
const EVENT_TOPIC = "skimmer/+";

interface ReadingBuffer {
  level_mm?: number;
  temp_c?: number;
  humidity?: number;
  battery_v?: number;
  fills_today?: number;
}

// Buffer for assembling a single row from multi-topic publish
let buffer: ReadingBuffer = {};
let flushTimer: NodeJS.Timeout | null = null;

const FIELD_MAP: Record<string, keyof ReadingBuffer> = {
  level: "level_mm",
  temperature: "temp_c",
  humidity: "humidity",
  battery: "battery_v",
  fills_today: "fills_today",
};

async function flushBuffer() {
  if (Object.keys(buffer).length === 0) return;

  const snapshot = { ...buffer };
  buffer = {};
  flushTimer = null;

  try {
    await db.query(
      `INSERT INTO skimmer_readings (level_mm, temp_c, humidity, battery_v, fills_today)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        snapshot.level_mm ?? null,
        snapshot.temp_c ?? null,
        snapshot.humidity ?? null,
        snapshot.battery_v ?? null,
        snapshot.fills_today ?? null,
      ],
    );
    console.log(`[ingest] inserted reading: ${JSON.stringify(snapshot)}`);
  } catch (err) {
    console.error("[ingest] insert failed:", err);
  }
}

async function recordEvent(category: string, payload: string) {
  try {
    await db.query(
      `INSERT INTO skimmer_events (category, payload) VALUES ($1, $2)`,
      [category, payload],
    );
    console.log(`[event] ${category}: ${payload}`);
  } catch (err) {
    console.error("[event] insert failed:", err);
  }
}

const client = mqtt.connect(MQTT_URL);

client.on("connect", () => {
  console.log(`[mqtt] connected to ${MQTT_URL}`);
  client.subscribe([READING_TOPIC, EVENT_TOPIC], (err) => {
    if (err) console.error("[mqtt] subscribe error:", err);
    else console.log(`[mqtt] subscribed to ${READING_TOPIC}, ${EVENT_TOPIC}`);
  });
});

client.on("message", (topic, payload) => {
  const text = payload.toString();

  // Reading: pool/skimmer/<field>
  if (topic.startsWith("pool/skimmer/")) {
    const field = topic.split("/")[2];
    const key = FIELD_MAP[field];
    if (key) {
      buffer[key] = parseFloat(text);
      // Flush 2s after last reading arrives (debounce)
      if (flushTimer) clearTimeout(flushTimer);
      flushTimer = setTimeout(flushBuffer, 2000);
    }
    return;
  }

  // Event: skimmer/<category>
  if (topic.startsWith("skimmer/")) {
    const category = topic.split("/")[1];
    recordEvent(category, text);
    return;
  }
});

client.on("error", (err) => {
  console.error("[mqtt] error:", err);
});

// Graceful shutdown
async function shutdown() {
  console.log("[shutdown] flushing buffer...");
  if (flushTimer) clearTimeout(flushTimer);
  await flushBuffer();
  await db.end();
  client.end();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
