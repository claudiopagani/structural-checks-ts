import assert from "node:assert/strict";
import test from "node:test";

import {
  calculateSteelMethodBInteractionCoefficients,
  calculateSteelMethodBInteractionCoefficientsMyMz,
  verifySteelBeamColumnInteractionMy,
  verifySteelBeamColumnInteractionMyMz,
  type CalculateSteelMethodBInteractionCoefficientsMyMzOptions,
  type CalculateSteelMethodBInteractionCoefficientsOptions,
  type SteelBeamColumnInteractionResult,
  type SteelCompressionBucklingResultLike,
  type VerifySteelBeamColumnInteractionMyMzOptions,
  type VerifySteelBeamColumnInteractionMyOptions,
} from "../dist/index.js";

type IsAny<T> = 0 extends 1 & T ? true : false;
type AssertFalse<T extends false> = T;
type BeamColumnFunctionsAreStrict = AssertFalse<
  IsAny<
    | typeof calculateSteelMethodBInteractionCoefficients
    | typeof calculateSteelMethodBInteractionCoefficientsMyMz
    | typeof verifySteelBeamColumnInteractionMy
    | typeof verifySteelBeamColumnInteractionMyMz
  >
>;

function useBeamColumnDeclarations(
  options: VerifySteelBeamColumnInteractionMyOptions,
  biaxialOptions: VerifySteelBeamColumnInteractionMyMzOptions,
  coefficients: CalculateSteelMethodBInteractionCoefficientsOptions,
  biaxialCoefficients: CalculateSteelMethodBInteractionCoefficientsMyMzOptions,
): SteelBeamColumnInteractionResult {
  calculateSteelMethodBInteractionCoefficients(coefficients);
  calculateSteelMethodBInteractionCoefficientsMyMz(biaxialCoefficients);
  verifySteelBeamColumnInteractionMy(options);
  return verifySteelBeamColumnInteractionMyMz(biaxialOptions);
}

void test("steel beam-column interaction checks expose strict typed consumers", () => {
  const strictTypeProof: BeamColumnFunctionsAreStrict = false;
  assert.equal(strictTypeProof, false);

  const compressionBucklingResult: SteelCompressionBucklingResultLike = {
    axisResults: {
      y: { reductionFactor: 0.82, relativeSlenderness: 0.78 },
      z: { reductionFactor: 0.61, relativeSlenderness: 1.05 },
    },
  };
  const options: VerifySteelBeamColumnInteractionMyOptions = {
    section: { family: "IPE", area: 2850 },
    material: { fyk: 275, metadata: { gammaM1: 1.05 } },
    nEd: 50000,
    myEd: 10000000,
    bendingSectionModulus: 220000,
    compressionBucklingResult,
  };
  const biaxialOptions: VerifySteelBeamColumnInteractionMyMzOptions = {
    ...options,
    bendingSectionModulusY: 220000,
    bendingSectionModulusZ: 50000,
    mzEd: 2000000,
  };
  const result = useBeamColumnDeclarations(
    options,
    biaxialOptions,
    {
      sectionClass: 1,
      relativeSlendernessY: 0.78,
      relativeSlendernessZ: 1.05,
      axialRatioY: 0.1,
      axialRatioZ: 0.15,
    },
    {
      sectionClass: 1,
      relativeSlendernessY: 0.78,
      relativeSlendernessZ: 1.05,
      axialRatioY: 0.1,
      axialRatioZ: 0.15,
    },
  );

  assert.equal(typeof result.status, "string");
  assert.equal(calculateSteelMethodBInteractionCoefficients({}), null);
  assert.equal(calculateSteelMethodBInteractionCoefficientsMyMz({}), null);
});
