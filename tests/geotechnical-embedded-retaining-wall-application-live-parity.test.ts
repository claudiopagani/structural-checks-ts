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
type RuntimeResult = { toJSON(): unknown };
type RuntimeApplication = {
  getManifest(): unknown;
  run(input?: Record<string, unknown>): RuntimeResult;
};
type RuntimeApplicationConstructor = new () => RuntimeApplication;

interface RootRuntimeModule extends RuntimeModule {
  GeotechnicalEmbeddedRetainingWallApplication: RuntimeApplicationConstructor;
}

function isRecord(value: unknown): value is RuntimeModule {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isRootRuntimeModule(value: unknown): value is RootRuntimeModule {
  return (
    isRecord(value) && typeof value.GeotechnicalEmbeddedRetainingWallApplication === "function"
  );
}

function isApplicationModule(value: unknown): value is RuntimeModule {
  return (
    isRecord(value) &&
    typeof value.GeotechnicalEmbeddedRetainingWallApplication === "function" &&
    typeof value.EmbeddedRetainingWallAnalysis === "function" &&
    typeof value.EmbeddedRetainingWallModel === "function" &&
    typeof value.EmbeddedRetainingWallScenario === "function" &&
    typeof value.WallSoilReactionLaw === "function" &&
    Array.isArray(value.EMBEDDED_RETAINING_WALL_SUPPORT_TYPES) &&
    Array.isArray(value.WALL_SOIL_REACTION_MODELS)
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

function analysisInput(): Record<string, unknown> {
  const units = { force: "kN", length: "m" };
  const source = "independent embedded-wall application oracle \u2014 \u03B1\u03B2\u03B3";
  const material = {
    id: "wall-soil-\u03B4",
    name: "Wall soil \u03BC",
    unitWeight: { bulk: 18, saturated: 20 },
    parameterSets: [
      {
        id: "wall-soil-characteristic",
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
  };
  const profile = {
    id: "wall-profile-\u03B5",
    groundSurfaceElevation: 0,
    materials: [material],
    layers: [
      {
        id: "wall-layer-\u03B6",
        topElevation: 0,
        bottomElevation: -3,
        materialId: material.id,
      },
    ],
    units,
  };
  const side = {
    profileId: profile.id,
    defaultPorePressureFieldId: null,
    curvesByLayer: {
      ["wall-layer-\u03B6"]: {
        stations: [
          {
            depth: 1.5,
            law: {
              id: "law-\u03B7",
              points: [
                { closureDisplacement: -1, effectivePressure: 0 },
                { closureDisplacement: 1, effectivePressure: 0 },
              ],
              extrapolation: "constant",
              provenance: { source },
              units,
            },
          },
        ],
      },
    },
  };
  return {
    groundModel: {
      id: "ground-\u03B8",
      materials: [material],
      profiles: [profile],
      units,
    },
    designSituation: {
      id: "situation-\u03B9",
      groundModelId: "ground-\u03B8",
      situationType: "persistent",
      limitState: "SLS",
      drainageCondition: "drained",
      requiredParameterBasis: "characteristic",
      profileId: profile.id,
      seismic: { model: "none" },
      units,
    },
    wall: {
      id: "wall-\u03BA",
      topElevation: 0,
      toeElevation: -1,
      analysisWidth: 1,
      flexuralRigiditySegments: [
        {
          id: "wall-section-\u03BB",
          topElevation: 0,
          bottomElevation: -1,
          flexuralRigidity: 600,
          provenance: { source },
        },
      ],
      toeCondition: { translation: "fixed", rotation: "fixed" },
      units,
    },
    scenario: {
      id: "scenario-\u03BD",
      loadingCondition: "static",
      soilResponse: {
        model: "assigned-effective-pressure-displacement-curves",
        sides: { retained: side, excavation: side },
      },
      stages: [
        {
          id: "stage-\u03BE",
          name: "Stage \u03BF",
          retainedGroundElevation: 0,
          excavationGroundElevation: 0,
          pressureLoads: [
            {
              id: "load-\u03C0",
              side: "retained",
              segments: [
                {
                  topElevation: 0,
                  bottomElevation: -1,
                  topPressure: 10,
                  bottomPressure: 10,
                },
              ],
              provenance: { source },
            },
          ],
        },
      ],
      discretization: { maxElementLength: 1 },
      solver: {
        incrementsPerStage: 4,
        maxIterations: 50,
        relativeResidualTolerance: 1e-10,
        displacementTolerance: 1e-12,
      },
      units,
    },
    units,
  };
}

function applicationResult(
  moduleValue: RootRuntimeModule,
  input: Record<string, unknown>,
): unknown {
  return new moduleValue.GeotechnicalEmbeddedRetainingWallApplication().run(input).toJSON();
}

void test("geotechnical embedded-retaining-wall application matches the independent pinned JavaScript implementation", async () => {
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
    "src/applications/geotechnical-embedded-retaining-walls/index.js",
  );
  const typescriptApplicationModuleValue: unknown = await loadModule(
    path.join(repositoryRoot, "dist"),
    "applications/geotechnical-embedded-retaining-walls/index.js",
  );
  if (
    !isRootRuntimeModule(sourceRootModuleValue) ||
    !isRootRuntimeModule(typescriptRootModuleValue) ||
    !isApplicationModule(sourceApplicationModuleValue) ||
    !isApplicationModule(typescriptApplicationModuleValue)
  ) {
    throw new Error("Embedded-retaining-wall exports do not expose the expected API.");
  }

  assert.deepEqual(
    Object.keys(typescriptApplicationModuleValue),
    Object.keys(sourceApplicationModuleValue),
  );
  const runtimeExports = [
    "GeotechnicalEmbeddedRetainingWallApplication",
    "EMBEDDED_RETAINING_WALL_END_RESTRAINTS",
    "EMBEDDED_RETAINING_WALL_LOADING_CONDITIONS",
    "EMBEDDED_RETAINING_WALL_MODEL_SCHEMA_VERSION",
    "EMBEDDED_RETAINING_WALL_REFERENCES",
    "EMBEDDED_RETAINING_WALL_RESULT_SCHEMA_VERSION",
    "EMBEDDED_RETAINING_WALL_SCENARIO_SCHEMA_VERSION",
    "EMBEDDED_RETAINING_WALL_SUPPORT_BEHAVIORS",
    "EMBEDDED_RETAINING_WALL_SUPPORT_TYPES",
    "EMBEDDED_RETAINING_WALL_TYPES",
    "WALL_SOIL_REACTION_EXTRAPOLATION_MODELS",
    "WALL_SOIL_REACTION_LAW_SCHEMA_VERSION",
    "WALL_SOIL_REACTION_MODELS",
    "EmbeddedRetainingWallAnalysis",
    "EmbeddedRetainingWallModel",
    "EmbeddedRetainingWallScenario",
    "WallSoilReactionLaw",
  ];
  const constructorExports = new Set([
    "GeotechnicalEmbeddedRetainingWallApplication",
    "EmbeddedRetainingWallAnalysis",
    "EmbeddedRetainingWallModel",
    "EmbeddedRetainingWallScenario",
    "WallSoilReactionLaw",
  ]);
  for (const name of runtimeExports) {
    if (constructorExports.has(name)) {
      assert.notEqual(
        typescriptApplicationModuleValue[name],
        sourceApplicationModuleValue[name],
        `${name} independent implementations`,
      );
    } else {
      assert.deepEqual(
        typescriptApplicationModuleValue[name],
        sourceApplicationModuleValue[name],
        `${name} exact values`,
      );
    }
    assert.equal(
      typescriptRootModuleValue[name],
      typescriptApplicationModuleValue[name],
      `${name} TypeScript root alias`,
    );
    assert.equal(
      sourceRootModuleValue[name],
      sourceApplicationModuleValue[name],
      `${name} source root alias`,
    );
  }
  for (const name of [
    "EMBEDDED_RETAINING_WALL_END_RESTRAINTS",
    "EMBEDDED_RETAINING_WALL_LOADING_CONDITIONS",
    "EMBEDDED_RETAINING_WALL_SUPPORT_TYPES",
    "WALL_SOIL_REACTION_MODELS",
  ]) {
    assert.deepEqual(
      typescriptApplicationModuleValue[name],
      sourceApplicationModuleValue[name],
      `${name} exact values`,
    );
  }

  const sourceApplication =
    new sourceRootModuleValue.GeotechnicalEmbeddedRetainingWallApplication();
  const typescriptApplication =
    new typescriptRootModuleValue.GeotechnicalEmbeddedRetainingWallApplication();
  assertExactParity(
    sourceApplication.getManifest(),
    typescriptApplication.getManifest(),
    "application manifest",
  );

  const input = analysisInput();
  assertExactParity(
    applicationResult(sourceRootModuleValue, input),
    applicationResult(typescriptRootModuleValue, analysisInput()),
    "valid application result",
  );
  assertExactParity(
    applicationResult(sourceRootModuleValue, { units: null }),
    applicationResult(typescriptRootModuleValue, { units: null }),
    "missing input result",
  );
  assertExactParity(
    applicationResult(sourceRootModuleValue, {
      ...input,
      scenario: {
        ...(input.scenario as Record<string, unknown>),
        loadingCondition: "pseudostatic",
      },
    }),
    applicationResult(typescriptRootModuleValue, {
      ...analysisInput(),
      scenario: {
        ...(analysisInput().scenario as Record<string, unknown>),
        loadingCondition: "pseudostatic",
      },
    }),
    "unsupported pseudostatic result",
  );
});
