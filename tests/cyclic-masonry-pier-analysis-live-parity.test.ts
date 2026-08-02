import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const sourceRoot = path.resolve(repositoryRoot, "..", "strutture-js");
const sourceRevision = "6f33baead8b88166c4b2cf94af41763412e3c751";

interface PierRuntime {
  setTrialLocalDisplacements(displacements: number[]): Record<string, unknown>;
  toJSON(): Record<string, unknown>;
}

interface AnalysisRuntime {
  solve(options: Record<string, unknown>): Record<string, unknown>;
}

interface ModuleRuntime {
  CyclicMasonryPier2D: new (options: Record<string, unknown>) => PierRuntime;
  CyclicMasonryPierAnalysis2D: new (options?: Record<string, unknown>) => AnalysisRuntime;
  CyclicMasonryCompressionMaterial: new (options: Record<string, unknown>) => object;
  CyclicMasonryShearMaterial: new (options: Record<string, unknown>) => object;
  SlidingStrengthModel: new (options: Record<string, unknown>) => object;
  TurnsekSheppardModel: new (options: Record<string, unknown>) => object;
  cyclicMasonryPierHistoryToCsv(points: unknown): string;
}

function isModuleRuntime(value: unknown): value is ModuleRuntime {
  return (
    value !== null &&
    typeof value === "object" &&
    typeof Reflect.get(value, "CyclicMasonryPier2D") === "function" &&
    typeof Reflect.get(value, "CyclicMasonryPierAnalysis2D") === "function" &&
    typeof Reflect.get(value, "CyclicMasonryCompressionMaterial") === "function" &&
    typeof Reflect.get(value, "CyclicMasonryShearMaterial") === "function" &&
    typeof Reflect.get(value, "SlidingStrengthModel") === "function" &&
    typeof Reflect.get(value, "TurnsekSheppardModel") === "function" &&
    typeof Reflect.get(value, "cyclicMasonryPierHistoryToCsv") === "function"
  );
}

function gitOutput(...arguments_: readonly string[]): string {
  return execFileSync("git", ["-C", sourceRoot, ...arguments_], { encoding: "utf8" }).trim();
}

function createPierOptions(moduleValue: ModuleRuntime): Record<string, unknown> {
  const units = { force: "N", length: "mm" };
  const compressionMaterial = new moduleValue.CyclicMasonryCompressionMaterial({
    units,
    elasticModulus: 2000,
    compressiveStrength: 4,
    peakStrain: 0.002,
    prePeakCurve: "linear",
    damageOnsetStrain: 0.003,
    ultimateStrain: 0.01,
    residualStrengthRatio: 0.2,
    unloadingStiffnessDegradation: 0.3,
    strengthDegradation: 0.2,
    hingeLength: 100,
    numericalTangentRatio: 1e-8,
  });
  const shearMaterial = new moduleValue.CyclicMasonryShearMaterial({
    units,
    shearModulus: 800,
    diagonalTensionModel: new moduleValue.TurnsekSheppardModel({
      units,
      tensileStrength: 0.15,
      shearStressDistributionFactor: 1.2,
      damageCoefficient: 0.8,
      crushingReductionCoefficient: 0.5,
    }),
    slidingModel: new moduleValue.SlidingStrengthModel({
      units,
      cohesion: 0.1,
      frictionCoefficient: 0.4,
      residualCohesionRatio: 0.1,
    }),
    peakShearStrain: 0.004,
    ultimateShearStrain: 0.012,
    hardeningRatio: 0.05,
    residualStrengthRatio: 0.25,
    pinching: { enabled: true, factor: 0.35, recoveryRatio: 0.8 },
    stiffnessDegradation: {
      enabled: true,
      ductilityCoefficient: 0.2,
      energyCoefficient: 0.05,
    },
    strengthDegradation: {
      enabled: true,
      ductilityCoefficient: 0.15,
      energyCoefficient: 0.05,
    },
  });

  return {
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
  };
}

function createResult(moduleValue: ModuleRuntime): {
  element: PierRuntime;
  result: Record<string, unknown>;
} {
  const element = new moduleValue.CyclicMasonryPier2D(createPierOptions(moduleValue));
  const analysis = new moduleValue.CyclicMasonryPierAnalysis2D();
  const result = analysis.solve({
    element,
    axialCompression: 150,
    lateralDisplacements: [0, 0.001, 0.002, 0.001, 0],
    tolerance: 2e-5,
    maxIterations: 30,
  });
  return { element, result };
}

function capture(action: () => unknown): { name: string; message: string } {
  try {
    action();
  } catch (error) {
    if (error instanceof Error) return { name: error.name, message: error.message };
    throw error;
  }
  throw new Error("Expected the cyclic masonry analysis case to throw.");
}

void test("CyclicMasonryPierAnalysis2D matches the independent pinned JavaScript implementation", async () => {
  assert.equal(gitOutput("rev-parse", "HEAD"), sourceRevision);
  assert.equal(gitOutput("status", "--porcelain"), "");
  const sourceModuleValue: unknown = await import(
    pathToFileURL(path.join(sourceRoot, "src", "index.js")).href
  );
  const typescriptModuleValue: unknown = await import(
    pathToFileURL(path.join(repositoryRoot, "dist", "index.js")).href
  );
  if (!isModuleRuntime(sourceModuleValue) || !isModuleRuntime(typescriptModuleValue)) {
    throw new Error("Cyclic masonry analysis exports do not expose the expected API.");
  }
  assert.notEqual(
    typescriptModuleValue.CyclicMasonryPierAnalysis2D,
    sourceModuleValue.CyclicMasonryPierAnalysis2D,
  );

  const sourceCase = createResult(sourceModuleValue);
  const typescriptCase = createResult(typescriptModuleValue);
  assert.deepEqual(typescriptCase.result, sourceCase.result);
  assert.equal(JSON.stringify(typescriptCase.result), JSON.stringify(sourceCase.result));
  assert.deepEqual(
    [...JSON.stringify(typescriptCase.result)],
    [...JSON.stringify(sourceCase.result)],
  );
  assert.deepEqual(typescriptCase.element.toJSON(), sourceCase.element.toJSON());
  const sourcePoints = sourceCase.result.points;
  const typescriptPoints = typescriptCase.result.points;
  assert.equal(
    typescriptModuleValue.cyclicMasonryPierHistoryToCsv(typescriptPoints),
    sourceModuleValue.cyclicMasonryPierHistoryToCsv(sourcePoints),
  );

  const invalidCases: readonly [
    (moduleValue: ModuleRuntime) => unknown,
    (moduleValue: ModuleRuntime) => unknown,
  ][] = [
    [
      (moduleValue) => new moduleValue.CyclicMasonryPierAnalysis2D().solve({}),
      (moduleValue) => new moduleValue.CyclicMasonryPierAnalysis2D().solve({}),
    ],
    [
      (moduleValue) =>
        new moduleValue.CyclicMasonryPierAnalysis2D().solve({
          element: new moduleValue.CyclicMasonryPier2D(createPierOptions(moduleValue)),
          axialCompression: -1,
          lateralDisplacements: [0],
        }),
      (moduleValue) =>
        new moduleValue.CyclicMasonryPierAnalysis2D().solve({
          element: new moduleValue.CyclicMasonryPier2D(createPierOptions(moduleValue)),
          axialCompression: -1,
          lateralDisplacements: [0],
        }),
    ],
    [
      (moduleValue) =>
        new moduleValue.CyclicMasonryPierAnalysis2D().solve({
          element: new moduleValue.CyclicMasonryPier2D(createPierOptions(moduleValue)),
          axialCompression: 0,
          lateralDisplacements: [],
        }),
      (moduleValue) =>
        new moduleValue.CyclicMasonryPierAnalysis2D().solve({
          element: new moduleValue.CyclicMasonryPier2D(createPierOptions(moduleValue)),
          axialCompression: 0,
          lateralDisplacements: [],
        }),
    ],
    [
      (moduleValue) =>
        new moduleValue.CyclicMasonryPierAnalysis2D().solve({
          element: new moduleValue.CyclicMasonryPier2D(createPierOptions(moduleValue)),
          axialCompression: 0,
          lateralDisplacements: [0],
          boundaryCondition: "unsupported",
        }),
      (moduleValue) =>
        new moduleValue.CyclicMasonryPierAnalysis2D().solve({
          element: new moduleValue.CyclicMasonryPier2D(createPierOptions(moduleValue)),
          axialCompression: 0,
          lateralDisplacements: [0],
          boundaryCondition: "unsupported",
        }),
    ],
    [
      (moduleValue) =>
        new moduleValue.CyclicMasonryPierAnalysis2D().solve({
          element: new moduleValue.CyclicMasonryPier2D(createPierOptions(moduleValue)),
          axialCompression: 0,
          lateralDisplacements: [0],
          tolerance: 0,
        }),
      (moduleValue) =>
        new moduleValue.CyclicMasonryPierAnalysis2D().solve({
          element: new moduleValue.CyclicMasonryPier2D(createPierOptions(moduleValue)),
          axialCompression: 0,
          lateralDisplacements: [0],
          tolerance: 0,
        }),
    ],
  ];
  for (const [sourceCaseValue, typescriptCaseValue] of invalidCases) {
    assert.deepEqual(
      capture(() => sourceCaseValue(sourceModuleValue)),
      capture(() => typescriptCaseValue(typescriptModuleValue)),
    );
  }
});
