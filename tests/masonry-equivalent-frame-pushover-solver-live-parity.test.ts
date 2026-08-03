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
type RuntimeSolverConstructor = new (options?: unknown) => unknown;

interface RuntimeSolverModule extends RuntimeModule {
  MasonryEquivalentFramePushoverSolver2D: RuntimeSolverConstructor;
}

interface RuntimeSolver extends RuntimeModule {
  solve: (input?: unknown) => unknown;
}

function isRecord(value: unknown): value is RuntimeModule {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isRuntimeModule(value: unknown): value is RuntimeSolverModule {
  return isRecord(value) && typeof value.MasonryEquivalentFramePushoverSolver2D === "function";
}

function isRuntimeSolver(value: unknown): value is RuntimeSolver {
  return isRecord(value) && typeof value.solve === "function";
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
      throw new Error("The pushover solver operation threw a non-Error value.", { cause: error });
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

function createCustomSolver(): RuntimeModule {
  return {
    solve(input: unknown) {
      const record = isRecord(input) ? input : {};
      return {
        events: [{ type: "custom-solver-event", label: "cerchiatura-μ" }],
        finalState: { "element-α": { failed: false } },
        hasModelProperty: Object.prototype.hasOwnProperty.call(record, "model"),
        evaluatorType: typeof record.evaluator,
        evaluationOptions: record.evaluationOptions,
      };
    },
  };
}

void test("equivalent-frame pushover solver matches the independent pinned JavaScript implementation", async () => {
  assert.equal(gitOutput(sourceRoot, "rev-parse", "HEAD"), sourceRevision);
  assert.equal(gitOutput(sourceRoot, "status", "--porcelain"), "");
  assert.equal(gitOutput(normativeRoot, "rev-parse", "HEAD"), normativeRevision);
  assert.equal(gitOutput(normativeRoot, "status", "--porcelain"), "");

  const sourceModuleValue: unknown = await loadModule(
    sourceRoot,
    "src/applications/masonry-wall-openings/analysis/MasonryEquivalentFramePushoverSolver2D.js",
  );
  const typescriptModuleValue: unknown = await loadModule(
    path.join(repositoryRoot, "dist"),
    "applications/masonry-wall-openings/analysis/MasonryEquivalentFramePushoverSolver2D.js",
  );
  if (!isRuntimeModule(sourceModuleValue) || !isRuntimeModule(typescriptModuleValue)) {
    throw new Error("Pushover solver module does not expose the expected API.");
  }

  assert.notEqual(
    sourceModuleValue.MasonryEquivalentFramePushoverSolver2D,
    typescriptModuleValue.MasonryEquivalentFramePushoverSolver2D,
    "pushover solver independent implementation",
  );

  const sourceSolver = new sourceModuleValue.MasonryEquivalentFramePushoverSolver2D({
    nonlinearSolver: createCustomSolver(),
  });
  const typescriptSolver = new typescriptModuleValue.MasonryEquivalentFramePushoverSolver2D({
    nonlinearSolver: createCustomSolver(),
  });
  if (!isRuntimeSolver(sourceSolver) || !isRuntimeSolver(typescriptSolver)) {
    throw new Error("Pushover solver instances do not expose solve().");
  }

  assertExactParity(
    sourceSolver.solve({
      frame: { id: "frame-μ" },
      contributorsByElementId: {},
      controlDisplacementIncrement: 0.001,
      maxControlDisplacement: 0.01,
      yieldTolerance: 1e-8,
    }),
    typescriptSolver.solve({
      frame: { id: "frame-μ" },
      contributorsByElementId: {},
      controlDisplacementIncrement: 0.001,
      maxControlDisplacement: 0.01,
      yieldTolerance: 1e-8,
    }),
    "custom solver delegation",
  );

  const sourceDefaultSolver = new sourceModuleValue.MasonryEquivalentFramePushoverSolver2D();
  const typescriptDefaultSolver =
    new typescriptModuleValue.MasonryEquivalentFramePushoverSolver2D();
  if (!isRuntimeSolver(sourceDefaultSolver) || !isRuntimeSolver(typescriptDefaultSolver)) {
    throw new Error("Default pushover solver instances do not expose solve().");
  }
  assert.deepEqual(
    captureError(() => sourceDefaultSolver.solve({})),
    captureError(() => typescriptDefaultSolver.solve({})),
    "default solver validation error",
  );
});
