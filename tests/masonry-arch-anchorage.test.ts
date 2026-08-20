import assert from "node:assert/strict";
import test from "node:test";

import {
  analyzeMasonryArchEquilibrium,
  createMasonryArch,
  resolveArchReinforcements,
  resolveBondedLayerExtent,
  resolveExtradosTendonAnchorage,
  resolveIntradosTendonAnchorage,
  type ArchReinforcementInput,
  type BondedLayerExtent,
  type ExtradosTendonAnchorage,
  type IntradosTendonAnchorage,
  type MasonryInterfaceLawInput,
} from "structural-checks-ts-migration-workspace/applications/masonry-arches";

const rigid: MasonryInterfaceLawInput = {
  response: "rigid-plastic",
  normal: { type: "no-tension" },
  tangential: { type: "frictionless" },
};

function tendonModel(id: string, reinforcement: ArchReinforcementInput) {
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
      voussoirCount: 10,
    },
    masonry: { unitWeight: 20 },
    interfaceLaw: rigid,
    loads: [],
    reinforcements: [reinforcement],
  });
}

function stableTendon(
  side: "intrados" | "extrados",
  anchorage: IntradosTendonAnchorage | ExtradosTendonAnchorage,
): ArchReinforcementInput {
  const common = {
    id: `T-${side}`,
    area: 0.001,
    elasticModulus: 200_000_000,
    initialForce: 100,
  } as const;
  return side === "intrados"
    ? { ...common, side, anchorage: anchorage as IntradosTendonAnchorage }
    : { ...common, side, anchorage: anchorage as ExtradosTendonAnchorage };
}

function assertUnitVector(vector: { readonly x: number; readonly y: number } | null): void {
  assert.notEqual(vector, null);
  assert.ok(Number.isFinite(vector!.x));
  assert.ok(Number.isFinite(vector!.y));
  assert.ok(Math.abs(Math.hypot(vector!.x, vector!.y) - 1) <= 1e-12);
}

function assertTerminalPoints(
  side: "intrados" | "extrados",
  anchorage: IntradosTendonAnchorage | ExtradosTendonAnchorage,
): void {
  const model = tendonModel(`terminal-${side}-${anchorage.kind}`, stableTendon(side, anchorage));
  const resolved = resolveArchReinforcements(model);
  const state = resolved.reinforcementState[0]!;
  const firstPoint = model.geometry.interfaces[0]![`${side}Point`];
  const lastPoint = model.geometry.interfaces.at(-1)![`${side}Point`];
  assert.deepEqual(state.path[0], firstPoint, "left terminal is on the first block boundary");
  assert.deepEqual(state.path.at(-1), lastPoint, "right terminal is on the last block boundary");
  assert.notDeepEqual(
    state.path.at(-1),
    model.geometry.interfaces.at(-2)![`${side}Point`],
    "right terminal must not regress to the penultimate block boundary",
  );
}

void test("intrados terminalBlocks resolves exactly the first and last blocks", () => {
  const anchorage = resolveIntradosTendonAnchorage({ kind: "terminalBlocks" }, 10);
  assert.equal(anchorage.startBlockIndex, 0);
  assert.equal(anchorage.endBlockIndex, 9);
  assert.equal(anchorage.hasExternalAnchor, false);
  assert.equal(anchorage.isClosedLoop, false);
  assert.equal(anchorage.startTerminalDirection, null);
  assert.equal(anchorage.endTerminalDirection, null);
  assertTerminalPoints("intrados", { kind: "terminalBlocks" });
  const resolved = resolveArchReinforcements(
    tendonModel("intrados-terminal", stableTendon("intrados", { kind: "terminalBlocks" })),
  );
  assert.deepEqual(resolved.reinforcementState[0]!.anchorage, anchorage);
  assert.deepEqual(resolved.externalAnchorForces, []);
  assert.ok(
    resolved.reinforcementState[0]!.segments.every(
      (segment) => segment.role !== "free-terminal-branch",
    ),
  );
});

void test("intrados customBlocks normalizes one-based block numbers without correction", () => {
  const anchorage = resolveIntradosTendonAnchorage(
    { kind: "customBlocks", startBlock: 2, endBlock: 8 },
    10,
  );
  assert.equal(anchorage.startBlockIndex, 1);
  assert.equal(anchorage.endBlockIndex, 7);
  assert.deepEqual(
    resolveIntradosTendonAnchorage(
      { kind: "customBlocks", startBlock: 1, endBlock: 7, numbering: "zeroBased" },
      10,
    ),
    anchorage,
  );
  const model = tendonModel(
    "intrados-custom-blocks",
    stableTendon("intrados", { kind: "customBlocks", startBlock: 2, endBlock: 8 }),
  );
  const reinforcement = model.reinforcements[0]!;
  assert.equal(reinforcement.side, "intrados");
  if (reinforcement.side !== "intrados") throw new Error("Expected intrados reinforcement.");
  const topology = reinforcement.topology;
  assert.equal(topology.type, "open");
  if (topology.type === "open") {
    assert.equal(topology.left.type, "arch-anchor");
    assert.equal(topology.right.type, "arch-anchor");
    if (topology.left.type === "arch-anchor" && topology.right.type === "arch-anchor") {
      assert.ok(topology.left.station > 0.1 && topology.left.station < 0.2);
      assert.ok(topology.right.station > 0.7 && topology.right.station < 0.8);
    }
  }
});

void test("intrados customBlocks rejects invalid ranges and numeric values", () => {
  const invalid = [
    { startBlock: 0, endBlock: 8 },
    { startBlock: 2, endBlock: 11 },
    { startBlock: 5, endBlock: 5 },
    { startBlock: 8, endBlock: 2 },
    { startBlock: 2.5, endBlock: 8 },
    { startBlock: 2, endBlock: Number.POSITIVE_INFINITY },
    { startBlock: Number.NaN, endBlock: 8 },
    { startBlock: null, endBlock: 8 },
    { startBlock: undefined, endBlock: 8 },
  ] as const;
  for (const range of invalid) {
    assert.throws(() =>
      resolveIntradosTendonAnchorage(
        { kind: "customBlocks", ...range } as unknown as IntradosTendonAnchorage,
        10,
      ),
    );
  }
});

void test("intrados closedLoop is terminal, horizontal, normalized, and has no external point", () => {
  const anchorage = resolveIntradosTendonAnchorage({ kind: "closedLoop" }, 10);
  assert.equal(anchorage.startBlockIndex, 0);
  assert.equal(anchorage.endBlockIndex, 9);
  assert.equal(anchorage.hasExternalAnchor, false);
  assert.equal(anchorage.isClosedLoop, true);
  assertUnitVector(anchorage.startTerminalDirection);
  assertUnitVector(anchorage.endTerminalDirection);
  assert.equal(anchorage.startTerminalDirection!.y, 0);
  assert.equal(anchorage.endTerminalDirection!.y, 0);
  const resolved = resolveArchReinforcements(
    tendonModel("intrados-loop", stableTendon("intrados", { kind: "closedLoop" })),
  );
  assert.equal(resolved.reinforcementState[0]!.topology, "closed-loop");
  assert.deepEqual(resolved.externalAnchorForces, []);
  assert.ok(resolved.reinforcementState[0]!.devices.every((device) => device.attachedToArch));
  assert.ok(resolved.reinforcementState[0]!.path.length > 2);
});

void test("intrados externalVertical uses terminal blocks and prescribed vertical directions", () => {
  const anchorage = resolveIntradosTendonAnchorage({ kind: "externalVertical" }, 10);
  assert.equal(anchorage.startBlockIndex, 0);
  assert.equal(anchorage.endBlockIndex, 9);
  assert.equal(anchorage.hasExternalAnchor, true);
  assert.equal(anchorage.isClosedLoop, false);
  assertUnitVector(anchorage.startTerminalDirection);
  assertUnitVector(anchorage.endTerminalDirection);
  assert.equal(anchorage.startTerminalDirection!.x, 0);
  assert.equal(anchorage.endTerminalDirection!.x, 0);
  assert.ok(Math.abs(anchorage.startTerminalDirection!.y) === 1);
  assert.ok(Math.abs(anchorage.endTerminalDirection!.y) === 1);
  assertTerminalPoints("intrados", { kind: "externalVertical" });

  const model = tendonModel(
    "intrados-external-vertical",
    stableTendon("intrados", { kind: "externalVertical" }),
  );
  const resolved = resolveArchReinforcements(model);
  assert.deepEqual(resolved.reinforcementState[0]!.anchorage, anchorage);
  const reinforcement = model.reinforcements[0]!;
  assert.equal(reinforcement.side, "intrados");
  if (reinforcement.side !== "intrados") throw new Error("Expected intrados reinforcement.");
  const topology = reinforcement.topology;
  assert.equal(topology.type, "open");
  if (topology.type === "open") {
    assert.equal(topology.left.type, "external-direction");
    assert.equal(topology.right.type, "external-direction");
  }
  assert.equal(resolved.externalAnchorForces.length, 2);
  assert.ok(
    resolved.externalAnchorForces.every(
      (force) =>
        force.anchorageGeometry === "prescribed-direction" &&
        Math.abs(force.forceTransmittedToExternalSystem.x) <= 1e-12,
    ),
  );
  assert.ok(resolved.reinforcementState[0]!.devices.every((device) => device.attachedToArch));
  assert.ok(
    resolved.reinforcementState[0]!.segments.every(
      (segment) => segment.role !== "free-terminal-branch",
    ),
  );
  assert.equal(resolved.reinforcementState[0]!.equilibrium.satisfied, true);
});

void test("extrados terminalBlocks resolves exactly the first and last blocks", () => {
  const anchorage = resolveExtradosTendonAnchorage({ kind: "terminalBlocks" }, 10);
  assert.equal(anchorage.startBlockIndex, 0);
  assert.equal(anchorage.endBlockIndex, 9);
  assert.equal(anchorage.hasExternalAnchor, false);
  assert.equal(anchorage.angleDeg, null);
  assert.equal(anchorage.startTerminalDirection, null);
  assert.equal(anchorage.endTerminalDirection, null);
  assertTerminalPoints("extrados", { kind: "terminalBlocks" });
  const resolved = resolveArchReinforcements(
    tendonModel("extrados-terminal", stableTendon("extrados", { kind: "terminalBlocks" })),
  );
  assert.deepEqual(resolved.externalAnchorForces, []);
  assert.ok(
    resolved.reinforcementState[0]!.segments.every(
      (segment) => segment.role !== "free-terminal-branch",
    ),
  );
});

void test("extrados customBlocks normalizes one-based block numbers without correction", () => {
  const anchorage = resolveExtradosTendonAnchorage(
    { kind: "customBlocks", startBlock: 2, endBlock: 8 },
    10,
  );
  assert.equal(anchorage.startBlockIndex, 1);
  assert.equal(anchorage.endBlockIndex, 7);
  const model = tendonModel(
    "extrados-custom-blocks",
    stableTendon("extrados", { kind: "customBlocks", startBlock: 2, endBlock: 8 }),
  );
  const reinforcement = model.reinforcements[0]!;
  assert.equal(reinforcement.side, "extrados");
  if (reinforcement.side !== "extrados") throw new Error("Expected extrados reinforcement.");
  const topology = reinforcement.topology;
  assert.equal(topology.left.type, "arch-anchor");
  assert.equal(topology.right.type, "arch-anchor");
  if (topology.left.type === "arch-anchor" && topology.right.type === "arch-anchor") {
    assert.ok(topology.left.station > 0.1 && topology.left.station < 0.2);
    assert.ok(topology.right.station > 0.7 && topology.right.station < 0.8);
  }
});

void test("extrados customBlocks rejects invalid ranges and numeric values", () => {
  const invalid = [
    { startBlock: 0, endBlock: 8 },
    { startBlock: 2, endBlock: 11 },
    { startBlock: 5, endBlock: 5 },
    { startBlock: 8, endBlock: 2 },
    { startBlock: 2.5, endBlock: 8 },
    { startBlock: 2, endBlock: Number.NEGATIVE_INFINITY },
    { startBlock: Number.NaN, endBlock: 8 },
    { startBlock: null, endBlock: 8 },
    { startBlock: 2, endBlock: undefined },
  ] as const;
  for (const range of invalid) {
    assert.throws(() =>
      resolveExtradosTendonAnchorage(
        { kind: "customBlocks", ...range } as unknown as ExtradosTendonAnchorage,
        10,
      ),
    );
  }
});

void test("extrados externalByAngle defaults to terminal blocks and resolves imposed directions", () => {
  for (const angleDeg of [0, 30, 45, 90]) {
    const anchorage = resolveExtradosTendonAnchorage({ kind: "externalByAngle", angleDeg }, 10);
    assert.equal(anchorage.startBlockIndex, 0);
    assert.equal(anchorage.endBlockIndex, 9);
    assert.equal(anchorage.hasExternalAnchor, true);
    assert.equal(anchorage.angleDeg, angleDeg);
    assertUnitVector(anchorage.startTerminalDirection);
    assertUnitVector(anchorage.endTerminalDirection);
    assert.ok(
      Math.abs(anchorage.startTerminalDirection!.x + anchorage.endTerminalDirection!.x) <= 1e-12,
    );
    assert.ok(
      Math.abs(anchorage.startTerminalDirection!.y - anchorage.endTerminalDirection!.y) <= 1e-12,
    );
    if (angleDeg === 0) {
      assert.equal(anchorage.startTerminalDirection!.y, 0);
      assert.equal(anchorage.endTerminalDirection!.y, 0);
    }
    if (angleDeg === 90) {
      assert.equal(anchorage.startTerminalDirection!.x, 0);
      assert.equal(anchorage.endTerminalDirection!.x, 0);
    }

    const model = tendonModel(
      `extrados-angle-${angleDeg}`,
      stableTendon("extrados", { kind: "externalByAngle", angleDeg }),
    );
    const resolved = resolveArchReinforcements(model);
    assert.deepEqual(resolved.reinforcementState[0]!.anchorage, anchorage);
    assert.equal(resolved.externalAnchorForces.length, 2);
    assert.ok(
      resolved.externalAnchorForces.every(
        (force) => force.anchorageGeometry === "prescribed-direction",
      ),
    );
    assert.ok(resolved.reinforcementState[0]!.devices.every((device) => device.attachedToArch));
    assert.ok(
      resolved.reinforcementState[0]!.segments.every(
        (segment) => segment.role !== "free-terminal-branch",
      ),
    );
    assert.equal(resolved.reinforcementState[0]!.equilibrium.satisfied, true);
  }
});

void test("extrados externalByAngle validates optional custom blocks as one range", () => {
  const anchorage = resolveExtradosTendonAnchorage(
    { kind: "externalByAngle", angleDeg: 45, startBlock: 2, endBlock: 8 },
    10,
  );
  assert.equal(anchorage.startBlockIndex, 1);
  assert.equal(anchorage.endBlockIndex, 7);
  const model = tendonModel(
    "extrados-angle-custom-blocks",
    stableTendon("extrados", {
      kind: "externalByAngle",
      angleDeg: 45,
      startBlock: 2,
      endBlock: 8,
    }),
  );
  const reinforcement = model.reinforcements[0]!;
  assert.equal(reinforcement.side, "extrados");
  if (reinforcement.side !== "extrados") throw new Error("Expected extrados reinforcement.");
  const topology = reinforcement.topology;
  assert.equal(topology.left.type, "external-direction");
  assert.equal(topology.right.type, "external-direction");
  if (topology.left.type === "external-direction" && topology.right.type === "external-direction") {
    assert.ok(topology.left.station > 0.1 && topology.left.station < 0.2);
    assert.ok(topology.right.station > 0.7 && topology.right.station < 0.8);
  }
  assert.throws(() =>
    resolveExtradosTendonAnchorage({ kind: "externalByAngle", angleDeg: 45, startBlock: 2 }, 10),
  );
  assert.throws(() =>
    resolveExtradosTendonAnchorage({ kind: "externalByAngle", angleDeg: 45, endBlock: 8 }, 10),
  );
  assert.throws(() =>
    resolveExtradosTendonAnchorage(
      { kind: "externalByAngle", angleDeg: 45, startBlock: 8, endBlock: 2 },
      10,
    ),
  );
});

void test("extrados externalByAngle rejects non-finite and out-of-range angles", () => {
  for (const angleDeg of [Number.NaN, Number.POSITIVE_INFINITY, -1, 90.0001]) {
    assert.throws(() => resolveExtradosTendonAnchorage({ kind: "externalByAngle", angleDeg }, 10));
  }
});

void test("bonded layer extent resolves block indices and integrates without tendon data", () => {
  const extent = resolveBondedLayerExtent({ startBlock: 2, endBlock: 8 }, 10);
  assert.deepEqual(extent, { startBlockIndex: 1, endBlockIndex: 7 });
  assert.equal("startTerminalDirection" in extent, false);
  assert.equal("endTerminalDirection" in extent, false);
  assert.equal("hasExternalAnchor" in extent, false);
  assert.equal("isClosedLoop" in extent, false);

  const model = createMasonryArch({
    id: "bonded-block-extent",
    units: { force: "kN", length: "m" },
    geometry: {
      kind: "simplified-symmetric",
      referenceCurve: "centerline",
      profile: { type: "circular" },
      span: 10,
      rise: 5,
      thickness: 1,
      outOfPlaneWidth: 1,
      voussoirCount: 10,
    },
    masonry: { unitWeight: 20 },
    interfaceLaw: rigid,
    loads: [],
    bondedLayers: [
      {
        id: "FRCM",
        family: "frcm",
        side: "intrados",
        area: 0.001,
        elasticModulus: 100_000_000,
        tensileStrength: 1000,
        extent: { startBlock: 2, endBlock: 8 },
      },
    ],
  });
  const layer = model.bondedLayers[0]!;
  assert.deepEqual(layer.extent, extent);
  assert.ok(Math.abs(layer.startStation - 0.1) <= 1e-12);
  assert.ok(Math.abs(layer.endStation - 0.8) <= 1e-12);
  assert.ok(layer.startStation < layer.endStation);
  assert.equal("topology" in layer, false);
  assert.equal("anchorage" in layer, false);
  const result = analyzeMasonryArchEquilibrium(model);
  assert.deepEqual(result.outputs.bondedLayerState[0]!.extent, extent);
  assert.equal("startTerminalDirection" in result.outputs.bondedLayerState[0]!, false);
});

void test("bonded layer extent rejects invalid ranges and numeric values", () => {
  const invalid = [
    { startBlock: 0, endBlock: 8 },
    { startBlock: 2, endBlock: 11 },
    { startBlock: 5, endBlock: 5 },
    { startBlock: 8, endBlock: 2 },
    { startBlock: 2.5, endBlock: 8 },
    { startBlock: 2, endBlock: Number.POSITIVE_INFINITY },
    { startBlock: Number.NaN, endBlock: 8 },
    { startBlock: undefined, endBlock: 8 },
    { startBlock: 2, endBlock: null },
  ] as const;
  for (const extent of invalid) {
    assert.throws(() => resolveBondedLayerExtent(extent as unknown as BondedLayerExtent, 10));
  }
});

void test("bonded layer block extent cannot be mixed with station-based advanced input", () => {
  assert.throws(
    () =>
      createMasonryArch({
        id: "bonded-mixed-extent",
        units: { force: "kN", length: "m" },
        geometry: {
          kind: "simplified-symmetric",
          referenceCurve: "centerline",
          profile: { type: "circular" },
          span: 10,
          rise: 5,
          thickness: 1,
          outOfPlaneWidth: 1,
          voussoirCount: 10,
        },
        interfaceLaw: rigid,
        bondedLayers: [
          {
            id: "FRCM",
            family: "frcm",
            side: "intrados",
            area: 0.001,
            elasticModulus: 100_000_000,
            tensileStrength: 1000,
            extent: { startBlock: 2, endBlock: 8 },
            startStation: 0.1,
          },
        ],
      }),
    /cannot combine/,
  );
});
