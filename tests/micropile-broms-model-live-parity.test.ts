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

type RuntimeRecord = Record<string, unknown>;
type RuntimeModelConstructor = new (options?: unknown) => RuntimeModel;

interface RuntimeModelModule extends RuntimeRecord {
  MicropileBromsModel: RuntimeModelConstructor;
}

interface RuntimeModel {
  id: unknown;
  pile: unknown;
  soil: unknown;
  boundaryConditions: unknown;
  actions: unknown;
  metadata: unknown;
}

function isRecord(value: unknown): value is RuntimeRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isModelModule(value: unknown): value is RuntimeModelModule {
  return isRecord(value) && typeof value.MicropileBromsModel === "function";
}

function isModel(value: unknown): value is RuntimeModel {
  return (
    isRecord(value) &&
    Object.hasOwn(value, "id") &&
    Object.hasOwn(value, "pile") &&
    Object.hasOwn(value, "soil") &&
    Object.hasOwn(value, "boundaryConditions") &&
    Object.hasOwn(value, "actions") &&
    Object.hasOwn(value, "metadata")
  );
}

function modelFields(model: RuntimeModel): RuntimeRecord {
  return {
    id: model.id,
    pile: model.pile,
    soil: model.soil,
    boundaryConditions: model.boundaryConditions,
    actions: model.actions,
    metadata: model.metadata,
  };
}

function gitOutput(repository: string, ...arguments_: readonly string[]): string {
  return execFileSync("git", ["-C", repository, ...arguments_], { encoding: "utf8" }).trim();
}

async function loadModule(root: string, relativePath: string): Promise<RuntimeRecord> {
  const module: unknown = await import(pathToFileURL(path.join(root, relativePath)).href);
  if (!isRecord(module)) {
    throw new Error(`The module ${relativePath} is not an object module.`);
  }
  return module;
}

function codePoints(value: string): number[] {
  return Array.from(value, (character) => {
    const codePoint = character.codePointAt(0);
    if (codePoint === undefined) {
      throw new Error("Expected a code point for every character.");
    }
    return codePoint;
  });
}

function assertExactParity(source: unknown, typescript: unknown, label: string): void {
  assert.deepEqual(typescript, source, label);
  assert.equal(JSON.stringify(typescript), JSON.stringify(source), `${label}: exact JSON`);

  if (typeof source === "string" && typeof typescript === "string") {
    assert.deepEqual(codePoints(typescript), codePoints(source), `${label}: exact Unicode`);
  }
}

function captureError(run: () => unknown): { name: string; message: string } | null {
  try {
    run();
    return null;
  } catch (error: unknown) {
    if (!(error instanceof Error)) {
      throw new Error("The micropile model threw a non-Error value.", { cause: error });
    }
    return { name: error.name, message: error.message };
  }
}

void test("MicropileBromsModel matches the independent pinned JavaScript implementation", async () => {
  assert.equal(gitOutput(sourceRoot, "rev-parse", "HEAD"), sourceRevision);
  assert.equal(gitOutput(sourceRoot, "status", "--porcelain"), "");
  assert.equal(gitOutput(normativeRoot, "rev-parse", "HEAD"), normativeRevision);
  assert.equal(gitOutput(normativeRoot, "status", "--porcelain"), "");

  const sourceModuleValue: unknown = await loadModule(
    sourceRoot,
    "src/applications/micropiles-broms/models/MicropileBromsModel.js",
  );
  const typescriptModuleValue: unknown = await loadModule(
    path.join(repositoryRoot, "dist"),
    "applications/micropiles-broms/models/MicropileBromsModel.js",
  );
  if (!isModelModule(sourceModuleValue) || !isModelModule(typescriptModuleValue)) {
    throw new Error("Micropile Broms model modules do not expose the expected API.");
  }

  assert.notEqual(
    sourceModuleValue.MicropileBromsModel,
    typescriptModuleValue.MicropileBromsModel,
    "model independent implementation",
  );

  const sourceModel = new sourceModuleValue.MicropileBromsModel({
    id: "micropile-α",
    pile: { diameter: 0.2, nested: { label: "palo-μ" } },
    soil: { profile: "sand", layers: ["strato-1"] },
    boundaryConditions: { head: "free", tip: "fixed" },
    actions: { H: 100, M: 12.5 },
    metadata: { source: "fixture", unicode: "✓" },
  });
  const typescriptModel = new typescriptModuleValue.MicropileBromsModel({
    id: "micropile-α",
    pile: { diameter: 0.2, nested: { label: "palo-μ" } },
    soil: { profile: "sand", layers: ["strato-1"] },
    boundaryConditions: { head: "free", tip: "fixed" },
    actions: { H: 100, M: 12.5 },
    metadata: { source: "fixture", unicode: "✓" },
  });
  if (!isModel(sourceModel) || !isModel(typescriptModel)) {
    throw new Error("Micropile Broms model instances do not expose the expected fields.");
  }
  assertExactParity(modelFields(typescriptModel), modelFields(sourceModel), "full model");
  assert.equal(sourceModel instanceof sourceModuleValue.MicropileBromsModel, true);
  assert.equal(typescriptModel instanceof typescriptModuleValue.MicropileBromsModel, true);

  const sourceDefaults = new sourceModuleValue.MicropileBromsModel({ id: "defaults-μ" });
  const typescriptDefaults = new typescriptModuleValue.MicropileBromsModel({ id: "defaults-μ" });
  if (!isModel(sourceDefaults) || !isModel(typescriptDefaults)) {
    throw new Error("Default Micropile Broms model instances do not expose the expected fields.");
  }
  assertExactParity(modelFields(typescriptDefaults), modelFields(sourceDefaults), "default bags");

  const sourceNulls = new sourceModuleValue.MicropileBromsModel({
    id: "null-bags",
    pile: null,
    soil: null,
    boundaryConditions: null,
    actions: null,
    metadata: null,
  });
  const typescriptNulls = new typescriptModuleValue.MicropileBromsModel({
    id: "null-bags",
    pile: null,
    soil: null,
    boundaryConditions: null,
    actions: null,
    metadata: null,
  });
  if (!isModel(sourceNulls) || !isModel(typescriptNulls)) {
    throw new Error("Null-bag Micropile Broms model instances do not expose the expected fields.");
  }
  assertExactParity(modelFields(typescriptNulls), modelFields(sourceNulls), "null bags");

  const invalidCases: readonly [string, () => unknown, () => unknown][] = [
    [
      "missing id",
      () => new sourceModuleValue.MicropileBromsModel({}),
      () => new typescriptModuleValue.MicropileBromsModel({}),
    ],
    [
      "empty id",
      () => new sourceModuleValue.MicropileBromsModel({ id: "" }),
      () => new typescriptModuleValue.MicropileBromsModel({ id: "" }),
    ],
    [
      "zero id",
      () => new sourceModuleValue.MicropileBromsModel({ id: 0 }),
      () => new typescriptModuleValue.MicropileBromsModel({ id: 0 }),
    ],
    [
      "missing options",
      () => new sourceModuleValue.MicropileBromsModel(),
      () => new typescriptModuleValue.MicropileBromsModel(),
    ],
  ];
  for (const [label, sourceRun, typescriptRun] of invalidCases) {
    assertExactParity(captureError(sourceRun), captureError(typescriptRun), `${label} error`);
  }
});
