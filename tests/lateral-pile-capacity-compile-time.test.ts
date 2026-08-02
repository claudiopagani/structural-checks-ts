import test from "node:test";

import {
  LATERAL_PILE_BROMS_REFERENCE,
  LATERAL_PILE_CAPACITY_RESULT_SCHEMA_VERSION,
  LateralPileCapacityAnalysis,
  type LateralPileCapacityAnalysisInput,
  type LateralPileCapacityAnalysisResult,
} from "../dist/index.js";

const input: LateralPileCapacityAnalysisInput = {
  profileId: "profile-π",
  units: { force: "kN", length: "m" },
};
const analysis = new LateralPileCapacityAnalysis();
const result: LateralPileCapacityAnalysisResult = analysis.analyze(input);

void test("LateralPileCapacityAnalysis exposes a strict typed consumer contract", () => {
  if (LATERAL_PILE_CAPACITY_RESULT_SCHEMA_VERSION !== "lateral-pile-capacity-result/v1") {
    throw new Error("Unexpected lateral-pile capacity result schema version.");
  }
  if (!LATERAL_PILE_BROMS_REFERENCE.includes("FHWA GEC 9")) {
    throw new Error("Expected the canonical Broms reference metadata.");
  }
  if (result.status !== "failed") {
    throw new Error("The compile-time fixture should preserve its failed-input result.");
  }
});
