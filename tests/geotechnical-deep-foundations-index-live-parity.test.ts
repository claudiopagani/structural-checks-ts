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
type ApplicationConstructor = new () => unknown;
type ApplicationInstance = { getManifest(): unknown };

function isRecord(value: unknown): value is RuntimeModule {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isApplicationConstructor(value: unknown): value is ApplicationConstructor {
  return typeof value === "function";
}

function isApplicationInstance(value: unknown): value is ApplicationInstance {
  return isRecord(value) && typeof value.getManifest === "function";
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

async function loadModule(root: string, relativePath: string): Promise<RuntimeModule> {
  const module: unknown = await import(pathToFileURL(path.join(root, relativePath)).href);
  if (!isRecord(module)) {
    throw new Error(`The module ${relativePath} is not an object module.`);
  }
  return module;
}

void test("geotechnical deep-foundation index matches the independent pinned JavaScript implementation", async () => {
  assert.equal(gitOutput(sourceRoot, "rev-parse", "HEAD"), sourceRevision);
  assert.equal(gitOutput(sourceRoot, "status", "--porcelain"), "");
  assert.equal(gitOutput(normativeRoot, "rev-parse", "HEAD"), normativeRevision);
  assert.equal(gitOutput(normativeRoot, "status", "--porcelain"), "");

  const sourceIndex = await loadModule(
    sourceRoot,
    "src/applications/geotechnical-deep-foundations/index.js",
  );
  const typescriptIndex = await loadModule(
    path.join(repositoryRoot, "dist"),
    "applications/geotechnical-deep-foundations/index.js",
  );
  const sourceRootModule = await loadModule(sourceRoot, "src/index.js");
  const typescriptRootModule = await loadModule(path.join(repositoryRoot, "dist"), "index.js");
  const sourceKeys = Object.keys(sourceIndex);

  assert.deepEqual(
    Object.keys(typescriptIndex),
    sourceKeys,
    "exact geotechnical deep-foundation index export order",
  );
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

  for (const key of sourceKeys) {
    assert.equal(sourceRootModule[key], sourceIndex[key], `source root alias: ${key}`);
    assert.equal(typescriptRootModule[key], typescriptIndex[key], `TypeScript root alias: ${key}`);
  }

  if (!isApplicationConstructor(sourceIndex.GeotechnicalDeepFoundationApplication)) {
    throw new Error("Expected the source application export to be constructable.");
  }
  if (!isApplicationConstructor(typescriptIndex.GeotechnicalDeepFoundationApplication)) {
    throw new Error("Expected the TypeScript application export to be constructable.");
  }
  const sourceApplication = new sourceIndex.GeotechnicalDeepFoundationApplication();
  const typescriptApplication = new typescriptIndex.GeotechnicalDeepFoundationApplication();
  if (!isApplicationInstance(sourceApplication) || !isApplicationInstance(typescriptApplication)) {
    throw new Error("Expected both application exports to expose getManifest().");
  }
  assertValueParity(
    sourceApplication.getManifest(),
    typescriptApplication.getManifest(),
    "application manifest",
  );
});
