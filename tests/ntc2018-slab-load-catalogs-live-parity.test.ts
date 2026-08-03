import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";
import path from "node:path";
import { pathToFileURL } from "node:url";

import * as targetIndex from "../dist/index.js";
import * as targetModule from "../dist/norms/ntc2018/loads/ntc2018SlabLoadCatalogs.js";

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
  "ntc2018SlabLoadCatalogs.js",
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

function call(module: Record<string, unknown>, name: string, ...args: unknown[]): unknown {
  const candidate = module[name];
  assert.equal(typeof candidate, "function", `${name} must be callable`);
  if (typeof candidate !== "function") {
    throw new Error(`${name} must be callable`);
  }
  return Reflect.apply(candidate, undefined, args);
}

function serialize(value: unknown): unknown {
  const json = JSON.stringify(value);
  assert.notEqual(json, undefined);
  return JSON.parse(json) as unknown;
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

function normalizeVariableLoad(value: unknown): unknown {
  const json = serialize(value);
  assert.ok(json !== null && typeof json === "object" && !Array.isArray(json));
  if (json === null || typeof json !== "object" || Array.isArray(json)) {
    throw new Error("Expected a serialized variable load.");
  }
  const normalized = { ...json } as Record<string, unknown>;
  delete normalized.id;
  delete normalized.variableLoadId;
  return normalized;
}

const rootExports = [
  "NTC2018_SLAB_MATERIAL_WEIGHT_DATABASE",
  "NTC2018_SLAB_VARIABLE_ACTIONS_DATABASE",
  "SLAB_MATERIAL_WEIGHT_PRESET_DATABASE",
  "SLAB_MATERIAL_WEIGHT_PRESET_METADATA",
  "createNTC2018SlabVariableLoad",
  "getNTC2018SlabVariableAction",
  "getNTC2018SlabWeightValue",
  "getSlabMaterialWeightPresetValue",
  "listNTC2018SlabWeightCategories",
  "listNTC2018SlabWeightEntries",
  "listSlabMaterialWeightPresetCategories",
  "listSlabMaterialWeightPresetEntries",
];

void test("pinned repositories and slab-catalog exports remain independent", () => {
  assert.equal(gitOutput(sourceRoot, "rev-parse", "HEAD"), sourceRevision);
  assert.equal(gitOutput(sourceRoot, "status", "--porcelain"), "");
  assert.equal(gitOutput(normativeRoot, "rev-parse", "HEAD"), normativeRevision);
  assert.equal(gitOutput(normativeRoot, "status", "--porcelain"), "");
  assert.deepEqual(Object.keys(sourceModule).sort(), Object.keys(targetModule).sort());

  for (const name of rootExports) {
    assert.equal(
      typeof sourceIndex[name],
      typeof Reflect.get(targetIndex, name),
      `${name} root export type`,
    );
  }
});

void test("catalog constants, aliases, clones, exact values, and Unicode match exactly", () => {
  for (const name of [
    "SLAB_MATERIAL_WEIGHT_PRESET_METADATA",
    "SLAB_MATERIAL_WEIGHT_PRESET_DATABASE",
    "NTC2018_SLAB_MATERIAL_WEIGHT_DATABASE",
    "NTC2018_SLAB_VARIABLE_ACTIONS_DATABASE",
  ]) {
    assert.deepEqual(serialize(Reflect.get(targetModule, name)), serialize(sourceModule[name]));
  }

  assert.strictEqual(
    Reflect.get(targetModule, "NTC2018_SLAB_MATERIAL_WEIGHT_DATABASE"),
    Reflect.get(targetModule, "SLAB_MATERIAL_WEIGHT_PRESET_DATABASE"),
  );
  assert.equal(Object.isFrozen(targetModule.NTC2018_SLAB_VARIABLE_ACTIONS_DATABASE), true);
  assert.equal(Object.isFrozen(targetModule.NTC2018_SLAB_VARIABLE_ACTIONS_DATABASE[0]), true);

  const categories = ["volumeWeights", "surfaceWeights", "lineWeights"];
  for (const weightType of categories) {
    assert.deepEqual(
      call(targetModule, "listSlabMaterialWeightPresetCategories", weightType),
      call(sourceModule, "listSlabMaterialWeightPresetCategories", weightType),
    );
  }

  const lookupCases = [
    ["surfaceWeights", "Roofing", "Manto di copertura in tegole di laterizio (coppi/embrici)"],
    ["lineWeights", "IPE", "IPE 300"],
    [
      "volumeWeights",
      "Masonry",
      "Muratura in blocchi di laterizio forato (es. forati da 800 kg/m3)",
    ],
  ];
  for (const [weightType, category, description] of lookupCases) {
    const options = { weightType, category, description };
    assert.deepEqual(
      call(targetModule, "getSlabMaterialWeightPresetValue", options),
      call(sourceModule, "getSlabMaterialWeightPresetValue", options),
    );
    assert.deepEqual(
      call(targetModule, "getNTC2018SlabWeightValue", options),
      call(sourceModule, "getNTC2018SlabWeightValue", options),
    );
  }

  const sourceEntries = call(
    sourceModule,
    "listSlabMaterialWeightPresetEntries",
    "lineWeights",
    "IPE",
  );
  const targetEntries = call(
    targetModule,
    "listSlabMaterialWeightPresetEntries",
    "lineWeights",
    "IPE",
  );
  assert.deepEqual(targetEntries, sourceEntries);
  const firstLineWeightGroup = targetModule.SLAB_MATERIAL_WEIGHT_PRESET_DATABASE.lineWeights[0];
  assert.ok(firstLineWeightGroup);
  assert.notStrictEqual(targetEntries, firstLineWeightGroup.entries);

  for (const actionId of [1, 4, 14, 18]) {
    assert.deepEqual(
      call(targetModule, "getNTC2018SlabVariableAction", actionId),
      call(sourceModule, "getNTC2018SlabVariableAction", actionId),
    );
  }
});

void test("variable-load factory preserves exact values, metadata, serialization, and Unicode", () => {
  const cases = [
    { actionId: 4, units: { force: "kN", length: "m" } },
    {
      actionId: 4,
      description: "Solaio μ—1",
      qk: 3.25,
      documentation: { reference: "legacy catalog μ—1", note: "azione variabile" },
      units: { force: "N", length: "mm" },
    },
  ];

  for (const options of cases) {
    const source = call(sourceModule, "createNTC2018SlabVariableLoad", options);
    const target = call(targetModule, "createNTC2018SlabVariableLoad", options);
    assert.deepEqual(normalizeVariableLoad(target), normalizeVariableLoad(source));
    assert.equal(
      JSON.stringify(normalizeVariableLoad(target)),
      JSON.stringify(normalizeVariableLoad(source)),
    );
  }
});

void test("unsupported and missing-input errors match exactly", () => {
  const cases: Array<[string, unknown[]]> = [
    ["listSlabMaterialWeightPresetCategories", ["unsupported"]],
    ["listSlabMaterialWeightPresetEntries", ["surfaceWeights", "unsupported"]],
    [
      "getSlabMaterialWeightPresetValue",
      [{ weightType: "surfaceWeights", category: "Roofing", description: "unsupported" }],
    ],
    ["getNTC2018SlabVariableAction", [999]],
    ["createNTC2018SlabVariableLoad", [{ actionId: 4 }]],
    [
      "createNTC2018SlabVariableLoad",
      [{ actionId: 4, units: { force: "kN", length: "m" }, qk: 0 }],
    ],
  ];

  for (const [name, args] of cases) {
    assert.deepEqual(
      errorSignature(() => call(targetModule, name, ...args)),
      errorSignature(() => call(sourceModule, name, ...args)),
    );
  }
});
