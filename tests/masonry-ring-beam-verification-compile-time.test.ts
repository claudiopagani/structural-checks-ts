import assert from "node:assert/strict";
import test from "node:test";

import {
  MasonryRingBeamVerification,
  type MasonryRingBeamVerificationOptions,
  type MasonryRingBeamVerifyInput,
} from "../dist/index.js";

type IsAny<T> = 0 extends 1 & T ? true : false;
type AssertFalse<T extends false> = T;
type PublicDeclarationsAreStrict = [
  AssertFalse<IsAny<typeof MasonryRingBeamVerification>>,
  AssertFalse<IsAny<MasonryRingBeamVerificationOptions>>,
  AssertFalse<IsAny<MasonryRingBeamVerifyInput>>,
  AssertFalse<IsAny<InstanceType<typeof MasonryRingBeamVerification>>>,
];

function usePublicDeclarations(value: PublicDeclarationsAreStrict | undefined): void {
  void value;
}

void test("masonry ring beam verification exposes a strict typed consumer contract", () => {
  usePublicDeclarations(undefined);
  const verification = new MasonryRingBeamVerification({
    code: "NTC2018",
    metadata: { label: "cerchiatura — verification" },
  });
  const input: MasonryRingBeamVerifyInput = { openingId: "opening-typed" };
  const result = verification.verify(input);

  assert.equal(result.status, "not-implemented");
  assert.equal(result.metadata.openingId, "opening-typed");
  assert.equal(result.metadata.label, "cerchiatura — verification");
});
