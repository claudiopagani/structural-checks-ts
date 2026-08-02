import test from "node:test";

import { StructuralElement } from "../dist/index.js";
import type { StructuralElementJson, StructuralElementNode } from "../dist/index.js";

const firstNode: StructuralElementNode = { id: "n-α" };
const secondNode: StructuralElementNode = { id: "n-β" };
const element = new StructuralElement({
  id: "element-α",
  type: "beam",
  nodes: [firstNode],
  material: { name: "calcestruzzo" },
  crossSection: { name: "rettangolare" },
  metadata: { label: "Elemento δοκιμή" },
});
const chainedElement: StructuralElement = element.addNode(secondNode);
const nodeIds: string[] = chainedElement.nodeIds();
const serialized: StructuralElementJson = chainedElement.toJSON();

void test("StructuralElement exposes a strict typed consumer contract", () => {
  void serialized;
  void nodeIds;
});
