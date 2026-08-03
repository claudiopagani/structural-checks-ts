import assert from "node:assert/strict";
import test from "node:test";

import {
  calculateElasticCriticalMomentLT,
  verifySteelLateralTorsionalBuckling,
  type CalculateElasticCriticalMomentLTOptions,
  type SteelLateralTorsionalBucklingResult,
  type SteelLateralTorsionalMaterialLike,
  type SteelLateralTorsionalSectionLike,
  type VerifySteelLateralTorsionalBucklingOptions,
} from "../dist/index.js";

type IsAny<T> = 0 extends 1 & T ? true : false;
type AssertFalse<T extends false> = T;
type LateralTorsionalFunctionsAreStrict = AssertFalse<
  IsAny<typeof calculateElasticCriticalMomentLT | typeof verifySteelLateralTorsionalBuckling>
>;

function useLateralTorsionalDeclarations(
  mcrOptions: CalculateElasticCriticalMomentLTOptions,
  verificationOptions: VerifySteelLateralTorsionalBucklingOptions,
): SteelLateralTorsionalBucklingResult {
  calculateElasticCriticalMomentLT(mcrOptions);
  return verifySteelLateralTorsionalBuckling(verificationOptions);
}

void test("steel lateral-torsional buckling checks expose strict typed consumers", () => {
  const strictTypeProof: LateralTorsionalFunctionsAreStrict = false;
  assert.equal(strictTypeProof, false);

  const section: SteelLateralTorsionalSectionLike = {
    family: "IPE",
    height: 200,
    width: 100,
    catalogProperties: { Iz: 1420000, IT: 12000, Iw: 800000000 },
  };
  const material: SteelLateralTorsionalMaterialLike = {
    elasticModulus: 210000,
    poissonRatio: 0.3,
    fyk: 275,
    metadata: { gammaM1: 1.05 },
  };
  const mcrOptions: CalculateElasticCriticalMomentLTOptions = {
    section,
    material,
    unbracedLength: 3000,
  };
  const verificationOptions: VerifySteelLateralTorsionalBucklingOptions = {
    ...mcrOptions,
    mEd: 60000000,
    sectionClass: 1,
    bendingSectionModulus: 220000,
  };

  const result = useLateralTorsionalDeclarations(mcrOptions, verificationOptions);
  assert.equal(typeof result.status, "string");
});
