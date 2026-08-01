import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import test from "node:test";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

import * as TypeScriptApi from "../dist/index.js";

const execFileAsync = promisify(execFile);
const expectedRevision = "6f33baead8b88166c4b2cf94af41763412e3c751";
const baselinePath = process.env.STRUTTURE_JS_BASELINE_PATH
  ? path.resolve(process.env.STRUTTURE_JS_BASELINE_PATH)
  : path.resolve(import.meta.dirname, "..", "..", "strutture-js");
const units = { force: "N", length: "mm" } as const;

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
  expectedRevision,
  "Compatibility test loaded the wrong source revision.",
);
assert.equal(statusOutput.trim(), "", "Compatibility test requires a clean source worktree.");

const JavaScriptApi = (await import(
  pathToFileURL(path.join(baselinePath, "src", "index.js")).href
)) as Record<string, unknown>;

function baselineExport<TExport>(name: string): TExport {
  const value = JavaScriptApi[name];
  assert.notEqual(value, undefined, `The baseline is missing ${name}.`);
  return value as TExport;
}

void test("material confidence contracts match the live JavaScript baseline", () => {
  assert.deepEqual(
    TypeScriptApi.EXISTING_MATERIAL_CONFIDENCE_LEVELS,
    baselineExport("EXISTING_MATERIAL_CONFIDENCE_LEVELS"),
  );

  const javascriptNormalize = baselineExport<
    typeof TypeScriptApi.normalizeExistingMaterialKnowledgeLevel
  >("normalizeExistingMaterialKnowledgeLevel");
  const javascriptResolve = baselineExport<typeof TypeScriptApi.resolveExistingMaterialState>(
    "resolveExistingMaterialState",
  );
  const javascriptCharacteristic = baselineExport<
    typeof TypeScriptApi.characteristicValueFromExistingMean
  >("characteristicValueFromExistingMean");

  for (const level of ["LC1", "lc2", 3] as const) {
    assert.equal(
      TypeScriptApi.normalizeExistingMaterialKnowledgeLevel(level),
      javascriptNormalize(level),
    );
  }
  assert.deepEqual(
    TypeScriptApi.resolveExistingMaterialState({
      existing: true,
      knowledgeLevel: "LC2",
    }),
    javascriptResolve({ existing: true, knowledgeLevel: "LC2" }),
  );
  assert.equal(
    TypeScriptApi.characteristicValueFromExistingMean(30, 1.2),
    javascriptCharacteristic(30, 1.2),
  );
});

void test("concrete factory values, Italian strings, and normative metadata match", () => {
  const javascriptFactory = baselineExport<
    (options: TypeScriptApi.CreateNTC2018ConcreteMaterialOptions) => {
      toJSON: () => unknown;
    }
  >("createNTC2018ConcreteMaterial");
  const cases: TypeScriptApi.CreateNTC2018ConcreteMaterialOptions[] = [
    { strengthClass: "C25/30", units },
    { strengthClass: "LC20/22", density: 1900, units },
    {
      strengthClass: "C25/30",
      existing: true,
      knowledgeLevel: "LC1",
      meanCompressiveStrength: 30,
      metadata: { campaign: "parity" },
      units,
    },
    {
      strengthClass: "C30/37",
      units: { force: "kN", length: "m" },
      meanCompressiveStrength: 35_000,
    },
  ];

  for (const options of cases) {
    assert.deepEqual(
      TypeScriptApi.createNTC2018ConcreteMaterial(options).toJSON(),
      javascriptFactory(options).toJSON(),
    );
  }
});

void test("reinforcement factory values and normative metadata match", () => {
  const javascriptFactory = baselineExport<
    (options?: TypeScriptApi.CreateNTC2018ReinforcementSteelMaterialOptions) => {
      toJSON: () => unknown;
    }
  >("createNTC2018ReinforcementSteelMaterial");
  const cases: TypeScriptApi.CreateNTC2018ReinforcementSteelMaterialOptions[] = [
    { grade: "B450A", units },
    { grade: "B450C", units },
    {
      grade: "B450C",
      existing: true,
      knowledgeLevel: "LC2",
      yieldMeanStrength: 500,
      ultimateMeanStrength: 600,
      units,
    },
    {
      grade: "B450C",
      units: { force: "kN", length: "m" },
      elasticModulus: 210_000_000,
    },
  ];

  for (const options of cases) {
    assert.deepEqual(
      TypeScriptApi.createNTC2018ReinforcementSteelMaterial(options).toJSON(),
      javascriptFactory(options).toJSON(),
    );
  }
});

void test("direct steel material construction and clone behavior match", () => {
  const JavaScriptSteelMaterial = baselineExport<
    new (options: TypeScriptApi.SteelMaterialOptions) => {
      clone: () => { toJSON: () => unknown };
      toJSON: () => unknown;
    }
  >("SteelMaterial");
  const options = {
    name: "S355",
    grade: "S355",
    elasticModulus: 210_000_000,
    fyk: 355_000,
    units: { force: "kN", length: "m" },
  } as const;
  const typescriptMaterial = new TypeScriptApi.SteelMaterial(options);
  const javascriptMaterial = new JavaScriptSteelMaterial(options);

  assert.deepEqual(typescriptMaterial.toJSON(), javascriptMaterial.toJSON());
  assert.deepEqual(typescriptMaterial.clone().toJSON(), javascriptMaterial.clone().toJSON());
  assert.deepEqual(
    TypeScriptApi.NTC2018_CONCRETE_CLASSES,
    baselineExport("NTC2018_CONCRETE_CLASSES"),
  );
  assert.deepEqual(
    TypeScriptApi.NTC2018_REINFORCEMENT_STEEL_GRADES,
    baselineExport("NTC2018_REINFORCEMENT_STEEL_GRADES"),
  );
  assert.deepEqual(
    TypeScriptApi.NTC2018_EXISTING_MATERIAL_KNOWLEDGE_LEVELS,
    baselineExport("NTC2018_EXISTING_MATERIAL_KNOWLEDGE_LEVELS"),
  );
});
