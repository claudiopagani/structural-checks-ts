import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const sourceRoot = path.resolve(repositoryRoot, "..", "strutture-js");
const sourceRevision = "6f33baead8b88166c4b2cf94af41763412e3c751";

interface RuntimeJson {
  readonly metadata: Record<string, unknown>;
  readonly [key: string]: unknown;
}

interface RuntimeMaterial {
  readonly e0Mean: number;
  readonly e90Mean: number;
  readonly g0Mean: number;
  readonly g90Mean: number;
}

interface RuntimeSection {
  readonly id: string | null;
  readonly name: string;
  readonly effectiveWidth: number;
  readonly layerThicknesses: number[];
  readonly activeLayerIndexes: number[];
  readonly layers: Record<string, unknown>[];
  readonly activeLayers: Record<string, unknown>[];
  activeThickness(): number;
  longitudinalLayers(): unknown;
  crossLayers(): unknown;
  totalThickness(): number;
  calculateBendingStiffness(material: RuntimeMaterial, options?: Record<string, unknown>): number;
  calculateSystemStrengthFactor(boardCount: number, referenceBoardWidth?: number): number;
  calculateShearStiffness(material: RuntimeMaterial, options?: Record<string, unknown>): unknown;
  toJSON(): RuntimeJson;
}

interface RuntimeSectionModule {
  readonly XlamPanelSection: new (options: Record<string, unknown>) => RuntimeSection;
}

interface RuntimeFactoryModule {
  readonly createXlamPanelSection: (options?: Record<string, unknown>) => RuntimeSection;
}

interface RuntimeRootModule extends RuntimeSectionModule, RuntimeFactoryModule {
  readonly CrossSection: new (options: Record<string, unknown>) => object;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isSectionModule(value: unknown): value is RuntimeSectionModule {
  return isRecord(value) && typeof value.XlamPanelSection === "function";
}

function isFactoryModule(value: unknown): value is RuntimeFactoryModule {
  return isRecord(value) && typeof value.createXlamPanelSection === "function";
}

function isRootModule(value: unknown): value is RuntimeRootModule {
  return (
    isRecord(value) &&
    isSectionModule(value) &&
    isFactoryModule(value) &&
    typeof value.CrossSection === "function"
  );
}

function gitOutput(...arguments_: readonly string[]): string {
  return execFileSync("git", ["-C", sourceRoot, ...arguments_], { encoding: "utf8" }).trim();
}

function assertSourceBaseline(): void {
  assert.equal(gitOutput("rev-parse", "HEAD"), sourceRevision);
  assert.equal(gitOutput("status", "--porcelain"), "");
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

function codePoints(value: string): number[] {
  return Array.from(value, (character) => {
    const codePoint = character.codePointAt(0);
    if (codePoint === undefined) throw new Error("Expected a code point for every character.");
    return codePoint;
  });
}

async function loadModules(): Promise<{
  source: RuntimeSectionModule;
  typescript: RuntimeSectionModule;
  sourceFactory: RuntimeFactoryModule;
  typescriptFactory: RuntimeFactoryModule;
  sourceRoot: RuntimeRootModule;
  typescriptRoot: RuntimeRootModule;
}> {
  const sourceModule: unknown = await import(
    pathToFileURL(path.join(sourceRoot, "src", "domain", "geometry", "XlamPanelSection.js")).href
  );
  const typescriptModule: unknown = await import(
    pathToFileURL(path.join(repositoryRoot, "dist", "domain", "geometry", "XlamPanelSection.js"))
      .href
  );
  const sourceFactory: unknown = await import(
    pathToFileURL(path.join(sourceRoot, "src", "domain", "geometry", "createXlamPanelSection.js"))
      .href
  );
  const typescriptFactory: unknown = await import(
    pathToFileURL(
      path.join(repositoryRoot, "dist", "domain", "geometry", "createXlamPanelSection.js"),
    ).href
  );
  const sourceRootModule: unknown = await import(
    pathToFileURL(path.join(sourceRoot, "src", "index.js")).href
  );
  const typescriptRootModule: unknown = await import(
    pathToFileURL(path.join(repositoryRoot, "dist", "index.js")).href
  );

  if (
    !isSectionModule(sourceModule) ||
    !isSectionModule(typescriptModule) ||
    !isFactoryModule(sourceFactory) ||
    !isFactoryModule(typescriptFactory) ||
    !isRootModule(sourceRootModule) ||
    !isRootModule(typescriptRootModule)
  ) {
    throw new Error("XLAM panel section modules do not expose the expected API.");
  }

  return {
    source: sourceModule,
    typescript: typescriptModule,
    sourceFactory,
    typescriptFactory,
    sourceRoot: sourceRootModule,
    typescriptRoot: typescriptRootModule,
  };
}

function createOptions(): Record<string, unknown> {
  return {
    id: "pannello-α",
    name: "XLAM δ",
    effectiveWidth: 1,
    layerThicknesses: [0.03, 0.03, 0.04, 0.03, 0.03],
    activeLayerIndexes: [0, 2, 4],
    units: { force: "kN", length: "m" },
    metadata: { label: "pannello Γ", source: "strutture-js" },
    unsupported: "ignored",
  };
}

function createMaterial(): RuntimeMaterial {
  return {
    e0Mean: 11_000,
    e90Mean: 400,
    g0Mean: 700,
    g90Mean: 40,
  };
}

void test("XlamPanelSection matches the independent pinned JavaScript implementation", async () => {
  assertSourceBaseline();
  const { source, typescript, sourceFactory, typescriptFactory, sourceRoot, typescriptRoot } =
    await loadModules();

  assert.notEqual(source.XlamPanelSection, typescript.XlamPanelSection);
  assert.notEqual(sourceFactory.createXlamPanelSection, typescriptFactory.createXlamPanelSection);
  assert.equal(sourceRoot.XlamPanelSection, source.XlamPanelSection);
  assert.equal(typescriptRoot.XlamPanelSection, typescript.XlamPanelSection);
  assert.equal(sourceRoot.createXlamPanelSection, sourceFactory.createXlamPanelSection);
  assert.equal(typescriptRoot.createXlamPanelSection, typescriptFactory.createXlamPanelSection);

  const sourceSection = new source.XlamPanelSection(createOptions());
  const typescriptSection = new typescript.XlamPanelSection(createOptions());
  const material = createMaterial();

  assert.equal(sourceSection instanceof source.XlamPanelSection, true);
  assert.equal(typescriptSection instanceof typescript.XlamPanelSection, true);
  assert.equal(sourceSection instanceof typescript.XlamPanelSection, false);
  assert.equal(typescriptSection instanceof source.XlamPanelSection, false);
  assert.equal(sourceSection instanceof sourceRoot.CrossSection, true);
  assert.equal(typescriptSection instanceof typescriptRoot.CrossSection, true);
  assert.deepEqual(Object.keys(typescriptSection), Object.keys(sourceSection));
  assert.deepEqual(typescriptSection.toJSON(), sourceSection.toJSON());
  assert.equal(JSON.stringify(typescriptSection.toJSON()), JSON.stringify(sourceSection.toJSON()));
  assert.deepEqual(typescriptSection.longitudinalLayers(), sourceSection.longitudinalLayers());
  assert.deepEqual(typescriptSection.crossLayers(), sourceSection.crossLayers());
  assert.equal(typescriptSection.activeThickness(), sourceSection.activeThickness());
  assert.equal(typescriptSection.totalThickness(), sourceSection.totalThickness());
  assert.equal(
    typescriptSection.calculateBendingStiffness(material),
    sourceSection.calculateBendingStiffness(material),
  );
  assert.equal(
    typescriptSection.calculateBendingStiffness(material, { includeCrossLayerBending: true }),
    sourceSection.calculateBendingStiffness(material, { includeCrossLayerBending: true }),
  );
  assert.equal(
    typescriptSection.calculateSystemStrengthFactor(5),
    sourceSection.calculateSystemStrengthFactor(5),
  );
  assert.equal(
    typescriptSection.calculateSystemStrengthFactor(50, 400),
    sourceSection.calculateSystemStrengthFactor(50, 400),
  );
  assert.deepEqual(
    typescriptSection.calculateShearStiffness(material),
    sourceSection.calculateShearStiffness(material),
  );
  const sourceLabel = sourceSection.toJSON().metadata.label;
  const typescriptLabel = typescriptSection.toJSON().metadata.label;
  if (typeof sourceLabel !== "string" || typeof typescriptLabel !== "string") {
    throw new Error("Expected Unicode metadata labels in both serialized sections.");
  }
  assert.deepEqual(codePoints(typescriptLabel), codePoints(sourceLabel));

  const factoryOptions = {
    productId: "generic-5s-30-30-30",
    units: { force: "kN", length: "m" },
    metadata: { label: "catalogo λ" },
  };
  const sourceFactorySection = sourceFactory.createXlamPanelSection(factoryOptions);
  const typescriptFactorySection = typescriptFactory.createXlamPanelSection(factoryOptions);
  assert.deepEqual(typescriptFactorySection.toJSON(), sourceFactorySection.toJSON());
  assert.equal(
    JSON.stringify(typescriptFactorySection.toJSON()),
    JSON.stringify(sourceFactorySection.toJSON()),
  );

  const invalidConstructors: readonly [string, Record<string, unknown>][] = [
    ["missing explicit units", { effectiveWidth: 1, layerThicknesses: [0.03] }],
    [
      "non-positive effective width",
      { effectiveWidth: 0, layerThicknesses: [0.03], units: { force: "kN", length: "m" } },
    ],
    [
      "missing layer thicknesses",
      { effectiveWidth: 1, layerThicknesses: [], units: { force: "kN", length: "m" } },
    ],
    [
      "missing active parallel layer",
      {
        effectiveWidth: 1,
        layerThicknesses: [0.03],
        activeLayerIndexes: [1],
        units: { force: "kN", length: "m" },
      },
    ],
  ];
  for (const [label, options] of invalidConstructors) {
    assertErrorParity(
      () => new source.XlamPanelSection(options),
      () => new typescript.XlamPanelSection(options),
      label,
    );
  }

  assertErrorParity(
    () =>
      sourceFactory.createXlamPanelSection({
        productId: "missing",
        units: { force: "kN", length: "m" },
      }),
    () =>
      typescriptFactory.createXlamPanelSection({
        productId: "missing",
        units: { force: "kN", length: "m" },
      }),
    "unknown product without explicit layer data",
  );
  assertErrorParity(
    () => sourceFactory.createXlamPanelSection(),
    () => typescriptFactory.createXlamPanelSection(),
    "factory defaults without explicit units and layers",
  );
});
