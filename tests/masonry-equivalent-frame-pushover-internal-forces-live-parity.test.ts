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
type RuntimeApplicationConstructor = new (options?: unknown) => unknown;
type RuntimeContributorFactory = (input?: unknown) => unknown;

interface RuntimeInternalForcesModule extends RuntimeModule {
  MasonryEquivalentFramePushoverInternalForces: RuntimeApplicationConstructor;
  createMasonryEquivalentFrameContributorDefinition: RuntimeContributorFactory;
}

interface RuntimeInternalForces extends RuntimeModule {
  evaluate: (input?: unknown) => unknown;
}

function isRecord(value: unknown): value is RuntimeModule {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isRuntimeModule(value: unknown): value is RuntimeInternalForcesModule {
  return (
    isRecord(value) &&
    typeof value.MasonryEquivalentFramePushoverInternalForces === "function" &&
    typeof value.createMasonryEquivalentFrameContributorDefinition === "function"
  );
}

function isRuntimeInternalForces(value: unknown): value is RuntimeInternalForces {
  return isRecord(value) && typeof value.evaluate === "function";
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
      throw new Error("The internal-forces operation threw a non-Error value.", { cause: error });
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

function createElasticFrame(): RuntimeModule {
  const dofIds = ["start:ux", "end:ux"];
  const getIndex = (nodeOrDofId: unknown, dof?: string): number => {
    if (dof !== undefined) {
      return dofIds.indexOf(`${String(nodeOrDofId)}:${dof}`);
    }
    return typeof nodeOrDofId === "string" ? dofIds.indexOf(nodeOrDofId) : -1;
  };
  const element = {
    id: "spandrel-μ",
    metadata: { role: "spandrel", sourceSpandrelId: "spandrel-α" },
    startNode: "start",
    endNode: "end",
    localStiffness: () => [
      [2, -2],
      [-2, 2],
    ],
    localDisplacements: (displacements: unknown) => displacements,
    transformationMatrix: () => [
      [1, 0],
      [0, 1],
    ],
    getDofIds: () => dofIds,
  };

  return {
    dofRegistry: {
      size: () => 2,
      getIndex,
      getDofId: (node: unknown, dof: string) => `${String(node)}:${dof}`,
    },
    elements: [element, { id: "ignored-element", metadata: { role: "unhandled" } }],
  };
}

void test("equivalent-frame pushover internal forces match the independent pinned JavaScript implementation", async () => {
  assert.equal(gitOutput(sourceRoot, "rev-parse", "HEAD"), sourceRevision);
  assert.equal(gitOutput(sourceRoot, "status", "--porcelain"), "");
  assert.equal(gitOutput(normativeRoot, "rev-parse", "HEAD"), normativeRevision);
  assert.equal(gitOutput(normativeRoot, "status", "--porcelain"), "");

  const sourceModuleValue: unknown = await loadModule(
    sourceRoot,
    "src/applications/masonry-wall-openings/analysis/MasonryEquivalentFramePushoverInternalForces.js",
  );
  const typescriptModuleValue: unknown = await loadModule(
    path.join(repositoryRoot, "dist"),
    "applications/masonry-wall-openings/analysis/MasonryEquivalentFramePushoverInternalForces.js",
  );
  if (!isRuntimeModule(sourceModuleValue) || !isRuntimeModule(typescriptModuleValue)) {
    throw new Error("Internal-forces module does not expose the expected API.");
  }

  assert.notEqual(
    sourceModuleValue.MasonryEquivalentFramePushoverInternalForces,
    typescriptModuleValue.MasonryEquivalentFramePushoverInternalForces,
    "internal-forces class independent implementation",
  );
  assert.notEqual(
    sourceModuleValue.createMasonryEquivalentFrameContributorDefinition,
    typescriptModuleValue.createMasonryEquivalentFrameContributorDefinition,
    "contributor factory independent implementation",
  );

  const contributorInput = {
    alignment: { units: { force: "N", length: "mm" } },
    pier: {
      id: "pier-μ",
      wallId: "wall-α",
      governingFamily: "flexural",
      governingMode: "rocking",
      ultimateDisplacement: 10,
      mechanics: {
        flexural: { MRd: 1_200_000 },
        bedJointSliding: { V: 5_000 },
        diagonalCracking: { V: 8_000 },
      },
    },
    topRotation: "fixed",
  };
  const sourceContributor =
    sourceModuleValue.createMasonryEquivalentFrameContributorDefinition(contributorInput);
  const typescriptContributor =
    typescriptModuleValue.createMasonryEquivalentFrameContributorDefinition(contributorInput);
  assertExactParity(sourceContributor, typescriptContributor, "contributor definition");

  const sourceEvaluator = new sourceModuleValue.MasonryEquivalentFramePushoverInternalForces();
  const typescriptEvaluator =
    new typescriptModuleValue.MasonryEquivalentFramePushoverInternalForces();
  if (!isRuntimeInternalForces(sourceEvaluator) || !isRuntimeInternalForces(typescriptEvaluator)) {
    throw new Error("Internal-forces instances do not expose evaluate().");
  }

  const frame = createElasticFrame();
  const input = { frame, displacements: [0, 0.25], state: {} };
  assertExactParity(
    sourceEvaluator.evaluate(input),
    typescriptEvaluator.evaluate(input),
    "elastic frame evaluation",
  );

  assert.deepEqual(
    captureError(() => sourceEvaluator.evaluate({ displacements: [] })),
    captureError(() => typescriptEvaluator.evaluate({ displacements: [] })),
    "missing frame error",
  );
  assert.deepEqual(
    captureError(() => sourceEvaluator.evaluate({ frame, displacements: [0] })),
    captureError(() => typescriptEvaluator.evaluate({ frame, displacements: [0] })),
    "displacement length error",
  );
});
