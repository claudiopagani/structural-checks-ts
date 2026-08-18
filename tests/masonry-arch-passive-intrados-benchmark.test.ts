import assert from "node:assert/strict";
import test from "node:test";

import {
  analyzeMasonryArchPath,
  createMasonryArch,
  type AnalyzeMasonryArchPathOptions,
  type ArchReinforcementInput,
  type MasonryDeformableInterfaceLawInput,
} from "structural-checks-ts-migration-workspace/applications/masonry-arches";

/**
 * Passive intrados tendon validation benchmark.
 *
 * Pinned configuration (span 10 m semicircular arch, 7 voussoirs, asymmetric left-half patch
 * load, friction coefficient 0.4, passive intrados tendon with zero initial force):
 *
 * - the tendon stays slack (T = 0) while the intrados path shortens under elastic joint closure;
 * - plastic sliding develops at the right springing joint around lambda = 0.475 and, under the
 *   default design policy, the path continues (local plasticity is not a global failure);
 * - the sliding-driven asymmetric mechanism lengthens the intrados path, the tendon activates by
 *   compatibility around lambda = 0.975 with a positive force, and redistribution lets the
 *   design state reach lambda = 1 with PASS;
 * - the same arch WITHOUT the tendon cannot reach lambda = 1 (INDETERMINATE at lambda ~ 0.958);
 * - opting into the strict policy (`designFailureEvents: ["plastic-sliding"]`) stops the design
 *   path at lambda = 0.475 before activation, documenting the policy boundary.
 *
 * No compressive strength is assigned to the interface law: compression failure is suppressed to
 * isolate the passive-tendon kinematics, so this benchmark is not a complete design benchmark.
 */

function deformable(): MasonryDeformableInterfaceLawInput {
  return {
    response: "deformable",
    normal: {
      type: "elastic-no-tension",
      elasticModulus: 1_000_000,
      characteristicLength: 0.5,
      integrationPointCount: 8,
    },
    tangential: {
      type: "elastic-coulomb",
      shearModulus: 400_000,
      characteristicLength: 0.5,
      frictionCoefficient: 0.4,
      cohesion: 0,
      flowRule: { type: "non-associated", dilationAngle: 0 },
    },
  };
}

const passiveIntradosTendon: ArchReinforcementInput = {
  id: "passive-intrados",
  side: "intrados",
  area: 0.001,
  elasticModulus: 200_000_000,
  initialForce: 0,
  yieldStrength: 450_000,
  tensileStrength: 550_000,
  topology: {
    type: "open",
    left: { type: "arch-anchor", station: 0 },
    right: { type: "arch-anchor", station: 1 },
    deviators: { type: "uniform-count", count: 1 },
  },
};

function benchmarkArch(withTendon: boolean) {
  return createMasonryArch({
    id: "passive-intrados-benchmark",
    units: { force: "kN", length: "m" },
    geometry: {
      kind: "simplified-symmetric",
      referenceCurve: "centerline",
      profile: { type: "circular" },
      span: 10,
      rise: 5,
      thickness: 1,
      outOfPlaneWidth: 1,
      voussoirCount: 7,
    },
    masonry: { unitWeight: 20 },
    interfaceLaw: deformable(),
    loads: [
      { id: "SW", type: "self-weight", loadCaseId: "G" },
      {
        id: "Q",
        type: "patch",
        loadCaseId: "Q",
        components: { x: 0, y: -20 },
        startStation: 0.05,
        endStation: 0.45,
      },
    ],
    reinforcements: withTendon ? [passiveIntradosTendon] : [],
  });
}

const designOptions: AnalyzeMasonryArchPathOptions = {
  units: { force: "kN", length: "m" },
  analysisObjective: "design-state-check",
  scalableLoadCaseIds: ["Q"],
  equilibriumTolerance: 1e-7,
  maxIterations: 50,
  maxSteps: 200,
};

function tendonStateOf(result: ReturnType<typeof analyzeMasonryArchPath>, stepNumber: number) {
  const step = result.outputs.steps.find((item) => item.step === stepNumber);
  assert.ok(step !== undefined, `expected a converged step ${stepNumber}`);
  const state = step.state.reinforcementState.find(
    (item) => item.reinforcementId === "passive-intrados",
  );
  assert.ok(state !== undefined, "expected the passive intrados tendon state");
  return state;
}

void test("A. a passive intrados tendon activates by compatibility before lambda one", () => {
  const result = analyzeMasonryArchPath(benchmarkArch(true), designOptions);
  const activation = result.outputs.events.find(
    (event) => event.kind === "passive-tendon-activated",
  );
  assert.ok(activation !== undefined, "passive-tendon-activated event expected");
  assert.ok(activation.lambda !== null);
  assert.ok(activation.lambda > 0, "activation must not occur at lambda zero");
  assert.ok(activation.lambda < 1, "activation must occur before the design state");
  assert.equal(activation.category, "observable-event");
  assert.deepEqual(activation.entityIds, ["passive-intrados"]);
  assert.equal(activation.step, 14);
  assert.equal(
    result.outputs.events.filter((event) => event.kind === "passive-tendon-activated").length,
    1,
    "exactly one activation, no slack/active oscillation",
  );
  assert.ok(
    result.outputs.events.every((event) => event.kind !== "tendon-slackened"),
    "the tendon never slackens after activation",
  );

  // The tendon is genuinely passive: zero assigned initial force and zero force while slack.
  const beforeActivation = tendonStateOf(result, activation.step - 1);
  assert.equal(beforeActivation.initialForce, 0);
  assert.equal(beforeActivation.force, 0);
  assert.equal(beforeActivation.state, "slack");
  assert.ok(beforeActivation.elongation < 0, "the intrados path shortens before activation");

  const atActivation = tendonStateOf(result, activation.step);
  assert.equal(atActivation.state, "active-passive");
  assert.ok(atActivation.force > 0, "tendon force is positive right after activation");
  assert.ok(atActivation.elongation > 0, "positive intrados-path elongation drives the force");
  assert.ok(
    atActivation.elongation > 1000 * atActivation.elongationTolerance,
    "elongation is far above the numerical zero tolerance",
  );
});

void test("B. the path continues with converged steps after activation", () => {
  const result = analyzeMasonryArchPath(benchmarkArch(true), designOptions);
  const activation = result.outputs.events.find(
    (event) => event.kind === "passive-tendon-activated",
  )!;
  const convergedAfter = result.outputs.steps.filter(
    (step) => step.stage === "scalable-loading" && step.step > activation.step!,
  );
  assert.ok(convergedAfter.length >= 1, "at least one converged scalable step after activation");
  for (const step of convergedAfter) {
    assert.equal(tendonStateOf(result, step.step).state, "active-passive");
    assert.ok(tendonStateOf(result, step.step).force > 0);
  }
  const finalState = tendonStateOf(result, result.outputs.steps.at(-1)!.step);
  assert.ok(finalState.force > tendonStateOf(result, activation.step!).force);
});

void test("C. the design state reaches lambda one with PASS", () => {
  const result = analyzeMasonryArchPath(benchmarkArch(true), designOptions);
  assert.equal(result.outputs.convergenceInfo.termination, "design-state-reached");
  assert.equal(result.outputs.convergenceInfo.converged, true);
  assert.equal(result.outputs.control.type, "arc-length");
  assert.equal(result.outputs.analysis.lambda.currentValue, 1);
  assert.equal(result.outputs.engineeringAssessment?.status, "PASS");
  assert.equal(result.status, "ok");
  assert.equal(result.outputs.engineeringAssessment?.requiredLambda, 1);
  assert.equal(result.outputs.engineeringAssessment?.lambda, 1);
  assert.deepEqual(result.outputs.engineeringAssessment?.failedCriteria, []);
  assert.equal(result.outputs.engineeringAssessment?.failureMode, null);

  const finalState = tendonStateOf(result, result.outputs.steps.at(-1)!.step);
  assert.equal(finalState.state, "active-passive");
  assert.ok(finalState.force > 0);
  assert.ok(finalState.elongation > 0);
  assert.equal(finalState.initialForce, 0);
  assert.equal(finalState.topology, "open");
  assert.ok(
    Math.abs(finalState.effectiveElasticLength - finalState.referenceLength) <=
      1e-12 * finalState.referenceLength,
    "the complete tendon path is the elastic member",
  );
  assert.ok(
    result.outputs.analysis.lambda.excludedQuantities.includes(
      "passive-tendon-compatibility-force",
    ),
  );
});

void test("D. tendon activation is an observable event, never a failed criterion", () => {
  const result = analyzeMasonryArchPath(benchmarkArch(true), designOptions);
  const activation = result.outputs.events.find(
    (event) => event.kind === "passive-tendon-activated",
  )!;
  assert.equal(activation.category, "observable-event");
  const assessment = result.outputs.engineeringAssessment!;
  // Activation is not a criterion kind at the type level, so the compiled taxonomy already
  // guarantees it can never appear in failedCriteria; the runtime assertion here is that the
  // design assessment stays empty while the sliding physical limit remains active.
  assert.ok(result.outputs.events.some((event) => event.kind === "plastic-sliding"));
  assert.deepEqual(assessment.failedCriteria, []);
});

void test("E. without the tendon the same arch cannot reach lambda one", () => {
  const result = analyzeMasonryArchPath(benchmarkArch(false), designOptions);
  assert.equal(result.outputs.engineeringAssessment?.status, "INDETERMINATE");
  assert.equal(result.status, "failed");
  assert.ok(result.outputs.analysis.lambda.currentValue! < 1);
  assert.equal(result.outputs.convergenceInfo.termination, "minimum-step");
  assert.ok(
    result.outputs.convergenceInfo.completedSteps >
      analyzeMasonryArchPath(benchmarkArch(true), designOptions).outputs.convergenceInfo
        .completedSteps,
    "the unreinforced run struggles far more than the reinforced one",
  );
});

void test("F. the strict opt-in policy stops at plastic sliding before activation", () => {
  const result = analyzeMasonryArchPath(benchmarkArch(true), {
    ...designOptions,
    designFailureEvents: ["plastic-sliding"],
  });
  assert.equal(result.outputs.engineeringAssessment?.status, "FAIL");
  assert.equal(result.status, "not-verified");
  assert.equal(result.outputs.engineeringAssessment?.failureMode, "sliding");
  assert.equal(result.outputs.convergenceInfo.termination, "engineering-limit");
  assert.ok(result.outputs.analysis.lambda.currentValue! < 1);
  const criteria = result.outputs.engineeringAssessment?.failedCriteria ?? [];
  assert.equal(criteria.length, 1);
  assert.equal(criteria[0]?.kind, "plastic-sliding");
  assert.deepEqual(criteria[0]?.entityIds, ["J-007"]);
  assert.ok(
    result.outputs.events.every((event) => event.kind !== "passive-tendon-activated"),
    "the strict policy stops the path before the tendon activates",
  );
});
