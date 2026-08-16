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
  assert.ok(result.outputs.convergenceInfo.verifiedLimitPoint?.certified === true);
  assert.ok(result.outputs.capacity.lambdaVerificationLimit !== null);
  assert.ok(result.outputs.capacity.lambdaVerificationLimit < 1);
  assert.equal(result.outputs.failureMode, "instability");
  assert.ok(result.outputs.events.some((event) => event.kind === "equilibrium-limit-point"));
  assert.equal(result.outputs.convergenceInfo.lambdaBracket?.certified, true);
  assert.equal(
    result.outputs.convergenceInfo.lambdaBracket?.meaning,
    "equilibrium-limit-point-bracket",
  );
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
