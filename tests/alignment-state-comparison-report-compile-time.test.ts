import assert from "node:assert/strict";
import test from "node:test";

import {
  AlignmentStateComparisonMarkdownRenderer,
  createAlignmentStateComparisonReportArtifacts,
  type AlignmentStateComparisonReport,
  type CreateAlignmentStateComparisonReportArtifactsOptions,
} from "../dist/index.js";

type IsAny<T> = 0 extends 1 & T ? true : false;
type AssertFalse<T extends false> = T;
type ReportDeclarationsAreStrict = [
  AssertFalse<IsAny<typeof AlignmentStateComparisonMarkdownRenderer>>,
  AssertFalse<IsAny<typeof createAlignmentStateComparisonReportArtifacts>>,
  AssertFalse<IsAny<AlignmentStateComparisonReport>>,
  AssertFalse<IsAny<CreateAlignmentStateComparisonReportArtifactsOptions>>,
];

function useReportDeclarations(value: ReportDeclarationsAreStrict | undefined): void {
  void value;
}

void test("alignment state-comparison report utilities expose strict typed consumers", () => {
  useReportDeclarations(undefined);

  const report: AlignmentStateComparisonReport = {
    title: "Confronto ante/post",
    units: { force: "kN", length: "m" },
    model: { id: "allineamento-α", label: "Allineamento μ" },
  };
  const markdown = new AlignmentStateComparisonMarkdownRenderer().render(report);
  const artifacts = createAlignmentStateComparisonReportArtifacts({
    json: { id: "report-α", schemaVersion: "1.0.0", title: report.title },
    markdown,
  });

  assert.equal(typeof markdown, "string");
  assert.equal(artifacts.length, 2);
  assert.equal(artifacts[0]?.format, "json");
  assert.equal(artifacts[1]?.format, "markdown");
});
