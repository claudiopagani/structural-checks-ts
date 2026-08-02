import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const sourceRoot = path.resolve(repositoryRoot, "..", "strutture-js");
const sourceRevision = "6f33baead8b88166c4b2cf94af41763412e3c751";

interface ShearState {
  branch: string;
  pinchingActive: boolean;
  pinchingFactor: number;
  plasticDeformation: number;
  reversalCount: number;
  dissipatedEnergy: number;
  capacities: Record<string, number>;
  predominantMechanism: string;
}

interface ShearRuntime {
  setTrialDeformation(deformation: number, context: Record<string, number>): number;
  commitState(): number;
  getForce(): number;
  getTangent(): number;
  getState(): ShearState;
  getCommittedState(): ShearState;
  toJSON(): Record<string, unknown>;
  clone(): ShearRuntime;
}

interface StrengthModelRuntime {
  evaluate(context: Record<string, number>): Record<string, unknown>;
}

interface ShearModule {
  CyclicMasonryShearMaterial: new (options: Record<string, unknown>) => ShearRuntime;
  SlidingStrengthModel: new (options: Record<string, unknown>) => StrengthModelRuntime;
  TurnsekSheppardModel: new (options: Record<string, unknown>) => StrengthModelRuntime;
}

function isShearModule(value: unknown): value is ShearModule {
  return (
    value !== null &&
    typeof value === "object" &&
    typeof Reflect.get(value, "CyclicMasonryShearMaterial") === "function" &&
    typeof Reflect.get(value, "SlidingStrengthModel") === "function" &&
    typeof Reflect.get(value, "TurnsekSheppardModel") === "function"
  );
}

function gitOutput(...arguments_: readonly string[]): string {
  return execFileSync("git", ["-C", sourceRoot, ...arguments_], { encoding: "utf8" }).trim();
}

function materialOptions(moduleValue: ShearModule): Record<string, unknown> {
  const units = { force: "N", length: "mm" };
  return {
    id: "shear-α",
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
      cohesion: 0.12,
      frictionCoefficient: 0.4,
      residualCohesionRatio: 0.1,
    }),
    peakShearStrain: 0.004,
    ultimateShearStrain: 0.012,
    hardeningRatio: 0.05,
    residualStrengthRatio: 0.25,
    pinching: { enabled: true, factor: 0.3, recoveryRatio: 0.8 },
    stiffnessDegradation: {
      enabled: true,
      ductilityCoefficient: 0.4,
      energyCoefficient: 0.1,
      limit: 0.9,
    },
    strengthDegradation: {
      enabled: true,
      ductilityCoefficient: 0.3,
      energyCoefficient: 0.1,
      limit: 0.75,
    },
    metadata: { label: "muratura ciclica β" },
  };
}

const context = {
  deformableHeight: 2.5,
  effectiveShearArea: 0.25,
  thickness: 0.25,
  compressedLength: 1,
  currentAxialCompression: 200,
  compressionDamage: 0,
};

function history(material: ShearRuntime): Array<Record<string, unknown>> {
  const snapshots: Array<Record<string, unknown>> = [];
  for (const deformation of [0.001, 0.004, 0.01, 0.02, 0, -0.002, -0.018, 0, 0.018]) {
    material.setTrialDeformation(deformation, context);
    snapshots.push({ state: material.getState(), committed: material.getCommittedState() });
    material.commitState();
  }
  return snapshots;
}

function serialized(value: unknown): string {
  return JSON.stringify(value);
}

function capture(action: () => unknown): { name: string; message: string } {
  try {
    action();
  } catch (error) {
    if (error instanceof Error) return { name: error.name, message: error.message };
    throw error;
  }
  throw new Error("Expected the cyclic masonry shear case to throw.");
}

void test("CyclicMasonryShearMaterial matches the independent pinned JavaScript implementation", async () => {
  assert.equal(gitOutput("rev-parse", "HEAD"), sourceRevision);
  assert.equal(gitOutput("status", "--porcelain"), "");
  const sourceModuleValue: unknown = await import(
    pathToFileURL(path.join(sourceRoot, "src", "index.js")).href
  );
  const typescriptModuleValue: unknown = await import(
    pathToFileURL(path.join(repositoryRoot, "dist", "index.js")).href
  );
  if (!isShearModule(sourceModuleValue) || !isShearModule(typescriptModuleValue)) {
    throw new Error("Cyclic masonry shear exports do not expose the expected API.");
  }
  assert.notEqual(
    typescriptModuleValue.CyclicMasonryShearMaterial,
    sourceModuleValue.CyclicMasonryShearMaterial,
  );

  const sourceMaterial = new sourceModuleValue.CyclicMasonryShearMaterial(
    materialOptions(sourceModuleValue),
  );
  const typescriptMaterial = new typescriptModuleValue.CyclicMasonryShearMaterial(
    materialOptions(typescriptModuleValue),
  );
  const sourceHistory = history(sourceMaterial);
  const typescriptHistory = history(typescriptMaterial);
  assert.deepEqual(typescriptHistory, sourceHistory);
  assert.equal(serialized(typescriptHistory), serialized(sourceHistory));
  assert.deepEqual([...serialized(typescriptHistory)], [...serialized(sourceHistory)]);
  assert.deepEqual(
    [...serialized(typescriptHistory).normalize()],
    [...serialized(sourceHistory).normalize()],
  );
  assert.deepEqual(typescriptMaterial.toJSON(), sourceMaterial.toJSON());
  assert.equal(typescriptMaterial.getForce(), sourceMaterial.getForce());
  assert.equal(typescriptMaterial.getTangent(), sourceMaterial.getTangent());

  const sourceClone = sourceMaterial.clone();
  const typescriptClone = typescriptMaterial.clone();
  sourceClone.setTrialDeformation(-0.01, context);
  typescriptClone.setTrialDeformation(-0.01, context);
  assert.deepEqual(typescriptClone.getState(), sourceClone.getState());

  const invalidCases: readonly [
    (moduleValue: ShearModule) => unknown,
    (moduleValue: ShearModule) => unknown,
  ][] = [
    [
      (moduleValue) =>
        new moduleValue.CyclicMasonryShearMaterial({
          ...materialOptions(moduleValue),
          ultimateShearStrain: 0.001,
        }),
      (moduleValue) =>
        new moduleValue.CyclicMasonryShearMaterial({
          ...materialOptions(moduleValue),
          ultimateShearStrain: 0.001,
        }),
    ],
    [
      (moduleValue) => {
        const material = new moduleValue.CyclicMasonryShearMaterial(materialOptions(moduleValue));
        material.setTrialDeformation(Number.NaN, context);
        return material;
      },
      (moduleValue) => {
        const material = new moduleValue.CyclicMasonryShearMaterial(materialOptions(moduleValue));
        material.setTrialDeformation(Number.NaN, context);
        return material;
      },
    ],
    [
      (moduleValue) =>
        new moduleValue.CyclicMasonryShearMaterial({
          ...materialOptions(moduleValue),
          diagonalTensionModel: { type: "unsupported-model" },
        }),
      (moduleValue) =>
        new moduleValue.CyclicMasonryShearMaterial({
          ...materialOptions(moduleValue),
          diagonalTensionModel: { type: "unsupported-model" },
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
