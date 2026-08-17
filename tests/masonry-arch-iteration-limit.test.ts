import assert from "node:assert/strict";
import test from "node:test";

import {
  analyzeMasonryArchLimit,
  createMasonryArch,
  type MasonryInterfaceLawInput,
} from "structural-checks-ts-migration-workspace/applications/masonry-arches";
// Internal low-level seam (not part of the public package exports): the collapse solver is tested
// directly so the iteration-limit forcing is deterministic.
import { solveRigidBlockChainCollapse2D } from "../dist/domain/masonry/rigid-blocks/solveHeymanChainCollapse2D.js";
import type {
  RigidBlock2D,
  RigidBlockAppliedWrench2D,
  RigidBlockInterface2D,
  RigidBlockInterfaceLimitLaw2D,
} from "../dist/domain/masonry/rigid-blocks/types.js";

const rigid: MasonryInterfaceLawInput = {
  response: "rigid-plastic",
  normal: { type: "no-tension" },
  tangential: { type: "frictionless" },
};

function archModel(unitWeight = 20, voussoirCount = 20, includeUniformG2 = false) {
  return createMasonryArch({
    id: "iteration-limit-model",
    units: { force: "kN", length: "m" },
    geometry: {
      kind: "simplified-symmetric",
      referenceCurve: "centerline",
      profile: { type: "circular" },
      span: 10,
      rise: 5,
      thickness: 1,
      outOfPlaneWidth: 1,
      voussoirCount,
    },
    masonry: { unitWeight },
    interfaceLaw: rigid,
    loads: [
      { id: "SW", type: "self-weight", loadCaseId: "G1" },
      ...(includeUniformG2
        ? [{ id: "G2", type: "uniform", loadCaseId: "G2", components: { x: 0, y: -1 } } as const]
        : []),
      {
        id: "Q",
        type: "patch",
        loadCaseId: "Q1",
        components: { x: 0, y: -10 },
        startStation: 0.05,
        endStation: 0.45,
      },
    ],
  });
}

const lowLevelBlock: RigidBlock2D = {
  id: "B1",
  index: 0,
  polygon: [
    { x: -0.5, y: -0.5 },
    { x: 0.5, y: -0.5 },
    { x: 0.5, y: 0.5 },
    { x: -0.5, y: 0.5 },
  ],
  area: 1,
  centroid: { x: 0, y: 0 },
  outOfPlaneWidth: 1,
  volume: 1,
  leftInterfaceId: "I0",
  rightInterfaceId: "I1",
};

const lowLevelInterfaces: RigidBlockInterface2D[] = [
  {
    id: "I0",
    index: 0,
    midpoint: { x: -0.5, y: 0 },
    chainTangent: { x: 1, y: 0 },
    jointAxis: { x: 0, y: 1 },
    length: 1,
    outOfPlaneWidth: 1,
  },
  {
    id: "I1",
    index: 1,
    midpoint: { x: 0.5, y: 0 },
    chainTangent: { x: 1, y: 0 },
    jointAxis: { x: 0, y: 1 },
    length: 1,
    outOfPlaneWidth: 1,
  },
];

const zeroWrench: RigidBlockAppliedWrench2D = {
  blockId: "B1",
  force: { x: 0, y: 0 },
  moment: 0,
  applicationPoint: { x: 0, y: 0 },
};

const heymanLaw: RigidBlockInterfaceLimitLaw2D = {
  friction: null,
  compressiveStrength: null,
  compressionFacetCount: 1,
};

void test("3A low-level: iteration-limit publishes no tableau-derived collapse state", () => {
  const result = solveRigidBlockChainCollapse2D(
    {
      blocks: [lowLevelBlock],
      interfaces: lowLevelInterfaces,
      fixedWrenches: [zeroWrench],
      scalableWrenches: [
        { blockId: "B1", force: { x: -1, y: -1 }, moment: 0, applicationPoint: { x: 0, y: 0 } },
      ],
      interfaceLaws: [heymanLaw, heymanLaw],
    },
    { maxSimplexIterations: 1 },
  );
  assert.equal(result.status, "iteration-limit");
  // A numerical iteration limit is not a certified collapse state: no multiplier and no
  // tableau-derived reactions, interface resultants, or residuals may be published.
  assert.equal(result.lambdaLimit, null);
  assert.equal(result.leftReaction, null);
  assert.equal(result.rightReaction, null);
  assert.equal(result.interfaces, null);
  assert.equal(result.residual, null);
  assert.deepEqual(result.activeConstraints, []);
  assert.ok(result.reason !== null && result.reason.length > 0);
  assert.equal(result.simplex.status, "iteration-limit");
  assert.ok(result.simplex.iterations >= 1);
});

void test("3A façade: iteration-limit stays numerical inability with no certified quantities", () => {
  // A negligible self-weight keeps the fixed state at zero so the deliberately tiny simplex
  // budget is spent (and exhausted) on the collapse problem itself.
  const result = analyzeMasonryArchLimit(archModel(1e-12), {
    scalableLoadCaseIds: ["Q1"],
    maxSimplexIterations: 1,
  });
  const outputs = result.outputs;
  assert.equal(outputs.convergenceInfo.status, "iteration-limit");
  assert.equal(outputs.convergenceInfo.converged, false);
  assert.equal(result.status, "failed");
  assert.equal(outputs.failureMode, "undetermined");
  assert.equal(outputs.analysisOutcome.terminationCategory, "numerical-failure");
  assert.equal(outputs.analysisOutcome.objectiveStatus, "not-verifiable");
  // No certified collapse state and no uncertified result presented as valid capacity.
  assert.equal(outputs.capacity.lambdaFirstLimit, null);
  assert.equal(outputs.capacity.lambdaPeak, null);
  assert.equal(outputs.capacity.lambdaTermination, null);
  assert.equal(outputs.capacity.lambdaCollapse, null);
  assert.equal(outputs.loadFactorCheck.status, "not-verifiable");
  assert.equal(outputs.collapseMechanism, null);
  assert.equal(outputs.reactions, null);
  assert.equal(outputs.interfaces, null);
  assert.equal(outputs.thrustLine, null);
  assert.equal(outputs.equilibrium, null);
  assert.equal(outputs.bondedLayerState, null);
  assert.deepEqual(outputs.hinges, []);
  assert.deepEqual(outputs.criticalInterfaces, []);
});

void test("3B: a converged limit analysis keeps its certified state unchanged", () => {
  const result = analyzeMasonryArchLimit(archModel(20, 40, true), {
    scalableLoadCaseIds: ["Q1"],
  });
  const outputs = result.outputs;
  assert.equal(result.status, "ok");
  assert.equal(outputs.convergenceInfo.status, "optimal");
  const close = (actual: number, expected: number): void => {
    const scale = Math.max(1, Math.abs(expected));
    assert.ok(
      Math.abs(actual - expected) <= 1e-9 * scale,
      `${actual} differs from the pre-hardening value ${expected}.`,
    );
  };
  close(outputs.capacity.lambdaFirstLimit!, 7.234065988841434);
  assert.ok(outputs.reactions !== null);
  assert.ok(outputs.interfaces !== null);
  assert.ok(outputs.equilibrium !== null);
  assert.ok(outputs.thrustLine !== null);
  assert.ok(outputs.bondedLayerState !== null);
  close(outputs.reactions.left.force.x, 109.20730227708664);
  close(outputs.reactions.left.force.y, 428.5097626116232);
  close(outputs.reactions.left.moment, 118.58164964269034);
  close(outputs.reactions.right.force.x, -109.20730227708664);
  close(outputs.reactions.right.force.y, 195.99388976197594);
  close(outputs.reactions.right.moment, 97.99694488098794);
  assert.equal(outputs.interfaces.length, 41);
  close(outputs.interfaces[0]!.normalForce, 428.5097626116232);
  close(outputs.interfaces[0]!.shearForce, -109.20730227708661);
  close(outputs.interfaces[0]!.moment, -118.58164964269034);
  close(outputs.interfaces[20]!.normalForce, 109.20730227708664);
  close(outputs.interfaces[20]!.shearForce, -34.0756983062858);
  close(outputs.interfaces[20]!.moment, 17.28645109404124);
  assert.ok(Math.abs(outputs.equilibrium.normalizedResidual.forceX) <= 1e-9);
  assert.ok(Math.abs(outputs.equilibrium.normalizedResidual.forceY) <= 1e-9);
  assert.ok(Math.abs(outputs.equilibrium.normalizedResidual.moment) <= 1e-9);
});
