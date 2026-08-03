import assert from "node:assert/strict";
import test from "node:test";

import {
  createMasonryPierCapacityCurveComparisonReportArtifacts,
  type CreateMasonryPierCapacityCurveComparisonReportArtifactsOptions,
  type MasonryPierCapacityCurveComparisonReportArtifactInput,
} from "../dist/index.js";

type IsAny<T> = 0 extends 1 & T ? true : false;
type AssertFalse<T extends false> = T;
type ArtifactDeclarationsAreStrict = [
  AssertFalse<IsAny<typeof createMasonryPierCapacityCurveComparisonReportArtifacts>>,
  AssertFalse<IsAny<CreateMasonryPierCapacityCurveComparisonReportArtifactsOptions>>,
  AssertFalse<IsAny<MasonryPierCapacityCurveComparisonReportArtifactInput>>,
];

function useArtifactDeclarations(value: ArtifactDeclarationsAreStrict | undefined): void {
  void value;
}

void test("masonry pier capacity-curve artifacts expose a strict typed consumer contract", () => {
  useArtifactDeclarations(undefined);

  const report: MasonryPierCapacityCurveComparisonReportArtifactInput = {
    json: {
      id: "alignment-α-report",
      schemaVersion: "masonry-wall-openings-pier-capacity-comparison-report/v1",
      title: "Confronto μ",
    },
    markdown: "# Confronto μ",
  };
  const options: CreateMasonryPierCapacityCurveComparisonReportArtifactsOptions = {
    baseName: "report-α",
    jsonSpacing: 2,
  };
  const artifacts = createMasonryPierCapacityCurveComparisonReportArtifacts(report, options);

  assert.equal(artifacts.length, 2);
  assert.equal(artifacts[0]?.format, "json");
  assert.equal(artifacts[1]?.format, "markdown");
});
