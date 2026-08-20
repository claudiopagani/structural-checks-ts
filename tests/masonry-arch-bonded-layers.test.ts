import assert from "node:assert/strict";
import test from "node:test";

import {
  analyzeMasonryArchEquilibrium,
  createMasonryArch,
  evaluateMasonryArchBondedSectionDomain,
  recoverBondedLayerStaticState,
  resolveBaseMasonryArchInterfaceLaws,
  resolveBondedLayerInterfaceSections,
  solveBoundedMinimumProblem,
  type BondedLayerReinforcementInput,
  type MasonryArchModel,
  type MasonryInterfaceLawInput,
  type RigidBlockInterfaceResultant2D,
} from "structural-checks-ts/applications/masonry-arches";

/**
 * Deterministic bonded-layer campaign:
 *
 * - K. the effective interval applies the full capacity immediately inside [start, end] and
 *   nothing outside; no development factor exists;
 * - L. intrados and extrados layers coexist in one section domain;
 * - M. static recovery returns the minimum-required force for one layer, null with
 *   not-uniquely-determined for non-unique multi-layer splits, and never fabricates a force.
 */

const rigid: MasonryInterfaceLawInput = {
  response: "rigid-plastic",
  normal: { type: "no-tension" },
  tangential: { type: "frictionless" },
};

function bondedModel(
  id: string,
  layers: readonly BondedLayerReinforcementInput[],
): MasonryArchModel {
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
      voussoirCount: 21,
    },
    masonry: { unitWeight: 20 },
    interfaceLaw: rigid,
    loads: [{ id: "SW", type: "self-weight", loadCaseId: "G" }],
    bondedLayers: layers,
  });
}

function intradosLayer(
  id: string,
  overrides: Partial<BondedLayerReinforcementInput> = {},
): BondedLayerReinforcementInput {
  return {
    id,
    family: "frcm",
    side: "intrados",
    area: 0.01,
    elasticModulus: 100_000_000,
    tensileStrength: 1000,
    startStation: 0,
    endStation: 1,
    ...overrides,
  };
}

/** Index of the interface closest to the requested normalized station. */
function nearestInterface(model: MasonryArchModel, station: number): number {
  return model.geometry.interfaces.reduce(
    (bestIndex, item, index) =>
      Math.abs(item.normalizedStation - station) <
      Math.abs(model.geometry.interfaces[bestIndex]!.normalizedStation - station)
        ? index
        : bestIndex,
    0,
  );
}

// ---------------------------------------------------------------------------
// K. Effective interval only
// ---------------------------------------------------------------------------

void test("K1. the layer is fully effective inside its interval and absent outside it", () => {
  const model = bondedModel("bonded-k1", [
    intradosLayer("FRCM", { startStation: 0.4, endStation: 0.6 }),
  ]);
  const sections = resolveBondedLayerInterfaceSections(model);
  const crownIndex = nearestInterface(model, 0.5);
  const inside = sections[crownIndex]!;
  assert.equal(inside.contributions.length, 1);
  assert.equal(inside.contributions[0]!.capacity, model.bondedLayers[0]!.tensileCapacity);
  assert.ok(
    Math.abs(inside.contributions[0]!.coordinate + 0.5) <= 1e-9,
    "intrados section coordinate -h/2",
  );
  // Immediately inside the interval the capacity is full: no development ramp exists.
  const nearStart = sections.find(
    (section) =>
      section.interface.normalizedStation > 0.4 && section.interface.normalizedStation < 0.44,
  );
  assert.ok(nearStart !== undefined, "an interface lies just inside the interval");
  assert.equal(nearStart.contributions[0]!.capacity, model.bondedLayers[0]!.tensileCapacity);
  // Outside the interval the layer is absent.
  const outside = sections.filter(
    (section) =>
      section.interface.normalizedStation < 0.39 || section.interface.normalizedStation > 0.61,
  );
  assert.ok(outside.length > 0);
  for (const section of outside) {
    assert.deepEqual(section.contributions, []);
  }
  // The section domain is unchanged outside the interval and widened inside it.
  const crownDomain = evaluateMasonryArchBondedSectionDomain(model, crownIndex, 10);
  const crownBase = evaluateMasonryArchBondedSectionDomain(
    bondedModel("bonded-k1-bare", []),
    10,
    10,
  );
  assert.ok(Math.abs(crownBase.maximumMoment - 5) <= 1e-9, "bare wedge: |M| <= N*h/2");
  assert.ok(
    Math.abs(crownDomain.maximumMoment - (5 + 10)) <= 1e-9,
    "intrados layer extends the positive moment",
  );
  assert.ok(
    Math.abs(crownDomain.minimumMoment + 5) <= 1e-9,
    "intrados layer does not extend the negative moment",
  );
  // The published contribution carries no development factor.
  assert.deepEqual(
    crownDomain.contributions.map((item) => item.reinforcementId),
    ["FRCM"],
  );
});

void test("K2. the equilibrium analysis reports inactive states without any development ramp", () => {
  const model = bondedModel("bonded-k2", [
    intradosLayer("FRCM", { startStation: 0, endStation: 1, tensileStrength: 2_000_000 }),
  ]);
  const result = analyzeMasonryArchEquilibrium(model, {
    loadFactorsByCaseId: { G: 1 },
  });
  assert.equal(result.outputs.engineeringAssessment.status, "PASS");
  const layer = result.outputs.bondedLayerState[0]!;
  assert.equal(layer.analysisMeaning, "minimum-required-static-admissibility");
  assert.equal(layer.startStation, 0);
  assert.equal(layer.endStation, 1);
  for (const item of layer.interfaces) {
    assert.equal(item.capacity, layer.tensileCapacity, "full capacity at every interface");
  }
});

// ---------------------------------------------------------------------------
// L. Simultaneous intrados + extrados layers
// ---------------------------------------------------------------------------

void test("L1. intrados and extrados layers coexist in one section domain", () => {
  const model = bondedModel("bonded-l1", [
    intradosLayer("I", { tensileStrength: 400 }),
    intradosLayer("E", { side: "extrados", tensileStrength: 600 }),
  ]);
  const sections = resolveBondedLayerInterfaceSections(model);
  const crownIndex = nearestInterface(model, 0.5);
  const crown = sections[crownIndex]!;
  assert.equal(crown.contributions.length, 2);
  assert.ok(Math.abs(crown.contributions[0]!.coordinate + 0.5) <= 1e-9);
  assert.ok(Math.abs(crown.contributions[1]!.coordinate - 0.5) <= 1e-9);
  assert.equal(crown.contributions[0]!.capacity, 4);
  assert.equal(crown.contributions[1]!.capacity, 6);
  // The reinforced domain widens on both moment sides: the intrados layer adds c*h to the
  // positive moment, the extrados layer adds c*h to the negative moment.
  const domain = evaluateMasonryArchBondedSectionDomain(model, crownIndex, 10);
  assert.ok(Math.abs(domain.maximumMoment - (5 + 4)) <= 1e-9);
  assert.ok(Math.abs(domain.minimumMoment - (-5 - 6)) <= 1e-9);
  assert.deepEqual(
    domain.contributions.map((item) => item.side),
    ["intrados", "extrados"],
  );
});

void test("L2. both layers together admit an equilibrium neither admits alone at its own limit", () => {
  // A resultant just outside the bare wedge on both sides is admissible only with both layers.
  const model = bondedModel("bonded-l2", [
    intradosLayer("I", { tensileStrength: 400 }),
    intradosLayer("E", { side: "extrados", tensileStrength: 600 }),
  ]);
  const crownIndex = nearestInterface(model, 0.5);
  const domain = evaluateMasonryArchBondedSectionDomain(model, crownIndex, 10);
  assert.ok(domain.minimumMoment < -5 && domain.maximumMoment > 5);
  // The combined domain contains the bare wedge and both single-layer domains.
  const bare = evaluateMasonryArchBondedSectionDomain(
    bondedModel("bonded-l2-bare", []),
    nearestInterface(bondedModel("bonded-l2-bare", []), 0.5),
    10,
  );
  assert.ok(domain.maximumMoment >= bare.maximumMoment);
  assert.ok(domain.minimumMoment <= bare.minimumMoment);
});

// ---------------------------------------------------------------------------
// M. Static recovery
// ---------------------------------------------------------------------------

void test("M1. single-layer recovery returns the minimum required force (lower bound)", () => {
  // Wedge h = 1, intrados layer y = -0.5, capacity 10; resultant N = 5, M = +3.5 needs T >= 1.
  const model = bondedModel("bonded-m1", [intradosLayer("FRCM", { tensileStrength: 1000 })]);
  const baseLaws = resolveBaseMasonryArchInterfaceLaws(model);
  const crownIndex = nearestInterface(model, 0.5);
  const resultants: RigidBlockInterfaceResultant2D[] = model.geometry.interfaces.map(
    (item, index): RigidBlockInterfaceResultant2D => ({
      interfaceId: item.id,
      index,
      normalForce: index === crownIndex ? 5 : 0,
      shearForce: 0,
      moment: index === crownIndex ? 3.5 : 0,
      eccentricity: null,
      normalizedEccentricity: null,
      thrustPoint: null,
      admissibilityMargins: {
        compression: index === crownIndex ? 5 : 0,
        intrados: 0,
        extrados: 0,
        friction: null,
        compressionStrength: null,
        resultantDomain: null,
      },
    }),
  );
  const recovery = recoverBondedLayerStaticState(model, baseLaws, resultants, 1e-6);
  const crown = recovery.bondedLayerState[0]!.interfaces.find(
    (item) => item.interfaceIndex === crownIndex,
  )!;
  assert.ok(
    crown.force !== null && Math.abs(crown.force - 1) <= 1e-6,
    `expected 1, got ${crown.force}`,
  );
  assert.equal(crown.state, "active");
  // The masonry-only resultant shifted by exactly the recovered force.
  assert.ok(Math.abs(recovery.masonryResultants[crownIndex]!.normalForce - 6) <= 1e-6);
  assert.ok(Math.abs(recovery.masonryResultants[crownIndex]!.moment - 3.0) <= 1e-6);
});

void test("M2. non-unique layer forces retain the uniquely determined masonry aggregate", () => {
  // Two identical intrados layers: any split of the required total is optimal.
  const model = bondedModel("bonded-m2", [
    intradosLayer("I1", { tensileStrength: 1000 }),
    intradosLayer("I2", { tensileStrength: 1000 }),
  ]);
  const baseLaws = resolveBaseMasonryArchInterfaceLaws(model);
  const crownIndex = nearestInterface(model, 0.5);
  const resultants: RigidBlockInterfaceResultant2D[] = model.geometry.interfaces.map(
    (item, index): RigidBlockInterfaceResultant2D => ({
      interfaceId: item.id,
      index,
      normalForce: index === crownIndex ? 5 : 0,
      shearForce: 0,
      moment: index === crownIndex ? 3.5 : 0,
      eccentricity: null,
      normalizedEccentricity: null,
      thrustPoint: null,
      admissibilityMargins: {
        compression: 0,
        intrados: 0,
        extrados: 0,
        friction: null,
        compressionStrength: null,
        resultantDomain: null,
      },
    }),
  );
  const recovery = recoverBondedLayerStaticState(model, baseLaws, resultants, 1e-6);
  for (const layer of recovery.bondedLayerState) {
    const crown = layer.interfaces.find((item) => item.interfaceIndex === crownIndex)!;
    assert.equal(crown.force, null, "no fabricated split");
    assert.equal(crown.state, "not-uniquely-determined");
  }
  // Although the individual split is free, sum(T_i) = 1 and sum(y_i T_i) = -0.5 are unique.
  // The exact masonry-only aggregate is therefore recovered without fabricating either layer.
  assert.ok(Math.abs(recovery.masonryResultants[crownIndex]!.normalForce - 6) <= 1e-6);
  assert.ok(Math.abs(recovery.masonryResultants[crownIndex]!.moment - 3) <= 1e-6);
});

void test("M3. a unique multi-layer split is recovered exactly", () => {
  // Wedge h = 1, intrados (y = -0.5, c = 10) + extrados (y = +0.5, c = 10), N = 5, M = +3.5:
  // the unique minimum is T_intrados = 1, T_extrados = 0.
  const model = bondedModel("bonded-m3", [
    intradosLayer("I", { tensileStrength: 1000 }),
    intradosLayer("E", { side: "extrados", tensileStrength: 1000 }),
  ]);
  const baseLaws = resolveBaseMasonryArchInterfaceLaws(model);
  const crownIndex = nearestInterface(model, 0.5);
  const resultants: RigidBlockInterfaceResultant2D[] = model.geometry.interfaces.map(
    (item, index): RigidBlockInterfaceResultant2D => ({
      interfaceId: item.id,
      index,
      normalForce: index === crownIndex ? 5 : 0,
      shearForce: 0,
      moment: index === crownIndex ? 3.5 : 0,
      eccentricity: null,
      normalizedEccentricity: null,
      thrustPoint: null,
      admissibilityMargins: {
        compression: 0,
        intrados: 0,
        extrados: 0,
        friction: null,
        compressionStrength: null,
        resultantDomain: null,
      },
    }),
  );
  const recovery = recoverBondedLayerStaticState(model, baseLaws, resultants, 1e-6);
  const intradosCrown = recovery.bondedLayerState
    .find((layer) => layer.reinforcementId === "I")!
    .interfaces.find((item) => item.interfaceIndex === crownIndex)!;
  const extradosCrown = recovery.bondedLayerState
    .find((layer) => layer.reinforcementId === "E")!
    .interfaces.find((item) => item.interfaceIndex === crownIndex)!;
  assert.ok(
    intradosCrown.force !== null && Math.abs(intradosCrown.force - 1) <= 1e-6,
    `intrados force expected 1, got ${intradosCrown.force}`,
  );
  assert.ok(
    extradosCrown.force !== null && Math.abs(extradosCrown.force) <= 1e-6,
    `extrados force expected 0, got ${extradosCrown.force}`,
  );
  assert.equal(intradosCrown.state, "active");
  assert.equal(extradosCrown.state, "inactive");
  // The masonry-only resultant shift uses both contributions.
  assert.ok(Math.abs(recovery.masonryResultants[crownIndex]!.normalForce - 6) <= 1e-6);
  assert.ok(Math.abs(recovery.masonryResultants[crownIndex]!.moment - 3.0) <= 1e-6);
});

void test("M4. infeasible sections and insufficient capacity are never fabricated", () => {
  // N = 5, M = -3.5 cannot be repaired by intrados layers at all (the intrados constraint is
  // independent of T): the recovery reports null, not an invented force.
  const model = bondedModel("bonded-m4", [intradosLayer("FRCM", { tensileStrength: 1000 })]);
  const baseLaws = resolveBaseMasonryArchInterfaceLaws(model);
  const crownIndex = nearestInterface(model, 0.5);
  const resultants: RigidBlockInterfaceResultant2D[] = model.geometry.interfaces.map(
    (item, index): RigidBlockInterfaceResultant2D => ({
      interfaceId: item.id,
      index,
      normalForce: index === crownIndex ? 5 : 0,
      shearForce: 0,
      moment: index === crownIndex ? -3.5 : 0,
      eccentricity: null,
      normalizedEccentricity: null,
      thrustPoint: null,
      admissibilityMargins: {
        compression: 0,
        intrados: 0,
        extrados: 0,
        friction: null,
        compressionStrength: null,
        resultantDomain: null,
      },
    }),
  );
  const recovery = recoverBondedLayerStaticState(model, baseLaws, resultants, 1e-6);
  const crown = recovery.bondedLayerState[0]!.interfaces.find(
    (item) => item.interfaceIndex === crownIndex,
  )!;
  assert.equal(crown.force, null);
  assert.equal(crown.state, "not-uniquely-determined");
});

void test("M5. the bounded-minimum kernel matches hand-computed cases", () => {
  // One layer, N = 5, M = +3.5, wedge h = 1, y = -0.5: T_min = 1.
  const one = solveBoundedMinimumProblem({
    constraints: [
      { coefficients: [-1], rightHandSide: 5 },
      { coefficients: [-1], rightHandSide: 2.5 - 3.5 },
      { coefficients: [0], rightHandSide: 2.5 + 3.5 },
    ],
    capacities: [10],
  });
  assert.equal(one.feasible, true);
  assert.equal(one.unique, true);
  assert.ok(Math.abs(one.solution![0]! - 1) <= 1e-9);

  // The box bounds the variables: required 5 with capacity 3 is infeasible, never overshoot.
  const capped = solveBoundedMinimumProblem({
    constraints: [
      { coefficients: [-1], rightHandSide: 5 },
      { coefficients: [-1], rightHandSide: 2.5 - 7.5 },
      { coefficients: [0], rightHandSide: 2.5 + 7.5 },
    ],
    capacities: [3],
  });
  assert.equal(capped.feasible, false);

  // Identical layers: non-unique.
  const nonUnique = solveBoundedMinimumProblem({
    constraints: [
      { coefficients: [-1, -1], rightHandSide: 5 },
      { coefficients: [-1, -1], rightHandSide: 2.5 - 3.5 },
      { coefficients: [0, 0], rightHandSide: 2.5 + 3.5 },
    ],
    capacities: [10, 10],
  });
  assert.equal(nonUnique.feasible, true);
  assert.equal(nonUnique.unique, false);
  assert.equal(nonUnique.solution, null);
  assert.ok(nonUnique.variableRanges?.every((range) => !range.unique));

  // Distinct coordinates: unique (1, 0).
  const unique = solveBoundedMinimumProblem({
    constraints: [
      { coefficients: [-1, -1], rightHandSide: 5 },
      { coefficients: [-1, 0], rightHandSide: 2.5 - 3.5 },
      { coefficients: [0, -1], rightHandSide: 2.5 + 3.5 },
    ],
    capacities: [10, 10],
  });
  assert.equal(unique.feasible, true);
  assert.equal(unique.unique, true);
  assert.ok(Math.abs(unique.solution![0]! - 1) <= 1e-9);
  assert.ok(Math.abs(unique.solution![1]!) <= 1e-9);
});

void test("M6. optimal-face ranges separate capacity-bound values from free splits and projections", () => {
  // x0 is fixed at its capacity by the first row. The remaining required force can be split
  // arbitrarily between x1 and x2. The axial aggregate is exact while a moment-like projection
  // with different coordinates is genuinely non-unique.
  const result = solveBoundedMinimumProblem(
    {
      constraints: [
        { coefficients: [-1, 0, 0], rightHandSide: -2 },
        { coefficients: [-1, -1, -1], rightHandSide: -4 },
      ],
      capacities: [2, 10, 10],
    },
    1e-9,
    [{ coefficients: [1, 1, 1] }, { coefficients: [0, -0.5, 0.5] }],
  );
  assert.equal(result.feasible, true);
  assert.equal(result.unique, false);
  assert.equal(result.solution, null);
  assert.ok(result.variableRanges !== null);
  assert.equal(result.variableRanges[0]!.unique, true);
  assert.ok(Math.abs(result.variableRanges[0]!.minimum - 2) <= 1e-8);
  assert.equal(result.variableRanges[1]!.unique, false);
  assert.equal(result.variableRanges[2]!.unique, false);
  assert.ok(result.projectionRanges !== null);
  assert.equal(result.projectionRanges[0]!.unique, true);
  assert.ok(Math.abs(result.projectionRanges[0]!.minimum - 4) <= 1e-8);
  assert.equal(result.projectionRanges[1]!.unique, false);
  assert.ok(result.projectionRanges[1]!.minimum < result.projectionRanges[1]!.maximum);
});

void test("M7. scaled tolerance classifies a near-degenerate optimal-face range", () => {
  const result = solveBoundedMinimumProblem(
    {
      constraints: [
        { coefficients: [-1, 0], rightHandSide: -0.5 },
        { coefficients: [1, 0], rightHandSide: 0.5 + 1e-10 },
        { coefficients: [-1, -1], rightHandSide: -1 },
      ],
      capacities: [1, 1],
    },
    1e-9,
  );
  assert.equal(result.feasible, true);
  assert.equal(result.unique, true);
  assert.ok(result.variableRanges !== null);
  assert.ok(result.variableRanges[0]!.maximum - result.variableRanges[0]!.minimum <= 1.1e-10);
  assert.ok(Math.abs(result.solution![0]! - 0.5) <= 1e-9);
  assert.ok(Math.abs(result.solution![1]! - 0.5) <= 1e-9);
});

void test("M8. a capacity-bound basic optimizer does not fabricate a two-layer allocation", () => {
  // Any split with x0 + x1 = 12 and 0 <= xi <= 10 is optimal. A simplex basis may place x0 at
  // capacity, but the physical ranges are [2, 10] for both layers and only the sum is exact.
  const result = solveBoundedMinimumProblem(
    {
      constraints: [{ coefficients: [-1, -1], rightHandSide: -12 }],
      capacities: [10, 10],
    },
    1e-9,
    [{ coefficients: [1, 1] }],
  );
  assert.equal(result.unique, false);
  assert.equal(result.solution, null);
  assert.ok(result.variableRanges !== null);
  assert.ok(Math.abs(result.variableRanges[0]!.minimum - 2) <= 1e-8);
  assert.ok(Math.abs(result.variableRanges[0]!.maximum - 10) <= 1e-8);
  assert.ok(Math.abs(result.variableRanges[1]!.minimum - 2) <= 1e-8);
  assert.ok(Math.abs(result.variableRanges[1]!.maximum - 10) <= 1e-8);
  assert.equal(result.projectionRanges?.[0]?.unique, true);
});
