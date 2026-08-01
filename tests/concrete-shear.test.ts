import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import test from "node:test";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

import {
  CircularSection,
  RectangularSection,
  ReinforcedConcreteSection,
  ReinforcedConcreteShearVerification,
  ReinforcementBar,
  createNTC2018ConcreteMaterial,
  createNTC2018ReinforcementSteelMaterial,
  type RcShearVerificationInput,
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

function withoutNormativeReferences(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(withoutNormativeReferences);
  }

  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => key !== "normativeReferences")
        .map(([key, entry]) => [key, withoutNormativeReferences(entry)]),
    );
  }

  return value;
}

function createRectangularFixture() {
  const concreteMaterial = createNTC2018ConcreteMaterial({
    strengthClass: "C25/30",
    units,
  });
  const reinforcementMaterial = createNTC2018ReinforcementSteelMaterial({
    grade: "B450C",
    units,
  });
  const section = new ReinforcedConcreteSection({
    id: "rc-shear-section",
    name: "RC shear section",
    concreteSection: new RectangularSection({
      width: 300,
      height: 500,
      units,
    }),
    concreteMaterial,
    reinforcementMaterial,
    reinforcementBars: [
      { id: "bottom-1", diameter: 20, y: 50, z: 90 },
      { id: "bottom-2", diameter: 20, y: 50, z: 210 },
      { id: "top-1", diameter: 12, y: 450, z: 90 },
      { id: "top-2", diameter: 12, y: 450, z: 210 },
    ].map(
      (bar) =>
        new ReinforcementBar({
          ...bar,
          material: reinforcementMaterial,
          units,
        }),
    ),
    units,
  });

  return {
    section,
    concreteMaterial,
    reinforcementMaterial,
  };
}

void test("NTC shear without transverse reinforcement matches the baseline and formula", () => {
  const fixture = createRectangularFixture();
  const input = {
    ...fixture,
    actions: {
      vEd: 60_000,
      nEd: -100_000,
      mEd: 120_000_000,
    },
    shear: {
      mode: "without-transverse-reinforcement",
      longitudinalReinforcementGroup: {
        id: "bottom-main",
        face: "bottom",
        barIds: ["bottom-1", "bottom-2"],
      },
    },
    units,
  } satisfies RcShearVerificationInput;
  const targetResult = new ReinforcedConcreteShearVerification().verify(input);
  const JavaScriptVerification = baselineExport<typeof ReinforcedConcreteShearVerification>(
    "ReinforcedConcreteShearVerification",
  );
  const sourceResult = new JavaScriptVerification().verify(input);

  assert.deepEqual(targetResult.toJSON(), sourceResult.toJSON());

  const outputs = targetResult.outputs as {
    parameters: {
      bw: number;
      effectiveDepth: number;
      longitudinalArea: number;
      rhoLEffective: number;
      sigmaCp: number;
      fck: number;
      gammaC: number;
      sources: Record<string, string>;
    };
    k: number;
    vMin: number;
    vRdcStress: number;
    resistanceStress: number;
    vRd: number;
  };
  const params = outputs.parameters;
  const expectedK = Math.min(1 + Math.sqrt(200 / params.effectiveDepth), 2);
  const expectedVMin = 0.035 * expectedK ** 1.5 * Math.sqrt(params.fck);
  const expectedVRdcStress =
    (0.18 / params.gammaC) * expectedK * (100 * params.rhoLEffective * params.fck) ** (1 / 3) +
    0.15 * params.sigmaCp;
  const expectedResistanceStress = Math.max(
    expectedVRdcStress,
    expectedVMin + 0.15 * params.sigmaCp,
  );
  const expectedCapacity = expectedResistanceStress * params.bw * params.effectiveDepth;

  assert.equal(targetResult.status, "ok");
  assert.equal(params.bw, 300);
  assert.equal(params.effectiveDepth, 450);
  assert.ok(Math.abs(params.longitudinalArea - (2 * Math.PI * 20 ** 2) / 4) < 1e-12);
  assert.ok(Math.abs(outputs.k - expectedK) < 1e-6);
  assert.ok(Math.abs(outputs.vMin - expectedVMin) < 1e-6);
  assert.ok(Math.abs(outputs.vRdcStress - expectedVRdcStress) < 1e-6);
  assert.ok(Math.abs(outputs.resistanceStress - expectedResistanceStress) < 1e-6);
  assert.ok(Math.abs(outputs.vRd - expectedCapacity) < 1e-6);
  assert.equal(params.sources.d, "derived-from-reinforcement-group");
  assert.equal(targetResult.metadata.method, "ntc2018-4.1.2.3.5.1");
});

void test("NTC shear with vertical stirrups matches the pinned baseline", () => {
  const fixture = createRectangularFixture();
  const input = {
    ...fixture,
    actions: {
      vEd: 150_000,
      nEd: 0,
    },
    shear: {
      mode: "with-transverse-reinforcement",
      effectiveDepth: 450,
      transverseReinforcement: {
        type: "stirrups",
        diameter: 8,
        legs: 2,
        spacing: 150,
        material: fixture.reinforcementMaterial,
      },
      cotThetaMin: 1,
      cotThetaMax: 2.5,
    },
    units,
  } satisfies RcShearVerificationInput;
  const targetResult = new ReinforcedConcreteShearVerification().verify(input);
  const JavaScriptVerification = baselineExport<typeof ReinforcedConcreteShearVerification>(
    "ReinforcedConcreteShearVerification",
  );
  const sourceResult = new JavaScriptVerification().verify(input);

  assert.deepEqual(targetResult.toJSON(), sourceResult.toJSON());

  const outputs = targetResult.outputs as {
    vRsd: number;
    vRcd: number;
    vRdWithTransverseReinforcement: number;
    selectedMechanism: string;
    cotTheta: number;
  };
  assert.equal(targetResult.status, "ok");
  assert.ok(outputs.vRsd > 150_000);
  assert.ok(outputs.vRcd > 150_000);
  assert.ok(outputs.vRdWithTransverseReinforcement > 150_000);
  assert.equal(outputs.selectedMechanism, "with-transverse-reinforcement");
  assert.ok(outputs.cotTheta >= 1 && outputs.cotTheta <= 2.5);
});

void test("circular empirical shear branches preserve the source equations and result", () => {
  const concreteMaterial = createNTC2018ConcreteMaterial({
    strengthClass: "C25/30",
    units,
  });
  const reinforcementMaterial = createNTC2018ReinforcementSteelMaterial({
    grade: "B450C",
    units,
  });
  const diameter = 300;
  const concreteSection = new CircularSection({
    diameter,
    units,
  });
  const section = new ReinforcedConcreteSection({
    id: "rc-circular-cosenza",
    concreteSection,
    concreteMaterial,
    reinforcementMaterial,
    units,
  });
  const longitudinalReinforcementArea = 0.02 * concreteSection.area;
  const stirrupDiameter = 8;
  const legs = 2;
  const spacing = 150;
  const asw = (legs * Math.PI * stirrupDiameter ** 2) / 4;
  const rhoW = asw / (spacing * diameter);
  const input = {
    section,
    concreteMaterial,
    reinforcementMaterial,
    actions: {
      vEd: 100_000,
      nEd: 0,
    },
    shear: {
      formulation: "cosenza-2016",
      mode: "with-transverse-reinforcement",
      longitudinalReinforcementArea,
      fcPrime: 25,
      transverseReinforcement: {
        diameter: stirrupDiameter,
        legs,
        spacing,
      },
    },
    units,
  } satisfies RcShearVerificationInput;
  const targetResult = new ReinforcedConcreteShearVerification().verify(input);
  const JavaScriptVerification = baselineExport<typeof ReinforcedConcreteShearVerification>(
    "ReinforcedConcreteShearVerification",
  );
  const sourceResult = new JavaScriptVerification().verify(input);
  const outputs = targetResult.outputs as {
    rhoW: number;
    amplificationFactor: number;
    vRd: number;
  };
  const baseResistance = 0.232 * diameter ** 2 * Math.cbrt(100 * 0.02 * 25);
  const expected = baseResistance * (1 + 245 * rhoW);

  assert.deepEqual(withoutNormativeReferences(targetResult.toJSON()), sourceResult.toJSON());
  assert.ok(Math.abs(outputs.rhoW - rhoW) < 1e-9);
  assert.ok(Math.abs(outputs.amplificationFactor - (1 + 245 * rhoW)) < 1e-9);
  assert.ok(Math.abs(outputs.vRd - expected) < 1e-6);
  assert.equal(targetResult.metadata.method, "cosenza-et-al-2016-eq-5");
  assert.equal(
    (
      targetResult.metadata.normativeReferences as {
        documentId: string;
        resolutionStatus: string;
      }[]
    )[0]?.documentId,
    "cosenza-et-al-2016",
  );
  assert.equal(
    (
      targetResult.metadata.normativeReferences as {
        resolutionStatus: string;
      }[]
    )[0]?.resolutionStatus,
    "outside-corpus",
  );
});

void test("shear refuses incomplete parameter inference", () => {
  const fixture = createRectangularFixture();
  const result = new ReinforcedConcreteShearVerification().verify({
    ...fixture,
    actions: {
      vEd: 60_000,
    },
    shear: {
      mode: "without-transverse-reinforcement",
    },
    units,
  });

  assert.equal(result.status, "not-verified");
  assert.equal(result.checks.length, 0);
  assert.ok((result.warnings as string[]).some((warning) => warning.includes("longitudinalArea")));
  assert.ok((result.metadata.missingParameters as string[]).includes("longitudinalArea"));
});
