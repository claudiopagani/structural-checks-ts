import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const sourceRoot = path.resolve(repositoryRoot, "..", "strutture-js");
const sourceRevision = "6f33baead8b88166c4b2cf94af41763412e3c751";

interface RuntimeLaw {
  readonly pressureAtZero: number;
  evaluate(closureDisplacement: unknown): Record<string, unknown>;
  toJSON(): RuntimeLawJson;
}

interface RuntimeLawJson extends Record<string, unknown> {
  id: string;
}

interface RuntimeModule {
  WALL_SOIL_REACTION_EXTRAPOLATION_MODELS: readonly string[];
  WALL_SOIL_REACTION_LAW_SCHEMA_VERSION: string;
  WALL_SOIL_REACTION_MODELS: readonly string[];
  WallSoilReactionLaw: new (options: Record<string, unknown>) => RuntimeLaw;
}

function isRuntimeModule(value: unknown): value is RuntimeModule {
  return (
    value !== null &&
    typeof value === "object" &&
    Array.isArray(Reflect.get(value, "WALL_SOIL_REACTION_EXTRAPOLATION_MODELS")) &&
    typeof Reflect.get(value, "WALL_SOIL_REACTION_LAW_SCHEMA_VERSION") === "string" &&
    Array.isArray(Reflect.get(value, "WALL_SOIL_REACTION_MODELS")) &&
    typeof Reflect.get(value, "WallSoilReactionLaw") === "function"
  );
}

function gitOutput(...arguments_: readonly string[]): string {
  return execFileSync("git", ["-C", sourceRoot, ...arguments_], { encoding: "utf8" }).trim();
}

function lawOptions(): Record<string, unknown> {
  return {
    id: "parete-\u03B1",
    name: "Parete \u03B2",
    points: [
      { closureDisplacement: -10, effectivePressure: 5 },
      { closureDisplacement: 0, effectivePressure: 10 },
      { closureDisplacement: 10, effectivePressure: 30 },
    ],
    extrapolation: "linear",
    provenance: { source: "origine-\u03B3" },
    units: { force: "N", length: "mm" },
    metadata: { label: "metadati-\u03B4" },
  };
}

interface ErrorDetails {
  name: string;
  message: string;
}

function captureError(action: () => unknown): ErrorDetails {
  let captured: ErrorDetails | null = null;
  try {
    action();
  } catch (error) {
    if (error instanceof Error) {
      captured = { name: error.name, message: error.message };
    } else {
      throw error;
    }
  }
  if (captured === null) throw new Error("Expected the constructor to throw.");
  return captured;
}

function compareError(
  sourceModule: RuntimeModule,
  typescriptModule: RuntimeModule,
  options: Record<string, unknown>,
): void {
  const sourceError = captureError(() => new sourceModule.WallSoilReactionLaw(options));
  const typescriptError = captureError(() => new typescriptModule.WallSoilReactionLaw(options));
  assert.equal(typescriptError.name, sourceError.name);
  assert.equal(typescriptError.message, sourceError.message);
}

void test("WallSoilReactionLaw matches the independent pinned JavaScript implementation", async () => {
  assert.equal(gitOutput("rev-parse", "HEAD"), sourceRevision);
  assert.equal(gitOutput("status", "--porcelain"), "");
  const sourceModuleValue: unknown = await import(
    pathToFileURL(path.join(sourceRoot, "src", "index.js")).href
  );
  const typescriptModuleValue: unknown = await import(
    pathToFileURL(path.join(repositoryRoot, "dist", "index.js")).href
  );
  if (!isRuntimeModule(sourceModuleValue) || !isRuntimeModule(typescriptModuleValue)) {
    throw new Error("WallSoilReactionLaw exports do not expose the expected API.");
  }

  assert.deepEqual(
    typescriptModuleValue.WALL_SOIL_REACTION_EXTRAPOLATION_MODELS,
    sourceModuleValue.WALL_SOIL_REACTION_EXTRAPOLATION_MODELS,
  );
  assert.equal(
    typescriptModuleValue.WALL_SOIL_REACTION_LAW_SCHEMA_VERSION,
    sourceModuleValue.WALL_SOIL_REACTION_LAW_SCHEMA_VERSION,
  );
  assert.deepEqual(
    typescriptModuleValue.WALL_SOIL_REACTION_MODELS,
    sourceModuleValue.WALL_SOIL_REACTION_MODELS,
  );
  assert.notEqual(sourceModuleValue.WallSoilReactionLaw, typescriptModuleValue.WallSoilReactionLaw);

  const sourceLaw = new sourceModuleValue.WallSoilReactionLaw(lawOptions());
  const typescriptLaw = new typescriptModuleValue.WallSoilReactionLaw(lawOptions());
  assert.equal(sourceLaw instanceof sourceModuleValue.WallSoilReactionLaw, true);
  assert.equal(typescriptLaw instanceof typescriptModuleValue.WallSoilReactionLaw, true);
  assert.equal(sourceLaw.pressureAtZero, typescriptLaw.pressureAtZero);
  assert.deepEqual(typescriptLaw.toJSON(), sourceLaw.toJSON());
  assert.equal(JSON.stringify(typescriptLaw.toJSON()), JSON.stringify(sourceLaw.toJSON()));

  for (const displacement of [-20, -5, 0, 5, 20]) {
    assert.deepEqual(typescriptLaw.evaluate(displacement), sourceLaw.evaluate(displacement));
  }
  assert.equal(typescriptLaw.toJSON().id.codePointAt(6), sourceLaw.toJSON().id.codePointAt(6));

  compareError(sourceModuleValue, typescriptModuleValue, {
    ...lawOptions(),
    id: null,
  });
  compareError(sourceModuleValue, typescriptModuleValue, {
    ...lawOptions(),
    model: "unsupported",
  });
  compareError(sourceModuleValue, typescriptModuleValue, {
    ...lawOptions(),
    provenance: null,
  });
  compareError(sourceModuleValue, typescriptModuleValue, {
    ...lawOptions(),
    points: [
      { closureDisplacement: -1, effectivePressure: 20 },
      { closureDisplacement: 1, effectivePressure: 10 },
    ],
  });
});
