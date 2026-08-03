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
  return Array.from(value, (character) => {
    const codePoint = character.codePointAt(0);
    if (codePoint === undefined) {
      throw new Error("Expected a code point for every character.");
    }
    return codePoint;
  });
}

function assertUnicodeParity(source: unknown, typescript: unknown, label: string): void {
  if (typeof source === "string") {
    assert.equal(typeof typescript, "string", `${label}: string type`);
    if (typeof typescript !== "string") {
      throw new Error(`Expected ${label} to remain a string.`);
    }
    assert.deepEqual(codePoints(typescript), codePoints(source), `${label}: Unicode code points`);
    return;
  }

  if (Array.isArray(source)) {
    assert.ok(Array.isArray(typescript), `${label}: array type`);
    if (!Array.isArray(typescript)) {
      throw new Error(`Expected ${label} to remain an array.`);
    }
    assert.equal(typescript.length, source.length, `${label}: array length`);
    source.forEach((entry, index) => {
      assertUnicodeParity(entry, typescript[index], `${label}[${index}]`);
    });
    return;
  }

  if (isRecord(source)) {
    assert.ok(isRecord(typescript), `${label}: object type`);
    if (!isRecord(typescript)) {
      throw new Error(`Expected ${label} to remain an object.`);
    }
    for (const key of Object.keys(source)) {
      assertUnicodeParity(source[key], typescript[key], `${label}.${key}`);
    }
  }
}

function assertValueParity(source: unknown, typescript: unknown, label: string): void {
  assert.deepEqual(typescript, source, label);
  assert.equal(JSON.stringify(typescript), JSON.stringify(source), `${label}: exact JSON`);
  assertUnicodeParity(source, typescript, label);
}

function assertSourceDefinedReferenceParity(
  source: unknown,
  typescript: unknown,
  label: string,
): void {
  assert.ok(isRecord(source), `${label}: source reference catalog`);
  assert.ok(isRecord(typescript), `${label}: TypeScript reference catalog`);
  if (!isRecord(source) || !isRecord(typescript)) {
    throw new Error(`Expected ${label} to be a reference catalog.`);
  }

  for (const key of Object.keys(source)) {
    assertValueParity(source[key], typescript[key], `${label}.${key}`);
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

void test("NTC 2018 public index matches the independent pinned JavaScript implementation", async () => {
  assert.equal(gitOutput(sourceRoot, "rev-parse", "HEAD"), sourceRevision);
  assert.equal(gitOutput(sourceRoot, "status", "--porcelain"), "");
  assert.equal(gitOutput(normativeRoot, "rev-parse", "HEAD"), normativeRevision);
  assert.equal(gitOutput(normativeRoot, "status", "--porcelain"), "");

  const sourceIndex = await loadModule(sourceRoot, "src/norms/ntc2018/index.js");
  const typescriptIndex = await loadModule(
    path.join(repositoryRoot, "dist"),
    "norms/ntc2018/index.js",
  );
  const packageIndex = (await import(
    "structural-checks-ts-migration-workspace/norms/ntc2018"
  )) as RuntimeModule;
  const sourceKeys = Object.keys(sourceIndex);
  assert.deepEqual(Object.keys(typescriptIndex), sourceKeys, "exact NTC 2018 export order");
  assert.deepEqual(Object.keys(packageIndex), sourceKeys, "package subpath export order");

  for (const key of sourceKeys) {
    const sourceValue = sourceIndex[key];
    const typescriptValue = typescriptIndex[key];
    const packageValue = packageIndex[key];
    if (typeof sourceValue === "function") {
      assert.equal(typeof typescriptValue, "function", `${key}: function export`);
      assert.equal(typeof packageValue, "function", `${key}: package function export`);
      assert.notEqual(sourceValue, typescriptValue, `${key}: independent implementation`);
    } else if (
      key === "NTC2018_RC_CHAPTER_4_REFERENCES" ||
      key === "NTC2018_RC_OUTSIDE_CORPUS_REFERENCES"
    ) {
      assertSourceDefinedReferenceParity(sourceValue, typescriptValue, key);
      assertSourceDefinedReferenceParity(sourceValue, packageValue, `${key}: package subpath`);
    } else {
      assertValueParity(sourceValue, typescriptValue, key);
      assertValueParity(sourceValue, packageValue, `${key}: package subpath`);
    }
  }

  const sourceRootModule = await loadModule(sourceRoot, "src/index.js");
  const typescriptRoot = await loadModule(path.join(repositoryRoot, "dist"), "index.js");
  for (const key of [
    "NTC2018_CONCRETE_CLASSES",
    "NTC2018_TIMBER_KMOD",
    "createNTC2018TimberMaterial",
    "calculateNTC2018HorizontalElasticSpectrum",
    "evaluateNTC2018MasonryPier",
  ]) {
    assert.equal(sourceRootModule[key], sourceIndex[key], `source root alias: ${key}`);
    assert.equal(typescriptRoot[key], typescriptIndex[key], `TypeScript root alias: ${key}`);
  }

  const options = {
    strengthClass: "GL24h",
    id: "NTC-INDEX-Ø",
    name: "Legno Δ — indice NTC",
    units: { force: "N", length: "mm" },
    metadata: { note: "Unicode ✓" },
  };
  assert.equal(
    JSON.stringify(call(sourceIndex, "createNTC2018TimberMaterial", options)),
    JSON.stringify(call(typescriptIndex, "createNTC2018TimberMaterial", options)),
  );

  const kmodArguments = { serviceClass: 2, loadDurationClass: "medium" };
  assert.equal(
    JSON.stringify(call(sourceIndex, "getNTC2018TimberKmod", kmodArguments)),
    JSON.stringify(call(typescriptIndex, "getNTC2018TimberKmod", kmodArguments)),
  );

  const factoryErrors = [
    { strengthClass: "GL24h" },
    { strengthClass: "NOT-A-CLASS", units: { force: "N", length: "mm" } },
  ];
  for (const factoryOptions of factoryErrors) {
    assert.deepEqual(
      errorSignature(() => call(sourceIndex, "createNTC2018TimberMaterial", factoryOptions)),
      errorSignature(() => call(typescriptIndex, "createNTC2018TimberMaterial", factoryOptions)),
    );
  }
});
