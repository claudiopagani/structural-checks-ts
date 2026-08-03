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

interface RootRuntimeModule extends RuntimeModule {
  GeotechnicalShallowFoundationApplication: RuntimeApplicationConstructor;
  SoilMaterial: RuntimeConstructor;
  GroundProfile: RuntimeConstructor;
  GroundModel: RuntimeConstructor;
  GeotechnicalDesignSituation: RuntimeConstructor;
  ShallowFoundationModel: RuntimeConstructor;
  ShallowFoundationActionState: RuntimeConstructor;
}

function isRecord(value: unknown): value is RuntimeModule {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isRootRuntimeModule(value: unknown): value is RootRuntimeModule {
  return (
    isRecord(value) &&
    typeof value.GeotechnicalShallowFoundationApplication === "function" &&
    typeof value.SoilMaterial === "function" &&
    typeof value.GroundProfile === "function" &&
    typeof value.GroundModel === "function" &&
    typeof value.GeotechnicalDesignSituation === "function" &&
    typeof value.ShallowFoundationModel === "function" &&
    typeof value.ShallowFoundationActionState === "function"
  );
}

function isApplicationModule(value: unknown): value is RuntimeModule {
  return (
    isRecord(value) &&
    typeof value.GeotechnicalShallowFoundationApplication === "function" &&
    typeof value.ShallowFoundationUltimateLimitStateAnalysis === "function" &&
    typeof value.ShallowFoundationServiceabilityAnalysis === "function" &&
    Array.isArray(value.SHALLOW_FOUNDATION_SHAPES) &&
    Array.isArray(value.SHALLOW_FOUNDATION_SETTLEMENT_METHODS)
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
  const source = "shallow-foundation application oracle \u2014 \u03B1\u03B2\u03B3";
  const soil = new moduleValue.SoilMaterial({
    id: "shallow-soil-\u03B4",
    name: "Shallow soil \u03BC",
    unitWeight: { bulk: 20, saturated: 20 },
    parameterSets: [
      {
        id: "shallow-soil-representative",
        basis: "representative",
        drainage: "drained",
        strength: {
          model: "mohr-coulomb-effective",
          frictionAngle: 34,
          cohesion: 0,
        },
        provenance: { source },
      },
    ],
    angleUnits: "deg",
    units,
  });
  const profile = new moduleValue.GroundProfile({
    id: "shallow-profile-\u03B5",
    groundSurfaceElevation: 0,
    materials: [soil],
    layers: [
      {
        id: "shallow-layer-\u03B6",
        topElevation: 0,
        bottomElevation: -10,
        materialId: soil.id,
      },
    ],
    groundwater: { model: "none" },
    units,
  });
  const groundModel = new moduleValue.GroundModel({
    id: "shallow-ground-\u03B7",
    materials: [soil],
    profiles: [profile],
    units,
  });
  const designSituation = new moduleValue.GeotechnicalDesignSituation({
    id: "shallow-uls-\u03B8",
    groundModel,
    limitState: "ULS",
    drainageCondition: "drained",
    requiredParameterBasis: "representative",
    profileId: profile.id,
    units,
  });
  const foundation = new moduleValue.ShallowFoundationModel({
    id: "shallow-foundation-\u03B9",
    shape: "rectangular",
    geometry: { width: 2, length: 3 },
    placement: { baseElevation: -1 },
    units,
  });
  const actionState = new moduleValue.ShallowFoundationActionState({
    id: "shallow-actions-\u03BA",
    basis: "total",
    resultantScope: "total-at-foundation-base",
    actions: {
      verticalForce: 1000,
      horizontalX: 0,
      horizontalY: 0,
      momentX: 0,
      momentY: 400,
    },
    units,
    metadata: { label: "actions \u03BB" },
  });
  return { groundModel, designSituation, foundation, actionState, units };
}

function applicationResult(moduleValue: RootRuntimeModule, input: unknown): unknown {
  return new moduleValue.GeotechnicalShallowFoundationApplication().run(input).toJSON();
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

void test("geotechnical shallow-foundation application matches the independent pinned JavaScript implementation", async () => {
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
    "src/applications/geotechnical-shallow-foundations/index.js",
  );
  const typescriptApplicationModuleValue: unknown = await loadModule(
    path.join(repositoryRoot, "dist"),
    "applications/geotechnical-shallow-foundations/index.js",
  );
  if (
    !isRootRuntimeModule(sourceRootModuleValue) ||
    !isRootRuntimeModule(typescriptRootModuleValue) ||
    !isApplicationModule(sourceApplicationModuleValue) ||
    !isApplicationModule(typescriptApplicationModuleValue)
  ) {
    throw new Error("Geotechnical shallow-foundation exports do not expose the expected API.");
  }

  assert.deepEqual(
    Object.keys(typescriptApplicationModuleValue),
    Object.keys(sourceApplicationModuleValue),
  );
  const runtimeExports = [
    "GeotechnicalShallowFoundationApplication",
    "SHALLOW_FOUNDATION_ACTION_BASES",
    "SHALLOW_FOUNDATION_ACTION_STATE_SCHEMA_VERSION",
    "SHALLOW_FOUNDATION_BASE_UPLIFT_TREATMENTS",
    "SHALLOW_FOUNDATION_BEARING_METHODS",
    "SHALLOW_FOUNDATION_BEARING_SELECTIONS",
    "SHALLOW_FOUNDATION_MODEL_SCHEMA_VERSION",
    "SHALLOW_FOUNDATION_SHAPES",
    "SHALLOW_FOUNDATION_SETTLEMENT_METHODS",
    "SHALLOW_FOUNDATION_SLS_RESULT_SCHEMA_VERSION",
    "SHALLOW_FOUNDATION_ULS_RESULT_SCHEMA_VERSION",
    "ShallowFoundationActionState",
    "ShallowFoundationModel",
    "ShallowFoundationUltimateLimitStateAnalysis",
    "ShallowFoundationServiceabilityAnalysis",
    "calculateRigidFoundationElasticStiffness",
    "calculateSchmertmannStrainInfluence",
    "calculateShallowFoundationDifferentialMovement",
    "calculateShallowFoundationVerticalStressInfluence",
    "calculateShallowFoundationBearingCapacity",
    "calculateShallowFoundationEffectiveGeometry",
    "calculateShallowFoundationSlidingResistance",
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

  const sourceApplication = new sourceRootModuleValue.GeotechnicalShallowFoundationApplication();
  const typescriptApplication =
    new typescriptRootModuleValue.GeotechnicalShallowFoundationApplication();
  assertExactParity(
    sourceApplication.getManifest(),
    typescriptApplication.getManifest(),
    "application manifest",
  );

  assertExactParity(
    applicationResult(sourceRootModuleValue, createFixture(sourceRootModuleValue)),
    applicationResult(typescriptRootModuleValue, createFixture(typescriptRootModuleValue)),
    "valid ULS application result",
  );
  assertExactParity(
    applicationResult(sourceRootModuleValue, {
      analysisType: "SLS",
      units: { force: "kN", length: "m" },
    }),
    applicationResult(typescriptRootModuleValue, {
      analysisType: "SLS",
      units: { force: "kN", length: "m" },
    }),
    "unsupported SLS result",
  );
  assertExactParity(
    applicationResult(sourceRootModuleValue, {}),
    applicationResult(typescriptRootModuleValue, {}),
    "missing-input result",
  );
  assert.deepEqual(
    captureError(() => applicationResult(sourceRootModuleValue, null)),
    captureError(() => applicationResult(typescriptRootModuleValue, null)),
    "null input error",
  );
});
