import assert from "node:assert/strict";
import test from "node:test";

import {
  analyzeMasonryArchEquilibrium,
  analyzeMasonryArchLimit,
  createMasonryArch,
  evaluateArchReinforcementConfiguration,
  resolveArchReinforcements,
  type MasonryInterfaceLawInput,
} from "structural-checks-ts-migration-workspace/applications/masonry-arches";

const rigid: MasonryInterfaceLawInput = {
  response: "rigid-plastic",
  normal: { type: "no-tension" },
  tangential: { type: "frictionless" },
};

function model(initialForce: number) {
  return createMasonryArch({
    id: `reinforced-${initialForce}`,
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
    loads: [
      { id: "SW", type: "self-weight", loadCaseId: "G" },
      {
        id: "Q",
        type: "patch",
        loadCaseId: "Q",
        components: { x: 0, y: -10 },
        startStation: 0.05,
        endStation: 0.45,
      },
    ],
    reinforcements: [
      {
        id: "PT",
        side: "intrados",
        area: 0.001,
        elasticModulus: 200_000_000,
        initialForce,
        interaction: { type: "rigid-deviators", count: 3 },
        terminations: {
          left: { type: "distributed-anchorage", connectorCount: 1 },
          right: { type: "distributed-anchorage", connectorCount: 1 },
        },
      },
    ],
  });
}

void test("initial tendon force is represented as fixed arch actions", () => {
  const arch = model(100);
  const reinforcement = resolveArchReinforcements(arch);
  const resultant = reinforcement.blockWrenches.reduce(
    (sum, wrench) => ({
      x: sum.x + wrench.force.x,
      y: sum.y + wrench.force.y,
      moment:
        sum.moment +
        wrench.applicationPoint.x * wrench.force.y -
        wrench.applicationPoint.y * wrench.force.x +
        wrench.moment,
    }),
    { x: 0, y: 0, moment: 0 },
  );
  assert.ok(Number.isFinite(resultant.x));
  assert.ok(Number.isFinite(resultant.y));
  assert.ok(Number.isFinite(resultant.moment));
  assert.ok(reinforcement.blockWrenches.length > 0);
});

void test("lambda does not scale tendon pretension", () => {
  const result = analyzeMasonryArchLimit(model(100), { scalableLoadCaseIds: ["Q"] });
  assert.equal(
    result.outputs.analysis.lambda.excludedQuantities.includes("initial-tendon-force"),
    true,
  );
  assert.equal(result.outputs.reinforcementState[0]!.force, 100);
  assert.equal(result.outputs.loadCases.roleByCaseId.Q, "scalable");
});

void test("passive and active tendon states remain distinct", () => {
  const passive = evaluateArchReinforcementConfiguration(model(0), {
    units: { force: "kN", length: "m" },
    blockDisplacements: [],
  });
  assert.equal(passive.reinforcementState[0]!.state, "slack");
  const active = analyzeMasonryArchEquilibrium(model(50));
  assert.equal(active.outputs.reinforcementState[0]!.state, "active-post-tensioned");
});
