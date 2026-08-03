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

type InputRecord = Record<string, unknown>;

interface RuntimePolicyModule {
  readonly compressionAxialForce: (value: unknown, convention?: unknown) => unknown;
  readonly normalizeCombinationType: (value: unknown) => unknown;
  readonly designStrength: (material: unknown, gammaM0: unknown) => unknown;
  readonly selectBendingResistanceBasis: (input: unknown) => unknown;
  readonly createLtbSegments: (input: unknown) => unknown;
  readonly resolveCompressionBucklingLengths: (input: unknown) => unknown;
  readonly createDeflectionChecks: (input: unknown) => unknown;
  readonly createLateralTorsionalBucklingChecks: (input: unknown) => unknown;
  readonly createCompressionBucklingChecks: (input: unknown) => unknown;
  readonly createBeamColumnInteractionChecks: (input: unknown) => unknown;
  readonly ltbReductionForInteraction: (input: unknown) => unknown;
  readonly createSteelActionVerifier: (input: unknown) => unknown;
}

interface RuntimeUnitModule {
  readonly createUnitResolver: (source: unknown, target: unknown) => unknown;
}

interface RuntimeActionVerifier {
  readonly verifySectionActions: (input: unknown) => unknown;
}

function isRecord(value: unknown): value is InputRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isRuntimePolicyModule(value: unknown): value is RuntimePolicyModule {
  if (!isRecord(value)) return false;
  return [
    "compressionAxialForce",
    "normalizeCombinationType",
    "designStrength",
    "selectBendingResistanceBasis",
    "createLtbSegments",
    "resolveCompressionBucklingLengths",
    "createDeflectionChecks",
    "createLateralTorsionalBucklingChecks",
    "createCompressionBucklingChecks",
    "createBeamColumnInteractionChecks",
    "ltbReductionForInteraction",
    "createSteelActionVerifier",
  ].every((name) => typeof value[name] === "function");
}

function isRuntimeUnitModule(value: unknown): value is RuntimeUnitModule {
  return isRecord(value) && typeof value.createUnitResolver === "function";
}

function isRuntimeActionVerifier(value: unknown): value is RuntimeActionVerifier {
  return isRecord(value) && typeof value.verifySectionActions === "function";
}

async function loadPolicyModule(root: string, sourceModule: boolean): Promise<RuntimePolicyModule> {
  const module: unknown = await import(
    pathToFileURL(
      path.join(
        root,
        sourceModule
          ? "src/applications/steel-frames/checks/SteelMemberVerificationPolicies.js"
          : "applications/steel-frames/checks/SteelMemberVerificationPolicies.js",
      ),
    ).href
  );
  if (!isRuntimePolicyModule(module)) throw new Error("The policy module is incomplete.");
  return module;
}

async function loadUnitModule(root: string, sourceModule: boolean): Promise<RuntimeUnitModule> {
  const module: unknown = await import(
    pathToFileURL(
      path.join(
        root,
        sourceModule ? "src/domain/units/UnitSystem.js" : "domain/units/UnitSystem.js",
      ),
    ).href
  );
  if (!isRuntimeUnitModule(module)) throw new Error("The unit module is incomplete.");
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

function exactJson(source: unknown, typescript: unknown, label: string): void {
  const sourceJson = json(source);
  const typescriptJson = json(typescript);
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

void test("steel member verification policies match the independent pinned JavaScript implementation", async () => {
  assert.equal(gitOutput(sourceRoot, "rev-parse", "HEAD"), sourceRevision);
  assert.equal(gitOutput(sourceRoot, "status", "--porcelain"), "");
  assert.equal(gitOutput(normativeRoot, "rev-parse", "HEAD"), normativeRevision);
  assert.equal(gitOutput(normativeRoot, "status", "--porcelain"), "");

  const source = await loadPolicyModule(sourceRoot, true);
  const typescript = await loadPolicyModule(path.join(repositoryRoot, "dist"), false);
  const sourceUnits = await loadUnitModule(sourceRoot, true);
  const typescriptUnits = await loadUnitModule(path.join(repositoryRoot, "dist"), false);
  const sourceResolver = sourceUnits.createUnitResolver(
    { force: "N", length: "mm" },
    { force: "N", length: "mm" },
  );
  const typescriptResolver = typescriptUnits.createUnitResolver(
    { force: "N", length: "mm" },
    { force: "N", length: "mm" },
  );

  assert.notEqual(source.createSteelActionVerifier, typescript.createSteelActionVerifier);
  exactJson(
    source.compressionAxialForce(-125, "compression-negative"),
    typescript.compressionAxialForce(-125, "compression-negative"),
    "compression convention",
  );
  exactJson(
    source.normalizeCombinationType("rare-λ"),
    typescript.normalizeCombinationType("rare-λ"),
    "combination type Unicode normalization",
  );
  exactJson(
    source.designStrength({ fyk: 275 }, 1.05),
    typescript.designStrength({ fyk: 275 }, 1.05),
    "design strength",
  );
  exactJson(
    source.selectBendingResistanceBasis({
      classificationResult: { class: 1 },
      elasticSectionModulus: 100,
      plasticSectionModulus: 120,
    }),
    typescript.selectBendingResistanceBasis({
      classificationResult: { class: 1 },
      elasticSectionModulus: 100,
      plasticSectionModulus: 120,
    }),
    "bending resistance basis",
  );

  const result = {
    id: "ULS-λ",
    geometry: { length: 6000 },
    context: { limitState: "ULS", combinationType: "fundamental" },
    internalForces: {
      samples: [
        { station: 0, n: 100000, mY: 20e6, mZ: 2e6 },
        { station: 6000, n: 120000, mY: -40e6, mZ: -1e6 },
      ],
    },
    supports: [
      { station: 0, restraints: { rz: false } },
      { station: 6000, restraints: { rz: false } },
    ],
  };
  const segmentsInput = { result, options: { segments: [{ from: 0, to: 3000 }] } };
  exactJson(
    source.createLtbSegments(segmentsInput),
    typescript.createLtbSegments(segmentsInput),
    "LTB segment defaults",
  );
  const lengthsInput = {
    result,
    options: { lengthY: 6000, lengthZ: 6000, effectiveLengthFactorY: 1, effectiveLengthFactorZ: 1 },
    resultToSectionUnits: sourceResolver,
  };
  const lengthsInputTypescript = { ...lengthsInput, resultToSectionUnits: typescriptResolver };
  exactJson(
    source.resolveCompressionBucklingLengths(lengthsInput),
    typescript.resolveCompressionBucklingLengths(lengthsInputTypescript),
    "compression length inference",
  );
  const deflectionInput = {
    analysisResult: {
      combinations: {
        SLE: {
          id: "SLE-λ",
          context: { limitState: "SLE", combinationType: "rare" },
          geometry: { length: 6000 },
          displacements: { maxAbsVerticalDisplacement: { station: 3000, uy: -12 } },
        },
      },
    },
    deflectionLimitRatio: 300,
  };
  exactJson(
    source.createDeflectionChecks(deflectionInput),
    typescript.createDeflectionChecks(deflectionInput),
    "serviceability deflection checks",
  );

  const section = {
    family: "IPE",
    area: 2600,
    height: 200,
    width: 100,
    webThickness: 5.6,
    flangeThickness: 8.5,
    rootRadius: 12,
    elasticSectionModulusY: 194000,
    plasticSectionModulusY: 220000,
    elasticSectionModulusZ: 23000,
    plasticSectionModulusZ: 35000,
    shearAreaY: 1300,
    shearAreaZ: 800,
  };
  const material = { fyk: 275, metadata: { gammaM0: 1.05 } };
  const disabledPolicyInput = {
    analysisResult: { combinations: {} },
    section,
    material,
    resultToSectionUnits: sourceResolver,
    sectionToResultUnits: sourceResolver,
    stability: {
      ltb: { enabled: false },
      buckling: { enabled: false },
      interaction: { enabled: false },
    },
  };
  const disabledPolicyInputTypescript = {
    ...disabledPolicyInput,
    resultToSectionUnits: typescriptResolver,
    sectionToResultUnits: typescriptResolver,
  };
  exactJson(
    source.createLateralTorsionalBucklingChecks(disabledPolicyInput),
    typescript.createLateralTorsionalBucklingChecks(disabledPolicyInputTypescript),
    "disabled LTB policy",
  );
  exactJson(
    source.createCompressionBucklingChecks(disabledPolicyInput),
    typescript.createCompressionBucklingChecks(disabledPolicyInputTypescript),
    "disabled compression policy",
  );
  exactJson(
    source.createBeamColumnInteractionChecks(disabledPolicyInput),
    typescript.createBeamColumnInteractionChecks(disabledPolicyInputTypescript),
    "disabled interaction policy",
  );

  const sourceVerifier = source.createSteelActionVerifier({
    section,
    material,
    sectionToResultUnits: sourceResolver,
    resultToSectionUnits: sourceResolver,
  });
  const typescriptVerifier = typescript.createSteelActionVerifier({
    section,
    material,
    sectionToResultUnits: typescriptResolver,
    resultToSectionUnits: typescriptResolver,
  });
  assert.ok(isRuntimeActionVerifier(sourceVerifier));
  assert.ok(isRuntimeActionVerifier(typescriptVerifier));
  const sourceVerify = sourceVerifier.verifySectionActions({
    nEd: 100000,
    vEd: 40000,
    mEd: 30e6,
    context: { sectionProperties: { metadata: {} } },
  });
  const typescriptVerify = typescriptVerifier.verifySectionActions({
    nEd: 100000,
    vEd: 40000,
    mEd: 30e6,
    context: { sectionProperties: { metadata: {} } },
  });
  exactJson(sourceVerify, typescriptVerify, "section-action policy result");

  assert.deepEqual(
    errorSnapshot(() => source.createSteelActionVerifier(null)),
    errorSnapshot(() => typescript.createSteelActionVerifier(null)),
    "null policy options error",
  );
});
