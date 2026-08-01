import assert from "node:assert/strict";
import test from "node:test";

import {
  ConcreteParabolaRectangleLaw,
  RCUniaxialDomainBuilder,
  ReinforcedConcreteSection,
  ReinforcedConcreteSectionApplication,
  ReinforcedConcreteSectionModel,
  ReinforcementBar,
  RectangularSection,
  SectionFiberDiscretizer,
  SteelElasticPerfectlyPlasticLaw,
  createNTC2018ConcreteMaterial,
  createNTC2018ReinforcementSteelMaterial,
} from "../dist/index.js";

const units = { force: "N", length: "mm" } as const;

function createFixture(): {
  section: ReinforcedConcreteSection;
  concreteMaterial: ReturnType<typeof createNTC2018ConcreteMaterial>;
  reinforcementMaterial: ReturnType<typeof createNTC2018ReinforcementSteelMaterial>;
} {
  const concreteMaterial = createNTC2018ConcreteMaterial({
    strengthClass: "C25/30",
    units,
  });
  const reinforcementMaterial = createNTC2018ReinforcementSteelMaterial({
    grade: "B450C",
    units,
  });
  const section = new ReinforcedConcreteSection({
    name: "RC uniaxial domain fixture",
    concreteSection: new RectangularSection({
      width: 300,
      height: 500,
      units,
    }),
    reinforcementBars: [
      ["bottom-left", 40, 60],
      ["bottom-right", 40, 240],
      ["top-left", 460, 60],
      ["top-right", 460, 240],
    ].map(
      ([id, y, z]) =>
        new ReinforcementBar({
          id: id as string,
          diameter: 20,
          grade: "B450C",
          material: reinforcementMaterial,
          y: y as number,
          z: z as number,
          units,
        }),
    ),
    concreteMaterial,
    reinforcementMaterial,
    referenceModularRatio: 15,
    units,
  });

  return { section, concreteMaterial, reinforcementMaterial };
}

function createDomainModel({
  actions = {},
  analysisSettings = {},
  sourceUnits = units,
}: {
  actions?: { nValues?: number[] };
  analysisSettings?: {
    pointCount?: number;
    includeOppositeCurvature?: boolean;
  };
  sourceUnits?: {
    force: "N" | "kN";
    length: "mm" | "m";
  };
} = {}): ReinforcedConcreteSectionModel {
  const { section, concreteMaterial, reinforcementMaterial } = createFixture();

  return new ReinforcedConcreteSectionModel({
    id: "rc-uniaxial-domain-01",
    section,
    analysisType: "uls-uniaxial-domain",
    materials: {
      concreteMaterial,
      reinforcementMaterial,
    },
    mesh: {
      targetFiberCount: 120,
    },
    solver: {
      tolerance: 1e-6,
      maxIterations: 100,
    },
    actions,
    units: sourceUnits,
    analysisSettings,
  });
}

void test("assigned ULS uniaxial M-N points match the fixed numerical oracle", () => {
  const result = new ReinforcedConcreteSectionApplication().run({
    model: createDomainModel({
      actions: {
        nValues: [-1_200_000, -800_000, -400_000, -100_000],
      },
    }),
  });
  const points = result.outputs.points as {
    nEd: number;
    compressedEdge: "top" | "bottom";
    MxRd: number;
    axialResidual: number;
    converged: boolean;
  }[];
  const topMoments = points
    .filter((point) => point.compressedEdge === "top")
    .map((point) => point.MxRd);
  const bottomMoments = points
    .filter((point) => point.compressedEdge === "bottom")
    .map((point) => point.MxRd);

  assert.equal(result.status, "ok");
  assert.deepEqual(result.outputs.nValues, [-1_200_000, -800_000, -400_000, -100_000]);
  assert.deepEqual(
    topMoments,
    [217_623_782.760315, 225_827_910.755909, 183_793_880.774593, 127_010_500.058649],
  );
  assert.deepEqual(
    bottomMoments,
    topMoments.map((moment) => -moment),
  );
  assert.ok(points.every((point) => point.converged));
  assert.ok(points.every((point) => Math.abs(point.axialResidual) < 1e-6));

  const independentContinuousMoment = 225_901_455.6072406;
  const assignedPoint = points.find(
    (point) => point.nEd === -800_000 && point.compressedEdge === "top",
  );
  const relativeDifference =
    Math.abs((assignedPoint?.MxRd ?? Number.NaN) - independentContinuousMoment) /
    independentContinuousMoment;
  assert.ok(relativeDifference < 0.001);
});

void test("automatic domain sampling preserves the documented axial cap and spacing", () => {
  const result = new ReinforcedConcreteSectionApplication().run({
    model: createDomainModel({
      analysisSettings: {
        pointCount: 21,
      },
    }),
  });
  const axialCapacity = result.outputs.axialCapacity as {
    maximumTension: number;
    maximumCompression: number;
  };
  const nValues = result.outputs.nValues as number[];
  const points = result.outputs.points as { converged: boolean }[];
  const expectedTension = 1_256.6370614359173 * 391.3;
  const expectedCompression = -(0.8 * 150_000 * 14.17 + expectedTension);
  const expectedStep = (expectedTension - expectedCompression) / 20;

  assert.equal(nValues.length, 21);
  assert.equal(points.length, 42);
  assert.deepEqual(result.outputs.compressedEdges, ["top", "bottom"]);
  assert.equal(axialCapacity.maximumTension, 491_722.08214);
  assert.equal(axialCapacity.maximumCompression, -2_192_122.08214);
  assert.ok(Math.abs(expectedTension - axialCapacity.maximumTension) < 1e-6);
  assert.ok(Math.abs(expectedCompression - axialCapacity.maximumCompression) < 1e-6);
  assert.ok(Math.abs((nValues[1] as number) - nValues[0]! - expectedStep) < 1e-6);
  assert.ok(points.every((point) => point.converged));
});

void test("the public domain builder can limit sampling to one curvature sign", () => {
  const { section, concreteMaterial, reinforcementMaterial } = createFixture();
  const concreteFibers = new SectionFiberDiscretizer().discretize(section, {
    targetCount: 120,
  }).fibers;
  const domain = new RCUniaxialDomainBuilder().build({
    section,
    concreteFibers,
    concreteLaw: new ConcreteParabolaRectangleLaw({
      fcd: concreteMaterial.fcd as number,
      ec2: 0.002,
      ecu: 0.0035,
    }),
    steelLaw: new SteelElasticPerfectlyPlasticLaw({
      Es: reinforcementMaterial.elasticModulus as number,
      fyd: reinforcementMaterial.fyd as number,
      esu: 0.01,
    }),
    nValues: [-800_000, -400_000],
    compressedEdge: "bottom",
    includeOppositeCurvature: false,
  });

  assert.deepEqual(domain.compressedEdges, ["bottom"]);
  assert.equal(domain.points.length, 2);
  assert.ok(domain.points.every((point) => point.MxRd < 0));
});

void test("the application manifest advertises the migrated concrete section modes", () => {
  const manifest = new ReinforcedConcreteSectionApplication().getManifest();

  assert.deepEqual(manifest.supportedCodes, ["NTC2018"]);
  assert.ok(manifest.tags.includes("interaction-domain"));
  assert.equal(manifest.metadata.maturity, "partial");
  assert.deepEqual(manifest.metadata.implementedAnalysisTypes, [
    "uls-uniaxial-resistance",
    "uls-uniaxial-domain",
    "uls-biaxial-domain",
    "service-stress",
    "moment-curvature",
  ]);
});

void test("uniaxial domain axial levels preserve explicit force-unit conversion", () => {
  const result = new ReinforcedConcreteSectionApplication().run({
    model: createDomainModel({
      actions: {
        nValues: [-1_200, -800, -400, -100],
      },
      sourceUnits: { force: "kN", length: "m" },
    }),
  });

  assert.deepEqual(result.outputs.nValues, [-1_200_000, -800_000, -400_000, -100_000]);
});
