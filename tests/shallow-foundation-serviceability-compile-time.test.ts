import test from "node:test";

import {
  SHALLOW_FOUNDATION_SETTLEMENT_METHODS,
  ShallowFoundationServiceabilityAnalysis,
  calculateRigidFoundationElasticStiffness,
  calculateSchmertmannStrainInfluence,
  calculateShallowFoundationDifferentialMovement,
  calculateShallowFoundationVerticalStressInfluence,
  type RigidFoundationElasticStiffnessInput,
  type RigidFoundationElasticStiffnessResult,
  type ShallowFoundationDifferentialMovementInput,
  type ShallowFoundationServiceabilityAnalysisInput,
  type ShallowFoundationServiceabilityAnalysisResult,
  type ShallowFoundationSettlementMethod,
  type ShallowFoundationVerticalStressInfluenceInput,
} from "../dist/index.js";

const method: ShallowFoundationSettlementMethod = SHALLOW_FOUNDATION_SETTLEMENT_METHODS[0];
const analysisInput: ShallowFoundationServiceabilityAnalysisInput = {
  method,
  criteria: { maximumSettlement: 0.025, maximumRotation: null },
  analysisSettings: { maximumRefinements: 2 },
};
const stiffnessInput: RigidFoundationElasticStiffnessInput = {
  width: 2,
  length: 3,
  shearModulus: 12_000,
  poissonRatio: 0.25,
};
const differentialInput: ShallowFoundationDifferentialMovementInput = {
  firstMovement: { settlement: 0.01, placement: { x: 0, y: 0 } },
  secondMovement: { settlement: 0.02, placement: { x: 2, y: 0 } },
  units: { force: "kN", length: "m" },
};
const influenceInput: ShallowFoundationVerticalStressInfluenceInput = {
  shape: "rectangular",
  width: 2,
  length: 3,
  depth: 1,
};

void test("shallow-foundation serviceability exports expose strict typed consumer contracts", () => {
  const analysis = new ShallowFoundationServiceabilityAnalysis();
  const analyze = (
    input: ShallowFoundationServiceabilityAnalysisInput,
  ): ShallowFoundationServiceabilityAnalysisResult => analysis.analyze(input);
  const stiffness: RigidFoundationElasticStiffnessResult =
    calculateRigidFoundationElasticStiffness(stiffnessInput);
  const strainInfluence = calculateSchmertmannStrainInfluence({
    depth: 0.5,
    width: 2,
    lengthToWidthRatio: 1,
    peakInfluence: 0.7,
  });
  const stressInfluence = calculateShallowFoundationVerticalStressInfluence(influenceInput);
  const differential = calculateShallowFoundationDifferentialMovement(differentialInput);
  void analyze;
  void analysisInput;
  void stiffness;
  void strainInfluence;
  void stressInfluence;
  void differential;
});
