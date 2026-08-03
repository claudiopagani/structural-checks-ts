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
type RuntimeModelConstructor = new (input: unknown) => unknown;

interface RootRuntimeModule extends RuntimeModule {
  MasonryRingBeamModel: RuntimeModelConstructor;
}

function isRecord(value: unknown): value is RuntimeModule {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isRootRuntimeModule(value: unknown): value is RootRuntimeModule {
  return isRecord(value) && typeof value.MasonryRingBeamModel === "function";
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

function assertExactParity(source: unknown, typescript: unknown, label: string): void {
  assert.deepEqual(typescript, source, label);
  const sourceJson = JSON.stringify(source);
  const typescriptJson = JSON.stringify(typescript);
  assert.equal(typescriptJson, sourceJson, `${label}: exact JSON`);
  assert.deepEqual([...typescriptJson], [...sourceJson], `${label}: exact Unicode`);
}

function modelState(value: unknown): unknown {
  if (!isRecord(value)) {
    throw new Error("The ring beam model is not an object.");
  }
  return { ...value };
}

function captureError(run: () => unknown): { name: string; message: string } | null {
  try {
    run();
    return null;
  } catch (error: unknown) {
    if (!(error instanceof Error)) {
      throw new Error("The ring beam model operation threw a non-Error value.", { cause: error });
    }
    return { name: error.name, message: error.message };
  }
}

void test("masonry ring beam model matches the independent pinned JavaScript implementation", async () => {
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
    throw new Error("Masonry ring beam model exports do not expose the expected API.");
  }

  assert.notEqual(
    sourceModuleValue.MasonryRingBeamModel,
    typescriptModuleValue.MasonryRingBeamModel,
    "ring beam model independent implementation",
  );

  const fixtures: Record<string, Record<string, unknown>> = {
    complete: {
      id: "cerchiatura-μ",
      opening: { width: 1.2, height: 2.1 },
      wall: { id: "wall-α", thickness: 0.3 },
      reinforcementScheme: { bars: "4Ø12", stirrups: "Ø8/150" },
      loadPath: { upper: "wall-α", supports: ["left", "right"] },
      metadata: { label: "cerchiatura — completa", source: "catalogo" },
    },
    defaults: { id: "ring-beam-defaults" },
    explicitNulls: {
      id: "ring-beam-null",
      opening: null,
      wall: null,
      reinforcementScheme: null,
      loadPath: {},
      metadata: {},
    },
  };

  for (const [label, input] of Object.entries(fixtures)) {
    const sourceModel = new sourceModuleValue.MasonryRingBeamModel(input);
    const typescriptModel = new typescriptModuleValue.MasonryRingBeamModel(input);
    assertExactParity(modelState(sourceModel), modelState(typescriptModel), `${label} model`);
  }

  assert.deepEqual(
    captureError(() => new sourceModuleValue.MasonryRingBeamModel({})),
    captureError(() => new typescriptModuleValue.MasonryRingBeamModel({})),
    "missing id error",
  );
});
