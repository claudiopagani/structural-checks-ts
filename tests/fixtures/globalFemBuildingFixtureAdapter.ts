import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  validateFemCapabilitiesContract,
  validateFemEntityMappingContract,
  validateGlobalFemAnalysisContract,
  validateGlobalFemModelContract,
  validateGlobalFemResultContract,
} from "../../dist/index.js";
import type {
  FemCapabilitiesContract,
  FemEntityMappingContract,
  FemJsonObject,
  FemValidationResult,
  GlobalFemAnalysisContract,
  GlobalFemModelContract,
  GlobalFemResultContract,
} from "../../dist/index.js";

type MutableDeep<T> = T extends readonly unknown[]
  ? { -readonly [Key in keyof T]: MutableDeep<T[Key]> }
  : T extends FemJsonObject
    ? { -readonly [Key in keyof T]: T[Key] }
    : T extends object
      ? { -readonly [Key in keyof T]: MutableDeep<T[Key]> }
      : T;

export interface MutableGlobalFemBuildingFixture {
  capabilities: MutableDeep<FemCapabilitiesContract>;
  model: MutableDeep<GlobalFemModelContract>;
  analysis: MutableDeep<GlobalFemAnalysisContract>;
  mapping: MutableDeep<FemEntityMappingContract>;
  result: MutableDeep<GlobalFemResultContract>;
  [key: string]: unknown;
}

interface RuntimeFixtureModule {
  readonly createGlobalFemBuildingFixture: () => unknown;
  readonly configureCompleteRcBuildingFixture: (fixture: unknown) => unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function runtimeFixtureModule(value: unknown): RuntimeFixtureModule {
  assert.ok(isRecord(value));
  assert.equal(typeof value.createGlobalFemBuildingFixture, "function");
  assert.equal(typeof value.configureCompleteRcBuildingFixture, "function");
  return {
    createGlobalFemBuildingFixture: value.createGlobalFemBuildingFixture as () => unknown,
    configureCompleteRcBuildingFixture: value.configureCompleteRcBuildingFixture as (
      fixture: unknown,
    ) => unknown,
  };
}

function validValue<T>(validation: FemValidationResult<T>): T {
  assert.equal(validation.ok, true, JSON.stringify(validation.errors));
  if (validation.value === null) throw new Error("Expected a validated FEM value.");
  return validation.value;
}

function mutableFixture(value: unknown): MutableGlobalFemBuildingFixture {
  assert.ok(isRecord(value));
  const capabilities = validValue(validateFemCapabilitiesContract(value.capabilities));
  const model = validValue(validateGlobalFemModelContract(value.model));
  const analysis = validValue(
    validateGlobalFemAnalysisContract(value.analysis, { model, capabilities }),
  );
  const mapping = validValue(validateFemEntityMappingContract(value.mapping, { model }));
  const result = validValue(
    validateGlobalFemResultContract(value.result, {
      model,
      analysis,
      capabilities,
      mapping,
    }),
  );
  const extras: Record<string, unknown> = {};
  for (const [key, extra] of Object.entries(value)) {
    if (!["capabilities", "model", "analysis", "mapping", "result"].includes(key)) {
      extras[key] = extra;
    }
  }
  return {
    ...extras,
    capabilities,
    model: model as unknown as MutableDeep<GlobalFemModelContract>,
    analysis: analysis as unknown as MutableDeep<GlobalFemAnalysisContract>,
    mapping: mapping as unknown as MutableDeep<FemEntityMappingContract>,
    result: result as unknown as MutableDeep<GlobalFemResultContract>,
  };
}

const sourceFixturePath = path.resolve(
  import.meta.dirname,
  "..",
  "..",
  "..",
  "strutture-js",
  "tests",
  "fixtures",
  "globalFemBuildingFixture.js",
);
const sourceFixtureModule = runtimeFixtureModule(
  await import(pathToFileURL(sourceFixturePath).href),
);

export function createGlobalFemBuildingFixture(): MutableGlobalFemBuildingFixture {
  return mutableFixture(sourceFixtureModule.createGlobalFemBuildingFixture());
}

export function configureCompleteRcBuildingFixture(
  fixture: MutableGlobalFemBuildingFixture,
): MutableGlobalFemBuildingFixture {
  return mutableFixture(sourceFixtureModule.configureCompleteRcBuildingFixture(fixture));
}
