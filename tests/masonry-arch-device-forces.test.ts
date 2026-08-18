import assert from "node:assert/strict";
import test from "node:test";

import {
  createMasonryArch,
  evaluateArchReinforcementConfiguration,
  resolveArchReinforcements,
  type ArchReinforcementInput,
  type MasonryArchModel,
  type MasonryInterfaceLawInput,
} from "structural-checks-ts-migration-workspace/applications/masonry-arches";

/**
 * Deterministic device-force campaign:
 *
 * - H. every published device satisfies F = T_out * t_out - T_in * t_in;
 * - 5A. connector groups publish shares, per-connector demand/capacity/utilization, and never
 *   invent a distribution;
 * - 7. the published geometry is exactly the geometry the mechanics used.
 */

const rigid: MasonryInterfaceLawInput = {
  response: "rigid-plastic",
  normal: { type: "no-tension" },
  tangential: { type: "frictionless" },
};

function archModel(
  id: string,
  reinforcements: readonly ArchReinforcementInput[],
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

function assertDeviceIdentity(
  devices: ReadonlyArray<{
    readonly tensionIn: number;
    readonly tensionOut: number;
    readonly incomingDirection: { readonly x: number; readonly y: number } | null;
    readonly outgoingDirection: { readonly x: number; readonly y: number } | null;
    readonly resultantForce: { readonly x: number; readonly y: number };
  }>,
): void {
  for (const device of devices) {
    const expected = {
      x:
        device.tensionOut * (device.outgoingDirection?.x ?? 0) -
        device.tensionIn * (device.incomingDirection?.x ?? 0),
      y:
        device.tensionOut * (device.outgoingDirection?.y ?? 0) -
        device.tensionIn * (device.incomingDirection?.y ?? 0),
    };
    assert.ok(
      Math.abs(device.resultantForce.x - expected.x) <= 1e-9,
      `device force identity Fx for ${JSON.stringify(device)}`,
    );
    assert.ok(Math.abs(device.resultantForce.y - expected.y) <= 1e-9, `device force identity Fy`);
  }
}

void test("H1. every device of the intrados topologies satisfies F = T_out*t_out - T_in*t_in", () => {
  const models = [
    archModel("device-h1-open", [
      {
        id: "T",
        side: "intrados",
        area: 0.001,
        elasticModulus: 200_000_000,
        initialForce: 120,
        topology: {
          type: "open",
          left: { type: "arch-anchor", station: 0.05 },
          right: { type: "external-anchor", point: { x: 4.5, y: -1 } },
          deviators: {
            type: "stations",
            deviators: [{ station: 0.25 }, { station: 0.5 }, { station: 0.75 }],
          },
        },
      },
    ]),
    archModel("device-h1-loop", [
      {
        id: "L",
        side: "intrados",
        area: 0.001,
        elasticModulus: 200_000_000,
        initialForce: 90,
        topology: {
          type: "closed-loop",
          leftReturnDeviator: { station: 0.1 },
          rightReturnDeviator: { station: 0.9 },
          deviators: {
            type: "stations",
            deviators: [{ station: 0.4 }, { station: 0.5 }, { station: 0.6 }],
          },
        },
      },
    ]),
    archModel("device-h1-extrados", [
      {
        id: "E",
        side: "extrados",
        area: 0.001,
        elasticModulus: 200_000_000,
        initialForce: 70,
        topology: {
          type: "open",
          left: { type: "external-anchor", point: { x: -5.2, y: 4 } },
          right: { type: "arch-anchor", station: 1 },
          interaction: { type: "unilateral-contact", segmentCount: 16 },
        },
      },
    ]),
  ];
  for (const model of models) {
    const resolved = resolveArchReinforcements(model);
    assertDeviceIdentity(resolved.deviceForces);
    // Frictionless deviators: tension is continuous through every non-terminal device.
    for (const device of resolved.deviceForces) {
      if (device.kind !== "terminal-arch-anchor" && device.kind !== "external-anchor") {
        assert.equal(device.tensionIn, device.tensionOut);
      }
    }
  }
});

void test("H2. device identity holds on a deformed prescribed configuration", () => {
  const arch = archModel("device-h2", [
    {
      id: "T",
      side: "intrados",
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
  ]);
  const evaluated = evaluateArchReinforcementConfiguration(arch, {
    units: { force: "kN", length: "m" },
    blockDisplacements: [
      { blockId: "V-000", translation: { x: -0.003, y: 0.001 }, rotation: 0.0002 },
      { blockId: "V-010", translation: { x: 0, y: 0.003 }, rotation: -0.0002 },
      { blockId: "V-020", translation: { x: 0.003, y: 0.001 }, rotation: 0.0002 },
    ],
  });
  assert.ok(evaluated.reinforcementState[0]!.force > 0, "the tendon activates");
  assertDeviceIdentity(evaluated.deviceForces);
});

// ---------------------------------------------------------------------------
// 5A. Connector groups
// ---------------------------------------------------------------------------

void test("5A1. connector groups publish shares and per-connector checks without inventing a split", () => {
  const arch = archModel("device-connectors", [
    {
      id: "T",
      side: "intrados",
      area: 0.001,
      elasticModulus: 200_000_000,
      initialForce: 100,
      topology: {
        type: "open",
        left: {
          type: "arch-anchor",
          station: 0,
          connectors: {
            connectorCount: 3,
            loadShareWeights: [0.5, 0.3, 0.2],
            capacity: { resultantResistance: 40, interactionRule: "independent" },
          },
        },
        right: { type: "arch-anchor", station: 1 },
        deviators: { type: "uniform-count", count: 1 },
      },
    },
  ]);
  const resolved = resolveArchReinforcements(arch);
  const left = resolved.deviceForces[0]!;
  assert.equal(left.kind, "terminal-arch-anchor");
  assert.equal(left.tensionIn, 0);
  assert.equal(left.tensionOut, 100);
  assert.ok(Math.abs(left.demand.resultant - 100) <= 1e-9);
  const connectors = left.connectors;
  assert.ok(connectors !== null && connectors.length === 3);
  const connectorList = connectors;
  const shares = connectorList.map((item) => item.loadShare);
  assert.deepEqual(shares, [0.5, 0.3, 0.2]);
  // Per-connector demand is the assigned share of the device demand.
  for (const connector of connectorList) {
    assert.ok(Math.abs(connector.demand.resultant - connector.loadShare * 100) <= 1e-9);
  }
  // The connector demands sum exactly to the device demand: no load is invented or lost.
  const total = connectorList.reduce((sum, item) => sum + item.demand.resultant, 0);
  assert.ok(Math.abs(total - left.demand.resultant) <= 1e-9);
  // Capacities are per connector: 50 kN demand exceeds 40 kN, the others pass.
  assert.equal(connectorList[0]!.capacity.resultant, 40);
  assert.equal(connectorList[0]!.status, "fail");
  assert.equal(connectorList[1]!.status, "pass");
  assert.equal(connectorList[2]!.status, "pass");
  // The device-level capacity is unassigned for a multi-connector group; its status aggregates
  // the published connector checks.
  assert.equal(left.capacity.resultant, null);
  assert.equal(left.status, "fail");
});

void test("5A2. devices without assigned capacity publish not-verifiable, never utilization", () => {
  const arch = archModel("device-no-capacity", [
    {
      id: "T",
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
  ]);
  const resolved = resolveArchReinforcements(arch);
  for (const device of resolved.deviceForces) {
    assert.equal(device.utilizationRatio, null);
    assert.equal(device.status, "not-verifiable");
  }
});

// ---------------------------------------------------------------------------
// 7. Solver-resolved reinforcement geometry
// ---------------------------------------------------------------------------

void test("7. the published geometry is exactly the geometry used by the mechanics", () => {
  const arch = archModel("device-geometry", [
    {
      id: "T",
      side: "intrados",
      area: 0.001,
      elasticModulus: 200_000_000,
      initialForce: 100,
      topology: {
        type: "open",
        left: { type: "external-anchor", point: { x: -4.5, y: -1 } },
        right: { type: "arch-anchor", station: 1 },
        deviators: {
          type: "stations",
          deviators: [{ station: 0.3 }, { station: 0.5 }],
        },
      },
    },
  ]);
  const state = resolveArchReinforcements(arch).reinforcementState[0]!;
  // Path and segments agree point by point.
  assert.equal(state.segments.length, state.path.length - 1);
  for (let index = 0; index < state.segments.length; index += 1) {
    const segment = state.segments[index]!;
    assert.deepEqual(segment.startPoint, state.path[index]!);
    assert.deepEqual(segment.endPoint, state.path[index + 1]!);
    assert.deepEqual(segment.referenceStartPoint, state.referencePath[index]!);
    assert.deepEqual(segment.referenceEndPoint, state.referencePath[index + 1]!);
    assert.ok(
      Math.abs(
        segment.length -
          Math.hypot(
            segment.endPoint.x - segment.startPoint.x,
            segment.endPoint.y - segment.startPoint.y,
          ),
      ) <= 1e-12,
    );
  }
  // Devices carry their resolved location and match the device-force entries.
  const resolved = resolveArchReinforcements(arch);
  const devices = state.devices;
  assert.equal(devices.length, resolved.deviceForces.length);
  for (const [index, device] of devices.entries()) {
    const force = resolved.deviceForces[index]!;
    assert.equal(device.deviceId, force.deviceId);
    assert.equal(device.kind, force.kind);
    assert.deepEqual(device.point, force.point);
    assert.equal(device.attachedToArch, force.kind !== "external-anchor");
    assert.equal(
      device.station,
      force.station,
      "the published device station is the one the mechanics used",
    );
  }
  // The external anchor is a path endpoint with a null station.
  const external = devices.find((item) => item.kind === "external-anchor")!;
  assert.equal(external.station, null);
  assert.equal(external.attachedToArch, false);
  assert.deepEqual(external.point, state.path[0]!);
  // Total lengths are sums of the published segment lengths.
  assert.ok(
    Math.abs(
      state.referenceLength -
        state.segments.reduce((sum, segment) => sum + segment.referenceLength, 0),
    ) <= 1e-12,
  );
  assert.ok(
    Math.abs(
      state.currentLength - state.segments.reduce((sum, segment) => sum + segment.length, 0),
    ) <= 1e-12,
  );
});
