import assert from "node:assert/strict";
import test from "node:test";

import {
  RCBiaxialDomainBuilder,
  RCMomentCurvatureAnalyzer,
  RCSectionStateIntegrator,
  RCServiceStressSolver,
  RCUltimateSectionSolver,
  RCUniaxialDomainBuilder,
  SectionFiberDiscretizer,
  StrainField,
} from "../dist/index.js";

type IsAny<T> = 0 extends 1 & T ? true : false;
type AssertFalse<T extends false> = T;
type AnalysisIndexDeclarationsAreStrict = [
  AssertFalse<IsAny<typeof SectionFiberDiscretizer>>,
  AssertFalse<IsAny<typeof StrainField>>,
  AssertFalse<IsAny<typeof RCServiceStressSolver>>,
  AssertFalse<IsAny<typeof RCSectionStateIntegrator>>,
  AssertFalse<IsAny<typeof RCBiaxialDomainBuilder>>,
  AssertFalse<IsAny<typeof RCMomentCurvatureAnalyzer>>,
  AssertFalse<IsAny<typeof RCUniaxialDomainBuilder>>,
  AssertFalse<IsAny<typeof RCUltimateSectionSolver>>,
];

function useAnalysisIndexDeclarations(value: AnalysisIndexDeclarationsAreStrict | undefined): void {
  void value;
}

void test("reinforced concrete section analysis index exposes strict typed consumers", () => {
  useAnalysisIndexDeclarations(undefined);

  assert.equal(typeof SectionFiberDiscretizer, "function");
  assert.equal(typeof StrainField, "function");
  assert.equal(typeof RCServiceStressSolver, "function");
  assert.equal(typeof RCSectionStateIntegrator, "function");
  assert.equal(typeof RCBiaxialDomainBuilder, "function");
  assert.equal(typeof RCMomentCurvatureAnalyzer, "function");
  assert.equal(typeof RCUniaxialDomainBuilder, "function");
  assert.equal(typeof RCUltimateSectionSolver, "function");
});
