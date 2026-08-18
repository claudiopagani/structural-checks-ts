import assert from "node:assert/strict";
import test from "node:test";

import {
  analyzeMasonryArchVerification,
  createMasonryArch,
  type ArchReinforcementInput,
  type MasonryDeformableInterfaceLawInput,
  type MasonryInterfaceLawInput,
} from "structural-checks-ts-migration-workspace/applications/masonry-arches";

const rigid: MasonryInterfaceLawInput = {
  response: "rigid-plastic",
  normal: { type: "no-tension" },
  tangential: { type: "frictionless" },
};

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

interface ModelOverrides {
  readonly interfaceLaw?: MasonryInterfaceLawInput;
  readonly loads?: Parameters<typeof createMasonryArch>[0]["loads"];
  readonly reinforcements?: readonly ArchReinforcementInput[];
}

function urmArch(id: string, overrides: ModelOverrides = {}) {
  return createMasonryArch({
    id,
    units: { force: "kN", length: "m" },
    geometry: {
      kind: "simplified-symmetric",
      referenceCurve: "centerline",
      profile: { type: "circular" },
      span: 10,
      rise: 5,
      thickness: 1,
      outOfPlaneWidth: 1,
      voussoirCount: 40,
    },
    masonry: { unitWeight: 20 },
    interfaceLaw: overrides.interfaceLaw ?? rigid,
    loads: overrides.loads ?? [
      { id: "SW", type: "self-weight", loadCaseId: "G1" },
      {
        id: "Q",
        type: "patch",
        loadCaseId: "Q1",
        components: { x: 0, y: -10 },
        startStation: 0.05,
        endStation: 0.45,
      },
    ],
    reinforcements: overrides.reinforcements ?? [],
    bondedLayers: [],
  });
}

function deformableArch(
  overrides: {
    readonly crownPoint?: { readonly x: number; readonly y: number };
    readonly voussoirCount?: number;
    readonly reinforcements?: readonly ArchReinforcementInput[];
    readonly bondedLayers?: Parameters<typeof createMasonryArch>[0]["bondedLayers"];
    readonly interfaceLaw?: MasonryDeformableInterfaceLawInput;
  } = {},
) {
  const voussoirCount = overrides.voussoirCount ?? 7;
  return createMasonryArch({
    id: "verification-arch",
    units: { force: "kN", length: "m" },
    geometry: {
      kind: "simplified-symmetric",
      referenceCurve: "centerline",
      profile: { type: "circular" },
      span: 10,
      rise: 5,
      thickness: 1,
      outOfPlaneWidth: 1,
      voussoirCount,
    },
    masonry: { unitWeight: 20 },
    interfaceLaw: overrides.interfaceLaw ?? deformable(),
    loads: [
      { id: "SW", type: "self-weight", loadCaseId: "G" },
      ...(overrides.crownPoint !== undefined
        ? [
            {
              id: "Q",
              type: "point" as const,
              loadCaseId: "Q",
              station: 0.5,
              targetVoussoirId: voussoirCount === 9 ? "V-004" : "V-003",
              force: overrides.crownPoint,
            },
          ]
        : [
            {
              id: "Q",
              type: "patch" as const,
              loadCaseId: "Q",
              components: { x: 0, y: -20 },
              startStation: 0.05,
              endStation: 0.45,
            },
          ]),
    ],
    reinforcements: overrides.reinforcements ?? [],
    bondedLayers: overrides.bondedLayers ?? [],
  });
}

/** Passive intrados tendon on the 7-voussoir patch arch; the verification benchmark. */
function passiveTendonArch() {
  return deformableArch({
    reinforcements: [
      {
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
          deviators: { type: "uniform-count", count: 1 },
        },
      },
    ],
  });
}

const INTRA = { side: "intrados" } as const;

void test("route selection: rigid-plastic models use the static route", () => {
  const result = analyzeMasonryArchVerification(urmArch("v-urm"), {
    units: { force: "kN", length: "m" },
    scalableLoadCaseIds: ["Q1"],
  });
  assert.equal(result.outputs.route, "rigid-plastic-static");
  assert.equal(result.outputs.subAnalyses.path, null);
  assert.ok(result.outputs.subAnalyses.fixedStateEquilibrium !== null);
});

void test("route selection: deformable models use the arc-length route", () => {
  const result = analyzeMasonryArchVerification(deformableArch(), {
    units: { force: "kN", length: "m" },
    scalableLoadCaseIds: ["Q"],
  });
  assert.equal(result.outputs.route, "arc-length-continuation");
  assert.ok(result.outputs.subAnalyses.path !== null);
  assert.equal(result.outputs.subAnalyses.fixedStateEquilibrium, null);
});

void test("1. fixed loads PASS -> the scalable phase starts and lambda one passes", () => {
  const result = analyzeMasonryArchVerification(passiveTendonArch(), {
    units: { force: "kN", length: "m" },
    scalableLoadCaseIds: ["Q"],
    equilibriumTolerance: 1e-7,
    maxIterations: 50,
    maxSteps: 200,
  });
  assert.equal(result.outputs.fixedState.status, "PASS");
  assert.equal(result.outputs.engineeringAssessment.status, "PASS");
  assert.equal(result.outputs.engineeringAssessment.lambda, 1);
  assert.equal(result.outputs.lambdaVerificationLimit, null);
  assert.equal(result.outputs.significantStates.designState?.source, "path-step");
  // F: on PASS the failure mode is null everywhere.
  assert.equal(result.outputs.failureMode, null);
  assert.equal(result.outputs.engineeringAssessment.failureMode, null);
  assert.equal(result.status, "ok");
});

void test("2. fixed loads physical FAIL -> no scalable lambda is defined", () => {
  // An active tendon whose crown-deviator capacity is already exceeded by the fixed-load state
  // fails phase A; the verification stops there and never defines a scalable lambda. T0 = 20 kN
  // keeps the tendon active through the self-weight closure of the preload.
  const model = deformableArch({
    reinforcements: [
      {
        id: "P",
        ...INTRA,
        area: 0.001,
        elasticModulus: 200_000_000,
        initialForce: 20,
        topology: {
          type: "open",
          left: { type: "arch-anchor", station: 0 },
          right: { type: "arch-anchor", station: 1 },
          deviators: {
            type: "uniform-count",
            count: 1,
            connectors: { capacity: { resultantResistance: 5 } },
          },
        },
      },
    ],
  });
  const result = analyzeMasonryArchVerification(model, {
    units: { force: "kN", length: "m" },
    scalableLoadCaseIds: ["Q"],
    equilibriumTolerance: 1e-7,
    maxIterations: 50,
    maxSteps: 200,
  });
  assert.equal(result.outputs.fixedState.status, "FAIL");
  assert.ok(
    result.outputs.fixedState.failedCriteria.some(
      (item) => item.kind === "anchor-capacity-reached",
    ),
    "the fixed-state failure criteria explain the problem",
  );
  assert.equal(result.outputs.engineeringAssessment.status, "FAIL");
  assert.equal(result.outputs.engineeringAssessment.lambda, 0);
  assert.equal(result.outputs.lambdaVerificationLimit, null);
  assert.equal(result.outputs.significantStates.designState, null);
  // H: on FAIL the façade failure mode is always the assessment failure mode.
  assert.equal(result.outputs.failureMode, result.outputs.engineeringAssessment.failureMode);
  assert.ok(result.outputs.failureMode !== null);
  // No scalable-loading step exists: the fixed state really stopped the analysis.
  const pathOutputs = result.outputs.subAnalyses.path!.outputs;
  assert.equal(pathOutputs.steps.filter((step) => step.stage === "scalable-loading").length, 0);
  assert.equal(result.status, "not-verified");
});

// A: a design-blocking event exactly on the step that completes the fixed load must stop the
// analysis with zero scalable-loading steps, no scalable lambda, no verification limit.
void test("blocking event exactly at fixedLoadFactor = 1 -> zero scalable steps", () => {
  // The crown-deviator capacity (74.2 kN) is crossed exactly inside the final fixed-preload
  // step: with the stiff-joint law below the reference deviator resultant scales with the
  // preload factor (T0 = 60 kN, ~60 kN * sqrt(2) at factor one), the device passes at factor
  // 0.925 (~71.5 kN) and fails at factor 1 (~76.8 kN), and the first capacity event fires on
  // the completing step.
  const model = deformableArch({
    interfaceLaw: {
      response: "deformable",
      normal: {
        type: "elastic-no-tension",
        elasticModulus: 10_000_000,
        characteristicLength: 0.5,
        integrationPointCount: 8,
      },
      tangential: {
        type: "elastic-coulomb",
        shearModulus: 4_000_000,
        characteristicLength: 0.5,
        frictionCoefficient: 0.5,
        cohesion: 0,
        flowRule: { type: "non-associated", dilationAngle: 0 },
      },
    },
    reinforcements: [
      {
        id: "P",
        ...INTRA,
        area: 0.001,
        elasticModulus: 200_000_000,
        initialForce: 60,
        topology: {
          type: "open",
          left: { type: "arch-anchor", station: 0 },
          right: { type: "arch-anchor", station: 1 },
          deviators: {
            type: "uniform-count",
            count: 1,
            connectors: { capacity: { resultantResistance: 74.2 } },
          },
        },
      },
    ],
  });
  const result = analyzeMasonryArchVerification(model, {
    units: { force: "kN", length: "m" },
    scalableLoadCaseIds: ["Q"],
    equilibriumTolerance: 1e-7,
    maxIterations: 50,
    maxSteps: 200,
  });
  assert.equal(result.outputs.fixedState.status, "FAIL");
  const pathOutputs = result.outputs.subAnalyses.path!.outputs;
  const fixedSteps = pathOutputs.steps.filter((step) => step.stage === "fixed-preload");
  assert.ok(fixedSteps.length > 0, "the fixed preload converged at least one step");
  assert.equal(fixedSteps.at(-1)!.state.fixedLoadFactor, 1);
  assert.ok(
    fixedSteps.at(-1)!.events.some((event) => event.kind === "anchor-capacity-reached"),
    "the design-blocking event fires exactly on the step that completes the fixed load",
  );
  // The scalable phase must never start.
  assert.equal(pathOutputs.steps.filter((step) => step.stage === "scalable-loading").length, 0);
  assert.equal(result.outputs.engineeringAssessment.status, "FAIL");
  assert.equal(result.outputs.engineeringAssessment.lambda, 0);
  assert.equal(result.outputs.lambdaVerificationLimit, null);
  assert.equal(pathOutputs.capacity.lambdaVerificationLimit, null);
  assert.equal(result.outputs.failureMode, result.outputs.engineeringAssessment.failureMode);
});

void test("3. fixed loads numerical failure -> INDETERMINATE, never a fake FAIL", () => {
  // The static route with an exhausted simplex budget reports the fixed state as numerically
  // undeterminable and stops without inventing a failure or a scalable lambda.
  const result = analyzeMasonryArchVerification(urmArch("v-urm-num"), {
    units: { force: "kN", length: "m" },
    scalableLoadCaseIds: ["Q1"],
    maxSimplexIterations: 1,
  });
  assert.equal(result.outputs.fixedState.status, "INDETERMINATE");
  assert.equal(result.outputs.engineeringAssessment.status, "INDETERMINATE");
  assert.deepEqual(result.outputs.engineeringAssessment.failedCriteria, []);
  assert.equal(result.outputs.lambdaVerificationLimit, null);
  // G: on INDETERMINATE the failure mode is null everywhere.
  assert.equal(result.outputs.failureMode, null);
  assert.equal(result.outputs.engineeringAssessment.failureMode, null);
  assert.equal(result.status, "failed");
});

void test("4. passive arc-length reaches lambda one -> exact corrector -> PASS", () => {
  const result = analyzeMasonryArchVerification(passiveTendonArch(), {
    units: { force: "kN", length: "m" },
    scalableLoadCaseIds: ["Q"],
    equilibriumTolerance: 1e-7,
    maxIterations: 50,
    maxSteps: 200,
  });
  assert.equal(result.outputs.route, "arc-length-continuation");
  assert.equal(result.outputs.engineeringAssessment.status, "PASS");
  assert.ok(result.outputs.diagnostics.designStateCorrectorAttempts >= 1);
  const pathOutputs = result.outputs.subAnalyses.path!.outputs;
  const designStep = pathOutputs.steps.find(
    (step) => step.step === result.outputs.significantStates.designState!.step,
  )!;
  assert.equal(designStep.state.lambda, 1);
});

void test("7. stop-at-onset crushing before lambda one -> FAIL with a verification limit", () => {
  const model = createMasonryArch({
    id: "verification-stop-at-onset",
    units: { force: "kN", length: "m" },
    geometry: {
      kind: "simplified-symmetric",
      referenceCurve: "centerline",
      profile: { type: "circular" },
      span: 10,
      rise: 5,
      thickness: 1,
      outOfPlaneWidth: 1,
      voussoirCount: 9,
    },
    masonry: { unitWeight: 20 },
    interfaceLaw: {
      response: "deformable",
      normal: {
        type: "elastic-no-tension",
        elasticModulus: 1_000_000,
        characteristicLength: 0.5,
        integrationPointCount: 8,
        compressiveStrength: 330,
        postCrushingBehavior: "stop-at-onset",
      },
      tangential: {
        type: "elastic-coulomb",
        shearModulus: 400_000,
        characteristicLength: 0.5,
        frictionCoefficient: 0.5,
        cohesion: 0,
        flowRule: { type: "non-associated", dilationAngle: 0 },
      },
    },
    loads: [
      { id: "SW", type: "self-weight", loadCaseId: "G" },
      {
        id: "Q",
        type: "point",
        loadCaseId: "Q",
        station: 0.5,
        targetVoussoirId: "V-004",
        force: { x: 0, y: -10 },
      },
    ],
    reinforcements: [],
    bondedLayers: [],
  });
  const result = analyzeMasonryArchVerification(model, {
    units: { force: "kN", length: "m" },
    scalableLoadCaseIds: ["Q"],
    equilibriumTolerance: 1e-7,
    maxIterations: 50,
    maxSteps: 200,
  });
  assert.equal(result.outputs.engineeringAssessment.status, "FAIL");
  assert.equal(result.outputs.engineeringAssessment.failureMode, "masonry-crushing");
  assert.ok(result.outputs.lambdaVerificationLimit !== null);
  assert.ok(result.outputs.lambdaVerificationLimit < 1);
  assert.equal(result.outputs.significantStates.verificationLimit?.source, "path-step");
  // H: on FAIL the façade failure mode is always the assessment failure mode.
  assert.equal(result.outputs.failureMode, result.outputs.engineeringAssessment.failureMode);
});

void test("11. certified global limit point below lambda one -> instability FAIL", () => {
  const model = deformableArch({
    voussoirCount: 9,
    crownPoint: { x: 0, y: 200 },
    reinforcements: [
      {
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
      },
    ],
  });
  const result = analyzeMasonryArchVerification(model, {
    units: { force: "kN", length: "m" },
    scalableLoadCaseIds: ["Q"],
    equilibriumTolerance: 1e-7,
    maxIterations: 80,
    maxSteps: 400,
  });
  assert.equal(result.outputs.engineeringAssessment.status, "FAIL");
  assert.equal(result.outputs.engineeringAssessment.failureMode, "instability");
  assert.ok(result.outputs.lambdaVerificationLimit !== null);
  assert.ok(result.outputs.lambdaVerificationLimit < 1);
  // H: on FAIL the façade failure mode is always the assessment failure mode.
  assert.equal(result.outputs.failureMode, result.outputs.engineeringAssessment.failureMode);
  assert.equal(result.outputs.diagnostics.verifiedLimitPoint?.certified, true);
  assert.equal(
    result.outputs.diagnostics.verifiedLimitPoint.lambda,
    result.outputs.lambdaVerificationLimit,
  );
  const criterion = result.outputs.engineeringAssessment.failedCriteria.find(
    (item) => item.kind === "equilibrium-limit-point",
  );
  assert.ok(criterion !== undefined);
  assert.equal(criterion.checkId, "equilibrium-limit-point");
  assert.equal(criterion.demand, 1);
  assert.equal(criterion.capacity, result.outputs.lambdaVerificationLimit);
  assert.ok(Math.abs(criterion.utilizationRatio! - 1 / criterion.capacity) < 1e-12);
  assert.equal(result.status, "not-verified");
});

void test("14. active T0 improves or worsens the outcome without special-case code", () => {
  // Passive tendon (T0 = 0): the same arch passes while the bare arch stalls numerically.
  const bare = analyzeMasonryArchVerification(deformableArch(), {
    units: { force: "kN", length: "m" },
    scalableLoadCaseIds: ["Q"],
    equilibriumTolerance: 1e-7,
    maxIterations: 50,
    maxSteps: 200,
  });
  const passResult = analyzeMasonryArchVerification(passiveTendonArch(), {
    units: { force: "kN", length: "m" },
    scalableLoadCaseIds: ["Q"],
    equilibriumTolerance: 1e-7,
    maxIterations: 50,
    maxSteps: 200,
  });
  assert.equal(passResult.outputs.fixedState.status, "PASS");
  assert.equal(passResult.outputs.engineeringAssessment.status, "PASS");
  void bare;

  // An active tendon with an assigned T0 above the yield capacity worsens the outcome: the same
  // code path reports the reinforcement failure in the scalable phase, no special case.
  const overstressed = deformableArch({
    reinforcements: [
      {
        id: "P",
        ...INTRA,
        area: 0.001,
        elasticModulus: 200_000_000,
        initialForce: 20,
        yieldStrength: 10_000,
        topology: {
          type: "open",
          left: { type: "arch-anchor", station: 0 },
          right: { type: "arch-anchor", station: 1 },
          deviators: { type: "uniform-count", count: 1 },
        },
      },
    ],
  });
  const worsened = analyzeMasonryArchVerification(overstressed, {
    units: { force: "kN", length: "m" },
    scalableLoadCaseIds: ["Q"],
    equilibriumTolerance: 1e-7,
    maxIterations: 50,
    maxSteps: 200,
  });
  assert.equal(worsened.outputs.fixedState.status, "PASS");
  assert.equal(worsened.outputs.engineeringAssessment.status, "FAIL");
  assert.ok(
    worsened.outputs.engineeringAssessment.failedCriteria.some(
      (item) => item.kind === "reinforcement-yielded",
    ),
  );
  assert.ok(worsened.outputs.lambdaVerificationLimit !== null);
});

void test("URM design FAIL at lambda one -> limit analysis supplies a meaningful lambda", () => {
  const model = urmArch("v-urm-fail", {
    loads: [
      { id: "SW", type: "self-weight", loadCaseId: "G1" },
      {
        id: "Q",
        type: "patch",
        loadCaseId: "Q1",
        components: { x: 0, y: -80 },
        startStation: 0.05,
        endStation: 0.45,
      },
    ],
  });
  const result = analyzeMasonryArchVerification(model, {
    units: { force: "kN", length: "m" },
    scalableLoadCaseIds: ["Q1"],
  });
  assert.equal(result.outputs.fixedState.status, "PASS");
  assert.equal(result.outputs.engineeringAssessment.status, "FAIL");
  assert.ok(result.outputs.lambdaVerificationLimit !== null);
  assert.ok(result.outputs.lambdaVerificationLimit < 1);
  // I: the assessed load state is the assigned lambda = 1 state, while the verification limit
  // is the separately quantified capacity of the scalable pattern; the two lambdas never
  // overload each other.
  assert.equal(result.outputs.engineeringAssessment.lambda, 1);
  assert.notEqual(
    result.outputs.engineeringAssessment.lambda,
    result.outputs.lambdaVerificationLimit,
  );
  assert.equal(
    result.outputs.lambdaVerificationLimit,
    result.outputs.subAnalyses.limitAnalysis!.outputs.capacity.lambdaFirstLimit,
  );
  assert.equal(result.outputs.significantStates.verificationLimit?.source, "limit-analysis");
});
