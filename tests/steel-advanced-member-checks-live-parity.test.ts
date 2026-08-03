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

interface RuntimeAdvancedModule {
  readonly calculateSteelMomentDiagramFactor: (
    samples: unknown,
    axis?: unknown,
    segment?: unknown,
  ) => unknown;
  readonly steelNotSupportedCheck: (options: unknown) => unknown;
  readonly verifySteelBendingShearInteraction: (options?: unknown) => unknown;
  readonly verifySteelConcentratedWebLoad: (options?: unknown) => unknown;
  readonly verifySteelShearTorsionInteraction: (options?: unknown) => unknown;
  readonly verifySteelWebShearBuckling: (options?: unknown) => unknown;
}

interface RuntimeRootModule {
  readonly calculateSteelMomentDiagramFactor: unknown;
  readonly steelNotSupportedCheck: unknown;
  readonly verifySteelBendingShearInteraction: unknown;
  readonly verifySteelConcentratedWebLoad: unknown;
  readonly verifySteelShearTorsionInteraction: unknown;
  readonly verifySteelWebShearBuckling: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isModule(value: unknown): value is RuntimeAdvancedModule {
  return (
    isRecord(value) &&
    typeof value.calculateSteelMomentDiagramFactor === "function" &&
    typeof value.steelNotSupportedCheck === "function" &&
    typeof value.verifySteelBendingShearInteraction === "function" &&
    typeof value.verifySteelConcentratedWebLoad === "function" &&
    typeof value.verifySteelShearTorsionInteraction === "function" &&
    typeof value.verifySteelWebShearBuckling === "function"
  );
}

function isRootModule(value: unknown): value is RuntimeRootModule {
  return (
    isRecord(value) &&
    "calculateSteelMomentDiagramFactor" in value &&
    "steelNotSupportedCheck" in value &&
    "verifySteelBendingShearInteraction" in value &&
    "verifySteelConcentratedWebLoad" in value &&
    "verifySteelShearTorsionInteraction" in value &&
    "verifySteelWebShearBuckling" in value
  );
}

async function loadAdvancedModule(
  root: string,
  relativePath: string,
): Promise<RuntimeAdvancedModule> {
  const module: unknown = await import(pathToFileURL(path.join(root, relativePath)).href);
  if (!isModule(module)) {
    throw new Error(`The module ${relativePath} does not expose the steel advanced checks.`);
  }
  return module;
}

async function loadRootModule(root: string, relativePath: string): Promise<RuntimeRootModule> {
  const module: unknown = await import(pathToFileURL(path.join(root, relativePath)).href);
  if (!isRootModule(module)) {
    throw new Error("The root module does not expose the steel advanced checks.");
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

void test("steel advanced member checks match the independent pinned JavaScript implementation", async () => {
  assert.equal(gitOutput(sourceRoot, "rev-parse", "HEAD"), sourceRevision);
  assert.equal(gitOutput(sourceRoot, "status", "--porcelain"), "");
  assert.equal(gitOutput(normativeRoot, "rev-parse", "HEAD"), normativeRevision);
  assert.equal(gitOutput(normativeRoot, "status", "--porcelain"), "");

  const source = await loadAdvancedModule(
    sourceRoot,
    "src/applications/steel-frames/checks/SteelAdvancedMemberChecks.js",
  );
  const typescript = await loadAdvancedModule(
    path.join(repositoryRoot, "dist"),
    "applications/steel-frames/checks/SteelAdvancedMemberChecks.js",
  );
  const sourceRootModule = await loadRootModule(sourceRoot, "src/index.js");
  const typescriptRootModule = await loadRootModule(path.join(repositoryRoot, "dist"), "index.js");

  assert.equal(
    sourceRootModule.calculateSteelMomentDiagramFactor,
    source.calculateSteelMomentDiagramFactor,
  );
  assert.equal(
    typescriptRootModule.calculateSteelMomentDiagramFactor,
    typescript.calculateSteelMomentDiagramFactor,
  );
  assert.equal(sourceRootModule.steelNotSupportedCheck, source.steelNotSupportedCheck);
  assert.equal(typescriptRootModule.steelNotSupportedCheck, typescript.steelNotSupportedCheck);
  assert.equal(
    sourceRootModule.verifySteelBendingShearInteraction,
    source.verifySteelBendingShearInteraction,
  );
  assert.equal(
    typescriptRootModule.verifySteelBendingShearInteraction,
    typescript.verifySteelBendingShearInteraction,
  );
  assert.equal(
    sourceRootModule.verifySteelConcentratedWebLoad,
    source.verifySteelConcentratedWebLoad,
  );
  assert.equal(
    typescriptRootModule.verifySteelConcentratedWebLoad,
    typescript.verifySteelConcentratedWebLoad,
  );
  assert.equal(
    sourceRootModule.verifySteelShearTorsionInteraction,
    source.verifySteelShearTorsionInteraction,
  );
  assert.equal(
    typescriptRootModule.verifySteelShearTorsionInteraction,
    typescript.verifySteelShearTorsionInteraction,
  );
  assert.equal(sourceRootModule.verifySteelWebShearBuckling, source.verifySteelWebShearBuckling);
  assert.equal(
    typescriptRootModule.verifySteelWebShearBuckling,
    typescript.verifySteelWebShearBuckling,
  );
  assert.notEqual(source.steelNotSupportedCheck, typescript.steelNotSupportedCheck);

  const section = {
    family: "IPE",
    height: 300,
    width: 150,
    webThickness: 6.8,
    flangeThickness: 10.7,
    rootRadius: 15,
    plasticSectionModulusY: 628000,
    shearAreaY: 2040,
    torsionalSectionModulus: 14000,
  };
  const hollowSection = {
    family: "CHS",
    torsionalSectionModulus: 24000,
  };
  const material = {
    fyk: 355,
    E: 210000,
    metadata: { gammaM0: 1, gammaM1: 1.1 },
  };
  const panel = { id: "p-λ", length: 1.2, endPost: "rigid" };
  const samples = [
    { station: 0, actions: { My: 120, Mz: -40 } },
    { station: 0.5, actions: { My: 180, Mz: 20 } },
    { station: 1, actions: { My: -60, Mz: 10 } },
  ];

  const notSupportedOptions = {
    id: "check-λ",
    description: "Verifica non disponibile é",
    missingInputs: ["geometria §", "materiale α"],
    reference: "NTC 2018 §4.2",
    metadata: { label: "resistenza é" },
    warnings: ["dati mancanti λ"],
  };
  exactJson(
    source.steelNotSupportedCheck(notSupportedOptions),
    typescript.steelNotSupportedCheck(notSupportedOptions),
    "not-supported result",
  );
  exactJson(
    source.calculateSteelMomentDiagramFactor(samples, "My", { from: 0, to: 1 }),
    typescript.calculateSteelMomentDiagramFactor(samples, "My", { from: 0, to: 1 }),
    "My moment diagram factor",
  );
  exactJson(
    source.calculateSteelMomentDiagramFactor(samples, "Mz", { from: 0.5, to: 1 }),
    typescript.calculateSteelMomentDiagramFactor(samples, "Mz", { from: 0.5, to: 1 }),
    "Mz segmented moment diagram factor",
  );
  exactJson(
    source.calculateSteelMomentDiagramFactor([
      { station: 0, My: 0 },
      { station: 1, My: 0 },
    ]),
    typescript.calculateSteelMomentDiagramFactor([
      { station: 0, My: 0 },
      { station: 1, My: 0 },
    ]),
    "zero moment diagram factor",
  );
  exactJson(
    source.verifySteelWebShearBuckling({ section, material, vEd: 600, panel }),
    typescript.verifySteelWebShearBuckling({ section, material, vEd: 600, panel }),
    "web shear buckling",
  );
  exactJson(
    source.verifySteelWebShearBuckling({ section: { family: "CHS" }, material, panel }),
    typescript.verifySteelWebShearBuckling({ section: { family: "CHS" }, material, panel }),
    "unsupported web shear buckling",
  );
  exactJson(
    source.verifySteelConcentratedWebLoad({
      section,
      material,
      load: { id: "load-λ", bearingLength: 0.12, force: 180, loadType: "internal" },
      panel,
    }),
    typescript.verifySteelConcentratedWebLoad({
      section,
      material,
      load: { id: "load-λ", bearingLength: 0.12, force: 180, loadType: "internal" },
      panel,
    }),
    "concentrated web load",
  );
  exactJson(
    source.verifySteelConcentratedWebLoad({ section: { family: "HEA" }, material, panel }),
    typescript.verifySteelConcentratedWebLoad({ section: { family: "HEA" }, material, panel }),
    "unsupported concentrated web load",
  );
  exactJson(
    source.verifySteelBendingShearInteraction({
      section,
      material,
      mEd: 320,
      vEd: 60,
      bendingCapacity: 500,
      shearCapacity: 80,
    }),
    typescript.verifySteelBendingShearInteraction({
      section,
      material,
      mEd: 320,
      vEd: 60,
      bendingCapacity: 500,
      shearCapacity: 80,
    }),
    "bending-shear interaction",
  );
  exactJson(
    source.verifySteelBendingShearInteraction({ bendingCapacity: 0, shearCapacity: 80 }),
    typescript.verifySteelBendingShearInteraction({ bendingCapacity: 0, shearCapacity: 80 }),
    "unsupported bending-shear interaction",
  );
  exactJson(
    source.verifySteelShearTorsionInteraction({
      section,
      material,
      vEd: 30,
      tEd: 600,
      shearCapacity: 80,
    }),
    typescript.verifySteelShearTorsionInteraction({
      section,
      material,
      vEd: 30,
      tEd: 600,
      shearCapacity: 80,
    }),
    "I/H shear-torsion interaction",
  );
  exactJson(
    source.verifySteelShearTorsionInteraction({
      section: hollowSection,
      material,
      vEd: 30,
      tEd: 600,
      shearCapacity: 80,
    }),
    typescript.verifySteelShearTorsionInteraction({
      section: hollowSection,
      material,
      vEd: 30,
      tEd: 600,
      shearCapacity: 80,
    }),
    "hollow-section shear-torsion interaction",
  );
  exactJson(
    source.verifySteelShearTorsionInteraction({ section: {}, material, shearCapacity: 80 }),
    typescript.verifySteelShearTorsionInteraction({ section: {}, material, shearCapacity: 80 }),
    "unsupported shear-torsion interaction",
  );

  assertErrorParity(
    () => source.calculateSteelMomentDiagramFactor(null),
    () => typescript.calculateSteelMomentDiagramFactor(null),
    "invalid moment sample input error",
  );
  assertErrorParity(
    () => source.steelNotSupportedCheck(null),
    () => typescript.steelNotSupportedCheck(null),
    "invalid unsupported-check input error",
  );
});
