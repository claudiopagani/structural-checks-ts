import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const sourceRoot = path.resolve(repositoryRoot, "..", "strutture-js");
const normativeRoot = path.resolve(repositoryRoot, "..", "strutture-normative");
const sourceRevision = "6f33baead8b88166c4b2cf94af41763412e3c751";
const normativeRevision = "41da3faa489600173106935bbcf726119300e48d";

type RuntimeModule = Record<string, unknown>;
type RuntimeEntity = { id: string; toJSON(): unknown };
type RuntimeResult = { toJSON(): unknown };
type RuntimeApplication = {
  getManifest(): unknown;
  run(input?: unknown): RuntimeResult;
};
type RuntimeApplicationConstructor = new () => RuntimeApplication;
type RuntimeConstructor = new (options: Record<string, unknown>) => RuntimeEntity;
type RuntimeWallConstructor = RuntimeConstructor & {
  cantilever(options: Record<string, unknown>): RuntimeEntity;
};

interface RootRuntimeModule extends RuntimeModule {
  GeotechnicalRetainingWallApplication: RuntimeApplicationConstructor;
  SoilMaterial: RuntimeConstructor;
  GroundProfile: RuntimeConstructor;
  GroundModel: RuntimeConstructor;
  GeotechnicalDesignSituation: RuntimeConstructor;
  RetainingWallModel: RuntimeWallConstructor;
  RetainingWallLoadScenario: RuntimeConstructor;
}

function isRecord(value: unknown): value is RuntimeModule {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isRootRuntimeModule(value: unknown): value is RootRuntimeModule {
  return (
    isRecord(value) &&
    typeof value.GeotechnicalRetainingWallApplication === "function" &&
    typeof value.SoilMaterial === "function" &&
    typeof value.GroundProfile === "function" &&
    typeof value.GroundModel === "function" &&
    typeof value.GeotechnicalDesignSituation === "function" &&
    typeof value.RetainingWallModel === "function" &&
    typeof value.RetainingWallLoadScenario === "function"
  );
}

function isApplicationModule(value: unknown): value is RuntimeModule {
  return (
    isRecord(value) &&
    typeof value.GeotechnicalRetainingWallApplication === "function" &&
    typeof value.RetainingWallAnalysis === "function" &&
    typeof value.RetainingWallLoadScenario === "function" &&
    typeof value.RetainingWallModel === "function" &&
    Array.isArray(value.RETAINING_WALL_TYPES) &&
    Array.isArray(value.RETAINING_WALL_BASE_UPLIFT_MODELS)
  );
}

function gitOutput(repository: string, ...arguments_: readonly string[]): string {
  return execFileSync("git", ["-C", repository, ...arguments_], { encoding: "utf8" }).trim();
}

async function loadModule(root: string, relativePath: string): Promise<RuntimeModule> {
  const module: unknown = await import(pathToFileURL(path.join(root, relativePath)).href);
  if (!isRecord(module)) {
    throw new Error(`The module ${relativePath} is not an object module.`);
  }
  return module;
}

function assertExactParity(source: unknown, typescript: unknown, label: string): void {
  assert.deepEqual(typescript, source, label);
  assert.equal(JSON.stringify(typescript), JSON.stringify(source), `${label}: exact JSON`);
  assert.deepEqual([...JSON.stringify(typescript)], [...JSON.stringify(source)]);
}

function createFixture(moduleValue: RootRuntimeModule): RuntimeModule {
  const units = { force: "kN", length: "m" };
  const source = "retaining-wall application oracle \u2014 \u03B1\u03B2\u03B3";
  const soil = new moduleValue.SoilMaterial({
    id: "retaining-soil-\u03B4",
    name: "Retaining soil \u03BC",
    unitWeight: { bulk: 18, saturated: 20 },
    parameterSets: [
      {
        id: "retaining-soil-characteristic",
        basis: "characteristic",
        drainage: "drained",
        strength: {
          model: "mohr-coulomb-effective",
          frictionAngle: 30,
          cohesion: 0,
        },
        provenance: { source },
      },
    ],
    angleUnits: "deg",
    units,
  });
  const retained = new moduleValue.GroundProfile({
    id: "retained-\u03B5",
    groundSurfaceElevation: 4.5,
    materials: [soil],
    layers: [
      {
        id: "retained-layer-\u03B6",
        topElevation: 4.5,
        bottomElevation: -20,
        materialId: soil.id,
      },
    ],
    groundwater: { model: "none" },
    units,
  });
  const bearing = new moduleValue.GroundProfile({
    id: "bearing-\u03B7",
    groundSurfaceElevation: 0.5,
    materials: [soil],
    layers: [
      {
        id: "bearing-layer-\u03B8",
        topElevation: 0.5,
        bottomElevation: -20,
        materialId: soil.id,
      },
    ],
    groundwater: { model: "none" },
    units,
  });
  const groundModel = new moduleValue.GroundModel({
    id: "ground-\u03B9",
    materials: [soil],
    profiles: [retained, bearing],
    units,
  });
  const designSituation = new moduleValue.GeotechnicalDesignSituation({
    id: "persistent-wall-\u03BA",
    groundModel,
    limitState: "ULS",
    drainageCondition: "drained",
    requiredParameterBasis: "characteristic",
    profileId: retained.id,
    units,
  });
  const wall = moduleValue.RetainingWallModel.cantilever({
    id: "wall-\u03BB",
    name: "Muro \u03BB",
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
    units,
  });
  const scenario = new moduleValue.RetainingWallLoadScenario({
    id: "static-scenario-\u03BC",
    retainedSide: {
      profileId: retained.id,
      state: "active",
      method: "rankine",
    },
    foundation: {
      profileId: bearing.id,
      baseInterface: {
        id: "base-interface-\u03BD",
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
    baseUplift: { model: "none" },
    units,
    metadata: { label: "scenario \u03BE" },
  });
  return { groundModel, designSituation, wall, scenario, units };
}

function applicationResult(moduleValue: RootRuntimeModule, input: unknown): unknown {
  return new moduleValue.GeotechnicalRetainingWallApplication().run(input).toJSON();
}

function captureError(run: () => unknown): { name: string; message: string } | null {
  try {
    run();
    return null;
  } catch (error: unknown) {
    if (!(error instanceof Error)) {
      throw new Error("The application threw a non-Error value.", { cause: error });
    }
    return { name: error.name, message: error.message };
  }
}

void test("geotechnical retaining-wall application matches the independent pinned JavaScript implementation", async () => {
  assert.equal(gitOutput(sourceRoot, "rev-parse", "HEAD"), sourceRevision);
  assert.equal(gitOutput(sourceRoot, "status", "--porcelain"), "");
  assert.equal(gitOutput(normativeRoot, "rev-parse", "HEAD"), normativeRevision);
  assert.equal(gitOutput(normativeRoot, "status", "--porcelain"), "");

  const sourceRootModuleValue: unknown = await loadModule(sourceRoot, "src/index.js");
  const typescriptRootModuleValue: unknown = await loadModule(
    path.join(repositoryRoot, "dist"),
    "index.js",
  );
  const sourceApplicationModuleValue: unknown = await loadModule(
    sourceRoot,
    "src/applications/geotechnical-retaining-walls/index.js",
  );
  const typescriptApplicationModuleValue: unknown = await loadModule(
    path.join(repositoryRoot, "dist"),
    "applications/geotechnical-retaining-walls/index.js",
  );
  if (
    !isRootRuntimeModule(sourceRootModuleValue) ||
    !isRootRuntimeModule(typescriptRootModuleValue) ||
    !isApplicationModule(sourceApplicationModuleValue) ||
    !isApplicationModule(typescriptApplicationModuleValue)
  ) {
    throw new Error("Geotechnical retaining-wall exports do not expose the expected API.");
  }

  assert.deepEqual(
    Object.keys(typescriptApplicationModuleValue),
    Object.keys(sourceApplicationModuleValue),
  );
  const runtimeExports = [
    "GeotechnicalRetainingWallApplication",
    "RETAINING_WALL_ANALYSIS_RESULT_SCHEMA_VERSION",
    "RETAINING_WALL_BASE_UPLIFT_MODELS",
    "RETAINING_WALL_LOAD_SCENARIO_SCHEMA_VERSION",
    "RETAINING_WALL_MODEL_SCHEMA_VERSION",
    "RETAINING_WALL_SEISMIC_DIRECTIONS",
    "RETAINING_WALL_TYPES",
    "RetainingWallAnalysis",
    "RetainingWallLoadScenario",
    "RetainingWallModel",
    "calculateRetainingWallPolygonProperties",
  ];
  for (const name of runtimeExports) {
    const sourceValue: unknown = sourceApplicationModuleValue[name];
    const typescriptValue: unknown = typescriptApplicationModuleValue[name];
    if (typeof sourceValue === "function") {
      assert.notEqual(typescriptValue, sourceValue, `${name} independent implementation`);
    } else if (typeof sourceValue === "object" && sourceValue !== null) {
      assert.deepEqual(typescriptValue, sourceValue, `${name} exact value`);
      assert.notEqual(typescriptValue, sourceValue, `${name} independent implementation`);
    } else {
      assert.equal(typescriptValue, sourceValue, `${name} exact primitive`);
    }
    assert.equal(typescriptRootModuleValue[name], typescriptValue, `${name} TypeScript root alias`);
    assert.equal(sourceRootModuleValue[name], sourceValue, `${name} source root alias`);
  }

  const sourceApplication = new sourceRootModuleValue.GeotechnicalRetainingWallApplication();
  const typescriptApplication =
    new typescriptRootModuleValue.GeotechnicalRetainingWallApplication();
  assertExactParity(
    sourceApplication.getManifest(),
    typescriptApplication.getManifest(),
    "application manifest",
  );

  assertExactParity(
    applicationResult(sourceRootModuleValue, createFixture(sourceRootModuleValue)),
    applicationResult(typescriptRootModuleValue, createFixture(typescriptRootModuleValue)),
    "valid application result",
  );
  assertExactParity(
    applicationResult(sourceRootModuleValue, { units: { force: "kN", length: "m" } }),
    applicationResult(typescriptRootModuleValue, { units: { force: "kN", length: "m" } }),
    "missing-input result",
  );
  assertExactParity(
    applicationResult(sourceRootModuleValue, {
      units: { force: "kN", length: "m" },
      scenario: { retainedSide: { state: "unsupported-state", method: "rankine" } },
    }),
    applicationResult(typescriptRootModuleValue, {
      units: { force: "kN", length: "m" },
      scenario: { retainedSide: { state: "unsupported-state", method: "rankine" } },
    }),
    "unsupported scenario result",
  );
  assert.deepEqual(
    captureError(() => applicationResult(sourceRootModuleValue, null)),
    captureError(() => applicationResult(typescriptRootModuleValue, null)),
    "null input error",
  );
});
