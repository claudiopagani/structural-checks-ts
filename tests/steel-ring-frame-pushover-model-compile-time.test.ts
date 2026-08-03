import assert from "node:assert/strict";
import test from "node:test";

import {
  SteelRingFramePushoverModel,
  type SteelRingFramePushoverModelOptions,
} from "../dist/applications/steel-frames/models/SteelRingFramePushoverModel.js";
import {
  SteelRingFramePushoverModel as RootSteelRingFramePushoverModel,
  type SteelRingFrameMemberOrientation,
} from "../dist/index.js";

type IsAny<T> = 0 extends 1 & T ? true : false;
type AssertFalse<T extends false> = T;
type SteelRingFramePushoverModelIsStrict = AssertFalse<IsAny<typeof SteelRingFramePushoverModel>>;

function useSteelRingFramePushoverModel(
  options: SteelRingFramePushoverModelOptions,
): SteelRingFramePushoverModel {
  return new SteelRingFramePushoverModel(options);
}

void test("SteelRingFramePushoverModel exposes strict typed consumers", () => {
  const model = useSteelRingFramePushoverModel({
    id: "ring-\u00ce\u00b1",
    units: { force: "kN", length: "m" },
    geometry: { clearWidth: 0.9, clearHeight: 2.1 },
    memberSections: { columns: "IPE200", topBeam: "IPE200" },
    memberOrientations: { topBeam: "weak-axis-in-plane" },
    baseCondition: "fixed-base",
    metadata: { label: "Telaio λ" },
  });
  const strictTypeProof: SteelRingFramePushoverModelIsStrict = false;
  const orientation: SteelRingFrameMemberOrientation = model.memberOrientations.topBeam;

  assert.equal(strictTypeProof, false);
  assert.equal(RootSteelRingFramePushoverModel, SteelRingFramePushoverModel);
  assert.equal(model.id, "ring-\u00ce\u00b1");
  assert.equal(model.geometry.clearWidth, 900);
  assert.equal(model.geometry.clearHeight, 2100);
  assert.equal(model.baseCondition, "fixed-base");
  assert.equal(model.includeBottomBeam, false);
  assert.equal(orientation.axis, "z");
  assert.equal(orientation.label, "weak-axis-in-plane");
  assert.equal(model.topNodeId(), "ring-\u00ce\u00b1-tl");
  assert.deepEqual(model.sourceUnits(), { force: "kN", length: "m" });
  assert.equal(model.toJSON().metadata.label, "Telaio λ");
});
