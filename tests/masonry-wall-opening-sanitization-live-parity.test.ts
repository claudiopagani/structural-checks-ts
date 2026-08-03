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
type RuntimeSanitizer = (input: unknown) => unknown;

interface RootRuntimeModule extends RuntimeModule {
  MasonryWallOpeningsModel: RuntimeModelConstructor;
  sanitizeAlignmentOpenings: RuntimeSanitizer;
}

function isRecord(value: unknown): value is RuntimeModule {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isRootRuntimeModule(value: unknown): value is RootRuntimeModule {
  return (
    isRecord(value) &&
    typeof value.MasonryWallOpeningsModel === "function" &&
    typeof value.sanitizeAlignmentOpenings === "function"
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

function assertExactParity(source: unknown, typescript: unknown, label: string): void {
  assert.deepEqual(typescript, source, label);
  const sourceJson = JSON.stringify(source);
  const typescriptJson = JSON.stringify(typescript);
  assert.equal(typescriptJson, sourceJson, `${label}: exact JSON`);
  assert.deepEqual([...typescriptJson], [...sourceJson], `${label}: exact Unicode`);
}

function captureError(run: () => unknown): { name: string; message: string } | null {
  try {
    run();
    return null;
  } catch (error: unknown) {
    if (!(error instanceof Error)) {
      throw new Error("The sanitization operation threw a non-Error value.", { cause: error });
    }
    return { name: error.name, message: error.message };
  }
}

function makeAlignment(moduleValue: RootRuntimeModule, options: Record<string, unknown>): unknown {
  return new moduleValue.MasonryWallOpeningsModel(options);
}

void test("masonry wall opening sanitization matches the independent pinned JavaScript implementation", async () => {
  assert.equal(gitOutput(sourceRoot, "rev-parse", "HEAD"), sourceRevision);
  assert.equal(gitOutput(sourceRoot, "status", "--porcelain"), "");
  assert.equal(gitOutput(normativeRoot, "rev-parse", "HEAD"), normativeRevision);
  assert.equal(gitOutput(normativeRoot, "status", "--porcelain"), "");

  const sourceRootModuleValue: unknown = await loadModule(sourceRoot, "src/index.js");
  const typescriptRootModuleValue: unknown = await loadModule(
    path.join(repositoryRoot, "dist"),
    "index.js",
  );
  if (
    !isRootRuntimeModule(sourceRootModuleValue) ||
    !isRootRuntimeModule(typescriptRootModuleValue)
  ) {
    throw new Error("Masonry wall opening sanitization exports do not expose the expected API.");
  }

  assert.notEqual(
    typescriptRootModuleValue.sanitizeAlignmentOpenings,
    sourceRootModuleValue.sanitizeAlignmentOpenings,
    "sanitizer independent implementation",
  );

  const fixtures: Record<string, Record<string, unknown>> = {
    border: {
      id: "alignment-border-δ",
      units: { force: "N", length: "m" },
      walls: [{ id: "wall-α", length: 5, height: 3, thickness: 0.3 }],
      openings: [
        { id: "outside", x: 6, y: 1, width: 1, height: 1 },
        { id: "border-μ", x: -0.2, y: -0.1, width: 1, height: 1.5 },
      ],
    },
    merged: {
      id: "alignment-merge",
      units: { force: "N", length: "m" },
      walls: [{ id: "wall-a", length: 5, height: 3, thickness: 0.3 }],
      openings: [
        { id: "left", x: 1, y: 0.5, width: 1, height: 0.6 },
        { id: "right", x: 1.8, y: 0.7, width: 1, height: 1 },
        { id: "stacked-top", x: 1.1, y: 1.7, width: 0.8, height: 0.5 },
      ],
    },
    joint: {
      id: "alignment-joint",
      units: { force: "N", length: "m" },
      walls: [
        { id: "wall-a", length: 2.5, height: 3, thickness: 0.3 },
        { id: "wall-b", length: 2.5, height: 3, thickness: 0.3 },
      ],
      openings: [{ id: "cross-joint", x: 2, y: 1, width: 1, height: 1 }],
    },
    residual: {
      id: "alignment-residual",
      units: { force: "N", length: "m" },
      walls: [{ id: "wall-a", length: 5, height: 3, thickness: 0.3 }],
      openings: [{ id: "near-edge", x: 0.3, y: 0.8, width: 1.2, height: 1.1 }],
      settings: { residualPierWarningThreshold: 0.5 },
    },
  };

  for (const [label, options] of Object.entries(fixtures)) {
    const sourceAlignment = makeAlignment(sourceRootModuleValue, options);
    const typescriptAlignment = makeAlignment(typescriptRootModuleValue, options);
    const sourceResult = sourceRootModuleValue.sanitizeAlignmentOpenings({
      alignment: sourceAlignment,
    });
    const typescriptResult = typescriptRootModuleValue.sanitizeAlignmentOpenings({
      alignment: typescriptAlignment,
    });
    assertExactParity(sourceResult, typescriptResult, `${label} sanitization`);
  }

  assert.deepEqual(
    captureError(() => sourceRootModuleValue.sanitizeAlignmentOpenings({ alignment: null })),
    captureError(() => typescriptRootModuleValue.sanitizeAlignmentOpenings({ alignment: null })),
    "missing alignment error",
  );
});
