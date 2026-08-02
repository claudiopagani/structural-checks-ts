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

function assertIndexParity(source: RuntimeModule, typescript: RuntimeModule, label: string): void {
  const sourceKeys = Object.keys(source);
  const typescriptKeys = Object.keys(typescript);
  assert.deepEqual(typescriptKeys, sourceKeys, `${label}: exact export order`);

  for (const key of sourceKeys) {
    const sourceValue = source[key];
    const typescriptValue = typescript[key];
    if (typeof sourceValue === "function") {
      assert.equal(typeof typescriptValue, "function", `${label}.${key}: function export`);
      assert.notEqual(sourceValue, typescriptValue, `${label}.${key}: independent implementation`);
    } else {
      assertValueParity(sourceValue, typescriptValue, `${label}.${key}`);
    }
  }
}

async function loadModule(relativePath: string): Promise<RuntimeModule> {
  const module: unknown = await import(
    pathToFileURL(path.join(sourceRoot, "src", relativePath)).href
  );
  if (!isRecord(module)) {
    throw new Error(`The source module ${relativePath} is not an object module.`);
  }
  return module;
}

async function loadTypeScriptModule(relativePath: string): Promise<RuntimeModule> {
  const module: unknown = await import(
    pathToFileURL(path.join(repositoryRoot, "dist", relativePath)).href
  );
  if (!isRecord(module)) {
    throw new Error(`The TypeScript module ${relativePath} is not an object module.`);
  }
  return module;
}

void test("masonry material indexes match the independent pinned JavaScript implementation", async () => {
  assertSourceBaseline();

  const sourceMasonry = await loadModule("domain/materials/masonry/index.js");
  const typescriptMasonry = await loadTypeScriptModule("domain/materials/masonry/index.js");
  assertIndexParity(sourceMasonry, typescriptMasonry, "masonry material index");

  const sourceRootModule = await loadModule("index.js");
  const typescriptRootModule = await loadTypeScriptModule("index.js");

  for (const key of Object.keys(sourceMasonry)) {
    assert.equal(sourceRootModule[key], sourceMasonry[key], `source root alias: ${key}`);
    assert.equal(
      typescriptRootModule[key],
      typescriptMasonry[key],
      `TypeScript root alias: ${key}`,
    );
  }
});
