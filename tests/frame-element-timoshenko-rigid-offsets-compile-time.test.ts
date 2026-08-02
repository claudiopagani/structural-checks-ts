import test from "node:test";

import {
  DofRegistry,
  FrameElement2DTimoshenkoRigidOffsets,
  Node,
  type FrameElement2DTimoshenkoRigidOffsetsInput,
  type FrameElement2DTimoshenkoRigidOffsetsJson,
} from "../dist/index.js";

const units = { force: "kN" as const, length: "m" as const };
const startNode = new Node({ id: "A", x: 0, units });
const endNode = new Node({ id: "B", x: 3, units });
const registry = new DofRegistry().registerNodes([startNode, endNode]);

const input: FrameElement2DTimoshenkoRigidOffsetsInput = {
  id: "rigid-offset-α",
  startNode,
  endNode,
  axialRigidity: 1_000,
  flexuralRigidity: 500,
  shearRigidity: 1_200,
  shearCorrectionFactor: 5 / 6,
  rigidStartOffset: 0.25,
  rigidEndOffset: 0.5,
  referenceStartNode: { id: "A-ref", x: 0.25, y: 0 },
  referenceEndNode: { id: "B-ref", x: 2.5, y: 0 },
  metadata: { label: "asse α" },
};

const element = new FrameElement2DTimoshenkoRigidOffsets(input);
const json: FrameElement2DTimoshenkoRigidOffsetsJson = element.toJSON();
const stiffness: number[][] = element.globalStiffness();
const localDisplacements: number[] = element.localDeformableDisplacements(
  [0, 0, 0, 0, 0, 0],
  registry,
);
const zeroLoads: number[] = element.equivalentNodalLoadVector({ loads: [] });

void test("FrameElement2DTimoshenkoRigidOffsets exposes a strict typed consumer contract", () => {
  void json;
  void stiffness;
  void localDisplacements;
  void zeroLoads;
});
