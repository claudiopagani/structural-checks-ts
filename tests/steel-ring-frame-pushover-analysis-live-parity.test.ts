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

interface RuntimeAnalysisResult {
  readonly status: unknown;
  readonly summary: unknown;
  readonly warnings: readonly unknown[];
  readonly assumptions: readonly unknown[];
  readonly outputs: {
    readonly capacityCurve: { readonly points: readonly unknown[]; readonly maxBaseShear: unknown };
    readonly hingeEvents: readonly unknown[];
    readonly finalState: unknown;
  };
  readonly metadata: unknown;
}

interface RuntimeAnalysisModule {
  readonly SteelRingFramePushoverAnalysis: new () => {
    analyze: (input?: unknown) => RuntimeAnalysisResult;
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isAnalysisModule(value: unknown): value is RuntimeAnalysisModule {
  return (
    isRecord(value) && typeof Reflect.get(value, "SteelRingFramePushoverAnalysis") === "function"
  );
}

function gitOutput(repository: string, ...arguments_: readonly string[]): string {
  return execFileSync("git", ["-C", repository, ...arguments_], { encoding: "utf8" }).trim();
}

async function loadModule(root: string, relativePath: string): Promise<RuntimeAnalysisModule> {
  const module: unknown = await import(pathToFileURL(path.join(root, relativePath)).href);
  if (!isAnalysisModule(module)) throw new Error(`Missing analysis export in ${relativePath}.`);
  return module;
}

function exactJson(source: unknown, typescript: unknown, label: string): void {
  const sourceJson = JSON.stringify(source);
  const typescriptJson = JSON.stringify(typescript);
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

const fixtures: readonly Record<string, unknown>[] = [
  {
    id: "ring-analysis-Æ",
    units: { force: "kN", length: "m" },
    geometry: { clearWidth: 0.9, clearHeight: 2.1 },
    memberSections: { columns: "IPE200", topBeam: "IPE200", bottomBeam: "IPE200" },
    material: "S275",
    baseCondition: "pinned-base-with-bottom-beam",
    solver: {
      controlIncrement: 0.002,
      maxDisplacement: 0.03,
      tolerance: 1e-6,
      maxIterations: 60,
      maxSteps: 60,
    },
    metadata: { label: "Telaio-λ" },
  },
  {
    id: "ring-analysis-fixed",
    units: { force: "N", length: "mm" },
    geometry: { width: 900, height: 2100 },
    memberSections: { columns: "IPE100", topBeam: "IPE100" },
    baseCondition: "fixed-base",
    solver: { controlIncrement: 2, maxDisplacement: 20, maxSteps: 4 },
  },
];

void test("SteelRingFramePushoverAnalysis matches the independent pinned JavaScript implementation", async () => {
  assert.equal(gitOutput(sourceRoot, "rev-parse", "HEAD"), sourceRevision);
  assert.equal(gitOutput(sourceRoot, "status", "--porcelain"), "");
  assert.equal(gitOutput(normativeRoot, "rev-parse", "HEAD"), normativeRevision);
  assert.equal(gitOutput(normativeRoot, "status", "--porcelain"), "");

  const source = await loadModule(
    sourceRoot,
    "src/applications/steel-frames/analysis/SteelRingFramePushoverAnalysis.js",
  );
  const typescript = await loadModule(
    path.join(repositoryRoot, "dist"),
    "applications/steel-frames/analysis/SteelRingFramePushoverAnalysis.js",
  );
  const sourceRootModule = await loadModule(sourceRoot, "src/index.js");
  const typescriptRootModule = await loadModule(path.join(repositoryRoot, "dist"), "index.js");

  assert.notEqual(source.SteelRingFramePushoverAnalysis, typescript.SteelRingFramePushoverAnalysis);
  assert.equal(
    sourceRootModule.SteelRingFramePushoverAnalysis,
    source.SteelRingFramePushoverAnalysis,
  );
  assert.equal(
    typescriptRootModule.SteelRingFramePushoverAnalysis,
    typescript.SteelRingFramePushoverAnalysis,
  );
  assert.notEqual(
    sourceRootModule.SteelRingFramePushoverAnalysis,
    typescriptRootModule.SteelRingFramePushoverAnalysis,
  );
  assert.deepEqual(
    Object.getOwnPropertyNames(source.SteelRingFramePushoverAnalysis.prototype),
    Object.getOwnPropertyNames(typescript.SteelRingFramePushoverAnalysis.prototype),
    "prototype shape",
  );

  for (const [index, model] of fixtures.entries()) {
    const sourceResult = new source.SteelRingFramePushoverAnalysis().analyze({ model });
    const typescriptResult = new typescript.SteelRingFramePushoverAnalysis().analyze({ model });
    exactJson(sourceResult, typescriptResult, `fixture ${index}: result`);
    assert.equal(
      typescriptResult.outputs.capacityCurve.points.length,
      sourceResult.outputs.capacityCurve.points.length,
    );
    assert.equal(
      typescriptResult.outputs.capacityCurve.maxBaseShear,
      sourceResult.outputs.capacityCurve.maxBaseShear,
    );
    assert.equal(
      typescriptResult.outputs.hingeEvents.length,
      sourceResult.outputs.hingeEvents.length,
    );
  }

  assertErrorParity(
    () => new source.SteelRingFramePushoverAnalysis().analyze(),
    () => new typescript.SteelRingFramePushoverAnalysis().analyze(),
    "missing model",
  );
  assertErrorParity(
    () => new source.SteelRingFramePushoverAnalysis().analyze({ model: null }),
    () => new typescript.SteelRingFramePushoverAnalysis().analyze({ model: null }),
    "null model",
  );
});
