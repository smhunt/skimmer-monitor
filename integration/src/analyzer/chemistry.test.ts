import { test } from "node:test";
import assert from "node:assert/strict";
import {
  langelierSaturationIndex,
  chlorineDoseGrams,
  phAdjustGrams,
} from "./chemistry.js";

// --- Langelier Saturation Index -------------------------------------------

test("LSI: a well-balanced pool reads near zero", () => {
  const r = langelierSaturationIndex({
    ph: 7.5,
    tempC: 26,
    tdsPpm: 1000,
    calciumHardnessPpm: 300,
    totalAlkalinityPpm: 120,
  });
  assert.ok(Math.abs(r.lsi - 0.09) < 0.02, `expected ~0.09, got ${r.lsi}`);
  assert.equal(r.classification, "balanced");
});

test("LSI: soft, low-pH water is corrosive", () => {
  const r = langelierSaturationIndex({
    ph: 7.0,
    tempC: 26,
    tdsPpm: 1000,
    calciumHardnessPpm: 150,
    totalAlkalinityPpm: 60,
  });
  assert.ok(r.lsi < -0.3, `expected < -0.3, got ${r.lsi}`);
  assert.equal(r.classification, "corrosive");
});

test("LSI: hard, high-pH, warm water scales", () => {
  const r = langelierSaturationIndex({
    ph: 8.2,
    tempC: 30,
    tdsPpm: 1500,
    calciumHardnessPpm: 500,
    totalAlkalinityPpm: 180,
  });
  assert.ok(r.lsi > 0.3, `expected > 0.3, got ${r.lsi}`);
  assert.equal(r.classification, "scaling");
});

test("LSI: rejects non-positive inputs", () => {
  assert.throws(
    () =>
      langelierSaturationIndex({
        ph: 7.5,
        tempC: 26,
        tdsPpm: 0,
        calciumHardnessPpm: 300,
        totalAlkalinityPpm: 120,
      }),
    RangeError,
  );
});

// --- Chlorine dosing -------------------------------------------------------

test("chlorine: raise 1→3 ppm in 50,000 L with cal-hypo", () => {
  const r = chlorineDoseGrams({ volumeL: 50000, currentPpm: 1, targetPpm: 3 });
  // (2 * 50000 / 1000) / 0.65 = 153.8 g
  assert.ok(Math.abs(r.grams - 153.8) < 0.2, `expected ~153.8 g, got ${r.grams}`);
  assert.equal(r.clamped, false);
  assert.equal(r.appliedDelta, 2);
});

test("chlorine: big gap clamps to the single-dose cap", () => {
  const r = chlorineDoseGrams({ volumeL: 50000, currentPpm: 1, targetPpm: 10, maxRaisePpm: 5 });
  assert.equal(r.clamped, true);
  assert.equal(r.appliedDelta, 5);
  // (5 * 50000 / 1000) / 0.65 = 384.6 g
  assert.ok(Math.abs(r.grams - 384.6) < 0.2, `expected ~384.6 g, got ${r.grams}`);
});

test("chlorine: at or above target doses nothing", () => {
  const r = chlorineDoseGrams({ volumeL: 50000, currentPpm: 3, targetPpm: 3 });
  assert.equal(r.grams, 0);
  assert.equal(r.appliedDelta, 0);
});

test("chlorine: unknown product throws", () => {
  assert.throws(
    // @ts-expect-error deliberately invalid product
    () => chlorineDoseGrams({ volumeL: 50000, currentPpm: 1, targetPpm: 3, product: "bromine" }),
    RangeError,
  );
});

// --- pH adjustment ---------------------------------------------------------

test("pH: lower 7.8→7.4 in 50,000 L uses dry acid", () => {
  const r = phAdjustGrams({ volumeL: 50000, currentPh: 7.8, targetPh: 7.4 });
  // 4 steps * 150 g * 5 (50k/10k) = 3000 g
  assert.equal(r.grams, 3000);
  assert.match(r.product, /dry-acid/);
  assert.equal(r.clamped, false);
});

test("pH: raise 7.0→7.2 uses soda ash", () => {
  const r = phAdjustGrams({ volumeL: 50000, currentPh: 7.0, targetPh: 7.2 });
  // 2 steps * 75 g * 5 = 750 g
  assert.equal(r.grams, 750);
  assert.match(r.product, /soda-ash/);
});

test("pH: an oversized correction clamps to maxStep", () => {
  const r = phAdjustGrams({ volumeL: 50000, currentPh: 8.5, targetPh: 7.0, maxStep: 0.4 });
  assert.equal(r.clamped, true);
  assert.equal(r.appliedDelta, -0.4);
});

test("pH: already on target doses nothing", () => {
  const r = phAdjustGrams({ volumeL: 50000, currentPh: 7.42, targetPh: 7.4 });
  assert.equal(r.grams, 0);
  assert.equal(r.product, "none");
});
