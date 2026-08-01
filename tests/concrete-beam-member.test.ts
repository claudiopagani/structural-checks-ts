import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import test from "node:test";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

import {
  BeamSectionActionVerifier,
  RectangularSection,
  ReinforcedConcreteBeamVerification,
  ReinforcedConcreteSection,
  ReinforcementBar,
  createNTC2018ConcreteMaterial,
  createNTC2018ReinforcementSteelMaterial,
  type BeamAnalysisResult,
  type RcBeamDetailingInput,
  type RcServiceabilityOptions,
  type RcShearInput,
  type RcTorsionInput,
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

function createFixture() {
  const concreteMaterial = createNTC2018ConcreteMaterial({
    strengthClass: "C25/30",
    units,
  });
  const reinforcementMaterial = createNTC2018ReinforcementSteelMaterial({
    grade: "B450C",
    units,
  });
  const coordinates: Array<[string, number, number]> = [
    ["bottom-1", 50, 45],
    ["bottom-2", 50, 115],
    ["bottom-3", 50, 185],
    ["bottom-4", 50, 255],
    ["top-1", 450, 45],
    ["top-2", 450, 115],
    ["top-3", 450, 185],
    ["top-4", 450, 255],
  ];
  const section = new ReinforcedConcreteSection({
    id: "rc-beam-member-section",
    concreteSection: new RectangularSection({
      width: 300,
      height: 500,
      units,
      metadata: { shape: "rectangular" },
    }),
    concreteMaterial,
    reinforcementMaterial,
    reinforcementBars: coordinates.map(
      ([id, y, z]) =>
        new ReinforcementBar({
          id,
          diameter: 16,
          y,
          z,
          material: reinforcementMaterial,
          units,
        }),
    ),
    units,
  });
  const analysisResult: BeamAnalysisResult = {
    units,
    combinations: {
      uls: {
        id: "ULS-1",
        resultType: "combination",
        geometry: { length: 6000 },
        supports: [{ station: 0 }, { station: 6000 }],
        internalForces: {
          samples: [
            {
              station: 3000,
              n: -100e3,
              v: 55e3,
              m: 90e6,
              t: 8e6,
              principalActions: {
                vY: 55e3,
                vZ: 5e3,
                mY: 90e6,
                mZ: 12e6,
              },
            },
          ],
          maxAbsBendingMoment: { station: 3000 },
          maxShearForce: { station: 3000 },
        },
        context: { limitState: "ULS", combinationType: "ULS" },
      },
      sleRare: {
        id: "SLE-RARE",
        resultType: "combination",
        geometry: { length: 6000 },
        internalForces: {
          samples: [
            {
              station: 3000,
              n: -60e3,
              v: 30e3,
              m: 45e6,
              principalActions: {
                vY: 30e3,
                vZ: 2e3,
                mY: 45e6,
                mZ: 6e6,
              },
            },
          ],
          maxAbsBendingMoment: { station: 3000 },
        },
        context: { limitState: "SLE", combinationType: "SLE_RARE" },
      },
      sleQuasiPermanent: {
        id: "SLE-QP",
        resultType: "combination",
        geometry: { length: 6000 },
        internalForces: {
          samples: [
            {
              station: 3000,
              n: -40e3,
              v: 20e3,
              m: 32e6,
              principalActions: {
                vY: 20e3,
                mY: 32e6,
                mZ: 4e6,
              },
            },
          ],
          maxAbsBendingMoment: { station: 3000 },
        },
        context: { limitState: "SLE", combinationType: "SLE_QUASI_PERMANENT" },
      },
    },
  };
  const shear: RcShearInput = {
    mode: "with-transverse-reinforcement",
    effectiveDepth: 450,
    longitudinalReinforcementArea: (8 * Math.PI * 16 ** 2) / 4,
    transverseReinforcement: {
      diameter: 8,
      legs: 2,
      spacing: 120,
      material: reinforcementMaterial,
    },
  };
  const torsion: RcTorsionInput = {
    edgeToLongitudinalBarCenter: 40,
    cotTheta: 1.5,
    transverseReinforcement: {
      closed: true,
      diameter: 8,
      spacing: 120,
      material: reinforcementMaterial,
    },
    longitudinalReinforcement: {
      area: (8 * Math.PI * 16 ** 2) / 4,
      material: reinforcementMaterial,
    },
  };
  const serviceability: RcServiceabilityOptions = {
    deflection: false,
    longitudinalReinforcementGroups: [
      {
        id: "bottom",
        face: "bottom",
        barIds: ["bottom-1", "bottom-2", "bottom-3", "bottom-4"],
        spacing: 70,
      },
      {
        id: "top",
        face: "top",
        barIds: ["top-1", "top-2", "top-3", "top-4"],
        spacing: 70,
      },
    ],
  };
  const detailing: RcBeamDetailingInput = {
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
  };

  return {
    beamId: "rc-beam-member",
    section,
    concreteMaterial,
    reinforcementMaterial,
    analysisResult,
    shear,
    torsion,
    serviceability,
    detailing,
    mesh: { targetFiberCount: 100 },
    solver: { tolerance: 1e-6, maxIterations: 100 },
    verificationStations: { mode: "critical" },
  };
}

void test("beam section-action station selection preserves baseline metadata", () => {
  const analysisResult: BeamAnalysisResult = {
    units,
    combinations: {
      uls: {
        id: "station-selection",
        geometry: { length: 10 },
        supports: [{ station: 0 }],
        internalForces: {
          samples: [
            { station: 0, n: 0, v: 10, m: 0 },
            { station: 5, n: 0, v: 0, m: 20 },
            { station: 10, n: 0, v: -10, m: 0 },
          ],
          maxAbsBendingMoment: { station: 5 },
          maxShearForce: { station: 0 },
          minShearForce: { station: 10 },
        },
        context: { limitState: "ULS" },
      },
    },
  };
  const sectionVerifier = () => ({
    status: "ok" as const,
    utilizationRatio: 0.5,
    demand: 1,
    capacity: 2,
    checks: [
      {
        id: "station-check",
        ok: true,
        utilizationRatio: 0.5,
      },
    ],
  });
  const target = new BeamSectionActionVerifier({
    sectionVerifier,
    limitStates: "ULS",
    verificationStations: { mode: "combined", userStations: [5] },
  }).verify({ analysisResult });
  const JavaScriptVerifier = baselineExport<typeof BeamSectionActionVerifier>(
    "BeamSectionActionVerifier",
  );
  const source = new JavaScriptVerifier({
    sectionVerifier,
    limitStates: "ULS",
    verificationStations: { mode: "combined", userStations: [5] },
  }).verify({ analysisResult });

  assert.deepEqual(target.toJSON(), source.toJSON());
  assert.equal(target.outputs.stationResultCount, 1);
  assert.equal(
    (target.checks[0]?.metadata as { stationSource?: string } | undefined)?.stationSource,
    "user",
  );
});

void test("local RC beam ULS, SLE, shear, torsion, and detailing match the baseline", () => {
  const input = createFixture();
  const target = new ReinforcedConcreteBeamVerification().verify(input);
  const JavaScriptVerification = baselineExport<typeof ReinforcedConcreteBeamVerification>(
    "ReinforcedConcreteBeamVerification",
  );
  const source = new JavaScriptVerification().verify(input);

  assert.deepEqual(target.toJSON(), source.toJSON());
  assert.ok(target.checks.some((check) => check.id === "rc-uls-biaxial-bending"));
  assert.ok(target.checks.some((check) => check.id === "rc-sle-concrete-stress"));
  assert.ok(target.checks.some((check) => check.id === "rc-sle-crack-bar-diameter"));
  assert.ok(target.checks.some((check) => check.id === "rc-shear-torsion-concrete-interaction"));
  assert.ok(target.checks.some((check) => check.id === "rc-beam-seismic-hoop-spacing"));
  assert.equal(target.metadata.deflectionImplementationStatus, undefined);
  assert.equal(
    (
      target.outputs.uls as {
        governing: { metadata: { biaxial: boolean } };
      }
    ).governing.metadata.biaxial,
    true,
  );
});

void test("beam verifier composes the migrated deflection branch", () => {
  const input = createFixture();
  const target = new ReinforcedConcreteBeamVerification().verify({
    ...input,
    serviceability: {
      ...input.serviceability,
      deflection: {},
    },
  });

  const JavaScriptVerification = baselineExport<typeof ReinforcedConcreteBeamVerification>(
    "ReinforcedConcreteBeamVerification",
  );
  const source = new JavaScriptVerification().verify({
    ...input,
    serviceability: {
      ...input.serviceability,
      deflection: {},
    },
  });

  assert.deepEqual(target.toJSON(), source.toJSON());
  assert.notEqual(target.status, "not-implemented");
  assert.equal(target.metadata.deflectionImplementationStatus, undefined);
  assert.equal(
    (target.outputs.deflection as { outputs?: { implementationStatus?: string } } | null)?.outputs
      ?.implementationStatus,
    undefined,
  );
});

void test("beam member missing-input result matches the baseline", () => {
  const target = new ReinforcedConcreteBeamVerification().verify();
  const JavaScriptVerification = baselineExport<typeof ReinforcedConcreteBeamVerification>(
    "ReinforcedConcreteBeamVerification",
  );
  const source = new JavaScriptVerification().verify();

  assert.deepEqual(target.toJSON(), source.toJSON());
  assert.equal(target.status, "not-analyzed");
});
