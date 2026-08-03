import assert from "node:assert/strict";
import test from "node:test";

import { SingleBeamDesignApplication } from "../dist/index.js";

type IsAny<T> = 0 extends 1 & T ? true : false;
type AssertFalse<T extends false> = T;
type SingleBeamDesignApplicationIsStrict = [
  AssertFalse<IsAny<typeof SingleBeamDesignApplication>>,
  AssertFalse<IsAny<InstanceType<typeof SingleBeamDesignApplication>>>,
];

function useSingleBeamApplicationDeclarations(
  value: SingleBeamDesignApplicationIsStrict | undefined,
): void {
  void value;
}

void test("single-beam design application exposes strict typed consumers", () => {
  useSingleBeamApplicationDeclarations(undefined);

  const application = new SingleBeamDesignApplication();
  assert.equal(application.id, "single-beam-design");
  assert.equal(typeof application.run, "function");
});
