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

interface Constructor<TInstance, TOptions> {
  new (options: TOptions): TInstance;
}

interface JsonValue {
  toJSON: () => unknown;
}

function baselineExport<TExport>(name: string): TExport {
  const value = JavaScriptApi[name];
  assert.notEqual(value, undefined, `The baseline is missing ${name}.`);
  return value as TExport;
}

void test("section geometry and mass properties match the live JavaScript baseline", () => {
  const JavaScriptRectangularSection =
    baselineExport<Constructor<JsonValue, TypeScriptApi.RectangularSectionOptions>>(
      "RectangularSection",
    );
  const JavaScriptTSection =
    baselineExport<Constructor<JsonValue, TypeScriptApi.TSectionOptions>>("TSection");
  const JavaScriptPolygonSection =
    baselineExport<Constructor<JsonValue, TypeScriptApi.PolygonSectionOptions>>("PolygonSection");
  const rectangularOptions = {
    width: 32,
    height: 48,
    units: { force: "kN", length: "cm" },
  } as const;
  const tOptions = {
    flangeWidth: 800,
    flangeThickness: 120,
    webWidth: 300,
    webHeight: 500,
    units,
  } as const;
  const polygonOptions = {
    points: [
      { y: 0, z: 0 },
      { y: 0, z: 200 },
      { y: 80, z: 160 },
      { y: 220, z: 60 },
      { y: 180, z: 0 },
    ],
    units,
  };

  const typescriptRectangle = new TypeScriptApi.RectangularSection(rectangularOptions);
  const javascriptRectangle = new JavaScriptRectangularSection(rectangularOptions);
  const typescriptT = new TypeScriptApi.TSection(tOptions);
  const javascriptT = new JavaScriptTSection(tOptions);
  const typescriptPolygon = new TypeScriptApi.PolygonSection(polygonOptions);
  const javascriptPolygon = new JavaScriptPolygonSection(polygonOptions);

  assert.deepEqual(typescriptRectangle.toJSON(), javascriptRectangle.toJSON());
  assert.deepEqual(typescriptT.toJSON(), javascriptT.toJSON());
  assert.deepEqual(typescriptPolygon.toJSON(), javascriptPolygon.toJSON());

  const javascriptMassProperties = baselineExport<
    (section: unknown) => TypeScriptApi.SectionMassProperties
  >("calculateSectionMassProperties");
  assert.deepEqual(
    TypeScriptApi.calculateSectionMassProperties(typescriptPolygon),
    javascriptMassProperties(javascriptPolygon),
  );
});

void test("reinforcement layout matches the live JavaScript baseline", () => {
  const JavaScriptRectangularSection =
    baselineExport<Constructor<JsonValue, TypeScriptApi.RectangularSectionOptions>>(
      "RectangularSection",
    );
  const JavaScriptReinforcementBar =
    baselineExport<Constructor<JsonValue, TypeScriptApi.ReinforcementBarOptions>>(
      "ReinforcementBar",
    );
  const javascriptCreateLayout = baselineExport<
    (options: Record<string, unknown>) => {
      reinforcementBars: JsonValue[];
      longitudinalReinforcementGroups: unknown[];
      metadata: unknown;
    }
  >("createLongitudinalReinforcementLayout");
  const sectionOptions = { width: 300, height: 500, units } as const;
  const layerOptions = {
    units,
    bottom: { id: "bottom-main", diameter: 20, count: 2, cover: 40 },
    top: { id: "top-main", diameter: 16, count: 3, cover: 35 },
  } as const;
  const typescriptSection = new TypeScriptApi.RectangularSection(sectionOptions);
  const javascriptSection = new JavaScriptRectangularSection(sectionOptions);
  const typescriptLayout = TypeScriptApi.createLongitudinalReinforcementLayout({
    section: typescriptSection,
    ...layerOptions,
  });
  const javascriptLayout = javascriptCreateLayout({
    section: javascriptSection,
    ...layerOptions,
  });
  const barOptions = { diameter: 6, grade: "B450C", units } as const;

  assert.deepEqual(
    typescriptLayout.reinforcementBars.map((bar) => bar.toJSON()),
    javascriptLayout.reinforcementBars.map((bar) => bar.toJSON()),
  );
  assert.deepEqual(
    typescriptLayout.longitudinalReinforcementGroups,
    javascriptLayout.longitudinalReinforcementGroups,
  );
  assert.deepEqual(typescriptLayout.metadata, javascriptLayout.metadata);
  assert.deepEqual(
    new TypeScriptApi.ReinforcementBar(barOptions).toJSON(),
    new JavaScriptReinforcementBar(barOptions).toJSON(),
  );
});

void test("transformed reinforced-concrete results match the live JavaScript baseline", () => {
  const JavaScriptRectangularSection =
    baselineExport<Constructor<JsonValue, TypeScriptApi.RectangularSectionOptions>>(
      "RectangularSection",
    );
  const JavaScriptReinforcementBar =
    baselineExport<Constructor<JsonValue, TypeScriptApi.ReinforcementBarOptions>>(
      "ReinforcementBar",
    );
  const JavaScriptReinforcedConcreteSection = baselineExport<
    Constructor<JsonValue, Record<string, unknown>>
  >("ReinforcedConcreteSection");
  const concreteMaterial = {
    id: "opaque-concrete",
    toJSON(): null {
      return null;
    },
  };
  const reinforcementMaterial = { id: "opaque-reinforcement" };
  const concreteOptions = { width: 300, height: 500, units } as const;
  const barOptions = [
    { diameter: 16, y: 50, z: 60, units, material: reinforcementMaterial },
    { diameter: 16, y: 450, z: 240, units, material: reinforcementMaterial },
  ] as const;
  const typescriptSection = new TypeScriptApi.ReinforcedConcreteSection({
    name: "RC beam section",
    concreteSection: new TypeScriptApi.RectangularSection(concreteOptions),
    reinforcementBars: barOptions.map((options) => new TypeScriptApi.ReinforcementBar(options)),
    concreteMaterial,
    reinforcementMaterial,
    referenceModularRatio: 15,
    units,
  });
  const javascriptSection = new JavaScriptReinforcedConcreteSection({
    name: "RC beam section",
    concreteSection: new JavaScriptRectangularSection(concreteOptions),
    reinforcementBars: barOptions.map((options) => new JavaScriptReinforcementBar(options)),
    concreteMaterial,
    reinforcementMaterial,
    referenceModularRatio: 15,
    units,
  });

  assert.deepEqual(typescriptSection.toJSON(), javascriptSection.toJSON());
  assert.deepEqual(
    typescriptSection.getReferencePoint("section-center"),
    (
      javascriptSection as unknown as {
        getReferencePoint: (type: string) => unknown;
      }
    ).getReferencePoint("section-center"),
  );
});
