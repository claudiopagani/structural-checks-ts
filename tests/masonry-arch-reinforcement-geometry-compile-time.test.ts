import assert from "node:assert/strict";
import test from "node:test";

import type {
  ArchTerminalArchAnchorInput,
  BondedLayerReinforcementInput,
  ExtradosArchReinforcementInput,
  ExtradosArchReinforcementTerminationInput,
  IntradosArchReinforcementTerminationInput,
  IntradosArchReinforcementInput,
} from "structural-checks-ts/applications/masonry-arches";

const archAnchor = {
  type: "arch-anchor",
  station: 0.1,
} as const satisfies ArchTerminalArchAnchorInput;

const externalAnchor = {
  type: "external-anchor",
  station: 0.15,
  point: { x: -5, y: -1 },
} as const satisfies IntradosArchReinforcementTerminationInput;

const extradosExternalAnchor = {
  type: "external-anchor",
  point: { x: -5, y: -1 },
} as const satisfies ExtradosArchReinforcementTerminationInput;

const intradosOpen = {
  id: "I-open",
  side: "intrados",
  area: 0.001,
  elasticModulus: 200_000_000,
  initialForce: 100,
  topology: {
    type: "open",
    left: externalAnchor,
    right: { type: "arch-anchor", station: 0.9 },
    deviators: { type: "stations", deviators: [{ station: 0.5 }] },
  },
} as const satisfies IntradosArchReinforcementInput;

const intradosClosed = {
  id: "I-loop",
  side: "intrados",
  area: 0.001,
  elasticModulus: 200_000_000,
  initialForce: 100,
  topology: {
    type: "closed-loop",
    leftReturnDeviator: { station: 0.15 },
    rightReturnDeviator: { station: 0.85 },
    deviators: { type: "stations", deviators: [{ station: 0.5 }] },
  },
} as const satisfies IntradosArchReinforcementInput;

const extradosOpen = {
  id: "E",
  side: "extrados",
  area: 0.001,
  elasticModulus: 200_000_000,
  initialForce: 100,
  topology: {
    type: "open",
    left: extradosExternalAnchor,
    right: { type: "external-anchor", point: { x: 5, y: -1 } },
    interaction: { type: "unilateral-contact" },
  },
} as const satisfies ExtradosArchReinforcementInput;

const bonded = {
  id: "FRCM",
  family: "frcm",
  side: "intrados",
  area: 0.001,
  elasticModulus: 100_000_000,
  tensileStrength: 1000,
  startStation: 0.2,
  endStation: 0.8,
} as const satisfies BondedLayerReinforcementInput;

// @ts-expect-error An intrados external anchor requires its physical transfer-device station.
const missingIntradosStation: IntradosArchReinforcementTerminationInput = {
  type: "external-anchor",
  point: { x: -5, y: -1 },
};

const prescribedDirection: ExtradosArchReinforcementTerminationInput = {
  // @ts-expect-error A prescribed direction is not a physical tendon termination.
  type: "external-direction",
  direction: { x: 0, y: -1 },
};

const forbiddenExtradosStation: ExtradosArchReinforcementTerminationInput = {
  type: "external-anchor",
  // @ts-expect-error Extrados external anchors have no fixed contact station.
  station: 0.1,
  point: { x: -5, y: -1 },
};

void test("side-specific reinforcement contracts compile and expose no block geometry", () => {
  assert.equal(archAnchor.station, 0.1);
  assert.equal(externalAnchor.station, 0.15);
  assert.equal(intradosOpen.topology.type, "open");
  assert.equal(intradosClosed.topology.type, "closed-loop");
  assert.deepEqual(extradosOpen.topology.left.point, { x: -5, y: -1 });
  assert.equal(bonded.startStation, 0.2);
  assert.equal("anchorage" in intradosOpen, false);
  assert.equal("extent" in bonded, false);
  assert.equal(missingIntradosStation.type, "external-anchor");
  assert.equal(prescribedDirection.type, "external-direction");
  assert.equal(forbiddenExtradosStation.type, "external-anchor");
});
