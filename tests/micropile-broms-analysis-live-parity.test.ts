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

type RuntimeRecord = Record<string, unknown>;
type AnalysisLike = {
  analyze: (input?: unknown) => unknown;
  metadata: unknown;
};
type AnalysisConstructor = new (options?: unknown) => AnalysisLike;

function isRecord(value: unknown): value is RuntimeRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isAnalysisConstructor(value: unknown): value is AnalysisConstructor {
  return typeof value === "function";
}

function gitOutput(repository: string, ...arguments_: readonly string[]): string {
  return execFileSync("git", ["-C", repository, ...arguments_], { encoding: "utf8" }).trim();
}

async function loadModule(root: string, relativePath: string): Promise<RuntimeRecord> {
  const module: unknown = await import(pathToFileURL(path.join(root, relativePath)).href);
  if (!isRecord(module)) {
    throw new Error(`The module ${relativePath} is not an object module.`);
  }
  return module;
}

function captureError(action: () => unknown): unknown {
  try {
    return action();
  } catch (error) {
    if (!(error instanceof Error)) {
      return { value: error };
    }
    return { name: error.name, message: error.message };
  }
}

function resultJson(value: unknown): unknown {
  if (value == null) {
    return value;
  }
  const toJSON: unknown = Reflect.get(Object(value), "toJSON");
  return typeof toJSON === "function" ? Reflect.apply(toJSON, value, []) : value;
}

function generalInput(): RuntimeRecord {
  const units = { force: "kN", length: "m" };
  const soil = {
    id: "compatibility-sand-δ",
    name: "Sabbia di compatibilità",
    unitWeight: { bulk: 18, saturated: 20 },
    parameterSets: [
      {
        id: "compatibility-sand-δ-characteristic",
        basis: "characteristic",
        drainage: "drained",
        strength: {
          model: "mohr-coulomb-effective",
          frictionAngle: 30,
          cohesion: 0,
        },
        provenance: { source: "analysis-parity-test" },
      },
    ],
    angleUnits: "deg",
    units,
  };
  const profile = {
    id: "lateral-profile",
    groundSurfaceElevation: 0,
    materials: [soil],
    layers: [
      {
        id: "lateral-layer",
        topElevation: 0,
        bottomElevation: -20,
        materialId: soil.id,
      },
    ],
    groundwater: { model: "none" },
    units,
  };
  const groundModel = {
    id: "lateral-ground",
    materials: [soil],
    profiles: [profile],
    units,
  };
  return {
    groundModel,
    designSituation: {
      id: "lateral-uls",
      groundModel,
      limitState: "ULS",
      drainageCondition: "drained",
      requiredParameterBasis: "characteristic",
      profileId: profile.id,
      units,
    },
    pile: {
      id: "lateral-pile",
      geometry: { model: "circular", diameter: 1 },
      placement: {
        headElevation: 0,
        soilContactTopElevation: 0,
        toeElevation: -5,
      },
      construction: {
        installationMethod: "assigned-test-method",
        structuralMaterial: "assigned-test-material",
        displacementClass: "not-classified",
      },
      units,
    },
    scenario: {
      id: "cohesionless-drained-scenario",
      soilBranch: "cohesionless-drained",
      action: {
        lateralShear: 100,
        overturningMoment: 50,
        basis: "design",
        referencePoint: "groundline-at-pile-axis",
      },
      behaviorAssertion: {
        classification: "short-rigid",
        basis: "project-rigidity-assessment",
        provenance: { source: "analysis-parity-test" },
      },
      units,
    },
    units,
  };
}

void test("Micropile Broms analysis matches the independent pinned JavaScript implementation", async () => {
  assert.equal(gitOutput(sourceRoot, "rev-parse", "HEAD"), sourceRevision);
  assert.equal(gitOutput(sourceRoot, "status", "--porcelain"), "");
  assert.equal(gitOutput(normativeRoot, "rev-parse", "HEAD"), normativeRevision);
  assert.equal(gitOutput(normativeRoot, "status", "--porcelain"), "");

  const sourceModule = await loadModule(
    sourceRoot,
    "src/applications/micropiles-broms/analysis/MicropileBromsAnalysis.js",
  );
  const typescriptModule = await loadModule(
    path.join(repositoryRoot, "dist"),
    "applications/micropiles-broms/analysis/MicropileBromsAnalysis.js",
  );
  const sourceConstructor = sourceModule.MicropileBromsAnalysis;
  const typescriptConstructor = typescriptModule.MicropileBromsAnalysis;
  if (!isAnalysisConstructor(sourceConstructor) || !isAnalysisConstructor(typescriptConstructor)) {
    throw new Error("Expected both modules to export MicropileBromsAnalysis.");
  }

  assert.notEqual(typescriptConstructor, sourceConstructor, "independent implementations");

  const sourceRootModule = await loadModule(sourceRoot, "src/index.js");
  const typescriptRootModule = await loadModule(path.join(repositoryRoot, "dist"), "index.js");
  assert.equal(sourceRootModule.MicropileBromsAnalysis, sourceConstructor, "source root alias");
  assert.equal(
    typescriptRootModule.MicropileBromsAnalysis,
    typescriptConstructor,
    "TypeScript root alias",
  );

  const sourceAnalysis = new sourceConstructor({ metadata: { source: "analysis-δ" } });
  const typescriptAnalysis = new typescriptConstructor({ metadata: { source: "analysis-δ" } });
  assert.deepEqual(
    resultJson(typescriptAnalysis.analyze({ model: { id: "legacy-δ" } })),
    resultJson(sourceAnalysis.analyze({ model: { id: "legacy-δ" } })),
    "legacy JSON parity",
  );
  assert.deepEqual(
    resultJson(typescriptAnalysis.analyze(generalInput())),
    resultJson(sourceAnalysis.analyze(generalInput())),
    "delegated general JSON parity",
  );
  assert.deepEqual(
    resultJson(typescriptAnalysis.analyze()),
    resultJson(sourceAnalysis.analyze()),
    "default input parity",
  );
  assert.deepEqual(
    captureError(() => Reflect.apply(typescriptAnalysis.analyze, typescriptAnalysis, [null])),
    captureError(() => Reflect.apply(sourceAnalysis.analyze, sourceAnalysis, [null])),
    "null input error parity",
  );
});
