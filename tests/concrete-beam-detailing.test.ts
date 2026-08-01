import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import test from "node:test";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

import {
  RectangularSection,
  ReinforcedConcreteBeamDetailingVerification,
  calculateEn1992AnchorageLength,
  calculateEn1992DesignBondStrength,
  calculateEn1992LocalBearingResistance,
  calculateEn1992ShrinkageCurvature,
  createNTC2018ConcreteMaterial,
  createNTC2018ReinforcementSteelMaterial,
  type RcBeamDetailingVerificationInput,
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

void test("EN 1992 detailing helpers preserve the baseline and independent arithmetic", () => {
  const sourceBond = baselineExport<typeof calculateEn1992DesignBondStrength>(
    "calculateEn1992DesignBondStrength",
  );
  const sourceAnchorage = baselineExport<typeof calculateEn1992AnchorageLength>(
    "calculateEn1992AnchorageLength",
  );
  const sourceBearing = baselineExport<typeof calculateEn1992LocalBearingResistance>(
    "calculateEn1992LocalBearingResistance",
  );
  const sourceShrinkage = baselineExport<typeof calculateEn1992ShrinkageCurvature>(
    "calculateEn1992ShrinkageCurvature",
  );
  const bondInput = { fctd: 1.2, barDiameter: 16 };
  const bond = calculateEn1992DesignBondStrength(bondInput);
  const anchorageInput = {
    barDiameter: 16,
    designSteelStress: 400,
    fbd: bond.fbd,
  };
  const anchorage = calculateEn1992AnchorageLength(anchorageInput);
  const bearingInput = {
    loadedArea: 40_000,
    distributionArea: 160_000,
    fcd: 15,
  };
  const bearing = calculateEn1992LocalBearingResistance(bearingInput);
  const shrinkageInput = {
    freeShrinkageStrain: -0.0003,
    reinforcementElasticModulus: 200_000,
    effectiveConcreteModulus: 10_000,
    reinforcementFirstMoment: 100_000,
    sectionSecondMoment: 1e9,
  };
  const shrinkage = calculateEn1992ShrinkageCurvature(shrinkageInput);

  assert.deepEqual(bond, sourceBond(bondInput));
  assert.deepEqual(anchorage, sourceAnchorage(anchorageInput));
  assert.deepEqual(bearing, sourceBearing(bearingInput));
  assert.deepEqual(shrinkage, sourceShrinkage(shrinkageInput));
  assert.ok(Math.abs(bond.fbd - 2.7) < 1e-12);
  assert.ok(Math.abs(anchorage.basicRequiredLength - 592.5925926) < 1e-6);
  assert.equal(bearing.enhancement, 2);
  assert.equal(bearing.resistance, 1.2e6);
  assert.ok(Math.abs(shrinkage.curvature + 6e-7) < 1e-18);
  assert.equal(
    (
      bond.metadata.normativeReferences as {
        resolutionStatus: string;
      }[]
    )[0]?.resolutionStatus,
    "outside-corpus",
  );
});

void test("beam detailing matches the baseline across anchorage and seismic rules", () => {
  const concreteMaterial = createNTC2018ConcreteMaterial({
    strengthClass: "C25/30",
    units,
  });
  const reinforcementMaterial = createNTC2018ReinforcementSteelMaterial({
    grade: "B450C",
    units,
  });
  const input = {
    section: new RectangularSection({ width: 300, height: 500, units }),
    concreteMaterial,
    reinforcementMaterial,
    detailing: {
      geometry: { effectiveDepth: 450 },
      longitudinal: {
        top: { diameter: 16, barCount: 4 },
        bottom: { diameter: 16, barCount: 4 },
      },
      transverse: {
        diameter: 8,
        spacing: 90,
        areaPerSet: 100.53,
        hookAngle: 135,
        hookExtension: 80,
      },
      seismic: {
        enabled: true,
        ductilityClass: "CDA",
        firstHoopDistance: 50,
      },
      anchors: [{ id: "support-top", diameter: 16, availableLength: 1000 }],
    },
  } satisfies RcBeamDetailingVerificationInput;
  const targetResult = new ReinforcedConcreteBeamDetailingVerification().verify(input);
  const JavaScriptVerification = baselineExport<typeof ReinforcedConcreteBeamDetailingVerification>(
    "ReinforcedConcreteBeamDetailingVerification",
  );
  const sourceResult = new JavaScriptVerification().verify(input);

  assert.deepEqual(targetResult.toJSON(), sourceResult.toJSON());
  assert.equal(targetResult.status, "ok");
  assert.equal(
    (targetResult.outputs.seismic as { criticalZoneLength: number }).criticalZoneLength,
    750,
  );
  assert.ok(targetResult.checks.some((check) => check.id === "rc-beam-anchorage-support-top"));
  assert.ok(targetResult.checks.some((check) => check.id === "rc-beam-seismic-hoop-spacing"));
  assert.equal(
    (
      targetResult.metadata.normativeReferences as {
        unitId: string | null;
      }[]
    ).some((reference) => reference.unitId === "urn:structural-codes:it:unit:ntc2018:7.4.6.2.1"),
    true,
  );
});

void test("beam detailing preserves the explicit not-analyzed result", () => {
  const targetResult = new ReinforcedConcreteBeamDetailingVerification().verify();
  const JavaScriptVerification = baselineExport<typeof ReinforcedConcreteBeamDetailingVerification>(
    "ReinforcedConcreteBeamDetailingVerification",
  );
  const sourceResult = new JavaScriptVerification().verify();

  assert.deepEqual(targetResult.toJSON(), sourceResult.toJSON());
  assert.equal(targetResult.status, "not-analyzed");
});
