import assert from "node:assert/strict";
import test from "node:test";

import {
  analyzeMasonryArchPath,
  createMasonryArch,
  getMasonryArchPathState,
  getMasonryArchSignificantStep,
  type AnalyzeMasonryArchPathOptions,
  type ArchReinforcementInput,
  type MasonryDeformableInterfaceLawInput,
} from "structural-checks-ts-migration-workspace/applications/masonry-arches";

function deformable(
  overrides: Partial<MasonryDeformableInterfaceLawInput["normal"]> = {},
): MasonryDeformableInterfaceLawInput {
  return {
    response: "deformable",
    normal: {
      type: "elastic-no-tension",
      elasticModulus: 1_000_000,
      characteristicLength: 0.5,
      integrationPointCount: 8,
      ...overrides,
    },
    tangential: {
      type: "elastic-coulomb",
      shearModulus: 400_000,
      characteristicLength: 0.5,
      frictionCoefficient: 0.5,
      cohesion: 0,
      flowRule: { type: "non-associated", dilationAngle: 0 },
    },
  };
}

function model(
  input: {
    readonly pointForce?: { readonly x: number; readonly y: number };
    readonly interfaceLaw?: MasonryDeformableInterfaceLawInput;
    readonly reinforcements?: readonly ArchReinforcementInput[];
  } = {},
) {
  return createMasonryArch({
    id: "path-arch",
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
    interfaceLaw: input.interfaceLaw ?? deformable(),
    loads: [
      { id: "SW", type: "self-weight", loadCaseId: "G" },
      {
        id: "Q",
        type: "point",
        loadCaseId: "Q",
        station: 0.5,
        targetVoussoirId: "V-004",
        force: input.pointForce ?? { x: 0, y: -10 },
      },
    ],
    reinforcements: input.reinforcements ?? [],
  });
}

const numericalOptions = {
  units: { force: "kN" as const, length: "m" as const },
  scalableLoadCaseIds: ["Q"],
  equilibriumTolerance: 1e-7,
  maxIterations: 50,
  maxSteps: 200,
};

void test("design-state check returns PASS at a converged lambda-one state", () => {
  const result = analyzeMasonryArchPath(model({ pointForce: { x: 0, y: -1 } }), {
    ...numericalOptions,
    analysisObjective: "design-state-check",
  });
  assert.equal(result.outputs.control.type, "arc-length");
  assert.equal(result.outputs.convergenceInfo.termination, "design-state-reached");
  assert.equal(result.outputs.engineeringAssessment?.status, "PASS");
  assert.equal(result.status, "ok");
  assert.equal(result.outputs.engineeringAssessment?.failureMode, null);
  assert.equal(result.outputs.analysis.lambda.currentValue, 1);
  // The stored design state is the exact lambda = 1 state certified by the fixed-lambda
  // corrector: the overshooting arc step is never accepted as the design state.
  assert.equal(result.outputs.steps.at(-1)!.state.lambda, 1);
  assert.equal(result.outputs.significantSteps.designState, result.outputs.steps.at(-1)!.step);
});

void test("numerical exhaustion returns INDETERMINATE and never collapse", () => {
  const result = analyzeMasonryArchPath(model(), {
    ...numericalOptions,
    analysisObjective: "design-state-check",
    maxSteps: 1,
  });
  assert.equal(result.outputs.engineeringAssessment?.status, "INDETERMINATE");
  assert.equal(result.status, "failed");
  assert.deepEqual(result.outputs.engineeringAssessment?.failedCriteria, []);
  assert.equal(result.outputs.engineeringAssessment?.failureMode, null);
  assert.equal(result.outputs.analysisOutcome.terminationCategory, "numerical-failure");
  assert.equal(result.outputs.capacity.lambdaCollapse, null);
});

void test("stop-at-onset compression produces a physical FAIL without a mechanism", () => {
  const result = analyzeMasonryArchPath(
    model({ interfaceLaw: deformable({ compressiveStrength: 310 }) }),
    { ...numericalOptions, analysisObjective: "design-state-check" },
  );
  assert.equal(result.outputs.engineeringAssessment?.status, "FAIL");
  assert.equal(result.status, "not-verified");
  assert.equal(result.outputs.engineeringAssessment?.failureMode, "masonry-crushing");
  assert.equal(result.outputs.convergenceInfo.termination, "terminal-physical-event");
  assert.ok(result.outputs.events.some((event) => event.kind === "compression-strength-reached"));
  assert.equal(result.outputs.capacity.lambdaCollapse, null);
});

void test("perfectly-plastic crushing remains a limit on a continuing path", () => {
  const result = analyzeMasonryArchPath(
    model({
      interfaceLaw: deformable({
        compressiveStrength: 310,
        postCrushingBehavior: "perfectly-plastic",
      }),
    }),
    {
      ...numericalOptions,
      analysisObjective: "advanced-path",
      engineeringLimitPolicy: "continue",
      control: { type: "load", targetLambda: 0.5, initialStep: 0.05 },
    },
  );
  assert.equal(result.outputs.convergenceInfo.termination, "target-reached");
  assert.ok(result.outputs.capacity.lambdaFirstLimit! < result.outputs.capacity.lambdaTermination!);
  assert.equal(result.outputs.capacity.lambdaCollapse, null);
});

void test("plastic sliding is an engineering limit, not an inferred collapse", () => {
  const result = analyzeMasonryArchPath(model({ pointForce: { x: 100, y: 0 } }), {
    ...numericalOptions,
    analysisObjective: "advanced-path",
    engineeringLimitPolicy: "stop",
    control: { type: "load", targetLambda: 1, initialStep: 0.05 },
  });
  assert.equal(result.outputs.convergenceInfo.termination, "engineering-limit");
  assert.ok(result.outputs.events.some((event) => event.kind === "sliding-started"));
  assert.ok(result.outputs.events.some((event) => event.kind === "plastic-sliding"));
  assert.equal(result.outputs.capacity.lambdaCollapse, null);
});

void test("a passive tendon is activated by compatibility and is not scaled as a load", () => {
  const common = {
    side: "intrados" as const,
    area: 0.001,
    elasticModulus: 200_000_000,
    topology: {
      type: "open" as const,
      left: { type: "arch-anchor" as const, station: 0 },
      right: { type: "arch-anchor" as const, station: 1 },
      deviators: { type: "uniform-count" as const, count: 1 },
    },
  };
  const result = analyzeMasonryArchPath(
    model({
      pointForce: { x: 0, y: 100 },
      reinforcements: [
        { ...common, id: "stabilizing", initialForce: 10 },
        { ...common, id: "passive", initialForce: 0 },
      ],
    }),
    {
      ...numericalOptions,
      analysisObjective: "advanced-path",
      control: { type: "load", targetLambda: 0.85, initialStep: 0.05 },
    },
  );
  const finalState = result.outputs.steps.at(-1)!.state;
  const passive = finalState.reinforcementState.find((item) => item.reinforcementId === "passive")!;
  assert.equal(passive.state, "active-passive");
  assert.ok(passive.force > 0);
  assert.ok(result.outputs.events.some((event) => event.kind === "passive-tendon-activated"));
  assert.ok(
    result.outputs.analysis.lambda.excludedQuantities.includes(
      "passive-tendon-compatibility-force",
    ),
  );
});

void test("every step owns one coherent equilibrium configuration", () => {
  const arch = model();
  const result = analyzeMasonryArchPath(arch, {
    ...numericalOptions,
    analysisObjective: "advanced-path",
    control: { type: "load", targetLambda: 0.1, initialStep: 0.05 },
  });
  const step = result.outputs.steps.at(-1)!;
  assert.equal(step.state.lambda, result.outputs.capacity.lambdaTermination);
  assert.equal(step.state.deformedConfiguration.length, arch.geometry.voussoirCount);
  assert.equal(step.state.interfaces.length, arch.geometry.interfaces.length);
  for (const item of step.state.interfaces) {
    assert.ok(Number.isFinite(item.compressionAtIntrados));
    assert.ok(Number.isFinite(item.compressionAtExtrados));
    assert.ok(item.maxCompression >= item.compressionAtIntrados);
    assert.ok(item.maxCompression >= item.compressionAtExtrados);
  }
  assert.equal(getMasonryArchPathState(result.outputs, step.step), step.state);
  assert.equal(getMasonryArchSignificantStep(result.outputs, "last-converged"), step);
  assert.equal("deformedConfiguration" in result.outputs, false);
});

void test("load and spherical arc-length controls recover the same pre-peak equilibrium", () => {
  const arc = analyzeMasonryArchPath(model(), {
    ...numericalOptions,
    analysisObjective: "advanced-path",
    control: {
      type: "arc-length",
      targetPathLength: 0.1,
      initialRadius: 0.02,
      minimumRadius: 1e-5,
      maximumRadius: 0.04,
      loadScale: 1,
      monitor: { blockId: "V-004", component: "y" },
    },
  });
  const arcStep = arc.outputs.steps.at(-1)!;
  const load = analyzeMasonryArchPath(model(), {
    ...numericalOptions,
    analysisObjective: "advanced-path",
    control: {
      type: "load",
      targetLambda: arcStep.state.lambda,
      initialStep: 0.05,
      monitor: { blockId: "V-004", component: "y" },
    },
  });
  const loadStep = load.outputs.steps.at(-1)!;
  const fixedY = load.outputs.steps.findLast((step) => step.stage === "fixed-preload")!.state
    .deformedConfiguration[4]!.translation.y;
  const displacement = loadStep.state.deformedConfiguration[4]!.translation.y - fixedY;
  assert.ok(Math.abs(displacement - arcStep.controlDisplacement) < 2e-7);
});

void test("displacement control can traverse a descending branch and stores the earlier peak", () => {
  const options: AnalyzeMasonryArchPathOptions = {
    ...numericalOptions,
    analysisObjective: "advanced-path",
    engineeringLimitPolicy: "continue",
    control: {
      type: "displacement",
      dof: { blockId: "V-004", component: "y" },
      increment: -0.00015,
      target: -0.003,
    },
  };
  const result = analyzeMasonryArchPath(
    model({
      interfaceLaw: deformable({
        compressiveStrength: 310,
        postCrushingBehavior: "perfectly-plastic",
      }),
    }),
    options,
  );
  assert.equal(result.outputs.convergenceInfo.termination, "target-reached");
  assert.ok(result.outputs.capacity.lambdaPeak! > result.outputs.capacity.lambdaTermination!);
  assert.ok(result.outputs.capacity.steps.peak! < result.outputs.capacity.steps.termination!);
});
