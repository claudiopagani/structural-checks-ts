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
type FootingApplication = {
  getManifest(): unknown;
  run(input?: unknown): unknown;
};
type FootingConstructor = new () => FootingApplication;
type ErrorRecord = { name: string; message: string };

function isRecord(value: unknown): value is RuntimeModule {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isFootingConstructor(value: unknown): value is FootingConstructor {
  return typeof value === "function";
}

function gitOutput(repository: string, ...arguments_: readonly string[]): string {
  return execFileSync("git", ["-C", repository, ...arguments_], { encoding: "utf8" }).trim();
}

function errorRecord(error: unknown): ErrorRecord {
  if (!isRecord(error) || typeof error.name !== "string" || typeof error.message !== "string") {
    throw new Error("Expected an Error-like record.");
  }
  return { name: error.name, message: error.message };
}

function captureError(action: () => unknown): ErrorRecord {
  try {
    action();
  } catch (error) {
    return errorRecord(error);
  }
  throw new Error("Expected the action to throw.");
}

function assertExactParity(source: unknown, typescript: unknown, label: string): void {
  assert.deepEqual(typescript, source, label);
  assert.equal(JSON.stringify(typescript), JSON.stringify(source), `${label}: exact JSON`);
}

async function loadModule(root: string, relativePath: string): Promise<RuntimeModule> {
  const module: unknown = await import(pathToFileURL(path.join(root, relativePath)).href);
  if (!isRecord(module)) {
    throw new Error(`The module ${relativePath} is not an object module.`);
  }
  return module;
}

void test("RC isolated-footing index matches the independent pinned JavaScript barrel", async () => {
  assert.equal(gitOutput(sourceRoot, "rev-parse", "HEAD"), sourceRevision);
  assert.equal(gitOutput(sourceRoot, "status", "--porcelain"), "");
  assert.equal(gitOutput(normativeRoot, "rev-parse", "HEAD"), normativeRevision);
  assert.equal(gitOutput(normativeRoot, "status", "--porcelain"), "");

  const sourceRootModule = await loadModule(sourceRoot, "src/index.js");
  const typescriptRootModule = await loadModule(path.join(repositoryRoot, "dist"), "index.js");
  const sourceModule = await loadModule(
    sourceRoot,
    "src/applications/reinforced-concrete-isolated-footings/index.js",
  );
  const typescriptModule = await loadModule(
    path.join(repositoryRoot, "dist"),
    "applications/reinforced-concrete-isolated-footings/index.js",
  );

  assert.deepEqual(Object.keys(typescriptModule), Object.keys(sourceModule));
  for (const name of [
    "ReinforcedConcreteIsolatedFootingApplication",
    "ReinforcedConcreteIsolatedFootingModel",
    "ReinforcedConcreteIsolatedFootingVerification",
  ]) {
    const sourceExport = sourceModule[name];
    const typescriptExport = typescriptModule[name];
    assert.equal(typeof sourceExport, "function", `${name} source export`);
    assert.equal(typeof typescriptExport, "function", `${name} TypeScript export`);
    assert.notEqual(sourceExport, typescriptExport, `${name} independent implementations`);
    assert.equal(sourceRootModule[name], sourceExport, `${name} source root alias`);
    assert.equal(typescriptRootModule[name], typescriptExport, `${name} TypeScript root alias`);
  }

  const sourceApplicationExport = sourceModule.ReinforcedConcreteIsolatedFootingApplication;
  const typescriptApplicationExport = typescriptModule.ReinforcedConcreteIsolatedFootingApplication;
  if (!isFootingConstructor(sourceApplicationExport)) {
    throw new Error("Expected the source application export to be constructable.");
  }
  if (!isFootingConstructor(typescriptApplicationExport)) {
    throw new Error("Expected the TypeScript application export to be constructable.");
  }

  const sourceApplication = new sourceApplicationExport();
  const typescriptApplication = new typescriptApplicationExport();
  assertExactParity(
    sourceApplication.getManifest(),
    typescriptApplication.getManifest(),
    "application manifest",
  );
  assertExactParity(
    captureError(() => sourceApplication.run({})),
    captureError(() => typescriptApplication.run({})),
    "missing model error",
  );
});
