import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const sourceRoot = path.resolve(repositoryRoot, "..", "strutture-js");
const sourceRevision = "6f33baead8b88166c4b2cf94af41763412e3c751";

interface RuntimeShallowFoundationModel {
  geometry: Record<string, unknown>;
  toJSON(): Record<string, unknown>;
}

interface RuntimeShallowFoundationActionState {
  actions: Record<string, unknown>;
  toJSON(): Record<string, unknown>;
}

interface RuntimeShallowFoundationModule {
  SHALLOW_FOUNDATION_ACTION_BASES: readonly string[];
  SHALLOW_FOUNDATION_ACTION_STATE_SCHEMA_VERSION: string;
  SHALLOW_FOUNDATION_MODEL_SCHEMA_VERSION: string;
  SHALLOW_FOUNDATION_SHAPES: readonly string[];
  ShallowFoundationActionState: new (
    options: Record<string, unknown>,
  ) => RuntimeShallowFoundationActionState;
  ShallowFoundationModel: new (options: Record<string, unknown>) => RuntimeShallowFoundationModel;
}

function isRuntimeModule(value: unknown): value is RuntimeShallowFoundationModule {
  return (
    value !== null &&
    typeof value === "object" &&
    Array.isArray(Reflect.get(value, "SHALLOW_FOUNDATION_ACTION_BASES")) &&
    typeof Reflect.get(value, "SHALLOW_FOUNDATION_ACTION_STATE_SCHEMA_VERSION") === "string" &&
    typeof Reflect.get(value, "SHALLOW_FOUNDATION_MODEL_SCHEMA_VERSION") === "string" &&
    Array.isArray(Reflect.get(value, "SHALLOW_FOUNDATION_SHAPES")) &&
    typeof Reflect.get(value, "ShallowFoundationActionState") === "function" &&
    typeof Reflect.get(value, "ShallowFoundationModel") === "function"
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

void test("shallow-foundation model and action DTOs match the independent pinned JavaScript implementation", async () => {
  assert.equal(gitOutput("rev-parse", "HEAD"), sourceRevision);
  assert.equal(gitOutput("status", "--porcelain"), "");
  const sourceModuleValue: unknown = await import(
    pathToFileURL(path.join(sourceRoot, "src", "index.js")).href
  );
  const typescriptModuleValue: unknown = await import(
    pathToFileURL(path.join(repositoryRoot, "dist", "index.js")).href
  );
  if (!isRuntimeModule(sourceModuleValue) || !isRuntimeModule(typescriptModuleValue)) {
    throw new Error("Shallow-foundation exports do not expose the expected API.");
  }

  for (const name of [
    "SHALLOW_FOUNDATION_ACTION_BASES",
    "SHALLOW_FOUNDATION_ACTION_STATE_SCHEMA_VERSION",
    "SHALLOW_FOUNDATION_MODEL_SCHEMA_VERSION",
    "SHALLOW_FOUNDATION_SHAPES",
  ] as const) {
    assert.deepEqual(typescriptModuleValue[name], sourceModuleValue[name]);
  }
  assert.notEqual(
    sourceModuleValue.ShallowFoundationModel,
    typescriptModuleValue.ShallowFoundationModel,
  );
  assert.notEqual(
    sourceModuleValue.ShallowFoundationActionState,
    typescriptModuleValue.ShallowFoundationActionState,
  );

  const units = { force: "N", length: "mm" };
  const modelOptions: Record<string, unknown> = {
    id: "foundation-\u03B1",
    name: "Fondazione \u03B2",
    shape: "rectangular",
    geometry: { width: 2000, length: 3000 },
    placement: { x: 1000, y: -500, baseElevation: -1500 },
    units,
    metadata: { label: "plinto \u03B3", unicode: "\u03B4\u03B5\u03B6" },
  };
  const actionOptions: Record<string, unknown> = {
    id: "actions-\u03B7",
    name: "Azioni \u03B8",
    basis: "total",
    resultantScope: "total-at-foundation-base",
    actions: { verticalForce: 1e6, horizontalX: 2e5, momentY: 2e8 },
    units,
    metadata: { label: "carichi \u03B9" },
  };
  const sourceModel = new sourceModuleValue.ShallowFoundationModel(modelOptions);
  const typescriptModel = new typescriptModuleValue.ShallowFoundationModel(modelOptions);
  const sourceActions = new sourceModuleValue.ShallowFoundationActionState(actionOptions);
  const typescriptActions = new typescriptModuleValue.ShallowFoundationActionState(actionOptions);
  assert.deepEqual(typescriptModel.geometry, sourceModel.geometry);
  assert.deepEqual(typescriptActions.actions, sourceActions.actions);
  assert.deepEqual(typescriptModel.toJSON(), sourceModel.toJSON());
  assert.deepEqual(typescriptActions.toJSON(), sourceActions.toJSON());
  assert.equal(JSON.stringify(typescriptModel.toJSON()), JSON.stringify(sourceModel.toJSON()));
  assert.equal(JSON.stringify(typescriptActions.toJSON()), JSON.stringify(sourceActions.toJSON()));

  const shapeOptions: readonly Record<string, unknown>[] = [
    {
      id: "strip",
      shape: "strip",
      geometry: { width: 2 },
      placement: { baseElevation: -1 },
      units: { force: "kN", length: "m" },
    },
    {
      id: "circular",
      shape: "circular",
      geometry: { diameter: 2 },
      placement: { baseElevation: -1 },
      units: { force: "kN", length: "m" },
    },
  ];
  for (const options of shapeOptions) {
    assert.deepEqual(
      new typescriptModuleValue.ShallowFoundationModel(options).toJSON(),
      new sourceModuleValue.ShallowFoundationModel(options).toJSON(),
    );
  }

  const perUnitOptions: Record<string, unknown> = {
    id: "line-actions",
    basis: "per-unit-length",
    resultantScope: "total-at-foundation-base",
    actions: {
      verticalForcePerUnitLength: 500,
      horizontalForcePerUnitLength: -20,
      momentPerUnitLength: 4,
    },
    units: { force: "kN", length: "m" },
  };
  assert.deepEqual(
    new typescriptModuleValue.ShallowFoundationActionState(perUnitOptions).toJSON(),
    new sourceModuleValue.ShallowFoundationActionState(perUnitOptions).toJSON(),
  );

  const errorInputs: readonly Record<string, unknown>[] = [
    { id: "unsupported-shape", shape: "triangular", units },
    {
      id: "wide-foundation",
      shape: "rectangular",
      geometry: { width: 4, length: 3 },
      placement: { baseElevation: -1 },
      units: { force: "kN", length: "m" },
    },
    {
      id: "invalid-actions",
      basis: "total",
      resultantScope: "total-at-foundation-base",
      actions: { horizontalX: 1 },
      units: { force: "kN", length: "m" },
    },
    {
      id: "invalid-scope",
      basis: "total",
      resultantScope: "not-total",
      actions: { verticalForce: 1 },
      units: { force: "kN", length: "m" },
    },
  ];
  for (const errorInput of errorInputs) {
    const sourceError = errorSnapshot(() => {
      if (errorInput.id === "unsupported-shape" || errorInput.id === "wide-foundation") {
        new sourceModuleValue.ShallowFoundationModel(errorInput);
      } else {
        new sourceModuleValue.ShallowFoundationActionState(errorInput);
      }
    });
    const typescriptError = errorSnapshot(() => {
      if (errorInput.id === "unsupported-shape" || errorInput.id === "wide-foundation") {
        new typescriptModuleValue.ShallowFoundationModel(errorInput);
      } else {
        new typescriptModuleValue.ShallowFoundationActionState(errorInput);
      }
    });
    assert.deepEqual(typescriptError, sourceError);
  }
});
