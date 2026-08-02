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
const temperatureUnit = "degC";

void test("NTC 2018 thermal-action module matches the independent pinned JavaScript implementation", async () => {
  assert.equal(gitOutput("rev-parse", "HEAD"), sourceRevision);
  assert.equal(gitOutput("status", "--porcelain"), "");

  const sourceModule = await loadModule(
    sourceRoot,
    "src/norms/ntc2018/actions/ntc2018ThermalAction.js",
  );
  const typescriptModule = await loadModule(
    path.join(repositoryRoot, "dist"),
    "norms/ntc2018/actions/ntc2018ThermalAction.js",
  );
  const sourceKeys = Object.keys(sourceModule);
  assert.deepEqual(Object.keys(typescriptModule), sourceKeys, "exact thermal export order");
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
    "NTC2018_EXTERNAL_AIR_TEMPERATURE_ZONES",
    "NTC2018_SIMPLIFIED_BUILDING_TEMPERATURE_CHANGES",
    "NTC2018_SUMMER_SOLAR_TEMPERATURE_INCREMENTS",
    "NTC2018_THERMAL_EXPANSION_COEFFICIENTS",
  ]) {
    assert.equal(Object.isFrozen(sourceModule[name]), true, `${name}: source frozen`);
    assert.equal(Object.isFrozen(typescriptModule[name]), true, `${name}: TypeScript frozen`);
  }
  const sourceZones = sourceModule.NTC2018_EXTERNAL_AIR_TEMPERATURE_ZONES;
  const typescriptZones = typescriptModule.NTC2018_EXTERNAL_AIR_TEMPERATURE_ZONES;
  if (isRecord(sourceZones) && isRecord(typescriptZones)) {
    for (const key of Object.keys(sourceZones)) {
      assert.equal(Object.isFrozen(sourceZones[key]), true, `${key}: source zone frozen`);
      assert.equal(Object.isFrozen(typescriptZones[key]), true, `${key}: TypeScript zone frozen`);
    }
  }

  const sourceExternal = requireFunction(sourceModule, "calculateNTC2018ExternalAirTemperatures");
  const typescriptExternal = requireFunction(
    typescriptModule,
    "calculateNTC2018ExternalAirTemperatures",
  );
  const sourceInternal = requireFunction(sourceModule, "resolveNTC2018InternalAirTemperature");
  const typescriptInternal = requireFunction(
    typescriptModule,
    "resolveNTC2018InternalAirTemperature",
  );
  const sourceInitial = requireFunction(sourceModule, "resolveNTC2018InitialTemperature");
  const typescriptInitial = requireFunction(typescriptModule, "resolveNTC2018InitialTemperature");
  const sourceSolar = requireFunction(sourceModule, "getNTC2018SolarTemperatureIncrement");
  const typescriptSolar = requireFunction(typescriptModule, "getNTC2018SolarTemperatureIncrement");
  const sourceMean = requireFunction(sourceModule, "calculateNTC2018MeanElementTemperature");
  const typescriptMean = requireFunction(
    typescriptModule,
    "calculateNTC2018MeanElementTemperature",
  );
  const sourceUniform = requireFunction(sourceModule, "calculateNTC2018UniformTemperatureChange");
  const typescriptUniform = requireFunction(
    typescriptModule,
    "calculateNTC2018UniformTemperatureChange",
  );
  const sourceStrain = requireFunction(sourceModule, "calculateNTC2018FreeThermalStrain");
  const typescriptStrain = requireFunction(typescriptModule, "calculateNTC2018FreeThermalStrain");
  const sourceExpansion = requireFunction(
    sourceModule,
    "resolveNTC2018ThermalExpansionCoefficient",
  );
  const typescriptExpansion = requireFunction(
    typescriptModule,
    "resolveNTC2018ThermalExpansionCoefficient",
  );
  const sourceBuilding = requireFunction(sourceModule, "calculateNTC2018BuildingThermalActions");
  const typescriptBuilding = requireFunction(
    typescriptModule,
    "calculateNTC2018BuildingThermalActions",
  );
  const sourceExternalDefinition = requireFunction(
    sourceModule,
    "getNTC2018ExternalAirTemperatureZoneDefinition",
  );
  const typescriptExternalDefinition = requireFunction(
    typescriptModule,
    "getNTC2018ExternalAirTemperatureZoneDefinition",
  );
  const sourceSimplifiedDefinition = requireFunction(
    sourceModule,
    "getNTC2018SimplifiedBuildingTemperatureChange",
  );
  const typescriptSimplifiedDefinition = requireFunction(
    typescriptModule,
    "getNTC2018SimplifiedBuildingTemperatureChange",
  );
  const sourceExpansionDefinition = requireFunction(
    sourceModule,
    "getNTC2018ThermalExpansionCoefficientDefinition",
  );
  const typescriptExpansionDefinition = requireFunction(
    typescriptModule,
    "getNTC2018ThermalExpansionCoefficientDefinition",
  );

  assertValueParity(
    sourceExternalDefinition("II"),
    typescriptExternalDefinition("II"),
    "external-zone-definition",
  );
  assertValueParity(
    sourceSimplifiedDefinition("EXPOSED_STEEL"),
    typescriptSimplifiedDefinition("EXPOSED_STEEL"),
    "simplified-building-definition",
  );
  assertValueParity(
    sourceExpansionDefinition("structural-steel"),
    typescriptExpansionDefinition("structural-steel"),
    "expansion-definition",
  );
  assertValueParity(
    sourceExternal({ zone: "I", siteAltitude: 500, temperatureUnit, units }),
    typescriptExternal({ zone: "I", siteAltitude: 500, temperatureUnit, units }),
    "external-temperature-zone-I",
  );
  assertValueParity(
    sourceExternal({
      zone: "IV",
      siteAltitude: 500000,
      temperatureUnit,
      units: { force: "N", length: "mm" },
    }),
    typescriptExternal({
      zone: "IV",
      siteAltitude: 500000,
      temperatureUnit,
      units: { force: "N", length: "mm" },
    }),
    "external-temperature-unit-conversion",
  );
  assertValueParity(
    sourceInternal({ temperatureUnit }),
    typescriptInternal({ temperatureUnit }),
    "internal-temperature-default",
  );
  assertValueParity(
    sourceInternal({ value: 18, source: "Building use specification T-01", temperatureUnit }),
    typescriptInternal({ value: 18, source: "Building use specification T-01", temperatureUnit }),
    "internal-temperature-documented",
  );
  assertValueParity(
    sourceInitial({ temperatureUnit }),
    typescriptInitial({ temperatureUnit }),
    "initial-temperature-default",
  );
  assertValueParity(
    sourceInitial({ value: 12, source: "Construction record T0-01", temperatureUnit }),
    typescriptInitial({ value: 12, source: "Construction record T0-01", temperatureUnit }),
    "initial-temperature-documented",
  );
  assertValueParity(
    sourceSolar({
      season: "SUMMER",
      surfaceNature: "LIGHT",
      orientation: "SOUTH_WEST_OR_HORIZONTAL",
    }),
    typescriptSolar({
      season: "SUMMER",
      surfaceNature: "LIGHT",
      orientation: "SOUTH_WEST_OR_HORIZONTAL",
    }),
    "solar-summer",
  );
  assertValueParity(
    sourceSolar({ season: "WINTER", surfaceNature: "DARK", orientation: "NORTH_EAST" }),
    typescriptSolar({ season: "WINTER", surfaceNature: "DARK", orientation: "NORTH_EAST" }),
    "solar-winter",
  );
  assertValueParity(
    sourceMean({ externalSurfaceTemperature: 40, internalSurfaceTemperature: 20, temperatureUnit }),
    typescriptMean({
      externalSurfaceTemperature: 40,
      internalSurfaceTemperature: 20,
      temperatureUnit,
    }),
    "mean-temperature",
  );
  assertValueParity(
    sourceUniform({ meanTemperature: 30, initialTemperature: 15, temperatureUnit }),
    typescriptUniform({ meanTemperature: 30, initialTemperature: 15, temperatureUnit }),
    "uniform-temperature-change",
  );
  assertValueParity(
    sourceStrain({ thermalExpansionCoefficient: 8e-6, temperatureChange: -20, temperatureUnit }),
    typescriptStrain({
      thermalExpansionCoefficient: 8e-6,
      temperatureChange: -20,
      temperatureUnit,
    }),
    "free-thermal-strain",
  );
  assertValueParity(
    sourceExpansion({ materialId: "structural-steel" }),
    typescriptExpansion({ materialId: "structural-steel" }),
    "fixed-expansion",
  );
  assertValueParity(
    sourceExpansion({ materialId: "masonry", value: 8e-6 }),
    typescriptExpansion({ materialId: "masonry", value: 8e-6 }),
    "range-expansion",
  );

  const simplifiedInput = {
    summerActionId: "thermal-plus",
    winterActionId: "thermal-minus",
    simplifiedBuildingType: "EXPOSED_STEEL",
    temperatureUnit,
  };
  assertValueParity(
    requireResult(sourceBuilding(simplifiedInput)).toJSON(),
    requireResult(typescriptBuilding(simplifiedInput)).toJSON(),
    "simplified-building-workflow",
  );
  const explicitInput = {
    summerMeanTemperature: 37,
    winterMeanTemperature: -5,
    temperatureStateSource: "Envelope heat-transfer study HT-01",
    initialTemperature: 12,
    initialTemperatureSource: "Construction record T0-01",
    temperatureUnit,
  };
  assertValueParity(
    requireResult(sourceBuilding(explicitInput)).toJSON(),
    requireResult(typescriptBuilding(explicitInput)).toJSON(),
    "explicit-building-workflow",
  );
  const defaultInitialInput = {
    summerMeanTemperature: 37,
    winterMeanTemperature: -5,
    temperatureStateSource: "Envelope heat-transfer study HT-02",
    temperatureUnit,
  };
  assertValueParity(
    requireResult(sourceBuilding(defaultInitialInput)).toJSON(),
    requireResult(typescriptBuilding(defaultInitialInput)).toJSON(),
    "default-initial-building-workflow",
  );

  const errorCases: readonly [string, () => unknown, () => unknown][] = [
    [
      "unsupported-zone",
      () => sourceExternal({ zone: "V", siteAltitude: 100, temperatureUnit, units }),
      () => typescriptExternal({ zone: "V", siteAltitude: 100, temperatureUnit, units }),
    ],
    [
      "invalid-temperature-unit",
      () => sourceExternal({ zone: "I", siteAltitude: 100, temperatureUnit: "K", units }),
      () => typescriptExternal({ zone: "I", siteAltitude: 100, temperatureUnit: "K", units }),
    ],
    [
      "missing-internal-source",
      () => sourceInternal({ value: 18, temperatureUnit }),
      () => typescriptInternal({ value: 18, temperatureUnit }),
    ],
    [
      "fixed-expansion-value",
      () => sourceExpansion({ materialId: "structural-steel", value: 11e-6 }),
      () => typescriptExpansion({ materialId: "structural-steel", value: 11e-6 }),
    ],
    [
      "invalid-solar-season",
      () => sourceSolar({ season: "SPRING", surfaceNature: "LIGHT", orientation: "NORTH_EAST" }),
      () =>
        typescriptSolar({ season: "SPRING", surfaceNature: "LIGHT", orientation: "NORTH_EAST" }),
    ],
    [
      "incomplete-thermal-mode",
      () =>
        sourceBuilding({
          summerMeanTemperature: 30,
          temperatureStateSource: "Study HT-01",
          temperatureUnit,
        }),
      () =>
        typescriptBuilding({
          summerMeanTemperature: 30,
          temperatureStateSource: "Study HT-01",
          temperatureUnit,
        }),
    ],
    [
      "contradictory-thermal-mode",
      () =>
        sourceBuilding({
          simplifiedBuildingType: "EXPOSED_STEEL",
          summerMeanTemperature: 30,
          winterMeanTemperature: 0,
          temperatureStateSource: "Study HT-02",
          temperatureUnit,
        }),
      () =>
        typescriptBuilding({
          simplifiedBuildingType: "EXPOSED_STEEL",
          summerMeanTemperature: 30,
          winterMeanTemperature: 0,
          temperatureStateSource: "Study HT-02",
          temperatureUnit,
        }),
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
