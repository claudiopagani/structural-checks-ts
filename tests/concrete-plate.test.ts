import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import test from "node:test";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

import {
  RC_PLATE_ANALYSIS_TYPES,
  ReinforcedConcretePlateApplication,
  ReinforcedConcretePlateModel,
  SectionFiberDiscretizer,
  createNTC2018ConcreteMaterial,
  createNTC2018ReinforcementSteelMaterial,
  createPlateStripSection,
  rotatePlateMoments,
  rotatePlateShear,
  woodArmer,
  type RcPlateAnalysisInput,
  type ReinforcedConcretePlateModelOptions,
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

type BaselineMaterialFactory = (options: Record<string, unknown>) => unknown;
type BaselinePlateModelConstructor = new (options: Record<string, unknown>) => unknown;
type BaselinePlateApplicationConstructor = new () => {
  run(input: Record<string, unknown>): unknown;
};

const createBaselineConcrete = baselineExport<BaselineMaterialFactory>(
  "createNTC2018ConcreteMaterial",
);
const createBaselineSteel = baselineExport<BaselineMaterialFactory>(
  "createNTC2018ReinforcementSteelMaterial",
);
const BaselinePlateModel = baselineExport<BaselinePlateModelConstructor>(
  "ReinforcedConcretePlateModel",
);
const BaselinePlateApplication = baselineExport<BaselinePlateApplicationConstructor>(
  "ReinforcedConcretePlateApplication",
);

function approx(actual: number, expected: number, tolerance = 1e-9): void {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `Expected ${actual} to be within ${tolerance} of ${expected}.`,
  );
}

function commonPlateInput(
  analysis: Partial<RcPlateAnalysisInput> = {},
): Omit<ReinforcedConcretePlateModelOptions, "materials"> {
  return {
    id: "plate-test",
    units,
    geometry: {
      thickness: 200,
      unitWidth: 1000,
    },
    reinforcement: {
      angle: 0,
      top: {
        x: { barsPerMeter: 5, diameter: 12, clearCover: 25 },
        y: { barsPerMeter: 5, diameter: 12, clearCover: 40 },
      },
      bottom: {
        x: { barsPerMeter: 6, diameter: 14, clearCover: 25 },
        y: { barsPerMeter: 6, diameter: 14, clearCover: 42 },
      },
    },
    analysis: {
      type: RC_PLATE_ANALYSIS_TYPES.ULS_BENDING_SHEAR,
      combinationType: "ULS_FUNDAMENTAL",
      actions: {
        mxx: 25_000,
        myy: 15_000,
        mxy: 5_000,
        qx: 60,
        qy: 40,
      },
      ...analysis,
    },
  };
}

function targetInput(
  analysis: Partial<RcPlateAnalysisInput> = {},
): ReinforcedConcretePlateModelOptions {
  return {
    ...commonPlateInput(analysis),
    materials: {
      concreteMaterial: createNTC2018ConcreteMaterial({
        strengthClass: "C25/30",
        units,
      }),
      reinforcementMaterial: createNTC2018ReinforcementSteelMaterial({
        grade: "B450C",
        units,
      }),
    },
  };
}

function baselineInput(analysis: Partial<RcPlateAnalysisInput> = {}): Record<string, unknown> {
  return {
    ...commonPlateInput(analysis),
    materials: {
      concreteMaterial: createBaselineConcrete({
        strengthClass: "C25/30",
        units,
      }),
      reinforcementMaterial: createBaselineSteel({
        grade: "B450C",
        units,
      }),
    },
  };
}

function jsonValue(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value)) as unknown;
}

function runTarget(analysis: Partial<RcPlateAnalysisInput> = {}): unknown {
  return jsonValue(
    new ReinforcedConcretePlateApplication().run({
      model: new ReinforcedConcretePlateModel(targetInput(analysis)),
    }),
  );
}

function runBaseline(analysis: Partial<RcPlateAnalysisInput> = {}): unknown {
  return jsonValue(
    new BaselinePlateApplication().run({
      model: new BaselinePlateModel(baselineInput(analysis)),
    }),
  );
}

void test("plate model preserves distributed reinforcement geometry and the 1000 mm strip", () => {
  const model = new ReinforcedConcretePlateModel(targetInput());
  const bottomX = model.reinforcement.bottom.x;
  const topY = model.reinforcement.top.y;

  approx(bottomX.area, (6 * Math.PI * 14 ** 2) / 4);
  approx(bottomX.spacing, 1000 / 6);
  approx(bottomX.axis, 32);
  approx(topY.axis, 154);
  assert.equal(model.geometry.unitWidth, 1000);

  const strip = createPlateStripSection({ model, direction: "x" });
  const bottomGroup = strip.groups.find((group) => group.face === "bottom");
  const bottomBars = strip.reinforcementBars.filter((bar) => bar.metadata.face === "bottom");
  assert.ok(bottomGroup);
  assert.equal(bottomBars.length, 1);
  approx(bottomBars[0]?.area ?? Number.NaN, bottomX.area);
  approx(bottomBars[0]?.y ?? Number.NaN, bottomX.axis);
  approx(bottomBars[0]?.z ?? Number.NaN, 500);
  approx(bottomGroup.longitudinalReinforcementArea, bottomX.area);

  const mesh = new SectionFiberDiscretizer().discretize(strip.section, {
    targetCount: 40,
    method: "uniaxial-strips",
  });
  assert.equal(mesh.method, "uniaxial-strips");
  assert.equal(mesh.generatedCount, 40);
  assert.ok(mesh.fibers.every((fiber) => fiber.width === 1000));
  approx(
    mesh.fibers.reduce((sum, fiber) => sum + fiber.area, 0),
    200_000,
  );
});

void test("plate model rejects membrane actions and invalid reinforcement geometry", () => {
  const membrane = targetInput();
  assert.ok(membrane.analysis?.actions);
  membrane.analysis.actions.nxx = 1;
  assert.throws(() => new ReinforcedConcretePlateModel(membrane), /membrane actions must be zero/);

  const invalid = targetInput();
  assert.ok(invalid.reinforcement?.bottom?.x);
  invalid.reinforcement.bottom.x.barsPerMeter = 0;
  assert.throws(() => new ReinforcedConcretePlateModel(invalid), /barsPerMeter must be positive/);
});

void test("plate tensor transformations and Wood-Armer envelope preserve source behavior", () => {
  const source = { mxx: 30, myy: 20, mxy: 10 };
  const principalAngle =
    (0.5 * Math.atan2(2 * source.mxy, source.mxx - source.myy) * 180) / Math.PI;
  const rotated = rotatePlateMoments({ ...source, angle: principalAngle });
  const recovered = rotatePlateMoments({ ...rotated, angle: -principalAngle });

  approx(rotated.mxy, 0, 1e-12);
  approx(rotated.invariants.trace, source.mxx + source.myy);
  approx(rotated.invariants.determinant, source.mxx * source.myy - source.mxy ** 2);
  approx(recovered.mxx, source.mxx);
  approx(recovered.myy, source.myy);
  approx(recovered.mxy, source.mxy);

  const shear = rotatePlateShear({ qx: 3, qy: 4, angle: 90 });
  approx(shear.qx, 4);
  approx(shear.qy, -3);
  approx(shear.resultant, 5);

  assert.deepEqual(
    woodArmer({ mxx: 0, myy: 0, mxy: 7 }).moments.map(({ value }) => value),
    [7, 7, -7, -7],
  );
});

void test("ULS plate bending and shear match the pinned JavaScript baseline", () => {
  assert.deepEqual(runTarget(), runBaseline());
});

void test("ULS plate S-link shear matches the pinned JavaScript baseline", () => {
  const analysis: Partial<RcPlateAnalysisInput> = {};
  const target = targetInput(analysis);
  const baseline = baselineInput(analysis);
  assert.ok(target.reinforcement);
  target.reinforcement.shear = {
    diameter: 8,
    spacingX: 150,
    spacingY: 200,
  };
  const baselineReinforcement = baseline.reinforcement as Record<string, unknown>;
  baselineReinforcement.shear = {
    diameter: 8,
    spacingX: 150,
    spacingY: 200,
  };

  const targetResult = jsonValue(
    new ReinforcedConcretePlateApplication().run({
      model: new ReinforcedConcretePlateModel(target),
    }),
  );
  const baselineResult = jsonValue(
    new BaselinePlateApplication().run({
      model: new BaselinePlateModel(baseline),
    }),
  );
  assert.deepEqual(targetResult, baselineResult);
});

void test("SLS plate stress and crack checks match the pinned JavaScript baseline", () => {
  const analysis = {
    type: RC_PLATE_ANALYSIS_TYPES.SLS_STRESS_CRACKING,
    combinationType: "SLE_FREQUENT",
    actions: {
      mxx: 15_000,
      myy: 10_000,
      mxy: 2_000,
      qx: 0,
      qy: 0,
    },
  } satisfies Partial<RcPlateAnalysisInput>;

  assert.deepEqual(runTarget(analysis), runBaseline(analysis));
});

void test("simplified flat-slab slenderness matches the pinned JavaScript baseline", () => {
  const analysis = {
    type: RC_PLATE_ANALYSIS_TYPES.SLS_SIMPLIFIED_DEFLECTION,
    combinationType: "SLE_QUASI_PERMANENT",
    actions: { mxx: 2_000, myy: -1_000, mxy: 5_000 },
    deflection: { spanX: 3200, spanY: 3000 },
  } satisfies Partial<RcPlateAnalysisInput>;

  assert.deepEqual(runTarget(analysis), runBaseline(analysis));
});
