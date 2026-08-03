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

interface RuntimeModule extends JsonRecord {
  readonly calculateTimberLateralBucklingReduction: (value?: number | null) => unknown;
  readonly calculateTimberRectangularCriticalBendingStress: (input?: unknown) => unknown;
  readonly verifyTimberLateralTorsionalStability: (input?: unknown) => unknown;
}

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isRuntimeModule(value: unknown): value is RuntimeModule {
  return (
    isRecord(value) &&
    typeof value.calculateTimberLateralBucklingReduction === "function" &&
    typeof value.calculateTimberRectangularCriticalBendingStress === "function" &&
    typeof value.verifyTimberLateralTorsionalStability === "function"
  );
}

function gitOutput(repository: string, ...arguments_: readonly string[]): string {
  return execFileSync("git", ["-C", repository, ...arguments_], { encoding: "utf8" }).trim();
}

async function loadRootModule(root: string): Promise<RuntimeModule> {
  const module: unknown = await import(pathToFileURL(path.join(root, "src", "index.js")).href);
  if (!isRuntimeModule(module)) {
    throw new Error("Missing timber lateral-torsional root exports.");
  }
  return module;
}

async function loadBuiltRootModule(): Promise<RuntimeModule> {
  const module: unknown = await import(
    pathToFileURL(path.join(repositoryRoot, "dist", "index.js")).href
  );
  if (!isRuntimeModule(module)) {
    throw new Error("Missing built timber lateral-torsional root exports.");
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

function verificationInput(): JsonRecord {
  const lambda = String.fromCodePoint(0x3bb);
  return {
    section: {
      metadata: { shape: "rectangular" },
      width: 100,
      height: 200,
      elasticSectionModulusY: 666666.6667,
      elasticSectionModulusZ: 333333.3333,
    },
    material: {
      fmK: 24,
      elasticModulus: 11000,
      metadata: { label: lambda },
    },
    myEd: 1000,
    mzEd: 100,
    unbracedLength: 2000,
    fmD: 12,
    fmK: 24,
    metadata: { label: lambda },
  };
}

void test("0207 timber lateral-torsional stability matches the pinned JavaScript implementation", async () => {
  assert.equal(gitOutput(sourceRoot, "rev-parse", "HEAD"), sourceRevision);
  assert.equal(gitOutput(sourceRoot, "status", "--porcelain"), "");
  assert.equal(gitOutput(normativeRoot, "rev-parse", "HEAD"), normativeRevision);
  assert.equal(gitOutput(normativeRoot, "status", "--porcelain"), "");

  const sourceRootModule = await loadRootModule(sourceRoot);
  const typescriptRootModule = await loadBuiltRootModule();
  const sourceDirect = await loadDirectModule(
    sourceRoot,
    "src/applications/timber-beams/checks/TimberLateralTorsionalStability.js",
  );
  const typescriptDirect = await loadDirectModule(
    path.join(repositoryRoot, "dist"),
    "applications/timber-beams/checks/TimberLateralTorsionalStability.js",
  );

  assert.notEqual(
    sourceDirect.calculateTimberLateralBucklingReduction,
    typescriptDirect.calculateTimberLateralBucklingReduction,
  );
  assert.equal(
    typescriptRootModule.verifyTimberLateralTorsionalStability,
    typescriptDirect.verifyTimberLateralTorsionalStability,
  );

  for (const value of [0, 0.75, 1.2, 1.4, 2, null]) {
    exactJson(
      sourceRootModule.calculateTimberLateralBucklingReduction(value),
      typescriptRootModule.calculateTimberLateralBucklingReduction(value),
      `buckling reduction ${String(value)}`,
    );
  }
  exactJson(
    sourceRootModule.calculateTimberRectangularCriticalBendingStress({
      width: 100,
      height: 200,
      effectiveLength: 2000,
      e0_05: 7333.333333,
    }),
    typescriptRootModule.calculateTimberRectangularCriticalBendingStress({
      width: 100,
      height: 200,
      effectiveLength: 2000,
      e0_05: 7333.333333,
    }),
    "rectangular critical stress",
  );
  exactJson(
    sourceRootModule.verifyTimberLateralTorsionalStability(verificationInput()),
    typescriptRootModule.verifyTimberLateralTorsionalStability(verificationInput()),
    "automatic rectangular LTB",
  );
  exactJson(
    sourceRootModule.verifyTimberLateralTorsionalStability({
      ...verificationInput(),
      kcrit: 1.2,
      metadata: { label: String.fromCodePoint(0x3bb) },
    }),
    typescriptRootModule.verifyTimberLateralTorsionalStability({
      ...verificationInput(),
      kcrit: 1.2,
      metadata: { label: String.fromCodePoint(0x3bb) },
    }),
    "user-provided capped kcrit",
  );
  exactJson(
    sourceRootModule.verifyTimberLateralTorsionalStability({}),
    typescriptRootModule.verifyTimberLateralTorsionalStability({}),
    "unsupported missing strengths",
  );
  exactJson(
    sourceRootModule.calculateTimberRectangularCriticalBendingStress({ width: Symbol("λ") }),
    typescriptRootModule.calculateTimberRectangularCriticalBendingStress({ width: Symbol("λ") }),
    "unsupported symbol input",
  );
});
