import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  DM522023_AMENDMENTS,
  DM522023_REFERENCES,
  describeDM522023Amendment,
} from "../dist/index.js";

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
  "reinforced-concrete",
  "dm522023.js",
);
const sourceIndexPath = path.join(sourceRoot, "src", "index.js");

const sourceModule = (await import(pathToFileURL(sourceModulePath).href)) as Record<
  string,
  unknown
>;
const sourceIndex = (await import(pathToFileURL(sourceIndexPath).href)) as Record<string, unknown>;
const sourceDescribe = sourceModule.describeDM522023Amendment as (
  clause?: unknown,
) => Record<string, unknown>;

function gitOutput(repository: string, ...args: string[]): string {
  return execFileSync("git", ["-C", repository, ...args], { encoding: "utf8" }).trim();
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

void test("D.M. 52/2023 catalogs and public exports match the pinned source", () => {
  assert.equal(gitOutput(sourceRoot, "rev-parse", "HEAD"), sourceRevision);
  assert.equal(gitOutput(sourceRoot, "status", "--porcelain"), "");
  assert.equal(gitOutput(normativeRoot, "rev-parse", "HEAD"), normativeRevision);
  assert.equal(gitOutput(normativeRoot, "status", "--porcelain"), "");

  const targetModule = {
    DM522023_AMENDMENTS,
    DM522023_REFERENCES,
    describeDM522023Amendment,
  };
  assert.deepEqual(Object.keys(targetModule).sort(), Object.keys(sourceModule).sort());
  assert.deepEqual(DM522023_REFERENCES, sourceModule.DM522023_REFERENCES);
  assert.deepEqual(DM522023_AMENDMENTS, sourceModule.DM522023_AMENDMENTS);
  assert.equal(
    JSON.stringify(DM522023_REFERENCES),
    JSON.stringify(sourceModule.DM522023_REFERENCES),
  );
  assert.equal(
    JSON.stringify(DM522023_AMENDMENTS),
    JSON.stringify(sourceModule.DM522023_AMENDMENTS),
  );

  for (const value of [sourceModule.DM522023_REFERENCES, sourceModule.DM522023_AMENDMENTS]) {
    assert.equal(Object.isFrozen(value as object), true);
  }
  assert.equal(Object.isFrozen(DM522023_REFERENCES), true);
  assert.equal(Object.isFrozen(DM522023_AMENDMENTS), true);
  const [firstReference] = DM522023_REFERENCES;
  assert.ok(firstReference);
  assert.equal(Object.isFrozen(firstReference), true);
  assert.equal(Object.isFrozen(DM522023_AMENDMENTS.temporarySuspensions), true);
  const [firstSuspension] = DM522023_AMENDMENTS.temporarySuspensions;
  assert.ok(firstSuspension);
  assert.equal(Object.isFrozen(firstSuspension), true);

  const [sourceFirstReference] = sourceModule.DM522023_REFERENCES as readonly Record<
    string,
    unknown
  >[];
  assert.ok(sourceFirstReference);
  if (typeof sourceFirstReference.publication !== "string") {
    throw new Error("The pinned source reference must contain a publication string.");
  }
  const sourcePublication = sourceFirstReference.publication;
  assert.deepEqual(codePoints(firstReference.publication ?? ""), codePoints(sourcePublication));

  for (const name of ["DM522023_AMENDMENTS", "DM522023_REFERENCES"] as const) {
    assert.deepEqual(
      name === "DM522023_AMENDMENTS" ? DM522023_AMENDMENTS : DM522023_REFERENCES,
      sourceIndex[name],
    );
  }
  assert.equal(typeof sourceIndex.describeDM522023Amendment, "function");
});

void test("D.M. 52/2023 clause lookup serializes and branches exactly", () => {
  for (const clause of ["11.4.2", "11.5.2", "7.4.6.2.2", " 11.4.2 ", 11.4]) {
    const sourceResult = sourceDescribe(clause);
    const typescriptResult = describeDM522023Amendment(clause);
    assert.deepEqual(typescriptResult, sourceResult);
    assert.equal(JSON.stringify(typescriptResult), JSON.stringify(sourceResult));
  }

  const missingCases: unknown[] = ["", "   ", null, undefined];
  for (const clause of missingCases) {
    assert.deepEqual(
      errorSignature(() => sourceDescribe(clause)),
      errorSignature(() => describeDM522023Amendment(clause)),
    );
  }
});
