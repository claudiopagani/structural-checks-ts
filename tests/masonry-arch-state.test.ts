import assert from "node:assert/strict";
import test from "node:test";

import {
  analyzeMasonryArchEquilibrium,
  analyzeMasonryArchLimit,
  createMasonryArch,
  evaluateMasonryArchCurveAtStation,
  type MasonryInterfaceLawInput,
} from "structural-checks-ts-migration-workspace/applications/masonry-arches";

const rigid: MasonryInterfaceLawInput = {
  response: "rigid-plastic",
  normal: { type: "no-tension" },
  tangential: { type: "frictionless" },
};

function close(actual: number, expected: number, tolerance = 1e-9): void {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} is not close to ${expected}.`);
}

function geometry(voussoirCount = 20, thickness = 1) {
  return {
    kind: "simplified-symmetric" as const,
    referenceCurve: "centerline" as const,
    profile: { type: "circular" as const },
    span: 10,
    rise: 5,
    thickness,
    outOfPlaneWidth: 1,
    voussoirCount,
  };
}

function loadModel(interfaceLaw: MasonryInterfaceLawInput = rigid) {
  return createMasonryArch({
    id: "rigid-arch",
    units: { force: "kN", length: "m" },
    geometry: geometry(40),
    masonry: { unitWeight: 20 },
    interfaceLaw,
    loads: [
      { id: "SW", type: "self-weight", loadCaseId: "G1" },
      {
        id: "G2",
        type: "uniform",
        loadCaseId: "G2",
        components: { x: 0, y: -1 },
      },
      {
        id: "Q",
        type: "patch",
        loadCaseId: "Q1",
        components: { x: 0, y: -10 },
        startStation: 0.05,
        endStation: 0.45,
      },
    ],
  });
}

void test("circular geometry honors its reference curve and contains no analysis semantics", () => {
  const model = createMasonryArch({
    id: "geometry",
    units: { force: "kN", length: "m" },
    geometry: geometry(),
    interfaceLaw: rigid,
  });
  const crown = evaluateMasonryArchCurveAtStation(
    model.geometry,
    model.geometry.totalReferenceArcLength / 2,
  );
  close(crown.centerline.x, 0, 2e-12);
  close(crown.centerline.y, 5, 2e-12);
  assert.equal("scalableLoadCaseIds" in model, false);
});

void test("assigned rigid-plastic equilibrium has neither a fake deformation nor a mechanism", () => {
  const result = analyzeMasonryArchEquilibrium(loadModel(), {
    loadFactorsByCaseId: { G1: 1, G2: 1, Q1: 0.2 },
  });
  assert.equal(result.outputs.analysis.numericalStrategy.type, "representative-static-equilibrium");
  assert.equal(result.outputs.analysis.lambda.active, false);
  assert.equal("deformedConfiguration" in result.outputs, false);
  assert.equal("collapseMechanism" in result.outputs, false);
  assert.ok(result.outputs.equilibrium.normalizedResidual.forceX < 1e-10);
});

void test("lambda partition is local to each limit analysis and supports all required patterns", () => {
  const model = loadModel();
  const gPlusLambdaQ = analyzeMasonryArchLimit(model, { scalableLoadCaseIds: ["Q1"] });
  assert.deepEqual(gPlusLambdaQ.outputs.analysis.lambda.fixedLoadCaseIds, ["G1", "G2"]);
  assert.deepEqual(gPlusLambdaQ.outputs.analysis.lambda.scalableLoadCaseIds, ["Q1"]);

  const lambdaAll = analyzeMasonryArchLimit(model, {
    scalableLoadCaseIds: ["G1", "G2", "Q1"],
  });
  assert.deepEqual(lambdaAll.outputs.analysis.lambda.fixedLoadCaseIds, []);
  assert.deepEqual(lambdaAll.outputs.analysis.lambda.scalableLoadCaseIds, ["G1", "G2", "Q1"]);

  const g1PlusLambdaRest = analyzeMasonryArchLimit(model, {
    scalableLoadCaseIds: ["G2", "Q1"],
  });
  assert.deepEqual(g1PlusLambdaRest.outputs.analysis.lambda.fixedLoadCaseIds, ["G1"]);
  assert.deepEqual(g1PlusLambdaRest.outputs.analysis.lambda.scalableLoadCaseIds, ["G2", "Q1"]);
  assert.equal(
    g1PlusLambdaRest.outputs.analysis.lambda.expression,
    "F(lambda) = F_fixed + lambda * F_scalable",
  );
  assert.equal(
    g1PlusLambdaRest.outputs.analysis.lambda.combinationFactorsAppliedBeforePartition,
    true,
  );
  assert.ok(
    g1PlusLambdaRest.outputs.analysis.lambda.excludedQuantities.includes("initial-tendon-force"),
  );
});

void test("rigid limit analysis reports distinct capacity landmarks and a normalized mechanism", () => {
  const result = analyzeMasonryArchLimit(loadModel(), { scalableLoadCaseIds: ["Q1"] });
  assert.equal(result.outputs.capacity.lambdaFirstLimit, result.outputs.capacity.lambdaPeak);
  assert.equal(result.outputs.capacity.lambdaPeak, result.outputs.capacity.lambdaTermination);
  assert.equal(result.outputs.capacity.lambdaCollapse, result.outputs.capacity.lambdaPeak);
  assert.ok(result.outputs.capacity.lambdaPeak! > 0);
  assert.equal(result.outputs.collapseMechanism?.kinematicallyVerified, true);
  assert.ok(result.outputs.collapseMechanism.maximumConstraintResidual < 1e-10);
  assert.equal("deformedConfiguration" in result.outputs, false);
});

void test("finite compression may identify a critical zone without inventing kinematics", () => {
  const finiteCompression: MasonryInterfaceLawInput = {
    ...rigid,
    normal: {
      type: "no-tension",
      compressiveStrength: 500,
      compressionFacetCount: 24,
    },
  };
  const result = analyzeMasonryArchLimit(loadModel(finiteCompression), {
    scalableLoadCaseIds: ["Q1"],
  });
  assert.equal(result.outputs.failureMode, "masonry-crushing");
  assert.ok(result.outputs.crushingInterfaces.length > 0);
  assert.equal(result.outputs.collapseMechanism, null);
  assert.equal(result.outputs.capacity.lambdaCollapse, null);
  for (const item of result.outputs.interfaces.filter((value) => value.maxCompression !== null)) {
    assert.ok(item.compressionAtIntrados !== null);
    assert.ok(item.compressionAtExtrados !== null);
    assert.equal(
      Math.max(item.compressionAtIntrados, item.compressionAtExtrados),
      item.maxCompression,
    );
  }
});

void test("a proportional uniform load reports a model boundary, not a numerical failure", () => {
  const uniform = createMasonryArch({
    id: "uniform-unbounded",
    units: { force: "kN", length: "m" },
    geometry: geometry(20),
    masonry: { unitWeight: 20 },
    interfaceLaw: rigid,
    loads: [
      { id: "SW", type: "self-weight", loadCaseId: "G" },
      {
        id: "Q",
        type: "uniform",
        loadCaseId: "Q",
        components: { x: 0, y: -1 },
        distributionBasis: "horizontal-projection",
      },
    ],
  });
  const result = analyzeMasonryArchLimit(uniform, { scalableLoadCaseIds: ["Q"] });
  assert.equal(result.outputs.convergenceInfo.status, "unbounded");
  assert.equal(result.outputs.analysisOutcome.terminationCategory, "model-boundary");
  assert.equal(result.outputs.analysisOutcome.objectiveStatus, "not-reached");
  assert.equal(result.outputs.failureMode, "no-collapse-within-model");
});

void test("Coulomb sliding is distinguished from a rocking mechanism", () => {
  const coulomb: MasonryInterfaceLawInput = {
    ...rigid,
    tangential: { type: "coulomb", frictionCoefficient: 0.45 },
  };
  const result = analyzeMasonryArchLimit(loadModel(coulomb), { scalableLoadCaseIds: ["Q1"] });
  assert.ok(result.outputs.slidingInterfaces.length > 0);
  assert.ok(result.outputs.failureMode === "sliding" || result.outputs.failureMode === "mixed");
  assert.equal(result.outputs.collapseMechanism?.nonAssociatedFlow?.verified, true);
});
