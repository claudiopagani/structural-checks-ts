import assert from "node:assert/strict";
import test from "node:test";

import {
  analyzeMasonryArchEquilibrium,
  analyzeMasonryArchPath,
  createMasonryArch,
  type ArchReinforcementInput,
  type BondedLayerReinforcementInput,
  type MasonryArchEngineeringCriterion,
  type MasonryArchLoadInput,
  type MasonryDeformableInterfaceLawInput,
  type MasonryInterfaceLawInput,
} from "structural-checks-ts-migration-workspace/applications/masonry-arches";

const rigid: MasonryInterfaceLawInput = {
  response: "rigid-plastic",
  normal: { type: "no-tension" },
  tangential: { type: "frictionless" },
};

const deformable: MasonryDeformableInterfaceLawInput = {
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
    frictionCoefficient: 0.5,
    cohesion: 0,
    flowRule: { type: "non-associated", dilationAngle: 0 },
  },
};

interface EquilibriumModelOverrides {
  readonly interfaceLaw?: MasonryInterfaceLawInput;
  readonly loads?: readonly MasonryArchLoadInput[];
  readonly reinforcements?: readonly ArchReinforcementInput[];
  readonly bondedLayers?: readonly BondedLayerReinforcementInput[];
}

function equilibriumModel(
  id: string,
  overrides: EquilibriumModelOverrides = {},
): ReturnType<typeof createMasonryArch> {
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
      { id: "G2", type: "uniform", loadCaseId: "G2", components: { x: 0, y: -1 } },
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
    bondedLayers: overrides.bondedLayers ?? [],
  });
}

function pathModel(
  overrides: {
    readonly interfaceLaw?: MasonryDeformableInterfaceLawInput;
    readonly pointForce?: { readonly x: number; readonly y: number };
    readonly reinforcements?: readonly ArchReinforcementInput[];
    readonly bondedLayers?: readonly BondedLayerReinforcementInput[];
  } = {},
) {
  return createMasonryArch({
    id: "path-assessment",
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
    interfaceLaw: overrides.interfaceLaw ?? deformable,
    loads: [
      { id: "SW", type: "self-weight", loadCaseId: "G" },
      {
        id: "Q",
        type: "point",
        loadCaseId: "Q",
        station: 0.5,
        targetVoussoirId: "V-004",
        force: overrides.pointForce ?? { x: 0, y: -10 },
      },
    ],
    reinforcements: overrides.reinforcements ?? [],
    bondedLayers: overrides.bondedLayers ?? [],
  });
}

function designPath(
  model: ReturnType<typeof pathModel>,
  options: Partial<Parameters<typeof analyzeMasonryArchPath>[1]> = {},
) {
  return analyzeMasonryArchPath(model, {
    units: { force: "kN", length: "m" },
    analysisObjective: "design-state-check",
    scalableLoadCaseIds: ["Q"],
    equilibriumTolerance: 1e-7,
    maxIterations: 50,
    maxSteps: 200,
    ...options,
  });
}

/**
 * Expert load-controlled design path. Used only where the test's purpose is the criterion
 * taxonomy or the step-coherent check data: the standard verification is arc-length governed,
 * and the load-controlled path is the explicit expert alternative.
 */
function loadControlledDesignPath(
  model: ReturnType<typeof pathModel>,
  options: Partial<Parameters<typeof analyzeMasonryArchPath>[1]> = {},
) {
  return designPath(model, {
    control: { type: "load", targetLambda: 1, initialStep: 0.05 },
    ...options,
  });
}

/** Path model whose weak bonded layer reaches capacity during the fixed preload. */
function bondedLayerCapacityPathModel() {
  return pathModel({
    pointForce: { x: 0, y: 100 },
    bondedLayers: [
      {
        id: "FRCM",
        family: "frcm",
        ...INTRA,
        area: 1e-6,
        elasticModulus: 100_000_000,
        tensileStrength: 1000,
        transferLength: 0.5,
        startStation: 0,
        endStation: 1,
        terminations: { left: { type: "anchored" }, right: { type: "anchored" } },
      },
    ],
  });
}

/** Uplift state that slides locally at J-004/J-005 before lambda one and redistributes. */
function stabilizedUpliftModel() {
  return pathModel({
    pointForce: { x: 0, y: 90 },
    reinforcements: [
      {
        id: "stabilizing",
        ...INTRA,
        area: 0.001,
        elasticModulus: 200_000_000,
        initialForce: 20,
        interaction: { type: "rigid-deviators", count: 3 },
        terminations: {
          left: { type: "distributed-anchorage", connectorCount: 1 },
          right: { type: "distributed-anchorage", connectorCount: 1 },
        },
      },
      {
        id: "passive",
        ...INTRA,
        area: 0.001,
        elasticModulus: 200_000_000,
        initialForce: 0,
        interaction: { type: "rigid-deviators", count: 3 },
        terminations: {
          left: { type: "distributed-anchorage", connectorCount: 1 },
          right: { type: "distributed-anchorage", connectorCount: 1 },
        },
      },
    ],
  });
}

function kinds(criteria: readonly MasonryArchEngineeringCriterion[]): string[] {
  return criteria.map((item) => item.kind);
}

const INTRA = { side: "intrados" as const };

void test("A. verified equilibrium: assessment PASS with no failed criteria", () => {
  const result = analyzeMasonryArchEquilibrium(equilibriumModel("assess-a"), {
    loadFactorsByCaseId: { G1: 1, G2: 1, Q1: 0.2 },
  });
  const assessment = result.outputs.engineeringAssessment;
  assert.equal(result.status, "ok");
  assert.equal(assessment.status, "PASS");
  assert.equal(assessment.lambda, 1);
  assert.deepEqual(assessment.failedCriteria, []);
  assert.equal(assessment.failureMode, null);
  assert.equal(
    assessment.question,
    "does-the-assigned-load-state-admit-a-verified-statically-admissible-equilibrium",
  );
  assert.equal(result.metadata.schemaVersion, "4.0.0");
});

void test("B. compression not verified: global infeasibility without fabricated compression criteria", () => {
  const finiteCompression: MasonryInterfaceLawInput = {
    ...rigid,
    normal: { type: "no-tension", compressiveStrength: 300 },
  };
  const result = analyzeMasonryArchEquilibrium(
    equilibriumModel("assess-b", { interfaceLaw: finiteCompression }),
  );
  const assessment = result.outputs.engineeringAssessment;
  // The feasibility polytope is an inner faceted approximation of the uniform-edge-block
  // domain, so a failed compression check implies that no representative equilibrium exists.
  assert.equal(result.outputs.equilibrium.feasible, false);
  assert.equal(result.outputs.convergence.status, "optimal");
  assert.equal(assessment.status, "FAIL");
  assert.equal(result.status, "not-verified");
  assert.equal(assessment.failureMode, "undetermined");
  assert.equal(assessment.failedCriteria.length, 1);
  const criterion = assessment.failedCriteria[0]!;
  assert.equal(criterion.kind, "equilibrium-infeasible");
  assert.deepEqual(criterion.entityIds, []);
  assert.equal(criterion.lambda, 1);
  assert.equal(criterion.demand, null);
  assert.equal(criterion.capacity, null);
  assert.equal(criterion.utilizationRatio, null);
  // The relaxed representative state fails the uniform-edge-block check at several interfaces,
  // but none of them may be promoted to a certified cause of the global infeasibility.
  const failingInterfaces = result.outputs.interfaces.filter(
    (item) => item.checks.compression?.status === "fail",
  );
  assert.ok(failingInterfaces.length > 1);
  for (const item of failingInterfaces) {
    assert.ok(
      !assessment.failedCriteria.some((failed) => failed.entityIds.includes(item.interfaceId)),
    );
  }
});

void test("C. friction-boundary model: global infeasibility without fabricated causal interfaces", () => {
  const coulomb: MasonryInterfaceLawInput = {
    ...rigid,
    tangential: { type: "coulomb", frictionCoefficient: 0.3 },
  };
  const result = analyzeMasonryArchEquilibrium(
    equilibriumModel("assess-c", {
      interfaceLaw: coulomb,
    }),
  );
  const assessment = result.outputs.engineeringAssessment;
  assert.equal(result.outputs.equilibrium.feasible, false);
  assert.equal(result.outputs.convergence.status, "optimal");
  assert.equal(assessment.status, "FAIL");
  assert.equal(result.status, "not-verified");
  assert.equal(assessment.failureMode, "undetermined");
  assert.equal(assessment.failedCriteria.length, 1);
  const criterion = assessment.failedCriteria[0]!;
  assert.equal(criterion.kind, "equilibrium-infeasible");
  assert.deepEqual(criterion.entityIds, []);
  assert.equal(criterion.lambda, 1);
  assert.equal(criterion.demand, null);
  assert.equal(criterion.capacity, null);
  assert.equal(criterion.utilizationRatio, null);
  // Interfaces show friction utilization above one in the relaxed representative state, but the
  // library must not promote them to a certified cause of the global infeasibility.
  assert.ok(
    result.outputs.interfaces.some(
      (item) => item.checks.friction !== null && item.checks.friction.utilizationRatio! > 1,
    ),
  );
  assert.ok(!kinds(assessment.failedCriteria).includes("plastic-sliding"));
  assert.ok(!kinds(assessment.failedCriteria).includes("crushing"));
  assert.ok(!kinds(assessment.failedCriteria).includes("compression-strength-reached"));
});

void test("D. reinforcement yield: FAIL with the reinforcement entity and its check data", () => {
  const result = analyzeMasonryArchEquilibrium(
    equilibriumModel("assess-d", {
      reinforcements: [
        {
          id: "PT",
          ...INTRA,
          area: 1e-6,
          elasticModulus: 200_000_000,
          initialForce: 0.25,
          yieldStrength: 200_000,
          interaction: { type: "rigid-deviators", count: 3 },
          terminations: {
            left: { type: "distributed-anchorage", connectorCount: 1 },
            right: { type: "distributed-anchorage", connectorCount: 1 },
          },
        },
      ],
    }),
    { loadFactorsByCaseId: { G1: 1, G2: 1, Q1: 0.2 } },
  );
  const assessment = result.outputs.engineeringAssessment;
  assert.equal(assessment.status, "FAIL");
  assert.equal(result.status, "not-verified");
  assert.equal(assessment.failureMode, "reinforcement-yield");
  assert.equal(assessment.failedCriteria.length, 1);
  const criterion = assessment.failedCriteria[0]!;
  assert.equal(criterion.kind, "reinforcement-yielded");
  assert.equal(criterion.checkId, "reinforcement-yield-stress");
  assert.deepEqual(criterion.entityIds, ["PT"]);
  assert.equal(criterion.lambda, 1);
  const yielding = result.outputs.reinforcementState[0]!.checks.yielding!;
  assert.equal(yielding.status, "fail");
  assert.equal(criterion.demand, yielding.demand);
  assert.equal(criterion.capacity, yielding.capacity);
  assert.equal(criterion.utilizationRatio, yielding.utilizationRatio);
});

void test("D2. reinforcement rupture: FAIL with reinforcement-rupture from the failing sub-check", () => {
  const result = analyzeMasonryArchEquilibrium(
    equilibriumModel("assess-d2", {
      reinforcements: [
        {
          id: "PT",
          ...INTRA,
          area: 1e-6,
          elasticModulus: 200_000_000,
          initialForce: 0.25,
          // No assigned yield strength: this case isolates the tensile sub-check. When
          // a yield strength is also assigned and fails, the yielding criterion is
          // reported as well (covered by the simultaneous-criteria test).
          tensileStrength: 200_000,
          interaction: { type: "rigid-deviators", count: 3 },
          terminations: {
            left: { type: "distributed-anchorage", connectorCount: 1 },
            right: { type: "distributed-anchorage", connectorCount: 1 },
          },
        },
      ],
    }),
    { loadFactorsByCaseId: { G1: 1, G2: 1, Q1: 0.2 } },
  );
  const assessment = result.outputs.engineeringAssessment;
  assert.equal(assessment.status, "FAIL");
  assert.equal(result.status, "not-verified");
  assert.equal(assessment.failureMode, "reinforcement-failure");
  assert.deepEqual(kinds(assessment.failedCriteria), ["reinforcement-rupture"]);
  const criterion = assessment.failedCriteria[0]!;
  assert.equal(criterion.checkId, "reinforcement-tensile-strength");
  assert.deepEqual(criterion.entityIds, ["PT"]);
  const tensile = result.outputs.reinforcementState[0]!.checks.tensileFailure!;
  assert.equal(tensile.status, "fail");
  assert.equal(criterion.demand, tensile.demand);
  assert.equal(criterion.capacity, tensile.capacity);
  assert.equal(criterion.utilizationRatio, tensile.utilizationRatio);
});

void test("E. anchor capacity: FAIL with the anchor entity and its check data", () => {
  const result = analyzeMasonryArchEquilibrium(
    equilibriumModel("assess-e", {
      reinforcements: [
        {
          id: "PT",
          ...INTRA,
          area: 0.001,
          elasticModulus: 200_000_000,
          initialForce: 1,
          interaction: {
            type: "rigid-deviators",
            count: 3,
            capacity: { resultantResistance: 0.1, interactionRule: "independent" },
          },
          terminations: {
            left: { type: "distributed-anchorage", connectorCount: 1 },
            right: { type: "distributed-anchorage", connectorCount: 1 },
          },
        },
      ],
    }),
    { loadFactorsByCaseId: { G1: 1, G2: 1, Q1: 0.2 } },
  );
  const assessment = result.outputs.engineeringAssessment;
  assert.equal(assessment.status, "FAIL");
  assert.equal(result.status, "not-verified");
  assert.equal(assessment.failureMode, "anchor-capacity");
  assert.deepEqual(kinds(assessment.failedCriteria), ["anchor-capacity-reached"]);
  const criterion = assessment.failedCriteria[0]!;
  assert.deepEqual(criterion.entityIds, ["PT:D-001"]);
  assert.equal(criterion.lambda, 1);
  const anchor = result.outputs.anchorForces.find((item) => item.anchorId === "PT:D-001")!;
  assert.equal(anchor.status, "fail");
  assert.equal(criterion.demand, anchor.demand.resultant);
  assert.equal(criterion.capacity, anchor.capacity.resultant);
  assert.equal(criterion.utilizationRatio, anchor.utilizationRatio);
});

void test("F. bonded layer capacity: the failed criterion drives the result status to not-verified", () => {
  const result = analyzeMasonryArchEquilibrium(
    equilibriumModel("assess-f", {
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
      bondedLayers: [
        {
          id: "FRCM",
          family: "frcm",
          ...INTRA,
          area: 0.01,
          elasticModulus: 100_000_000,
          tensileStrength: 840,
          startStation: 0,
          endStation: 1,
          terminations: { left: { type: "anchored" }, right: { type: "anchored" } },
        },
      ],
    }),
    { hingeTolerance: 0.02 },
  );
  const assessment = result.outputs.engineeringAssessment;
  assert.equal(result.outputs.equilibrium.feasible, true);
  assert.equal(assessment.status, "FAIL");
  assert.equal(assessment.failureMode, "reinforcement-failure");
  assert.ok(assessment.failedCriteria.length > 0);
  for (const criterion of assessment.failedCriteria) {
    assert.equal(criterion.kind, "bonded-layer-capacity-reached");
    assert.equal(criterion.lambda, 1);
    assert.equal(criterion.entityIds.length, 2);
    assert.equal(criterion.entityIds[0], "FRCM");
    const interfaceState = result.outputs.bondedLayerState[0]!.interfaces.find(
      (item) => item.interfaceId === criterion.entityIds[1],
    )!;
    assert.equal(interfaceState.state, "at-capacity");
    assert.equal(criterion.demand, interfaceState.force);
    assert.equal(criterion.capacity, interfaceState.capacity);
    assert.equal(criterion.utilizationRatio, interfaceState.utilizationRatio);
  }
  // The engineering assessment is the single source of the design verdict: a failed criterion
  // produces a not-verified result status, never an ok status with a contradictory assessment.
  assert.equal(result.status, "not-verified");
});

void test("G. equilibrium infeasible: FAIL with the global criterion and no invented interface", () => {
  const result = analyzeMasonryArchEquilibrium(
    equilibriumModel("assess-g", {
      loads: [
        { id: "SW", type: "self-weight", loadCaseId: "G1" },
        {
          id: "Q",
          type: "patch",
          loadCaseId: "Q1",
          components: { x: 0, y: -200 },
          startStation: 0.05,
          endStation: 0.45,
        },
      ],
    }),
  );
  const assessment = result.outputs.engineeringAssessment;
  assert.equal(result.outputs.equilibrium.feasible, false);
  assert.equal(result.outputs.convergence.status, "optimal");
  assert.equal(assessment.status, "FAIL");
  assert.equal(result.status, "not-verified");
  assert.equal(assessment.failureMode, "undetermined");
  assert.equal(assessment.failedCriteria.length, 1);
  const criterion = assessment.failedCriteria[0]!;
  assert.equal(criterion.kind, "equilibrium-infeasible");
  assert.deepEqual(criterion.entityIds, []);
  assert.equal(criterion.lambda, 1);
  assert.equal(criterion.demand, null);
  assert.equal(criterion.capacity, null);
  assert.equal(criterion.utilizationRatio, null);
  // No hinge, no first out-of-thickness interface, and no maximum utilization may be promoted
  // to a certified causal entity for the global infeasibility.
  for (const hinge of result.outputs.hinges) {
    assert.ok(
      !assessment.failedCriteria.some((item) => item.entityIds.includes(hinge.interfaceId)),
    );
  }
});

void test("H. numerical failure: INDETERMINATE, never FAIL and never equilibrium-infeasible", () => {
  const result = analyzeMasonryArchEquilibrium(equilibriumModel("assess-h"), {
    loadFactorsByCaseId: { G1: 1, G2: 1, Q1: 0.2 },
    maxSimplexIterations: 1,
  });
  const assessment = result.outputs.engineeringAssessment;
  assert.equal(result.outputs.convergence.status, "iteration-limit");
  assert.equal(assessment.status, "INDETERMINATE");
  assert.equal(result.status, "failed");
  assert.deepEqual(assessment.failedCriteria, []);
  assert.equal(assessment.failureMode, null);
});

void test("coherence: compression failure shares the criterion kind and the asymmetry is explicit", () => {
  const equilibrium = analyzeMasonryArchEquilibrium(
    equilibriumModel("coherence-comp-eq", {
      interfaceLaw: { ...rigid, normal: { type: "no-tension", compressiveStrength: 300 } },
    }),
  );
  const path = designPath(
    pathModel({
      interfaceLaw: {
        ...deformable,
        normal: {
          ...deformable.normal,
          compressiveStrength: 310,
          postCrushingBehavior: "stop-at-onset",
        },
      },
    }),
  );
  const equilibriumAssessment = equilibrium.outputs.engineeringAssessment;
  const pathAssessment = path.outputs.engineeringAssessment;
  assert.equal(equilibriumAssessment.status, "FAIL");
  assert.equal(pathAssessment?.status, "FAIL");
  // The path identifies the violated condition with the shared taxonomy.
  assert.ok(kinds(pathAssessment.failedCriteria).includes("compression-strength-reached"));
  assert.equal(pathAssessment.failureMode, "masonry-crushing");
  // The assigned-state feasibility solver cannot attribute the global infeasibility to one
  // interface, so the equilibrium assessment reports the global criterion and never reuses the
  // relaxed representative utilization as a certified cause.
  assert.deepEqual(kinds(equilibriumAssessment.failedCriteria), ["equilibrium-infeasible"]);
  assert.equal(equilibriumAssessment.failureMode, "undetermined");
});

void test("coherence: equilibrium and path use the same reinforcement criterion kind", () => {
  const equilibrium = analyzeMasonryArchEquilibrium(
    equilibriumModel("coherence-reinf-eq", {
      reinforcements: [
        {
          id: "PT",
          ...INTRA,
          area: 1e-6,
          elasticModulus: 200_000_000,
          initialForce: 0.25,
          yieldStrength: 200_000,
          interaction: { type: "rigid-deviators", count: 3 },
          terminations: {
            left: { type: "distributed-anchorage", connectorCount: 1 },
            right: { type: "distributed-anchorage", connectorCount: 1 },
          },
        },
      ],
    }),
    { loadFactorsByCaseId: { G1: 1, G2: 1, Q1: 0.2 } },
  );
  const path = loadControlledDesignPath(
    pathModel({
      pointForce: { x: 0, y: 100 },
      reinforcements: [
        {
          id: "weak",
          ...INTRA,
          area: 0.001,
          elasticModulus: 200_000_000,
          initialForce: 0.5,
          yieldStrength: 100,
          interaction: { type: "rigid-deviators", count: 3 },
          terminations: {
            left: { type: "distributed-anchorage", connectorCount: 1 },
            right: { type: "distributed-anchorage", connectorCount: 1 },
          },
        },
      ],
    }),
  );
  assert.equal(equilibrium.outputs.engineeringAssessment.status, "FAIL");
  assert.equal(path.outputs.engineeringAssessment?.status, "FAIL");
  assert.ok(
    kinds(equilibrium.outputs.engineeringAssessment.failedCriteria).includes(
      "reinforcement-yielded",
    ),
  );
  assert.ok(
    kinds(path.outputs.engineeringAssessment?.failedCriteria ?? []).includes(
      "reinforcement-yielded",
    ),
  );
});

void test("coherence: equilibrium and path use the same anchor criterion kind", () => {
  const equilibrium = analyzeMasonryArchEquilibrium(
    equilibriumModel("coherence-anchor-eq", {
      reinforcements: [
        {
          id: "PT",
          ...INTRA,
          area: 0.001,
          elasticModulus: 200_000_000,
          initialForce: 1,
          interaction: {
            type: "rigid-deviators",
            count: 3,
            capacity: { resultantResistance: 0.1, interactionRule: "independent" },
          },
          terminations: {
            left: { type: "distributed-anchorage", connectorCount: 1 },
            right: { type: "distributed-anchorage", connectorCount: 1 },
          },
        },
      ],
    }),
    { loadFactorsByCaseId: { G1: 1, G2: 1, Q1: 0.2 } },
  );
  const path = loadControlledDesignPath(
    pathModel({
      pointForce: { x: 0, y: 100 },
      reinforcements: [
        {
          id: "PT",
          ...INTRA,
          area: 0.001,
          elasticModulus: 200_000_000,
          initialForce: 1,
          interaction: {
            type: "rigid-deviators",
            count: 3,
            capacity: { resultantResistance: 0.1, interactionRule: "independent" },
          },
          terminations: {
            left: { type: "distributed-anchorage", connectorCount: 1 },
            right: { type: "distributed-anchorage", connectorCount: 1 },
          },
        },
      ],
    }),
  );
  assert.ok(
    kinds(equilibrium.outputs.engineeringAssessment.failedCriteria).includes(
      "anchor-capacity-reached",
    ),
  );
  assert.ok(
    kinds(path.outputs.engineeringAssessment!.failedCriteria).includes("anchor-capacity-reached"),
  );
});

void test("coherence: equilibrium and path use the same bonded-layer criterion kind", () => {
  const equilibrium = analyzeMasonryArchEquilibrium(
    equilibriumModel("coherence-layer-eq", {
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
      bondedLayers: [
        {
          id: "FRCM",
          family: "frcm",
          ...INTRA,
          area: 0.01,
          elasticModulus: 100_000_000,
          tensileStrength: 840,
          startStation: 0,
          endStation: 1,
          terminations: { left: { type: "anchored" }, right: { type: "anchored" } },
        },
      ],
    }),
    { hingeTolerance: 0.02 },
  );
  const path = designPath(
    pathModel({
      pointForce: { x: 0, y: 100 },
      bondedLayers: [
        {
          id: "FRCM",
          family: "frcm",
          ...INTRA,
          area: 1e-6,
          elasticModulus: 100_000_000,
          tensileStrength: 1000,
          transferLength: 0.5,
          startStation: 0,
          endStation: 1,
          terminations: { left: { type: "anchored" }, right: { type: "anchored" } },
        },
      ],
    }),
  );
  assert.ok(
    kinds(equilibrium.outputs.engineeringAssessment.failedCriteria).includes(
      "bonded-layer-capacity-reached",
    ),
  );
  assert.ok(
    kinds(path.outputs.engineeringAssessment!.failedCriteria).includes(
      "bonded-layer-capacity-reached",
    ),
  );
});

void test("non-failure: an active bonded layer carrying force alone does not fail the equilibrium", () => {
  const result = analyzeMasonryArchEquilibrium(
    equilibriumModel("nonfailure-layer", {
      bondedLayers: [
        {
          id: "FRCM",
          family: "frcm",
          ...INTRA,
          area: 0.01,
          elasticModulus: 100_000_000,
          tensileStrength: 2_000_000,
          startStation: 0,
          endStation: 1,
          terminations: { left: { type: "anchored" }, right: { type: "anchored" } },
        },
      ],
    }),
    { loadFactorsByCaseId: { G1: 1, G2: 1, Q1: 0.2 } },
  );
  const layer = result.outputs.bondedLayerState[0]!;
  assert.ok(layer.maximumForce! > 0, "the bonded layer develops force");
  assert.ok(layer.interfaces.some((item) => item.state === "active"));
  assert.ok(layer.interfaces.every((item) => item.state !== "at-capacity"));
  assert.equal(result.outputs.engineeringAssessment.status, "PASS");
  assert.deepEqual(result.outputs.engineeringAssessment.failedCriteria, []);
  assert.equal(result.status, "ok");
});

void test("non-failure: joint opening and tendon activation never appear as failed criteria", () => {
  const result = designPath(
    pathModel({
      pointForce: { x: 0, y: -10 },
      reinforcements: [
        {
          id: "passive",
          ...INTRA,
          area: 0.001,
          elasticModulus: 200_000_000,
          initialForce: 0,
          interaction: { type: "rigid-deviators", count: 3 },
          terminations: {
            left: { type: "distributed-anchorage", connectorCount: 1 },
            right: { type: "distributed-anchorage", connectorCount: 1 },
          },
        },
      ],
    }),
  );
  const assessment = result.outputs.engineeringAssessment;
  assert.equal(assessment?.status, "PASS");
  assert.equal(result.status, "ok");
  assert.ok(result.outputs.events.some((event) => event.kind === "joint-opened"));
  assert.deepEqual(assessment.failedCriteria, []);
  assert.equal(assessment.failureMode, null);

  // When sliding fails a stronger uplift state, the activation events are not criteria either.
  // Under the default policy local plastic sliding is not a global failure: the explicit
  // stricter policy below is what turns it into failed criteria, and activation still never
  // becomes one.
  const failed = designPath(stabilizedUpliftModel(), {
    designFailureEvents: ["plastic-sliding"],
  });
  assert.equal(failed.outputs.engineeringAssessment?.status, "FAIL");
  assert.equal(failed.status, "not-verified");
  // Activation, joint opening, and slackening are not criterion kinds at the type level, so the
  // compiled taxonomy already guarantees they can never appear here.
  assert.ok(failed.outputs.engineeringAssessment.failedCriteria.length > 0);
  assert.ok(
    kinds(failed.outputs.engineeringAssessment.failedCriteria).every(
      (kind) => kind === "plastic-sliding",
    ),
  );
});

void test("P. local plastic sliding redistributes and the design still passes at lambda one", () => {
  const result = designPath(stabilizedUpliftModel());
  const assessment = result.outputs.engineeringAssessment;
  assert.equal(assessment?.status, "PASS");
  assert.equal(result.status, "ok");
  const slidingEvents = result.outputs.events.filter((event) => event.kind === "plastic-sliding");
  assert.ok(slidingEvents.length > 0, "local sliding occurs");
  for (const event of slidingEvents) {
    assert.ok(event.lambda !== null && event.lambda < 1, "sliding occurs before the design state");
  }
  assert.equal(assessment.lambda, 1);
  assert.deepEqual(assessment.failedCriteria, []);
  assert.equal(assessment.failureMode, null);
  assert.ok(
    result.outputs.events.some((event) => event.kind === "passive-tendon-activated"),
    "the passive tendon activates after redistribution",
  );
});

void test("P2. perfectly-plastic crushing continues and the design still passes at lambda one", () => {
  const result = designPath(
    pathModel({
      interfaceLaw: {
        ...deformable,
        normal: {
          ...deformable.normal,
          compressiveStrength: 310,
          postCrushingBehavior: "perfectly-plastic",
        },
      },
    }),
  );
  const assessment = result.outputs.engineeringAssessment;
  assert.equal(assessment?.status, "PASS");
  assert.equal(result.status, "ok");
  assert.ok(result.outputs.events.some((event) => event.kind === "crushing"));
  assert.ok(result.outputs.events.some((event) => event.kind === "compression-strength-reached"));
  assert.deepEqual(assessment.failedCriteria, []);
  assert.equal(assessment.failureMode, null);
});

void test("path design assessment reports the shared shape with lambda and requiredLambda", () => {
  const result = designPath(pathModel({ pointForce: { x: 0, y: -1 } }));
  const assessment = result.outputs.engineeringAssessment;
  assert.equal(assessment?.status, "PASS");
  assert.equal(result.status, "ok");
  assert.equal(assessment.requiredLambda, 1);
  assert.equal(assessment.lambda, 1);
  assert.deepEqual(assessment.failedCriteria, []);
  // The design assessment failure mode only ever describes a FAIL; the general path failure
  // mode keeps its own semantics and remains available on the outputs.
  assert.equal(assessment.failureMode, null);
  assert.equal(result.outputs.failureMode, "no-collapse-within-model");
  assert.equal(result.metadata.schemaVersion, "11.0.0");
});

void test("D3. reinforcement rupture from both sub-checks preserves one criterion per check", () => {
  const result = analyzeMasonryArchEquilibrium(
    equilibriumModel("assess-d3", {
      reinforcements: [
        {
          id: "PT",
          ...INTRA,
          area: 1e-6,
          elasticModulus: 200_000_000,
          initialForce: 0.25,
          tensileStrength: 150_000,
          ultimateStrain: 1e-4,
          interaction: { type: "rigid-deviators", count: 3 },
          terminations: {
            left: { type: "distributed-anchorage", connectorCount: 1 },
            right: { type: "distributed-anchorage", connectorCount: 1 },
          },
        },
      ],
    }),
    { loadFactorsByCaseId: { G1: 1, G2: 1, Q1: 0.2 } },
  );
  const assessment = result.outputs.engineeringAssessment;
  assert.equal(assessment.status, "FAIL");
  assert.equal(result.status, "not-verified");
  assert.equal(assessment.failureMode, "reinforcement-failure");
  assert.deepEqual(kinds(assessment.failedCriteria), [
    "reinforcement-rupture",
    "reinforcement-rupture",
  ]);
  const byCheck = new Map(assessment.failedCriteria.map((item) => [item.checkId, item] as const));
  const tensile = byCheck.get("reinforcement-tensile-strength")!;
  const ultimate = byCheck.get("reinforcement-ultimate-strain")!;
  assert.equal(tensile.entityIds[0], "PT");
  assert.equal(ultimate.entityIds[0], "PT");
  assert.equal(tensile.demand, 250_000);
  assert.equal(tensile.capacity, 150_000);
  assert.ok(tensile.utilizationRatio! > 1);
  assert.equal(ultimate.demand, 0.00125);
  assert.equal(ultimate.capacity, 1e-4);
  assert.ok(ultimate.utilizationRatio! > 1);
});

void test("N. simultaneously violated reinforcement criteria are all preserved", () => {
  const result = analyzeMasonryArchEquilibrium(
    equilibriumModel("assess-n", {
      reinforcements: [
        {
          id: "PT",
          ...INTRA,
          area: 1e-6,
          elasticModulus: 200_000_000,
          initialForce: 0.25,
          yieldStrength: 100_000,
          tensileStrength: 150_000,
          ultimateStrain: 1e-4,
          interaction: { type: "rigid-deviators", count: 3 },
          terminations: {
            left: { type: "distributed-anchorage", connectorCount: 1 },
            right: { type: "distributed-anchorage", connectorCount: 1 },
          },
        },
      ],
    }),
    { loadFactorsByCaseId: { G1: 1, G2: 1, Q1: 0.2 } },
  );
  const assessment = result.outputs.engineeringAssessment;
  assert.equal(assessment.status, "FAIL");
  assert.equal(result.status, "not-verified");
  // Yielding and tensile/ultimate-strain rupture belong to the same reinforcement family: the
  // family resolves to its most advanced mode instead of counting criteria and reporting mixed.
  assert.equal(assessment.failureMode, "reinforcement-failure");
  assert.deepEqual(kinds(assessment.failedCriteria), [
    "reinforcement-yielded",
    "reinforcement-rupture",
    "reinforcement-rupture",
  ]);
  assert.deepEqual(
    assessment.failedCriteria.map((item) => item.checkId),
    [
      "reinforcement-yield-stress",
      "reinforcement-tensile-strength",
      "reinforcement-ultimate-strain",
    ],
  );
  for (const criterion of assessment.failedCriteria) {
    assert.ok(criterion.demand !== null);
    assert.ok(criterion.capacity !== null);
    assert.ok(criterion.utilizationRatio !== null);
  }
});

void test("J. numerical and observable event kinds cannot be configured as design failures", () => {
  const model = pathModel();
  analyzeMasonryArchPath(model, {
    units: { force: "kN", length: "m" },
    analysisObjective: "design-state-check",
    scalableLoadCaseIds: ["Q"],
    // @ts-expect-error convergence-lost is a numerical-failure event kind and can never be a design failure criterion.
    designFailureEvents: ["convergence-lost"],
  });
  analyzeMasonryArchPath(model, {
    units: { force: "kN", length: "m" },
    analysisObjective: "design-state-check",
    scalableLoadCaseIds: ["Q"],
    // @ts-expect-error joint-opened is an observable event kind and can never be a design failure criterion.
    designFailureEvents: ["joint-opened"],
  });
  // Physical-limit kinds remain the only valid design failure configuration.
  const result = analyzeMasonryArchPath(model, {
    units: { force: "kN", length: "m" },
    analysisObjective: "design-state-check",
    scalableLoadCaseIds: ["Q"],
    designFailureEvents: ["plastic-sliding"],
  });
  assert.ok(
    result.outputs.engineeringAssessment?.status === "PASS" ||
      result.outputs.engineeringAssessment?.status === "FAIL",
  );
});

void test("L. a passive extrados tendon activates during the path and the design still passes at lambda one", () => {
  const result = designPath(
    pathModel({
      pointForce: { x: 0, y: -40 },
      reinforcements: [
        {
          id: "passive-extrados",
          side: "extrados",
          area: 0.001,
          elasticModulus: 200_000_000,
          initialForce: 0,
          interaction: { type: "unilateral-contact", segmentCount: 12 },
          terminations: {
            left: { type: "distributed-anchorage", connectorCount: 1 },
            right: { type: "distributed-anchorage", connectorCount: 1 },
          },
        },
      ],
    }),
  );
  const assessment = result.outputs.engineeringAssessment;
  assert.equal(assessment?.status, "PASS");
  assert.equal(result.status, "ok");
  assert.equal(assessment.lambda, 1);
  assert.equal(assessment.failureMode, null);
  assert.equal(assessment.failedCriteria.length, 0);
  const activation = result.outputs.events.find(
    (event) => event.kind === "passive-tendon-activated",
  );
  assert.ok(activation !== undefined, "the passive extrados tendon activates");
  assert.ok(activation.lambda! < 1, "activation occurs before the design state");
  // Activation is an observable event kind and is not part of the criterion taxonomy; the
  // compiled types guarantee it can never appear in failedCriteria.
  const finalState = result.outputs.steps.at(-1)!.state;
  const passive = finalState.reinforcementState.find(
    (item) => item.reinforcementId === "passive-extrados",
  )!;
  assert.equal(passive.state, "active-passive");
  assert.ok(passive.force > 0);
});

void test("O1. stop-at-onset path criteria copy the step's deformable-interface check", () => {
  const result = designPath(
    pathModel({
      interfaceLaw: {
        ...deformable,
        normal: {
          ...deformable.normal,
          compressiveStrength: 310,
          postCrushingBehavior: "stop-at-onset",
        },
      },
    }),
  );
  const assessment = result.outputs.engineeringAssessment;
  assert.equal(assessment?.status, "FAIL");
  assert.equal(result.status, "not-verified");
  // The terminal stop-at-onset step keeps both identified limits: the terminal crushing event
  // and the compression-strength-reached event of the same step.
  assert.ok(kinds(assessment.failedCriteria).includes("compression-strength-reached"));
  assert.ok(kinds(assessment.failedCriteria).includes("crushing"));
  assert.equal(assessment.failureMode, "masonry-crushing");
  const criterion = assessment.failedCriteria.find(
    (item) => item.kind === "compression-strength-reached",
  )!;
  assert.ok(criterion !== undefined);
  const event = result.outputs.events.find((item) => item.kind === "compression-strength-reached")!;
  const step = result.outputs.steps.find((item) => item.step === event.step)!;
  const interfaceState = step.state.interfaces.find(
    (item) => item.interfaceId === event.entityIds[0],
  )!;
  // The criterion is the exact copy of the check the deformable-interface law published.
  const check = interfaceState.checks.compression!;
  assert.ok(check !== null);
  assert.equal(criterion.checkId, check.criterion);
  assert.equal(criterion.checkId, "deformable-interface-compression-strength");
  assert.equal(criterion.demand, check.demand);
  assert.equal(criterion.capacity, check.capacity);
  assert.equal(criterion.utilizationRatio, check.utilizationRatio);
  assert.equal(check.capacity, 310);
  // The criterion reports the mobilized demand (clipped stress), never the trial predictor:
  // the trial crossed the limit while the mobilized demand stays at or below the capacity.
  assert.ok(check.trialDemand >= 310 * (1 - 1e-9));
  assert.ok(check.demand <= check.capacity);
  assert.ok(check.utilizationRatio! <= 1 + 1e-12);
});

void test("O2a. under an explicit stricter policy the path sliding criteria copy the step's Coulomb check", () => {
  const result = designPath(stabilizedUpliftModel(), {
    designFailureEvents: ["plastic-sliding"],
  });
  const assessment = result.outputs.engineeringAssessment;
  assert.equal(assessment?.status, "FAIL");
  assert.equal(result.status, "not-verified");
  const slidingCriteria = assessment.failedCriteria.filter(
    (item) => item.kind === "plastic-sliding",
  );
  assert.ok(slidingCriteria.length > 0);
  for (const criterion of slidingCriteria) {
    // The criterion is the exact copy of the Coulomb check the deformable-interface law
    // published at the event's own converged step; no consumer recomputes the capacity.
    assert.equal(criterion.checkId, "coulomb-friction");
    const event = result.outputs.events.find(
      (item) => item.kind === "plastic-sliding" && item.entityIds[0] === criterion.entityIds[0],
    )!;
    const step = result.outputs.steps.find((item) => item.step === event.step)!;
    const interfaceState = step.state.interfaces.find(
      (item) => item.interfaceId === criterion.entityIds[0],
    )!;
    const frictionCheck = interfaceState.checks.friction!;
    assert.ok(frictionCheck !== null, "the elastic-Coulomb law publishes its friction check");
    assert.equal(criterion.demand, frictionCheck.demand);
    assert.equal(criterion.capacity, frictionCheck.capacity);
    assert.equal(criterion.utilizationRatio, frictionCheck.utilizationRatio);
    assert.equal(frictionCheck.demand, Math.abs(interfaceState.shearForce));
    assert.equal(frictionCheck.capacity, 0.5 * interfaceState.normalForce);
    assert.ok(frictionCheck.demand <= frictionCheck.capacity);
  }
});

void test("O2b. path reinforcement criteria copy the step's check data", () => {
  const result = loadControlledDesignPath(
    pathModel({
      pointForce: { x: 0, y: 100 },
      reinforcements: [
        {
          id: "weak",
          ...INTRA,
          area: 0.001,
          elasticModulus: 200_000_000,
          initialForce: 0.5,
          yieldStrength: 100,
          interaction: { type: "rigid-deviators", count: 3 },
          terminations: {
            left: { type: "distributed-anchorage", connectorCount: 1 },
            right: { type: "distributed-anchorage", connectorCount: 1 },
          },
        },
      ],
    }),
  );
  const assessment = result.outputs.engineeringAssessment;
  assert.equal(assessment?.status, "FAIL");
  const yielded = assessment.failedCriteria.find((item) => item.kind === "reinforcement-yielded")!;
  assert.equal(yielded.checkId, "reinforcement-yield-stress");
  const yieldEvent = result.outputs.events.find((item) => item.kind === "reinforcement-yielded")!;
  const yieldStep = result.outputs.steps.find((item) => item.step === yieldEvent.step)!;
  const reinforcementState = yieldStep.state.reinforcementState.find(
    (item) => item.reinforcementId === "weak",
  )!;
  const yieldingCheck = reinforcementState.checks.yielding!;
  assert.equal(yielded.demand, yieldingCheck.demand);
  assert.equal(yielded.capacity, yieldingCheck.capacity);
  assert.equal(yielded.utilizationRatio, yieldingCheck.utilizationRatio);
  // The terminal yield step also identifies plastic sliding at the same step: both physical
  // families are reported as criteria and the global mode mixes the two distinct families.
  assert.ok(kinds(assessment.failedCriteria).includes("plastic-sliding"));
  assert.equal(assessment.failureMode, "mixed");
});

void test("O3. path anchor and bonded-layer criteria carry step-coherent numeric data", () => {
  const anchorResult = loadControlledDesignPath(
    pathModel({
      pointForce: { x: 0, y: 100 },
      reinforcements: [
        {
          id: "PT",
          ...INTRA,
          area: 0.001,
          elasticModulus: 200_000_000,
          initialForce: 1,
          interaction: {
            type: "rigid-deviators",
            count: 3,
            capacity: { resultantResistance: 0.1, interactionRule: "independent" },
          },
          terminations: {
            left: { type: "distributed-anchorage", connectorCount: 1 },
            right: { type: "distributed-anchorage", connectorCount: 1 },
          },
        },
      ],
    }),
  );
  const anchorAssessment = anchorResult.outputs.engineeringAssessment;
  assert.equal(anchorAssessment?.status, "FAIL");
  const anchorCriterion = anchorAssessment.failedCriteria.find(
    (item) => item.kind === "anchor-capacity-reached",
  )!;
  const anchorEvent = anchorResult.outputs.events.find(
    (item) => item.kind === "anchor-capacity-reached",
  )!;
  const anchorStep = anchorResult.outputs.steps.find((item) => item.step === anchorEvent.step)!;
  const anchor = anchorStep.state.anchorForces.find(
    (item) => item.anchorId === anchorCriterion.entityIds[0],
  )!;
  assert.equal(anchorCriterion.demand, anchor.demand.resultant);
  assert.equal(anchorCriterion.capacity, anchor.capacity.resultant);
  assert.equal(anchorCriterion.utilizationRatio, anchor.utilizationRatio);

  const layerResult = loadControlledDesignPath(
    pathModel({
      pointForce: { x: 0, y: 100 },
      bondedLayers: [
        {
          id: "FRCM",
          family: "frcm",
          ...INTRA,
          area: 1e-6,
          elasticModulus: 100_000_000,
          tensileStrength: 1000,
          transferLength: 0.5,
          startStation: 0,
          endStation: 1,
          terminations: { left: { type: "anchored" }, right: { type: "anchored" } },
        },
      ],
    }),
  );
  const layerAssessment = layerResult.outputs.engineeringAssessment;
  assert.equal(layerAssessment?.status, "FAIL");
  const layerCriterion = layerAssessment.failedCriteria.find(
    (item) => item.kind === "bonded-layer-capacity-reached",
  )!;
  const layerEvent = layerResult.outputs.events.find(
    (item) => item.kind === "bonded-layer-capacity-reached",
  )!;
  const layerStep = layerResult.outputs.steps.find((item) => item.step === layerEvent.step)!;
  const layerInterface = layerStep.state.bondedLayerState
    .find((item) => item.reinforcementId === "FRCM")!
    .interfaces.find((item) => item.interfaceId === layerCriterion.entityIds[1])!;
  assert.equal(layerCriterion.demand, layerInterface.force);
  assert.equal(layerCriterion.capacity, layerInterface.capacity);
  assert.equal(layerCriterion.utilizationRatio, layerInterface.utilizationRatio);
});

void test("R1. strict sliding policy preserves the default design-failure set", () => {
  // The configured kinds ADD to the always-active default set. This model reaches the bonded
  // layer capacity during the fixed preload and never slides: under a replace semantics the
  // strict sliding configuration would have removed every default failure, the path would have
  // continued past the bonded-layer limit, and the design would have PASSed at lambda one.
  const result = designPath(bondedLayerCapacityPathModel(), {
    designFailureEvents: ["plastic-sliding"],
  });
  const assessment = result.outputs.engineeringAssessment;
  assert.equal(assessment?.status, "FAIL");
  assert.equal(result.status, "not-verified");
  assert.ok(
    kinds(assessment.failedCriteria).includes("bonded-layer-capacity-reached"),
    "the preserved default failure drives the verdict",
  );
  assert.ok(
    result.outputs.events.every((event) => event.kind !== "plastic-sliding"),
    "no plastic sliding occurs, so the FAIL can only come from the preserved default set",
  );
});

void test("R2. bonded layer capacity reached remains a failure under the strict sliding policy", () => {
  const result = designPath(bondedLayerCapacityPathModel(), {
    designFailureEvents: ["plastic-sliding"],
  });
  const assessment = result.outputs.engineeringAssessment;
  assert.equal(assessment?.status, "FAIL");
  assert.equal(result.status, "not-verified");
  assert.ok(kinds(assessment.failedCriteria).includes("bonded-layer-capacity-reached"));
  assert.equal(assessment.failureMode, "reinforcement-failure");
  assert.equal(
    result.outputs.convergenceInfo.termination,
    "engineering-limit",
    "the default bonded-layer failure still terminates the path",
  );
});

void test("R3. an empty designFailureEvents array keeps every default failure active", () => {
  // An empty configuration is a no-op addition, not a request to disable the default set.
  const result = designPath(bondedLayerCapacityPathModel(), {
    designFailureEvents: [],
  });
  const assessment = result.outputs.engineeringAssessment;
  assert.equal(assessment?.status, "FAIL");
  assert.equal(result.status, "not-verified");
  assert.ok(kinds(assessment.failedCriteria).includes("bonded-layer-capacity-reached"));
});

void test("R4. terminal physical events remain failures regardless of designFailureEvents", () => {
  // Terminal events fail on their own, independent of the configured set: even an empty
  // configuration cannot disable them.
  const result = designPath(
    pathModel({
      interfaceLaw: {
        ...deformable,
        normal: {
          ...deformable.normal,
          compressiveStrength: 310,
          postCrushingBehavior: "stop-at-onset",
        },
      },
    }),
    { designFailureEvents: [] },
  );
  const assessment = result.outputs.engineeringAssessment;
  assert.equal(assessment?.status, "FAIL");
  assert.equal(result.status, "not-verified");
  assert.ok(kinds(assessment.failedCriteria).includes("crushing"));
  assert.ok(kinds(assessment.failedCriteria).includes("compression-strength-reached"));
  assert.equal(result.outputs.convergenceInfo.termination, "terminal-physical-event");
});
