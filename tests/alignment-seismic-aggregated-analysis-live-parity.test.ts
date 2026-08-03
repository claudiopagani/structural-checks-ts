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
  readonly AlignmentSeismicAggregatedAnalysis: new (options?: unknown) => RuntimeAnalysis;
  readonly MasonryWallOpeningsModel: new (options: unknown) => unknown;
}

interface RuntimeDirectModule extends JsonRecord {
  readonly AlignmentSeismicAggregatedAnalysis: RuntimeRootModule["AlignmentSeismicAggregatedAnalysis"];
}

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isRuntimeRootModule(value: unknown): value is RuntimeRootModule {
  return (
    isRecord(value) &&
    typeof value.AlignmentSeismicAggregatedAnalysis === "function" &&
    typeof value.MasonryWallOpeningsModel === "function"
  );
}

function isRuntimeDirectModule(value: unknown): value is RuntimeDirectModule {
  return isRecord(value) && typeof value.AlignmentSeismicAggregatedAnalysis === "function";
}

function gitOutput(repository: string, ...arguments_: readonly string[]): string {
  return execFileSync("git", ["-C", repository, ...arguments_], { encoding: "utf8" }).trim();
}

async function loadRootModule(root: string): Promise<RuntimeRootModule> {
  const module: unknown = await import(pathToFileURL(path.join(root, "src", "index.js")).href);
  if (!isRuntimeRootModule(module)) {
    throw new Error("Missing AlignmentSeismicAggregatedAnalysis root exports.");
  }
  return module;
}

async function loadBuiltRootModule(): Promise<RuntimeRootModule> {
  const module: unknown = await import(
    pathToFileURL(path.join(repositoryRoot, "dist", "index.js")).href
  );
  if (!isRuntimeRootModule(module)) {
    throw new Error("Missing built AlignmentSeismicAggregatedAnalysis root exports.");
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

function errorSnapshot(callback: () => unknown): { name: string; message: string } {
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
  assert.deepEqual(errorSnapshot(sourceCallback), errorSnapshot(typescriptCallback), label);
}

function createPlainMasonryMaterial(): JsonRecord {
  return {
    fm: 6e6,
    tau0: 1e5,
    fv0: 2e5,
    E: 1.8e9,
    G: 6e8,
    density: 18000,
    units: { force: "N", length: "m" },
  };
}

function createAlignment(root: RuntimeRootModule, variant: "basic" | "fixed" | "ring"): unknown {
  const ringFrame =
    variant === "ring"
      ? {
          memberSections: {
            columns: "IPE200",
            topBeam: "IPE200",
            bottomBeam: "UPN200",
          },
          includeBottomBeam: true,
          topBeamOrientation: "weak-axis-in-plane",
          materialGrade: "S275",
          solver: {
            maxDisplacement: 0.02,
            controlIncrement: 0.002,
            maxSteps: 20,
            maxIterations: 40,
          },
        }
      : undefined;

  return new root.MasonryWallOpeningsModel({
    id: `alignment-seismic-${variant}-λ`,
    units: { force: "N", length: "m" },
    walls: [
      {
        id: "wall-seismic-λ",
        length: 5,
        height: 3,
        thickness: 0.3,
        material: createPlainMasonryMaterial(),
        verticalLineLoad: { G1: 20000 },
      },
    ],
    openings: [
      {
        id: "opening-seismic-λ",
        x: 2,
        y: 1,
        width: 1,
        height: 1,
        ...(ringFrame ? { ringFrame } : {}),
      },
    ],
  });
}

function analyze(root: RuntimeRootModule, variant: "basic" | "fixed" | "ring"): RuntimeResult {
  return new root.AlignmentSeismicAggregatedAnalysis().analyze({
    alignment: createAlignment(root, variant),
    ...(variant === "fixed" ? { options: { topRotation: "fixed" } } : {}),
  });
}

void test("AlignmentSeismicAggregatedAnalysis matches the independent pinned JavaScript implementation", async () => {
  assert.equal(gitOutput(sourceRoot, "rev-parse", "HEAD"), sourceRevision);
  assert.equal(gitOutput(sourceRoot, "status", "--porcelain"), "");
  assert.equal(gitOutput(normativeRoot, "rev-parse", "HEAD"), normativeRevision);
  assert.equal(gitOutput(normativeRoot, "status", "--porcelain"), "");

  const sourceRootModule = await loadRootModule(sourceRoot);
  const typescriptRootModule = await loadBuiltRootModule();
  const sourceDirect = await loadDirectModule(
    sourceRoot,
    "src/applications/masonry-wall-openings/analysis/AlignmentSeismicAggregatedAnalysis.js",
  );
  const typescriptDirect = await loadDirectModule(
    path.join(repositoryRoot, "dist"),
    "applications/masonry-wall-openings/analysis/AlignmentSeismicAggregatedAnalysis.js",
  );

  assert.notEqual(
    sourceDirect.AlignmentSeismicAggregatedAnalysis,
    typescriptDirect.AlignmentSeismicAggregatedAnalysis,
  );
  assert.equal(
    sourceRootModule.AlignmentSeismicAggregatedAnalysis,
    sourceDirect.AlignmentSeismicAggregatedAnalysis,
  );
  assert.equal(
    typescriptRootModule.AlignmentSeismicAggregatedAnalysis,
    typescriptDirect.AlignmentSeismicAggregatedAnalysis,
  );
  assert.notEqual(
    sourceRootModule.AlignmentSeismicAggregatedAnalysis,
    typescriptRootModule.AlignmentSeismicAggregatedAnalysis,
  );

  exactJson(analyze(sourceRootModule, "basic"), analyze(typescriptRootModule, "basic"), "basic");
  exactJson(analyze(sourceRootModule, "fixed"), analyze(typescriptRootModule, "fixed"), "fixed");
  exactJson(analyze(sourceRootModule, "ring"), analyze(typescriptRootModule, "ring"), "ring-frame");

  const sourceBasic = serialize(analyze(sourceRootModule, "basic"));
  const typescriptBasic = serialize(analyze(typescriptRootModule, "basic"));
  assert.ok(isRecord(sourceBasic));
  assert.ok(isRecord(typescriptBasic));
  assert.equal(sourceBasic.status, "ok");
  assert.equal(typescriptBasic.status, "ok");
  assert.ok(
    isRecord(sourceBasic.outputs) &&
      isRecord(typescriptBasic.outputs) &&
      isRecord(sourceBasic.outputs.capacityCurve) &&
      isRecord(typescriptBasic.outputs.capacityCurve),
  );
  assert.equal(
    typescriptBasic.outputs.capacityCurve.maxBaseShear,
    sourceBasic.outputs.capacityCurve.maxBaseShear,
  );

  assertErrorParity(
    () => new sourceRootModule.AlignmentSeismicAggregatedAnalysis().analyze(),
    () => new typescriptRootModule.AlignmentSeismicAggregatedAnalysis().analyze(),
    "missing alignment error",
  );
  assertErrorParity(
    () =>
      new sourceRootModule.AlignmentSeismicAggregatedAnalysis().analyze({
        alignment: createAlignment(sourceRootModule, "basic"),
        options: { topRotation: "unsupported" },
      }),
    () =>
      new typescriptRootModule.AlignmentSeismicAggregatedAnalysis().analyze({
        alignment: createAlignment(typescriptRootModule, "basic"),
        options: { topRotation: "unsupported" },
      }),
    "unsupported topRotation error",
  );
});
