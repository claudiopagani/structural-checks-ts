import assert from "node:assert/strict";
import test from "node:test";

import { MicropileBromsApplication } from "../dist/index.js";

type IsAny<T> = 0 extends 1 & T ? true : false;
type AssertFalse<T extends false> = T;
type MicropileBromsApplicationIsStrict = [
  AssertFalse<IsAny<typeof MicropileBromsApplication>>,
  AssertFalse<IsAny<InstanceType<typeof MicropileBromsApplication>>>,
];

function useMicropileBromsApplicationDeclarations(
  value: MicropileBromsApplicationIsStrict | undefined,
): void {
  void value;
}

void test("Micropile Broms application exposes strict typed consumers", () => {
  useMicropileBromsApplicationDeclarations(undefined);
  const application = new MicropileBromsApplication();
  assert.equal(application.id, "micropiles-broms");
  assert.equal(typeof application.run, "function");
});
