import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import test from "node:test";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

import {
  RectangularSection,
  ReinforcedConcreteColumnApplication,
  ReinforcedConcreteColumnModel,
  ReinforcedConcreteColumnVerification,
  ReinforcedConcreteSection,
  ReinforcementBar,
  createNTC2018ConcreteMaterial,
  createNTC2018ReinforcementSteelMaterial,
  type RcColumnActionsInput,
  type RcColumnDetailingInput,
  type RcColumnShearInput,
  type RcColumnStabilityInput,
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

function createModelOptions({
  effectiveLength = 3000,
  actions = {},
  stability = {},
  shear = null,
  detailing = null,
}: {
  effectiveLength?: number;
  actions?: RcColumnActionsInput;
  stability?: RcColumnStabilityInput;
  shear?: RcColumnShearInput | null;
  detailing?: RcColumnDetailingInput | null;
} = {}): ReinforcedConcreteColumnModelOptions {
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
    id: "column-member-section",
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
    id: "column-member",
    section,
    concreteMaterial,
    reinforcementMaterial,
    length: 3000,
    stability: {
      effectiveLengthMx: effectiveLength,
      effectiveLengthMy: effectiveLength,
      biaxialAngleCount: 32,
      ...stability,
    },
    actions: {
      nEd: -800e3,
      mxEd: 40e6,
      myEd: 15e6,
      ...actions,
    },
    shear,
    detailing,
    mesh: { targetFiberCount: 120 },
    units,
  };
}

function verifyWithBoth(options: ReinforcedConcreteColumnModelOptions) {
  const targetModel = new ReinforcedConcreteColumnModel(options);
  const JavaScriptModel = baselineExport<typeof ReinforcedConcreteColumnModel>(
    "ReinforcedConcreteColumnModel",
  );
  const sourceModel = new JavaScriptModel(options);
  const targetResult = new ReinforcedConcreteColumnVerification().verify(targetModel);
  const JavaScriptVerification = baselineExport<typeof ReinforcedConcreteColumnVerification>(
    "ReinforcedConcreteColumnVerification",
  );
  const sourceResult = new JavaScriptVerification().verify(sourceModel);
  return { targetResult, sourceResult };
}

void test("stocky column member verification matches the biaxial-domain baseline", () => {
  const { targetResult, sourceResult } = verifyWithBoth(createModelOptions());

  assert.deepEqual(targetResult.toJSON(), sourceResult.toJSON());
  assert.equal(targetResult.status, "ok");
  assert.ok((targetResult.outputs.lambdaLimit as number) > 0);
  assert.equal(
    (
      targetResult.outputs.axes as {
        mx: { secondOrderRequired: boolean };
      }
    ).mx.secondOrderRequired,
    false,
  );
  assert.ok(targetResult.checks.some((check) => check.id === "rc-column-biaxial-resistance"));
});

void test("slender column refusal and nominal-stiffness generation match the baseline", () => {
  const unresolved = verifyWithBoth(createModelOptions({ effectiveLength: 6000 }));
  assert.deepEqual(unresolved.targetResult.toJSON(), unresolved.sourceResult.toJSON());
  assert.equal(unresolved.targetResult.status, "not-supported");
  assert.deepEqual(unresolved.targetResult.metadata.unresolvedAxes, ["mx", "my"]);

  const generated = verifyWithBoth(
    createModelOptions({
      effectiveLength: 6000,
      stability: { creepCoefficient: 2 },
    }),
  );
  assert.deepEqual(generated.targetResult.toJSON(), generated.sourceResult.toJSON());
  assert.notEqual(generated.targetResult.status, "not-supported");
  const outputs = generated.targetResult.outputs as {
    compression: number;
    secondOrder: {
      concreteDesignModulus: number;
      rigidityFactor: number;
    };
    axes: {
      mx: {
        inertia: number;
        effectiveLength: number;
        criticalLoad: number;
        magnificationFactor: number;
        firstOrderWithImperfection: number;
        generatedTotalMoment: number;
      };
    };
  };
  const expectedRigidityFactor = 0.3 / (1 + 0.5 * 2);
  const expectedRigidity =
    expectedRigidityFactor * outputs.secondOrder.concreteDesignModulus * outputs.axes.mx.inertia;
  const expectedCriticalLoad =
    (Math.PI ** 2 * expectedRigidity) / outputs.axes.mx.effectiveLength ** 2;
  const expectedMagnification = 1 + 1 / (expectedCriticalLoad / outputs.compression - 1);
  const expectedMoment = outputs.axes.mx.firstOrderWithImperfection * expectedMagnification;

  assert.ok(Math.abs(outputs.secondOrder.rigidityFactor - expectedRigidityFactor) < 1e-6);
  assert.ok(Math.abs(outputs.axes.mx.criticalLoad - expectedCriticalLoad) < 1);
  assert.ok(Math.abs(outputs.axes.mx.magnificationFactor - expectedMagnification) < 1e-6);
  assert.ok(Math.abs(outputs.axes.mx.generatedTotalMoment - expectedMoment) < 1);
});

void test("column member combines capacity shear and seismic detailing with parity", () => {
  const options = createModelOptions({
    actions: { vxEd: 80e3, vyEd: 60e3 },
    shear: {
      x: {
        mode: "with-transverse-reinforcement",
        method: "ntc2018",
        bw: 300,
        effectiveDepth: 450,
        longitudinalReinforcementArea: 1256,
        transverseReinforcement: {
          diameter: 8,
          legs: 2,
          spacing: 100,
        },
      },
      y: {
        mode: "with-transverse-reinforcement",
        method: "ntc2018",
        bw: 500,
        effectiveDepth: 250,
        longitudinalReinforcementArea: 1256,
        transverseReinforcement: {
          diameter: 8,
          legs: 2,
          spacing: 100,
        },
      },
      capacityDesign: {
        clearLength: 3000,
        endMomentsX: [100e6, 100e6],
        endMomentsY: [100e6, 100e6],
        endMomentsPreAdjustedForHierarchy: true,
      },
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
    },
  });
  const { targetResult, sourceResult } = verifyWithBoth(options);

  assert.deepEqual(targetResult.toJSON(), sourceResult.toJSON());
  const xShearCheck = targetResult.checks.find(
    (check) =>
      (check.metadata as { axis?: string } | undefined)?.axis === "x" &&
      (check.metadata as { analysisShear?: number } | undefined)?.analysisShear != null,
  );
  assert.ok(xShearCheck);
  assert.equal((xShearCheck.metadata as { analysisShear: number }).analysisShear, 80e3);
  assert.equal((xShearCheck.metadata as { gammaRd: number }).gammaRd, 1.1);
  assert.ok(
    Math.abs(
      (xShearCheck.metadata as { capacityDesignShear: number }).capacityDesignShear -
        73_333.3333333333,
    ) < 1e-6,
  );
  assert.ok(targetResult.checks.some((check) => check.id === "rc-column-seismic-omega-wd"));
});

void test("column application normalizes a serializable model DTO with parity", () => {
  const options = createModelOptions();
  const dto = {
    ...options,
    id: "column-json",
    length: 3,
    stability: {
      effectiveLengthMx: 3,
      effectiveLengthMy: 3,
      biaxialAngleCount: 32,
    },
    actions: { nEd: -800, mxEd: 40, myEd: 15 },
    units: { force: "kN", length: "m" } as const,
  };
  const targetResult = new ReinforcedConcreteColumnApplication().run({
    model: dto,
    metadata: { source: "serialized-contract" },
  });
  const JavaScriptApplication = baselineExport<typeof ReinforcedConcreteColumnApplication>(
    "ReinforcedConcreteColumnApplication",
  );
  const sourceResult = new JavaScriptApplication().run({
    model: dto,
    metadata: { source: "serialized-contract" },
  });

  assert.deepEqual(targetResult.toJSON(), sourceResult.toJSON());
  assert.equal((targetResult.outputs.designActions as { nEd: number }).nEd, -800e3);
  assert.equal(targetResult.metadata.source, "serialized-contract");
});
