import assert from "node:assert/strict";
import test from "node:test";

import {
  calculateTimberLateralBucklingReduction,
  calculateTimberRectangularCriticalBendingStress,
  verifyTimberLateralTorsionalStability,
  type TimberLateralTorsionalStabilityInput,
  type TimberLateralTorsionalStabilityResult,
} from "../dist/index.js";

type IsAny<T> = 0 extends 1 & T ? true : false;
type AssertFalse<T extends false> = T;

const input: TimberLateralTorsionalStabilityInput = {
  section: {
    metadata: { shape: "rectangular" },
    width: 100,
    height: 200,
    elasticSectionModulusY: 666666.6667,
    elasticSectionModulusZ: 333333.3333,
  },
  material: { fmK: 24, elasticModulus: 11000 },
  myEd: 1000,
  mzEd: 100,
  unbracedLength: 2000,
  fmD: 12,
  fmK: 24,
};

type InputIsStrict = AssertFalse<IsAny<TimberLateralTorsionalStabilityInput>>;
type ResultIsStrict = AssertFalse<IsAny<TimberLateralTorsionalStabilityResult>>;

void test("timber lateral-torsional stability exposes strict consumers", () => {
  const inputStrictProof: InputIsStrict = false;
  const resultStrictProof: ResultIsStrict = false;
  const criticalStress = calculateTimberRectangularCriticalBendingStress({
    width: 100,
    height: 200,
    effectiveLength: 2000,
    e0_05: 7333.333333,
  });
  const reduction = calculateTimberLateralBucklingReduction(1.2);
  const result = verifyTimberLateralTorsionalStability(input);

  assert.equal(inputStrictProof, false);
  assert.equal(resultStrictProof, false);
  assert.equal(typeof criticalStress, "number");
  assert.equal(typeof reduction, "number");
  assert.equal(result.check?.id, "timber-lateral-torsional-stability");
});
