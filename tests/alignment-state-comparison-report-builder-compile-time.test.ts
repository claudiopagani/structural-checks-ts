import assert from "node:assert/strict";
import test from "node:test";

import {
  ALIGNMENT_STATE_COMPARISON_REPORT_SCHEMA_VERSION,
  AlignmentStateComparisonReportBuilder,
  type AlignmentStateComparisonReportBuilderBuildInput,
  type AlignmentStateComparisonReportBuilderComparisonResult,
  type AlignmentStateComparisonReportBuilderOptions,
} from "../dist/index.js";

type IsAny<T> = 0 extends 1 & T ? true : false;
type AssertFalse<T extends false> = T;
type BuilderDeclarationsAreStrict = [
  AssertFalse<IsAny<typeof ALIGNMENT_STATE_COMPARISON_REPORT_SCHEMA_VERSION>>,
  AssertFalse<IsAny<typeof AlignmentStateComparisonReportBuilder>>,
  AssertFalse<IsAny<AlignmentStateComparisonReportBuilderBuildInput>>,
  AssertFalse<IsAny<AlignmentStateComparisonReportBuilderComparisonResult>>,
  AssertFalse<IsAny<AlignmentStateComparisonReportBuilderOptions>>,
];

function useBuilderDeclarations(value: BuilderDeclarationsAreStrict | undefined): void {
  void value;
}

void test("alignment state-comparison report builder exposes strict typed consumers", () => {
  useBuilderDeclarations(undefined);

  const input: AlignmentStateComparisonReportBuilderBuildInput = {
    model: {
      id: "alignment-α",
      label: "Allineamento μ",
      units: { force: "kN", length: "m" },
      walls: [],
      openings: [],
    },
    comparisonResult: {
      outputs: { reading: { outcome: "accepted" } },
      warnings: [],
      assumptions: [],
      status: "ok",
    },
  };
  const options: AlignmentStateComparisonReportBuilderOptions = {
    applicationId: "typed-consumer",
  };
  const builder = new AlignmentStateComparisonReportBuilder(options);
  const report = builder.build(input);

  assert.equal(report.json.schemaVersion, ALIGNMENT_STATE_COMPARISON_REPORT_SCHEMA_VERSION);
  assert.equal(typeof report.markdown, "string");
});
