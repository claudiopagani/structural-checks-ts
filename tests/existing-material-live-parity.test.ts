import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const sourceRoot = path.resolve(repositoryRoot, "..", "strutture-js");
const sourceRevision = "6f33baead8b88166c4b2cf94af41763412e3c751";

interface RuntimeExistingMaterial {
  readonly conditionLevel: string;
  readonly knowledgeLevel: string | number | null;
  readonly confidenceFactor: number;
  readonly testResults: unknown[];
  readonly interventions: unknown[];
  isExistingMaterial(): boolean;
  addTestResult(result: unknown): RuntimeExistingMaterial;
  addIntervention(intervention: unknown): RuntimeExistingMaterial;
  designValue(value: number): number;
  clone(): RuntimeExistingMaterial;
  toJSON(): Record<string, unknown>;
}

interface RuntimeModule {
  readonly ExistingMaterial: new (options: Record<string, unknown>) => RuntimeExistingMaterial;
}

function isRuntimeModule(value: unknown): value is RuntimeModule {
  return (
    value !== null &&
    typeof value === "object" &&
    "ExistingMaterial" in value &&
    typeof Reflect.get(value, "ExistingMaterial") === "function"
  );
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

void test("ExistingMaterial matches the independent pinned JavaScript implementation", async () => {
  assertSourceBaseline();
  const sourceModuleValue: unknown = await import(
    pathToFileURL(path.join(sourceRoot, "src", "index.js")).href
  );
  const typescriptModuleValue: unknown = await import(
    pathToFileURL(path.join(repositoryRoot, "dist", "index.js")).href
  );
  if (!isRuntimeModule(sourceModuleValue) || !isRuntimeModule(typescriptModuleValue)) {
    throw new Error("ExistingMaterial exports do not expose the expected API.");
  }

  assert.notEqual(sourceModuleValue.ExistingMaterial, typescriptModuleValue.ExistingMaterial);
  const options = {
    id: "existing-\u03B1",
    name: "Existing masonry",
    category: "masonry",
    units: { force: "N", length: "mm" },
    conditionLevel: "good",
    knowledgeLevel: "LC2",
    confidenceFactor: 1.2,
    testResults: [{ id: "test-\u03B2", value: 18 }],
    interventions: [{ type: "grout", label: "iniezione \u03B3" }],
    metadata: { source: "survey \u03B4" },
  };
  const sourceMaterial = new sourceModuleValue.ExistingMaterial(options);
  const typescriptMaterial = new typescriptModuleValue.ExistingMaterial(options);

  assert.equal(sourceMaterial.isExistingMaterial(), true);
  assert.equal(typescriptMaterial.isExistingMaterial(), true);
  assert.deepEqual(Object.keys(typescriptMaterial), Object.keys(sourceMaterial));
  assert.deepEqual(typescriptMaterial.toJSON(), sourceMaterial.toJSON());
  assert.equal(
    JSON.stringify(typescriptMaterial.toJSON()),
    JSON.stringify(sourceMaterial.toJSON()),
  );
  assert.equal(typescriptMaterial.designValue(12), sourceMaterial.designValue(12));

  const result = { id: "test-2", value: 20 };
  const intervention = { type: "repair", label: "intonaco" };
  sourceMaterial.addTestResult(result).addIntervention(intervention);
  typescriptMaterial.addTestResult(result).addIntervention(intervention);
  assert.deepEqual(typescriptMaterial.toJSON(), sourceMaterial.toJSON());
  assert.deepEqual(typescriptMaterial.clone().toJSON(), sourceMaterial.clone().toJSON());

  assert.deepEqual(
    errorSnapshot(
      () =>
        new sourceModuleValue.ExistingMaterial({
          name: "Missing units",
          category: "masonry",
        }),
    ),
    errorSnapshot(
      () =>
        new typescriptModuleValue.ExistingMaterial({
          name: "Missing units",
          category: "masonry",
        }),
    ),
  );
});
