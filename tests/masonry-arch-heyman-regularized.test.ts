import assert from "node:assert/strict";
import test from "node:test";

import {
  createUnitResolver,
  evaluateRigidBlockDeformableInterface2D,
  normalizeMasonryInterfaceLaw,
  type EvaluateRigidBlockDeformableInterface2DInput,
} from "structural-checks-ts-migration-workspace";
import {
  analyzeMasonryArchPath,
  analyzeMasonryArchVerification,
  createMasonryArch,
  type AnalyzeMasonryArchPathOptions,
  type ArchReinforcementInput,
  type BondedLayerReinforcementInput,
  type MasonryArchLoadInput,
  type MasonryDeformableInterfaceLawInput,
} from "structural-checks-ts-migration-workspace/applications/masonry-arches";

/**
 * Regularized Heyman-type deformable interface model.
 *
 * Masonry: no tension, UNBOUNDED compression strength (compressiveStrength omitted), and an
 * elastic tangential response WITHOUT any Coulomb sliding surface (elastic-unbounded, finite G).
 * The model is not the classical rigid-plastic Heyman model: elastic normal/tangential
 * regularization with finite E and G and finite rigid-block kinematics are retained, and all
 * reinforcement, branch-turning, arc-length, and corrector machinery stays operative. Stresses
 * remain response quantities: with no assigned masonry resistance limits the corresponding
 * utilizations are null, never 0, 1, or a huge pseudo-capacity.
 *
 * The fixtures mirror the existing design-check and passive-intrados regression fixtures so the
 * same pipeline is exercised with only the masonry resistance limits removed.
 */

// ---------------------------------------------------------------------------
// Law factories and model fixture
// ---------------------------------------------------------------------------

function heymanLaw(): MasonryDeformableInterfaceLawInput {
  return {
    response: "deformable",
    normal: {
      type: "elastic-no-tension",
      elasticModulus: 1_000_000,
      characteristicLength: 0.5,
      integrationPointCount: 8,
      // No compressiveStrength: unbounded compression strength by existing contract.
    },
    tangential: {
      type: "elastic-unbounded",
      shearModulus: 400_000,
      characteristicLength: 0.5,
    },
  };
}

function coulombLaw(frictionCoefficient: number): MasonryDeformableInterfaceLawInput {
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
      frictionCoefficient,
      cohesion: 0,
      flowRule: { type: "non-associated", dilationAngle: 0 },
    },
  };
}

const INTRA = { side: "intrados" } as const;

function tendon(
  overrides: {
    readonly initialForce?: number;
    readonly tensileStrength?: number;
    readonly yieldStrength?: number;
  } = {},
): ArchReinforcementInput {
  const tensileStrength = overrides.tensileStrength ?? 550_000;
  const yieldStrength =
    overrides.yieldStrength ?? (tensileStrength < 450_000 ? tensileStrength - 0.1 : 450_000);
  return {
    id: "P",
    ...INTRA,
    area: 0.001,
    elasticModulus: 200_000_000,
    initialForce: overrides.initialForce ?? 0,
    yieldStrength,
    tensileStrength,
    topology: {
      type: "open",
      left: { type: "arch-anchor", station: 0 },
      right: { type: "arch-anchor", station: 1 },
      deviators: { type: "uniform-count", count: 1 },
    },
  };
}

const bondedLayer: BondedLayerReinforcementInput = {
  id: "FRCM",
  family: "frcm",
  side: "intrados",
  area: 1e-3,
  elasticModulus: 100_000_000,
  tensileStrength: 30_000,
  startStation: 0,
  endStation: 1,
};

function arch(
  id: string,
  options: {
    readonly law: MasonryDeformableInterfaceLawInput;
    readonly loads: readonly MasonryArchLoadInput[];
    readonly reinforcements?: readonly ArchReinforcementInput[];
    readonly bondedLayers?: readonly BondedLayerReinforcementInput[];
    readonly voussoirCount?: number;
  },
) {
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
      voussoirCount: options.voussoirCount ?? 7,
    },
    masonry: { unitWeight: 20 },
    interfaceLaw: options.law,
    loads: options.loads,
    reinforcements: options.reinforcements ?? [],
    bondedLayers: options.bondedLayers ?? [],
  });
}

const designOptions: AnalyzeMasonryArchPathOptions = {
  units: { force: "kN", length: "m" },
  analysisObjective: "design-state-check",
  scalableLoadCaseIds: ["Q"],
  equilibriumTolerance: 1e-7,
  maxIterations: 80,
  maxSteps: 400,
};

function crownLoads(force: number): readonly MasonryArchLoadInput[] {
  return [
    { id: "SW", type: "self-weight", loadCaseId: "G" },
    { id: "Q", type: "point", loadCaseId: "Q", station: 0.5, force: { x: 0, y: -force } },
  ];
}

/**
 * Uplift crown load: rotating the voussoirs apart lengthens the intrados path, which is the
 * compatibility mechanism that activates a passive intrados tendon under the regularized
 * Heyman-type law (the sliding-driven mechanism of the finite-Coulomb benchmark does not
 * exist without a Coulomb surface).
 */
function crownUpliftLoads(force: number): readonly MasonryArchLoadInput[] {
  return [
    { id: "SW", type: "self-weight", loadCaseId: "G" },
    { id: "Q", type: "point", loadCaseId: "Q", station: 0.5, force: { x: 0, y: force } },
  ];
}

function halfPatchLoads(intensity: number): readonly MasonryArchLoadInput[] {
  return [
    { id: "SW", type: "self-weight", loadCaseId: "G" },
    {
      id: "Q",
      type: "patch",
      loadCaseId: "Q",
      components: { x: 0, y: -intensity },
      startStation: 0,
      endStation: 0.5,
    },
  ];
}

function halfPatchUpliftLoads(intensity: number): readonly MasonryArchLoadInput[] {
  return [
    { id: "SW", type: "self-weight", loadCaseId: "G" },
    {
      id: "Q",
      type: "patch",
      loadCaseId: "Q",
      components: { x: 0, y: intensity },
      startStation: 0,
      endStation: 0.5,
    },
  ];
}

function benchmarkPatchLoads(intensity: number): readonly MasonryArchLoadInput[] {
  return [
    { id: "SW", type: "self-weight", loadCaseId: "G" },
    {
      id: "Q",
      type: "patch",
      loadCaseId: "Q",
      components: { x: 0, y: -intensity },
      startStation: 0.05,
      endStation: 0.45,
    },
  ];
}

function benchmarkPatchUpliftLoads(intensity: number): readonly MasonryArchLoadInput[] {
  return [
    { id: "SW", type: "self-weight", loadCaseId: "G" },
    {
      id: "Q",
      type: "patch",
      loadCaseId: "Q",
      components: { x: 0, y: intensity },
      startStation: 0.05,
      endStation: 0.45,
    },
  ];
}

// ---------------------------------------------------------------------------
// A. Normalization of the elastic-unbounded tangential law
// ---------------------------------------------------------------------------

void test("A. normalizing elastic-unbounded keeps friction null and finite shear parameters", () => {
  const resolver = createUnitResolver({ force: "kN", length: "m" }, { force: "N", length: "m" });
  const law = normalizeMasonryInterfaceLaw(heymanLaw(), resolver, "interfaceLaw");
  assert.equal(law.response, "deformable");
  // No invented mu, cohesion, or friction capacity: null is the semantic.
  assert.equal(law.friction, null);
  assert.equal(law.compressiveStrength, null);
  assert.ok(law.deformability !== null);
  assert.equal(law.deformability.tangential.shearModulus, 400_000_000);
  assert.equal(law.deformability.tangential.characteristicLength, 0.5);
});

// ---------------------------------------------------------------------------
// B-D. Direct constitutive evaluation of the elastic-unbounded response
// ---------------------------------------------------------------------------

const GEOMETRY = {
  id: "J",
  index: 0,
  midpoint: { x: 0, y: 0 },
  chainTangent: { x: 1, y: 0 },
  jointAxis: { x: 0, y: 1 },
  length: 1,
  outOfPlaneWidth: 1,
} as const;

const BLOCK = {
  id: "B",
  index: 0,
  polygon: [
    { x: -1, y: -1 },
    { x: 1, y: -1 },
    { x: 1, y: 1 },
    { x: -1, y: 1 },
  ],
  area: 4,
  centroid: { x: 0, y: 0 },
  outOfPlaneWidth: 1,
  volume: 4,
  leftInterfaceId: "J",
  rightInterfaceId: "J",
} as const;

function evaluateUnbounded(translation: { readonly x: number; readonly y: number }) {
  const input: EvaluateRigidBlockDeformableInterface2DInput = {
    geometry: GEOMETRY,
    left: null,
    right: {
      block: BLOCK,
      displacement: { blockId: "B", translation, rotation: 0 },
    },
    law: {
      normal: {
        elasticModulus: 2_000,
        characteristicLength: 1,
        compressiveStrength: null,
        integrationPointCount: 4,
        postCrushingBehavior: "stop-at-onset",
      },
      tangential: {
        type: "elastic-unbounded",
        shearModulus: 1_000,
        characteristicLength: 1,
      },
    },
    committedState: null,
    computeTangent: false,
  };
  return evaluateRigidBlockDeformableInterface2D(input);
}

void test("B. elastic-unbounded publishes nonzero shear traction for nonzero tangential slip", () => {
  // tau = Kt * delta_t with Kt = G / h * area = 1000 N/m; delta_t = -0.05 m.
  const result = evaluateUnbounded({ x: -0.1, y: -0.05 });
  assert.equal(result.normalForce, 200);
  assert.equal(result.shearForce, 50);
  assert.equal(result.shearStress, 50);
  assert.equal(result.sliding, false, "no sliding surface exists");
  assert.equal(result.trialState.plasticSlip, 0, "no plastic slip is accumulated");
  assert.ok(Number.isFinite(result.shearStress));
});

void test("C. elastic-unbounded has no friction or sliding utilization", () => {
  const result = evaluateUnbounded({ x: -0.1, y: -0.05 });
  assert.equal(result.frictionUtilization, null);
  assert.equal(result.checks.friction, null);
  const fiber = result.fibers[0]!;
  assert.equal(fiber.frictionCapacity, null);
  assert.equal(fiber.sliding, false);
});

void test("D. unbounded compression publishes stresses with null compression utilization", () => {
  const result = evaluateUnbounded({ x: -0.1, y: -0.05 });
  // Compression stresses are finite response quantities ...
  assert.equal(result.compressionAtIntrados, 200);
  assert.equal(result.compressionAtExtrados, 200);
  assert.equal(result.maxCompression, 200);
  // ... but no compression capacity exists, so the utilization is null, never 0/1/Infinity.
  assert.equal(result.checks.compression, null);
  assert.equal(result.crushing, false);
});

// ---------------------------------------------------------------------------
// E-F. Event absence for the simplified masonry limits
// ---------------------------------------------------------------------------

void test("E. no sliding events are generated with the elastic-unbounded law", () => {
  const result = analyzeMasonryArchPath(
    arch("heyman-no-sliding", {
      law: heymanLaw(),
      loads: halfPatchLoads(20),
      reinforcements: [tendon()],
    }),
    designOptions,
  );
  for (const event of result.outputs.events) {
    assert.notEqual(event.kind, "sliding-started");
    assert.notEqual(event.kind, "plastic-sliding");
  }
  // No sliding surface exists, so no interface ever reports sliding.
  for (const step of result.outputs.steps) {
    for (const item of step.state.interfaces) {
      assert.equal(item.sliding, false);
    }
  }
});

void test("F. no crushing events are generated without a compressive strength", () => {
  const result = analyzeMasonryArchPath(
    arch("heyman-no-crushing", {
      law: heymanLaw(),
      loads: crownLoads(10),
      voussoirCount: 9,
    }),
    designOptions,
  );
  assert.equal(result.outputs.engineeringAssessment?.status, "PASS");
  for (const event of result.outputs.events) {
    assert.notEqual(event.kind, "compression-strength-reached");
    assert.notEqual(event.kind, "crushing");
  }
  // The masonry limits removed from the model are not invented back: no masonry capacity is
  // published at any interface of any state.
  for (const step of result.outputs.steps) {
    for (const item of step.state.interfaces) {
      assert.equal(item.crushing, false);
      assert.equal(item.checks.compression, null);
      assert.equal(item.checks.friction, null);
      assert.equal(item.frictionUtilization, null);
    }
  }
});

// ---------------------------------------------------------------------------
// G. Passive tendon through the ordinary verification façade
// ---------------------------------------------------------------------------

void test("G. passive tendon + Heyman-type: arc-length, activation, lambda one PASS", () => {
  const result = analyzeMasonryArchVerification(
    arch("heyman-passive", {
      law: heymanLaw(),
      loads: crownUpliftLoads(200),
      reinforcements: [tendon({ initialForce: 0 })],
    }),
    {
      units: { force: "kN", length: "m" },
      scalableLoadCaseIds: ["Q"],
      equilibriumTolerance: 1e-7,
      maxIterations: 80,
      maxSteps: 400,
    },
  );
  // The deformable law selects the existing arc-length route; no new Heyman solver exists.
  assert.equal(result.outputs.route, "arc-length-continuation");
  assert.equal(result.outputs.engineeringAssessment.status, "PASS");
  assert.equal(result.outputs.engineeringAssessment.lambda, 1);
  assert.equal(result.outputs.failureMode, null);
  assert.equal(result.outputs.lambdaVerificationLimit, null);
  // Exact lambda = 1 design state is certified by the corrector.
  const designState = result.outputs.significantStates.designState;
  assert.ok(designState !== null);
  assert.equal(designState.source, "path-step");
  const designStep = result.outputs.subAnalyses.path?.outputs.steps.find(
    (step) => step.step === designState.step,
  );
  assert.ok(designStep !== undefined);
  assert.ok(Math.abs(designStep.state.lambda - 1) <= 1e-12);

  // The tendon is genuinely passive and activates by compatibility before lambda one.
  const pathOutputs = result.outputs.subAnalyses.path!.outputs;
  const activation = pathOutputs.events.find((event) => event.kind === "passive-tendon-activated");
  assert.ok(activation !== undefined, "passive-tendon-activated event expected");
  assert.equal(activation.category, "observable-event");
  assert.deepEqual(activation.entityIds, ["P"]);
  assert.ok(activation.lambda !== null && activation.lambda > 0 && activation.lambda < 1);

  const beforeActivation = pathOutputs.steps.find((step) => step.step === activation.step! - 1)!
    .state.reinforcementState[0]!;
  assert.equal(beforeActivation.initialForce, 0);
  assert.equal(beforeActivation.force, 0);
  assert.equal(beforeActivation.state, "slack");

  const finalState = pathOutputs.steps.at(-1)!.state.reinforcementState[0]!;
  assert.equal(finalState.initialForce, 0);
  assert.ok(finalState.force > 0, "the activated tendon carries a positive force");
  assert.equal(finalState.state, "active-passive");
});

// ---------------------------------------------------------------------------
// H. Active tendon keeps T0 as part of the fixed state
// ---------------------------------------------------------------------------

void test("H. active tendon + Heyman-type keeps T0 and follows the nonlinear path", () => {
  const result = analyzeMasonryArchPath(
    arch("heyman-active", {
      law: heymanLaw(),
      loads: crownUpliftLoads(200),
      reinforcements: [tendon({ initialForce: 50 })],
    }),
    designOptions,
  );
  assert.equal(result.outputs.engineeringAssessment?.status, "PASS");
  const first = result.outputs.steps.find((step) => step.stage === "fixed-preload")!;
  const firstTendon = first.state.reinforcementState[0]!;
  // T0 is part of the fixed state: the tendon starts post-tensioned at the assigned force.
  assert.equal(firstTendon.initialForce, 50);
  assert.equal(firstTendon.state, "active-post-tensioned");
  // T = T0 + compatibility contribution: self-weight closure slightly relaxes the fixed state,
  // while the uplift-driven path lengthening adds a large positive contribution.
  assert.ok(firstTendon.force > 0 && firstTendon.force <= 50 + 1e-9);
  const finalTendon = result.outputs.steps.at(-1)!.state.reinforcementState[0]!;
  assert.equal(finalTendon.initialForce, 50);
  assert.ok(finalTendon.force > 50, "compatibility contribution adds to T0");
  // The force evolves along the arc-length path; every state keeps the assigned T0.
  const forces = result.outputs.steps
    .filter((step) => step.stage === "scalable-loading")
    .map((step) => step.state.reinforcementState[0]!.force);
  assert.ok(Math.max(...forces) - Math.min(...forces) > 1, "the force evolves along the path");
  for (const step of result.outputs.steps) {
    assert.equal(step.state.reinforcementState[0]!.initialForce, 50);
  }
});

// ---------------------------------------------------------------------------
// I. Bonded reinforcement remains compatible
// ---------------------------------------------------------------------------

void test("I. bonded reinforcement stays a real capacity with Heyman-type masonry", () => {
  const result = analyzeMasonryArchPath(
    arch("heyman-bonded", {
      law: heymanLaw(),
      loads: crownLoads(20),
      bondedLayers: [bondedLayer],
      voussoirCount: 9,
    }),
    designOptions,
  );
  assert.equal(result.outputs.engineeringAssessment?.status, "PASS");
  const layer = result.outputs.steps.at(-1)!.state.bondedLayerState[0]!;
  // Bonded layers keep the static-admissibility meaning in the path analysis: the recovered
  // per-interface forces are minimum-required values against the masonry-only limit domain and
  // are never strain-compatibility forces.
  assert.equal(layer.analysisMeaning, "minimum-required-static-admissibility");
  assert.equal(layer.interfaces.length, 10, "all ten joints carry a bonded-section state");
  for (const item of layer.interfaces) {
    assert.ok(item.capacity > 0, "the layer is effective inside its interval");
    assert.equal(item.capacity, layer.tensileCapacity);
    if (item.force !== null) {
      assert.ok(item.force >= 0 && item.force <= item.capacity * (1 + 1e-9));
      assert.ok(
        item.state === "inactive" || item.state === "active" || item.state === "at-capacity",
      );
    }
  }
  assert.ok(layer.maximumForce !== null);
  assert.ok(layer.maximumForce >= 0 && layer.maximumForce <= layer.tensileCapacity * (1 + 1e-9));
  // No fake masonry compression or sliding capacity was introduced.
  for (const step of result.outputs.steps) {
    for (const item of step.state.interfaces) {
      assert.equal(item.checks.compression, null);
      assert.equal(item.checks.friction, null);
      assert.equal(item.frictionUtilization, null);
    }
  }
});

// ---------------------------------------------------------------------------
// J. Certified global limit point remains a verified instability failure
// ---------------------------------------------------------------------------

void test("J. certified global limit point below one -> instability FAIL", () => {
  const result = analyzeMasonryArchPath(
    arch("heyman-limit-point", {
      law: heymanLaw(),
      loads: halfPatchUpliftLoads(80),
    }),
    designOptions,
  );
  assert.equal(result.outputs.convergenceInfo.termination, "global-limit-point");
  assert.equal(result.outputs.engineeringAssessment?.status, "FAIL");
  assert.equal(result.outputs.engineeringAssessment?.failureMode, "instability");
  const limitPoint = result.outputs.convergenceInfo.verifiedLimitPoint;
  assert.ok(limitPoint !== null);
  assert.equal(limitPoint.certified, true);
  assert.equal(limitPoint.detection, "branch-turning");
  assert.ok(limitPoint.descendingSideLambda < limitPoint.risingSideLambda);
  assert.ok(limitPoint.lambda < 1);
  assert.equal(result.outputs.failureMode, "instability");
  assert.ok(result.outputs.capacity.lambdaVerificationLimit !== null);
  assert.ok(result.outputs.capacity.lambdaVerificationLimit < 1);
  assert.equal(result.outputs.capacity.lambdaVerificationLimit, limitPoint.lambda);
  assert.ok(result.outputs.events.some((event) => event.kind === "equilibrium-limit-point"));
  // Removing crushing and sliding plasticity must not remove geometric instability.
});

// ---------------------------------------------------------------------------
// K. Numerical failure stays INDETERMINATE
// ---------------------------------------------------------------------------

void test("K. numerical termination with Heyman-type stays INDETERMINATE, never FAIL", () => {
  const result = analyzeMasonryArchPath(
    arch("heyman-numerical", {
      law: heymanLaw(),
      loads: benchmarkPatchUpliftLoads(20),
      reinforcements: [tendon()],
    }),
    designOptions,
  );
  assert.equal(result.outputs.engineeringAssessment?.status, "INDETERMINATE");
  assert.equal(result.outputs.engineeringAssessment?.failureMode, null);
  assert.equal(result.outputs.convergenceInfo.verifiedLimitPoint, null);
  assert.equal(result.outputs.capacity.lambdaVerificationLimit, null);
  assert.ok(!result.outputs.events.some((event) => event.kind === "equilibrium-limit-point"));
  assert.equal(result.status, "failed", "INDETERMINATE serializes as failed, never NOT_VERIFIED");
});

void test("K2. maximum-steps termination is numerical and never a physical FAIL", () => {
  const result = analyzeMasonryArchPath(
    arch("heyman-maxsteps", {
      law: heymanLaw(),
      loads: crownUpliftLoads(200),
      reinforcements: [tendon()],
    }),
    { ...designOptions, maxSteps: 3 },
  );
  assert.equal(result.outputs.convergenceInfo.termination, "maximum-steps");
  assert.equal(result.outputs.engineeringAssessment?.status, "INDETERMINATE");
  assert.equal(result.outputs.convergenceInfo.verifiedLimitPoint, null);
  assert.ok(!result.outputs.events.some((event) => event.kind === "equilibrium-limit-point"));
});

// ---------------------------------------------------------------------------
// Equivalence with the unmobilized elastic-Coulomb response
// ---------------------------------------------------------------------------

void test("equivalence: unmobilized elastic-Coulomb matches elastic-unbounded", () => {
  // Same G, characteristic length, normal law, loads, and geometry. The finite-Coulomb case
  // uses mu = 4, which is never mobilized: the two responses must coincide in the elastic
  // regime, proving that elastic-unbounded is the same tangential elasticity without the yield
  // surface, not a new arbitrary mechanics. No huge mu is used by any implementation.
  const coulomb = analyzeMasonryArchPath(
    arch("heyman-equivalence-coulomb", {
      law: coulombLaw(4),
      loads: crownLoads(200),
    }),
    designOptions,
  );
  const unbounded = analyzeMasonryArchPath(
    arch("heyman-equivalence-unbounded", {
      law: heymanLaw(),
      loads: crownLoads(200),
    }),
    designOptions,
  );
  // The Coulomb surface is genuinely unmobilized: no sliding anywhere and utilization < 0.7.
  assert.equal(coulomb.outputs.events.filter((e) => e.kind === "plastic-sliding").length, 0);
  for (const step of coulomb.outputs.steps) {
    for (const item of step.state.interfaces) {
      assert.equal(item.sliding, false);
      assert.ok(item.frictionUtilization === null || item.frictionUtilization < 0.7);
    }
  }
  const lastCoulomb = coulomb.outputs.steps.at(-1)!.state;
  const lastUnbounded = unbounded.outputs.steps.at(-1)!.state;
  // Both analyses terminate at the same state: same lambda, same interface resultants, same
  // displacements, same normal response.
  assert.ok(
    Math.abs(lastCoulomb.lambda - lastUnbounded.lambda) <= 1e-9,
    `lambda ${lastCoulomb.lambda} vs ${lastUnbounded.lambda}`,
  );
  assert.equal(lastCoulomb.interfaces.length, lastUnbounded.interfaces.length);
  for (let index = 0; index < lastCoulomb.interfaces.length; index++) {
    const left = lastCoulomb.interfaces[index]!;
    const right = lastUnbounded.interfaces[index]!;
    assert.ok(
      Math.abs(left.normalForce - right.normalForce) <= 1e-6 * Math.max(1, left.normalForce),
    );
    assert.ok(
      Math.abs(left.shearForce - right.shearForce) <= 1e-6 * Math.max(1, Math.abs(left.shearForce)),
    );
    assert.ok(Math.abs(left.moment - right.moment) <= 1e-6 * Math.max(1, Math.abs(left.moment)));
    assert.ok(Math.abs(left.shearStress - right.shearStress) <= 1e-6);
    assert.ok(Math.abs(left.maxCompression - right.maxCompression) <= 1e-6);
    assert.ok(Math.abs(left.compressedLength - right.compressedLength) <= 1e-9);
  }
  assert.equal(
    lastCoulomb.deformedConfiguration.length,
    lastUnbounded.deformedConfiguration.length,
  );
  for (let index = 0; index < lastCoulomb.deformedConfiguration.length; index++) {
    const left = lastCoulomb.deformedConfiguration[index]!;
    const right = lastUnbounded.deformedConfiguration[index]!;
    assert.ok(Math.abs(left.translation.x - right.translation.x) <= 1e-9);
    assert.ok(Math.abs(left.translation.y - right.translation.y) <= 1e-9);
    assert.ok(Math.abs(left.rotation - right.rotation) <= 1e-9);
  }
});

// ---------------------------------------------------------------------------
// L-M. The finite-strength model behavior is unchanged
// ---------------------------------------------------------------------------

void test("L. existing finite-Coulomb sliding redistribution case stays unchanged", () => {
  // The passive-intrados benchmark configuration with the finite Coulomb law: local sliding
  // redistributes and the design passes. Re-running it documents the unchanged behavior.
  const result = analyzeMasonryArchPath(
    arch("finite-sliding", {
      law: coulombLaw(0.4),
      loads: benchmarkPatchLoads(20),
      reinforcements: [tendon()],
    }),
    designOptions,
  );
  assert.equal(result.outputs.engineeringAssessment?.status, "PASS");
  assert.ok(result.outputs.events.some((event) => event.kind === "plastic-sliding"));
  const activation = result.outputs.events.find((e) => e.kind === "passive-tendon-activated");
  assert.ok(activation !== undefined);
  assert.equal(result.outputs.capacity.lambdaVerificationLimit, null);
});

void test("M. existing finite compressive strength still terminates by crushing", () => {
  const finiteCrushingLaw: MasonryDeformableInterfaceLawInput = {
    ...coulombLaw(0.5),
    normal: {
      ...coulombLaw(0.5).normal,
      compressiveStrength: 330,
      postCrushingBehavior: "stop-at-onset",
    },
  };
  const result = analyzeMasonryArchPath(
    arch("finite-crushing-330", {
      law: finiteCrushingLaw,
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
      voussoirCount: 9,
    }),
    designOptions,
  );
  assert.equal(result.outputs.engineeringAssessment?.status, "FAIL");
  assert.equal(result.outputs.engineeringAssessment?.failureMode, "masonry-crushing");
  assert.ok(result.outputs.capacity.lambdaVerificationLimit !== null);
  assert.ok(result.outputs.capacity.lambdaVerificationLimit < 1);
});
