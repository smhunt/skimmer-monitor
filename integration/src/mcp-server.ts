/**
 * Skimmer MCP server (stdio transport)
 *
 * Exposes the skimmer monitor to Claude via four tools backed by the shared
 * Postgres instance and the Particle Cloud API:
 *
 *   get_skimmer_level      — latest sensor snapshot
 *   get_fill_history       — fill cycles over the last N days
 *   force_fill             — request a manual fill (or stop) via Particle Cloud
 *   get_evaporation_rate   — average daily water loss excluding fill days
 *
 * Register with Claude Code:
 *   claude mcp add skimmer -- npx tsx /path/to/integration/src/mcp-server.ts
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { db } from "./db.js";
import { callParticleFunction } from "./particle.js";

const server = new McpServer({ name: "skimmer-monitor", version: "0.1.0" });

function textResult(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

server.registerTool(
  "get_skimmer_level",
  {
    description:
      "Get the latest skimmer water level reading (level in mm from skimmer bottom, " +
      "enclosure temperature/humidity, battery voltage, fills today).",
    inputSchema: {},
  },
  async () => {
    const { rows } = await db.query(
      `SELECT ts, level_mm, temp_c, humidity, battery_v, fills_today
       FROM skimmer_readings ORDER BY ts DESC LIMIT 1`,
    );
    if (rows.length === 0) return textResult({ error: "no readings recorded yet" });
    const ageMinutes = Math.round((Date.now() - new Date(rows[0].ts).getTime()) / 60000);
    return textResult({ ...rows[0], reading_age_minutes: ageMinutes });
  },
);

server.registerTool(
  "get_fill_history",
  {
    description:
      "List auto-fill cycles over the last N days: start/stop times, duration, and any " +
      "aborted fills (stop without start pairing or alert events).",
    inputSchema: { days: z.number().int().min(1).max(365).default(7) },
  },
  async ({ days }) => {
    const { rows } = await db.query(
      `SELECT ts, payload FROM skimmer_events
       WHERE category = 'fill' AND ts > now() - make_interval(days => $1)
       ORDER BY ts ASC`,
      [days],
    );

    const fills: Array<{ start: string; stop?: string; duration_minutes?: number }> = [];
    for (const row of rows) {
      if (row.payload === "start") {
        fills.push({ start: row.ts });
      } else if (row.payload === "stop" && fills.length > 0 && !fills[fills.length - 1].stop) {
        const current = fills[fills.length - 1];
        current.stop = row.ts;
        current.duration_minutes =
          Math.round((new Date(row.ts).getTime() - new Date(current.start).getTime()) / 6000) / 10;
      }
    }

    const { rows: alerts } = await db.query(
      `SELECT ts, payload FROM skimmer_events
       WHERE category = 'alert' AND ts > now() - make_interval(days => $1)
       ORDER BY ts ASC`,
      [days],
    );

    return textResult({ days, fill_count: fills.length, fills, alerts });
  },
);

server.registerTool(
  "force_fill",
  {
    description:
      "Manually start or stop the auto-fill valve via Particle Cloud. The firmware's " +
      "safety interlocks (10-min hard timeout, daily fill cap, rate-of-rise abort, " +
      "battery lockout) remain in force and cannot be bypassed.",
    inputSchema: { action: z.enum(["fill", "stop"]).default("fill") },
  },
  async ({ action }) => {
    const result = await callParticleFunction(action);
    return textResult({
      action,
      return_value: result.return_value,
      ok: result.return_value >= 0,
      note:
        result.return_value < 0
          ? "Device rejected the request (interlock active — check battery, daily fill cap, or an in-progress fill)."
          : "Request accepted by device.",
    });
  },
);

server.registerTool(
  "get_evaporation_rate",
  {
    description:
      "Estimate average daily water loss (mm/day) over the last N days. Days with fill " +
      "cycles are excluded so refills don't mask evaporation.",
    inputSchema: { days: z.number().int().min(2).max(90).default(7) },
  },
  async ({ days }) => {
    const { rows: dailyLevels } = await db.query(
      `SELECT date_trunc('day', ts)::date AS day,
              (array_agg(level_mm ORDER BY ts ASC))[1]  AS first_mm,
              (array_agg(level_mm ORDER BY ts DESC))[1] AS last_mm
       FROM skimmer_readings
       WHERE ts > now() - make_interval(days => $1)
       GROUP BY 1 ORDER BY 1`,
      [days],
    );

    const { rows: fillDays } = await db.query(
      `SELECT DISTINCT date_trunc('day', ts)::date AS day
       FROM skimmer_events
       WHERE category = 'fill' AND ts > now() - make_interval(days => $1)`,
      [days],
    );
    const fillDaySet = new Set(fillDays.map((r) => String(r.day)));

    const cleanDays = dailyLevels
      .filter((d) => !fillDaySet.has(String(d.day)))
      .map((d) => ({ day: d.day, drop_mm: Math.round((d.first_mm - d.last_mm) * 10) / 10 }));

    const avg =
      cleanDays.length > 0
        ? Math.round((cleanDays.reduce((s, d) => s + d.drop_mm, 0) / cleanDays.length) * 10) / 10
        : null;

    return textResult({
      days_requested: days,
      days_with_data: dailyLevels.length,
      fill_days_excluded: fillDaySet.size,
      avg_evaporation_mm_per_day: avg,
      daily_drops: cleanDays,
    });
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
console.error("[mcp] skimmer-monitor server ready on stdio");
