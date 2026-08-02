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
  toJSON(): unknown;
}

interface RuntimeConstructor {
  new (options?: RecordValue): RuntimeInstance;
}

interface RuntimeAnalysis {
  analyze(input?: RecordValue): RecordValue;
}

interface RuntimeModule {
  SHALLOW_FOUNDATION_SETTLEMENT_METHODS: readonly string[];
  SHALLOW_FOUNDATION_SLS_RESULT_SCHEMA_VERSION: string;
  GroundModel: RuntimeConstructor;
  GroundProfile: RuntimeConstructor & { fromThicknesses(options?: RecordValue): RuntimeInstance };
  GeotechnicalDesignSituation: RuntimeConstructor;
  ShallowFoundationActionState: RuntimeConstructor;
  ShallowFoundationModel: RuntimeConstructor;
  SoilMaterial: RuntimeConstructor;
  ShallowFoundationServiceabilityAnalysis: new () => RuntimeAnalysis;
  calculateRigidFoundationElasticStiffness(input?: RecordValue): RecordValue;
  calculateSchmertmannStrainInfluence(input?: RecordValue): RecordValue;
  calculateShallowFoundationDifferentialMovement(input?: RecordValue): RecordValue;
  calculateShallowFoundationVerticalStressInfluence(input?: RecordValue): number;
}

function isRuntimeModule(value: unknown): value is RuntimeModule {
  if (value === null || typeof value !== "object") return false;
  return (
    Array.isArray(Reflect.get(value, "SHALLOW_FOUNDATION_SETTLEMENT_METHODS")) &&
    typeof Reflect.get(value, "SHALLOW_FOUNDATION_SLS_RESULT_SCHEMA_VERSION") === "string" &&
    typeof Reflect.get(value, "GroundModel") === "function" &&
    typeof Reflect.get(value, "GroundProfile") === "function" &&
    typeof Reflect.get(value, "GeotechnicalDesignSituation") === "function" &&
    typeof Reflect.get(value, "ShallowFoundationServiceabilityAnalysis") === "function" &&
    typeof Reflect.get(value, "calculateRigidFoundationElasticStiffness") === "function"
  );
}

function gitOutput(...arguments_: readonly string[]): string {
  return execFileSync("git", ["-C", sourceRoot, ...arguments_], { encoding: "utf8" }).trim();
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
  throw new Error("Expected the serviceability parity callback to throw.");
}

function fixture(moduleValue: RuntimeModule, deformation: RecordValue): RecordValue {
  const units = { force: "kN", length: "m" };
  const material = new moduleValue.SoilMaterial({
    id: "sabbia-Δ",
    name: "Sabbia Δ",
    unitWeight: { bulk: 18, saturated: 20 },
    parameterSets: [
      {
        id: "resistenza",
        basis: "representative",
        drainage: "drained",
        strength: { model: "mohr-coulomb-effective", frictionAngle: 32, cohesion: 0 },
      },
    ],
    deformationParameterSets: [deformation],
    angleUnits: "deg",
    units,
  });
  const profile = moduleValue.GroundProfile.fromThicknesses({
    id: "profilo-地",
    groundSurfaceElevation: 0,
    materials: [material],
    layers: [{ id: "strato-α", thickness: 20, materialId: "sabbia-Δ" }],
    groundwater: { model: "none" },
    units,
  });
  const groundModel = new moduleValue.GroundModel({
    id: "terreno-β",
    materials: [material],
    profiles: [profile],
    units,
  });
  const designSituation = new moduleValue.GeotechnicalDesignSituation({
    id: "situazione-γ",
    groundModel,
    limitState: "SLS",
    timeCondition: "short-term",
    drainageCondition: "drained",
    profileId: "profilo-地",
    parameterSelection: { deformationByLayer: { "strato-α": deformation.id } },
    units,
  });
  const foundation = new moduleValue.ShallowFoundationModel({
    id: "fondazione-δ",
    shape: "rectangular",
    geometry: { width: 2, length: 3 },
    placement: { baseElevation: -1 },
    units,
  });
  const actionState = new moduleValue.ShallowFoundationActionState({
    id: "azioni-ε",
    basis: "total",
    resultantScope: "total-at-foundation-base",
    actions: { verticalForce: 1000, horizontalX: 20, momentX: 4, momentY: 5 },
    units,
  });
  return { groundModel, designSituation, foundation, actionState };
}

void test("shallow-foundation serviceability matches the independent pinned JavaScript implementation", async () => {
  assert.equal(gitOutput("rev-parse", "HEAD"), sourceRevision);
  assert.equal(gitOutput("status", "--porcelain"), "");
  const sourceUnknown: unknown = await import(
    pathToFileURL(path.join(sourceRoot, "src", "index.js")).href
  );
  const typescriptUnknown: unknown = await import(
    pathToFileURL(path.join(repositoryRoot, "dist", "index.js")).href
  );
  if (!isRuntimeModule(sourceUnknown) || !isRuntimeModule(typescriptUnknown)) {
    throw new Error("Shallow-foundation serviceability exports do not expose the expected API.");
  }
  assert.notEqual(
    sourceUnknown.ShallowFoundationServiceabilityAnalysis,
    typescriptUnknown.ShallowFoundationServiceabilityAnalysis,
  );
  compare(
    typescriptUnknown.SHALLOW_FOUNDATION_SETTLEMENT_METHODS,
    sourceUnknown.SHALLOW_FOUNDATION_SETTLEMENT_METHODS,
  );
  compare(
    typescriptUnknown.SHALLOW_FOUNDATION_SLS_RESULT_SCHEMA_VERSION,
    sourceUnknown.SHALLOW_FOUNDATION_SLS_RESULT_SCHEMA_VERSION,
  );

  const cases = [
    {
      method: "usace-incremental-constrained-modulus-2025",
      deformation: {
        id: "modulo-vincolato",
        basis: "representative",
        drainage: "drained",
        model: "constrained-modulus",
        constrainedModulus: 12_000,
        provenance: { source: "serviceability-parity" },
      },
    },
    {
      method: "nist-pais-kausel-elastic-2012",
      deformation: {
        id: "elasticita",
        basis: "representative",
        drainage: "drained",
        model: "isotropic-elastic",
        shearModulus: 12_000,
        poissonRatio: 0.25,
        modulusDefinition: "secant",
        provenance: { source: "serviceability-parity" },
      },
    },
  ];
  for (const currentCase of cases) {
    const sourceFixture = fixture(sourceUnknown, currentCase.deformation);
    const typescriptFixture = fixture(typescriptUnknown, currentCase.deformation);
    const input = {
      ...sourceFixture,
      method: currentCase.method,
      criteria: { maximumSettlement: 0.2 },
      units: { force: "kN", length: "m" },
    };
    const sourceResult = new sourceUnknown.ShallowFoundationServiceabilityAnalysis().analyze(input);
    const typescriptResult =
      new typescriptUnknown.ShallowFoundationServiceabilityAnalysis().analyze({
        ...typescriptFixture,
        method: currentCase.method,
        criteria: { maximumSettlement: 0.2 },
        units: { force: "kN", length: "m" },
      });
    compare(sourceResult, typescriptResult);
  }

  const stiffnessInput = {
    width: 2,
    length: 3,
    embedmentDepth: 0.5,
    shearModulus: 12_000,
    poissonRatio: 0.25,
    embedmentContact: "full-sidewall-contact",
  };
  compare(
    sourceUnknown.calculateRigidFoundationElasticStiffness(stiffnessInput),
    typescriptUnknown.calculateRigidFoundationElasticStiffness(stiffnessInput),
  );
  compare(
    sourceUnknown.calculateSchmertmannStrainInfluence({
      depth: 0.75,
      width: 2,
      lengthToWidthRatio: 1,
      peakInfluence: 0.779,
    }),
    typescriptUnknown.calculateSchmertmannStrainInfluence({
      depth: 0.75,
      width: 2,
      lengthToWidthRatio: 1,
      peakInfluence: 0.779,
    }),
  );
  compare(
    sourceUnknown.calculateShallowFoundationDifferentialMovement({
      firstMovement: { foundationId: "prima-μ", settlement: 0.01, placement: { x: 0, y: 0 } },
      secondMovement: { foundationId: "seconda-ν", settlement: 0.025, placement: { x: 3, y: 4 } },
      criteria: { maximumDifferentialSettlement: 0.02, maximumAngularDistortion: 0.004 },
      units: { force: "kN", length: "m" },
    }),
    typescriptUnknown.calculateShallowFoundationDifferentialMovement({
      firstMovement: { foundationId: "prima-μ", settlement: 0.01, placement: { x: 0, y: 0 } },
      secondMovement: { foundationId: "seconda-ν", settlement: 0.025, placement: { x: 3, y: 4 } },
      criteria: { maximumDifferentialSettlement: 0.02, maximumAngularDistortion: 0.004 },
      units: { force: "kN", length: "m" },
    }),
  );
  compare(
    errorDetails(() =>
      sourceUnknown.calculateRigidFoundationElasticStiffness({
        width: 4,
        length: 2,
        shearModulus: 1,
        poissonRatio: 0.25,
      }),
    ),
    errorDetails(() =>
      typescriptUnknown.calculateRigidFoundationElasticStiffness({
        width: 4,
        length: 2,
        shearModulus: 1,
        poissonRatio: 0.25,
      }),
    ),
  );
  compare(
    new sourceUnknown.ShallowFoundationServiceabilityAnalysis().analyze({
      method: "unsupported-sls-method",
      units: { force: "kN", length: "m" },
    }),
    new typescriptUnknown.ShallowFoundationServiceabilityAnalysis().analyze({
      method: "unsupported-sls-method",
      units: { force: "kN", length: "m" },
    }),
  );
});
