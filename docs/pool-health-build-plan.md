# Pool Health Build Plan — Kickoff

> **Status:** Active build plan. This is the kickoff for the AI-driven health system,
> built **pool-first**; the spa/hot-tub variant is a planned later add-on that reuses the
> same brain (see [`spa-health-monitor.md`](spa-health-monitor.md)).
>
> Supersedes the "Phased Plan" in [`smart-skimmer-ai-vision.md`](smart-skimmer-ai-vision.md) §7
> as the doc of record for sequencing. Started 2026-09-06 on branch
> `claude/smart-pool-skimmer-24324s`.

## Decision record — pool-first, spa later

**Decided (2026-09-06):** build the health system on the **pool** first; add the **spa** as a
later front-end once the shared brain is proven.

The market analysis in `smart-skimmer-ai-vision.md` §9 still stands — a spa is a strong,
arguably larger wedge (small hot water, year-round, mains-powered, chemistry-first). We are
**not** discarding it; we are sequencing it second, on purpose:

- **Shortest path to a working system is the hardware already in hand.** The pool level +
  auto-fill device exists, compiles for the Photon/Photon 2, and its MQTT→Postgres→MCP
  pipeline is already deployed and verified (see `progress.md`). The health system extends
  that live pipeline instead of standing up a new front-end from zero.
- **Chlorine-only dose math ships first.** The pool path needs one sanitizer mode; bromine
  (and biguanide) are deferred with the spa, removing a chunk of make-or-break chemistry
  work from the critical path.
- **We accept the pool's known tradeoffs knowingly** — seasonal use and a battery/solar power
  budget for an in-skimmer head — because proving the analyzer + AI layer on real pool data
  is what de-risks the spa add-on later.

**Guardrail (unchanged):** the safety-critical level + auto-fill firmware and its five
interlocks are untouched. Everything here is **additive, advisory, and observational**. If
the entire health system went offline, the skimmer would still measure level and top itself
up safely.

## Where we're starting from

| Piece | State |
|-------|-------|
| Level + auto-fill firmware | Phase 1 complete; compiles for `photon`/`photon2`; bench test (Phase 2) pending hardware |
| MQTT broker (Mosquitto) | Deployed on 10.10.10.24:1883 |
| Ingest bridge + Postgres | Deployed (PM2 `skimmer-ingest`, `iot-postgres`); `skimmer_readings`/`skimmer_events` live |
| MCP server | Registered with Claude; 4 tools live |
| Chemistry sensing | **Not started** — this plan |

So the health build does **not** wait on the base-device bench test: its first phase is pure
software against the pipeline that's already running.

## Pool health phases

Numbered `PH-*` to avoid collision with the base device's Phases 1–6 in `prompt_plan.md`.

### PH-0 — Vision & data contract ✅
- `smart-skimmer-ai-vision.md` (four pillars, architecture, AI-layer split), this decision.
- **Done in this change:** `chem_readings` table added to `integration/schema.sql` — the
  storage side of the data contract, additive to the live schema.

### PH-1 — Data contract & storage  ← **start now, in parallel with base-device bench test**
Pure software; no hardware, no firmware. Get the pipeline ready to record chemistry.
- [x] `chem_readings` table in `schema.sql`
- [x] Document `pool/skimmer/chem/*` topics in `docs/mqtt-schema.md`
- [x] Extend the ingest bridge to subscribe `pool/skimmer/chem/+` and upsert `chem_readings`
- [x] Extend MCP with a read-only `get_chem_history(days)` against the new table
- [ ] **Live exit test** (needs the broker/DB on 10.10.10.24): `mosquitto_pub` of a synthetic
  chem reading lands a `chem_readings` row and is visible through the MCP tool.
- **Exit:** the live test above passes. Software side complete; only the round-trip remains.

### PH-2 — Chemistry sense board bring-up  (hardware)
The make-or-break signal-quality phase.
- ESP32-S3 + ORP + pH + water-temp (DS18B20) on the bench, publishing `pool/skimmer/chem/*`.
- **Galvanic isolation** between probes (shared water = ground loops that bias ORP/pH).
- Repeatable calibration procedure against reference solutions.
- Decide **pool probe placement** (see open questions): in-skimmer (battery, intermittent
  flow) vs. inline on the return (mains, continuous flow, a plumbing job).
- **Exit:** ORP/pH/temp read stable and track reference solutions within tolerance; readings
  land in `chem_readings` end-to-end.

### PH-3 — Analyzer service  (software, deterministic)  ← **core started**
The math that must **not** live in an LLM.
- [x] **Chemistry core** — `integration/src/analyzer/chemistry.ts`: Langelier Saturation Index
  (pH, temp, TDS, hardness, alkalinity → corrosive/balanced/scaling), chlorine dose calculator,
  and pH-adjustment estimate. All pure, unit-checked, clamped to a single conservative
  correction, advisory-only. **12 unit tests green** (`npm test`).
- [ ] Rolling baselines + >2σ anomaly flags (generalize `prompt_plan.md` Phase 6 to every signal).
- [ ] Evaporation-vs-leak separation (correlate draw-down with weather + temperature).
- [ ] Service wiring: subscribe chem readings, compute, emit `skimmer/health` and
  `skimmer/chem-alert` (into `skimmer_events`). Needs live signals (after PH-2).
- **Exit:** unit tests green (done for the core); alerts fire on injected out-of-band data;
  dose math matches hand calculation (verified in tests).

### PH-4 — AI layer  (MCP + Claude)
- New MCP tools: `get_pool_health`, `diagnose(symptom)`, `recommend_dose`, `weekly_report`
  (plus `get_chem_history` from PH-1).
- Weekly natural-language health report; ad-hoc Q&A. Analyzer owns numbers, Claude owns words —
  Claude never invents a dose.
- **Exit:** `get_pool_health()` returns a composite score; `recommend_dose()` explains the
  analyzer's chlorine math in plain language.

### PH-5 — Clarity + advisory dosing
- Add turbidity → algae/cloudiness early warning.
- **Advisory-only** dosing recommendations (human confirms). Automated injection stays out of
  scope pending a separate safety review.

## Spa as a later add-on (after PH-3/PH-4)

Once the analyzer and AI layer are proven on pool data, the spa is a **front-end swap on the
same brain**, not a new project. Scoped in `spa-health-monitor.md`; the deltas are bounded:
- Bromine (+ biguanide-monitor) sanitizer mode and its ORP band / dose math.
- Inline-tee or floating-puck housing; mains power; harsher 38 °C probe spec.
- `sanitizer_mode` / `cover` columns (nullable add — no schema fork).

Sequenced **after** pool PH-4 so it inherits a working analyzer, pipeline, and MCP layer.

## Critical path & immediate next actions

```
PH-1 (software) ─┐
                 ├─► PH-3 analyzer ─► PH-4 AI layer ─► PH-5 clarity ─► SPA add-on
PH-2 (hardware) ─┘
```
PH-1 and PH-2 run in parallel; PH-3 needs both (a schema to read, real signals to reason about).

**Do next:**
1. Add the `pool/skimmer/chem/*` topic table to `docs/mqtt-schema.md`.
2. Extend the ingest bridge + add `get_chem_history` MCP tool (finishes PH-1 against the live pipeline).
3. Order the PH-2 bench parts (ESP32-S3, ORP + pH probes, DS18B20, isolation) — Canadian sourcing per `CLAUDE.md`.
4. Resolve pool probe placement (below) before committing the enclosure/plumbing.

## Open questions (pool-specific)

- **Probe placement.** In-skimmer keeps one enclosure but means battery power + intermittent
  flow; inline-on-return gives mains + continuous flow at the cost of a plumbing tee. This is
  the pool analogue of the spa's floating-vs-inline decision and gates PH-2 mechanicals.
- **Pool volume input.** Dose math needs an accurate volume — measure once, store in config.
- **Weather API.** Which provider for the evaporation-vs-leak correlation, and does the
  network policy allow the outbound call?
- **Second MCU.** ESP32-S3 is the candidate for the sense board; confirm before PH-2 parts order.
