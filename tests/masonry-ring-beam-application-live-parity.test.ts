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

type RuntimeModule = Record<string, unknown>;
type RuntimeApplicationConstructor = new () => unknown;

interface RootRuntimeModule extends RuntimeModule {
  MasonryRingBeamApplication: RuntimeApplicationConstructor;
  StructuralApplication: RuntimeApplicationConstructor;
}

interface RuntimeApplication extends RuntimeModule {
  getManifest: () => unknown;
  run: (input?: unknown) => unknown;
}

interface RuntimeResult {
  toJSON: () => unknown;
}

function isRecord(value: unknown): value is RuntimeModule {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isRootRuntimeModule(value: unknown): value is RootRuntimeModule {
  return (
    isRecord(value) &&
    typeof value.MasonryRingBeamApplication === "function" &&
    typeof value.StructuralApplication === "function"
  );
}

function isRuntimeApplication(value: unknown): value is RuntimeApplication {
  return (
    isRecord(value) && typeof value.getManifest === "function" && typeof value.run === "function"
  );
}

function isRuntimeResult(value: unknown): value is RuntimeResult {
  return (
    value !== null &&
    (typeof value === "object" || typeof value === "function") &&
    "toJSON" in value &&
    typeof value.toJSON === "function"
  );
}

function gitOutput(repository: string, ...arguments_: readonly string[]): string {
  return execFileSync("git", ["-C", repository, ...arguments_], { encoding: "utf8" }).trim();
}

async function loadModule(root: string, relativePath: string): Promise<RuntimeModule> {
  const module: unknown = await import(pathToFileURL(path.join(root, relativePath)).href);
  if (!isRecord(module)) {
    throw new Error(`The module ${relativePath} is not an object module.`);
  }
  return module;
}

function captureError(run: () => unknown): { name: string; message: string } | null {
  try {
    run();
    return null;
  } catch (error: unknown) {
    if (!(error instanceof Error)) {
      throw new Error("The application operation threw a non-Error value.", { cause: error });
    }
    return { name: error.name, message: error.message };
  }
}

function assertExactParity(source: unknown, typescript: unknown, label: string): void {
  assert.deepEqual(typescript, source, label);
  const sourceJson = JSON.stringify(source);
  const typescriptJson = JSON.stringify(typescript);
  assert.equal(typescriptJson, sourceJson, `${label}: exact JSON`);
  assert.deepEqual([...typescriptJson], [...sourceJson], `${label}: exact Unicode`);
}

void test("masonry ring beam application matches the independent pinned JavaScript implementation", async () => {
  assert.equal(gitOutput(sourceRoot, "rev-parse", "HEAD"), sourceRevision);
  assert.equal(gitOutput(sourceRoot, "status", "--porcelain"), "");
  assert.equal(gitOutput(normativeRoot, "rev-parse", "HEAD"), normativeRevision);
  assert.equal(gitOutput(normativeRoot, "status", "--porcelain"), "");

  const sourceModuleValue: unknown = await loadModule(sourceRoot, "src/index.js");
  const typescriptModuleValue: unknown = await loadModule(
    path.join(repositoryRoot, "dist"),
    "index.js",
  );
  if (!isRootRuntimeModule(sourceModuleValue) || !isRootRuntimeModule(typescriptModuleValue)) {
    throw new Error("Masonry ring beam application exports do not expose the expected API.");
  }

  assert.notEqual(
    sourceModuleValue.MasonryRingBeamApplication,
    typescriptModuleValue.MasonryRingBeamApplication,
    "ring beam application independent implementation",
  );

  const sourceApplication = new sourceModuleValue.MasonryRingBeamApplication();
  const typescriptApplication = new typescriptModuleValue.MasonryRingBeamApplication();
  if (!isRuntimeApplication(sourceApplication) || !isRuntimeApplication(typescriptApplication)) {
    throw new Error("Ring beam application instances do not expose the expected API.");
  }

  const sourceStructuralApplication = sourceModuleValue.StructuralApplication;
  const typescriptStructuralApplication = typescriptModuleValue.StructuralApplication;
  assert.equal(
    sourceApplication instanceof sourceStructuralApplication,
    true,
    "source inheritance",
  );
  assert.equal(
    typescriptApplication instanceof typescriptStructuralApplication,
    true,
    "TypeScript inheritance",
  );

  assertExactParity(
    sourceApplication.getManifest(),
    typescriptApplication.getManifest(),
    "application manifest",
  );

  const fixtures: Record<string, unknown> = {
    defaults: undefined,
    explicit: {
      code: "Circolare 2019",
      model: {
        id: "cerchiatura-μ",
        opening: { id: "opening-α" },
        metadata: { label: "cerchiatura — completa" },
      },
    },
    explicitNulls: { code: null, model: null },
    missingModel: { code: "NTC2018" },
  };

  for (const [label, input] of Object.entries(fixtures)) {
    const sourceResult = sourceApplication.run(input);
    const typescriptResult = typescriptApplication.run(input);
    if (!isRuntimeResult(sourceResult) || !isRuntimeResult(typescriptResult)) {
      throw new Error("Ring beam application results do not expose toJSON().");
    }
    assertExactParity(sourceResult.toJSON(), typescriptResult.toJSON(), `${label} result`);
  }

  assert.deepEqual(
    captureError(() => sourceApplication.run(null)),
    captureError(() => typescriptApplication.run(null)),
    "null input error",
  );
});
