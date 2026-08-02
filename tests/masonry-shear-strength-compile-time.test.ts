import test from "node:test";

import {
  MohrCoulombModel,
  SlidingStrengthModel,
  TurnsekSheppardModel,
  createMasonryShearStrengthModel,
  type MasonryShearStrengthEvaluation,
  type MasonryShearStrengthModel,
} from "../dist/index.js";

const units = { force: "N" as const, length: "mm" as const };
const mohr = new MohrCoulombModel({
  units,
  cohesion: 0.12,
  frictionCoefficient: 0.4,
});
const sliding = new SlidingStrengthModel({
  units,
  cohesion: 0.1,
  frictionCoefficient: 0.35,
});
const turnsek = new TurnsekSheppardModel({
  units,
  tensileStrength: 0.15,
  shearStressDistributionFactor: 1.2,
});
const model: MasonryShearStrengthModel = createMasonryShearStrengthModel({
  type: "sliding",
  units,
  cohesion: 0.1,
  frictionCoefficient: 0.35,
});
const evaluation: MasonryShearStrengthEvaluation = model.evaluate({
  thickness: 0.25,
  compressedLength: 0.8,
  currentAxialCompression: 120,
});

void test("masonry shear-strength strategies expose strict typed contracts", () => {
  void mohr;
  void sliding;
  void turnsek;
  void model;
  void evaluation;
});
