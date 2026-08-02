import test from "node:test";

import {
  CyclicMasonryCompressionMaterial,
  MasonryFiberInterface2D,
  type MasonryFiberInterface2DJson,
  type MasonryFiberInterface2DOptions,
  type MasonryFiberInterface2DState,
} from "../dist/index.js";

const units = { force: "N" as const, length: "mm" as const };
const compressionMaterial = new CyclicMasonryCompressionMaterial({
  units,
  elasticModulus: 2000,
  compressiveStrength: 4,
  peakStrain: 0.002,
  prePeakCurve: "linear",
  damageOnsetStrain: 0.004,
  ultimateStrain: 0.012,
  residualStrengthRatio: 0.2,
  hingeLength: 100,
});
const options: MasonryFiberInterface2DOptions = {
  id: "interface-α",
  units,
  width: 1000,
  thickness: 250,
  hingeLength: 100,
  fiberCount: 16,
  compressionMaterial,
  metadata: { label: "muratura β" },
};

void test("MasonryFiberInterface2D exposes a strict typed consumer contract", () => {
  const interfaceModel: MasonryFiberInterface2D = new MasonryFiberInterface2D(options);
  const state: MasonryFiberInterface2DState = interfaceModel.exportState();
  const serialized: MasonryFiberInterface2DJson = interfaceModel.toJSON();
  interfaceModel.setTrialDeformation(-0.0001, 0);
  void state;
  void serialized;
});
