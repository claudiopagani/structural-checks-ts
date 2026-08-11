import assert from "node:assert/strict";
import test from "node:test";

import {
  analyzeMasonryArchNonlinear,
  analyzeMasonryArchCollapse,
  createMasonryArch,
  evaluateMasonryArchInterfaceConfiguration,
  type ArchReinforcementInput,
  type BondedLayerReinforcementInput,
  type MasonryArchDeformableNoTensionInterfaceInput,
} from "structural-checks-ts-migration-workspace/applications/masonry-arches";

function close(actual: number, expected: number, tolerance = 1e-9): void {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `Expected ${actual} to be within ${tolerance} of ${expected}.`,
  );
}

function deformableInterface(
  overrides: Partial<MasonryArchDeformableNoTensionInterfaceInput["normal"]> = {},
): MasonryArchDeformableNoTensionInterfaceInput {
  return {
    model: "deformable-no-tension",
    normal: {
      elasticModulus: 1_000_000,
      characteristicLength: 0.5,
      integrationPointCount: 8,
      ...overrides,
    },
    tangential: {
      shearModulus: 400_000,
      characteristicLength: 0.5,
      frictionCoefficient: 0.5,
      cohesion: 0,
      flowRule: { type: "non-associated", dilationAngle: 0 },
    },
  };
}

function model(interfaceInput = deformableInterface()) {
  return createMasonryArch({
    id: "nonlinear-interface-fixture",
    units: { force: "kN", length: "m" },
    geometry: {
      kind: "simplified-symmetric",
      referenceCurve: "centerline",
      profile: { type: "circular" },
      span: 10,
      rise: 5,
      thickness: 1,
      outOfPlaneWidth: 1,
      voussoirCount: 20,
    },
    interfaces: interfaceInput,
  });
}

function geometryInput() {
  return {
    kind: "simplified-symmetric" as const,
    referenceCurve: "centerline" as const,
    profile: { type: "circular" as const },
    span: 10,
    rise: 5,
    thickness: 1,
    outOfPlaneWidth: 1,
    voussoirCount: 20,
  };
}

function scale(vector: { readonly x: number; readonly y: number }, factor: number) {
  return { x: factor * vector.x, y: factor * vector.y };
}

function nonlinearAnalysisModel({
  compressiveStrength,
  pointForce = { x: 0, y: -10 },
  reinforcements = [],
  bondedLayers = [],
  voussoirCount = 9,
}: {
  readonly compressiveStrength?: number;
  readonly pointForce?: { readonly x: number; readonly y: number };
  readonly reinforcements?: readonly ArchReinforcementInput[];
  readonly bondedLayers?: readonly BondedLayerReinforcementInput[];
  readonly voussoirCount?: number;
} = {}) {
  const crownIndex = Math.floor(voussoirCount / 2);
  return createMasonryArch({
    id: "nonlinear-analysis-fixture",
    units: { force: "kN", length: "m" },
    geometry: { ...geometryInput(), voussoirCount },
    masonry: { unitWeight: 20 },
    interfaces: deformableInterface(
      compressiveStrength === undefined ? {} : { compressiveStrength },
    ),
    loads: [
      { id: "self-weight", type: "self-weight", loadCaseId: "G" },
      {
        id: "crown-load",
        type: "point",
        loadCaseId: "Q",
        station: 0.5,
        targetVoussoirId: `V-${String(crownIndex).padStart(3, "0")}`,
        force: pointForce,
      },
    ],
    reinforcements,
    bondedLayers,
  });
}

void test("deformable interface input is explicit and rejects nonzero nonlinear dilation", () => {
  assert.throws(
    () =>
      createMasonryArch({
        id: "missing-characteristic-length",
        units: { force: "kN", length: "m" },
        geometry: geometryInput(),
        interfaces: {
          ...deformableInterface(),
          normal: { ...deformableInterface().normal, characteristicLength: 0 },
        },
      }),
    /characteristicLength must be positive/i,
  );

  const nonzeroDilation = model({
    ...deformableInterface(),
    tangential: {
      ...deformableInterface().tangential,
      flowRule: { type: "non-associated", dilationAngle: 0.1 },
    },
  });
  assert.throws(
    () =>
      evaluateMasonryArchInterfaceConfiguration(nonzeroDilation, {
        units: { force: "kN", length: "m" },
        blockDisplacements: [],
      }),
    /zero dilation/i,
  );
});

void test("uniform joint closure recovers the assigned normal stiffness and tangent", () => {
  const arch = model();
  const geometry = arch.geometry.interfaces[10]!;
  const closure = 0.0002;
  const evaluated = evaluateMasonryArchInterfaceConfiguration(arch, {
    units: { force: "kN", length: "m" },
    blockDisplacements: [
      {
        blockId: "V-010",
        translation: scale(geometry.chainTangent, -closure),
        rotation: 0,
      },
    ],
  }).interfaces[10]!;
  const normalStiffness = 1_000_000 / 0.5;
  const expectedForce = normalStiffness * closure * geometry.length * geometry.outOfPlaneWidth;
  close(evaluated.normalForce, expectedForce, 2e-8);
  close(evaluated.compressedLength, geometry.length, 1e-12);
  close(evaluated.maxCompression, normalStiffness * closure, 2e-8);
  assert.equal(evaluated.contactActive, true);

  const rightOffset = 3;
  const projectedTangent =
    geometry.chainTangent.x *
      (evaluated.tangent[rightOffset]![rightOffset]! * geometry.chainTangent.x +
        evaluated.tangent[rightOffset]![rightOffset + 1]! * geometry.chainTangent.y) +
    geometry.chainTangent.y *
      (evaluated.tangent[rightOffset + 1]![rightOffset]! * geometry.chainTangent.x +
        evaluated.tangent[rightOffset + 1]![rightOffset + 1]! * geometry.chainTangent.y);
  close(projectedTangent, -normalStiffness * geometry.length * geometry.outOfPlaneWidth, 2e-3);
});

void test("zero-dilation Coulomb return mapping caps shear without artificial opening", () => {
  const arch = model();
  const geometry = arch.geometry.interfaces[10]!;
  const closure = 0.0002;
  const slip = 0.002;
  const evaluated = evaluateMasonryArchInterfaceConfiguration(arch, {
    units: { force: "kN", length: "m" },
    blockDisplacements: [
      {
        blockId: "V-010",
        translation: {
          x: -closure * geometry.chainTangent.x + slip * geometry.jointAxis.x,
          y: -closure * geometry.chainTangent.y + slip * geometry.jointAxis.y,
        },
        rotation: 0,
      },
    ],
  }).interfaces[10]!;
  assert.equal(evaluated.sliding, true);
  close(Math.abs(evaluated.shearForce), 0.5 * evaluated.normalForce, 2e-8);
  close(evaluated.maximumOpening, 0, 1e-12);
  close(evaluated.maximumClosure, closure, 1e-12);
  assert.ok(evaluated.fibers.every((fiber) => fiber.sliding));
});

void test("finite compression strength is enforced at every contact fiber", () => {
  const arch = model(deformableInterface({ compressiveStrength: 100 }));
  const geometry = arch.geometry.interfaces[10]!;
  const evaluated = evaluateMasonryArchInterfaceConfiguration(arch, {
    units: { force: "kN", length: "m" },
    blockDisplacements: [
      {
        blockId: "V-010",
        translation: scale(geometry.chainTangent, -0.001),
        rotation: 0,
      },
    ],
  }).interfaces[10]!;
  assert.equal(evaluated.crushing, true);
  close(evaluated.maxCompression, 100, 1e-10);
  close(evaluated.normalForce, 100 * geometry.length * geometry.outOfPlaneWidth, 1e-9);
});

void test("perfectly plastic crushing commits irreversible closure and unloads elastically", () => {
  const arch = model(
    deformableInterface({
      compressiveStrength: 100,
      postCrushingBehavior: "perfectly-plastic",
      integrationPointCount: 8,
    }),
  );
  const geometry = arch.geometry.interfaces[10]!;
  const configuration = (closure: number) => ({
    units: { force: "kN" as const, length: "m" as const },
    blockDisplacements: [
      {
        blockId: "V-010",
        translation: scale(geometry.chainTangent, -closure),
        rotation: 0,
      },
    ],
  });
  const crushed = evaluateMasonryArchInterfaceConfiguration(arch, configuration(0.001))
    .interfaces[10]!;
  assert.equal(crushed.crushing, true);
  assert.ok(crushed.trialState.plasticClosureByIntegrationPoint.every((value) => value > 0));

  const unloaded = evaluateMasonryArchInterfaceConfiguration(arch, {
    ...configuration(0.00096),
    committedStatesByInterfaceId: { [geometry.id]: crushed.trialState },
  }).interfaces[10]!;
  close(unloaded.maxCompression, 20, 2e-7);
  close(unloaded.normalForce, 20 * geometry.length * geometry.outOfPlaneWidth, 2e-7);
  assert.ok(
    unloaded.trialState.plasticClosureByIntegrationPoint.every(
      (value, index) => value === crushed.trialState.plasticClosureByIntegrationPoint[index],
    ),
  );
});

void test("an internal joint is objective and its generalized actions are self-equilibrated", () => {
  const arch = model();
  const rotation = 0.13;
  const cosine = Math.cos(rotation);
  const sine = Math.sin(rotation);
  const translation = { x: 0.3, y: -0.2 };
  const displacements = arch.geometry.voussoirs.map((block) => {
    const currentCentroid = {
      x: cosine * block.centroid.x - sine * block.centroid.y + translation.x,
      y: sine * block.centroid.x + cosine * block.centroid.y + translation.y,
    };
    return {
      blockId: block.id,
      translation: {
        x: currentCentroid.x - block.centroid.x,
        y: currentCentroid.y - block.centroid.y,
      },
      rotation,
    };
  });
  const rigid = evaluateMasonryArchInterfaceConfiguration(arch, {
    units: { force: "kN", length: "m" },
    blockDisplacements: displacements,
  }).interfaces[10]!;
  close(rigid.normalForce, 0, 1e-7);
  close(rigid.shearForce, 0, 1e-7);
  assert.equal(rigid.coincidentClosedStickPredictor, true);

  const geometry = arch.geometry.interfaces[10]!;
  const deformed = evaluateMasonryArchInterfaceConfiguration(arch, {
    units: { force: "kN", length: "m" },
    blockDisplacements: [
      {
        blockId: "V-010",
        translation: {
          x: -0.0002 * geometry.chainTangent.x + 0.00001 * geometry.jointAxis.x,
          y: -0.0002 * geometry.chainTangent.y + 0.00001 * geometry.jointAxis.y,
        },
        rotation: 0.0001,
      },
    ],
  }).interfaces[10]!;
  const resultant = deformed.actions.reduce(
    (total, action) => {
      const block = arch.geometry.voussoirs.find((item) => item.id === action.blockId)!;
      const displacement =
        deformed.blockIds.indexOf(action.blockId) === 1
          ? {
              x: -0.0002 * geometry.chainTangent.x + 0.00001 * geometry.jointAxis.x,
              y: -0.0002 * geometry.chainTangent.y + 0.00001 * geometry.jointAxis.y,
            }
          : { x: 0, y: 0 };
      const currentCentroid = {
        x: block.centroid.x + displacement.x,
        y: block.centroid.y + displacement.y,
      };
      return {
        x: total.x + action.force.x,
        y: total.y + action.force.y,
        moment:
          total.moment +
          currentCentroid.x * action.force.y -
          currentCentroid.y * action.force.x +
          action.moment,
      };
    },
    { x: 0, y: 0, moment: 0 },
  );
  close(resultant.x, 0, 1e-8);
  close(resultant.y, 0, 1e-8);
  close(resultant.moment, 0, 1e-7);
});

void test("adaptive load control preserves symmetry and equilibrium at every converged step", () => {
  const result = analyzeMasonryArchNonlinear(nonlinearAnalysisModel(), {
    units: { force: "kN", length: "m" },
    geometricNonlinearity: true,
    scalableLoadCaseIds: ["Q"],
    control: {
      type: "load",
      targetLambda: 0.2,
      monitor: { blockId: "V-004", component: "y" },
      initialStep: 0.05,
    },
    equilibriumTolerance: 1e-7,
    maxIterations: 30,
    maxSteps: 100,
  });
  assert.equal(result.status, "ok");
  assert.equal(result.outputs.convergenceInfo.termination, "target-reached");
  assert.equal(
    result.outputs.convergenceInfo.linearSolver,
    "compact-banded-gaussian-elimination-partial-pivoting",
  );
  close(result.outputs.history.at(-1)!.lambda, 0.2, 1e-14);
  assert.ok(
    result.outputs.history.every(
      (point) =>
        point.equilibrium.maximumNormalizedBlockResidual <=
        point.equilibrium.tolerance * (1 + 1e-8),
    ),
  );
  for (let left = 0; left < 4; left += 1) {
    const right = 8 - left;
    const leftMotion = result.outputs.finalConfiguration[left]!;
    const rightMotion = result.outputs.finalConfiguration[right]!;
    close(leftMotion.translation.x, -rightMotion.translation.x, 2e-10);
    close(leftMotion.translation.y, rightMotion.translation.y, 2e-10);
    close(leftMotion.rotation, -rightMotion.rotation, 2e-10);
  }
  close(result.outputs.reactions.left.force.y, result.outputs.reactions.right.force.y, 2e-6);
  close(result.outputs.reactions.left.force.x, -result.outputs.reactions.right.force.x, 2e-6);
});

void test("compact banded and forced dense nonlinear solutions agree", () => {
  const common = {
    units: { force: "kN" as const, length: "m" as const },
    geometricNonlinearity: true as const,
    scalableLoadCaseIds: ["Q"],
    control: {
      type: "load" as const,
      targetLambda: 0.15,
      monitor: { blockId: "V-004", component: "y" as const },
      initialStep: 0.05,
    },
    equilibriumTolerance: 1e-8,
    maxIterations: 30,
    maxSteps: 100,
  };
  const automatic = analyzeMasonryArchNonlinear(nonlinearAnalysisModel(), common);
  const dense = analyzeMasonryArchNonlinear(nonlinearAnalysisModel(), {
    ...common,
    linearSolver: "dense",
  });
  assert.equal(automatic.status, "ok");
  assert.equal(dense.status, "ok");
  assert.equal(
    automatic.outputs.convergenceInfo.linearSolver,
    "compact-banded-gaussian-elimination-partial-pivoting",
  );
  assert.equal(
    dense.outputs.convergenceInfo.linearSolver,
    "dense-gaussian-elimination-partial-pivoting",
  );
  for (let index = 0; index < automatic.outputs.finalConfiguration.length; index += 1) {
    const bandedMotion = automatic.outputs.finalConfiguration[index]!;
    const denseMotion = dense.outputs.finalConfiguration[index]!;
    close(bandedMotion.translation.x, denseMotion.translation.x, 2e-10);
    close(bandedMotion.translation.y, denseMotion.translation.y, 2e-10);
    close(bandedMotion.rotation, denseMotion.rotation, 2e-10);
  }
});

void test("zero-cohesion contact initialization reaches the physical solution with 80 voussoirs", () => {
  const arch = nonlinearAnalysisModel({ voussoirCount: 80 });
  const result = analyzeMasonryArchNonlinear(arch, {
    units: { force: "kN", length: "m" },
    geometricNonlinearity: true,
    scalableLoadCaseIds: ["Q"],
    control: {
      type: "load",
      targetLambda: 0.05,
      monitor: { blockId: "V-040", component: "y" },
      initialStep: 0.05,
    },
    equilibriumTolerance: 1e-7,
    maxIterations: 40,
  });
  assert.equal(result.status, "ok");
  assert.equal(
    result.outputs.convergenceInfo.linearSolver,
    "compact-banded-gaussian-elimination-partial-pivoting",
  );
  assert.equal(result.outputs.convergenceInfo.termination, "target-reached");
  const homotopy = result.outputs.convergenceInfo.numericalCohesionHomotopy;
  assert.equal(homotopy.used, true);
  assert.equal(homotopy.completedStages, 4);
  assert.ok(homotopy.initialOffset > 0);
  for (const item of result.outputs.interfaces) {
    const geometry = arch.geometry.interfaces.find(
      (candidate) => candidate.id === item.interfaceId,
    )!;
    close(
      item.fibers[0]!.frictionCapacity * geometry.length * geometry.outOfPlaneWidth,
      0.5 * item.normalForce,
      2e-6,
    );
  }
});

void test("displacement control reaches its prescribed coordinate and agrees with load control", () => {
  const arch = nonlinearAnalysisModel();
  const displacement = analyzeMasonryArchNonlinear(arch, {
    units: { force: "kN", length: "mm" },
    geometricNonlinearity: true,
    scalableLoadCaseIds: ["Q"],
    control: {
      type: "displacement",
      blockId: "V-004",
      component: "y",
      increment: -0.01,
      targetDisplacement: -0.02,
    },
    equilibriumTolerance: 1e-7,
    maxIterations: 50,
    maxSteps: 100,
  });
  assert.equal(displacement.status, "ok");
  assert.equal(displacement.outputs.control.type, "displacement");
  if (displacement.outputs.control.type === "displacement") {
    close(displacement.outputs.control.targetDisplacement, -0.00002, 1e-15);
  }
  const last = displacement.outputs.history.at(-1)!;
  close(last.controlDisplacement, -0.00002, 2e-12);
  assert.ok(last.lambda > 0);

  const load = analyzeMasonryArchNonlinear(arch, {
    units: { force: "kN", length: "m" },
    geometricNonlinearity: true,
    scalableLoadCaseIds: ["Q"],
    control: {
      type: "load",
      targetLambda: last.lambda,
      monitor: { blockId: "V-004", component: "y" },
      initialStep: 0.1,
    },
    equilibriumTolerance: 1e-7,
    maxIterations: 50,
    maxSteps: 100,
  });
  assert.equal(load.status, "ok");
  const fixedCrownY = load.outputs.history
    .filter((point) => point.stage === "fixed-preload")
    .at(-1)!.blockDisplacements[4]!.translation.y;
  const loadControlledDisplacement =
    load.outputs.finalConfiguration[4]!.translation.y - fixedCrownY;
  close(loadControlledDisplacement, -0.00002, 2e-7);
});

void test("spherical arc-length control follows the equilibrium path with normalized residuals", () => {
  const result = analyzeMasonryArchNonlinear(nonlinearAnalysisModel(), {
    units: { force: "kN", length: "m" },
    geometricNonlinearity: true,
    scalableLoadCaseIds: ["Q"],
    control: {
      type: "arc-length",
      monitor: { blockId: "V-004", component: "y" },
      targetPathLength: 0.12,
      initialRadius: 0.03,
      minimumRadius: 0.001,
      maximumRadius: 0.04,
      loadScale: 1,
    },
    equilibriumTolerance: 1e-7,
    maxIterations: 50,
    maxSteps: 120,
  });
  assert.equal(result.status, "ok");
  assert.equal(result.outputs.convergenceInfo.termination, "target-reached");
  assert.equal(result.outputs.control.type, "arc-length");
  assert.ok(result.outputs.history.at(-1)!.lambda > 0);
  assert.ok(result.outputs.history.length >= 3);
  assert.ok(
    result.outputs.history.every(
      (point) => point.equilibrium.maximumNormalizedBlockResidual <= 1e-7,
    ),
  );
});

void test("a passive tendon activates from the deformation solved by coupled equilibrium", () => {
  const terminations = {
    left: { type: "distributed-anchorage" as const, connectorCount: 1 },
    right: { type: "distributed-anchorage" as const, connectorCount: 1 },
  };
  const common = {
    side: "intrados" as const,
    area: 0.001,
    elasticModulus: 200_000_000,
    interaction: { type: "rigid-deviators" as const, count: 3 },
    terminations,
  };
  const result = analyzeMasonryArchNonlinear(
    nonlinearAnalysisModel({
      pointForce: { x: 0, y: 100 },
      reinforcements: [
        { ...common, id: "stabilizing-post-tension", initialForce: 10 },
        { ...common, id: "passive", initialForce: 0 },
      ],
    }),
    {
      units: { force: "kN", length: "m" },
      geometricNonlinearity: true,
      scalableLoadCaseIds: ["Q"],
      control: {
        type: "load",
        targetLambda: 0.85,
        monitor: { blockId: "V-004", component: "y" },
        initialStep: 0.05,
      },
      equilibriumTolerance: 1e-7,
      maxIterations: 50,
      maxSteps: 200,
    },
  );
  assert.equal(result.status, "ok");
  assert.equal(
    result.outputs.convergenceInfo.linearSolver,
    "dense-gaussian-elimination-partial-pivoting",
  );
  const fixedState = result.outputs.history
    .filter((point) => point.stage === "fixed-preload")
    .at(-1)!;
  close(fixedState.reinforcementForces.passive!, 0, 1e-12);
  const passive = result.outputs.reinforcementState.find(
    (item) => item.reinforcementId === "passive",
  )!;
  assert.equal(passive.state, "active-passive");
  assert.ok(passive.elongation > passive.elongationTolerance);
  assert.ok(passive.force > 0);
  close(
    passive.force,
    (200_000_000 * 0.001 * passive.elongation) / passive.effectiveElasticLength!,
    2e-8,
  );
});

void test("a bonded passive layer activates locally without introducing global cable coupling", () => {
  const result = analyzeMasonryArchNonlinear(
    nonlinearAnalysisModel({
      bondedLayers: [
        {
          id: "FRCM-passive",
          family: "frcm",
          side: "intrados",
          area: 0.001,
          elasticModulus: 20_000_000,
          tensileStrength: 100_000,
          debondingStrain: 0.006,
          transferLength: 0.5,
        },
      ],
    }),
    {
      units: { force: "kN", length: "m" },
      geometricNonlinearity: true,
      scalableLoadCaseIds: ["Q"],
      control: {
        type: "load",
        targetLambda: 0.2,
        monitor: { blockId: "V-004", component: "y" },
        initialStep: 0.05,
      },
      equilibriumTolerance: 1e-7,
      maxIterations: 50,
      maxSteps: 120,
    },
  );
  assert.equal(result.outputs.convergenceInfo.termination, "target-reached");
  assert.equal(
    result.outputs.convergenceInfo.linearSolver,
    "compact-banded-gaussian-elimination-partial-pivoting",
  );
  const layer = result.outputs.bondedLayerState[0]!;
  assert.equal(layer.analysisMeaning, "deformable-interface-compatibility");
  assert.ok(layer.maximumForce! > 0);
  assert.ok(layer.interfaces.some((item) => item.state === "active"));
  assert.ok(
    result.outputs.history.every(
      (point) => point.equilibrium.maximumNormalizedBlockResidual <= 1e-7,
    ),
  );
});

void test("finite compression terminates the nonlinear path as masonry crushing", () => {
  const result = analyzeMasonryArchNonlinear(nonlinearAnalysisModel({ compressiveStrength: 310 }), {
    units: { force: "kN", length: "m" },
    geometricNonlinearity: true,
    scalableLoadCaseIds: ["Q"],
    control: {
      type: "load",
      targetLambda: 0.5,
      monitor: { blockId: "V-004", component: "y" },
      initialStep: 0.05,
    },
    equilibriumTolerance: 1e-7,
    maxIterations: 50,
    maxSteps: 200,
  });
  assert.equal(result.status, "not-verified");
  assert.equal(result.outputs.convergenceInfo.termination, "material-limit");
  assert.equal(result.outputs.failureMode, "masonry-crushing");
  assert.ok(result.outputs.lambdaCritical! > 0);
  assert.ok(result.outputs.lambdaCritical! < 0.5);
  assert.ok(result.outputs.interfaces.some((item) => item.crushing));
});

void test("collapse API routes geometric nonlinearity to the incremental solver", () => {
  const result = analyzeMasonryArchCollapse(nonlinearAnalysisModel(), {
    units: { force: "kN", length: "m" },
    geometricNonlinearity: true,
    scalableLoadCaseIds: ["Q"],
    control: {
      type: "load",
      targetLambda: 0.05,
      monitor: { blockId: "V-004", component: "y" },
      initialStep: 0.05,
    },
    equilibriumTolerance: 1e-7,
    maxIterations: 30,
    maxSteps: 100,
  });
  assert.equal(result.applicationId, "masonry-arch-nonlinear");
  assert.equal(result.outputs.convergenceInfo.termination, "target-reached");
});

void test("combination factors are applied before nonlinear lambda scaling", () => {
  const arch = nonlinearAnalysisModel();
  const baseOptions = {
    units: { force: "kN" as const, length: "m" as const },
    geometricNonlinearity: true as const,
    scalableLoadCaseIds: ["Q"],
    equilibriumTolerance: 1e-7,
    maxIterations: 30,
    maxSteps: 100,
  };
  const reference = analyzeMasonryArchNonlinear(arch, {
    ...baseOptions,
    control: {
      type: "load",
      targetLambda: 0.2,
      monitor: { blockId: "V-004", component: "y" },
      initialStep: 0.05,
    },
  });
  const factored = analyzeMasonryArchNonlinear(arch, {
    ...baseOptions,
    loadCombination: {
      id: "factored",
      factors: [
        { loadCase: { id: "G" }, factor: 1 },
        { loadCase: { id: "Q" }, factor: 2 },
      ],
    },
    control: {
      type: "load",
      targetLambda: 0.1,
      monitor: { blockId: "V-004", component: "y" },
      initialStep: 0.05,
    },
  });
  assert.equal(reference.status, "ok");
  assert.equal(factored.status, "ok");
  for (let index = 0; index < reference.outputs.finalConfiguration.length; index += 1) {
    const left = reference.outputs.finalConfiguration[index]!;
    const right = factored.outputs.finalConfiguration[index]!;
    close(left.translation.x, right.translation.x, 2e-9);
    close(left.translation.y, right.translation.y, 2e-9);
    close(left.rotation, right.rotation, 2e-9);
  }
});

void test("analytic normal resultants are independent of output sampling points", () => {
  const results = [2, 8, 32, 128].map((integrationPointCount) => {
    const arch = model(deformableInterface({ integrationPointCount }));
    const geometry = arch.geometry.interfaces[10]!;
    const result = evaluateMasonryArchInterfaceConfiguration(arch, {
      units: { force: "kN", length: "m" },
      blockDisplacements: [
        {
          blockId: "V-010",
          translation: scale(geometry.chainTangent, -0.0001),
          rotation: 0.00025,
        },
      ],
    }).interfaces[10]!;
    assert.equal(result.fibers.length, integrationPointCount);
    return result;
  });
  const reference = results[0]!;
  for (const result of results.slice(1)) {
    close(result.normalForce, reference.normalForce, 1e-10);
    close(result.moment, reference.moment, 1e-10);
    close(result.compressedLength, reference.compressedLength, 1e-12);
    close(result.maxCompression, reference.maxCompression, 1e-9);
  }
  const geometry = model().geometry.interfaces[10]!;
  assert.ok(reference.compressedLength > 0);
  assert.ok(reference.compressedLength < geometry.length);
  const triangularNormalForce =
    (reference.maxCompression * reference.compressedLength * geometry.outOfPlaneWidth) / 2;
  close(reference.normalForce, triangularNormalForce, 1e-9);
  const triangularEccentricity = geometry.length / 2 - reference.compressedLength / 3;
  close(Math.abs(reference.moment), reference.normalForce * triangularEccentricity, 1e-9);
});

void test("nonlinear analysis rejects ideal interfaces and solves extrados unilateral contact", () => {
  const commonOptions = {
    units: { force: "kN" as const, length: "m" as const },
    geometricNonlinearity: true as const,
    scalableLoadCaseIds: ["Q"],
    control: {
      type: "load" as const,
      targetLambda: 0.05,
      monitor: { blockId: "V-004", component: "y" as const },
    },
  };
  const ideal = createMasonryArch({
    id: "ideal-nonlinear-rejection",
    units: { force: "kN", length: "m" },
    geometry: { ...geometryInput(), voussoirCount: 9 },
    interfaces: { model: "heyman" },
    loads: [
      {
        id: "load",
        type: "point",
        loadCaseId: "Q",
        station: 0.5,
        targetVoussoirId: "V-004",
        force: { x: 0, y: -10 },
      },
    ],
  });
  assert.throws(
    () => analyzeMasonryArchNonlinear(ideal, commonOptions),
    /requires model "deformable-no-tension"/i,
  );

  const extrados = nonlinearAnalysisModel({
    reinforcements: [
      {
        id: "extrados",
        side: "extrados",
        area: 0.001,
        elasticModulus: 200_000_000,
        initialForce: 10,
      },
    ],
  });
  const result = analyzeMasonryArchNonlinear(extrados, commonOptions);
  assert.equal(result.outputs.convergenceInfo.termination, "target-reached");
  assert.ok(result.outputs.contactForces.length > 0);
  assert.ok(
    result.outputs.contactForces.every(
      (item) => item.state === "in-contact" || item.state === "separated",
    ),
  );
  assert.ok(
    result.outputs.history.every(
      (point) => point.equilibrium.maximumNormalizedBlockResidual <= 1e-8,
    ),
  );
});
