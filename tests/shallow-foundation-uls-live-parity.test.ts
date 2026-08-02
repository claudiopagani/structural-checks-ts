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

interface RuntimeMaterial extends RuntimeInstance {
  getParameterSet(id?: string | null): RecordValue;
}

interface RuntimeConstructor {
  new (options?: RecordValue): RuntimeInstance;
}

interface RuntimeMaterialConstructor {
  new (options?: RecordValue): RuntimeMaterial;
}

interface RuntimeAnalysisResult {
  status: string;
  outputs: RecordValue;
}

interface RuntimeFoundationAnalysis {
  analyze(input?: RecordValue): RuntimeAnalysisResult;
}

interface RuntimeModule {
  SHALLOW_FOUNDATION_BASE_UPLIFT_TREATMENTS: readonly string[];
  SHALLOW_FOUNDATION_BEARING_METHODS: readonly string[];
  SHALLOW_FOUNDATION_BEARING_SELECTIONS: readonly string[];
  SHALLOW_FOUNDATION_ULS_RESULT_SCHEMA_VERSION: string;
  GroundModel: RuntimeConstructor;
  GroundProfile: RuntimeConstructor & {
    fromThicknesses(options?: RecordValue): RuntimeInstance;
  };
  GeotechnicalDesignSituation: RuntimeConstructor;
  PorePressureField2D: RuntimeConstructor;
  ShallowFoundationActionState: RuntimeConstructor;
  ShallowFoundationModel: RuntimeConstructor;
  SoilMaterial: RuntimeMaterialConstructor;
  SoilStructureInterface: RuntimeConstructor;
  ShallowFoundationUltimateLimitStateAnalysis: new () => RuntimeFoundationAnalysis;
  calculateShallowFoundationBearingCapacity(input?: RecordValue): RecordValue;
  calculateShallowFoundationEffectiveGeometry(input?: RecordValue): RecordValue;
  calculateShallowFoundationSlidingResistance(input?: RecordValue): RecordValue;
}

interface Fixture {
  groundModel: RuntimeInstance;
  designSituation: RuntimeInstance;
  foundation: RuntimeInstance;
  actionState: RuntimeInstance;
  interfaceModel: RuntimeInstance;
  material: RuntimeMaterial;
}

function isRuntimeModule(value: unknown): value is RuntimeModule {
  if (value === null || typeof value !== "object") return false;
  return (
    Array.isArray(Reflect.get(value, "SHALLOW_FOUNDATION_BEARING_METHODS")) &&
    Array.isArray(Reflect.get(value, "SHALLOW_FOUNDATION_BEARING_SELECTIONS")) &&
    typeof Reflect.get(value, "SHALLOW_FOUNDATION_ULS_RESULT_SCHEMA_VERSION") === "string" &&
    typeof Reflect.get(value, "GroundModel") === "function" &&
    typeof Reflect.get(value, "GroundProfile") === "function" &&
    typeof Reflect.get(value, "GeotechnicalDesignSituation") === "function" &&
    typeof Reflect.get(value, "ShallowFoundationUltimateLimitStateAnalysis") === "function" &&
    typeof Reflect.get(value, "calculateShallowFoundationBearingCapacity") === "function" &&
    typeof Reflect.get(value, "calculateShallowFoundationEffectiveGeometry") === "function" &&
    typeof Reflect.get(value, "calculateShallowFoundationSlidingResistance") === "function"
  );
}

function gitOutput(...arguments_: readonly string[]): string {
  return execFileSync("git", ["-C", sourceRoot, ...arguments_], { encoding: "utf8" }).trim();
}

function units(): RecordValue {
  return { force: "kN", length: "m" };
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
  throw new Error("Expected the shallow-foundation ULS fixture to throw.");
}

function fixture(moduleValue: RuntimeModule): Fixture {
  const material = new moduleValue.SoilMaterial({
    id: "sabbia-Δ",
    name: "Sabbia Δ",
    unitWeight: { bulk: 20, saturated: 20 },
    parameterSets: [
      {
        id: "sabbia-rappresentativa",
        basis: "representative",
        drainage: "drained",
        strength: {
          model: "mohr-coulomb-effective",
          frictionAngle: 34,
          cohesion: 4,
        },
      },
    ],
    angleUnits: "deg",
    units: units(),
  });
  const profile = moduleValue.GroundProfile.fromThicknesses({
    id: "profilo-地",
    groundSurfaceElevation: 0,
    materials: [material],
    layers: [{ id: "strato-α", thickness: 10, materialId: "sabbia-Δ" }],
    groundwater: { model: "none" },
    units: units(),
  });
  const groundModel = new moduleValue.GroundModel({
    id: "terreno-β",
    materials: [material],
    profiles: [profile],
    units: units(),
  });
  const designSituation = new moduleValue.GeotechnicalDesignSituation({
    id: "situazione-γ",
    groundModel,
    limitState: "ULS",
    drainageCondition: "drained",
    profileId: "profilo-地",
    units: units(),
  });
  const foundation = new moduleValue.ShallowFoundationModel({
    id: "fondazione-δ",
    shape: "rectangular",
    geometry: { width: 2, length: 3 },
    placement: { baseElevation: -1 },
    units: units(),
  });
  const actionState = new moduleValue.ShallowFoundationActionState({
    id: "azioni-ε",
    basis: "total",
    resultantScope: "total-at-foundation-base",
    actions: { verticalForce: 1000, horizontalX: 120, momentX: 15, momentY: 20 },
    units: units(),
  });
  const interfaceModel = new moduleValue.SoilStructureInterface({
    id: "interfaccia-ζ",
    wallSurface: { typeId: "calcestruzzo", materialType: "concrete", finish: "rough" },
    parameterSets: [
      {
        id: "interfaccia-rappresentativa",
        basis: "representative",
        model: "soil-friction-ratio",
        frictionRatio: 2 / 3,
      },
    ],
  });
  return {
    groundModel,
    designSituation,
    foundation,
    actionState,
    interfaceModel,
    material,
  };
}

void test("shallow-foundation ULS matches the independent pinned JavaScript implementation", async () => {
  assert.equal(gitOutput("rev-parse", "HEAD"), sourceRevision);
  assert.equal(gitOutput("status", "--porcelain"), "");
  const sourceModuleUnknown: unknown = await import(
    pathToFileURL(path.join(sourceRoot, "src", "index.js")).href
  );
  const typescriptModuleUnknown: unknown = await import(
    pathToFileURL(path.join(repositoryRoot, "dist", "index.js")).href
  );
  if (!isRuntimeModule(sourceModuleUnknown) || !isRuntimeModule(typescriptModuleUnknown)) {
    throw new Error("Shallow-foundation ULS exports do not expose the expected API.");
  }
  assert.notEqual(
    sourceModuleUnknown.ShallowFoundationUltimateLimitStateAnalysis,
    typescriptModuleUnknown.ShallowFoundationUltimateLimitStateAnalysis,
  );
  compare(
    typescriptModuleUnknown.SHALLOW_FOUNDATION_BEARING_METHODS,
    sourceModuleUnknown.SHALLOW_FOUNDATION_BEARING_METHODS,
  );
  compare(
    typescriptModuleUnknown.SHALLOW_FOUNDATION_BASE_UPLIFT_TREATMENTS,
    sourceModuleUnknown.SHALLOW_FOUNDATION_BASE_UPLIFT_TREATMENTS,
  );

  const sourceFixture = fixture(sourceModuleUnknown);
  const typescriptFixture = fixture(typescriptModuleUnknown);
  const sourceGeometry = sourceModuleUnknown.calculateShallowFoundationEffectiveGeometry({
    foundation: sourceFixture.foundation,
    actionState: sourceFixture.actionState,
  });
  const typescriptGeometry = typescriptModuleUnknown.calculateShallowFoundationEffectiveGeometry({
    foundation: typescriptFixture.foundation,
    actionState: typescriptFixture.actionState,
  });
  compare(sourceGeometry, typescriptGeometry);

  const sourceParameterSet = sourceFixture.material.getParameterSet();
  const typescriptParameterSet = typescriptFixture.material.getParameterSet();
  const bearingInput = {
    parameterSet: sourceParameterSet,
    effectiveGeometry: sourceGeometry,
    method: "usace-meyerhof-2025",
    embedmentDepth: 1,
    surchargeStress: 0,
    totalUnitWeightBelowBase: 20,
  };
  const typescriptBearingInput = {
    parameterSet: typescriptParameterSet,
    effectiveGeometry: typescriptGeometry,
    method: "usace-meyerhof-2025",
    embedmentDepth: 1,
    surchargeStress: 0,
    totalUnitWeightBelowBase: 20,
  };
  compare(
    sourceModuleUnknown.calculateShallowFoundationBearingCapacity(bearingInput),
    typescriptModuleUnknown.calculateShallowFoundationBearingCapacity(typescriptBearingInput),
  );
  compare(
    sourceModuleUnknown.calculateShallowFoundationSlidingResistance({
      parameterSet: sourceParameterSet,
      effectiveGeometry: sourceGeometry,
      porePressureAtBase: 0,
      interfaceModel: sourceFixture.interfaceModel,
      drainedAdhesionRatio: 0.25,
    }),
    typescriptModuleUnknown.calculateShallowFoundationSlidingResistance({
      parameterSet: typescriptParameterSet,
      effectiveGeometry: typescriptGeometry,
      porePressureAtBase: 0,
      interfaceModel: typescriptFixture.interfaceModel,
      drainedAdhesionRatio: 0.25,
    }),
  );

  const sourceAnalysis = new sourceModuleUnknown.ShallowFoundationUltimateLimitStateAnalysis();
  const typescriptAnalysis =
    new typescriptModuleUnknown.ShallowFoundationUltimateLimitStateAnalysis();
  const sourceResult = sourceAnalysis.analyze({
    ...sourceFixture,
    sliding: {
      interface: sourceFixture.interfaceModel,
      drainedAdhesionRatio: 0.25,
    },
    criteria: { minimumBearingFactorOfSafety: 1.1 },
    units: units(),
  });
  const typescriptResult = typescriptAnalysis.analyze({
    ...typescriptFixture,
    sliding: {
      interface: typescriptFixture.interfaceModel,
      drainedAdhesionRatio: 0.25,
    },
    criteria: { minimumBearingFactorOfSafety: 1.1 },
    units: units(),
  });
  compare(sourceResult, typescriptResult);
  assert.equal(sourceResult.outputs.schemaVersion, "shallow-foundation-uls-result/v1");

  const unsupportedInput = { ...sourceFixture, units: units(), baseUpliftTreatment: "invalid" };
  const unsupportedTypeScriptInput = {
    ...typescriptFixture,
    units: units(),
    baseUpliftTreatment: "invalid",
  };
  compare(
    new sourceModuleUnknown.ShallowFoundationUltimateLimitStateAnalysis().analyze(unsupportedInput),
    new typescriptModuleUnknown.ShallowFoundationUltimateLimitStateAnalysis().analyze(
      unsupportedTypeScriptInput,
    ),
  );
  compare(
    errorDetails(() =>
      sourceModuleUnknown.calculateShallowFoundationBearingCapacity({
        ...bearingInput,
        method: "unsupported",
      }),
    ),
    errorDetails(() =>
      typescriptModuleUnknown.calculateShallowFoundationBearingCapacity({
        ...typescriptBearingInput,
        method: "unsupported",
      }),
    ),
  );
});
