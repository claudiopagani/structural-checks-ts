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

async function loadModule(root: string, relativePath: string): Promise<RuntimeModule> {
  const module: unknown = await import(pathToFileURL(path.join(root, relativePath)).href);
  if (!isRecord(module)) {
    throw new Error(`The module ${relativePath} is not an object module.`);
  }
  return module;
}

void test("masonry section index matches the independent pinned JavaScript implementation", async () => {
  assert.equal(gitOutput("rev-parse", "HEAD"), sourceRevision);
  assert.equal(gitOutput("status", "--porcelain"), "");

  const sourceIndex = await loadModule(sourceRoot, "src/domain/sections/masonry/index.js");
  const typescriptIndex = await loadModule(
    path.join(repositoryRoot, "dist"),
    "domain/sections/masonry/index.js",
  );
  assert.deepEqual(Object.keys(typescriptIndex), Object.keys(sourceIndex));

  const sourceClass = sourceIndex.MasonryFiberInterface2D;
  const typescriptClass = typescriptIndex.MasonryFiberInterface2D;
  assert.equal(typeof sourceClass, "function");
  assert.equal(typeof typescriptClass, "function");
  assert.notEqual(sourceClass, typescriptClass);

  const sourceRootModule = await loadModule(sourceRoot, "src/index.js");
  const typescriptRootModule = await loadModule(path.join(repositoryRoot, "dist"), "index.js");
  assert.equal(sourceRootModule.MasonryFiberInterface2D, sourceClass);
  assert.equal(typescriptRootModule.MasonryFiberInterface2D, typescriptClass);
});
