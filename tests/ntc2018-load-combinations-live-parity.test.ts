import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  createNTC2018PermanentAction,
  createNTC2018SLECombination,
  createNTC2018ULSFundamentalCombination,
  createNTC2018VariableAction,
  createNTC2018WindAction,
} from "../dist/index.js";
import * as targetModule from "../dist/norms/ntc2018/loads/createNTC2018LoadCombination.js";

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
  "createNTC2018LoadCombination.js",
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

interface RuntimeLoadCombination {
  toJSON(): unknown;
  evaluate(loadResultsByCaseId: Record<string, number>): number;
}

function assertLoadCombination(
  value: unknown,
  label: string,
): asserts value is RuntimeLoadCombination {
  assert.ok(value !== null && typeof value === "object", `${label} must be an object`);
  assert.equal(
    typeof Reflect.get(value, "toJSON"),
    "function",
    `${label}.toJSON must be a function`,
  );
  assert.equal(
    typeof Reflect.get(value, "evaluate"),
    "function",
    `${label}.evaluate must be a function`,
  );
}

function sourceActions(): Record<string, unknown> {
  assertFunction(sourceIndex.createNTC2018PermanentAction, "source permanent action factory");
  assertFunction(sourceIndex.createNTC2018VariableAction, "source variable action factory");
  assertFunction(sourceIndex.createNTC2018WindAction, "source wind action factory");

  const permanent = sourceIndex.createNTC2018PermanentAction({
    id: "ACT-G1",
    permanentClass: "G1",
    loadCase: { id: "G1" },
  });
  const variable = sourceIndex.createNTC2018VariableAction({
    id: "ACT-QB",
    category: "B",
    loadCase: { id: "QB" },
  });
  const wind = sourceIndex.createNTC2018WindAction({ id: "ACT-W", loadCase: { id: "W" } });
  return { permanent, variable, wind };
}

const sourceUls = sourceModule.createNTC2018ULSFundamentalCombination;
const sourceSle = sourceModule.createNTC2018SLECombination;
assertFunction(sourceUls, "source ULS combination factory");
assertFunction(sourceSle, "source SLE combination factory");

void test("NTC 2018 load-combination factories match pinned JavaScript exactly", () => {
  assert.equal(gitOutput(sourceRoot, "rev-parse", "HEAD"), sourceRevision);
  assert.equal(gitOutput(sourceRoot, "status", "--porcelain"), "");
  assert.equal(gitOutput(normativeRoot, "rev-parse", "HEAD"), normativeRevision);
  assert.equal(gitOutput(normativeRoot, "status", "--porcelain"), "");
  assert.deepEqual(Object.keys(targetModule).sort(), Object.keys(sourceModule).sort());

  const source = sourceActions();
  const sourceUlsResult = sourceUls({
    id: "ULS-μ",
    name: "ULS μ",
    permanentActions: [source.permanent],
    variableActions: [source.variable, source.wind],
    leadingVariableAction: source.variable,
    metadata: { label: "combinazione μ" },
  });
  const sourceSleResult = sourceSle({
    id: "SLE-μ",
    name: "SLE μ",
    type: "FREQUENT",
    permanentActions: [source.permanent],
    variableActions: [source.variable, source.wind],
    leadingVariableAction: source.variable,
    metadata: { label: "servizio μ" },
  });
  assertLoadCombination(sourceUlsResult, "source ULS combination");
  assertLoadCombination(sourceSleResult, "source SLE combination");

  const targetPermanent = createNTC2018PermanentAction({
    id: "ACT-G1",
    permanentClass: "G1",
    loadCase: { id: "G1" },
  });
  const targetVariable = createNTC2018VariableAction({
    id: "ACT-QB",
    category: "B",
    loadCase: { id: "QB" },
  });
  const targetWind = createNTC2018WindAction({ id: "ACT-W", loadCase: { id: "W" } });
  const targetUlsResult = createNTC2018ULSFundamentalCombination({
    id: "ULS-μ",
    name: "ULS μ",
    permanentActions: [targetPermanent],
    variableActions: [targetVariable, targetWind],
    leadingVariableAction: targetVariable,
    metadata: { label: "combinazione μ" },
  });
  const targetSleResult = createNTC2018SLECombination({
    id: "SLE-μ",
    name: "SLE μ",
    type: "FREQUENT",
    permanentActions: [targetPermanent],
    variableActions: [targetVariable, targetWind],
    leadingVariableAction: targetVariable,
    metadata: { label: "servizio μ" },
  });

  assert.equal(JSON.stringify(targetUlsResult), JSON.stringify(sourceUlsResult));
  assert.equal(JSON.stringify(targetSleResult), JSON.stringify(sourceSleResult));
  assert.deepEqual(targetUlsResult.toJSON(), sourceUlsResult.toJSON());
  assert.deepEqual(targetSleResult.toJSON(), sourceSleResult.toJSON());
  assert.equal(
    targetUlsResult.evaluate({ G1: 10, QB: 3, W: 2 }),
    sourceUlsResult.evaluate({ G1: 10, QB: 3, W: 2 }),
  );
  assert.equal(
    targetSleResult.evaluate({ G1: 10, QB: 3, W: 2 }),
    sourceSleResult.evaluate({ G1: 10, QB: 3, W: 2 }),
  );

  const sourcePlainUls = sourceUls({
    id: "ULS-plain",
    permanentActions: [{ actionType: "G2", favourable: true, loadCase: { id: "G2" } }],
    variableActions: [{ category: "B", loadCase: { id: "QB" } }],
    leadingVariableAction: { category: "B", loadCase: { id: "QB" } },
  });
  const targetPlainUls = createNTC2018ULSFundamentalCombination({
    id: "ULS-plain",
    permanentActions: [{ actionType: "G2", favourable: true, loadCase: { id: "G2" } }],
    variableActions: [{ category: "B", loadCase: { id: "QB" } }],
    leadingVariableAction: { category: "B", loadCase: { id: "QB" } },
  });
  const sourcePlainSle = sourceSle({
    id: "SLE-plain",
    type: "QUASI_PERMANENT",
    variableActions: [{ category: "B", loadCase: { id: "QB" } }],
  });
  const targetPlainSle = createNTC2018SLECombination({
    id: "SLE-plain",
    type: "QUASI_PERMANENT",
    variableActions: [{ category: "B", loadCase: { id: "QB" } }],
  });
  assert.equal(JSON.stringify(targetPlainUls), JSON.stringify(sourcePlainUls));
  assert.equal(JSON.stringify(targetPlainSle), JSON.stringify(sourcePlainSle));

  assert.strictEqual(
    targetModule.createNTC2018ULSFundamentalCombination,
    createNTC2018ULSFundamentalCombination,
  );
  assert.strictEqual(targetModule.createNTC2018SLECombination, createNTC2018SLECombination);
  assert.equal(typeof sourceIndex.createNTC2018ULSFundamentalCombination, "function");
  assert.equal(typeof sourceIndex.createNTC2018SLECombination, "function");
});

void test("NTC 2018 load-combination factories preserve unsupported and missing-input errors", () => {
  const cases: Array<{ source: () => unknown; target: () => unknown }> = [
    {
      source: () => sourceUls({ id: "ULS-1" }),
      target: () => createNTC2018ULSFundamentalCombination({ id: "ULS-1" }),
    },
    {
      source: () => sourceSle({ id: "SLE-1", type: "UNSUPPORTED" }),
      target: () => createNTC2018SLECombination({ id: "SLE-1", type: "UNSUPPORTED" }),
    },
    {
      source: () =>
        sourceSle({
          id: "SLE-1",
          type: "FREQUENT",
          variableActions: [sourceActions().variable],
        }),
      target: () =>
        createNTC2018SLECombination({
          id: "SLE-1",
          type: "FREQUENT",
          variableActions: [
            createNTC2018VariableAction({
              id: "ACT-QB",
              category: "B",
              loadCase: { id: "QB" },
            }),
          ],
        }),
    },
    {
      source: () =>
        sourceUls({
          id: "ULS-1",
          variableActions: [{ category: "B" }],
          leadingVariableAction: { category: "B" },
        }),
      target: () =>
        createNTC2018ULSFundamentalCombination({
          id: "ULS-1",
          variableActions: [{ category: "B" }],
          leadingVariableAction: { category: "B" },
        }),
    },
    {
      source: () =>
        sourceSle({
          id: "SLE-1",
          type: "QUASI_PERMANENT",
          variableActions: [{ category: "UNSUPPORTED", loadCase: { id: "Q" } }],
        }),
      target: () =>
        createNTC2018SLECombination({
          id: "SLE-1",
          type: "QUASI_PERMANENT",
          variableActions: [{ category: "UNSUPPORTED", loadCase: { id: "Q" } }],
        }),
    },
    {
      source: () => Reflect.apply(sourceSle, undefined, [null]),
      target: () => {
        Reflect.apply(createNTC2018SLECombination, undefined, [null]);
        throw new Error("Expected the callback to throw.");
      },
    },
  ];

  for (const { source, target } of cases) {
    assert.deepEqual(errorSignature(source), errorSignature(target));
  }
});
