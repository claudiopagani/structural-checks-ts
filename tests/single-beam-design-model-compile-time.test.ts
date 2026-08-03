import assert from "node:assert/strict";
import test from "node:test";

import {
  SingleBeamDesignModel,
  type SingleBeamAnalysisInputDto,
  type SingleBeamDesignModelInput,
  type SingleBeamDesignUnitSystem,
} from "../dist/index.js";

type IsAny<T> = 0 extends 1 & T ? true : false;
type AssertFalse<T extends false> = T;
type SingleBeamModelDeclarationsAreStrict = [
  AssertFalse<IsAny<typeof SingleBeamDesignModel>>,
  AssertFalse<IsAny<SingleBeamAnalysisInputDto>>,
  AssertFalse<IsAny<SingleBeamDesignModelInput>>,
  AssertFalse<IsAny<SingleBeamDesignUnitSystem>>,
];

function useSingleBeamModelDeclarations(
  value: SingleBeamModelDeclarationsAreStrict | undefined,
): void {
  void value;
}

void test("single-beam design model declarations expose strict typed consumers", () => {
  useSingleBeamModelDeclarations(undefined);

  const model = new SingleBeamDesignModel({
    id: "beam-model",
    beamInput: { geometry: { span: 6 } },
  });
  assert.equal(typeof model.toAnalysisInput, "function");
  assert.equal(typeof model.toJSON, "function");
  assert.equal(model.toAnalysisInput().id, "beam-model");
});
