// Mechanical TypeScript migration from strutture-js 6f33baead8b88166c4b2cf94af41763412e3c751.

import test from "node:test";
import assert from "node:assert/strict";

import {
  NTC2018_ANALYSIS_METHOD,
  NTC2018_BASE_Q_FACTORS,
  NTC2018_ELEVATION_REGULARITY,
  NTC2018_OVERSTRENGTH_FACTORS,
  NTC2018_PLAN_REGULARITY,
  NTC2018_REGULARITY_REDUCTION,
  NTC2018_STRUCTURAL_BEHAVIOR,
  NTC2018_STRUCTURAL_BEHAVIOR_REFERENCES,
  NTC2018_STRUCTURAL_TYPE,
  checkNonDissipativeAdmissibility,
  computeNTC2018EffectiveQFactor,
  createNTC2018StructuralBehavior,
  normalizeNTC2018StructuralBehavior,
  normalizeNTC2018StructuralType,
  resolveNTC2018AlphaRatio,
  selectNTC2018AllowedAnalysisMethods,
  selectNTC2018BaseQFactor,
  selectNTC2018OverstrengthFactors,
} from "../dist/index.js";

function requireValue<T>(value: T, label: string): NonNullable<T> {
  if (value == null) {
    throw new Error(`${label} was not produced by the check.`);
  }
  return value;
}

void test("structural behaviour catalogs are immutable", () => {
  for (const catalog of [
    NTC2018_STRUCTURAL_BEHAVIOR,
    NTC2018_STRUCTURAL_TYPE,
    NTC2018_PLAN_REGULARITY,
    NTC2018_ELEVATION_REGULARITY,
    NTC2018_ANALYSIS_METHOD,
    NTC2018_OVERSTRENGTH_FACTORS,
    NTC2018_REGULARITY_REDUCTION,
    NTC2018_BASE_Q_FACTORS,
    NTC2018_STRUCTURAL_BEHAVIOR_REFERENCES,
  ]) {
    assert.equal(Object.isFrozen(catalog), true);
  }
});

void test("behaviour and structural-type aliases normalize to stable identifiers", () => {
  assert.equal(normalizeNTC2018StructuralBehavior('CD"A"'), "cd-a");
  assert.equal(normalizeNTC2018StructuralBehavior("non dissipative"), "non-dissipative");
  assert.equal(normalizeNTC2018StructuralType("coupled wall"), "coupled-wall");
  assert.throws(() => normalizeNTC2018StructuralType("unknown"), /structuralType/);
});

void test("non-dissipative behaviour is not restricted by seismic zone or ag", () => {
  const result = checkNonDissipativeAdmissibility({
    ag: 0.25,
    amplificationFactor: 1.2,
  });

  assert.equal(result.admissible, true);
  assert.equal(result.simplifiedRegimeEligible, false);
  assert.equal(result.agSOverG, 0.3);
});

void test("the ag*S threshold only classifies the simplified § 7.0 regime", () => {
  const result = checkNonDissipativeAdmissibility({
    ag: 0.05,
    soilAmplification: 1.2,
    topographicAmplification: 1.25,
  });

  assert.equal(result.admissible, true);
  assert.equal(result.simplifiedRegimeEligible, true);
  assert.ok(Math.abs(requireValue(result.agSOverG, "ag*S/g") - 0.075) < 1e-12);
});

void test("αu/α1 follows the explicit frame topology values in § 7.4.3.2", () => {
  assert.equal(
    resolveNTC2018AlphaRatio({
      structuralType: "frame",
      frameStoreyCount: 1,
      frameBayCount: 3,
    }),
    1.1,
  );
  assert.equal(
    resolveNTC2018AlphaRatio({
      structuralType: "frame",
      frameStoreyCount: 4,
      frameBayCount: 1,
    }),
    1.2,
  );
  assert.equal(
    resolveNTC2018AlphaRatio({
      structuralType: "frame",
      frameStoreyCount: 4,
      frameBayCount: 3,
    }),
    1.3,
  );
});

void test("αu/α1 follows uncoupled and coupled wall topology", () => {
  assert.equal(
    resolveNTC2018AlphaRatio({
      structuralType: "wall",
      uncoupledWallCount: 2,
    }),
    1.0,
  );
  assert.equal(
    resolveNTC2018AlphaRatio({
      structuralType: "wall",
      uncoupledWallCount: 3,
    }),
    1.1,
  );
  assert.equal(
    resolveNTC2018AlphaRatio({
      structuralType: "coupled-wall",
    }),
    1.2,
  );
});

void test("generic dual systems require an explicit αu/α1 classification", () => {
  assert.throws(
    () => resolveNTC2018AlphaRatio({ structuralType: "dual" }),
    /alphaRatio is required/,
  );
  assert.equal(
    resolveNTC2018AlphaRatio({
      structuralType: "dual",
      alphaRatio: 1.2,
    }),
    1.2,
  );
});

void test("dissipative q0 implements NTC 2018 Table 7.3.II", () => {
  assert.equal(
    selectNTC2018BaseQFactor({
      behavior: "cd-a",
      structuralType: "frame",
      frameStoreyCount: 5,
      frameBayCount: 3,
    }),
    4.5 * 1.3,
  );
  assert.equal(
    selectNTC2018BaseQFactor({
      behavior: "cd-b",
      structuralType: "wall",
      uncoupledWallCount: 2,
    }),
    3.0,
  );
  assert.equal(
    selectNTC2018BaseQFactor({
      behavior: "cd-a",
      structuralType: "wall",
      uncoupledWallCount: 2,
    }),
    4.0,
  );
  assert.equal(
    selectNTC2018BaseQFactor({
      behavior: "cd-a",
      structuralType: "single-storey-framed-inverted-pendulum",
    }),
    3.5,
  );
});

void test("qND is two thirds of the CD B table value, bounded to [1, 1.5]", () => {
  assert.equal(
    selectNTC2018BaseQFactor({
      behavior: "non-dissipative",
      structuralType: "frame",
    }),
    1.5,
  );
  assert.equal(
    selectNTC2018BaseQFactor({
      behavior: "non-dissipative",
      structuralType: "torsionally-flexible",
    }),
    4 / 3,
  );
  assert.equal(
    selectNTC2018BaseQFactor({
      behavior: "non-dissipative",
      structuralType: "inverted-pendulum",
    }),
    1.0,
  );
});

void test("elevation irregularity applies kR = 0.8 only to dissipative q", () => {
  assert.equal(
    computeNTC2018EffectiveQFactor({
      behavior: "cd-b",
      structuralType: "frame",
      frameStoreyCount: 3,
      frameBayCount: 2,
      elevationRegularity: "non-regular",
    }),
    3.0 * 1.3 * 0.8,
  );
  assert.equal(
    computeNTC2018EffectiveQFactor({
      behavior: "non-dissipative",
      structuralType: "torsionally-flexible",
      elevationRegularity: "non-regular",
    }),
    4 / 3,
  );
});

void test("capacity-design factors remain mechanism-specific", () => {
  const cdA = selectNTC2018OverstrengthFactors({ behavior: "cd-a" });
  const cdB = selectNTC2018OverstrengthFactors({ behavior: "cd-b" });
  assert.equal(cdA.columnBending, 1.3);
  assert.equal(cdA.beamShear, 1.2);
  assert.equal(cdB.columnBending, 1.3);
  assert.equal(cdB.beamShear, 1.1);
  assert.equal(cdB.wallShear, null);
});

void test("linear static analysis requires both elevation regularity and period data", () => {
  const allowed = selectNTC2018AllowedAnalysisMethods({
    behavior: "non-dissipative",
    elevationRegularity: "regular",
    t1: 0.8,
    tc: 0.4,
    td: 2.0,
  });
  assert.equal(allowed.linearStaticAllowed, true);
  assert.ok(allowed.allowed.includes(NTC2018_ANALYSIS_METHOD.LINEAR_STATIC));
  assert.ok(allowed.allowed.includes(NTC2018_ANALYSIS_METHOD.NONLINEAR_STATIC));

  const notDemonstrated = selectNTC2018AllowedAnalysisMethods({
    behavior: "cd-b",
    elevationRegularity: "regular",
  });
  assert.equal(notDemonstrated.linearStaticAllowed, false);
  assert.ok(!notDemonstrated.allowed.includes(NTC2018_ANALYSIS_METHOD.LINEAR_STATIC));
});

void test("linear static analysis is excluded for elevation-irregular structures", () => {
  const result = selectNTC2018AllowedAnalysisMethods({
    behavior: "cd-a",
    elevationRegularity: "non-regular",
    t1: 0.5,
    tc: 0.4,
    td: 2.0,
  });
  assert.equal(result.linearStaticAllowed, false);
});

void test("complete structural behaviour descriptor propagates q and kR", () => {
  const result = createNTC2018StructuralBehavior({
    behavior: "cd-b",
    structuralType: "frame",
    frameStoreyCount: 4,
    frameBayCount: 2,
    regularity: { elevation: "non-regular" },
  });

  assert.ok(Math.abs(result.q0 - 3.9) < 1e-12);
  assert.equal(result.kr, 0.8);
  assert.ok(Math.abs(result.q - 3.12) < 1e-12);
  assert.equal(result.isDissipative, true);
});

void test("dissipative descriptor does not assume missing elevation regularity", () => {
  assert.throws(
    () =>
      createNTC2018StructuralBehavior({
        behavior: "cd-b",
        structuralType: "frame",
        frameStoreyCount: 4,
        frameBayCount: 2,
      }),
    /regularity\.elevation/,
  );
});
