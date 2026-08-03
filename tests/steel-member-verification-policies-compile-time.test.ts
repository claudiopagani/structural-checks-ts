import assert from "node:assert/strict";
import test from "node:test";

import {
  compressionAxialForce,
  createDeflectionChecks,
  createSteelActionVerifier,
  normalizeCombinationType,
  selectBendingResistanceBasis,
  type SteelMemberVerificationPolicyMaterial,
  type SteelMemberVerificationPolicySection,
} from "../dist/applications/steel-frames/checks/SteelMemberVerificationPolicies.js";
import { createUnitResolver } from "../dist/domain/units/UnitSystem.js";

type IsAny<T> = 0 extends 1 & T ? true : false;
type AssertFalse<T extends false> = T;
type SteelPolicyDeclarationsAreStrict = AssertFalse<
  IsAny<
    | typeof compressionAxialForce
    | typeof createDeflectionChecks
    | typeof createSteelActionVerifier
    | typeof normalizeCombinationType
  >
>;

function createStrictPolicyConsumer(
  section: SteelMemberVerificationPolicySection,
  material: SteelMemberVerificationPolicyMaterial,
) {
  const units = createUnitResolver({ force: "N", length: "mm" }, { force: "N", length: "mm" });
  return createSteelActionVerifier({
    section,
    material,
    sectionToResultUnits: units,
    resultToSectionUnits: units,
  });
}

void test("steel member verification policies expose strict typed consumers", () => {
  const strictTypeProof: SteelPolicyDeclarationsAreStrict = false;
  assert.equal(strictTypeProof, false);

  const section: SteelMemberVerificationPolicySection = {
    family: "IPE",
    area: 2600,
    elasticSectionModulusY: 194000,
    plasticSectionModulusY: 220000,
    elasticSectionModulusZ: 23000,
    plasticSectionModulusZ: 35000,
    shearAreaY: 1300,
    shearAreaZ: 800,
  };
  const material: SteelMemberVerificationPolicyMaterial = { fyk: 275 };
  const verifier = createStrictPolicyConsumer(section, material);
  const result = verifier.verifySectionActions({
    nEd: 1000,
    vEd: 500,
    mEd: 10000,
    context: { sectionProperties: { metadata: {} } },
  });

  assert.equal(typeof result.status, "string");
  assert.equal(Array.isArray(result.checks), true);
  assert.equal(compressionAxialForce(-100, "compression-negative"), 100);
  assert.equal(normalizeCombinationType("rare-λ"), "RARE_Λ");
  assert.equal(
    selectBendingResistanceBasis({
      classificationResult: {
        status: "ok",
        class: 1,
        epsilon: null,
        family: "IPE",
        profileName: null,
        parts: [],
        warnings: [],
        metadata: {},
      },
      elasticSectionModulus: 10,
      plasticSectionModulus: 20,
    }).basis,
    "plastic",
  );
  assert.equal(
    createDeflectionChecks({
      analysisResult: {
        combinations: {
          SLE: {
            id: "SLE",
            context: { limitState: "SLE", combinationType: "rare" },
            geometry: { length: 6000 },
            displacements: { maxAbsVerticalDisplacement: { station: 3000, uy: 4 } },
          },
        },
      },
      deflectionLimitRatio: 300,
    }).length,
    1,
  );
});
