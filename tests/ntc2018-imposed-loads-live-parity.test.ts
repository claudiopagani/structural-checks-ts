import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";
import path from "node:path";
import { pathToFileURL } from "node:url";

import * as targetIndex from "../dist/index.js";
import * as targetModule from "../dist/norms/ntc2018/loads/ntc2018ImposedLoads.js";

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
  "ntc2018ImposedLoads.js",
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

void test("pinned repositories and imposed-load module exports remain independent", () => {
  assert.equal(gitOutput(sourceRoot, "rev-parse", "HEAD"), sourceRevision);
  assert.equal(gitOutput(sourceRoot, "status", "--porcelain"), "");
  assert.equal(gitOutput(normativeRoot, "rev-parse", "HEAD"), normativeRevision);
  assert.equal(gitOutput(normativeRoot, "status", "--porcelain"), "");

  assert.deepEqual(Object.keys(sourceModule).sort(), Object.keys(targetModule).sort());
  for (const name of [
    "NTC2018_IMPOSED_LOAD_CATALOG",
    "NTC2018_IMPOSED_LOAD_REFERENCES",
    "calculateNTC2018ImposedLoadAreaReduction",
    "calculateNTC2018ImposedLoadMultiStoreyReduction",
    "getNTC2018ImposedLoadDefinition",
    "listNTC2018ImposedLoadDefinitions",
    "resolveNTC2018ImposedLoadDefinition",
  ]) {
    assert.equal(
      typeof sourceIndex[name],
      typeof Reflect.get(targetIndex, name),
      `${name} root export type`,
    );
  }
});

void test("catalog, references, and clone behavior match exact JSON and Unicode", () => {
  assert.deepEqual(
    JSON.parse(JSON.stringify(sourceModule.NTC2018_IMPOSED_LOAD_REFERENCES)),
    JSON.parse(JSON.stringify(targetModule.NTC2018_IMPOSED_LOAD_REFERENCES)),
  );
  assert.deepEqual(
    JSON.parse(JSON.stringify(sourceModule.NTC2018_IMPOSED_LOAD_CATALOG)),
    JSON.parse(JSON.stringify(targetModule.NTC2018_IMPOSED_LOAD_CATALOG)),
  );

  const sourceDefinitions = call(sourceModule, "listNTC2018ImposedLoadDefinitions", {
    category: "B",
  });
  const targetDefinitions = call(targetModule, "listNTC2018ImposedLoadDefinitions", {
    category: "B",
  });
  assert.deepEqual(targetDefinitions, sourceDefinitions);
  assert.notStrictEqual(targetDefinitions, targetModule.NTC2018_IMPOSED_LOAD_CATALOG);

  const sourceVehicle = call(sourceModule, "getNTC2018ImposedLoadDefinition", "F-light-vehicles");
  const targetVehicle = call(targetModule, "getNTC2018ImposedLoadDefinition", "F-light-vehicles");
  assert.deepEqual(targetVehicle, sourceVehicle);
  assert.equal(JSON.stringify(targetVehicle), JSON.stringify(sourceVehicle));
});

void test("direct, inherited, documented, and Unicode resolution match exactly", () => {
  const units = { force: "kN", length: "m" };
  const documentation = { reference: "Progetto μ—荷重 LOAD-001", note: "azione variabile" };
  const cases = [
    { definitionId: "B2-public-offices", units },
    { definitionId: "C-stairs-balconies", servedDefinitionId: "C1-table-areas", units },
    {
      definitionId: "E2-industrial",
      documentedValues: { qk: 8, Qk: 9, Hk: 2 },
      documentation,
      units,
    },
    {
      definitionId: "I-occupied-roofs",
      servedDefinitionId: "A-residential",
      documentedCombinationFactors: { psi0: 0.7, psi1: 0.5, psi2: 0.3 },
      documentation,
      units,
    },
    {
      definitionId: "E2-industrial",
      documentedValues: { qk: 0.008, Qk: 9000, Hk: 2 },
      documentation,
      units: { force: "N", length: "mm" },
    },
  ];

  for (const options of cases) {
    const source = call(sourceModule, "resolveNTC2018ImposedLoadDefinition", options);
    const target = call(targetModule, "resolveNTC2018ImposedLoadDefinition", options);
    assert.deepEqual(target, source);
    assert.equal(JSON.stringify(target), JSON.stringify(source));
  }
});

void test("area and multi-storey reductions preserve numeric and serialized parity", () => {
  const units = { force: "kN", length: "m" };
  const documentation = { reference: "LOAD-μ—荷重" };
  const areaCases = [
    { category: "A", influenceArea: 50, units },
    { category: "C", influenceArea: 1000, units },
    { category: "I", influenceArea: 50, psi0: 0.7, documentation, units },
    { category: "A", influenceArea: 50000, units: { force: "N", length: "mm" } },
  ];
  for (const options of areaCases) {
    const source = call(sourceModule, "calculateNTC2018ImposedLoadAreaReduction", options);
    const target = call(targetModule, "calculateNTC2018ImposedLoadAreaReduction", options);
    assert.deepEqual(target, source);
    assert.equal(Reflect.get(Object(target), "alphaA"), Reflect.get(Object(source), "alphaA"));
  }

  const source = call(sourceModule, "calculateNTC2018ImposedLoadMultiStoreyReduction", {
    category: "B",
    loadedStoreys: 5,
  });
  const target = call(targetModule, "calculateNTC2018ImposedLoadMultiStoreyReduction", {
    category: "B",
    loadedStoreys: 5,
  });
  assert.deepEqual(target, source);
  assert.equal(Reflect.get(Object(target), "alphaN"), Reflect.get(Object(source), "alphaN"));
});

void test("missing, unsupported, invalid, and null-input errors match exactly", () => {
  const comparisons: Array<[string, unknown[]]> = [
    ["getNTC2018ImposedLoadDefinition", ["unknown-definition"]],
    [
      "resolveNTC2018ImposedLoadDefinition",
      [{ definitionId: "E2-industrial", units: { force: "kN", length: "m" } }],
    ],
    [
      "resolveNTC2018ImposedLoadDefinition",
      [{ definitionId: "C-stairs-balconies", units: { force: "kN", length: "m" } }],
    ],
    [
      "calculateNTC2018ImposedLoadAreaReduction",
      [{ category: "E", influenceArea: 50, units: { force: "kN", length: "m" } }],
    ],
    ["calculateNTC2018ImposedLoadMultiStoreyReduction", [{ category: "B", loadedStoreys: 2 }]],
  ];

  for (const [name, args] of comparisons) {
    assert.deepEqual(
      errorSignature(() => call(sourceModule, name, ...args)),
      errorSignature(() => call(targetModule, name, ...args)),
      name,
    );
  }

  for (const name of [
    "listNTC2018ImposedLoadDefinitions",
    "resolveNTC2018ImposedLoadDefinition",
    "calculateNTC2018ImposedLoadAreaReduction",
    "calculateNTC2018ImposedLoadMultiStoreyReduction",
  ]) {
    assert.deepEqual(
      errorSignature(() => call(sourceModule, name, null)),
      errorSignature(() => call(targetModule, name, null)),
      `${name} null options`,
    );
  }
});
