import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { ExistingMasonryMaterial, NTC2018ExistingMasonryMaterial } from "../dist/index.js";
import type {
  Ntc2018ExistingMasonryAvailableModifier,
  Ntc2018ExistingMasonryMaterialOptions,
  Ntc2018ExistingMasonryMultiplierSet,
  Ntc2018ExistingMasonryTypology,
} from "../dist/index.js";
import * as targetModule from "../dist/norms/ntc2018/materials/NTC2018ExistingMasonryMaterial.js";

const sourceRevision = "6f33baead8b88166c4b2cf94af41763412e3c751";
const normativeRevision = "41da3faa489600173106935bbcf726119300e48d";
const repositoryRoot = path.resolve(import.meta.dirname, "..");
const sourceRoot = path.resolve(repositoryRoot, "..", "strutture-js");
const normativeRoot = path.resolve(repositoryRoot, "..", "strutture-normative");
const sourceModulePath = path.join(
  sourceRoot,
  "src",
  "norms",
  "ntc2018",
  "materials",
  "NTC2018ExistingMasonryMaterial.js",
);
const sourceBaseModulePath = path.join(
  sourceRoot,
  "src",
  "domain",
  "materials",
  "ExistingMasonryMaterial.js",
);
const sourceIndexPath = path.join(sourceRoot, "src", "index.js");

const sourceModule = (await import(pathToFileURL(sourceModulePath).href)) as Record<
  string,
  unknown
>;
const sourceBaseModule = (await import(pathToFileURL(sourceBaseModulePath).href)) as Record<
  string,
  unknown
>;
const sourceIndex = (await import(pathToFileURL(sourceIndexPath).href)) as Record<string, unknown>;

type MaterialInstance = {
  toJSON: () => unknown;
  adjustedProperty: (propertyName: string) => unknown;
  adjustedProperties: () => unknown;
  stateOfFactPropertiesJSON: () => unknown;
  originalPropertiesJSON: () => unknown;
  masonryTypology: Ntc2018ExistingMasonryTypology;
  availableModifiers: Ntc2018ExistingMasonryAvailableModifier[];
  modifierSelections: Record<string, unknown>;
};

type Constructor = new (options: Record<string, unknown>) => MaterialInstance;

type MaterialConstructor = Constructor & {
  mergeLegacySelections: (
    surveyFactors?: Record<string, unknown>,
    improvementFactors?: Record<string, unknown>,
  ) => Record<string, unknown>;
  buildAvailableModifiers: (
    typology: Ntc2018ExistingMasonryTypology,
    selections: Record<string, unknown>,
  ) => Ntc2018ExistingMasonryAvailableModifier[];
  validateModifierSelections: (
    selections: Record<string, unknown>,
    availableModifiers: Ntc2018ExistingMasonryAvailableModifier[],
  ) => void;
  computeStateOfFactMultipliers: (
    availableModifiers: Ntc2018ExistingMasonryAvailableModifier[],
    selections: Record<string, unknown>,
  ) => Ntc2018ExistingMasonryMultiplierSet;
  computeImprovementMultipliers: (
    typology: Ntc2018ExistingMasonryTypology,
    availableModifiers: Ntc2018ExistingMasonryAvailableModifier[],
    selections: Record<string, unknown>,
  ) => Ntc2018ExistingMasonryMultiplierSet;
};

function gitOutput(repository: string, ...args: string[]): string {
  return execFileSync("git", ["-C", repository, ...args], { encoding: "utf8" }).trim();
}

function assertConstructor(value: unknown, label: string): asserts value is MaterialConstructor {
  assert.equal(typeof value, "function", `${label} must be a constructor`);
}

function errorSignature(callback: () => unknown): { name: string; message: string } {
  try {
    callback();
  } catch (error) {
    assert.ok(error instanceof Error);
    return { name: error.name, message: error.message };
  }
  throw new Error("Expected the callback to throw.");
}

function codePoints(value: string): number[] {
  return [...value].map((character) => character.codePointAt(0) ?? -1);
}

assertConstructor(
  sourceModule.NTC2018ExistingMasonryMaterial,
  "source NTC2018ExistingMasonryMaterial",
);
assertConstructor(sourceBaseModule.ExistingMasonryMaterial, "source ExistingMasonryMaterial");
const SourceMaterial = sourceModule.NTC2018ExistingMasonryMaterial;
const SourceBaseMaterial = sourceBaseModule.ExistingMasonryMaterial;

function createOptions(
  overrides: Partial<Ntc2018ExistingMasonryMaterialOptions> = {},
): Ntc2018ExistingMasonryMaterialOptions {
  return {
    id: "MUR-01",
    masonryTypologyId: 1,
    knowledgeLevel: "LC2",
    parameterLevel: 2,
    units: { force: "N", length: "mm" },
    modifierSelections: {
      maltaBuona: { selected: true },
      connessioneTrasversale: { selected: true },
      iniezioniMisceleLeganti: { selected: true },
    },
    ...overrides,
  };
}

function assertMaterialParity(options: Ntc2018ExistingMasonryMaterialOptions): void {
  const sourceMaterial = new SourceMaterial(options);
  const targetMaterial = new NTC2018ExistingMasonryMaterial(options);

  assert.equal(sourceMaterial instanceof SourceMaterial, true);
  assert.equal(sourceMaterial instanceof SourceBaseMaterial, true);
  assert.equal(targetMaterial instanceof NTC2018ExistingMasonryMaterial, true);
  assert.equal(targetMaterial instanceof ExistingMasonryMaterial, true);
  assert.deepEqual(targetMaterial.toJSON(), sourceMaterial.toJSON());
  assert.equal(JSON.stringify(targetMaterial.toJSON()), JSON.stringify(sourceMaterial.toJSON()));
  for (const propertyName of ["fm", "tau0", "fv0", "E", "G", "w", "missing"]) {
    assert.deepEqual(
      targetMaterial.adjustedProperty(propertyName),
      sourceMaterial.adjustedProperty(propertyName),
    );
  }
  assert.deepEqual(targetMaterial.adjustedProperties(), sourceMaterial.adjustedProperties());
  assert.deepEqual(
    targetMaterial.stateOfFactPropertiesJSON(),
    sourceMaterial.stateOfFactPropertiesJSON(),
  );
  assert.deepEqual(
    targetMaterial.originalPropertiesJSON(),
    sourceMaterial.originalPropertiesJSON(),
  );
}

void test("NTC 2018 existing-masonry material matches the pinned class hierarchy and JSON", () => {
  assert.equal(gitOutput(sourceRoot, "rev-parse", "HEAD"), sourceRevision);
  assert.equal(gitOutput(sourceRoot, "status", "--porcelain"), "");
  assert.equal(gitOutput(normativeRoot, "rev-parse", "HEAD"), normativeRevision);
  assert.equal(gitOutput(normativeRoot, "status", "--porcelain"), "");
  assert.deepEqual(Object.keys(targetModule).sort(), Object.keys(sourceModule).sort());
  assert.equal(typeof sourceIndex.NTC2018ExistingMasonryMaterial, "function");
  assert.equal(sourceIndex.NTC2018ExistingMasonryMaterial, SourceMaterial);

  assertMaterialParity(createOptions());
  assertMaterialParity(
    createOptions({
      id: "MUR-08",
      masonryTypologyId: 8,
      parameterLevel: 1,
      knowledgeLevel: "LC1",
      modifierSelections: {},
    }),
  );
  assertMaterialParity(
    createOptions({
      masonryTypology: "  MURATURA IN PIETRE A SPACCO CON BUONA TESSITURA  ",
      masonryTypologyId: undefined,
      parameterLevel: null,
      knowledgeLevel: "LC3",
      surveyFactors: { mortarQuality: 1.2, geometry: 1.1, connections: 1.3 },
      improvementFactors: { groutInjection: 1.2, reinforcedPlaster: 1.1 },
      modifierSelections: {},
    }),
  );

  const sourceMaterial = new SourceMaterial(createOptions());
  const targetMaterial = new NTC2018ExistingMasonryMaterial(createOptions());
  const sourceTypology = sourceMaterial.masonryTypology;
  const targetTypology = targetMaterial.masonryTypology;
  assert.equal(
    codePoints(targetTypology.name).join(","),
    codePoints(sourceTypology.name).join(","),
  );
  assert.equal(targetTypology.notes, sourceTypology.notes);
  assert.deepEqual(targetMaterial.availableModifiers, sourceMaterial.availableModifiers);
  assert.deepEqual(targetMaterial.modifierSelections, sourceMaterial.modifierSelections);
});

void test("NTC 2018 existing-masonry static workflows preserve mappings and factors", () => {
  const sourceMerged = SourceMaterial.mergeLegacySelections(
    { mortarQuality: 1.2, geometry: 1.1, connections: 1 },
    { groutInjection: 1.3, reinforcedPlaster: 1.1, jacketing: 1, ties: 1.4 },
  );
  const targetMerged = NTC2018ExistingMasonryMaterial.mergeLegacySelections(
    { mortarQuality: 1.2, geometry: 1.1, connections: 1 },
    { groutInjection: 1.3, reinforcedPlaster: 1.1, jacketing: 1, ties: 1.4 },
  );
  assert.deepEqual(targetMerged, sourceMerged);
  assert.equal(JSON.stringify(targetMerged), JSON.stringify(sourceMerged));

  const sourceMaterial = new SourceMaterial(createOptions());
  const targetMaterial = new NTC2018ExistingMasonryMaterial(createOptions());
  const sourceState = SourceMaterial.computeStateOfFactMultipliers(
    sourceMaterial.availableModifiers,
    sourceMaterial.modifierSelections,
  );
  const targetState = NTC2018ExistingMasonryMaterial.computeStateOfFactMultipliers(
    targetMaterial.availableModifiers,
    targetMaterial.modifierSelections,
  );
  assert.deepEqual(targetState, sourceState);
  const sourceImprovement = SourceMaterial.computeImprovementMultipliers(
    sourceMaterial.masonryTypology,
    sourceMaterial.availableModifiers,
    sourceMaterial.modifierSelections,
  );
  const targetImprovement = NTC2018ExistingMasonryMaterial.computeImprovementMultipliers(
    targetMaterial.masonryTypology,
    targetMaterial.availableModifiers,
    targetMaterial.modifierSelections,
  );
  assert.deepEqual(targetImprovement, sourceImprovement);
});

void test("NTC 2018 existing-masonry material preserves exact error paths", () => {
  const errorCases: Record<string, Ntc2018ExistingMasonryMaterialOptions> = {
    unknownTypology: createOptions({ masonryTypologyId: 99 }),
    invalidParameterLevel: createOptions({ parameterLevel: 3 }),
    incompatibleModifiers: createOptions({
      modifierSelections: {
        intonacoArmato: { selected: true },
        ristilaturaArmata: { selected: true },
      },
    }),
    unavailableModifier: createOptions({
      masonryTypologyId: 8,
      modifierSelections: { iniezioniMisceleLeganti: { selected: true } },
    }),
    unknownModifier: createOptions({
      modifierSelections: { unknownModifier: { selected: true } },
    }),
  };

  for (const options of Object.values(errorCases)) {
    const sourceError = errorSignature(() => new SourceMaterial(options));
    const targetError = errorSignature(() => new NTC2018ExistingMasonryMaterial(options));
    assert.deepEqual(targetError, sourceError);
  }

  const sourceMissingOptions = errorSignature(() => Reflect.construct(SourceMaterial, []));
  const targetMissingOptions = errorSignature(() =>
    Reflect.construct(NTC2018ExistingMasonryMaterial, []),
  );
  assert.deepEqual(targetMissingOptions, sourceMissingOptions);
});
