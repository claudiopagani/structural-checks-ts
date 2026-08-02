import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  NTC2018_ACTION_COMBINATION_FACTORS,
  NTC2018_ACTION_PARTIAL_FACTORS,
} from "../dist/index.js";
import { NTC2018_ULS_PARTIAL_FACTORS, NTC2018_VARIABLE_ACTION_CATEGORIES } from "../dist/index.js";
import * as targetModule from "../dist/norms/ntc2018/loads/ntc2018LoadParameters.js";

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
  "loads",
  "ntc2018LoadParameters.js",
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

const parameterNames = [
  "NTC2018_VARIABLE_ACTION_CATEGORIES",
  "NTC2018_ULS_PARTIAL_FACTORS",
] as const;

void test("NTC 2018 load-parameter exports match the pinned JavaScript exactly", () => {
  assert.equal(gitOutput(sourceRoot, "rev-parse", "HEAD"), sourceRevision);
  assert.equal(gitOutput(sourceRoot, "status", "--porcelain"), "");
  assert.equal(gitOutput(normativeRoot, "rev-parse", "HEAD"), normativeRevision);
  assert.equal(gitOutput(normativeRoot, "status", "--porcelain"), "");

  assert.deepEqual(Object.keys(targetModule).sort(), Object.keys(sourceModule).sort());
  for (const name of parameterNames) {
    assert.deepEqual(targetModule[name], sourceModule[name], `${name} values must match`);
    assert.equal(
      JSON.stringify(targetModule[name]),
      JSON.stringify(sourceModule[name]),
      `${name} JSON must match`,
    );
    assert.equal(
      Object.isFrozen(targetModule[name]),
      Object.isFrozen(sourceModule[name]),
      `${name} mutability must match`,
    );
  }
});

void test("NTC 2018 load-parameter aliases preserve identity and unsupported-key behavior", () => {
  assert.strictEqual(NTC2018_VARIABLE_ACTION_CATEGORIES, NTC2018_ACTION_COMBINATION_FACTORS);
  const permanentPartialFactors = NTC2018_ACTION_PARTIAL_FACTORS.permanent;
  const variablePartialFactors = NTC2018_ACTION_PARTIAL_FACTORS.variable;
  assert.ok(permanentPartialFactors);
  assert.ok(variablePartialFactors);
  const permanentG1PartialFactors = permanentPartialFactors.G1;
  const imposedPartialFactors = variablePartialFactors.imposed;
  assert.ok(permanentG1PartialFactors);
  assert.ok(imposedPartialFactors);
  const permanentG1A1PartialFactors = permanentG1PartialFactors.A1;
  const imposedA1PartialFactors = imposedPartialFactors.A1;
  assert.ok(permanentG1A1PartialFactors);
  assert.ok(imposedA1PartialFactors);
  assert.equal(
    NTC2018_ULS_PARTIAL_FACTORS.G1_UNFAVOURABLE,
    permanentG1A1PartialFactors.unfavourable,
  );
  assert.equal(NTC2018_ULS_PARTIAL_FACTORS.Q_FAVOURABLE, imposedA1PartialFactors.favourable);

  for (const name of parameterNames) {
    const sourceValue = sourceIndex[name];
    const targetValue =
      name === "NTC2018_VARIABLE_ACTION_CATEGORIES"
        ? NTC2018_VARIABLE_ACTION_CATEGORIES
        : NTC2018_ULS_PARTIAL_FACTORS;
    assert.deepEqual(targetValue, sourceValue, `${name} root alias must match`);
    assert.equal(
      JSON.stringify(targetValue),
      JSON.stringify(sourceValue),
      `${name} root JSON must match`,
    );
    assert.equal(
      (targetValue as Record<string, unknown>).UNSUPPORTED,
      (sourceValue as Record<string, unknown>).UNSUPPORTED,
      `${name} unsupported-key behavior must match`,
    );
  }
});
