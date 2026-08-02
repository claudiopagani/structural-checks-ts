import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const sourceRoot = path.resolve(repositoryRoot, "..", "strutture-js");
const sourceRevision = "6f33baead8b88166c4b2cf94af41763412e3c751";

interface RuntimeAnalysis {
  analyze(input: Record<string, unknown>): Record<string, unknown>;
}

interface RuntimeModule {
  CircularSlopeStabilityAnalysis: new () => RuntimeAnalysis;
}

function isRuntimeModule(value: unknown): value is RuntimeModule {
  return (
    value !== null &&
    typeof value === "object" &&
    typeof Reflect.get(value, "CircularSlopeStabilityAnalysis") === "function"
  );
}

function gitOutput(...arguments_: readonly string[]): string {
  return execFileSync("git", ["-C", sourceRoot, ...arguments_], { encoding: "utf8" }).trim();
}

function units(): Record<string, string> {
  return { force: "kN", length: "m" };
}

function createInput(): Record<string, unknown> {
  const unitSystem = units();
  const material = {
    id: "slope-soil-\u03B1",
    name: "Slope soil \u03B2",
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
        provenance: { source: "independent-fixture-\u03B3" },
      },
    ],
    defaultParameterSetId: "characteristic-drained",
    angleUnits: "deg",
    units: unitSystem,
  };
  const section = {
    id: "slope-section-\u03B4",
    surface: {
      points: [
        { x: 0, z: 10 },
        { x: 10, z: 0 },
        { x: 20, z: 0 },
      ],
    },
    zones: [
      {
        id: "slope-zone",
        materialId: material.id,
        polygon: [
          { x: 0, z: -20 },
          { x: 20, z: -20 },
          { x: 20, z: 0 },
          { x: 10, z: 0 },
          { x: 0, z: 10 },
        ],
      },
    ],
    units: unitSystem,
  };
  const field = { id: "dry-field", model: "none", units: unitSystem };
  return {
    groundModel: {
      id: "slope-ground-\u03B5",
      materials: [material],
      sections: [section],
      porePressureFields: [field],
      defaultSectionId: section.id,
      defaultPorePressureFieldId: field.id,
      units: unitSystem,
      metadata: { label: "ground-\u03B6" },
    },
    designSituation: {
      id: "slope-situation-\u03B7",
      situationType: "persistent",
      limitState: "not-specified",
      drainageCondition: "drained",
      requiredParameterBasis: "characteristic",
      sectionId: section.id,
      porePressureFieldId: field.id,
      units: unitSystem,
      metadata: { label: "situation-\u03B8" },
    },
    slipSurface: {
      id: "assigned-circle-\u03B9",
      entry: { x: 0, z: 10 },
      exit: { x: 10, z: 0 },
      sagitta: 2,
      movementDirection: "left-to-right",
      units: unitSystem,
      metadata: { label: "circle-\u03BA" },
    },
    sliceCount: 20,
    surfaceSurcharges: [
      {
        id: "surface-load-\u03BB",
        intensity: 2,
        minimumX: 1,
        maximumX: 7,
        units: unitSystem,
        metadata: { label: "load-\u03BC" },
      },
    ],
    iteration: {
      tolerance: 1e-9,
      maximumIterations: 100,
    },
    units: unitSystem,
  };
}

function createGroundAnchor(): Record<string, unknown> {
  const inclination = (10 * Math.PI) / 180;
  const pointAtDistance = (distance: number) => ({
    x: 8 - distance * Math.cos(inclination),
    z: 2 - distance * Math.sin(inclination),
  });
  return {
    id: "slope-anchor-\u03BD",
    head: pointAtDistance(0),
    bondStart: pointAtDistance(3),
    bondEnd: pointAtDistance(5),
    designTendonForce: 10,
    horizontalSpacing: 1,
    sourceVerificationStatus: "ok",
    units: units(),
    provenance: { source: "independent-anchor-fixture" },
  };
}

function captureResult(action: () => Record<string, unknown>): Record<string, unknown> {
  return action();
}

function record(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Expected a record fixture.");
  }
  return Object.fromEntries(Object.entries(value));
}

void test("Circular slope-stability analysis matches the independent pinned JavaScript implementation", async () => {
  assert.equal(gitOutput("rev-parse", "HEAD"), sourceRevision);
  assert.equal(gitOutput("status", "--porcelain"), "");
  const sourceModuleValue: unknown = await import(
    pathToFileURL(path.join(sourceRoot, "src", "index.js")).href
  );
  const typescriptModuleValue: unknown = await import(
    pathToFileURL(path.join(repositoryRoot, "dist", "index.js")).href
  );
  if (!isRuntimeModule(sourceModuleValue) || !isRuntimeModule(typescriptModuleValue)) {
    throw new Error("Circular slope-stability exports do not expose the expected API.");
  }
  assert.notEqual(
    Reflect.get(sourceModuleValue, "CircularSlopeStabilityAnalysis"),
    Reflect.get(typescriptModuleValue, "CircularSlopeStabilityAnalysis"),
  );

  const assignedInput = createInput();
  const sourceAssigned = new sourceModuleValue.CircularSlopeStabilityAnalysis().analyze(
    assignedInput,
  );
  const typescriptAssigned = new typescriptModuleValue.CircularSlopeStabilityAnalysis().analyze(
    assignedInput,
  );
  assert.deepEqual(typescriptAssigned, sourceAssigned);
  assert.equal(JSON.stringify(typescriptAssigned), JSON.stringify(sourceAssigned));
  assert.deepEqual([...JSON.stringify(typescriptAssigned)], [...JSON.stringify(sourceAssigned)]);

  const searchInput = {
    ...createInput(),
    slipSurface: null,
    search: {
      entryX: { minimum: 0, maximum: 1, count: 2 },
      exitX: { minimum: 9, maximum: 10, count: 2 },
      sagitta: { minimum: 1, maximum: 2, count: 2 },
      refinementIterations: 1,
      retainCandidates: 3,
    },
  };
  const sourceSearch = new sourceModuleValue.CircularSlopeStabilityAnalysis().analyze(searchInput);
  const typescriptSearch = new typescriptModuleValue.CircularSlopeStabilityAnalysis().analyze(
    searchInput,
  );
  assert.deepEqual(typescriptSearch, sourceSearch);
  assert.equal(JSON.stringify(typescriptSearch), JSON.stringify(sourceSearch));

  const pseudostaticInput = {
    ...createInput(),
    designSituation: {
      ...record(createInput().designSituation),
      seismic: { model: "pseudostatic", kh: 0.1, kv: 0.05 },
    },
    method: "spencer",
  };
  const sourcePseudostatic = new sourceModuleValue.CircularSlopeStabilityAnalysis().analyze(
    pseudostaticInput,
  );
  const typescriptPseudostatic = new typescriptModuleValue.CircularSlopeStabilityAnalysis().analyze(
    pseudostaticInput,
  );
  assert.deepEqual(typescriptPseudostatic, sourcePseudostatic);
  assert.equal(JSON.stringify(typescriptPseudostatic), JSON.stringify(sourcePseudostatic));

  const anchoredInput = {
    ...createInput(),
    groundAnchors: [createGroundAnchor()],
    method: "spencer",
  };
  const sourceAnchored = new sourceModuleValue.CircularSlopeStabilityAnalysis().analyze(
    anchoredInput,
  );
  const typescriptAnchored = new typescriptModuleValue.CircularSlopeStabilityAnalysis().analyze(
    anchoredInput,
  );
  assert.deepEqual(typescriptAnchored, sourceAnchored);
  assert.equal(JSON.stringify(typescriptAnchored), JSON.stringify(sourceAnchored));

  const unsupportedInput = {
    ...createInput(),
    designSituation: {
      ...record(createInput().designSituation),
      seismic: { model: "pseudostatic", kh: 0.1, kv: 0.05 },
    },
    method: "bishop-simplified",
  };
  const sourceUnsupported = new sourceModuleValue.CircularSlopeStabilityAnalysis().analyze(
    unsupportedInput,
  );
  const typescriptUnsupported = new typescriptModuleValue.CircularSlopeStabilityAnalysis().analyze(
    unsupportedInput,
  );
  assert.deepEqual(typescriptUnsupported, sourceUnsupported);

  const errorInputs: readonly Record<string, unknown>[] = [
    { ...createInput(), units: null },
    { ...createInput(), mode: "unsupported-mode" },
    { ...createInput(), surfaceSurcharges: "not-an-array" },
    {
      ...createInput(),
      search: {
        entryX: { minimum: 0, maximum: 1, count: 51 },
        exitX: { minimum: 0, maximum: 1, count: 51 },
        sagitta: { minimum: 0.1, maximum: 0.2, count: 51 },
      },
      slipSurface: null,
    },
  ];
  for (const input of errorInputs) {
    const sourceErrorResult = captureResult(() =>
      new sourceModuleValue.CircularSlopeStabilityAnalysis().analyze(input),
    );
    const typescriptErrorResult = captureResult(() =>
      new typescriptModuleValue.CircularSlopeStabilityAnalysis().analyze(input),
    );
    assert.deepEqual(typescriptErrorResult, sourceErrorResult);
    assert.equal(JSON.stringify(typescriptErrorResult), JSON.stringify(sourceErrorResult));
  }
});
