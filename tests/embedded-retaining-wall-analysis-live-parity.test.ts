import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const sourceRoot = path.resolve(repositoryRoot, "..", "strutture-js");
const sourceRevision = "6f33baead8b88166c4b2cf94af41763412e3c751";

interface AnalysisResult {
  status: string;
  summary: string;
  outputs: Record<string, unknown>;
  warnings: string[];
  assumptions: string[];
  metadata: Record<string, unknown>;
}

interface AnalysisModule {
  EMBEDDED_RETAINING_WALL_REFERENCES: readonly string[];
  EMBEDDED_RETAINING_WALL_RESULT_SCHEMA_VERSION: string;
  EmbeddedRetainingWallAnalysis: new () => {
    analyze(input: Record<string, unknown>): AnalysisResult;
  };
}

interface AnalysisInput extends Record<string, unknown> {
  scenario: Record<string, unknown>;
}

function isAnalysisModule(value: unknown): value is AnalysisModule {
  return (
    value !== null &&
    typeof value === "object" &&
    typeof Reflect.get(value, "EmbeddedRetainingWallAnalysis") === "function" &&
    Array.isArray(Reflect.get(value, "EMBEDDED_RETAINING_WALL_REFERENCES")) &&
    typeof Reflect.get(value, "EMBEDDED_RETAINING_WALL_RESULT_SCHEMA_VERSION") === "string"
  );
}

function gitOutput(...arguments_: readonly string[]): string {
  return execFileSync("git", ["-C", sourceRoot, ...arguments_], { encoding: "utf8" }).trim();
}

function analysisInput(): AnalysisInput {
  const units = { force: "kN", length: "m" };
  const source = "independent embedded-wall analysis oracle — αβγ";
  const material = {
    id: "soil-α",
    name: "Soil μ",
    unitWeight: { bulk: 18, saturated: 20 },
    parameterSets: [
      {
        id: "soil-parameters",
        basis: "characteristic",
        drainage: "drained",
        strength: { model: "mohr-coulomb-effective", frictionAngle: 30, cohesion: 0 },
        provenance: { source },
      },
    ],
    angleUnits: "deg",
    units,
  };
  const profile = {
    id: "profile-γ",
    groundSurfaceElevation: 0,
    materials: [material],
    layers: [{ id: "layer-δ", topElevation: 0, bottomElevation: -3, materialId: material.id }],
    units,
  };
  const zeroLaw = {
    id: "law-ε",
    points: [
      { closureDisplacement: -1, effectivePressure: 0 },
      { closureDisplacement: 1, effectivePressure: 0 },
    ],
    extrapolation: "constant",
    provenance: { source },
    units,
  };
  const side = {
    profileId: profile.id,
    defaultPorePressureFieldId: null,
    curvesByLayer: {
      ["layer-δ"]: { stations: [{ depth: 1.5, law: zeroLaw }] },
    },
  };
  return {
    groundModel: {
      id: "ground-ζ",
      materials: [material],
      profiles: [profile],
      units,
    },
    designSituation: {
      id: "situation-η",
      groundModelId: "ground-ζ",
      situationType: "persistent",
      limitState: "SLS",
      drainageCondition: "drained",
      requiredParameterBasis: "characteristic",
      profileId: profile.id,
      seismic: { model: "none" },
      units,
    },
    wall: {
      id: "wall-θ",
      topElevation: 0,
      toeElevation: -1,
      analysisWidth: 1,
      flexuralRigiditySegments: [
        {
          id: "wall-section-ι",
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
      id: "scenario-κ",
      loadingCondition: "static",
      soilResponse: {
        model: "assigned-effective-pressure-displacement-curves",
        sides: { retained: side, excavation: side },
      },
      stages: [
        {
          id: "stage-λ",
          name: "Carico μ",
          retainedGroundElevation: 0,
          excavationGroundElevation: 0,
          pressureLoads: [
            {
              id: "load-ν",
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

function pseudostaticAnalysisInput(): AnalysisInput {
  const input = analysisInput();
  return {
    ...input,
    scenario: { ...input.scenario, loadingCondition: "pseudostatic" },
  };
}

function serialized(value: AnalysisResult): string {
  return JSON.stringify(value);
}

void test("EmbeddedRetainingWallAnalysis matches the independent pinned JavaScript implementation", async () => {
  assert.equal(gitOutput("rev-parse", "HEAD"), sourceRevision);
  assert.equal(gitOutput("status", "--porcelain"), "");
  const sourceModuleValue: unknown = await import(
    pathToFileURL(path.join(sourceRoot, "src", "index.js")).href
  );
  const typescriptModuleValue: unknown = await import(
    pathToFileURL(path.join(repositoryRoot, "dist", "index.js")).href
  );
  if (!isAnalysisModule(sourceModuleValue) || !isAnalysisModule(typescriptModuleValue)) {
    throw new Error("Embedded-retaining-wall analysis exports do not expose the expected API.");
  }
  assert.deepEqual(
    typescriptModuleValue.EMBEDDED_RETAINING_WALL_REFERENCES,
    sourceModuleValue.EMBEDDED_RETAINING_WALL_REFERENCES,
  );
  assert.equal(
    typescriptModuleValue.EMBEDDED_RETAINING_WALL_RESULT_SCHEMA_VERSION,
    sourceModuleValue.EMBEDDED_RETAINING_WALL_RESULT_SCHEMA_VERSION,
  );
  assert.notEqual(
    typescriptModuleValue.EmbeddedRetainingWallAnalysis,
    sourceModuleValue.EmbeddedRetainingWallAnalysis,
  );

  const sourceResult = new sourceModuleValue.EmbeddedRetainingWallAnalysis().analyze(
    analysisInput(),
  );
  const typescriptResult = new typescriptModuleValue.EmbeddedRetainingWallAnalysis().analyze(
    analysisInput(),
  );
  assert.deepEqual(typescriptResult, sourceResult);
  assert.equal(serialized(typescriptResult), serialized(sourceResult));
  assert.deepEqual([...serialized(typescriptResult)], [...serialized(sourceResult)]);
  assert.deepEqual(
    [...serialized(typescriptResult).normalize()],
    [...serialized(sourceResult).normalize()],
  );

  const unsupportedCases: readonly [
    (moduleValue: AnalysisModule) => AnalysisResult,
    (moduleValue: AnalysisModule) => AnalysisResult,
  ][] = [
    [
      (moduleValue) => new moduleValue.EmbeddedRetainingWallAnalysis().analyze({ units: null }),
      (moduleValue) => new moduleValue.EmbeddedRetainingWallAnalysis().analyze({ units: null }),
    ],
    [
      (moduleValue) =>
        new moduleValue.EmbeddedRetainingWallAnalysis().analyze(pseudostaticAnalysisInput()),
      (moduleValue) =>
        new moduleValue.EmbeddedRetainingWallAnalysis().analyze(pseudostaticAnalysisInput()),
    ],
  ];
  for (const [sourceCase, typescriptCase] of unsupportedCases) {
    const sourceErrorResult = sourceCase(sourceModuleValue);
    const typescriptErrorResult = typescriptCase(typescriptModuleValue);
    assert.deepEqual(typescriptErrorResult, sourceErrorResult);
    assert.equal(serialized(typescriptErrorResult), serialized(sourceErrorResult));
  }
});
