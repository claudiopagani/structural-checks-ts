import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const sourceRoot = path.resolve(repositoryRoot, "..", "strutture-js");
const sourceRevision = "6f33baead8b88166c4b2cf94af41763412e3c751";

interface RuntimeResult {
  status: string;
  summary: string;
  outputs: Record<string, unknown>;
  warnings: string[];
  assumptions: string[];
  metadata: Record<string, unknown>;
}

interface RuntimeAnalysis {
  analyze(options: Record<string, unknown>): RuntimeResult;
}

interface RuntimeDemandModule {
  GroundAnchorAnalysis: new () => RuntimeAnalysis;
  groundAnchorDemandFromEmbeddedWallResult(
    options: Record<string, unknown>,
  ): Record<string, unknown>;
}

function isRuntimeModule(value: unknown): value is RuntimeDemandModule {
  return (
    value !== null &&
    typeof value === "object" &&
    typeof Reflect.get(value, "GroundAnchorAnalysis") === "function" &&
    typeof Reflect.get(value, "groundAnchorDemandFromEmbeddedWallResult") === "function"
  );
}

function gitOutput(...arguments_: readonly string[]): string {
  return execFileSync("git", ["-C", sourceRoot, ...arguments_], { encoding: "utf8" }).trim();
}

function errorSnapshot(callback: () => unknown): { name: string; message: string } {
  try {
    callback();
  } catch (error) {
    if (error instanceof Error) return { name: error.name, message: error.message };
    throw error;
  }
  throw new Error("Expected the callback to throw.");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const units = { force: "kN", length: "m" };

function createAnalysisOptions(): Record<string, unknown> {
  const source = "independent ground-anchor analysis parity α";
  return {
    groundModel: {
      id: "anchor-ground-β",
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
              strength: { model: "mohr-coulomb-effective", frictionAngle: 30, cohesion: 0 },
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
              strength: { model: "mohr-coulomb-effective", frictionAngle: 38, cohesion: 50 },
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
      id: "anchor-sls-γ",
      limitState: "SLS",
      drainageCondition: "drained",
      sectionId: "anchor-section",
      units,
    },
    anchor: {
      id: "anchor-δ",
      name: "Tirante ε",
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
      metadata: { label: "tirante ζ" },
    },
    scenario: {
      id: "anchor-design-η",
      demand: { source: "assigned-tendon-load", designLoad: 300, provenance: { source } },
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
            id: "performance-θ",
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
      metadata: { label: "scenario ι" },
    },
    units,
  };
}

function embeddedWallDemandOptions(): Record<string, unknown> {
  return {
    embeddedRetainingWallResult: {
      schemaVersion: "embedded-retaining-wall-result/v1",
      wall: {
        schemaVersion: "embedded-retaining-wall-model/v1",
        id: "wall-κ",
        topElevation: 0,
        toeElevation: -5,
        analysisWidth: 1,
        flexuralRigiditySegments: [
          {
            topElevation: 0,
            bottomElevation: -5,
            flexuralRigidity: 10000,
            provenance: { source: "wall-source" },
          },
        ],
        headCondition: { translation: "free", rotation: "free" },
        toeCondition: { translation: "free", rotation: "free" },
        units,
      },
      stages: [
        {
          id: "stage-λ",
          response: {
            supports: [
              { supportId: "anchor-row", status: "active", scalarForce: -100 },
              { supportId: "anchor-row", status: "inactive", scalarForce: -900 },
            ],
          },
        },
      ],
    },
    supportId: "anchor-row",
    horizontalSpacing: 2,
    inclination: 30,
    angleUnits: "deg",
  };
}

void test("GroundAnchorAnalysis matches the independent pinned JavaScript implementation", async () => {
  assert.equal(gitOutput("rev-parse", "HEAD"), sourceRevision);
  assert.equal(gitOutput("status", "--porcelain"), "");
  const sourceModuleValue: unknown = await import(
    pathToFileURL(path.join(sourceRoot, "src", "index.js")).href
  );
  const typescriptModuleValue: unknown = await import(
    pathToFileURL(path.join(repositoryRoot, "dist", "index.js")).href
  );
  if (!isRuntimeModule(sourceModuleValue) || !isRuntimeModule(typescriptModuleValue)) {
    throw new Error("GroundAnchorAnalysis exports do not expose the expected API.");
  }
  assert.notEqual(
    sourceModuleValue.GroundAnchorAnalysis,
    typescriptModuleValue.GroundAnchorAnalysis,
  );

  const sourceResult = new sourceModuleValue.GroundAnchorAnalysis().analyze(
    createAnalysisOptions(),
  );
  const typescriptResult = new typescriptModuleValue.GroundAnchorAnalysis().analyze(
    createAnalysisOptions(),
  );
  assert.deepEqual(typescriptResult, sourceResult);
  assert.equal(JSON.stringify(typescriptResult), JSON.stringify(sourceResult));
  assert.deepEqual([...JSON.stringify(typescriptResult)], [...JSON.stringify(sourceResult)]);
  const anchorOutput = typescriptResult.outputs.anchor;
  assert.ok(isRecord(anchorOutput));
  assert.equal(anchorOutput.id, "anchor-δ");

  const sourceDemand = sourceModuleValue.groundAnchorDemandFromEmbeddedWallResult(
    embeddedWallDemandOptions(),
  );
  const typescriptDemand = typescriptModuleValue.groundAnchorDemandFromEmbeddedWallResult(
    embeddedWallDemandOptions(),
  );
  assert.deepEqual(typescriptDemand, sourceDemand);
  assert.equal(JSON.stringify(typescriptDemand), JSON.stringify(sourceDemand));

  const invalidAnalysis = { ...createAnalysisOptions(), units: null };
  const sourceFailure = new sourceModuleValue.GroundAnchorAnalysis().analyze(invalidAnalysis);
  const typescriptFailure = new typescriptModuleValue.GroundAnchorAnalysis().analyze({
    ...createAnalysisOptions(),
    units: null,
  });
  assert.deepEqual(typescriptFailure, sourceFailure);

  const sourceDemandError = errorSnapshot(() =>
    sourceModuleValue.groundAnchorDemandFromEmbeddedWallResult({
      ...embeddedWallDemandOptions(),
      supportId: "missing-support",
    }),
  );
  const typescriptDemandError = errorSnapshot(() =>
    typescriptModuleValue.groundAnchorDemandFromEmbeddedWallResult({
      ...embeddedWallDemandOptions(),
      supportId: "missing-support",
    }),
  );
  assert.deepEqual(typescriptDemandError, sourceDemandError);
});
