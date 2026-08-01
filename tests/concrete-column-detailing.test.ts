import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import test from "node:test";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

import {
  RectangularSection,
  ReinforcedConcreteColumnDetailingVerification,
  ReinforcedConcreteColumnModel,
  ReinforcedConcreteSection,
  ReinforcementBar,
  createNTC2018ConcreteMaterial,
  createNTC2018ReinforcementSteelMaterial,
  type ReinforcedConcreteColumnModelOptions,
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
assert.equal(revisionOutput.trim(), expectedRevision);
assert.equal(statusOutput.trim(), "", "Compatibility test requires a clean source worktree.");

const JavaScriptApi = (await import(
  pathToFileURL(path.join(baselinePath, "src", "index.js")).href
)) as Record<string, unknown>;

function baselineExport<TExport>(name: string): TExport {
  const value = JavaScriptApi[name];
  assert.notEqual(value, undefined, `The baseline is missing ${name}.`);
  return value as TExport;
}

function createModelOptions(): ReinforcedConcreteColumnModelOptions {
  const concreteMaterial = createNTC2018ConcreteMaterial({
    strengthClass: "C25/30",
    units,
  });
  const reinforcementMaterial = createNTC2018ReinforcementSteelMaterial({
    grade: "B450C",
    units,
  });
  const concreteSection = new RectangularSection({
    width: 300,
    height: 500,
    units,
  });
  const coordinates: [number, number][] = [
    [50, 50],
    [50, 250],
    [450, 50],
    [450, 250],
  ];
  const section = new ReinforcedConcreteSection({
    id: "column-detailing-section",
    concreteSection,
    concreteMaterial,
    reinforcementMaterial,
    reinforcementBars: coordinates.map(
      ([y, z], index) =>
        new ReinforcementBar({
          id: `bar-${index + 1}`,
          diameter: 20,
          y,
          z,
          material: reinforcementMaterial,
          units,
        }),
    ),
    units,
  });

  return {
    id: "column-detailing",
    section,
    concreteMaterial,
    reinforcementMaterial,
    length: 3000,
    stability: {
      effectiveLengthMx: 3000,
      effectiveLengthMy: 3000,
      biaxialAngleCount: 32,
    },
    actions: {
      nEd: -800e3,
      mxEd: 40e6,
      myEd: 15e6,
    },
    detailing: {
      longitudinal: {
        area: 2400,
        minimumBarDiameter: 20,
        maximumBarDiameter: 20,
        maximumBarSpacing: 180,
      },
      transverse: { diameter: 8, spacing: 90 },
      seismic: {
        enabled: true,
        ductilityClass: "CDB",
        clearHeight: 3000,
        sectionDepthInBending: 500,
        curvatureDuctilityDemand: 2,
      },
      confinement: {
        coreWidth: 260,
        coreDepth: 460,
        volumePerSet: 150_000,
        restrainedBarSpacings: [100, 100, 100, 100],
      },
      anchorage: {
        barDiameter: 20,
        availableLength: 1200,
      },
    },
    mesh: { targetFiberCount: 120 },
    units,
  };
}

void test("column model preserves source unit normalization and detailing contracts", () => {
  const options = createModelOptions();
  const targetModel = new ReinforcedConcreteColumnModel(options);
  const JavaScriptModel = baselineExport<typeof ReinforcedConcreteColumnModel>(
    "ReinforcedConcreteColumnModel",
  );
  const sourceModel = new JavaScriptModel(options);

  assert.deepEqual(
    {
      id: targetModel.id,
      length: targetModel.length,
      stability: targetModel.stability,
      actions: targetModel.actions,
      shear: targetModel.shear,
      detailing: targetModel.detailing,
      mesh: targetModel.mesh,
      solver: targetModel.solver,
      units: targetModel.units,
      metadata: targetModel.metadata,
    },
    {
      id: sourceModel.id,
      length: sourceModel.length,
      stability: sourceModel.stability,
      actions: sourceModel.actions,
      shear: sourceModel.shear,
      detailing: sourceModel.detailing,
      mesh: sourceModel.mesh,
      solver: sourceModel.solver,
      units: sourceModel.units,
      metadata: sourceModel.metadata,
    },
  );
});

void test("column detailing matches the baseline and independent confinement arithmetic", () => {
  const options = createModelOptions();
  const targetModel = new ReinforcedConcreteColumnModel(options);
  const JavaScriptModel = baselineExport<typeof ReinforcedConcreteColumnModel>(
    "ReinforcedConcreteColumnModel",
  );
  const sourceModel = new JavaScriptModel(options);
  const compression = 800_000;
  const concreteArea = 300 * 500;
  const normalizedAxialForce = compression / (concreteArea * targetModel.concreteMaterial!.fcd!);
  const targetResult = new ReinforcedConcreteColumnDetailingVerification().verify({
    model: targetModel,
    compression,
    normalizedAxialForce,
  });
  const JavaScriptVerification = baselineExport<
    typeof ReinforcedConcreteColumnDetailingVerification
  >("ReinforcedConcreteColumnDetailingVerification");
  const sourceResult = new JavaScriptVerification().verify({
    model: sourceModel,
    compression,
    normalizedAxialForce,
  });

  assert.deepEqual(targetResult.toJSON(), sourceResult.toJSON());

  const minimumArea = Math.max(
    (0.1 * compression) / targetModel.reinforcementMaterial!.fyd!,
    0.003 * concreteArea,
  );
  const minimumAreaCheck = targetResult.checks.find(
    (check) => check.id === "rc-column-minimum-longitudinal-area",
  );
  assert.ok(minimumAreaCheck);
  assert.ok(Math.abs((minimumAreaCheck.demand as number) - minimumArea) < 1e-6);

  const outputs = targetResult.outputs.seismic as {
    alphaN: number;
    alphaS: number;
    alpha: number;
    volumetricRatio: number;
    omegaWd: number;
  };
  const alphaN = 1 - (4 * 100 ** 2) / (6 * 260 * 460);
  const alphaS = (1 - 90 / (2 * 260)) * (1 - 90 / (2 * 460));
  const volumetricRatio = 150_000 / (260 * 460 * 90);
  const omegaWd =
    (volumetricRatio * targetModel.reinforcementMaterial!.fyd!) /
    targetModel.concreteMaterial!.fcd!;

  assert.ok(Math.abs(outputs.alphaN - alphaN) < 1e-12);
  assert.ok(Math.abs(outputs.alphaS - alphaS) < 1e-12);
  assert.ok(Math.abs(outputs.alpha - alphaN * alphaS) < 1e-12);
  assert.ok(Math.abs(outputs.volumetricRatio - volumetricRatio) < 1e-12);
  assert.ok(Math.abs(outputs.omegaWd - omegaWd) < 1e-12);
});

void test("column detailing preserves the explicit not-analyzed result", () => {
  const options = createModelOptions();
  const noDetailingOptions = { ...options, detailing: null };
  const targetModel = new ReinforcedConcreteColumnModel(noDetailingOptions);
  const JavaScriptModel = baselineExport<typeof ReinforcedConcreteColumnModel>(
    "ReinforcedConcreteColumnModel",
  );
  const sourceModel = new JavaScriptModel(noDetailingOptions);
  const targetResult = new ReinforcedConcreteColumnDetailingVerification().verify({
    model: targetModel,
  });
  const JavaScriptVerification = baselineExport<
    typeof ReinforcedConcreteColumnDetailingVerification
  >("ReinforcedConcreteColumnDetailingVerification");
  const sourceResult = new JavaScriptVerification().verify({ model: sourceModel });

  assert.deepEqual(targetResult.toJSON(), sourceResult.toJSON());
  assert.equal(targetResult.status, "not-analyzed");
});
