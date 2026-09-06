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
// `+` matches one level only, so pool/skimmer/+ does NOT catch pool/skimmer/chem/*.
// The chemistry subtree needs its own subscription.
const CHEM_TOPIC = "pool/skimmer/chem/+";
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

// Chemistry readings (pool-health expansion — PH-1). Assembled the same way:
// the sense board publishes the chem topics in a burst, debounced into one row.
// tds/turbidity arrive less often than orp/ph, so most rows carry them as null.
interface ChemBuffer {
  orp_mv?: number;
  ph?: number;
  water_temp_c?: number;
  tds_ppm?: number;
  turbidity_ntu?: number;
  flow?: boolean;
}

let chemBuffer: ChemBuffer = {};
let chemFlushTimer: NodeJS.Timeout | null = null;

const CHEM_FIELD_MAP: Record<string, keyof ChemBuffer> = {
  orp: "orp_mv",
  ph: "ph",
  water_temp: "water_temp_c",
  tds: "tds_ppm",
  turbidity: "turbidity_ntu",
  flow: "flow",
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

async function flushChemBuffer() {
  if (Object.keys(chemBuffer).length === 0) return;

  const snapshot = { ...chemBuffer };
  chemBuffer = {};
  chemFlushTimer = null;

  try {
    await db.query(
      `INSERT INTO chem_readings (orp_mv, ph, water_temp_c, tds_ppm, turbidity_ntu, flow)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        snapshot.orp_mv ?? null,
        snapshot.ph ?? null,
        snapshot.water_temp_c ?? null,
        snapshot.tds_ppm ?? null,
        snapshot.turbidity_ntu ?? null,
        snapshot.flow ?? null,
      ],
    );
    console.log(`[ingest] inserted chem reading: ${JSON.stringify(snapshot)}`);
  } catch (err) {
    console.error("[ingest] chem insert failed:", err);
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
  client.subscribe([READING_TOPIC, CHEM_TOPIC, EVENT_TOPIC], (err) => {
    if (err) console.error("[mqtt] subscribe error:", err);
    else console.log(`[mqtt] subscribed to ${READING_TOPIC}, ${CHEM_TOPIC}, ${EVENT_TOPIC}`);
  });
});

client.on("message", (topic, payload) => {
  const text = payload.toString();

  // Chemistry reading: pool/skimmer/chem/<field> — check before the generic
  // pool/skimmer/ branch, which these topics also match.
  if (topic.startsWith("pool/skimmer/chem/")) {
    const field = topic.split("/")[3];
    const key = CHEM_FIELD_MAP[field];
    if (key) {
      const value: number | boolean =
        key === "flow" ? /^(1|true|on)$/i.test(text.trim()) : parseFloat(text);
      (chemBuffer as Record<string, number | boolean>)[key] = value;
      // Debounce 2s after the last chem topic arrives (same as level readings)
      if (chemFlushTimer) clearTimeout(chemFlushTimer);
      chemFlushTimer = setTimeout(flushChemBuffer, 2000);
    }
    return;
  }

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
  console.log("[shutdown] flushing buffers...");
  if (flushTimer) clearTimeout(flushTimer);
  if (chemFlushTimer) clearTimeout(chemFlushTimer);
  await flushBuffer();
  await flushChemBuffer();
  await db.end();
  client.end();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
