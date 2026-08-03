import assert from "node:assert/strict";
import test from "node:test";

import {
  MasonryWallOpeningsModel,
  extractEquivalentFrameMembers,
  type EquivalentFrameMembersResult,
  type ExtractEquivalentFrameMembersInput,
} from "../dist/index.js";

type IsAny<T> = 0 extends 1 & T ? true : false;
type AssertFalse<T extends false> = T;
type PublicDeclarationsAreStrict = [
  AssertFalse<IsAny<typeof extractEquivalentFrameMembers>>,
  AssertFalse<IsAny<EquivalentFrameMembersResult>>,
  AssertFalse<IsAny<ExtractEquivalentFrameMembersInput>>,
  AssertFalse<IsAny<ReturnType<typeof extractEquivalentFrameMembers>>>,
];

function usePublicDeclarations(value: PublicDeclarationsAreStrict | undefined): void {
  void value;
}

void test("masonry wall opening extraction exposes a strict typed consumer contract", () => {
  usePublicDeclarations(undefined);
  const alignment = new MasonryWallOpeningsModel({
    id: "alignment-typed",
    units: { force: "N", length: "m" },
    walls: [{ length: 5, height: 3, thickness: 0.3 }],
    openings: [{ x: 1, y: 1, width: 1, height: 1 }],
  });
  const result = extractEquivalentFrameMembers({ alignment });

  assert.equal(result.piers.length, 2);
  assert.equal(result.spandrels.length, 1);
  assert.equal(result.metadata.sanitizedOpeningCount, 1);
});
