import test from "node:test";

import {
  CYCLIC_MASONRY_INTERNAL_UNITS,
  CyclicMasonryCompressionMaterial,
  type CyclicMasonryCompressionMaterialJson,
  type CyclicMasonryCompressionMaterialOptions,
  type CyclicMasonryCompressionState,
} from "../dist/index.js";

const options: CyclicMasonryCompressionMaterialOptions = {
  units: { force: "N", length: "mm" },
  elasticModulus: 2000,
  compressiveStrength: 4,
  peakStrain: 0.004,
  ultimateStrain: 0.012,
  hingeLength: 100,
};

void test("CyclicMasonryCompressionMaterial exposes a strict typed consumer contract", () => {
  const material: CyclicMasonryCompressionMaterial = new CyclicMasonryCompressionMaterial(options);
  const state: CyclicMasonryCompressionState = material.getState();
  const serialized: CyclicMasonryCompressionMaterialJson = material.toJSON();
  void CYCLIC_MASONRY_INTERNAL_UNITS;
  void state;
  void serialized;
});
