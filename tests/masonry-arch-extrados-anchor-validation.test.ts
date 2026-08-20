import assert from "node:assert/strict";
import test from "node:test";

import {
  createMasonryArch,
  resolveArchReinforcements,
  type MasonryArchModel,
  type MasonryInterfaceLawInput,
} from "structural-checks-ts-migration-workspace/applications/masonry-arches";

/**
 * STEP 1.2 geometric validation campaign for extrados external anchors:
 *
 * 1. terminal order — left/right are geometric sides, validated before continuation;
 * 2. external-anchor placement — the anchor must lie outside the masonry body and its free branch
 *    must not travel through the masonry before reaching the contact envelope.
 */

const rigid: MasonryInterfaceLawInput = {
  response: "rigid-plastic",
  normal: { type: "no-tension" },
  tangential: { type: "frictionless" },
};

function archModel(
  id: string,
  left: { readonly x: number; readonly y: number },
  right: { readonly x: number; readonly y: number },
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
    reinforcements: [
      {
        id: "E",
        side: "extrados",
        area: 0.001,
        elasticModulus: 200_000_000,
        initialForce: 80,
        topology: {
          type: "open",
          left: { type: "external-anchor", point: left },
          right: { type: "external-anchor", point: right },
          interaction: { type: "unilateral-contact", segmentCount: 24 },
        },
      },
    ],
  });
}

function ellipticalArchModel(
  id: string,
  left: { readonly x: number; readonly y: number },
  right: { readonly x: number; readonly y: number },
): MasonryArchModel {
  return createMasonryArch({
    id,
    units: { force: "kN", length: "m" },
    geometry: {
      kind: "simplified-symmetric",
      referenceCurve: "centerline",
      profile: { type: "elliptical", springingAngle: 60, angleUnits: "deg" },
      span: 10,
      rise: 2,
      thickness: 0.5,
      outOfPlaneWidth: 1,
      voussoirCount: 21,
    },
    masonry: { unitWeight: 20 },
    interfaceLaw: rigid,
    loads: [{ id: "SW", type: "self-weight", loadCaseId: "G" }],
    reinforcements: [
      {
        id: "E",
        side: "extrados",
        area: 0.001,
        elasticModulus: 200_000_000,
        initialForce: 80,
        topology: {
          type: "open",
          left: { type: "external-anchor", point: left },
          right: { type: "external-anchor", point: right },
          interaction: { type: "unilateral-contact", segmentCount: 24 },
        },
      },
    ],
  });
}

// ---------------------------------------------------------------------------
// 1. Terminal order
// ---------------------------------------------------------------------------

void test("A1. normal left/right external anchors are accepted", () => {
  const arch = archModel("t12-a1", { x: -5.2, y: 4 }, { x: 5.2, y: 4 });
  const resolved = resolveArchReinforcements(arch);
  assert.equal(resolved.reinforcementState[0]!.equilibrium.satisfied, true);
  assert.equal(resolved.externalAnchorForces.length, 2);
});

void test("A2. symmetric vertical external branches are accepted", () => {
  // The anchors hang exactly below the extrados springings: the free branches are vertical and
  // pass only through free space beside the masonry.
  const arch = archModel("t12-a2", { x: -5.5, y: -1 }, { x: 5.5, y: -1 });
  const resolved = resolveArchReinforcements(arch);
  const state = resolved.reinforcementState[0]!;
  const first = state.segments[0]!;
  const last = state.segments.at(-1)!;
  assert.equal(first.role, "free-terminal-branch");
  assert.equal(last.role, "free-terminal-branch");
  assert.ok(Math.abs(first.startPoint.x - first.endPoint.x) <= 1e-12, "left branch is vertical");
  assert.ok(Math.abs(last.startPoint.x - last.endPoint.x) <= 1e-12, "right branch is vertical");
  assert.equal(state.equilibrium.satisfied, true);
});

void test("A3. reversed external/external terminals are rejected before continuation", () => {
  const arch = archModel("t12-a3", { x: 4.5, y: 4 }, { x: -4.5, y: 4 });
  assert.throws(
    () => resolveArchReinforcements(arch),
    /left termination must lie geometrically left/,
  );
});

void test("A4. reversed mixed external/arch terminals are rejected before continuation", () => {
  const arch = createMasonryArch({
    id: "t12-a4",
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
        id: "E",
        side: "extrados",
        area: 0.001,
        elasticModulus: 200_000_000,
        initialForce: 80,
        topology: {
          type: "open",
          // A right-hand external point labeled "left", with the right arch anchor at the crown.
          left: { type: "external-anchor", point: { x: 4.2, y: 4 } },
          right: { type: "arch-anchor", station: 0.5 },
          interaction: { type: "unilateral-contact", segmentCount: 24 },
        },
      },
    ],
  });
  assert.throws(
    () => resolveArchReinforcements(arch),
    /left termination must lie geometrically left/,
  );
});

void test("A5. an intrados open tendon with reversed external terminals is rejected too", () => {
  const arch = createMasonryArch({
    id: "t12-a5",
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
          left: { type: "external-anchor", point: { x: 4.5, y: -1 } },
          right: { type: "external-anchor", point: { x: -4.5, y: -1 } },
          deviators: { type: "uniform-count", count: 1 },
        },
      },
    ],
  });
  assert.throws(
    () => resolveArchReinforcements(arch),
    /left termination must lie geometrically left/,
  );
});

// ---------------------------------------------------------------------------
// 2. External-anchor placement vs the masonry body
// ---------------------------------------------------------------------------

void test("B1. an anchor clearly outside the masonry is accepted", () => {
  // r = sqrt(6.2^2 + 5^2) ~ 7.96 > extrados radius 5.5.
  const arch = archModel("t12-b1", { x: -6.2, y: 5 }, { x: 6.2, y: 5 });
  const resolved = resolveArchReinforcements(arch);
  assert.equal(resolved.reinforcementState[0]!.equilibrium.satisfied, true);
});

void test("B2. a vertical branch below/beyond the springing is accepted", () => {
  // The anchor sits below the left springing: the branch travels through free space only.
  const arch = archModel("t12-b2", { x: -5.5, y: -1.5 }, { x: 5.5, y: -1.5 });
  const resolved = resolveArchReinforcements(arch);
  const state = resolved.reinforcementState[0]!;
  assert.ok(Math.abs(state.segments[0]!.startPoint.x - state.segments[0]!.endPoint.x) <= 1e-12);
  assert.equal(state.equilibrium.satisfied, true);
});

void test("B3. an anchor point inside the masonry is rejected", () => {
  // r = sqrt(4.8^2 + 2^2) = 5.2, within the masonry band [4.5, 5.5] and inside the sector.
  const arch = archModel("t12-b3", { x: -4.8, y: 2 }, { x: 5.5, y: 4 });
  assert.throws(
    () => resolveArchReinforcements(arch),
    /external anchor .* lies inside the masonry body/,
  );
});

void test("B4. a free branch crossing the masonry before its contact region is rejected", () => {
  // The anchor lies in the arch opening below the intrados (outside the masonry band): the
  // straight branch from it to the resolved contact envelope travels through the masonry.
  const arch = archModel("t12-b4", { x: -2, y: 1.5 }, { x: 5.2, y: 4 });
  assert.throws(() => resolveArchReinforcements(arch), /free terminal branch crosses the masonry/);
});

void test("B5. a tangent-like free branch is accepted", () => {
  // The anchor is positioned so that the straight branch to the first contact only grazes the
  // extrados: the contact envelope keeps the branch outside the masonry.
  const arch = archModel("t12-b5", { x: -4.5, y: 5.9 }, { x: 4.5, y: 5.9 });
  const resolved = resolveArchReinforcements(arch);
  const state = resolved.reinforcementState[0]!;
  assert.equal(state.segments[0]!.role, "free-terminal-branch");
  for (const contact of resolved.contactForces.filter((item) => item.state === "in-contact")) {
    assert.ok(contact.normalComponent >= -1e-9);
  }
  assert.equal(state.equilibrium.satisfied, true);
});

void test("B6. an anchor exactly on the extrados boundary is accepted", () => {
  // The crown of the extrados is the boundary of the masonry band, not its interior.
  const arch = archModel("t12-b6", { x: 0, y: 5.5 }, { x: 5.2, y: 4 });
  const resolved = resolveArchReinforcements(arch);
  assert.equal(resolved.reinforcementState[0]!.equilibrium.satisfied, true);
});

// ---------------------------------------------------------------------------
// 3. Elliptical contact-envelope anchor classification
// ---------------------------------------------------------------------------

void test("C1. elliptical outside, tangent-like, vertical, and near-springing anchors are accepted", () => {
  const cases = [
    [
      { x: -6.2, y: 3 },
      { x: 6.2, y: 3 },
    ],
    [
      { x: -4.5, y: 3 },
      { x: 4.5, y: 3 },
    ],
    [
      { x: -5.25, y: -1 },
      { x: 5.25, y: -1 },
    ],
    [
      { x: -5.45, y: 0.15 },
      { x: 5.45, y: 0.15 },
    ],
  ] as const;
  for (const [index, [left, right]] of cases.entries()) {
    const resolved = resolveArchReinforcements(ellipticalArchModel(`t12-c1-${index}`, left, right));
    assert.equal(resolved.reinforcementState[0]!.equilibrium.satisfied, true);
  }
});

void test("C2. an elliptical anchor inside the masonry is rejected", () => {
  const arch = ellipticalArchModel("t12-c2", { x: -4.9, y: 0.3 }, { x: 6.2, y: 3 });
  assert.throws(
    () => resolveArchReinforcements(arch),
    /external anchor .* lies inside the masonry body/,
  );
});

void test("C3. an elliptical free branch crossing the masonry is rejected", () => {
  const arch = ellipticalArchModel("t12-c3", { x: -2, y: 0.3 }, { x: 6.2, y: 3 });
  assert.throws(() => resolveArchReinforcements(arch), /free terminal branch crosses the masonry/);
});
