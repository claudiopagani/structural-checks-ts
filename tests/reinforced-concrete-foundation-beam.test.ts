import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import test from "node:test";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

import {
  RectangularSection,
  ReinforcedConcreteBeamSectionProvider,
  ReinforcedConcreteFoundationBeamApplication,
  ReinforcedConcreteFoundationBeamModel,
  ReinforcedConcreteSection,
  ReinforcementBar,
  SectionMomentCurvatureCurve,
  createNTC2018ConcreteMaterial,
  createNTC2018ReinforcementSteelMaterial,
} from "../dist/index.js";

const execFileAsync = promisify(execFile);
const expectedRevision = "6f33baead8b88166c4b2cf94af41763412e3c751";
const baselinePath = process.env.STRUTTURE_JS_BASELINE_PATH
  ? path.resolve(process.env.STRUTTURE_JS_BASELINE_PATH)
  : path.resolve(import.meta.dirname, "..", "..", "strutture-js");
const units = { force: "N", length: "mm" } as const;
const reinforcementCoordinates: readonly (readonly [number, number])[] = [
  [50, 50],
  [50, 350],
  [550, 50],
  [550, 350],
];

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

function createSection() {
  const concreteMaterial = createNTC2018ConcreteMaterial({
    strengthClass: "C25/30",
    units,
  });
  const reinforcementMaterial = createNTC2018ReinforcementSteelMaterial({
    grade: "B450C",
    units,
  });
  const concreteSection = new RectangularSection({
    width: 400,
    height: 600,
    units,
  });
  const section = new ReinforcedConcreteSection({
    id: "foundation-beam-section",
    concreteSection,
    concreteMaterial,
    reinforcementMaterial,
    reinforcementBars: reinforcementCoordinates.map(
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

  return { concreteMaterial, reinforcementMaterial, section };
}

function createModel(uplift = false) {
  const { concreteMaterial, reinforcementMaterial, section } = createSection();
  return new ReinforcedConcreteFoundationBeamModel({
    id: "rc-foundation-beam",
    units,
    geometry: {
      start: { x: 0, y: 0 },
      end: { x: 6000, y: 0 },
    },
    section,
    concreteMaterial,
    reinforcementMaterial,
    foundation: {
      contactWidth: 400,
      subgradeModulus: 0.02,
    },
    loads: uplift
      ? [
          {
            id: "uplift",
            actionType: "Qk",
            type: "point",
            position: 3000,
            value: 100000,
          },
        ]
      : [
          {
            id: "g1",
            actionType: "G1",
            type: "uniform",
            value: -10,
          },
        ],
    combinations: uplift
      ? [{ id: "uls-uplift", limitState: "ULS", factors: { uplift: 1 } }]
      : [{ id: "uls", limitState: "ULS", factors: { G1: 1.3 } }],
    discretization: { elementCount: 20 },
    verification: {
      serviceability: false,
      verificationStations: { mode: "all" },
    },
  });
}

void test("RC beam section provider preserves gross and transformed stiffness states", () => {
  const { concreteMaterial, section } = createSection();
  const provider = new ReinforcedConcreteBeamSectionProvider({
    section,
    stiffnessState: "gross",
  });
  const gross = provider.getElasticBeamProperties();
  const transformed = provider.getElasticBeamProperties({
    stiffnessState: "transformed",
  });

  assert.equal(
    gross.axialRigidity,
    concreteMaterial.elasticModulus! * section.concreteSection.area,
  );
  assert.equal(
    gross.flexuralRigidity,
    concreteMaterial.elasticModulus! * section.concreteSection.inertiaY!,
  );
  assert.equal(
    transformed.flexuralRigidity,
    concreteMaterial.elasticModulus! * section.transformedSection.inertiaY!,
  );
  assert.equal(gross.metadata.stiffnessState, "gross");
  assert.equal(transformed.metadata.stiffnessState, "transformed");
  assert.equal(transformed.metadata.cracked, false);
});

void test("RC moment-curvature curve preserves the exact Mcr threshold behavior", () => {
  const { concreteMaterial, reinforcementMaterial, section } = createSection();
  const transformed = section.transformedSection;
  const bounds = section.getBoundingBox();
  const grossCentroid = transformed.centroidY!;
  const grossInertia = transformed.inertiaY!;
  const mcr = (concreteMaterial.fctm! * grossInertia) / (bounds.maxY - grossCentroid);
  const curve = new SectionMomentCurvatureCurve({
    section,
    reinforcementMaterial,
    effectiveModularRatio: 15,
    mcr,
    grossInertia,
    concreteModulus: reinforcementMaterial.elasticModulus! / 15,
    beta: 0.5,
    momentSamples: 20,
    initialMaxMoment: mcr * 2,
  });
  const atThreshold = curve.lookupState(mcr);
  const immediatelyAbove = curve.lookupState(mcr * (1 + 1e-12));

  assert.equal(atThreshold.cracked, false);
  assert.equal(atThreshold.zeta, 0);
  assert.equal(atThreshold.eiSec, curve.grossEI);
  assert.equal(immediatelyAbove.cracked, true);
  assert.ok(immediatelyAbove.zeta > 0);
  assert.ok(immediatelyAbove.zeta < 1e-3);
  assert.ok(immediatelyAbove.eiSec > curve.grossEI * 0.999);

  const SourceCurve = baselineExport<typeof SectionMomentCurvatureCurve>(
    "SectionMomentCurvatureCurve",
  );
  const SourceRectangularSection = baselineExport<typeof RectangularSection>("RectangularSection");
  const SourceConcreteMaterial = baselineExport<typeof createNTC2018ConcreteMaterial>(
    "createNTC2018ConcreteMaterial",
  );
  const SourceSteelMaterial = baselineExport<typeof createNTC2018ReinforcementSteelMaterial>(
    "createNTC2018ReinforcementSteelMaterial",
  );
  const SourceSection = baselineExport<typeof ReinforcedConcreteSection>(
    "ReinforcedConcreteSection",
  );
  const SourceBar = baselineExport<typeof ReinforcementBar>("ReinforcementBar");
  const sourceConcreteMaterial = SourceConcreteMaterial({ strengthClass: "C25/30", units });
  const sourceReinforcementMaterial = SourceSteelMaterial({ grade: "B450C", units });
  const sourceConcreteSection = new SourceRectangularSection({
    width: 400,
    height: 600,
    units,
  });
  const sourceSection = new SourceSection({
    id: "foundation-beam-section",
    concreteSection: sourceConcreteSection,
    concreteMaterial: sourceConcreteMaterial,
    reinforcementMaterial: sourceReinforcementMaterial,
    reinforcementBars: reinforcementCoordinates.map(
      ([y, z], index) =>
        new SourceBar({
          id: `bar-${index + 1}`,
          diameter: 20,
          y,
          z,
          material: sourceReinforcementMaterial,
          units,
        }),
    ),
    units,
  });
  const sourceTransformed = sourceSection.transformedSection;
  const sourceBounds = sourceSection.getBoundingBox();
  const sourceMcr =
    (sourceConcreteMaterial.fctm! * sourceTransformed.inertiaY!) /
    (sourceBounds.maxY - sourceTransformed.centroidY!);
  const sourceCurve = new SourceCurve({
    section: sourceSection,
    reinforcementMaterial: sourceReinforcementMaterial,
    effectiveModularRatio: 15,
    mcr: sourceMcr,
    grossInertia: sourceTransformed.inertiaY!,
    concreteModulus: sourceReinforcementMaterial.elasticModulus! / 15,
    beta: 0.5,
    momentSamples: 20,
    initialMaxMoment: sourceMcr * 2,
  });
  assert.deepEqual(atThreshold, sourceCurve.lookupState(sourceMcr));
  assert.deepEqual(immediatelyAbove, sourceCurve.lookupState(sourceMcr * (1 + 1e-12)));
});

void test("RC foundation-beam application matches the pinned source result", () => {
  const target = new ReinforcedConcreteFoundationBeamApplication().run({
    model: createModel(),
  });
  const JavaScriptApplication = baselineExport<
    new () => { run: (input: { model: unknown }) => { toJSON: () => unknown } }
  >("ReinforcedConcreteFoundationBeamApplication");

  const sourceSection = baselineExport<typeof RectangularSection>("RectangularSection");
  const sourceConcrete = baselineExport<typeof createNTC2018ConcreteMaterial>(
    "createNTC2018ConcreteMaterial",
  );
  const sourceSteel = baselineExport<typeof createNTC2018ReinforcementSteelMaterial>(
    "createNTC2018ReinforcementSteelMaterial",
  );
  const SourceReinforcedConcreteSection = baselineExport<typeof ReinforcedConcreteSection>(
    "ReinforcedConcreteSection",
  );
  const SourceReinforcementBar = baselineExport<typeof ReinforcementBar>("ReinforcementBar");
  const SourceModel = baselineExport<new (options: Record<string, unknown>) => unknown>(
    "ReinforcedConcreteFoundationBeamModel",
  );
  const sourceConcreteMaterial = sourceConcrete({ strengthClass: "C25/30", units });
  const sourceReinforcementMaterial = sourceSteel({ grade: "B450C", units });
  const sourceConcreteSection = new sourceSection({ width: 400, height: 600, units });
  const sourceSectionObject = new SourceReinforcedConcreteSection({
    id: "foundation-beam-section",
    concreteSection: sourceConcreteSection,
    concreteMaterial: sourceConcreteMaterial,
    reinforcementMaterial: sourceReinforcementMaterial,
    reinforcementBars: reinforcementCoordinates.map(
      ([y, z], index) =>
        new SourceReinforcementBar({
          id: `bar-${index + 1}`,
          diameter: 20,
          y,
          z,
          material: sourceReinforcementMaterial,
          units,
        }),
    ),
    units,
  });
  const sourceModel = new SourceModel({
    id: "rc-foundation-beam",
    units,
    geometry: {
      start: { x: 0, y: 0 },
      end: { x: 6000, y: 0 },
    },
    section: sourceSectionObject,
    concreteMaterial: sourceConcreteMaterial,
    reinforcementMaterial: sourceReinforcementMaterial,
    foundation: { contactWidth: 400, subgradeModulus: 0.02 },
    loads: [{ id: "g1", actionType: "G1", type: "uniform", value: -10 }],
    combinations: [{ id: "uls", limitState: "ULS", factors: { G1: 1.3 } }],
    discretization: { elementCount: 20 },
    verification: { serviceability: false, verificationStations: { mode: "all" } },
  });
  const source = new JavaScriptApplication().run({ model: sourceModel });

  assert.deepEqual(target.toJSON(), source.toJSON());
});

void test("RC foundation-beam application preserves the tensile-contact guard", () => {
  const result = new ReinforcedConcreteFoundationBeamApplication().run({
    model: createModel(true),
  });
  const analysis = result.outputs.analysis as {
    combinations: Record<
      string,
      {
        foundation: { contactAssumptionViolated: boolean };
        foundationIteration: { converged: boolean };
      }
    >;
  };
  const combination = analysis.combinations["uls-uplift"];
  assert.ok(combination);

  const expectedCombination: {
    foundation: { contactAssumptionViolated: boolean };
    foundationIteration: { converged: boolean };
  } = combination;

  assert.equal(result.status, "not-supported");
  assert.equal(expectedCombination.foundation.contactAssumptionViolated, false);
  assert.equal(expectedCombination.foundationIteration.converged, false);
});
