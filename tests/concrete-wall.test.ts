import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import test from "node:test";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

import * as TypeScriptApi from "../dist/index.js";

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

function jsonValue(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value)) as unknown;
}

type WallFunction = (input: unknown) => unknown;

const wallFixtures: Array<{
  name: keyof typeof TypeScriptApi;
  input: Record<string, unknown>;
}> = [
  {
    name: "computeWallCriticalZoneHeight",
    input: {
      wallLength: 4,
      wallHeight: 24,
      storeyHeight: 3,
      storeyCount: 7,
    },
  },
  {
    name: "computeWallMomentShift",
    input: {
      wallLength: 4,
      wallHeight: 24,
      storeyHeight: 3,
      storeyCount: 7,
      behavior: "cd-a",
    },
  },
  {
    name: "computeWallCapacityShear",
    input: {
      analysisShear: 100,
      momentResistance: 200,
      momentDemand: 100,
      q: 4,
      behavior: "cd-a",
      wallLength: 4,
      wallHeight: 20,
      elasticSpectrumTc: 2,
      elasticSpectrumT1: 1,
    },
  },
  {
    name: "verifyWallShear",
    input: {
      shearDemand: 100,
      chapter4ConcreteCompressionResistance: 400,
      wallWebTensionResistance: 200,
      slidingResistance: 200,
      inclinedReinforcementContribution: 50.01,
      isDissipativeZone: true,
      isSquatWall: true,
    },
  },
  {
    name: "verifyWallBoundaryConfinement",
    input: { maximumConcreteCompressiveStrain: 0.00351 },
  },
  {
    name: "computeWallBoundaryLength",
    input: {
      wallLength: 4,
      wallThickness: 0.3,
      strainDerivedLength: 0.8,
      simplifiedDetailing: true,
    },
  },
  {
    name: "computeWallConfinementOmegaWd",
    input: {
      behavior: "cd-a",
      confinementEffectiveness: 0.8,
      curvatureDuctilityDemand: 6,
      normalizedAxialForce: 0.2,
      verticalWebMechanicalRatio: 0.05,
      reinforcementYieldStrain: 0.002,
      grossSectionDepth: 0.3,
      confinedCoreDepth: 0.25,
    },
  },
  {
    name: "createWallSectionAssessment",
    input: {
      sectionId: "W1",
      behavior: "cd-b",
      wallLength: 4,
      wallThickness: 0.3,
      axialCompressionRatio: 0.2,
      flexuralCheck: { id: "flexure", ok: true },
      shearCheckInput: {
        shearDemand: 100,
        chapter4ConcreteCompressionResistance: 400,
        wallWebTensionResistance: 200,
        slidingResistance: 200,
        isDissipativeZone: true,
        isSquatWall: false,
      },
    },
  },
  {
    name: "computeWallEffectiveFlangeWidth",
    input: {
      actualFlangeWidth: 2,
      wallHeightAbove: 6,
      adjacentWebSpacing: 5,
    },
  },
  {
    name: "computeMixedSystemWallShearEnvelope",
    input: {
      wallHeight: 6,
      baseAmplifiedShear: 200,
      analysisShearAtOneThird: 60,
      elevations: [0, 1, 2, 3, 6],
    },
  },
  {
    name: "computeWeaklyReinforcedWallShearDemand",
    input: { analysisShear: -100, q: 3 },
  },
  {
    name: "computeWeaklyReinforcedWallAxialDemandRange",
    input: { gravityAxialDemand: 1000, q: 3 },
  },
  {
    name: "verifyWallCurvatureDuctility",
    input: {
      curvatureDuctilityDemand: 6,
      curvatureDuctilityCapacity: 6,
    },
  },
  {
    name: "verifyWallGeneralDetailing",
    input: {
      wallThickness: 0.2,
      clearStoreyHeight: 3,
      diagonalCouplingReinforcementRequired: true,
      supportedFromFoundationOrRigidBox: true,
      irregularOpeningsIncludedInAnalysis: true,
      verticalReinforcementRatio: 0.005,
      horizontalReinforcementRatio: 0.002,
      maximumConcreteCompressiveStrain: 0.0021,
      maximumBarDiameter: 0.02,
      barsOnBothFaces: true,
      maximumBarSpacing: 0.3,
      tiesPerSquareMetre: 9,
    },
  },
  {
    name: "createCouplingBeamAssessment",
    input: {
      beamId: "CB-2",
      clearSpan: 1,
      sectionHeight: 0.5,
      slabThickness: 0.2,
      width: 0.3,
      effectiveDepth: 0.5,
      shearDemand: 200,
      concreteTensileDesignStrength: 1000,
      chapter4FlexuralVerification: { ok: true },
      diagonalReinforcement: {
        areaPerDiagonal: 0.0008,
        designYieldStrength: 450000,
        minimumAngle: Math.PI / 4,
        confinementSpacing: 0.1,
        distributedBarDiameter: 0.01,
        distributedBarSpacing: 0.1,
        edgeBarCountPerEdge: 2,
        edgeBarDiameter: 0.016,
        providedAnchorageLength: 0.75,
        nonSeismicAnchorageLength: 0.5,
      },
    },
  },
  {
    name: "createWallHeightSystemAssessment",
    input: {
      wallId: "W1",
      expectedSectionCutIds: ["CUT-BASE"],
      sectionStateAssessments: [
        {
          sectionCutId: "CUT-BASE",
          complete: true,
          checks: [{ id: "flexure", ok: true }],
        },
      ],
      detailingAssessment: {
        checks: [{ id: "detailing", ok: true }],
      },
    },
  },
];

void test("NTC 2018 seismic wall kernels match the pinned JavaScript baseline", () => {
  for (const fixture of wallFixtures) {
    const target = TypeScriptApi[fixture.name] as WallFunction;
    const baseline = baselineExport<WallFunction>(fixture.name);
    assert.deepEqual(
      jsonValue(target(fixture.input)),
      jsonValue(baseline(fixture.input)),
      fixture.name,
    );
  }
});

void test("wall shear and confinement equations remain fixed numerical oracles", () => {
  const shear = TypeScriptApi.computeWallCapacityShear({
    analysisShear: 100,
    momentResistance: 200,
    momentDemand: 100,
    q: 4,
    behavior: "cd-a",
    wallLength: 4,
    wallHeight: 20,
    elasticSpectrumTc: 2,
    elasticSpectrumT1: 1,
  });
  const expectedShearFactor = 4 * Math.sqrt(((1.2 / 4) * (200 / 100)) ** 2 + 0.1 * (2 / 1) ** 2);
  assert.ok(Math.abs(shear.rawAmplificationFactor - expectedShearFactor) < 1e-12);

  const confinement = TypeScriptApi.computeWallConfinementOmegaWd({
    behavior: "cd-a",
    confinementEffectiveness: 0.8,
    curvatureDuctilityDemand: 6,
    normalizedAxialForce: 0.2,
    verticalWebMechanicalRatio: 0.05,
    reinforcementYieldStrain: 0.002,
    grossSectionDepth: 0.3,
    confinedCoreDepth: 0.25,
  });
  const expectedConfinement = (30 * 6 * (0.2 + 0.05) * 0.002 * (0.3 / 0.25) - 0.035) / 0.8;
  assert.ok(Math.abs(confinement.equationValue - expectedConfinement) < 1e-12);
  assert.equal(confinement.omegaWd, Math.max(0.12, expectedConfinement));
});

type MaterialFactory = (options: Record<string, unknown>) => unknown;
type SectionConstructor = new (options: Record<string, unknown>) => unknown;

function createTargetWallSection(): TypeScriptApi.ReinforcedConcreteSection {
  const concrete = TypeScriptApi.createNTC2018ConcreteMaterial({
    strengthClass: "C25/30",
    units,
  });
  const steel = TypeScriptApi.createNTC2018ReinforcementSteelMaterial({
    grade: "B450C",
    units,
  });
  return new TypeScriptApi.ReinforcedConcreteSection({
    name: "Wall biaxial fixture",
    concreteSection: new TypeScriptApi.RectangularSection({
      width: 300,
      height: 3000,
      units,
    }),
    reinforcementBars: [
      { id: "left-bottom", y: 40, z: 40 },
      { id: "left-top", y: 2960, z: 40 },
      { id: "right-bottom", y: 40, z: 260 },
      { id: "right-top", y: 2960, z: 260 },
    ].map(
      (bar) =>
        new TypeScriptApi.ReinforcementBar({
          ...bar,
          diameter: 20,
          grade: "B450C",
          material: steel,
          units,
        }),
    ),
    concreteMaterial: concrete,
    reinforcementMaterial: steel,
    referenceModularRatio: 15,
    units,
  });
}

function createBaselineWallSection(): unknown {
  const concreteFactory = baselineExport<MaterialFactory>("createNTC2018ConcreteMaterial");
  const steelFactory = baselineExport<MaterialFactory>("createNTC2018ReinforcementSteelMaterial");
  const RectangularSection = baselineExport<SectionConstructor>("RectangularSection");
  const ReinforcementBar = baselineExport<SectionConstructor>("ReinforcementBar");
  const ReinforcedConcreteSection = baselineExport<SectionConstructor>("ReinforcedConcreteSection");
  const concrete = concreteFactory({ strengthClass: "C25/30", units });
  const steel = steelFactory({ grade: "B450C", units });
  return new ReinforcedConcreteSection({
    name: "Wall biaxial fixture",
    concreteSection: new RectangularSection({
      width: 300,
      height: 3000,
      units,
    }),
    reinforcementBars: [
      { id: "left-bottom", y: 40, z: 40 },
      { id: "left-top", y: 2960, z: 40 },
      { id: "right-bottom", y: 40, z: 260 },
      { id: "right-top", y: 2960, z: 260 },
    ].map(
      (bar) =>
        new ReinforcementBar({
          ...bar,
          diameter: 20,
          grade: "B450C",
          material: steel,
          units,
        }),
    ),
    concreteMaterial: concrete,
    reinforcementMaterial: steel,
    referenceModularRatio: 15,
    units,
  });
}

void test("wall biaxial bending matches the live baseline section domain", () => {
  const common = {
    axialForce: -500_000,
    momentX: 80_000_000,
    momentY: 10_000_000,
    concreteDesignStrength: 14.17,
    reinforcementDesignStrength: 391.3,
    targetFiberCount: 100,
    angleCount: 8,
  };
  const target = TypeScriptApi.verifyWallBiaxialBending({
    ...common,
    section: createTargetWallSection(),
  });
  const baseline = baselineExport<WallFunction>("verifyWallBiaxialBending")({
    ...common,
    section: createBaselineWallSection(),
  });
  assert.deepEqual(jsonValue(target), jsonValue(baseline));
  assert.equal(target.check, "wall-biaxial-bending");
  assert.equal(typeof target.ok, "boolean");
  assert.equal(target.metadata.normativeReferences.length, 2);
});
