import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const sourceRoot = path.resolve(repositoryRoot, "..", "strutture-js");
const normativeRoot = path.resolve(repositoryRoot, "..", "strutture-normative");
const sourceRevision = "6f33baead8b88166c4b2cf94af41763412e3c751";
const normativeRevision = "41da3faa489600173106935bbcf726119300e48d";

type RuntimeModule = Record<string, unknown>;
type RuntimeEntity = { id: string; toJSON(): unknown };
type RuntimeResult = { toJSON(): unknown };
type RuntimeApplication = {
  getManifest(): unknown;
  run(input?: unknown): RuntimeResult;
};
type RuntimeApplicationConstructor = new () => RuntimeApplication;
type RuntimeConstructor = new (options: Record<string, unknown>) => RuntimeEntity;
type RuntimeCircularSlipSurfaceConstructor = RuntimeConstructor & {
  fromChordAndSagitta(options: Record<string, unknown>): RuntimeEntity;
};

interface RootRuntimeModule extends RuntimeModule {
  GeotechnicalSlopeStabilityApplication: RuntimeApplicationConstructor;
  SoilMaterial: RuntimeConstructor;
  GroundSection2D: RuntimeConstructor;
  PorePressureField2D: RuntimeConstructor;
  GroundModel: RuntimeConstructor;
  GeotechnicalDesignSituation: RuntimeConstructor;
  CircularSlipSurface2D: RuntimeCircularSlipSurfaceConstructor;
}

function isRecord(value: unknown): value is RuntimeModule {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isCircularSlipSurfaceConstructor(
  value: unknown,
): value is RuntimeCircularSlipSurfaceConstructor {
  return (
    typeof value === "function" &&
    "fromChordAndSagitta" in value &&
    typeof value.fromChordAndSagitta === "function"
  );
}

function isRootRuntimeModule(value: unknown): value is RootRuntimeModule {
  return (
    isRecord(value) &&
    typeof value.GeotechnicalSlopeStabilityApplication === "function" &&
    typeof value.SoilMaterial === "function" &&
    typeof value.GroundSection2D === "function" &&
    typeof value.PorePressureField2D === "function" &&
    typeof value.GroundModel === "function" &&
    typeof value.GeotechnicalDesignSituation === "function" &&
    isCircularSlipSurfaceConstructor(value.CircularSlipSurface2D)
  );
}

function isApplicationModule(value: unknown): value is RuntimeModule {
  return (
    isRecord(value) &&
    typeof value.GeotechnicalSlopeStabilityApplication === "function" &&
    typeof value.CircularSlopeStabilityAnalysis === "function" &&
    typeof value.CircularSlipSurface2D === "function" &&
    Array.isArray(value.SLOPE_STABILITY_ANALYSIS_MODES) &&
    Array.isArray(value.SLOPE_STABILITY_METHODS)
  );
}

function gitOutput(repository: string, ...arguments_: readonly string[]): string {
  return execFileSync("git", ["-C", repository, ...arguments_], { encoding: "utf8" }).trim();
}

async function loadModule(root: string, relativePath: string): Promise<RuntimeModule> {
  const module: unknown = await import(pathToFileURL(path.join(root, relativePath)).href);
  if (!isRecord(module)) {
    throw new Error(`The module ${relativePath} is not an object module.`);
  }
  return module;
}

function assertExactParity(source: unknown, typescript: unknown, label: string): void {
  assert.deepEqual(typescript, source, label);
  assert.equal(JSON.stringify(typescript), JSON.stringify(source), `${label}: exact JSON`);
  assert.deepEqual([...JSON.stringify(typescript)], [...JSON.stringify(source)]);
}

function createFixture(moduleValue: RootRuntimeModule): RuntimeModule {
  const units = { force: "kN", length: "m" };
  const source = "slope-stability application oracle \u2014 \u03B1\u03B2\u03B3";
  const soil = new moduleValue.SoilMaterial({
    id: "slope-soil-\u03B4",
    name: "Slope soil \u03BC",
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
        provenance: { source },
      },
    ],
    defaultParameterSetId: "characteristic-drained",
    angleUnits: "deg",
    units,
  });
  const section = new moduleValue.GroundSection2D({
    id: "slope-section-\u03B5",
    surface: {
      points: [
        { x: 0, z: 10 },
        { x: 10, z: 0 },
        { x: 20, z: 0 },
      ],
    },
    zones: [
      {
        id: "slope-zone-\u03B6",
        materialId: soil.id,
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
  const porePressure = new moduleValue.PorePressureField2D({
    id: "dry-\u03B7",
    model: "none",
    units,
  });
  const groundModel = new moduleValue.GroundModel({
    id: "slope-ground-model-\u03B8",
    materials: [soil],
    sections: [section],
    porePressureFields: [porePressure],
    defaultSectionId: section.id,
    defaultPorePressureFieldId: porePressure.id,
    units,
  });
  const designSituation = new moduleValue.GeotechnicalDesignSituation({
    id: "slope-situation-\u03B9",
    groundModel,
    situationType: "persistent",
    limitState: "not-specified",
    drainageCondition: "drained",
    requiredParameterBasis: "characteristic",
    sectionId: section.id,
    porePressureFieldId: porePressure.id,
    units,
  });
  const slipSurface = moduleValue.CircularSlipSurface2D.fromChordAndSagitta({
    id: "assigned-circle-\u03BA",
    entry: { x: 0, z: 10 },
    exit: { x: 10, z: 0 },
    sagitta: 2,
    units,
  });
  return {
    groundModel,
    designSituation,
    slipSurface,
    sliceCount: 30,
    units,
  };
}

function applicationResult(moduleValue: RootRuntimeModule, input: unknown): unknown {
  return new moduleValue.GeotechnicalSlopeStabilityApplication().run(input).toJSON();
}

function captureError(run: () => unknown): { name: string; message: string } | null {
  try {
    run();
    return null;
  } catch (error: unknown) {
    if (!(error instanceof Error)) {
      throw new Error("The application threw a non-Error value.", { cause: error });
    }
    return { name: error.name, message: error.message };
  }
}

void test("geotechnical slope-stability application matches the independent pinned JavaScript implementation", async () => {
  assert.equal(gitOutput(sourceRoot, "rev-parse", "HEAD"), sourceRevision);
  assert.equal(gitOutput(sourceRoot, "status", "--porcelain"), "");
  assert.equal(gitOutput(normativeRoot, "rev-parse", "HEAD"), normativeRevision);
  assert.equal(gitOutput(normativeRoot, "status", "--porcelain"), "");

  const sourceRootModuleValue: unknown = await loadModule(sourceRoot, "src/index.js");
  const typescriptRootModuleValue: unknown = await loadModule(
    path.join(repositoryRoot, "dist"),
    "index.js",
  );
  const sourceApplicationModuleValue: unknown = await loadModule(
    sourceRoot,
    "src/applications/geotechnical-slope-stability/index.js",
  );
  const typescriptApplicationModuleValue: unknown = await loadModule(
    path.join(repositoryRoot, "dist"),
    "applications/geotechnical-slope-stability/index.js",
  );
  if (
    !isRootRuntimeModule(sourceRootModuleValue) ||
    !isRootRuntimeModule(typescriptRootModuleValue) ||
    !isApplicationModule(sourceApplicationModuleValue) ||
    !isApplicationModule(typescriptApplicationModuleValue)
  ) {
    throw new Error("Geotechnical slope-stability exports do not expose the expected API.");
  }

  assert.deepEqual(
    Object.keys(typescriptApplicationModuleValue),
    Object.keys(sourceApplicationModuleValue),
  );
  const runtimeExports = [
    "GeotechnicalSlopeStabilityApplication",
    "CIRCULAR_SLIP_SURFACE_2D_SCHEMA_VERSION",
    "CIRCULAR_SLOPE_STABILITY_RESULT_SCHEMA_VERSION",
    "GROUND_ANCHOR_STABILITY_ACTION_2D_SCHEMA_VERSION",
    "GROUND_ANCHOR_STABILITY_FORCE_MODELS",
    "GROUND_ANCHOR_STABILITY_REFERENCE",
    "SLOPE_MOVEMENT_DIRECTIONS",
    "SLOPE_STABILITY_ANALYSIS_MODES",
    "SLOPE_STABILITY_METHODS",
    "SLOPE_SLICE_DISCRETIZATION_2D_SCHEMA_VERSION",
    "SLOPE_SURFACE_SURCHARGE_2D_SCHEMA_VERSION",
    "CircularSlipSurface2D",
    "CircularSlopeStabilityAnalysis",
    "GroundAnchorStabilityAction2D",
    "SlopeSliceDiscretizer2D",
    "SlopeSurfaceSurcharge2D",
    "ordinaryMethodOfSlices",
    "simplifiedBishop",
    "spencerMethod",
  ];
  for (const name of runtimeExports) {
    const sourceValue: unknown = sourceApplicationModuleValue[name];
    const typescriptValue: unknown = typescriptApplicationModuleValue[name];
    if (typeof sourceValue === "function") {
      assert.notEqual(typescriptValue, sourceValue, `${name} independent implementation`);
    } else if (typeof sourceValue === "object" && sourceValue !== null) {
      assert.deepEqual(typescriptValue, sourceValue, `${name} exact value`);
      assert.notEqual(typescriptValue, sourceValue, `${name} independent implementation`);
    } else {
      assert.equal(typescriptValue, sourceValue, `${name} exact primitive`);
    }
    assert.equal(typescriptRootModuleValue[name], typescriptValue, `${name} TypeScript root alias`);
    assert.equal(sourceRootModuleValue[name], sourceValue, `${name} source root alias`);
  }

  const sourceApplication = new sourceRootModuleValue.GeotechnicalSlopeStabilityApplication();
  const typescriptApplication =
    new typescriptRootModuleValue.GeotechnicalSlopeStabilityApplication();
  assertExactParity(
    sourceApplication.getManifest(),
    typescriptApplication.getManifest(),
    "application manifest",
  );

  assertExactParity(
    applicationResult(sourceRootModuleValue, createFixture(sourceRootModuleValue)),
    applicationResult(typescriptRootModuleValue, createFixture(typescriptRootModuleValue)),
    "valid assigned-surface result",
  );
  assertExactParity(
    applicationResult(sourceRootModuleValue, {
      ...createFixture(sourceRootModuleValue),
      method: "unsupported-method",
    }),
    applicationResult(typescriptRootModuleValue, {
      ...createFixture(typescriptRootModuleValue),
      method: "unsupported-method",
    }),
    "unsupported method result",
  );
  assertExactParity(
    applicationResult(sourceRootModuleValue, { units: { force: "kN", length: "m" } }),
    applicationResult(typescriptRootModuleValue, { units: { force: "kN", length: "m" } }),
    "missing-input result",
  );
  assert.deepEqual(
    captureError(() => applicationResult(sourceRootModuleValue, null)),
    captureError(() => applicationResult(typescriptRootModuleValue, null)),
    "null input error",
  );
});
