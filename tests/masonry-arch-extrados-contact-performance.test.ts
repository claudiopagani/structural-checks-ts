import assert from "node:assert/strict";
import test from "node:test";

import { analyzeMasonryArchVerification } from "structural-checks-ts/applications/masonry-arches";

import {
  createExtradosContactPerformanceModel,
  EXTRADOS_CONTACT_PERFORMANCE_OPTIONS,
} from "../benchmarks/masonry-arches/extrados-contact-performance.ts";

function closeTo(actual: number, expected: number, tolerance: number, label: string): void {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${label}: expected ${expected} +/- ${tolerance}, received ${actual}.`,
  );
}

void test("OCFEM-equivalent U/P/A extrados fixtures complete the full verification path", () => {
  for (const caseId of ["U", "P", "A"] as const) {
    const result = analyzeMasonryArchVerification(
      createExtradosContactPerformanceModel(caseId),
      EXTRADOS_CONTACT_PERFORMANCE_OPTIONS,
    );
    assert.equal(result.outputs.engineeringAssessment.status, "PASS", caseId);
    assert.equal(result.outputs.fixedState.status, "PASS", caseId);
    assert.equal(result.outputs.engineeringAssessment.lambda, 1, caseId);
    assert.equal(result.outputs.lambdaVerificationLimit, null, caseId);
    assert.equal(result.outputs.failureMode, null, caseId);
    assert.deepEqual(result.outputs.engineeringAssessment.failedCriteria, [], caseId);
    const path = result.outputs.subAnalyses.path?.outputs;
    assert.notEqual(path, undefined, caseId);
    const final = path!.steps.at(-1)!.state;
    assert.ok(final.equilibrium.maximumNormalizedBlockResidual <= 1e-8, caseId);
    if (caseId === "U") {
      assert.equal(final.reinforcementState.length, 0);
    } else if (caseId === "P") {
      assert.equal(final.reinforcementState[0]!.state, "slack");
      assert.equal(final.reinforcementState[0]!.force, 0);
    }
  }
});

void test("active extrados fixture preserves the independently confirmed equilibrium oracle", () => {
  const result = analyzeMasonryArchVerification(
    createExtradosContactPerformanceModel("A"),
    EXTRADOS_CONTACT_PERFORMANCE_OPTIONS,
  );
  const final = result.outputs.subAnalyses.path!.outputs.steps.at(-1)!.state;
  const tendon = final.reinforcementState[0]!;
  closeTo(tendon.force, 19.54974285114, 2e-9, "tendon force");
  closeTo(tendon.referenceLength, 5.64063190486, 2e-11, "reference tendon length");
  closeTo(tendon.currentLength, 5.64050491812, 2e-11, "current tendon length");
  closeTo(
    final.equilibrium.maximumNormalizedBlockResidual,
    3.5266709883894824e-10,
    2e-10,
    "normalized equilibrium residual",
  );

  const crown = final.deformedConfiguration[15]!;
  assert.equal(crown.blockId, "V-015");
  closeTo(crown.translation.x, 0.000009340092963848364, 2e-10, "crown displacement x");
  closeTo(crown.translation.y, -0.00009857832116115632, 2e-10, "crown displacement y");
  closeTo(crown.rotation, 0.000017173804630132325, 2e-10, "crown rotation");

  closeTo(final.reactions.left.force.x, 21.373689716516868, 2e-6, "left reaction x");
  closeTo(final.reactions.left.force.y, 33.600002452502835, 2e-6, "left reaction y");
  closeTo(final.reactions.left.moment, 3.221337534656198, 2e-6, "left reaction moment");
  closeTo(final.reactions.right.force.x, -21.37368971551392, 2e-6, "right reaction x");
  closeTo(final.reactions.right.force.y, 31.66953317512136, 2e-6, "right reaction y");
  closeTo(final.reactions.right.moment, -2.54468879022067, 2e-6, "right reaction moment");

  const boundaries = tendon.contactBoundary!;
  assert.equal(boundaries.reference!.start.kind, "arch-anchor");
  assert.equal(boundaries.reference!.end.kind, "arch-anchor");
  assert.equal(boundaries.current!.start.kind, "arch-anchor");
  assert.equal(boundaries.current!.end.kind, "arch-anchor");
  assert.equal(boundaries.reference!.start.normalizedSideArcStation, 0);
  assert.equal(boundaries.reference!.end.normalizedSideArcStation, 1);
  assert.equal(boundaries.current!.start.normalizedSideArcStation, 0);
  assert.equal(boundaries.current!.end.normalizedSideArcStation, 1);
  closeTo(
    boundaries.current!.start.point.x,
    -2.2696627440895547,
    2e-8,
    "left current contact boundary x",
  );
  closeTo(
    boundaries.current!.end.point.x,
    2.2696637632227863,
    2e-8,
    "right current contact boundary x",
  );
});
