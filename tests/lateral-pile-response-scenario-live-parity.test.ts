import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const sourceRoot = path.resolve(repositoryRoot, "..", "strutture-js");
const sourceRevision = "6f33baead8b88166c4b2cf94af41763412e3c751";

interface RuntimePileTransferLaw {
  id: string;
}

interface RuntimeLateralPileResponseScenario {
  soilResponse: {
    curvesByLayer: Record<string, { stations: Array<{ law: RuntimePileTransferLaw }> }>;
  };
  toJSON(): Record<string, unknown>;
}

interface RuntimeLateralPileResponseModule {
  LATERAL_PILE_ACTION_REFERENCE_POINTS: readonly string[];
  LATERAL_PILE_END_RESTRAINTS: readonly string[];
  LATERAL_PILE_RESPONSE_METHODS: readonly string[];
  LATERAL_PILE_RESPONSE_SCENARIO_SCHEMA_VERSION: string;
  LATERAL_PILE_SOIL_RESPONSE_MODELS: readonly string[];
  LateralPileResponseScenario: new (
    options: Record<string, unknown>,
  ) => RuntimeLateralPileResponseScenario;
  PileTransferLaw: new (options: Record<string, unknown>) => RuntimePileTransferLaw;
}

function isRuntimeModule(value: unknown): value is RuntimeLateralPileResponseModule {
  return (
    value !== null &&
    typeof value === "object" &&
    Array.isArray(Reflect.get(value, "LATERAL_PILE_ACTION_REFERENCE_POINTS")) &&
    Array.isArray(Reflect.get(value, "LATERAL_PILE_END_RESTRAINTS")) &&
    Array.isArray(Reflect.get(value, "LATERAL_PILE_RESPONSE_METHODS")) &&
    typeof Reflect.get(value, "LATERAL_PILE_RESPONSE_SCENARIO_SCHEMA_VERSION") === "string" &&
    Array.isArray(Reflect.get(value, "LATERAL_PILE_SOIL_RESPONSE_MODELS")) &&
    typeof Reflect.get(value, "LateralPileResponseScenario") === "function" &&
    typeof Reflect.get(value, "PileTransferLaw") === "function"
  );
}

function gitOutput(...arguments_: readonly string[]): string {
  return execFileSync("git", ["-C", sourceRoot, ...arguments_], { encoding: "utf8" }).trim();
}

function errorSnapshot(callback: () => unknown): { name: string; message: string } {
  try {
    callback();
  } catch (error) {
    assert.ok(error instanceof Error);
    return { name: error.name, message: error.message };
  }
  throw new Error("Expected the callback to throw.");
}

void test("LateralPileResponseScenario matches the independent pinned JavaScript implementation", async () => {
  assert.equal(gitOutput("rev-parse", "HEAD"), sourceRevision);
  assert.equal(gitOutput("status", "--porcelain"), "");
  const sourceModuleValue: unknown = await import(
    pathToFileURL(path.join(sourceRoot, "src", "index.js")).href
  );
  const typescriptModuleValue: unknown = await import(
    pathToFileURL(path.join(repositoryRoot, "dist", "index.js")).href
  );
  if (!isRuntimeModule(sourceModuleValue) || !isRuntimeModule(typescriptModuleValue)) {
    throw new Error("LateralPileResponseScenario exports do not expose the expected API.");
  }

  const constantNames: readonly (keyof RuntimeLateralPileResponseModule)[] = [
    "LATERAL_PILE_ACTION_REFERENCE_POINTS",
    "LATERAL_PILE_END_RESTRAINTS",
    "LATERAL_PILE_RESPONSE_METHODS",
    "LATERAL_PILE_RESPONSE_SCENARIO_SCHEMA_VERSION",
    "LATERAL_PILE_SOIL_RESPONSE_MODELS",
  ];
  for (const name of constantNames) {
    assert.deepEqual(typescriptModuleValue[name], sourceModuleValue[name]);
  }
  assert.notEqual(
    sourceModuleValue.LateralPileResponseScenario,
    typescriptModuleValue.LateralPileResponseScenario,
  );

  const lawOptions: Record<string, unknown> = {
    id: "py-\u03B1",
    name: "Legge \u03B2",
    points: [
      { displacement: 0, resistancePerLength: 0 },
      { displacement: 10, resistancePerLength: 2 },
      { displacement: 30, resistancePerLength: 5 },
    ],
    extrapolation: "linear",
    provenance: { source: "catalogue-\u03B3" },
    units: { force: "N", length: "mm" },
    metadata: { label: "curva-\u03B4" },
  };
  const sourceLaw = new sourceModuleValue.PileTransferLaw(lawOptions);
  const typescriptLaw = new typescriptModuleValue.PileTransferLaw(lawOptions);
  const sourceOptions: Record<string, unknown> = {
    id: "response-\u03B5",
    name: "Scenario \u03B6",
    method: "beam-on-py-springs",
    action: {
      lateralShear: 12,
      overturningMoment: -3,
      referencePoint: "groundline-at-pile-axis",
      basis: "assigned-\u03B7",
      direction: "local-positive-y",
      metadata: { label: "azione-\u03B8" },
    },
    flexuralRigidity: {
      model: "constant",
      value: 1000000,
      provenance: { source: "catalogue-\u03B9" },
      metadata: { label: "EI-\u03BA" },
    },
    headCondition: { translation: "free", rotation: "fixed" },
    tipCondition: { translation: "fixed", rotation: "free" },
    soilResponse: {
      model: "assigned-py-curves",
      curvesByLayer: {
        layer: {
          reactionMultiplier: 0.8,
          provenance: { source: "layer-\u03BB" },
          stations: [
            { depth: 30, law: sourceLaw, metadata: { label: "deep-\u03BC" } },
            { depth: 0, law: lawOptions, metadata: { label: "surface-\u03BD" } },
          ],
          metadata: { label: "layer-\u03BE" },
        },
      },
      metadata: { label: "soil-\u03BF" },
    },
    discretization: { maxElementLength: 500 },
    solver: {
      loadSteps: 4,
      maxIterations: 20,
      maxLineSearchReductions: 6,
      relativeResidualTolerance: 1e-7,
      displacementTolerance: 0.001,
      minimumLoadIncrement: 0.25,
    },
    units: { force: "N", length: "mm" },
    metadata: { label: "scenario-\u03C0", unicode: "\u03C1\u03C3\u03C4" },
  };
  const typescriptOptions: Record<string, unknown> = {
    ...sourceOptions,
    soilResponse: {
      model: "assigned-py-curves",
      curvesByLayer: {
        layer: {
          reactionMultiplier: 0.8,
          provenance: { source: "layer-\u03BB" },
          stations: [
            { depth: 30, law: typescriptLaw, metadata: { label: "deep-\u03BC" } },
            { depth: 0, law: lawOptions, metadata: { label: "surface-\u03BD" } },
          ],
          metadata: { label: "layer-\u03BE" },
        },
      },
      metadata: { label: "soil-\u03BF" },
    },
  };
  const sourceScenario = new sourceModuleValue.LateralPileResponseScenario(sourceOptions);
  const typescriptScenario = new typescriptModuleValue.LateralPileResponseScenario(
    typescriptOptions,
  );
  const sourceLayer = sourceScenario.soilResponse.curvesByLayer.layer;
  const typescriptLayer = typescriptScenario.soilResponse.curvesByLayer.layer;
  if (!sourceLayer || !typescriptLayer) throw new Error("Expected the layer to be normalized.");
  const sourceStation = sourceLayer.stations[1];
  const typescriptStation = typescriptLayer.stations[1];
  if (!sourceStation || !typescriptStation) {
    throw new Error("Expected the pile response stations to be normalized.");
  }
  assert.equal(sourceStation.law, sourceLaw);
  assert.equal(typescriptStation.law, typescriptLaw);
  assert.deepEqual(typescriptScenario.toJSON(), sourceScenario.toJSON());
  assert.equal(
    JSON.stringify(typescriptScenario.toJSON()),
    JSON.stringify(sourceScenario.toJSON()),
  );
  const sourceJson = sourceScenario.toJSON();
  assert.deepEqual(
    new typescriptModuleValue.LateralPileResponseScenario(sourceJson).toJSON(),
    new sourceModuleValue.LateralPileResponseScenario(sourceJson).toJSON(),
  );

  const errorInputs: readonly Record<string, unknown>[] = [
    { ...sourceOptions, id: undefined },
    { ...sourceOptions, units: null },
    {
      ...sourceOptions,
      action: { lateralShear: 0, overturningMoment: 0 },
    },
    { ...sourceOptions, method: "unsupported" },
    {
      ...sourceOptions,
      flexuralRigidity: { value: 1000, provenance: null },
    },
    {
      ...sourceOptions,
      soilResponse: { curvesByLayer: {} },
    },
    {
      ...sourceOptions,
      soilResponse: {
        curvesByLayer: {
          layer: { stations: [{ depth: -1, law: lawOptions }] },
        },
      },
    },
    {
      ...sourceOptions,
      soilResponse: {
        curvesByLayer: {
          layer: {
            stations: [
              { depth: 0, law: lawOptions },
              { depth: 0, law: lawOptions },
            ],
          },
        },
      },
    },
    {
      ...sourceOptions,
      soilResponse: {
        curvesByLayer: {
          layer: {
            reactionMultiplier: 0.8,
            stations: [{ depth: 0, law: lawOptions }],
          },
        },
      },
    },
    {
      ...sourceOptions,
      solver: { minimumLoadIncrement: 1 },
    },
  ];
  for (const input of errorInputs) {
    const sourceError = errorSnapshot(
      () => new sourceModuleValue.LateralPileResponseScenario(input),
    );
    const typescriptError = errorSnapshot(
      () => new typescriptModuleValue.LateralPileResponseScenario(input),
    );
    assert.deepEqual(typescriptError, sourceError);
  }
});
