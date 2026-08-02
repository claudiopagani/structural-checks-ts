import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const sourceRoot = path.resolve(repositoryRoot, "..", "strutture-js");
const sourceRevision = "6f33baead8b88166c4b2cf94af41763412e3c751";

interface RuntimeInstance {
  discretize(options: Record<string, unknown>): Record<string, unknown>;
}

interface RuntimeModule {
  SLOPE_SLICE_DISCRETIZATION_2D_SCHEMA_VERSION: string;
  SlopeSliceDiscretizer2D: new () => RuntimeInstance;
  CircularSlipSurface2D: {
    fromChordAndSagitta(options: Record<string, unknown>): RuntimeInstance;
  };
  GeotechnicalDesignSituation: new (options: Record<string, unknown>) => RuntimeInstance;
  GroundModel: new (options: Record<string, unknown>) => RuntimeInstance;
  GroundSection2D: new (options: Record<string, unknown>) => RuntimeInstance;
  PorePressureField2D: new (options: Record<string, unknown>) => RuntimeInstance;
  SoilMaterial: new (options: Record<string, unknown>) => RuntimeInstance;
  SlopeSurfaceSurcharge2D: new (options: Record<string, unknown>) => RuntimeInstance;
}

function isRuntimeModule(value: unknown): value is RuntimeModule {
  return value !== null && typeof value === "object";
}

function gitOutput(...arguments_: readonly string[]): string {
  return execFileSync("git", ["-C", sourceRoot, ...arguments_], { encoding: "utf8" }).trim();
}

function capture(action: () => unknown): { name: string; message: string } {
  try {
    action();
  } catch (error) {
    if (error instanceof Error) return { name: error.name, message: error.message };
    throw error;
  }
  throw new Error("Expected the discretizer case to throw.");
}

function isUnknownArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

function createFixture(moduleValue: RuntimeModule, seismic?: Record<string, unknown>) {
  const units = { force: "kN", length: "m" };
  const material = new moduleValue.SoilMaterial({
    id: "soil-β",
    name: "soil-β",
    unitWeight: { bulk: 18, saturated: 20 },
    parameterSets: [
      {
        id: "characteristic-drained",
        basis: "characteristic",
        drainage: "drained",
        strength: {
          model: "mohr-coulomb-effective",
          frictionAngle: 25,
          cohesion: 10,
        },
        provenance: { source: "test-fixture-α" },
      },
    ],
    defaultParameterSetId: "characteristic-drained",
    angleUnits: "deg",
    units,
  });
  const section = new moduleValue.GroundSection2D({
    id: "section-γ",
    surface: {
      points: [
        { x: 0, z: 10 },
        { x: 10, z: 0 },
        { x: 20, z: 0 },
      ],
    },
    zones: [
      {
        id: "zone-δ",
        materialId: "soil-β",
        polygon: [
          { x: 0, z: -20 },
          { x: 20, z: -20 },
          { x: 20, z: 0 },
          { x: 10, z: 0 },
          { x: 0, z: 10 },
        ],
      },
    ],
    units,
  });
  const field = new moduleValue.PorePressureField2D({
    id: "dry-ζ",
    model: "none",
    units,
  });
  const groundModel = new moduleValue.GroundModel({
    id: "ground-η",
    materials: [material],
    sections: [section],
    porePressureFields: [field],
    defaultSectionId: "section-γ",
    defaultPorePressureFieldId: "dry-ζ",
    units,
  });
  const designSituation = new moduleValue.GeotechnicalDesignSituation({
    id: "situation-θ",
    groundModel,
    situationType: "persistent",
    limitState: "not-specified",
    drainageCondition: "drained",
    requiredParameterBasis: "characteristic",
    sectionId: "section-γ",
    porePressureFieldId: "dry-ζ",
    seismic: seismic ?? { model: "none" },
    units,
  });
  const slipSurface = moduleValue.CircularSlipSurface2D.fromChordAndSagitta({
    id: "circle-ι",
    entry: { x: 0, z: 10 },
    exit: { x: 10, z: 0 },
    sagitta: 2,
    units,
  });
  const surcharge = new moduleValue.SlopeSurfaceSurcharge2D({
    id: "surcharge-κ",
    intensity: 2,
    minimumX: 2,
    maximumX: 7,
    units,
  });
  return { groundModel, designSituation, slipSurface, surcharge };
}

function runValid(moduleValue: RuntimeModule): Record<string, unknown> {
  const fixture = createFixture(moduleValue);
  return new moduleValue.SlopeSliceDiscretizer2D().discretize({
    groundModel: fixture.groundModel,
    designSituation: fixture.designSituation,
    slipSurface: fixture.slipSurface,
    sliceCount: 8,
    surfaceSurcharges: [fixture.surcharge],
  });
}

void test("SlopeSliceDiscretizer2D matches the independent pinned JavaScript implementation", async () => {
  assert.equal(gitOutput("rev-parse", "HEAD"), sourceRevision);
  assert.equal(gitOutput("status", "--porcelain"), "");
  const sourceModuleValue: unknown = await import(
    pathToFileURL(path.join(sourceRoot, "src", "index.js")).href
  );
  const typescriptModuleValue: unknown = await import(
    pathToFileURL(path.join(repositoryRoot, "dist", "index.js")).href
  );
  if (!isRuntimeModule(sourceModuleValue) || !isRuntimeModule(typescriptModuleValue)) {
    throw new Error("Slope-slice exports do not expose the expected API.");
  }
  assert.equal(
    sourceModuleValue.SLOPE_SLICE_DISCRETIZATION_2D_SCHEMA_VERSION,
    typescriptModuleValue.SLOPE_SLICE_DISCRETIZATION_2D_SCHEMA_VERSION,
  );
  assert.notEqual(
    typescriptModuleValue.SlopeSliceDiscretizer2D,
    sourceModuleValue.SlopeSliceDiscretizer2D,
  );

  const sourceResult = runValid(sourceModuleValue);
  const typescriptResult = runValid(typescriptModuleValue);
  assert.deepEqual(typescriptResult, sourceResult);
  assert.deepEqual([...JSON.stringify(typescriptResult)], [...JSON.stringify(sourceResult)]);
  assert.equal(typescriptResult.sectionId, "section-γ");
  const typescriptSlices = typescriptResult.slices;
  if (!isUnknownArray(typescriptSlices)) throw new Error("Expected serialized slices.");
  const firstSlice = typescriptSlices[0];
  if (firstSlice === null || typeof firstSlice !== "object") {
    throw new Error("Expected a serialized slice object.");
  }
  assert.equal(Reflect.get(firstSlice, "materialId"), "soil-β");

  const invalidCases: readonly [
    (moduleValue: RuntimeModule) => unknown,
    (moduleValue: RuntimeModule) => unknown,
  ][] = [
    [
      (moduleValue) => new moduleValue.SlopeSliceDiscretizer2D().discretize({}),
      (moduleValue) => new moduleValue.SlopeSliceDiscretizer2D().discretize({}),
    ],
    [
      (moduleValue) =>
        new moduleValue.SlopeSliceDiscretizer2D().discretize({
          ...createFixture(moduleValue),
          sliceCount: 3,
        }),
      (moduleValue) =>
        new moduleValue.SlopeSliceDiscretizer2D().discretize({
          ...createFixture(moduleValue),
          sliceCount: 3,
        }),
    ],
    [
      (moduleValue) =>
        new moduleValue.SlopeSliceDiscretizer2D().discretize({
          ...createFixture(moduleValue),
          surfaceSurcharges: [{}],
        }),
      (moduleValue) =>
        new moduleValue.SlopeSliceDiscretizer2D().discretize({
          ...createFixture(moduleValue),
          surfaceSurcharges: [{}],
        }),
    ],
    [
      (moduleValue) =>
        new moduleValue.SlopeSliceDiscretizer2D().discretize({
          ...createFixture(moduleValue, {
            model: "pseudostatic",
            kh: 0.1,
            kv: 0.05,
            verticalConvention: "unsupported-κ",
          }),
        }),
      (moduleValue) =>
        new moduleValue.SlopeSliceDiscretizer2D().discretize({
          ...createFixture(moduleValue, {
            model: "pseudostatic",
            kh: 0.1,
            kv: 0.05,
            verticalConvention: "unsupported-κ",
          }),
        }),
    ],
  ];
  for (const [sourceCase, typescriptCase] of invalidCases) {
    assert.deepEqual(
      capture(() => sourceCase(sourceModuleValue)),
      capture(() => typescriptCase(typescriptModuleValue)),
    );
  }
});
