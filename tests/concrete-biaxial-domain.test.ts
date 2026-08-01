import assert from "node:assert/strict";
import test from "node:test";

import {
  ConcreteParabolaRectangleLaw,
  RCBiaxialDomainBuilder,
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
import { rayPolygonCapacity } from "structural-checks-ts-migration-workspace/domain/math";

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
    name: "RC biaxial domain fixture",
    concreteSection: new RectangularSection({
      width: 300,
      height: 500,
      units,
    }),
    reinforcementBars: [
      { id: "bottom-left", y: 40, z: 60 },
      { id: "bottom-right", y: 40, z: 240 },
      { id: "top-left", y: 460, z: 60 },
      { id: "top-right", y: 460, z: 240 },
    ].map(
      (bar) =>
        new ReinforcementBar({
          ...bar,
          diameter: 20,
          grade: "B450C",
          material: reinforcementMaterial,
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

function createBiaxialModel({
  nEd = -800_000,
  angleCount = 8,
  targetFiberCount = 120,
  sourceUnits = units,
}: {
  nEd?: number;
  angleCount?: number;
  targetFiberCount?: number;
  sourceUnits?: {
    force: "N" | "kN";
    length: "mm" | "m";
  };
} = {}): ReinforcedConcreteSectionModel {
  const { section, concreteMaterial, reinforcementMaterial } = createFixture();

  return new ReinforcedConcreteSectionModel({
    id: "rc-biaxial-domain-01",
    section,
    analysisType: "uls-biaxial-domain",
    materials: {
      concreteMaterial,
      reinforcementMaterial,
    },
    mesh: {
      targetFiberCount,
    },
    solver: {
      tolerance: 1e-6,
      maxIterations: 100,
    },
    actions: {
      nEd,
    },
    analysisSettings: {
      angleCount,
    },
    units: sourceUnits,
  });
}

function independentlyIntegrateWeakAxis(neutralAxisDepth: number): {
  axialForce: number;
  momentY: number;
} {
  const sectionHeightMm = 500;
  const sectionWidthMm = 300;
  const referenceZmm = 150;
  const fcdNPerMm2 = 14.17;
  const ec2 = 0.002;
  const ecu = 0.0035;
  const steelModulusNPerMm2 = 210_000;
  const fydNPerMm2 = 391.3;
  const barAreaMm2 = (Math.PI * 20 ** 2) / 4;
  const barZCoordinatesMm = [60, 240, 60, 240];
  const integrationIntervals = 20_000;
  const intervalWidthMm = sectionWidthMm / integrationIntervals;
  let axialForce = 0;
  let momentY = 0;

  for (let index = 0; index < integrationIntervals; index += 1) {
    const zMm = (index + 0.5) * intervalWidthMm;
    const strain = (-ecu * (neutralAxisDepth - zMm)) / neutralAxisDepth;
    const compressionStrain = -strain;
    let stressNPerMm2 = 0;

    if (compressionStrain > 0 && compressionStrain <= ec2) {
      const ratio = compressionStrain / ec2;
      stressNPerMm2 = -fcdNPerMm2 * (2 * ratio - ratio ** 2);
    } else if (compressionStrain > ec2) {
      stressNPerMm2 = -fcdNPerMm2;
    }

    const forceN = stressNPerMm2 * sectionHeightMm * intervalWidthMm;
    axialForce += forceN;
    momentY += forceN * (zMm - referenceZmm);
  }

  for (const zMm of barZCoordinatesMm) {
    const strain = (-ecu * (neutralAxisDepth - zMm)) / neutralAxisDepth;
    const stressNPerMm2 = Math.max(-fydNPerMm2, Math.min(fydNPerMm2, steelModulusNPerMm2 * strain));
    const forceN = stressNPerMm2 * barAreaMm2;
    axialForce += forceN;
    momentY += forceN * (zMm - referenceZmm);
  }

  return { axialForce, momentY };
}

function solveIndependentWeakAxis(targetAxialForceN: number): {
  neutralAxisDepth: number;
  axialForce: number;
  momentY: number;
} {
  let minimumDepthMm = 0.05;
  let maximumDepthMm = 1_500;

  for (let iteration = 0; iteration < 100; iteration += 1) {
    const candidateDepthMm = (minimumDepthMm + maximumDepthMm) / 2;
    const candidate = independentlyIntegrateWeakAxis(candidateDepthMm);

    if (candidate.axialForce < targetAxialForceN) {
      maximumDepthMm = candidateDepthMm;
    } else {
      minimumDepthMm = candidateDepthMm;
    }
  }

  const neutralAxisDepth = (minimumDepthMm + maximumDepthMm) / 2;
  return {
    neutralAxisDepth,
    ...independentlyIntegrateWeakAxis(neutralAxisDepth),
  };
}

interface BiaxialOutputPoint {
  theta: number;
  MxRd: number;
  MyRd: number;
  neutralAxisDepth: number;
  axialResidual: number;
  concreteCompressionEdge: {
    strain: number;
    y: number;
    z: number;
  } | null;
  converged: boolean;
}

void test("ULS biaxial N-Mx-My points match the fixed numerical oracle", () => {
  const result = new ReinforcedConcreteSectionApplication().run({
    model: createBiaxialModel(),
  });
  const points = result.outputs.points as BiaxialOutputPoint[];

  assert.equal(result.status, "ok");
  assert.equal(result.outputs.nEd, -800_000);
  assert.equal(result.outputs.angleCount, 8);
  assert.equal(result.outputs.fiberCount, 126);
  assert.deepEqual(
    points.map((point) => point.theta),
    [
      0, 0.785398163397, 1.570796326795, 2.356194490192, 3.14159265359, 3.926990816987,
      4.712388980385, 5.497787143782,
    ],
  );
  assert.deepEqual(
    points.map((point) => point.MxRd),
    [
      225_827_910.755909, 182_023_014.10983, -0, -182_023_014.109829, -225_827_910.755909,
      -182_023_014.10983, 0, 182_023_014.10983,
    ],
  );
  assert.deepEqual(
    points.map((point) => point.MyRd),
    [
      -0, 41_099_910.932375, 117_438_966.74679, 41_099_910.932375, -0, -41_099_910.932375,
      -117_438_966.74679, -41_099_910.932375,
    ],
  );
  assert.ok(points.every((point) => point.converged));
  assert.ok(points.every((point) => Math.abs(point.axialResidual) < 1e-6));
  assert.equal(points[2]?.concreteCompressionEdge?.z, 0);
  assert.equal(points[6]?.concreteCompressionEdge?.z, 300);

  const references = result.metadata.normativeReferences;
  assert.ok(Array.isArray(references));
  assert.equal(
    (references[0] as { unitId?: string }).unitId,
    "urn:structural-codes:it:unit:ntc2018:4.1.2.3.4.2",
  );
});

void test("a sampled biaxial domain classifies radial demand points by utilization", () => {
  const result = new ReinforcedConcreteSectionApplication().run({
    model: createBiaxialModel(),
  });
  const domain = (result.outputs.points as BiaxialOutputPoint[]).map(({ MxRd, MyRd }) => ({
    x: MxRd,
    y: MyRd,
  }));
  const boundaryPoint = domain[1];
  assert.notEqual(boundaryPoint, undefined);

  const inside = rayPolygonCapacity(
    domain,
    (boundaryPoint as { x: number }).x * 0.8,
    (boundaryPoint as { y: number }).y * 0.8,
  );
  const outside = rayPolygonCapacity(
    domain,
    (boundaryPoint as { x: number }).x * 1.2,
    (boundaryPoint as { y: number }).y * 1.2,
  );

  assert.ok(Math.abs(inside.utilizationRatio - 0.8) < 1e-12);
  assert.equal(inside.utilizationRatio <= 1, true);
  assert.ok(Math.abs(outside.utilizationRatio - 1.2) < 1e-12);
  assert.equal(outside.utilizationRatio <= 1, false);
});

void test("the refined weak-axis point agrees with independent continuous integration", () => {
  const result = new ReinforcedConcreteSectionApplication().run({
    model: createBiaxialModel({
      angleCount: 4,
      targetFiberCount: 1_000,
    }),
  });
  const weakAxisPoint = (result.outputs.points as BiaxialOutputPoint[])[1];
  const independent = solveIndependentWeakAxis(-800_000);
  const relativeDifference =
    Math.abs((weakAxisPoint?.MyRd ?? Number.NaN) - independent.momentY) / independent.momentY;

  assert.equal(result.outputs.fiberCount, 984);
  assert.equal(weakAxisPoint?.MyRd, 117_775_476.843262);
  assert.ok(Math.abs(independent.axialForce + 800_000) < 1e-6);
  assert.ok(Math.abs(independent.neutralAxisDepth - 139.48275125107978) < 1e-9);
  assert.ok(Math.abs(independent.momentY - 117_838_878.40731114) < 1);
  assert.ok(relativeDifference < 0.001);
});

void test("the public builder preserves orientation and compressed-side controls", () => {
  const { section, concreteMaterial, reinforcementMaterial } = createFixture();
  const concreteFibers = new SectionFiberDiscretizer().discretize(section, {
    targetCount: 120,
  }).fibers;
  const builder = new RCBiaxialDomainBuilder();
  const domain = builder.buildAtAxialLoad({
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
    nEd: -800_000,
    angleCount: 4,
    compressedSide: "negative",
  });

  assert.equal(domain.compressedSide, "negative");
  assert.deepEqual(
    domain.points.map((point) => point.theta),
    [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2],
  );
  assert.ok(domain.points[0]!.MxRd < 0);
  assert.ok(domain.points[1]!.MyRd < 0);
  assert.throws(
    () =>
      builder.buildAtAxialLoad({
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
        nEd: -800_000,
        angleCount: 3,
      }),
    /integer >= 4/u,
  );
});

void test("biaxial-domain axial force preserves explicit unit conversion", () => {
  const result = new ReinforcedConcreteSectionApplication().run({
    model: createBiaxialModel({
      nEd: -800,
      angleCount: 4,
      sourceUnits: { force: "kN", length: "m" },
    }),
  });

  assert.equal(result.outputs.nEd, -800_000);
  assert.equal((result.outputs.points as BiaxialOutputPoint[])[1]?.MyRd, 117_438_966.74679);
});

void test("the biaxial workflow rejects a missing assigned axial force", () => {
  const model = createBiaxialModel();
  model.actions = {};

  assert.throws(
    () => new ReinforcedConcreteSectionApplication().run({ model }),
    /finite actions\.nEd for uls-biaxial-domain/u,
  );
});
