import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const sourceRoot = path.resolve(repositoryRoot, "..", "strutture-js");
const sourceRevision = "6f33baead8b88166c4b2cf94af41763412e3c751";
const sourceApplicationPath = path.join(
  sourceRoot,
  "src",
  "applications",
  "global-fem-postprocessing",
  "index.js",
);
const sourceFixturePath = path.join(sourceRoot, "tests", "fixtures", "globalFemBuildingFixture.js");
const typescriptApplicationPath = path.join(
  repositoryRoot,
  "dist",
  "applications",
  "global-fem-postprocessing",
  "index.js",
);

type RuntimeFunction = (...arguments_: readonly unknown[]) => unknown;

interface RuntimeApplicationInstance {
  readonly run: (input?: unknown) => unknown;
}

interface RuntimeApplicationConstructor {
  new (): RuntimeApplicationInstance;
}

interface RuntimePostProcessingModule {
  readonly GlobalFemPostProcessingApplication: RuntimeApplicationConstructor;
  readonly classifyGlobalFemStructuralEntities: RuntimeFunction;
  readonly extractGlobalFemDemands: RuntimeFunction;
  readonly evaluateGlobalFemVerificationReadiness: RuntimeFunction;
  readonly GLOBAL_FEM_POSTPROCESSING_PROFILES: Record<string, string>;
  readonly GLOBAL_FEM_READINESS_ASSESSMENTS: Record<string, string>;
}

interface RuntimeFixtureModule {
  readonly createGlobalFemBuildingFixture: () => unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function assertRuntimeModule(value: unknown): asserts value is RuntimePostProcessingModule {
  assert.ok(isRecord(value));
  for (const name of [
    "GlobalFemPostProcessingApplication",
    "classifyGlobalFemStructuralEntities",
    "extractGlobalFemDemands",
    "evaluateGlobalFemVerificationReadiness",
  ]) {
    assert.equal(
      typeof value[name],
      name === "GlobalFemPostProcessingApplication" ? "function" : "function",
    );
  }
  assert.ok(isRecord(value.GLOBAL_FEM_POSTPROCESSING_PROFILES));
  assert.ok(isRecord(value.GLOBAL_FEM_READINESS_ASSESSMENTS));
}

function assertRuntimeFixture(value: unknown): asserts value is RuntimeFixtureModule {
  assert.ok(isRecord(value));
  assert.equal(typeof value.createGlobalFemBuildingFixture, "function");
}

function gitOutput(...arguments_: readonly string[]): string {
  return execFileSync("git", ["-C", sourceRoot, ...arguments_], { encoding: "utf8" }).trim();
}

function assertSourceBaseline(): void {
  assert.equal(gitOutput("rev-parse", "HEAD"), sourceRevision);
  assert.equal(gitOutput("status", "--porcelain"), "");
}

function codePoints(value: string): number[] {
  return Array.from(value, (character) => character.codePointAt(0) as number);
}

function cloneValue(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value)) as unknown;
}

function fixtureInput(
  fixture: unknown,
  profile: string,
  includeMapping: boolean,
): Record<string, unknown> {
  assert.ok(isRecord(fixture));
  const input = cloneValue(fixture);
  assert.ok(isRecord(input));
  input.profile = profile;
  if (!includeMapping) delete input.mapping;
  return input;
}

function compareValues(source: unknown, typescript: unknown, label: string): void {
  const absoluteTolerance = 1e-12;
  const relativeTolerance = 1e-12;
  const compare = (left: unknown, right: unknown, valuePath: string): void => {
    if (typeof left === "number" || typeof right === "number") {
      assert.equal(typeof left, "number", `${label}${valuePath}`);
      assert.equal(typeof right, "number", `${label}${valuePath}`);
      const difference = Math.abs((left as number) - (right as number));
      const scale = Math.max(1, Math.abs(left as number), Math.abs(right as number));
      assert.ok(
        difference <= absoluteTolerance + relativeTolerance * scale,
        `${label}${valuePath}: numerical difference ${difference} exceeds tolerance`,
      );
      return;
    }
    if (typeof left === "string" || typeof right === "string") {
      assert.equal(left, right, `${label}${valuePath}`);
      assert.deepEqual(
        codePoints(left as string),
        codePoints(right as string),
        `${label}${valuePath}`,
      );
      return;
    }
    if (Array.isArray(left) || Array.isArray(right)) {
      assert.ok(Array.isArray(left) && Array.isArray(right), `${label}${valuePath}`);
      assert.equal(left.length, right.length, `${label}${valuePath}.length`);
      left.forEach((entry, index) => compare(entry, right[index], `${valuePath}[${index}]`));
      return;
    }
    if (isRecord(left) || isRecord(right)) {
      assert.ok(isRecord(left) && isRecord(right), `${label}${valuePath}`);
      const leftKeys = Object.keys(left).sort();
      const rightKeys = Object.keys(right).sort();
      assert.deepEqual(leftKeys, rightKeys, `${label}${valuePath}.keys`);
      leftKeys.forEach((key) => compare(left[key], right[key], `${valuePath}.${key}`));
      return;
    }
    assert.deepEqual(left, right, `${label}${valuePath}`);
  };
  compare(source, typescript, "$");
  assert.equal(
    JSON.stringify(source),
    JSON.stringify(typescript),
    `${label}: exact serialized JSON`,
  );
}

function captureError(invoke: () => unknown): { readonly name: string; readonly message: string } {
  try {
    invoke();
  } catch (error) {
    return {
      name: error instanceof Error ? error.name : "unknown",
      message: error instanceof Error ? error.message : String(error),
    };
  }
  throw new Error("Expected the independent JavaScript oracle call to fail.");
}

const sourceModuleValue: unknown = await import(pathToFileURL(sourceApplicationPath).href);
const typescriptModuleValue: unknown = await import(pathToFileURL(typescriptApplicationPath).href);
assertRuntimeModule(sourceModuleValue);
assertRuntimeModule(typescriptModuleValue);
const sourceModule = sourceModuleValue;
const typescriptModule = typescriptModuleValue;
const fixtureModuleValue: unknown = await import(pathToFileURL(sourceFixturePath).href);
assertRuntimeFixture(fixtureModuleValue);

void test("global FEM postprocessing matches the independently executed JavaScript oracle", () => {
  assertSourceBaseline();
  assert.notEqual(
    sourceModule.GlobalFemPostProcessingApplication,
    typescriptModule.GlobalFemPostProcessingApplication,
  );
  assert.notEqual(
    sourceModule.classifyGlobalFemStructuralEntities,
    typescriptModule.classifyGlobalFemStructuralEntities,
  );
  assert.notEqual(sourceModule.extractGlobalFemDemands, typescriptModule.extractGlobalFemDemands);
  assert.notEqual(
    sourceModule.evaluateGlobalFemVerificationReadiness,
    typescriptModule.evaluateGlobalFemVerificationReadiness,
  );

  const fixture = fixtureModuleValue.createGlobalFemBuildingFixture();
  const profiles = ["demand-only", "assisted", "confirmed"] as const;
  let sourceOracleCalls = 0;
  const runSource = (input: unknown): unknown => {
    sourceOracleCalls += 1;
    return new sourceModule.GlobalFemPostProcessingApplication().run(input);
  };
  const runTypescript = (input: unknown): unknown =>
    new typescriptModule.GlobalFemPostProcessingApplication().run(input);

  for (const profile of profiles) {
    const includeMapping = profile === "confirmed";
    const sourceResult = runSource(fixtureInput(fixture, profile, includeMapping));
    const typescriptResult = runTypescript(fixtureInput(fixture, profile, includeMapping));
    compareValues(sourceResult, typescriptResult, `application.${profile}`);
  }

  assert.ok(isRecord(fixture));
  const sourceModel = cloneValue(fixture.model);
  const typescriptModel = cloneValue(fixture.model);
  const sourceClassification = sourceModule.classifyGlobalFemStructuralEntities({
    model: sourceModel,
    mapping: cloneValue(fixture.mapping),
  });
  const typescriptClassification = typescriptModule.classifyGlobalFemStructuralEntities({
    model: typescriptModel,
    mapping: cloneValue(fixture.mapping),
  });
  compareValues(sourceClassification, typescriptClassification, "classification");

  const sourceDemand = sourceModule.extractGlobalFemDemands({
    model: cloneValue(fixture.model),
    analysis: cloneValue(fixture.analysis),
    result: cloneValue(fixture.result),
    classification: sourceClassification,
  });
  const typescriptDemand = typescriptModule.extractGlobalFemDemands({
    model: cloneValue(fixture.model),
    analysis: cloneValue(fixture.analysis),
    result: cloneValue(fixture.result),
    classification: typescriptClassification,
  });
  compareValues(sourceDemand, typescriptDemand, "demand-extraction");

  const sourceError = captureError(() => runSource({ profile: "unsupported-global-fem-profile" }));
  const typescriptError = captureError(() =>
    runTypescript({ profile: "unsupported-global-fem-profile" }),
  );
  compareValues(sourceError, typescriptError, "errors.unsupported-profile");
  assert.equal(sourceOracleCalls, profiles.length + 1);
});
