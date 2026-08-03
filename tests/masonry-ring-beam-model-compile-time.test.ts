import assert from "node:assert/strict";
import test from "node:test";

import { MasonryRingBeamModel, type MasonryRingBeamModelInput } from "../dist/index.js";

type IsAny<T> = 0 extends 1 & T ? true : false;
type AssertFalse<T extends false> = T;
type PublicDeclarationsAreStrict = [
  AssertFalse<IsAny<typeof MasonryRingBeamModel>>,
  AssertFalse<IsAny<MasonryRingBeamModelInput>>,
  AssertFalse<IsAny<InstanceType<typeof MasonryRingBeamModel>>>,
];

function usePublicDeclarations(value: PublicDeclarationsAreStrict | undefined): void {
  void value;
}

void test("masonry ring beam model exposes a strict typed consumer contract", () => {
  usePublicDeclarations(undefined);
  const input: MasonryRingBeamModelInput = {
    id: "ring-beam-typed",
    opening: { width: 1.2 },
    wall: { thickness: 0.3 },
    reinforcementScheme: { bars: "4Ø12" },
    loadPath: { upper: "wall-typed" },
    metadata: { label: "cerchiatura — typed" },
  };
  const model = new MasonryRingBeamModel(input);

  assert.equal(model.id, "ring-beam-typed");
  assert.equal(model.loadPath.upper, "wall-typed");
  assert.equal(model.metadata.label, "cerchiatura — typed");
});
