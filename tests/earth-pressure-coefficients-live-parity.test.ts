import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const sourceRoot = path.resolve(repositoryRoot, "..", "strutture-js");
const sourceRevision = "6f33baead8b88166c4b2cf94af41763412e3c751";

interface RuntimeModule {
  coulombActiveEarthPressureCoefficient(options: Record<string, unknown>): Record<string, unknown>;
  coulombPassiveEarthPressureCoefficient(options: Record<string, unknown>): Record<string, unknown>;
  jakyAtRestCoefficient(options: Record<string, unknown>): Record<string, unknown>;
  mononobeOkabeActiveEarthPressureCoefficient(
    options: Record<string, unknown>,
  ): Record<string, unknown>;
  rankineEarthPressureCoefficients(options: Record<string, unknown>): Record<string, unknown>;
}

function isRuntimeModule(value: unknown): value is RuntimeModule {
  return (
    value !== null &&
    typeof value === "object" &&
    typeof Reflect.get(value, "coulombActiveEarthPressureCoefficient") === "function" &&
    typeof Reflect.get(value, "coulombPassiveEarthPressureCoefficient") === "function" &&
    typeof Reflect.get(value, "jakyAtRestCoefficient") === "function" &&
    typeof Reflect.get(value, "mononobeOkabeActiveEarthPressureCoefficient") === "function" &&
    typeof Reflect.get(value, "rankineEarthPressureCoefficients") === "function"
  );
}

function gitOutput(...arguments_: readonly string[]): string {
  return execFileSync("git", ["-C", sourceRoot, ...arguments_], { encoding: "utf8" }).trim();
}

interface FunctionCase {
  name: keyof RuntimeModule;
  options: Record<string, unknown>;
}

function captureError(action: () => unknown): { name: string; message: string } {
  let captured: { name: string; message: string } | null = null;
  try {
    action();
  } catch (error) {
    if (error instanceof Error) {
      captured = { name: error.name, message: error.message };
    } else {
      throw error;
    }
  }
  if (captured === null) throw new Error("Expected the coefficient function to throw.");
  return captured;
}

void test("earth-pressure coefficient utilities match the independent pinned JavaScript implementation", async () => {
  assert.equal(gitOutput("rev-parse", "HEAD"), sourceRevision);
  assert.equal(gitOutput("status", "--porcelain"), "");
  const sourceModuleValue: unknown = await import(
    pathToFileURL(path.join(sourceRoot, "src", "index.js")).href
  );
  const typescriptModuleValue: unknown = await import(
    pathToFileURL(path.join(repositoryRoot, "dist", "index.js")).href
  );
  if (!isRuntimeModule(sourceModuleValue) || !isRuntimeModule(typescriptModuleValue)) {
    throw new Error("Earth-pressure coefficient exports do not expose the expected API.");
  }

  const cases: readonly FunctionCase[] = [
    {
      name: "rankineEarthPressureCoefficients",
      options: { frictionAngle: Math.PI / 6 },
    },
    {
      name: "jakyAtRestCoefficient",
      options: { frictionAngle: Math.PI / 6 },
    },
    {
      name: "coulombActiveEarthPressureCoefficient",
      options: {
        frictionAngle: Math.PI / 6,
        interfaceFrictionAngle: Math.PI / 36,
        wallInclinationFromVertical: Math.PI / 36,
        backfillInclination: Math.PI / 45,
      },
    },
    {
      name: "coulombPassiveEarthPressureCoefficient",
      options: {
        frictionAngle: Math.PI / 6,
        interfaceFrictionAngle: Math.PI / 36,
        backfillInclination: Math.PI / 45,
      },
    },
    {
      name: "mononobeOkabeActiveEarthPressureCoefficient",
      options: {
        frictionAngle: Math.PI / 6,
        interfaceFrictionAngle: Math.PI / 36,
        horizontalSeismicCoefficient: 0.1,
        verticalSeismicCoefficient: 0.05,
      },
    },
  ];

  for (const { name, options } of cases) {
    const sourceResult: Record<string, unknown> = sourceModuleValue[name](options);
    const typescriptResult: Record<string, unknown> = typescriptModuleValue[name](options);
    assert.deepEqual(typescriptResult, sourceResult);
    assert.equal(JSON.stringify(typescriptResult), JSON.stringify(sourceResult));
    for (const key of Object.keys(typescriptResult)) {
      const typescriptValue = typescriptResult[key];
      const sourceValue = sourceResult[key];
      if (typeof typescriptValue === "string" && typeof sourceValue === "string") {
        assert.deepEqual([...typescriptValue], [...sourceValue]);
      }
    }
  }

  const errors: readonly FunctionCase[] = [
    { name: "rankineEarthPressureCoefficients", options: { frictionAngle: Math.PI / 2 } },
    {
      name: "coulombPassiveEarthPressureCoefficient",
      options: { frictionAngle: Math.PI / 6, interfaceFrictionAngle: Math.PI / 6 },
    },
    {
      name: "mononobeOkabeActiveEarthPressureCoefficient",
      options: { frictionAngle: Math.PI / 6, horizontalSeismicCoefficient: -0.1 },
    },
  ];
  for (const { name, options } of errors) {
    const sourceError = captureError(() => sourceModuleValue[name](options));
    const typescriptError = captureError(() => typescriptModuleValue[name](options));
    assert.deepEqual(typescriptError, sourceError);
  }
});
