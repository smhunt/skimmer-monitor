# Smart Skimmer AI — Exploration & Vision

> **Status:** Exploratory design doc. Nothing here is committed to hardware or the
> shipping firmware yet. This is a Phase-0 spike to decide *whether* and *how* to
> evolve the current water-level monitor into a full **AI-driven pool-health system**.
>
> Created 2026-07-06 on branch `claude/smart-pool-skimmer-24324s`.

## 1. Why

The current device answers one question well: *"How much water is in the skimmer, and
should I top it up?"* It measures level, temperature, humidity, and battery, and it
controls a fill valve with hard safety interlocks. That is a **level monitor with
auto-fill** — deliberately narrow, and it should stay reliable.

The skimmer, though, is the single best listening post on the whole pool. **Every litre
of circulated water passes through it.** That makes it the natural home for a broader
mission: continuously **follow, track, record, and analyze the health of the pool** —
chemistry, clarity, circulation, and equipment behaviour — and let an AI layer turn that
raw stream into plain-language guidance ("add 250 g of stabilizer", "your filter is
starting to load up", "chlorine is drifting low every afternoon — bump the pump schedule").

This document explores that new system without disturbing the safety-critical firmware
that already works.

## 2. Design Principles

1. **Don't break the water valve.** The auto-fill interlocks in `CLAUDE.md` §"Critical
   Safety Requirements" are sacred. The AI system is **advisory and observational**; it
   never gains authority over the fill valve beyond the existing `force_fill` path, and
   even that stays subordinate to firmware interlocks.
2. **Additive, not a rewrite.** New sensing lives on a **separate board / power domain**
   so a chemistry-sensor fault can never brown out the level monitor.
3. **Edge collects, cloud reasons.** The Photon 2 stays a dumb, robust collector. All AI
   inference runs off-device (server at `10.10.10.24`, or Claude via the MCP layer).
   No LLM on the microcontroller.
4. **Reuse the pipeline.** MQTT (`pool/skimmer/*`) → Postgres → MCP is already built.
   New signals are new topics and new columns, not a new stack.
5. **Every recommendation is explainable and reversible.** The AI proposes; a human (or a
   logged, rate-limited automation) disposes. Chemical dosing especially is *advisory-first*.

## 3. What "Pool Health" Actually Means

Health is more than water level. The system tracks four pillars:

| Pillar | Signals | Why it matters |
|--------|---------|----------------|
| **Chemistry** | free/total chlorine (ORP proxy), pH, temperature, TDS/salinity, optional cyanuric acid | Swimmer safety, scale/corrosion, sanitizer efficacy |
| **Clarity** | turbidity (nephelometric), colour tint | Early algae bloom, filter breakthrough, dust/pollen load |
| **Circulation** | flow presence in skimmer, level draw-down under pump, temp mixing | Pump/valve faults, blocked skimmer basket, air lock |
| **Equipment & Environment** | battery/solar, enclosure humidity, ambient temp, rainfall (weather API) | Predict maintenance, separate evaporation from leaks |

The existing level + evaporation logic becomes the **Circulation/Environment** pillar. The
new work is Chemistry and Clarity.

## 4. Proposed Architecture

```
 ┌──────────────────── Pool skimmer ─────────────────────┐
 │  EXISTING (unchanged, safety-critical)                │
 │   Photon 2 ─ VL53L1X (level) ─ SHT41 ─ battery ─ relay│
 │                                                        │
 │  NEW  "sense board" (separate power domain)           │
 │   ESP32-S3 ─ ORP probe ─ pH probe ─ temp (DS18B20)    │
 │            ─ turbidity ─ TDS ─ (flow reed switch)      │
 └───────────────┬───────────────────────┬───────────────┘
                 │ MQTT pool/skimmer/level│ MQTT pool/skimmer/chem/*
                 ▼                        ▼
                    Mosquitto broker (10.10.10.24)
                             │
                 ┌───────────┴────────────┐
                 ▼                        ▼
        integration/ingest         Home Assistant
                 │                  (dashboards, alerts)
                 ▼
            Postgres  (readings, events, + new chem_readings)
                 │
                 ▼
        ┌────────────────── AI layer ──────────────────┐
        │  Analyzer service (scheduled + on-event):     │
        │   • baselines, trend/anomaly detection        │
        │   • Langelier Saturation Index, dose math     │
        │   • correlate with weather / bather load      │
        │  MCP server → Claude for natural-language      │
        │   Q&A, weekly health report, "what changed?"  │
        └───────────────────────────────────────────────┘
```

### Why a second microcontroller?

- **Isolation:** chemistry probes are noisy, need frequent calibration, and some (ORP/pH)
  want continuous power. Keeping them off the level board protects the 5-month battery
  life and the valve logic.
- **Independent failure:** a shorted turbidity sensor cannot crash the fill controller.
- **Cadence mismatch:** level is sampled every 5 min on a sleep cycle; chemistry is
  better sampled continuously (or every 60–120 s) while circulation is running.

An **ESP32-S3** is the candidate: cheap, native MQTT/WiFi, plenty of ADC channels for
analog probes, and it can be mains/USB-powered off the equipment pad since the chemistry
head can live in the return plumbing rather than the battery-powered skimmer lid.

## 5. New Data Contract (draft)

New MQTT topics under the existing namespace:

| Topic | Payload | Cadence |
|-------|---------|---------|
| `pool/skimmer/chem/orp` | float (mV) | 60 s while circulating |
| `pool/skimmer/chem/ph` | float | 60 s |
| `pool/skimmer/chem/water_temp` | float (°C) | 60 s |
| `pool/skimmer/chem/tds` | float (ppm) | 5 min |
| `pool/skimmer/chem/turbidity` | float (NTU) | 5 min |
| `pool/skimmer/chem/flow` | bool | on change |

New Particle/analyzer events:

| Event | Trigger |
|-------|---------|
| `skimmer/health` | Rolled-up health score + top recommendation (scheduled) |
| `skimmer/chem-alert` | Chemistry out of band (e.g. pH < 7.2, ORP < 650 mV) |
| `skimmer/clarity-alert` | Turbidity rising toward algae threshold |

New Postgres table (mirrors `skimmer_readings` style):

```sql
CREATE TABLE chem_readings (
  ts           timestamptz NOT NULL DEFAULT now(),
  orp_mv       real,
  ph           real,
  water_temp_c real,
  tds_ppm      real,
  turbidity_ntu real,
  flow         boolean
);
```

## 6. The AI Layer

Two cooperating pieces, both off-device:

1. **Analyzer service** (deterministic, cheap, always-on) — computes the math that
   should *not* be left to an LLM:
   - Rolling baselines and >2σ anomaly flags (already planned for fill volume in
     `prompt_plan.md` Phase 6 — generalize it to every signal).
   - **Langelier Saturation Index** from pH, temp, TDS, alkalinity → scale/corrosion risk.
   - **Dose calculator**: given pool volume + current vs. target chemistry, output grams
     of chlorine/acid/stabilizer. Pure arithmetic, unit-checked, no hallucination surface.
   - Separates **evaporation vs. leak** by correlating draw-down with the weather API and
     temperature (extends the existing `get_evaporation_rate`).

2. **Claude via MCP** (reasoning + language) — turns the analyzer's structured output into
   guidance and answers ad-hoc questions. New MCP tools extend the existing four:

   | Tool | Description |
   |------|-------------|
   | `get_pool_health()` | Current multi-pillar snapshot + composite 0–100 score |
   | `get_chem_history(days)` | Chemistry trends with anomalies annotated |
   | `diagnose(symptom)` | "water is cloudy" → ranked causes from the data |
   | `recommend_dose()` | Analyzer's dose math, explained in plain language |
   | `weekly_report()` | Narrative health summary + what changed vs. last week |

   **Division of labour:** the analyzer owns numbers; Claude owns words and judgement.
   Claude never invents a dose — it reads `recommend_dose()` and explains it. This keeps
   the safety-relevant math auditable.

## 7. Phased Plan (proposed)

This slots in *after* the current device is bench-tested and deployed — it does not
displace Phases 2–5 in `prompt_plan.md`.

- **Phase 0 — Spike (this doc).** Validate the vision, pick the second MCU, confirm the
  data contract. *No hardware spend.*
- **Phase A — Sense board bring-up.** ESP32-S3 + ORP + pH + water temp on the bench,
  publishing to a `pool/skimmer/chem/*` test topic. Probe calibration procedure.
- **Phase B — Ingest + storage.** Add `chem_readings` to `integration/schema.sql`,
  extend the ingest bridge to the new topics. No AI yet — just recording.
- **Phase C — Analyzer service.** Baselines, LSI, dose math, evaporation-vs-leak. Emits
  `skimmer/health` and `skimmer/chem-alert`. Deterministic and unit-tested.
- **Phase D — AI layer.** New MCP tools; weekly natural-language health report; Claude Q&A.
- **Phase E — Clarity + advisory dosing.** Turbidity/algae early warning. *Advisory-only*
  dosing recommendations (human confirms). Automated dosing is explicitly out of scope
  until a separate safety review.

## 8. Open Questions

- **Probe placement:** in-skimmer (battery, intermittent flow) vs. inline on the return
  (mains power, continuous flow, but a plumbing job). Leaning inline for chemistry.
- **Calibration burden:** pH/ORP probes drift and need periodic recalibration. Can the AI
  layer *detect* drift (flat-lining, implausible correlations) and prompt for recal?
- **Pool volume input:** dose math needs an accurate volume. Measure once, store in config.
- **Weather API:** which provider, and does the network policy here allow the outbound call?
- **Bather-load signal:** turbidity + ORP dips correlate with swimmers. Worth modelling, or
  noise? Revisit after Phase C data exists.
- **Automated dosing:** deliberately deferred. Chemical injection has a worse failure mode
  than the water valve. Requires its own interlock design and review.
- **Target market — pool vs. spa (or both):** hot tub / spa health may be the stronger,
  easier-to-win wedge (see §9). Decide sequencing before committing hardware.

## 9. Adjacent Market: Hot Tub / Spa Health

A pool is not the only — or even the best — home for this system. **Spas and hot tubs may
be a larger and easier-to-win market**, and the AI-health architecture in §4–6 arguably
fits them *better* than it fits pools. Worth a serious look before committing to a
pool-first roadmap.

### Why spas may be the stronger wedge

- **Chemistry is the whole ballgame.** A spa holds ~1,500–2,000 L vs. a pool's 50,000+ L.
  Small volume means chemistry swings *fast* — a single soak can crater sanitizer and
  spike pH within an hour. Continuous chemistry monitoring, which is a nice-to-have on a
  slow-moving pool, becomes genuinely valuable on a spa.
- **Heat amplifies everything.** At 38 °C, chlorine/bromine depletes rapidly, scale risk
  (Langelier) climbs, and off-gassing accelerates. Owners are told to test **daily or
  twice-daily by hand** — a real, recurring pain point the AI layer directly removes.
- **Bather load per litre is extreme.** Turbidity and sanitizer crash quickly after use,
  making the clarity + ORP early-warning story more compelling, not less.
- **Year-round use = year-round value.** Canadian pools are seasonal (~4 months); hot tubs
  run 12 months. Continuous data means continuous engagement — a far better retention and
  subscription story.
- **Retrofit-friendly, no drilling.** No skimmer lid to fabricate. The chemistry head goes
  **inline at the spa pack** or as a **floating sensor** — and §4/§8 already lean *inline*
  for chemistry, so the spa case actually *simplifies* the design.
- **Mains power is right there.** The equipment pack has continuous power, killing the
  battery/solar constraint that dominates the skimmer BOM. The separate-power-domain sense
  board (§4) becomes the *primary* board, not an add-on.
- **Engaged, tech-forward owners.** Spa owners already buy test strips, apps, and
  automation; the willingness-to-pay for "stop testing by hand" is established.

### What changes for spas

- **Sanitizer chemistry differs.** Many spas run **bromine**, not chlorine — ORP
  interpretation and dose math need a bromine mode. Some use biguanide/mineral systems
  (no ORP signal at all) — detect and degrade gracefully.
- **The "skimmer as listening post" framing drops away.** Spas have a weir/filter, not a
  true skimmer. The value prop shifts fully to the **inline chemistry head** — which is
  the part that generalizes; the level/auto-fill firmware is pool-specific and largely
  irrelevant here.
- **Harsher sensing environment.** Higher temp, foam, biofilm, and jet aeration stress the
  probes and add noise. Spec probes for sustained 40 °C+ and expect more frequent recal.
- **Water-level auto-fill is a non-goal.** Spas are topped up manually and infrequently, so
  the safety-critical valve control — the reason the pool firmware is conservative — mostly
  falls away. That makes a spa product a **cleaner, more self-contained build**: it *is*
  the "entirely new system," without a legacy safety envelope wrapped around it.

### Recommendation

Treat **spa health as a parallel target, not a detour.** The analyzer service, MQTT/Postgres
contract, and MCP/Claude AI layer (§5–6) are shared across both; only the sensing front-end
and the chlorine-vs-bromine dose math diverge. A sensible sequencing question for Sean:
**lead with spa** (self-contained, year-round, mains-powered, chemistry-first) and let the
pool integration reuse the same analyzer — or keep pool-first because the hardware already
exists. This belongs on the Phase-0 decision list alongside the second-MCU choice.

## 10. Relationship to the Existing System

| Existing | This exploration |
|----------|------------------|
| Level + auto-fill (safety-critical) | **Untouched.** Becomes the Circulation/Environment pillar. |
| `pool/skimmer/*` MQTT, Postgres, MCP | **Reused and extended**, not replaced. |
| 4 MCP tools | Grows to ~9; existing four keep working. |
| Phase 6 anomaly detection (planned) | **Generalized** from fill-volume to all signals. |

The guiding rule: **the new smart-health system wraps around the proven monitor, it does
not rewire it.** If every new sensor and the entire AI layer went offline tomorrow, the
skimmer would still measure level and top itself up safely.
