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

function designPath(model: ReturnType<typeof pathModel>) {
  return analyzeMasonryArchPath(model, {
    units: { force: "kN", length: "m" },
    analysisObjective: "design-state-check",
    scalableLoadCaseIds: ["Q"],
    equilibriumTolerance: 1e-7,
    maxIterations: 50,
    maxSteps: 200,
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
  assert.equal(result.metadata.schemaVersion, "3.0.0");
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
  assert.equal(assessment.failureMode, "reinforcement-yield");
  assert.equal(assessment.failedCriteria.length, 1);
  const criterion = assessment.failedCriteria[0]!;
  assert.equal(criterion.kind, "reinforcement-yielded");
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
          yieldStrength: 200_000,
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
  assert.equal(assessment.failureMode, "reinforcement-failure");
  assert.deepEqual(kinds(assessment.failedCriteria), ["reinforcement-rupture"]);
  const criterion = assessment.failedCriteria[0]!;
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

void test("F. bonded layer capacity: FAIL through the shared criterion while the result status is preserved", () => {
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
  // The pre-existing top-level gate does not include bonded-layer capacity; the assessment now
  // carries that verdict while the result-level status intentionally preserves prior behavior.
  assert.equal(result.status, "ok");
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
  const path = designPath(
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
  const path = designPath(
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
  assert.ok(result.outputs.events.some((event) => event.kind === "joint-opened"));
  assert.deepEqual(assessment.failedCriteria, []);

  // When sliding fails a stronger uplift state, the activation events are not criteria either.
  const failed = designPath(
    pathModel({
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
    }),
  );
  assert.equal(failed.outputs.engineeringAssessment?.status, "FAIL");
  assert.ok(failed.outputs.events.some((event) => event.kind === "passive-tendon-activated"));
  for (const criterion of failed.outputs.engineeringAssessment?.failedCriteria ?? []) {
    assert.ok(criterion.kind !== "passive-tendon-activated");
    assert.ok(criterion.kind !== "joint-opened");
    assert.ok(criterion.kind !== "tendon-slackened");
  }
});

void test("path design assessment reports the shared shape with lambda and requiredLambda", () => {
  const result = designPath(pathModel({ pointForce: { x: 0, y: -1 } }));
  const assessment = result.outputs.engineeringAssessment;
  assert.equal(assessment?.status, "PASS");
  assert.equal(assessment.requiredLambda, 1);
  assert.equal(assessment.lambda, 1);
  assert.deepEqual(assessment.failedCriteria, []);
  assert.equal(assessment.failureMode, "no-collapse-within-model");
  assert.equal(result.metadata.schemaVersion, "5.0.0");
});
