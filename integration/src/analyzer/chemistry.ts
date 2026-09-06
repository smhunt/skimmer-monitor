/**
 * Deterministic pool water-chemistry math (PH-3 core).
 *
 * This is the "numbers, never the LLM" layer from docs/smart-skimmer-ai-vision.md §6:
 * every dose and index here is pure, unit-checked arithmetic with no hallucination
 * surface. The analyzer service (PH-3) and the recommend_dose MCP tool (PH-4) call
 * these; Claude only ever *explains* what these functions return, never invents a dose.
 *
 * Everything is advisory. Doses are clamped to a single conservative correction and the
 * caller is expected to re-measure before dosing again. Automated injection is out of
 * scope (build plan PH-5) pending a dedicated safety review.
 *
 * Pool = chlorine only. Bromine/biguanide belong to the spa add-on (spa-health-monitor.md).
 */

// --- Langelier Saturation Index -------------------------------------------

export type LsiClass = "corrosive" | "balanced" | "scaling";

export interface LsiInput {
  ph: number;
  tempC: number;
  tdsPpm: number;
  calciumHardnessPpm: number; // as CaCO3
  totalAlkalinityPpm: number; // as CaCO3
}

export interface LsiResult {
  lsi: number;
  classification: LsiClass;
  /** pH of saturation (the pH at which the water is balanced for these conditions). */
  phSaturation: number;
}

/** Balanced band half-width. |LSI| within this reads as balanced. */
export const LSI_BALANCED_BAND = 0.3;

function requirePositive(name: string, v: number): void {
  if (!Number.isFinite(v) || v <= 0) {
    throw new RangeError(`${name} must be a positive finite number (got ${v})`);
  }
}

/**
 * Langelier Saturation Index — scale (positive) vs. corrosion (negative) tendency.
 *   LSI = pH - pHs,  pHs = (9.3 + A + B) - (C + D)
 * A/B/C/D per the standard formulation (TDS, temperature, calcium hardness, alkalinity).
 */
export function langelierSaturationIndex(input: LsiInput): LsiResult {
  const { ph, tempC, tdsPpm, calciumHardnessPpm, totalAlkalinityPpm } = input;
  requirePositive("ph", ph);
  requirePositive("tdsPpm", tdsPpm);
  requirePositive("calciumHardnessPpm", calciumHardnessPpm);
  requirePositive("totalAlkalinityPpm", totalAlkalinityPpm);
  if (!Number.isFinite(tempC) || tempC <= -273) {
    throw new RangeError(`tempC must be above absolute zero (got ${tempC})`);
  }

  const A = (Math.log10(tdsPpm) - 1) / 10;
  const B = -13.12 * Math.log10(tempC + 273) + 34.55;
  const C = Math.log10(calciumHardnessPpm) - 0.4;
  const D = Math.log10(totalAlkalinityPpm);

  const phSaturation = 9.3 + A + B - (C + D);
  const lsi = round(ph - phSaturation, 2);

  const classification: LsiClass =
    lsi < -LSI_BALANCED_BAND ? "corrosive" : lsi > LSI_BALANCED_BAND ? "scaling" : "balanced";

  return { lsi, classification, phSaturation: round(phSaturation, 2) };
}

// --- Chlorine dosing -------------------------------------------------------

/** Available-chlorine fraction by dry product (mass of free Cl per mass of product). */
export const CHLORINE_PRODUCTS = {
  "cal-hypo": 0.65, // calcium hypochlorite
  dichlor: 0.56, // sodium dichloro-s-triazinetrione dihydrate
  trichlor: 0.9, // trichloro-s-triazinetrione
} as const;

export type ChlorineProduct = keyof typeof CHLORINE_PRODUCTS;

export interface ChlorineDoseInput {
  volumeL: number;
  currentPpm: number;
  targetPpm: number;
  product?: ChlorineProduct;
  /** Largest single-correction raise. Bigger gaps clamp and ask for a re-measure. */
  maxRaisePpm?: number;
}

export interface DoseResult {
  grams: number;
  appliedDelta: number;
  clamped: boolean;
  product: string;
  note: string;
}

/**
 * Grams of dry chlorine product to raise free chlorine from current to target ppm.
 *   grams = (Δppm * volumeL / 1000) / availableFraction
 * Chlorine only raises FC; if already at/above target, returns 0.
 */
export function chlorineDoseGrams(input: ChlorineDoseInput): DoseResult {
  const { volumeL, currentPpm, targetPpm, product = "cal-hypo", maxRaisePpm = 5 } = input;
  requirePositive("volumeL", volumeL);
  if (!Number.isFinite(currentPpm) || currentPpm < 0) {
    throw new RangeError(`currentPpm must be >= 0 (got ${currentPpm})`);
  }
  if (!Number.isFinite(targetPpm) || targetPpm < 0) {
    throw new RangeError(`targetPpm must be >= 0 (got ${targetPpm})`);
  }
  const fraction = CHLORINE_PRODUCTS[product];
  if (fraction === undefined) {
    throw new RangeError(`unknown chlorine product '${product}'`);
  }

  const gap = targetPpm - currentPpm;
  if (gap <= 0) {
    return {
      grams: 0,
      appliedDelta: 0,
      clamped: false,
      product,
      note: "at or above target — chlorine can only raise FC; let it drift down or reduce feed",
    };
  }

  const clamped = gap > maxRaisePpm;
  const appliedDelta = clamped ? maxRaisePpm : gap;
  const grams = round((appliedDelta * volumeL) / 1000 / fraction, 1);

  return {
    grams,
    appliedDelta: round(appliedDelta, 2),
    clamped,
    product,
    note: clamped
      ? `raise capped at ${maxRaisePpm} ppm this dose — add, circulate, re-measure before more`
      : `raises free chlorine by ${round(appliedDelta, 2)} ppm`,
  };
}

// --- pH adjustment ---------------------------------------------------------

/**
 * Rule-of-thumb pH dosing, assuming nominal total alkalinity (~100–120 ppm). pH is
 * alkalinity-buffered, so this is an ESTIMATE — dose the smaller of this and instinct,
 * then re-test. Grams per 10,000 L to move pH by 0.1.
 */
export const DRY_ACID_G_PER_10KL_PER_0_1PH = 150; // sodium bisulfate, lowers pH
export const SODA_ASH_G_PER_10KL_PER_0_1PH = 75; // sodium carbonate, raises pH

export interface PhAdjustInput {
  volumeL: number;
  currentPh: number;
  targetPh: number;
  /** Largest single-correction pH move. */
  maxStep?: number;
}

export function phAdjustGrams(input: PhAdjustInput): DoseResult {
  const { volumeL, currentPh, targetPh, maxStep = 0.4 } = input;
  requirePositive("volumeL", volumeL);
  requirePositive("currentPh", currentPh);
  requirePositive("targetPh", targetPh);

  const gap = targetPh - currentPh;
  if (Math.abs(gap) < 0.05) {
    return { grams: 0, appliedDelta: 0, clamped: false, product: "none", note: "pH within 0.05 of target" };
  }

  const clamped = Math.abs(gap) > maxStep;
  const appliedDelta = clamped ? Math.sign(gap) * maxStep : gap;
  const steps = Math.abs(appliedDelta) / 0.1;
  const volFactor = volumeL / 10000;

  const lowering = appliedDelta < 0;
  const perStep = lowering ? DRY_ACID_G_PER_10KL_PER_0_1PH : SODA_ASH_G_PER_10KL_PER_0_1PH;
  const product = lowering ? "dry-acid (sodium bisulfate)" : "soda-ash (sodium carbonate)";
  const grams = round(steps * perStep * volFactor, 0);

  return {
    grams,
    appliedDelta: round(appliedDelta, 2),
    clamped,
    product,
    note: clamped
      ? `pH move capped at ${maxStep} this dose (estimate; re-test — alkalinity-dependent)`
      : `${lowering ? "lowers" : "raises"} pH by ~${Math.abs(round(appliedDelta, 2))} (estimate; re-test)`,
  };
}

// --- helpers ---------------------------------------------------------------

function round(v: number, dp: number): number {
  const f = 10 ** dp;
  return Math.round(v * f) / f;
}
