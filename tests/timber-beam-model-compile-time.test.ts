import assert from "node:assert/strict";
import test from "node:test";

import { TimberBeamModel, type TimberBeamModelOptions } from "../dist/index.js";

type IsAny<T> = 0 extends 1 & T ? true : false;
type AssertFalse<T extends false> = T;

const options: TimberBeamModelOptions = {
  id: "timber-beam-compile-time",
  span: 4.2,
  restraints: { left: "fixed", right: "simple" },
  loadCases: [{ id: "G1", value: 12 }],
  metadata: { label: String.fromCodePoint(0x3bb) },
};

type ModelIsStrict = AssertFalse<IsAny<typeof TimberBeamModel>>;
type OptionsAreStrict = AssertFalse<IsAny<TimberBeamModelOptions>>;

void test("TimberBeamModel exposes a strict consumer contract", () => {
  const modelStrictProof: ModelIsStrict = false;
  const optionsStrictProof: OptionsAreStrict = false;
  const model = new TimberBeamModel(options);

  assert.equal(modelStrictProof, false);
  assert.equal(optionsStrictProof, false);
  assert.equal(model.id, "timber-beam-compile-time");
  assert.equal(model.loadCases.length, 1);
});
