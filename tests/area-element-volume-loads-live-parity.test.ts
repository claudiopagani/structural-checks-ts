import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const sourceRoot = path.resolve(repositoryRoot, "..", "strutture-js");
const sourceRevision = "6f33baead8b88166c4b2cf94af41763412e3c751";

interface RuntimeLoad {
  readonly id: string;
  readonly type: string;
  readonly dimension: string;
  readonly direction: string | null;
  readonly intensity?: number;
  readonly position?: number;
  readonly referenceSystem: string;
  readonly metadata: Record<string, unknown>;
  readonly target: Record<string, unknown> | null;
  resolvedArea?(): number | null;
  resolvedVolume?(): number | null;
  resultant(): number | null;
  toJSON(): Record<string, unknown>;
}

interface RuntimeModule {
  readonly AreaLoad: new (options: Record<string, unknown>) => RuntimeLoad;
  readonly ElementPointLoad: new (options: Record<string, unknown>) => RuntimeLoad;
  readonly VolumeLoad: new (options: Record<string, unknown>) => RuntimeLoad;
}

interface RuntimeRoot extends RuntimeModule {
  readonly Load: new (options: Record<string, unknown>) => object;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isRuntimeModule(value: unknown): value is RuntimeModule {
  return (
    isRecord(value) &&
    typeof value.AreaLoad === "function" &&
    typeof value.ElementPointLoad === "function" &&
    typeof value.VolumeLoad === "function"
  );
}

function isRuntimeRoot(value: unknown): value is RuntimeRoot {
  return isRuntimeModule(value) && isRecord(value) && typeof value.Load === "function";
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

async function loadModules(): Promise<{
  source: RuntimeModule;
  typescript: RuntimeModule;
  sourceRoot: RuntimeRoot;
  typescriptRoot: RuntimeRoot;
}> {
  const sourceModule: unknown = await import(
    pathToFileURL(path.join(sourceRoot, "src", "index.js")).href
  );
  const typescriptModule: unknown = await import(
    pathToFileURL(path.join(repositoryRoot, "dist", "index.js")).href
  );
  if (
    !isRuntimeModule(sourceModule) ||
    !isRuntimeModule(typescriptModule) ||
    !isRuntimeRoot(sourceModule) ||
    !isRuntimeRoot(typescriptModule)
  ) {
    throw new Error("Area, element-point and volume load modules do not expose the expected API.");
  }

  return {
    source: sourceModule,
    typescript: typescriptModule,
    sourceRoot: sourceModule,
    typescriptRoot: typescriptModule,
  };
}

function assertLoadParity(sourceLoad: RuntimeLoad, typescriptLoad: RuntimeLoad): void {
  assert.deepEqual(Object.keys(typescriptLoad), Object.keys(sourceLoad));
  assert.deepEqual(typescriptLoad.toJSON(), sourceLoad.toJSON());
  assert.equal(JSON.stringify(typescriptLoad.toJSON()), JSON.stringify(sourceLoad.toJSON()));
  assert.equal(typescriptLoad.referenceSystem, sourceLoad.referenceSystem);
  assert.deepEqual(typescriptLoad.metadata, sourceLoad.metadata);
  assert.deepEqual(typescriptLoad.resultant(), sourceLoad.resultant());
}

void test("area, element-point and volume loads match the independent pinned JavaScript implementation", async () => {
  assertSourceBaseline();
  const { source, typescript, sourceRoot, typescriptRoot } = await loadModules();

  assert.notEqual(source.AreaLoad, typescript.AreaLoad);
  assert.notEqual(source.ElementPointLoad, typescript.ElementPointLoad);
  assert.notEqual(source.VolumeLoad, typescript.VolumeLoad);
  assert.equal(sourceRoot.AreaLoad, source.AreaLoad);
  assert.equal(typescriptRoot.AreaLoad, typescript.AreaLoad);
  assert.equal(sourceRoot.ElementPointLoad, source.ElementPointLoad);
  assert.equal(typescriptRoot.ElementPointLoad, typescript.ElementPointLoad);
  assert.equal(sourceRoot.VolumeLoad, source.VolumeLoad);
  assert.equal(typescriptRoot.VolumeLoad, typescript.VolumeLoad);

  const sourceArea = new source.AreaLoad({
    id: "area-\u03B1",
    type: "surface_generic",
    direction: "globalZ",
    intensity: 3.5,
    area: 12,
    units: { force: "kN", length: "m" },
    metadata: { label: "superficie \u03B2" },
  });
  const typescriptArea = new typescript.AreaLoad({
    id: "area-\u03B1",
    type: "surface_generic",
    direction: "globalZ",
    intensity: 3.5,
    area: 12,
    units: { force: "kN", length: "m" },
    metadata: { label: "superficie \u03B2" },
  });
  assert.equal(sourceArea instanceof sourceRoot.Load, true);
  assert.equal(typescriptArea instanceof typescriptRoot.Load, true);
  assertLoadParity(sourceArea, typescriptArea);
  assert.equal(sourceArea.resolvedArea?.(), typescriptArea.resolvedArea?.());

  const sourceElement = new source.ElementPointLoad({
    id: "element-point-1",
    element: { id: "beam-\u03B3" },
    position: 2.5,
    direction: "globalY",
    components: { fy: -10, fz: 6, mz: 2 },
    units: { force: "kN", length: "m" },
  });
  const typescriptElement = new typescript.ElementPointLoad({
    id: "element-point-1",
    element: { id: "beam-\u03B3" },
    position: 2.5,
    direction: "globalY",
    components: { fy: -10, fz: 6, mz: 2 },
    units: { force: "kN", length: "m" },
  });
  assertLoadParity(sourceElement, typescriptElement);

  const target = {
    id: "solid-\u03B4",
    volume: () => 0.8,
  };
  const sourceVolume = new source.VolumeLoad({
    id: "volume-1",
    type: "body_force",
    intensity: 24,
    target,
    units: { force: "kN", length: "m" },
  });
  const typescriptVolume = new typescript.VolumeLoad({
    id: "volume-1",
    type: "body_force",
    intensity: 24,
    target,
    units: { force: "kN", length: "m" },
  });
  assertLoadParity(sourceVolume, typescriptVolume);
  assert.equal(sourceVolume.resolvedVolume?.(), typescriptVolume.resolvedVolume?.());

  assertErrorParity(
    () => new source.AreaLoad({ intensity: Number.NaN, units: { force: "kN", length: "m" } }),
    () => new typescript.AreaLoad({ intensity: Number.NaN, units: { force: "kN", length: "m" } }),
    "area intensity error",
  );
  assertErrorParity(
    () =>
      new source.VolumeLoad({
        intensity: Number.POSITIVE_INFINITY,
        units: { force: "kN", length: "m" },
      }),
    () =>
      new typescript.VolumeLoad({
        intensity: Number.POSITIVE_INFINITY,
        units: { force: "kN", length: "m" },
      }),
    "volume intensity error",
  );
  assertErrorParity(
    () => new source.AreaLoad({ intensity: 1 }),
    () => new typescript.AreaLoad({ intensity: 1 }),
    "missing area units error",
  );
});
