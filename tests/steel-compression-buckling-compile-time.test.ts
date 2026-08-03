import assert from "node:assert/strict";
import test from "node:test";

import {
  calculateSteelCompressionBucklingAxis,
  inferSteelCompressionBucklingCurves,
  steelBucklingCurveImperfectionFactor,
  verifySteelCompressionBuckling,
  type CalculateSteelCompressionBucklingAxisOptions,
  type SteelCompressionBucklingResult,
  type SteelCompressionBucklingSectionLike,
  type VerifySteelCompressionBucklingOptions,
} from "../dist/index.js";

type IsAny<T> = 0 extends 1 & T ? true : false;
type AssertFalse<T extends false> = T;
type CompressionFunctionsAreStrict = AssertFalse<
  IsAny<
    | typeof calculateSteelCompressionBucklingAxis
    | typeof inferSteelCompressionBucklingCurves
    | typeof steelBucklingCurveImperfectionFactor
    | typeof verifySteelCompressionBuckling
  >
>;

function useCompressionDeclarations(
  section: SteelCompressionBucklingSectionLike,
  options: VerifySteelCompressionBucklingOptions,
  axisOptions: CalculateSteelCompressionBucklingAxisOptions,
): SteelCompressionBucklingResult {
  calculateSteelCompressionBucklingAxis(axisOptions);
  inferSteelCompressionBucklingCurves(section);
  steelBucklingCurveImperfectionFactor("b");
  return verifySteelCompressionBuckling(options);
}

void test("steel compression buckling checks expose strict typed consumers", () => {
  const strictTypeProof: CompressionFunctionsAreStrict = false;
  assert.equal(strictTypeProof, false);

  const section: SteelCompressionBucklingSectionLike = {
    family: "IPE",
    area: 2850,
    inertiaY: 19400000,
    inertiaZ: 1420000,
    catalogProperties: { height: 200, width: 100, flangeThickness: 8.5 },
  };
  const options: VerifySteelCompressionBucklingOptions = {
    section,
    material: { fyk: 275, elasticModulus: 210000, metadata: { gammaM1: 1.05 } },
    nEd: 50000,
    lengthY: 5000,
    lengthZ: 5000,
  };
  const result = useCompressionDeclarations(section, options, {
    area: 2850,
    inertia: 19400000,
    elasticModulus: 210000,
    yieldStrength: 275,
    effectiveLength: 5000,
    gammaM1: 1.05,
    curve: "a",
  });

  assert.equal(typeof result.status, "string");
  assert.equal(steelBucklingCurveImperfectionFactor("unsupported"), null);
  assert.equal(calculateSteelCompressionBucklingAxis({}), null);
});
