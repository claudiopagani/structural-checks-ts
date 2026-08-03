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

interface RuntimeModel {
  slabCentroidY(): number;
  timberCentroidY(): number;
  createIdealCompositeSection(): { toJSON(): JsonRecord };
}

interface RuntimeModule extends JsonRecord {
  readonly TimberConcreteCompositeBeamModel: new (options: unknown) => RuntimeModel;
}

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isRuntimeModule(value: unknown): value is RuntimeModule {
  return (
    value !== null &&
    isRecord(value) &&
    typeof value.TimberConcreteCompositeBeamModel === "function"
  );
}

function gitOutput(repository: string, ...arguments_: readonly string[]): string {
  return execFileSync("git", ["-C", repository, ...arguments_], { encoding: "utf8" }).trim();
}

async function loadRootModule(root: string): Promise<RuntimeModule> {
  const module: unknown = await import(pathToFileURL(path.join(root, "src", "index.js")).href);
  if (!isRuntimeModule(module)) {
    throw new Error("Missing TimberConcreteCompositeBeamModel root export.");
  }
  return module;
}

async function loadBuiltRootModule(): Promise<RuntimeModule> {
  const module: unknown = await import(
    pathToFileURL(path.join(repositoryRoot, "dist", "index.js")).href
  );
  if (!isRuntimeModule(module)) {
    throw new Error("Missing built TimberConcreteCompositeBeamModel root export.");
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
    id: `composito-${lambda}`,
    span: 4_250,
    slabSection: {
      area: 108_000,
      inertiaY: 3_240_000,
      inertiaZ: 29_160_000_000,
      height: 60,
      width: 1_800,
    },
    timberSection: {
      area: 60_000,
      inertiaY: 450_000_000,
      inertiaZ: 200_000_000,
      height: 300,
      width: 200,
    },
    timberConcreteGap: 20,
    reinforcement: { bars: 4, diameter: 12 },
    reinforcementSpacing: 100,
    timberMaterial: { elasticModulus: 11_000, name: "C24" },
    concreteMaterial: { elasticModulus: 30_000, name: "C30/37" },
    reinforcementMaterial: { elasticModulus: 200_000 },
    connector: { type: "Tecnaria" },
    connectorSpacing: 150,
    loads: {
      ulsLineLoad: 0.012,
      sleRareLineLoad: 0.008,
      sleFrequentLineLoad: 0.006,
      sleQuasiPermanentLineLoad: 0.004,
      label: `carico-${lambda}`,
    },
    units: { force: "N", length: "mm" },
    metadata: { label: `Trave composta ${lambda}` },
  };
}

function missingUnitsOptions(): JsonRecord {
  const options = modelOptions();
  delete options.units;
  return options;
}

void test("0211 TimberConcreteCompositeBeamModel matches the independent pinned JavaScript implementation", async () => {
  assert.equal(gitOutput(sourceRoot, "rev-parse", "HEAD"), sourceRevision);
  assert.equal(gitOutput(sourceRoot, "status", "--porcelain"), "");
  assert.equal(gitOutput(normativeRoot, "rev-parse", "HEAD"), normativeRevision);
  assert.equal(gitOutput(normativeRoot, "status", "--porcelain"), "");

  const sourceRootModule = await loadRootModule(sourceRoot);
  const typescriptRootModule = await loadBuiltRootModule();
  const sourceDirect = await loadDirectModule(
    sourceRoot,
    "src/applications/timber-concrete-composite-beams/models/TimberConcreteCompositeBeamModel.js",
  );
  const typescriptDirect = await loadDirectModule(
    path.join(repositoryRoot, "dist"),
    "applications/timber-concrete-composite-beams/models/TimberConcreteCompositeBeamModel.js",
  );

  assert.notEqual(
    sourceDirect.TimberConcreteCompositeBeamModel,
    typescriptDirect.TimberConcreteCompositeBeamModel,
  );
  assert.equal(
    typescriptRootModule.TimberConcreteCompositeBeamModel,
    typescriptDirect.TimberConcreteCompositeBeamModel,
  );

  const sourceModel = new sourceRootModule.TimberConcreteCompositeBeamModel(modelOptions());
  const typescriptModel = new typescriptRootModule.TimberConcreteCompositeBeamModel(modelOptions());
  exactJson(sourceModel, typescriptModel, "complete model");
  assert.equal(sourceModel.slabCentroidY(), typescriptModel.slabCentroidY());
  assert.equal(sourceModel.timberCentroidY(), typescriptModel.timberCentroidY());
  exactJson(
    sourceModel.createIdealCompositeSection().toJSON(),
    typescriptModel.createIdealCompositeSection().toJSON(),
    "ideal composite section",
  );
  assertErrorParity(
    () => new sourceRootModule.TimberConcreteCompositeBeamModel({}),
    () => new typescriptRootModule.TimberConcreteCompositeBeamModel({}),
    "missing model id",
  );
  assertErrorParity(
    () => new sourceRootModule.TimberConcreteCompositeBeamModel(missingUnitsOptions()),
    () => new typescriptRootModule.TimberConcreteCompositeBeamModel(missingUnitsOptions()),
    "missing explicit units",
  );
});
