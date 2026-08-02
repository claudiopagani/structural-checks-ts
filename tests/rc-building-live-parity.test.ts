import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import test from "node:test";

import * as TypeScriptApi from "../dist/index.js";

const execFileAsync = promisify(execFile);
const sourceRevision = "6f33baead8b88166c4b2cf94af41763412e3c751";
const baselinePath = process.env.STRUTTURE_JS_BASELINE_PATH
  ? path.resolve(process.env.STRUTTURE_JS_BASELINE_PATH)
  : path.resolve(import.meta.dirname, "..", "..", "strutture-js");
const repositoryRoot = path.resolve(import.meta.dirname, "..");
const absoluteTolerance = 1e-12;
const relativeTolerance = 1e-12;
const compatibilityFieldNames = new Set([
  "status",
  "outputs",
  "warnings",
  "assumptions",
  "metadata",
  "demand",
  "capacity",
  "utilizationRatio",
]);

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
type FixtureFactory = () => Record<string, unknown>;
type FixtureConfigurator = (fixture: Record<string, unknown>) => Record<string, unknown>;

interface FixtureModule {
  createGlobalFemBuildingFixture: FixtureFactory;
  configureCompleteRcBuildingFixture: FixtureConfigurator;
}

interface VerificationApplication {
  run(input: Record<string, unknown>): unknown;
}

interface ApplicationConstructor {
  new (): VerificationApplication;
}

interface SourceApiModule {
  RcBuildingVerificationApplication: ApplicationConstructor;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFixtureModule(value: unknown): value is FixtureModule {
  if (!isRecord(value)) return false;
  return (
    typeof value.createGlobalFemBuildingFixture === "function" &&
    typeof value.configureCompleteRcBuildingFixture === "function"
  );
}

function isSourceApiModule(value: unknown): value is SourceApiModule {
  if (!isRecord(value)) return false;
  return typeof value.RcBuildingVerificationApplication === "function";
}

function serialized(value: unknown): string {
  const result = JSON.stringify(value);
  if (result === undefined) throw new Error("The verification result is not serializable.");
  return result;
}

function isJsonValue(value: unknown): value is JsonValue {
  if (value === null || typeof value === "boolean" || typeof value === "string") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isJsonValue);
  if (!isRecord(value)) return false;
  return Object.values(value).every(isJsonValue);
}

function codePoints(value: string): number[] {
  return Array.from(value, (character) => {
    const codePoint = character.codePointAt(0);
    if (codePoint === undefined) throw new Error("A string character has no Unicode code point.");
    return codePoint;
  });
}

function compareSerializedValues(
  javascriptValue: JsonValue,
  typescriptValue: JsonValue,
  location: string,
): void {
  if (typeof javascriptValue === "number" || typeof typescriptValue === "number") {
    if (typeof javascriptValue !== "number" || typeof typescriptValue !== "number") {
      throw new Error(`${location} changed numeric type.`);
    }
    const difference = Math.abs(javascriptValue - typescriptValue);
    const tolerance = Math.max(
      absoluteTolerance,
      relativeTolerance * Math.max(Math.abs(javascriptValue), Math.abs(typescriptValue)),
    );
    assert.ok(
      difference <= tolerance,
      `${location} differs by ${difference}; tolerance ${tolerance}.`,
    );
    return;
  }

  if (typeof javascriptValue === "string" || typeof typescriptValue === "string") {
    if (typeof javascriptValue !== "string" || typeof typescriptValue !== "string") {
      throw new Error(`${location} changed string type.`);
    }
    assert.deepEqual(
      codePoints(javascriptValue),
      codePoints(typescriptValue),
      `${location} changed code points.`,
    );
    assert.equal(javascriptValue, typescriptValue, `${location} changed public string content.`);
    return;
  }

  if (Array.isArray(javascriptValue) || Array.isArray(typescriptValue)) {
    if (!Array.isArray(javascriptValue) || !Array.isArray(typescriptValue)) {
      throw new Error(`${location} changed array/object shape.`);
    }
    assert.equal(
      javascriptValue.length,
      typescriptValue.length,
      `${location} changed array length.`,
    );
    for (let index = 0; index < javascriptValue.length; index += 1) {
      const javascriptChild = javascriptValue[index];
      const typescriptChild = typescriptValue[index];
      if (javascriptChild === undefined || typescriptChild === undefined) {
        throw new Error(`${location}[${index}] is missing from one result.`);
      }
      compareSerializedValues(javascriptChild, typescriptChild, `${location}[${index}]`);
    }
    return;
  }

  if (isRecord(javascriptValue) || isRecord(typescriptValue)) {
    if (!isRecord(javascriptValue) || !isRecord(typescriptValue)) {
      throw new Error(`${location} changed object/scalar shape.`);
    }
    const javascriptKeys = Object.keys(javascriptValue);
    const typescriptKeys = Object.keys(typescriptValue);
    assert.deepEqual(javascriptKeys, typescriptKeys, `${location} changed serialized keys.`);
    for (const key of javascriptKeys) {
      const javascriptChild = javascriptValue[key];
      const typescriptChild = typescriptValue[key];
      if (javascriptChild === undefined || typescriptChild === undefined) {
        throw new Error(`${location}.${key} is missing from one result.`);
      }
      compareSerializedValues(javascriptChild, typescriptChild, `${location}.${key}`);
    }
    return;
  }

  assert.deepEqual(javascriptValue, typescriptValue, `${location} changed serialized value.`);
}

function collectNamedFields(
  value: JsonValue,
  name: string,
  location: string,
): Array<[string, JsonValue]> {
  if (Array.isArray(value)) {
    return value.flatMap((child, index) =>
      collectNamedFields(child, name, `${location}[${index}]`),
    );
  }
  if (!isRecord(value)) return [];

  const fields: Array<[string, JsonValue]> = [];
  for (const [key, child] of Object.entries(value)) {
    if (key === name) fields.push([`${location}.${key}`, child]);
    fields.push(...collectNamedFields(child, name, `${location}.${key}`));
  }
  return fields;
}

function collectStrings(value: JsonValue, location: string): Array<[string, string]> {
  if (typeof value === "string") return [[location, value]];
  if (Array.isArray(value)) {
    return value.flatMap((child, index) => collectStrings(child, `${location}[${index}]`));
  }
  if (!isRecord(value)) return [];
  return Object.entries(value).flatMap(([key, child]) =>
    collectStrings(child, `${location}.${key}`),
  );
}

void test("complete RC-building fixture matches the independently executed pinned JavaScript baseline", async () => {
  const { stdout: revisionOutput } = await execFileAsync("git", [
    "-C",
    baselinePath,
    "rev-parse",
    "HEAD",
  ]);
  const { stdout: statusOutput } = await execFileAsync("git", [
    "-C",
    baselinePath,
    "status",
    "--porcelain",
  ]);
  assert.equal(
    revisionOutput.trim(),
    sourceRevision,
    "The live oracle is not the pinned source revision.",
  );
  assert.equal(statusOutput.trim(), "", "The live oracle requires a clean source worktree.");

  const sourceApiUnknown: unknown = await import(
    pathToFileURL(path.join(baselinePath, "src", "index.js")).href
  );
  const sourceFixtureUnknown: unknown = await import(
    pathToFileURL(path.join(baselinePath, "tests", "fixtures", "globalFemBuildingFixture.js")).href
  );
  const typescriptFixtureUnknown: unknown = await import(
    pathToFileURL(path.join(repositoryRoot, "tests", "fixtures", "globalFemBuildingFixture.ts"))
      .href
  );
  if (!isSourceApiModule(sourceApiUnknown))
    throw new Error("The pinned source API is missing the RC application.");
  if (!isFixtureModule(sourceFixtureUnknown))
    throw new Error("The pinned source fixture is incomplete.");
  if (!isFixtureModule(typescriptFixtureUnknown))
    throw new Error("The TypeScript fixture is incomplete.");

  const JavaScriptApplication = sourceApiUnknown.RcBuildingVerificationApplication;
  assert.notEqual(
    JavaScriptApplication,
    TypeScriptApi.RcBuildingVerificationApplication,
    "The parity test must instantiate independent JavaScript and TypeScript implementations.",
  );

  const javascriptInput = sourceFixtureUnknown.configureCompleteRcBuildingFixture(
    sourceFixtureUnknown.createGlobalFemBuildingFixture(),
  );
  const typescriptInput = typescriptFixtureUnknown.configureCompleteRcBuildingFixture(
    typescriptFixtureUnknown.createGlobalFemBuildingFixture(),
  );
  const javascriptResult = new JavaScriptApplication().run(javascriptInput);
  const typescriptResult = new TypeScriptApi.RcBuildingVerificationApplication().run(
    typescriptInput,
  );
  const javascriptJson = serialized(javascriptResult);
  const typescriptJson = serialized(typescriptResult);
  const javascriptSerializedValue: unknown = JSON.parse(javascriptJson);
  const typescriptSerializedValue: unknown = JSON.parse(typescriptJson);
  if (!isJsonValue(javascriptSerializedValue) || !isJsonValue(typescriptSerializedValue)) {
    throw new Error("The RC-building result is not a finite JSON value.");
  }

  compareSerializedValues(javascriptSerializedValue, typescriptSerializedValue, "result");
  assert.equal(
    javascriptJson,
    typescriptJson,
    "The complete RC-building fixture requires exact serialized JSON parity.",
  );

  for (const fieldName of compatibilityFieldNames) {
    const javascriptFields = collectNamedFields(javascriptSerializedValue, fieldName, "result");
    const typescriptFields = collectNamedFields(typescriptSerializedValue, fieldName, "result");
    assert.deepEqual(
      javascriptFields.map(([location]) => location),
      typescriptFields.map(([location]) => location),
      `${fieldName} field locations changed.`,
    );
    for (let index = 0; index < javascriptFields.length; index += 1) {
      const javascriptField = javascriptFields[index];
      const typescriptField = typescriptFields[index];
      if (javascriptField === undefined || typescriptField === undefined) {
        throw new Error(`${fieldName} field occurrence ${index} is missing from one result.`);
      }
      assert.deepEqual(
        javascriptField[1],
        typescriptField[1],
        `${fieldName} at ${javascriptField[0]} changed.`,
      );
    }
  }

  const javascriptStrings = collectStrings(javascriptSerializedValue, "result");
  const typescriptStrings = collectStrings(typescriptSerializedValue, "result");
  assert.deepEqual(
    javascriptStrings.map(([location, value]) => [location, codePoints(value)]),
    typescriptStrings.map(([location, value]) => [location, codePoints(value)]),
    "Public string Unicode code points changed.",
  );
});
