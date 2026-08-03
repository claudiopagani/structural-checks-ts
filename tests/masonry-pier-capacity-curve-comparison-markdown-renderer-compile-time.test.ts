import assert from "node:assert/strict";
import test from "node:test";

import {
  MasonryPierCapacityCurveComparisonMarkdownRenderer,
  type MasonryPierCapacityCurveComparisonReport,
} from "../dist/index.js";

type IsAny<T> = 0 extends 1 & T ? true : false;
type AssertFalse<T extends false> = T;
type RendererDeclarationsAreStrict = [
  AssertFalse<IsAny<typeof MasonryPierCapacityCurveComparisonMarkdownRenderer>>,
  AssertFalse<IsAny<MasonryPierCapacityCurveComparisonReport>>,
];

function useRendererDeclarations(value: RendererDeclarationsAreStrict | undefined): void {
  void value;
}

void test("masonry pier capacity-curve renderer exposes a strict typed consumer contract", () => {
  useRendererDeclarations(undefined);

  const report: MasonryPierCapacityCurveComparisonReport = {
    title: "Confronto curva di capacita μ",
    units: { force: "kN", length: "m" },
    model: { id: "alignment-α", label: "Allineamento μ" },
    pier: { id: "pier-1", wallId: "wall-a", topRotation: "free" },
    comparison: { metrics: [], sampledCurvePoints: [] },
  };
  const markdown = new MasonryPierCapacityCurveComparisonMarkdownRenderer().render(report);

  assert.equal(typeof markdown, "string");
  assert.ok(markdown.includes("# Confronto curva di capacita μ"));
  assert.ok(markdown.includes("## Sintesi Curve"));
});
