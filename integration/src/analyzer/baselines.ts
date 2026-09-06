/**
 * Rolling baselines & anomaly detection (PH-3 / generalizes prompt_plan.md Phase 6).
 *
 * Pure, deterministic statistics over a daily time series. The flagship use is the
 * leak indicator: a >2σ jump in daily auto-fill count against a trailing 7-day
 * baseline. The same math applies to any daily signal (evaporation, chemistry) once
 * those series exist. Like the chemistry core, this is advisory arithmetic Claude
 * only explains — it never decides on its own that something is a leak.
 *
 * The baseline for each point is the *trailing* window (the point itself excluded),
 * so a spike can't inflate its own baseline and hide.
 */

export function mean(xs: number[]): number {
  if (xs.length === 0) throw new RangeError("mean of empty series");
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

/** Sample standard deviation (n-1). Returns 0 for fewer than 2 points. */
export function sampleStdDev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  const variance = xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1);
  return Math.sqrt(variance);
}

export interface SeriesPoint {
  label: string; // e.g. a date "2026-09-06"
  value: number;
}

export interface AnomalyPoint extends SeriesPoint {
  evaluated: boolean; // false until enough trailing history exists
  baselineMean: number | null;
  baselineStd: number | null;
  z: number | null; // null when the baseline is flat (std 0)
  direction: "high" | "low" | null;
  anomaly: boolean;
}

export interface AnomalyOptions {
  window?: number; // trailing points forming the baseline
  sigma?: number; // deviation threshold in standard deviations
  minPoints?: number; // min trailing points required to evaluate (default = window)
}

export interface AnomalyReport {
  window: number;
  sigma: number;
  points: AnomalyPoint[];
  anomalies: AnomalyPoint[];
}

/**
 * Flag series points deviating more than `sigma` std deviations from their trailing
 * `window`-point baseline. On a perfectly flat baseline (std 0) any nonzero deviation
 * is flagged (z reported as null — "anything stands out").
 */
export function detectAnomalies(series: SeriesPoint[], opts: AnomalyOptions = {}): AnomalyReport {
  const window = opts.window ?? 7;
  const sigma = opts.sigma ?? 2;
  const minPoints = opts.minPoints ?? window;
  if (window < 1) throw new RangeError(`window must be >= 1 (got ${window})`);
  if (sigma <= 0) throw new RangeError(`sigma must be > 0 (got ${sigma})`);

  const points: AnomalyPoint[] = series.map((p, i) => {
    const trailing = series.slice(Math.max(0, i - window), i).map((s) => s.value);
    if (trailing.length < minPoints) {
      return { ...p, evaluated: false, baselineMean: null, baselineStd: null, z: null, direction: null, anomaly: false };
    }

    const m = mean(trailing);
    const sd = sampleStdDev(trailing);
    const dev = p.value - m;
    const direction: "high" | "low" | null = dev > 0 ? "high" : dev < 0 ? "low" : null;

    let z: number | null;
    let anomaly: boolean;
    if (sd === 0) {
      z = null;
      anomaly = dev !== 0;
    } else {
      z = round(dev / sd, 2);
      anomaly = Math.abs(z) >= sigma;
    }

    return {
      ...p,
      evaluated: true,
      baselineMean: round(m, 2),
      baselineStd: round(sd, 2),
      z,
      direction: anomaly ? direction : null,
      anomaly,
    };
  });

  return { window, sigma, points, anomalies: points.filter((p) => p.anomaly) };
}

function round(v: number, dp: number): number {
  const f = 10 ** dp;
  return Math.round(v * f) / f;
}
