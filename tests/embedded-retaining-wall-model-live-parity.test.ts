import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const sourceRoot = path.resolve(repositoryRoot, "..", "strutture-js");
const sourceRevision = "6f33baead8b88166c4b2cf94af41763412e3c751";

interface RuntimeWallModel {
  flexuralRigidityAtElevation(elevation: number): Record<string, unknown>;
  toJSON(): Record<string, unknown>;
}

interface RuntimeModule {
  EmbeddedRetainingWallModel: new (options: Record<string, unknown>) => RuntimeWallModel;
}

function isRuntimeModule(value: unknown): value is RuntimeModule {
  return (
    value !== null &&
    typeof value === "object" &&
    typeof Reflect.get(value, "EmbeddedRetainingWallModel") === "function"
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

void test("EmbeddedRetainingWallModel matches the independent pinned JavaScript implementation", async () => {
  assert.equal(gitOutput("rev-parse", "HEAD"), sourceRevision);
  assert.equal(gitOutput("status", "--porcelain"), "");
  const sourceModuleValue: unknown = await import(
    pathToFileURL(path.join(sourceRoot, "src", "index.js")).href
  );
  const typescriptModuleValue: unknown = await import(
    pathToFileURL(path.join(repositoryRoot, "dist", "index.js")).href
  );
  if (!isRuntimeModule(sourceModuleValue) || !isRuntimeModule(typescriptModuleValue)) {
    throw new Error("EmbeddedRetainingWallModel exports do not expose the expected API.");
  }

  assert.notEqual(
    sourceModuleValue.EmbeddedRetainingWallModel,
    typescriptModuleValue.EmbeddedRetainingWallModel,
  );
  const options: Record<string, unknown> = {
    id: "wall-α",
    name: "Paratia β",
    type: "equivalent-beam-strip",
    topElevation: 10,
    toeElevation: 0,
    analysisWidth: 2,
    flexuralRigiditySegments: [
      {
        id: "lower",
        topElevation: 5,
        bottomElevation: 0,
        flexuralRigidity: 800,
        provenance: { source: " catalogue γ " },
        metadata: { label: "lower δ" },
      },
      {
        id: "upper",
        topElevation: 10,
        bottomElevation: 5,
        flexuralRigidity: 1000,
        provenance: { source: "catalogue ε" },
        metadata: { label: "upper ζ" },
      },
    ],
    headCondition: { translation: "fixed", rotation: "free" },
    toeCondition: { translation: "free", rotation: "fixed" },
    units: { force: "kN", length: "m" },
    metadata: { label: "muro η" },
  };
  const sourceModel = new sourceModuleValue.EmbeddedRetainingWallModel(options);
  const typescriptModel = new typescriptModuleValue.EmbeddedRetainingWallModel(options);

  assert.deepEqual(
    typescriptModel.flexuralRigidityAtElevation(7),
    sourceModel.flexuralRigidityAtElevation(7),
  );
  assert.deepEqual(typescriptModel.toJSON(), sourceModel.toJSON());
  assert.equal(JSON.stringify(typescriptModel.toJSON()), JSON.stringify(sourceModel.toJSON()));

  const sourceError = errorSnapshot(
    () =>
      new sourceModuleValue.EmbeddedRetainingWallModel({
        id: "wall",
        topElevation: 10,
        toeElevation: 0,
        units: { force: "kN", length: "m" },
        flexuralRigiditySegments: [
          {
            topElevation: 10,
            bottomElevation: 0,
            flexuralRigidity: 1000,
            provenance: {},
          },
        ],
      }),
  );
  const typescriptError = errorSnapshot(
    () =>
      new typescriptModuleValue.EmbeddedRetainingWallModel({
        id: "wall",
        topElevation: 10,
        toeElevation: 0,
        units: { force: "kN", length: "m" },
        flexuralRigiditySegments: [
          {
            topElevation: 10,
            bottomElevation: 0,
            flexuralRigidity: 1000,
            provenance: {},
          },
        ],
      }),
  );
  assert.deepEqual(typescriptError, sourceError);
});
