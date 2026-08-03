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
  readonly frameModel: unknown;
  readonly members: unknown[];
  readonly loadCombinations: unknown[];
  readonly serviceClass: unknown;
  readonly metadata: Record<string, unknown>;
}

interface RuntimeModelModule {
  readonly SteelFrameModel: new (options?: unknown) => RuntimeModel;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isModelModule(value: unknown): value is RuntimeModelModule {
  return isRecord(value) && typeof value.SteelFrameModel === "function";
}

function gitOutput(repository: string, ...arguments_: readonly string[]): string {
  return execFileSync("git", ["-C", repository, ...arguments_], { encoding: "utf8" }).trim();
}

async function loadModule(root: string, relativePath: string): Promise<RuntimeModelModule> {
  const module: unknown = await import(pathToFileURL(path.join(root, relativePath)).href);
  if (!isModelModule(module)) {
    throw new Error(`The module ${relativePath} does not expose SteelFrameModel.`);
  }
  return module;
}

function codePoints(value: string): number[] {
  return Array.from(value, (character) => {
    const codePoint = character.codePointAt(0);
    if (codePoint === undefined) throw new Error("Expected a code point for every character.");
    return codePoint;
  });
}

function assertExactJson(source: unknown, typescript: unknown, label: string): void {
  const sourceJson = JSON.stringify(source);
  const typescriptJson = JSON.stringify(typescript);
  assert.equal(typescriptJson, sourceJson, `${label}: exact JSON`);
  assert.deepEqual(codePoints(typescriptJson), codePoints(sourceJson), `${label}: Unicode`);
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

void test("SteelFrameModel matches the independent pinned JavaScript implementation", async () => {
  assert.equal(gitOutput(sourceRoot, "rev-parse", "HEAD"), sourceRevision);
  assert.equal(gitOutput(sourceRoot, "status", "--porcelain"), "");
  assert.equal(gitOutput(normativeRoot, "rev-parse", "HEAD"), normativeRevision);
  assert.equal(gitOutput(normativeRoot, "status", "--porcelain"), "");

  const source = await loadModule(
    sourceRoot,
    "src/applications/steel-frames/models/SteelFrameModel.js",
  );
  const typescript = await loadModule(
    path.join(repositoryRoot, "dist"),
    "applications/steel-frames/models/SteelFrameModel.js",
  );
  const sourceRootModule = await loadModule(sourceRoot, "src/index.js");
  const typescriptRootModule = await loadModule(path.join(repositoryRoot, "dist"), "index.js");

  assert.notEqual(source.SteelFrameModel, typescript.SteelFrameModel);
  assert.equal(sourceRootModule.SteelFrameModel, source.SteelFrameModel);
  assert.equal(typescriptRootModule.SteelFrameModel, typescript.SteelFrameModel);
  assert.notEqual(sourceRootModule.SteelFrameModel, typescriptRootModule.SteelFrameModel);
  assert.deepEqual(
    prototypeKeys(source.SteelFrameModel),
    prototypeKeys(typescript.SteelFrameModel),
    "prototype shape",
  );

  const fixtures: readonly unknown[] = [
    { id: "frame-α" },
    {
      id: "frame-2",
      frameModel: { nodes: ["n1", "n2"] },
      members: [{ id: "column-1", length: 3.2 }],
      loadCombinations: [{ id: "ULS-1", factor: 1.5 }],
      serviceClass: "3",
      metadata: { label: "Telaio \u03bb", source: "catalogue-\u00e9" },
    },
    {
      id: 7,
      frameModel: null,
      members: [null, 2],
      loadCombinations: [],
      serviceClass: 0,
      metadata: { nested: { value: true } },
    },
  ];

  for (const [index, fixture] of fixtures.entries()) {
    const sourceModel = new source.SteelFrameModel(fixture);
    const typescriptModel = new typescript.SteelFrameModel(fixture);
    assert.equal(sourceModel instanceof source.SteelFrameModel, true);
    assert.equal(typescriptModel instanceof typescript.SteelFrameModel, true);
    assert.equal(sourceModel instanceof typescript.SteelFrameModel, false);
    assert.equal(typescriptModel instanceof source.SteelFrameModel, false);
    assert.deepEqual(
      Object.keys(typescriptModel),
      Object.keys(sourceModel),
      `fixture ${index}: keys`,
    );
    assertExactJson(sourceModel, typescriptModel, `fixture ${index}`);
  }

  const sourceModel = new source.SteelFrameModel({
    id: "clone-isolation",
    members: [{ id: "member" }],
    loadCombinations: [{ id: "combination" }],
    metadata: { label: "isolated" },
  });
  const typescriptModel = new typescript.SteelFrameModel({
    id: "clone-isolation",
    members: [{ id: "member" }],
    loadCombinations: [{ id: "combination" }],
    metadata: { label: "isolated" },
  });
  sourceModel.members.push({ id: "added" });
  typescriptModel.members.push({ id: "added" });
  sourceModel.metadata.label = "mutated";
  typescriptModel.metadata.label = "mutated";
  assertExactJson(sourceModel, typescriptModel, "mutable collection isolation");

  const sourceDefaultA = new source.SteelFrameModel({ id: "a" });
  const sourceDefaultB = new source.SteelFrameModel({ id: "b" });
  const typescriptDefaultA = new typescript.SteelFrameModel({ id: "a" });
  const typescriptDefaultB = new typescript.SteelFrameModel({ id: "b" });
  sourceDefaultA.members.push("member");
  typescriptDefaultA.members.push("member");
  assert.equal(sourceDefaultB.members.length, typescriptDefaultB.members.length);
  assert.equal(sourceDefaultB.loadCombinations.length, typescriptDefaultB.loadCombinations.length);

  assertErrorParity(
    () => new source.SteelFrameModel(),
    () => new typescript.SteelFrameModel(undefined),
    "missing constructor options",
  );
  assertErrorParity(
    () => new source.SteelFrameModel({}),
    () => new typescript.SteelFrameModel({}),
    "missing id",
  );
  assertErrorParity(
    () => new source.SteelFrameModel({ id: "" }),
    () => new typescript.SteelFrameModel({ id: "" }),
    "empty id",
  );
  assertErrorParity(
    () => new source.SteelFrameModel({ id: 0 }),
    () => new typescript.SteelFrameModel({ id: 0 }),
    "zero id",
  );
});
