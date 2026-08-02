import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const sourceRoot = path.resolve(repositoryRoot, "..", "strutture-js");
const sourceRevision = "6f33baead8b88166c4b2cf94af41763412e3c751";

interface RuntimeModel {
  readonly type: string;
  readonly units: { force: string; length: string };
  readonly metadata: Record<string, unknown>;
  evaluate(context?: Record<string, unknown>): Record<string, unknown>;
  clone(): RuntimeModel;
  toJSON(): Record<string, unknown>;
}

interface RuntimeModule {
  readonly MohrCoulombModel: new (options: Record<string, unknown>) => RuntimeModel;
  readonly SlidingStrengthModel: new (options: Record<string, unknown>) => RuntimeModel;
  readonly TurnsekSheppardModel: new (options: Record<string, unknown>) => RuntimeModel;
  readonly createMasonryShearStrengthModel: (
    model: Record<string, unknown> | RuntimeModel | null | undefined,
    options?: { role?: string },
  ) => RuntimeModel;
}

function isRuntimeModule(value: unknown): value is RuntimeModule {
  if (value === null || typeof value !== "object") {
    return false;
  }

  return [
    "MohrCoulombModel",
    "SlidingStrengthModel",
    "TurnsekSheppardModel",
    "createMasonryShearStrengthModel",
  ].every((name) => name in value && typeof Reflect.get(value, name) === "function");
}

function gitOutput(...arguments_: readonly string[]): string {
  return execFileSync("git", ["-C", sourceRoot, ...arguments_], { encoding: "utf8" }).trim();
}

function assertSourceBaseline(): void {
  assert.equal(gitOutput("rev-parse", "HEAD"), sourceRevision);
  assert.equal(gitOutput("status", "--porcelain"), "");
}

function errorSnapshot(callback: () => unknown): { name: string; message: string } {
  try {
    callback();
  } catch (error) {
    assert.ok(error instanceof Error);
    return { name: error.name, message: error.message };
  }
  throw new Error("Expected the callback to throw.");
}

function assertErrorParity(
  sourceCallback: () => unknown,
  typescriptCallback: () => unknown,
  label: string,
): void {
  assert.deepEqual(errorSnapshot(sourceCallback), errorSnapshot(typescriptCallback), label);
}

function assertModelParity(sourceModel: RuntimeModel, typescriptModel: RuntimeModel): void {
  assert.deepEqual(Object.keys(typescriptModel), Object.keys(sourceModel));
  assert.deepEqual(typescriptModel.toJSON(), sourceModel.toJSON());
  assert.equal(JSON.stringify(typescriptModel.toJSON()), JSON.stringify(sourceModel.toJSON()));
  assert.deepEqual(
    typescriptModel.evaluate({
      currentAxialCompression: 120,
      compressedLength: 0.8,
      thickness: 0.25,
      shearDamage: 0.2,
      compressionDamage: 0.15,
    }),
    sourceModel.evaluate({
      currentAxialCompression: 120,
      compressedLength: 0.8,
      thickness: 0.25,
      shearDamage: 0.2,
      compressionDamage: 0.15,
    }),
  );
  assert.deepEqual(typescriptModel.clone().toJSON(), sourceModel.clone().toJSON());
}

void test("masonry shear-strength strategies match the independent pinned JavaScript implementation", async () => {
  assertSourceBaseline();
  const sourceModuleValue: unknown = await import(
    pathToFileURL(path.join(sourceRoot, "src", "index.js")).href
  );
  const typescriptModuleValue: unknown = await import(
    pathToFileURL(path.join(repositoryRoot, "dist", "index.js")).href
  );
  if (!isRuntimeModule(sourceModuleValue) || !isRuntimeModule(typescriptModuleValue)) {
    throw new Error("Masonry shear-strength exports do not expose the expected API.");
  }

  assert.notEqual(sourceModuleValue.MohrCoulombModel, typescriptModuleValue.MohrCoulombModel);
  assert.notEqual(
    sourceModuleValue.SlidingStrengthModel,
    typescriptModuleValue.SlidingStrengthModel,
  );
  assert.notEqual(
    sourceModuleValue.TurnsekSheppardModel,
    typescriptModuleValue.TurnsekSheppardModel,
  );

  const metadata = { label: "parete \u03C4" };
  const mohrOptions = {
    id: "mohr-\u03B1",
    units: { force: "N", length: "mm" },
    cohesion: 0.12,
    frictionCoefficient: 0.4,
    cohesionDamageCoefficient: 0.8,
    frictionDamageCoefficient: 0.2,
    metadata,
  };
  const slidingOptions = {
    id: "sliding-1",
    units: { force: "N", length: "mm" },
    cohesion: 0.1,
    frictionCoefficient: 0.35,
    residualCohesionRatio: 0.1,
    cohesionDamageCoefficient: 0.7,
    frictionDamageCoefficient: 0.15,
    metadata,
  };
  const turnsekOptions = {
    id: "turnsek-1",
    units: { force: "N", length: "mm" },
    tensileStrength: 0.15,
    shearStressDistributionFactor: 1.2,
    damageCoefficient: 0.8,
    crushingReductionCoefficient: 0.5,
    metadata,
  };

  const sourceMohr = new sourceModuleValue.MohrCoulombModel(mohrOptions);
  const typescriptMohr = new typescriptModuleValue.MohrCoulombModel(mohrOptions);
  const sourceSliding = new sourceModuleValue.SlidingStrengthModel(slidingOptions);
  const typescriptSliding = new typescriptModuleValue.SlidingStrengthModel(slidingOptions);
  const sourceTurnsek = new sourceModuleValue.TurnsekSheppardModel(turnsekOptions);
  const typescriptTurnsek = new typescriptModuleValue.TurnsekSheppardModel(turnsekOptions);

  assert.equal(sourceMohr instanceof sourceModuleValue.MohrCoulombModel, true);
  assert.equal(typescriptMohr instanceof typescriptModuleValue.MohrCoulombModel, true);
  assertModelParity(sourceMohr, typescriptMohr);
  assertModelParity(sourceSliding, typescriptSliding);
  assertModelParity(sourceTurnsek, typescriptTurnsek);

  for (const type of ["turnseksheppard", "mohrcoulomb", "sliding"]) {
    const options = {
      type,
      units: { force: "N", length: "mm" },
      cohesion: 0.1,
      frictionCoefficient: 0.35,
      tensileStrength: 0.15,
      shearStressDistributionFactor: 1.2,
    };
    const sourceFactory = sourceModuleValue.createMasonryShearStrengthModel(options);
    const typescriptFactory = typescriptModuleValue.createMasonryShearStrengthModel(options);
    assertModelParity(sourceFactory, typescriptFactory);
  }

  assertErrorParity(
    () =>
      new sourceModuleValue.MohrCoulombModel({
        cohesion: 0.1,
        frictionCoefficient: 0.3,
      }),
    () =>
      new typescriptModuleValue.MohrCoulombModel({
        cohesion: 0.1,
        frictionCoefficient: 0.3,
      }),
    "missing unit-system error",
  );
  assertErrorParity(
    () =>
      sourceModuleValue.createMasonryShearStrengthModel({
        type: "unsupported",
      }),
    () =>
      typescriptModuleValue.createMasonryShearStrengthModel({
        type: "unsupported",
      }),
    "unsupported model error",
  );
  assertErrorParity(
    () =>
      sourceModuleValue.createMasonryShearStrengthModel({
        type: "user-defined",
      }),
    () =>
      typescriptModuleValue.createMasonryShearStrengthModel({
        type: "user-defined",
      }),
    "user-defined model error",
  );
  assertErrorParity(
    () =>
      sourceMohr.evaluate({
        compressedLength: 0.8,
      }),
    () =>
      typescriptMohr.evaluate({
        compressedLength: 0.8,
      }),
    "missing context thickness error",
  );
});
