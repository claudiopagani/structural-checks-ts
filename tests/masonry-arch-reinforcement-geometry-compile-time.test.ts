import assert from "node:assert/strict";
import test from "node:test";

import type {
  ArchReinforcementTerminationInput,
  BondedLayerReinforcementInput,
  ExtradosArchReinforcementInput,
  IntradosArchReinforcementInput,
} from "structural-checks-ts/applications/masonry-arches";

const archAnchor = {
  type: "arch-anchor",
  station: 0.1,
} as const satisfies ArchReinforcementTerminationInput;

const externalAnchor = {
  type: "external-anchor",
  station: 0.15,
  point: { x: -5, y: -1 },
} as const satisfies ArchReinforcementTerminationInput;

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
    left: externalAnchor,
    right: { type: "external-anchor", station: 0.85, point: { x: 5, y: -1 } },
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

// @ts-expect-error A physical external anchor requires an arch-side station.
const missingStation: ArchReinforcementTerminationInput = {
  type: "external-anchor",
  point: { x: -5, y: -1 },
};

const prescribedDirection: ArchReinforcementTerminationInput = {
  // @ts-expect-error A prescribed direction is not a physical tendon termination.
  type: "external-direction",
  station: 0.1,
  direction: { x: 0, y: -1 },
};

void test("station-based reinforcement shapes compile and expose no block geometry", () => {
  assert.equal(archAnchor.station, 0.1);
  assert.equal(externalAnchor.station, 0.15);
  assert.equal(intradosOpen.topology.type, "open");
  assert.equal(intradosClosed.topology.type, "closed-loop");
  assert.equal(extradosOpen.topology.left.station, 0.15);
  assert.equal(bonded.startStation, 0.2);
  assert.equal("anchorage" in intradosOpen, false);
  assert.equal("extent" in bonded, false);
  assert.equal(missingStation.type, "external-anchor");
  assert.equal(prescribedDirection.type, "external-direction");
});
