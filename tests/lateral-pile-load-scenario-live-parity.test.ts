import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const sourceRoot = path.resolve(repositoryRoot, "..", "strutture-js");
const sourceRevision = "6f33baead8b88166c4b2cf94af41763412e3c751";

interface RuntimeLateralPileLoadScenario {
  action: Record<string, unknown>;
  behaviorAssertion: Record<string, unknown>;
  toJSON(): Record<string, unknown>;
}

interface RuntimeLateralPileModule {
  LATERAL_PILE_BEHAVIOR_CLASSIFICATIONS: readonly string[];
  LATERAL_PILE_CAPACITY_METHODS: readonly string[];
  LATERAL_PILE_HEAD_CONDITIONS: readonly string[];
  LATERAL_PILE_LOAD_SCENARIO_SCHEMA_VERSION: string;
  LATERAL_PILE_RESISTANCE_CONVERSION_MODELS: readonly string[];
  LATERAL_PILE_SOIL_BRANCHES: readonly string[];
  LateralPileLoadScenario: new (options: Record<string, unknown>) => RuntimeLateralPileLoadScenario;
}

function isRuntimeModule(value: unknown): value is RuntimeLateralPileModule {
  return (
    value !== null &&
    typeof value === "object" &&
    Array.isArray(Reflect.get(value, "LATERAL_PILE_BEHAVIOR_CLASSIFICATIONS")) &&
    Array.isArray(Reflect.get(value, "LATERAL_PILE_CAPACITY_METHODS")) &&
    Array.isArray(Reflect.get(value, "LATERAL_PILE_HEAD_CONDITIONS")) &&
    typeof Reflect.get(value, "LATERAL_PILE_LOAD_SCENARIO_SCHEMA_VERSION") === "string" &&
    Array.isArray(Reflect.get(value, "LATERAL_PILE_RESISTANCE_CONVERSION_MODELS")) &&
    Array.isArray(Reflect.get(value, "LATERAL_PILE_SOIL_BRANCHES")) &&
    typeof Reflect.get(value, "LateralPileLoadScenario") === "function"
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

void test("LateralPileLoadScenario matches the independent pinned JavaScript implementation", async () => {
  assert.equal(gitOutput("rev-parse", "HEAD"), sourceRevision);
  assert.equal(gitOutput("status", "--porcelain"), "");
  const sourceModuleValue: unknown = await import(
    pathToFileURL(path.join(sourceRoot, "src", "index.js")).href
  );
  const typescriptModuleValue: unknown = await import(
    pathToFileURL(path.join(repositoryRoot, "dist", "index.js")).href
  );
  if (!isRuntimeModule(sourceModuleValue) || !isRuntimeModule(typescriptModuleValue)) {
    throw new Error("Lateral-pile scenario exports do not expose the expected API.");
  }

  for (const name of [
    "LATERAL_PILE_BEHAVIOR_CLASSIFICATIONS",
    "LATERAL_PILE_CAPACITY_METHODS",
    "LATERAL_PILE_HEAD_CONDITIONS",
    "LATERAL_PILE_LOAD_SCENARIO_SCHEMA_VERSION",
    "LATERAL_PILE_RESISTANCE_CONVERSION_MODELS",
    "LATERAL_PILE_SOIL_BRANCHES",
  ] as const) {
    assert.deepEqual(typescriptModuleValue[name], sourceModuleValue[name]);
  }
  assert.notEqual(
    sourceModuleValue.LateralPileLoadScenario,
    typescriptModuleValue.LateralPileLoadScenario,
  );

  const units = { force: "N", length: "mm" };
  const options: Record<string, unknown> = {
    id: "lateral-pile-\u03B1",
    name: "Palo laterale \u03B2",
    soilBranch: "cohesionless-drained",
    action: {
      lateralShear: 100000,
      overturningMoment: 50000000,
      basis: "design",
      referencePoint: "groundline-at-pile-axis",
      direction: "local-positive-x",
      metadata: { label: "azione \u03B3" },
    },
    behaviorAssertion: {
      classification: "short-rigid",
      basis: "project-assessment",
      provenance: { source: " assessment \u03B4 " },
      metadata: { label: "rigido \u03B5" },
    },
    resistanceConversion: {
      model: "soil-reaction-factor",
      factor: 0.8,
      provenance: { source: "conversion \u03B6" },
      metadata: { label: "fattore \u03B7" },
    },
    units,
    metadata: { label: "scenario \u03B8", unicode: "\u03B9\u03BA\u03BB" },
  };
  const sourceScenario = new sourceModuleValue.LateralPileLoadScenario(options);
  const typescriptScenario = new typescriptModuleValue.LateralPileLoadScenario(options);
  assert.deepEqual(typescriptScenario.action, sourceScenario.action);
  assert.deepEqual(typescriptScenario.behaviorAssertion, sourceScenario.behaviorAssertion);
  assert.deepEqual(typescriptScenario.toJSON(), sourceScenario.toJSON());
  assert.equal(
    JSON.stringify(typescriptScenario.toJSON()),
    JSON.stringify(sourceScenario.toJSON()),
  );

  const defaultOptions: Record<string, unknown> = {
    id: "default-scenario",
    soilBranch: "cohesive-undrained",
    action: {
      lateralShear: 100,
      referencePoint: "groundline-at-pile-axis",
    },
    behaviorAssertion: {
      classification: "short-rigid",
      provenance: { source: "project" },
    },
    units: { force: "kN", length: "m" },
  };
  assert.deepEqual(
    new typescriptModuleValue.LateralPileLoadScenario(defaultOptions).toJSON(),
    new sourceModuleValue.LateralPileLoadScenario(defaultOptions).toJSON(),
  );

  const errorInputs: readonly Record<string, unknown>[] = [
    { id: "unsupported-method", soilBranch: "cohesive-undrained", method: "rankine", units },
    {
      id: "invalid-action-reference",
      soilBranch: "cohesive-undrained",
      action: { lateralShear: 1, referencePoint: "pile-head" },
      behaviorAssertion: { classification: "short-rigid", provenance: { source: "x" } },
      units,
    },
    {
      id: "missing-behavior",
      soilBranch: "cohesive-undrained",
      action: { lateralShear: 1, referencePoint: "groundline-at-pile-axis" },
      units,
    },
    {
      id: "invalid-factor",
      soilBranch: "cohesive-undrained",
      action: { lateralShear: 1, referencePoint: "groundline-at-pile-axis" },
      behaviorAssertion: { classification: "short-rigid", provenance: { source: "x" } },
      resistanceConversion: {
        factor: 1.1,
        provenance: { source: "conversion" },
      },
      units,
    },
  ];
  for (const errorInput of errorInputs) {
    const sourceError = errorSnapshot(
      () => new sourceModuleValue.LateralPileLoadScenario(errorInput),
    );
    const typescriptError = errorSnapshot(
      () => new typescriptModuleValue.LateralPileLoadScenario(errorInput),
    );
    assert.deepEqual(typescriptError, sourceError);
  }
});
