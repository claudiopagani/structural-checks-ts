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

interface RuntimeBeamColumnModule {
  readonly calculateSteelMethodBInteractionCoefficients: (options?: unknown) => unknown;
  readonly calculateSteelMethodBInteractionCoefficientsMyMz: (options?: unknown) => unknown;
  readonly verifySteelBeamColumnInteractionMy: (options?: unknown) => unknown;
  readonly verifySteelBeamColumnInteractionMyMz: (options?: unknown) => unknown;
}

interface RuntimeRootModule {
  readonly calculateSteelMethodBInteractionCoefficients: unknown;
  readonly calculateSteelMethodBInteractionCoefficientsMyMz: unknown;
  readonly verifySteelBeamColumnInteractionMy: unknown;
  readonly verifySteelBeamColumnInteractionMyMz: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isBeamColumnModule(value: unknown): value is RuntimeBeamColumnModule {
  return (
    isRecord(value) &&
    typeof value.calculateSteelMethodBInteractionCoefficients === "function" &&
    typeof value.calculateSteelMethodBInteractionCoefficientsMyMz === "function" &&
    typeof value.verifySteelBeamColumnInteractionMy === "function" &&
    typeof value.verifySteelBeamColumnInteractionMyMz === "function"
  );
}

function isRootModule(value: unknown): value is RuntimeRootModule {
  return (
    isRecord(value) &&
    "calculateSteelMethodBInteractionCoefficients" in value &&
    "calculateSteelMethodBInteractionCoefficientsMyMz" in value &&
    "verifySteelBeamColumnInteractionMy" in value &&
    "verifySteelBeamColumnInteractionMyMz" in value
  );
}

async function loadBeamColumnModule(
  root: string,
  relativePath: string,
): Promise<RuntimeBeamColumnModule> {
  const module: unknown = await import(pathToFileURL(path.join(root, relativePath)).href);
  if (!isBeamColumnModule(module)) {
    throw new Error(`The module ${relativePath} does not expose beam-column interaction checks.`);
  }
  return module;
}

async function loadRootModule(root: string, relativePath: string): Promise<RuntimeRootModule> {
  const module: unknown = await import(pathToFileURL(path.join(root, relativePath)).href);
  if (!isRootModule(module)) {
    throw new Error("The root module does not expose beam-column interaction checks.");
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

void test("steel beam-column interaction matches the independent pinned JavaScript implementation", async () => {
  assert.equal(gitOutput(sourceRoot, "rev-parse", "HEAD"), sourceRevision);
  assert.equal(gitOutput(sourceRoot, "status", "--porcelain"), "");
  assert.equal(gitOutput(normativeRoot, "rev-parse", "HEAD"), normativeRevision);
  assert.equal(gitOutput(normativeRoot, "status", "--porcelain"), "");

  const source = await loadBeamColumnModule(
    sourceRoot,
    "src/applications/steel-frames/checks/SteelBeamColumnInteraction.js",
  );
  const typescript = await loadBeamColumnModule(
    path.join(repositoryRoot, "dist"),
    "applications/steel-frames/checks/SteelBeamColumnInteraction.js",
  );
  const sourceRootModule = await loadRootModule(sourceRoot, "src/index.js");
  const typescriptRootModule = await loadRootModule(path.join(repositoryRoot, "dist"), "index.js");

  assert.equal(
    sourceRootModule.calculateSteelMethodBInteractionCoefficients,
    source.calculateSteelMethodBInteractionCoefficients,
  );
  assert.equal(
    typescriptRootModule.calculateSteelMethodBInteractionCoefficients,
    typescript.calculateSteelMethodBInteractionCoefficients,
  );
  assert.equal(
    sourceRootModule.calculateSteelMethodBInteractionCoefficientsMyMz,
    source.calculateSteelMethodBInteractionCoefficientsMyMz,
  );
  assert.equal(
    typescriptRootModule.calculateSteelMethodBInteractionCoefficientsMyMz,
    typescript.calculateSteelMethodBInteractionCoefficientsMyMz,
  );
  assert.equal(
    sourceRootModule.verifySteelBeamColumnInteractionMy,
    source.verifySteelBeamColumnInteractionMy,
  );
  assert.equal(
    typescriptRootModule.verifySteelBeamColumnInteractionMy,
    typescript.verifySteelBeamColumnInteractionMy,
  );
  assert.equal(
    sourceRootModule.verifySteelBeamColumnInteractionMyMz,
    source.verifySteelBeamColumnInteractionMyMz,
  );
  assert.equal(
    typescriptRootModule.verifySteelBeamColumnInteractionMyMz,
    typescript.verifySteelBeamColumnInteractionMyMz,
  );
  assert.notEqual(
    source.verifySteelBeamColumnInteractionMy,
    typescript.verifySteelBeamColumnInteractionMy,
  );

  const section = { family: "IPE", area: 2850 };
  const material = { fyk: 275, metadata: { gammaM1: 1.05 } };
  const compressionBucklingResult = {
    axisResults: {
      y: { reductionFactor: 0.82, relativeSlenderness: 0.78 },
      z: { reductionFactor: 0.61, relativeSlenderness: 1.05 },
    },
  };
  const uniaxialOptions = {
    section,
    material,
    nEd: 50000,
    myEd: 10000000,
    sectionClass: 1,
    bendingSectionModulus: 220000,
    compressionBucklingResult,
    chiLT: 1,
    alphaMy: 0.8,
    alphaMLT: 0.8,
  };
  const biaxialOptions = {
    ...uniaxialOptions,
    mzEd: 2000000,
    bendingSectionModulusY: 220000,
    bendingSectionModulusZ: 50000,
    alphaMz: 0.9,
  };

  exactJson(
    source.calculateSteelMethodBInteractionCoefficients({
      sectionClass: 1,
      relativeSlendernessY: 0.78,
      relativeSlendernessZ: 1.05,
      axialRatioY: 0.1,
      axialRatioZ: 0.15,
      alphaMy: 0.8,
      alphaMLT: 0.8,
    }),
    typescript.calculateSteelMethodBInteractionCoefficients({
      sectionClass: 1,
      relativeSlendernessY: 0.78,
      relativeSlendernessZ: 1.05,
      axialRatioY: 0.1,
      axialRatioZ: 0.15,
      alphaMy: 0.8,
      alphaMLT: 0.8,
    }),
    "uniaxial Method B coefficients",
  );
  exactJson(
    source.calculateSteelMethodBInteractionCoefficientsMyMz({
      sectionClass: 1,
      relativeSlendernessY: 0.78,
      relativeSlendernessZ: 1.05,
      axialRatioY: 0.1,
      axialRatioZ: 0.15,
      alphaMy: 0.8,
      alphaMz: 0.9,
      alphaMLT: 0.8,
    }),
    typescript.calculateSteelMethodBInteractionCoefficientsMyMz({
      sectionClass: 1,
      relativeSlendernessY: 0.78,
      relativeSlendernessZ: 1.05,
      axialRatioY: 0.1,
      axialRatioZ: 0.15,
      alphaMy: 0.8,
      alphaMz: 0.9,
      alphaMLT: 0.8,
    }),
    "biaxial Method B coefficients",
  );
  exactJson(
    source.verifySteelBeamColumnInteractionMy(uniaxialOptions),
    typescript.verifySteelBeamColumnInteractionMy(uniaxialOptions),
    "N+My interaction",
  );
  exactJson(
    source.verifySteelBeamColumnInteractionMyMz(biaxialOptions),
    typescript.verifySteelBeamColumnInteractionMyMz(biaxialOptions),
    "N+My+Mz interaction",
  );
  exactJson(
    source.verifySteelBeamColumnInteractionMy({
      ...uniaxialOptions,
      section: { family: "UPN-λ", area: 2850 },
    }),
    typescript.verifySteelBeamColumnInteractionMy({
      ...uniaxialOptions,
      section: { family: "UPN-λ", area: 2850 },
    }),
    "unsupported family Unicode warning",
  );
  exactJson(
    source.verifySteelBeamColumnInteractionMyMz({ ...biaxialOptions, sectionClass: 4 }),
    typescript.verifySteelBeamColumnInteractionMyMz({ ...biaxialOptions, sectionClass: 4 }),
    "class 4 unsupported interaction",
  );
  exactJson(
    source.verifySteelBeamColumnInteractionMy({ section, material }),
    typescript.verifySteelBeamColumnInteractionMy({ section, material }),
    "missing buckling result",
  );
  exactJson(
    source.verifySteelBeamColumnInteractionMy({
      ...uniaxialOptions,
      nEd: -50000,
      axialForceConvention: "compression-negative",
    }),
    typescript.verifySteelBeamColumnInteractionMy({
      ...uniaxialOptions,
      nEd: -50000,
      axialForceConvention: "compression-negative",
    }),
    "compression-negative convention",
  );
  exactJson(
    source.calculateSteelMethodBInteractionCoefficients({ alphaMLT: 0.25 }),
    typescript.calculateSteelMethodBInteractionCoefficients({ alphaMLT: 0.25 }),
    "invalid coefficient denominator",
  );

  assertErrorParity(
    () => source.calculateSteelMethodBInteractionCoefficients(null),
    () => typescript.calculateSteelMethodBInteractionCoefficients(null),
    "null uniaxial coefficient options error",
  );
  assertErrorParity(
    () => source.verifySteelBeamColumnInteractionMy(null),
    () => typescript.verifySteelBeamColumnInteractionMy(null),
    "null uniaxial interaction options error",
  );
});
