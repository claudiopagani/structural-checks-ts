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

const units = { force: "kN", length: "m" };

void test("NTC 2018 wind-load module matches the independent pinned JavaScript implementation", async () => {
  assert.equal(gitOutput("rev-parse", "HEAD"), sourceRevision);
  assert.equal(gitOutput("status", "--porcelain"), "");

  const sourceModule = await loadModule(sourceRoot, "src/norms/ntc2018/actions/ntc2018WindLoad.js");
  const typescriptModule = await loadModule(
    path.join(repositoryRoot, "dist"),
    "norms/ntc2018/actions/ntc2018WindLoad.js",
  );
  const sourceKeys = Object.keys(sourceModule);
  assert.deepEqual(Object.keys(typescriptModule), sourceKeys, "exact wind export order");
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
  for (const name of ["NTC2018_WIND_ZONES", "NTC2018_WIND_EXPOSURE_CATEGORIES"]) {
    assert.equal(Object.isFrozen(sourceModule[name]), true, `${name}: source frozen`);
    assert.equal(Object.isFrozen(typescriptModule[name]), true, `${name}: TypeScript frozen`);
  }

  const sourceZoneDefinition = requireFunction(sourceModule, "getNTC2018WindZoneDefinition");
  const typescriptZoneDefinition = requireFunction(
    typescriptModule,
    "getNTC2018WindZoneDefinition",
  );
  const sourceExposureDefinition = requireFunction(
    sourceModule,
    "getNTC2018WindExposureCategoryDefinition",
  );
  const typescriptExposureDefinition = requireFunction(
    typescriptModule,
    "getNTC2018WindExposureCategoryDefinition",
  );
  const sourceBase = requireFunction(sourceModule, "calculateNTC2018BaseWindSpeed");
  const typescriptBase = requireFunction(typescriptModule, "calculateNTC2018BaseWindSpeed");
  const sourceReturn = requireFunction(sourceModule, "calculateNTC2018WindReturnCoefficient");
  const typescriptReturn = requireFunction(
    typescriptModule,
    "calculateNTC2018WindReturnCoefficient",
  );
  const sourceReferenceSpeed = requireFunction(sourceModule, "calculateNTC2018ReferenceWindSpeed");
  const typescriptReferenceSpeed = requireFunction(
    typescriptModule,
    "calculateNTC2018ReferenceWindSpeed",
  );
  const sourceReferencePressure = requireFunction(
    sourceModule,
    "calculateNTC2018ReferenceWindPressure",
  );
  const typescriptReferencePressure = requireFunction(
    typescriptModule,
    "calculateNTC2018ReferenceWindPressure",
  );
  const sourceExposure = requireFunction(sourceModule, "calculateNTC2018WindExposureCoefficient");
  const typescriptExposure = requireFunction(
    typescriptModule,
    "calculateNTC2018WindExposureCoefficient",
  );
  const sourcePressure = requireFunction(sourceModule, "calculateNTC2018WindPressure");
  const typescriptPressure = requireFunction(typescriptModule, "calculateNTC2018WindPressure");
  const sourceArea = requireFunction(sourceModule, "calculateNTC2018WindAreaLoad");
  const typescriptArea = requireFunction(typescriptModule, "calculateNTC2018WindAreaLoad");

  assertValueParity(
    sourceZoneDefinition("ZONE_8"),
    typescriptZoneDefinition("ZONE_8"),
    "zone-definition",
  );
  assertValueParity(
    sourceExposureDefinition("IV"),
    typescriptExposureDefinition("IV"),
    "exposure-definition",
  );
  assertValueParity(
    sourceBase({ zone: "ZONE_3", siteAltitude: 500, units }),
    typescriptBase({ zone: "ZONE_3", siteAltitude: 500, units }),
    "base-wind-below-reference-altitude",
  );
  assertValueParity(
    sourceBase({ zone: "ZONE_3", siteAltitude: 1000, units }),
    typescriptBase({ zone: "ZONE_3", siteAltitude: 1000, units }),
    "base-wind-above-reference-altitude",
  );
  assertValueParity(
    sourceBase({
      zone: "ZONE_2",
      siteAltitude: 750000,
      units: { force: "N", length: "mm" },
    }),
    typescriptBase({
      zone: "ZONE_2",
      siteAltitude: 750000,
      units: { force: "N", length: "mm" },
    }),
    "base-wind-unit-conversion",
  );
  assertValueParity(
    sourceBase({
      zone: "ZONE_3",
      siteAltitude: 1600,
      baseWindSpeed: 55,
      baseWindSpeedUnit: "m/s",
      baseWindSpeedSource: "Local wind study W-01",
      units,
    }),
    typescriptBase({
      zone: "ZONE_3",
      siteAltitude: 1600,
      baseWindSpeed: 55,
      baseWindSpeedUnit: "m/s",
      baseWindSpeedSource: "Local wind study W-01",
      units,
    }),
    "documented-base-wind",
  );
  assertValueParity(
    sourceReturn({ returnPeriodYears: 50 }),
    typescriptReturn({ returnPeriodYears: 50 }),
    "return-coefficient-50",
  );
  assertValueParity(
    sourceReturn({ returnPeriodYears: 5 }),
    typescriptReturn({ returnPeriodYears: 5 }),
    "return-coefficient-5",
  );
  assertValueParity(
    sourceReferenceSpeed({ baseWindSpeed: 25, returnPeriodYears: 50, velocityUnit: "m/s" }),
    typescriptReferenceSpeed({ baseWindSpeed: 25, returnPeriodYears: 50, velocityUnit: "m/s" }),
    "reference-wind-speed",
  );
  assertValueParity(
    sourceReferencePressure({ referenceWindSpeed: 25, velocityUnit: "m/s" }),
    typescriptReferencePressure({ referenceWindSpeed: 25, velocityUnit: "m/s" }),
    "reference-wind-pressure",
  );
  assertValueParity(
    sourceExposure({ exposureCategory: "II", heightAboveGround: 10, units }),
    typescriptExposure({ exposureCategory: "II", heightAboveGround: 10, units }),
    "exposure-coefficient",
  );
  assertValueParity(
    sourceExposure({ exposureCategory: "IV", heightAboveGround: 5, units }),
    typescriptExposure({ exposureCategory: "IV", heightAboveGround: 5, units }),
    "exposure-minimum-height",
  );
  assertValueParity(
    sourcePressure({
      referenceWindPressure: 0.000390625,
      exposureCoefficient: 2.5,
      pressureCoefficient: -0.8,
      dynamicCoefficient: 1,
      units: { force: "N", length: "mm" },
    }),
    typescriptPressure({
      referenceWindPressure: 0.000390625,
      exposureCoefficient: 2.5,
      pressureCoefficient: -0.8,
      dynamicCoefficient: 1,
      units: { force: "N", length: "mm" },
    }),
    "wind-pressure-suction",
  );

  const normalInput = {
    id: "facade-wind",
    actionId: "wind-action",
    zone: "ZONE_1",
    siteAltitude: 100,
    returnPeriodYears: 50,
    exposureCategory: "II",
    heightAboveGround: 10,
    pressureCoefficient: -0.8,
    pressureCoefficientSource: "Documented facade coefficient CP-01",
    constructionHeight: 20,
    regularConstruction: true,
    units,
  };
  assertValueParity(
    requireResult(sourceArea(normalInput)).toJSON(),
    requireResult(typescriptArea(normalInput)).toJSON(),
    "normal-wind-workflow",
  );
  assertValueParity(
    requireResult(
      sourceArea({
        zone: "ZONE_2",
        siteAltitude: 1600,
        heightAboveGround: 10,
        constructionHeight: 20,
        units,
      }),
    ).toJSON(),
    requireResult(
      typescriptArea({
        zone: "ZONE_2",
        siteAltitude: 1600,
        heightAboveGround: 10,
        constructionHeight: 20,
        units,
      }),
    ).toJSON(),
    "unsupported-site-altitude",
  );
  assertValueParity(
    requireResult(
      sourceArea({
        zone: "ZONE_2",
        siteAltitude: 100,
        exposureCategory: "II",
        heightAboveGround: 210,
        constructionHeight: 220,
        units,
      }),
    ).toJSON(),
    requireResult(
      typescriptArea({
        zone: "ZONE_2",
        siteAltitude: 100,
        exposureCategory: "II",
        heightAboveGround: 210,
        constructionHeight: 220,
        units,
      }),
    ).toJSON(),
    "unsupported-exposure-height",
  );
  assertValueParity(
    requireResult(
      sourceArea({
        zone: "ZONE_2",
        siteAltitude: 100,
        exposureCategory: "II",
        heightAboveGround: 60,
        pressureCoefficient: 0.8,
        pressureCoefficientSource: "CP-regular",
        constructionHeight: 100,
        regularConstruction: true,
        units,
      }),
    ).toJSON(),
    requireResult(
      typescriptArea({
        zone: "ZONE_2",
        siteAltitude: 100,
        exposureCategory: "II",
        heightAboveGround: 60,
        pressureCoefficient: 0.8,
        pressureCoefficientSource: "CP-regular",
        constructionHeight: 100,
        regularConstruction: true,
        units,
      }),
    ).toJSON(),
    "unsupported-dynamic-coefficient",
  );
  const documentedInput = {
    zone: "ZONE_8",
    siteAltitude: 100,
    exposureCoefficient: 4.2,
    exposureCoefficientSource: "Site exposure study CE-01",
    heightAboveGround: 210,
    pressureCoefficient: 1.1,
    pressureCoefficientSource: "Wind tunnel coefficient CP-01",
    constructionHeight: 220,
    regularConstruction: false,
    dynamicCoefficient: 1.25,
    dynamicCoefficientSource: "Dynamic study CD-01",
    units,
  };
  assertValueParity(
    requireResult(sourceArea(documentedInput)).toJSON(),
    requireResult(typescriptArea(documentedInput)).toJSON(),
    "documented-coefficients-workflow",
  );

  const errorCases: readonly [string, () => unknown, () => unknown][] = [
    [
      "unsupported-zone",
      () => sourceBase({ zone: "ZONE_10", siteAltitude: 100, units }),
      () => typescriptBase({ zone: "ZONE_10", siteAltitude: 100, units }),
    ],
    [
      "invalid-base-unit",
      () =>
        sourceBase({
          zone: "ZONE_1",
          siteAltitude: 100,
          baseWindSpeed: 30,
          baseWindSpeedUnit: "km/h",
          baseWindSpeedSource: "Study",
          units,
        }),
      () =>
        typescriptBase({
          zone: "ZONE_1",
          siteAltitude: 100,
          baseWindSpeed: 30,
          baseWindSpeedUnit: "km/h",
          baseWindSpeedSource: "Study",
          units,
        }),
    ],
    [
      "return-period-floor",
      () => sourceReturn({ returnPeriodYears: 4.99 }),
      () => typescriptReturn({ returnPeriodYears: 4.99 }),
    ],
    [
      "missing-pressure-source",
      () => sourceArea({ ...normalInput, pressureCoefficientSource: null }),
      () => typescriptArea({ ...normalInput, pressureCoefficientSource: null }),
    ],
    [
      "ambiguous-exposure-input",
      () => sourceArea({ ...normalInput, exposureCoefficient: 2 }),
      () => typescriptArea({ ...normalInput, exposureCoefficient: 2 }),
    ],
    [
      "height-exceeds-construction",
      () => sourceArea({ ...normalInput, heightAboveGround: 30, constructionHeight: 20 }),
      () => typescriptArea({ ...normalInput, heightAboveGround: 30, constructionHeight: 20 }),
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
