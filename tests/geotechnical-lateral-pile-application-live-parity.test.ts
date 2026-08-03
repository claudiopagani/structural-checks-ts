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
const units = { force: "kN", length: "m" } as const;

type RuntimeModule = Record<string, unknown>;
type RuntimeEntity = { id: string; toJSON(): unknown };
type RuntimeResult = { toJSON(): unknown };
type RuntimeApplication = {
  getManifest(): unknown;
  run(input?: unknown): RuntimeResult;
};
type RuntimeApplicationConstructor = new () => RuntimeApplication;
type RuntimeConstructor<T> = new (options: Record<string, unknown>) => T;

interface RootRuntimeModule extends RuntimeModule {
  GeotechnicalLateralPileApplication: RuntimeApplicationConstructor;
  SoilMaterial: RuntimeConstructor<RuntimeEntity>;
  GroundProfile: RuntimeConstructor<RuntimeEntity>;
  GroundModel: RuntimeConstructor<RuntimeEntity>;
  GeotechnicalDesignSituation: RuntimeConstructor<RuntimeEntity>;
  DeepFoundationModel: RuntimeConstructor<RuntimeEntity>;
  LateralPileLoadScenario: RuntimeConstructor<RuntimeEntity>;
}

function isRecord(value: unknown): value is RuntimeModule {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isRootRuntimeModule(value: unknown): value is RootRuntimeModule {
  return (
    isRecord(value) &&
    typeof value.GeotechnicalLateralPileApplication === "function" &&
    typeof value.SoilMaterial === "function" &&
    typeof value.GroundProfile === "function" &&
    typeof value.GroundModel === "function" &&
    typeof value.GeotechnicalDesignSituation === "function" &&
    typeof value.DeepFoundationModel === "function" &&
    typeof value.LateralPileLoadScenario === "function"
  );
}

function isApplicationModule(value: unknown): value is RuntimeModule {
  return (
    isRecord(value) &&
    typeof value.GeotechnicalLateralPileApplication === "function" &&
    typeof value.LateralPileCapacityAnalysis === "function" &&
    typeof value.LateralPileBeamOnSpringsAnalysis === "function" &&
    Array.isArray(value.LATERAL_PILE_CAPACITY_METHODS) &&
    Array.isArray(value.LATERAL_PILE_RESPONSE_METHODS)
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

function createCapacityInput(moduleValue: RootRuntimeModule): Record<string, unknown> {
  const source = "lateral-pile application oracle \u2014 \u03B1\u03B2\u03B3";
  const material = new moduleValue.SoilMaterial({
    id: "lateral-soil-\u03B4",
    name: "Lateral soil \u03BC",
    unitWeight: { bulk: 18, saturated: 20 },
    parameterSets: [
      {
        id: "lateral-soil-characteristic",
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
  const profile = new moduleValue.GroundProfile({
    id: "lateral-profile-\u03B5",
    groundSurfaceElevation: 0,
    materials: [material],
    layers: [
      {
        id: "lateral-layer-\u03B6",
        topElevation: 0,
        bottomElevation: -20,
        materialId: material.id,
      },
    ],
    groundwater: { model: "none" },
    units,
  });
  const groundModel = new moduleValue.GroundModel({
    id: "lateral-ground-\u03B8",
    materials: [material],
    profiles: [profile],
    units,
  });
  const designSituation = new moduleValue.GeotechnicalDesignSituation({
    id: "lateral-uls-\u03B9",
    groundModel,
    limitState: "ULS",
    drainageCondition: "drained",
    requiredParameterBasis: "characteristic",
    profileId: profile.id,
    units,
  });
  const pile = new moduleValue.DeepFoundationModel({
    id: "lateral-pile-\u03BA",
    geometry: { model: "circular", diameter: 1 },
    placement: {
      headElevation: 0,
      soilContactTopElevation: 0,
      toeElevation: -5,
    },
    construction: {
      installationMethod: "assigned-test-method",
      structuralMaterial: "assigned-test-material",
      displacementClass: "not-classified",
    },
    units,
  });
  const scenario = new moduleValue.LateralPileLoadScenario({
    id: "lateral-scenario-\u03BB",
    soilBranch: "cohesionless-drained",
    action: {
      lateralShear: 100,
      overturningMoment: 50,
      basis: "design",
      referencePoint: "groundline-at-pile-axis",
    },
    behaviorAssertion: {
      classification: "short-rigid",
      basis: "project-rigidity-assessment",
      provenance: { source },
    },
    resistanceConversion: null,
    units,
  });
  return { groundModel, designSituation, pile, scenario, units };
}

function applicationResult(moduleValue: RootRuntimeModule, input: unknown): unknown {
  return new moduleValue.GeotechnicalLateralPileApplication().run(input).toJSON();
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

void test("geotechnical lateral-pile application matches the independent pinned JavaScript implementation", async () => {
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
    "src/applications/geotechnical-lateral-piles/index.js",
  );
  const typescriptApplicationModuleValue: unknown = await loadModule(
    path.join(repositoryRoot, "dist"),
    "applications/geotechnical-lateral-piles/index.js",
  );
  if (
    !isRootRuntimeModule(sourceRootModuleValue) ||
    !isRootRuntimeModule(typescriptRootModuleValue) ||
    !isApplicationModule(sourceApplicationModuleValue) ||
    !isApplicationModule(typescriptApplicationModuleValue)
  ) {
    throw new Error("Geotechnical lateral-pile exports do not expose the expected API.");
  }

  assert.deepEqual(
    Object.keys(typescriptApplicationModuleValue),
    Object.keys(sourceApplicationModuleValue),
  );
  const runtimeExports = [
    "GeotechnicalLateralPileApplication",
    "DEEP_FOUNDATION_DISPLACEMENT_CLASSES",
    "DEEP_FOUNDATION_ELEMENT_TYPES",
    "DEEP_FOUNDATION_GEOMETRY_MODELS",
    "DEEP_FOUNDATION_MODEL_SCHEMA_VERSION",
    "DeepFoundationModel",
    "LATERAL_PILE_BEHAVIOR_CLASSIFICATIONS",
    "LATERAL_PILE_BROMS_REFERENCE",
    "LATERAL_PILE_CAPACITY_METHODS",
    "LATERAL_PILE_CAPACITY_RESULT_SCHEMA_VERSION",
    "LATERAL_PILE_HEAD_CONDITIONS",
    "LATERAL_PILE_LOAD_SCENARIO_SCHEMA_VERSION",
    "LATERAL_PILE_ACTION_REFERENCE_POINTS",
    "LATERAL_PILE_END_RESTRAINTS",
    "LATERAL_PILE_PY_REFERENCE",
    "LATERAL_PILE_PY_RESULT_SCHEMA_VERSION",
    "LATERAL_PILE_RESPONSE_METHODS",
    "LATERAL_PILE_RESPONSE_SCENARIO_SCHEMA_VERSION",
    "LATERAL_PILE_RESISTANCE_CONVERSION_MODELS",
    "LATERAL_PILE_SOIL_RESPONSE_MODELS",
    "LATERAL_PILE_SOIL_BRANCHES",
    "PILE_TRANSFER_CURVE_MODELS",
    "PILE_TRANSFER_EXTRAPOLATION_MODELS",
    "PILE_TRANSFER_LAW_KINDS",
    "PILE_TRANSFER_LAW_SCHEMA_VERSION",
    "LateralPileBeamOnSpringsAnalysis",
    "LateralPileCapacityAnalysis",
    "LateralPileLoadScenario",
    "LateralPileResponseScenario",
    "PileTransferLaw",
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

  const sourceApplication = new sourceRootModuleValue.GeotechnicalLateralPileApplication();
  const typescriptApplication = new typescriptRootModuleValue.GeotechnicalLateralPileApplication();
  assertExactParity(
    sourceApplication.getManifest(),
    typescriptApplication.getManifest(),
    "application manifest",
  );

  assertExactParity(
    applicationResult(sourceRootModuleValue, createCapacityInput(sourceRootModuleValue)),
    applicationResult(typescriptRootModuleValue, createCapacityInput(typescriptRootModuleValue)),
    "valid capacity application result",
  );
  assertExactParity(
    applicationResult(sourceRootModuleValue, { units, scenario: { method: "beam-on-py-springs" } }),
    applicationResult(typescriptRootModuleValue, {
      units,
      scenario: { method: "beam-on-py-springs" },
    }),
    "unsupported beam-on-p-y-springs result",
  );
  assertExactParity(
    applicationResult(sourceRootModuleValue, {}),
    applicationResult(typescriptRootModuleValue, {}),
    "missing input result",
  );
  assert.deepEqual(
    captureError(() => applicationResult(sourceRootModuleValue, null)),
    captureError(() => applicationResult(typescriptRootModuleValue, null)),
    "null input error",
  );
});
