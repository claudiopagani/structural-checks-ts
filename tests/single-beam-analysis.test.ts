import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

import * as Api from "../dist/index.js";

import {
  SingleBeamAnalysis,
  type BeamAnalysisResult,
  type SingleBeamModelOptions,
} from "../dist/index.js";

const femUnits = { force: "kN", length: "m" } as const;
const sectionUnits = { force: "N", length: "mm" } as const;
const approx = (actual: number, expected: number, tolerance = 1e-9): void => {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
};

function createSteelMaterial(api: typeof Api): InstanceType<typeof Api.SteelMaterial> {
  return new api.SteelMaterial({
    name: "S275",
    grade: "S275",
    elasticModulus: 210000,
    shearModulus: 80769.23076923077,
    fyk: 275,
    units: sectionUnits,
  });
}

function createDemoSection(api: typeof Api): InstanceType<typeof Api.RectangularSection> {
  return new api.RectangularSection({
    width: 100,
    height: 200,
    units: sectionUnits,
  });
}

interface BeamInputOverrides extends Partial<Omit<SingleBeamModelOptions, "units" | "geometry">> {
  units?: SingleBeamModelOptions["units"];
  geometry?: SingleBeamModelOptions["geometry"];
}

function createSimpleBeamInput(
  api: typeof Api,
  overrides: BeamInputOverrides = {},
): SingleBeamModelOptions {
  return {
    id: "beam",
    units: femUnits,
    geometry: {
      start: { x: 0, y: 0 },
      end: { x: 4, y: 0 },
    },
    section: createDemoSection(api),
    material: createSteelMaterial(api),
    supports: {
      start: "hinge",
      end: "roller",
    },
    loads: [
      {
        id: "self-weight",
        actionType: "G1",
        type: "uniform",
        value: -2,
      },
    ],
    discretization: {
      elementCount: 4,
    },
    combinations: false,
    ...overrides,
  };
}

function record(value: unknown): Record<string, unknown> {
  assert.ok(value !== null && typeof value === "object");
  return value as Record<string, unknown>;
}

function numberAt(value: unknown, label: string): number {
  if (typeof value !== "number") {
    throw new Error(`${label} must be numeric.`);
  }
  return value;
}

function resultFor(
  result: ReturnType<SingleBeamAnalysis["analyze"]>,
  id: string,
): ReturnType<SingleBeamAnalysis["analyze"]>["loadCases"][string] {
  const selected = result.loadCases[id];
  assert.ok(selected, `Missing load case ${id}.`);
  return selected;
}

void test("single beam analysis solves a simply supported elastic beam from section and material", () => {
  const result = new SingleBeamAnalysis().analyze(createSimpleBeamInput(Api));
  const loadCase = resultFor(result, "G1");
  const displacement = record(loadCase.displacements);
  const samples = displacement.samples as Array<Record<string, unknown>>;
  const midspanDisplacement = samples.find((sample) => sample.station === 2);
  assert.ok(midspanDisplacement);
  const forces = record(loadCase.internalForces);

  approx(numberAt(loadCase.reactionByNode["beam-beam-node-1"]?.uy, "start reaction"), 4);
  approx(numberAt(loadCase.reactionByNode["beam-beam-node-5"]?.uy, "end reaction"), 4);
  approx(numberAt(record(forces.maxAbsBendingMoment).m, "maximum moment"), 4);
  approx(
    numberAt(midspanDisplacement.uy, "midspan displacement"),
    (-5 * 2 * 4 ** 4) / (384 * 14000),
  );
  approx(loadCase.sectionProperties.flexuralRigidity, 14000);
});

void test("vertical loads on an inclined beam use horizontal projection by default", () => {
  const api = Api;
  const result = new api.SingleBeamAnalysis().analyze(
    createSimpleBeamInput(api, {
      geometry: { start: { x: 0, y: 0 }, end: { x: 3, y: 4 } },
      loads: [{ id: "g1", actionType: "G1", type: "uniform", value: -10 }],
      discretization: { elementCount: 5 },
    }),
  );
  const loadCase = resultFor(result, "G1");

  approx(loadCase.geometry.length, 5);
  approx(loadCase.geometry.horizontalSpan, 3);
  approx(numberAt(loadCase.reactionByNode["beam-beam-node-1"]?.uy, "start reaction"), 15, 1e-8);
  approx(numberAt(loadCase.reactionByNode["beam-beam-node-6"]?.uy, "end reaction"), 15, 1e-8);
});

void test("section rotation projects vertical bending on principal section axes", () => {
  const api = Api;
  const alpha = Math.PI / 6;
  const result = new api.SingleBeamAnalysis().analyze(
    createSimpleBeamInput(api, {
      sectionRotation: { alpha: 30, units: "deg" },
    }),
  );
  const loadCase = resultFor(result, "G1");
  const midspan = (record(loadCase.internalForces).samples as Array<Record<string, unknown>>).find(
    (sample) => sample.station === 2,
  );
  const displacement = (
    record(loadCase.displacements).samples as Array<Record<string, unknown>>
  ).find((sample) => sample.station === 2);
  assert.ok(midspan);
  assert.ok(displacement);
  const eiVertical = 1 / (Math.cos(alpha) ** 2 / 14000 + Math.sin(alpha) ** 2 / 3500);

  approx(numberAt(loadCase.reactionByNode["beam-beam-node-1"]?.uy, "start reaction"), 4);
  approx(numberAt(loadCase.reactionByNode["beam-beam-node-5"]?.uy, "end reaction"), 4);
  approx(numberAt(loadCase.sectionProperties.flexuralRigidityY, "EIY"), 14000);
  approx(numberAt(loadCase.sectionProperties.flexuralRigidityZ, "EIZ"), 3500);
  approx(loadCase.sectionProperties.flexuralRigidity, eiVertical);
  approx(numberAt(midspan.m, "midspan moment"), 4);
  approx(numberAt(midspan.mY, "principal MY"), 4 * Math.cos(alpha));
  approx(numberAt(midspan.mZ, "principal MZ"), 4 * Math.sin(alpha));
  approx(numberAt(displacement.uy, "midspan displacement"), (-5 * 2 * 4 ** 4) / (384 * eiVertical));
  assert.ok(result.warnings.some((warning) => warning.includes("2D FEM model")));
  assert.ok(loadCase.warnings.some((warning) => warning.includes("2D FEM model")));
  approx(
    numberAt(record(result.envelopes.loadCases.maxAbsBendingMomentY).value, "MY envelope"),
    4 * Math.cos(alpha),
  );
  approx(
    numberAt(record(result.envelopes.loadCases.maxAbsBendingMomentZ).value, "MZ envelope"),
    4 * Math.sin(alpha),
  );
});

void test("single beam analysis combines G1, G2 and multiple Qk load cases", () => {
  const api = Api;
  const result = new api.SingleBeamAnalysis().analyze(
    createSimpleBeamInput(api, {
      loads: [
        { id: "g1", actionType: "G1", type: "uniform", value: -2 },
        { id: "g2", actionType: "G2", type: "uniform", value: -1 },
        { id: "live", actionType: "Qk", type: "uniform", value: -3 },
        { id: "snow", actionType: "Qk", type: "uniform", value: -0.5 },
      ],
      combinations: [
        {
          id: "uls-live-leading",
          factors: { G1: 1.3, G2: 1.5, live: 1.5, snow: 0 },
        },
      ],
    }),
  );
  const combination = result.combinations["uls-live-leading"];
  assert.ok(combination);
  approx(numberAt(combination.reactionByNode["beam-beam-node-1"]?.uy, "start reaction"), 17.2);
  approx(numberAt(combination.reactionByNode["beam-beam-node-5"]?.uy, "end reaction"), 17.2);
});

void test("single beam analysis returns governing envelopes across combinations", () => {
  const api = Api;
  const result = new api.SingleBeamAnalysis().analyze(
    createSimpleBeamInput(api, {
      loads: [
        { id: "g1", actionType: "G1", type: "uniform", value: -2 },
        { id: "live", actionType: "Qk", type: "uniform", value: -3 },
        { id: "wind", actionType: "Qk", type: "uniform", value: 1 },
      ],
      combinations: [
        { id: "uls-live", limitState: "ULS", factors: { G1: 1.3, live: 1.5, wind: 0 } },
        { id: "sle-wind", limitState: "SLE", factors: { G1: 1, live: 0, wind: 1 } },
      ],
    }),
  );
  assert.equal(record(result.envelopes.combinations.maxAbsBendingMoment).resultId, "uls-live");
  approx(numberAt(record(result.envelopes.combinations.maxAbsBendingMoment).value, "moment"), 14.2);
  assert.equal(record(result.envelopes.uls.maxAbsBendingMoment).resultId, "uls-live");
  assert.equal(record(result.envelopes.sle.maxAbsBendingMoment).resultId, "sle-wind");
  assert.equal(record(result.envelopes.all.maxAbsVerticalDisplacement).resultId, "uls-live");
});

void test("single beam analysis preserves user and verification stations", () => {
  const api = Api;
  const result = new api.SingleBeamAnalysis().analyze(
    createSimpleBeamInput(api, {
      discretization: { elementCount: 2, stations: [1.25] },
      verificationStations: { mode: "combined", count: 5, userStations: [1.25] },
    }),
  );
  const loadCase = resultFor(result, "G1");
  const displacementStations = (
    record(loadCase.displacements).samples as Array<Record<string, unknown>>
  ).map((sample) => sample.station);
  const forceStations = (
    record(loadCase.internalForces).samples as Array<Record<string, unknown>>
  ).map((sample) => sample.station);

  assert.ok(displacementStations.includes(1.25));
  assert.ok(displacementStations.includes(1));
  assert.ok(displacementStations.includes(3));
  assert.ok(forceStations.includes(1.25));
});

void test("verification station mode all leaves the FEM mesh unchanged", () => {
  const api = Api;
  const result = new api.SingleBeamAnalysis().analyze(
    createSimpleBeamInput(api, {
      discretization: { elementCount: 2 },
      verificationStations: { mode: "all", count: 5 },
    }),
  );
  const loadCase = resultFor(result, "G1");
  assert.deepEqual(
    (record(loadCase.displacements).samples as Array<Record<string, unknown>>).map(
      (sample) => sample.station,
    ),
    [0, 2, 4],
  );
});

void test("beam section action verifier checks FEM samples through a common contract", () => {
  const api = Api;
  const analysisResult = new api.SingleBeamAnalysis().analyze(
    createSimpleBeamInput(api, {
      loads: [{ id: "g1", actionType: "G1", type: "uniform", value: -2 }],
      combinations: [{ id: "uls", limitState: "ULS", factors: { G1: 1.5 } }],
    }),
  );
  const verification = new api.BeamSectionActionVerifier({
    sectionVerifier: {
      verifySectionActions: ({ vEd = 0, mEd = 0 }) => ({
        utilizationRatio: Math.max(Math.abs(mEd) / 5, Math.abs(vEd) / 20),
        checks: [
          {
            id: "bending",
            demand: Math.abs(mEd),
            capacity: 5,
            utilizationRatio: Math.abs(mEd) / 5,
            ok: Math.abs(mEd) <= 5,
          },
          {
            id: "shear",
            demand: Math.abs(vEd),
            capacity: 20,
            utilizationRatio: Math.abs(vEd) / 20,
            ok: Math.abs(vEd) <= 20,
          },
        ],
      }),
    },
    limitStates: "ULS",
  }).verify({ analysisResult });

  assert.equal(verification.status, "not-verified");
  assert.equal(verification.metadata.resultCount, 1);
  assert.ok(numberAt(record(verification.outputs).stationResultCount, "station result count") > 0);
  assert.ok(
    verification.checks.some(
      (check) => check.id === "bending" && record(check.metadata).resultId === "uls",
    ),
  );
  assert.ok(numberAt(verification.utilizationRatio, "utilization") > 1);
});

void test("beam section action verifier forwards an available torsional action", () => {
  const received: Array<number | undefined> = [];
  const analysisResult: BeamAnalysisResult = {
    units: sectionUnits,
    combinations: {
      uls: {
        id: "uls",
        resultType: "combination",
        context: { limitState: "ULS" },
        internalForces: {
          samples: [{ station: 0, n: 0, v: 0, m: 0, t: 12.5 }],
        },
      },
    },
  };
  const verification = new Api.BeamSectionActionVerifier({
    sectionVerifier: {
      verifySectionActions: ({ tEd }) => {
        received.push(tEd);
        return {
          status: "ok",
          checks: [
            {
              id: "torsion-contract",
              demand: Math.abs(tEd ?? 0),
              capacity: 20,
              utilizationRatio: Math.abs(tEd ?? 0) / 20,
              ok: Math.abs(tEd ?? 0) <= 20,
            },
          ],
        };
      },
    },
    limitStates: "ULS",
  }).verify({ analysisResult });

  assert.equal(verification.status, "ok");
  assert.deepEqual(received, [12.5]);
  assert.equal(numberAt(verification.checks[0]?.demand, "torsion demand"), 12.5);
});

void test("beam section action verifier can restrict checks to requested stations", () => {
  const analysisResult = new Api.SingleBeamAnalysis().analyze(
    createSimpleBeamInput(Api, {
      verificationStations: {
        mode: "combined",
        userStations: [1.25],
      },
      loads: [{ id: "g1", actionType: "G1", type: "uniform", value: -2 }],
      combinations: [{ id: "uls", limitState: "ULS", factors: { G1: 1.5 } }],
    }),
  );
  const verification = new Api.BeamSectionActionVerifier({
    sectionVerifier: {
      verifySectionActions: ({ vEd = 0, mEd = 0 }) => ({
        checks: [
          {
            id: "requested-station-check",
            demand: Math.abs(mEd) + Math.abs(vEd),
            capacity: 100,
            utilizationRatio: (Math.abs(mEd) + Math.abs(vEd)) / 100,
            ok: true,
          },
        ],
      }),
    },
    limitStates: "ULS",
    verificationStations: {
      mode: "user",
      userStations: [1.25],
    },
  }).verify({ analysisResult });

  assert.equal(verification.status, "ok");
  assert.ok(numberAt(record(verification.outputs).stationResultCount, "station result count") > 0);
  assert.ok(
    verification.checks.every((check) => {
      const metadata = record(check.metadata);
      return (
        metadata.station === 1.25 &&
        metadata.isUserStation === true &&
        metadata.stationSource === "user"
      );
    }),
  );
});

void test("elastic beam provider evaluates composite stiffness and forwards provider context", () => {
  const api = Api;
  const material = createSteelMaterial(api);
  const lower = new api.RectangularSection({ width: 100, height: 100, units: sectionUnits });
  const upper = new api.RectangularSection({ width: 100, height: 100, units: sectionUnits });
  const composite = new api.CompositeSection({
    name: "rigid-composite",
    units: sectionUnits,
    components: [
      new api.CompositeSectionComponent({
        name: "Lower",
        section: lower,
        material,
        centroidY: 50,
        role: "lower",
        units: sectionUnits,
      }),
      new api.CompositeSectionComponent({
        name: "Upper",
        section: upper,
        material,
        centroidY: 150,
        role: "upper",
        units: sectionUnits,
      }),
    ],
  });
  const properties = new api.ElasticBeamSectionProvider({
    section: composite,
  }).getElasticBeamProperties();
  approx(
    properties.flexuralRigidity,
    (material.elasticModulus as number) * ((100 * 200 ** 3) / 12),
    1e-3,
  );
  assert.equal(properties.metadata.source, "composite-section-rigid-collaboration");

  const provider = api.createElasticBeamSectionProvider({
    propertyResolver: ({ context }) => ({
      axialRigidity: 1e8,
      flexuralRigidity: 7e11,
      shearRigidity: 5e7,
      shearCorrectionFactor: 1,
      units: sectionUnits,
      metadata: {
        source: "timber-concrete-gamma-method",
        gamma: 0.42,
        limitState: context?.limitState ?? null,
      },
    }),
  });
  const result = new api.SingleBeamAnalysis().analyze(
    createSimpleBeamInput(api, {
      sectionProvider: provider,
      section: null,
      material: null,
      analysisModel: "timoshenko",
    }),
  );
  const loadCase = resultFor(result, "G1");
  assert.equal(loadCase.sectionProperties.metadata.source, "timber-concrete-gamma-method");
  approx(numberAt(loadCase.sectionProperties.metadata.gamma, "gamma"), 0.42);
  approx(loadCase.sectionProperties.flexuralRigidity, 700);
});

void test("migrated single beam analysis results match the pinned JavaScript baseline exactly", async () => {
  const baselinePath = process.env.STRUTTURE_JS_BASELINE_PATH
    ? path.resolve(process.env.STRUTTURE_JS_BASELINE_PATH)
    : path.resolve(import.meta.dirname, "..", "..", "strutture-js");
  const JavaScriptApi = (await import(
    pathToFileURL(path.join(baselinePath, "src", "index.js")).href
  )) as typeof Api;
  const typeScriptResult = new SingleBeamAnalysis().analyze(createSimpleBeamInput(Api));
  const javaScriptResult = new JavaScriptApi.SingleBeamAnalysis().analyze(
    createSimpleBeamInput(JavaScriptApi),
  );
  assert.deepEqual(typeScriptResult, javaScriptResult);
});

void test("section provider receives limit state and governing load duration", () => {
  const kmodByDuration: Record<string, number> = {
    permanent: 0.6,
    medium: 0.8,
    instantaneous: 1.1,
  };
  const provider = Api.createElasticBeamSectionProvider({
    propertyResolver: ({ context }) => {
      const providerContext = context ?? {};
      const duration = providerContext.governingLoadDurationClass;
      if (typeof duration !== "string") {
        throw new Error("Expected a governing load duration class.");
      }
      const kmod = kmodByDuration[duration];
      if (kmod === undefined) {
        throw new Error(`Unexpected governing load duration class: ${duration}.`);
      }

      return {
        axialRigidity: 1e8,
        flexuralRigidity: kmod * 1e12,
        units: sectionUnits,
        metadata: {
          limitState: providerContext.limitState,
          kmod,
          governingLoadDurationClass: duration,
          governingLoadId:
            providerContext.governingLoad && typeof providerContext.governingLoad === "object"
              ? ((providerContext.governingLoad as Record<string, unknown>).id ?? null)
              : null,
        },
      };
    },
  });
  const result = new Api.SingleBeamAnalysis().analyze(
    createSimpleBeamInput(Api, {
      sectionProvider: provider,
      section: null,
      material: null,
      loads: [
        {
          id: "g1",
          actionType: "G1",
          type: "uniform",
          value: -2,
          loadDurationClass: "permanent",
        },
        {
          id: "live",
          actionType: "Qk",
          type: "uniform",
          value: -3,
          loadDurationClass: "medium",
        },
        {
          id: "wind",
          actionType: "Qk",
          type: "uniform",
          value: -1,
          loadDurationClass: "instantaneous",
        },
      ],
      combinations: [
        { id: "sle-live", limitState: "SLE", factors: { G1: 1, live: 1, wind: 0 } },
        { id: "uls-wind", limitState: "ULS", factors: { G1: 1.3, live: 0, wind: 1.5 } },
      ],
    }),
  );
  const sle = result.combinations["sle-live"];
  const uls = result.combinations["uls-wind"];
  assert.ok(sle);
  assert.ok(uls);
  assert.equal(sle.context.limitState, "SLE");
  assert.equal(sle.context.governingLoadDurationClass, "medium");
  assert.equal(sle.sectionProperties.metadata.governingLoadId, "live");
  approx(numberAt(sle.sectionProperties.metadata.kmod, "SLE kmod"), 0.8);
  assert.equal(uls.context.limitState, "ULS");
  assert.equal(uls.context.governingLoadDurationClass, "instantaneous");
  assert.equal(uls.sectionProperties.metadata.governingLoadId, "wind");
  approx(numberAt(uls.sectionProperties.metadata.kmod, "ULS kmod"), 1.1);
});

void test("migrated beam DTOs preserve source validation errors", () => {
  const api = Api;
  assert.throws(
    () =>
      new api.SingleBeamAnalysis().analyze({
        units: femUnits,
        geometry: { start: { x: 0, y: 0 }, end: { x: 0, y: 0 } },
      }),
    new Error("SingleBeamAnalysis requires a positive beam length."),
  );
  assert.throws(
    () =>
      new api.SingleBeamAnalysis().analyze({
        units: femUnits,
        geometry: { start: { x: 0, y: 0 }, end: { x: 4, y: 0 } },
      }),
    new Error("ElasticBeamSectionProvider requires a section or propertyResolver."),
  );
});
