import test from "node:test";

import {
  MasonryMaterial,
  type MasonryMaterialJson,
  type MasonryMaterialOptions,
} from "../dist/index.js";

const options: MasonryMaterialOptions = {
  name: "Masonry",
  masonryType: "brick",
  unitType: "solid",
  mortarType: "lime",
  fm: 4.5,
  tau0: 0.08,
  fv0: 0.15,
  units: { force: "N", length: "mm" },
};
const material = new MasonryMaterial(options);
const serialized: MasonryMaterialJson = material.toJSON();
const existing: boolean = material.isExistingMaterial();

void test("MasonryMaterial exposes a strict typed consumer contract", () => {
  void serialized;
  void existing;
});
