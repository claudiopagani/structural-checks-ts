import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  NTC2018_GLULAM_TIMBER_STRENGTH_CLASSES,
  NTC2018_SOLID_TIMBER_STRENGTH_CLASSES,
  NTC2018_STRUCTURAL_STEEL_GRADES,
  NTC2018_TIMBER_STRENGTH_CLASSES,
} from "../dist/index.js";
import * as targetModule from "../dist/norms/ntc2018/materials/ntc2018MaterialCatalogs.js";

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
  "ntc2018MaterialCatalogs.js",
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

function assertExactStringCodePoints(
  sourceValue: unknown,
  targetValue: unknown,
  label: string,
): void {
  if (typeof sourceValue === "string" || typeof targetValue === "string") {
    assert.equal(typeof targetValue, "string", `${label} must remain a string`);
    assert.deepEqual(
      [...(targetValue as string)].map((character) => character.codePointAt(0) ?? -1),
      [...(sourceValue as string)].map((character) => character.codePointAt(0) ?? -1),
      `${label} Unicode code points must match`,
    );
    return;
  }

  if (Array.isArray(sourceValue) || Array.isArray(targetValue)) {
    assert.equal(Array.isArray(targetValue), true, `${label} must remain an array`);
    const targetArray = targetValue as unknown[];
    const sourceArray = sourceValue as unknown[];
    assert.equal(targetArray.length, sourceArray.length, `${label} length must match`);
    sourceArray.forEach((item, index) => {
      assertExactStringCodePoints(item, targetArray[index], `${label}[${index}]`);
    });
    return;
  }

  if (sourceValue !== null && typeof sourceValue === "object") {
    assert.ok(
      targetValue !== null && typeof targetValue === "object",
      `${label} must remain an object`,
    );
    const sourceRecord = sourceValue as Record<string, unknown>;
    const targetRecord = targetValue as Record<string, unknown>;
    assert.deepEqual(
      Object.keys(targetRecord),
      Object.keys(sourceRecord),
      `${label} keys must match`,
    );
    for (const key of Object.keys(sourceRecord)) {
      assertExactStringCodePoints(sourceRecord[key], targetRecord[key], `${label}.${key}`);
    }
  }
}

const catalogNames = [
  "NTC2018_STRUCTURAL_STEEL_GRADES",
  "NTC2018_SOLID_TIMBER_STRENGTH_CLASSES",
  "NTC2018_GLULAM_TIMBER_STRENGTH_CLASSES",
  "NTC2018_TIMBER_STRENGTH_CLASSES",
] as const;

void test("NTC 2018 material catalog module matches the pinned JavaScript exactly", () => {
  assert.equal(gitOutput(sourceRoot, "rev-parse", "HEAD"), sourceRevision);
  assert.equal(gitOutput(sourceRoot, "status", "--porcelain"), "");
  assert.equal(gitOutput(normativeRoot, "rev-parse", "HEAD"), normativeRevision);
  assert.equal(gitOutput(normativeRoot, "status", "--porcelain"), "");

  assert.deepEqual(Object.keys(targetModule).sort(), Object.keys(sourceModule).sort());
  for (const name of catalogNames) {
    const sourceValue = sourceModule[name];
    const targetValue = targetModule[name];
    assert.deepEqual(targetValue, sourceValue, `${name} values must match`);
    assert.equal(
      JSON.stringify(targetValue),
      JSON.stringify(sourceValue),
      `${name} JSON must match`,
    );
    assertExactStringCodePoints(sourceValue, targetValue, name);
    assert.equal(
      Object.isFrozen(targetValue),
      Object.isFrozen(sourceValue),
      `${name} mutability must match`,
    );
  }
});

void test("NTC 2018 material catalog root aliases preserve exact values and missing-key behavior", () => {
  for (const name of catalogNames) {
    const sourceValue = sourceIndex[name];
    const targetValue = {
      NTC2018_STRUCTURAL_STEEL_GRADES,
      NTC2018_SOLID_TIMBER_STRENGTH_CLASSES,
      NTC2018_GLULAM_TIMBER_STRENGTH_CLASSES,
      NTC2018_TIMBER_STRENGTH_CLASSES,
    }[name];
    assert.deepEqual(targetValue, sourceValue, `${name} root alias must match`);
    assert.equal(
      JSON.stringify(targetValue),
      JSON.stringify(sourceValue),
      `${name} root JSON must match`,
    );
    assert.equal(
      Object.hasOwn(targetValue, "missing"),
      Object.hasOwn(sourceValue as object, "missing"),
    );
    assert.equal(
      (targetValue as Record<string, unknown>).missing,
      (sourceValue as Record<string, unknown>).missing,
      `${name} missing-key behavior must match`,
    );
  }
});
