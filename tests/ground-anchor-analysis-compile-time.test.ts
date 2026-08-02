import test from "node:test";

import {
  GROUND_ANCHOR_DESIGN_RESULT_SCHEMA_VERSION,
  GroundAnchorAnalysis,
  type GroundAnchorAnalysisOptions,
  type GroundAnchorAnalysisResult,
  groundAnchorDemandFromEmbeddedWallResult,
} from "../dist/index.js";

const options: GroundAnchorAnalysisOptions = {
  groundModel: {},
  designSituation: {},
  anchor: {},
  scenario: {},
  units: { force: "kN", length: "m" },
};

void test("GroundAnchorAnalysis exposes a strict typed consumer contract", () => {
  const analysis: GroundAnchorAnalysis = new GroundAnchorAnalysis();
  const analyze: GroundAnchorAnalysis["analyze"] = (input) => analysis.analyze(input);
  const demand: typeof groundAnchorDemandFromEmbeddedWallResult =
    groundAnchorDemandFromEmbeddedWallResult;
  const result: GroundAnchorAnalysisResult | undefined = undefined;
  void GROUND_ANCHOR_DESIGN_RESULT_SCHEMA_VERSION;
  void analyze;
  void result;
  void options;
  void demand;
});
