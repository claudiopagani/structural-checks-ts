import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  createNTC2018BeamCombinations,
  createNTC2018PermanentAction,
  createNTC2018SnowAction,
  createNTC2018VariableAction,
} from "../dist/index.js";
import type { NTC2018BeamCombinationInput } from "../dist/index.js";
import * as targetModule from "../dist/norms/ntc2018/beams/createNTC2018BeamCombinations.js";

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
  "beams",
  "createNTC2018BeamCombinations.js",
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

function errorSignature(callback: () => unknown): { name: string; message: string } {
  try {
    callback();
  } catch (error) {
    assert.ok(error instanceof Error);
    return { name: error.name, message: error.message };
  }
  throw new Error("Expected the callback to throw.");
}

function sourceLoads(): unknown[] {
  assertFunction(sourceIndex.createNTC2018PermanentAction, "source permanent action factory");
  assertFunction(sourceIndex.createNTC2018VariableAction, "source variable action factory");
  assertFunction(sourceIndex.createNTC2018SnowAction, "source snow action factory");

  return [
    {
      id: "g1",
      loadCaseId: "G1",
      value: -2,
      action: sourceIndex.createNTC2018PermanentAction({
        id: "ACT-G1",
        permanentClass: "G1",
      }),
    },
    {
      id: "g2",
      loadCaseId: "G2",
      value: -1,
      action: sourceIndex.createNTC2018PermanentAction({
        id: "ACT-G2",
        permanentClass: "G2",
      }),
    },
    {
      id: "live",
      loadCaseId: "LIVE",
      value: -3,
      action: sourceIndex.createNTC2018VariableAction({
        id: "ACT-LIVE",
        category: "B",
      }),
    },
    {
      id: "snow",
      loadCaseId: "SNOW",
      value: -0.5,
      action: sourceIndex.createNTC2018SnowAction({ id: "ACT-SNOW" }),
    },
  ];
}

function targetLoads(): NTC2018BeamCombinationInput[] {
  return [
    {
      id: "g1",
      loadCaseId: "G1",
      value: -2,
      action: createNTC2018PermanentAction({ id: "ACT-G1", permanentClass: "G1" }),
    },
    {
      id: "g2",
      loadCaseId: "G2",
      value: -1,
      action: createNTC2018PermanentAction({ id: "ACT-G2", permanentClass: "G2" }),
    },
    {
      id: "live",
      loadCaseId: "LIVE",
      value: -3,
      action: createNTC2018VariableAction({ id: "ACT-LIVE", category: "B" }),
    },
    {
      id: "snow",
      loadCaseId: "SNOW",
      value: -0.5,
      action: createNTC2018SnowAction({ id: "ACT-SNOW" }),
    },
  ];
}

const sourceCreate = sourceModule.createNTC2018BeamCombinations;
assertFunction(sourceCreate, "source beam combination factory");

void test("NTC 2018 beam combinations match the pinned JavaScript exactly", () => {
  assert.equal(gitOutput(sourceRoot, "rev-parse", "HEAD"), sourceRevision);
  assert.equal(gitOutput(sourceRoot, "status", "--porcelain"), "");
  assert.equal(gitOutput(normativeRoot, "rev-parse", "HEAD"), normativeRevision);
  assert.equal(gitOutput(normativeRoot, "status", "--porcelain"), "");

  assert.deepEqual(Object.keys(targetModule).sort(), Object.keys(sourceModule).sort());
  const sourceResult = sourceCreate({ loads: sourceLoads(), idPrefix: "beam-01" });
  const targetResult = createNTC2018BeamCombinations({
    loads: targetLoads(),
    idPrefix: "beam-01",
  });

  assert.equal(JSON.stringify(targetResult), JSON.stringify(sourceResult));
  assert.deepEqual(
    JSON.parse(JSON.stringify(targetResult)),
    JSON.parse(JSON.stringify(sourceResult)),
  );
  assert.equal(targetResult.length, 7);
});

void test("NTC 2018 beam combination aliases and plain inputs preserve exact JSON", () => {
  const sourceResult = sourceCreate({
    permanentActions: [{ id: "g", loadCaseId: "G1", nature: "permanent", permanentClass: "G1" }],
    variableActions: [
      {
        id: "q",
        loadCaseId: "Q μ",
        nature: "variable",
        category: "C",
        leadingEligible: false,
        metadata: { label: "azione μ" },
      },
    ],
    types: ["SLU", "RARE", "FREQUENT", "SLS_QP"],
    idPrefix: "alias beam",
  });
  const targetResult = createNTC2018BeamCombinations({
    permanentActions: [{ id: "g", loadCaseId: "G1", nature: "permanent", permanentClass: "G1" }],
    variableActions: [
      {
        id: "q",
        loadCaseId: "Q μ",
        nature: "variable",
        category: "C",
        leadingEligible: false,
        metadata: { label: "azione μ" },
      },
    ],
    types: ["SLU", "RARE", "FREQUENT", "SLS_QP"],
    idPrefix: "alias beam",
  });

  assert.equal(JSON.stringify(targetResult), JSON.stringify(sourceResult));
});

void test("NTC 2018 beam combination errors match the pinned JavaScript", () => {
  const cases: Array<{ source: () => unknown; target: () => unknown }> = [
    {
      source: () => sourceCreate({ permanentActions: [{ nature: "permanent" }] }),
      target: () => createNTC2018BeamCombinations({ permanentActions: [{ nature: "permanent" }] }),
    },
    {
      source: () => sourceCreate({ variableActions: [{ loadCaseId: "Q", nature: "variable" }] }),
      target: () =>
        createNTC2018BeamCombinations({
          variableActions: [{ loadCaseId: "Q", nature: "variable" }],
        }),
    },
    {
      source: () => sourceCreate({ types: ["UNSUPPORTED"] }),
      target: () => createNTC2018BeamCombinations({ types: ["UNSUPPORTED"] }),
    },
    {
      source: () => Reflect.apply(sourceCreate, undefined, [null]),
      target: () => {
        Reflect.apply(createNTC2018BeamCombinations, undefined, [null]);
        throw new Error("Expected the callback to throw.");
      },
    },
  ];

  for (const { source, target } of cases) {
    assert.deepEqual(errorSignature(source), errorSignature(target));
  }
});

void test("NTC 2018 beam combination root export matches the pinned source", () => {
  assert.deepEqual(
    JSON.stringify(createNTC2018BeamCombinations),
    JSON.stringify(sourceIndex.createNTC2018BeamCombinations),
  );
});
