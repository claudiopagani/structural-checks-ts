import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const sourceRoot = path.resolve(repositoryRoot, "..", "strutture-js");
const normativeRoot = path.resolve(repositoryRoot, "..", "strutture-normative");
const sourceRevision = "6f33baead8b88166c4b2cf94af41763412e3c751";
const normativeRevision = "41da3faa489600173106935bbcf726119300e48d";

type JsonRecord = Record<string, unknown>;

interface RuntimeResult {
  readonly toJSON?: () => unknown;
}

interface RuntimeAnalysis {
  readonly analyze: (input?: unknown) => RuntimeResult;
}

interface RuntimeRootModule extends JsonRecord {
  readonly AlignmentStateComparisonAnalysis: new (options?: unknown) => RuntimeAnalysis;
  readonly MasonryWallOpeningsModel: new (options: unknown) => unknown;
}

interface RuntimeDirectModule extends JsonRecord {
  readonly AlignmentStateComparisonAnalysis: RuntimeRootModule["AlignmentStateComparisonAnalysis"];
}

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isRuntimeRootModule(value: unknown): value is RuntimeRootModule {
  return (
    isRecord(value) &&
    typeof value.AlignmentStateComparisonAnalysis === "function" &&
    typeof value.MasonryWallOpeningsModel === "function"
  );
}

function isRuntimeDirectModule(value: unknown): value is RuntimeDirectModule {
  return isRecord(value) && typeof value.AlignmentStateComparisonAnalysis === "function";
}

function gitOutput(repository: string, ...arguments_: readonly string[]): string {
  return execFileSync("git", ["-C", repository, ...arguments_], { encoding: "utf8" }).trim();
}

async function loadRootModule(root: string): Promise<RuntimeRootModule> {
  const module: unknown = await import(pathToFileURL(path.join(root, "src", "index.js")).href);
  if (!isRuntimeRootModule(module)) {
    throw new Error("Missing AlignmentStateComparisonAnalysis root export.");
  }
  return module;
}

async function loadBuiltRootModule(): Promise<RuntimeRootModule> {
  const module: unknown = await import(
    pathToFileURL(path.join(repositoryRoot, "dist", "index.js")).href
  );
  if (!isRuntimeRootModule(module)) {
    throw new Error("Missing built AlignmentStateComparisonAnalysis root export.");
  }
  return module;
}

async function loadDirectModule(root: string, relativePath: string): Promise<RuntimeDirectModule> {
  const module: unknown = await import(pathToFileURL(path.join(root, relativePath)).href);
  if (!isRuntimeDirectModule(module)) {
    throw new Error(`Missing direct export in ${relativePath}.`);
  }
  return module;
}

function serialize(value: unknown): unknown {
  if (isRecord(value) && typeof value.toJSON === "function") {
    return Reflect.apply(value.toJSON, value, []);
  }
  return value;
}

function exactJson(source: unknown, typescript: unknown, label: string): void {
  const sourceJson = JSON.stringify(serialize(source));
  const typescriptJson = JSON.stringify(serialize(typescript));
  assert.equal(typescriptJson, sourceJson, `${label}: exact JSON`);
  assert.deepEqual(
    Array.from(typescriptJson, (character) => character.codePointAt(0)),
    Array.from(sourceJson, (character) => character.codePointAt(0)),
    `${label}: exact Unicode code points`,
  );
}

function captureError(callback: () => unknown): { name: string; message: string } {
  try {
    callback();
  } catch (error) {
    assert.ok(error instanceof Error);
    return { name: error.name, message: error.message };
  }
  throw new Error("Expected the callback to throw.");
}

function assertErrorParity(
  sourceCallback: () => unknown,
  typescriptCallback: () => unknown,
  label: string,
): void {
  assert.deepEqual(captureError(sourceCallback), captureError(typescriptCallback), label);
}

function stageMaterial(improvedE: number, improvedG: number): JsonRecord {
  return {
    category: "masonry",
    units: { force: "N", length: "m" },
    originalMechanicalProperties: {
      fm: 4.5e6,
      tau0: 8e4,
      fv0: 1.5e5,
      E: 1.6e9,
      G: 5.4e8,
      density: 18000,
    },
    stateOfFactProperties: {
      fm: 4e6,
      tau0: 7e4,
      fv0: 1.2e5,
      E: 1.4e9,
      G: 4.8e8,
      density: 18000,
    },
    improvedMechanicalProperties: {
      fm: 4e6,
      tau0: 7e4,
      fv0: 1.2e5,
      E: improvedE,
      G: improvedG,
      density: 18000,
    },
  };
}

function createAlignment(
  root: RuntimeRootModule,
  variant: "aligned" | "stiffened" | "reduced",
): unknown {
  const material =
    variant === "stiffened"
      ? stageMaterial(2.8e9, 9.6e8)
      : variant === "reduced"
        ? {
            ...stageMaterial(1.8e9, 6e8),
            stateOfFactProperties: {
              fm: 6e6,
              tau0: 3e5,
              fv0: 3e5,
              E: 1.8e9,
              G: 6e8,
              density: 18000,
            },
            improvedMechanicalProperties: {
              fm: 6e6,
              tau0: 2e4,
              fv0: 2e4,
              E: 1.8e9,
              G: 6e8,
              density: 18000,
            },
          }
        : stageMaterial(1.4e9, 4.8e8);

  return new root.MasonryWallOpeningsModel({
    id: `alignment-state-${variant}-λ`,
    units: { force: "N", length: "m" },
    walls: [
      {
        id: "wall-state-λ",
        length: 5,
        height: 3,
        thickness: 0.3,
        material,
        verticalLineLoad: { G1: variant === "reduced" ? 40000 : 20000 },
      },
    ],
    openings: [{ id: "opening-state-λ", x: 2, y: 1, width: 1, height: 1 }],
  });
}

function analyze(
  root: RuntimeRootModule,
  variant: "aligned" | "stiffened" | "reduced",
): RuntimeResult {
  return new root.AlignmentStateComparisonAnalysis().analyze({
    alignment: createAlignment(root, variant),
  });
}

void test("AlignmentStateComparisonAnalysis matches the independent pinned JavaScript implementation", async () => {
  assert.equal(gitOutput(sourceRoot, "rev-parse", "HEAD"), sourceRevision);
  assert.equal(gitOutput(sourceRoot, "status", "--porcelain"), "");
  assert.equal(gitOutput(normativeRoot, "rev-parse", "HEAD"), normativeRevision);
  assert.equal(gitOutput(normativeRoot, "status", "--porcelain"), "");

  const sourceRootModule = await loadRootModule(sourceRoot);
  const typescriptRootModule = await loadBuiltRootModule();
  const sourceDirect = await loadDirectModule(
    sourceRoot,
    "src/applications/masonry-wall-openings/analysis/AlignmentStateComparisonAnalysis.js",
  );
  const typescriptDirect = await loadDirectModule(
    path.join(repositoryRoot, "dist"),
    "applications/masonry-wall-openings/analysis/AlignmentStateComparisonAnalysis.js",
  );

  assert.notEqual(
    sourceDirect.AlignmentStateComparisonAnalysis,
    typescriptDirect.AlignmentStateComparisonAnalysis,
  );
  assert.equal(
    sourceRootModule.AlignmentStateComparisonAnalysis,
    sourceDirect.AlignmentStateComparisonAnalysis,
  );
  assert.equal(
    typescriptRootModule.AlignmentStateComparisonAnalysis,
    typescriptDirect.AlignmentStateComparisonAnalysis,
  );

  exactJson(
    analyze(sourceRootModule, "aligned"),
    analyze(typescriptRootModule, "aligned"),
    "aligned",
  );
  exactJson(
    analyze(sourceRootModule, "stiffened"),
    analyze(typescriptRootModule, "stiffened"),
    "stiffness variation",
  );
  exactJson(
    analyze(sourceRootModule, "reduced"),
    analyze(typescriptRootModule, "reduced"),
    "strength and deformability reduction",
  );

  assertErrorParity(
    () => new sourceRootModule.AlignmentStateComparisonAnalysis().analyze(),
    () => new typescriptRootModule.AlignmentStateComparisonAnalysis().analyze(),
    "missing alignment error",
  );
});
