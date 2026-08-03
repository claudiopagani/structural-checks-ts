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

type JsonRecord = Record<string, unknown>;

interface RuntimeModule extends JsonRecord {
  readonly TimberBeamModel: new (options: unknown) => JsonRecord;
}

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isRuntimeModule(value: unknown): value is RuntimeModule {
  return isRecord(value) && typeof value.TimberBeamModel === "function";
}

function gitOutput(repository: string, ...arguments_: readonly string[]): string {
  return execFileSync("git", ["-C", repository, ...arguments_], { encoding: "utf8" }).trim();
}

async function loadRootModule(root: string): Promise<RuntimeModule> {
  const module: unknown = await import(pathToFileURL(path.join(root, "src", "index.js")).href);
  if (!isRuntimeModule(module)) {
    throw new Error("Missing TimberBeamModel root export.");
  }
  return module;
}

async function loadBuiltRootModule(): Promise<RuntimeModule> {
  const module: unknown = await import(
    pathToFileURL(path.join(repositoryRoot, "dist", "index.js")).href
  );
  if (!isRuntimeModule(module)) {
    throw new Error("Missing built TimberBeamModel root export.");
  }
  return module;
}

async function loadDirectModule(root: string, relativePath: string): Promise<JsonRecord> {
  const module: unknown = await import(pathToFileURL(path.join(root, relativePath)).href);
  if (!isRecord(module)) {
    throw new Error(`Missing direct export in ${relativePath}.`);
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

function modelOptions(): JsonRecord {
  const lambda = String.fromCodePoint(0x3bb);
  return {
    id: `timber-beam-${lambda}`,
    span: 4.2,
    section: { shape: "rectangular", width: 140, height: 280 },
    material: { timberType: "C24", fmK: 24 },
    restraints: { left: "fixed", right: "simple" },
    loadCases: [{ id: "G1", value: 12 }],
    metadata: { label: `Trave ${lambda}` },
  };
}

void test("0208 TimberBeamModel matches the independent pinned JavaScript implementation", async () => {
  assert.equal(gitOutput(sourceRoot, "rev-parse", "HEAD"), sourceRevision);
  assert.equal(gitOutput(sourceRoot, "status", "--porcelain"), "");
  assert.equal(gitOutput(normativeRoot, "rev-parse", "HEAD"), normativeRevision);
  assert.equal(gitOutput(normativeRoot, "status", "--porcelain"), "");

  const sourceRootModule = await loadRootModule(sourceRoot);
  const typescriptRootModule = await loadBuiltRootModule();
  const sourceDirect = await loadDirectModule(
    sourceRoot,
    "src/applications/timber-beams/models/TimberBeamModel.js",
  );
  const typescriptDirect = await loadDirectModule(
    path.join(repositoryRoot, "dist"),
    "applications/timber-beams/models/TimberBeamModel.js",
  );

  assert.notEqual(sourceDirect.TimberBeamModel, typescriptDirect.TimberBeamModel);
  assert.equal(typescriptRootModule.TimberBeamModel, typescriptDirect.TimberBeamModel);

  const sourceModel = new sourceRootModule.TimberBeamModel(modelOptions());
  const typescriptModel = new typescriptRootModule.TimberBeamModel(modelOptions());
  exactJson(sourceModel, typescriptModel, "complete model");
  exactJson(
    new sourceRootModule.TimberBeamModel({ id: "timber-defaults-λ" }),
    new typescriptRootModule.TimberBeamModel({ id: "timber-defaults-λ" }),
    "default model values",
  );
  assertErrorParity(
    () => new sourceRootModule.TimberBeamModel({}),
    () => new typescriptRootModule.TimberBeamModel({}),
    "missing model id",
  );
});
