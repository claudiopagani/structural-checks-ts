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
assert.equal(revisionOutput.trim(), expectedRevision);
assert.equal(statusOutput.trim(), "", "Compatibility test requires a clean source worktree.");

const JavaScriptApi = (await import(
  pathToFileURL(path.join(baselinePath, "src", "index.js")).href
)) as Record<string, unknown>;

interface JsonValue {
  toJSON(): unknown;
}

interface FootingApi {
  RectangularFootingContactAnalysis: new () => {
    analyze(input: Record<string, unknown>): Record<string, unknown>;
  };
  ReinforcedConcreteIsolatedFootingModel: new (input: Record<string, unknown>) => JsonValue;
  ReinforcedConcreteIsolatedFootingApplication: new () => {
    run(input: Record<string, unknown>): JsonValue;
  };
  createNTC2018ConcreteMaterial(input: Record<string, unknown>): unknown;
  createNTC2018ReinforcementSteelMaterial(input: Record<string, unknown>): unknown;
  integrateFootingPressureStrip(input: Record<string, unknown>): Record<string, unknown>;
}

function apiFrom(source: Record<string, unknown>): FootingApi {
  return source as unknown as FootingApi;
}

const baselineApi = apiFrom(JavaScriptApi);
const typescriptApi = apiFrom(TypeScriptApi);

function jsonValue(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value)) as unknown;
}

function createModel(api: FootingApi, overrides: Record<string, unknown> = {}): JsonValue {
  const concreteMaterial = api.createNTC2018ConcreteMaterial({
    strengthClass: "C25/30",
    units,
  });
  const reinforcementMaterial = api.createNTC2018ReinforcementSteelMaterial({
    grade: "B450C",
    units,
  });
  const source = {
    id: "isolated-footing-parity",
    geometry: { widthX: 2000, widthY: 2000, thickness: 800 },
    column: { widthX: 500, widthY: 500 },
    actions: {
      columnVerticalForce: 5_672_180,
      uniformDownwardPressure: 0.027,
      horizontalX: 0,
      horizontalY: 0,
      momentX: 0,
      momentY: 0,
    },
    soil: {
      designBearingResistance: 2,
      bearingResistanceSource: "assigned-parity-value",
    },
    materials: { concreteMaterial, reinforcementMaterial },
    reinforcement: {
      bottom: {
        x: { diameter: 16, spacing: 100, clearCover: 40 },
        y: { diameter: 16, spacing: 100, clearCover: 40, layerOffset: 16 },
      },
    },
    units,
  };
  const overrideActions = (overrides.actions ?? {}) as Record<string, unknown>;
  const overrideSoil = (overrides.soil ?? {}) as Record<string, unknown>;

  return new api.ReinforcedConcreteIsolatedFootingModel({
    ...source,
    ...overrides,
    actions: { ...source.actions, ...overrideActions },
    soil: { ...source.soil, ...overrideSoil },
  });
}

function runFooting(api: FootingApi, overrides: Record<string, unknown>): unknown {
  const result = new api.ReinforcedConcreteIsolatedFootingApplication().run({
    model: createModel(api, overrides),
  });
  return jsonValue(result.toJSON());
}

const footingScenarios: Array<{ name: string; overrides: Record<string, unknown> }> = [
  { name: "centered full contact", overrides: {} },
  {
    name: "uniaxial partial contact",
    overrides: { actions: { momentY: 2_000_000_000 } },
  },
  {
    name: "biaxial partial contact with local bearing and anchorages",
    overrides: {
      actions: {
        columnVerticalForce: 2_000_000,
        momentX: 650_000_000,
        momentY: 650_000_000,
      },
      localBearing: { distributionArea: 1_000_000 },
      anchorage: {
        columnBars: { diameter: 20, availableLength: 1200 },
        footingBars: {
          x: { diameter: 16, availableLength: 1000 },
          y: { diameter: 16, availableLength: 1000 },
        },
      },
    },
  },
  {
    name: "horizontal action without assigned sliding resistance",
    overrides: { actions: { horizontalX: 100_000 } },
  },
  {
    name: "punching with enclosed soil reaction",
    overrides: {
      geometry: { widthX: 4000, widthY: 4000, thickness: 500 },
      column: { widthX: 500, widthY: 500 },
      actions: { columnVerticalForce: 2_000_000, uniformDownwardPressure: 0 },
      soil: { designBearingResistance: 1 },
      punching: {
        code: {
          id: "EN1992_1_1_2004_A1_2014",
          parameterProfile: "EN_RECOMMENDED",
        },
      },
    },
  },
];

for (const scenario of footingScenarios) {
  void test(`isolated-footing result matches the live baseline for ${scenario.name}`, () => {
    assert.deepEqual(
      runFooting(typescriptApi, scenario.overrides),
      runFooting(baselineApi, scenario.overrides),
    );
  });
}

void test("isolated-footing model normalization matches the live baseline", () => {
  assert.deepEqual(
    jsonValue(createModel(typescriptApi).toJSON()),
    jsonValue(createModel(baselineApi).toJSON()),
  );
});

const contactCases = [
  { widthX: 2000, widthY: 2000, nEd: 4_000_000, mxEd: 0, myEd: 400_000_000 },
  {
    widthX: 2000,
    widthY: 2000,
    nEd: 4_000_000,
    mxEd: 0,
    myEd: 1_600_000_000,
  },
  {
    widthX: 2000,
    widthY: 2000,
    nEd: 4_000_000,
    mxEd: 1_200_000_000,
    myEd: 1_200_000_000,
  },
];

void test("full, uniaxial, and biaxial contact states match the live baseline exactly", () => {
  const baselineAnalysis = new baselineApi.RectangularFootingContactAnalysis();
  const typescriptAnalysis = new typescriptApi.RectangularFootingContactAnalysis();
  for (const input of contactCases) {
    assert.deepEqual(
      jsonValue(typescriptAnalysis.analyze(input)),
      jsonValue(baselineAnalysis.analyze(input)),
    );
  }
});

void test("footing strip pressure integration matches the live baseline exactly", () => {
  const input = { widthX: 2000, widthY: 2000, nEd: 4_000_000 };
  const baselineContact = new baselineApi.RectangularFootingContactAnalysis().analyze(input);
  const typescriptContact = new typescriptApi.RectangularFootingContactAnalysis().analyze(input);
  const strip = {
    axis: "x",
    from: 250,
    to: 1000,
    fixedCoordinate: 0,
    momentOrigin: 250,
    uniformDownwardPressure: 0.1,
  };
  assert.deepEqual(
    jsonValue(
      typescriptApi.integrateFootingPressureStrip({
        contact: typescriptContact,
        ...strip,
      }),
    ),
    jsonValue(
      baselineApi.integrateFootingPressureStrip({
        contact: baselineContact,
        ...strip,
      }),
    ),
  );
});
