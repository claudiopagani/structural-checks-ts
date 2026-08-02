import test from "node:test";

import {
  LateralPileBeamOnSpringsAnalysis,
  type LateralPileBeamOnSpringsAnalysisInput,
  type LateralPileBeamOnSpringsResult,
} from "../dist/index.js";

const input: LateralPileBeamOnSpringsAnalysisInput = {
  groundModel: null,
  designSituation: null,
  pile: null,
  scenario: null,
  profileId: "profile-\u03B1",
  units: { force: "kN", length: "m" },
};

const analysis = new LateralPileBeamOnSpringsAnalysis();
const result: LateralPileBeamOnSpringsResult = analysis.analyze(input);

void test("LateralPileBeamOnSpringsAnalysis exposes a strict typed consumer contract", () => {
  void result;
});
