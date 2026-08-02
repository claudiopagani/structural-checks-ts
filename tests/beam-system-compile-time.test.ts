import test from "node:test";

import { BeamElement, BeamSystem, Node } from "../dist/index.js";
import type { BeamSystemJson } from "../dist/index.js";

const units = { force: "kN" as const, length: "m" as const };
const nodeA = new Node({ id: "n-α", x: 0, units });
const nodeB = new Node({ id: "n-β", x: 3, units });
const beam = new BeamElement({ id: "beam-α", startNode: nodeA, endNode: nodeB });
const system = new BeamSystem({ id: "system-α", beams: [beam], nodes: [nodeA] });
const chainedSystem: BeamSystem = system.addNode(nodeB);
const serialized: BeamSystemJson = chainedSystem.toJSON();
const totalLength: number = chainedSystem.totalLength();

void test("BeamSystem exposes a strict typed consumer contract", () => {
  void serialized;
  void totalLength;
});
