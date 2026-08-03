import assert from "node:assert/strict";
import test from "node:test";

import {
  SteelRingFrame2DBuilder,
  type SteelRingFrame2DBuilderResult,
} from "../dist/applications/steel-frames/analysis/SteelRingFrame2DBuilder.js";
import { SteelRingFrame2DBuilder as RootSteelRingFrame2DBuilder } from "../dist/index.js";

type IsAny<T> = 0 extends 1 & T ? true : false;
type AssertFalse<T extends false> = T;
type SteelRingFrame2DBuilderIsStrict = AssertFalse<IsAny<typeof SteelRingFrame2DBuilder>>;

function useBuilder(): SteelRingFrame2DBuilderResult {
  return new SteelRingFrame2DBuilder().build({
    model: {
      id: "builder-\u00ce\u00b1",
      units: { force: "kN", length: "m" },
      geometry: { clearWidth: 0.9, clearHeight: 2.1 },
      memberSections: { columns: "IPE200", topBeam: "IPE200", bottomBeam: "IPE200" },
      baseCondition: "fixed-base",
      includeBottomBeam: true,
    },
  });
}

void test("SteelRingFrame2DBuilder exposes strict typed consumers", () => {
  const result = useBuilder();
  const strictTypeProof: SteelRingFrame2DBuilderIsStrict = false;

  assert.equal(strictTypeProof, false);
  assert.equal(RootSteelRingFrame2DBuilder, SteelRingFrame2DBuilder);
  assert.equal(result.nodes.length, 4);
  assert.equal(result.elements.length, 4);
  assert.equal(result.supports.length, 2);
  assert.equal(result.snapshot.metadata.controlDof, "ux");
  assert.equal(result.snapshot.metadata.sourceModelId, "builder-\u00ce\u00b1");
  assert.equal(
    result.referenceLoadVector.reduce((sum, value) => sum + value, 0),
    1,
  );
});
