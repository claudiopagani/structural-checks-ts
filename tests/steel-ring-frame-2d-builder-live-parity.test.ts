import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const sourceRoot = path.resolve(repositoryRoot, "..", "strutture-js");
const normativeRoot = path.resolve(repositoryRoot, "..", "strutture-normative");
const sourceRevision = "6f33baead8b88166c4b2cf94af41763412e3c751";
const normativeRevision = "41da3faa489600173106935bbcf726119300e48d";

interface RuntimeElement {
  readonly toJSON: () => unknown;
}

interface RuntimeBuilderResult {
  readonly model: unknown;
  readonly nodes: readonly unknown[];
  readonly elements: readonly RuntimeElement[];
  readonly supports: readonly unknown[];
  readonly dofRegistry: { toJSON: () => unknown };
  readonly referenceLoadVector: readonly number[];
  readonly controlVector: readonly number[];
  readonly controlNode: { id: string };
  readonly snapshot: unknown;
  readonly warnings: readonly string[];
  readonly assumptions: readonly string[];
}

interface RuntimeBuilderModule {
  readonly SteelRingFrame2DBuilder: new () => {
    build: (options?: unknown) => RuntimeBuilderResult;
  };
}

interface RuntimeModelModule {
  readonly SteelRingFramePushoverModel: new (options: unknown) => unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isRuntimeBuilderModule(value: unknown): value is RuntimeBuilderModule {
  return isRecord(value) && typeof value.SteelRingFrame2DBuilder === "function";
}

function isRuntimeModelModule(value: unknown): value is RuntimeModelModule {
  return isRecord(value) && typeof value.SteelRingFramePushoverModel === "function";
}

function gitOutput(repository: string, ...arguments_: readonly string[]): string {
  return execFileSync("git", ["-C", repository, ...arguments_], { encoding: "utf8" }).trim();
}

async function loadModule(root: string, relativePath: string): Promise<RuntimeBuilderModule> {
  const module: unknown = await import(pathToFileURL(path.join(root, relativePath)).href);
  if (!isRuntimeBuilderModule(module)) {
    throw new Error(`The module ${relativePath} does not expose SteelRingFrame2DBuilder.`);
  }
  return module;
}

async function loadModelModule(root: string, relativePath: string): Promise<RuntimeModelModule> {
  const module: unknown = await import(pathToFileURL(path.join(root, relativePath)).href);
  if (!isRuntimeModelModule(module)) {
    throw new Error("The model module does not expose SteelRingFramePushoverModel.");
  }
  return module;
}

function exactJson(source: unknown, typescript: unknown, label: string): void {
  const sourceJson = JSON.stringify(source);
  const typescriptJson = JSON.stringify(typescript);
  assert.equal(typescriptJson, sourceJson, `${label}: exact JSON`);
  assert.deepEqual(
    Array.from(typescriptJson, (character) => character.codePointAt(0)),
    Array.from(sourceJson, (character) => character.codePointAt(0)),
    `${label}: exact Unicode code points`,
  );
}

function errorSnapshot(callback: () => unknown): { name: string; message: string } {
  try {
    callback();
  } catch (error) {
    assert.ok(error instanceof Error);
    return { name: error.name, message: error.message };
  }
  throw new Error("Expected the callback to throw.");
}

function assertErrorParity(
  sourceCallback: () => unknown,
  typescriptCallback: () => unknown,
  label: string,
): void {
  assert.deepEqual(errorSnapshot(sourceCallback), errorSnapshot(typescriptCallback), label);
}

function prototypeKeys(value: unknown): string[] {
  if (typeof value !== "function") throw new Error("Expected a class export.");
  return Object.getOwnPropertyNames(value.prototype);
}

void test("SteelRingFrame2DBuilder matches the independent pinned JavaScript implementation", async () => {
  assert.equal(gitOutput(sourceRoot, "rev-parse", "HEAD"), sourceRevision);
  assert.equal(gitOutput(sourceRoot, "status", "--porcelain"), "");
  assert.equal(gitOutput(normativeRoot, "rev-parse", "HEAD"), normativeRevision);
  assert.equal(gitOutput(normativeRoot, "status", "--porcelain"), "");

  const source = await loadModule(
    sourceRoot,
    "src/applications/steel-frames/analysis/SteelRingFrame2DBuilder.js",
  );
  const typescript = await loadModule(
    path.join(repositoryRoot, "dist"),
    "applications/steel-frames/analysis/SteelRingFrame2DBuilder.js",
  );
  const sourceRootModule = await loadModule(sourceRoot, "src/index.js");
  const typescriptRootModule = await loadModule(path.join(repositoryRoot, "dist"), "index.js");
  const sourceModelModule = await loadModelModule(
    sourceRoot,
    "src/applications/steel-frames/models/SteelRingFramePushoverModel.js",
  );
  const typescriptModelModule = await loadModelModule(
    path.join(repositoryRoot, "dist"),
    "applications/steel-frames/models/SteelRingFramePushoverModel.js",
  );

  assert.notEqual(source.SteelRingFrame2DBuilder, typescript.SteelRingFrame2DBuilder);
  assert.equal(sourceRootModule.SteelRingFrame2DBuilder, source.SteelRingFrame2DBuilder);
  assert.equal(typescriptRootModule.SteelRingFrame2DBuilder, typescript.SteelRingFrame2DBuilder);
  assert.notEqual(
    sourceRootModule.SteelRingFrame2DBuilder,
    typescriptRootModule.SteelRingFrame2DBuilder,
  );
  assert.deepEqual(
    prototypeKeys(source.SteelRingFrame2DBuilder),
    prototypeKeys(typescript.SteelRingFrame2DBuilder),
    "prototype shape",
  );

  const fixtures: readonly unknown[] = [
    {
      id: "builder-\u00ce\u00b1",
      units: { force: "kN", length: "m" },
      geometry: { b: 0.9, h: 2.1 },
      memberSections: { columns: "IPE200", topBeam: "IPE200" },
      baseCondition: "fixed-base",
    },
    {
      id: "builder-upn",
      units: { force: "kN", length: "m" },
      geometry: { clearWidth: 0.9, clearHeight: 2.1, originX: 0.1, originY: 0.2 },
      memberSections: { columns: "HEA200", topBeam: "HEA200", bottomBeam: "UPN200" },
      memberOrientations: { topBeam: "weak-axis-in-plane" },
      baseCondition: "incernierato-con-traverso",
      loading: { horizontalForce: 2, controlNode: "right-top" },
      material: "S275",
    },
    {
      id: "builder-warning",
      units: { force: "kN", length: "m" },
      geometry: { width: 0.9, height: 2.1 },
      memberSections: { columns: "IPE100", topBeam: "IPE100", bottomBeam: "IPE100" },
      baseCondition: "fixed-base",
      includeBottomBeam: true,
    },
  ];

  for (const [index, fixture] of fixtures.entries()) {
    const sourceResult = new source.SteelRingFrame2DBuilder().build({ model: fixture });
    const typescriptResult = new typescript.SteelRingFrame2DBuilder().build({ model: fixture });

    assert.deepEqual(
      Object.keys(typescriptResult),
      Object.keys(sourceResult),
      `fixture ${index}: result keys`,
    );
    assert.deepEqual(
      typescriptResult.referenceLoadVector,
      sourceResult.referenceLoadVector,
      `fixture ${index}: reference load vector`,
    );
    assert.deepEqual(
      typescriptResult.controlVector,
      sourceResult.controlVector,
      `fixture ${index}: control vector`,
    );
    assert.equal(typescriptResult.controlNode.id, sourceResult.controlNode.id);
    exactJson(sourceResult.snapshot, typescriptResult.snapshot, `fixture ${index}: snapshot`);
    exactJson(
      sourceResult.dofRegistry.toJSON(),
      typescriptResult.dofRegistry.toJSON(),
      `fixture ${index}: DOF registry`,
    );
    exactJson(sourceResult.warnings, typescriptResult.warnings, `fixture ${index}: warnings`);
    exactJson(
      sourceResult.assumptions,
      typescriptResult.assumptions,
      `fixture ${index}: assumptions`,
    );
    exactJson(
      sourceResult.elements.map((element) => element.toJSON()),
      typescriptResult.elements.map((element) => element.toJSON()),
      `fixture ${index}: element serialization`,
    );
  }

  const instanceFixture = {
    id: "builder-instance",
    units: { force: "kN", length: "m" },
    geometry: { b: 0.9, h: 2.1 },
    memberSections: { columns: "IPE100", topBeam: "IPE100" },
  };
  const sourceModel = new sourceModelModule.SteelRingFramePushoverModel(instanceFixture);
  const typescriptModel = new typescriptModelModule.SteelRingFramePushoverModel(instanceFixture);
  const sourceInstanceResult = new source.SteelRingFrame2DBuilder().build({ model: sourceModel });
  const typescriptInstanceResult = new typescript.SteelRingFrame2DBuilder().build({
    model: typescriptModel,
  });
  exactJson(
    sourceInstanceResult.snapshot,
    typescriptInstanceResult.snapshot,
    "model instance path",
  );

  assertErrorParity(
    () => new source.SteelRingFrame2DBuilder().build(),
    () => new typescript.SteelRingFrame2DBuilder().build(),
    "missing model",
  );
  assertErrorParity(
    () => new source.SteelRingFrame2DBuilder().build({ model: null }),
    () => new typescript.SteelRingFrame2DBuilder().build({ model: null }),
    "null model",
  );
});
