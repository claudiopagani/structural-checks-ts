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
  toJSON?(): RecordValue;
}

interface AnalysisInstance {
  analyze(input?: RecordValue): RecordValue;
}

interface RuntimeConstructor {
  new (options?: RecordValue): RuntimeInstance;
}

interface AnalysisConstructor {
  new (): AnalysisInstance;
}

interface RuntimeModule {
  LATERAL_PILE_BROMS_REFERENCE: string;
  LATERAL_PILE_CAPACITY_RESULT_SCHEMA_VERSION: string;
  LateralPileCapacityAnalysis: AnalysisConstructor;
  DeepFoundationModel: RuntimeConstructor;
  GeotechnicalDesignSituation: RuntimeConstructor;
  GroundModel: RuntimeConstructor;
  GroundProfile: RuntimeConstructor;
  LateralPileLoadScenario: RuntimeConstructor;
  SoilMaterial: RuntimeConstructor;
}

function isRuntimeModule(value: unknown): value is RuntimeModule {
  if (value === null || typeof value !== "object") return false;
  return (
    typeof Reflect.get(value, "LATERAL_PILE_BROMS_REFERENCE") === "string" &&
    typeof Reflect.get(value, "LATERAL_PILE_CAPACITY_RESULT_SCHEMA_VERSION") === "string" &&
    typeof Reflect.get(value, "LateralPileCapacityAnalysis") === "function" &&
    typeof Reflect.get(value, "DeepFoundationModel") === "function" &&
    typeof Reflect.get(value, "GeotechnicalDesignSituation") === "function" &&
    typeof Reflect.get(value, "GroundModel") === "function" &&
    typeof Reflect.get(value, "GroundProfile") === "function" &&
    typeof Reflect.get(value, "LateralPileLoadScenario") === "function" &&
    typeof Reflect.get(value, "SoilMaterial") === "function"
  );
}

function gitOutput(...arguments_: readonly string[]): string {
  return execFileSync("git", ["-C", sourceRoot, ...arguments_], { encoding: "utf8" }).trim();
}

function units(): RecordValue {
  return { force: "kN", length: "m" };
}

function instanceJson(instance: RuntimeInstance): RecordValue {
  const json = instance.toJSON?.();
  if (!json) throw new Error("The parity fixture requires a serializable runtime instance.");
  return json;
}

function instanceId(instance: RuntimeInstance): string {
  const id = instanceJson(instance).id;
  if (typeof id !== "string") throw new Error("The parity fixture requires a string instance id.");
  return id;
}

function profileIdFromSelection(value: unknown): string | null {
  if (typeof value !== "object" || value === null) return null;
  const descriptor = Object.getOwnPropertyDescriptor(value, "profileId");
  const profileId: unknown = descriptor?.value;
  return typeof profileId === "string" ? profileId : null;
}

function createMaterial(
  moduleValue: RuntimeModule,
  { id, drained, submerged = false }: { id: string; drained: boolean; submerged?: boolean },
): RuntimeInstance {
  return new moduleValue.SoilMaterial({
    id,
    name: `Material ${id}`,
    unitWeight: { bulk: 18, saturated: submerged ? 20 : null },
    parameterSets: [
      {
        id: `${id}-characteristic`,
        basis: "characteristic",
        drainage: drained ? "drained" : "undrained",
        strength: drained
          ? { model: "mohr-coulomb-effective", frictionAngle: 30, cohesion: 0 }
          : { model: "total-stress-undrained", undrainedShearStrength: 50 },
        provenance: { source: "lateral-pile-parity-π" },
      },
    ],
    defaultParameterSetId: `${id}-characteristic`,
    angleUnits: drained ? "deg" : null,
    units: units(),
  });
}

function createGround(
  moduleValue: RuntimeModule,
  {
    drained,
    layered = false,
    groundwater = { model: "none" },
    limitState = "ULS",
    unicode = false,
  }: {
    drained: boolean;
    layered?: boolean;
    groundwater?: RecordValue;
    limitState?: string;
    unicode?: boolean;
  },
): {
  groundModel: RuntimeInstance;
  designSituation: RuntimeInstance;
  profile: RuntimeInstance;
} {
  const firstMaterial = createMaterial(moduleValue, {
    id: unicode ? "soil-γ" : "soil-upper",
    drained,
    submerged: groundwater.model === "hydrostatic",
  });
  const secondMaterial = createMaterial(moduleValue, {
    id: "soil-lower",
    drained,
  });
  const materials = layered ? [firstMaterial, secondMaterial] : [firstMaterial];
  const layers = layered
    ? [
        {
          id: "layer-upper",
          topElevation: 0,
          bottomElevation: -3,
          materialId: instanceId(firstMaterial),
        },
        {
          id: "layer-lower",
          topElevation: -3,
          bottomElevation: -20,
          materialId: instanceId(secondMaterial),
        },
      ]
    : [
        {
          id: unicode ? "layer-δ" : "layer-one",
          topElevation: 0,
          bottomElevation: -20,
          materialId: instanceId(firstMaterial),
        },
      ];
  const profile = new moduleValue.GroundProfile({
    id: unicode ? "profile-π" : "profile-one",
    groundSurfaceElevation: 0,
    materials,
    layers,
    groundwater,
    units: units(),
  });
  const groundModel = new moduleValue.GroundModel({
    id: unicode ? "ground-模型" : "ground-one",
    materials,
    profiles: [profile],
    units: units(),
  });
  const designSituation = new moduleValue.GeotechnicalDesignSituation({
    id: unicode ? "situation-ß" : "situation-one",
    groundModel,
    limitState,
    drainageCondition: drained ? "drained" : "undrained",
    requiredParameterBasis: "characteristic",
    profileId: instanceId(profile),
    units: units(),
  });
  return { groundModel, designSituation, profile };
}

function createPile(moduleValue: RuntimeModule, embedment = 6, elevatedHead = false) {
  const soilContactTopElevation = elevatedHead ? 1 : 0;
  return new moduleValue.DeepFoundationModel({
    id: "pile-桩",
    geometry: { model: "circular", diameter: 1 },
    placement: {
      headElevation: soilContactTopElevation,
      soilContactTopElevation,
      toeElevation: -embedment,
    },
    construction: {
      installationMethod: "assigned-parity-method",
      structuralMaterial: "assigned-parity-material",
      displacementClass: "not-classified",
    },
    units: units(),
  });
}

function createScenario(moduleValue: RuntimeModule, drained: boolean, conversion: boolean) {
  return new moduleValue.LateralPileLoadScenario({
    id: drained ? "sand-scenario" : "clay-scenario",
    soilBranch: drained ? "cohesionless-drained" : "cohesive-undrained",
    action: {
      lateralShear: 100,
      overturningMoment: 50,
      basis: "design-π",
      referencePoint: "groundline-at-pile-axis",
      metadata: { label: "azione-β" },
    },
    behaviorAssertion: {
      classification: "short-rigid",
      basis: "parity-assertion",
      provenance: { source: "parity-fixture" },
    },
    resistanceConversion: conversion
      ? {
          model: "soil-reaction-factor",
          factor: 0.8,
          provenance: { source: "parity-factor" },
        }
      : null,
    units: units(),
  });
}

function analyze(
  moduleValue: RuntimeModule,
  ground: {
    groundModel: RuntimeInstance;
    designSituation: RuntimeInstance;
  },
  options: RecordValue,
): RecordValue {
  return new moduleValue.LateralPileCapacityAnalysis().analyze({
    groundModel: ground.groundModel,
    designSituation: ground.designSituation,
    ...options,
    units: units(),
  });
}

function compareResult(sourceResult: RecordValue, typescriptResult: RecordValue): void {
  assert.deepEqual(typescriptResult, sourceResult);
  assert.equal(JSON.stringify(typescriptResult), JSON.stringify(sourceResult));
  assert.deepEqual([...JSON.stringify(typescriptResult)], [...JSON.stringify(sourceResult)]);
}

function compareScenario(
  sourceModuleValue: RuntimeModule,
  typescriptModuleValue: RuntimeModule,
  options: {
    drained: boolean;
    conversion?: boolean;
    layered?: boolean;
    groundwater?: RecordValue;
    limitState?: string;
    elevatedHead?: boolean;
    unicode?: boolean;
  },
): void {
  const sourceGround = createGround(sourceModuleValue, options);
  const typescriptGround = createGround(typescriptModuleValue, options);
  const sourcePile = createPile(sourceModuleValue, 6, options.elevatedHead);
  const typescriptPile = createPile(typescriptModuleValue, 6, options.elevatedHead);
  const sourceScenario = createScenario(
    sourceModuleValue,
    options.drained,
    options.conversion ?? false,
  );
  const typescriptScenario = createScenario(
    typescriptModuleValue,
    options.drained,
    options.conversion ?? false,
  );
  const sourceSelection = instanceJson(sourceGround.designSituation).spatialSelection;
  const typescriptSelection = instanceJson(typescriptGround.designSituation).spatialSelection;
  const sourceProfileId = profileIdFromSelection(sourceSelection);
  const typescriptProfileId = profileIdFromSelection(typescriptSelection);
  compareResult(
    analyze(sourceModuleValue, sourceGround, {
      pile: sourcePile,
      scenario: sourceScenario,
      profileId: sourceProfileId,
    }),
    analyze(typescriptModuleValue, typescriptGround, {
      pile: typescriptPile,
      scenario: typescriptScenario,
      profileId: typescriptProfileId,
    }),
  );
}

void test("LateralPileCapacityAnalysis matches the independent pinned JavaScript implementation", async () => {
  assert.equal(gitOutput("rev-parse", "HEAD"), sourceRevision);
  assert.equal(gitOutput("status", "--porcelain"), "");
  const sourceModuleValue: unknown = await import(
    pathToFileURL(path.join(sourceRoot, "src", "index.js")).href
  );
  const typescriptModuleValue: unknown = await import(
    pathToFileURL(path.join(repositoryRoot, "dist", "index.js")).href
  );
  if (!isRuntimeModule(sourceModuleValue) || !isRuntimeModule(typescriptModuleValue)) {
    throw new Error("Lateral pile capacity exports do not expose the expected API.");
  }
  assert.notEqual(
    sourceModuleValue.LateralPileCapacityAnalysis,
    typescriptModuleValue.LateralPileCapacityAnalysis,
  );
  assert.equal(
    typescriptModuleValue.LATERAL_PILE_BROMS_REFERENCE,
    sourceModuleValue.LATERAL_PILE_BROMS_REFERENCE,
  );
  assert.equal(
    typescriptModuleValue.LATERAL_PILE_CAPACITY_RESULT_SCHEMA_VERSION,
    sourceModuleValue.LATERAL_PILE_CAPACITY_RESULT_SCHEMA_VERSION,
  );

  compareScenario(sourceModuleValue, typescriptModuleValue, {
    drained: false,
    unicode: true,
  });
  compareScenario(sourceModuleValue, typescriptModuleValue, {
    drained: true,
    conversion: true,
  });
  compareScenario(sourceModuleValue, typescriptModuleValue, {
    drained: true,
    groundwater: { model: "hydrostatic", waterTableElevation: 0, waterUnitWeight: 10 },
  });
  compareScenario(sourceModuleValue, typescriptModuleValue, {
    drained: true,
    layered: true,
  });
  compareScenario(sourceModuleValue, typescriptModuleValue, {
    drained: true,
    groundwater: { model: "hydrostatic", waterTableElevation: -2, waterUnitWeight: 10 },
  });
  compareScenario(sourceModuleValue, typescriptModuleValue, {
    drained: true,
    limitState: "SLS",
  });
  compareScenario(sourceModuleValue, typescriptModuleValue, {
    drained: true,
    elevatedHead: true,
  });

  const sourceMissing = new sourceModuleValue.LateralPileCapacityAnalysis().analyze({
    units: units(),
  });
  const typescriptMissing = new typescriptModuleValue.LateralPileCapacityAnalysis().analyze({
    units: units(),
  });
  compareResult(sourceMissing, typescriptMissing);
});
