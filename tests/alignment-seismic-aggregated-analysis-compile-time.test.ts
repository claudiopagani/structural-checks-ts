import assert from "node:assert/strict";
import test from "node:test";

import {
  AlignmentSeismicAggregatedAnalysis,
  MasonryWallOpeningsModel,
  type AlignmentSeismicAggregatedAnalysisInput,
  type AlignmentSeismicAggregatedAnalysisResult,
} from "../dist/index.js";

type IsAny<T> = 0 extends 1 & T ? true : false;
type AssertFalse<T extends false> = T;
type AlignmentSeismicAggregatedAnalysisIsStrict = AssertFalse<
  IsAny<typeof AlignmentSeismicAggregatedAnalysis>
>;

const input: AlignmentSeismicAggregatedAnalysisInput = {
  alignment: new MasonryWallOpeningsModel({
    id: "alignment-seismic-λ",
    units: { force: "N", length: "m" },
    walls: [
      {
        id: "wall-seismic-λ",
        length: 5,
        height: 3,
        thickness: 0.3,
        material: {
          fm: 6e6,
          tau0: 1e5,
          fv0: 2e5,
          E: 1.8e9,
          G: 6e8,
          density: 18000,
        },
        verticalLineLoad: { G1: 20000 },
      },
    ],
    openings: [{ id: "opening-seismic-λ", x: 2, y: 1, width: 1, height: 1 }],
  }),
};

void test("AlignmentSeismicAggregatedAnalysis exposes strict typed consumers", () => {
  const strictTypeProof: AlignmentSeismicAggregatedAnalysisIsStrict = false;
  const result: AlignmentSeismicAggregatedAnalysisResult =
    new AlignmentSeismicAggregatedAnalysis().analyze(input);

  assert.equal(strictTypeProof, false);
  assert.equal(result.applicationId, "masonry-wall-openings");
  assert.equal(result.outputs.topRotation, "free");
});
