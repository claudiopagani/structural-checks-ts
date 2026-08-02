import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const sourceRoot = path.resolve(repositoryRoot, "..", "strutture-js");
const sourceRevision = "6f33baead8b88166c4b2cf94af41763412e3c751";

interface CompressionRuntime {
  units: { force: string; length: string };
  clone(): CompressionRuntime;
  setTrialStrain(strain: number): number;
  getStress(): number;
  getTangent(): number;
  getState(): Record<string, unknown>;
  getCommittedState(): Record<string, unknown>;
  commitState(): number;
  revertToLastCommit(): number;
  revertToStart(): number;
  importState(
    state: Record<string, unknown>,
    options?: { committed?: boolean },
  ): CompressionRuntime;
  toJSON(): Record<string, unknown>;
}

interface FiberRuntime {
  setTrialDeformation(deformation: number, rotation: number): number[];
  solveForResultants(
    target: Record<string, number>,
    options?: { initialDeformation?: readonly number[] },
  ): Record<string, unknown>;
  commitState(): number;
  getResponse(): Record<string, unknown>;
  getCommittedResponse(): Record<string, unknown>;
  getTangent(): number[][];
  exportState(): Record<string, unknown>;
  clone(): FiberRuntime;
  toJSON(): Record<string, unknown>;
}

interface FiberModule {
  CyclicMasonryCompressionMaterial: new (options: Record<string, unknown>) => CompressionRuntime;
  MasonryFiberInterface2D: new (options: Record<string, unknown>) => FiberRuntime;
}

function isFiberModule(value: unknown): value is FiberModule {
  return (
    value !== null &&
    typeof value === "object" &&
    typeof Reflect.get(value, "CyclicMasonryCompressionMaterial") === "function" &&
    typeof Reflect.get(value, "MasonryFiberInterface2D") === "function"
  );
}

function gitOutput(...arguments_: readonly string[]): string {
  return execFileSync("git", ["-C", sourceRoot, ...arguments_], { encoding: "utf8" }).trim();
}

function compressionOptions(): Record<string, unknown> {
  return {
    units: { force: "N", length: "mm" },
    elasticModulus: 2000,
    compressiveStrength: 4,
    peakStrain: 0.002,
    prePeakCurve: "linear",
    damageOnsetStrain: 0.004,
    ultimateStrain: 0.012,
    residualStrengthRatio: 0.2,
    unloadingStiffnessDegradation: 0.4,
    strengthDegradation: 0.3,
    hingeLength: 100,
  };
}

function fiberOptions(moduleValue: FiberModule): Record<string, unknown> {
  return {
    id: "interface-α",
    units: { force: "N", length: "mm" },
    width: 1000,
    thickness: 250,
    hingeLength: 100,
    fiberCount: 32,
    compressionMaterial: new moduleValue.CyclicMasonryCompressionMaterial(compressionOptions()),
    metadata: { label: "muratura β" },
  };
}

function history(interfaceModel: FiberRuntime): Array<Record<string, unknown>> {
  const snapshots: Array<Record<string, unknown>> = [];
  for (const [deformation, rotation] of [
    [-0.0001, 0],
    [-0.0001, 0.0005],
    [0.0005, 0],
    [-0.0008, -0.001],
  ]) {
    interfaceModel.setTrialDeformation(deformation!, rotation!);
    snapshots.push({ response: interfaceModel.getResponse(), state: interfaceModel.exportState() });
    interfaceModel.commitState();
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
  throw new Error("Expected the masonry fiber interface case to throw.");
}

void test("MasonryFiberInterface2D matches the independent pinned JavaScript implementation", async () => {
  assert.equal(gitOutput("rev-parse", "HEAD"), sourceRevision);
  assert.equal(gitOutput("status", "--porcelain"), "");
  const sourceModuleValue: unknown = await import(
    pathToFileURL(path.join(sourceRoot, "src", "index.js")).href
  );
  const typescriptModuleValue: unknown = await import(
    pathToFileURL(path.join(repositoryRoot, "dist", "index.js")).href
  );
  if (!isFiberModule(sourceModuleValue) || !isFiberModule(typescriptModuleValue)) {
    throw new Error("Masonry fiber interface exports do not expose the expected API.");
  }
  assert.notEqual(
    typescriptModuleValue.MasonryFiberInterface2D,
    sourceModuleValue.MasonryFiberInterface2D,
  );

  const sourceInterface = new sourceModuleValue.MasonryFiberInterface2D(
    fiberOptions(sourceModuleValue),
  );
  const typescriptInterface = new typescriptModuleValue.MasonryFiberInterface2D(
    fiberOptions(typescriptModuleValue),
  );
  const sourceHistory = history(sourceInterface);
  const typescriptHistory = history(typescriptInterface);
  assert.deepEqual(typescriptHistory, sourceHistory);
  assert.equal(serialized(typescriptHistory), serialized(sourceHistory));
  assert.deepEqual([...serialized(typescriptHistory)], [...serialized(sourceHistory)]);
  assert.deepEqual(
    [...serialized(typescriptHistory).normalize()],
    [...serialized(sourceHistory).normalize()],
  );
  assert.deepEqual(typescriptInterface.toJSON(), sourceInterface.toJSON());
  assert.deepEqual(typescriptInterface.getTangent(), sourceInterface.getTangent());

  const sourceSolveInterface = new sourceModuleValue.MasonryFiberInterface2D(
    fiberOptions(sourceModuleValue),
  );
  const typescriptSolveInterface = new typescriptModuleValue.MasonryFiberInterface2D(
    fiberOptions(typescriptModuleValue),
  );
  const sourceSolved = sourceSolveInterface.solveForResultants(
    { axialForce: -500, moment: 0 },
    { initialDeformation: [-0.0001, 0] },
  );
  const typescriptSolved = typescriptSolveInterface.solveForResultants(
    { axialForce: -500, moment: 0 },
    { initialDeformation: [-0.0001, 0] },
  );
  assert.deepEqual(typescriptSolved, sourceSolved);

  const sourceClone = sourceInterface.clone();
  const typescriptClone = typescriptInterface.clone();
  sourceClone.setTrialDeformation(-0.0001, -0.001);
  typescriptClone.setTrialDeformation(-0.0001, -0.001);
  assert.deepEqual(typescriptClone.getResponse(), sourceClone.getResponse());

  const invalidCases: readonly [
    (moduleValue: FiberModule) => unknown,
    (moduleValue: FiberModule) => unknown,
  ][] = [
    [
      (moduleValue) =>
        new moduleValue.MasonryFiberInterface2D({
          ...fiberOptions(moduleValue),
          fiberCount: 1,
        }),
      (moduleValue) =>
        new moduleValue.MasonryFiberInterface2D({
          ...fiberOptions(moduleValue),
          fiberCount: 1,
        }),
    ],
    [
      (moduleValue) =>
        new moduleValue.MasonryFiberInterface2D({
          ...fiberOptions(moduleValue),
          width: 0,
        }),
      (moduleValue) =>
        new moduleValue.MasonryFiberInterface2D({
          ...fiberOptions(moduleValue),
          width: 0,
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
