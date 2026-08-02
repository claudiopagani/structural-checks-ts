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

interface RuntimeWallConstructor extends RuntimeConstructor {
  cantilever(options?: RecordValue): RuntimeInstance;
}

interface RuntimeAnalysis {
  analyze(input?: RecordValue): RecordValue;
}

interface RuntimeModule {
  RETAINING_WALL_ANALYSIS_RESULT_SCHEMA_VERSION: string;
  SoilMaterial: RuntimeConstructor;
  GroundProfile: RuntimeConstructor;
  GroundModel: RuntimeConstructor;
  GeotechnicalDesignSituation: RuntimeConstructor;
  GroundSection2D: RuntimeConstructor;
  PorePressureField2D: RuntimeConstructor;
  CircularSlipSurface2D: RuntimeConstructor & {
    fromChordAndSagitta(options?: RecordValue): RuntimeInstance;
  };
  RetainingWallModel: RuntimeWallConstructor;
  RetainingWallLoadScenario: RuntimeConstructor;
  RetainingWallAnalysis: new () => RuntimeAnalysis;
}

interface Fixture {
  soil: RuntimeInstance;
  retained: RuntimeInstance;
  bearing: RuntimeInstance;
  groundModel: RuntimeInstance;
  designSituation: RuntimeInstance;
  wall: RuntimeInstance;
  scenario: RuntimeInstance;
}

function isRuntimeModule(value: unknown): value is RuntimeModule {
  if (value === null || typeof value !== "object") return false;
  return (
    typeof Reflect.get(value, "RETAINING_WALL_ANALYSIS_RESULT_SCHEMA_VERSION") === "string" &&
    typeof Reflect.get(value, "SoilMaterial") === "function" &&
    typeof Reflect.get(value, "GroundProfile") === "function" &&
    typeof Reflect.get(value, "GroundModel") === "function" &&
    typeof Reflect.get(value, "GeotechnicalDesignSituation") === "function" &&
    typeof Reflect.get(value, "GroundSection2D") === "function" &&
    typeof Reflect.get(value, "PorePressureField2D") === "function" &&
    typeof Reflect.get(value, "CircularSlipSurface2D") === "function" &&
    typeof Reflect.get(value, "RetainingWallModel") === "function" &&
    typeof Reflect.get(value, "RetainingWallLoadScenario") === "function" &&
    typeof Reflect.get(value, "RetainingWallAnalysis") === "function"
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

function fixture(moduleValue: RuntimeModule, groundwater: boolean): Fixture {
  const soil = new moduleValue.SoilMaterial({
    id: "sabbia-Δ",
    name: "Sabbia Δ",
    unitWeight: { bulk: 18, saturated: 20 },
    parameterSets: [
      {
        id: "sabbia-caratteristica",
        basis: "characteristic",
        drainage: "drained",
        strength: {
          model: "mohr-coulomb-effective",
          frictionAngle: 30,
          cohesion: 0,
        },
        provenance: { source: "retaining-wall-analysis-parity" },
      },
    ],
    angleUnits: "deg",
    units: units(),
  });
  const retained = new moduleValue.GroundProfile({
    id: "retained-地",
    groundSurfaceElevation: 4.5,
    materials: [soil],
    layers: [
      {
        id: "retained-layer",
        topElevation: 4.5,
        bottomElevation: -20,
        materialId: "sabbia-Δ",
      },
    ],
    groundwater: groundwater
      ? { model: "hydrostatic", waterTableElevation: 4.5, waterUnitWeight: 9.81 }
      : { model: "none" },
    units: units(),
  });
  const bearing = new moduleValue.GroundProfile({
    id: "bearing-β",
    groundSurfaceElevation: 0.5,
    materials: [soil],
    layers: [
      {
        id: "bearing-layer",
        topElevation: 0.5,
        bottomElevation: -20,
        materialId: "sabbia-Δ",
      },
    ],
    groundwater: groundwater
      ? { model: "hydrostatic", waterTableElevation: 0.5, waterUnitWeight: 9.81 }
      : { model: "none" },
    units: units(),
  });
  const groundModel = new moduleValue.GroundModel({
    id: "ground-γ",
    materials: [soil],
    profiles: [retained, bearing],
    units: units(),
  });
  const designSituation = new moduleValue.GeotechnicalDesignSituation({
    id: "persistent-wall-δ",
    groundModel,
    limitState: "ULS",
    drainageCondition: "drained",
    requiredParameterBasis: "characteristic",
    profileId: "retained-地",
    units: units(),
  });
  const wall = moduleValue.RetainingWallModel.cantilever({
    id: "wall-ε",
    name: "Muro ε",
    geometry: {
      toeLength: 1,
      heelLength: 2,
      baseThickness: 0.5,
      stemHeight: 4,
      stemBaseThickness: 0.4,
      stemTopThickness: 0.2,
      retainedFaceInclinationFromVertical: 0,
    },
    concreteUnitWeight: 25,
    placement: { originX: 0, baseElevation: 0 },
    angleUnits: "deg",
    units: units(),
  });
  const scenario = new moduleValue.RetainingWallLoadScenario({
    id: "static-scenario-ζ",
    retainedSide: {
      profileId: "retained-地",
      state: "active",
      method: "rankine",
    },
    foundation: {
      profileId: "bearing-β",
      baseInterface: {
        id: "base-interface-η",
        wallSurface: {
          typeId: "formed-concrete",
          materialType: "concrete",
          finish: "formed",
        },
        parameterSets: [
          {
            id: "base-characteristic",
            basis: "characteristic",
            model: "assigned-angle",
            frictionAngle: 20,
            angleUnits: "deg",
          },
        ],
      },
      bearing: { enabled: false },
    },
    baseUplift: groundwater
      ? { model: "linear-hydrostatic", reductionFactor: 0.5 }
      : { model: "none" },
    units: units(),
  });
  return { soil, retained, bearing, groundModel, designSituation, wall, scenario };
}

void test("RetainingWallAnalysis matches the independent pinned JavaScript implementation", async () => {
  assert.equal(gitOutput("rev-parse", "HEAD"), sourceRevision);
  assert.equal(gitOutput("status", "--porcelain"), "");
  const sourceUnknown: unknown = await import(
    pathToFileURL(path.join(sourceRoot, "src", "index.js")).href
  );
  const typescriptUnknown: unknown = await import(
    pathToFileURL(path.join(repositoryRoot, "dist", "index.js")).href
  );
  if (!isRuntimeModule(sourceUnknown) || !isRuntimeModule(typescriptUnknown)) {
    throw new Error("RetainingWallAnalysis exports do not expose the expected API.");
  }
  assert.notEqual(sourceUnknown.RetainingWallAnalysis, typescriptUnknown.RetainingWallAnalysis);
  compare(
    typescriptUnknown.RETAINING_WALL_ANALYSIS_RESULT_SCHEMA_VERSION,
    sourceUnknown.RETAINING_WALL_ANALYSIS_RESULT_SCHEMA_VERSION,
  );

  for (const groundwater of [false, true]) {
    const sourceFixture = fixture(sourceUnknown, groundwater);
    const typescriptFixture = fixture(typescriptUnknown, groundwater);
    const sourceResult = new sourceUnknown.RetainingWallAnalysis().analyze({
      ...sourceFixture,
      units: units(),
    });
    const typescriptResult = new typescriptUnknown.RetainingWallAnalysis().analyze({
      ...typescriptFixture,
      units: units(),
    });
    compare(sourceResult, typescriptResult);
  }

  const bearingScenarioOptions = {
    id: "bearing-scenario-τ",
    retainedSide: { profileId: "retained-地", state: "active", method: "rankine" },
    foundation: {
      profileId: "bearing-β",
      baseInterface: {
        id: "base-interface-η",
        wallSurface: {
          typeId: "formed-concrete",
          materialType: "concrete",
          finish: "formed",
        },
        parameterSets: [
          {
            id: "base-characteristic",
            basis: "characteristic",
            model: "assigned-angle",
            frictionAngle: 20,
            angleUnits: "deg",
          },
        ],
      },
      drainedAdhesionRatio: 0.2,
      bearing: { enabled: true, selection: "minimum", criteria: {} },
    },
    units: units(),
  };
  const sourceBearingFixture = fixture(sourceUnknown, false);
  const typescriptBearingFixture = fixture(typescriptUnknown, false);
  compare(
    new sourceUnknown.RetainingWallAnalysis().analyze({
      ...sourceBearingFixture,
      scenario: new sourceUnknown.RetainingWallLoadScenario(bearingScenarioOptions),
      units: units(),
    }),
    new typescriptUnknown.RetainingWallAnalysis().analyze({
      ...typescriptBearingFixture,
      scenario: new typescriptUnknown.RetainingWallLoadScenario(bearingScenarioOptions),
      units: units(),
    }),
  );

  const sourceStatic = fixture(sourceUnknown, false);
  const typescriptStatic = fixture(typescriptUnknown, false);
  const inclinedOptions = {
    id: "wall-inclined-θ",
    geometry: {
      toeLength: 1,
      heelLength: 2,
      baseThickness: 0.5,
      stemHeight: 4,
      stemBaseThickness: 0.4,
      stemTopThickness: 0.2,
      retainedFaceInclinationFromVertical: 5,
    },
    concreteUnitWeight: 25,
    placement: { originX: 0, baseElevation: 0 },
    angleUnits: "deg",
    units: units(),
  };
  const faceInterface = {
    id: "formed-face-ι",
    wallSurface: { typeId: "formed-concrete", materialType: "concrete", finish: "formed" },
    parameterSets: [
      {
        id: "face-characteristic",
        basis: "characteristic",
        model: "assigned-angle",
        frictionAngle: 10,
        angleUnits: "deg",
      },
    ],
  };
  const inclinedSourceWall = sourceUnknown.RetainingWallModel.cantilever(inclinedOptions);
  const inclinedTypeScriptWall = typescriptUnknown.RetainingWallModel.cantilever(inclinedOptions);
  const inclinedScenarioOptions = {
    id: "inclined-scenario-κ",
    retainedSide: {
      profileId: "retained-地",
      state: "active",
      method: "coulomb-active",
      interface: faceInterface,
    },
    foundation: {
      profileId: "bearing-β",
      baseInterface: {
        id: "base-interface-η",
        wallSurface: {
          typeId: "formed-concrete",
          materialType: "concrete",
          finish: "formed",
        },
        parameterSets: [
          {
            id: "base-characteristic",
            basis: "characteristic",
            model: "assigned-angle",
            frictionAngle: 20,
            angleUnits: "deg",
          },
        ],
      },
      bearing: { enabled: false },
    },
    units: units(),
  };
  const inclinedSourceScenario = new sourceUnknown.RetainingWallLoadScenario(
    inclinedScenarioOptions,
  );
  const inclinedTypeScriptScenario = new typescriptUnknown.RetainingWallLoadScenario(
    inclinedScenarioOptions,
  );
  compare(
    new sourceUnknown.RetainingWallAnalysis().analyze({
      ...sourceStatic,
      wall: inclinedSourceWall,
      scenario: inclinedSourceScenario,
      units: units(),
    }),
    new typescriptUnknown.RetainingWallAnalysis().analyze({
      ...typescriptStatic,
      wall: inclinedTypeScriptWall,
      scenario: inclinedTypeScriptScenario,
      units: units(),
    }),
  );

  const seismicSourceSituation = new sourceUnknown.GeotechnicalDesignSituation({
    id: "seismic-wall-λ",
    groundModel: sourceStatic.groundModel,
    situationType: "seismic",
    limitState: "ULS",
    drainageCondition: "drained",
    requiredParameterBasis: "characteristic",
    profileId: "retained-地",
    seismic: { model: "pseudostatic", kh: 0.1, kv: 0.05 },
    units: units(),
  });
  const seismicTypeScriptSituation = new typescriptUnknown.GeotechnicalDesignSituation({
    id: "seismic-wall-λ",
    groundModel: typescriptStatic.groundModel,
    situationType: "seismic",
    limitState: "ULS",
    drainageCondition: "drained",
    requiredParameterBasis: "characteristic",
    profileId: "retained-地",
    seismic: { model: "pseudostatic", kh: 0.1, kv: 0.05 },
    units: units(),
  });
  const seismicScenarioOptions = {
    id: "seismic-scenario-μ",
    retainedSide: {
      profileId: "retained-地",
      state: "seismic-active",
      method: "mononobe-okabe-active",
      seismic: { distributionModel: "triangular-equivalent" },
    },
    seismicDirection: "retained-to-front",
    units: units(),
  };
  compare(
    new sourceUnknown.RetainingWallAnalysis().analyze({
      groundModel: sourceStatic.groundModel,
      designSituation: seismicSourceSituation,
      wall: sourceStatic.wall,
      scenario: new sourceUnknown.RetainingWallLoadScenario(seismicScenarioOptions),
      units: units(),
    }),
    new typescriptUnknown.RetainingWallAnalysis().analyze({
      groundModel: typescriptStatic.groundModel,
      designSituation: seismicTypeScriptSituation,
      wall: typescriptStatic.wall,
      scenario: new typescriptUnknown.RetainingWallLoadScenario(seismicScenarioOptions),
      units: units(),
    }),
  );

  const wedgeSourceSituation = new sourceUnknown.GeotechnicalDesignSituation({
    id: "wedge-wall-ν",
    groundModel: sourceStatic.groundModel,
    situationType: "seismic",
    limitState: "ULS",
    drainageCondition: "drained",
    requiredParameterBasis: "characteristic",
    profileId: "retained-地",
    seismic: { model: "pseudostatic", kh: 0.1, kv: 0 },
    units: units(),
  });
  const wedgeTypeScriptSituation = new typescriptUnknown.GeotechnicalDesignSituation({
    id: "wedge-wall-ν",
    groundModel: typescriptStatic.groundModel,
    situationType: "seismic",
    limitState: "ULS",
    drainageCondition: "drained",
    requiredParameterBasis: "characteristic",
    profileId: "retained-地",
    seismic: { model: "pseudostatic", kh: 0.1, kv: 0 },
    units: units(),
  });
  const wedgeScenarioOptions = (heightRatio: number | null) => ({
    id: "wedge-scenario-ξ",
    retainedSide: {
      profileId: "retained-地",
      state: "seismic-active",
      method: "trial-wedge-pseudostatic",
      resultantApplicationHeightRatio: heightRatio,
      seismic: { search: { sampleCount: 181 } },
    },
    seismicDirection: "retained-to-front",
    units: units(),
  });
  for (const heightRatio of [null, 0.4]) {
    compare(
      new sourceUnknown.RetainingWallAnalysis().analyze({
        groundModel: sourceStatic.groundModel,
        designSituation: wedgeSourceSituation,
        wall: sourceStatic.wall,
        scenario: new sourceUnknown.RetainingWallLoadScenario(wedgeScenarioOptions(heightRatio)),
        units: units(),
      }),
      new typescriptUnknown.RetainingWallAnalysis().analyze({
        groundModel: typescriptStatic.groundModel,
        designSituation: wedgeTypeScriptSituation,
        wall: typescriptStatic.wall,
        scenario: new typescriptUnknown.RetainingWallLoadScenario(
          wedgeScenarioOptions(heightRatio),
        ),
        units: units(),
      }),
    );
  }

  const sectionOptions = {
    id: "wall-slope-section-ο",
    surface: {
      points: [
        { x: 0, z: 10 },
        { x: 10, z: 0 },
        { x: 20, z: 0 },
      ],
    },
    zones: [
      {
        id: "wall-slope-zone",
        materialId: "sabbia-Δ",
        polygon: [
          { x: 0, z: -20 },
          { x: 20, z: -20 },
          { x: 20, z: 0 },
          { x: 10, z: 0 },
          { x: 0, z: 10 },
        ],
      },
    ],
    units: units(),
  };
  const sourceSection = new sourceUnknown.GroundSection2D(sectionOptions);
  const typescriptSection = new typescriptUnknown.GroundSection2D(sectionOptions);
  const fieldOptions = { id: "wall-slope-dry-π", model: "none", units: units() };
  const sourceField = new sourceUnknown.PorePressureField2D(fieldOptions);
  const typescriptField = new typescriptUnknown.PorePressureField2D(fieldOptions);
  const sourceGlobalGround = new sourceUnknown.GroundModel({
    id: "wall-slope-ground",
    materials: [sourceStatic.soil],
    profiles: [sourceStatic.retained, sourceStatic.bearing],
    sections: [sourceSection],
    porePressureFields: [sourceField],
    units: units(),
  });
  const typescriptGlobalGround = new typescriptUnknown.GroundModel({
    id: "wall-slope-ground",
    materials: [typescriptStatic.soil],
    profiles: [typescriptStatic.retained, typescriptStatic.bearing],
    sections: [typescriptSection],
    porePressureFields: [typescriptField],
    units: units(),
  });
  const sourceGlobalSituation = new sourceUnknown.GeotechnicalDesignSituation({
    id: "wall-slope-situation",
    groundModel: sourceGlobalGround,
    limitState: "ULS",
    drainageCondition: "drained",
    requiredParameterBasis: "characteristic",
    profileId: "retained-地",
    sectionId: "wall-slope-section-ο",
    porePressureFieldId: "wall-slope-dry-π",
    units: units(),
  });
  const typescriptGlobalSituation = new typescriptUnknown.GeotechnicalDesignSituation({
    id: "wall-slope-situation",
    groundModel: typescriptGlobalGround,
    limitState: "ULS",
    drainageCondition: "drained",
    requiredParameterBasis: "characteristic",
    profileId: "retained-地",
    sectionId: "wall-slope-section-ο",
    porePressureFieldId: "wall-slope-dry-π",
    units: units(),
  });
  const sourceSlip = sourceUnknown.CircularSlipSurface2D.fromChordAndSagitta({
    id: "wall-global-circle-ρ",
    entry: { x: 0, z: 10 },
    exit: { x: 10, z: 0 },
    sagitta: 2,
    units: units(),
  });
  const typescriptSlip = typescriptUnknown.CircularSlipSurface2D.fromChordAndSagitta({
    id: "wall-global-circle-ρ",
    entry: { x: 0, z: 10 },
    exit: { x: 10, z: 0 },
    sagitta: 2,
    units: units(),
  });
  const globalScenarioOptions = (slipSurface: RuntimeInstance) => ({
    id: "global-scenario-σ",
    retainedSide: { profileId: "retained-地", state: "active", method: "rankine" },
    globalStability: {
      enabled: true,
      includeWallWeightAsSurcharge: true,
      analysisInput: { mode: "assigned-surface", slipSurface, sliceCount: 30 },
    },
    units: units(),
  });
  compare(
    new sourceUnknown.RetainingWallAnalysis().analyze({
      groundModel: sourceGlobalGround,
      designSituation: sourceGlobalSituation,
      wall: sourceStatic.wall,
      scenario: new sourceUnknown.RetainingWallLoadScenario(globalScenarioOptions(sourceSlip)),
      units: units(),
    }),
    new typescriptUnknown.RetainingWallAnalysis().analyze({
      groundModel: typescriptGlobalGround,
      designSituation: typescriptGlobalSituation,
      wall: typescriptStatic.wall,
      scenario: new typescriptUnknown.RetainingWallLoadScenario(
        globalScenarioOptions(typescriptSlip),
      ),
      units: units(),
    }),
  );

  const sourceFixture = fixture(sourceUnknown, false);
  const typescriptFixture = fixture(typescriptUnknown, false);
  const sourceUnsupported = new sourceUnknown.GeotechnicalDesignSituation({
    id: "seismic-situation",
    groundModel: sourceFixture.groundModel,
    limitState: "ULS",
    drainageCondition: "drained",
    situationType: "seismic",
    seismic: { model: "pseudostatic", kh: 0.1, kv: 0 },
    profileId: "retained-地",
    units: units(),
  });
  const typescriptUnsupported = new typescriptUnknown.GeotechnicalDesignSituation({
    id: "seismic-situation",
    groundModel: typescriptFixture.groundModel,
    limitState: "ULS",
    drainageCondition: "drained",
    situationType: "seismic",
    seismic: { model: "pseudostatic", kh: 0.1, kv: 0 },
    profileId: "retained-地",
    units: units(),
  });
  compare(
    new sourceUnknown.RetainingWallAnalysis().analyze({
      ...sourceFixture,
      designSituation: sourceUnsupported,
      units: units(),
    }),
    new typescriptUnknown.RetainingWallAnalysis().analyze({
      ...typescriptFixture,
      designSituation: typescriptUnsupported,
      units: units(),
    }),
  );
  compare(
    new sourceUnknown.RetainingWallAnalysis().analyze({ units: null }),
    new typescriptUnknown.RetainingWallAnalysis().analyze({ units: null }),
  );
});
