import test from "node:test";

import {
  CyclicMasonryCompressionMaterial,
  CyclicMasonryPier2D,
  CyclicMasonryPierAnalysis2D,
  CyclicMasonryShearMaterial,
  SlidingStrengthModel,
  TurnsekSheppardModel,
  cyclicMasonryPierHistoryToCsv,
  type CyclicMasonryPierAnalysis2DOptions,
  type CyclicMasonryPierAnalysisResult,
  type CyclicMasonryPierAnalysisSolveOptions,
  type CyclicMasonryPierHistoryPoint,
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

const element = new CyclicMasonryPier2D({
  id: "pier-analysis-α",
  startNode: { id: "base-analysis-α", x: 0, y: 0 },
  endNode: { id: "top-analysis-α", x: 0, y: 2.5 },
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
  metadata: { label: "analisi muratura β" },
});

const analysisOptions: CyclicMasonryPierAnalysisSolveOptions = {
  element,
  axialCompression: 100,
  lateralDisplacements: [0],
  tolerance: 1e-5,
};
const constructorOptions: CyclicMasonryPierAnalysis2DOptions = {};

void test("CyclicMasonryPierAnalysis2D exposes a strict typed consumer contract", () => {
  const analysis: CyclicMasonryPierAnalysis2D = new CyclicMasonryPierAnalysis2D(constructorOptions);
  const result: CyclicMasonryPierAnalysisResult = analysis.solve(analysisOptions);
  const point: CyclicMasonryPierHistoryPoint | undefined = result.points[0];
  const csv = cyclicMasonryPierHistoryToCsv(result.points);
  void point;
  void csv;
});
