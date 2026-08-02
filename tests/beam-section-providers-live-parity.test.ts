import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const sourceRoot = path.resolve(repositoryRoot, "..", "strutture-js");
const sourceRevision = "6f33baead8b88166c4b2cf94af41763412e3c751";

type RuntimeProperties = Record<string, unknown>;

interface RuntimeProvider {
  readonly section: Record<string, unknown>;
  readonly material: Record<string, unknown>;
  getElasticBeamProperties(context?: unknown): RuntimeProperties;
}

type RuntimeProviderConstructor = new (options?: unknown) => RuntimeProvider;
type RuntimeProviderFactory = (options?: unknown) => RuntimeProvider;

interface RuntimeBeamModule {
  readonly SteelBeamSectionProvider: RuntimeProviderConstructor;
  readonly TimberBeamSectionProvider: RuntimeProviderConstructor;
  readonly XlamBeamSectionProvider: RuntimeProviderConstructor;
  readonly createSteelBeamSectionProvider: RuntimeProviderFactory;
  readonly createTimberBeamSectionProvider: RuntimeProviderFactory;
  readonly createXlamBeamSectionProvider: RuntimeProviderFactory;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isRuntimeBeamModule(value: unknown): value is RuntimeBeamModule {
  if (!isRecord(value)) return false;

  return [
    "SteelBeamSectionProvider",
    "TimberBeamSectionProvider",
    "XlamBeamSectionProvider",
    "createSteelBeamSectionProvider",
    "createTimberBeamSectionProvider",
    "createXlamBeamSectionProvider",
  ].every((name) => typeof value[name] === "function");
}

function gitOutput(...arguments_: readonly string[]): string {
  return execFileSync("git", ["-C", sourceRoot, ...arguments_], { encoding: "utf8" }).trim();
}

function assertSourceBaseline(): void {
  assert.equal(gitOutput("rev-parse", "HEAD"), sourceRevision);
  assert.equal(gitOutput("status", "--porcelain"), "");
}

function codePoints(value: string): number[] {
  return Array.from(value, (character) => {
    const codePoint = character.codePointAt(0);
    if (codePoint === undefined) throw new Error("Expected a code point for every character.");
    return codePoint;
  });
}

function assertExactValues(source: unknown, typescript: unknown, label: string): void {
  assert.equal(JSON.stringify(typescript), JSON.stringify(source), `${label}: exact JSON`);

  const compare = (left: unknown, right: unknown, valuePath: string): void => {
    if (typeof left === "number" || typeof right === "number") {
      assert.equal(typeof left, "number", `${label}${valuePath}`);
      assert.equal(typeof right, "number", `${label}${valuePath}`);
      assert.equal(left, right, `${label}${valuePath}: exact number`);
      return;
    }

    if (typeof left === "string" || typeof right === "string") {
      assert.equal(typeof left, "string", `${label}${valuePath}`);
      assert.equal(typeof right, "string", `${label}${valuePath}`);
      if (typeof left === "string" && typeof right === "string") {
        assert.equal(left, right, `${label}${valuePath}`);
        assert.deepEqual(codePoints(left), codePoints(right), `${label}${valuePath}: Unicode`);
      }
      return;
    }

    if (Array.isArray(left) || Array.isArray(right)) {
      assert.ok(Array.isArray(left) && Array.isArray(right), `${label}${valuePath}`);
      if (!Array.isArray(left) || !Array.isArray(right)) return;
      assert.equal(left.length, right.length, `${label}${valuePath}.length`);
      left.forEach((entry, index) => compare(entry, right[index], `${valuePath}[${index}]`));
      return;
    }

    if (isRecord(left) || isRecord(right)) {
      assert.ok(isRecord(left) && isRecord(right), `${label}${valuePath}`);
      if (!isRecord(left) || !isRecord(right)) return;
      const leftKeys = Object.keys(left);
      assert.deepEqual(leftKeys, Object.keys(right), `${label}${valuePath}.keys`);
      leftKeys.forEach((key) => compare(left[key], right[key], `${valuePath}.${key}`));
    }
  };

  compare(source, typescript, "");
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

function steelFixture(): {
  options: Record<string, unknown>;
  context: Record<string, unknown>;
} {
  return {
    options: {
      section: {
        area: 10_000,
        inertiaY: 80_000_000,
        inertiaZ: 30_000_000,
        shearAreaY: 5_000,
        shearAreaZ: 3_000,
        profileName: "IPE-Δ😀",
        family: "I",
        convertedCatalogProperties: {
          Wel_y: 300_000,
          Wpl_y: 350_000,
        },
      },
      material: {
        elasticModulus: 210_000,
        shearModulus: 80_000,
        fyk: 275,
        grade: "S275",
        metadata: { gammaM0: 1 },
      },
      metadata: { label: "acciaio: è" },
    },
    context: {
      limitState: "ULS",
      sectionRotation: { alpha: 15, units: "deg" },
    },
  };
}

function timberFixture(): {
  options: Record<string, unknown>;
  context: Record<string, unknown>;
} {
  return {
    options: {
      section: {
        area: 28_800,
        inertiaY: 138_240_000,
        inertiaZ: 41_472_000,
        shearAreaY: 24_000,
        shearAreaZ: 18_000,
        units: { force: "N", length: "mm" },
      },
      material: {
        elasticModulus: 11_000,
        gMean: 690,
        fmK: 24,
        fvK: 2.7,
        fc0K: 21,
        ft0K: 14,
        serviceClass: 2,
        metadata: {
          timberType: "glued-laminated-timber",
          gammaM: 1.4,
          kdef: 0.6,
        },
      },
      kmodByDuration: { permanent: 0.6, medium: 0.8 },
      metadata: { label: "legno: λ" },
    },
    context: {
      governingLoadDurationClass: "permanent",
      deformationState: "final",
      serviceCombination: "quasi-permanent",
      sectionRotation: { alpha: 10, units: "deg" },
    },
  };
}

function xlamFixture(): {
  options: Record<string, unknown>;
  context: Record<string, unknown>;
} {
  return {
    options: {
      section: {
        area: 100_000,
        inertiaZ: 10_000_000,
        effectiveWidth: 1_000,
        layerThicknesses: [30, 20, 30, 20, 30],
        activeLayerIndexes: [0, 2, 4],
        crossLayers: () => [{ thickness: 20 }, { thickness: 20 }],
        activeThickness: () => 90,
        totalThickness: () => 130,
        calculateBendingStiffness: (
          _material: unknown,
          options: { includeCrossLayerBending: boolean },
        ) => (options.includeCrossLayerBending ? 1_200_000_000 : 1_100_000_000),
        calculateShearStiffness: (_material: unknown, options: Record<string, unknown>) => ({
          shearStiffness: 0,
          shearCorrectionCoefficient: options.method === "rolling" ? 0.9 : 1,
          shearAreaWeighted: true,
        }),
      },
      material: {
        e0Mean: 11_000,
        g0Mean: 690,
        g90Mean: 70,
        metadata: { kdef: 0.8 },
      },
      includeCrossLayerBending: true,
      shearOptions: { method: "rolling" },
      metadata: { label: "XLAM: 木" },
    },
    context: {
      deformationState: "final",
      serviceCombination: "quasi-permanent",
      sectionRotation: { alpha: 5, units: "deg" },
    },
  };
}

function mergeModules(...modules: readonly unknown[]): Record<string, unknown> {
  return modules.reduce<Record<string, unknown>>(
    (merged, module) => ({ ...merged, ...(isRecord(module) ? module : {}) }),
    {},
  );
}

async function loadModules(): Promise<{
  source: RuntimeBeamModule;
  typescript: RuntimeBeamModule;
}> {
  const sourceSteel: unknown = await import(
    pathToFileURL(path.join(sourceRoot, "src", "domain", "beams", "SteelBeamSectionProvider.js"))
      .href
  );
  const sourceTimber: unknown = await import(
    pathToFileURL(path.join(sourceRoot, "src", "domain", "beams", "TimberBeamSectionProvider.js"))
      .href
  );
  const sourceXlam: unknown = await import(
    pathToFileURL(path.join(sourceRoot, "src", "domain", "beams", "XlamBeamSectionProvider.js"))
      .href
  );
  const typescriptSteel: unknown = await import(
    pathToFileURL(
      path.join(repositoryRoot, "dist", "domain", "beams", "SteelBeamSectionProvider.js"),
    ).href
  );
  const typescriptTimber: unknown = await import(
    pathToFileURL(
      path.join(repositoryRoot, "dist", "domain", "beams", "TimberBeamSectionProvider.js"),
    ).href
  );
  const typescriptXlam: unknown = await import(
    pathToFileURL(
      path.join(repositoryRoot, "dist", "domain", "beams", "XlamBeamSectionProvider.js"),
    ).href
  );

  const sourceRuntime = mergeModules(sourceSteel, sourceTimber, sourceXlam);
  const typescriptRuntime = mergeModules(typescriptSteel, typescriptTimber, typescriptXlam);
  if (!isRuntimeBeamModule(sourceRuntime) || !isRuntimeBeamModule(typescriptRuntime)) {
    throw new Error("Beam provider modules do not expose the expected public constructors.");
  }

  return { source: sourceRuntime, typescript: typescriptRuntime };
}

function compareProvider(
  sourceFactory: RuntimeProviderFactory,
  typescriptFactory: RuntimeProviderFactory,
  sourceConstructor: RuntimeProviderConstructor,
  typescriptConstructor: RuntimeProviderConstructor,
  fixture: { options: Record<string, unknown>; context: Record<string, unknown> },
  label: string,
): void {
  const sourceProvider = sourceFactory(fixture.options);
  const typescriptProvider = typescriptFactory(fixture.options);
  const sourceProperties = sourceProvider.getElasticBeamProperties(fixture.context);
  const typescriptProperties = typescriptProvider.getElasticBeamProperties(fixture.context);

  assert.notEqual(sourceConstructor, typescriptConstructor, `${label}: independent constructors`);
  assert.equal(sourceProvider instanceof sourceConstructor, true, `${label}: source instanceof`);
  assert.equal(
    typescriptProvider instanceof typescriptConstructor,
    true,
    `${label}: TypeScript instanceof`,
  );
  assert.equal(
    sourceProvider instanceof typescriptConstructor,
    false,
    `${label}: cross-runtime instanceof`,
  );
  assertExactValues(sourceProperties, typescriptProperties, label);
  assert.equal(
    sourceProperties.axialRigidity,
    typescriptProperties.axialRigidity,
    `${label}: axial rigidity`,
  );
  assert.equal(
    sourceProperties.flexuralRigidity,
    typescriptProperties.flexuralRigidity,
    `${label}: flexural rigidity`,
  );
  assert.equal(
    sourceProperties.shearRigidity,
    typescriptProperties.shearRigidity,
    `${label}: shear rigidity`,
  );
}

void test("beam section providers match independent pinned JavaScript implementations", async () => {
  assertSourceBaseline();
  const { source, typescript } = await loadModules();

  compareProvider(
    source.createSteelBeamSectionProvider,
    typescript.createSteelBeamSectionProvider,
    source.SteelBeamSectionProvider,
    typescript.SteelBeamSectionProvider,
    steelFixture(),
    "steel provider",
  );
  compareProvider(
    source.createTimberBeamSectionProvider,
    typescript.createTimberBeamSectionProvider,
    source.TimberBeamSectionProvider,
    typescript.TimberBeamSectionProvider,
    timberFixture(),
    "timber provider",
  );
  compareProvider(
    source.createXlamBeamSectionProvider,
    typescript.createXlamBeamSectionProvider,
    source.XlamBeamSectionProvider,
    typescript.XlamBeamSectionProvider,
    xlamFixture(),
    "XLAM provider",
  );

  assertErrorParity(
    () => new source.SteelBeamSectionProvider(),
    () => new typescript.SteelBeamSectionProvider(),
    "steel missing section",
  );
  assertErrorParity(
    () => new source.TimberBeamSectionProvider({ section: {} }),
    () => new typescript.TimberBeamSectionProvider({ section: {} }),
    "timber missing material",
  );
  assertErrorParity(
    () => new source.XlamBeamSectionProvider({ section: {} }),
    () => new typescript.XlamBeamSectionProvider({ section: {} }),
    "XLAM missing material",
  );

  const steelInvalid = steelFixture();
  const timberInvalid = timberFixture();
  const xlamInvalid = xlamFixture();
  const steelSection = steelInvalid.options.section;
  const timberSection = timberInvalid.options.section;
  const xlamSection = xlamInvalid.options.section;
  assert.ok(isRecord(steelSection) && isRecord(timberSection) && isRecord(xlamSection));
  steelSection.area = 0;
  timberSection.area = 0;
  xlamSection.area = 0;

  assertErrorParity(
    () => source.createSteelBeamSectionProvider(steelInvalid.options).getElasticBeamProperties(),
    () =>
      typescript.createSteelBeamSectionProvider(steelInvalid.options).getElasticBeamProperties(),
    "steel unsupported area",
  );
  assertErrorParity(
    () => source.createTimberBeamSectionProvider(timberInvalid.options).getElasticBeamProperties(),
    () =>
      typescript.createTimberBeamSectionProvider(timberInvalid.options).getElasticBeamProperties(),
    "timber unsupported area",
  );
  assertErrorParity(
    () => source.createXlamBeamSectionProvider(xlamInvalid.options).getElasticBeamProperties(),
    () => typescript.createXlamBeamSectionProvider(xlamInvalid.options).getElasticBeamProperties(),
    "XLAM unsupported area",
  );
});
