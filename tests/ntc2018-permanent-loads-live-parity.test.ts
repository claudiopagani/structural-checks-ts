import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";
import path from "node:path";
import { pathToFileURL } from "node:url";

import * as targetIndex from "../dist/index.js";
import * as targetModule from "../dist/norms/ntc2018/loads/ntc2018PermanentLoads.js";

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
  "ntc2018PermanentLoads.js",
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

function errorSignature(callback: () => unknown): { name: string; message: string } {
  try {
    callback();
  } catch (error) {
    assert.ok(error instanceof Error);
    return { name: error.name, message: error.message };
  }
  throw new Error("Expected the callback to throw.");
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
  const serialized = JSON.stringify(value);
  if (serialized === undefined) {
    throw new Error("Expected a serializable object.");
  }
  return JSON.parse(serialized) as unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

void test("pinned repositories and permanent-load module exports remain independent", () => {
  assert.equal(gitOutput(sourceRoot, "rev-parse", "HEAD"), sourceRevision);
  assert.equal(gitOutput(sourceRoot, "status", "--porcelain"), "");
  assert.equal(gitOutput(normativeRoot, "rev-parse", "HEAD"), normativeRevision);
  assert.equal(gitOutput(normativeRoot, "status", "--porcelain"), "");

  assert.deepEqual(Object.keys(sourceModule).sort(), Object.keys(targetModule).sort());
  for (const name of [
    "NTC2018_PERMANENT_LOAD_REFERENCES",
    "NTC2018_UNIT_WEIGHT_CATALOG",
    "calculateNTC2018AreaSelfWeight",
    "calculateNTC2018EquivalentPartitionAreaLoad",
    "calculateNTC2018LineSelfWeight",
    "calculateNTC2018PermanentAreaLoads",
    "calculateNTC2018SelfWeight",
    "getNTC2018UnitWeightDefinition",
    "listNTC2018UnitWeightDefinitions",
    "resolveNTC2018UnitWeight",
  ]) {
    assert.equal(
      typeof sourceIndex[name],
      typeof Reflect.get(targetIndex, name),
      `${name} root export type`,
    );
  }
});

void test("catalog and unit-weight lookup preserve exact JSON and clone behavior", () => {
  assert.deepEqual(
    JSON.parse(JSON.stringify(sourceModule.NTC2018_PERMANENT_LOAD_REFERENCES)),
    JSON.parse(JSON.stringify(targetModule.NTC2018_PERMANENT_LOAD_REFERENCES)),
  );
  assert.deepEqual(
    JSON.parse(JSON.stringify(sourceModule.NTC2018_UNIT_WEIGHT_CATALOG)),
    JSON.parse(JSON.stringify(targetModule.NTC2018_UNIT_WEIGHT_CATALOG)),
  );
  assert.equal(Object.isFrozen(targetModule.NTC2018_UNIT_WEIGHT_CATALOG), true);
  assert.equal(Object.isFrozen(targetModule.NTC2018_UNIT_WEIGHT_CATALOG[0]), true);

  const sourceDefinitions = call(sourceModule, "listNTC2018UnitWeightDefinitions", {
    category: "metals",
  });
  const targetDefinitions = call(targetModule, "listNTC2018UnitWeightDefinitions", {
    category: "metals",
  });
  assert.deepEqual(targetDefinitions, sourceDefinitions);
  assert.notStrictEqual(targetDefinitions, targetModule.NTC2018_UNIT_WEIGHT_CATALOG);
  assert.deepEqual(
    call(targetModule, "getNTC2018UnitWeightDefinition", "steel"),
    call(sourceModule, "getNTC2018UnitWeightDefinition", "steel"),
  );
});

void test("unit resolution, conversions, partition thresholds, and Unicode output match exactly", () => {
  const units = { force: "kN", length: "m" };
  const inputUnits = { force: "N", length: "mm" };
  const sourceFixed = call(sourceModule, "resolveNTC2018UnitWeight", { materialId: "steel" });
  const targetFixed = call(targetModule, "resolveNTC2018UnitWeight", { materialId: "steel" });
  assert.deepEqual(targetFixed, sourceFixed);

  const sourceRange = call(sourceModule, "resolveNTC2018UnitWeight", {
    materialId: "lightweight-concrete",
    value: 18,
  });
  const targetRange = call(targetModule, "resolveNTC2018UnitWeight", {
    materialId: "lightweight-concrete",
    value: 18,
  });
  assert.deepEqual(targetRange, sourceRange);

  const cases = [
    ["calculateNTC2018AreaSelfWeight", { unitWeight: 2.5e-5, thickness: 200, units: inputUnits }],
    ["calculateNTC2018LineSelfWeight", { unitWeight: 78.5, crossSectionArea: 0.01, units }],
    ["calculateNTC2018SelfWeight", { unitWeight: 24, volume: 0.75, units }],
    ["calculateNTC2018EquivalentPartitionAreaLoad", { partitionLineLoad: 5.01, units }],
    ["calculateNTC2018EquivalentPartitionAreaLoad", { partitionLineLoad: 2, units }],
  ] as const;
  for (const [name, options] of cases) {
    const source = call(sourceModule, name, options);
    const target = call(targetModule, name, options);
    assert.deepEqual(target, source);
    assert.equal(JSON.stringify(target), JSON.stringify(source));
  }
});

void test("permanent-area models, actions, totals, serialization, and Unicode match exactly", () => {
  const unicodeId = "soletta-μ—荷重";
  const options = {
    units: { force: "kN", length: "m" },
    items: [
      {
        id: unicodeId,
        description: `Soletta ${unicodeId}`,
        model: "layer",
        permanentClass: "G1",
        unitWeight: 25,
        thickness: 0.2,
      },
      {
        id: "finishes",
        model: "surface",
        permanentClass: "G2",
        areaLoad: 1.5,
      },
      {
        id: "services",
        model: "repeated-line",
        permanentClass: "G2",
        effect: "favourable",
        lineLoad: 0.2,
        spacing: 0.5,
      },
      {
        id: "joists",
        model: "repeated-section",
        permanentClass: "G1",
        unitWeight: 78.5,
        crossSectionArea: 0.001,
        spacing: 0.5,
      },
      {
        id: "wall",
        model: "distributed-wall",
        permanentClass: "G2",
        unitWeight: 8,
        height: 3,
        thickness: 0.1,
        spacing: 4,
      },
    ],
  };
  const source = call(sourceModule, "calculateNTC2018PermanentAreaLoads", options);
  const target = call(targetModule, "calculateNTC2018PermanentAreaLoads", options);
  const sourceJson = serialize(source);
  const targetJson = serialize(target);
  assert.deepEqual(targetJson, sourceJson);
  assert.equal(JSON.stringify(targetJson), JSON.stringify(sourceJson));
  if (!isRecord(targetJson)) {
    throw new Error("Expected a calculation result.");
  }
  const outputs = targetJson.outputs;
  if (!isRecord(outputs)) {
    throw new Error("Expected calculation outputs.");
  }
  assert.equal(outputs.schemaVersion, "ntc2018-permanent-area-loads/v1");
  const totals = outputs.totals;
  assert.deepEqual(totals, {
    G1: 5.157,
    G2: 2.5,
    total: 7.657,
    byClassAndEffect: {
      G1: { favourable: 0, unfavourable: 5.157 },
      G2: { favourable: 0.4, unfavourable: 2.1 },
    },
  });
});

void test("unsupported, missing-input, unit, and ambiguous-contract errors match exactly", () => {
  const comparisons: Array<[string, unknown[]]> = [
    ["getNTC2018UnitWeightDefinition", ["unknown-material"]],
    ["resolveNTC2018UnitWeight", [{ materialId: "steel", value: 78.5 }]],
    ["resolveNTC2018UnitWeight", [{ materialId: "lightweight-concrete", value: 21 }]],
    ["calculateNTC2018AreaSelfWeight", [{ unitWeight: 25, thickness: 0.2 }]],
    [
      "calculateNTC2018EquivalentPartitionAreaLoad",
      [{ partitionLineLoad: 0, units: { force: "kN", length: "m" } }],
    ],
    [
      "calculateNTC2018PermanentAreaLoads",
      [
        {
          units: { force: "kN", length: "m" },
          items: [
            { id: "duplicate", model: "surface", permanentClass: "G1", areaLoad: 1 },
            { id: "duplicate", model: "surface", permanentClass: "G2", areaLoad: 1 },
          ],
        },
      ],
    ],
    [
      "calculateNTC2018PermanentAreaLoads",
      [
        {
          units: { force: "kN", length: "m" },
          items: [{ id: "missing-class", model: "surface", areaLoad: 1 }],
        },
      ],
    ],
    [
      "calculateNTC2018PermanentAreaLoads",
      [
        {
          units: { force: "kN", length: "m" },
          items: [
            {
              id: "zero-spacing",
              model: "repeated-line",
              permanentClass: "G1",
              lineLoad: 1,
              spacing: 0,
            },
          ],
        },
      ],
    ],
  ];

  for (const [name, args] of comparisons) {
    assert.deepEqual(
      errorSignature(() => call(sourceModule, name, ...args)),
      errorSignature(() => call(targetModule, name, ...args)),
      name,
    );
  }
});
