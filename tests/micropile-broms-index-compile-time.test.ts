import assert from "node:assert/strict";
import test from "node:test";

import {
  MicropileBromsAnalysis,
  MicropileBromsApplication,
  MicropileBromsModel,
} from "../dist/applications/micropiles-broms/index.js";

type IsAny<T> = 0 extends 1 & T ? true : false;
type AssertFalse<T extends false> = T;
type MicropileBromsIndexIsStrict = [
  AssertFalse<IsAny<typeof MicropileBromsAnalysis>>,
  AssertFalse<IsAny<typeof MicropileBromsApplication>>,
  AssertFalse<IsAny<typeof MicropileBromsModel>>,
];

function useMicropileBromsIndexDeclarations(value: MicropileBromsIndexIsStrict | undefined): void {
  void value;
}

void test("Micropile Broms index exposes strict typed consumers", () => {
  useMicropileBromsIndexDeclarations(undefined);
  assert.equal(typeof MicropileBromsAnalysis, "function");
  assert.equal(typeof MicropileBromsApplication, "function");
  assert.equal(typeof MicropileBromsModel, "function");
});
