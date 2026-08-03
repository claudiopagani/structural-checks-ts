import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";
import path from "node:path";
import { pathToFileURL } from "node:url";

const sourceRevision = "6f33baead8b88166c4b2cf94af41763412e3c751";
const normativeRevision = "41da3faa489600173106935bbcf726119300e48d";
const repositoryRoot = path.resolve(import.meta.dirname, "..");
const sourceRoot = path.resolve(repositoryRoot, "..", "strutture-js");
const normativeRoot = path.resolve(repositoryRoot, "..", "strutture-normative");

type RuntimeModule = Record<string, unknown>;
type UnknownCallable = (this: unknown, ...arguments_: unknown[]) => unknown;

function isRecord(value: unknown): value is RuntimeModule {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isUnknownCallable(value: unknown): value is UnknownCallable {
  return typeof value === "function";
}

function gitOutput(repository: string, ...arguments_: readonly string[]): string {
  return execFileSync("git", ["-C", repository, ...arguments_], { encoding: "utf8" }).trim();
}

function codePoints(value: string): number[] {
  return Array.from(value, (character) => character.codePointAt(0) ?? -1);
}

function assertValueParity(source: unknown, typescript: unknown, label: string): void {
  assert.deepEqual(typescript, source, label);
  assert.equal(JSON.stringify(typescript), JSON.stringify(source), `${label}: exact JSON`);
  if (typeof source === "string") {
    assert.equal(typeof typescript, "string", `${label}: string type`);
    if (typeof typescript !== "string") {
      throw new Error(`Expected ${label} to remain a string.`);
    }
    assert.deepEqual(codePoints(typescript), codePoints(source), `${label}: Unicode code points`);
  }
}

function call(module: RuntimeModule, name: string, ...arguments_: unknown[]): unknown {
  const candidate = module[name];
  if (!isUnknownCallable(candidate)) {
    throw new Error(`${name} must be callable.`);
  }
  return candidate.call(undefined, ...arguments_);
}

function errorSignature(callback: () => unknown): { name: string; message: string } {
  try {
    callback();
  } catch (error) {
    assert.ok(error instanceof Error);
    return { name: error.name, message: error.message };
  }
  throw new Error("Expected the callback to throw.");
}

async function loadModule(root: string, relativePath: string): Promise<RuntimeModule> {
  const module: unknown = await import(pathToFileURL(path.join(root, relativePath)).href);
  if (!isRecord(module)) {
    throw new Error(`The module ${relativePath} is not an object module.`);
  }
  return module;
}

void test("NTC 2018 masonry public index matches the independent pinned JavaScript implementation", async () => {
  assert.equal(gitOutput(sourceRoot, "rev-parse", "HEAD"), sourceRevision);
  assert.equal(gitOutput(sourceRoot, "status", "--porcelain"), "");
  assert.equal(gitOutput(normativeRoot, "rev-parse", "HEAD"), normativeRevision);
  assert.equal(gitOutput(normativeRoot, "status", "--porcelain"), "");

  const sourceIndex = await loadModule(sourceRoot, "src/norms/ntc2018/masonry/index.js");
  const typescriptIndex = await loadModule(
    path.join(repositoryRoot, "dist"),
    "norms/ntc2018/masonry/index.js",
  );
  const sourceRootModule = await loadModule(sourceRoot, "src/index.js");
  const typescriptRootModule = await loadModule(path.join(repositoryRoot, "dist"), "index.js");
  const sourceKeys = Object.keys(sourceIndex);

  assert.deepEqual(Object.keys(typescriptIndex), sourceKeys, "exact masonry index export order");
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

  for (const key of [
    "NTC2018_MASONRY_PIER_CAPACITY_REFERENCES",
    "NTC2018_MASONRY_PIER_DEFORMATION_REFERENCES",
    "NTC2018_MASONRY_PIER_STIFFNESS_REFERENCE",
    "evaluateNTC2018MasonryPier",
  ]) {
    assert.equal(sourceRootModule[key], sourceIndex[key], `source root alias: ${key}`);
    assert.equal(typescriptRootModule[key], typescriptIndex[key], `TypeScript root alias: ${key}`);
  }

  const flexuralOptions = {
    axialCompression: 300,
    compressiveStrength: 4,
    length: 1.5,
    thickness: 0.3,
    shearSpan: 3,
  };
  assert.equal(
    JSON.stringify(
      call(sourceIndex, "calculateNTC2018MasonryPierFlexuralCapacity", flexuralOptions),
    ),
    JSON.stringify(
      call(typescriptIndex, "calculateNTC2018MasonryPierFlexuralCapacity", flexuralOptions),
    ),
  );

  const errorCases: Array<[string, unknown]> = [
    ["calculateNTC2018MasonryPierFlexuralCapacity", { length: 0 }],
    ["calculateNTC2018MasonryPierUltimateDisplacement", { height: 3000, mechanism: "unknown" }],
    ["calculateNTC2018MasonryPierElasticStiffness", { boundaryCondition: "unsupported" }],
  ];
  for (const [name, options] of errorCases) {
    assert.deepEqual(
      errorSignature(() => call(sourceIndex, name, options)),
      errorSignature(() => call(typescriptIndex, name, options)),
    );
  }
});
