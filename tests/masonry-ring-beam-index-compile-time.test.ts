import assert from "node:assert/strict";
import test from "node:test";

import {
  MasonryRingBeamApplication,
  MasonryRingBeamModel,
  MasonryRingBeamVerification,
} from "../dist/index.js";

type IsAny<T> = 0 extends 1 & T ? true : false;
type AssertFalse<T extends false> = T;
type PublicDeclarationsAreStrict = [
  AssertFalse<IsAny<typeof MasonryRingBeamApplication>>,
  AssertFalse<IsAny<typeof MasonryRingBeamModel>>,
  AssertFalse<IsAny<typeof MasonryRingBeamVerification>>,
];

function usePublicDeclarations(value: PublicDeclarationsAreStrict | undefined): void {
  void value;
}

void test("masonry ring beam public index exposes strict typed consumers", () => {
  usePublicDeclarations(undefined);
  const application = new MasonryRingBeamApplication();
  const model = new MasonryRingBeamModel({ id: "ring-index-typed" });
  const verification = new MasonryRingBeamVerification();

  assert.equal(application.id, "masonry-ring-beams");
  assert.equal(model.id, "ring-index-typed");
  assert.equal(verification.code, "NTC2018");
});
