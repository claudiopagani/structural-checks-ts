import assert from "node:assert/strict";
import test from "node:test";

import {
  ConcreteParabolaRectangleLaw,
  ConcreteStressBlockLaw,
  ConcreteTriangularRectangleLaw,
  IllinoisRootSolver,
  ReinforcedConcreteSection,
  ReinforcedConcreteSectionApplication,
  ReinforcedConcreteSectionModel,
  ReinforcedConcreteSectionVerification,
  ReinforcementBar,
  RectangularSection,
  SteelElasticPlasticHardeningLaw,
  SteelElasticPerfectlyPlasticLaw,
  createNTC2018ConcreteMaterial,
  createNTC2018ReinforcementSteelMaterial,
} from "../dist/index.js";

const units = { force: "N", length: "mm" } as const;

function approximatelyEqual(actual: number, expected: number, tolerance = 1e-6): void {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} differs from ${expected}`);
}

function createApplicationModel(): ReinforcedConcreteSectionModel {
  const concreteMaterial = createNTC2018ConcreteMaterial({
    strengthClass: "C25/30",
    units,
  });
  const reinforcementMaterial = createNTC2018ReinforcementSteelMaterial({
    grade: "B450C",
    units,
  });
  const section = new ReinforcedConcreteSection({
    name: "RC application fixture",
    concreteSection: new RectangularSection({
      width: 300,
      height: 500,
      units,
    }),
    reinforcementBars: [
      new ReinforcementBar({
        id: "bottom-left",
        diameter: 20,
        grade: "B450C",
        material: reinforcementMaterial,
        y: 40,
        z: 60,
        units,
      }),
      new ReinforcementBar({
        id: "bottom-right",
        diameter: 20,
        grade: "B450C",
        material: reinforcementMaterial,
        y: 40,
        z: 240,
        units,
      }),
      new ReinforcementBar({
        id: "top-left",
        diameter: 20,
        grade: "B450C",
        material: reinforcementMaterial,
        y: 460,
        z: 60,
        units,
      }),
      new ReinforcementBar({
        id: "top-right",
        diameter: 20,
        grade: "B450C",
        material: reinforcementMaterial,
        y: 460,
        z: 240,
        units,
      }),
    ],
    concreteMaterial,
    reinforcementMaterial,
    referenceModularRatio: 15,
    units,
  });

  return new ReinforcedConcreteSectionModel({
    id: "rc-section-01",
    section,
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
    units,
    actions: {
      nEd: -800_000,
      mEd: 150_000_000,
    },
    analysisSettings: {
      compressedEdge: "top",
    },
  });
}

function independentlyIntegrateRectangularFixture(neutralAxisDepth: number): {
  axialForce: number;
  moment: number;
} {
  const widthMm = 300;
  const heightMm = 500;
  const referenceYmm = 250;
  const fcdNPerMm2 = 14.17;
  const ec2 = 0.002;
  const ecu = 0.0035;
  const steelModulusNPerMm2 = 210_000;
  const fydNPerMm2 = 391.3;
  const barAreaMm2 = (Math.PI * 20 ** 2) / 4;
  const barYCoordinatesMm = [40, 40, 460, 460];
  const integrationIntervals = 20_000;
  const intervalHeightMm = heightMm / integrationIntervals;
  const neutralAxisYmm = heightMm - neutralAxisDepth;
  let axialForce = 0;
  let moment = 0;

  for (let index = 0; index < integrationIntervals; index += 1) {
    const yMm = (index + 0.5) * intervalHeightMm;
    const strain = (-ecu * (yMm - neutralAxisYmm)) / neutralAxisDepth;
    const compressionStrain = -strain;
    let stressNPerMm2 = 0;

    if (compressionStrain > 0 && compressionStrain <= ec2) {
      const ratio = compressionStrain / ec2;
      stressNPerMm2 = -fcdNPerMm2 * (2 * ratio - ratio ** 2);
    } else if (compressionStrain > ec2) {
      stressNPerMm2 = -fcdNPerMm2;
    }

    const forceN = stressNPerMm2 * widthMm * intervalHeightMm;
    axialForce += forceN;
    moment -= forceN * (yMm - referenceYmm);
  }

  for (const yMm of barYCoordinatesMm) {
    const strain = (-ecu * (yMm - neutralAxisYmm)) / neutralAxisDepth;
    const stressNPerMm2 = Math.max(-fydNPerMm2, Math.min(fydNPerMm2, steelModulusNPerMm2 * strain));
    const forceN = stressNPerMm2 * barAreaMm2;
    axialForce += forceN;
    moment -= forceN * (yMm - referenceYmm);
  }

  return { axialForce, moment };
}

function solveIndependentNeutralAxis(targetAxialForceN: number): {
  neutralAxisDepth: number;
  axialForce: number;
  moment: number;
} {
  let minimumDepthMm = 0.05;
  let maximumDepthMm = 2_500;

  for (let iteration = 0; iteration < 100; iteration += 1) {
    const candidateDepthMm = (minimumDepthMm + maximumDepthMm) / 2;
    const candidate = independentlyIntegrateRectangularFixture(candidateDepthMm);

    if (candidate.axialForce < targetAxialForceN) {
      maximumDepthMm = candidateDepthMm;
    } else {
      minimumDepthMm = candidateDepthMm;
    }
  }

  const neutralAxisDepth = (minimumDepthMm + maximumDepthMm) / 2;
  return {
    neutralAxisDepth,
    ...independentlyIntegrateRectangularFixture(neutralAxisDepth),
  };
}

void test("ULS uniaxial concrete section resistance matches the pinned numerical oracle", () => {
  const result = new ReinforcedConcreteSectionApplication().run({
    model: createApplicationModel(),
  });

  assert.equal(result.applicationId, "reinforced-concrete-sections");
  assert.equal(result.status, "ok");
  assert.equal(result.outputs.analysisType, "uls-uniaxial-resistance");
  assert.equal(result.outputs.failureMode, "concrete-compression");
  assert.equal(result.outputs.fiberCount, 126);
  assert.equal(result.outputs.neutralAxisDepth, 233.904222);
  assert.equal(result.outputs.MxRd, 225_827_910.755909);
  assert.equal(Math.abs(result.outputs.MyRd as number), 0);
  assert.equal(result.capacity, 225_827_910.755909);
  assert.equal(result.utilizationRatio, 0.664223);
  assert.equal(result.checks.length, 1);
  assert.equal(result.checks[0]?.ok, true);

  const references = result.metadata.normativeReferences;
  assert.ok(Array.isArray(references));
  assert.equal(
    (references[0] as { unitId?: string }).unitId,
    "urn:structural-codes:it:unit:ntc2018:4.1.2.3.4.2",
  );
});

void test("ULS uniaxial resistance preserves the negative bending convention", () => {
  const model = createApplicationModel();
  model.actions.mEd = -150_000_000;
  model.actions.mxEd = -150_000_000;
  model.analysisSettings.compressedEdge = "bottom";
  const result = new ReinforcedConcreteSectionApplication().run({ model });

  assert.equal(result.outputs.mEd, -150_000_000);
  assert.equal(result.outputs.MxRd, -225_827_910.755909);
  assert.equal(Math.sign(result.outputs.MxRd as number), -1);
});

void test("ULS resistance agrees with independent continuous integration within the mesh tolerance", () => {
  const result = new ReinforcedConcreteSectionApplication().run({
    model: createApplicationModel(),
  });
  const independent = solveIndependentNeutralAxis(-800_000);
  const relativeMomentDifference =
    Math.abs((result.capacity as number) - independent.moment) / independent.moment;

  approximatelyEqual(independent.axialForce, -800_000, 1e-6);
  approximatelyEqual(independent.neutralAxisDepth, 232.47125208511324, 1e-9);
  approximatelyEqual(independent.moment, 225_901_455.6072406, 1);
  assert.ok(
    relativeMomentDifference < 0.001,
    `Fiber result differs from independent continuous integration by ${relativeMomentDifference}.`,
  );
});

void test("the section application converts explicit kN-m input to the N-mm kernel", () => {
  const source = createApplicationModel();
  const result = new ReinforcedConcreteSectionApplication().run({
    model: {
      id: "rc-section-json",
      section: source.section,
      materials: source.materials,
      mesh: source.mesh,
      solver: source.solver,
      actions: { nEd: -800, mEd: 150 },
      analysisSettings: source.analysisSettings,
      units: { force: "kN", length: "m" },
    },
    metadata: { source: "serialized-contract" },
  });

  assert.equal(result.outputs.nEd, -800_000);
  assert.equal(result.outputs.mEd, 150_000_000);
  assert.equal(result.metadata.source, "serialized-contract");
});

void test("unmigrated concrete analysis modes are explicit, not placeholders presented as checks", () => {
  const missing = new ReinforcedConcreteSectionVerification().verify({
    id: "missing-section",
  });
  assert.equal(missing.status, "not-analyzed");

  const model = createApplicationModel();
  model.analysisType = "shear";
  const unsupported = new ReinforcedConcreteSectionVerification().verify(model);

  assert.equal(unsupported.status, "not-implemented");
  assert.equal(unsupported.checks.length, 0);
  assert.match(unsupported.warnings.join(" "), /Only uls-uniaxial-resistance/u);
});

void test("ULS concrete and reinforcement constitutive laws preserve source behavior", () => {
  const parabolaRectangle = new ConcreteParabolaRectangleLaw({
    fcd: 14.17,
    ec2: 0.002,
    ecu: 0.0035,
  });
  const triangularRectangle = new ConcreteTriangularRectangleLaw({
    fcd: 14.17,
    ec3: 0.00175,
    ecu: 0.0035,
  });
  const stressBlock = new ConcreteStressBlockLaw({
    fcd: 14.17,
    eta: 0.9,
    ec4: 0,
    ecu: 0.0035,
  });
  const elasticPlastic = new SteelElasticPerfectlyPlasticLaw({
    Es: 210_000,
    fyd: 391.3,
    esu: 0.01,
  });
  const hardening = new SteelElasticPlasticHardeningLaw({
    Es: 210_000,
    fyd: 391.3,
    ftd: 469.6,
    esu: 0.01,
  });

  approximatelyEqual(parabolaRectangle.stress(0.0005), 0);
  approximatelyEqual(parabolaRectangle.stress(-0.0035), -14.17, 1e-9);
  approximatelyEqual(triangularRectangle.stress(-0.000875), -7.085, 1e-9);
  approximatelyEqual(stressBlock.stress(-0.0001), -12.753, 1e-9);
  approximatelyEqual(elasticPlastic.stress(0.01), 391.3);
  approximatelyEqual(hardening.stress(0.01), 469.6, 1e-9);
});

void test("Illinois iteration preserves convergence and optional diagnostic history", () => {
  const solver = new IllinoisRootSolver({
    tolerance: 1e-10,
    maxIterations: 50,
  });
  const withHistory = solver.solve({
    fn: (x) => x ** 2 - 2,
    min: 1,
    max: 2,
  });
  const withoutHistory = solver.solve({
    fn: (x) => x ** 2 - 2,
    min: 1,
    max: 2,
    includeHistory: false,
  });

  assert.equal(withHistory.converged, true);
  approximatelyEqual(withHistory.root, Math.sqrt(2), 1e-8);
  assert.ok(Math.abs(withHistory.residual) <= 1e-10);
  assert.ok(Array.isArray(withHistory.history));
  assert.equal("history" in withoutHistory, false);
});

void test("Illinois never declares convergence from bracket width alone on a steep function", () => {
  // The bracket is already narrower than the x tolerance, but the function is so steep that
  // the first iterates still carry a residual six orders of magnitude above the function
  // tolerance: convergence must be earned on the residual, never on the bracket width.
  const solver = new IllinoisRootSolver({
    tolerance: 1e-6,
    maxIterations: 10,
  });
  const root = 0.5;
  const fn = (x: number): number => 1e12 * (x - root) + 1e18 * (x - root) ** 2;
  const result = solver.solve({
    fn,
    min: root - 5e-7,
    max: root + 5e-7,
    includeHistory: false,
  });
  assert.ok(
    !result.converged || Math.abs(result.residual) <= 1e-6,
    `converged=${result.converged} with residual ${result.residual} above the function tolerance.`,
  );
  if (result.converged) {
    approximatelyEqual(result.root, root, 1e-12);
  }
});

void test("Illinois still converges on a regular well-scaled root", () => {
  const solver = new IllinoisRootSolver({
    tolerance: 1e-9,
    maxIterations: 100,
  });
  const result = solver.solve({
    fn: (x) => x ** 3 - x - 2,
    min: 1,
    max: 2,
    includeHistory: false,
  });
  assert.equal(result.converged, true);
  assert.ok(Math.abs(result.residual) <= 1e-9);
  approximatelyEqual(result.root, 1.5213797068045676, 1e-9);
});

void test("Illinois measures convergence against the target, not against the raw function value", () => {
  const solver = new IllinoisRootSolver({
    tolerance: 1e-6,
    maxIterations: 100,
  });
  // The raw function value at the root is 3, six orders of magnitude above the
  // tolerance: convergence must come from |f(x) - target| alone.
  const result = solver.solve({
    fn: (x) => x + 3,
    min: -1,
    max: 1,
    target: 3,
    includeHistory: false,
  });
  assert.equal(result.converged, true);
  assert.ok(Math.abs(result.root) <= 1e-9);
  assert.ok(Math.abs(result.value - 3) <= 1e-6);
  assert.ok(Math.abs(result.residual) <= 1e-6);
});

void test("Illinois accepts an exact root at a bracket endpoint immediately", () => {
  const solver = new IllinoisRootSolver({
    tolerance: 1e-6,
    maxIterations: 100,
  });
  const result = solver.solve({
    fn: (x) => x ** 2 - 4,
    min: 2,
    max: 5,
    includeHistory: false,
  });
  assert.equal(result.converged, true);
  assert.equal(result.iterations, 0);
  assert.equal(result.root, 2);
  assert.ok(Math.abs(result.residual) <= 1e-6);
});

void test("Illinois rejects a bracket without a sign change", () => {
  const solver = new IllinoisRootSolver();
  assert.throws(
    () =>
      solver.solve({
        fn: (x) => x ** 2 + 1,
        min: 0,
        max: 1,
        includeHistory: false,
      }),
    /change sign/,
  );
});

void test("Illinois rejects non-finite function values", () => {
  const solver = new IllinoisRootSolver();
  assert.throws(
    () =>
      solver.solve({
        fn: () => Number.NaN,
        min: 0,
        max: 1,
        includeHistory: false,
      }),
    /non-finite/,
  );
  assert.throws(
    () =>
      solver.solve({
        fn: (x) => (x === 0 ? 1 : Number.POSITIVE_INFINITY),
        min: 0,
        max: 1,
        includeHistory: false,
      }),
    /non-finite/,
  );
});

void test("Illinois reports converged=false when the residual cannot reach the tolerance", () => {
  const solver = new IllinoisRootSolver({
    tolerance: 1e-12,
    maxIterations: 8,
  });
  // Discontinuous step: the secant lands on the jump, where the residual is
  // permanently 1 no matter how narrow the bracket becomes.
  const result = solver.solve({
    fn: (x) => (x < 0.5 ? -1 : 1),
    min: 0,
    max: 1,
    includeHistory: false,
  });
  assert.equal(result.converged, false);
  assert.equal(result.iterations, 8);
  assert.ok(Math.abs(result.residual) > 1e-12);
});
