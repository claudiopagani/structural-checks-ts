// Mechanical TypeScript migration from strutture-js 6f33baead8b88166c4b2cf94af41763412e3c751.

import test from "node:test";
import assert from "node:assert/strict";

import {
  NTC2018_DISPLACEMENT_REFERENCES,
  NTC2018_DRIFT_INFILL_CATEGORY,
  NTC2018_DRIFT_LIMITS,
  NTC2018_PDELTA_THRESHOLDS,
  computePDeltaCoefficient,
  computeSeismicJointWidth,
  computeStoreyDrift,
  createDisplacementAssessment,
  verifyPDelta,
  verifyStoreyDisplacements,
  verifyStoreyDrift,
} from "../dist/index.js";
import type { Ntc2018StoreyDisplacementInput } from "../src/norms/ntc2018/reinforced-concrete/displacementChecks.js";

function requireValue<T>(value: T, label: string): NonNullable<T> {
  if (value == null) {
    throw new Error(`${label} was not produced by the check.`);
  }
  return value;
}

void test("displacement catalogs expose the exact chapter 7 limits", () => {
  assert.equal(Object.isFrozen(NTC2018_DISPLACEMENT_REFERENCES), true);
  assert.equal(
    NTC2018_DRIFT_LIMITS[NTC2018_DRIFT_INFILL_CATEGORY.RIGIDLY_CONNECTED_FRAGILE],
    0.005,
  );
  assert.equal(
    NTC2018_DRIFT_LIMITS[NTC2018_DRIFT_INFILL_CATEGORY.RIGIDLY_CONNECTED_DUCTILE],
    0.0075,
  );
  assert.equal(NTC2018_PDELTA_THRESHOLDS.forbidden, 0.3);
});

void test("storey drift requires both displacements and never substitutes zero", () => {
  const result = computeStoreyDrift({
    displacementTop: 0.025,
    displacementBottom: 0.005,
    storeyHeight: 4,
  });
  assert.ok(Math.abs(result.drift - 0.02) < 1e-12);
  assert.ok(Math.abs(result.driftRatio - 0.005) < 1e-12);
  assert.throws(
    () =>
      computeStoreyDrift({
        displacementTop: undefined,
        displacementBottom: 0,
        storeyHeight: 4,
      }),
    /displacementTop/,
  );
});

void test("fragile rigid infills verify q*dr <= 0.005h at SLD for CU I-II", () => {
  const passing = verifyStoreyDrift({
    driftRatio: 0.0025,
    limitState: "SLD",
    useClass: "II",
    q: 2,
    infillCategory: "rigidly-connected-fragile",
  });
  const failing = verifyStoreyDrift({
    driftRatio: 0.00251,
    limitState: "SLD",
    useClass: "II",
    q: 2,
    infillCategory: "rigidly-connected-fragile",
  });
  assert.equal(passing.ok, true);
  assert.equal(failing.ok, false);
});

void test("ductile rigid infills use the 0.0075h limit", () => {
  const result = verifyStoreyDrift({
    driftRatio: 0.00375,
    limitState: "SLD",
    useClass: "I",
    q: 2,
    infillCategory: "rigidly-connected-ductile",
  });
  assert.equal(result.ok, true);
  assert.equal(result.limit, 0.0075);
});

void test("CU III-IV use SLO and two thirds of the CU I-II limits", () => {
  const result = verifyStoreyDrift({
    driftRatio: 0.0017,
    limitState: "SLO",
    useClass: "IV",
    q: 2,
    infillCategory: "rigidly-connected-fragile",
  });
  assert.equal(result.ok, false);
  assert.ok(Math.abs(result.limit - (2 / 3) * 0.005) < 1e-12);
});

void test("damage-avoiding infills satisfy both drp and the 0.010h cap", () => {
  const capacityFailure = verifyStoreyDrift({
    driftRatio: 0.004,
    limitState: "SLD",
    useClass: "II",
    q: 2,
    infillCategory: "damage-avoiding",
    nonStructuralDisplacementCapacityRatio: 0.007,
  });
  assert.equal(capacityFailure.ok, false);
  assert.equal(capacityFailure.checks.length, 2);
  assert.equal(requireValue(capacityFailure.checks[0], "drp check").ok, true);
  assert.equal(requireValue(capacityFailure.checks[1], "absolute cap check").ok, false);
});

void test("ambiguous limit states and no-infill aliases are rejected", () => {
  assert.throws(
    () =>
      verifyStoreyDrift({
        driftRatio: 0.001,
        limitState: "SLE",
        useClass: "II",
        q: 1,
        infillCategory: "rigidly-connected-fragile",
      }),
    /requires SLD/,
  );
  assert.throws(
    () =>
      verifyStoreyDrift({
        driftRatio: 0.001,
        limitState: "SLD",
        useClass: "II",
        q: 1,
        infillCategory: "no-infill",
      }),
    /does not define a generic no-infill/,
  );
});

function pDeltaAt(theta: number) {
  return computePDeltaCoefficient({
    storeyWeight: 100,
    drift: theta,
    storeyShear: 100,
    storeyHeight: 1,
  });
}

void test("P-Delta threshold intervals match NTC 2018 § 7.3.1", () => {
  assert.equal(pDeltaAt(0.099).status, "negligible");
  assert.equal(pDeltaAt(0.1).status, "amplification-required");
  assert.equal(pDeltaAt(0.2).status, "amplification-required");
  assert.equal(pDeltaAt(0.25).status, "nonlinear-analysis-required");
  assert.equal(pDeltaAt(0.3).status, "nonlinear-analysis-required");
  assert.equal(pDeltaAt(0.301).status, "forbidden");
});

void test("P-Delta amplification is 1/(1-theta)", () => {
  const result = pDeltaAt(0.15);
  assert.ok(
    Math.abs(requireValue(result.amplificationFactor, "amplification factor") - 1 / 0.85) < 1e-12,
  );
});

void test("P-Delta verification distinguishes nonlinear analysis from forbidden theta", () => {
  const nonlinear = verifyPDelta({
    storeyWeight: 100,
    drift: 0.25,
    storeyShear: 100,
    storeyHeight: 1,
  });
  const forbidden = verifyPDelta({
    storeyWeight: 100,
    drift: 0.31,
    storeyShear: 100,
    storeyHeight: 1,
  });
  assert.equal(nonlinear.ok, false);
  assert.equal(nonlinear.status, "nonlinear-analysis-required");
  assert.equal(forbidden.ok, false);
  assert.equal(forbidden.status, "forbidden");
});

void test("seismic separation is the maximum of displacement demand and geometric minimum", () => {
  const result = computeSeismicJointWidth({
    buildingHeightA: 10,
    buildingHeightB: 10,
    facingPointElevation: 10,
    slvDisplacementA: 0.08,
    slvDisplacementB: 0.07,
    relativeFoundationDisplacement: 0.02,
    agSOverG: 0.2,
  });
  assert.ok(Math.abs(result.displacementRequirement - 0.17) < 1e-12);
  assert.ok(Math.abs(result.geometricMinimum - 0.1) < 1e-12);
  assert.ok(Math.abs(result.jointWidth - 0.17) < 1e-12);
});

void test("seismic separation estimates both displacements only when specific analyses are absent", () => {
  const result = computeSeismicJointWidth({
    buildingHeightA: 10,
    buildingHeightB: 8,
    relativeFoundationDisplacement: 0,
    agSOverG: 0.2,
  });
  assert.equal(result.usedEstimatedDisplacements, true);
  assert.ok(Math.abs(result.displacementA - 0.02) < 1e-12);
  assert.ok(Math.abs(result.displacementB - 0.016) < 1e-12);
  assert.ok(Math.abs(result.jointWidth - 0.08) < 1e-12);
});

function completeStorey(
  overrides: Partial<Ntc2018StoreyDisplacementInput> = {},
): Ntc2018StoreyDisplacementInput {
  return {
    storeyId: "L1",
    height: 3,
    serviceDisplacementX: 0.006,
    serviceDisplacementXBelow: 0,
    serviceDisplacementY: 0.004,
    serviceDisplacementYBelow: 0,
    slvDisplacementX: 0.03,
    slvDisplacementXBelow: 0,
    slvDisplacementY: 0.02,
    slvDisplacementYBelow: 0,
    weight: 1000,
    shearX: 500,
    shearY: 400,
    ...overrides,
  };
}

void test("storey assessment keeps service drift and SLV P-Delta data separate", () => {
  const result = verifyStoreyDisplacements({
    storey: completeStorey(),
    limitState: "SLD",
    useClass: "II",
    q: 2,
    infillCategory: "rigidly-connected-fragile",
    checkPDelta: true,
  });
  assert.equal(requireValue(result.driftX, "X drift").ok, true);
  assert.equal(requireValue(result.pDeltaX, "X P-Delta").status, "negligible");
  assert.equal(result.allChecksOk, true);
});

void test("P-Delta cannot be silently skipped when explicitly requested", () => {
  const complete = completeStorey();
  const { slvDisplacementX: omittedX, slvDisplacementXBelow: omittedY, ...storey } = complete;
  void omittedX;
  void omittedY;
  assert.throws(
    () =>
      verifyStoreyDisplacements({
        storey,
        limitState: "SLD",
        useClass: "II",
        q: 2,
        infillCategory: "rigidly-connected-fragile",
        checkPDelta: true,
      }),
    /SLV displacements in direction X/,
  );
});

void test("building assessment reports governing design drift and theta", () => {
  const result = createDisplacementAssessment({
    storeys: [
      completeStorey(),
      completeStorey({
        storeyId: "L2",
        serviceDisplacementX: 0.007,
        slvDisplacementX: 0.04,
      }),
    ],
    limitState: "SLD",
    useClass: "II",
    q: 2,
    infillCategory: "rigidly-connected-fragile",
    checkPDelta: true,
  });
  assert.equal(result.allChecksOk, true);
  assert.equal(requireValue(result.governingDriftX, "governing X drift").storeyId, "L2");
  assert.equal(requireValue(result.governingThetaX, "governing X theta").storeyId, "L2");
});
