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

interface RuntimeCompressionModule {
  readonly calculateSteelCompressionBucklingAxis: (options?: unknown) => unknown;
  readonly inferSteelCompressionBucklingCurves: (section: unknown) => unknown;
  readonly steelBucklingCurveImperfectionFactor: (curve: unknown) => unknown;
  readonly verifySteelCompressionBuckling: (options?: unknown) => unknown;
}

interface RuntimeRootModule {
  readonly calculateSteelCompressionBucklingAxis: unknown;
  readonly inferSteelCompressionBucklingCurves: unknown;
  readonly steelBucklingCurveImperfectionFactor: unknown;
  readonly verifySteelCompressionBuckling: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isCompressionModule(value: unknown): value is RuntimeCompressionModule {
  return (
    isRecord(value) &&
    typeof value.calculateSteelCompressionBucklingAxis === "function" &&
    typeof value.inferSteelCompressionBucklingCurves === "function" &&
    typeof value.steelBucklingCurveImperfectionFactor === "function" &&
    typeof value.verifySteelCompressionBuckling === "function"
  );
}

function isRootModule(value: unknown): value is RuntimeRootModule {
  return (
    isRecord(value) &&
    "calculateSteelCompressionBucklingAxis" in value &&
    "inferSteelCompressionBucklingCurves" in value &&
    "steelBucklingCurveImperfectionFactor" in value &&
    "verifySteelCompressionBuckling" in value
  );
}

async function loadCompressionModule(
  root: string,
  relativePath: string,
): Promise<RuntimeCompressionModule> {
  const module: unknown = await import(pathToFileURL(path.join(root, relativePath)).href);
  if (!isCompressionModule(module)) {
    throw new Error(`The module ${relativePath} does not expose compression buckling checks.`);
  }
  return module;
}

async function loadRootModule(root: string, relativePath: string): Promise<RuntimeRootModule> {
  const module: unknown = await import(pathToFileURL(path.join(root, relativePath)).href);
  if (!isRootModule(module)) {
    throw new Error("The root module does not expose compression buckling checks.");
  }
  return module;
}

function gitOutput(repository: string, ...arguments_: readonly string[]): string {
  return execFileSync("git", ["-C", repository, ...arguments_], { encoding: "utf8" }).trim();
}

function json(value: unknown): string {
  const serialized = JSON.stringify(value);
  if (serialized === undefined) throw new Error("Expected a serializable value.");
  return serialized;
}

function codePoints(value: string): number[] {
  return Array.from(value, (character) => {
    const codePoint = character.codePointAt(0);
    if (codePoint === undefined) throw new Error("Expected a code point for every character.");
    return codePoint;
  });
}

function exactJson(source: unknown, typescript: unknown, label: string): void {
  const sourceJson = json(source);
  const typescriptJson = json(typescript);
  assert.equal(typescriptJson, sourceJson, `${label}: exact JSON`);
  assert.deepEqual(codePoints(typescriptJson), codePoints(sourceJson), `${label}: Unicode`);
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

void test("steel compression buckling matches the independent pinned JavaScript implementation", async () => {
  assert.equal(gitOutput(sourceRoot, "rev-parse", "HEAD"), sourceRevision);
  assert.equal(gitOutput(sourceRoot, "status", "--porcelain"), "");
  assert.equal(gitOutput(normativeRoot, "rev-parse", "HEAD"), normativeRevision);
  assert.equal(gitOutput(normativeRoot, "status", "--porcelain"), "");

  const source = await loadCompressionModule(
    sourceRoot,
    "src/applications/steel-frames/checks/SteelCompressionBuckling.js",
  );
  const typescript = await loadCompressionModule(
    path.join(repositoryRoot, "dist"),
    "applications/steel-frames/checks/SteelCompressionBuckling.js",
  );
  const sourceRootModule = await loadRootModule(sourceRoot, "src/index.js");
  const typescriptRootModule = await loadRootModule(path.join(repositoryRoot, "dist"), "index.js");

  assert.equal(
    sourceRootModule.calculateSteelCompressionBucklingAxis,
    source.calculateSteelCompressionBucklingAxis,
  );
  assert.equal(
    typescriptRootModule.calculateSteelCompressionBucklingAxis,
    typescript.calculateSteelCompressionBucklingAxis,
  );
  assert.equal(
    sourceRootModule.inferSteelCompressionBucklingCurves,
    source.inferSteelCompressionBucklingCurves,
  );
  assert.equal(
    typescriptRootModule.inferSteelCompressionBucklingCurves,
    typescript.inferSteelCompressionBucklingCurves,
  );
  assert.equal(
    sourceRootModule.steelBucklingCurveImperfectionFactor,
    source.steelBucklingCurveImperfectionFactor,
  );
  assert.equal(
    typescriptRootModule.steelBucklingCurveImperfectionFactor,
    typescript.steelBucklingCurveImperfectionFactor,
  );
  assert.equal(
    sourceRootModule.verifySteelCompressionBuckling,
    source.verifySteelCompressionBuckling,
  );
  assert.equal(
    typescriptRootModule.verifySteelCompressionBuckling,
    typescript.verifySteelCompressionBuckling,
  );
  assert.notEqual(source.verifySteelCompressionBuckling, typescript.verifySteelCompressionBuckling);

  const section = {
    family: "IPE",
    area: 2850,
    inertiaY: 19400000,
    inertiaZ: 1420000,
    catalogProperties: { height: 200, width: 100, flangeThickness: 8.5 },
  };
  const material = {
    fyk: 275,
    elasticModulus: 210000,
    metadata: { gammaM1: 1.05 },
  };

  exactJson(
    source.steelBucklingCurveImperfectionFactor(" b "),
    typescript.steelBucklingCurveImperfectionFactor(" b "),
    "imperfection factor",
  );
  exactJson(
    source.steelBucklingCurveImperfectionFactor("unsupported"),
    typescript.steelBucklingCurveImperfectionFactor("unsupported"),
    "unsupported imperfection factor",
  );
  exactJson(
    source.inferSteelCompressionBucklingCurves(section),
    typescript.inferSteelCompressionBucklingCurves(section),
    "I/H curve inference",
  );
  exactJson(
    source.inferSteelCompressionBucklingCurves({ family: "UPN" }),
    typescript.inferSteelCompressionBucklingCurves({ family: "UPN" }),
    "UPN curve inference",
  );
  exactJson(
    source.inferSteelCompressionBucklingCurves({ family: "CHS" }),
    typescript.inferSteelCompressionBucklingCurves({ family: "CHS" }),
    "hollow curve inference",
  );
  exactJson(
    source.inferSteelCompressionBucklingCurves({ family: "L" }),
    typescript.inferSteelCompressionBucklingCurves({ family: "L" }),
    "open unsymmetric curve inference",
  );
  exactJson(
    source.calculateSteelCompressionBucklingAxis({
      area: 2850,
      inertia: 19400000,
      elasticModulus: 210000,
      yieldStrength: 275,
      effectiveLength: 5000,
      gammaM1: 1.05,
      curve: "a",
    }),
    typescript.calculateSteelCompressionBucklingAxis({
      area: 2850,
      inertia: 19400000,
      elasticModulus: 210000,
      yieldStrength: 275,
      effectiveLength: 5000,
      gammaM1: 1.05,
      curve: "a",
    }),
    "compression axis",
  );
  exactJson(
    source.calculateSteelCompressionBucklingAxis({ area: 2850, curve: "a" }),
    typescript.calculateSteelCompressionBucklingAxis({ area: 2850, curve: "a" }),
    "unsupported compression axis",
  );

  const verifyOptions = {
    section,
    material,
    nEd: 50000,
    sectionClass: 1,
    lengthY: 5000,
    lengthZ: 5000,
  };
  exactJson(
    source.verifySteelCompressionBuckling(verifyOptions),
    typescript.verifySteelCompressionBuckling(verifyOptions),
    "compression buckling verification",
  );
  exactJson(
    source.verifySteelCompressionBuckling({
      ...verifyOptions,
      nEd: -50000,
      axialForceConvention: "compression-negative",
    }),
    typescript.verifySteelCompressionBuckling({
      ...verifyOptions,
      nEd: -50000,
      axialForceConvention: "compression-negative",
    }),
    "compression-negative convention",
  );
  exactJson(
    source.verifySteelCompressionBuckling({
      ...verifyOptions,
      section: { family: "UPN-λ", area: 2850 },
    }),
    typescript.verifySteelCompressionBuckling({
      ...verifyOptions,
      section: { family: "UPN-λ", area: 2850 },
    }),
    "unsupported family Unicode warning",
  );
  exactJson(
    source.verifySteelCompressionBuckling({ ...verifyOptions, sectionClass: 4 }),
    typescript.verifySteelCompressionBuckling({ ...verifyOptions, sectionClass: 4 }),
    "class 4 unsupported result",
  );
  exactJson(
    source.verifySteelCompressionBuckling({
      ...verifyOptions,
      section: { family: "L", area: 1000, inertiaY: 1000000, inertiaZ: 400000 },
      allowOpenSectionFlexuralBuckling: true,
    }),
    typescript.verifySteelCompressionBuckling({
      ...verifyOptions,
      section: { family: "L", area: 1000, inertiaY: 1000000, inertiaZ: 400000 },
      allowOpenSectionFlexuralBuckling: true,
    }),
    "open unsymmetric flexural-only result",
  );
  exactJson(
    source.verifySteelCompressionBuckling({ ...verifyOptions, lengthZ: null }),
    typescript.verifySteelCompressionBuckling({ ...verifyOptions, lengthZ: null }),
    "missing effective length result",
  );

  assertErrorParity(
    () => source.calculateSteelCompressionBucklingAxis(null),
    () => typescript.calculateSteelCompressionBucklingAxis(null),
    "null axis options error",
  );
  assertErrorParity(
    () => source.verifySteelCompressionBuckling(null),
    () => typescript.verifySteelCompressionBuckling(null),
    "null verification options error",
  );
});
