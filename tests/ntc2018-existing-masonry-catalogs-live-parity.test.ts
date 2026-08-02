import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  NTC2018_EXISTING_MASONRY_KNOWLEDGE_LEVELS,
  NTC2018_EXISTING_MASONRY_MODIFIER_DEFINITIONS,
  NTC2018_EXISTING_MASONRY_PARAMETER_LEVELS,
  NTC2018_EXISTING_MASONRY_TYPOLOGIES,
  getNTC2018TabulatedMasonryProperties,
  resolveNTC2018MasonryTypology,
} from "../dist/index.js";
import * as targetModule from "../dist/norms/ntc2018/materials/ntc2018ExistingMasonryCatalogs.js";

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
  "ntc2018ExistingMasonryCatalogs.js",
);
const sourceIndexPath = path.join(sourceRoot, "src", "index.js");

const sourceModule = (await import(pathToFileURL(sourceModulePath).href)) as Record<
  string,
  unknown
>;
const sourceIndex = (await import(pathToFileURL(sourceIndexPath).href)) as Record<string, unknown>;

function gitOutput(repository: string, ...args: string[]): string {
  return execFileSync("git", ["-C", repository, ...args], { encoding: "utf8" }).trim();
}

function assertFunction(
  value: unknown,
  label: string,
): asserts value is (...args: unknown[]) => unknown {
  assert.equal(typeof value, "function", `${label} must be a function`);
}

function assertObject(value: unknown, label: string): asserts value is Record<string, unknown> {
  assert.ok(value !== null && typeof value === "object", `${label} must be an object`);
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

assertFunction(sourceModule.resolveMasonryTypology, "source resolveMasonryTypology");
assertFunction(
  sourceModule.getTabulatedMechanicalProperties,
  "source getTabulatedMechanicalProperties",
);
const sourceResolve = sourceModule.resolveMasonryTypology;
const sourceGetProperties = sourceModule.getTabulatedMechanicalProperties;
const sourceTypologies = sourceModule.NTC2018_EXISTING_MASONRY_TYPOLOGIES;
const sourceModifierDefinitions = sourceModule.NTC2018_EXISTING_MASONRY_MODIFIER_DEFINITIONS;
const sourceParameterLevels = sourceModule.NTC2018_EXISTING_MASONRY_PARAMETER_LEVELS;
assert.ok(Array.isArray(sourceTypologies));
assert.ok(Array.isArray(sourceModifierDefinitions));
assertObject(sourceParameterLevels, "source parameter levels");

void test("NTC 2018 existing-masonry catalog data matches the pinned source exactly", () => {
  assert.equal(gitOutput(sourceRoot, "rev-parse", "HEAD"), sourceRevision);
  assert.equal(gitOutput(sourceRoot, "status", "--porcelain"), "");
  assert.equal(gitOutput(normativeRoot, "rev-parse", "HEAD"), normativeRevision);
  assert.equal(gitOutput(normativeRoot, "status", "--porcelain"), "");

  assert.deepEqual(Object.keys(targetModule).sort(), Object.keys(sourceModule).sort());
  assert.deepEqual(NTC2018_EXISTING_MASONRY_TYPOLOGIES, sourceTypologies);
  assert.deepEqual(NTC2018_EXISTING_MASONRY_MODIFIER_DEFINITIONS, sourceModifierDefinitions);
  assert.deepEqual(NTC2018_EXISTING_MASONRY_PARAMETER_LEVELS, sourceParameterLevels);
  assert.equal(
    JSON.stringify(NTC2018_EXISTING_MASONRY_TYPOLOGIES),
    JSON.stringify(sourceTypologies),
  );
  assert.equal(
    JSON.stringify(NTC2018_EXISTING_MASONRY_MODIFIER_DEFINITIONS),
    JSON.stringify(sourceModifierDefinitions),
  );
  assert.equal(
    JSON.stringify(NTC2018_EXISTING_MASONRY_PARAMETER_LEVELS),
    JSON.stringify(sourceParameterLevels),
  );

  for (const value of [
    sourceTypologies,
    sourceModifierDefinitions,
    sourceParameterLevels,
    NTC2018_EXISTING_MASONRY_TYPOLOGIES,
    NTC2018_EXISTING_MASONRY_MODIFIER_DEFINITIONS,
    NTC2018_EXISTING_MASONRY_PARAMETER_LEVELS,
  ]) {
    assert.equal(Object.isFrozen(value), false);
  }

  for (const [index, sourceTypology] of sourceTypologies.entries()) {
    assertObject(sourceTypology, `source typology ${index + 1}`);
    const targetTypology = NTC2018_EXISTING_MASONRY_TYPOLOGIES[index];
    assert.ok(targetTypology);
    if (typeof sourceTypology.name !== "string") {
      throw new Error(`Source typology ${index + 1} must contain a name string.`);
    }
    assert.equal(
      codePoints(targetTypology.name).join(","),
      codePoints(sourceTypology.name).join(","),
    );
    if (typeof sourceTypology.notes === "string") {
      if (typeof targetTypology.notes !== "string") {
        throw new Error(`Target typology ${index + 1} must contain a notes string.`);
      }
      assert.equal(
        codePoints(targetTypology.notes).join(","),
        codePoints(sourceTypology.notes).join(","),
      );
    } else {
      assert.equal(targetTypology.notes, sourceTypology.notes);
    }
  }
});

void test("NTC 2018 existing-masonry aliases and lookups preserve exact behavior", () => {
  const targetRoot = {
    NTC2018_EXISTING_MASONRY_KNOWLEDGE_LEVELS,
    NTC2018_EXISTING_MASONRY_MODIFIER_DEFINITIONS,
    NTC2018_EXISTING_MASONRY_PARAMETER_LEVELS,
    NTC2018_EXISTING_MASONRY_TYPOLOGIES,
    getNTC2018TabulatedMasonryProperties,
    resolveNTC2018MasonryTypology,
  };
  assert.deepEqual(
    Object.keys(targetRoot).sort(),
    [
      "NTC2018_EXISTING_MASONRY_KNOWLEDGE_LEVELS",
      "NTC2018_EXISTING_MASONRY_MODIFIER_DEFINITIONS",
      "NTC2018_EXISTING_MASONRY_PARAMETER_LEVELS",
      "NTC2018_EXISTING_MASONRY_TYPOLOGIES",
      "getNTC2018TabulatedMasonryProperties",
      "resolveNTC2018MasonryTypology",
    ].sort(),
  );
  for (const [name, targetValue] of Object.entries(targetRoot)) {
    const sourceValue = sourceIndex[name];
    if (typeof targetValue === "function" || typeof sourceValue === "function") {
      if (typeof targetValue !== "function" || typeof sourceValue !== "function") {
        throw new Error(`Root export ${name} must be a function in both implementations.`);
      }
      assert.equal(targetValue.name, sourceValue.name);
    } else {
      assert.deepEqual(targetValue, sourceValue);
    }
    assert.equal(JSON.stringify(targetValue), JSON.stringify(sourceValue));
  }

  for (const input of [
    1,
    8,
    99,
    "Muratura in pietre a spacco con buona tessitura",
    "  MURATURA IN PIETRE A SPACCO CON BUONA TESSITURA  ",
    "missing",
    null,
    undefined,
    {},
  ]) {
    const sourceResult = sourceResolve(input);
    const targetResult = resolveNTC2018MasonryTypology(input);
    assert.deepEqual(targetResult, sourceResult);
    assert.equal(JSON.stringify(targetResult), JSON.stringify(sourceResult));
  }

  for (const sourceTypology of sourceTypologies) {
    assertObject(sourceTypology, "source typology");
    const id = sourceTypology.id;
    assert.equal(typeof id, "number");
    const targetTypology = NTC2018_EXISTING_MASONRY_TYPOLOGIES.find((item) => item.id === id);
    assert.ok(targetTypology);
    for (const parameterLevel of [1, 2, 0, 3]) {
      const sourceResult = sourceGetProperties(sourceTypology, parameterLevel);
      const targetResult = getNTC2018TabulatedMasonryProperties(targetTypology, parameterLevel);
      assert.deepEqual(targetResult, sourceResult);
      assert.equal(JSON.stringify(targetResult), JSON.stringify(sourceResult));
    }
  }
});

void test("NTC 2018 existing-masonry unsupported inputs preserve native errors", () => {
  const malformedInputs: unknown[] = [null, undefined, {}, { ranges: null }];
  for (const input of malformedInputs) {
    const sourceError = errorSignature(() => sourceGetProperties(input, 1));
    const targetError = errorSignature(() =>
      Reflect.apply(getNTC2018TabulatedMasonryProperties, undefined, [input, 1]),
    );
    assert.deepEqual(targetError, sourceError);
  }
});
