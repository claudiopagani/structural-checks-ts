import assert from "node:assert/strict";
import test from "node:test";

import {
  MASONRY_PIER_CAPACITY_CURVE_COMPARISON_REPORT_SCHEMA_VERSION,
  MasonryPierCapacityCurveComparisonReportBuilder,
  type MasonryPierCapacityCurveComparisonReportBuilderAnalysisResult,
  type MasonryPierCapacityCurveComparisonReportBuilderBuildInput,
  type MasonryPierCapacityCurveComparisonReportBuilderModel,
  type MasonryPierCapacityCurveComparisonReportBuilderOptions,
} from "../dist/index.js";

type IsAny<T> = 0 extends 1 & T ? true : false;
type AssertFalse<T extends false> = T;
type BuilderDeclarationsAreStrict = [
  AssertFalse<IsAny<typeof MASONRY_PIER_CAPACITY_CURVE_COMPARISON_REPORT_SCHEMA_VERSION>>,
  AssertFalse<IsAny<typeof MasonryPierCapacityCurveComparisonReportBuilder>>,
  AssertFalse<IsAny<MasonryPierCapacityCurveComparisonReportBuilderAnalysisResult>>,
  AssertFalse<IsAny<MasonryPierCapacityCurveComparisonReportBuilderBuildInput>>,
  AssertFalse<IsAny<MasonryPierCapacityCurveComparisonReportBuilderModel>>,
  AssertFalse<IsAny<MasonryPierCapacityCurveComparisonReportBuilderOptions>>,
];

function useBuilderDeclarations(value: BuilderDeclarationsAreStrict | undefined): void {
  void value;
}

void test("masonry pier capacity-curve builder exposes a strict typed consumer contract", () => {
  useBuilderDeclarations(undefined);

  const model: MasonryPierCapacityCurveComparisonReportBuilderModel = {
    id: "alignment-α",
    label: "Allineamento μ",
    units: { force: "kN", length: "m" },
    walls: [],
    openings: [],
  };
  const analysisResult: MasonryPierCapacityCurveComparisonReportBuilderAnalysisResult = {
    outputs: { pier: { id: "pier-1" } },
    warnings: [],
    assumptions: [],
    status: "ok",
  };
  const input: MasonryPierCapacityCurveComparisonReportBuilderBuildInput = {
    model,
    analysisResult,
  };
  const options: MasonryPierCapacityCurveComparisonReportBuilderOptions = {
    applicationId: "typed-consumer",
  };
  const report = new MasonryPierCapacityCurveComparisonReportBuilder(options).build(input);

  assert.equal(
    report.json.schemaVersion,
    MASONRY_PIER_CAPACITY_CURVE_COMPARISON_REPORT_SCHEMA_VERSION,
  );
  assert.equal(typeof report.markdown, "string");
});
