import assert from "node:assert/strict";
import test from "node:test";

import {
  SteelPlasticHingeState,
  type SteelPlasticHingeStateJson,
  type SteelPlasticHingeStateOptions,
} from "../dist/applications/steel-frames/analysis/SteelPlasticHingeState.js";

type IsAny<T> = 0 extends 1 & T ? true : false;
type AssertFalse<T extends false> = T;
type SteelPlasticHingeStateIsStrict = AssertFalse<IsAny<typeof SteelPlasticHingeState>>;

function useStateDeclarations(
  options: SteelPlasticHingeStateOptions,
  json: SteelPlasticHingeStateJson,
): SteelPlasticHingeState {
  const state = new SteelPlasticHingeState(options);
  const cloned = state.clone();
  assert.deepEqual(cloned.toJSON(), json);
  return cloned;
}

void test("SteelPlasticHingeState exposes strict typed consumers", () => {
  const state: SteelPlasticHingeState = useStateDeclarations(
    { start: "+", history: [{ label: "cerniera \u03bb" }] },
    { start: "positive", end: null, history: [{ label: "cerniera \u03bb" }] },
  );
  const strictTypeProof: SteelPlasticHingeStateIsStrict = false;

  assert.equal(strictTypeProof, false);
  assert.equal(state.isActiveAt("start"), true);
  assert.equal(state.activeCount(), 1);
  assert.equal(state.signAt("end"), null);
});
