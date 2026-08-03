import assert from "node:assert/strict";
import test from "node:test";

import {
  MasonryOutOfPlaneApplication,
  type MasonryOutOfPlaneApplicationInput,
  type MasonryOutOfPlaneModelOptions,
} from "../dist/index.js";

type IsAny<T> = 0 extends 1 & T ? true : false;
type AssertFalse<T extends false> = T;
type PublicDeclarationsAreStrict = [
  AssertFalse<IsAny<typeof MasonryOutOfPlaneApplication>>,
  AssertFalse<IsAny<MasonryOutOfPlaneApplicationInput>>,
  AssertFalse<IsAny<MasonryOutOfPlaneModelOptions>>,
  AssertFalse<IsAny<ReturnType<MasonryOutOfPlaneApplication["run"]>>>,
];

function usePublicDeclarations(value: PublicDeclarationsAreStrict | undefined): void {
  void value;
}

const model: MasonryOutOfPlaneModelOptions = { id: "typed-wall" };
const input: MasonryOutOfPlaneApplicationInput = { model, code: "NTC2018" };

void test("masonry out-of-plane exports expose strict typed consumer contracts", () => {
  usePublicDeclarations(undefined);
  const application = new MasonryOutOfPlaneApplication();
  const result = application.run(input);

  assert.equal(application.id, "masonry-out-of-plane");
  assert.equal(result.applicationId, application.id);
});
