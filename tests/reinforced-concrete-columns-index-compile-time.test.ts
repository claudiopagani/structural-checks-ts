import assert from "node:assert/strict";
import test from "node:test";

import {
  ReinforcedConcreteColumnApplication,
  ReinforcedConcreteColumnDetailingVerification,
  ReinforcedConcreteColumnModel,
  ReinforcedConcreteColumnVerification,
} from "../dist/index.js";

type IsAny<T> = 0 extends 1 & T ? true : false;
type AssertFalse<T extends false> = T;
type ColumnIndexDeclarationsAreStrict = [
  AssertFalse<IsAny<typeof ReinforcedConcreteColumnApplication>>,
  AssertFalse<IsAny<typeof ReinforcedConcreteColumnDetailingVerification>>,
  AssertFalse<IsAny<typeof ReinforcedConcreteColumnModel>>,
  AssertFalse<IsAny<typeof ReinforcedConcreteColumnVerification>>,
];

function useColumnIndexDeclarations(value: ColumnIndexDeclarationsAreStrict | undefined): void {
  void value;
}

void test("reinforced concrete columns index exposes strict typed consumers", () => {
  useColumnIndexDeclarations(undefined);

  assert.equal(typeof ReinforcedConcreteColumnApplication, "function");
  assert.equal(typeof ReinforcedConcreteColumnDetailingVerification, "function");
  assert.equal(typeof ReinforcedConcreteColumnModel, "function");
  assert.equal(typeof ReinforcedConcreteColumnVerification, "function");
});
