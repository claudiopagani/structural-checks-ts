import assert from "node:assert/strict";
import test from "node:test";

import {
  MasonryWallOpeningsModel,
  sanitizeAlignmentOpenings,
  type SanitizeAlignmentOpeningsResult,
  type SanitizedAlignmentOpening,
} from "../dist/index.js";

type IsAny<T> = 0 extends 1 & T ? true : false;
type AssertFalse<T extends false> = T;
type PublicDeclarationsAreStrict = [
  AssertFalse<IsAny<typeof sanitizeAlignmentOpenings>>,
  AssertFalse<IsAny<SanitizeAlignmentOpeningsResult>>,
  AssertFalse<IsAny<SanitizedAlignmentOpening>>,
  AssertFalse<IsAny<ReturnType<typeof sanitizeAlignmentOpenings>>>,
];

function usePublicDeclarations(value: PublicDeclarationsAreStrict | undefined): void {
  void value;
}

void test("masonry wall opening sanitization exposes a strict typed consumer contract", () => {
  usePublicDeclarations(undefined);
  const alignment = new MasonryWallOpeningsModel({
    id: "alignment-typed",
    units: { force: "N", length: "m" },
    walls: [{ length: 5, height: 3, thickness: 0.3 }],
    openings: [{ x: 1, y: 1, width: 1, height: 1 }],
  });
  const result = sanitizeAlignmentOpenings({ alignment });

  assert.equal(result.openings.length, 1);
  assert.equal(result.metadata.mergedClusterCount, 1);
});
