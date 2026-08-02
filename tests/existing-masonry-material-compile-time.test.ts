import test from "node:test";

import {
  ExistingMasonryMaterial,
  type ExistingMasonryMaterialJson,
  type ExistingMasonryMaterialOptions,
} from "../dist/index.js";

const options: ExistingMasonryMaterialOptions = {
  name: "Existing masonry",
  masonryType: "brick",
  unitType: "solid",
  mortarType: "lime",
  baseProperties: { fm: 1.5, tau0: 0.025, fv0: 0.15, E: 1500, G: 750, w: 18 },
  surveyFactors: { geometry: 0.9 },
  improvementFactors: { ties: 1.1 },
  ntcReference: "NTC 2018 § 8.5",
  units: { force: "N", length: "mm" },
};
const material = new ExistingMasonryMaterial(options);
const serialized: ExistingMasonryMaterialJson = material.toJSON();
const adjusted: number | null = material.adjustedProperty("fm");

void test("ExistingMasonryMaterial exposes a strict typed consumer contract", () => {
  void serialized;
  void adjusted;
});
