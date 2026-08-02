import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const sourceRoot = path.resolve(repositoryRoot, "..", "strutture-js");
const sourceRevision = "6f33baead8b88166c4b2cf94af41763412e3c751";

interface RuntimeGroundAnchor {
  totalLength: number;
  bondStart: { x: number; z: number };
  bondEnd: { x: number; z: number };
  pointAtDistance(distance: number): { x: number; z: number };
  toJSON(): Record<string, unknown>;
}

interface RuntimeGroundAnchorModule {
  GroundAnchorModel: new (options: Record<string, unknown>) => RuntimeGroundAnchor;
}

function isRuntimeModule(value: unknown): value is RuntimeGroundAnchorModule {
  return (
    value !== null &&
    typeof value === "object" &&
    typeof Reflect.get(value, "GroundAnchorModel") === "function"
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

void test("GroundAnchorModel matches the independent pinned JavaScript implementation", async () => {
  assert.equal(gitOutput("rev-parse", "HEAD"), sourceRevision);
  assert.equal(gitOutput("status", "--porcelain"), "");
  const sourceModuleValue: unknown = await import(
    pathToFileURL(path.join(sourceRoot, "src", "index.js")).href
  );
  const typescriptModuleValue: unknown = await import(
    pathToFileURL(path.join(repositoryRoot, "dist", "index.js")).href
  );
  if (!isRuntimeModule(sourceModuleValue) || !isRuntimeModule(typescriptModuleValue)) {
    throw new Error("GroundAnchorModel exports do not expose the expected API.");
  }

  assert.notEqual(sourceModuleValue.GroundAnchorModel, typescriptModuleValue.GroundAnchorModel);
  const options: Record<string, unknown> = {
    id: "anchor-α",
    name: "Tirante β",
    head: { x: 1.25, z: 8.5 },
    horizontalDirection: "negative-x",
    inclination: 12,
    angleUnits: "deg",
    freeLength: 5,
    bondLength: 7,
    horizontalSpacing: 2,
    groutBodyDiameter: 0.15,
    tendon: {
      type: "strand",
      steelArea: 0.0014,
      elasticModulus: 195_000_000,
      specifiedMinimumTensileStrength: 1_000_000,
      provenance: { source: " catalogue γ " },
      metadata: { label: "trefolo δ" },
    },
    corrosionProtection: {
      class: "II",
      restressable: true,
      details: { system: "guaina-β" },
      provenance: { source: "catalogue ε" },
    },
    anchorage: {
      tensileCapacity: {
        value: 1200,
        provenance: { source: "catalogue ζ" },
        metadata: { label: "testata η" },
      },
      tendonGroutBondCapacity: { value: 850, provenance: { source: "catalogue θ" } },
      metadata: { label: "ancoraggio ι" },
    },
    installation: {
      method: "iniezione-speciale",
      specialGrouting: true,
      specializedLoadTransfer: true,
      provenance: { source: "method λ" },
      metadata: { label: "installazione μ" },
    },
    units: { force: "kN", length: "m" },
    metadata: { label: "tirante ν", unicode: "αβγ" },
  };
  const sourceModel = new sourceModuleValue.GroundAnchorModel(options);
  const typescriptModel = new typescriptModuleValue.GroundAnchorModel(options);

  assert.equal(typescriptModel.totalLength, sourceModel.totalLength);
  assert.deepEqual(typescriptModel.bondStart, sourceModel.bondStart);
  assert.deepEqual(typescriptModel.bondEnd, sourceModel.bondEnd);
  assert.deepEqual(typescriptModel.pointAtDistance(3), sourceModel.pointAtDistance(3));
  assert.deepEqual(typescriptModel.toJSON(), sourceModel.toJSON());
  assert.equal(JSON.stringify(typescriptModel.toJSON()), JSON.stringify(sourceModel.toJSON()));

  const errorInputs: readonly Record<string, unknown>[] = [
    { ...options, horizontalDirection: "vertical" },
    {
      ...options,
      installation: { specialGrouting: true },
    },
    { ...options, corrosionProtection: { class: "III", provenance: { source: "x" } } },
  ];
  for (const errorInput of errorInputs) {
    const sourceError = errorSnapshot(() => new sourceModuleValue.GroundAnchorModel(errorInput));
    const typescriptError = errorSnapshot(
      () => new typescriptModuleValue.GroundAnchorModel(errorInput),
    );
    assert.deepEqual(typescriptError, sourceError);
  }
  const sourceDistanceError = errorSnapshot(() => sourceModel.pointAtDistance(13));
  const typescriptDistanceError = errorSnapshot(() => typescriptModel.pointAtDistance(13));
  assert.deepEqual(typescriptDistanceError, sourceDistanceError);
});
