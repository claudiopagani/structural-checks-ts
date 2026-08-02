import test from "node:test";

import {
  RETAINING_WALL_ANALYSIS_RESULT_SCHEMA_VERSION,
  RetainingWallAnalysis,
  type RetainingWallAnalysisInput,
  type RetainingWallAnalysisResult,
} from "../dist/index.js";

const input: RetainingWallAnalysisInput = {
  units: { force: "kN", length: "m" },
};
const analysis = new RetainingWallAnalysis();
const analyze = (value: RetainingWallAnalysisInput): RetainingWallAnalysisResult =>
  analysis.analyze(value);

void test("RetainingWallAnalysis exposes a strict typed consumer contract", () => {
  if (RETAINING_WALL_ANALYSIS_RESULT_SCHEMA_VERSION !== "retaining-wall-analysis-result/v1") {
    throw new Error("Unexpected retaining-wall analysis schema version.");
  }
  void input;
  void analyze;
});
