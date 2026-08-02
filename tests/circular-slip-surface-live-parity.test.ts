import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const sourceRoot = path.resolve(repositoryRoot, "..", "strutture-js");
const sourceRevision = "6f33baead8b88166c4b2cf94af41763412e3c751";

interface RuntimeSlipSurface {
  lowerElevationAt(x: number): number;
  baseInclinationAt(x: number): number;
  intersectionsWithSegment(
    start: { x: number; z: number },
    end: { x: number; z: number },
  ): unknown[];
  intersectionsWithPolyline(points: Array<{ x: number; z: number }>): unknown[];
  toJSON(): Record<string, unknown>;
}

interface RuntimeSlipSurfaceClass {
  new (options: Record<string, unknown>): RuntimeSlipSurface;
  fromChordAndSagitta(options: Record<string, unknown>): RuntimeSlipSurface;
}

interface RuntimeModule {
  CircularSlipSurface2D: RuntimeSlipSurfaceClass;
}

function isRuntimeModule(value: unknown): value is RuntimeModule {
  return (
    value !== null &&
    typeof value === "object" &&
    typeof Reflect.get(value, "CircularSlipSurface2D") === "function"
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

void test("CircularSlipSurface2D matches the independent pinned JavaScript implementation", async () => {
  assert.equal(gitOutput("rev-parse", "HEAD"), sourceRevision);
  assert.equal(gitOutput("status", "--porcelain"), "");
  const sourceModuleValue: unknown = await import(
    pathToFileURL(path.join(sourceRoot, "src", "index.js")).href
  );
  const typescriptModuleValue: unknown = await import(
    pathToFileURL(path.join(repositoryRoot, "dist", "index.js")).href
  );
  if (!isRuntimeModule(sourceModuleValue) || !isRuntimeModule(typescriptModuleValue)) {
    throw new Error("CircularSlipSurface2D exports do not expose the expected API.");
  }

  assert.notEqual(
    sourceModuleValue.CircularSlipSurface2D,
    typescriptModuleValue.CircularSlipSurface2D,
  );
  const options: Record<string, unknown> = {
    id: "circle-α",
    entry: { x: 0, z: 0 },
    exit: { x: 10, z: 0 },
    sagitta: 2,
    movementDirection: "right-to-left",
    units: { force: "kN", length: "m" },
    metadata: { label: "superficie β" },
  };
  const sourceSurface = sourceModuleValue.CircularSlipSurface2D.fromChordAndSagitta(options);
  const typescriptSurface =
    typescriptModuleValue.CircularSlipSurface2D.fromChordAndSagitta(options);
  const segment = { x: -2, z: 0 };
  const segmentEnd = { x: 12, z: 0 };
  const polyline = [segment, segmentEnd];

  assert.equal(typescriptSurface.lowerElevationAt(5), sourceSurface.lowerElevationAt(5));
  assert.equal(typescriptSurface.baseInclinationAt(5), sourceSurface.baseInclinationAt(5));
  assert.deepEqual(
    typescriptSurface.intersectionsWithSegment(segment, segmentEnd),
    sourceSurface.intersectionsWithSegment(segment, segmentEnd),
  );
  assert.deepEqual(
    typescriptSurface.intersectionsWithPolyline(polyline),
    sourceSurface.intersectionsWithPolyline(polyline),
  );
  assert.deepEqual(typescriptSurface.toJSON(), sourceSurface.toJSON());
  assert.equal(JSON.stringify(typescriptSurface.toJSON()), JSON.stringify(sourceSurface.toJSON()));

  const sourceError = errorSnapshot(() =>
    sourceModuleValue.CircularSlipSurface2D.fromChordAndSagitta({
      id: "too-deep",
      entry: { x: 0, z: 0 },
      exit: { x: 10, z: 0 },
      sagitta: 5,
      units: { force: "kN", length: "m" },
    }),
  );
  const typescriptError = errorSnapshot(() =>
    typescriptModuleValue.CircularSlipSurface2D.fromChordAndSagitta({
      id: "too-deep",
      entry: { x: 0, z: 0 },
      exit: { x: 10, z: 0 },
      sagitta: 5,
      units: { force: "kN", length: "m" },
    }),
  );
  assert.deepEqual(typescriptError, sourceError);
});
