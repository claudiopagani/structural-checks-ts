import assert from "node:assert/strict";
import test from "node:test";

import {
  analyzeMasonryArchEquilibrium,
  createMasonryArch,
  resolveArchReinforcements,
  type MasonryArchModel,
  type MasonryInterfaceLawInput,
} from "structural-checks-ts/applications/masonry-arches";

/**
 * Deterministic campaign for extrados cables (E. arch-anchored, F. external-anchored) and for
 * multiple simultaneous reinforcements (J).
 */

const rigid: MasonryInterfaceLawInput = {
  response: "rigid-plastic",
  normal: { type: "no-tension" },
  tangential: { type: "frictionless" },
};

function archModel(
  id: string,
  reinforcements: NonNullable<Parameters<typeof createMasonryArch>[0]["reinforcements"]>[number][],
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
    reinforcements: [...reinforcements],
  });
}

// ---------------------------------------------------------------------------
// E. Extrados arch-anchored cables keep unilateral contact
// ---------------------------------------------------------------------------

void test("E1. extrados arch-anchored cable: compression-only contact on the taut envelope", () => {
  const arch = archModel("extrados-e1", [
    {
      id: "E",
      side: "extrados",
      area: 0.001,
      elasticModulus: 200_000_000,
      initialForce: 100,
      topology: {
        type: "open",
        left: { type: "arch-anchor", station: 0 },
        right: { type: "arch-anchor", station: 1 },
        interaction: { type: "unilateral-contact", segmentCount: 24 },
      },
    },
  ]);
  const resolved = resolveArchReinforcements(arch);
  const state = resolved.reinforcementState[0]!;
  assert.equal(state.side, "extrados");
  assert.equal(state.force, 100);
  // The cable ends on the two arch anchors: no external anchors exist.
  assert.deepEqual(resolved.externalAnchorForces, []);
  const anchors = resolved.deviceForces.filter((item) => item.kind === "terminal-arch-anchor");
  assert.equal(anchors.length, 2);
  // Every active contact is compression (positive toward the arch interior): the cable presses
  // down on the extrados and never requires tensile contact to follow the path.
  const activeContacts = resolved.contactForces.filter((item) => item.state === "in-contact");
  assert.ok(activeContacts.length > 0, "the taut envelope has active contact points");
  for (const contact of activeContacts) {
    assert.ok(contact.normalComponent >= -1e-9, "unilateral contact stays compressive on the arch");
  }
  // No contact requires tensile support at the reference configuration.
  assert.ok(resolved.contactForces.every((item) => item.state !== "contact-cannot-enforce-path"));
  // All segments carry the same tension and every segment of the resolved path is reported.
  for (const segment of state.segments) {
    assert.equal(segment.tension, 100);
  }
  assert.equal(
    state.currentLength,
    state.segments.reduce((sum, segment) => sum + segment.length, 0),
  );
  // Open tendon with two arch anchors: the arch-side actions self-equilibrate.
  const equilibrium = state.equilibrium;
  assert.equal(equilibrium.meaning, "open-tendon-free-body");
  assert.equal(equilibrium.satisfied, true);
  assert.ok(Math.abs(equilibrium.residualForce.x) <= 1e-9);
  assert.ok(Math.abs(equilibrium.residualForce.y) <= 1e-9);
  assert.ok(Math.abs(equilibrium.residualMoment) <= 1e-6);
});

// ---------------------------------------------------------------------------
// F. Extrados external-anchored cables
// ---------------------------------------------------------------------------

void test("F1. extrados external-anchored cable: fixed anchors, straight free branches, unilateral contact", () => {
  // The anchors lie outside the springing cuts; their explicit free branches reach the terminal
  // devices without crossing masonry, while the contact envelope remains free to detach.
  const arch = archModel("extrados-f1", [
    {
      id: "E",
      side: "extrados",
      area: 0.001,
      elasticModulus: 200_000_000,
      initialForce: 80,
      topology: {
        type: "open",
        left: { type: "external-anchor", point: { x: -6.2, y: 4 } },
        right: { type: "external-anchor", point: { x: 6.2, y: 4 } },
        interaction: { type: "unilateral-contact", segmentCount: 24 },
      },
    },
  ]);
  const resolved = resolveArchReinforcements(arch);
  const state = resolved.reinforcementState[0]!;
  assert.equal(resolved.externalAnchorForces.length, 2);
  for (const anchor of resolved.externalAnchorForces) {
    assert.equal(anchor.point.x, anchor.referencePoint.x);
    assert.equal(anchor.point.y, anchor.referencePoint.y);
    assert.equal(anchor.point.y, 4, "the external anchor is a fixed global point");
    assert.equal(anchor.tension, 80);
    assert.ok(Math.abs(anchor.resultant - 80) <= 1e-9);
  }
  // The free branches are straight chords from each anchor to the adjacent active contact.
  const first = state.segments[0]!;
  const last = state.segments.at(-1)!;
  assert.equal(first.role, "free-terminal-branch");
  assert.equal(last.role, "free-terminal-branch");
  assert.ok(state.segments.slice(1, -1).every((segment) => segment.role === "contact-envelope"));
  // The terminal branch angle is a result of the geometry: not vertical, and equal to the chord
  // direction between the anchor and the first active contact.
  const branchDirection = {
    x: first.endPoint.x - first.startPoint.x,
    y: first.endPoint.y - first.startPoint.y,
  };
  assert.ok(Math.abs(branchDirection.x) > 1e-9, "the branch is not forced vertical");
  assert.ok(Math.abs(first.length - Math.hypot(branchDirection.x, branchDirection.y)) <= 1e-9);
  // The unilateral solver finds contact from the fixed anchors without a stationed terminal.
  const active = resolved.contactForces.filter((item) => item.state === "in-contact");
  assert.ok(active.length > 0, "the cable keeps contact along the crown");
  for (const contact of active) {
    assert.ok(contact.normalComponent >= -1e-9, "active contact stays compressive");
  }
  // The complete free body closes with the external anchors.
  const equilibrium = state.equilibrium;
  assert.equal(equilibrium.satisfied, true);
  assert.ok(Math.abs(equilibrium.residualForce.x) <= 1e-9);
  assert.ok(Math.abs(equilibrium.residualForce.y) <= 1e-9);
  assert.ok(Math.abs(equilibrium.residualMoment) <= 1e-6);
  // The external anchors take exactly the reactions the arch-side actions require.
  const archSum = equilibrium.archActionForceSum;
  const externalSum = equilibrium.externalAnchorForceSum;
  assert.ok(Math.abs(archSum.x + externalSum.x) <= 1e-9);
  assert.ok(Math.abs(archSum.y + externalSum.y) <= 1e-9);
});

// ---------------------------------------------------------------------------
// J. Multiple simultaneous reinforcements
// ---------------------------------------------------------------------------

void test("J. two reinforcements coexist with stable independent identities", () => {
  const arch = archModel("multi-j", [
    {
      id: "I1",
      side: "intrados",
      area: 0.001,
      elasticModulus: 200_000_000,
      initialForce: 100,
      topology: {
        type: "open",
        left: { type: "arch-anchor", station: 0 },
        right: { type: "arch-anchor", station: 1 },
        deviators: { type: "uniform-count", count: 1 },
      },
    },
    {
      id: "E1",
      side: "extrados",
      area: 0.001,
      elasticModulus: 200_000_000,
      initialForce: 0,
      topology: {
        type: "open",
        left: { type: "arch-anchor", station: 0 },
        right: { type: "arch-anchor", station: 1 },
        interaction: { type: "unilateral-contact", segmentCount: 24 },
      },
    },
  ]);
  const resolved = resolveArchReinforcements(arch);
  assert.deepEqual(
    resolved.reinforcementState.map((item) => item.reinforcementId),
    ["I1", "E1"],
  );
  const intrados = resolved.reinforcementState[0]!;
  const extrados = resolved.reinforcementState[1]!;
  assert.equal(intrados.force, 100, "the active intrados tendon keeps its own force");
  assert.equal(extrados.force, 0, "the passive extrados cable stays slack independently");
  assert.equal(extrados.state, "slack");
  // Device identities are unique and prefixed by the reinforcement id.
  const deviceIds = resolved.deviceForces.map((item) => item.deviceId);
  assert.equal(new Set(deviceIds).size, deviceIds.length);
  for (const device of resolved.deviceForces) {
    assert.ok(device.deviceId.startsWith(`${device.reinforcementId}:`));
  }
  // The arch-side force application equals the sum of both reinforcements' arch actions.
  const archDeviceSum = resolved.deviceForces
    .filter((item) => item.kind !== "external-anchor")
    .reduce(
      (sum, item) => ({ x: sum.x + item.resultantForce.x, y: sum.y + item.resultantForce.y }),
      { x: 0, y: 0 },
    );
  const contactSum = resolved.contactForces.reduce(
    (sum, item) => ({ x: sum.x + item.resultantForce.x, y: sum.y + item.resultantForce.y }),
    { x: 0, y: 0 },
  );
  const blockSum = resolved.blockWrenches.reduce(
    (sum, item) => ({ x: sum.x + item.force.x, y: sum.y + item.force.y }),
    { x: 0, y: 0 },
  );
  assert.ok(Math.abs(archDeviceSum.x + contactSum.x - blockSum.x) <= 1e-9);
  assert.ok(Math.abs(archDeviceSum.y + contactSum.y - blockSum.y) <= 1e-9);
  // Each reinforcement publishes its own equilibrium diagnostic.
  assert.equal(intrados.equilibrium.satisfied, true);
  assert.equal(extrados.equilibrium.satisfied, true);
  // The equilibrium analysis carries both states and both device sets.
  const result = analyzeMasonryArchEquilibrium(arch);
  assert.equal(result.outputs.reinforcementState.length, 2);
  assert.deepEqual(result.outputs.reinforcementState.map((item) => item.reinforcementId).sort(), [
    "E1",
    "I1",
  ]);
  assert.ok(result.outputs.deviceForces.some((item) => item.reinforcementId === "I1"));
  assert.ok(result.outputs.deviceForces.some((item) => item.reinforcementId === "E1"));
});

// ---------------------------------------------------------------------------
// I. Extrados taut-envelope geometry audit
// ---------------------------------------------------------------------------

function extradosExternalModel(id: string, anchors: { readonly x: number; readonly y: number }[]) {
  return archModel(id, [
    {
      id: "E",
      side: "extrados",
      area: 0.001,
      elasticModulus: 200_000_000,
      initialForce: 80,
      topology: {
        type: "open",
        left: { type: "external-anchor", point: anchors[0]! },
        right: { type: "external-anchor", point: anchors[1]! },
        interaction: { type: "unilateral-contact", segmentCount: 24 },
      },
    },
  ]);
}

/** Y of the resolved cable polyline at x, by linear interpolation (the polyline is x-monotone). */
function envelopeYAt(
  path: readonly { readonly x: number; readonly y: number }[],
  x: number,
): number | null {
  for (let index = 0; index < path.length - 1; index += 1) {
    const start = path[index]!;
    const end = path[index + 1]!;
    const left = Math.min(start.x, end.x);
    const right = Math.max(start.x, end.x);
    if (x < left - 1e-12 || x > right + 1e-12) continue;
    if (Math.abs(end.x - start.x) <= 1e-12) return Math.max(start.y, end.y);
    const ratio = (x - start.x) / (end.x - start.x);
    return start.y + ratio * (end.y - start.y);
  }
  return null;
}

void test("I1. the resolved cable never penetrates the sampled extrados", () => {
  const arch = extradosExternalModel("extrados-i1", [
    { x: -6.2, y: 4 },
    { x: 6.2, y: 4 },
  ]);
  const resolved = resolveArchReinforcements(arch);
  const path = resolved.reinforcementState[0]!.path;
  const tolerance = 1e-9 * Math.max(1, Math.abs(path[0]!.y));
  for (const contact of resolved.contactForces) {
    const envelope = envelopeYAt(path, contact.point.x);
    assert.ok(envelope !== null, "the sample lies inside the cable x-range");
    assert.ok(
      contact.point.y <= envelope + tolerance,
      `sample ${contact.index} at y=${contact.point.y} lies below the cable (${envelope})`,
    );
  }
  // Active contact is always compression.
  for (const contact of resolved.contactForces.filter((item) => item.state === "in-contact")) {
    assert.ok(contact.normalComponent >= -1e-9);
  }
});

void test("I2. the resolved cable is x-monotone: no self-intersection", () => {
  const arch = extradosExternalModel("extrados-i2", [
    { x: -6.2, y: 4 },
    { x: 6.2, y: 4 },
  ]);
  const path = resolveArchReinforcements(arch).reinforcementState[0]!.path;
  for (let index = 1; index < path.length; index += 1) {
    assert.ok(
      path[index]!.x > path[index - 1]!.x,
      "strictly increasing x: the taut envelope cannot self-intersect",
    );
  }
});

void test("I3. reversed left/right anchor ordering is rejected before resolution", () => {
  // "Left" and "right" are geometric sides of the simplified-symmetric arch: a user cannot label
  // a right-hand point as the left termination. The error is raised during reinforcement
  // geometry resolution, before any nonlinear continuation.
  const arch = extradosExternalModel("extrados-i3", [
    { x: 5.2, y: 4 },
    { x: -5.2, y: 4 },
  ]);
  assert.throws(
    () => resolveArchReinforcements(arch),
    /left termination must lie geometrically left/,
  );
});

void test("I4. an anchor below the taut envelope dips the cable without penetrating the samples", () => {
  // The anchor hangs below the straight anchor-to-anchor chord but above the extrados; the taut
  // envelope dips to reach it, and the Graham invariant still keeps every sample below the cable.
  const arch = extradosExternalModel("extrados-i4", [
    { x: -4.2, y: 3.6 },
    { x: 6.2, y: 4 },
  ]);
  const resolved = resolveArchReinforcements(arch);
  const path = resolved.reinforcementState[0]!.path;
  const tolerance = 1e-9 * Math.max(1, Math.abs(path[0]!.y));
  for (const contact of resolved.contactForces) {
    const envelope = envelopeYAt(path, contact.point.x);
    assert.ok(envelope !== null);
    assert.ok(contact.point.y <= envelope + tolerance, "no sample is cut by the cable");
  }
  // The anchor itself is an endpoint of the cable.
  assert.deepEqual(path[0], { x: -4.2, y: 3.6 });
  assert.equal(resolved.reinforcementState[0]!.equilibrium.satisfied, true);
});

void test("I5. an external anchor on the extrados without an admissible branch is rejected", () => {
  const coincident = archModel("extrados-i5", [
    {
      id: "E",
      side: "extrados",
      area: 0.001,
      elasticModulus: 200_000_000,
      initialForce: 80,
      topology: {
        type: "open",
        left: {
          type: "external-anchor",
          point: { x: 0, y: 5.5 },
        },
        right: { type: "external-anchor", point: { x: 6.2, y: 4 } },
        interaction: { type: "unilateral-contact", segmentCount: 24 },
      },
    },
  ]);
  assert.throws(
    () => resolveArchReinforcements(coincident),
    /zero-length|coincident|degenerate|crosses the masonry/,
  );
});
