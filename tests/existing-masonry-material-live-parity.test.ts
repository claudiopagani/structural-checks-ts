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
  correctionFactor(): number;
  improvementFactor(): number;
  adjustedProperty(propertyName: string): number | null;
  adjustedProperties(): Record<string, number | null>;
  clone(): RuntimeMaterial;
  toJSON(): Record<string, unknown>;
}

interface RuntimeModule {
  ExistingMasonryMaterial: new (options: Record<string, unknown>) => RuntimeMaterial;
}

function isRuntimeModule(value: unknown): value is RuntimeModule {
  return (
    value !== null &&
    typeof value === "object" &&
    typeof Reflect.get(value, "ExistingMasonryMaterial") === "function"
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

void test("ExistingMasonryMaterial matches the independent pinned JavaScript implementation", async () => {
  assert.equal(gitOutput("rev-parse", "HEAD"), sourceRevision);
  assert.equal(gitOutput("status", "--porcelain"), "");
  const sourceModuleValue: unknown = await import(
    pathToFileURL(path.join(sourceRoot, "src", "index.js")).href
  );
  const typescriptModuleValue: unknown = await import(
    pathToFileURL(path.join(repositoryRoot, "dist", "index.js")).href
  );
  if (!isRuntimeModule(sourceModuleValue) || !isRuntimeModule(typescriptModuleValue)) {
    throw new Error("ExistingMasonryMaterial exports do not expose the expected API.");
  }

  assert.notEqual(
    sourceModuleValue.ExistingMasonryMaterial,
    typescriptModuleValue.ExistingMasonryMaterial,
  );
  const options: Record<string, unknown> = {
    id: "masonry-existing-α",
    name: "Masonry esistente β",
    masonryType: "brick",
    unitType: "solid",
    mortarType: "lime",
    baseProperties: {
      fm: 1.5,
      tau0: 0.025,
      fv0: 0.15,
      E: 1500,
      G: 750,
      w: 18,
      missing: null,
    },
    surveyFactors: { geometry: 0.9, workmanship: 0.95 },
    improvementFactors: { ties: 1.1, jacketing: 1.05 },
    ntcReference: "NTC 2018 § 8.5 γ",
    units: { force: "N", length: "mm" },
    metadata: { label: "muratura esistente δ" },
  };
  const sourceMaterial = new sourceModuleValue.ExistingMasonryMaterial(options);
  const typescriptMaterial = new typescriptModuleValue.ExistingMasonryMaterial(options);

  assert.equal(sourceMaterial.isExistingMaterial(), true);
  assert.equal(typescriptMaterial.isExistingMaterial(), true);
  assert.equal(typescriptMaterial.correctionFactor(), sourceMaterial.correctionFactor());
  assert.equal(typescriptMaterial.improvementFactor(), sourceMaterial.improvementFactor());
  assert.equal(typescriptMaterial.adjustedProperty("fm"), sourceMaterial.adjustedProperty("fm"));
  assert.equal(
    typescriptMaterial.adjustedProperty("missing"),
    sourceMaterial.adjustedProperty("missing"),
  );
  assert.deepEqual(typescriptMaterial.adjustedProperties(), sourceMaterial.adjustedProperties());
  assert.deepEqual(Object.keys(typescriptMaterial), Object.keys(sourceMaterial));
  assert.deepEqual(typescriptMaterial.toJSON(), sourceMaterial.toJSON());
  assert.equal(
    JSON.stringify(typescriptMaterial.toJSON()),
    JSON.stringify(sourceMaterial.toJSON()),
  );
  assert.deepEqual(typescriptMaterial.clone().toJSON(), sourceMaterial.clone().toJSON());

  const sourceError = errorSnapshot(
    () =>
      new sourceModuleValue.ExistingMasonryMaterial({
        name: "Missing units",
        masonryType: "brick",
      }),
  );
  const typescriptError = errorSnapshot(
    () =>
      new typescriptModuleValue.ExistingMasonryMaterial({
        name: "Missing units",
        masonryType: "brick",
      }),
  );
  assert.deepEqual(typescriptError, sourceError);
});
