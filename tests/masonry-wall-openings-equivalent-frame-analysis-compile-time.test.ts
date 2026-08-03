import assert from "node:assert/strict";
import test from "node:test";

import {
  AlignmentEquivalentFramePushoverAnalysis,
  MasonryPierCapacityCurveComparisonAnalysis,
  MasonryWallOpeningsModel,
  type AlignmentEquivalentFramePushoverAnalysisInput,
  type AlignmentEquivalentFramePushoverAnalysisResult,
  type MasonryPierCapacityCurveComparisonAnalysisInput,
  type MasonryPierCapacityCurveComparisonAnalysisResult,
} from "../dist/index.js";

type IsAny<T> = 0 extends 1 & T ? true : false;
type AssertFalse<T extends false> = T;

const alignment = new MasonryWallOpeningsModel({
  id: "alignment-equivalent-frame-λ",
  units: { force: "N", length: "m" },
  walls: [
    {
      id: "wall-equivalent-frame-λ",
      length: 1.2,
      height: 3,
      thickness: 0.3,
      material: {
        fm: 6e6,
        tau0: 4e5,
        fv0: 0,
        E: 1.8e9,
        G: 6e8,
        density: 18000,
        units: { force: "N", length: "m" },
      },
      verticalLineLoad: { G1: 5000 },
    },
  ],
});

const equivalentFrameInput: AlignmentEquivalentFramePushoverAnalysisInput = {
  alignment,
  options: { topRotation: "free", controlPointCount: 20 },
};
const pierComparisonInput: MasonryPierCapacityCurveComparisonAnalysisInput = {
  alignment,
  options: { topRotation: "free", controlPointCount: 20 },
};

type EquivalentFrameIsStrict = AssertFalse<IsAny<typeof AlignmentEquivalentFramePushoverAnalysis>>;
type PierComparisonIsStrict = AssertFalse<IsAny<typeof MasonryPierCapacityCurveComparisonAnalysis>>;

void test("masonry wall-opening equivalent-frame analyses expose strict consumers", () => {
  const equivalentFrameStrictProof: EquivalentFrameIsStrict = false;
  const pierComparisonStrictProof: PierComparisonIsStrict = false;
  const equivalentFrameResult: AlignmentEquivalentFramePushoverAnalysisResult =
    new AlignmentEquivalentFramePushoverAnalysis().analyze(equivalentFrameInput);
  const pierComparisonResult: MasonryPierCapacityCurveComparisonAnalysisResult =
    new MasonryPierCapacityCurveComparisonAnalysis().analyze(pierComparisonInput);

  assert.equal(equivalentFrameStrictProof, false);
  assert.equal(pierComparisonStrictProof, false);
  assert.equal(equivalentFrameResult.applicationId, "masonry-wall-openings");
  assert.equal(pierComparisonResult.applicationId, "masonry-wall-openings");
});
