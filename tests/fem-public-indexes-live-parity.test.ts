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
  const sourceModule: unknown = await import(
    pathToFileURL(path.join(sourceRoot, "src", relativePath)).href
  );
  if (!isRecord(sourceModule)) {
    throw new Error(`The source module ${relativePath} is not an object module.`);
  }
  return sourceModule;
}

async function loadTypeScriptModule(relativePath: string): Promise<RuntimeModule> {
  const typescriptModule: unknown = await import(
    pathToFileURL(path.join(repositoryRoot, "dist", relativePath)).href
  );
  if (!isRecord(typescriptModule)) {
    throw new Error(`The TypeScript module ${relativePath} is not an object module.`);
  }
  return typescriptModule;
}

void test("FEM public indexes match the independent pinned JavaScript implementation", async () => {
  assertSourceBaseline();
  const paths = [
    ["domain/fem/index.js", "FEM index"],
    ["domain/fem/elements/index.js", "FEM element index"],
    ["domain/fem/elements/masonry/index.js", "FEM masonry element index"],
    ["domain/fem/nonlinear/index.js", "FEM nonlinear index"],
  ] as const;

  for (const [relativePath, label] of paths) {
    const source = await loadModule(relativePath);
    const typescript = await loadTypeScriptModule(relativePath);
    assertIndexParity(source, typescript, label);
  }

  const sourceRootModule = await loadModule("index.js");
  const typescriptRootModule = await loadTypeScriptModule("index.js");
  const sourceFem = await loadModule("domain/fem/index.js");
  const typescriptFem = await loadTypeScriptModule("domain/fem/index.js");
  const sourceElements = await loadModule("domain/fem/elements/index.js");
  const typescriptElements = await loadTypeScriptModule("domain/fem/elements/index.js");
  assert.equal(
    sourceRootModule.FrameElement2DEulerBernoulli,
    sourceFem.FrameElement2DEulerBernoulli,
  );
  assert.equal(
    typescriptRootModule.FrameElement2DEulerBernoulli,
    typescriptFem.FrameElement2DEulerBernoulli,
  );
  assert.equal(sourceFem.CyclicMasonryPier2D, sourceElements.CyclicMasonryPier2D);
  assert.equal(typescriptFem.CyclicMasonryPier2D, typescriptElements.CyclicMasonryPier2D);
});
