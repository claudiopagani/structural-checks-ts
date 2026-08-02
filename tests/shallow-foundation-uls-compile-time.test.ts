import test from "node:test";

import {
  SHALLOW_FOUNDATION_BASE_UPLIFT_TREATMENTS,
  SHALLOW_FOUNDATION_BEARING_METHODS,
  ShallowFoundationUltimateLimitStateAnalysis,
  calculateShallowFoundationBearingCapacity,
  calculateShallowFoundationEffectiveGeometry,
  calculateShallowFoundationSlidingResistance,
  type ShallowFoundationBearingCapacityInput,
  type ShallowFoundationEffectiveGeometry,
  type ShallowFoundationEffectiveGeometryInput,
  type ShallowFoundationSlidingResistanceInput,
  type ShallowFoundationUltimateLimitStateAnalysisInput,
  type ShallowFoundationUltimateLimitStateAnalysisResult,
} from "../dist/index.js";

const geometryInput: ShallowFoundationEffectiveGeometryInput = {};
const bearingMethod = SHALLOW_FOUNDATION_BEARING_METHODS.find(
  (method): method is "usace-meyerhof-2025" => method === "usace-meyerhof-2025",
);
if (!bearingMethod) throw new Error("Expected the USACE bearing method export.");
const bearingInput: ShallowFoundationBearingCapacityInput = {
  method: bearingMethod,
};
const slidingInput: ShallowFoundationSlidingResistanceInput = {};
const upliftTreatment = SHALLOW_FOUNDATION_BASE_UPLIFT_TREATMENTS.find(
  (treatment): treatment is "subtract-uniform-pressure" =>
    treatment === "subtract-uniform-pressure",
);
if (!upliftTreatment) throw new Error("Expected the uniform-pressure uplift export.");
const analysisInput: ShallowFoundationUltimateLimitStateAnalysisInput = {
  bearingSelection: "minimum",
  baseUpliftTreatment: upliftTreatment,
};

void test("shallow-foundation ULS exports expose strict typed consumer contracts", () => {
  const analysis: ShallowFoundationUltimateLimitStateAnalysis =
    new ShallowFoundationUltimateLimitStateAnalysis();
  const analyze = (
    input: ShallowFoundationUltimateLimitStateAnalysisInput,
  ): ShallowFoundationUltimateLimitStateAnalysisResult => analysis.analyze(input);
  const acceptsGeometry = (value: ShallowFoundationEffectiveGeometry): void => void value;
  const bearing = calculateShallowFoundationBearingCapacity;
  const sliding = calculateShallowFoundationSlidingResistance;
  const effectiveGeometry = calculateShallowFoundationEffectiveGeometry;
  void analyze;
  void geometryInput;
  void bearingInput;
  void slidingInput;
  void bearing;
  void sliding;
  void effectiveGeometry;
  void acceptsGeometry;
  void analysisInput;
});
