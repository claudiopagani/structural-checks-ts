import assert from "node:assert/strict";
import test from "node:test";

import {
  AlignmentStateComparisonAnalysis,
  MasonryWallOpeningsModel,
  type AlignmentStateComparisonAnalysisInput,
  type AlignmentStateComparisonAnalysisResult,
} from "../dist/index.js";

type IsAny<T> = 0 extends 1 & T ? true : false;
type AssertFalse<T extends false> = T;
type AlignmentStateComparisonAnalysisIsStrict = AssertFalse<
  IsAny<typeof AlignmentStateComparisonAnalysis>
>;

const input: AlignmentStateComparisonAnalysisInput = {
  alignment: new MasonryWallOpeningsModel({
    id: "alignment-state-λ",
    units: { force: "N", length: "m" },
    walls: [
      {
        id: "wall-state-λ",
        length: 5,
        height: 3,
        thickness: 0.3,
        material: {
          category: "masonry",
          units: { force: "N", length: "m" },
          originalMechanicalProperties: {
            fm: 4.5e6,
            tau0: 8e4,
            fv0: 1.5e5,
            E: 1.6e9,
            G: 5.4e8,
            density: 18000,
          },
          stateOfFactProperties: {
            fm: 4e6,
            tau0: 7e4,
            fv0: 1.2e5,
            E: 1.4e9,
            G: 4.8e8,
            density: 18000,
          },
          improvedMechanicalProperties: {
            fm: 4e6,
            tau0: 7e4,
            fv0: 1.2e5,
            E: 1.4e9,
            G: 4.8e8,
            density: 18000,
          },
        },
        verticalLineLoad: { G1: 20000 },
      },
    ],
    openings: [{ id: "opening-state-λ", x: 2, y: 1, width: 1, height: 1 }],
  }),
};

void test("AlignmentStateComparisonAnalysis exposes strict typed consumers", () => {
  const strictTypeProof: AlignmentStateComparisonAnalysisIsStrict = false;
  const result: AlignmentStateComparisonAnalysisResult =
    new AlignmentStateComparisonAnalysis().analyze(input);

  assert.equal(strictTypeProof, false);
  assert.equal(result.applicationId, "masonry-wall-openings");
  assert.equal(result.outputs.criteria.strengthMustNotDecrease, true);
});
