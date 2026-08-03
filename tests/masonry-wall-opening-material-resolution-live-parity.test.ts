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

interface RootRuntimeModule extends RuntimeModule {
  resolveMasonryStageMaterial: RuntimeResolver;
}

interface PropertyRuntimeModule extends RuntimeModule {
  resolveMasonryMaterialProperty: RuntimeResolver;
  resolveMasonryUnitWeight: RuntimeResolver;
}

function isRecord(value: unknown): value is RuntimeModule {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isRootRuntimeModule(value: unknown): value is RootRuntimeModule {
  return isRecord(value) && typeof value.resolveMasonryStageMaterial === "function";
}

function isPropertyRuntimeModule(value: unknown): value is PropertyRuntimeModule {
  return (
    isRecord(value) &&
    typeof value.resolveMasonryMaterialProperty === "function" &&
    typeof value.resolveMasonryUnitWeight === "function"
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
      throw new Error("The material resolution operation threw a non-Error value.", {
        cause: error,
      });
    }
    return { name: error.name, message: error.message };
  }
}

void test("masonry material resolution matches the independent pinned JavaScript implementation", async () => {
  assert.equal(gitOutput(sourceRoot, "rev-parse", "HEAD"), sourceRevision);
  assert.equal(gitOutput(sourceRoot, "status", "--porcelain"), "");
  assert.equal(gitOutput(normativeRoot, "rev-parse", "HEAD"), normativeRevision);
  assert.equal(gitOutput(normativeRoot, "status", "--porcelain"), "");

  const sourceRootModuleValue: unknown = await loadModule(sourceRoot, "src/index.js");
  const typescriptRootModuleValue: unknown = await loadModule(
    path.join(repositoryRoot, "dist"),
    "index.js",
  );
  const sourcePropertyModuleValue: unknown = await loadModule(
    sourceRoot,
    "src/applications/masonry-wall-openings/materials/resolveMasonryMaterialProperty.js",
  );
  const typescriptPropertyModuleValue: unknown = await loadModule(
    path.join(repositoryRoot, "dist"),
    "applications/masonry-wall-openings/materials/resolveMasonryMaterialProperty.js",
  );
  if (
    !isRootRuntimeModule(sourceRootModuleValue) ||
    !isRootRuntimeModule(typescriptRootModuleValue) ||
    !isPropertyRuntimeModule(sourcePropertyModuleValue) ||
    !isPropertyRuntimeModule(typescriptPropertyModuleValue)
  ) {
    throw new Error("Masonry material resolution exports do not expose the expected API.");
  }

  assert.notEqual(
    sourceRootModuleValue.resolveMasonryStageMaterial,
    typescriptRootModuleValue.resolveMasonryStageMaterial,
    "stage resolver independent implementation",
  );
  assert.notEqual(
    sourcePropertyModuleValue.resolveMasonryMaterialProperty,
    typescriptPropertyModuleValue.resolveMasonryMaterialProperty,
    "property resolver independent implementation",
  );

  const fixtures: Record<string, unknown> = {
    missing: { material: null, stage: "design", contextId: "muratura — assente" },
    manualStateOfFact: {
      material: {
        id: "manual-μ",
        name: "Muratura — stato di fatto",
        units: { force: "N", length: "mm" },
        confidenceFactor: 1.2,
        originalMechanicalProperties: { fm: 4_500_000, E: 1_600_000_000, density: 18_000 },
        stateOfFactProperties: { fm: 4_000_000, E: 1_400_000_000, density: 18_000 },
        improvedMechanicalProperties: { fm: 6_000_000, E: 2_100_000_000, density: 18_000 },
      },
      stage: "state-of-fact",
      targetUnits: { force: "N", length: "m" },
      contextId: "wall-α",
    },
    designWithConfidence: {
      material: {
        id: "manual-design",
        units: { force: "N", length: "mm" },
        confidenceFactor: 1.2,
        originalMechanicalProperties: { fm: 4_500_000, E: 1_600_000_000 },
        improvedMechanicalProperties: { fm: 6_000_000, E: 2_100_000_000 },
      },
      stage: "design",
      settings: { divideByConfidenceFactor: true },
      targetUnits: { force: "N", length: "m" },
    },
    variantsAndOverride: {
      material: {
        id: "variant-δ",
        originalMechanicalProperties: { fm: 4_000_000, E: 1_000_000_000, density: 18_000 },
        stageSelectionVariants: {
          design: {
            strength: { characteristic: { fm: 5_000_000 } },
            stiffness: { mean: { E: 1_500_000_000 } },
          },
        },
      },
      stage: "design",
      settings: { strengthSelection: "characteristic", stiffnessSelection: "mean" },
      override: { properties: { fm: 5_500_000 } },
    },
    adjustedFunction: {
      material: {
        id: "adjusted-β",
        adjustedProperties: () => ({ fm: 3_200_000, G: 700_000_000, density: 17_500 }),
      },
      stage: "design",
    },
  };

  for (const [label, input] of Object.entries(fixtures)) {
    const sourceResult = sourceRootModuleValue.resolveMasonryStageMaterial(input);
    const typescriptResult = typescriptRootModuleValue.resolveMasonryStageMaterial(input);
    assertExactParity(sourceResult, typescriptResult, `${label} stage resolution`);
  }

  const propertyFixtures: Record<string, unknown> = {
    direct: {
      material: {
        units: { force: "N", length: "mm" },
        properties: { fm: 2, density: 18 },
      },
      aliases: ["fm"],
      targetUnits: { force: "N", length: "m" },
    },
    adjustedProperty: {
      material: {
        adjustedProperty: (alias: string) => (alias === "tau0" ? 0.25 : null),
      },
      aliases: ["tau0"],
      targetUnits: { force: "N", length: "m" },
    },
    unitWeight: {
      material: { units: { force: "N", length: "mm" }, properties: { w: 0.018 } },
      targetUnits: { force: "N", length: "m" },
    },
  };

  for (const [label, input] of Object.entries(propertyFixtures)) {
    const sourceResult =
      label === "unitWeight"
        ? sourcePropertyModuleValue.resolveMasonryUnitWeight(input)
        : sourcePropertyModuleValue.resolveMasonryMaterialProperty(input);
    const typescriptResult =
      label === "unitWeight"
        ? typescriptPropertyModuleValue.resolveMasonryUnitWeight(input)
        : typescriptPropertyModuleValue.resolveMasonryMaterialProperty(input);
    assertExactParity(sourceResult, typescriptResult, `${label} property resolution`);
  }

  const invalidInput = {
    material: {
      units: { force: "kip", length: "m" },
      originalMechanicalProperties: { fm: 1 },
    },
    targetUnits: { force: "N", length: "m" },
  };
  assert.deepEqual(
    captureError(() => sourceRootModuleValue.resolveMasonryStageMaterial(invalidInput)),
    captureError(() => typescriptRootModuleValue.resolveMasonryStageMaterial(invalidInput)),
    "unsupported unit error",
  );
});
