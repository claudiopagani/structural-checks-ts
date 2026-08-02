import test from "node:test";

import { BeamElement, Node } from "../dist/index.js";
import type { BeamElementJson } from "../dist/index.js";

const node = (id: string, x: number): Node =>
  new Node({
    id,
    x,
    units: { force: "kN", length: "m" },
  });

const element = new BeamElement({
  id: "beam-α",
  startNode: node("n-α", 0),
  endNode: node("n-β", 3),
  releases: { ux: true },
  localAxis: { name: "asse locale" },
  metadata: { label: "Trave" },
});
const chainedElement: BeamElement = element.addNode(node("n-γ", 4));
const length: number = chainedElement.length();
const serialized: BeamElementJson = chainedElement.toJSON();

void test("BeamElement exposes a strict typed consumer contract", () => {
  void length;
  void serialized;
});
