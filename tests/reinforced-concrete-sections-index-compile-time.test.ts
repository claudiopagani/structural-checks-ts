import assert from "node:assert/strict";
import test from "node:test";

import {
  RCBiaxialDomainBuilder,
  RCMomentCurvatureAnalyzer,
  RCSectionStateIntegrator,
  RCServiceStressSolver,
  RCUltimateSectionSolver,
  RCUniaxialDomainBuilder,
  ReinforcedConcreteBeamDetailingVerification,
  ReinforcedConcreteBeamVerification,
  ReinforcedConcreteSectionApplication,
  ReinforcedConcreteSectionModel,
  ReinforcedConcreteSectionVerification,
  ReinforcedConcreteServiceabilityVerification,
  ReinforcedConcreteShearVerification,
  ReinforcedConcreteTorsionVerification,
  SectionFiberDiscretizer,
  StrainField,
} from "../dist/index.js";

type IsAny<T> = 0 extends 1 & T ? true : false;
type AssertFalse<T extends false> = T;
type AnalysisDeclarationsAreStrict = [
  AssertFalse<IsAny<typeof ReinforcedConcreteSectionApplication>>,
  AssertFalse<IsAny<typeof ReinforcedConcreteBeamVerification>>,
  AssertFalse<IsAny<typeof ReinforcedConcreteBeamDetailingVerification>>,
  AssertFalse<IsAny<typeof ReinforcedConcreteShearVerification>>,
  AssertFalse<IsAny<typeof ReinforcedConcreteTorsionVerification>>,
  AssertFalse<IsAny<typeof ReinforcedConcreteServiceabilityVerification>>,
  AssertFalse<IsAny<typeof ReinforcedConcreteSectionVerification>>,
  AssertFalse<IsAny<typeof ReinforcedConcreteSectionModel>>,
  AssertFalse<IsAny<typeof RCBiaxialDomainBuilder>>,
  AssertFalse<IsAny<typeof RCMomentCurvatureAnalyzer>>,
  AssertFalse<IsAny<typeof RCServiceStressSolver>>,
  AssertFalse<IsAny<typeof RCUltimateSectionSolver>>,
  AssertFalse<IsAny<typeof RCSectionStateIntegrator>>,
  AssertFalse<IsAny<typeof RCUniaxialDomainBuilder>>,
  AssertFalse<IsAny<typeof SectionFiberDiscretizer>>,
  AssertFalse<IsAny<typeof StrainField>>,
];

function useAnalysisDeclarations(value: AnalysisDeclarationsAreStrict | undefined): void {
  void value;
}

void test("reinforced concrete sections index exposes strict typed consumers", () => {
  useAnalysisDeclarations(undefined);

  assert.equal(typeof ReinforcedConcreteSectionApplication, "function");
  assert.equal(typeof ReinforcedConcreteBeamVerification, "function");
  assert.equal(typeof ReinforcedConcreteBeamDetailingVerification, "function");
  assert.equal(typeof ReinforcedConcreteShearVerification, "function");
  assert.equal(typeof ReinforcedConcreteTorsionVerification, "function");
  assert.equal(typeof ReinforcedConcreteServiceabilityVerification, "function");
  assert.equal(typeof ReinforcedConcreteSectionVerification, "function");
  assert.equal(typeof ReinforcedConcreteSectionModel, "function");
  assert.equal(typeof RCBiaxialDomainBuilder, "function");
  assert.equal(typeof RCMomentCurvatureAnalyzer, "function");
  assert.equal(typeof RCServiceStressSolver, "function");
  assert.equal(typeof RCUltimateSectionSolver, "function");
  assert.equal(typeof RCSectionStateIntegrator, "function");
  assert.equal(typeof RCUniaxialDomainBuilder, "function");
  assert.equal(typeof SectionFiberDiscretizer, "function");
  assert.equal(typeof StrainField, "function");
});
