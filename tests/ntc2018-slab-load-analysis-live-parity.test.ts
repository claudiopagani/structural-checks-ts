import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";
import path from "node:path";
import { pathToFileURL } from "node:url";

import * as targetIndex from "../dist/index.js";
import * as targetModule from "../dist/norms/ntc2018/loads/NTC2018SlabLoadAnalysis.js";

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
  "NTC2018SlabLoadAnalysis.js",
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

function assertConstructor(
  value: unknown,
  label: string,
): asserts value is new (argument: unknown) => {
  calculateULS(coefficients?: unknown): unknown;
  calculateSLE(): unknown;
} {
  assert.equal(typeof value, "function", `${label} must be a constructor`);
}

function assertValueConstructor(
  value: unknown,
  label: string,
): asserts value is new (options: unknown) => unknown {
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

const sourceAnalysis = sourceModule.NTC2018SlabLoadAnalysis;
const targetAnalysis = targetModule.NTC2018SlabLoadAnalysis;
const sourceFloorSlab = sourceIndex.FloorSlab;
assertConstructor(sourceAnalysis, "source NTC 2018 slab-load analysis");
assertConstructor(targetAnalysis, "target NTC 2018 slab-load analysis");
assertValueConstructor(sourceFloorSlab, "source FloorSlab");

void test("NTC 2018 slab-load analysis re-export matches the pinned JavaScript module", () => {
  assert.equal(gitOutput(sourceRoot, "rev-parse", "HEAD"), sourceRevision);
  assert.equal(gitOutput(sourceRoot, "status", "--porcelain"), "");
  assert.equal(gitOutput(normativeRoot, "rev-parse", "HEAD"), normativeRevision);
  assert.equal(gitOutput(normativeRoot, "status", "--porcelain"), "");

  assert.deepEqual(Object.keys(targetModule).sort(), Object.keys(sourceModule).sort());
  assert.strictEqual(sourceAnalysis, sourceIndex.NTC2018SlabLoadAnalysis);
  assert.strictEqual(targetAnalysis, targetIndex.NTC2018SlabLoadAnalysis);
  assert.notStrictEqual(sourceAnalysis, targetAnalysis);

  const sourceSlab = new sourceFloorSlab({ description: "Solaio μ", loads: [] });
  const targetSlab = new targetIndex.FloorSlab({ description: "Solaio μ", loads: [] });
  const sourceResult = new sourceAnalysis(sourceSlab);
  const targetResult = new targetAnalysis(targetSlab);
  const sourceJson = {
    uls: sourceResult.calculateULS({ qUnfavourable: 1.35 }),
    sle: sourceResult.calculateSLE(),
  };
  const targetJson = {
    uls: targetResult.calculateULS({ qUnfavourable: 1.35 }),
    sle: targetResult.calculateSLE(),
  };

  assert.equal(JSON.stringify(targetJson), JSON.stringify(sourceJson));
  assert.deepEqual(targetJson, sourceJson);
});

void test("NTC 2018 slab-load analysis re-export preserves error behavior", () => {
  const sourceError = errorSignature(() => {
    const analysis = new sourceAnalysis(null);
    analysis.calculateULS();
  });
  const targetError = errorSignature(() => {
    const analysis = new targetAnalysis(null);
    analysis.calculateULS();
  });

  assert.deepEqual(targetError, sourceError);
});
