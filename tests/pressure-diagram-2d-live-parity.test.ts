import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const sourceRoot = path.resolve(repositoryRoot, "..", "strutture-js");
const sourceRevision = "6f33baead8b88166c4b2cf94af41763412e3c751";

interface RuntimePressureDiagram {
  resultants: Record<string, Record<string, unknown>>;
  toJSON(): Record<string, unknown>;
}

interface RuntimePressureDiagramModule {
  PressureDiagram2D: new (options: Record<string, unknown>) => RuntimePressureDiagram;
  integratePressureSegments(
    segments: unknown,
    options?: Record<string, unknown>,
  ): Record<string, Record<string, unknown>>;
}

function isRuntimeModule(value: unknown): value is RuntimePressureDiagramModule {
  return (
    value !== null &&
    typeof value === "object" &&
    typeof Reflect.get(value, "PressureDiagram2D") === "function" &&
    typeof Reflect.get(value, "integratePressureSegments") === "function"
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

void test("PressureDiagram2D matches the independent pinned JavaScript implementation", async () => {
  assert.equal(gitOutput("rev-parse", "HEAD"), sourceRevision);
  assert.equal(gitOutput("status", "--porcelain"), "");
  const sourceModuleValue: unknown = await import(
    pathToFileURL(path.join(sourceRoot, "src", "index.js")).href
  );
  const typescriptModuleValue: unknown = await import(
    pathToFileURL(path.join(repositoryRoot, "dist", "index.js")).href
  );
  if (!isRuntimeModule(sourceModuleValue) || !isRuntimeModule(typescriptModuleValue)) {
    throw new Error("PressureDiagram2D exports do not expose the expected API.");
  }

  assert.notEqual(sourceModuleValue.PressureDiagram2D, typescriptModuleValue.PressureDiagram2D);
  assert.notEqual(
    Reflect.get(sourceModuleValue, "integratePressureSegments"),
    Reflect.get(typescriptModuleValue, "integratePressureSegments"),
  );
  const segments: unknown = [
    {
      id: "upper-α",
      topElevation: 10,
      bottomElevation: 5,
      top: {
        totalNormal: 0,
        totalTangent: 2,
        waterNormal: 0,
        effectiveSoilNormal: 0,
        label: "cima β",
      },
      bottom: {
        totalNormal: 30,
        totalTangent: 4,
        waterNormal: 0,
        effectiveSoilNormal: 30,
        label: "interfaccia γ",
      },
    },
    {
      id: "lower-δ",
      topElevation: 5,
      bottomElevation: 0,
      top: {
        totalNormal: 30,
        totalTangent: 4,
        waterNormal: 0,
        effectiveSoilNormal: 30,
        label: "interfaccia γ",
      },
      bottom: {
        totalNormal: 60,
        totalTangent: 6,
        waterNormal: Number.NaN,
        effectiveSoilNormal: 60,
        label: "fondo ε",
      },
    },
  ];
  const options: Record<string, unknown> = {
    profileId: "profile-ζ",
    state: "active",
    method: { id: "rankine", label: "Rankine η", metadata: { code: "NTC-ι" } },
    topElevation: 10,
    bottomElevation: 0,
    segments,
    metadata: { label: "diagramma θ", unicode: "αβγ" },
  };
  const sourceDiagram = new sourceModuleValue.PressureDiagram2D(options);
  const typescriptDiagram = new typescriptModuleValue.PressureDiagram2D(options);
  assert.deepEqual(typescriptDiagram.resultants, sourceDiagram.resultants);
  assert.deepEqual(typescriptDiagram.toJSON(), sourceDiagram.toJSON());
  assert.equal(JSON.stringify(typescriptDiagram.toJSON()), JSON.stringify(sourceDiagram.toJSON()));

  const sourceIntegrated = sourceModuleValue.integratePressureSegments(segments, {
    referenceElevation: 2,
  });
  const typescriptIntegrated = typescriptModuleValue.integratePressureSegments(segments, {
    referenceElevation: 2,
  });
  assert.deepEqual(typescriptIntegrated, sourceIntegrated);
  assert.equal(JSON.stringify(typescriptIntegrated), JSON.stringify(sourceIntegrated));

  const errorInputs: readonly Record<string, unknown>[] = [
    { state: "active", method: { id: "rankine" }, segments },
    { profileId: "profile", method: { id: "rankine" }, segments },
    { profileId: "profile", state: "active", segments },
    { profileId: "profile", state: "active", method: { id: "rankine" }, segments: [] },
  ];
  for (const errorInput of errorInputs) {
    const sourceError = errorSnapshot(() => new sourceModuleValue.PressureDiagram2D(errorInput));
    const typescriptError = errorSnapshot(
      () => new typescriptModuleValue.PressureDiagram2D(errorInput),
    );
    assert.deepEqual(typescriptError, sourceError);
  }

  assert.deepEqual(
    typescriptModuleValue.integratePressureSegments([]),
    sourceModuleValue.integratePressureSegments([]),
  );
});
