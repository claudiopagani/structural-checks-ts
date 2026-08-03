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
  readonly AlignmentStaticAnalysis: new (options?: unknown) => RuntimeAnalysis;
  readonly MasonryWallOpeningsModel: new (options: unknown) => unknown;
  readonly createSteelProfileSection: (options: unknown) => unknown;
  readonly createNTC2018StructuralSteelMaterial: (options: unknown) => unknown;
}

interface RuntimeDirectModule extends JsonRecord {
  readonly AlignmentStaticAnalysis: RuntimeRootModule["AlignmentStaticAnalysis"];
}

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isRuntimeRootModule(value: unknown): value is RuntimeRootModule {
  return (
    isRecord(value) &&
    typeof value.AlignmentStaticAnalysis === "function" &&
    typeof value.MasonryWallOpeningsModel === "function" &&
    typeof value.createSteelProfileSection === "function" &&
    typeof value.createNTC2018StructuralSteelMaterial === "function"
  );
}

function isRuntimeDirectModule(value: unknown): value is RuntimeDirectModule {
  return isRecord(value) && typeof value.AlignmentStaticAnalysis === "function";
}

function gitOutput(repository: string, ...arguments_: readonly string[]): string {
  return execFileSync("git", ["-C", repository, ...arguments_], { encoding: "utf8" }).trim();
}

async function loadRootModule(root: string): Promise<RuntimeRootModule> {
  const module: unknown = await import(pathToFileURL(path.join(root, "src", "index.js")).href);
  if (!isRuntimeRootModule(module)) {
    throw new Error("Missing AlignmentStaticAnalysis root exports.");
  }
  return module;
}

async function loadBuiltRootModule(): Promise<RuntimeRootModule> {
  const module: unknown = await import(
    pathToFileURL(path.join(repositoryRoot, "dist", "index.js")).href
  );
  if (!isRuntimeRootModule(module)) {
    throw new Error("Missing built AlignmentStaticAnalysis root exports.");
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

function createPlainMaterial(): JsonRecord {
  return {
    fm: 6e6,
    E: 1.8e9,
    G: 6e8,
    density: 18000,
    metadata: { label: "muratura-λ" },
  };
}

function createAlignment(root: RuntimeRootModule, variant: "basic" | "ring" | "lintel"): unknown {
  const lintel =
    variant === "lintel"
      ? {
          bearingLength: 0.3,
          section: root.createSteelProfileSection({
            profileName: "IPE200",
            units: { force: "N", length: "m" },
          }),
          material: root.createNTC2018StructuralSteelMaterial({
            grade: "S275",
            units: { force: "N", length: "m" },
          }),
        }
      : undefined;

  return new root.MasonryWallOpeningsModel({
    id: `alignment-static-${variant}-λ`,
    units: { force: "N", length: "m" },
    walls: [
      {
        id: "wall-λ",
        length: variant === "ring" ? 4 : 5,
        height: 3,
        thickness: 0.3,
        material: createPlainMaterial(),
        verticalLineLoad: variant === "ring" ? { G1: 10000 } : { G1: 20000, G2: 5000, Qk: 3000 },
      },
    ],
    openings: [
      {
        id: "opening-λ",
        x: variant === "ring" ? 1.5 : 2,
        y: 1,
        width: 1,
        height: 1,
        ...(variant === "ring" ? { ringFrame: { profileWidthInPlane: 0.08 } } : {}),
        ...(lintel ? { lintel } : {}),
      },
    ],
  });
}

function analyze(
  root: RuntimeRootModule,
  variant: "basic" | "ring" | "lintel",
  options: JsonRecord = {},
): RuntimeResult {
  const analysis = new root.AlignmentStaticAnalysis();
  return analysis.analyze({ alignment: createAlignment(root, variant), options });
}

void test("AlignmentStaticAnalysis matches the independent pinned JavaScript implementation", async () => {
  assert.equal(gitOutput(sourceRoot, "rev-parse", "HEAD"), sourceRevision);
  assert.equal(gitOutput(sourceRoot, "status", "--porcelain"), "");
  assert.equal(gitOutput(normativeRoot, "rev-parse", "HEAD"), normativeRevision);
  assert.equal(gitOutput(normativeRoot, "status", "--porcelain"), "");

  const sourceRootModule = await loadRootModule(sourceRoot);
  const typescriptRootModule = await loadBuiltRootModule();
  const sourceDirect = await loadDirectModule(
    sourceRoot,
    "src/applications/masonry-wall-openings/analysis/AlignmentStaticAnalysis.js",
  );
  const typescriptDirect = await loadDirectModule(
    path.join(repositoryRoot, "dist"),
    "applications/masonry-wall-openings/analysis/AlignmentStaticAnalysis.js",
  );

  assert.notEqual(sourceDirect.AlignmentStaticAnalysis, typescriptDirect.AlignmentStaticAnalysis);
  assert.equal(sourceRootModule.AlignmentStaticAnalysis, sourceDirect.AlignmentStaticAnalysis);
  assert.equal(
    typescriptRootModule.AlignmentStaticAnalysis,
    typescriptDirect.AlignmentStaticAnalysis,
  );
  assert.notEqual(
    sourceRootModule.AlignmentStaticAnalysis,
    typescriptRootModule.AlignmentStaticAnalysis,
  );

  exactJson(
    analyze(sourceRootModule, "basic"),
    analyze(typescriptRootModule, "basic"),
    "basic static analysis",
  );
  exactJson(
    analyze(sourceRootModule, "ring"),
    analyze(typescriptRootModule, "ring"),
    "ring-frame static analysis",
  );
  exactJson(
    analyze(sourceRootModule, "lintel"),
    analyze(typescriptRootModule, "lintel"),
    "lintel static analysis",
  );

  assertErrorParity(
    () => new sourceRootModule.AlignmentStaticAnalysis().analyze(),
    () => new typescriptRootModule.AlignmentStaticAnalysis().analyze(),
    "missing alignment error",
  );
  assertErrorParity(
    () => analyze(sourceRootModule, "basic", { combinationType: "UNSUPPORTED" }),
    () => analyze(typescriptRootModule, "basic", { combinationType: "UNSUPPORTED" }),
    "unsupported combination error",
  );
});
