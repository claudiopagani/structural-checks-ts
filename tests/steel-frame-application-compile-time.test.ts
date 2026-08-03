import assert from "node:assert/strict";
import test from "node:test";

import {
  SteelFrameApplication,
  SteelRingFramePushoverModel,
  type SteelFrameApplicationInput,
} from "../dist/index.js";

type IsAny<T> = 0 extends 1 & T ? true : false;
type AssertFalse<T extends false> = T;

const model = new SteelRingFramePushoverModel({
  id: "ring-compile-time",
  units: { force: "kN", length: "m" },
  geometry: { b: 0.9, h: 2.1 },
  memberSections: { columns: "IPE200", topBeam: "IPE200", bottomBeam: "IPE200" },
  material: "S275",
});

const input: SteelFrameApplicationInput = {
  id: "ring-compile-time",
  model,
  memberId: "member-compile-time",
  loadCombinations: [],
};

type ApplicationIsStrict = AssertFalse<IsAny<typeof SteelFrameApplication>>;
type InputIsStrict = AssertFalse<IsAny<SteelFrameApplicationInput>>;

void test("steel frame application exposes strict consumers", () => {
  const applicationStrictProof: ApplicationIsStrict = false;
  const inputStrictProof: InputIsStrict = false;
  const application = new SteelFrameApplication();
  const result = application.run(input);

  assert.equal(applicationStrictProof, false);
  assert.equal(inputStrictProof, false);
  assert.equal(application.id, "steel-frames");
  assert.equal(result.applicationId, "steel-frames");
});
