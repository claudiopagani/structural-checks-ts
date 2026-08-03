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
type RuntimeSanitizer = (input: unknown) => { openings: readonly unknown[] };
type RuntimeExtractor = (input?: unknown) => unknown;

interface RootRuntimeModule extends RuntimeModule {
  MasonryWallOpeningsModel: RuntimeModelConstructor;
  sanitizeAlignmentOpenings: RuntimeSanitizer;
  extractEquivalentFrameMembers: RuntimeExtractor;
}

function isRecord(value: unknown): value is RuntimeModule {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isRootRuntimeModule(value: unknown): value is RootRuntimeModule {
  return (
    isRecord(value) &&
    typeof value.MasonryWallOpeningsModel === "function" &&
    typeof value.sanitizeAlignmentOpenings === "function" &&
    typeof value.extractEquivalentFrameMembers === "function"
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
      throw new Error("The extraction operation threw a non-Error value.", { cause: error });
    }
    return { name: error.name, message: error.message };
  }
}

function extractionState(value: unknown): unknown {
  if (!isRecord(value)) {
    throw new Error("The extraction result is not an object.");
  }
  const hasToJSON = (candidate: unknown): candidate is { toJSON: () => unknown } =>
    ((typeof candidate === "object" && candidate !== null) || typeof candidate === "function") &&
    "toJSON" in candidate &&
    typeof candidate.toJSON === "function";
  const modelState = (model: unknown): unknown => {
    if (!hasToJSON(model)) {
      throw new Error("The extraction result contains an invalid model.");
    }
    return model.toJSON();
  };
  return {
    piers: Array.isArray(value.piers) ? value.piers.map(modelState) : value.piers,
    spandrels: Array.isArray(value.spandrels) ? value.spandrels.map(modelState) : value.spandrels,
    warnings: value.warnings,
    assumptions: value.assumptions,
    metadata: value.metadata,
  };
}

function makeAlignment(moduleValue: RootRuntimeModule, options: Record<string, unknown>): unknown {
  return new moduleValue.MasonryWallOpeningsModel(options);
}

void test("masonry wall opening extraction matches the independent pinned JavaScript implementation", async () => {
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
    throw new Error("Masonry wall opening extraction exports do not expose the expected API.");
  }

  assert.notEqual(
    typescriptRootModuleValue.extractEquivalentFrameMembers,
    sourceRootModuleValue.extractEquivalentFrameMembers,
    "extractor independent implementation",
  );

  const fixtures: Record<string, Record<string, unknown>> = {
    basic: {
      id: "alignment-basic-δ",
      units: { force: "N", length: "m" },
      walls: [
        {
          id: "wall-α",
          length: 5,
          height: 3,
          thickness: 0.3,
          material: { name: "muratura — α" },
        },
      ],
      openings: [{ id: "window-μ", x: 1.2, y: 1, width: 1.4, height: 1 }],
    },
    joints: {
      id: "alignment-joints",
      units: { force: "N", length: "m" },
      walls: [
        { id: "wall-a", length: 2, height: 3, thickness: 0.3 },
        { id: "wall-b", length: 2, height: 3, thickness: 0.3 },
      ],
      openings: [],
    },
    crossJoint: {
      id: "alignment-cross-joint",
      units: { force: "N", length: "m" },
      walls: [
        { id: "wall-a", length: 2.5, height: 3, thickness: 0.3 },
        { id: "wall-b", length: 2.5, height: 3, thickness: 0.3 },
      ],
      openings: [{ id: "door-a", x: 2, y: 0, width: 1, height: 2.1 }],
    },
    ringFrame: {
      id: "alignment-ring-frame",
      units: { force: "N", length: "m" },
      walls: [{ id: "wall-a", length: 4, height: 3, thickness: 0.3 }],
      openings: [
        {
          id: "opening-a",
          x: 1.5,
          y: 0.9,
          width: 1,
          height: 1.1,
          ringFrame: { profileWidthInPlane: 0.08 },
        },
      ],
    },
    stacked: {
      id: "alignment-spandrel-limit",
      units: { force: "N", length: "m" },
      walls: [{ id: "wall-a", length: 4, height: 4, thickness: 0.3 }],
      openings: [
        { id: "lower-opening", x: 1, y: 0.5, width: 1.2, height: 0.8 },
        { id: "upper-opening", x: 1.1, y: 1.8, width: 1, height: 0.6 },
      ],
    },
  };

  for (const [label, options] of Object.entries(fixtures)) {
    const sourceAlignment = makeAlignment(sourceRootModuleValue, options);
    const typescriptAlignment = makeAlignment(typescriptRootModuleValue, options);
    const sourceSanitized = sourceRootModuleValue.sanitizeAlignmentOpenings({
      alignment: sourceAlignment,
    });
    const typescriptSanitized = typescriptRootModuleValue.sanitizeAlignmentOpenings({
      alignment: typescriptAlignment,
    });
    const sourceResult = sourceRootModuleValue.extractEquivalentFrameMembers({
      alignment: sourceAlignment,
      sanitizedOpenings: label === "joints" ? [] : sourceSanitized.openings,
    });
    const typescriptResult = typescriptRootModuleValue.extractEquivalentFrameMembers({
      alignment: typescriptAlignment,
      sanitizedOpenings: label === "joints" ? [] : typescriptSanitized.openings,
    });
    assertExactParity(
      extractionState(sourceResult),
      extractionState(typescriptResult),
      `${label} extraction`,
    );
  }

  assert.deepEqual(
    captureError(() => sourceRootModuleValue.extractEquivalentFrameMembers({ alignment: null })),
    captureError(() =>
      typescriptRootModuleValue.extractEquivalentFrameMembers({ alignment: null }),
    ),
    "missing alignment error",
  );
});
