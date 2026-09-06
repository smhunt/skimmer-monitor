import { test } from "node:test";
import assert from "node:assert/strict";
import { mean, sampleStdDev, detectAnomalies, type SeriesPoint } from "./baselines.js";

function series(values: number[]): SeriesPoint[] {
  return values.map((v, i) => ({ label: `d${i}`, value: v }));
}

test("mean and sample stddev basics", () => {
  assert.equal(mean([2, 4, 6]), 4);
  assert.equal(sampleStdDev([5]), 0); // <2 points
  assert.ok(Math.abs(sampleStdDev([2, 4, 6]) - 2) < 1e-9);
  assert.throws(() => mean([]), RangeError);
});

test("first `window` points are not evaluated (no history)", () => {
  const r = detectAnomalies(series([1, 1, 1, 1, 1, 1, 1, 1]), { window: 7 });
  assert.equal(r.points.slice(0, 7).every((p) => !p.evaluated), true);
  assert.equal(r.points[7].evaluated, true);
});

test("a fill-count spike is flagged high (leak indicator)", () => {
  // steady ~2 fills/day, then a jump to 9
  const r = detectAnomalies(series([2, 3, 2, 3, 2, 3, 2, 9]), { window: 7, sigma: 2 });
  const last = r.points[7];
  assert.equal(last.anomaly, true);
  assert.equal(last.direction, "high");
  assert.equal(r.anomalies.length, 1);
});

test("a drop below baseline is flagged low", () => {
  const r = detectAnomalies(series([8, 9, 8, 9, 8, 9, 8, 1]), { window: 7, sigma: 2 });
  const last = r.points[7];
  assert.equal(last.anomaly, true);
  assert.equal(last.direction, "low");
});

test("normal variation within band is not flagged", () => {
  const r = detectAnomalies(series([10, 11, 9, 10, 11, 9, 10, 10]), { window: 7, sigma: 2 });
  assert.equal(r.points[7].anomaly, false);
  assert.equal(r.anomalies.length, 0);
});

test("flat baseline: any nonzero change stands out, z is null", () => {
  const r = detectAnomalies(series([0, 0, 0, 0, 0, 0, 0, 1]), { window: 7, sigma: 2 });
  const last = r.points[7];
  assert.equal(last.anomaly, true);
  assert.equal(last.z, null);
  assert.equal(last.baselineStd, 0);
  assert.equal(last.direction, "high");
});

test("flat baseline holding steady is not an anomaly", () => {
  const r = detectAnomalies(series([3, 3, 3, 3, 3, 3, 3, 3]), { window: 7, sigma: 2 });
  assert.equal(r.points[7].anomaly, false);
});

test("higher sigma suppresses a borderline flag", () => {
  // trailing [4,5,4,5,4,5,4] → mean ≈ 4.43, sd ≈ 0.53; value 6 → z ≈ 2.9
  const values = [4, 5, 4, 5, 4, 5, 4, 6];
  const at2 = detectAnomalies(series(values), { window: 7, sigma: 2 });
  const at4 = detectAnomalies(series(values), { window: 7, sigma: 4 });
  assert.equal(at2.points[7].anomaly, true); // 2.9 ≥ 2
  assert.equal(at4.points[7].anomaly, false); // 2.9 < 4
});

test("invalid options throw", () => {
  assert.throws(() => detectAnomalies(series([1, 2, 3]), { window: 0 }), RangeError);
  assert.throws(() => detectAnomalies(series([1, 2, 3]), { sigma: 0 }), RangeError);
});
