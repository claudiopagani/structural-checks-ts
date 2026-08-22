import assert from "node:assert/strict";

import {
  createMasonryArch,
  externalAnchorPointFromExtradosTangency,
  type MasonryArchModel,
  type SimplifiedSymmetricMasonryArchGeometryInput,
} from "structural-checks-ts/applications/masonry-arches";

import {
  resolveArchReinforcementsAtActionFactorUsingContactTopology,
  resolveArchReinforcementsAtActionFactorWithContactTopology,
  type ResolvedArchReinforcements,
} from "../dist/applications/masonry-arches/resolveArchReinforcements.js";
import { createExtradosContactPerformanceModel } from "../benchmarks/masonry-arches/extrados-contact-performance.ts";

const RELATIVE_STEP = 1e-7;

function configuration(model: MasonryArchModel, q: readonly number[]) {
  return {
    units: model.units,
    blockDisplacements: model.geometry.voussoirs.map((block) => ({
      blockId: block.id,
      translation: { x: q[3 * block.index]!, y: q[3 * block.index + 1]! },
      rotation: q[3 * block.index + 2]!,
    })),
  };
}

function reinforcementVector(model: MasonryArchModel, resolved: ResolvedArchReinforcements) {
  const vector = new Array<number>(3 * model.geometry.voussoirs.length).fill(0);
  for (const wrench of resolved.blockWrenches) {
    const block = model.geometry.voussoirs.find((item) => item.id === wrench.blockId)!;
    const base = 3 * block.index;
    vector[base] = vector[base]! + wrench.force.x;
    vector[base + 1] = vector[base + 1]! + wrench.force.y;
    vector[base + 2] = vector[base + 2]! + wrench.moment;
  }
  return vector;
}

function perturbation(model: MasonryArchModel, q: readonly number[], column: number) {
  const step = column % 3 === 2 ? RELATIVE_STEP : RELATIVE_STEP * Math.max(1, model.geometry.span);
  const plus = [...q];
  const minus = [...q];
  plus[column] = plus[column]! + step;
  minus[column] = minus[column]! - step;
  return { plus, minus, step };
}

function signatures(
  evaluated: ReturnType<typeof resolveArchReinforcementsAtActionFactorWithContactTopology>,
) {
  return evaluated.contactTopology.map((topology) => topology.signature).join("|");
}

function centralColumn(plus: readonly number[], minus: readonly number[], step: number): number[] {
  return plus.map((value, row) => (value - minus[row]!) / (2 * step));
}

function maximumDifference(left: readonly number[], right: readonly number[]): number {
  return left.reduce(
    (maximum, value, index) => Math.max(maximum, Math.abs(value - right[index]!)),
    0,
  );
}

const model = createExtradosContactPerformanceModel("A");
const size = 3 * model.geometry.voussoirs.length;

// A deliberately non-rigid prescribed state provides columns away from topology transitions.
const stableQ = new Array<number>(size).fill(0);
for (const block of model.geometry.voussoirs) {
  stableQ[3 * block.index] = 2e-5 * Math.sin(0.37 * (block.index + 1));
  stableQ[3 * block.index + 1] = -3e-5 * Math.cos(0.29 * (block.index + 1));
  stableQ[3 * block.index + 2] = 4e-5 * Math.sin(0.43 * (block.index + 1));
}
const stableBaseline = resolveArchReinforcementsAtActionFactorWithContactTopology(
  model,
  configuration(model, stableQ),
  1,
);
const stableSignature = signatures(stableBaseline);
let stableColumns = 0;
let maximumStableColumnDifference = 0;
for (let column = 0; column < size; column += 1) {
  const { plus, minus, step } = perturbation(model, stableQ, column);
  const exactPlus = resolveArchReinforcementsAtActionFactorWithContactTopology(
    model,
    configuration(model, plus),
    1,
  );
  const exactMinus = resolveArchReinforcementsAtActionFactorWithContactTopology(
    model,
    configuration(model, minus),
    1,
  );
  if (signatures(exactPlus) !== stableSignature || signatures(exactMinus) !== stableSignature) {
    continue;
  }
  stableColumns += 1;
  const fixedPlus = resolveArchReinforcementsAtActionFactorUsingContactTopology(
    model,
    configuration(model, plus),
    1,
    stableBaseline.contactTopology,
  );
  const fixedMinus = resolveArchReinforcementsAtActionFactorUsingContactTopology(
    model,
    configuration(model, minus),
    1,
    stableBaseline.contactTopology,
  );
  const exactColumn = centralColumn(
    reinforcementVector(model, exactPlus.resolved),
    reinforcementVector(model, exactMinus.resolved),
    step,
  );
  const fixedColumn = centralColumn(
    reinforcementVector(model, fixedPlus),
    reinforcementVector(model, fixedMinus),
    step,
  );
  maximumStableColumnDifference = Math.max(
    maximumStableColumnDifference,
    maximumDifference(exactColumn, fixedColumn),
  );
}
assert.ok(stableColumns >= 20, `Expected at least 20 same-topology columns, got ${stableColumns}.`);
assert.ok(
  maximumStableColumnDifference <= 1e-8,
  `Fixed/full-search same-topology tangent mismatch: ${maximumStableColumnDifference}.`,
);

// At the undeformed state, an infinitesimal one-block perturbation can select a joint side. The
// historical full-search central difference therefore crosses topologies; the fixed evaluator
// deliberately remains on the exact baseline branch. A subsequent ordinary evaluation is still
// free to switch to the newly selected physical topology.
const transitionQ = new Array<number>(size).fill(0);
const transitionBaseline = resolveArchReinforcementsAtActionFactorWithContactTopology(
  model,
  configuration(model, transitionQ),
  1,
);
const transitionSignature = signatures(transitionBaseline);
let crossingColumns = 0;
let ordinaryUpdateChangedTopology = false;
for (let column = 0; column < size; column += 1) {
  const { plus, minus } = perturbation(model, transitionQ, column);
  const exactPlus = resolveArchReinforcementsAtActionFactorWithContactTopology(
    model,
    configuration(model, plus),
    1,
  );
  const exactMinus = resolveArchReinforcementsAtActionFactorWithContactTopology(
    model,
    configuration(model, minus),
    1,
  );
  if (signatures(exactPlus) === signatures(exactMinus)) continue;
  crossingColumns += 1;
  ordinaryUpdateChangedTopology ||= signatures(exactPlus) !== transitionSignature;
  const fixedPlus = resolveArchReinforcementsAtActionFactorUsingContactTopology(
    model,
    configuration(model, plus),
    1,
    transitionBaseline.contactTopology,
  );
  const fixedMinus = resolveArchReinforcementsAtActionFactorUsingContactTopology(
    model,
    configuration(model, minus),
    1,
    transitionBaseline.contactTopology,
  );
  assert.deepEqual(
    fixedPlus.contactForces.map((contact) => contact.contactId),
    transitionBaseline.resolved.contactForces.map((contact) => contact.contactId),
  );
  assert.deepEqual(
    fixedMinus.contactForces.map((contact) => contact.contactId),
    transitionBaseline.resolved.contactForces.map((contact) => contact.contactId),
  );
}
assert.ok(crossingColumns > 0, "The transition fixture did not cross a contact topology.");
assert.equal(ordinaryUpdateChangedTopology, true);

// Smooth external-anchor boundaries remain locally mobile inside their selected blocks. This is a
// fixed branch, not a frozen material station: exact and fixed-topology evaluations agree while a
// rigid vertical arch motion shifts both natural tangency stations.
const externalGeometry = {
  kind: "simplified-symmetric",
  referenceCurve: "centerline",
  profile: { type: "circular" },
  span: 10,
  rise: 5,
  thickness: 1,
  outOfPlaneWidth: 1,
  voussoirCount: 21,
} as const satisfies SimplifiedSymmetricMasonryArchGeometryInput;
const rigid = {
  response: "rigid-plastic",
  normal: { type: "no-tension" },
  tangential: { type: "frictionless" },
} as const;
const externalProbe = createMasonryArch({
  id: "fixed-tangency-probe",
  units: { force: "kN", length: "m" },
  geometry: externalGeometry,
  interfaceLaw: rigid,
});
const externalModel = createMasonryArch({
  id: "fixed-tangency-active",
  units: { force: "kN", length: "m" },
  geometry: externalGeometry,
  interfaceLaw: rigid,
  reinforcements: [
    {
      id: "E",
      side: "extrados",
      area: 0.001,
      elasticModulus: 200_000_000,
      initialForce: 20,
      topology: {
        type: "open",
        left: {
          type: "external-anchor",
          point: externalAnchorPointFromExtradosTangency(externalProbe.geometry, "left", 0.2, 2),
        },
        right: {
          type: "external-anchor",
          point: externalAnchorPointFromExtradosTangency(externalProbe.geometry, "right", 0.8, 2),
        },
        interaction: { type: "unilateral-contact", segmentCount: 24 },
      },
    },
  ],
});
const uniformVerticalQ = (translation: number): number[] =>
  externalModel.geometry.voussoirs.flatMap(() => [0, translation, 0]);
const externalBaselineQ = uniformVerticalQ(1e-4);
const externalPlusQ = uniformVerticalQ(1e-4 + RELATIVE_STEP);
const externalMinusQ = uniformVerticalQ(1e-4 - RELATIVE_STEP);
const externalBaseline = resolveArchReinforcementsAtActionFactorWithContactTopology(
  externalModel,
  configuration(externalModel, externalBaselineQ),
  1,
);
const externalExactPlus = resolveArchReinforcementsAtActionFactorWithContactTopology(
  externalModel,
  configuration(externalModel, externalPlusQ),
  1,
);
const externalExactMinus = resolveArchReinforcementsAtActionFactorWithContactTopology(
  externalModel,
  configuration(externalModel, externalMinusQ),
  1,
);
assert.equal(signatures(externalExactPlus), signatures(externalBaseline));
assert.equal(signatures(externalExactMinus), signatures(externalBaseline));
const externalFixedPlus = resolveArchReinforcementsAtActionFactorUsingContactTopology(
  externalModel,
  configuration(externalModel, externalPlusQ),
  1,
  externalBaseline.contactTopology,
);
const externalFixedMinus = resolveArchReinforcementsAtActionFactorUsingContactTopology(
  externalModel,
  configuration(externalModel, externalMinusQ),
  1,
  externalBaseline.contactTopology,
);
assert.ok(
  maximumDifference(
    reinforcementVector(externalModel, externalExactPlus.resolved),
    reinforcementVector(externalModel, externalFixedPlus),
  ) <= 1e-10,
);
assert.ok(
  maximumDifference(
    reinforcementVector(externalModel, externalExactMinus.resolved),
    reinforcementVector(externalModel, externalFixedMinus),
  ) <= 1e-10,
);
const exactPlusBoundary =
  externalExactPlus.resolved.reinforcementState[0]!.contactBoundary!.current!;
const exactMinusBoundary =
  externalExactMinus.resolved.reinforcementState[0]!.contactBoundary!.current!;
assert.ok(
  Math.abs(
    exactPlusBoundary.start.normalizedSideArcStation -
      exactMinusBoundary.start.normalizedSideArcStation,
  ) > 1e-10,
);
assert.equal(exactPlusBoundary.start.kind, "smooth-tangency");
assert.equal(exactPlusBoundary.end.kind, "smooth-tangency");

console.log(
  `Extrados contact tangent: PASS (${stableColumns} same-topology columns, ` +
    `${crossingColumns} transition-crossing columns, maximum agreement error ` +
    `${maximumStableColumnDifference}; external smooth-tangency branch verified).`,
);
