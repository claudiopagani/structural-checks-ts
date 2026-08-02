import test from "node:test";

import {
  ExistingMaterial,
  type ExistingMaterialJson,
  type ExistingMaterialOptions,
} from "../dist/index.js";

const options: ExistingMaterialOptions = {
  name: "Existing masonry",
  category: "masonry",
  units: { force: "N", length: "mm" },
  conditionLevel: "good",
  knowledgeLevel: "LC2",
  confidenceFactor: 1.2,
  testResults: [{ id: "test-1" }],
  interventions: [{ type: "grout" }],
};
const material = new ExistingMaterial(options);
const serialized: ExistingMaterialJson = material.toJSON();
const designValue: number = material.designValue(12);
const existing: boolean = material.isExistingMaterial();

void test("ExistingMaterial exposes a strict typed consumer contract", () => {
  void serialized;
  void designValue;
  void existing;
});
