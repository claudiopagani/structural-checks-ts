import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const sourceRoot = path.resolve(repositoryRoot, "..", "strutture-js");
const sourceRevision = "6f33baead8b88166c4b2cf94af41763412e3c751";

type RuntimeModule = Record<string, unknown>;

function isRecord(value: unknown): value is RuntimeModule {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function gitOutput(...arguments_: readonly string[]): string {
  return execFileSync("git", ["-C", sourceRoot, ...arguments_], { encoding: "utf8" }).trim();
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

async function loadModule(root: string, relativePath: string): Promise<RuntimeModule> {
  const module: unknown = await import(pathToFileURL(path.join(root, relativePath)).href);
  if (!isRecord(module)) {
    throw new Error(`The module ${relativePath} is not an object module.`);
  }
  return module;
}

void test("terrain public index matches the independent pinned JavaScript implementation", async () => {
  assert.equal(gitOutput("rev-parse", "HEAD"), sourceRevision);
  assert.equal(gitOutput("status", "--porcelain"), "");

  const sourceIndex = await loadModule(sourceRoot, "src/domain/terrain/index.js");
  const typescriptIndex = await loadModule(
    path.join(repositoryRoot, "dist"),
    "domain/terrain/index.js",
  );
  assert.deepEqual(Object.keys(typescriptIndex), Object.keys(sourceIndex));
  assert.equal(
    JSON.stringify(typescriptIndex.TERRAIN_ELEVATION_GRID_SCHEMA_VERSION),
    JSON.stringify(sourceIndex.TERRAIN_ELEVATION_GRID_SCHEMA_VERSION),
  );
  assert.deepEqual(
    codePoints(String(typescriptIndex.TERRAIN_ELEVATION_GRID_SCHEMA_VERSION)),
    codePoints(String(sourceIndex.TERRAIN_ELEVATION_GRID_SCHEMA_VERSION)),
  );
  assert.equal(typeof sourceIndex.normalizeTerrainElevationGrid, "function");
  assert.equal(typeof typescriptIndex.normalizeTerrainElevationGrid, "function");
  assert.notEqual(
    sourceIndex.normalizeTerrainElevationGrid,
    typescriptIndex.normalizeTerrainElevationGrid,
  );

  const sourceRootModule = await loadModule(sourceRoot, "src/index.js");
  const typescriptRootModule = await loadModule(path.join(repositoryRoot, "dist"), "index.js");
  for (const key of Object.keys(sourceIndex)) {
    assert.equal(sourceRootModule[key], sourceIndex[key], `source root alias: ${key}`);
    assert.equal(typescriptRootModule[key], typescriptIndex[key], `TypeScript root alias: ${key}`);
  }
});
