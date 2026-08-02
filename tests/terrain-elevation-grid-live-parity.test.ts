import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const sourceRoot = path.resolve(repositoryRoot, "..", "strutture-js");
const sourceRevision = "6f33baead8b88166c4b2cf94af41763412e3c751";

interface RuntimeModule {
  readonly TERRAIN_ELEVATION_GRID_SCHEMA_VERSION: string;
  readonly normalizeTerrainElevationGrid: (data?: unknown) => unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isRuntimeModule(value: unknown): value is RuntimeModule {
  return (
    isRecord(value) &&
    typeof value.TERRAIN_ELEVATION_GRID_SCHEMA_VERSION === "string" &&
    typeof value.normalizeTerrainElevationGrid === "function"
  );
}

function gitOutput(...arguments_: readonly string[]): string {
  return execFileSync("git", ["-C", sourceRoot, ...arguments_], { encoding: "utf8" }).trim();
}

function assertSourceBaseline(): void {
  assert.equal(gitOutput("rev-parse", "HEAD"), sourceRevision);
  assert.equal(gitOutput("status", "--porcelain"), "");
}

function codePoints(value: string): number[] {
  return Array.from(value, (character) => {
    const codePoint = character.codePointAt(0);
    if (codePoint === undefined) {
      throw new Error("Expected a code point for every character.");
    }
    return codePoint;
  });
}

function assertDeepParity(source: unknown, typescript: unknown, label: string): void {
  assert.deepEqual(typescript, source, label);
  assert.equal(JSON.stringify(typescript), JSON.stringify(source), `${label}: exact JSON`);

  const compareUnicode = (left: unknown, right: unknown, valuePath: string): void => {
    if (typeof left === "string" || typeof right === "string") {
      assert.equal(typeof left, "string", `${label}${valuePath}`);
      assert.equal(typeof right, "string", `${label}${valuePath}`);
      if (typeof left !== "string" || typeof right !== "string") {
        throw new Error("Expected both values to be strings.");
      }
      assert.deepEqual(
        codePoints(left),
        codePoints(right),
        `${label}${valuePath}: Unicode code points`,
      );
      return;
    }
    if (Array.isArray(left) || Array.isArray(right)) {
      assert.ok(Array.isArray(left) && Array.isArray(right), `${label}${valuePath}`);
      assert.equal(left.length, right.length, `${label}${valuePath}.length`);
      left.forEach((entry, index) => compareUnicode(entry, right[index], `${valuePath}[${index}]`));
      return;
    }
    if (isRecord(left) || isRecord(right)) {
      assert.ok(isRecord(left) && isRecord(right), `${label}${valuePath}`);
      const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
      keys.forEach((key) => compareUnicode(left[key], right[key], `${valuePath}.${key}`));
    }
  };

  compareUnicode(source, typescript, "$");
}

function errorSnapshot(callback: () => unknown): { name: string; message: string } {
  try {
    callback();
  } catch (error: unknown) {
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

async function loadModules(): Promise<{ source: RuntimeModule; typescript: RuntimeModule }> {
  const sourceModule: unknown = await import(
    pathToFileURL(path.join(sourceRoot, "src", "index.js")).href
  );
  const typescriptModule: unknown = await import(
    pathToFileURL(path.join(repositoryRoot, "dist", "index.js")).href
  );
  assert.ok(isRuntimeModule(sourceModule));
  assert.ok(isRuntimeModule(typescriptModule));
  return { source: sourceModule, typescript: typescriptModule };
}

const point = (
  row: number,
  col: number,
  elevationM: number | string | null,
  extra: Record<string, unknown> = {},
): Record<string, unknown> => ({ row, col, elevationM, ...extra });

function scenarioWithExplicitOrientation(): Record<string, unknown> {
  return {
    gridSize: 3,
    spacingM: "10",
    extentM: "25",
    radiusM: 20,
    center: { latitudeDeg: "45.123", longitudeDeg: 9.456 },
    points: [
      point(0, 0, "100", { northOffsetM: -10, eastOffsetM: 10, source: "external" }),
      point(0, 1, 101, { northOffsetM: -10, eastOffsetM: 0, isInterpolated: true }),
      point(0, 2, 102, { northOffsetM: -10, eastOffsetM: -10 }),
      point(1, 0, 103, { northOffsetM: 0, eastOffsetM: 10, resolution_m: "30" }),
      point(1, 1, null, { northOffsetM: 0, eastOffsetM: 0, nodata: true }),
      point(1, 2, 105, { northOffsetM: 0, eastOffsetM: -10, method: "survey" }),
      point(2, 0, 106, { northOffsetM: 10, eastOffsetM: 10 }),
      point(2, 1, 107, { northOffsetM: 10, eastOffsetM: 0 }),
    ],
    provenance: { provider: "測量", dataset: "α-grid" },
  };
}

function scenarioWithCoordinateOrientation(): Record<string, unknown> {
  return {
    points: [
      { row: 0, column: 0, elevation_m: 12, lat: 40, lon: 10 },
      { row: 0, column: 1, elevation: 13, lat: 40, lon: 9 },
      { row: 1, column: 0, elevation: 14, lat: 41, lon: 10 },
      { row: 1, column: 1, elevation: 15, lat: 41, lon: 9, fallback: true },
    ],
    spacingM: 5,
    center: { lat: 40.5, lon: 9.5 },
  };
}

function scenarioWithDefaultsAndMissingData(): Record<string, unknown> {
  return {
    gridSize: 2,
    spacingM: 2,
    points: [
      { row: 0, col: 0, elevationM: "" },
      { row: 0, col: 1, elevationM: 4, sourceResolutionM: 15 },
      { row: 1, col: 0, elevationM: 5, isNoData: true },
      { row: 1, col: 1, elevationM: 6, samplingMethod: "LiDAR" },
    ],
    extentM: 0,
    radiusM: -1,
    provenance: null,
  };
}

void test("terrain elevation-grid normalization matches the independent pinned JavaScript implementation", async () => {
  assertSourceBaseline();
  const { source, typescript } = await loadModules();
  assert.notEqual(source.normalizeTerrainElevationGrid, typescript.normalizeTerrainElevationGrid);
  assert.equal(
    source.TERRAIN_ELEVATION_GRID_SCHEMA_VERSION,
    typescript.TERRAIN_ELEVATION_GRID_SCHEMA_VERSION,
  );

  for (const [label, input] of [
    ["explicit orientation", scenarioWithExplicitOrientation()],
    ["coordinate orientation", scenarioWithCoordinateOrientation()],
    ["defaults and missing data", scenarioWithDefaultsAndMissingData()],
  ] as const) {
    assertDeepParity(
      source.normalizeTerrainElevationGrid(input),
      typescript.normalizeTerrainElevationGrid(input),
      label,
    );
  }

  const invalidInputs: readonly [string, unknown][] = [
    ["null data", null],
    ["array data", []],
    ["missing points", {}],
    [
      "invalid grid size",
      {
        gridSize: 1,
        spacingM: 1,
        points: [{ elevationM: 1 }, { elevationM: 2 }, { elevationM: 3 }],
      },
    ],
    [
      "non-square points",
      { spacingM: 1, points: [{ elevationM: 1 }, { elevationM: 2 }, { elevationM: 3 }] },
    ],
    ["invalid spacing", { gridSize: 2, spacingM: 0, points: [] }],
    ["array provenance", { gridSize: 2, spacingM: 1, points: [], provenance: [] }],
    ["scalar provenance", { gridSize: 2, spacingM: 1, points: [], provenance: "external" }],
  ];
  for (const [label, input] of invalidInputs) {
    assertErrorParity(
      () => source.normalizeTerrainElevationGrid(input),
      () => typescript.normalizeTerrainElevationGrid(input),
      label,
    );
  }
});
