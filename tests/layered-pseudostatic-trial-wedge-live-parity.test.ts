import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const sourceRoot = path.resolve(repositoryRoot, "..", "strutture-js");
const sourceRevision = "6f33baead8b88166c4b2cf94af41763412e3c751";

interface RuntimeModule {
  evaluateLayeredPseudostaticTrialWedge(options?: Record<string, unknown>): unknown;
  optimizeLayeredPseudostaticTrialWedge(options?: Record<string, unknown>): unknown;
  LAYERED_PSEUDOSTATIC_TRIAL_WEDGE_REFERENCES: readonly string[];
}

interface FixtureLayer {
  id: string;
  topElevation: number;
  bottomElevation: number;
  materialId: string;
}

function isRuntimeModule(value: unknown): value is RuntimeModule {
  return (
    value !== null &&
    typeof value === "object" &&
    typeof Reflect.get(value, "evaluateLayeredPseudostaticTrialWedge") === "function" &&
    typeof Reflect.get(value, "optimizeLayeredPseudostaticTrialWedge") === "function" &&
    Array.isArray(Reflect.get(value, "LAYERED_PSEUDOSTATIC_TRIAL_WEDGE_REFERENCES"))
  );
}

function gitOutput(...arguments_: readonly string[]): string {
  return execFileSync("git", ["-C", sourceRoot, ...arguments_], { encoding: "utf8" }).trim();
}

function capture(action: () => unknown): { name: string; message: string } {
  try {
    action();
  } catch (error) {
    if (error instanceof Error) return { name: error.name, message: error.message };
    throw error;
  }
  throw new Error("Expected the trial-wedge case to throw.");
}

function createProfile(): Record<string, unknown> {
  const layers: FixtureLayer[] = [
    {
      id: "strato-\u03B1",
      topElevation: 12,
      bottomElevation: 6,
      materialId: "material-\u03B2",
    },
    {
      id: "strato-\u03B3",
      topElevation: 6,
      bottomElevation: 0,
      materialId: "material-\u03B4",
    },
  ];
  const firstLayer = layers[0];
  const secondLayer = layers[1];
  if (!firstLayer || !secondLayer) throw new Error("The trial-wedge fixture requires two layers.");
  const materials = new Map([
    ["material-\u03B2", { id: "material-\u03B2", unitWeight: { bulk: 18 } }],
    ["material-\u03B4", { id: "material-\u03B4", unitWeight: { bulk: 20 } }],
  ]);
  return {
    groundSurfaceElevation: 12,
    layers,
    getLayerAtElevation: (elevation: number): FixtureLayer =>
      elevation >= 6 ? firstLayer : secondLayer,
    getMaterial: (materialId: string): unknown => materials.get(materialId),
  };
}

function createStates(): Map<string, Record<string, unknown>> {
  return new Map([
    [
      "strato-\u03B1",
      {
        parameterSetId: "param-\u03B5",
        stressBasis: "effective-\u03B6",
        frictionAngle: (20 * Math.PI) / 180,
        cohesion: 5,
      },
    ],
    [
      "strato-\u03B3",
      {
        parameterSetId: "param-\u03B7",
        stressBasis: "effective-\u03B8",
        frictionAngle: (16 * Math.PI) / 180,
        cohesion: 3,
      },
    ],
  ]);
}

function createEvaluateOptions(): Record<string, unknown> {
  return {
    profile: createProfile(),
    layerStates: createStates(),
    topElevation: 12,
    bottomElevation: 0,
    backfillInclination: (5 * Math.PI) / 180,
    wallInclinationFromVertical: (4 * Math.PI) / 180,
    interfaceFrictionAngle: (3 * Math.PI) / 180,
    surcharge: 3,
    horizontalSeismicCoefficient: 0.1,
    verticalSeismicCoefficient: 0.02,
    slipPlaneAngle: (35 * Math.PI) / 180,
  };
}

function createOptimizeOptions(): Record<string, unknown> {
  return {
    ...createEvaluateOptions(),
    search: { sampleCount: 41, angleTolerance: 1e-8, maxRefinementIterations: 12 },
  };
}

void test("layered pseudostatic trial-wedge helpers match the independent pinned JavaScript implementation", async () => {
  assert.equal(gitOutput("rev-parse", "HEAD"), sourceRevision);
  assert.equal(gitOutput("status", "--porcelain"), "");
  const sourceModuleValue: unknown = await import(
    pathToFileURL(
      path.join(sourceRoot, "src", "domain", "geotechnics", "LayeredPseudostaticTrialWedge.js"),
    ).href
  );
  const typescriptModuleValue: unknown = await import(
    pathToFileURL(
      path.join(
        repositoryRoot,
        "dist",
        "domain",
        "geotechnics",
        "LayeredPseudostaticTrialWedge.js",
      ),
    ).href
  );
  if (!isRuntimeModule(sourceModuleValue) || !isRuntimeModule(typescriptModuleValue)) {
    throw new Error("Layered trial-wedge helpers do not expose the expected exports.");
  }
  assert.notEqual(
    Reflect.get(sourceModuleValue, "evaluateLayeredPseudostaticTrialWedge"),
    Reflect.get(typescriptModuleValue, "evaluateLayeredPseudostaticTrialWedge"),
  );
  assert.deepEqual(
    typescriptModuleValue.LAYERED_PSEUDOSTATIC_TRIAL_WEDGE_REFERENCES,
    sourceModuleValue.LAYERED_PSEUDOSTATIC_TRIAL_WEDGE_REFERENCES,
  );
  const sourceReference = sourceModuleValue.LAYERED_PSEUDOSTATIC_TRIAL_WEDGE_REFERENCES[0];
  const typescriptReference = typescriptModuleValue.LAYERED_PSEUDOSTATIC_TRIAL_WEDGE_REFERENCES[0];
  if (!sourceReference || !typescriptReference) {
    throw new Error("Expected the trial-wedge references to contain a first entry.");
  }
  assert.deepEqual([...typescriptReference], [...sourceReference]);

  const sourceCandidate =
    sourceModuleValue.evaluateLayeredPseudostaticTrialWedge(createEvaluateOptions());
  const typescriptCandidate =
    typescriptModuleValue.evaluateLayeredPseudostaticTrialWedge(createEvaluateOptions());
  assert.deepEqual(typescriptCandidate, sourceCandidate);
  assert.equal(JSON.stringify(typescriptCandidate), JSON.stringify(sourceCandidate));
  assert.deepEqual([...JSON.stringify(typescriptCandidate)], [...JSON.stringify(sourceCandidate)]);

  const sourceResult =
    sourceModuleValue.optimizeLayeredPseudostaticTrialWedge(createOptimizeOptions());
  const typescriptResult =
    typescriptModuleValue.optimizeLayeredPseudostaticTrialWedge(createOptimizeOptions());
  assert.deepEqual(typescriptResult, sourceResult);
  assert.equal(JSON.stringify(typescriptResult), JSON.stringify(sourceResult));
  assert.deepEqual([...JSON.stringify(typescriptResult)], [...JSON.stringify(sourceResult)]);

  assert.deepEqual(
    capture(() => sourceModuleValue.evaluateLayeredPseudostaticTrialWedge()),
    capture(() => typescriptModuleValue.evaluateLayeredPseudostaticTrialWedge()),
  );
  assert.deepEqual(
    capture(() => sourceModuleValue.optimizeLayeredPseudostaticTrialWedge()),
    capture(() => typescriptModuleValue.optimizeLayeredPseudostaticTrialWedge()),
  );

  const unsupportedOptions = { ...createEvaluateOptions(), slipPlaneAngle: 0 };
  assert.equal(
    typescriptModuleValue.evaluateLayeredPseudostaticTrialWedge(unsupportedOptions),
    sourceModuleValue.evaluateLayeredPseudostaticTrialWedge(unsupportedOptions),
  );

  const missingStateOptions = {
    ...createEvaluateOptions(),
    layerStates: new Map([
      [
        "strato-\u03B1",
        {
          parameterSetId: "param-\u03B5",
          stressBasis: "effective-\u03B6",
          frictionAngle: (20 * Math.PI) / 180,
          cohesion: 5,
        },
      ],
    ]),
  };
  assert.deepEqual(
    capture(() => sourceModuleValue.evaluateLayeredPseudostaticTrialWedge(missingStateOptions)),
    capture(() => typescriptModuleValue.evaluateLayeredPseudostaticTrialWedge(missingStateOptions)),
  );

  const invalidOptions = { ...createOptimizeOptions(), horizontalSeismicCoefficient: -1 };
  assert.deepEqual(
    capture(() => sourceModuleValue.optimizeLayeredPseudostaticTrialWedge(invalidOptions)),
    capture(() => typescriptModuleValue.optimizeLayeredPseudostaticTrialWedge(invalidOptions)),
  );
});
