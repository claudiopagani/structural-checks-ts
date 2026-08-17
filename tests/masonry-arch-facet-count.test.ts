import assert from "node:assert/strict";
import test from "node:test";

import {
  createMasonryArch,
  type MasonryInterfaceLawInput,
} from "structural-checks-ts-migration-workspace/applications/masonry-arches";
// Internal low-level seams (not part of the public package exports): the rigid-block solvers are
// tested directly to pin the compressionFacetCount validation contract at every pertinent entry
// point.
import { solveRigidBlockChainEquilibrium2D } from "../dist/domain/masonry/rigid-blocks/solveHeymanChainEquilibrium2D.js";
import { solveRigidBlockChainCollapse2D } from "../dist/domain/masonry/rigid-blocks/solveHeymanChainCollapse2D.js";
import type {
  RigidBlock2D,
  RigidBlockAppliedWrench2D,
  RigidBlockInterface2D,
  RigidBlockInterfaceLimitLaw2D,
} from "../dist/domain/masonry/rigid-blocks/types.js";

const block: RigidBlock2D = {
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

const interfaces: RigidBlockInterface2D[] = [
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

const wrench: RigidBlockAppliedWrench2D = {
  blockId: "B1",
  force: { x: 0, y: -1 },
  moment: 0,
  applicationPoint: { x: 0, y: 0 },
};

const zeroWrench: RigidBlockAppliedWrench2D = {
  blockId: "B1",
  force: { x: 0, y: 0 },
  moment: 0,
  applicationPoint: { x: 0, y: 0 },
};

function law(compressionFacetCount: number): RigidBlockInterfaceLimitLaw2D {
  return { friction: null, compressiveStrength: 1000, compressionFacetCount };
}

void test("low-level equilibrium solver rejects compressionFacetCount = 1 with finite strength", () => {
  assert.throws(
    () =>
      solveRigidBlockChainEquilibrium2D({
        blocks: [block],
        interfaces,
        wrenches: [wrench],
        interfaceLaws: [law(1), law(1)],
      }),
    /compressionFacetCount/,
  );
});

void test("low-level collapse solver rejects compressionFacetCount = 1 with finite strength", () => {
  assert.throws(
    () =>
      solveRigidBlockChainCollapse2D({
        blocks: [block],
        interfaces,
        fixedWrenches: [zeroWrench],
        scalableWrenches: [wrench],
        interfaceLaws: [law(1), law(1)],
      }),
    /compressionFacetCount/,
  );
});

void test("low-level solvers keep accepting compressionFacetCount 2, 8, and 16", () => {
  for (const compressionFacetCount of [2, 8, 16]) {
    const laws = [law(compressionFacetCount), law(compressionFacetCount)];
    const equilibrium = solveRigidBlockChainEquilibrium2D({
      blocks: [block],
      interfaces,
      wrenches: [wrench],
      interfaceLaws: laws,
    });
    assert.ok(Number.isFinite(equilibrium.leftReaction.force.y));
    const collapse = solveRigidBlockChainCollapse2D({
      blocks: [block],
      interfaces,
      fixedWrenches: [zeroWrench],
      scalableWrenches: [wrench],
      interfaceLaws: laws,
    });
    assert.notEqual(collapse.status, "iteration-limit");
  }
});

void test("compressionFacetCount = 1 stays valid only for the unbounded-compression marker", () => {
  const unbounded: RigidBlockInterfaceLimitLaw2D = {
    friction: null,
    compressiveStrength: null,
    compressionFacetCount: 1,
  };
  const equilibrium = solveRigidBlockChainEquilibrium2D({
    blocks: [block],
    interfaces,
    wrenches: [wrench],
    interfaceLaws: [unbounded, unbounded],
  });
  assert.ok(Number.isFinite(equilibrium.leftReaction.force.y));
});

void test("interface-law input normalization already rejects compressionFacetCount = 1", () => {
  const inputLaw: MasonryInterfaceLawInput = {
    response: "rigid-plastic",
    normal: { type: "no-tension", compressiveStrength: 1000, compressionFacetCount: 1 },
    tangential: { type: "frictionless" },
  };
  assert.throws(
    () =>
      createMasonryArch({
        id: "facet-count",
        units: { force: "kN", length: "m" },
        geometry: {
          kind: "simplified-symmetric",
          referenceCurve: "centerline",
          profile: { type: "circular" },
          span: 10,
          rise: 5,
          thickness: 1,
          outOfPlaneWidth: 1,
          voussoirCount: 3,
        },
        interfaceLaw: inputLaw,
      }),
    /compressionFacetCount/,
  );
});
