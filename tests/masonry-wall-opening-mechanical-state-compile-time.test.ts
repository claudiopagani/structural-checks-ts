import assert from "node:assert/strict";
import test from "node:test";

import {
  MasonryWallOpeningsModel,
  resolveAlignmentMechanicalState,
  type AlignmentMechanicalStateResolution,
  type ResolveAlignmentMechanicalStateInput,
} from "../dist/index.js";

type IsAny<T> = 0 extends 1 & T ? true : false;
type AssertFalse<T extends false> = T;
type PublicDeclarationsAreStrict = [
  AssertFalse<IsAny<typeof resolveAlignmentMechanicalState>>,
  AssertFalse<IsAny<AlignmentMechanicalStateResolution>>,
  AssertFalse<IsAny<ResolveAlignmentMechanicalStateInput>>,
  AssertFalse<IsAny<ReturnType<typeof resolveAlignmentMechanicalState>>>,
];

function usePublicDeclarations(value: PublicDeclarationsAreStrict | undefined): void {
  void value;
}

void test("alignment mechanical state exposes a strict typed consumer contract", () => {
  usePublicDeclarations(undefined);
  const alignment = new MasonryWallOpeningsModel({
    id: "alignment-mechanical-typed",
    units: { force: "N", length: "m" },
    walls: [
      {
        id: "wall-typed",
        length: 4,
        height: 3,
        thickness: 0.3,
        material: { originalMechanicalProperties: { fm: 4_000_000 } },
      },
    ],
    openings: [],
  });
  const input: ResolveAlignmentMechanicalStateInput = {
    alignment,
    stage: "state-of-fact",
  };
  const result = resolveAlignmentMechanicalState(input);

  assert.equal(result.stage, "state-of-fact");
  assert.equal(result.walls.length, 1);
  assert.equal(result.walls[0]?.material?.fm, 4_000_000);
});
