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

function assertValueParity(source: unknown, typescript: unknown, label: string): void {
  assert.deepEqual(typescript, source, label);
  assert.equal(JSON.stringify(typescript), JSON.stringify(source), `${label}: exact JSON`);
  if (typeof source === "string") {
    assert.equal(typeof typescript, "string", label);
    if (typeof typescript !== "string") {
      throw new Error("Expected the TypeScript export to be a string.");
    }
    assert.deepEqual(codePoints(typescript), codePoints(source), `${label}: Unicode code points`);
  }
}

async function loadModule(root: string, relativePath: string): Promise<RuntimeModule> {
  const module: unknown = await import(pathToFileURL(path.join(root, relativePath)).href);
  if (!isRecord(module)) {
    throw new Error(`The module ${relativePath} is not an object module.`);
  }
  return module;
}

void test("slab public indexes match the independent pinned JavaScript implementation", async () => {
  assert.equal(gitOutput("rev-parse", "HEAD"), sourceRevision);
  assert.equal(gitOutput("status", "--porcelain"), "");

  const sourceIndex = await loadModule(sourceRoot, "src/domain/slabs/index.js");
  const typescriptIndex = await loadModule(
    path.join(repositoryRoot, "dist"),
    "domain/slabs/index.js",
  );
  const sourceKeys = Object.keys(sourceIndex);
  assert.deepEqual(Object.keys(typescriptIndex), sourceKeys, "exact slab export order");

  for (const key of sourceKeys) {
    const sourceValue = sourceIndex[key];
    const typescriptValue = typescriptIndex[key];
    if (typeof sourceValue === "function") {
      assert.equal(typeof typescriptValue, "function", `${key}: function export`);
      assert.notEqual(sourceValue, typescriptValue, `${key}: independent implementation`);
    } else {
      assertValueParity(sourceValue, typescriptValue, key);
    }
  }

  const sourceRootModule = await loadModule(sourceRoot, "src/index.js");
  const typescriptRootModule = await loadModule(path.join(repositoryRoot, "dist"), "index.js");
  for (const key of sourceKeys) {
    assert.equal(sourceRootModule[key], sourceIndex[key], `source root alias: ${key}`);
    assert.equal(typescriptRootModule[key], typescriptIndex[key], `TypeScript root alias: ${key}`);
  }
});
