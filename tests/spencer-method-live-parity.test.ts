import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const sourceRoot = path.resolve(repositoryRoot, "..", "strutture-js");
const sourceRevision = "6f33baead8b88166c4b2cf94af41763412e3c751";

interface RuntimeModule {
  spencerMethod(
    slices: readonly Record<string, unknown>[],
    options?: Record<string, unknown>,
  ): Record<string, unknown>;
}

function isRuntimeModule(value: unknown): value is RuntimeModule {
  return (
    value !== null &&
    typeof value === "object" &&
    typeof Reflect.get(value, "spencerMethod") === "function"
  );
}

function gitOutput(...arguments_: readonly string[]): string {
  return execFileSync("git", ["-C", sourceRoot, ...arguments_], { encoding: "utf8" }).trim();
}

function captureError(action: () => unknown): { name: string; message: string } {
  try {
    action();
  } catch (error) {
    if (error instanceof Error) return { name: error.name, message: error.message };
    throw error;
  }
  throw new Error("Expected the Spencer method to throw.");
}

function slices(): Record<string, unknown>[] {
  const radius = 10;
  const inputs = [
    { id: "slice-\u03B1", vertical: 100, horizontal: 10, alphaDegrees: 20 },
    { id: "slice-\u03B2", vertical: 80, horizontal: 8, alphaDegrees: 10 },
  ];
  return inputs.map((input) => {
    const alpha = (input.alphaDegrees * Math.PI) / 180;
    const driving = input.vertical * Math.sin(alpha) + input.horizontal * Math.cos(alpha);
    return {
      id: input.id,
      width: 1,
      baseLength: 2,
      totalVerticalLoad: input.vertical,
      horizontalSeismicLoad: input.horizontal,
      baseInclination: alpha,
      cohesion: 10,
      frictionAngle: 0,
      porePressure: 0,
      stressBasis: "total",
      baseMomentArm: radius,
      drivingMoment: driving * radius,
    };
  });
}

void test("Spencer method matches the independent pinned JavaScript implementation", async () => {
  assert.equal(gitOutput("rev-parse", "HEAD"), sourceRevision);
  assert.equal(gitOutput("status", "--porcelain"), "");
  const sourceModuleValue: unknown = await import(
    pathToFileURL(path.join(sourceRoot, "src", "index.js")).href
  );
  const typescriptModuleValue: unknown = await import(
    pathToFileURL(path.join(repositoryRoot, "dist", "index.js")).href
  );
  if (!isRuntimeModule(sourceModuleValue) || !isRuntimeModule(typescriptModuleValue)) {
    throw new Error("Spencer method exports do not expose the expected API.");
  }
  assert.notEqual(
    Reflect.get(sourceModuleValue, "spencerMethod"),
    Reflect.get(typescriptModuleValue, "spencerMethod"),
  );

  const sourceResult = sourceModuleValue.spencerMethod(slices());
  const typescriptResult = typescriptModuleValue.spencerMethod(slices());
  assert.deepEqual(typescriptResult, sourceResult);
  assert.equal(JSON.stringify(typescriptResult), JSON.stringify(sourceResult));
  assert.deepEqual([...JSON.stringify(typescriptResult)], [...JSON.stringify(sourceResult)]);
  const sourceMetadata = sourceResult.metadata;
  const typescriptMetadata = typescriptResult.metadata;
  assert.deepEqual(typescriptMetadata, sourceMetadata);
  const contributions = Reflect.get(typescriptResult, "sliceContributions");
  assert.ok(Array.isArray(contributions));
  const firstContribution: unknown = contributions[0];
  assert.ok(firstContribution !== null && typeof firstContribution === "object");
  const firstId: unknown = Reflect.get(firstContribution, "id");
  assert.equal(typeof firstId, "string");
  if (typeof firstId !== "string") throw new Error("Expected a string slice identifier.");
  assert.deepEqual([...firstId], [..."slice-\u03B1"]);

  const externalSlices = slices().map((slice, index) => ({
    ...slice,
    horizontalSeismicLoad: 0,
    drivingMoment:
      Number(slice.totalVerticalLoad) *
      Math.sin(Number(slice.baseInclination)) *
      Number(slice.baseMomentArm),
    externalPointLoads:
      index === 0
        ? [
            {
              id: "anchor-\u03B3",
              horizontalForceInMovementDirection: -10,
              verticalDownwardForce: 2,
              drivingMoment: -80,
            },
          ]
        : [],
  }));
  assert.deepEqual(
    typescriptModuleValue.spencerMethod(externalSlices),
    sourceModuleValue.spencerMethod(externalSlices),
  );

  const errorCases: readonly [() => unknown, () => unknown][] = [
    [() => sourceModuleValue.spencerMethod([]), () => typescriptModuleValue.spencerMethod([])],
    [
      () =>
        sourceModuleValue.spencerMethod(
          slices().map((slice, index) => (index === 0 ? { ...slice, cohesion: -1 } : slice)),
        ),
      () =>
        typescriptModuleValue.spencerMethod(
          slices().map((slice, index) => (index === 0 ? { ...slice, cohesion: -1 } : slice)),
        ),
    ],
    [
      () => sourceModuleValue.spencerMethod(slices(), { tolerance: 0 }),
      () => typescriptModuleValue.spencerMethod(slices(), { tolerance: 0 }),
    ],
    [
      () => sourceModuleValue.spencerMethod(slices(), { maximumIterations: 0 }),
      () => typescriptModuleValue.spencerMethod(slices(), { maximumIterations: 0 }),
    ],
    [
      () => sourceModuleValue.spencerMethod(slices(), { thetaLimit: Math.PI / 2 }),
      () => typescriptModuleValue.spencerMethod(slices(), { thetaLimit: Math.PI / 2 }),
    ],
  ];
  for (const [sourceAction, typescriptAction] of errorCases) {
    assert.deepEqual(captureError(sourceAction), captureError(typescriptAction));
  }
});
