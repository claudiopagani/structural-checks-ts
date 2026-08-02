import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const sourceRoot = path.resolve(repositoryRoot, "..", "strutture-js");
const sourceRevision = "6f33baead8b88166c4b2cf94af41763412e3c751";

interface RuntimeMaterial {
  isExistingMaterial(): boolean;
  clone(): RuntimeMaterial;
  toJSON(): Record<string, unknown>;
}

type RuntimeMaterialConstructor = new (options: Record<string, unknown>) => RuntimeMaterial;

interface RuntimeModule {
  TimberMaterial: RuntimeMaterialConstructor;
  SolidTimberMaterial: RuntimeMaterialConstructor;
  GlulamTimberMaterial: RuntimeMaterialConstructor;
  XlamMaterial: RuntimeMaterialConstructor;
}

type TimberMaterialName =
  | "TimberMaterial"
  | "SolidTimberMaterial"
  | "GlulamTimberMaterial"
  | "XlamMaterial";

function constructorFor(
  module: RuntimeModule,
  name: TimberMaterialName,
): RuntimeMaterialConstructor {
  switch (name) {
    case "TimberMaterial":
      return module.TimberMaterial;
    case "SolidTimberMaterial":
      return module.SolidTimberMaterial;
    case "GlulamTimberMaterial":
      return module.GlulamTimberMaterial;
    case "XlamMaterial":
      return module.XlamMaterial;
  }
}

function isRuntimeModule(value: unknown): value is RuntimeModule {
  return (
    value !== null &&
    typeof value === "object" &&
    typeof Reflect.get(value, "TimberMaterial") === "function" &&
    typeof Reflect.get(value, "SolidTimberMaterial") === "function" &&
    typeof Reflect.get(value, "GlulamTimberMaterial") === "function" &&
    typeof Reflect.get(value, "XlamMaterial") === "function"
  );
}

function gitOutput(...arguments_: readonly string[]): string {
  return execFileSync("git", ["-C", sourceRoot, ...arguments_], { encoding: "utf8" }).trim();
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

void test("timber material hierarchy matches independent pinned JavaScript implementations", async () => {
  assert.equal(gitOutput("rev-parse", "HEAD"), sourceRevision);
  assert.equal(gitOutput("status", "--porcelain"), "");
  const sourceModuleValue: unknown = await import(
    pathToFileURL(path.join(sourceRoot, "src", "index.js")).href
  );
  const typescriptModuleValue: unknown = await import(
    pathToFileURL(path.join(repositoryRoot, "dist", "index.js")).href
  );
  if (!isRuntimeModule(sourceModuleValue) || !isRuntimeModule(typescriptModuleValue)) {
    throw new Error("Timber material exports do not expose the expected API.");
  }

  const baseOptions: Record<string, unknown> = {
    id: "timber-α",
    name: "Legno β",
    strengthClass: "custom",
    productStandard: "EN 14081",
    strengthStandard: "EN 338",
    serviceClass: 2,
    kmod: 0.8,
    fmK: 24,
    fc0K: 21,
    ft0K: 14,
    fvK: 4,
    e0_05: 7400,
    g0_05: 460,
    units: { force: "N", length: "mm" },
    metadata: { label: "legno γ" },
  };
  const cases: ReadonlyArray<{
    name: TimberMaterialName;
    options: Record<string, unknown>;
  }> = [
    { name: "TimberMaterial", options: { ...baseOptions, timberType: "generic" } },
    { name: "SolidTimberMaterial", options: { ...baseOptions, gradingMethod: "visual" } },
    {
      name: "GlulamTimberMaterial",
      options: { ...baseOptions, strengthClass: "GL24h", glulamType: "homogeneous" },
    },
    {
      name: "XlamMaterial",
      options: {
        ...baseOptions,
        strengthClass: "custom-clt",
        e0Mean: 11000,
        e90Mean: null,
        g0Mean: null,
        g90Mean: null,
        rollingShearStrength: 1.2,
      },
    },
  ];

  for (const materialCase of cases) {
    const sourceConstructor = constructorFor(sourceModuleValue, materialCase.name);
    const typescriptConstructor = constructorFor(typescriptModuleValue, materialCase.name);
    assert.notEqual(sourceConstructor, typescriptConstructor);
    const sourceMaterial = new sourceConstructor(materialCase.options);
    const typescriptMaterial = new typescriptConstructor(materialCase.options);

    assert.equal(sourceMaterial.isExistingMaterial(), false);
    assert.equal(typescriptMaterial.isExistingMaterial(), false);
    assert.deepEqual(Object.keys(typescriptMaterial), Object.keys(sourceMaterial));
    assert.deepEqual(typescriptMaterial.toJSON(), sourceMaterial.toJSON());
    assert.equal(
      JSON.stringify(typescriptMaterial.toJSON()),
      JSON.stringify(sourceMaterial.toJSON()),
    );
    assert.deepEqual(typescriptMaterial.clone().toJSON(), sourceMaterial.clone().toJSON());
  }

  const sourceError = errorSnapshot(
    () => new sourceModuleValue.TimberMaterial({ name: "Missing units", strengthClass: "C24" }),
  );
  const typescriptError = errorSnapshot(
    () => new typescriptModuleValue.TimberMaterial({ name: "Missing units", strengthClass: "C24" }),
  );
  assert.deepEqual(typescriptError, sourceError);
});
