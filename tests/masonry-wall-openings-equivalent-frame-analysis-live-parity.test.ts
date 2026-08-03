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
  readonly AlignmentEquivalentFramePushoverAnalysis: new (options?: unknown) => RuntimeAnalysis;
  readonly MasonryPierCapacityCurveComparisonAnalysis: new (options?: unknown) => RuntimeAnalysis;
  readonly MasonryWallOpeningsModel: new (options: unknown) => unknown;
}

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isRuntimeRootModule(value: unknown): value is RuntimeRootModule {
  return (
    isRecord(value) &&
    typeof value.AlignmentEquivalentFramePushoverAnalysis === "function" &&
    typeof value.MasonryPierCapacityCurveComparisonAnalysis === "function" &&
    typeof value.MasonryWallOpeningsModel === "function"
  );
}

function gitOutput(repository: string, ...arguments_: readonly string[]): string {
  return execFileSync("git", ["-C", repository, ...arguments_], { encoding: "utf8" }).trim();
}

async function loadRootModule(root: string): Promise<RuntimeRootModule> {
  const module: unknown = await import(pathToFileURL(path.join(root, "src", "index.js")).href);
  if (!isRuntimeRootModule(module)) {
    throw new Error("Missing 0204 equivalent-frame root exports.");
  }
  return module;
}

async function loadBuiltRootModule(): Promise<RuntimeRootModule> {
  const module: unknown = await import(
    pathToFileURL(path.join(repositoryRoot, "dist", "index.js")).href
  );
  if (!isRuntimeRootModule(module)) {
    throw new Error("Missing built 0204 equivalent-frame root exports.");
  }
  return module;
}

async function loadDirectModule(root: string, relativePath: string): Promise<JsonRecord> {
  const module: unknown = await import(pathToFileURL(path.join(root, relativePath)).href);
  if (!isRecord(module)) {
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

function createAlignment(root: RuntimeRootModule, id: string, density = 18000): unknown {
  const units = { force: "N", length: "m" };
  return new root.MasonryWallOpeningsModel({
    id,
    label: "Maschio equivalente λ",
    units,
    walls: [
      {
        id: "wall-equivalent-λ",
        length: 1.2,
        height: 3,
        thickness: 0.3,
        material: {
          fm: 6e6,
          tau0: 4e5,
          fv0: 0,
          E: 1.8e9,
          G: 6e8,
          density,
          units,
        },
        verticalLineLoad: { G1: density === 0 ? 0 : 5000 },
      },
    ],
  });
}

function equivalentFrameAnalysis(root: RuntimeRootModule, id: string): RuntimeResult {
  return new root.AlignmentEquivalentFramePushoverAnalysis().analyze({
    alignment: createAlignment(root, id),
    options: { topRotation: "free", controlPointCount: 20 },
  });
}

function pierComparisonAnalysis(root: RuntimeRootModule, id: string): RuntimeResult {
  return new root.MasonryPierCapacityCurveComparisonAnalysis().analyze({
    alignment: createAlignment(root, id, 0),
    options: { topRotation: "free", controlPointCount: 20 },
  });
}

void test("0204 analyses match the independent pinned JavaScript implementations", async () => {
  assert.equal(gitOutput(sourceRoot, "rev-parse", "HEAD"), sourceRevision);
  assert.equal(gitOutput(sourceRoot, "status", "--porcelain"), "");
  assert.equal(gitOutput(normativeRoot, "rev-parse", "HEAD"), normativeRevision);
  assert.equal(gitOutput(normativeRoot, "status", "--porcelain"), "");

  const sourceRootModule = await loadRootModule(sourceRoot);
  const typescriptRootModule = await loadBuiltRootModule();
  const sourceDirect = await loadDirectModule(
    sourceRoot,
    "src/applications/masonry-wall-openings/analysis/AlignmentEquivalentFramePushoverAnalysis.js",
  );
  const typescriptDirect = await loadDirectModule(
    path.join(repositoryRoot, "dist"),
    "applications/masonry-wall-openings/analysis/AlignmentEquivalentFramePushoverAnalysis.js",
  );
  const sourcePierDirect = await loadDirectModule(
    sourceRoot,
    "src/applications/masonry-wall-openings/analysis/MasonryPierCapacityCurveComparisonAnalysis.js",
  );
  const typescriptPierDirect = await loadDirectModule(
    path.join(repositoryRoot, "dist"),
    "applications/masonry-wall-openings/analysis/MasonryPierCapacityCurveComparisonAnalysis.js",
  );

  assert.notEqual(
    sourceDirect.AlignmentEquivalentFramePushoverAnalysis,
    typescriptDirect.AlignmentEquivalentFramePushoverAnalysis,
  );
  assert.notEqual(
    sourcePierDirect.MasonryPierCapacityCurveComparisonAnalysis,
    typescriptPierDirect.MasonryPierCapacityCurveComparisonAnalysis,
  );
  assert.equal(
    typescriptRootModule.AlignmentEquivalentFramePushoverAnalysis,
    typescriptDirect.AlignmentEquivalentFramePushoverAnalysis,
  );
  assert.equal(
    typescriptRootModule.MasonryPierCapacityCurveComparisonAnalysis,
    typescriptPierDirect.MasonryPierCapacityCurveComparisonAnalysis,
  );

  exactJson(
    equivalentFrameAnalysis(sourceRootModule, "alignment-equivalent-frame-λ-pushover"),
    equivalentFrameAnalysis(typescriptRootModule, "alignment-equivalent-frame-λ-pushover"),
    "equivalent-frame pushover",
  );
  exactJson(
    pierComparisonAnalysis(sourceRootModule, "alignment-pier-λ-comparison"),
    pierComparisonAnalysis(typescriptRootModule, "alignment-pier-λ-comparison"),
    "pier capacity comparison",
  );

  assertErrorParity(
    () => new sourceRootModule.AlignmentEquivalentFramePushoverAnalysis().analyze(),
    () => new typescriptRootModule.AlignmentEquivalentFramePushoverAnalysis().analyze(),
    "equivalent-frame missing alignment",
  );
  assertErrorParity(
    () =>
      new sourceRootModule.MasonryPierCapacityCurveComparisonAnalysis().analyze({
        alignment: createAlignment(sourceRootModule, "alignment-error-λ"),
        options: { topRotation: "unsupported-λ" },
      }),
    () =>
      new typescriptRootModule.MasonryPierCapacityCurveComparisonAnalysis().analyze({
        alignment: createAlignment(typescriptRootModule, "alignment-error-λ"),
        options: { topRotation: "unsupported-λ" },
      }),
    "pier comparison unsupported top rotation",
  );
});
