import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const sourceRoot = path.resolve(repositoryRoot, "..", "strutture-js");
const sourceRevision = "6f33baead8b88166c4b2cf94af41763412e3c751";

interface MaterialState {
  strain: number;
  stress: number;
  tangent: number;
  branch: string;
  damage: number;
  reversalCount: number;
  dissipatedEnergy: number;
  failed: boolean;
}

interface MaterialRuntime {
  setTrialStrain(strain: number): number;
  commitState(): number;
  getState(): MaterialState;
  getCommittedState(): MaterialState;
  getStress(): number;
  getTangent(): number;
  toJSON(): Record<string, unknown>;
  clone(): MaterialRuntime;
}

interface MaterialModule {
  CYCLIC_MASONRY_INTERNAL_UNITS: Readonly<{ force: string; length: string }>;
  CyclicMasonryCompressionMaterial: new (options: Record<string, unknown>) => MaterialRuntime;
}

function isMaterialModule(value: unknown): value is MaterialModule {
  return (
    value !== null &&
    typeof value === "object" &&
    typeof Reflect.get(value, "CyclicMasonryCompressionMaterial") === "function" &&
    typeof Reflect.get(value, "CYCLIC_MASONRY_INTERNAL_UNITS") === "object"
  );
}

function gitOutput(...arguments_: readonly string[]): string {
  return execFileSync("git", ["-C", sourceRoot, ...arguments_], { encoding: "utf8" }).trim();
}

function materialOptions(): Record<string, unknown> {
  return {
    id: "compression-α",
    units: { force: "N", length: "mm" },
    elasticModulus: 2000,
    compressiveStrength: 4,
    peakStrain: 0.004,
    damageOnsetStrain: 0.004,
    ultimateStrain: 0.012,
    residualStrengthRatio: 0.2,
    unloadingStiffnessDegradation: 0.4,
    strengthDegradation: 0.3,
    energyDamageCoefficient: 0.05,
    hingeLength: 100,
    metadata: { label: "muratura ciclica β" },
  };
}

function history(material: MaterialRuntime): Array<Record<string, unknown>> {
  const snapshots: Array<Record<string, unknown>> = [];
  for (const strain of [-0.002, -0.004, -0.008, -0.014, 0.001, -0.006]) {
    material.setTrialStrain(strain);
    snapshots.push({ state: material.getState(), committed: material.getCommittedState() });
    material.commitState();
  }
  return snapshots;
}

function serialized(value: unknown): string {
  return JSON.stringify(value);
}

void test("CyclicMasonryCompressionMaterial matches the independent pinned JavaScript implementation", async () => {
  assert.equal(gitOutput("rev-parse", "HEAD"), sourceRevision);
  assert.equal(gitOutput("status", "--porcelain"), "");
  const sourceModuleValue: unknown = await import(
    pathToFileURL(path.join(sourceRoot, "src", "index.js")).href
  );
  const typescriptModuleValue: unknown = await import(
    pathToFileURL(path.join(repositoryRoot, "dist", "index.js")).href
  );
  if (!isMaterialModule(sourceModuleValue) || !isMaterialModule(typescriptModuleValue)) {
    throw new Error("Cyclic masonry compression exports do not expose the expected API.");
  }
  assert.deepEqual(
    typescriptModuleValue.CYCLIC_MASONRY_INTERNAL_UNITS,
    sourceModuleValue.CYCLIC_MASONRY_INTERNAL_UNITS,
  );
  assert.notEqual(
    typescriptModuleValue.CyclicMasonryCompressionMaterial,
    sourceModuleValue.CyclicMasonryCompressionMaterial,
  );

  const sourceMaterial = new sourceModuleValue.CyclicMasonryCompressionMaterial(materialOptions());
  const typescriptMaterial = new typescriptModuleValue.CyclicMasonryCompressionMaterial(
    materialOptions(),
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
  assert.equal(typescriptMaterial.getStress(), sourceMaterial.getStress());
  assert.equal(typescriptMaterial.getTangent(), sourceMaterial.getTangent());

  const sourceClone = sourceMaterial.clone();
  const typescriptClone = typescriptMaterial.clone();
  sourceClone.setTrialStrain(0.002);
  typescriptClone.setTrialStrain(0.002);
  assert.deepEqual(typescriptClone.getState(), sourceClone.getState());

  const invalidCases: readonly [
    (moduleValue: MaterialModule) => unknown,
    (moduleValue: MaterialModule) => unknown,
  ][] = [
    [
      (moduleValue) =>
        new moduleValue.CyclicMasonryCompressionMaterial({
          ...materialOptions(),
          elasticModulus: -1,
        }),
      (moduleValue) =>
        new moduleValue.CyclicMasonryCompressionMaterial({
          ...materialOptions(),
          elasticModulus: -1,
        }),
    ],
    [
      (moduleValue) => {
        const material = new moduleValue.CyclicMasonryCompressionMaterial(materialOptions());
        material.setTrialStrain(Number.NaN);
        return material;
      },
      (moduleValue) => {
        const material = new moduleValue.CyclicMasonryCompressionMaterial(materialOptions());
        material.setTrialStrain(Number.NaN);
        return material;
      },
    ],
  ];
  for (const [sourceCase, typescriptCase] of invalidCases) {
    const capture = (action: () => unknown): { name: string; message: string } => {
      try {
        action();
      } catch (error) {
        if (error instanceof Error) return { name: error.name, message: error.message };
        throw error;
      }
      throw new Error("Expected the cyclic masonry material case to throw.");
    };
    assert.deepEqual(
      capture(() => sourceCase(sourceModuleValue)),
      capture(() => typescriptCase(typescriptModuleValue)),
    );
  }
});
