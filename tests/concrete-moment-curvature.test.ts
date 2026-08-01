import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import test from "node:test";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

import {
  RCMomentCurvatureAnalyzer,
  ReinforcedConcreteSection,
  ReinforcedConcreteSectionApplication,
  ReinforcedConcreteSectionModel,
  ReinforcementBar,
  RectangularSection,
  SectionFiberDiscretizer,
  createNTC2018ConcreteMaterial,
  createNTC2018ReinforcementSteelMaterial,
  type ConstitutiveLaw,
} from "../dist/index.js";

const execFileAsync = promisify(execFile);
const expectedRevision = "6f33baead8b88166c4b2cf94af41763412e3c751";
const baselinePath = process.env.STRUTTURE_JS_BASELINE_PATH
  ? path.resolve(process.env.STRUTTURE_JS_BASELINE_PATH)
  : path.resolve(import.meta.dirname, "..", "..", "strutture-js");
const units = { force: "N", length: "mm" } as const;

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
assert.equal(
  revisionOutput.trim(),
  expectedRevision,
  "Compatibility test loaded the wrong source revision.",
);
assert.equal(statusOutput.trim(), "", "Compatibility test requires a clean source worktree.");

const JavaScriptApi = (await import(
  pathToFileURL(path.join(baselinePath, "src", "index.js")).href
)) as Record<string, unknown>;

function baselineExport<TExport>(name: string): TExport {
  const value = JavaScriptApi[name];
  assert.notEqual(value, undefined, `The baseline is missing ${name}.`);
  return value as TExport;
}

function createMomentCurvatureModel(): ReinforcedConcreteSectionModel {
  const concreteMaterial = createNTC2018ConcreteMaterial({
    strengthClass: "C25/30",
    units,
  });
  const reinforcementMaterial = createNTC2018ReinforcementSteelMaterial({
    grade: "B450C",
    units,
  });
  const section = new ReinforcedConcreteSection({
    name: "RC moment-curvature compatibility fixture",
    concreteSection: new RectangularSection({
      width: 300,
      height: 500,
      units,
    }),
    reinforcementBars: [
      { id: "bottom-left", diameter: 20, y: 40, z: 60 },
      { id: "bottom-right", diameter: 20, y: 40, z: 240 },
      { id: "top-left", diameter: 16, y: 460, z: 60 },
      { id: "top-right", diameter: 16, y: 460, z: 240 },
    ].map(
      (bar) =>
        new ReinforcementBar({
          ...bar,
          grade: "B450C",
          material: reinforcementMaterial,
          units,
        }),
    ),
    concreteMaterial,
    reinforcementMaterial,
    referenceModularRatio: 15,
    units,
  });

  return new ReinforcedConcreteSectionModel({
    id: "rc-moment-curvature-parity",
    section,
    materials: {
      concreteMaterial,
      reinforcementMaterial,
    },
    analysisType: "moment-curvature",
    mesh: {
      targetFiberCount: 120,
    },
    solver: {
      tolerance: 1e-6,
      maxIterations: 100,
    },
    actions: {
      nEd: 0,
    },
    analysisSettings: {
      compressedEdge: "top",
      pointCount: 12,
      curvatureMax: 0.0003,
    },
    units,
  });
}

void test("moment-curvature solves the independent elastic fiber-section stiffness", () => {
  const elasticModulus = 30_000;
  const curvature = 1e-6;
  const concreteSection = new RectangularSection({
    width: 300,
    height: 500,
    units,
  });
  const section = new ReinforcedConcreteSection({
    concreteSection,
    reinforcementBars: [],
    units,
  });
  const mesh = new SectionFiberDiscretizer().discretize(section, {
    targetCount: 120,
  });
  const elasticLaw: ConstitutiveLaw = {
    stress: (strain) => elasticModulus * strain,
    strainLimits: () => ({
      tension: null,
      compression: null,
    }),
  };
  const point = new RCMomentCurvatureAnalyzer({
    eps0Samples: 161,
  }).solveAtCurvature({
    section,
    concreteFibers: mesh.fibers,
    concreteLaw: elasticLaw,
    steelLaw: elasticLaw,
    curvature,
    nEd: 0,
    compressedSide: "positive",
    referencePoint: {
      y: 250,
      z: 150,
    },
    includeConcreteTension: true,
    postUltimateResponse: "retain",
  });
  const discreteSecondMoment = mesh.fibers.reduce(
    (sum, fiber) => sum + fiber.area * (fiber.y - 250) ** 2,
    0,
  );
  const expectedMoment = elasticModulus * discreteSecondMoment * curvature;

  assert.equal(point.converged, true);
  assert.ok(Math.abs(point.eps0 - curvature * 250) < 1e-14);
  assert.ok(Math.abs(point.N) < 1e-6);
  assert.ok(Math.abs(point.My) < 1e-6);
  assert.ok(Math.abs(point.Mx - expectedMoment) / expectedMoment < 1e-13);
});

void test("moment-curvature application matches the pinned JavaScript baseline", () => {
  const model = createMomentCurvatureModel();
  const targetResult = new ReinforcedConcreteSectionApplication().run({
    model,
  });
  const JavaScriptApplication = baselineExport<typeof ReinforcedConcreteSectionApplication>(
    "ReinforcedConcreteSectionApplication",
  );
  const sourceResult = new JavaScriptApplication().run({
    model,
  });

  assert.deepEqual(targetResult.toJSON(), sourceResult.toJSON());

  const outputs = targetResult.outputs as {
    analysisType: string;
    points: {
      curvature: number;
      Mx: number;
    }[];
    failureReached: boolean;
    firstYieldReached: boolean;
    firstYieldType: string;
    firstYieldPoint: {
      firstYieldState: {
        eventMaterial: string;
        eventMode: string;
      };
    };
    failurePoint: {
      limitState: {
        governing: {
          utilizationRatio: number;
        };
      };
    };
    ntc2018Ductility: {
      curvatureDuctilityRatio: number;
    };
  };
  const normativeReferences = targetResult.metadata.normativeReferences as {
    assetIds: string[];
  }[];

  assert.equal(targetResult.status, "ok");
  assert.equal(outputs.analysisType, "moment-curvature");
  assert.ok(outputs.points.length >= 3);
  assert.equal(outputs.points[0]?.curvature, 0);
  assert.equal(outputs.points[0]?.Mx, 0);
  assert.equal(outputs.failureReached, true);
  assert.equal(outputs.firstYieldReached, true);
  assert.equal(outputs.firstYieldType, "steel-tension-yield");
  assert.equal(outputs.firstYieldPoint.firstYieldState.eventMaterial, "steel");
  assert.equal(outputs.firstYieldPoint.firstYieldState.eventMode, "yield-tension");
  assert.ok(outputs.failurePoint.limitState.governing.utilizationRatio >= 0.99);
  assert.ok(outputs.ntc2018Ductility.curvatureDuctilityRatio > 0);
  assert.ok(
    normativeReferences.some((reference) =>
      reference.assetIds.includes(
        "urn:structural-codes:it:asset:formula:ntc2018:4.1.2.3.4.2:phi-yd",
      ),
    ),
  );
});
