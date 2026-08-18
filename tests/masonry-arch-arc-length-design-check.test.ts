import assert from "node:assert/strict";
import test from "node:test";

import {
  analyzeMasonryArchPath,
  createMasonryArch,
  type AnalyzeMasonryArchPathOptions,
  type ArchDeviceCapacityInput,
  type ArchReinforcementInput,
  type BondedLayerReinforcementInput,
  type MasonryDeformableInterfaceLawInput,
} from "structural-checks-ts-migration-workspace/applications/masonry-arches";
// Internal numerical-safety seam (not part of the public package exports): the tangent-seed
// helper used by the fixed-lambda corrector, tested directly for exception safety.
import {
  masonryArchTangentSeedAtLambda,
  type SolverContext,
  type SystemEvaluation,
} from "../dist/applications/masonry-arches/analyzeMasonryArchPath.js";
import { NonlinearEquilibriumContinuationSolver } from "../dist/domain/solvers/continuation/index.js";

function deformable(
  overrides: {
    readonly frictionCoefficient?: number;
    readonly compressiveStrength?: number;
    readonly postCrushingBehavior?: "perfectly-plastic" | "stop-at-onset";
  } = {},
): MasonryDeformableInterfaceLawInput {
  return {
    response: "deformable",
    normal: {
      type: "elastic-no-tension",
      elasticModulus: 1_000_000,
      characteristicLength: 0.5,
      integrationPointCount: 8,
      ...(overrides.compressiveStrength === undefined
        ? {}
        : {
            compressiveStrength: overrides.compressiveStrength,
            postCrushingBehavior: overrides.postCrushingBehavior ?? "stop-at-onset",
          }),
    },
    tangential: {
      type: "elastic-coulomb",
      shearModulus: 400_000,
      characteristicLength: 0.5,
      frictionCoefficient: overrides.frictionCoefficient ?? 0.4,
      cohesion: 0,
      flowRule: { type: "non-associated", dilationAngle: 0 },
    },
  };
}

interface ArchOverrides {
  readonly voussoirs?: number;
  readonly patchLoad?: number;
  readonly crownPoint?: { readonly x: number; readonly y: number };
  readonly frictionCoefficient?: number;
  readonly compressiveStrength?: number;
  readonly postCrushingBehavior?: "perfectly-plastic" | "stop-at-onset";
  readonly reinforcements?: readonly ArchReinforcementInput[];
  readonly bondedLayers?: readonly BondedLayerReinforcementInput[];
}

function arch(overrides: ArchOverrides = {}) {
  return createMasonryArch({
    id: "arc-length-design-check",
    units: { force: "kN", length: "m" },
    geometry: {
      kind: "simplified-symmetric",
      referenceCurve: "centerline",
      profile: { type: "circular" },
      span: 10,
      rise: 5,
      thickness: 1,
      outOfPlaneWidth: 1,
      voussoirCount: overrides.voussoirs ?? 7,
    },
    masonry: { unitWeight: 20 },
    interfaceLaw: deformable({
      ...(overrides.frictionCoefficient === undefined
        ? {}
        : { frictionCoefficient: overrides.frictionCoefficient }),
      ...(overrides.compressiveStrength === undefined
        ? {}
        : {
            compressiveStrength: overrides.compressiveStrength,
            postCrushingBehavior: overrides.postCrushingBehavior ?? "stop-at-onset",
          }),
    }),
    loads: [
      { id: "SW", type: "self-weight", loadCaseId: "G" },
      ...(overrides.crownPoint !== undefined
        ? [
            {
              id: "Q",
              type: "point" as const,
              loadCaseId: "Q",
              station: 0.5,
              targetVoussoirId: overrides.voussoirs === 9 ? "V-004" : "V-003",
              force: overrides.crownPoint,
            },
          ]
        : [
            {
              id: "Q",
              type: "patch" as const,
              loadCaseId: "Q",
              components: { x: 0, y: overrides.patchLoad ?? -20 },
              startStation: 0.05,
              endStation: 0.45,
            },
          ]),
    ],
    reinforcements: overrides.reinforcements ?? [],
    bondedLayers: overrides.bondedLayers ?? [],
  });
}

const designOptions: Omit<AnalyzeMasonryArchPathOptions, "control"> = {
  units: { force: "kN", length: "m" },
  analysisObjective: "design-state-check",
  scalableLoadCaseIds: ["Q"],
  equilibriumTolerance: 1e-7,
  maxIterations: 80,
  maxSteps: 400,
};

const INTRA = { side: "intrados" } as const;

function passiveTendon(
  overrides: { readonly deviatorCapacity?: ArchDeviceCapacityInput } = {},
): ArchReinforcementInput {
  return {
    id: "P",
    ...INTRA,
    area: 0.001,
    elasticModulus: 200_000_000,
    initialForce: 0,
    yieldStrength: 450_000,
    tensileStrength: 550_000,
    topology: {
      type: "open",
      left: { type: "arch-anchor", station: 0 },
      right: { type: "arch-anchor", station: 1 },
      deviators:
        overrides.deviatorCapacity === undefined
          ? { type: "uniform-count", count: 1 }
          : {
              type: "uniform-count",
              count: 1,
              connectors: { capacity: overrides.deviatorCapacity },
            },
    },
  };
}

/** Passive tendon without assigned strength limits (for branch-topology fixtures). */
function barePassiveTendon(): ArchReinforcementInput {
  return {
    id: "P",
    ...INTRA,
    area: 0.001,
    elasticModulus: 200_000_000,
    initialForce: 0,
    topology: {
      type: "open",
      left: { type: "arch-anchor", station: 0 },
      right: { type: "arch-anchor", station: 1 },
      deviators: { type: "uniform-count", count: 1 },
    },
  };
}

/** Passive tendon with a small tensile strength that ruptures during the scalable phase. */
function ruptureTendon(): ArchReinforcementInput {
  return {
    id: "P",
    ...INTRA,
    area: 0.001,
    elasticModulus: 200_000_000,
    initialForce: 0,
    tensileStrength: 0.5,
    topology: {
      type: "open",
      left: { type: "arch-anchor", station: 0 },
      right: { type: "arch-anchor", station: 1 },
      deviators: { type: "uniform-count", count: 1 },
    },
  };
}

void test("5. local sliding before lambda one redistributes and the design passes", () => {
  const result = analyzeMasonryArchPath(arch({ reinforcements: [passiveTendon()] }), designOptions);
  assert.equal(result.outputs.fixedState.status, "PASS");
  assert.equal(result.outputs.engineeringAssessment?.status, "PASS");
  assert.ok(
    result.outputs.events.some((event) => event.kind === "plastic-sliding"),
    "plastic sliding develops before the design state",
  );
  assert.ok(
    result.outputs.capacity.lambdaFirstLimit !== null &&
      result.outputs.capacity.lambdaFirstLimit < 1,
    "the first local limit occurs before lambda one",
  );
  // The first local limit is NOT the verification limit: redistribution let the design pass.
  assert.equal(result.outputs.capacity.lambdaVerificationLimit, null);
});

void test("6. perfectly-plastic compression before lambda one redistributes and passes", () => {
  const result = analyzeMasonryArchPath(
    arch({
      voussoirs: 9,
      crownPoint: { x: 0, y: -10 },
      frictionCoefficient: 0.4,
      compressiveStrength: 310,
      postCrushingBehavior: "perfectly-plastic",
    }),
    designOptions,
  );
  const firstCrushing = result.outputs.events.find((event) => event.kind === "crushing");
  assert.ok(firstCrushing !== undefined);
  assert.ok(firstCrushing.lambda !== null && firstCrushing.lambda > 0 && firstCrushing.lambda < 1);
  assert.equal(result.outputs.engineeringAssessment?.status, "PASS");
  assert.deepEqual(result.outputs.engineeringAssessment?.failedCriteria, []);
  assert.equal(result.outputs.capacity.lambdaVerificationLimit, null);
});

void test("7. stop-at-onset crushing before lambda one fails with the verification limit", () => {
  const result = analyzeMasonryArchPath(
    arch({
      voussoirs: 9,
      crownPoint: { x: 0, y: -10 },
      frictionCoefficient: 0.5,
      compressiveStrength: 330,
      postCrushingBehavior: "stop-at-onset",
    }),
    designOptions,
  );
  assert.equal(result.outputs.engineeringAssessment?.status, "FAIL");
  assert.equal(result.outputs.engineeringAssessment?.failureMode, "masonry-crushing");
  assert.ok(result.outputs.capacity.lambdaVerificationLimit !== null);
  assert.ok(result.outputs.capacity.lambdaVerificationLimit < 1);
  assert.equal(
    result.outputs.significantSteps.verificationLimit,
    result.outputs.capacity.steps.verificationLimit,
  );
  const verificationStep = result.outputs.steps.find(
    (step) => step.step === result.outputs.significantSteps.verificationLimit,
  );
  assert.ok(verificationStep !== undefined, "the verification-limit state is recoverable");
});

void test("8. reinforcement rupture before lambda one fails with the verification limit", () => {
  const result = analyzeMasonryArchPath(
    arch({
      reinforcements: [ruptureTendon()],
    }),
    designOptions,
  );
  assert.equal(result.outputs.engineeringAssessment?.status, "FAIL");
  assert.equal(result.outputs.engineeringAssessment?.failureMode, "reinforcement-failure");
  assert.ok(
    result.outputs.engineeringAssessment.failedCriteria.some(
      (item) => item.kind === "reinforcement-rupture",
    ),
  );
  assert.ok(result.outputs.capacity.lambdaVerificationLimit !== null);
  assert.ok(result.outputs.capacity.lambdaVerificationLimit < 1);
});

void test("9. anchor capacity reached before lambda one fails with the verification limit", () => {
  const result = analyzeMasonryArchPath(
    arch({
      reinforcements: [
        passiveTendon({
          deviatorCapacity: { resultantResistance: 0.01, interactionRule: "independent" },
        }),
      ],
    }),
    designOptions,
  );
  assert.equal(result.outputs.engineeringAssessment?.status, "FAIL");
  assert.ok(
    result.outputs.engineeringAssessment.failedCriteria.some(
      (item) => item.kind === "anchor-capacity-reached",
    ),
  );
  assert.ok(result.outputs.capacity.lambdaVerificationLimit !== null);
  assert.ok(result.outputs.capacity.lambdaVerificationLimit < 1);
});

void test("10. bonded layers stay static-admissibility quantities and never fabricate a path failure", () => {
  // Bonded layers exert no force in the deformable path equilibrium: their per-step state is the
  // minimum-required static recovery of the converged interface resultants against the masonry
  // limit domain. With unbounded compression strength the recovered minimum is zero, so the layer
  // reports inactive states and the design passes without any bonded-layer event.
  const result = analyzeMasonryArchPath(
    arch({
      voussoirs: 9,
      crownPoint: { x: 0, y: -10 },
      frictionCoefficient: 0.5,
      bondedLayers: [
        {
          id: "FRCM",
          family: "frcm",
          ...INTRA,
          area: 1e-6,
          elasticModulus: 100_000_000,
          tensileStrength: 30_000,
          startStation: 0,
          endStation: 1,
        },
      ],
    }),
    designOptions,
  );
  assert.equal(result.outputs.engineeringAssessment?.status, "PASS");
  assert.ok(
    result.outputs.events.every((event) => event.kind !== "bonded-layer-capacity-reached"),
    "no fabricated bonded-layer failure appears",
  );
  const finalLayer = result.outputs.steps.at(-1)!.state.bondedLayerState[0]!;
  assert.equal(finalLayer.analysisMeaning, "minimum-required-static-admissibility");
  assert.equal(finalLayer.interfaces.length, 10);
  for (const item of finalLayer.interfaces) {
    assert.equal(item.state, "inactive");
    assert.equal(item.force, 0);
    assert.equal(item.capacity, finalLayer.tensileCapacity);
  }
});

void test("11. certified global limit point below lambda one -> instability FAIL", () => {
  const result = analyzeMasonryArchPath(
    arch({
      voussoirs: 9,
      crownPoint: { x: 0, y: 200 },
      frictionCoefficient: 0.4,
      reinforcements: [barePassiveTendon()],
    }),
    designOptions,
  );
  assert.equal(result.outputs.convergenceInfo.termination, "global-limit-point");
  assert.equal(result.outputs.engineeringAssessment?.status, "FAIL");
  assert.equal(result.outputs.engineeringAssessment?.failureMode, "instability");
  const limitPoint = result.outputs.convergenceInfo.verifiedLimitPoint;
  assert.ok(limitPoint !== null);
  assert.equal(limitPoint.certified, true);
  // Positive branch-turning evidence only: two distinct converged states, opposite-signed
  // load increments, and the certified lambda is the refined rising-side maximum.
  assert.equal(limitPoint.detection, "branch-turning");
  assert.ok(limitPoint.risingSideStep !== limitPoint.descendingSideStep);
  const risingStep = result.outputs.steps.find((step) => step.step === limitPoint.risingSideStep);
  const descendingStep = result.outputs.steps.find(
    (step) => step.step === limitPoint.descendingSideStep,
  );
  assert.ok(risingStep !== undefined && descendingStep !== undefined);
  assert.ok(risingStep.stage === "scalable-loading");
  assert.ok(descendingStep.stage === "scalable-loading");
  assert.ok(Math.abs(risingStep.state.lambda - limitPoint.risingSideLambda) <= 1e-12);
  assert.ok(Math.abs(descendingStep.state.lambda - limitPoint.descendingSideLambda) <= 1e-12);
  assert.ok(limitPoint.descendingSideLambda < limitPoint.risingSideLambda);
  assert.ok(limitPoint.lambda >= limitPoint.risingSideLambda - 1e-12);
  // No fake lambda-interval bracket is published for a certified turning point.
  assert.equal(result.outputs.convergenceInfo.lambdaBracket, null);
  assert.ok(result.outputs.capacity.lambdaVerificationLimit !== null);
  assert.ok(result.outputs.capacity.lambdaVerificationLimit < 1);
  assert.equal(result.outputs.capacity.lambdaVerificationLimit, limitPoint.lambda);
  assert.equal(result.outputs.failureMode, "instability");
  assert.ok(result.outputs.events.some((event) => event.kind === "equilibrium-limit-point"));
  // J: internal final-state coherence: q, lambda, committedStates, finalEvaluation, the last
  // history step, and the significant termination/peak state all describe one and the same
  // certified equilibrium state. Each assertion below checks a different projection of the
  // final internal state, not just the lambda scalar.
  const lastStep = result.outputs.steps.find(
    (step) => step.step === result.outputs.convergenceInfo.lastConvergedStep,
  );
  assert.ok(lastStep !== undefined);
  assert.ok(Math.abs(lastStep.state.lambda - limitPoint.lambda) <= 1e-12);
  // The final state is the certified rising-side state, never the descending-side state.
  assert.notEqual(limitPoint.descendingSideStep, result.outputs.convergenceInfo.lastConvergedStep);
  assert.ok(limitPoint.descendingSideLambda < lastStep.state.lambda - 1e-12);
  // The final evaluation is a genuinely converged equilibrium state.
  assert.equal(result.outputs.convergenceInfo.converged, true);
  assert.ok(
    lastStep.state.equilibrium.maximumNormalizedBlockResidual <=
      lastStep.state.equilibrium.tolerance,
    "the certified state is a converged equilibrium state",
  );
  // The `lambda` variable (published through the analysis descriptor), the certified state
  // stored in the last history step, and the limit-point report agree exactly.
  assert.equal(result.outputs.analysis.lambda.currentValue, limitPoint.lambda);
  assert.equal(result.outputs.analysis.lambda.currentValue, lastStep.state.lambda);
  // The `q` projection: the control displacement stored in the last history step (computed from
  // the certified q at commit time) and the last lambda-displacement curve point agree, and the
  // deformed configuration is complete and finite for every block.
  const curveTail = result.outputs.curves.lambdaDisplacement.at(-1);
  assert.ok(curveTail !== undefined);
  assert.equal(curveTail.displacement, lastStep.controlDisplacement);
  assert.equal(curveTail.lambda, lastStep.state.lambda);
  assert.equal(lastStep.state.deformedConfiguration.length, 9);
  for (const block of lastStep.state.deformedConfiguration) {
    assert.ok(Number.isFinite(block.translation.x));
    assert.ok(Number.isFinite(block.translation.y));
    assert.ok(Number.isFinite(block.rotation));
  }
  // Capacity landmarks and significant steps point at the same certified state.
  assert.equal(result.outputs.capacity.lambdaTermination, limitPoint.lambda);
  assert.equal(result.outputs.capacity.lambdaPeak, limitPoint.lambda);
  assert.equal(
    result.outputs.significantSteps.termination,
    result.outputs.convergenceInfo.lastConvergedStep,
  );
  assert.equal(
    result.outputs.significantSteps.peak,
    result.outputs.convergenceInfo.lastConvergedStep,
  );
  // The certified event and its failed criterion carry the same state identity.
  const limitEvent = result.outputs.events.find(
    (event) => event.kind === "equilibrium-limit-point",
  );
  assert.ok(limitEvent !== undefined);
  assert.equal(limitEvent.step, result.outputs.convergenceInfo.lastConvergedStep);
  assert.ok(limitEvent.lambda !== null && Math.abs(limitEvent.lambda - limitPoint.lambda) <= 1e-12);
  const limitCriterion = result.outputs.engineeringAssessment?.failedCriteria.find(
    (item) => item.kind === "equilibrium-limit-point",
  );
  assert.ok(limitCriterion !== undefined);
  assert.ok(
    limitCriterion.lambda !== null && Math.abs(limitCriterion.lambda - limitPoint.lambda) <= 1e-12,
  );
  const lastHistoryLambda = lastStep.state.lambda;
  assert.ok(Math.abs(lastHistoryLambda - limitPoint.lambda) <= 1e-12);
});

void test("12. numerical termination before limit certification -> INDETERMINATE with diagnostics", () => {
  const result = analyzeMasonryArchPath(
    arch({
      voussoirs: 9,
      crownPoint: { x: 0, y: 100 },
      frictionCoefficient: 0.4,
      reinforcements: [barePassiveTendon()],
    }),
    designOptions,
  );
  assert.equal(result.outputs.engineeringAssessment?.status, "INDETERMINATE");
  assert.equal(result.outputs.convergenceInfo.verifiedLimitPoint, null);
  assert.equal(result.outputs.capacity.lambdaVerificationLimit, null);
  assert.equal(result.status, "failed");
  // A numerical termination can never produce a limit point, instability, or a physical FAIL,
  // even when the stall happens in front of a nearly vertical continuation tangent.
  assert.ok(
    !result.outputs.events.some((event) => event.kind === "equilibrium-limit-point"),
    "no equilibrium-limit-point event may come from a numerical termination",
  );
  assert.notEqual(result.outputs.failureMode, "instability");
  assert.equal(result.outputs.engineeringAssessment?.failureMode, null);
  // Diagnostics are published and must never be read as capacity.
  assert.ok(result.outputs.convergenceInfo.lastConvergedLambda !== null);
  assert.ok(result.outputs.convergenceInfo.maximumObservedLambda !== null);
  assert.ok(result.outputs.convergenceInfo.lastConvergedStep !== null);
  assert.ok(result.outputs.convergenceInfo.terminationReason !== null);
});

void test("13. the crossing of lambda one stores the exact design state from the corrector", () => {
  const result = analyzeMasonryArchPath(arch({ reinforcements: [passiveTendon()] }), designOptions);
  assert.equal(result.outputs.engineeringAssessment?.status, "PASS");
  assert.equal(result.outputs.convergenceInfo.termination, "design-state-reached");
  assert.ok(result.outputs.convergenceInfo.designStateCorrectorAttempts >= 1);
  const designStep = result.outputs.steps.find(
    (step) => step.step === result.outputs.significantSteps.designState,
  )!;
  assert.equal(designStep.stage, "scalable-loading");
  // The stored design state has lambda exactly 1 within the numerical tolerance; the
  // overshooting arc step is never accepted as the design state.
  assert.ok(Math.abs(designStep.state.lambda - 1) <= 1e-12);
  assert.equal(result.outputs.analysis.lambda.currentValue, 1);
  for (const step of result.outputs.steps.filter((item) => item.step < designStep.step)) {
    assert.ok(step.state.lambda < 1);
  }
});

void test("15. the passive intrados activation benchmark remains valid on the façade", () => {
  const result = analyzeMasonryArchPath(arch({ reinforcements: [passiveTendon()] }), designOptions);
  const activation = result.outputs.events.find(
    (event) => event.kind === "passive-tendon-activated",
  );
  assert.ok(activation !== undefined);
  assert.ok(activation.lambda !== null && activation.lambda > 0 && activation.lambda < 1);
  assert.equal(activation.category, "observable-event");
  assert.deepEqual(activation.entityIds, ["P"]);
  const atActivation = result.outputs.steps.find((step) => step.step === activation.step)!;
  const state = atActivation.state.reinforcementState.find((item) => item.reinforcementId === "P")!;
  assert.equal(state.initialForce, 0);
  assert.equal(state.state, "active-passive");
  assert.ok(state.force > 0);
});

// B/E numerical-safety seam: a tangent load-correction solve that throws (singular matrix) must
// only produce a diagnostic from the corrector seed helper. It must never throw out of the
// standard verification, never become a limit point, and never become a physical failure.
void test("tangent-seed construction exception is a diagnostic, never a throw", () => {
  const solver = new NonlinearEquilibriumContinuationSolver({
    scaling: {
      residualScales: [1, 1, 1],
      coordinateScales: [1, 1, 1],
    },
    tolerance: 1e-8,
    maxIterations: 10,
    maximumLineSearchIterations: 5,
    minimumLineSearchFactor: 0.01,
  });
  const context = { continuationSolver: solver } as unknown as SolverContext;
  const singularEvaluation = {
    residual: [0, 0, 0],
    tangent: [
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0],
    ],
    scalableDerivative: [1, 0, 0],
    interfaces: [],
    trialStates: {},
    reinforcement: null,
    bondedLayerState: [],
    displacements: [],
  } as unknown as SystemEvaluation;
  const seed = masonryArchTangentSeedAtLambda(context, [0, 0, 0], 0.9, singularEvaluation, 1);
  // No throw; the unavailable tangent solve is reported as a diagnostic.
  assert.equal(seed.seed, null);
  assert.ok(seed.error !== null && seed.error.length > 0);

  // The same seam with a healthy tangent returns a finite seed along the load-correction
  // direction, so the failure above is specifically the exception path.
  const healthyEvaluation = {
    ...singularEvaluation,
    tangent: [
      [10, 0, 0],
      [0, 10, 0],
      [0, 0, 10],
    ],
  } as unknown as SystemEvaluation;
  const healthy = masonryArchTangentSeedAtLambda(context, [0, 0, 0], 0.9, healthyEvaluation, 1);
  assert.notEqual(healthy.seed, null);
  assert.equal(healthy.error, null);
  assert.ok(healthy.seed!.every((value) => Number.isFinite(value)));
});
