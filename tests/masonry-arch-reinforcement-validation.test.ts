import assert from "node:assert/strict";
import test from "node:test";

import {
  createMasonryArch,
  resolveArchReinforcements,
  type ArchReinforcementInput,
  type BondedLayerReinforcementInput,
  type MasonryInterfaceLawInput,
} from "structural-checks-ts/applications/masonry-arches";

/**
 * Deterministic input-validation campaign: malformed reinforcement geometry must be rejected at
 * model normalization or at reinforcement resolution, never deferred to a nonlinear continuation.
 */

const rigid: MasonryInterfaceLawInput = {
  response: "rigid-plastic",
  normal: { type: "no-tension" },
  tangential: { type: "frictionless" },
};

function archWith(reinforcements: readonly ArchReinforcementInput[]) {
  return createMasonryArch({
    id: "validation-arch",
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

interface TendonOverrides {
  readonly left?: Record<string, unknown>;
  readonly right?: Record<string, unknown>;
  readonly deviators?: Record<string, unknown>;
}

function openTendon(overrides: TendonOverrides = {}): Record<string, unknown> {
  return {
    id: "T",
    side: "intrados",
    area: 0.001,
    elasticModulus: 200_000_000,
    initialForce: 10,
    topology: {
      type: "open",
      left: overrides.left ?? { type: "arch-anchor", station: 0 },
      right: overrides.right ?? { type: "arch-anchor", station: 1 },
      deviators: overrides.deviators ?? { type: "uniform-count", count: 1 },
    },
  };
}

void test("I1. extrados closed loop is rejected at normalization", () => {
  assert.throws(
    () =>
      archWith([
        {
          id: "E",
          side: "extrados",
          area: 0.001,
          elasticModulus: 200_000_000,
          initialForce: 10,
          topology: {
            // The extrados union has no closed-loop variant; a malformed consumer value is
            // rejected at runtime by the topology discriminator.
            type: "closed-loop",
            leftReturnDeviator: { station: 0 },
            rightReturnDeviator: { station: 1 },
          },
        } as unknown as ArchReinforcementInput,
      ]),
    /closed loop|topology|extrados/,
  );
});

void test("I2. overlapping or equal terminal stations are rejected", () => {
  assert.throws(
    () =>
      archWith([
        {
          id: "T",
          side: "intrados",
          area: 0.001,
          elasticModulus: 200_000_000,
          initialForce: 10,
          topology: {
            type: "open",
            left: { type: "arch-anchor", station: 0.6 },
            right: { type: "arch-anchor", station: 0.6 },
            deviators: { type: "uniform-count", count: 1 },
          },
        },
      ]),
    /greater than|overlapping/,
  );
});

void test("I3. deviator stations must lie strictly inside (0, 1)", () => {
  assert.throws(
    () =>
      archWith([
        openTendon({
          deviators: { type: "stations", deviators: [{ station: 0 }, { station: 0.5 }] },
        }) as unknown as ArchReinforcementInput,
      ]),
    /strictly inside/,
  );
  assert.throws(
    () =>
      archWith([
        openTendon({
          deviators: { type: "stations", deviators: [{ station: 1 }] },
        }) as unknown as ArchReinforcementInput,
      ]),
    /strictly inside/,
  );
});

void test("I4. deviator stations must be strictly increasing", () => {
  assert.throws(
    () =>
      archWith([
        openTendon({
          deviators: {
            type: "stations",
            deviators: [{ station: 0.5 }, { station: 0.2 }],
          },
        }) as unknown as ArchReinforcementInput,
      ]),
    /strictly increasing/,
  );
});

void test("I5. a deviator coincident with a terminal anchor is contradictory", () => {
  assert.throws(
    () =>
      archWith([
        openTendon({
          left: { type: "arch-anchor", station: 0.25 },
          deviators: { type: "stations", deviators: [{ station: 0.25 }] },
        }) as unknown as ArchReinforcementInput,
      ]),
    /greater than|overlapping/,
  );
});

void test("I6. an intrados tendon with two arch anchors requires at least one deviator", () => {
  assert.throws(
    () =>
      archWith([
        openTendon({
          deviators: { type: "stations", deviators: [] },
        }) as unknown as ArchReinforcementInput,
      ]),
    /deviators|degenerate/,
  );
});

void test("I7. a closed loop with no interior deviators is degenerate", () => {
  assert.throws(
    () =>
      archWith([
        {
          id: "L",
          side: "intrados",
          area: 0.001,
          elasticModulus: 200_000_000,
          initialForce: 10,
          topology: {
            type: "closed-loop",
            leftReturnDeviator: { station: 0 },
            rightReturnDeviator: { station: 1 },
            deviators: { type: "uniform-count", count: 0 },
          },
        },
      ]),
    /positive integer|degenerate/,
  );
});

void test("I8. coincident return deviators give an invalid return segment", () => {
  assert.throws(
    () =>
      archWith([
        {
          id: "L",
          side: "intrados",
          area: 0.001,
          elasticModulus: 200_000_000,
          initialForce: 10,
          topology: {
            type: "closed-loop",
            leftReturnDeviator: { station: 0.5 },
            rightReturnDeviator: { station: 0.5 },
            deviators: { type: "uniform-count", count: 1 },
          },
        },
      ]),
    /greater than|overlapping/,
  );
});

void test("I9. anchorage/connector input no longer exists in the model contract", () => {
  // The connector-group abstraction was removed: the normalized model contract carries pure
  // geometry and material properties. The serialized reinforcement input contains no
  // connector/capacity keys anywhere.
  const model = archWith([
    {
      id: "T",
      side: "intrados",
      area: 0.001,
      elasticModulus: 200_000_000,
      initialForce: 10,
      topology: {
        type: "open",
        left: { type: "arch-anchor", station: 0 },
        right: { type: "external-anchor", station: 1, point: { x: 4.5, y: -1 } },
        deviators: { type: "uniform-count", count: 1 },
      },
    },
  ]);
  const serialized = JSON.stringify(model.toJSON());
  assert.ok(!serialized.includes("connector"), "no connector semantics in the serialized model");
  assert.ok(!serialized.includes("capacity"), "no device capacity in the serialized model");
  assert.ok(!serialized.includes("loadShare"), "no load sharing in the serialized model");
});

void test("I10. an external anchor coincident with its adjacent cable point is rejected at resolution", () => {
  // The free segment would have zero length: the reference path is degenerate. This check needs
  // the resolved geometry, so it is enforced by reinforcement resolution, still before any
  // nonlinear continuation.
  const coincident = createMasonryArch({
    id: "validation-coincident",
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
        initialForce: 10,
        topology: {
          type: "open",
          left: {
            type: "external-anchor",
            station: 0.5,
            // Exactly the intrados point at the crown deviator station 0.5.
            point: { x: 0, y: 4.5 },
          },
          right: { type: "arch-anchor", station: 1 },
          deviators: { type: "stations", deviators: [{ station: 0.75 }] },
        },
      },
    ],
  });
  assert.throws(() => resolveArchReinforcements(coincident), /degenerate|coincident/);
});

void test("I11. bonded layers with a non-positive effective interval are rejected", () => {
  assert.throws(
    () =>
      createMasonryArch({
        id: "validation-bonded",
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
        loads: [],
        bondedLayers: [
          {
            id: "FRCM",
            family: "frcm",
            side: "intrados",
            area: 0.01,
            elasticModulus: 100_000_000,
            tensileStrength: 840,
            startStation: 0.6,
            endStation: 0.6,
          },
        ],
      }),
    /greater than/,
  );
});

void test("I12. every physical reinforcement station is required at runtime", () => {
  assert.throws(
    () =>
      archWith([
        openTendon({
          left: { type: "external-anchor", point: { x: -5, y: -1 } },
        }) as unknown as ArchReinforcementInput,
      ]),
    /station is required/,
  );
  assert.throws(
    () =>
      createMasonryArch({
        id: "validation-missing-bonded-station",
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
        interfaceLaw: rigid,
        bondedLayers: [
          {
            id: "FRCM",
            family: "frcm",
            side: "intrados",
            area: 0.01,
            elasticModulus: 100_000_000,
            tensileStrength: 840,
            endStation: 0.8,
          } as unknown as BondedLayerReinforcementInput,
        ],
      }),
    /startStation is required/,
  );
});

void test("I13. the removed extrados external terminal station is rejected at runtime", () => {
  assert.throws(
    () =>
      archWith([
        {
          id: "legacy-extrados-terminal",
          side: "extrados",
          area: 0.001,
          elasticModulus: 200_000_000,
          initialForce: 10,
          topology: {
            type: "open",
            left: { type: "external-anchor", station: 0.2, point: { x: -6, y: 1 } },
            right: { type: "external-anchor", station: 0.8, point: { x: 6, y: 1 } },
            interaction: { type: "unilateral-contact" },
          },
        } as unknown as ArchReinforcementInput,
      ]),
    /station is not supported for an extrados external anchor/,
  );
});
