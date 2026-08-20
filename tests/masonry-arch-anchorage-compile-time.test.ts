import assert from "node:assert/strict";
import test from "node:test";

import type {
  BondedLayerExtent,
  ExtradosTendonAnchorage,
  IntradosTendonAnchorage,
  StableExtradosArchReinforcementInput,
  StableIntradosArchReinforcementInput,
} from "structural-checks-ts-migration-workspace/applications/masonry-arches";

const intradosModes = [
  { kind: "terminalBlocks" },
  { kind: "customBlocks", startBlock: 2, endBlock: 8 },
  { kind: "closedLoop" },
  { kind: "externalVertical" },
] as const satisfies readonly IntradosTendonAnchorage[];

const extradosModes = [
  { kind: "terminalBlocks" },
  { kind: "customBlocks", startBlock: 2, endBlock: 8 },
  { kind: "externalByAngle", angleDeg: 45 },
] as const satisfies readonly ExtradosTendonAnchorage[];

const bondedExtent = {
  startBlock: 2,
  endBlock: 8,
} as const satisfies BondedLayerExtent;

const intradosModelInput = {
  id: "I",
  side: "intrados",
  area: 0.001,
  elasticModulus: 200_000_000,
  initialForce: 100,
  anchorage: { kind: "externalVertical" },
} as const satisfies StableIntradosArchReinforcementInput;

const extradosModelInput = {
  id: "E",
  side: "extrados",
  area: 0.001,
  elasticModulus: 200_000_000,
  initialForce: 100,
  anchorage: { kind: "externalByAngle", angleDeg: 45 },
} as const satisfies StableExtradosArchReinforcementInput;

// @ts-expect-error closedLoop is intentionally not an extrados stable mode.
const invalidExtradosLoop: ExtradosTendonAnchorage = { kind: "closedLoop" };

// @ts-expect-error externalByAngle is intentionally not an intrados stable mode.
const invalidIntradosAngle: IntradosTendonAnchorage = { kind: "externalByAngle", angleDeg: 45 };

const invalidExternalPoint: ExtradosTendonAnchorage = {
  // @ts-expect-error free external points are intentionally absent from the stable API.
  kind: "externalByPoint",
  point: { x: 0, y: 0 },
};

void test("stable masonry-arch anchorage unions expose only their side-specific modes", () => {
  assert.equal(intradosModes.length, 4);
  assert.equal(extradosModes.length, 3);
  assert.equal(bondedExtent.startBlock, 2);
  assert.equal(intradosModelInput.side, "intrados");
  assert.equal(extradosModelInput.side, "extrados");
  assert.equal(invalidExtradosLoop.kind, "closedLoop");
  assert.equal(invalidIntradosAngle.kind, "externalByAngle");
  assert.equal(invalidExternalPoint.kind, "externalByPoint");
});
