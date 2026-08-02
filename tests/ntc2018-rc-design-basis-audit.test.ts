// Mechanical TypeScript migration from strutture-js 6f33baead8b88166c4b2cf94af41763412e3c751.

import assert from "node:assert/strict";
import test from "node:test";

import { auditNTC2018RcDesignBasis, getNTC2018RcBuildingCoverage } from "../dist/index.js";

const DESIGN_BASIS = Object.freeze({
  behavior: "cd-b",
  structuralType: "frame",
  regularity: {
    plan: "regular",
    elevation: "regular",
  },
  analysisMethod: "linear-dynamic",
  analysisParameters: {
    t1: 0.6,
    tc: 0.4,
    td: 2,
  },
  frameStoreyCount: 3,
  frameBayCount: 2,
});

void test("RC design-basis audit separates choice consistency from conformity", () => {
  const result = auditNTC2018RcDesignBasis(DESIGN_BASIS);

  assert.equal(result.status, "ok");
  assert.ok(Math.abs(result.outputs.behavior.q - 3.9) < 1e-12);
  assert.equal(result.outputs.normativeAssurance.conformityClaimed, false);
  assert.equal(result.outputs.normativeAssurance.traceabilityComplete, false);
  assert.equal(result.metadata.normativeConformityClaimed, false);
  const references = result.metadata["normativeReferences"];
  assert.ok(Array.isArray(references));
  assert.ok(references.length >= 3);
});

void test("RC design-basis audit rejects an inconsistent declared q", () => {
  const result = auditNTC2018RcDesignBasis({
    ...DESIGN_BASIS,
    q: 3,
  });

  assert.equal(result.status, "not-verified");
  const check = result.checks.find((item) => item.id === "rc-design-basis-behavior-factor");
  assert.ok(check);
  assert.equal(check.ok, false);
});

void test("RC coverage distinguishes implementation from normative traceability", () => {
  const coverage = getNTC2018RcBuildingCoverage();

  assert.equal(coverage.declaredScopeImplementationCoverageComplete, true);
  assert.equal(coverage.normativeTraceabilityComplete, false);
  assert.equal(coverage.normativeConformityClaimed, false);
  assert.ok(coverage.capabilities.every((item) => item.normativeTraceability?.status));
});
