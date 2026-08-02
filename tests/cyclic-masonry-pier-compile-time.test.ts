import test from "node:test";

import {
  CyclicMasonryCompressionMaterial,
  CyclicMasonryPier2D,
  CyclicMasonryShearMaterial,
  SlidingStrengthModel,
  TurnsekSheppardModel,
  type CyclicMasonryPier2DOptions,
  type CyclicMasonryPierJson,
  type CyclicMasonryPierState,
  type CyclicMasonryPierStateExport,
} from "../dist/index.js";

const units = { force: "N" as const, length: "mm" as const };
const compressionMaterial = new CyclicMasonryCompressionMaterial({
  units,
  elasticModulus: 2000,
  compressiveStrength: 4,
  peakStrain: 0.002,
  prePeakCurve: "linear",
  damageOnsetStrain: 0.003,
  ultimateStrain: 0.01,
  residualStrengthRatio: 0.2,
  hingeLength: 100,
});
const shearMaterial = new CyclicMasonryShearMaterial({
  units,
  shearModulus: 800,
  diagonalTensionModel: new TurnsekSheppardModel({
    units,
    tensileStrength: 0.15,
    shearStressDistributionFactor: 1.2,
    damageCoefficient: 0.8,
    crushingReductionCoefficient: 0.5,
  }),
  slidingModel: new SlidingStrengthModel({
    units,
    cohesion: 0.1,
    frictionCoefficient: 0.4,
    residualCohesionRatio: 0.1,
  }),
  peakShearStrain: 0.004,
  ultimateShearStrain: 0.012,
  hardeningRatio: 0.05,
  residualStrengthRatio: 0.25,
});

const options: CyclicMasonryPier2DOptions = {
  id: "pier-α",
  startNode: { id: "base-α", x: 0, y: 0 },
  endNode: { id: "top-α", x: 0, y: 2.5 },
  units,
  height: 2500,
  width: 1000,
  thickness: 250,
  elasticModulus: 2000,
  shearModulus: 800,
  fiberCount: 16,
  hingeLength: 100,
  compressionMaterial,
  shearMaterial,
  metadata: { label: "muratura β" },
};

void test("CyclicMasonryPier2D exposes a strict typed consumer contract", () => {
  const pier: CyclicMasonryPier2D = new CyclicMasonryPier2D(options);
  const response: CyclicMasonryPierState = pier.setTrialLocalDisplacements([
    0, 0, 0, -0.001, 0.002, 0,
  ]);
  const exported: CyclicMasonryPierStateExport = pier.exportState();
  const serialized: CyclicMasonryPierJson = pier.toJSON();
  pier.commitState();
  const evaluation = pier.evaluate({ localDisplacements: [0, 0, 0, -0.001, 0.002, 0] });
  const cloned: CyclicMasonryPier2D = pier.clone();
  void response;
  void exported;
  void serialized;
  void evaluation;
  void cloned;
});
