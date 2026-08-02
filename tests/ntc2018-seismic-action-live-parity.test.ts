import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const sourceRoot = path.resolve(repositoryRoot, "..", "strutture-js");
const sourceRevision = "6f33baead8b88166c4b2cf94af41763412e3c751";

type RuntimeModule = Record<string, unknown>;
type RuntimeFunction = (...arguments_: readonly unknown[]) => unknown;

interface RuntimeResult extends RuntimeModule {
  toJSON: () => unknown;
}

function isRecord(value: unknown): value is RuntimeModule {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isFunction(value: unknown): value is RuntimeFunction {
  return typeof value === "function";
}

function requireFunction(module: RuntimeModule, name: string): RuntimeFunction {
  const value = module[name];
  if (!isFunction(value)) {
    throw new Error(`${name} must be a function.`);
  }
  return value;
}

function isRuntimeResult(value: unknown): value is RuntimeResult {
  return isRecord(value) && typeof value.toJSON === "function";
}

function requireResult(value: unknown): RuntimeResult {
  if (!isRuntimeResult(value)) {
    throw new Error("Expected a serializable CalculationResult.");
  }
  return value;
}

function gitOutput(...arguments_: readonly string[]): string {
  return execFileSync("git", ["-C", sourceRoot, ...arguments_], { encoding: "utf8" }).trim();
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

function assertUnicodeParity(source: unknown, typescript: unknown, label: string): void {
  if (typeof source === "string") {
    assert.equal(typeof typescript, "string", `${label}: string type`);
    if (typeof typescript !== "string") {
      throw new Error(`Expected ${label} to remain a string.`);
    }
    assert.deepEqual(codePoints(source), codePoints(typescript), `${label}: Unicode code points`);
    return;
  }
  if (Array.isArray(source)) {
    assert.ok(Array.isArray(typescript), `${label}: array type`);
    if (!Array.isArray(typescript)) {
      throw new Error(`Expected ${label} to remain an array.`);
    }
    assert.equal(source.length, typescript.length, `${label}: array length`);
    source.forEach((entry, index) =>
      assertUnicodeParity(entry, typescript[index], `${label}[${index}]`),
    );
    return;
  }
  if (isRecord(source)) {
    assert.ok(isRecord(typescript), `${label}: object type`);
    if (!isRecord(typescript)) {
      throw new Error(`Expected ${label} to remain an object.`);
    }
    for (const key of Object.keys(source)) {
      assertUnicodeParity(source[key], typescript[key], `${label}.${key}`);
    }
  }
}

function assertValueParity(source: unknown, typescript: unknown, label: string): void {
  assert.deepEqual(typescript, source, label);
  assert.equal(JSON.stringify(typescript), JSON.stringify(source), `${label}: exact JSON`);
  assertUnicodeParity(source, typescript, label);
}

function captureError(invoke: () => unknown): { name: string; message: string } {
  try {
    invoke();
  } catch (error) {
    return {
      name: error instanceof Error ? error.name : "unknown",
      message: error instanceof Error ? error.message : String(error),
    };
  }
  throw new Error("Expected the call to throw.");
}

async function loadModule(root: string, relativePath: string): Promise<RuntimeModule> {
  const module: unknown = await import(pathToFileURL(path.join(root, relativePath)).href);
  if (!isRecord(module)) {
    throw new Error(`The module ${relativePath} is not an object module.`);
  }
  return module;
}

const hazardParameters = {
  siteReference: "project-site-A",
  limitState: "SLV",
  returnPeriodYears: 475,
  ag: 0.25,
  agUnit: "g",
  f0: 2.5,
  tcStar: 0.35,
  tcStarUnit: "s",
  source: {
    kind: "manual-entry",
    reference: "Site hazard worksheet H-01",
  },
};

void test("NTC 2018 seismic action module matches the independent pinned JavaScript implementation", async () => {
  assert.equal(gitOutput("rev-parse", "HEAD"), sourceRevision);
  assert.equal(gitOutput("status", "--porcelain"), "");

  const sourceModule = await loadModule(
    sourceRoot,
    "src/norms/ntc2018/actions/ntc2018SeismicAction.js",
  );
  const typescriptModule = await loadModule(
    path.join(repositoryRoot, "dist"),
    "norms/ntc2018/actions/ntc2018SeismicAction.js",
  );
  const sourceKeys = Object.keys(sourceModule);
  assert.deepEqual(Object.keys(typescriptModule), sourceKeys, "exact seismic export order");
  for (const key of sourceKeys) {
    const sourceValue = sourceModule[key];
    const typescriptValue = typescriptModule[key];
    if (typeof sourceValue === "function") {
      assert.equal(typeof typescriptValue, "function", `${key}: function export`);
      assert.notEqual(sourceValue, typescriptValue, `${key}: independent implementation`);
    } else {
      assertValueParity(sourceValue, typescriptValue, key);
    }
  }

  for (const name of [
    "NTC2018_SEISMIC_LIMIT_STATES",
    "NTC2018_SITE_HAZARD_SOURCE_KINDS",
    "NTC2018_SUBSOIL_SPECTRUM_COEFFICIENTS",
    "NTC2018_TOPOGRAPHIC_AMPLIFICATION_MAXIMA",
  ]) {
    assert.equal(Object.isFrozen(sourceModule[name]), true, `${name}: source frozen`);
    assert.equal(Object.isFrozen(typescriptModule[name]), true, `${name}: TypeScript frozen`);
  }

  const sourceGetLimitState = requireFunction(
    sourceModule,
    "getNTC2018SeismicLimitStateDefinition",
  );
  const typescriptGetLimitState = requireFunction(
    typescriptModule,
    "getNTC2018SeismicLimitStateDefinition",
  );
  const sourceGetSubsoil = requireFunction(
    sourceModule,
    "getNTC2018SubsoilSpectrumCoefficientDefinition",
  );
  const typescriptGetSubsoil = requireFunction(
    typescriptModule,
    "getNTC2018SubsoilSpectrumCoefficientDefinition",
  );
  const sourceGetTopographic = requireFunction(
    sourceModule,
    "getNTC2018TopographicAmplificationDefinition",
  );
  const typescriptGetTopographic = requireFunction(
    typescriptModule,
    "getNTC2018TopographicAmplificationDefinition",
  );
  const sourceNormalize = requireFunction(sourceModule, "normalizeNTC2018SiteHazardParameters");
  const typescriptNormalize = requireFunction(
    typescriptModule,
    "normalizeNTC2018SiteHazardParameters",
  );
  const sourceStratigraphic = requireFunction(
    sourceModule,
    "calculateNTC2018StratigraphicSpectrumCoefficients",
  );
  const typescriptStratigraphic = requireFunction(
    typescriptModule,
    "calculateNTC2018StratigraphicSpectrumCoefficients",
  );
  const sourceTopographic = requireFunction(sourceModule, "resolveNTC2018TopographicAmplification");
  const typescriptTopographic = requireFunction(
    typescriptModule,
    "resolveNTC2018TopographicAmplification",
  );
  const sourceParameters = requireFunction(
    sourceModule,
    "calculateNTC2018HorizontalSpectrumParameters",
  );
  const typescriptParameters = requireFunction(
    typescriptModule,
    "calculateNTC2018HorizontalSpectrumParameters",
  );
  const sourceSpectrum = requireFunction(sourceModule, "calculateNTC2018HorizontalElasticSpectrum");
  const typescriptSpectrum = requireFunction(
    typescriptModule,
    "calculateNTC2018HorizontalElasticSpectrum",
  );

  const definitionCases: readonly [string, RuntimeFunction, RuntimeFunction, unknown][] = [
    ["limit-state", sourceGetLimitState, typescriptGetLimitState, "SLD"],
    ["subsoil", sourceGetSubsoil, typescriptGetSubsoil, "B"],
    ["topographic", sourceGetTopographic, typescriptGetTopographic, "T2"],
  ];
  for (const [label, sourceFunction, typescriptFunction, argument] of definitionCases) {
    assertValueParity(
      sourceFunction(argument),
      typescriptFunction(argument),
      `definition.${label}`,
    );
  }

  assertValueParity(
    sourceNormalize(hazardParameters),
    typescriptNormalize(hazardParameters),
    "hazard",
  );
  for (const subsoilCategory of ["A", "B", "C", "D"]) {
    assertValueParity(
      sourceStratigraphic({ subsoilCategory, agOverG: 0.25, f0: 2.5, tcStar: 0.35 }),
      typescriptStratigraphic({ subsoilCategory, agOverG: 0.25, f0: 2.5, tcStar: 0.35 }),
      `stratigraphic.${subsoilCategory}`,
    );
  }
  for (const input of [
    { topographicCategory: "T1" },
    { topographicCategory: "T2", atReferenceLocation: true },
    {
      topographicCategory: "T4",
      coefficient: 1.2,
      coefficientSource: "Topographic interpolation T-01",
    },
  ]) {
    assertValueParity(
      sourceTopographic(input),
      typescriptTopographic(input),
      "topographic-resolution",
    );
  }
  assertValueParity(
    sourceParameters({
      agOverG: 0.25,
      f0: 2.5,
      tcStar: 0.35,
      subsoilCategory: "B",
      topographicCategory: "T1",
    }),
    typescriptParameters({
      agOverG: 0.25,
      f0: 2.5,
      tcStar: 0.35,
      subsoilCategory: "B",
      topographicCategory: "T1",
    }),
    "spectrum-parameters",
  );

  const spectrumInput = {
    actionId: "seismic-x",
    hazardParameters,
    subsoilCategory: "B",
    topographicCategory: "T1",
    periods: [0, 0.1, 0.35, 1, 2.6, 4],
  };
  const sourceResult = sourceSpectrum(spectrumInput);
  const typescriptResult = typescriptSpectrum(spectrumInput);
  const sourceCalculationResult = requireResult(sourceResult);
  const typescriptCalculationResult = requireResult(typescriptResult);
  assertValueParity(
    sourceCalculationResult.toJSON(),
    typescriptCalculationResult.toJSON(),
    "horizontal-spectrum-json",
  );

  const sourceUnsupported = sourceSpectrum({
    ...spectrumInput,
    periods: [0, 4.01],
  });
  const typescriptUnsupported = typescriptSpectrum({
    ...spectrumInput,
    periods: [0, 4.01],
  });
  const sourceUnsupportedResult = requireResult(sourceUnsupported);
  const typescriptUnsupportedResult = requireResult(typescriptUnsupported);
  assertValueParity(
    sourceUnsupportedResult.toJSON(),
    typescriptUnsupportedResult.toJSON(),
    "unsupported-periods",
  );

  const errorCases: readonly [string, () => unknown, () => unknown][] = [
    [
      "invalid-hazard-unit",
      () => sourceNormalize({ ...hazardParameters, agUnit: "m/s2" }),
      () => typescriptNormalize({ ...hazardParameters, agUnit: "m/s2" }),
    ],
    [
      "unsupported-subsoil",
      () => sourceStratigraphic({ subsoilCategory: "S1", agOverG: 0.25, f0: 2.5, tcStar: 0.35 }),
      () =>
        typescriptStratigraphic({ subsoilCategory: "S1", agOverG: 0.25, f0: 2.5, tcStar: 0.35 }),
    ],
    [
      "missing-topographic-coefficient",
      () => sourceTopographic({ topographicCategory: "T2" }),
      () => typescriptTopographic({ topographicCategory: "T2" }),
    ],
  ];
  for (const [label, sourceCall, typescriptCall] of errorCases) {
    assert.deepEqual(captureError(sourceCall), captureError(typescriptCall), `errors.${label}`);
  }

  const sourceRootModule = await loadModule(sourceRoot, "src/index.js");
  const typescriptRootModule = await loadModule(path.join(repositoryRoot, "dist"), "index.js");
  for (const key of sourceKeys) {
    assert.equal(sourceRootModule[key], sourceModule[key], `source root alias: ${key}`);
    assert.equal(typescriptRootModule[key], typescriptModule[key], `TypeScript root alias: ${key}`);
  }
});
