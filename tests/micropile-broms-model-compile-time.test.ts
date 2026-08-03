import assert from "node:assert/strict";
import test from "node:test";

import { MicropileBromsModel, type MicropileBromsModelOptions } from "../dist/index.js";

type IsAny<T> = 0 extends 1 & T ? true : false;
type AssertFalse<T extends false> = T;
type ModelDeclarationsAreStrict = [
  AssertFalse<IsAny<typeof MicropileBromsModel>>,
  AssertFalse<IsAny<MicropileBromsModelOptions>>,
];

function useModelDeclarations(value: ModelDeclarationsAreStrict | undefined): void {
  void value;
}

void test("MicropileBromsModel exposes a strict typed consumer contract", () => {
  useModelDeclarations(undefined);

  const options: MicropileBromsModelOptions = {
    id: "micropile-α",
    pile: { diameter: 0.2, length: 12 },
    soil: { profile: "sand" },
    boundaryConditions: { head: "free" },
    actions: { H: 100 },
    metadata: { source: "typed-consumer" },
  };
  const model = new MicropileBromsModel(options);

  assert.equal(model.id, "micropile-α");
  assert.equal(model.pile.diameter, 0.2);
  assert.equal(model.soil.profile, "sand");
  assert.equal(model.boundaryConditions.head, "free");
  assert.equal(model.actions.H, 100);
  assert.equal(model.metadata.source, "typed-consumer");
});
