import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const sourceRoot = path.resolve(repositoryRoot, "..", "strutture-js");
const sourceRevision = "6f33baead8b88166c4b2cf94af41763412e3c751";

interface RuntimeModule {
  SLOPE_STABILITY_METHODS: readonly string[];
  ordinaryMethodOfSlices(slices: readonly Record<string, unknown>[]): Record<string, unknown>;
  simplifiedBishop(
    slices: readonly Record<string, unknown>[],
    options?: Record<string, unknown>,
  ): Record<string, unknown>;
}

function isRuntimeModule(value: unknown): value is RuntimeModule {
  return (
    value !== null &&
    typeof value === "object" &&
    Array.isArray(Reflect.get(value, "SLOPE_STABILITY_METHODS")) &&
    typeof Reflect.get(value, "ordinaryMethodOfSlices") === "function" &&
    typeof Reflect.get(value, "simplifiedBishop") === "function"
  );
}

function gitOutput(...arguments_: readonly string[]): string {
  return execFileSync("git", ["-C", sourceRoot, ...arguments_], { encoding: "utf8" }).trim();
}

type SlicePair = [Record<string, unknown>, Record<string, unknown>];

function slices(): SlicePair {
  return [
    {
      id: "slice-\u03B1",
      width: 2,
      baseLength: 2,
      weight: 100,
      baseInclination: (20 * Math.PI) / 180,
      cohesion: 10,
      frictionAngle: (25 * Math.PI) / 180,
      porePressure: 2,
      stressBasis: "effective",
    },
    {
      id: "slice-\u03B2",
      width: 2,
      baseLength: 2,
      weight: 120,
      baseInclination: (10 * Math.PI) / 180,
      cohesion: 8,
      frictionAngle: (25 * Math.PI) / 180,
      porePressure: 1,
      stressBasis: "effective",
    },
  ];
}

function captureError(action: () => unknown): { name: string; message: string } {
  let captured: { name: string; message: string } | null = null;
  try {
    action();
  } catch (error) {
    if (error instanceof Error) {
      captured = { name: error.name, message: error.message };
    } else {
      throw error;
    }
  }
  if (captured === null) throw new Error("Expected the slope method to throw.");
  return captured;
}

void test("slope-stability methods match the independent pinned JavaScript implementation", async () => {
  assert.equal(gitOutput("rev-parse", "HEAD"), sourceRevision);
  assert.equal(gitOutput("status", "--porcelain"), "");
  const sourceModuleValue: unknown = await import(
    pathToFileURL(path.join(sourceRoot, "src", "index.js")).href
  );
  const typescriptModuleValue: unknown = await import(
    pathToFileURL(path.join(repositoryRoot, "dist", "index.js")).href
  );
  if (!isRuntimeModule(sourceModuleValue) || !isRuntimeModule(typescriptModuleValue)) {
    throw new Error("Slope-stability method exports do not expose the expected API.");
  }
  assert.deepEqual(
    typescriptModuleValue.SLOPE_STABILITY_METHODS,
    sourceModuleValue.SLOPE_STABILITY_METHODS,
  );
  assert.notEqual(
    Reflect.get(sourceModuleValue, "ordinaryMethodOfSlices"),
    Reflect.get(typescriptModuleValue, "ordinaryMethodOfSlices"),
  );

  const sourceOrdinary = sourceModuleValue.ordinaryMethodOfSlices(slices());
  const typescriptOrdinary = typescriptModuleValue.ordinaryMethodOfSlices(slices());
  assert.deepEqual(typescriptOrdinary, sourceOrdinary);
  assert.equal(JSON.stringify(typescriptOrdinary), JSON.stringify(sourceOrdinary));
  assert.deepEqual([...JSON.stringify(typescriptOrdinary)], [...JSON.stringify(sourceOrdinary)]);

  const sourceBishop = sourceModuleValue.simplifiedBishop(slices());
  const typescriptBishop = typescriptModuleValue.simplifiedBishop(slices());
  assert.deepEqual(typescriptBishop, sourceBishop);
  assert.equal(JSON.stringify(typescriptBishop), JSON.stringify(sourceBishop));

  const totalStressSlices = slices().map((slice) => ({
    ...slice,
    stressBasis: "total",
    porePressure: 999,
  }));
  assert.deepEqual(
    typescriptModuleValue.ordinaryMethodOfSlices(totalStressSlices),
    sourceModuleValue.ordinaryMethodOfSlices(totalStressSlices),
  );
  assert.deepEqual(
    typescriptModuleValue.simplifiedBishop(totalStressSlices, {
      initialFactorOfSafety: 2,
      tolerance: 1e-12,
      maximumIterations: 50,
    }),
    sourceModuleValue.simplifiedBishop(totalStressSlices, {
      initialFactorOfSafety: 2,
      tolerance: 1e-12,
      maximumIterations: 50,
    }),
  );

  const errorCases: readonly [() => unknown, () => unknown][] = [
    [
      () => sourceModuleValue.ordinaryMethodOfSlices([]),
      () => typescriptModuleValue.ordinaryMethodOfSlices([]),
    ],
    [
      () =>
        sourceModuleValue.ordinaryMethodOfSlices([
          { ...slices()[0], horizontalSeismicLoad: 1 },
          slices()[1],
        ]),
      () =>
        typescriptModuleValue.ordinaryMethodOfSlices([
          { ...slices()[0], horizontalSeismicLoad: 1 },
          slices()[1],
        ]),
    ],
    [
      () => sourceModuleValue.simplifiedBishop(slices(), { tolerance: 0 }),
      () => typescriptModuleValue.simplifiedBishop(slices(), { tolerance: 0 }),
    ],
    [
      () => sourceModuleValue.simplifiedBishop(slices(), { maximumIterations: 0 }),
      () => typescriptModuleValue.simplifiedBishop(slices(), { maximumIterations: 0 }),
    ],
  ];
  for (const [sourceAction, typescriptAction] of errorCases) {
    assert.deepEqual(captureError(sourceAction), captureError(typescriptAction));
  }
});
