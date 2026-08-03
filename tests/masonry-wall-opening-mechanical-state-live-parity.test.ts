import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const sourceRoot = path.resolve(repositoryRoot, "..", "strutture-js");
const normativeRoot = path.resolve(repositoryRoot, "..", "strutture-normative");
const sourceRevision = "6f33baead8b88166c4b2cf94af41763412e3c751";
const normativeRevision = "41da3faa489600173106935bbcf726119300e48d";

type RuntimeModule = Record<string, unknown>;
type RuntimeResolver = (input?: unknown) => unknown;
type RuntimeModelConstructor = new (input: unknown) => unknown;

interface RootRuntimeModule extends RuntimeModule {
  MasonryWallOpeningsModel: RuntimeModelConstructor;
  resolveAlignmentMechanicalState: RuntimeResolver;
}

function isRecord(value: unknown): value is RuntimeModule {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isRootRuntimeModule(value: unknown): value is RootRuntimeModule {
  return (
    isRecord(value) &&
    typeof value.MasonryWallOpeningsModel === "function" &&
    typeof value.resolveAlignmentMechanicalState === "function"
  );
}

function gitOutput(repository: string, ...arguments_: readonly string[]): string {
  return execFileSync("git", ["-C", repository, ...arguments_], { encoding: "utf8" }).trim();
}

async function loadModule(root: string, relativePath: string): Promise<RuntimeModule> {
  const module: unknown = await import(pathToFileURL(path.join(root, relativePath)).href);
  if (!isRecord(module)) {
    throw new Error(`The module ${relativePath} is not an object module.`);
  }
  return module;
}

function assertExactParity(source: unknown, typescript: unknown, label: string): void {
  assert.deepEqual(typescript, source, label);
  const sourceJson = JSON.stringify(source);
  const typescriptJson = JSON.stringify(typescript);
  assert.equal(typescriptJson, sourceJson, `${label}: exact JSON`);
  assert.deepEqual([...typescriptJson], [...sourceJson], `${label}: exact Unicode`);
}

function captureError(run: () => unknown): { name: string; message: string } | null {
  try {
    run();
    return null;
  } catch (error: unknown) {
    if (!(error instanceof Error)) {
      throw new Error("The mechanical-state operation threw a non-Error value.", { cause: error });
    }
    return { name: error.name, message: error.message };
  }
}

function hasToJSON(value: unknown): value is { toJSON: () => unknown } {
  return (
    value !== null &&
    (typeof value === "object" || typeof value === "function") &&
    "toJSON" in value &&
    typeof value.toJSON === "function"
  );
}

function mechanicalState(value: unknown): unknown {
  if (!isRecord(value) || !hasToJSON(value.alignment)) {
    throw new Error("The mechanical-state result does not contain a serializable alignment.");
  }

  return {
    ...value,
    alignment: value.alignment.toJSON(),
  };
}

function createAlignment(
  moduleValue: RootRuntimeModule,
  options: Record<string, unknown>,
): unknown {
  return new moduleValue.MasonryWallOpeningsModel(options);
}

void test("alignment mechanical state matches the independent pinned JavaScript implementation", async () => {
  assert.equal(gitOutput(sourceRoot, "rev-parse", "HEAD"), sourceRevision);
  assert.equal(gitOutput(sourceRoot, "status", "--porcelain"), "");
  assert.equal(gitOutput(normativeRoot, "rev-parse", "HEAD"), normativeRevision);
  assert.equal(gitOutput(normativeRoot, "status", "--porcelain"), "");

  const sourceModuleValue: unknown = await loadModule(sourceRoot, "src/index.js");
  const typescriptModuleValue: unknown = await loadModule(
    path.join(repositoryRoot, "dist"),
    "index.js",
  );
  if (!isRootRuntimeModule(sourceModuleValue) || !isRootRuntimeModule(typescriptModuleValue)) {
    throw new Error("Alignment mechanical-state exports do not expose the expected API.");
  }

  assert.notEqual(
    sourceModuleValue.resolveAlignmentMechanicalState,
    typescriptModuleValue.resolveAlignmentMechanicalState,
    "mechanical-state resolver independent implementation",
  );

  const fixtures: Record<string, Record<string, unknown>> = {
    stateOfFact: {
      id: "alignment-mechanical-μ",
      units: { force: "N", length: "m" },
      settings: { stiffnessState: "uncracked" },
      walls: [
        {
          id: "wall-α",
          length: 5,
          height: 3,
          thickness: 0.3,
          material: {
            name: "Muratura — stato di fatto",
            originalMechanicalProperties: { fm: 4_500_000, E: 1_600_000_000 },
            stateOfFactProperties: { fm: 4_000_000, E: 1_400_000_000 },
            improvedMechanicalProperties: { fm: 6_000_000, E: 2_100_000_000 },
          },
        },
      ],
      openings: [{ id: "window-δ", x: 1, y: 1, width: 1, height: 1 }],
    },
    designWithOverride: {
      id: "alignment-mechanical-design",
      units: { force: "N", length: "m" },
      walls: [
        {
          id: "wall-a",
          length: 4,
          height: 3,
          thickness: 0.3,
          material: {
            originalMechanicalProperties: { fm: 4_000_000, E: 1_000_000_000 },
            improvedMechanicalProperties: { fm: 6_000_000, E: 2_000_000_000 },
          },
        },
        {
          id: "wall-b",
          length: 3,
          height: 2.8,
          thickness: 0.25,
          material: null,
        },
      ],
      openings: [],
    },
    directProperties: {
      id: "alignment-direct",
      units: { force: "N", length: "m" },
      walls: [
        {
          id: "wall-direct",
          length: 3,
          height: 2.7,
          thickness: 0.25,
          material: { fm: 2_500_000, E: 900_000_000 },
        },
      ],
      openings: [],
    },
  };

  const scenarios: Record<string, { stage: string; options?: Record<string, unknown> }> = {
    stateOfFact: { stage: "state-of-fact" },
    designWithOverride: {
      stage: "design",
      options: {
        divideByConfidenceFactor: true,
        wallMaterialOverrides: { "wall-a": { properties: { fm: 5_500_000 } } },
      },
    },
    directProperties: { stage: "design", options: { normativePreset: "preset-δ" } },
  };

  for (const [label, options] of Object.entries(fixtures)) {
    const sourceAlignment = createAlignment(sourceModuleValue, options);
    const typescriptAlignment = createAlignment(typescriptModuleValue, options);
    const scenario = scenarios[label];
    const input = {
      stage: scenario?.stage,
      options: scenario?.options,
    };
    const sourceResult = sourceModuleValue.resolveAlignmentMechanicalState({
      alignment: sourceAlignment,
      ...input,
    });
    const typescriptResult = typescriptModuleValue.resolveAlignmentMechanicalState({
      alignment: typescriptAlignment,
      ...input,
    });
    assertExactParity(
      mechanicalState(sourceResult),
      mechanicalState(typescriptResult),
      `${label} state`,
    );
  }

  assert.deepEqual(
    captureError(() => sourceModuleValue.resolveAlignmentMechanicalState({ alignment: null })),
    captureError(() => typescriptModuleValue.resolveAlignmentMechanicalState({ alignment: null })),
    "missing alignment error",
  );
});
