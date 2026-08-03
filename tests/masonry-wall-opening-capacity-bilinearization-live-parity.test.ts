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
type RuntimeBilinearizer = (input?: unknown) => unknown;

interface RootRuntimeModule extends RuntimeModule {
  bilinearizeCapacityCurve: RuntimeBilinearizer;
}

function isRecord(value: unknown): value is RuntimeModule {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isRootRuntimeModule(value: unknown): value is RootRuntimeModule {
  return isRecord(value) && typeof value.bilinearizeCapacityCurve === "function";
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
      throw new Error("The bilinearization operation threw a non-Error value.", { cause: error });
    }
    return { name: error.name, message: error.message };
  }
}

void test("capacity-curve bilinearization matches the independent pinned JavaScript implementation", async () => {
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
    throw new Error("Capacity-curve bilinearization exports do not expose the expected API.");
  }

  assert.notEqual(
    sourceModuleValue.bilinearizeCapacityCurve,
    typescriptModuleValue.bilinearizeCapacityCurve,
    "bilinearizer independent implementation",
  );

  const fixtures: Record<string, unknown> = {
    normalCurve: {
      points: [
        { id: "peak-μ", displacement: 0.02, baseShear: 150 },
        { id: "origin-α", displacement: 0, baseShear: 0 },
        { id: "yield-δ", displacement: 0.01, baseShear: 100 },
        { id: "ultimate-β", displacement: 0.04, baseShear: 100 },
      ],
    },
    aliasesAndDropRatio: {
      points: [
        { id: "p1", controlDisplacement: 0, force: 0 },
        { id: "p2", controlDisplacement: 0.01, force: 100 },
        { id: "p3", controlDisplacement: 0.02, force: 150 },
        { id: "p4", controlDisplacement: 0.04, force: 120 },
      ],
      options: { dropRatio: 0.1 },
    },
    curveDefaultPoints: {
      curve: {
        points: [
          { id: "curve-1", displacement: 0, baseShear: 0 },
          { id: "curve-2", displacement: 0.02, baseShear: 10 },
        ],
      },
    },
    insufficientPoints: {
      points: [
        { id: "only-μ", displacement: 0, baseShear: 0 },
        { id: "invalid", displacement: Number.NaN, baseShear: 10 },
      ],
    },
    noTwentyPercentDrop: {
      points: [
        { id: "start", displacement: 0, baseShear: 0 },
        { id: "peak", displacement: 0.01, baseShear: 100 },
        { id: "plateau", displacement: 0.03, baseShear: 95 },
      ],
    },
  };

  for (const [label, input] of Object.entries(fixtures)) {
    const sourceResult = sourceModuleValue.bilinearizeCapacityCurve(input);
    const typescriptResult = typescriptModuleValue.bilinearizeCapacityCurve(input);
    assertExactParity(sourceResult, typescriptResult, `${label} bilinearization`);
  }

  const invalidInput = { points: null };
  assert.deepEqual(
    captureError(() => sourceModuleValue.bilinearizeCapacityCurve(invalidInput)),
    captureError(() => typescriptModuleValue.bilinearizeCapacityCurve(invalidInput)),
    "explicit null points error",
  );
});
