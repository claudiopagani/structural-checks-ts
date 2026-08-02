import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const sourceRoot = path.resolve(repositoryRoot, "..", "strutture-js");
const sourceRevision = "6f33baead8b88166c4b2cf94af41763412e3c751";

interface RuntimeInstance {
  analyze(input?: Record<string, unknown>): Record<string, unknown>;
}

interface RuntimeConstructor {
  new (options?: Record<string, unknown>): RuntimeInstance;
}

interface RuntimeModule {
  EARTH_PRESSURE_STATES: readonly string[];
  EARTH_PRESSURE_METHODS: readonly string[];
  LateralEarthPressureAnalysis: RuntimeConstructor;
  SoilMaterial: RuntimeConstructor;
  GroundProfile: RuntimeConstructor;
}

function isRuntimeModule(value: unknown): value is RuntimeModule {
  return (
    value !== null &&
    typeof value === "object" &&
    Array.isArray(Reflect.get(value, "EARTH_PRESSURE_STATES")) &&
    Array.isArray(Reflect.get(value, "EARTH_PRESSURE_METHODS")) &&
    typeof Reflect.get(value, "LateralEarthPressureAnalysis") === "function" &&
    typeof Reflect.get(value, "SoilMaterial") === "function" &&
    typeof Reflect.get(value, "GroundProfile") === "function"
  );
}

function gitOutput(...arguments_: readonly string[]): string {
  return execFileSync("git", ["-C", sourceRoot, ...arguments_], { encoding: "utf8" }).trim();
}

function units(): Record<string, string> {
  return { force: "kN", length: "m" };
}

function createMaterial(
  moduleValue: RuntimeModule,
  {
    id,
    phi = 30,
    cohesion = 0,
    bulk = 18,
    saturated = 20,
    basis = "characteristic",
    atRestCoefficient = null,
    undrained = false,
  }: {
    id: string;
    phi?: number;
    cohesion?: number;
    bulk?: number;
    saturated?: number;
    basis?: string;
    atRestCoefficient?: number | null;
    undrained?: boolean;
  },
): RuntimeInstance {
  const strength = undrained
    ? { model: "total-stress-undrained", undrainedShearStrength: cohesion }
    : { model: "mohr-coulomb-effective", frictionAngle: phi, cohesion };
  return new moduleValue.SoilMaterial({
    id,
    name: `Material ${id}`,
    unitWeight: { bulk, saturated },
    parameterSets: [
      {
        id: undrained ? "undrained" : "drained",
        basis,
        drainage: undrained ? "undrained" : "drained",
        strength,
        atRest:
          atRestCoefficient === null
            ? null
            : { coefficient: atRestCoefficient, method: "assigned-unicode-\u03B1" },
        provenance: { source: "lateral-analysis-fixture-\u03B2" },
      },
    ],
    defaultParameterSetId: undrained ? "undrained" : "drained",
    angleUnits: undrained ? undefined : "deg",
    units: units(),
  });
}

function createProfile(
  moduleValue: RuntimeModule,
  {
    layered = false,
    groundwater = false,
    undrained = false,
    phi = 30,
    basis = "characteristic",
    atRestCoefficient = null,
  }: {
    layered?: boolean;
    groundwater?: boolean;
    undrained?: boolean;
    phi?: number;
    basis?: string;
    atRestCoefficient?: number | null;
  } = {},
): RuntimeInstance {
  const upper = createMaterial(moduleValue, {
    id: "soil-\u03B3",
    phi,
    cohesion: undrained ? 20 : 0,
    bulk: 18,
    saturated: 20,
    basis,
    atRestCoefficient,
    undrained,
  });
  const lower = createMaterial(moduleValue, {
    id: "soil-\u03B4",
    phi: phi + 4,
    cohesion: 0,
    bulk: 20,
    saturated: 22,
    basis,
  });
  const materials = layered ? [upper, lower] : [upper];
  const layers = layered
    ? [
        { id: "layer-\u03B5", topElevation: 10, bottomElevation: 5, materialId: "soil-\u03B3" },
        { id: "layer-\u03B6", topElevation: 5, bottomElevation: 0, materialId: "soil-\u03B4" },
      ]
    : [{ id: "layer-\u03B5", topElevation: 10, bottomElevation: 0, materialId: "soil-\u03B3" }];
  return new moduleValue.GroundProfile({
    id: "profile-\u03B1",
    groundSurfaceElevation: 10,
    materials,
    layers,
    groundwater: groundwater
      ? { model: "hydrostatic", waterTableElevation: 5, waterUnitWeight: 9.81 }
      : null,
    units: units(),
  });
}

function analyze(
  moduleValue: RuntimeModule,
  profile: RuntimeInstance,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return new moduleValue.LateralEarthPressureAnalysis().analyze({
    profile,
    state: "active",
    method: "rankine",
    units: units(),
    ...overrides,
  });
}

function compareScenario(
  sourceModuleValue: RuntimeModule,
  typescriptModuleValue: RuntimeModule,
  options: { profile?: Record<string, unknown>; overrides?: Record<string, unknown> } = {},
): void {
  const sourceProfile = createProfile(sourceModuleValue, options.profile);
  const typescriptProfile = createProfile(typescriptModuleValue, options.profile);
  const sourceResult = analyze(sourceModuleValue, sourceProfile, options.overrides);
  const typescriptResult = analyze(typescriptModuleValue, typescriptProfile, options.overrides);
  assert.deepEqual(typescriptResult, sourceResult);
  assert.equal(JSON.stringify(typescriptResult), JSON.stringify(sourceResult));
  assert.deepEqual([...JSON.stringify(typescriptResult)], [...JSON.stringify(sourceResult)]);
}

void test("LateralEarthPressureAnalysis matches the independent pinned JavaScript implementation", async () => {
  assert.equal(gitOutput("rev-parse", "HEAD"), sourceRevision);
  assert.equal(gitOutput("status", "--porcelain"), "");
  const sourceModuleValue: unknown = await import(
    pathToFileURL(path.join(sourceRoot, "src", "index.js")).href
  );
  const typescriptModuleValue: unknown = await import(
    pathToFileURL(path.join(repositoryRoot, "dist", "index.js")).href
  );
  if (!isRuntimeModule(sourceModuleValue) || !isRuntimeModule(typescriptModuleValue)) {
    throw new Error("Lateral earth-pressure exports do not expose the expected API.");
  }
  assert.notEqual(
    Reflect.get(sourceModuleValue, "LateralEarthPressureAnalysis"),
    Reflect.get(typescriptModuleValue, "LateralEarthPressureAnalysis"),
  );
  assert.deepEqual(
    typescriptModuleValue.EARTH_PRESSURE_STATES,
    sourceModuleValue.EARTH_PRESSURE_STATES,
  );
  assert.deepEqual(
    typescriptModuleValue.EARTH_PRESSURE_METHODS,
    sourceModuleValue.EARTH_PRESSURE_METHODS,
  );

  compareScenario(sourceModuleValue, typescriptModuleValue);
  compareScenario(sourceModuleValue, typescriptModuleValue, {
    profile: { groundwater: true },
  });
  compareScenario(sourceModuleValue, typescriptModuleValue, {
    profile: { layered: true, phi: 30 },
  });
  compareScenario(sourceModuleValue, typescriptModuleValue, {
    profile: { phi: 35 },
    overrides: {
      method: "coulomb-active",
      geometry: { wallInclinationFromVertical: 10, angleUnits: "deg" },
    },
  });
  compareScenario(sourceModuleValue, typescriptModuleValue, {
    profile: { atRestCoefficient: 0.5 },
    overrides: { state: "at-rest", method: "at-rest-explicit" },
  });
  compareScenario(sourceModuleValue, typescriptModuleValue, {
    profile: { atRestCoefficient: 0.5 },
    overrides: { state: "at-rest", method: "jaky-nc" },
  });
  compareScenario(sourceModuleValue, typescriptModuleValue, {
    overrides: {
      state: "seismic-active",
      method: "mononobe-okabe-active",
      seismic: { kh: 0.1, kv: 0, distributionModel: "resultant-only" },
    },
  });
  compareScenario(sourceModuleValue, typescriptModuleValue, {
    overrides: {
      state: "seismic-active",
      method: "mononobe-okabe-active",
      seismic: { kh: 0.1, kv: 0, distributionModel: "triangular-equivalent" },
    },
  });
  compareScenario(sourceModuleValue, typescriptModuleValue, {
    profile: { layered: true },
    overrides: {
      state: "seismic-active",
      method: "trial-wedge-pseudostatic",
      seismic: { kh: 0.1, kv: 0, search: { sampleCount: 81 } },
    },
  });
  compareScenario(sourceModuleValue, typescriptModuleValue, {
    profile: { undrained: true },
    overrides: {
      state: "seismic-active",
      method: "trial-wedge-pseudostatic",
      seismic: { kh: 0.1, kv: 0, search: { sampleCount: 81 } },
    },
  });
  compareScenario(sourceModuleValue, typescriptModuleValue, {
    overrides: {
      method: "trial-wedge-pseudostatic",
      geometry: { backfillInclination: 5, angleUnits: "deg" },
    },
  });
  compareScenario(sourceModuleValue, typescriptModuleValue, {
    overrides: { state: "unsupported-state" },
  });
  compareScenario(sourceModuleValue, typescriptModuleValue, {
    overrides: {
      interface: { frictionAngle: 1, angleUnits: "unsupported-\u03B7" },
    },
  });
});
