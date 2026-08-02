import test from "node:test";

import {
  CyclicMasonryShearMaterial,
  SlidingStrengthModel,
  TurnsekSheppardModel,
  type CyclicMasonryShearMaterialJson,
  type CyclicMasonryShearMaterialOptions,
  type CyclicMasonryShearState,
} from "../dist/index.js";

const units = { force: "N" as const, length: "mm" as const };

const options: CyclicMasonryShearMaterialOptions = {
  units,
  shearModulus: 800,
  diagonalTensionModel: new TurnsekSheppardModel({
    units,
    tensileStrength: 0.15,
    shearStressDistributionFactor: 1.2,
  }),
  slidingModel: new SlidingStrengthModel({
    units,
    cohesion: 0.12,
    frictionCoefficient: 0.4,
  }),
  peakShearStrain: 0.004,
  ultimateShearStrain: 0.012,
  residualStrengthRatio: 0.25,
};

void test("CyclicMasonryShearMaterial exposes a strict typed consumer contract", () => {
  const material: CyclicMasonryShearMaterial = new CyclicMasonryShearMaterial(options);
  const state: CyclicMasonryShearState = material.getState();
  const serialized: CyclicMasonryShearMaterialJson = material.toJSON();
  material.setTrialDeformation(0.001, {
    deformableHeight: 2.5,
    effectiveShearArea: 0.25,
    thickness: 0.25,
    compressedLength: 1,
    currentAxialCompression: 200,
  });
  void state;
  void serialized;
});
