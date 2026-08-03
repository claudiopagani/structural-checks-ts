import assert from "node:assert/strict";
import test from "node:test";

import {
  TimberConcreteCompositeBeamModel,
  type TimberConcreteCompositeBeamModelOptions,
} from "../dist/index.js";

type IsAny<T> = 0 extends 1 & T ? true : false;
type AssertFalse<T extends false> = T;

const options: TimberConcreteCompositeBeamModelOptions = {
  id: "composite-beam-compile-time",
  span: 4_250,
  slabSection: { area: 108_000, height: 60, width: 1_800 },
  timberSection: { area: 60_000, height: 300, width: 200 },
  reinforcementSpacing: 100,
  timberMaterial: { elasticModulus: 11_000 },
  concreteMaterial: { elasticModulus: 30_000 },
  units: { force: "N", length: "mm" },
  metadata: { label: String.fromCodePoint(0x3bb) },
};

type ModelIsStrict = AssertFalse<IsAny<typeof TimberConcreteCompositeBeamModel>>;
type OptionsAreStrict = AssertFalse<IsAny<TimberConcreteCompositeBeamModelOptions>>;

void test("TimberConcreteCompositeBeamModel exposes a strict typed consumer contract", () => {
  const modelStrictProof: ModelIsStrict = false;
  const optionsStrictProof: OptionsAreStrict = false;
  const model = new TimberConcreteCompositeBeamModel(options);

  assert.equal(modelStrictProof, false);
  assert.equal(optionsStrictProof, false);
  assert.equal(model.slabCentroidY(), 330);
  assert.equal(model.timberCentroidY(), 150);
});
