import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const sourceRoot = path.resolve(repositoryRoot, "..", "strutture-js");
const sourceRevision = "6f33baead8b88166c4b2cf94af41763412e3c751";

interface RuntimePileTransferLaw {
  points: Array<Record<string, unknown>>;
  evaluate(displacement: number): Record<string, unknown>;
  toJSON(): Record<string, unknown>;
}

interface RuntimePileTransferModule {
  PILE_TRANSFER_CURVE_MODELS: readonly string[];
  PILE_TRANSFER_EXTRAPOLATION_MODELS: readonly string[];
  PILE_TRANSFER_LAW_KINDS: readonly string[];
  PILE_TRANSFER_LAW_SCHEMA_VERSION: string;
  PileTransferLaw: new (options: Record<string, unknown>) => RuntimePileTransferLaw;
}

function isRuntimeModule(value: unknown): value is RuntimePileTransferModule {
  return (
    value !== null &&
    typeof value === "object" &&
    Array.isArray(Reflect.get(value, "PILE_TRANSFER_CURVE_MODELS")) &&
    Array.isArray(Reflect.get(value, "PILE_TRANSFER_EXTRAPOLATION_MODELS")) &&
    Array.isArray(Reflect.get(value, "PILE_TRANSFER_LAW_KINDS")) &&
    typeof Reflect.get(value, "PILE_TRANSFER_LAW_SCHEMA_VERSION") === "string" &&
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

void test("PileTransferLaw matches the independent pinned JavaScript implementation", async () => {
  assert.equal(gitOutput("rev-parse", "HEAD"), sourceRevision);
  assert.equal(gitOutput("status", "--porcelain"), "");
  const sourceModuleValue: unknown = await import(
    pathToFileURL(path.join(sourceRoot, "src", "index.js")).href
  );
  const typescriptModuleValue: unknown = await import(
    pathToFileURL(path.join(repositoryRoot, "dist", "index.js")).href
  );
  if (!isRuntimeModule(sourceModuleValue) || !isRuntimeModule(typescriptModuleValue)) {
    throw new Error("PileTransferLaw exports do not expose the expected API.");
  }

  for (const name of [
    "PILE_TRANSFER_CURVE_MODELS",
    "PILE_TRANSFER_EXTRAPOLATION_MODELS",
    "PILE_TRANSFER_LAW_KINDS",
    "PILE_TRANSFER_LAW_SCHEMA_VERSION",
  ] as const) {
    assert.deepEqual(typescriptModuleValue[name], sourceModuleValue[name]);
  }
  assert.notEqual(sourceModuleValue.PileTransferLaw, typescriptModuleValue.PileTransferLaw);

  const options: Record<string, unknown> = {
    id: "p-y-\u03B1",
    name: "Legge \u03B2",
    points: [
      { displacement: 0, resistancePerLength: 0 },
      { displacement: 10, resistancePerLength: 2 },
      { displacement: 30, resistancePerLength: 5 },
    ],
    extrapolation: "linear",
    provenance: { source: " catalogue \u03B3 " },
    units: { force: "N", length: "mm" },
    metadata: { label: "curva \u03B4", unicode: "\u03B5\u03B6\u03B7" },
  };
  const sourceLaw = new sourceModuleValue.PileTransferLaw(options);
  const typescriptLaw = new typescriptModuleValue.PileTransferLaw(options);
  for (const displacement of [0, 0.005, -0.005, 0.02, 0.05]) {
    assert.deepEqual(typescriptLaw.evaluate(displacement), sourceLaw.evaluate(displacement));
  }
  assert.deepEqual(typescriptLaw.points, sourceLaw.points);
  assert.deepEqual(typescriptLaw.toJSON(), sourceLaw.toJSON());
  assert.equal(JSON.stringify(typescriptLaw.toJSON()), JSON.stringify(sourceLaw.toJSON()));

  const constantOptions: Record<string, unknown> = {
    ...options,
    id: "constant-law",
    extrapolation: "constant",
  };
  assert.deepEqual(
    new typescriptModuleValue.PileTransferLaw(constantOptions).evaluate(0.05),
    new sourceModuleValue.PileTransferLaw(constantOptions).evaluate(0.05),
  );

  const errorInputs: readonly Record<string, unknown>[] = [
    {
      id: "too-short",
      points: [{ displacement: 0, resistancePerLength: 0 }],
      units: options.units,
      provenance: options.provenance,
    },
    {
      ...options,
      id: "not-origin",
      points: [
        { displacement: 0.1, resistancePerLength: 0 },
        { displacement: 0.2, resistancePerLength: 1 },
      ],
    },
    {
      ...options,
      id: "decreasing-resistance",
      points: [
        { displacement: 0, resistancePerLength: 0 },
        { displacement: 0.1, resistancePerLength: 2 },
        { displacement: 0.2, resistancePerLength: 1 },
      ],
    },
    { ...options, id: "missing-provenance", provenance: null },
    { ...options, id: "unsupported-loading", loading: "cyclic" },
  ];
  for (const errorInput of errorInputs) {
    const sourceError = errorSnapshot(() => new sourceModuleValue.PileTransferLaw(errorInput));
    const typescriptError = errorSnapshot(
      () => new typescriptModuleValue.PileTransferLaw(errorInput),
    );
    assert.deepEqual(typescriptError, sourceError);
  }
  const sourceEvaluationError = errorSnapshot(() => sourceLaw.evaluate(Number.NaN));
  const typescriptEvaluationError = errorSnapshot(() => typescriptLaw.evaluate(Number.NaN));
  assert.deepEqual(typescriptEvaluationError, sourceEvaluationError);
});
