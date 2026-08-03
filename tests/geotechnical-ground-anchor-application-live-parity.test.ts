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
type RuntimeResult = { toJSON(): unknown };
type RuntimeApplication = {
  getManifest(): unknown;
  run(input?: Record<string, unknown>): RuntimeResult;
};
type RuntimeApplicationConstructor = new () => RuntimeApplication;

interface RootRuntimeModule extends RuntimeModule {
  GeotechnicalGroundAnchorApplication: RuntimeApplicationConstructor;
}

function isRecord(value: unknown): value is RuntimeModule {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isRootRuntimeModule(value: unknown): value is RootRuntimeModule {
  return isRecord(value) && typeof value.GeotechnicalGroundAnchorApplication === "function";
}

function isApplicationModule(value: unknown): value is RuntimeModule {
  return (
    isRecord(value) &&
    typeof value.GeotechnicalGroundAnchorApplication === "function" &&
    typeof value.GroundAnchorAnalysis === "function" &&
    typeof value.GroundAnchorDesignScenario === "function" &&
    typeof value.GroundAnchorModel === "function" &&
    typeof value.GroundAnchorStabilityAction2D === "function" &&
    typeof value.getGroundAnchorBondCatalogEntry === "function" &&
    typeof value.groundAnchorDemandFromEmbeddedWallResult === "function" &&
    typeof value.listGroundAnchorBondCatalogEntries === "function"
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

function createAnalysisOptions(): Record<string, unknown> {
  const units = { force: "kN", length: "m" };
  const source = "independent ground-anchor application oracle \u03B1";
  return {
    groundModel: {
      id: "anchor-ground-\u03B2",
      materials: [
        {
          id: "anchor-sand",
          name: "Anchor sand",
          unitWeight: { bulk: 18, saturated: 20 },
          parameterSets: [
            {
              id: "sand-characteristic",
              basis: "characteristic",
              drainage: "drained",
              strength: {
                model: "mohr-coulomb-effective",
                frictionAngle: 30,
                cohesion: 0,
              },
              provenance: { source },
            },
          ],
          angleUnits: "deg",
          units,
        },
        {
          id: "anchor-rock",
          name: "Anchor rock",
          unitWeight: { bulk: 22, saturated: 22 },
          parameterSets: [
            {
              id: "rock-characteristic",
              basis: "characteristic",
              drainage: "drained",
              strength: {
                model: "mohr-coulomb-effective",
                frictionAngle: 38,
                cohesion: 50,
              },
              provenance: { source },
            },
          ],
          angleUnits: "deg",
          units,
        },
      ],
      sections: [
        {
          id: "anchor-section",
          surface: {
            points: [
              { x: 0, z: 3 },
              { x: 30, z: 3 },
            ],
          },
          zones: [
            {
              id: "sand-zone",
              materialId: "anchor-sand",
              polygon: [
                { x: 0, z: -2.2 },
                { x: 30, z: -2.2 },
                { x: 30, z: 3 },
                { x: 0, z: 3 },
              ],
            },
            {
              id: "rock-zone",
              materialId: "anchor-rock",
              polygon: [
                { x: 0, z: -10 },
                { x: 30, z: -10 },
                { x: 30, z: -2.2 },
                { x: 0, z: -2.2 },
              ],
            },
          ],
          units,
        },
      ],
      defaultSectionId: "anchor-section",
      units,
    },
    designSituation: {
      id: "anchor-sls-\u03B3",
      limitState: "SLS",
      drainageCondition: "drained",
      sectionId: "anchor-section",
      units,
    },
    anchor: {
      id: "anchor-\u03B4",
      name: "Tirante \u03B5",
      head: { x: 0, z: 0 },
      inclination: 15,
      freeLength: 6,
      bondLength: 6,
      horizontalSpacing: 2,
      groutBodyDiameter: 0.15,
      tendon: {
        type: "strand",
        steelArea: 0.0014,
        elasticModulus: 195e6,
        specifiedMinimumTensileStrength: 1e6,
        provenance: { source },
      },
      corrosionProtection: {
        class: "I",
        details: {
          anchorage: { trumpet: true, exposed: false },
          unbondedLength: { system: "encapsulated-grout-filled-strand-sheaths" },
          bondLength: { system: "grout-filled-encapsulation" },
        },
        provenance: { source },
      },
      anchorage: {
        tensileCapacity: { value: 1200, provenance: { source } },
        tendonGroutBondCapacity: { value: 1200, provenance: { source } },
      },
      units,
      metadata: { label: "tirante \u03B6" },
    },
    scenario: {
      id: "anchor-design-\u03B7",
      demand: {
        source: "assigned-tendon-load",
        designLoad: 300,
        provenance: { source },
      },
      lockOffLoadFactor: 0.9,
      testLoadFactor: 1.33,
      criticalFailureSurface: {
        model: "rankine-active-wedge",
        frictionAngle: 30,
        excavationBaseElevation: -5,
        wallHeight: 5,
        provenance: { source },
      },
      bondResistanceByZone: {
        "sand-zone": { model: "fhwa-presumptive", catalogId: "sand-medium-dense" },
        "rock-zone": { model: "fhwa-presumptive", catalogId: "sandstone" },
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
        provenance: { source },
      },
      testing: {
        jackLength: 0.5,
        records: [
          {
            id: "performance-\u03B8",
            type: "performance",
            alignmentLoad: 20,
            testLoad: 399,
            initialLiftOffLoad: 270,
            elasticMovementAtTestLoad: 0.008,
            holds: [
              {
                load: 399,
                observations: [
                  { timeMinutes: 1, movement: 0.01 },
                  { timeMinutes: 6, movement: 0.0105 },
                  { timeMinutes: 10, movement: 0.0108 },
                ],
              },
            ],
            provenance: { source },
          },
        ],
      },
      units,
      metadata: { label: "scenario \u03B9" },
    },
    units,
  };
}

function applicationResult(
  moduleValue: RootRuntimeModule,
  input: Record<string, unknown>,
): unknown {
  return new moduleValue.GeotechnicalGroundAnchorApplication().run(input).toJSON();
}

void test("geotechnical ground-anchor application matches the independent pinned JavaScript implementation", async () => {
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
    "src/applications/geotechnical-ground-anchors/index.js",
  );
  const typescriptApplicationModuleValue: unknown = await loadModule(
    path.join(repositoryRoot, "dist"),
    "applications/geotechnical-ground-anchors/index.js",
  );
  if (
    !isRootRuntimeModule(sourceRootModuleValue) ||
    !isRootRuntimeModule(typescriptRootModuleValue) ||
    !isApplicationModule(sourceApplicationModuleValue) ||
    !isApplicationModule(typescriptApplicationModuleValue)
  ) {
    throw new Error("Ground-anchor exports do not expose the expected API.");
  }

  assert.deepEqual(
    Object.keys(typescriptApplicationModuleValue),
    Object.keys(sourceApplicationModuleValue),
  );
  const runtimeExports = [
    "GeotechnicalGroundAnchorApplication",
    "GROUND_ANCHOR_BOND_CATALOG",
    "GROUND_ANCHOR_BOND_CATALOG_IDS",
    "GROUND_ANCHOR_BOND_CATALOG_REFERENCE",
    "GROUND_ANCHOR_BOND_RESISTANCE_MODELS",
    "GROUND_ANCHOR_CORROSION_CLASSES",
    "GROUND_ANCHOR_DEMAND_SOURCES",
    "GROUND_ANCHOR_DESIGN_REFERENCE",
    "GROUND_ANCHOR_DESIGN_RESULT_SCHEMA_VERSION",
    "GROUND_ANCHOR_DESIGN_SCENARIO_SCHEMA_VERSION",
    "GROUND_ANCHOR_FAILURE_SURFACE_MODELS",
    "GROUND_ANCHOR_FHWA_CRITERIA",
    "GROUND_ANCHOR_GROUND_CLASSES",
    "GROUND_ANCHOR_HORIZONTAL_DIRECTIONS",
    "GROUND_ANCHOR_STABILITY_ACTION_2D_SCHEMA_VERSION",
    "GROUND_ANCHOR_STABILITY_FORCE_MODELS",
    "GROUND_ANCHOR_STABILITY_REFERENCE",
    "GROUND_ANCHOR_MODEL_SCHEMA_VERSION",
    "GROUND_ANCHOR_TENDON_TYPES",
    "GROUND_ANCHOR_TEST_TYPES",
    "GroundAnchorAnalysis",
    "GroundAnchorDesignScenario",
    "GroundAnchorModel",
    "GroundAnchorStabilityAction2D",
    "getGroundAnchorBondCatalogEntry",
    "groundAnchorDemandFromEmbeddedWallResult",
    "listGroundAnchorBondCatalogEntries",
  ];
  const independentExports = new Set([
    "GeotechnicalGroundAnchorApplication",
    "GROUND_ANCHOR_BOND_CATALOG",
    "GROUND_ANCHOR_BOND_CATALOG_IDS",
    "GROUND_ANCHOR_BOND_CATALOG_REFERENCE",
    "GROUND_ANCHOR_BOND_RESISTANCE_MODELS",
    "GROUND_ANCHOR_CORROSION_CLASSES",
    "GROUND_ANCHOR_DEMAND_SOURCES",
    "GROUND_ANCHOR_DESIGN_REFERENCE",
    "GROUND_ANCHOR_FAILURE_SURFACE_MODELS",
    "GROUND_ANCHOR_FHWA_CRITERIA",
    "GROUND_ANCHOR_GROUND_CLASSES",
    "GROUND_ANCHOR_HORIZONTAL_DIRECTIONS",
    "GROUND_ANCHOR_STABILITY_FORCE_MODELS",
    "GROUND_ANCHOR_STABILITY_REFERENCE",
    "GROUND_ANCHOR_TENDON_TYPES",
    "GROUND_ANCHOR_TEST_TYPES",
    "GroundAnchorAnalysis",
    "GroundAnchorDesignScenario",
    "GroundAnchorModel",
    "GroundAnchorStabilityAction2D",
    "getGroundAnchorBondCatalogEntry",
    "groundAnchorDemandFromEmbeddedWallResult",
    "listGroundAnchorBondCatalogEntries",
  ]);
  for (const name of runtimeExports) {
    if (independentExports.has(name)) {
      assert.notEqual(
        typescriptApplicationModuleValue[name],
        sourceApplicationModuleValue[name],
        `${name} independent implementations`,
      );
    } else {
      assert.equal(
        typescriptApplicationModuleValue[name],
        sourceApplicationModuleValue[name],
        `${name} exact value`,
      );
    }
    assert.equal(
      typescriptRootModuleValue[name],
      typescriptApplicationModuleValue[name],
      `${name} TypeScript root alias`,
    );
    assert.equal(
      sourceRootModuleValue[name],
      sourceApplicationModuleValue[name],
      `${name} source root alias`,
    );
  }

  const sourceApplication = new sourceRootModuleValue.GeotechnicalGroundAnchorApplication();
  const typescriptApplication = new typescriptRootModuleValue.GeotechnicalGroundAnchorApplication();
  assertExactParity(
    sourceApplication.getManifest(),
    typescriptApplication.getManifest(),
    "application manifest",
  );

  assertExactParity(
    applicationResult(sourceRootModuleValue, createAnalysisOptions()),
    applicationResult(typescriptRootModuleValue, createAnalysisOptions()),
    "valid application result",
  );
  assertExactParity(
    applicationResult(sourceRootModuleValue, { units: null }),
    applicationResult(typescriptRootModuleValue, { units: null }),
    "missing input result",
  );
});
