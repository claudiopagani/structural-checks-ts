import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

import * as Api from "../dist/index.js";

const units = { force: "kN", length: "m" } as const;

function approx(actual: number, expected: number, tolerance = 1e-9): void {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
}

function record(value: unknown): Record<string, unknown> {
  assert.ok(value !== null && typeof value === "object");
  return value as Record<string, unknown>;
}

function numberValue(value: unknown, label: string): number {
  if (typeof value !== "number") {
    throw new Error(`${label} must be numeric.`);
  }
  return value;
}

function input(
  api: typeof Api,
  overrides: Partial<ConstructorParameters<typeof Api.FoundationBeamModel>[0]> = {},
): ConstructorParameters<typeof Api.FoundationBeamModel>[0] {
  return {
    id: "foundation-beam",
    units,
    geometry: {
      start: { x: 0, y: 0 },
      end: { x: 10, y: 0 },
    },
    sectionProvider: new api.ElasticBeamSectionProvider({
      units,
      propertyResolver: () => ({
        axialRigidity: 1e7,
        flexuralRigidity: 2e4,
        units,
      }),
    }),
    foundation: {
      contactWidth: 1,
      subgradeModulus: 10000,
    },
    loads: [
      {
        id: "g1",
        actionType: "G1",
        type: "uniform",
        value: -10,
      },
    ],
    combinations: false,
    discretization: { elementCount: 100 },
    ...overrides,
  };
}

void test("foundation beam reproduces uniform bilateral Winkler compression", () => {
  const result = new Api.FoundationBeamAnalysis().analyze(input(Api));
  const loadCase = result.loadCases.G1;
  assert.ok(loadCase);

  approx(loadCase.foundation.totalReaction, 100, 1e-7);
  approx(loadCase.foundation.minPressure?.pressure ?? Number.NaN, 10, 0.006);
  approx(loadCase.foundation.maxPressure?.pressure ?? Number.NaN, 10, 0.002);
  approx(
    numberValue(
      record(record(loadCase.displacements).maxAbsVerticalDisplacement).uy,
      "maximum vertical displacement",
    ),
    -0.001,
    2e-7,
  );
  assert.equal(loadCase.foundation.contactAssumptionViolated, false);
  assert.ok(
    Math.abs(numberValue(record(record(loadCase.internalForces).maxAbsBendingMoment).m, "moment")) <
      0.013,
  );
  assert.equal(
    loadCase.foundation.signConvention,
    "positive pressure and reaction act upward on the beam",
  );
});

void test("uniform imposed soil settlement is a rigid translation without soil reaction", () => {
  const result = new Api.FoundationBeamAnalysis().analyze(
    input(Api, {
      loads: [
        {
          id: "settlement",
          actionType: "SETTLEMENT",
          type: "soil-settlement",
          value: -0.02,
        },
      ],
    }),
  );
  const loadCase = result.loadCases.settlement;
  assert.ok(loadCase);

  const samples = record(loadCase.displacements).samples;
  assert.ok(Array.isArray(samples));
  approx(numberValue(record(samples[0]).uy, "first settlement displacement"), -0.02, 1e-10);
  approx(numberValue(record(samples.at(-1)).uy, "last settlement displacement"), -0.02, 1e-10);
  approx(loadCase.foundation.totalReaction, 0, 1e-7);
  assert.ok(
    Math.abs(numberValue(record(record(loadCase.internalForces).maxAbsBendingMoment).m, "moment")) <
      1e-7,
  );
});

void test("compression-only contact uses an active set and preserves pressure signs", () => {
  const result = new Api.FoundationBeamAnalysis().analyze(
    input(Api, {
      foundation: {
        contactWidth: 1,
        subgradeModulus: 1000,
        contactModel: "compression-only",
      },
      loads: [
        {
          id: "point-load",
          actionType: "Qk",
          type: "point",
          x: 2,
          direction: "y",
          value: -100,
        },
      ],
      discretization: { elementCount: 20 },
    }),
  );
  const loadCase = result.loadCases["point-load"];
  assert.ok(loadCase);

  assert.equal(loadCase.foundation.model, "winkler-linear-compression-only-lumped");
  assert.equal(loadCase.foundationIteration.contactModel, "compression-only");
  assert.equal(loadCase.foundationIteration.active, true);
  assert.ok(loadCase.foundationIteration.iterations >= 1);
  assert.ok(loadCase.foundation.segments.every((segment) => segment.pressure >= 0));
  assert.equal(loadCase.foundation.contactAssumptionViolated, false);
});

void test("foundation segments, combinations, envelopes, and stiffness iteration remain generic", () => {
  const result = new Api.FoundationBeamAnalysis().analyze(
    input(Api, {
      foundation: {
        contactWidth: 1,
        segments: [
          { from: 0, to: 5, subgradeModulus: 10000 },
          { from: 5, to: 10, subgradeModulus: 20000 },
        ],
      },
      loads: [
        { id: "g1", actionType: "G1", type: "uniform", value: -4 },
        { id: "live", actionType: "Qk", type: "uniform", value: -6 },
      ],
      combinations: [
        {
          id: "uls",
          limitState: "ULS",
          factors: { G1: 1.3, live: 1.5 },
        },
      ],
      discretization: { elementCount: 20 },
    }),
    {
      flexuralRigidityResolver: ({ moment, grossFlexuralRigidity }) => ({
        flexuralRigidity: Math.max(
          grossFlexuralRigidity * 0.5,
          grossFlexuralRigidity - Math.abs(moment),
        ),
      }),
    },
  );
  const combination = result.combinations.uls;
  assert.ok(combination);

  assert.equal(combination.foundationIteration.stiffnessIteration, true);
  assert.ok(combination.foundationIteration.iterations >= 1);
  assert.equal(combination.foundation.segments.length, 20);
  assert.equal(combination.foundation.segments[0]?.foundationSegmentId, "foundation-segment-1");
  assert.equal(combination.foundation.segments.at(-1)?.foundationSegmentId, "foundation-segment-2");
  assert.equal(result.envelopes.combinations.maxAbsVerticalDisplacement?.resultId, "uls");
  assert.equal(result.metadata.generatedBy, "FoundationBeamAnalysis");
});

void test("foundation beam model validates complete non-overlapping soil coverage", () => {
  assert.throws(
    () =>
      new Api.FoundationBeamAnalysis().analyze(
        input(Api, {
          foundation: {
            contactWidth: 1,
            segments: [{ from: 0, to: 4, subgradeModulus: 10000 }],
          },
        }),
      ),
    /cover the complete beam span/,
  );
});

void test("migrated foundation beam results match the pinned JavaScript baseline exactly", async () => {
  const baselinePath = process.env.STRUTTURE_JS_BASELINE_PATH
    ? path.resolve(process.env.STRUTTURE_JS_BASELINE_PATH)
    : path.resolve(import.meta.dirname, "..", "..", "strutture-js");
  const JavaScriptApi = (await import(
    pathToFileURL(path.join(baselinePath, "src", "index.js")).href
  )) as typeof Api;

  const typeScriptResult = new Api.FoundationBeamAnalysis().analyze(input(Api));
  const javaScriptResult = new JavaScriptApi.FoundationBeamAnalysis().analyze(input(JavaScriptApi));
  assert.deepEqual(typeScriptResult, javaScriptResult);
});

void test("foundation beam model fields match the pinned JavaScript model DTO", async () => {
  const baselinePath = process.env.STRUTTURE_JS_BASELINE_PATH
    ? path.resolve(process.env.STRUTTURE_JS_BASELINE_PATH)
    : path.resolve(import.meta.dirname, "..", "..", "strutture-js");
  const JavaScriptApi = (await import(
    pathToFileURL(path.join(baselinePath, "src", "index.js")).href
  )) as typeof Api;
  const typeScriptModel = new Api.FoundationBeamModel(input(Api));
  const javaScriptModel = new JavaScriptApi.FoundationBeamModel(input(JavaScriptApi));

  assert.deepEqual(
    {
      id: typeScriptModel.id,
      units: typeScriptModel.units,
      loads: typeScriptModel.loads,
      discretization: typeScriptModel.discretization,
      foundation: typeScriptModel.foundation,
    },
    {
      id: javaScriptModel.id,
      units: javaScriptModel.units,
      loads: javaScriptModel.loads,
      discretization: javaScriptModel.discretization,
      foundation: javaScriptModel.foundation,
    },
  );
});
