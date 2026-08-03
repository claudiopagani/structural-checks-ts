import assert from "node:assert/strict";
import test from "node:test";

import {
  MasonryRingBeamApplication,
  StructuralApplication,
  type MasonryRingBeamApplicationInput,
  type MasonryRingBeamApplicationModel,
} from "../dist/index.js";

type IsAny<T> = 0 extends 1 & T ? true : false;
type AssertFalse<T extends false> = T;
type PublicDeclarationsAreStrict = [
  AssertFalse<IsAny<typeof MasonryRingBeamApplication>>,
  AssertFalse<IsAny<MasonryRingBeamApplicationInput>>,
  AssertFalse<IsAny<MasonryRingBeamApplicationModel>>,
  AssertFalse<IsAny<InstanceType<typeof MasonryRingBeamApplication>>>,
];

function usePublicDeclarations(value: PublicDeclarationsAreStrict | undefined): void {
  void value;
}

void test("masonry ring beam application exposes a strict typed consumer contract", () => {
  usePublicDeclarations(undefined);
  const model: MasonryRingBeamApplicationModel = {
    id: "cerchiatura-μ",
    opening: { id: "opening-typed" },
  };
  const input: MasonryRingBeamApplicationInput = {
    code: "Circolare 2019",
    model,
  };
  const application = new MasonryRingBeamApplication();
  const result = application.run(input);

  assert.ok(application instanceof StructuralApplication);
  assert.equal(application.id, "masonry-ring-beams");
  assert.equal(result.status, "not-implemented");
  assert.equal(result.outputs.modelId, "cerchiatura-μ");
  assert.ok(result.outputs.verification);
});
