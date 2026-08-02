import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const sourceRoot = path.resolve(repositoryRoot, "..", "strutture-js");
const sourceRevision = "6f33baead8b88166c4b2cf94af41763412e3c751";

interface RuntimeScenario {
  toJSON(): Record<string, unknown>;
}

interface RuntimeModule {
  GROUND_ANCHOR_DEMAND_SOURCES: readonly string[];
  GROUND_ANCHOR_FAILURE_SURFACE_MODELS: readonly string[];
  GROUND_ANCHOR_BOND_RESISTANCE_MODELS: readonly string[];
  GROUND_ANCHOR_GROUND_CLASSES: readonly string[];
  GROUND_ANCHOR_TEST_TYPES: readonly string[];
  GroundAnchorDesignScenario: new (options: Record<string, unknown>) => RuntimeScenario;
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
  throw new Error("Expected the ground-anchor scenario case to throw.");
}

function createOptions(): Record<string, unknown> {
  return {
    id: "scenario-α",
    name: "Scenario β",
    designMethod: "fhwa-gec4-allowable-load",
    demand: {
      source: "assigned-tendon-load",
      selection: "maximum-absolute",
      designLoad: 300,
      provenance: { source: "scenario-source-γ" },
      metadata: { demandLabel: "carico δ" },
    },
    lockOffLoadFactor: 0.9,
    testLoadFactor: 1.33,
    criticalFailureSurface: {
      model: "rankine-active-wedge",
      frictionAngle: 30,
      excavationBaseElevation: -5,
      wallHeight: 5,
      provenance: { source: "scenario-source-γ" },
      metadata: { surfaceLabel: "wedge ε" },
    },
    bondResistanceByZone: {
      "sand-zone-ζ": {
        model: "fhwa-presumptive",
        catalogId: "sand-medium-dense",
        groundClass: "soil",
        capacityDivisor: 2,
        provenance: { source: "catalog-η" },
      },
      "rock-zone-θ": {
        model: "ultimate-transfer-load",
        groundClass: "competent-rock",
        capacityDivisor: 3,
        ultimateTransferLoad: 440,
        provenance: { source: "test-ι" },
      },
    },
    bondResistanceByMaterial: {
      "material-κ": {
        model: "ultimate-bond-stress",
        groundClass: "weak-rock",
        capacityDivisor: 2.5,
        ultimateBondStress: 120,
        provenance: { source: "test-ι" },
      },
    },
    defaultBondResistance: {
      model: "fhwa-presumptive",
      catalogId: "sand-medium-dense",
    },
    corrosionEnvironment: {
      serviceLife: "permanent",
      aggressivity: "aggressive",
      consequencesOfFailure: "serious",
      higherProtectionCost: "significant",
      measurements: {
        pH: 7.2,
        resistivityOhmCm: 1000,
        sulfidesPresent: true,
        strayCurrentsPresent: false,
        adjacentConcreteChemicalAttack: true,
      },
      provenance: { source: "corrosion-λ" },
      metadata: { environmentLabel: "ambiente μ" },
    },
    testing: {
      jackLength: 0.5,
      metadata: { testingLabel: "prova ν" },
      records: [
        {
          id: "record-ξ",
          type: "performance",
          alignmentLoad: 20,
          testLoad: 399,
          elasticMovementAtTestLoad: 0.008,
          totalMovementAtTestLoad: 0.01,
          initialLiftOffLoad: 270,
          holds: [
            {
              load: 399,
              observations: [
                { timeMinutes: 6, movement: 0.0105 },
                { timeMinutes: 1, movement: 0.01 },
                { timeMinutes: 10, movement: 0.0108 },
              ],
            },
          ],
          provenance: { source: "field-ο" },
          metadata: { recordLabel: "hold π" },
        },
      ],
    },
    angleUnits: "deg",
    units: { force: "kN", length: "m" },
    metadata: { label: "scenario ρ" },
  };
}

void test("GroundAnchorDesignScenario matches the independent pinned JavaScript implementation", async () => {
  assert.equal(gitOutput("rev-parse", "HEAD"), sourceRevision);
  assert.equal(gitOutput("status", "--porcelain"), "");
  const sourceModuleValue: unknown = await import(
    pathToFileURL(path.join(sourceRoot, "src", "index.js")).href
  );
  const typescriptModuleValue: unknown = await import(
    pathToFileURL(path.join(repositoryRoot, "dist", "index.js")).href
  );
  if (!isRuntimeModule(sourceModuleValue) || !isRuntimeModule(typescriptModuleValue)) {
    throw new Error("Ground-anchor scenario exports do not expose the expected API.");
  }
  assert.deepEqual(
    typescriptModuleValue.GROUND_ANCHOR_DEMAND_SOURCES,
    sourceModuleValue.GROUND_ANCHOR_DEMAND_SOURCES,
  );
  assert.deepEqual(
    typescriptModuleValue.GROUND_ANCHOR_FAILURE_SURFACE_MODELS,
    sourceModuleValue.GROUND_ANCHOR_FAILURE_SURFACE_MODELS,
  );
  assert.deepEqual(
    typescriptModuleValue.GROUND_ANCHOR_BOND_RESISTANCE_MODELS,
    sourceModuleValue.GROUND_ANCHOR_BOND_RESISTANCE_MODELS,
  );
  assert.deepEqual(
    typescriptModuleValue.GROUND_ANCHOR_GROUND_CLASSES,
    sourceModuleValue.GROUND_ANCHOR_GROUND_CLASSES,
  );
  assert.deepEqual(
    typescriptModuleValue.GROUND_ANCHOR_TEST_TYPES,
    sourceModuleValue.GROUND_ANCHOR_TEST_TYPES,
  );
  assert.notEqual(
    typescriptModuleValue.GroundAnchorDesignScenario,
    sourceModuleValue.GroundAnchorDesignScenario,
  );

  const sourceScenario = new sourceModuleValue.GroundAnchorDesignScenario(createOptions());
  const typescriptScenario = new typescriptModuleValue.GroundAnchorDesignScenario(createOptions());
  assert.deepEqual(typescriptScenario.toJSON(), sourceScenario.toJSON());
  assert.deepEqual(
    [...JSON.stringify(typescriptScenario.toJSON())],
    [...JSON.stringify(sourceScenario.toJSON())],
  );
  assert.equal(typescriptScenario.toJSON().id, "scenario-α");

  const invalidCases: readonly [
    (moduleValue: RuntimeModule) => unknown,
    (moduleValue: RuntimeModule) => unknown,
  ][] = [
    [
      (moduleValue) =>
        new moduleValue.GroundAnchorDesignScenario({ ...createOptions(), units: null }),
      (moduleValue) =>
        new moduleValue.GroundAnchorDesignScenario({ ...createOptions(), units: null }),
    ],
    [
      (moduleValue) =>
        new moduleValue.GroundAnchorDesignScenario({
          ...createOptions(),
          designMethod: "unsupported-σ",
        }),
      (moduleValue) =>
        new moduleValue.GroundAnchorDesignScenario({
          ...createOptions(),
          designMethod: "unsupported-σ",
        }),
    ],
    [
      (moduleValue) =>
        new moduleValue.GroundAnchorDesignScenario({
          ...createOptions(),
          demand: { source: "assigned-tendon-load", designLoad: 300 },
        }),
      (moduleValue) =>
        new moduleValue.GroundAnchorDesignScenario({
          ...createOptions(),
          demand: { source: "assigned-tendon-load", designLoad: 300 },
        }),
    ],
    [
      (moduleValue) =>
        new moduleValue.GroundAnchorDesignScenario({
          ...createOptions(),
          bondResistanceByZone: {},
          bondResistanceByMaterial: {},
          defaultBondResistance: null,
        }),
      (moduleValue) =>
        new moduleValue.GroundAnchorDesignScenario({
          ...createOptions(),
          bondResistanceByZone: {},
          bondResistanceByMaterial: {},
          defaultBondResistance: null,
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
