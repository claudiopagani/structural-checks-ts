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

interface RuntimeModel {
  readonly id: unknown;
  readonly units: unknown;
  readonly geometry: Record<string, unknown>;
  readonly baseCondition: unknown;
  readonly includeBottomBeam: unknown;
  readonly memberOrientations: Record<string, unknown>;
  readonly metadata: Record<string, unknown>;
  readonly topNodeId: () => string;
  readonly sourceUnits: () => unknown;
  readonly toJSON: () => unknown;
}

interface RuntimeModelModule {
  readonly SteelRingFramePushoverModel: new (options: unknown) => RuntimeModel;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isRuntimeModelModule(value: unknown): value is RuntimeModelModule {
  return isRecord(value) && typeof value.SteelRingFramePushoverModel === "function";
}

function gitOutput(repository: string, ...arguments_: readonly string[]): string {
  return execFileSync("git", ["-C", repository, ...arguments_], { encoding: "utf8" }).trim();
}

async function loadModule(root: string, relativePath: string): Promise<RuntimeModelModule> {
  const module: unknown = await import(pathToFileURL(path.join(root, relativePath)).href);
  if (!isRuntimeModelModule(module)) {
    throw new Error(`The module ${relativePath} does not expose SteelRingFramePushoverModel.`);
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

void test("SteelRingFramePushoverModel matches the independent pinned JavaScript implementation", async () => {
  assert.equal(gitOutput(sourceRoot, "rev-parse", "HEAD"), sourceRevision);
  assert.equal(gitOutput(sourceRoot, "status", "--porcelain"), "");
  assert.equal(gitOutput(normativeRoot, "rev-parse", "HEAD"), normativeRevision);
  assert.equal(gitOutput(normativeRoot, "status", "--porcelain"), "");

  const source = await loadModule(
    sourceRoot,
    "src/applications/steel-frames/models/SteelRingFramePushoverModel.js",
  );
  const typescript = await loadModule(
    path.join(repositoryRoot, "dist"),
    "applications/steel-frames/models/SteelRingFramePushoverModel.js",
  );
  const sourceRootModule = await loadModule(sourceRoot, "src/index.js");
  const typescriptRootModule = await loadModule(path.join(repositoryRoot, "dist"), "index.js");

  assert.notEqual(
    source.SteelRingFramePushoverModel,
    typescript.SteelRingFramePushoverModel,
    "source and TypeScript classes must be independently executed",
  );
  assert.equal(sourceRootModule.SteelRingFramePushoverModel, source.SteelRingFramePushoverModel);
  assert.equal(
    typescriptRootModule.SteelRingFramePushoverModel,
    typescript.SteelRingFramePushoverModel,
  );
  assert.notEqual(
    sourceRootModule.SteelRingFramePushoverModel,
    typescriptRootModule.SteelRingFramePushoverModel,
  );
  assert.deepEqual(
    prototypeKeys(source.SteelRingFramePushoverModel),
    prototypeKeys(typescript.SteelRingFramePushoverModel),
    "prototype shape",
  );

  const fixtures: readonly unknown[] = [
    {
      id: "ring-\u00ce\u00b1",
      units: { force: "kN", length: "m" },
      geometry: { b: 0.9, h: 2.1 },
      memberSections: { columns: "IPE200", topBeam: "IPE200" },
      baseCondition: "fixed-base",
      metadata: { label: "Telaio λ", source: "catalogue-é" },
    },
    {
      id: "ring-upn",
      units: { force: "kN", length: "m" },
      geometry: { clearWidth: 0.9, clearHeight: 2.1, originX: 0.1, originY: 0.2 },
      memberSections: { columns: "HEA200", topBeam: "HEA200", bottomBeam: "UPN200" },
      memberOrientations: { topBeam: "weak-axis-in-plane" },
      baseCondition: "incernierato-con-traverso",
      loading: { horizontalForce: 2, controlNode: "right-top" },
      solver: {
        controlIncrement: 0.002,
        maxDisplacement: 0.03,
        tolerance: 1e-6,
        maxIterations: 60,
        maxSteps: 60,
      },
      material: "S275",
      metadata: { label: "Telaio λ" },
    },
    {
      id: 7,
      units: { force: "N", length: "mm" },
      geometry: { width: 900, height: 2100 },
      memberSections: {
        leftColumn: "IPE100",
        rightColumn: "IPE100",
        topBeam: "IPE100",
        bottomBeam: "IPE100",
      },
      baseCondition: "pinned-base-without-bottom-beam",
      includeBottomBeam: true,
      loading: { Fh: 3, controlNode: "architrave-right" },
    },
  ];

  for (const [index, fixture] of fixtures.entries()) {
    const sourceModel = new source.SteelRingFramePushoverModel(fixture);
    const typescriptModel = new typescript.SteelRingFramePushoverModel(fixture);

    assert.equal(sourceModel instanceof source.SteelRingFramePushoverModel, true);
    assert.equal(typescriptModel instanceof typescript.SteelRingFramePushoverModel, true);
    assert.equal(sourceModel instanceof typescript.SteelRingFramePushoverModel, false);
    assert.equal(typescriptModel instanceof source.SteelRingFramePushoverModel, false);
    assert.deepEqual(
      Object.keys(typescriptModel),
      Object.keys(sourceModel),
      `fixture ${index}: enumerable keys`,
    );
    exactJson(sourceModel.toJSON(), typescriptModel.toJSON(), `fixture ${index}: JSON`);
    assert.equal(typescriptModel.topNodeId(), sourceModel.topNodeId());
    exactJson(
      sourceModel.sourceUnits(),
      typescriptModel.sourceUnits(),
      `fixture ${index}: source units`,
    );
  }

  const errorFixtures: readonly unknown[] = [
    undefined,
    {},
    { id: "missing-units" },
    {
      id: "bad-base",
      units: { force: "kN", length: "m" },
      geometry: { b: 0.9, h: 2.1 },
      baseCondition: "unsupported-base",
    },
    {
      id: "bad-control-node",
      units: { force: "kN", length: "m" },
      geometry: { b: 0.9, h: 2.1 },
      loading: { controlNode: "unsupported-node" },
    },
    {
      id: "bad-geometry",
      units: { force: "kN", length: "m" },
      geometry: { b: 0, h: 2.1 },
    },
    {
      id: "bad-material",
      units: { force: "kN", length: "m" },
      geometry: { b: 0.9, h: 2.1 },
      material: "S999",
    },
    {
      id: "bad-section",
      units: { force: "kN", length: "m" },
      geometry: { b: 0.9, h: 2.1 },
      memberSections: { columns: "IPE999" },
    },
    {
      id: "bad-solver",
      units: { force: "kN", length: "m" },
      geometry: { b: 0.9, h: 2.1 },
      solver: { tolerance: Number.NaN },
    },
  ];

  for (const [index, fixture] of errorFixtures.entries()) {
    assertErrorParity(
      () => new source.SteelRingFramePushoverModel(fixture),
      () => new typescript.SteelRingFramePushoverModel(fixture),
      `error fixture ${index}`,
    );
  }
});
