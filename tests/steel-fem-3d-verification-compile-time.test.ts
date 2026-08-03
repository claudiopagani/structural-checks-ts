import assert from "node:assert/strict";
import test from "node:test";

import {
  steelUnsupportedFeatureCatalog,
  verifySteelFem3DAdvanced,
  type SteelFem3DAdvancedResult,
  type SteelFem3DContractLike,
  type SteelFem3DMaterialLike,
  type SteelFem3DSectionLike,
  type SteelFem3DUnitConversionLike,
  type VerifySteelFem3DAdvancedOptions,
} from "../dist/applications/steel-frames/checks/SteelFem3DVerification.js";

type IsAny<T> = 0 extends 1 & T ? true : false;
type AssertFalse<T extends false> = T;
type Fem3DFunctionsAreStrict = AssertFalse<
  IsAny<typeof steelUnsupportedFeatureCatalog | typeof verifySteelFem3DAdvanced>
>;

function useFem3DDeclarations(
  contract: SteelFem3DContractLike,
  section: SteelFem3DSectionLike,
  material: SteelFem3DMaterialLike,
  units: SteelFem3DUnitConversionLike,
): SteelFem3DAdvancedResult {
  const options: VerifySteelFem3DAdvancedOptions = {
    contract,
    section,
    material,
    resultToSectionUnits: units,
    sectionToResultUnits: units,
    serviceability: { vibration: { enabled: true } },
  };
  return verifySteelFem3DAdvanced(options);
}

void test("steel FEM 3D advanced verification exposes strict typed consumers", () => {
  const strictTypeProof: Fem3DFunctionsAreStrict = false;
  assert.equal(strictTypeProof, false);

  const contract: SteelFem3DContractLike = {
    member: {
      frameClassification: { sway: false, nonSway: true },
      effectiveLengths: { y: 1, z: 1 },
      effectiveLengthFactors: { y: 1, z: 1 },
      webPanels: [],
      concentratedLoads: [],
    },
    combinations: [],
  };
  const section: SteelFem3DSectionLike = {
    family: "IPE",
    plasticSectionModulusY: 1000000,
    area: 3000,
    shearAreaY: 1800,
    height: 200,
    flangeThickness: 10,
    rootRadius: 8,
    webThickness: 6,
  };
  const material: SteelFem3DMaterialLike = {
    fyk: 275,
    metadata: { gammaM0: 1.05 },
  };
  const units: SteelFem3DUnitConversionLike = {
    force: (value) => value,
    length: (value) => value,
    moment: (value) => value,
  };

  const result = useFem3DDeclarations(contract, section, material, units);
  assert.equal(typeof result.status, "string");
  assert.equal(steelUnsupportedFeatureCatalog().length, 5);
});
