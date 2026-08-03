import assert from "node:assert/strict";
import test from "node:test";

import {
  SteelFrameModel,
  type SteelFrameModelOptions,
} from "../dist/applications/steel-frames/models/SteelFrameModel.js";

type IsAny<T> = 0 extends 1 & T ? true : false;
type AssertFalse<T extends false> = T;
type SteelFrameModelIsStrict = AssertFalse<IsAny<typeof SteelFrameModel>>;

function useSteelFrameModelDeclarations(options: SteelFrameModelOptions): SteelFrameModel {
  return new SteelFrameModel(options);
}

void test("SteelFrameModel exposes strict typed consumers", () => {
  const model = useSteelFrameModelDeclarations({
    id: "frame-α",
    members: [{ id: "column-1" }],
    metadata: { label: "Telaio \u03bb" },
  });
  const strictTypeProof: SteelFrameModelIsStrict = false;

  assert.equal(strictTypeProof, false);
  assert.equal(model.id, "frame-α");
  assert.equal(model.members.length, 1);
  assert.equal(model.loadCombinations.length, 0);
  assert.equal(model.metadata.label, "Telaio \u03bb");
});
