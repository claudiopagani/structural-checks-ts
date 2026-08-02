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

void test("NTC 2018 snow-load module matches the independent pinned JavaScript implementation", async () => {
  assert.equal(gitOutput("rev-parse", "HEAD"), sourceRevision);
  assert.equal(gitOutput("status", "--porcelain"), "");

  const sourceModule = await loadModule(sourceRoot, "src/norms/ntc2018/actions/ntc2018SnowLoad.js");
  const typescriptModule = await loadModule(
    path.join(repositoryRoot, "dist"),
    "norms/ntc2018/actions/ntc2018SnowLoad.js",
  );
  const sourceKeys = Object.keys(sourceModule);
  assert.deepEqual(Object.keys(typescriptModule), sourceKeys, "exact snow-load export order");
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

  for (const name of ["NTC2018_SNOW_GROUND_ZONES", "NTC2018_SNOW_EXPOSURE_CLASSES"]) {
    assert.equal(Object.isFrozen(sourceModule[name]), true, `${name}: source frozen`);
    assert.equal(Object.isFrozen(typescriptModule[name]), true, `${name}: TypeScript frozen`);
  }

  const sourceGroundDefinition = requireFunction(
    sourceModule,
    "getNTC2018SnowGroundZoneDefinition",
  );
  const typescriptGroundDefinition = requireFunction(
    typescriptModule,
    "getNTC2018SnowGroundZoneDefinition",
  );
  const sourceExposureDefinition = requireFunction(
    sourceModule,
    "getNTC2018SnowExposureClassDefinition",
  );
  const typescriptExposureDefinition = requireFunction(
    typescriptModule,
    "getNTC2018SnowExposureClassDefinition",
  );
  const sourceGroundLoad = requireFunction(sourceModule, "calculateNTC2018GroundSnowLoad");
  const typescriptGroundLoad = requireFunction(typescriptModule, "calculateNTC2018GroundSnowLoad");
  const sourceShape = requireFunction(sourceModule, "calculateNTC2018PitchedRoofShapeCoefficient");
  const typescriptShape = requireFunction(
    typescriptModule,
    "calculateNTC2018PitchedRoofShapeCoefficient",
  );
  const sourceRoofLoad = requireFunction(sourceModule, "calculateNTC2018RoofSnowLoad");
  const typescriptRoofLoad = requireFunction(typescriptModule, "calculateNTC2018RoofSnowLoad");
  const sourceSnowAreaLoad = requireFunction(sourceModule, "calculateNTC2018SnowAreaLoad");
  const typescriptSnowAreaLoad = requireFunction(typescriptModule, "calculateNTC2018SnowAreaLoad");

  assertValueParity(
    sourceGroundDefinition("I_MEDITERRANEAN"),
    typescriptGroundDefinition("I_MEDITERRANEAN"),
    "ground-definition",
  );
  assertValueParity(
    sourceExposureDefinition("SHELTERED"),
    typescriptExposureDefinition("SHELTERED"),
    "exposure-definition",
  );

  for (const input of [
    { zone: "I_ALPINE", siteAltitude: 200, units },
    { zone: "I_ALPINE", siteAltitude: 300, units },
    { zone: "III", siteAltitude: 200000, units: { force: "N", length: "mm" } },
  ]) {
    assertValueParity(
      sourceGroundLoad(input),
      typescriptGroundLoad(input),
      `ground-load.${input.zone}.${input.siteAltitude}`,
    );
  }
  assertValueParity(
    sourceShape({ roofAngleDegrees: 45 }),
    typescriptShape({ roofAngleDegrees: 45 }),
    "shape-coefficient",
  );
  assertValueParity(
    sourceShape({ roofAngleDegrees: 75, slidingPrevented: true }),
    typescriptShape({ roofAngleDegrees: 75, slidingPrevented: true }),
    "shape-coefficient-sliding",
  );
  assertValueParity(
    sourceRoofLoad({
      groundSnowLoad: 0.0015,
      shapeCoefficient: 0.8,
      exposureCoefficient: 1,
      thermalCoefficient: 1,
      units: { force: "N", length: "mm" },
    }),
    typescriptRoofLoad({
      groundSnowLoad: 0.0015,
      shapeCoefficient: 0.8,
      exposureCoefficient: 1,
      thermalCoefficient: 1,
      units: { force: "N", length: "mm" },
    }),
    "roof-load",
  );

  const lowAltitudeInput = {
    id: "roof-snow",
    actionId: "snow-action",
    zone: "I_MEDITERRANEAN",
    siteAltitude: 150,
    roofAngleDegrees: 20,
    exposureClass: "NORMAL",
    units,
  };
  const lowSourceResult = requireResult(sourceSnowAreaLoad(lowAltitudeInput));
  const lowTypescriptResult = requireResult(typescriptSnowAreaLoad(lowAltitudeInput));
  assertValueParity(
    lowSourceResult.toJSON(),
    lowTypescriptResult.toJSON(),
    "low-altitude-workflow",
  );

  const highAltitudeInput = {
    zone: "III",
    siteAltitude: 1200,
    roofAngleDegrees: 45,
    exposureClass: "WIND_SWEPT",
    thermalCoefficient: 1,
    units,
  };
  assertValueParity(
    requireResult(sourceSnowAreaLoad(highAltitudeInput)).toJSON(),
    requireResult(typescriptSnowAreaLoad(highAltitudeInput)).toJSON(),
    "high-altitude-workflow",
  );
  assertValueParity(
    requireResult(sourceSnowAreaLoad({ zone: "II", siteAltitude: 1600, units })).toJSON(),
    requireResult(typescriptSnowAreaLoad({ zone: "II", siteAltitude: 1600, units })).toJSON(),
    "unsupported-high-altitude-workflow",
  );
  const documentedHighAltitudeInput = {
    zone: "II",
    siteAltitude: 1600,
    groundSnowLoad: 10,
    groundSnowLoadSource: "Local snow study LS-01",
    roofAngleDegrees: 10,
    exposureClass: "NORMAL",
    units,
  };
  assertValueParity(
    requireResult(sourceSnowAreaLoad(documentedHighAltitudeInput)).toJSON(),
    requireResult(typescriptSnowAreaLoad(documentedHighAltitudeInput)).toJSON(),
    "documented-high-altitude-workflow",
  );
  assertValueParity(
    requireResult(
      sourceSnowAreaLoad({
        zone: "I_ALPINE",
        siteAltitude: 300,
        shapeCoefficient: 1.4,
        shapeCoefficientSource: "Documented drift load case D1",
        exposureCoefficient: 1.05,
        exposureCoefficientSource: "Site exposure study E1",
        thermalCoefficient: 0.9,
        thermalCoefficientSource: "Roof thermal study T1",
        units,
      }),
    ).toJSON(),
    requireResult(
      typescriptSnowAreaLoad({
        zone: "I_ALPINE",
        siteAltitude: 300,
        shapeCoefficient: 1.4,
        shapeCoefficientSource: "Documented drift load case D1",
        exposureCoefficient: 1.05,
        exposureCoefficientSource: "Site exposure study E1",
        thermalCoefficient: 0.9,
        thermalCoefficientSource: "Roof thermal study T1",
        units,
      }),
    ).toJSON(),
    "documented-coefficients-workflow",
  );

  const errorCases: readonly [string, () => unknown, () => unknown][] = [
    [
      "missing-ground-units",
      () => sourceGroundLoad({ zone: "II", siteAltitude: 100 }),
      () => typescriptGroundLoad({ zone: "II", siteAltitude: 100 }),
    ],
    [
      "unsupported-zone",
      () => sourceGroundLoad({ zone: "IV", siteAltitude: 100, units }),
      () => typescriptGroundLoad({ zone: "IV", siteAltitude: 100, units }),
    ],
    [
      "ambiguous-shape-input",
      () =>
        sourceSnowAreaLoad({
          zone: "II",
          siteAltitude: 300,
          roofAngleDegrees: 20,
          shapeCoefficient: 0.8,
          exposureClass: "NORMAL",
          units,
        }),
      () =>
        typescriptSnowAreaLoad({
          zone: "II",
          siteAltitude: 300,
          roofAngleDegrees: 20,
          shapeCoefficient: 0.8,
          exposureClass: "NORMAL",
          units,
        }),
    ],
    [
      "missing-exposure-input",
      () => sourceSnowAreaLoad({ zone: "II", siteAltitude: 300, roofAngleDegrees: 20, units }),
      () => typescriptSnowAreaLoad({ zone: "II", siteAltitude: 300, roofAngleDegrees: 20, units }),
    ],
    [
      "explicit-ground-floor",
      () =>
        sourceSnowAreaLoad({
          zone: "II",
          siteAltitude: 1600,
          groundSnowLoad: 1,
          groundSnowLoadSource: "Local study",
          roofAngleDegrees: 10,
          exposureClass: "NORMAL",
          units,
        }),
      () =>
        typescriptSnowAreaLoad({
          zone: "II",
          siteAltitude: 1600,
          groundSnowLoad: 1,
          groundSnowLoadSource: "Local study",
          roofAngleDegrees: 10,
          exposureClass: "NORMAL",
          units,
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
