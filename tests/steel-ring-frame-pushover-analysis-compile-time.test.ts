import assert from "node:assert/strict";
import test from "node:test";

import {
  SteelRingFramePushoverAnalysis,
  type SteelRingFramePushoverAnalysisInput,
  type SteelRingFramePushoverAnalysisResult,
} from "../dist/index.js";

type IsAny<T> = 0 extends 1 & T ? true : false;
type AssertFalse<T extends false> = T;
type AnalysisIsStrict = AssertFalse<IsAny<typeof SteelRingFramePushoverAnalysis>>;

const input: SteelRingFramePushoverAnalysisInput = {
  model: {
    id: "ring-analysis-Æ",
    units: { force: "kN", length: "m" },
    geometry: { clearWidth: 0.9, clearHeight: 2.1 },
    memberSections: { columns: "IPE200", topBeam: "IPE200", bottomBeam: "IPE200" },
    material: "S275",
    baseCondition: "pinned-base-with-bottom-beam",
    solver: { controlIncrement: 0.002, maxDisplacement: 0.01, maxSteps: 6 },
  },
};

function analyze(): SteelRingFramePushoverAnalysisResult {
  return new SteelRingFramePushoverAnalysis().analyze(input);
}

void test("SteelRingFramePushoverAnalysis exposes strict typed consumers", () => {
  const strictTypeProof: AnalysisIsStrict = false;
  const result = analyze();

  assert.equal(strictTypeProof, false);
  assert.equal(result.status, "ok");
  assert.equal(result.metadata.analysisType, "steel-ring-frame-pushover");
  assert.ok(result.outputs.capacityCurve.points.length > 1);
  assert.equal(result.outputs.capacityCurve.units.displacement, "m");
  assert.equal(result.outputs.capacityCurve.units.baseShear, "kN");
});
