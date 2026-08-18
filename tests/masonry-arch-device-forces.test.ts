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
// A–G. Pure mechanical-action contract
// ---------------------------------------------------------------------------

void test("A. terminal arch anchor: reaction, magnitude, direction, location, block application", () => {
  const arch = archModel("device-a", [
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
  const left = resolved.deviceForces.find(
    (item) => item.kind === "terminal-arch-anchor" && item.terminationSide === "left",
  )!;
  assert.equal(left.tensionIn, 0);
  assert.equal(left.tensionOut, 100);
  assert.ok(Math.abs(left.resultant - 100) <= 1e-9, "the terminal anchor carries the full tension");
  assert.ok(Math.abs(left.resultantForce.x - 100 * left.outgoingDirection!.x) <= 1e-9);
  assert.ok(Math.abs(left.resultantForce.y - 100 * left.outgoingDirection!.y) <= 1e-9);
  assert.ok(left.resultantDirection !== null);
  assert.ok(
    Math.abs(Math.hypot(left.resultantDirection.x, left.resultantDirection.y) - 1) <= 1e-12,
  );
  assert.ok(left.resultantAngle !== null);
  assert.ok(
    Math.abs(left.resultantAngle - Math.atan2(left.resultantForce.y, left.resultantForce.x)) <=
      1e-12,
  );
  // The station and location are the resolved geometry of the assigned station 0.
  assert.ok(Math.abs(left.station! - 0) <= 1e-9);
  assert.deepEqual(left.point, left.referencePoint);
  // The reaction is applied to the arch: the left springing voussoir carries the pull.
  const firstBlock = resolved.blockWrenches[0]!;
  assert.ok(
    firstBlock.force.x !== 0 || firstBlock.force.y !== 0,
    "the terminal force reaches the arch block",
  );
  const blockSum = resolved.blockWrenches.reduce(
    (sum, item) => ({ x: sum.x + item.force.x, y: sum.y + item.force.y }),
    { x: 0, y: 0 },
  );
  const deviceSum = resolved.deviceForces
    .filter((item) => item.kind !== "external-anchor")
    .reduce(
      (sum, item) => ({ x: sum.x + item.resultantForce.x, y: sum.y + item.resultantForce.y }),
      { x: 0, y: 0 },
    );
  assert.ok(Math.abs(blockSum.x - deviceSum.x) <= 1e-9);
  assert.ok(Math.abs(blockSum.y - deviceSum.y) <= 1e-9);
});

void test("B. intrados deviator: exact identity F = T_out*t_out - T_in*t_in with coherent magnitude/direction", () => {
  const arch = archModel("device-b", [
    {
      id: "T",
      side: "intrados",
      area: 0.001,
      elasticModulus: 200_000_000,
      initialForce: 90,
      topology: {
        type: "open",
        left: { type: "arch-anchor", station: 0 },
        right: { type: "arch-anchor", station: 1 },
        deviators: {
          type: "stations",
          deviators: [{ station: 0.25 }, { station: 0.5 }, { station: 0.75 }],
        },
      },
    },
  ]);
  const resolved = resolveArchReinforcements(arch);
  const deviators = resolved.deviceForces.filter((item) => item.kind === "deviator");
  assert.equal(deviators.length, 3);
  for (const device of deviators) {
    assert.equal(device.tensionIn, device.tensionOut, "frictionless deviator");
    const expected = {
      x:
        device.tensionOut * device.outgoingDirection!.x -
        device.tensionIn * device.incomingDirection!.x,
      y:
        device.tensionOut * device.outgoingDirection!.y -
        device.tensionIn * device.incomingDirection!.y,
    };
    assert.ok(Math.abs(device.resultantForce.x - expected.x) <= 1e-9);
    assert.ok(Math.abs(device.resultantForce.y - expected.y) <= 1e-9);
    assert.ok(
      Math.abs(Math.hypot(device.resultantForce.x, device.resultantForce.y) - device.resultant) <=
        1e-9,
    );
    if (device.resultant > 1e-12) {
      assert.ok(device.resultantDirection !== null);
      assert.ok(device.resultantAngle !== null);
      assert.ok(
        Math.abs(device.resultantDirection.x - device.resultantForce.x / device.resultant) <= 1e-12,
      );
      assert.ok(
        Math.abs(device.resultantDirection.y - device.resultantForce.y / device.resultant) <= 1e-12,
      );
      assert.ok(
        Math.abs(
          device.resultantAngle - Math.atan2(device.resultantForce.y, device.resultantForce.x),
        ) <= 1e-12,
      );
    } else {
      assert.equal(device.resultantDirection, null);
      assert.equal(device.resultantAngle, null);
    }
  }
});

void test("C. external anchor: fixed point, Fx/Fy, magnitude/direction, no arch block action, free-body closure", () => {
  const arch = archModel("device-c", [
    {
      id: "T",
      side: "intrados",
      area: 0.001,
      elasticModulus: 200_000_000,
      initialForce: 70,
      topology: {
        type: "open",
        left: { type: "arch-anchor", station: 0 },
        right: { type: "external-anchor", point: { x: 4.5, y: -1 } },
        deviators: { type: "uniform-count", count: 1 },
      },
    },
  ]);
  const resolved = resolveArchReinforcements(arch);
  const anchor = resolved.externalAnchorForces[0]!;
  assert.equal(anchor.terminationSide, "right");
  assert.deepEqual(anchor.point, { x: 4.5, y: -1 }, "the anchor is a fixed global point");
  assert.equal(anchor.tension, 70);
  assert.ok(Math.abs(anchor.resultant - 70) <= 1e-9);
  assert.ok(anchor.resultantDirection !== null);
  assert.ok(anchor.resultantAngle !== null);
  assert.ok(
    Math.abs(anchor.forceTransmittedToExternalSystem.x - 70 * anchor.resultantDirection.x) <= 1e-9,
  );
  assert.ok(
    Math.abs(anchor.forceTransmittedToExternalSystem.y - 70 * anchor.resultantDirection.y) <= 1e-9,
  );
  assert.ok(
    Math.abs(
      anchor.resultantAngle -
        Math.atan2(
          anchor.forceTransmittedToExternalSystem.y,
          anchor.forceTransmittedToExternalSystem.x,
        ),
    ) <= 1e-12,
  );
  // The external action is never applied to an arch block: the block wrenches equal only the
  // arch-side device actions.
  const blockSum = resolved.blockWrenches.reduce(
    (sum, item) => ({ x: sum.x + item.force.x, y: sum.y + item.force.y }),
    { x: 0, y: 0 },
  );
  const archSum = resolved.deviceForces
    .filter((item) => item.kind !== "external-anchor")
    .reduce(
      (sum, item) => ({ x: sum.x + item.resultantForce.x, y: sum.y + item.resultantForce.y }),
      { x: 0, y: 0 },
    );
  assert.ok(Math.abs(blockSum.x - archSum.x) <= 1e-9);
  assert.ok(Math.abs(blockSum.y - archSum.y) <= 1e-9);
  // The external anchor is included in the free-body closure.
  const equilibrium = resolved.reinforcementState[0]!.equilibrium;
  assert.equal(equilibrium.satisfied, true);
  assert.ok(Math.abs(equilibrium.residualForce.x) <= 1e-9);
  assert.ok(Math.abs(equilibrium.residualForce.y) <= 1e-9);
});

void test("D. return deviator: correct reaction, no fictitious terminal anchor, loop equilibrium closes", () => {
  const arch = archModel("device-d", [
    {
      id: "L",
      side: "intrados",
      area: 0.001,
      elasticModulus: 200_000_000,
      initialForce: 60,
      topology: {
        type: "closed-loop",
        leftReturnDeviator: { station: 0 },
        rightReturnDeviator: { station: 1 },
        deviators: { type: "uniform-count", count: 1 },
      },
    },
  ]);
  const resolved = resolveArchReinforcements(arch);
  assert.deepEqual(
    resolved.deviceForces.map((item) => item.kind),
    ["return-deviator", "deviator", "return-deviator"],
  );
  const left = resolved.deviceForces[0]!;
  // The left return deviator has an incoming return segment and an outgoing intrados segment.
  assert.equal(left.tensionIn, 60);
  assert.equal(left.tensionOut, 60);
  assert.ok(left.incomingDirection !== null && left.outgoingDirection !== null);
  const expected = {
    x: 60 * left.outgoingDirection.x - 60 * left.incomingDirection.x,
    y: 60 * left.outgoingDirection.y - 60 * left.incomingDirection.y,
  };
  assert.ok(Math.abs(left.resultantForce.x - expected.x) <= 1e-9);
  assert.ok(Math.abs(left.resultantForce.y - expected.y) <= 1e-9);
  // No terminal anchor exists; the loop free body self-equilibrates.
  assert.ok(resolved.deviceForces.every((item) => item.kind !== "terminal-arch-anchor"));
  assert.equal(resolved.reinforcementState[0]!.equilibrium.satisfied, true);
  assert.ok(Math.abs(resolved.reinforcementState[0]!.equilibrium.residualForce.x) <= 1e-9);
  assert.ok(Math.abs(resolved.reinforcementState[0]!.equilibrium.residualForce.y) <= 1e-9);
});

void test("G. reinforcement-device results contain no connector-group/capacity/utilization semantics", () => {
  // Public-contract regression: the device results are pure mechanical actions. The removed
  // anchorage abstractions must not resurface in the serialized shape.
  const arch = archModel("device-g", [
    {
      id: "T",
      side: "intrados",
      area: 0.001,
      elasticModulus: 200_000_000,
      initialForce: 100,
      topology: {
        type: "open",
        left: { type: "arch-anchor", station: 0 },
        right: { type: "external-anchor", point: { x: 4.5, y: -1 } },
        deviators: { type: "uniform-count", count: 1 },
      },
    },
  ]);
  const resolved = resolveArchReinforcements(arch);
  for (const device of resolved.deviceForces) {
    assert.equal("capacity" in device, false);
    assert.equal("demand" in device, false);
    assert.equal("utilizationRatio" in device, false);
    assert.equal("status" in device, false);
    assert.equal("connectors" in device, false);
    assert.equal("interactionRule" in device, false);
  }
  for (const anchor of resolved.externalAnchorForces) {
    assert.equal("capacity" in anchor, false);
    assert.equal("utilizationRatio" in anchor, false);
    assert.equal("status" in anchor, false);
    assert.equal("connectors" in anchor, false);
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
