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
  commitState(): number;
  getResponse(): Record<string, unknown>;
  getCommittedResponse(): Record<string, unknown>;
  exportState(options?: { committed?: boolean }): Record<string, unknown>;
  importState(state: Record<string, unknown>, options?: { committed?: boolean }): PierRuntime;
  clone(options?: { preserveState?: boolean }): PierRuntime;
  evaluate(options?: Record<string, unknown>): Record<string, unknown>;
  globalStiffness(): number[][];
  toJSON(): Record<string, unknown>;
}

interface ModuleRuntime {
  CyclicMasonryPier2D: new (options: Record<string, unknown>) => PierRuntime;
  CyclicMasonryCompressionMaterial: new (options: Record<string, unknown>) => object;
  CyclicMasonryShearMaterial: new (options: Record<string, unknown>) => object;
  SlidingStrengthModel: new (options: Record<string, unknown>) => object;
  TurnsekSheppardModel: new (options: Record<string, unknown>) => object;
}

function isModuleRuntime(value: unknown): value is ModuleRuntime {
  return (
    value !== null &&
    typeof value === "object" &&
    typeof Reflect.get(value, "CyclicMasonryPier2D") === "function" &&
    typeof Reflect.get(value, "CyclicMasonryCompressionMaterial") === "function" &&
    typeof Reflect.get(value, "CyclicMasonryShearMaterial") === "function" &&
    typeof Reflect.get(value, "SlidingStrengthModel") === "function" &&
    typeof Reflect.get(value, "TurnsekSheppardModel") === "function"
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
}

function history(pier: PierRuntime): Array<Record<string, unknown>> {
  const snapshots: Array<Record<string, unknown>> = [];
  for (const displacements of [
    [0, 0, 0, -0.001, 0.002, 0],
    [0, 0, 0, -0.001, 0.003, 0],
  ]) {
    snapshots.push({
      response: pier.setTrialLocalDisplacements(displacements),
      state: pier.exportState({ committed: false }),
    });
    pier.commitState();
  }
  return snapshots;
}

function capture(action: () => unknown): { name: string; message: string } {
  try {
    action();
  } catch (error) {
    if (error instanceof Error) return { name: error.name, message: error.message };
    throw error;
  }
  throw new Error("Expected the cyclic masonry pier case to throw.");
}

void test("CyclicMasonryPier2D matches the independent pinned JavaScript implementation", async () => {
  assert.equal(gitOutput("rev-parse", "HEAD"), sourceRevision);
  assert.equal(gitOutput("status", "--porcelain"), "");
  const sourceModuleValue: unknown = await import(
    pathToFileURL(path.join(sourceRoot, "src", "index.js")).href
  );
  const typescriptModuleValue: unknown = await import(
    pathToFileURL(path.join(repositoryRoot, "dist", "index.js")).href
  );
  if (!isModuleRuntime(sourceModuleValue) || !isModuleRuntime(typescriptModuleValue)) {
    throw new Error("Cyclic masonry pier exports do not expose the expected API.");
  }
  assert.notEqual(typescriptModuleValue.CyclicMasonryPier2D, sourceModuleValue.CyclicMasonryPier2D);

  const sourcePier = new sourceModuleValue.CyclicMasonryPier2D(
    createPierOptions(sourceModuleValue),
  );
  const typescriptPier = new typescriptModuleValue.CyclicMasonryPier2D(
    createPierOptions(typescriptModuleValue),
  );
  const sourceHistory = history(sourcePier);
  const typescriptHistory = history(typescriptPier);
  assert.deepEqual(typescriptHistory, sourceHistory);
  assert.equal(JSON.stringify(typescriptHistory), JSON.stringify(sourceHistory));
  assert.deepEqual([...JSON.stringify(typescriptHistory)], [...JSON.stringify(sourceHistory)]);
  assert.deepEqual(
    [...JSON.stringify(typescriptHistory).normalize()],
    [...JSON.stringify(sourceHistory).normalize()],
  );
  assert.deepEqual(typescriptPier.toJSON(), sourcePier.toJSON());
  assert.deepEqual(typescriptPier.getCommittedResponse(), sourcePier.getCommittedResponse());
  assert.deepEqual(typescriptPier.globalStiffness(), sourcePier.globalStiffness());

  const sourceClone = sourcePier.clone();
  const typescriptClone = typescriptPier.clone();
  assert.deepEqual(typescriptClone.toJSON(), sourceClone.toJSON());

  const invalidCases: readonly [
    (moduleValue: ModuleRuntime) => unknown,
    (moduleValue: ModuleRuntime) => unknown,
  ][] = [
    [
      (moduleValue) =>
        new moduleValue.CyclicMasonryPier2D({ ...createPierOptions(moduleValue), id: "" }),
      (moduleValue) =>
        new moduleValue.CyclicMasonryPier2D({ ...createPierOptions(moduleValue), id: "" }),
    ],
    [
      (moduleValue) =>
        new moduleValue.CyclicMasonryPier2D({
          ...createPierOptions(moduleValue),
          coupling: { compressedLengthStrategy: "median" },
        }),
      (moduleValue) =>
        new moduleValue.CyclicMasonryPier2D({
          ...createPierOptions(moduleValue),
          coupling: { compressedLengthStrategy: "median" },
        }),
    ],
    [
      (moduleValue) =>
        new moduleValue.CyclicMasonryPier2D(
          createPierOptions(moduleValue),
        ).setTrialLocalDisplacements([0, 0]),
      (moduleValue) =>
        new moduleValue.CyclicMasonryPier2D(
          createPierOptions(moduleValue),
        ).setTrialLocalDisplacements([0, 0]),
    ],
    [
      (moduleValue) =>
        new moduleValue.CyclicMasonryPier2D(createPierOptions(moduleValue)).importState({
          version: 2,
        }),
      (moduleValue) =>
        new moduleValue.CyclicMasonryPier2D(createPierOptions(moduleValue)).importState({
          version: 2,
        }),
    ],
  ];
  for (const [sourceCase, typescriptCase] of invalidCases) {
    assert.deepEqual(
      capture(() => sourceCase(sourceModuleValue)),
      capture(() => typescriptCase(typescriptModuleValue)),
    );
  }
});
