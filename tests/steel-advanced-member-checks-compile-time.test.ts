import assert from "node:assert/strict";
import test from "node:test";

import {
  calculateSteelMomentDiagramFactor,
  steelNotSupportedCheck,
  verifySteelBendingShearInteraction,
  verifySteelConcentratedWebLoad,
  verifySteelShearTorsionInteraction,
  verifySteelWebShearBuckling,
  type SteelAdvancedCheckResult,
  type SteelAdvancedMaterialLike,
  type SteelAdvancedMomentSampleLike,
  type SteelAdvancedPanelLike,
  type SteelAdvancedSectionLike,
} from "../dist/index.js";

type IsAny<T> = 0 extends 1 & T ? true : false;
type AssertFalse<T extends false> = T;

type AdvancedFunctionsAreStrict = AssertFalse<
  IsAny<
    | typeof calculateSteelMomentDiagramFactor
    | typeof steelNotSupportedCheck
    | typeof verifySteelBendingShearInteraction
    | typeof verifySteelConcentratedWebLoad
    | typeof verifySteelShearTorsionInteraction
    | typeof verifySteelWebShearBuckling
  >
>;

function useAdvancedDeclarations(
  section: SteelAdvancedSectionLike,
  material: SteelAdvancedMaterialLike,
  panel: SteelAdvancedPanelLike,
  samples: readonly SteelAdvancedMomentSampleLike[],
): SteelAdvancedCheckResult {
  calculateSteelMomentDiagramFactor(samples, "My", panel);
  verifySteelWebShearBuckling({ section, material, panel });
  verifySteelConcentratedWebLoad({ section, material, panel });
  verifySteelBendingShearInteraction({
    section,
    material,
    bendingCapacity: 100,
    shearCapacity: 80,
  });
  return verifySteelShearTorsionInteraction({
    section,
    material,
    shearCapacity: 80,
  });
}

void test("steel advanced member checks expose strict typed consumers", () => {
  const strictTypeProof: AdvancedFunctionsAreStrict = false;
  assert.equal(strictTypeProof, false);

  const section: SteelAdvancedSectionLike = {
    family: "IPE",
    height: 300,
    width: 150,
    webThickness: 6.8,
    flangeThickness: 10.7,
    rootRadius: 15,
    plasticSectionModulusY: 628000,
    torsionalSectionModulus: 14000,
  };
  const material: SteelAdvancedMaterialLike = {
    fyk: 355,
    E: 210000,
    metadata: { gammaM0: 1, gammaM1: 1.1 },
  };
  const panel: SteelAdvancedPanelLike = { id: "p-λ", length: 1.2, endPost: "rigid" };
  const samples: readonly SteelAdvancedMomentSampleLike[] = [
    { station: 0, actions: { My: 100 } },
    { station: 1, actions: { My: -50 } },
  ];

  const result = useAdvancedDeclarations(section, material, panel, samples);
  assert.equal(typeof result.status, "string");
  assert.equal(typeof steelNotSupportedCheck, "function");
});
