import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import test from "node:test";
import path from "node:path";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const sourceRoot = path.resolve(repositoryRoot, "..", "strutture-js");
const sourceRevision = "6f33baead8b88166c4b2cf94af41763412e3c751";
const sourceContractsPath = path.join(sourceRoot, "src", "domain", "fem", "contracts", "index.js");
const sourceFixturePath = path.join(sourceRoot, "tests", "fixtures", "globalFemBuildingFixture.js");
const typescriptContractsPath = path.join(
  repositoryRoot,
  "dist",
  "domain",
  "fem",
  "contracts",
  "index.js",
);

interface RuntimeContractModule {
  readonly createFemCapabilitiesContract: (input: unknown, options?: unknown) => unknown;
  readonly createFemEntityMappingContract: (input: unknown, options?: unknown) => unknown;
  readonly createGlobalFemAnalysisContract: (input: unknown, options?: unknown) => unknown;
  readonly createGlobalFemContractSet: (input: unknown, options?: unknown) => unknown;
  readonly createGlobalFemModelContract: (input: unknown, options?: unknown) => unknown;
  readonly createGlobalFemResultContract: (input: unknown, options?: unknown) => unknown;
  readonly validateFemCapabilitiesContract: (input: unknown, options?: unknown) => unknown;
  readonly validateFemEntityMappingContract: (input: unknown, options?: unknown) => unknown;
  readonly validateGlobalFemAnalysisContract: (input: unknown, options?: unknown) => unknown;
  readonly validateGlobalFemContractSet: (input?: unknown, options?: unknown) => unknown;
  readonly validateGlobalFemModelContract: (input: unknown, options?: unknown) => unknown;
  readonly validateGlobalFemResultContract: (input: unknown, options?: unknown) => unknown;
}

interface RuntimeFixtureModule {
  readonly createGlobalFemBuildingFixture: () => unknown;
}

interface FixtureValue {
  readonly capabilities: unknown;
  readonly model: unknown;
  readonly analysis: unknown;
  readonly mapping: unknown;
  readonly result: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function assertContractModule(value: unknown): asserts value is RuntimeContractModule {
  assert.ok(isRecord(value));
  const required = [
    "createFemCapabilitiesContract",
    "createFemEntityMappingContract",
    "createGlobalFemAnalysisContract",
    "createGlobalFemContractSet",
    "createGlobalFemModelContract",
    "createGlobalFemResultContract",
    "validateFemCapabilitiesContract",
    "validateFemEntityMappingContract",
    "validateGlobalFemAnalysisContract",
    "validateGlobalFemContractSet",
    "validateGlobalFemModelContract",
    "validateGlobalFemResultContract",
  ];
  assert.ok(required.every((name) => typeof value[name] === "function"));
}

function assertFixtureModule(value: unknown): asserts value is RuntimeFixtureModule {
  assert.ok(isRecord(value));
  assert.equal(typeof value.createGlobalFemBuildingFixture, "function");
}

function fixtureValue(value: unknown): FixtureValue {
  assert.ok(isRecord(value));
  return {
    capabilities: value.capabilities,
    model: value.model,
    analysis: value.analysis,
    mapping: value.mapping,
    result: value.result,
  };
}

function gitOutput(...args: string[]): string {
  return execFileSync("git", ["-C", sourceRoot, ...args], { encoding: "utf8" }).trim();
}

function assertSourceBaseline(): void {
  assert.equal(gitOutput("rev-parse", "HEAD"), sourceRevision);
  assert.equal(gitOutput("status", "--porcelain"), "");
}

function codePoints(value: string): number[] {
  return Array.from(value, (character) => character.codePointAt(0) as number);
}

function assertNumericalAndUnicodeParity(
  source: unknown,
  typescript: unknown,
  label: string,
): void {
  const absoluteTolerance = 1e-12;
  const relativeTolerance = 1e-12;
  const compare = (left: unknown, right: unknown, pathName: string): void => {
    if (typeof left === "number" || typeof right === "number") {
      assert.equal(typeof left, "number", `${label}${pathName}`);
      assert.equal(typeof right, "number", `${label}${pathName}`);
      const difference = Math.abs((left as number) - (right as number));
      const scale = Math.max(1, Math.abs(left as number), Math.abs(right as number));
      assert.ok(
        difference <= absoluteTolerance + relativeTolerance * scale,
        `${label}${pathName}: numerical difference ${difference} exceeds tolerance`,
      );
      return;
    }
    if (typeof left === "string" || typeof right === "string") {
      assert.equal(left, right, `${label}${pathName}`);
      assert.deepEqual(
        codePoints(left as string),
        codePoints(right as string),
        `${label}${pathName}`,
      );
      return;
    }
    if (Array.isArray(left) || Array.isArray(right)) {
      assert.ok(Array.isArray(left) && Array.isArray(right), `${label}${pathName}`);
      assert.equal(left.length, right.length, `${label}${pathName}.length`);
      left.forEach((entry, index) => compare(entry, right[index], `${pathName}[${index}]`));
      return;
    }
    if (isRecord(left) || isRecord(right)) {
      assert.ok(isRecord(left) && isRecord(right), `${label}${pathName}`);
      const leftKeys = Object.keys(left).sort();
      const rightKeys = Object.keys(right).sort();
      assert.deepEqual(leftKeys, rightKeys, `${label}${pathName}.keys`);
      leftKeys.forEach((key) => compare(left[key], right[key], `${pathName}.${key}`));
      return;
    }
    assert.deepEqual(left, right, `${label}${pathName}`);
  };
  compare(source, typescript, "$");
}

function assertSerializedParity(source: unknown, typescript: unknown, label: string): void {
  assertNumericalAndUnicodeParity(source, typescript, label);
  assert.equal(JSON.stringify(source), JSON.stringify(typescript), `${label}: serialized JSON`);
}

const sourceModuleUnknown: unknown = await import(pathToFileURL(sourceContractsPath).href);
const typescriptModuleUnknown: unknown = await import(pathToFileURL(typescriptContractsPath).href);
const sourceFixtureUnknown: unknown = await import(pathToFileURL(sourceFixturePath).href);
assertContractModule(sourceModuleUnknown);
assertContractModule(typescriptModuleUnknown);
assertFixtureModule(sourceFixtureUnknown);

void test("FEM contract validators and factories match the independently executed JavaScript baseline", () => {
  assertSourceBaseline();

  for (const name of [
    "validateFemCapabilitiesContract",
    "validateFemEntityMappingContract",
    "validateGlobalFemAnalysisContract",
    "validateGlobalFemContractSet",
    "validateGlobalFemModelContract",
    "validateGlobalFemResultContract",
  ] as const) {
    assert.notStrictEqual(
      sourceModuleUnknown[name],
      typescriptModuleUnknown[name],
      `${name} must be executed from two independent modules`,
    );
  }

  const runValidation = (
    name: keyof RuntimeContractModule,
    sourceInput: unknown,
    typescriptInput: unknown,
    sourceOptions?: unknown,
    typescriptOptions?: unknown,
  ): void => {
    const sourceValidator = sourceModuleUnknown[name];
    const typescriptValidator = typescriptModuleUnknown[name];
    assert.equal(typeof sourceValidator, "function");
    assert.equal(typeof typescriptValidator, "function");
    const sourceValue =
      sourceOptions === undefined
        ? sourceValidator(sourceInput)
        : sourceValidator(sourceInput, sourceOptions);
    const typescriptValue =
      typescriptOptions === undefined
        ? typescriptValidator(typescriptInput)
        : typescriptValidator(typescriptInput, typescriptOptions);
    assertSerializedParity(sourceValue, typescriptValue, name);
  };

  const sourceFixture = fixtureValue(sourceFixtureUnknown.createGlobalFemBuildingFixture());
  const typescriptFixture = fixtureValue(sourceFixtureUnknown.createGlobalFemBuildingFixture());
  runValidation(
    "validateFemCapabilitiesContract",
    sourceFixture.capabilities,
    typescriptFixture.capabilities,
  );
  runValidation("validateGlobalFemModelContract", sourceFixture.model, typescriptFixture.model);
  runValidation(
    "validateGlobalFemAnalysisContract",
    sourceFixture.analysis,
    typescriptFixture.analysis,
    { model: sourceFixture.model, capabilities: sourceFixture.capabilities },
    { model: typescriptFixture.model, capabilities: typescriptFixture.capabilities },
  );
  runValidation(
    "validateFemEntityMappingContract",
    sourceFixture.mapping,
    typescriptFixture.mapping,
    { model: sourceFixture.model },
    { model: typescriptFixture.model },
  );
  runValidation(
    "validateGlobalFemResultContract",
    sourceFixture.result,
    typescriptFixture.result,
    sourceFixture,
    typescriptFixture,
  );
  runValidation("validateGlobalFemContractSet", sourceFixture, typescriptFixture);
  runValidation("validateFemCapabilitiesContract", null, null);
  runValidation("validateGlobalFemModelContract", 17, 17);
  runValidation("validateGlobalFemContractSet", undefined, undefined);

  const sourceFactoryFixture = fixtureValue(sourceFixtureUnknown.createGlobalFemBuildingFixture());
  const typescriptFactoryFixture = fixtureValue(
    sourceFixtureUnknown.createGlobalFemBuildingFixture(),
  );
  const factoryPairs: readonly [keyof RuntimeContractModule, unknown, unknown][] = [
    [
      "createFemCapabilitiesContract",
      sourceFactoryFixture.capabilities,
      typescriptFactoryFixture.capabilities,
    ],
    ["createGlobalFemModelContract", sourceFactoryFixture.model, typescriptFactoryFixture.model],
    [
      "createGlobalFemAnalysisContract",
      sourceFactoryFixture.analysis,
      typescriptFactoryFixture.analysis,
    ],
    [
      "createFemEntityMappingContract",
      sourceFactoryFixture.mapping,
      typescriptFactoryFixture.mapping,
    ],
    ["createGlobalFemResultContract", sourceFactoryFixture.result, typescriptFactoryFixture.result],
    ["createGlobalFemContractSet", sourceFactoryFixture, typescriptFactoryFixture],
  ];
  for (const [name, sourceInput, typescriptInput] of factoryPairs) {
    const sourceFactory: (input: unknown, options?: unknown) => unknown = sourceModuleUnknown[name];
    const typescriptFactory: (input: unknown, options?: unknown) => unknown =
      typescriptModuleUnknown[name];
    assert.equal(typeof sourceFactory, "function");
    assert.equal(typeof typescriptFactory, "function");
    assertSerializedParity(sourceFactory(sourceInput), typescriptFactory(typescriptInput), name);
  }
});
