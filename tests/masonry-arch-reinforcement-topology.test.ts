import assert from "node:assert/strict";
import test from "node:test";

import {
  analyzeMasonryArchEquilibrium,
  createMasonryArch,
  evaluateArchReinforcementConfiguration,
  resolveArchReinforcements,
  type ArchReinforcementInput,
  type MasonryArchModel,
  type MasonryInterfaceLawInput,
} from "structural-checks-ts-migration-workspace/applications/masonry-arches";

/**
 * Deterministic topology campaign for discrete intrados tendons:
 *
 * - A. arch-anchored open tendons (active and passive, non-terminal stations);
 * - B. external-anchored open tendons with vertical terminal branches;
 * - C. mixed open terminations (left arch anchor, right external anchor);
 * - D. closed loops (active and passive, straight return branch);
 * - G. active vs passive: identical topology, only constitutive initialization differs.
 */

const rigid: MasonryInterfaceLawInput = {
  response: "rigid-plastic",
  normal: { type: "no-tension" },
  tangential: { type: "frictionless" },
};

function baseModel(
  id: string,
  reinforcements: readonly ArchReinforcementInput[] = [],
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
    reinforcements,
  });
}

function archAnchoredTendon(
  initialForce: number,
  overrides: { readonly left?: number; readonly right?: number } = {},
): ArchReinforcementInput {
  return {
    id: "T",
    side: "intrados",
    area: 0.001,
    elasticModulus: 200_000_000,
    initialForce,
    topology: {
      type: "open",
      left: { type: "arch-anchor", station: overrides.left ?? 0 },
      right: { type: "arch-anchor", station: overrides.right ?? 1 },
      deviators: { type: "uniform-count", count: 1 },
    },
  };
}

function sumForces(
  wrenches: readonly { readonly force: { readonly x: number; readonly y: number } }[],
): { x: number; y: number } {
  return wrenches.reduce((sum, item) => ({ x: sum.x + item.force.x, y: sum.y + item.force.y }), {
    x: 0,
    y: 0,
  });
}

function sumVectors(vectors: readonly { readonly x: number; readonly y: number }[]): {
  x: number;
  y: number;
} {
  return vectors.reduce((sum, item) => ({ x: sum.x + item.x, y: sum.y + item.y }), { x: 0, y: 0 });
}

// ---------------------------------------------------------------------------
// A. Intrados arch-anchored tendons
// ---------------------------------------------------------------------------

void test("A1. arch-anchored active tendon: terminals are arch devices, no external anchors", () => {
  const arch = baseModel("topology-a1", [archAnchoredTendon(100)]);
  const resolved = resolveArchReinforcements(arch);
  const state = resolved.reinforcementState[0]!;
  assert.equal(state.topology, "open");
  assert.equal(state.initialForce, 100);
  assert.equal(state.force, 100, "reference configuration keeps exactly T0");
  assert.equal(state.state, "active-post-tensioned");
  assert.deepEqual(
    resolved.deviceForces.map((item) => item.kind),
    ["terminal-arch-anchor", "deviator", "terminal-arch-anchor"],
  );
  assert.deepEqual(resolved.externalAnchorForces, [], "no external anchor exists");
  // Every arch-side device force is applied to the arch: the block-wrench force resultant equals
  // the arch-device force sum.
  const deviceSum = sumVectors(resolved.deviceForces.map((item) => item.resultantForce));
  const blockSum = sumForces(resolved.blockWrenches);
  assert.ok(Math.abs(deviceSum.x - blockSum.x) <= 1e-9);
  assert.ok(Math.abs(deviceSum.y - blockSum.y) <= 1e-9);
  // Tension continuity through the frictionless deviator.
  const crown = resolved.deviceForces[1]!;
  assert.equal(crown.tensionIn, 100);
  assert.equal(crown.tensionOut, 100);
});

void test("A2. arch-anchored passive tendon stays slack at the reference configuration", () => {
  const arch = baseModel("topology-a2", [archAnchoredTendon(0)]);
  const state = resolveArchReinforcements(arch).reinforcementState[0]!;
  assert.equal(state.initialForce, 0, "passive means exactly zero initial force");
  assert.equal(state.force, 0);
  assert.equal(state.state, "slack");
  assert.equal(state.elasticForceIncrement, 0);
});

void test("A3. arch anchors at non-terminal stations follow the assigned geometry", () => {
  const arch = baseModel("topology-a3", [archAnchoredTendon(100, { left: 0.1, right: 0.9 })]);
  const resolved = resolveArchReinforcements(arch);
  const devices = resolved.deviceForces;
  const left = devices[0]!;
  const right = devices[2]!;
  assert.equal(left.kind, "terminal-arch-anchor");
  assert.equal(right.kind, "terminal-arch-anchor");
  assert.ok(left.station !== null && Math.abs(left.station - 0.1) <= 1e-9);
  assert.ok(right.station !== null && Math.abs(right.station - 0.9) <= 1e-9);
  // The anchors are interior: the terminal forces are applied to interior blocks, not only to
  // the springing voussoirs.
  const path = resolved.reinforcementState[0]!.path;
  assert.equal(path.length, 3);
  assert.ok(path[0]!.x > -4.5 + 1e-9 && path[0]!.x < 4.5, "left anchor lies inside the span");
  assert.ok(path[2]!.x < 4.5 - 1e-9 && path[2]!.x > -4.5, "right anchor lies inside the span");
});

// ---------------------------------------------------------------------------
// B. Intrados external-anchored tendons with vertical terminal branches
// ---------------------------------------------------------------------------

function externalVerticalModel(id: string, initialForce: number): MasonryArchModel {
  // Deviators at the symmetric stations 0.25 / 0.5 / 0.75. The external anchors must hang
  // exactly one unit of length below the RESOLVED first and last deviator points, so both free
  // branches are vertical: probe the resolution first, then place the anchors.
  const probe = baseModel(`${id}-probe`, [
    {
      id: "T",
      side: "intrados",
      area: 0.001,
      elasticModulus: 200_000_000,
      initialForce,
      topology: {
        type: "open",
        left: { type: "external-anchor", point: { x: -6, y: 0 } },
        right: { type: "external-anchor", point: { x: 6, y: 0 } },
        deviators: {
          type: "stations",
          deviators: [{ station: 0.25 }, { station: 0.5 }, { station: 0.75 }],
        },
      },
    },
  ]);
  const probeResolved = resolveArchReinforcements(probe);
  const deviators = probeResolved.deviceForces.filter((item) => item.kind === "deviator");
  const firstDeviator = deviators[0]!.point;
  const lastDeviator = deviators.at(-1)!.point;
  return baseModel(id, [
    {
      id: "T",
      side: "intrados",
      area: 0.001,
      elasticModulus: 200_000_000,
      initialForce,
      topology: {
        type: "open",
        left: {
          type: "external-anchor",
          point: { x: firstDeviator.x, y: firstDeviator.y - 1 },
        },
        right: {
          type: "external-anchor",
          point: { x: lastDeviator.x, y: lastDeviator.y - 1 },
        },
        deviators: {
          type: "stations",
          deviators: [{ station: 0.25 }, { station: 0.5 }, { station: 0.75 }],
        },
      },
    },
  ]);
}

void test("B1. external anchors are fixed global points and the branches are vertical", () => {
  const arch = externalVerticalModel("topology-b1", 100);
  const resolved = resolveArchReinforcements(arch);
  const state = resolved.reinforcementState[0]!;
  const path = state.path;
  const leftBranch = state.segments[0]!;
  const rightBranch = state.segments.at(-1)!;
  assert.equal(leftBranch.role, "free-terminal-branch");
  assert.equal(rightBranch.role, "free-terminal-branch");
  assert.ok(
    Math.abs(leftBranch.startPoint.x - leftBranch.endPoint.x) <= 1e-12,
    "left terminal branch is exactly vertical",
  );
  assert.ok(
    Math.abs(rightBranch.startPoint.x - rightBranch.endPoint.x) <= 1e-12,
    "right terminal branch is exactly vertical",
  );
  assert.ok(Math.abs(leftBranch.referenceLength - 1) <= 1e-9);
  assert.ok(Math.abs(rightBranch.referenceLength - 1) <= 1e-9);
  // The anchors are fixed global points matching the input coordinates exactly; each hangs below
  // its adjacent arch deviator (the path endpoints are the anchors themselves).
  const anchors = resolved.externalAnchorForces;
  assert.equal(anchors.length, 2);
  for (const [index, anchor] of anchors.entries()) {
    assert.equal(anchor.point.x, path[index === 0 ? 0 : path.length - 1]!.x);
    assert.ok(anchor.point.y < path[index === 0 ? 1 : path.length - 2]!.y);
    assert.equal(anchor.point.x, anchor.referencePoint.x);
    assert.equal(anchor.point.y, anchor.referencePoint.y);
  }
});

void test("B2. external branches participate in the elastic length", () => {
  const arch = externalVerticalModel("topology-b2", 0);
  const state = resolveArchReinforcements(arch).reinforcementState[0]!;
  // 4 segments: two vertical branches (1 m each) plus three intrados chords.
  assert.equal(state.segments.length, 4);
  const expected =
    2 +
    state.segments
      .filter((segment) => segment.role === "along-side")
      .reduce((sum, segment) => sum + segment.referenceLength, 0);
  assert.ok(Math.abs(state.referenceLength - expected) <= 1e-9);
  assert.equal(state.effectiveElasticLength, state.referenceLength);
});

void test("B3. external anchor forces are separate results and never arch block actions", () => {
  const arch = externalVerticalModel("topology-b3", 100);
  const resolved = resolveArchReinforcements(arch);
  assert.equal(resolved.externalAnchorForces.length, 2);
  for (const anchor of resolved.externalAnchorForces) {
    assert.equal(anchor.tension, 100);
    assert.equal(anchor.resultant, 100);
    // The cable pulls each anchor up toward the arch, so the external system feels an upward
    // force of exactly T along the vertical branch.
    assert.ok(anchor.forceTransmittedToExternalSystem.y > 0);
    assert.ok(Math.abs(anchor.forceTransmittedToExternalSystem.x) <= 1e-12);
  }
  const archDeviceSum = sumVectors(
    resolved.deviceForces
      .filter((item) => item.kind !== "external-anchor")
      .map((item) => item.resultantForce),
  );
  const blockSum = sumForces(resolved.blockWrenches);
  assert.ok(Math.abs(archDeviceSum.x - blockSum.x) <= 1e-9);
  assert.ok(Math.abs(archDeviceSum.y - blockSum.y) <= 1e-9);
});

void test("B4. arch support reactions respond to the prestress and stay symmetric", () => {
  const bare = analyzeMasonryArchEquilibrium(baseModel("topology-b4-bare"));
  const reinforced = analyzeMasonryArchEquilibrium(externalVerticalModel("topology-b4-re", 100));
  assert.equal(bare.outputs.engineeringAssessment.status, "PASS");
  assert.equal(reinforced.outputs.engineeringAssessment.status, "PASS");
  const bareLeft = bare.outputs.reactions.left.force;
  const reinforcedLeft = reinforced.outputs.reactions.left.force;
  assert.ok(
    Math.abs(bareLeft.y - reinforcedLeft.y) > 1,
    "the prestress changes the vertical support reaction",
  );
  assert.ok(
    Math.abs(
      reinforced.outputs.reactions.left.force.x + reinforced.outputs.reactions.right.force.x,
    ) <= 1e-9,
  );
  assert.ok(
    Math.abs(
      reinforced.outputs.reactions.left.force.y - reinforced.outputs.reactions.right.force.y,
    ) <= 1e-9,
    "symmetric arch and symmetric tendon give symmetric reactions",
  );
});

void test("B5. open tendon free body closes: arch devices plus external anchors", () => {
  const arch = externalVerticalModel("topology-b5", 100);
  const state = resolveArchReinforcements(arch).reinforcementState[0]!;
  const equilibrium = state.equilibrium;
  assert.equal(equilibrium.meaning, "open-tendon-free-body");
  assert.equal(equilibrium.satisfied, true);
  assert.ok(Math.abs(equilibrium.residualForce.x) <= 1e-9);
  assert.ok(Math.abs(equilibrium.residualForce.y) <= 1e-9);
  assert.ok(Math.abs(equilibrium.residualMoment) <= 1e-6);
  assert.ok(equilibrium.normalizedResidual.force <= 1e-12);
  assert.ok(equilibrium.normalizedResidual.moment <= 1e-12);
});

// ---------------------------------------------------------------------------
// C. Mixed open terminations
// ---------------------------------------------------------------------------

void test("C. mixed left arch-anchor / right external-anchor closes the free body", () => {
  const probe = baseModel("topology-c");
  const intradosRight = probe.geometry.curveSamples.reduce((best, current) =>
    Math.abs(current.station - 1) < Math.abs(best.station - 1) ? current : best,
  ).intrados;
  const mixed = createMasonryArch({
    id: "topology-c",
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
    reinforcements: [
      {
        id: "T",
        side: "intrados",
        area: 0.001,
        elasticModulus: 200_000_000,
        initialForce: 60,
        topology: {
          type: "open",
          left: { type: "arch-anchor", station: 0 },
          right: {
            type: "external-anchor",
            point: { x: intradosRight.x, y: intradosRight.y - 1 },
          },
          deviators: { type: "uniform-count", count: 1 },
        },
      },
    ],
  });
  const resolved = resolveArchReinforcements(mixed);
  assert.deepEqual(
    resolved.deviceForces.map((item) => item.kind),
    ["terminal-arch-anchor", "deviator", "external-anchor"],
  );
  assert.equal(resolved.externalAnchorForces.length, 1);
  assert.equal(resolved.externalAnchorForces[0]!.terminationSide, "right");
  const equilibrium = resolved.reinforcementState[0]!.equilibrium;
  assert.equal(equilibrium.satisfied, true);
  assert.ok(Math.abs(equilibrium.residualForce.x) <= 1e-9);
  assert.ok(Math.abs(equilibrium.residualForce.y) <= 1e-9);
  assert.ok(Math.abs(equilibrium.residualMoment) <= 1e-6);
});

// ---------------------------------------------------------------------------
// D. Intrados closed loops
// ---------------------------------------------------------------------------

function closedLoopModel(id: string, initialForce: number): MasonryArchModel {
  return baseModel(id, [
    {
      id: "L",
      side: "intrados",
      area: 0.001,
      elasticModulus: 200_000_000,
      initialForce,
      topology: {
        type: "closed-loop",
        leftReturnDeviator: { station: 0 },
        rightReturnDeviator: { station: 1 },
        deviators: { type: "uniform-count", count: 1 },
      },
    },
  ]);
}

void test("D1. closed loop: return deviators, straight return branch, no terminal anchors", () => {
  const resolved = resolveArchReinforcements(closedLoopModel("topology-d1", 50));
  const state = resolved.reinforcementState[0]!;
  assert.equal(state.topology, "closed-loop");
  assert.deepEqual(
    resolved.deviceForces.map((item) => item.kind),
    ["return-deviator", "deviator", "return-deviator"],
  );
  assert.deepEqual(resolved.externalAnchorForces, [], "closed loops have no external anchors");
  const returnSegment = state.segments.at(-1)!;
  assert.equal(returnSegment.role, "return-branch");
  // The return branch is a straight segment between the two return deviators; for the symmetric
  // arch it is exactly horizontal, spanning the intrados springings (2 * 4.5 m).
  const returnDeviators = resolved.deviceForces.filter((item) => item.kind === "return-deviator");
  assert.equal(returnDeviators.length, 2);
  assert.ok(Math.abs(returnDeviators[0]!.point.y - returnDeviators[1]!.point.y) <= 1e-12);
  assert.ok(Math.abs(returnSegment.referenceLength - 9) <= 1e-9);
  // The complete loop length participates in the elastic member.
  assert.equal(
    state.referenceLength,
    state.segments.reduce((sum, segment) => sum + segment.referenceLength, 0),
  );
  assert.equal(state.effectiveElasticLength, state.referenceLength);
  // The reported path closes on itself.
  assert.ok(
    Math.hypot(state.path[0]!.x - state.path.at(-1)!.x, state.path[0]!.y - state.path.at(-1)!.y) <=
      1e-12,
  );
});

void test("D2. active closed loop carries exactly the assigned loop tension", () => {
  const state = resolveArchReinforcements(closedLoopModel("topology-d2", 50))
    .reinforcementState[0]!;
  assert.equal(state.initialForce, 50);
  assert.equal(state.force, 50);
  assert.equal(state.state, "active-post-tensioned");
  for (const segment of state.segments) {
    assert.equal(segment.tension, 50, "tension is continuous around the loop");
  }
  const equilibrium = state.equilibrium;
  assert.equal(equilibrium.meaning, "closed-loop-self-equilibrium");
  assert.equal(equilibrium.satisfied, true);
  assert.ok(Math.abs(equilibrium.residualForce.x) <= 1e-9);
  assert.ok(Math.abs(equilibrium.residualForce.y) <= 1e-9);
  assert.ok(Math.abs(equilibrium.residualMoment) <= 1e-6);
  assert.ok(equilibrium.normalizedResidual.force <= 1e-12);
  assert.ok(equilibrium.normalizedResidual.moment <= 1e-12);
});

void test("D3. passive closed loop activates under compatible elongation", () => {
  const arch = closedLoopModel("topology-d3", 0);
  const reference = resolveArchReinforcements(arch).reinforcementState[0]!;
  assert.equal(reference.force, 0);
  assert.equal(reference.state, "slack");
  // Prescribe outward springing displacements: the intrados path lengthens and the loop
  // activates by compatibility with T0 = 0.
  const evaluated = evaluateArchReinforcementConfiguration(arch, {
    units: { force: "kN", length: "m" },
    blockDisplacements: [
      { blockId: "V-000", translation: { x: -0.005, y: 0 }, rotation: 0 },
      { blockId: "V-020", translation: { x: 0.005, y: 0 }, rotation: 0 },
    ],
  });
  const activated = evaluated.reinforcementState[0]!;
  assert.equal(activated.initialForce, 0, "passive keeps exactly zero initial force");
  assert.ok(activated.elongation > 0, "the prescribed motion lengthens the loop");
  assert.ok(activated.force > 0, "the loop activates by compatibility");
  assert.equal(activated.state, "active-passive");
  // The force equals the elastic increment from complete-path compatibility.
  assert.ok(
    Math.abs(
      activated.force - (200_000_000 * 0.001 * activated.elongation) / reference.referenceLength,
    ) <= 1e-6,
  );
  const equilibrium = activated.equilibrium;
  assert.equal(equilibrium.satisfied, true);
  assert.ok(Math.abs(equilibrium.residualForce.x) <= 1e-9);
  assert.ok(Math.abs(equilibrium.residualForce.y) <= 1e-9);
});

// ---------------------------------------------------------------------------
// G. Active vs passive: identical topology, only constitutive initialization
// ---------------------------------------------------------------------------

void test("G. active and passive tendons share the topology and differ only through T0", () => {
  const active = baseModel("topology-g-active", [archAnchoredTendon(100)]);
  const passive = baseModel("topology-g-passive", [archAnchoredTendon(0)]);
  const input = {
    units: { force: "kN", length: "m" } as const,
    blockDisplacements: [
      { blockId: "V-000", translation: { x: -0.004, y: 0.001 }, rotation: 0.0001 },
      { blockId: "V-010", translation: { x: 0, y: 0.002 }, rotation: -0.0001 },
      { blockId: "V-020", translation: { x: 0.004, y: 0.001 }, rotation: 0.0001 },
    ],
  };
  const activeResolved = evaluateArchReinforcementConfiguration(active, input);
  const passiveResolved = evaluateArchReinforcementConfiguration(passive, input);
  const activeState = activeResolved.reinforcementState[0]!;
  const passiveState = passiveResolved.reinforcementState[0]!;
  assert.equal(activeState.initialForce, 100);
  assert.equal(passiveState.initialForce, 0);
  assert.ok(passiveState.force > 0, "the deformation activates the passive tendon");
  assert.equal(activeState.force, passiveState.force + 100, "identical topology, added T0");
  assert.equal(
    activeState.referenceLength,
    passiveState.referenceLength,
    "identical reference geometry",
  );
  assert.equal(
    activeState.currentLength,
    passiveState.currentLength,
    "identical deformed geometry",
  );
  assert.equal(activeResolved.deviceForces.length, passiveResolved.deviceForces.length);
  for (let index = 0; index < activeResolved.deviceForces.length; index += 1) {
    const activeDevice = activeResolved.deviceForces[index]!;
    const passiveDevice = passiveResolved.deviceForces[index]!;
    assert.equal(activeDevice.deviceId, passiveDevice.deviceId);
    // F_active - F_passive = T0 * (t_out - t_in): only the constitutive initialization differs.
    const delta = {
      x: activeDevice.resultantForce.x - passiveDevice.resultantForce.x,
      y: activeDevice.resultantForce.y - passiveDevice.resultantForce.y,
    };
    const pattern = {
      x:
        100 * ((activeDevice.outgoingDirection?.x ?? 0) - (activeDevice.incomingDirection?.x ?? 0)),
      y:
        100 * ((activeDevice.outgoingDirection?.y ?? 0) - (activeDevice.incomingDirection?.y ?? 0)),
    };
    assert.ok(Math.abs(delta.x - pattern.x) <= 1e-9);
    assert.ok(Math.abs(delta.y - pattern.y) <= 1e-9);
  }
});
