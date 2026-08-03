import assert from "node:assert/strict";
import test from "node:test";

import { SteelMemberVerification, type SteelMemberVerificationInput } from "../dist/index.js";

type IsAny<T> = 0 extends 1 & T ? true : false;
type AssertFalse<T extends false> = T;
type SteelMemberVerificationIsStrict = AssertFalse<IsAny<typeof SteelMemberVerification>>;

const fixture: SteelMemberVerificationInput = {
  section: {
    family: "IPE",
    area: 2600,
    elasticSectionModulusY: 194000,
    plasticSectionModulusY: 220000,
    elasticSectionModulusZ: 23000,
    plasticSectionModulusZ: 35000,
    shearAreaY: 1300,
    shearAreaZ: 800,
  },
  material: { fyk: 275, metadata: { gammaM0: 1.05 } },
  analysisResult: {
    id: "member-λ",
    combinations: {},
  },
};

void test("SteelMemberVerification exposes strict typed consumers", () => {
  const strictTypeProof: SteelMemberVerificationIsStrict = false;
  const missing = new SteelMemberVerification().verify();
  const result = new SteelMemberVerification({ metadata: { label: "member-λ" } }).verify(fixture);

  assert.equal(strictTypeProof, false);
  assert.equal(missing.status, "not-implemented");
  assert.equal(result.applicationId, "steel-frames");
  assert.equal(result.metadata.label, "member-λ");
});
