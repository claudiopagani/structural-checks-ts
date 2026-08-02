import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const sourceRoot = path.resolve(repositoryRoot, "..", "strutture-js");
const sourceRevision = "6f33baead8b88166c4b2cf94af41763412e3c751";

interface SurchargeRuntime {
  intensity: number;
  toJSON(): Record<string, unknown>;
  forcePerUnitWidthBetween(minimumX: number, maximumX: number): number;
}

interface SurchargeModule {
  SlopeSurfaceSurcharge2D: new (options: Record<string, unknown>) => SurchargeRuntime;
}

function isSurchargeModule(value: unknown): value is SurchargeModule {
  return (
    value !== null &&
    typeof value === "object" &&
    typeof Reflect.get(value, "SlopeSurfaceSurcharge2D") === "function"
  );
}

function gitOutput(...arguments_: readonly string[]): string {
  return execFileSync("git", ["-C", sourceRoot, ...arguments_], { encoding: "utf8" }).trim();
}

function createOptions(): Record<string, unknown> {
  return {
    id: "surcharge-α",
    intensity: 0.02,
    minimumX: 0,
    maximumX: 5000,
    units: { force: "N", length: "mm" },
    metadata: { label: "carico β" },
  };
}

function capture(action: () => unknown): { name: string; message: string } {
  try {
    action();
  } catch (error) {
    if (error instanceof Error) return { name: error.name, message: error.message };
    throw error;
  }
  throw new Error("Expected the surcharge case to throw.");
}

void test("SlopeSurfaceSurcharge2D matches the independent pinned JavaScript implementation", async () => {
  assert.equal(gitOutput("rev-parse", "HEAD"), sourceRevision);
  assert.equal(gitOutput("status", "--porcelain"), "");
  const sourceModuleValue: unknown = await import(
    pathToFileURL(path.join(sourceRoot, "src", "index.js")).href
  );
  const typescriptModuleValue: unknown = await import(
    pathToFileURL(path.join(repositoryRoot, "dist", "index.js")).href
  );
  if (!isSurchargeModule(sourceModuleValue) || !isSurchargeModule(typescriptModuleValue)) {
    throw new Error("Slope surcharge exports do not expose the expected API.");
  }
  assert.notEqual(
    typescriptModuleValue.SlopeSurfaceSurcharge2D,
    sourceModuleValue.SlopeSurfaceSurcharge2D,
  );

  const sourceSurcharge = new sourceModuleValue.SlopeSurfaceSurcharge2D(createOptions());
  const typescriptSurcharge = new typescriptModuleValue.SlopeSurfaceSurcharge2D(createOptions());
  assert.equal(typescriptSurcharge.intensity, sourceSurcharge.intensity);
  assert.equal(
    typescriptSurcharge.forcePerUnitWidthBetween(0, 10),
    sourceSurcharge.forcePerUnitWidthBetween(0, 10),
  );
  assert.equal(
    typescriptSurcharge.forcePerUnitWidthBetween(-5, 20),
    sourceSurcharge.forcePerUnitWidthBetween(-5, 20),
  );
  assert.equal(
    typescriptSurcharge.forcePerUnitWidthBetween(20, 30),
    sourceSurcharge.forcePerUnitWidthBetween(20, 30),
  );
  assert.deepEqual(typescriptSurcharge.toJSON(), sourceSurcharge.toJSON());
  assert.deepEqual(
    [...JSON.stringify(typescriptSurcharge.toJSON())],
    [...JSON.stringify(sourceSurcharge.toJSON())],
  );

  const invalidCases: readonly [
    (moduleValue: SurchargeModule) => unknown,
    (moduleValue: SurchargeModule) => unknown,
  ][] = [
    [
      (moduleValue) => new moduleValue.SlopeSurfaceSurcharge2D({ ...createOptions(), id: "" }),
      (moduleValue) => new moduleValue.SlopeSurfaceSurcharge2D({ ...createOptions(), id: "" }),
    ],
    [
      (moduleValue) =>
        new moduleValue.SlopeSurfaceSurcharge2D({ ...createOptions(), intensity: -1 }),
      (moduleValue) =>
        new moduleValue.SlopeSurfaceSurcharge2D({ ...createOptions(), intensity: -1 }),
    ],
    [
      (moduleValue) => new moduleValue.SlopeSurfaceSurcharge2D({ ...createOptions(), maximumX: 0 }),
      (moduleValue) => new moduleValue.SlopeSurfaceSurcharge2D({ ...createOptions(), maximumX: 0 }),
    ],
    [
      (moduleValue) => new moduleValue.SlopeSurfaceSurcharge2D({ ...createOptions(), units: null }),
      (moduleValue) => new moduleValue.SlopeSurfaceSurcharge2D({ ...createOptions(), units: null }),
    ],
  ];
  for (const [sourceCase, typescriptCase] of invalidCases) {
    assert.deepEqual(
      capture(() => sourceCase(sourceModuleValue)),
      capture(() => typescriptCase(typescriptModuleValue)),
    );
  }
});
