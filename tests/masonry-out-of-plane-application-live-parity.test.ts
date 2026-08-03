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
type RuntimeResult = { toJSON(): unknown };
type RuntimeApplication = {
  getManifest(): unknown;
  run(input?: unknown): RuntimeResult;
};
type RuntimeApplicationConstructor = new () => RuntimeApplication;
type RuntimeModel = {
  id: string;
  wall: unknown;
  restraints: unknown;
  macroBlocks: unknown[];
  actions: unknown;
  metadata: unknown;
};
type RuntimeModelConstructor = new (options: unknown) => RuntimeModel;
type RuntimeAnalysis = {
  code: string;
  metadata: Record<string, unknown>;
  analyze(input?: unknown): RuntimeResult;
};
type RuntimeAnalysisConstructor = new (options?: unknown) => RuntimeAnalysis;

interface RootRuntimeModule extends RuntimeModule {
  MasonryOutOfPlaneApplication: RuntimeApplicationConstructor;
  MasonryOutOfPlaneKinematicAnalysis: RuntimeAnalysisConstructor;
  MasonryOutOfPlaneModel: RuntimeModelConstructor;
}

function isRecord(value: unknown): value is RuntimeModule {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isRootRuntimeModule(value: unknown): value is RootRuntimeModule {
  return (
    isRecord(value) &&
    typeof value.MasonryOutOfPlaneApplication === "function" &&
    typeof value.MasonryOutOfPlaneKinematicAnalysis === "function" &&
    typeof value.MasonryOutOfPlaneModel === "function"
  );
}

function isApplicationModule(value: unknown): value is RuntimeModule {
  return (
    isRecord(value) &&
    typeof value.MasonryOutOfPlaneApplication === "function" &&
    typeof value.MasonryOutOfPlaneKinematicAnalysis === "function" &&
    typeof value.MasonryOutOfPlaneModel === "function"
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
  assert.equal(JSON.stringify(typescript), JSON.stringify(source), `${label}: exact JSON`);
  assert.deepEqual([...JSON.stringify(typescript)], [...JSON.stringify(source)]);
}

function modelState(model: RuntimeModel): unknown {
  return {
    id: model.id,
    wall: model.wall,
    restraints: model.restraints,
    macroBlocks: model.macroBlocks,
    actions: model.actions,
    metadata: model.metadata,
  };
}

function applicationResult(moduleValue: RootRuntimeModule, input: unknown): unknown {
  return new moduleValue.MasonryOutOfPlaneApplication().run(input).toJSON();
}

function captureError(run: () => unknown): { name: string; message: string } | null {
  try {
    run();
    return null;
  } catch (error: unknown) {
    if (!(error instanceof Error)) {
      throw new Error("The masonry out-of-plane operation threw a non-Error value.", {
        cause: error,
      });
    }
    return { name: error.name, message: error.message };
  }
}

void test("masonry out-of-plane exports match the independent pinned JavaScript implementation", async () => {
  assert.equal(gitOutput(sourceRoot, "rev-parse", "HEAD"), sourceRevision);
  assert.equal(gitOutput(sourceRoot, "status", "--porcelain"), "");
  assert.equal(gitOutput(normativeRoot, "rev-parse", "HEAD"), normativeRevision);
  assert.equal(gitOutput(normativeRoot, "status", "--porcelain"), "");

  const sourceRootModuleValue: unknown = await loadModule(sourceRoot, "src/index.js");
  const typescriptRootModuleValue: unknown = await loadModule(
    path.join(repositoryRoot, "dist"),
    "index.js",
  );
  const sourceApplicationModuleValue: unknown = await loadModule(
    sourceRoot,
    "src/applications/masonry-out-of-plane/index.js",
  );
  const typescriptApplicationModuleValue: unknown = await loadModule(
    path.join(repositoryRoot, "dist"),
    "applications/masonry-out-of-plane/index.js",
  );
  if (
    !isRootRuntimeModule(sourceRootModuleValue) ||
    !isRootRuntimeModule(typescriptRootModuleValue) ||
    !isApplicationModule(sourceApplicationModuleValue) ||
    !isApplicationModule(typescriptApplicationModuleValue)
  ) {
    throw new Error("Masonry out-of-plane exports do not expose the expected API.");
  }

  assert.deepEqual(
    Object.keys(typescriptApplicationModuleValue),
    Object.keys(sourceApplicationModuleValue),
  );
  for (const name of [
    "MasonryOutOfPlaneApplication",
    "MasonryOutOfPlaneKinematicAnalysis",
    "MasonryOutOfPlaneModel",
  ]) {
    const sourceValue: unknown = sourceApplicationModuleValue[name];
    const typescriptValue: unknown = typescriptApplicationModuleValue[name];
    assert.equal(typeof sourceValue, "function", `${name} source constructor`);
    assert.equal(typeof typescriptValue, "function", `${name} TypeScript constructor`);
    assert.notEqual(typescriptValue, sourceValue, `${name} independent implementation`);
    assert.equal(typescriptRootModuleValue[name], typescriptValue, `${name} TypeScript root alias`);
    assert.equal(sourceRootModuleValue[name], sourceValue, `${name} source root alias`);
  }

  const modelOptions = {
    id: "muro-\u03B4",
    wall: { thickness: 0.3, label: "Muro \u03BC" },
    restraints: { top: "diaphragm", base: "hinge" },
    macroBlocks: [{ id: "blocco-\u03B5", height: 2.4 }],
    actions: { horizontal: 12.5, vertical: 4 },
    metadata: { source: "fixture \u2014 \u03B1\u03B2\u03B3" },
  };
  const sourceModel = new sourceRootModuleValue.MasonryOutOfPlaneModel(modelOptions);
  const typescriptModel = new typescriptRootModuleValue.MasonryOutOfPlaneModel(modelOptions);
  assertExactParity(modelState(sourceModel), modelState(typescriptModel), "model state");

  const sourceAnalysis = new sourceRootModuleValue.MasonryOutOfPlaneKinematicAnalysis({
    code: "Circolare 2019",
    metadata: { label: "analisi \u03B6" },
  });
  const typescriptAnalysis = new typescriptRootModuleValue.MasonryOutOfPlaneKinematicAnalysis({
    code: "Circolare 2019",
    metadata: { label: "analisi \u03B6" },
  });
  assertExactParity(
    { code: sourceAnalysis.code, metadata: sourceAnalysis.metadata },
    { code: typescriptAnalysis.code, metadata: typescriptAnalysis.metadata },
    "analysis state",
  );
  assertExactParity(
    sourceAnalysis.analyze({ wallId: sourceModel.id }).toJSON(),
    typescriptAnalysis.analyze({ wallId: typescriptModel.id }).toJSON(),
    "analysis result",
  );

  const sourceApplication = new sourceRootModuleValue.MasonryOutOfPlaneApplication();
  const typescriptApplication = new typescriptRootModuleValue.MasonryOutOfPlaneApplication();
  assertExactParity(
    sourceApplication.getManifest(),
    typescriptApplication.getManifest(),
    "application manifest",
  );
  assertExactParity(
    applicationResult(sourceRootModuleValue, {
      code: "NTC2018",
      model: sourceModel,
    }),
    applicationResult(typescriptRootModuleValue, {
      code: "NTC2018",
      model: typescriptModel,
    }),
    "application result",
  );
  assertExactParity(
    applicationResult(sourceRootModuleValue, {}),
    applicationResult(typescriptRootModuleValue, {}),
    "missing-input result",
  );
  assert.deepEqual(
    captureError(() => new sourceRootModuleValue.MasonryOutOfPlaneModel({ id: "" })),
    captureError(() => new typescriptRootModuleValue.MasonryOutOfPlaneModel({ id: "" })),
    "invalid model error",
  );
  assert.deepEqual(
    captureError(() => applicationResult(sourceRootModuleValue, null)),
    captureError(() => applicationResult(typescriptRootModuleValue, null)),
    "null application input error",
  );
});
