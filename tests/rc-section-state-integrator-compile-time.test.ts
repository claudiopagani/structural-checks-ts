import assert from "node:assert/strict";
import test from "node:test";

import { RCSectionStateIntegrator } from "../dist/index.js";

type IsAny<T> = 0 extends 1 & T ? true : false;
type AssertFalse<T extends false> = T;
type PublicDeclarationIsUseful = AssertFalse<IsAny<typeof RCSectionStateIntegrator>>;

function usePublicDeclaration(value: PublicDeclarationIsUseful | undefined): void {
  void value;
}

void test("RCSectionStateIntegrator exposes a strict typed consumer contract", () => {
  usePublicDeclaration(undefined);
  const integrator = new RCSectionStateIntegrator();
  assert.equal(integrator.constructor, RCSectionStateIntegrator);
});
