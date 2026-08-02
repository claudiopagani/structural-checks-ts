import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const sourceRoot = path.resolve(repositoryRoot, "..", "strutture-js");
const sourceRevision = "6f33baead8b88166c4b2cf94af41763412e3c751";

interface RuntimeValue {
  toJSON?(): Record<string, unknown>;
}

interface RuntimeAnalysis {
  analyze(input: Record<string, unknown>): Record<string, unknown>;
}

interface RuntimeModule {
  DEEP_FOUNDATION_MODEL_SCHEMA_VERSION: string;
  GEOTECHNICAL_DESIGN_SITUATION_SCHEMA_VERSION: string;
  GROUND_MODEL_SCHEMA_VERSION: string;
  LATERAL_PILE_PY_REFERENCE: string;
  LATERAL_PILE_PY_RESULT_SCHEMA_VERSION: string;
  LateralPileBeamOnSpringsAnalysis: new (options?: Record<string, unknown>) => RuntimeAnalysis;
  DeepFoundationModel: new (options: Record<string, unknown>) => RuntimeValue;
  GeotechnicalDesignSituation: new (options: Record<string, unknown>) => RuntimeValue;
  GroundModel: new (options: Record<string, unknown>) => RuntimeValue;
  GroundProfile: new (options: Record<string, unknown>) => RuntimeValue;
  PileTransferLaw: new (options: Record<string, unknown>) => RuntimeValue;
  LateralPileResponseScenario: new (options: Record<string, unknown>) => RuntimeValue;
  SoilMaterial: new (options: Record<string, unknown>) => RuntimeValue;
}

type AnalysisCase = "base" | "fixed-zero";

function isRuntimeModule(value: unknown): value is RuntimeModule {
  return (
    value !== null &&
    typeof value === "object" &&
    typeof Reflect.get(value, "LATERAL_PILE_PY_REFERENCE") === "string" &&
    typeof Reflect.get(value, "LATERAL_PILE_PY_RESULT_SCHEMA_VERSION") === "string" &&
    typeof Reflect.get(value, "LateralPileBeamOnSpringsAnalysis") === "function" &&
    typeof Reflect.get(value, "DeepFoundationModel") === "function" &&
    typeof Reflect.get(value, "GeotechnicalDesignSituation") === "function" &&
    typeof Reflect.get(value, "GroundModel") === "function" &&
    typeof Reflect.get(value, "GroundProfile") === "function" &&
    typeof Reflect.get(value, "PileTransferLaw") === "function" &&
    typeof Reflect.get(value, "LateralPileResponseScenario") === "function" &&
    typeof Reflect.get(value, "SoilMaterial") === "function"
  );
}

function gitOutput(...arguments_: readonly string[]): string {
  return execFileSync("git", ["-C", sourceRoot, ...arguments_], { encoding: "utf8" }).trim();
}

function buildInput(
  module: RuntimeModule,
  seismic: Record<string, unknown> | null = null,
  analysisCase: AnalysisCase = "base",
) {
  const fixedZero = analysisCase === "fixed-zero";
  const units = { force: "kN", length: "m" };
  const material = new module.SoilMaterial({
    id: "soil-\u03B1",
    name: "Soil \u03B2",
    unitWeight: { bulk: 18, saturated: 20 },
    parameterSets: [
      {
        id: "soil-parameters",
        basis: "characteristic",
        drainage: "drained",
        strength: { model: "mohr-coulomb-effective", frictionAngle: 30, cohesion: 0 },
        provenance: { source: "test-characterization-\u03B3" },
      },
    ],
    angleUnits: "deg",
    units,
  });
  const profile = new module.GroundProfile({
    id: "py-profile",
    groundSurfaceElevation: 0,
    materials: [material],
    layers: [
      {
        id: "py-layer",
        topElevation: 0,
        bottomElevation: fixedZero ? -2 : -4,
        materialId: "soil-\u03B1",
      },
    ],
    groundwater: { model: "none" },
    units,
  });
  const groundModel = new module.GroundModel({
    id: "py-ground",
    materials: [material],
    profiles: [profile],
    units,
  });
  const designSituation = new module.GeotechnicalDesignSituation({
    id: "py-situation",
    groundModel,
    situationType: seismic ? "seismic" : "persistent",
    limitState: "SLS",
    drainageCondition: "drained",
    requiredParameterBasis: "characteristic",
    profileId: "py-profile",
    seismic,
    units,
  });
  const pile = new module.DeepFoundationModel({
    id: "py-pile",
    geometry: { model: "circular", diameter: 1 },
    placement: {
      headElevation: 0,
      soilContactTopElevation: 0,
      toeElevation: fixedZero ? -1 : -2,
    },
    construction: {
      installationMethod: "assigned-test-method",
      structuralMaterial: "assigned-test-material",
      displacementClass: "not-classified",
    },
    units,
  });
  const law = new module.PileTransferLaw({
    id: fixedZero ? "zero-law" : "py-law-\u03B4",
    points: [
      { displacement: 0, resistancePerLength: 0 },
      {
        displacement: fixedZero ? 1 : 0.1,
        resistancePerLength: fixedZero ? 0 : 20,
      },
    ],
    extrapolation: fixedZero ? "constant" : "linear",
    provenance: { source: "test-assigned-p-y-law" },
    units,
  });
  const scenario = new module.LateralPileResponseScenario({
    id: "py-response-\u03B5",
    action: {
      lateralShear: fixedZero ? 12 : 10,
      overturningMoment: fixedZero ? 0 : 2,
      referencePoint: "pile-head",
      basis: "assigned-test-action",
    },
    flexuralRigidity: {
      model: "constant",
      value: fixedZero ? 600 : 1000,
      provenance: { source: "test-assigned-EI" },
    },
    soilResponse: {
      model: "assigned-py-curves",
      curvesByLayer: {
        "py-layer": {
          stations: [{ depth: fixedZero ? 0.5 : 0, law }],
        },
      },
    },
    discretization: { maxElementLength: fixedZero ? 1 : 0.5 },
    solver: {
      loadSteps: fixedZero ? 1 : 2,
      maxIterations: 40,
      relativeResidualTolerance: 1e-10,
      displacementTolerance: 1e-12,
    },
    tipCondition: fixedZero ? { translation: "fixed", rotation: "fixed" } : null,
    units,
    metadata: { label: "response-\u03B6" },
  });
  return { groundModel, designSituation, pile, scenario, units };
}

void test("LateralPileBeamOnSpringsAnalysis matches the independent pinned JavaScript implementation", async () => {
  assert.equal(gitOutput("rev-parse", "HEAD"), sourceRevision);
  assert.equal(gitOutput("status", "--porcelain"), "");
  const sourceModuleValue: unknown = await import(
    pathToFileURL(path.join(sourceRoot, "src", "index.js")).href
  );
  const typescriptModuleValue: unknown = await import(
    pathToFileURL(path.join(repositoryRoot, "dist", "index.js")).href
  );
  if (!isRuntimeModule(sourceModuleValue) || !isRuntimeModule(typescriptModuleValue)) {
    throw new Error("LateralPileBeamOnSpringsAnalysis exports do not expose the expected API.");
  }
  const constantNames: readonly (
    | "LATERAL_PILE_PY_REFERENCE"
    | "LATERAL_PILE_PY_RESULT_SCHEMA_VERSION"
  )[] = ["LATERAL_PILE_PY_REFERENCE", "LATERAL_PILE_PY_RESULT_SCHEMA_VERSION"];
  for (const name of constantNames) {
    assert.deepEqual(typescriptModuleValue[name], sourceModuleValue[name]);
  }
  assert.notEqual(
    sourceModuleValue.LateralPileBeamOnSpringsAnalysis,
    typescriptModuleValue.LateralPileBeamOnSpringsAnalysis,
  );

  const analysisCases: readonly AnalysisCase[] = ["base", "fixed-zero"];
  for (const seismic of [null, { model: "pseudostatic", kh: 0.1, kv: 0 }]) {
    for (const analysisCase of analysisCases) {
      const sourceInput = buildInput(sourceModuleValue, seismic, analysisCase);
      const typescriptInput = buildInput(typescriptModuleValue, seismic, analysisCase);
      const sourceResult = new sourceModuleValue.LateralPileBeamOnSpringsAnalysis().analyze(
        sourceInput,
      );
      const typescriptResult = new typescriptModuleValue.LateralPileBeamOnSpringsAnalysis().analyze(
        typescriptInput,
      );
      assert.deepEqual(typescriptResult, sourceResult);
      assert.equal(JSON.stringify(typescriptResult), JSON.stringify(sourceResult));
    }
  }

  const sourceInput = buildInput(sourceModuleValue);
  const typescriptInput = buildInput(typescriptModuleValue);
  const sourceFailure = new sourceModuleValue.LateralPileBeamOnSpringsAnalysis().analyze({
    ...sourceInput,
    units: null,
  });
  const typescriptFailure = new typescriptModuleValue.LateralPileBeamOnSpringsAnalysis().analyze({
    ...typescriptInput,
    units: null,
  });
  assert.deepEqual(typescriptFailure, sourceFailure);
});
