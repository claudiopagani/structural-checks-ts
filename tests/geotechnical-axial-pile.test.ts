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
const units = { force: "kN", length: "m" } as const;

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

interface JsonObject {
  toJSON(): Record<string, unknown>;
}

type Constructor = new (input: Record<string, unknown>) => JsonObject;

interface PileApi {
  SoilMaterial: Constructor;
  GroundProfile: Constructor;
  GroundModel: Constructor;
  GeotechnicalDesignSituation: Constructor;
  DeepFoundationModel: Constructor;
  AxialPileLoadScenario: Constructor;
  AxialPileCapacityAnalysis: new () => {
    analyze(input: Record<string, unknown>): Record<string, unknown>;
  };
  GeotechnicalDeepFoundationApplication: new () => {
    run(input: Record<string, unknown>): JsonObject;
  };
}

function apiFrom(source: Record<string, unknown>): PileApi {
  return source as unknown as PileApi;
}

const baselineApi = apiFrom(JavaScriptApi);
const typescriptApi = apiFrom(TypeScriptApi);

function jsonValue(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value)) as unknown;
}

function withoutStructuredNormativeExtension(value: unknown): unknown {
  const normalized = jsonValue(value);
  if (
    normalized != null &&
    typeof normalized === "object" &&
    !Array.isArray(normalized) &&
    "metadata" in normalized
  ) {
    const metadata = normalized.metadata;
    if (metadata != null && typeof metadata === "object" && !Array.isArray(metadata)) {
      delete (metadata as Record<string, unknown>).normativeReferences;
    }
  }
  return normalized;
}

function drainedMaterial(
  api: PileApi,
  { id, bulk, saturated }: { id: string; bulk: number; saturated: number },
): JsonObject {
  return new api.SoilMaterial({
    id,
    name: id,
    unitWeight: { bulk, saturated },
    parameterSets: [
      {
        id: `${id}-characteristic`,
        basis: "characteristic",
        drainage: "drained",
        strength: {
          model: "mohr-coulomb-effective",
          frictionAngle: 32,
          cohesion: 0,
        },
        provenance: { source: "parity-characterization" },
      },
    ],
    angleUnits: "deg",
    units,
  });
}

function undrainedMaterial(api: PileApi): JsonObject {
  return new api.SoilMaterial({
    id: "clay",
    name: "clay",
    unitWeight: { bulk: 18, saturated: 20 },
    parameterSets: [
      {
        id: "clay-characteristic",
        basis: "characteristic",
        drainage: "undrained",
        strength: {
          model: "total-stress-undrained",
          undrainedShearStrength: 50,
        },
        provenance: { source: "parity-characterization" },
      },
    ],
    units,
  });
}

function pile(api: PileApi, diameter = 1): JsonObject {
  return new api.DeepFoundationModel({
    id: "pile-1",
    geometry: { model: "circular", diameter },
    placement: {
      x: 2,
      y: 3,
      headElevation: 0.5,
      soilContactTopElevation: 0,
      toeElevation: -10,
    },
    construction: {
      installationMethod: "driven-precast",
      structuralMaterial: "reinforced-concrete",
      displacementClass: "displacement",
      baseCondition: "closed-ended",
    },
    units,
  });
}

function layeredDrainedFixture(api: PileApi) {
  const upper = drainedMaterial(api, { id: "upper-sand", bulk: 18, saturated: 20 });
  const lower = drainedMaterial(api, { id: "lower-sand", bulk: 19, saturated: 22 });
  const profile = new api.GroundProfile({
    id: "layered-profile",
    groundSurfaceElevation: 0,
    materials: [upper, lower],
    layers: [
      {
        id: "upper-layer",
        topElevation: 0,
        bottomElevation: -4,
        materialId: "upper-sand",
      },
      {
        id: "lower-layer",
        topElevation: -4,
        bottomElevation: -15,
        materialId: "lower-sand",
      },
    ],
    groundwater: {
      model: "hydrostatic",
      waterTableElevation: -2,
      waterUnitWeight: 10,
    },
    units,
  });
  const groundModel = new api.GroundModel({
    id: "layered-ground",
    materials: [upper, lower],
    profiles: [profile],
    units,
  });
  const designSituation = new api.GeotechnicalDesignSituation({
    id: "layered-uls",
    groundModel,
    limitState: "ULS",
    drainageCondition: "drained",
    requiredParameterBasis: "characteristic",
    profileId: "layered-profile",
    units,
  });
  const scenario = new api.AxialPileLoadScenario({
    id: "compression",
    direction: "compression",
    action: {
      axialForce: 1000,
      basis: "design",
      referencePoint: "pile-head",
      includesPileSelfWeight: true,
    },
    surfaceSurcharge: 10,
    shaftResistanceByLayer: {
      "upper-layer": {
        method: "effective-stress",
        coefficientModel: "assigned-beta",
        beta: 0.25,
        provenance: { source: "project-method-upper" },
      },
      "lower-layer": {
        method: "effective-stress",
        coefficientModel: "k-tan-delta",
        lateralEarthPressureCoefficient: 1,
        interfaceFrictionAngle: Math.atan(0.3),
        angleUnits: "rad",
        provenance: { source: "project-method-lower" },
      },
    },
    baseResistance: {
      method: "effective-stress-nq",
      bearingLayerId: "lower-layer",
      bearingCapacityFactor: 20,
      provenance: { source: "project-tip-method" },
    },
    resistanceConversion: {
      model: "component-divisors",
      shaftDivisor: 1.5,
      baseDivisor: 2,
      overallDivisor: 1.1,
      provenance: { source: "parity-resistance-format" },
    },
    units,
  });
  return { groundModel, designSituation, scenario };
}

function analyzeDrained(api: PileApi, scenarioTransform?: (value: JsonObject) => JsonObject) {
  const fixture = layeredDrainedFixture(api);
  const scenario = scenarioTransform ? scenarioTransform(fixture.scenario) : fixture.scenario;
  return new api.AxialPileCapacityAnalysis().analyze({
    groundModel: fixture.groundModel,
    designSituation: fixture.designSituation,
    pile: pile(api),
    scenario,
    units,
  });
}

void test("axial pile DTO normalization matches the live baseline", () => {
  const baselineFixture = layeredDrainedFixture(baselineApi);
  const typescriptFixture = layeredDrainedFixture(typescriptApi);
  assert.deepEqual(
    jsonValue(typescriptFixture.groundModel.toJSON()),
    jsonValue(baselineFixture.groundModel.toJSON()),
  );
  assert.deepEqual(
    jsonValue(typescriptFixture.designSituation.toJSON()),
    jsonValue(baselineFixture.designSituation.toJSON()),
  );
  assert.deepEqual(
    jsonValue(typescriptFixture.scenario.toJSON()),
    jsonValue(baselineFixture.scenario.toJSON()),
  );
  assert.deepEqual(jsonValue(pile(typescriptApi).toJSON()), jsonValue(pile(baselineApi).toJSON()));
});

void test("layered drained axial capacity matches the live baseline exactly", () => {
  assert.deepEqual(
    withoutStructuredNormativeExtension(analyzeDrained(typescriptApi)),
    withoutStructuredNormativeExtension(analyzeDrained(baselineApi)),
  );
  const target = analyzeDrained(typescriptApi);
  const metadata = target.metadata as Record<string, unknown>;
  const references = metadata.normativeReferences as Array<Record<string, unknown>>;
  assert.equal(references[0]?.resolutionStatus, "outside-corpus");
  assert.equal(references[0]?.documentId, "usace-em-1110-2-2906-1991");
});

void test("effective-stress ceiling crossing matches the live baseline exactly", () => {
  const transform =
    (api: PileApi) =>
    (scenario: JsonObject): JsonObject => {
      const payload = scenario.toJSON();
      const methods = payload.shaftResistanceByLayer as Record<string, Record<string, unknown>>;
      (methods["upper-layer"] as Record<string, unknown>).maximumEffectiveVerticalStress = 50;
      return new api.AxialPileLoadScenario(payload);
    };
  assert.deepEqual(
    withoutStructuredNormativeExtension(analyzeDrained(typescriptApi, transform(typescriptApi))),
    withoutStructuredNormativeExtension(analyzeDrained(baselineApi, transform(baselineApi))),
  );
});

function analyzeUndrained(api: PileApi, direction: "compression" | "tension") {
  const clay = undrainedMaterial(api);
  const profile = new api.GroundProfile({
    id: "clay-profile",
    groundSurfaceElevation: 0,
    materials: [clay],
    layers: [
      {
        id: "clay-layer",
        topElevation: 0,
        bottomElevation: -20,
        materialId: "clay",
      },
    ],
    units,
  });
  const groundModel = new api.GroundModel({
    id: "clay-ground",
    materials: [clay],
    profiles: [profile],
    units,
  });
  const designSituation = new api.GeotechnicalDesignSituation({
    id: "clay-uls",
    groundModel,
    limitState: "ULS",
    drainageCondition: "undrained",
    requiredParameterBasis: "characteristic",
    profileId: "clay-profile",
    units,
  });
  const scenario = new api.AxialPileLoadScenario({
    id: `clay-${direction}`,
    direction,
    shaftResistanceByLayer: {
      "clay-layer": {
        method: "alpha-undrained",
        adhesionFactor: direction === "compression" ? 0.6 : 0.45,
        provenance: { source: "assigned-alpha" },
      },
    },
    ...(direction === "compression"
      ? {
          baseResistance: {
            method: "undrained-nc",
            bearingLayerId: "clay-layer",
            bearingCapacityFactor: 9,
            provenance: { source: "assigned-Nc" },
          },
        }
      : {}),
    units,
  });
  return new api.AxialPileCapacityAnalysis().analyze({
    groundModel,
    designSituation,
    pile: pile(api, 0.5),
    scenario,
    units,
  });
}

for (const direction of ["compression", "tension"] as const) {
  void test(`undrained ${direction} capacity matches the live baseline exactly`, () => {
    assert.deepEqual(
      withoutStructuredNormativeExtension(analyzeUndrained(typescriptApi, direction)),
      withoutStructuredNormativeExtension(analyzeUndrained(baselineApi, direction)),
    );
  });
}

void test("deep-foundation application serialization matches the live baseline", () => {
  const run = (api: PileApi) => {
    const fixture = layeredDrainedFixture(api);
    return new api.GeotechnicalDeepFoundationApplication().run({
      ...fixture,
      pile: pile(api),
      units,
    });
  };
  assert.deepEqual(
    withoutStructuredNormativeExtension(run(typescriptApi).toJSON()),
    withoutStructuredNormativeExtension(run(baselineApi).toJSON()),
  );
});
