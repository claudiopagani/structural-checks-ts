import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import test from "node:test";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

import {
  RectangularSection,
  ReinforcedConcreteSection,
  ReinforcedConcreteTorsionVerification,
  createNTC2018ConcreteMaterial,
  createNTC2018ReinforcementSteelMaterial,
  type RcTorsionVerificationInput,
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

function createFixture() {
  const concreteMaterial = createNTC2018ConcreteMaterial({
    strengthClass: "C25/30",
    units,
  });
  const reinforcementMaterial = createNTC2018ReinforcementSteelMaterial({
    grade: "B450C",
    units,
  });
  const section = new ReinforcedConcreteSection({
    id: "rc-torsion-section",
    concreteSection: new RectangularSection({
      width: 300,
      height: 500,
      units,
    }),
    concreteMaterial,
    reinforcementMaterial,
    units,
  });
  const torsion = {
    edgeToLongitudinalBarCenter: 40,
    cotTheta: 1.5,
    transverseReinforcement: {
      closed: true,
      diameter: 8,
      spacing: 150,
      material: reinforcementMaterial,
    },
    longitudinalReinforcement: {
      area: (4 * Math.PI * 20 ** 2) / 4,
      material: reinforcementMaterial,
    },
  };
  const shear = {
    mode: "with-transverse-reinforcement",
    effectiveDepth: 450,
    longitudinalReinforcementArea: (4 * Math.PI * 20 ** 2) / 4,
    transverseReinforcement: {
      diameter: 8,
      legs: 2,
      spacing: 150,
      material: reinforcementMaterial,
    },
  };

  return { section, concreteMaterial, reinforcementMaterial, torsion, shear };
}

void test("RC torsion matches the baseline and independently evaluated NTC resistances", () => {
  const fixture = createFixture();
  const input = {
    ...fixture,
    actions: { tEd: 20e6, vEd: 50e3 },
    units,
  } satisfies RcTorsionVerificationInput;
  const targetResult = new ReinforcedConcreteTorsionVerification().verify(input);
  const JavaScriptVerification = baselineExport<typeof ReinforcedConcreteTorsionVerification>(
    "ReinforcedConcreteTorsionVerification",
  );
  const sourceResult = new JavaScriptVerification().verify(input);

  assert.deepEqual(targetResult.toJSON(), sourceResult.toJSON());

  const concreteArea = 300 * 500;
  const perimeter = 2 * (300 + 500);
  const effectiveWallThickness = concreteArea / perimeter;
  const medianArea = (300 - effectiveWallThickness) * (500 - effectiveWallThickness);
  const medianPerimeter = 2 * (300 - effectiveWallThickness + (500 - effectiveWallThickness));
  const cotTheta = 1.5;
  const fcdPrime = 0.5 * fixture.concreteMaterial.fcd!;
  const transverseArea = (Math.PI * 8 ** 2) / 4;
  const longitudinalArea = (4 * Math.PI * 20 ** 2) / 4;
  const fyd = fixture.reinforcementMaterial.fyd!;
  const expectedTrcd =
    (2 * medianArea * effectiveWallThickness * fcdPrime * cotTheta) / (1 + cotTheta ** 2);
  const expectedTrsd = 2 * medianArea * (transverseArea / 150) * fyd * cotTheta;
  const expectedTrld = (2 * medianArea * longitudinalArea * fyd) / (medianPerimeter * cotTheta);
  const outputs = targetResult.outputs as {
    trcd: number;
    trsd: number;
    trld: number;
    trd: number;
    cotTheta: number;
  };

  assert.equal(targetResult.status, "ok");
  assert.ok(Math.abs(outputs.trcd - expectedTrcd) < 1);
  assert.ok(Math.abs(outputs.trsd - expectedTrsd) < 1);
  assert.ok(Math.abs(outputs.trld - expectedTrld) < 1);
  assert.ok(Math.abs(outputs.trd - Math.min(expectedTrcd, expectedTrsd, expectedTrld)) < 1);
  assert.equal(outputs.cotTheta, cotTheta);
  assert.ok(
    targetResult.checks.some((check) => check.id === "rc-shear-torsion-concrete-interaction"),
  );
  assert.equal(targetResult.metadata.method, "ntc2018-4.1.2.3.6");
  assert.equal(
    (
      targetResult.metadata.normativeReferences as {
        unitId: string;
      }[]
    )[0]?.unitId,
    "urn:structural-codes:it:unit:ntc2018:4.1.2.3.6",
  );
});

void test("combined shear and torsion requires the shear verification inputs", () => {
  const { section, concreteMaterial, reinforcementMaterial, torsion } = createFixture();
  const input = {
    section,
    concreteMaterial,
    reinforcementMaterial,
    torsion,
    actions: { tEd: 10e6, vEd: 50e3 },
    units,
  } satisfies RcTorsionVerificationInput;
  const targetResult = new ReinforcedConcreteTorsionVerification().verify(input);
  const JavaScriptVerification = baselineExport<typeof ReinforcedConcreteTorsionVerification>(
    "ReinforcedConcreteTorsionVerification",
  );
  const sourceResult = new JavaScriptVerification().verify(input);

  assert.deepEqual(targetResult.toJSON(), sourceResult.toJSON());
  assert.equal(targetResult.status, "not-verified");
  assert.ok(
    (targetResult.metadata.missingParameters as string[]).includes(
      "combinedShearTorsionParameters",
    ),
  );
});

void test("compatibility torsion preserves the explicit not-analyzed result", () => {
  const fixture = createFixture();
  const input = {
    ...fixture,
    torsion: { equilibriumRequired: false },
    actions: { tEd: 10e6 },
    units,
  } satisfies RcTorsionVerificationInput;
  const targetResult = new ReinforcedConcreteTorsionVerification().verify(input);
  const JavaScriptVerification = baselineExport<typeof ReinforcedConcreteTorsionVerification>(
    "ReinforcedConcreteTorsionVerification",
  );
  const sourceResult = new JavaScriptVerification().verify(input);

  assert.deepEqual(targetResult.toJSON(), sourceResult.toJSON());
  assert.equal(targetResult.status, "not-analyzed");
  assert.equal(targetResult.checks.length, 0);
});
