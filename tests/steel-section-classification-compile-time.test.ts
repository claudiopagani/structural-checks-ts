import assert from "node:assert/strict";
import test from "node:test";

import {
  classifySteelSection,
  type ClassifySteelSectionOptions,
  type SteelSectionClassificationResult,
  type SteelSectionClassificationSectionLike,
} from "../dist/index.js";

type IsAny<T> = 0 extends 1 & T ? true : false;
type AssertFalse<T extends false> = T;
type SectionClassificationIsStrict = AssertFalse<
  IsAny<typeof classifySteelSection | SteelSectionClassificationResult>
>;

function useSectionClassificationDeclarations(
  options: ClassifySteelSectionOptions,
): SteelSectionClassificationResult {
  return classifySteelSection(options);
}

void test("steel section classification exposes a strict typed consumer contract", () => {
  const strictTypeProof: SectionClassificationIsStrict = false;
  assert.equal(strictTypeProof, false);

  const section: SteelSectionClassificationSectionLike = {
    family: "IPE",
    profileName: "IPE200",
    height: 200,
    width: 100,
    webThickness: 5.6,
    flangeThickness: 8.5,
    rootRadius: 12,
    area: 2850,
    inertiaY: 19400000,
    inertiaZ: 1420000,
  };
  const result = useSectionClassificationDeclarations({
    section,
    material: { fyk: 275 },
    nEd: 10000,
    mEd: 1000000,
  });

  assert.equal(typeof result.class, "number");
  assert.equal(result.family, "IPE");
});
