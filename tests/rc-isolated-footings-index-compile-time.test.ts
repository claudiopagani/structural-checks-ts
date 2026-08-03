import assert from "node:assert/strict";
import test from "node:test";

import {
  ReinforcedConcreteIsolatedFootingApplication,
  ReinforcedConcreteIsolatedFootingModel,
  ReinforcedConcreteIsolatedFootingVerification,
  type ReinforcedConcreteIsolatedFootingModelInput,
} from "../dist/index.js";

type IsAny<T> = 0 extends 1 & T ? true : false;
type AssertFalse<T extends false> = T;
type PublicDeclarationsAreStrict = [
  AssertFalse<IsAny<typeof ReinforcedConcreteIsolatedFootingApplication>>,
  AssertFalse<IsAny<typeof ReinforcedConcreteIsolatedFootingModel>>,
  AssertFalse<IsAny<typeof ReinforcedConcreteIsolatedFootingVerification>>,
  AssertFalse<IsAny<ReinforcedConcreteIsolatedFootingModelInput>>,
];

function usePublicDeclarations(value: PublicDeclarationsAreStrict | undefined): void {
  void value;
}

void test("RC isolated-footing index exposes strict typed consumer declarations", () => {
  usePublicDeclarations(undefined);
  const input: ReinforcedConcreteIsolatedFootingModelInput = {
    id: "compile-time-isolated-footing",
    units: { force: "N", length: "mm" },
  };
  const application = new ReinforcedConcreteIsolatedFootingApplication();
  const verification = new ReinforcedConcreteIsolatedFootingVerification();

  assert.equal(input.id, "compile-time-isolated-footing");
  assert.equal(typeof ReinforcedConcreteIsolatedFootingModel, "function");
  assert.equal(application.id, "reinforced-concrete-isolated-footings");
  assert.equal(typeof verification.verify, "function");
});
