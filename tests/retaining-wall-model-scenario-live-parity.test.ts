import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const sourceRoot = path.resolve(repositoryRoot, "..", "strutture-js");
const sourceRevision = "6f33baead8b88166c4b2cf94af41763412e3c751";
type RecordValue = Record<string, unknown>;

interface RuntimeInstance {
  toJSON(): RecordValue;
}

interface RuntimeModelInstance extends RuntimeInstance {
  toGlobalPoint(point: RecordValue): RecordValue;
  toShallowFoundationModel(options?: RecordValue): RuntimeInstance;
}

interface RuntimeModelConstructor {
  new (options?: RecordValue): RuntimeModelInstance;
  cantilever(options?: RecordValue): RuntimeModelInstance;
}

interface RuntimeScenarioConstructor {
  new (options?: RecordValue): RuntimeInstance;
}

interface RuntimeModule {
  RETAINING_WALL_BASE_UPLIFT_MODELS: readonly string[];
  RETAINING_WALL_LOAD_SCENARIO_SCHEMA_VERSION: string;
  RETAINING_WALL_MODEL_SCHEMA_VERSION: string;
  RETAINING_WALL_SEISMIC_DIRECTIONS: readonly string[];
  RETAINING_WALL_TYPES: readonly string[];
  RetainingWallLoadScenario: RuntimeScenarioConstructor;
  RetainingWallModel: RuntimeModelConstructor;
  SoilStructureInterface: RuntimeScenarioConstructor;
  calculateRetainingWallPolygonProperties(points: readonly RecordValue[]): RecordValue;
}

function isRuntimeModule(value: unknown): value is RuntimeModule {
  if (value === null || typeof value !== "object") return false;
  return (
    Array.isArray(Reflect.get(value, "RETAINING_WALL_BASE_UPLIFT_MODELS")) &&
    typeof Reflect.get(value, "RETAINING_WALL_LOAD_SCENARIO_SCHEMA_VERSION") === "string" &&
    typeof Reflect.get(value, "RETAINING_WALL_MODEL_SCHEMA_VERSION") === "string" &&
    Array.isArray(Reflect.get(value, "RETAINING_WALL_SEISMIC_DIRECTIONS")) &&
    Array.isArray(Reflect.get(value, "RETAINING_WALL_TYPES")) &&
    typeof Reflect.get(value, "RetainingWallLoadScenario") === "function" &&
    typeof Reflect.get(value, "RetainingWallModel") === "function" &&
    typeof Reflect.get(value, "SoilStructureInterface") === "function" &&
    typeof Reflect.get(value, "calculateRetainingWallPolygonProperties") === "function"
  );
}

function gitOutput(...arguments_: readonly string[]): string {
  return execFileSync("git", ["-C", sourceRoot, ...arguments_], { encoding: "utf8" }).trim();
}

function units(): RecordValue {
  return { force: "kN", length: "m" };
}

function interfaceOptions(): RecordValue {
  return {
    id: "base-interface-δ",
    wallSurface: {
      typeId: "formed-concrete",
      materialType: "concrete",
      finish: "formed",
      metadata: { label: "calcestruzzo-β" },
    },
    parameterSets: [
      {
        id: "base-characteristic",
        basis: "characteristic",
        model: "assigned-angle",
        frictionAngle: 20,
        angleUnits: "deg",
        provenance: { source: "retaining-wall-parity" },
      },
    ],
    units: units(),
  };
}

function cantileverOptions(): RecordValue {
  return {
    id: "wall-π",
    name: "Muro π",
    geometry: {
      toeLength: 1000,
      heelLength: 2000,
      baseThickness: 500,
      stemHeight: 4000,
      stemBaseThickness: 400,
      stemTopThickness: 200,
      retainedFaceInclinationFromVertical: 5,
    },
    concreteUnitWeight: 25e-6,
    placement: { originX: 250, baseElevation: 100 },
    angleUnits: "deg",
    units: { force: "N", length: "mm" },
    metadata: { source: "fixture-γ" },
  };
}

function scenarioOptions(): RecordValue {
  return {
    id: "scenario-π",
    name: "Scenario β",
    retainedSide: {
      profileId: "retained-土",
      state: "active",
      method: "rankine",
      interface: interfaceOptions(),
      interfaceParameterSetId: "base-characteristic",
      surcharge: 12,
      includeSurchargeOverHeel: true,
      backfillInclination: 3,
      angleUnits: "deg",
      parameterSetByLayer: { "layer-α": "sand-β" },
      parameterSetByMaterial: { "soil-γ": "sand-β" },
      allowIndicativeValues: true,
      resultantApplicationHeightRatio: 0.4,
      seismic: { kh: 0.1, kv: 0, metadata: { label: "seismic-δ" } },
    },
    frontSide: {
      enabled: true,
      profileId: "front-土",
      method: "rankine",
      surcharge: 2,
      backfillInclination: 0,
      angleUnits: "deg",
      topElevation: 1.5,
      bottomElevation: 0,
      applicationX: 0.2,
      wallInclinationFromVertical: 1,
      mobilizationFactor: 0.5,
      justification: "Toe movement is explicitly checked.",
    },
    baseUplift: {
      model: "linear-hydrostatic",
      reductionFactor: 0.5,
      justification: "Hydrostatic heads are available.",
    },
    includeSoilOverHeel: true,
    appliedLoads: [
      {
        id: "surcharge-荷",
        name: "Assigned load",
        category: "variable",
        horizontalForce: 10,
        verticalForce: -25,
        point: { x: 2, z: 4 },
        metadata: { source: "parity-ε" },
      },
    ],
    foundation: {
      enabled: true,
      profileId: "bearing-土",
      porePressureFieldId: "water-ζ",
      baseInterface: interfaceOptions(),
      interfaceParameterSetId: "base-characteristic",
      drainedAdhesionRatio: 0.2,
      undrainedAdhesionRatio: 0.1,
      surfaceSurcharge: 4,
      parameterSelection: {
        byMaterial: { "soil-η": "sand-β" },
        byLayer: { "layer-θ": "sand-β" },
        byInterface: { "base-interface-δ": "base-characteristic" },
      },
      allowIndicativeValues: true,
      bearing: { enabled: true, selection: "minimum", criteria: { phi: 30 } },
    },
    globalStability: {
      enabled: true,
      includeWallWeightAsSurcharge: false,
      analysisInput: { profileId: "retained-土", units: units() },
    },
    seismicDirection: "retained-to-front",
    criteria: {
      minimumSlidingFactorOfSafety: 1.2,
      minimumOverturningFactorOfSafety: 1.5,
      requireFullBaseContact: true,
    },
    angleUnits: "rad",
    units: units(),
    metadata: { source: "scenario-fixture-ι" },
  };
}

function compare(sourceValue: unknown, typescriptValue: unknown): void {
  assert.deepEqual(typescriptValue, sourceValue);
  assert.equal(JSON.stringify(typescriptValue), JSON.stringify(sourceValue));
  assert.deepEqual([...JSON.stringify(typescriptValue)], [...JSON.stringify(sourceValue)]);
}

function errorDetails(callback: () => unknown): { name: string; message: string } {
  try {
    callback();
  } catch (error) {
    if (error instanceof Error) return { name: error.name, message: error.message };
    return { name: Object.prototype.toString.call(error), message: String(error) };
  }
  throw new Error("Expected the retaining-wall parity fixture to throw.");
}

function compareError(
  sourceModuleValue: RuntimeModule,
  typescriptModuleValue: RuntimeModule,
  input: RecordValue,
): void {
  compare(
    errorDetails(() => new sourceModuleValue.RetainingWallLoadScenario(input)),
    errorDetails(() => new typescriptModuleValue.RetainingWallLoadScenario(input)),
  );
}

void test("retaining-wall model and scenario match the independent pinned JavaScript implementation", async () => {
  assert.equal(gitOutput("rev-parse", "HEAD"), sourceRevision);
  assert.equal(gitOutput("status", "--porcelain"), "");
  const sourceModuleValue: unknown = await import(
    pathToFileURL(path.join(sourceRoot, "src", "index.js")).href
  );
  const typescriptModuleValue: unknown = await import(
    pathToFileURL(path.join(repositoryRoot, "dist", "index.js")).href
  );
  if (!isRuntimeModule(sourceModuleValue) || !isRuntimeModule(typescriptModuleValue)) {
    throw new Error("Retaining-wall model exports do not expose the expected API.");
  }
  assert.notEqual(sourceModuleValue.RetainingWallModel, typescriptModuleValue.RetainingWallModel);
  assert.notEqual(
    sourceModuleValue.RetainingWallLoadScenario,
    typescriptModuleValue.RetainingWallLoadScenario,
  );
  compare(typescriptModuleValue.RETAINING_WALL_TYPES, sourceModuleValue.RETAINING_WALL_TYPES);
  compare(
    typescriptModuleValue.RETAINING_WALL_BASE_UPLIFT_MODELS,
    sourceModuleValue.RETAINING_WALL_BASE_UPLIFT_MODELS,
  );

  const sourceModel = sourceModuleValue.RetainingWallModel.cantilever(cantileverOptions());
  const typescriptModel = typescriptModuleValue.RetainingWallModel.cantilever(cantileverOptions());
  compare(sourceModel.toJSON(), typescriptModel.toJSON());
  compare(
    sourceModuleValue.calculateRetainingWallPolygonProperties([
      { x: 0, z: 0 },
      { x: 3, z: 0 },
      { x: 3, z: 2 },
      { x: 0, z: 2 },
    ]),
    typescriptModuleValue.calculateRetainingWallPolygonProperties([
      { x: 0, z: 0 },
      { x: 3, z: 0 },
      { x: 3, z: 2 },
      { x: 0, z: 2 },
    ]),
  );
  compare(sourceModel.toGlobalPoint({ x: 1, z: 2 }), typescriptModel.toGlobalPoint({ x: 1, z: 2 }));
  compare(
    sourceModel.toShallowFoundationModel({ id: "wall-base-π" }).toJSON(),
    typescriptModel.toShallowFoundationModel({ id: "wall-base-π" }).toJSON(),
  );

  const sourceScenario = new sourceModuleValue.RetainingWallLoadScenario(scenarioOptions());
  const typescriptScenario = new typescriptModuleValue.RetainingWallLoadScenario(scenarioOptions());
  compare(sourceScenario.toJSON(), typescriptScenario.toJSON());

  compareError(sourceModuleValue, typescriptModuleValue, {
    id: "invalid-passive",
    retainedSide: { profileId: "retained", state: "passive" },
    units: units(),
  });
  compareError(sourceModuleValue, typescriptModuleValue, {
    id: "invalid-front",
    retainedSide: { profileId: "retained" },
    frontSide: { enabled: true, profileId: "front", mobilizationFactor: 0.5 },
    units: units(),
  });
  compareError(sourceModuleValue, typescriptModuleValue, {
    id: "duplicate-loads",
    retainedSide: { profileId: "retained" },
    appliedLoads: [
      { id: "duplicate", point: { x: 0, z: 0 } },
      { id: "duplicate", point: { x: 1, z: 0 } },
    ],
    units: units(),
  });
  compareError(sourceModuleValue, typescriptModuleValue, {
    id: "invalid-model",
    retainedSide: { profileId: "retained" },
    baseUplift: { model: "unsupported" },
    units: units(),
  });
});
