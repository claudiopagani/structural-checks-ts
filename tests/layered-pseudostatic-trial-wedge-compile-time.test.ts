import test from "node:test";

import {
  evaluateLayeredPseudostaticTrialWedge,
  LAYERED_PSEUDOSTATIC_TRIAL_WEDGE_REFERENCES,
  optimizeLayeredPseudostaticTrialWedge,
  type LayeredPseudostaticTrialWedgeOptions,
  type LayeredPseudostaticTrialWedgeResult,
  type OptimizeLayeredPseudostaticTrialWedgeOptions,
  type TrialWedgeCandidate,
} from "../dist/domain/geotechnics/LayeredPseudostaticTrialWedge.js";

const evaluate: (options: LayeredPseudostaticTrialWedgeOptions) => TrialWedgeCandidate | null =
  evaluateLayeredPseudostaticTrialWedge;
const optimize: (
  options: OptimizeLayeredPseudostaticTrialWedgeOptions,
) => LayeredPseudostaticTrialWedgeResult = optimizeLayeredPseudostaticTrialWedge;
const references: readonly string[] = LAYERED_PSEUDOSTATIC_TRIAL_WEDGE_REFERENCES;

void test("layered pseudostatic trial-wedge helpers expose strict internal contracts", () => {
  void evaluate;
  void optimize;
  void references;
});
