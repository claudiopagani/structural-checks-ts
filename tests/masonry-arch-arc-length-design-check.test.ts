import assert from "node:assert/strict";
import test from "node:test";

import {
  analyzeMasonryArchPath,
  createMasonryArch,
  type AnalyzeMasonryArchPathOptions,
  type ArchReinforcementInput,
  type ArchRigidDeviatorInteractionInput,
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
  overrides: { readonly interaction?: ArchRigidDeviatorInteractionInput } = {},
): ArchReinforcementInput {
  return {
    id: "P",
    ...INTRA,
    area: 0.001,
    elasticModulus: 200_000_000,
    initialForce: 0,
    yieldStrength: 450_000,
    tensileStrength: 550_000,
    interaction: overrides.interaction ?? { type: "rigid-deviators", count: 3 },
    terminations: {
      left: { type: "distributed-anchorage", connectorCount: 1 },
      right: { type: "distributed-anchorage", connectorCount: 1 },
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
    interaction: { type: "rigid-deviators", count: 3 },
    terminations: {
      left: { type: "distributed-anchorage", connectorCount: 1 },
      right: { type: "distributed-anchorage", connectorCount: 1 },
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
    interaction: { type: "rigid-deviators", count: 3 },
    terminations: {
      left: { type: "distributed-anchorage", connectorCount: 1 },
      right: { type: "distributed-anchorage", connectorCount: 1 },
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
          interaction: {
            type: "rigid-deviators",
            count: 3,
            capacity: { resultantResistance: 0.01, interactionRule: "independent" },
          },
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

void test("10. bonded-layer capacity reached before lambda one fails with the verification limit", () => {
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
          transferLength: 0.5,
          startStation: 0,
          endStation: 1,
          terminations: { left: { type: "anchored" }, right: { type: "anchored" } },
        },
      ],
    }),
    designOptions,
  );
  assert.equal(result.outputs.engineeringAssessment?.status, "FAIL");
  assert.ok(
    result.outputs.engineeringAssessment.failedCriteria.some(
      (item) => item.kind === "bonded-layer-capacity-reached",
    ),
  );
  assert.ok(result.outputs.capacity.lambdaVerificationLimit !== null);
  assert.ok(result.outputs.capacity.lambdaVerificationLimit < 1);
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
  // J: internal final-state coherence: q, lambda, final evaluation, the last history step, and
  // the reported limit-point state describe one and the same equilibrium state.
  const lastStep = result.outputs.steps.find(
    (step) => step.step === result.outputs.convergenceInfo.lastConvergedStep,
  );
  assert.ok(lastStep !== undefined);
  assert.ok(Math.abs(lastStep.state.lambda - limitPoint.lambda) <= 1e-12);
  assert.equal(result.outputs.capacity.lambdaTermination, limitPoint.lambda);
  assert.equal(
    result.outputs.significantSteps.termination,
    result.outputs.convergenceInfo.lastConvergedStep,
  );
  assert.equal(
    result.outputs.significantSteps.peak,
    result.outputs.convergenceInfo.lastConvergedStep,
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
