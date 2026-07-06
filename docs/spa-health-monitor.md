# Spa / Hot Tub Health Monitor — Companion Design

> **Status:** Exploratory, spa-first companion to
> [`smart-skimmer-ai-vision.md`](smart-skimmer-ai-vision.md). Fleshes out the §9 argument
> that hot tubs may be the stronger wedge: a concrete sensing front-end, bromine-aware
> dose math, and the floating-vs-inline placement decision. Shares the analyzer / MQTT /
> Postgres / MCP "brain" from the vision doc — only the front-end and sanitizer math differ.
>
> Created 2026-07-06 on branch `claude/smart-pool-skimmer-24324s`. No hardware spend yet.

## 1. Product in One Sentence

A mains-powered chemistry head on the spa's equipment pack (or a floating sensor puck) that
continuously reads sanitizer, pH, temperature, TDS, and clarity, publishes to the existing
`pool/skimmer/*` pipeline, and lets the AI layer tell the owner *"add 15 g of pH-down and
one bromine tab — you'll be balanced in 30 minutes"* instead of making them dip test strips
twice a day.

## 2. Why Spa-First (recap)

Full argument in `smart-skimmer-ai-vision.md` §9. The load-bearing points:

- Small volume (~1,500 L) + high temp (38 °C) ⇒ chemistry swings fast ⇒ continuous
  monitoring is *needed*, not just nice.
- Year-round use (vs. seasonal pool) ⇒ continuous value + retention.
- Mains power at the pack ⇒ no battery/solar constraint; the sense board is primary.
- No skimmer lid to fabricate, **no auto-fill safety envelope** ⇒ genuinely self-contained.

## 3. Sensor Placement: Floating vs. Inline

The one architectural fork for a spa. Both feed the identical data contract.

| | **Floating puck** | **Inline (plumbed at pack)** |
|---|---|---|
| Install | Drop it in — zero plumbing | Tee into circulation after the heater; a real plumbing job |
| Power | Battery + Qi/solar top-up (back to the pool constraint) | Mains at the pack — continuous |
| Flow past probes | Intermittent, aeration/foam near surface | Steady, de-aerated, representative |
| ORP/pH quality | Noisier (surface film, bather contact, off-gassing) | Cleaner, more stable readings |
| Fouling / biofilm | Exposed to scum line | Enclosed, but harder to service |
| Recalibration | Lift out, easy | Isolation valves or shutdown to remove probe |
| Retail story | Consumer, self-install, impulse buy | Installer / OEM channel, higher ASP |
| Temp exposure | Full 40 °C+ soak, UV on cover-off | 40 °C+ but shaded, no UV |

**Recommendation:** prototype **inline** for signal quality (it's what makes the AI
trustworthy), but design the probe carrier so the *same* board drops into a **floating
puck** housing later. Inline wins the OEM/installer channel and gives clean data; the puck
is the eventual self-install SKU. Lead with inline to prove the chemistry, productize the
puck once the analyzer is validated.

> **Design rule:** the PCB and firmware must not care which housing they're in. Placement is
> a mechanical + calibration-profile choice, not a code fork.

## 4. Sensing Front-End (draft BOM)

Target: continuous chemistry on mains power at the spa pack. Costs are rough CAD, single-unit,
Canadian sourcing per `CLAUDE.md` (BC Robotics / Solarbotics / ABRA / DigiKey Canada).

| Function | Part (candidate) | Interface | ~CAD | Notes |
|---|---|---|---|---|
| MCU | ESP32-S3 (WROOM/DevKit) | WiFi + MQTT, ADC, I²C | 12 | Native networking; ample ADC for analog probes |
| Sanitizer (proxy) | ORP probe + isolated ADC front-end | analog → ADS1115 | 55 | Reads redox for both chlorine **and** bromine; interpretation differs (see §5) |
| pH | Industrial pH probe + isolated ADC | analog → ADS1115 | 45 | Double-junction, sealed — survives 40 °C+ better |
| Water temp | DS18B20 (sealed, stainless) | 1-Wire | 8 | Also drives temp-compensated pH/ORP + LSI |
| TDS / conductivity | Analog TDS module | analog | 12 | Salinity + drives LSI; drift-prone, treat as coarse |
| Turbidity | Nephelometric turbidity module | analog | 20 | Clarity / early cloudiness + biofilm proxy |
| ADC | ADS1115 (16-bit, 4-ch) | I²C | 6 | Shared by ORP/pH; isolate grounds to kill probe cross-talk |
| Isolation | I²C isolator + isolated DC-DC | — | 15 | **Critical:** ORP/pH share water; galvanic loops corrupt readings |
| Power | 5 V mains adapter + 3.3 V reg | — | 12 | At the pack; no battery |
| Enclosure | IP65 + cable glands, probe carrier tee | — | 30 | Inline tee or puck shell; sustained 40 °C+ rating |
| **Total** | | | **~230** | Bench prototype; probes dominate and drop at volume |

Notes:
- **Probes are the cost and the risk.** ORP and pH are consumables (6–18 mo life) needing
  periodic recal. The analyzer must *detect drift* (flat-lining, implausible ORP/pH
  correlation, out-of-range at known-good chemistry) and prompt for recalibration — a core
  AI-layer feature, not an afterthought.
- **Galvanic isolation is non-negotiable.** Multiple probes in the same water form ground
  loops that quietly bias ORP/pH. Isolate each analog front-end.
- **No mineral/biguanide ORP signal.** Some spas run biguanide (Baqua-type) systems with no
  redox signal at all — detect the flatline and degrade to pH/temp/TDS/turbidity only,
  telling the user ORP is unavailable rather than reporting garbage.

## 5. Sanitizer Chemistry: Bromine vs. Chlorine

The one math divergence from the pool product. ORP alone gives redox potential (mV) but
**not** ppm — dosing needs a chemistry mode.

### Modes to support

1. **Chlorine** (shared with pool) — free chlorine target 1–3 ppm; ORP ~650–750 mV is the
   healthy band, temp- and pH-compensated.
2. **Bromine** (spa default) — total bromine target **3–5 ppm**; bromine holds better at spa
   temperatures and is less pH-sensitive, which is exactly why spas prefer it. ORP band runs
   **lower for the same sanitizing power** (~600–700 mV) — using the chlorine band would
   over-dose. Bromine also regenerates from bromide via oxidizer, so dose logic differs.
3. **Biguanide / mineral** — no ORP; monitor-only mode (pH/temp/TDS/turbidity), no sanitizer
   dose recommendation.

### Dose math (deterministic — lives in the analyzer, never the LLM)

All arithmetic, unit-checked. `V` = spa volume in litres (config, measured once).

```
# pH adjustment (both modes). Constants are dry-acid / soda-ash rules of thumb,
# refined against product labels + measured response.
pH high (lower it):   grams_dry_acid   = K_acid  * V/1000 * (pH_now - pH_target)
pH low  (raise it):   grams_soda_ash   = K_soda  * V/1000 * (pH_target - pH_now)

# Bromine top-up to target ppm (granular or tab-equivalent):
grams_bromine = (ppm_target - ppm_now) * V / 1000 / yield_factor

# Chlorine top-up (pool-shared):
grams_chlorine = (ppm_target - ppm_now) * V / 1000 / available_cl_fraction
```

- ppm is estimated from **temp+pH-compensated ORP** via a per-mode calibration curve, or
  entered from a test-strip reading to anchor the curve (hybrid: sensor trends, strip
  calibrates).
- **Every dose is clamped** to a sane max per action and rate-limited; the analyzer refuses
  to recommend more than a single conservative correction at once, then re-measures.
- Output is **advisory** — the owner adds it and confirms. Automated injection stays out of
  scope (vision doc §8) pending a dedicated safety review; a spa's small volume makes
  overdose *more* dangerous per gram, not less.
- **Langelier Saturation Index (LSI)** from pH, temp, TDS/hardness, alkalinity flags
  scale/corrosion — more acute at 38 °C. Same LSI code as the pool product.

## 6. Data Contract (delta from vision doc §5)

Reuses `pool/skimmer/chem/*` unchanged. Two spa-specific additions:

| Topic | Payload | Notes |
|---|---|---|
| `pool/spa/chem/sanitizer_mode` | `"bromine" \| "chlorine" \| "biguanide"` | Set in config; drives dose math + ORP band |
| `pool/spa/chem/cover` | bool | Cover on/off — huge effect on temp, evap, sanitizer burn; helps the analyzer separate soak events from drift |

Everything else (`orp`, `ph`, `water_temp`, `tds`, `turbidity`, `flow`) is identical to the
vision doc, so the ingest bridge and `chem_readings` table need **no schema fork** — add a
nullable `sanitizer_mode` / `cover` column and reuse.

## 7. AI Layer — Spa Framing

Same analyzer + MCP/Claude split as vision doc §6, retuned for spa cadence and language:

- **Faster baselines.** Spa chemistry moves in hours, not days — rolling windows shrink to
  hours; "you soaked last night, here's the morning correction" is the flagship interaction.
- **Cover-aware.** Correlate sanitizer/temp swings with `cover` state to separate normal
  post-soak dips from real drift or a failing sanitizer feed.
- **Spa-tuned MCP tools** (extend the vision doc's set):
  - `get_spa_health()` — sanitizer/pH/temp/clarity snapshot + composite score
  - `recommend_dose()` — mode-aware (bromine/chlorine) grams + tabs, plain language
  - `diagnose(symptom)` — "water's cloudy/foamy/smells" → ranked causes from the data
  - `soak_readiness()` — is it safe/comfortable to get in right now?
  - `weekly_report()` — usage vs. chemistry vs. cost of chemicals
- **Drift/recal prompts.** The analyzer watches for probe drift (§4) and Claude surfaces
  *"your pH probe looks like it needs recalibration — here's the 2-minute procedure."*

## 8. Phased Plan (spa track)

Mirrors the vision doc's A→E but spa-scoped; shares Phases C/D (analyzer + AI) with pool.

- **Phase S0 — this doc.** Validate spa-first, pick placement (inline prototype), confirm
  bromine math sources. No spend.
- **Phase S1 — Bench chemistry head.** ESP32-S3 + ORP + pH + DS18B20 in a bucket at 38 °C,
  publishing `pool/spa/chem/*`. Nail galvanic isolation and a repeatable calibration
  procedure. This is the make-or-break signal-quality phase.
- **Phase S2 — Ingest + record.** Add nullable `sanitizer_mode`/`cover` columns; extend the
  bridge. Record only — no advice yet.
- **Phase S3 — Analyzer (shared).** Bromine/chlorine dose math + LSI + drift detection +
  cover-aware baselines. Deterministic, unit-tested.
- **Phase S4 — AI layer (shared).** Spa MCP tools, morning-after dose guidance, weekly report.
- **Phase S5 — Puck SKU + clarity.** Repackage the proven board into a floating puck for
  self-install; turbidity-driven cloudiness/biofilm early warning.

## 9. Open Questions (spa-specific)

- **Volume input.** Dose math needs accurate `V`. Owner-entered from the spa's spec, or a
  guided fill-line estimate? Wrong volume = wrong dose.
- **Probe life at 38 °C.** Continuous heat shortens ORP/pH probe life — quantify on the
  bench before promising a maintenance interval.
- **Strip-calibration UX.** Hybrid (sensor trends, test strip anchors the ppm curve) is
  robust but asks the user to occasionally enter a strip reading. Acceptable, or a
  dealbreaker for the "never test again" pitch?
- **Regulatory / liability.** Advising sanitizer doses for water people sit in is a higher
  bar than topping up a pool. Advisory-only + clamps + "confirm before adding" language, and
  keep a documented audit trail of every recommendation.
- **Channel.** Inline → dealer/OEM; puck → DTC retail. Which first shapes packaging, ASP,
  and the calibration-support burden.

## 10. Relationship to the Pool Product

| Shared (one codebase) | Spa-specific (this doc) |
|---|---|
| Analyzer service, LSI, drift detection | Bromine mode + ORP band, cover-aware baselines |
| MQTT `chem/*` contract, `chem_readings`, ingest | `sanitizer_mode` / `cover` columns |
| MCP/Claude AI layer | Spa-tuned tools + faster cadence |
| ESP32-S3 sense board | Inline tee **or** floating puck housing |
| — (pool only) | *No* auto-fill valve / safety-critical firmware |

The bet: **build the brain once, ship the sensing front-end that reaches the best market
first.** Spa is the leading candidate for that first front-end.
