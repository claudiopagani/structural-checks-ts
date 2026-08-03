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
  metadata: JsonRecord;
}

interface RuntimeProvider {
  calculateGammaProperties(): JsonRecord;
  getElasticBeamProperties(context?: unknown): JsonRecord;
}

interface RuntimeProviderModule extends JsonRecord {
  readonly TimberConcreteCompositeBeamSectionProvider: new (options: unknown) => RuntimeProvider;
  readonly createTimberConcreteCompositeBeamSectionProvider: (options?: unknown) => RuntimeProvider;
}

interface RuntimeModelModule extends JsonRecord {
  readonly TimberConcreteCompositeBeamModel: new (options: unknown) => RuntimeModel;
}

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isProviderModule(value: unknown): value is RuntimeProviderModule {
  return (
    isRecord(value) &&
    typeof value.TimberConcreteCompositeBeamSectionProvider === "function" &&
    typeof value.createTimberConcreteCompositeBeamSectionProvider === "function"
  );
}

function isModelModule(value: unknown): value is RuntimeModelModule {
  return isRecord(value) && typeof value.TimberConcreteCompositeBeamModel === "function";
}

function gitOutput(repository: string, ...arguments_: readonly string[]): string {
  return execFileSync("git", ["-C", repository, ...arguments_], { encoding: "utf8" }).trim();
}

async function loadSourceRootModule(): Promise<RuntimeProviderModule & RuntimeModelModule> {
  const module: unknown = await import(
    pathToFileURL(path.join(sourceRoot, "src", "index.js")).href
  );
  if (!isProviderModule(module) || !isModelModule(module)) {
    throw new Error("Missing source composite beam provider or model exports.");
  }
  return module;
}

async function loadBuiltRootModule(): Promise<RuntimeProviderModule & RuntimeModelModule> {
  const module: unknown = await import(
    pathToFileURL(path.join(repositoryRoot, "dist", "index.js")).href
  );
  if (!isProviderModule(module) || !isModelModule(module)) {
    throw new Error("Missing built composite beam provider or model exports.");
  }
  return module;
}

async function loadDirectProviderModule(root: string): Promise<RuntimeProviderModule> {
  const module: unknown = await import(
    pathToFileURL(
      path.join(
        root,
        "applications",
        "timber-concrete-composite-beams",
        "analysis",
        "TimberConcreteCompositeBeamSectionProvider.js",
      ),
    ).href
  );
  if (!isProviderModule(module)) {
    throw new Error("Missing direct composite beam provider exports.");
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
    timberMaterial: {
      elasticModulus: 11_000,
      poissonRatio: 0.35,
      name: "C24",
    },
    concreteMaterial: {
      elasticModulus: 30_000,
      poissonRatio: 0.2,
      name: "C30/37",
    },
    connector: { type: "Tecnaria", kser: 20_000, ku: 30_000 },
    connectorSpacing: 150,
    kdef: 0.6,
    kmod: 0.8,
    gammaTimber: 1.5,
    gammaConcrete: 1.5,
    gammaConnector: 1.5,
    units: { force: "N", length: "mm" },
    metadata: { label: `Trave composta ${lambda}` },
  };
}

function invalidModelOptions(): JsonRecord {
  const options = modelOptions();
  options.span = 0;
  return options;
}

void test("0212 TimberConcreteCompositeBeamSectionProvider matches the independent pinned JavaScript implementation", async () => {
  assert.equal(gitOutput(sourceRoot, "rev-parse", "HEAD"), sourceRevision);
  assert.equal(gitOutput(sourceRoot, "status", "--porcelain"), "");
  assert.equal(gitOutput(normativeRoot, "rev-parse", "HEAD"), normativeRevision);
  assert.equal(gitOutput(normativeRoot, "status", "--porcelain"), "");

  const sourceRootModule = await loadSourceRootModule();
  const typescriptRootModule = await loadBuiltRootModule();
  const sourceDirect = await loadDirectProviderModule(path.join(sourceRoot, "src"));
  const typescriptDirect = await loadDirectProviderModule(path.join(repositoryRoot, "dist"));

  assert.notEqual(
    sourceDirect.TimberConcreteCompositeBeamSectionProvider,
    typescriptDirect.TimberConcreteCompositeBeamSectionProvider,
  );
  assert.equal(
    typescriptRootModule.TimberConcreteCompositeBeamSectionProvider,
    typescriptDirect.TimberConcreteCompositeBeamSectionProvider,
  );
  assert.equal(
    typescriptRootModule.createTimberConcreteCompositeBeamSectionProvider,
    typescriptDirect.createTimberConcreteCompositeBeamSectionProvider,
  );

  const sourceModel = new sourceRootModule.TimberConcreteCompositeBeamModel(modelOptions());
  const typescriptModel = new typescriptRootModule.TimberConcreteCompositeBeamModel(modelOptions());
  const sourceProvider = sourceRootModule.createTimberConcreteCompositeBeamSectionProvider({
    model: sourceModel,
    metadata: { label: `Provider ${String.fromCodePoint(0x3bb)}` },
  });
  const typescriptProvider = typescriptRootModule.createTimberConcreteCompositeBeamSectionProvider({
    model: typescriptModel,
    metadata: { label: `Provider ${String.fromCodePoint(0x3bb)}` },
  });

  exactJson(
    sourceProvider.calculateGammaProperties(),
    typescriptProvider.calculateGammaProperties(),
    "gamma properties",
  );
  const contexts: ReadonlyArray<readonly [string, JsonRecord]> = [
    ["ULS", { limitState: "ULS" }],
    ["SLE", { limitState: "SLE" }],
    ["instant", { limitState: "SLE", deformationState: "instant" }],
    ["final", { limitState: "SLE", deformationState: "final" }],
    ["rotated", { limitState: "SLE", sectionRotation: { alpha: 15, units: "deg" } }],
  ];
  for (const [label, context] of contexts) {
    exactJson(
      sourceProvider.getElasticBeamProperties(context),
      typescriptProvider.getElasticBeamProperties(context),
      `${label} elastic beam properties`,
    );
  }

  assertErrorParity(
    () => new sourceDirect.TimberConcreteCompositeBeamSectionProvider({}),
    () => new typescriptDirect.TimberConcreteCompositeBeamSectionProvider({}),
    "missing provider model",
  );
  assertErrorParity(
    () => {
      const model = new sourceRootModule.TimberConcreteCompositeBeamModel(invalidModelOptions());
      return sourceDirect
        .createTimberConcreteCompositeBeamSectionProvider({ model })
        .calculateGammaProperties();
    },
    () => {
      const model = new typescriptRootModule.TimberConcreteCompositeBeamModel(
        invalidModelOptions(),
      );
      return typescriptDirect
        .createTimberConcreteCompositeBeamSectionProvider({ model })
        .calculateGammaProperties();
    },
    "invalid beam span",
  );
});
