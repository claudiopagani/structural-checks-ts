import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const sourceRoot = path.resolve(repositoryRoot, "..", "strutture-js");
const sourceRevision = "6f33baead8b88166c4b2cf94af41763412e3c751";

interface RuntimeScenario {
  toJSON(): Record<string, unknown>;
}

interface RuntimeModule {
  EMBEDDED_RETAINING_WALL_LOADING_CONDITIONS: readonly string[];
  EMBEDDED_RETAINING_WALL_SCENARIO_SCHEMA_VERSION: string;
  EMBEDDED_RETAINING_WALL_SUPPORT_BEHAVIORS: readonly string[];
  EMBEDDED_RETAINING_WALL_SUPPORT_TYPES: readonly string[];
  EmbeddedRetainingWallScenario: new (options?: Record<string, unknown>) => RuntimeScenario;
}

function isRuntimeModule(value: unknown): value is RuntimeModule {
  return (
    value !== null &&
    typeof value === "object" &&
    typeof Reflect.get(value, "EmbeddedRetainingWallScenario") === "function" &&
    Array.isArray(Reflect.get(value, "EMBEDDED_RETAINING_WALL_LOADING_CONDITIONS")) &&
    Array.isArray(Reflect.get(value, "EMBEDDED_RETAINING_WALL_SUPPORT_TYPES")) &&
    Array.isArray(Reflect.get(value, "EMBEDDED_RETAINING_WALL_SUPPORT_BEHAVIORS"))
  );
}

function gitOutput(...arguments_: readonly string[]): string {
  return execFileSync("git", ["-C", sourceRoot, ...arguments_], { encoding: "utf8" }).trim();
}

function scenarioInput(): Record<string, unknown> {
  const law = {
    id: "wall-law-γ",
    points: [
      { closureDisplacement: -0.1, effectivePressure: 0 },
      { closureDisplacement: 0, effectivePressure: 10 },
      { closureDisplacement: 0.1, effectivePressure: 20 },
    ],
    extrapolation: "linear",
    provenance: { source: "independent embedded-wall scenario oracle" },
    units: { force: "kN", length: "m" },
  };
  const side = {
    profileId: "profile-α",
    xCoordinate: -0.5,
    defaultPorePressureFieldId: "pore-β",
    curvesByLayer: {
      "layer-γ": {
        reactionMultiplier: 1.25,
        provenance: { source: "assigned multiplier" },
        stations: [{ depth: 1.5, law, metadata: { label: "stazione" } }],
        metadata: { sideNote: "lato" },
      },
    },
  };
  return {
    id: "scenario-α",
    name: "Scenario ✨",
    loadingCondition: "pseudostatic",
    loadingProvenance: { source: "pseudostatic assignment" },
    soilResponse: {
      model: "assigned-effective-pressure-displacement-curves",
      sides: { retained: side, excavation: { ...side, xCoordinate: 0.5 } },
      metadata: { description: "pressione effettiva" },
    },
    supports: [
      {
        id: "support-δ",
        name: "Anchor support",
        type: "ground-anchor",
        behavior: "unilateral",
        actionDirection: "toward-retained-side",
        elevation: -1,
        stiffness: 1000,
        prestress: 2,
        capacity: {
          maximumForce: 100,
          basis: "assigned",
          provenance: { source: "support capacity" },
        },
        provenance: { source: "support assignment" },
        metadata: { label: "tirante" },
      },
    ],
    stages: [
      {
        id: "stage-ε",
        name: "Stage one",
        retainedGroundElevation: 0,
        excavationGroundElevation: -1,
        activeSupportIds: ["support-δ"],
        porePressureFieldIdBySide: { retained: "pore-β", excavation: null },
        pressureLoads: [
          {
            id: "seismic-load",
            side: "retained",
            component: "totalNormal",
            category: "seismic",
            scale: 1,
            segments: [
              {
                topElevation: 0,
                bottomElevation: -1,
                topPressure: 12,
                bottomPressure: 18,
              },
            ],
            provenance: { source: "seismic pressure" },
            metadata: { label: "carico" },
          },
        ],
        nodalActions: [
          {
            id: "node-ζ",
            elevation: -0.5,
            force: 4,
            moment: 2,
            provenance: { source: "nodal assignment" },
            metadata: { label: "azione" },
          },
        ],
        metadata: { label: "fase" },
      },
    ],
    discretization: { maxElementLength: 0.25 },
    solver: {
      incrementsPerStage: 4,
      maxIterations: 30,
      maxLineSearchReductions: 8,
      relativeResidualTolerance: 1e-9,
      displacementTolerance: 1e-12,
      minimumStageIncrement: 1 / 512,
    },
    units: { force: "kN", length: "m" },
    metadata: { description: "scenario metadata" },
  };
}

function captureError(action: () => unknown): { name: string; message: string } {
  try {
    action();
  } catch (error) {
    if (error instanceof Error) return { name: error.name, message: error.message };
    throw error;
  }
  throw new Error("Expected EmbeddedRetainingWallScenario to throw.");
}

void test("EmbeddedRetainingWallScenario matches the independent pinned JavaScript implementation", async () => {
  assert.equal(gitOutput("rev-parse", "HEAD"), sourceRevision);
  assert.equal(gitOutput("status", "--porcelain"), "");
  const sourceModuleValue: unknown = await import(
    pathToFileURL(path.join(sourceRoot, "src", "index.js")).href
  );
  const typescriptModuleValue: unknown = await import(
    pathToFileURL(path.join(repositoryRoot, "dist", "index.js")).href
  );
  if (!isRuntimeModule(sourceModuleValue) || !isRuntimeModule(typescriptModuleValue)) {
    throw new Error("Embedded retaining-wall scenario exports do not expose the expected API.");
  }
  assert.deepEqual(
    typescriptModuleValue.EMBEDDED_RETAINING_WALL_LOADING_CONDITIONS,
    sourceModuleValue.EMBEDDED_RETAINING_WALL_LOADING_CONDITIONS,
  );
  assert.deepEqual(
    typescriptModuleValue.EMBEDDED_RETAINING_WALL_SUPPORT_TYPES,
    sourceModuleValue.EMBEDDED_RETAINING_WALL_SUPPORT_TYPES,
  );
  assert.deepEqual(
    typescriptModuleValue.EMBEDDED_RETAINING_WALL_SUPPORT_BEHAVIORS,
    sourceModuleValue.EMBEDDED_RETAINING_WALL_SUPPORT_BEHAVIORS,
  );
  assert.equal(
    typescriptModuleValue.EMBEDDED_RETAINING_WALL_SCENARIO_SCHEMA_VERSION,
    sourceModuleValue.EMBEDDED_RETAINING_WALL_SCENARIO_SCHEMA_VERSION,
  );
  assert.notEqual(
    typescriptModuleValue.EmbeddedRetainingWallScenario,
    sourceModuleValue.EmbeddedRetainingWallScenario,
  );

  const sourceScenario = new sourceModuleValue.EmbeddedRetainingWallScenario(scenarioInput());
  const typescriptScenario = new typescriptModuleValue.EmbeddedRetainingWallScenario(
    scenarioInput(),
  );
  const sourceJson = sourceScenario.toJSON();
  const typescriptJson = typescriptScenario.toJSON();
  assert.deepEqual(typescriptJson, sourceJson);
  assert.equal(JSON.stringify(typescriptJson), JSON.stringify(sourceJson));
  assert.deepEqual([...JSON.stringify(typescriptJson)], [...JSON.stringify(sourceJson)]);
  assert.deepEqual(
    [...JSON.stringify(typescriptJson).normalize()],
    [...JSON.stringify(sourceJson).normalize()],
  );

  const unsupportedCases: readonly [() => unknown, () => unknown][] = [
    [
      () =>
        new sourceModuleValue.EmbeddedRetainingWallScenario({
          units: { force: "kN", length: "m" },
        }),
      () =>
        new typescriptModuleValue.EmbeddedRetainingWallScenario({
          units: { force: "kN", length: "m" },
        }),
    ],
    [
      () =>
        new sourceModuleValue.EmbeddedRetainingWallScenario({
          id: "x",
          units: { force: "kN", length: "m" },
        }),
      () =>
        new typescriptModuleValue.EmbeddedRetainingWallScenario({
          id: "x",
          units: { force: "kN", length: "m" },
        }),
    ],
    [
      () =>
        new sourceModuleValue.EmbeddedRetainingWallScenario({
          ...scenarioInput(),
          loadingCondition: "unsupported",
        }),
      () =>
        new typescriptModuleValue.EmbeddedRetainingWallScenario({
          ...scenarioInput(),
          loadingCondition: "unsupported",
        }),
    ],
    [
      () =>
        new sourceModuleValue.EmbeddedRetainingWallScenario({
          ...scenarioInput(),
          loadingCondition: "pseudostatic",
          loadingProvenance: null,
        }),
      () =>
        new typescriptModuleValue.EmbeddedRetainingWallScenario({
          ...scenarioInput(),
          loadingCondition: "pseudostatic",
          loadingProvenance: null,
        }),
    ],
  ];
  for (const [sourceAction, typescriptAction] of unsupportedCases) {
    assert.deepEqual(captureError(sourceAction), captureError(typescriptAction));
  }
});
