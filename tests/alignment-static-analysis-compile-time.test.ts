import assert from "node:assert/strict";
import test from "node:test";

import {
  AlignmentStaticAnalysis,
  MasonryWallOpeningsModel,
  type AlignmentStaticAnalysisInput,
  type AlignmentStaticAnalysisOptions,
  type AlignmentStaticAnalysisResult,
} from "../dist/index.js";

type IsAny<T> = 0 extends 1 & T ? true : false;
type AssertFalse<T extends false> = T;
type AlignmentStaticAnalysisIsStrict = AssertFalse<IsAny<typeof AlignmentStaticAnalysis>>;

const options: AlignmentStaticAnalysisOptions = {
  combinationType: "ULS_FUNDAMENTAL",
  pierDesign: { gammaM: 2, confidenceFactor: 1 },
};

const input: AlignmentStaticAnalysisInput = {
  alignment: new MasonryWallOpeningsModel({
    id: "alignment-static-λ",
    units: { force: "N", length: "m" },
    walls: [
      {
        id: "wall-λ",
        length: 2,
        height: 3,
        thickness: 0.3,
        material: { fm: 6e6, E: 1.8e9, G: 6e8, density: 18000 },
        verticalLineLoad: { G1: 10000 },
      },
    ],
  }),
  options,
};

void test("AlignmentStaticAnalysis exposes strict typed consumers", () => {
  const strictTypeProof: AlignmentStaticAnalysisIsStrict = false;
  const result: AlignmentStaticAnalysisResult = new AlignmentStaticAnalysis().analyze(input);

  assert.equal(strictTypeProof, false);
  assert.equal(result.applicationId, "masonry-wall-openings");
  assert.equal(result.metadata.stage, "design");
});
