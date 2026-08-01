/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return */
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import test from "node:test";

/* The migrated source DTO is intentionally broad; these tests inspect its serialized payload. */
/* eslint-disable @typescript-eslint/no-explicit-any */

import * as Api from "../dist/index.js";

const execFileAsync = promisify(execFile);
const expectedRevision = "6f33baead8b88166c4b2cf94af41763412e3c751";
const baselinePath = process.env.STRUTTURE_JS_BASELINE_PATH
  ? path.resolve(process.env.STRUTTURE_JS_BASELINE_PATH)
  : path.resolve(import.meta.dirname, "..", "..", "strutture-js");
const units = { force: "N", length: "mm" } as const;
const beamUnits = { force: "kN", length: "m" } as const;
type DeflectionResult = ReturnType<Api.CrackedSectionDeflectionAnalysis["analyze"]> & {
  outputs: any;
  assumptions: string[];
  metadata: { normativeReferences: Array<{ unitId?: string }> } & Record<string, unknown>;
};

function asDeflectionResult(
  result: ReturnType<Api.CrackedSectionDeflectionAnalysis["analyze"]>,
): DeflectionResult {
  return result as DeflectionResult;
}

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

function baselineExport<T>(name: string): T {
  const value = JavaScriptApi[name];
  assert.notEqual(value, undefined, `The baseline is missing ${name}.`);
  return value as T;
}

function createSection({ asymmetric = false } = {}) {
  const concreteMaterial = new Api.ConcreteMaterial({
    name: "C25/30",
    strengthClass: "C25/30",
    elasticModulus: 31476,
    fctm: 2.565,
    units,
  });
  const reinforcementMaterial = new Api.SteelMaterial({
    name: "B450C",
    grade: "B450C",
    elasticModulus: 200000,
    fyk: 450,
    units,
  });
  const concreteSection = new Api.RectangularSection({
    width: 300,
    height: 500,
    units,
  });
  const bars = asymmetric
    ? [
        new Api.ReinforcementBar({
          diameter: 20,
          material: reinforcementMaterial,
          y: 40,
          z: 40,
          units,
        }),
        new Api.ReinforcementBar({
          diameter: 20,
          material: reinforcementMaterial,
          y: 40,
          z: 260,
          units,
        }),
        new Api.ReinforcementBar({
          diameter: 14,
          material: reinforcementMaterial,
          y: 460,
          z: 40,
          units,
        }),
      ]
    : [
        ...[40, 260].map(
          (z) =>
            new Api.ReinforcementBar({
              diameter: 20,
              material: reinforcementMaterial,
              y: 40,
              z,
              units,
            }),
        ),
        ...[40, 260].map(
          (z) =>
            new Api.ReinforcementBar({
              diameter: 20,
              material: reinforcementMaterial,
              y: 460,
              z,
              units,
            }),
        ),
      ];

  return {
    concreteMaterial,
    reinforcementMaterial,
    section: new Api.ReinforcedConcreteSection({
      concreteSection,
      reinforcementBars: bars,
      concreteMaterial,
      reinforcementMaterial,
      referenceModularRatio: 15,
      units,
    }),
  };
}

function serviceCombinations(
  idPrefix: string,
  types: string[] = ["SLE_RARE"],
): Api.BeamCombinationInput[] {
  return types.map((combinationType) => ({
    id: `${idPrefix}-${combinationType}`,
    limitState: "SLE",
    combinationType,
    serviceCombination:
      combinationType === "SLE_QUASI_PERMANENT"
        ? "quasiPermanent"
        : combinationType === "SLE_FREQUENT"
          ? "frequent"
          : "rare",
    factors: { g1: 1 },
  }));
}

function createBeamInput({
  section,
  loadValue = -12,
  span = 5,
  supports = { start: "hinge", end: "roller" },
  elementCount = 20,
  combinations = serviceCombinations("rc-deflection"),
  extraLoads = [],
}: {
  section: InstanceType<typeof Api.ReinforcedConcreteSection>;
  loadValue?: number;
  span?: number;
  supports?: Api.SingleBeamModelOptions["supports"];
  elementCount?: number;
  combinations?: Api.BeamCombinationInput[];
  extraLoads?: Api.BeamLoadInput[];
}): Api.SingleBeamModelOptions {
  const loads: Api.BeamLoadInput[] = [
    {
      id: "g1",
      loadCaseId: "g1",
      actionType: "G1",
      type: "uniform",
      value: loadValue,
      from: 0,
      to: span,
    },
    ...extraLoads,
  ];

  return {
    units: beamUnits,
    geometry: { start: { x: 0, y: 0 }, end: { x: span, y: 0 } },
    sectionProvider: new Api.ReinforcedConcreteBeamSectionProvider({
      section,
      stiffnessState: "transformed",
    }),
    supports,
    loads,
    combinations,
    discretization: { elementCount },
  };
}

function analyzeUniformServiceLoad({
  value,
  types = ["SLE_RARE"],
  section = createSection().section,
  serviceability = {},
  output = { includePointDetails: true },
}: {
  value: number;
  types?: string[];
  section?: InstanceType<typeof Api.ReinforcedConcreteSection>;
  serviceability?: Record<string, unknown>;
  output?: Record<string, unknown>;
}): any {
  const materials = {
    concreteMaterial: section.concreteMaterial,
    reinforcementMaterial: section.reinforcementMaterial,
  };
  const analysisResult = new Api.SingleBeamAnalysis().analyze(
    createBeamInput({
      section,
      loadValue: value,
      combinations: serviceCombinations(`rc-mcr-${Math.abs(value)}`, types),
    }),
  );

  return new Api.CrackedSectionDeflectionAnalysis().analyze({
    analysisResult,
    section,
    ...materials,
    serviceability,
    output,
  });
}

function createFixedFixedFixture({
  loadFactor = 1,
  span = 5,
  elementCount = 20,
  extraLoads = [],
}: {
  loadFactor?: number;
  span?: number;
  elementCount?: number;
  extraLoads?: Array<Record<string, unknown>>;
} = {}) {
  const { section, concreteMaterial, reinforcementMaterial } = createSection();
  const beamModel = createBeamInput({
    section,
    loadValue: -20 * loadFactor,
    span,
    supports: { start: "fixed", end: "fixed" },
    elementCount,
    combinations: serviceCombinations("rc-fixed", ["SLE_RARE", "SLE_QUASI_PERMANENT"]),
    extraLoads,
  });
  return {
    section,
    concreteMaterial,
    reinforcementMaterial,
    beamModel,
    analysisResult: new Api.SingleBeamAnalysis().analyze(beamModel),
    serviceability: { deflection: { creepCoefficient: 2 } },
  };
}

function createContinuousFixture({ span = 10, loadFactor = 4, unequal = false } = {}) {
  const { section, concreteMaterial, reinforcementMaterial } = createSection();
  const supports = [
    { id: "left", position: 0, type: "hinge" },
    { id: "middle", position: 5, type: "roller" },
    { id: "right", position: span, type: "roller" },
  ];
  const beamModel = createBeamInput({
    section,
    loadValue: -20 * loadFactor,
    span,
    supports,
    elementCount: unequal ? 25 : 20,
    combinations: serviceCombinations("rc-continuous", ["SLE_QUASI_PERMANENT"]),
  });
  return {
    section,
    concreteMaterial,
    reinforcementMaterial,
    beamModel,
    analysisResult: new Api.SingleBeamAnalysis().analyze(beamModel),
    serviceability: { deflection: { creepCoefficient: 2 } },
  };
}

void test("RC cracked deflection preserves missing-input and adapter behavior", () => {
  const analysisResult = new Api.CrackedSectionDeflectionAnalysis().analyze();
  const adapterResult = Api.runRcServiceDeflectionAnalysis();
  assert.equal(analysisResult.status, "not-analyzed");
  assert.equal(adapterResult.status, "not-analyzed");
});

void test("RC cracked deflection application consumes its public beam model and exports", () => {
  const { section } = createSection();
  const analysisResult = new Api.SingleBeamAnalysis().analyze(createBeamInput({ section }));
  const model = new Api.CrackedSectionBeamModel({
    id: "rc-deflection-model",
    analysisResult,
    section,
    concreteMaterial: section.concreteMaterial,
    reinforcementMaterial: section.reinforcementMaterial,
    performanceProfile: "interactive",
    output: { includePointDetails: false },
  });
  const result = new Api.RCrackedDeflectionApplication().run({ model }) as any;
  assert.equal(model.section, section);
  assert.notEqual(result.status, "not-analyzed");
  assert.equal(result.outputs.performance.profile, "interactive");
  assert.ok(
    result.metadata.normativeReferences.some(
      (reference: any) => reference.unitId === "urn:structural-codes:it:unit:ntc2018:4.1.2.2.2",
    ),
  );
});

void test("RC deflection keeps the uncracked branch below Mcr and cracks above it", () => {
  const uncracked = analyzeUniformServiceLoad({ value: -12 });
  const uncrackedCombination = uncracked.outputs.combinations[0];
  assert.ok(
    uncrackedCombination.mcr >
      Math.max(...uncrackedCombination.points.map((point: any) => Math.abs(point.mEd))),
  );
  assert.equal(uncrackedCombination.crackedPointCount, 0);
  assert.equal(uncrackedCombination.maxZeta, 0);
  assert.equal(uncracked.outputs.performance.serviceSolveCount, 0);

  const cracked = analyzeUniformServiceLoad({ value: -40 });
  const crackedCombination = cracked.outputs.combinations[0];
  const midspan = crackedCombination.points.reduce((selected: any, point: any) =>
    Math.abs(point.station - 2.5) < Math.abs(selected.station - 2.5) ? point : selected,
  );
  assert.equal(midspan.cracked, true);
  assert.ok(midspan.zeta > 0);
  assert.ok(crackedCombination.crackedPointCount > 0);
  assert.ok(cracked.outputs.performance.serviceSolveCount > 0);
});

void test("RC deflection preserves asymmetric Mcr, long-term modular ratio, and exact threshold stability", () => {
  const asymmetric = createSection({ asymmetric: true }).section;
  const positive = analyzeUniformServiceLoad({ value: -40, section: asymmetric }).outputs
    .combinations[0];
  const negative = analyzeUniformServiceLoad({ value: 40, section: asymmetric }).outputs
    .combinations[0];
  assert.notEqual(positive.mcrPositive, positive.mcrNegative);
  assert.equal(
    positive.points.find((point: any) => Math.abs(point.station - 2.5) <= 1e-9).mcr,
    positive.mcrPositive,
  );
  assert.equal(
    negative.points.find((point: any) => Math.abs(point.station - 2.5) <= 1e-9).mcr,
    negative.mcrNegative,
  );

  const longTerm = analyzeUniformServiceLoad({
    value: -12,
    types: ["SLE_RARE", "SLE_QUASI_PERMANENT"],
    serviceability: { deflection: { creepCoefficient: 2 } },
  }).outputs.combinations.find(
    (combination: any) => combination.combinationType === "SLE_QUASI_PERMANENT",
  );
  const rare = analyzeUniformServiceLoad({ value: -12 }).outputs.combinations[0];
  assert.equal(longTerm.modularRatio, rare.baseModularRatio * 3);
  assert.notEqual(longTerm.mcrPositive, rare.mcrPositive);

  const curveSection = createSection();
  assert.ok(curveSection.reinforcementMaterial);
  const curveEs = curveSection.reinforcementMaterial.elasticModulus;
  if (curveEs === null) {
    throw new Error("The fixture reinforcement modulus must be finite.");
  }
  const curve = new Api.SectionMomentCurvatureCurve({
    section: curveSection.section,
    reinforcementMaterial: curveSection.reinforcementMaterial,
    effectiveModularRatio: longTerm.modularRatio,
    mcr: longTerm.mcrPositive,
    mcrPositive: longTerm.mcrPositive,
    mcrNegative: longTerm.mcrNegative,
    grossInertia: longTerm.grossInertia,
    concreteModulus: curveEs / longTerm.modularRatio,
    beta: 0.5,
    momentSamples: 20,
    initialMaxMoment: longTerm.mcrPositive * 2,
  });
  assert.equal(curve.lookupState(longTerm.mcrPositive).cracked, false);
  assert.equal(curve.lookupState(longTerm.mcrPositive).eiSec, curve.grossEI);
  assert.equal(curve.lookupState(longTerm.mcrPositive * (1 + 1e-12)).cracked, true);
});

void test("RC deflection applies creep, EN 1992 shrinkage curvature, and production sampling", () => {
  const fixture = createSection();
  const analysisResult = new Api.SingleBeamAnalysis().analyze(
    createBeamInput({ section: fixture.section, loadValue: -40 }),
  );
  const result = asDeflectionResult(
    new Api.CrackedSectionDeflectionAnalysis().analyze({
      analysisResult,
      section: fixture.section,
      concreteMaterial: fixture.concreteMaterial,
      reinforcementMaterial: fixture.reinforcementMaterial,
      performanceProfile: "production",
      serviceability: {
        deflection: { creepCoefficient: 3, includeShrinkage: true, freeShrinkageStrain: -0.00035 },
      },
    }),
  );
  assert.equal(result.status, "ok");
  assert.equal(result.outputs.performance.profile, "production");
  assert.equal(result.outputs.performance.maxStationsPerCombination, 33);
  assert.ok(
    result.outputs.performance.inputStationCount >= result.outputs.performance.analyzedStationCount,
  );
  assert.ok(
    result.outputs.combinations.every((combination: any) => combination.analyzedPointCount <= 33),
  );
  assert.ok(
    result.outputs.combinations.every((combination: any) => combination.returnedPointCount <= 65),
  );
});

void test("RC hyperstatic deflection redistributes stiffness with diagnostics and adaptive relaxation", () => {
  const fixture = createFixedFixedFixture({ loadFactor: 5 });
  const result = asDeflectionResult(
    new Api.CrackedSectionDeflectionAnalysis().analyze({
      analysisResult: fixture.analysisResult,
      beamModel: fixture.beamModel,
      section: fixture.section,
      concreteMaterial: fixture.concreteMaterial,
      reinforcementMaterial: fixture.reinforcementMaterial,
      serviceability: fixture.serviceability,
    }),
  );
  const combination = result.outputs.combinations[0];
  assert.equal(result.status, "ok");
  assert.equal(combination.hyperstatic.active, true);
  assert.equal(combination.hyperstatic.converged, true);
  assert.ok(combination.hyperstatic.iterations > 0);
  assert.ok(combination.hyperstatic.femSolveCount > 0);
  assert.ok(result.outputs.performance.curveBuildCount > 0);
  assert.ok(result.outputs.performance.curveLookupCount > 0);
  assert.ok(
    result.assumptions.some((assumption: string) =>
      assumption.includes("Hyperstatic beams use iterative"),
    ),
  );
});

void test("RC hyperstatic deflection handles continuous unequal spans and variable axial force", () => {
  const continuous = createContinuousFixture({ span: 12.5, unequal: true });
  const continuousResult = asDeflectionResult(
    new Api.CrackedSectionDeflectionAnalysis().analyze({
      analysisResult: continuous.analysisResult,
      beamModel: continuous.beamModel,
      section: continuous.section,
      concreteMaterial: continuous.concreteMaterial,
      reinforcementMaterial: continuous.reinforcementMaterial,
      serviceability: continuous.serviceability,
      output: { includePointDetails: true },
    }),
  );
  const combination = continuousResult.outputs.combinations[0];
  const supportDeflections = [0, 5, 12.5].map((station) =>
    combination.points.find((point: any) => Math.abs(point.station - station) <= 1e-9),
  );
  assert.equal(combination.hyperstatic.active, true);
  assert.equal(combination.hyperstatic.converged, true);
  assert.ok(supportDeflections.every(Boolean));
  assert.ok(supportDeflections.every((point) => Math.abs(point.deflection) <= 1e-9));

  const axialLoad = {
    id: "axial-midspan",
    loadCaseId: "axial",
    actionType: "Qk",
    type: "point",
    position: 2.5,
    direction: "global-x",
    value: 100,
  };
  const variable = createFixedFixedFixture({
    loadFactor: 1.5,
    elementCount: 20,
    extraLoads: [axialLoad],
  });
  variable.beamModel.combinations = [
    {
      ...serviceCombinations("rc-variable", ["SLE_QUASI_PERMANENT"])[0],
      factors: { g1: 1, axial: 1 },
    },
  ];
  variable.analysisResult = new Api.SingleBeamAnalysis().analyze(variable.beamModel);
  const variableResult = asDeflectionResult(
    new Api.CrackedSectionDeflectionAnalysis().analyze({
      analysisResult: variable.analysisResult,
      beamModel: variable.beamModel,
      section: variable.section,
      concreteMaterial: variable.concreteMaterial,
      reinforcementMaterial: variable.reinforcementMaterial,
      serviceability: variable.serviceability,
      mesh: { targetFiberCount: 40 },
      output: { includePointDetails: true },
    }),
  );
  const variableCombination = variableResult.outputs.combinations[0];
  assert.equal(variableCombination.hyperstatic.converged, true);
  assert.equal(variableCombination.hyperstatic.axialForceCurveCount, 2);
  assert.ok(
    variableResult.assumptions.some((assumption: string) =>
      assumption.includes("Variable axial force"),
    ),
  );
});

void test("service deflection adapter returns the source-compatible serializable DTO", () => {
  const { section } = createSection();
  const result = Api.runRcServiceDeflectionAnalysis({
    sectionBuild: {
      section,
      materials: {
        concreteMaterial: section.concreteMaterial,
        reinforcementMaterial: section.reinforcementMaterial,
      },
    },
    analysisState: {
      serviceCombination: "quasiPermanent",
      deflectionSpanM: "5",
      deflectionMEdKnm: "120",
      deflectionStructuralSystem: "simpleBeam",
      deflectionLimitRatio: "250",
      modularRatio: "15",
    },
  });
  assert.equal(result.kind, "serviceDeflection");
  assert.equal(result.applicationId, "rc-cracked-deflection");
  assert.ok(["ok", "not-verified"].includes(result.status));
  assert.equal(result.outputs.source, "synthetic-service-moment-profile");
  assert.equal(result.outputs.performance.profile, "interactive");
  assert.ok(result.outputs.maxAbsDeflection > 0);
  assert.ok(result.outputs.points.length > 2);
  assert.equal(result.outputs.combination.combinationType, "SLE_QUASI_PERMANENT");
});

void test("RC beam-member deflection composition matches the pinned JavaScript result", () => {
  const { section, concreteMaterial, reinforcementMaterial } = createSection();
  const beamInput = createBeamInput({
    section,
    loadValue: -40,
    combinations: serviceCombinations("rc-beam-verifier", ["SLE_RARE"]),
  });
  const analysisResult = new Api.SingleBeamAnalysis().analyze(beamInput);
  const input = {
    beamId: "rc-beam-verifier",
    section,
    concreteMaterial,
    reinforcementMaterial,
    analysisResult,
    serviceability: { deflection: { creepCoefficient: 2 } },
    beamModel: beamInput,
  };
  const target = new Api.ReinforcedConcreteBeamVerification().verify(input);
  const JavaScriptVerification = baselineExport<typeof Api.ReinforcedConcreteBeamVerification>(
    "ReinforcedConcreteBeamVerification",
  );
  const source = new JavaScriptVerification().verify(input);
  assert.deepEqual(target.toJSON(), source.toJSON());
  assert.equal((target.outputs as any).deflection?.status, "ok");
});
