import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const sourceRoot = path.resolve(repositoryRoot, "..", "strutture-js");
const normativeRoot = path.resolve(repositoryRoot, "..", "strutture-normative");
const sourceRevision = "6f33baead8b88166c4b2cf94af41763412e3c751";
const normativeRevision = "41da3faa489600173106935bbcf726119300e48d";

type RuntimeRecord = Record<string, unknown>;
type ApplicationLike = {
  getManifest: () => unknown;
  run: (input?: unknown) => unknown;
};
type ApplicationConstructor = new () => ApplicationLike;

function isRecord(value: unknown): value is RuntimeRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isApplicationConstructor(value: unknown): value is ApplicationConstructor {
  return typeof value === "function";
}

function gitOutput(repository: string, ...arguments_: readonly string[]): string {
  return execFileSync("git", ["-C", repository, ...arguments_], { encoding: "utf8" }).trim();
}

async function loadModule(root: string, relativePath: string): Promise<RuntimeRecord> {
  const module: unknown = await import(pathToFileURL(path.join(root, relativePath)).href);
  if (!isRecord(module)) {
    throw new Error(`The module ${relativePath} is not an object module.`);
  }
  return module;
}

function captureError(action: () => unknown): unknown {
  try {
    return action();
  } catch (error) {
    if (!(error instanceof Error)) {
      return { value: error };
    }
    return { name: error.name, message: error.message };
  }
}

function resultJson(value: unknown): unknown {
  if (value == null) {
    return value;
  }
  const toJSON: unknown = Reflect.get(Object(value), "toJSON");
  return typeof toJSON === "function" ? Reflect.apply(toJSON, value, []) : value;
}

void test("Micropile Broms application matches the independent pinned JavaScript implementation", async () => {
  assert.equal(gitOutput(sourceRoot, "rev-parse", "HEAD"), sourceRevision);
  assert.equal(gitOutput(sourceRoot, "status", "--porcelain"), "");
  assert.equal(gitOutput(normativeRoot, "rev-parse", "HEAD"), normativeRevision);
  assert.equal(gitOutput(normativeRoot, "status", "--porcelain"), "");

  const sourceModule = await loadModule(
    sourceRoot,
    "src/applications/micropiles-broms/MicropileBromsApplication.js",
  );
  const typescriptModule = await loadModule(
    path.join(repositoryRoot, "dist"),
    "applications/micropiles-broms/MicropileBromsApplication.js",
  );
  const sourceConstructor = sourceModule.MicropileBromsApplication;
  const typescriptConstructor = typescriptModule.MicropileBromsApplication;
  if (
    !isApplicationConstructor(sourceConstructor) ||
    !isApplicationConstructor(typescriptConstructor)
  ) {
    throw new Error("Expected both modules to export MicropileBromsApplication.");
  }

  assert.notEqual(typescriptConstructor, sourceConstructor, "independent implementations");

  const sourceRootModule = await loadModule(sourceRoot, "src/index.js");
  const typescriptRootModule = await loadModule(path.join(repositoryRoot, "dist"), "index.js");
  assert.equal(sourceRootModule.MicropileBromsApplication, sourceConstructor, "source root alias");
  assert.equal(
    typescriptRootModule.MicropileBromsApplication,
    typescriptConstructor,
    "TypeScript root alias",
  );

  const sourceApplication = new sourceConstructor();
  const typescriptApplication = new typescriptConstructor();
  assert.deepEqual(
    resultJson(typescriptApplication.getManifest()),
    resultJson(sourceApplication.getManifest()),
    "exact application manifest",
  );
  assert.deepEqual(
    resultJson(typescriptApplication.run({ model: { id: "legacy-δ" } })),
    resultJson(sourceApplication.run({ model: { id: "legacy-δ" } })),
    "legacy delegated result",
  );
  assert.deepEqual(
    resultJson(typescriptApplication.run()),
    resultJson(sourceApplication.run()),
    "default delegated result",
  );
  assert.deepEqual(
    captureError(() => Reflect.apply(typescriptApplication.run, typescriptApplication, [null])),
    captureError(() => Reflect.apply(sourceApplication.run, sourceApplication, [null])),
    "null delegated error",
  );
});
