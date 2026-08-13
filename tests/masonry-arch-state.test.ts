import assert from "node:assert/strict";
import test from "node:test";

import {
  analyzeMasonryArchCollapse,
  analyzeMasonryArchState,
  createMasonryArch,
  evaluateMasonryArchCurveAtStation,
  resolveMasonryArchLoads,
} from "structural-checks-ts-migration-workspace/applications/masonry-arches";
import {
  LoadCase,
  createNTC2018PermanentAction,
  createNTC2018ULSFundamentalCombination,
  createNTC2018VariableAction,
} from "structural-checks-ts-migration-workspace";

function close(actual: number, expected: number, tolerance = 1e-9): void {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `Expected ${actual} to be within ${tolerance} of ${expected}.`,
  );
}

function circularGeometry(voussoirCount: number, thickness = 2) {
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

function collapseModel(voussoirCount: number, thickness = 1) {
  return createMasonryArch({
    id: `collapse-${voussoirCount}-${thickness}`,
    units: { force: "kN", length: "m" },
    geometry: circularGeometry(voussoirCount, thickness),
    masonry: { unitWeight: 20 },
    loads: [
      { id: "SW", type: "self-weight", loadCaseId: "G1" },
      {
        id: "Q-patch",
        type: "patch",
        loadCaseId: "Q",
        components: { x: 0, y: -10 },
        startStation: 0.05,
        endStation: 0.45,
      },
    ],
  });
}

void test("simplified circular and elliptical geometry honors the selected reference curve", () => {
  const circular = createMasonryArch({
    id: "circular",
    units: { force: "kN", length: "m" },
    geometry: circularGeometry(20),
  });
  assert.equal(circular.geometry.profile.type, "circular");
  close(circular.geometry.profile.springingAngle, Math.PI / 2, 1e-12);
  close(circular.geometry.totalReferenceArcLength, 5 * Math.PI, 1e-12);

  for (const referenceCurve of ["intrados", "centerline", "extrados"] as const) {
    const model = createMasonryArch({
      id: `ellipse-${referenceCurve}`,
      units: { force: "kN", length: "m" },
      geometry: {
        kind: "simplified-symmetric",
        referenceCurve,
        profile: { type: "elliptical", springingAngle: 50, angleUnits: "deg" },
        span: 10,
        rise: 2,
        thickness: 0.8,
        outOfPlaneWidth: 1,
        voussoirCount: 20,
      },
    });
    const left = evaluateMasonryArchCurveAtStation(model.geometry, 0);
    const crown = evaluateMasonryArchCurveAtStation(
      model.geometry,
      model.geometry.totalReferenceArcLength / 2,
    );
    close(left[referenceCurve].x, -5, 2e-12);
    close(left[referenceCurve].y, 0, 2e-12);
    close(crown[referenceCurve].x, 0, 2e-12);
    close(crown[referenceCurve].y, 2, 2e-12);
    close(Math.atan2(left.chainTangent.y, left.chainTangent.x), (50 * Math.PI) / 180, 2e-12);
  }
});

void test("equal-arc-length discretization allows even counts and enforces an odd custom keystone", () => {
  const even = createMasonryArch({
    id: "even-no-keystone",
    units: { force: "kN", length: "m" },
    geometry: circularGeometry(20),
  });
  const ordinaryLength = even.geometry.totalReferenceArcLength / 20;
  for (const block of even.geometry.voussoirs) {
    close(block.referenceArcLength, ordinaryLength, 2e-12);
    assert.equal(block.isKeystone, false);
  }

  const withKeystone = createMasonryArch({
    id: "odd-with-keystone",
    units: { force: "kN", length: "m" },
    geometry: { ...circularGeometry(21), keystone: { arcLength: 0.5 } },
  });
  assert.deepEqual(withKeystone.geometry.keystone, {
    present: true,
    arcLength: 0.5,
    voussoirId: "V-010",
  });
  close(withKeystone.geometry.voussoirs[10]!.referenceArcLength, 0.5, 2e-12);
  const remainingLength = (withKeystone.geometry.totalReferenceArcLength - 0.5) / 20;
  for (const block of withKeystone.geometry.voussoirs.filter((item) => !item.isKeystone)) {
    close(block.referenceArcLength, remainingLength, 2e-12);
  }

  assert.throws(
    () =>
      createMasonryArch({
        id: "invalid-even-keystone",
        units: { force: "kN", length: "m" },
        geometry: { ...circularGeometry(20), keystone: { arcLength: 0.5 } },
      }),
    /custom keystone requires an odd voussoirCount/i,
  );
});

void test("circular polygon area converges monotonically with equal arc-length refinement", () => {
  const exactArea = 5 * Math.PI;
  const errors = [20, 40, 80, 160].map((voussoirCount) => {
    const model = createMasonryArch({
      id: `area-${voussoirCount}`,
      units: { force: "kN", length: "m" },
      geometry: circularGeometry(voussoirCount, 1),
    });
    return Math.abs(model.geometry.approximation.polygonArea - exactArea);
  });
  for (let index = 1; index < errors.length; index += 1) {
    assert.ok(errors[index]! < errors[index - 1]! / 3.9);
  }
  assert.ok(errors.at(-1)! < 0.0011);
});

void test("distributed-load basis distinguishes horizontal projection from curved arc length", () => {
  const horizontalModel = createMasonryArch({
    id: "horizontal-load",
    units: { force: "kN", length: "m" },
    geometry: circularGeometry(40),
    loads: [
      {
        id: "Q-horizontal",
        type: "uniform",
        loadCaseId: "Q",
        components: { x: 0, y: -10 },
      },
    ],
  });
  const arcModel = createMasonryArch({
    id: "arc-load",
    units: { force: "kN", length: "m" },
    geometry: circularGeometry(40),
    loads: [
      {
        id: "Q-arc",
        type: "uniform",
        loadCaseId: "Q",
        components: { x: 0, y: -10 },
        distributionBasis: "arc-length",
      },
    ],
  });
  const extradosProjectionModel = createMasonryArch({
    id: "extrados-projection-load",
    units: { force: "kN", length: "m" },
    geometry: circularGeometry(40),
    loads: [
      {
        id: "Q-extrados-projection",
        type: "uniform",
        loadCaseId: "Q",
        components: { x: 0, y: -10 },
        distributionCurve: "extrados",
      },
    ],
  });
  const horizontal = resolveMasonryArchLoads(horizontalModel).appliedLoads[0]!;
  const arc = resolveMasonryArchLoads(arcModel).appliedLoads[0]!;
  const extradosProjection = resolveMasonryArchLoads(extradosProjectionModel).appliedLoads[0]!;
  close(horizontal.resultantForce.y, -100, 1e-9);
  close(arc.resultantForce.y, -10 * arcModel.geometry.totalReferenceArcLength, 1e-9);
  close(extradosProjection.resultantForce.y, -120, 1e-9);
});

void test("fill load is integrated through horizontal vertical strips", () => {
  const model = createMasonryArch({
    id: "fill",
    units: { force: "kN", length: "m" },
    geometry: {
      ...circularGeometry(80, 1),
      referenceCurve: "extrados",
    },
    loads: [
      {
        id: "G2-fill",
        type: "fill",
        loadCaseId: "G2",
        unitWeight: 20,
        crownCoverDepth: 0,
      },
    ],
  });
  const fill = resolveMasonryArchLoads(model).appliedLoads[0]!;
  const expected = -20 * 25 * (2 - Math.PI / 2);
  close(fill.resultantForce.x, 0, 1e-12);
  close(fill.resultantForce.y, expected, 2e-8);
  close(fill.resultantMomentAboutOrigin, 0, 2e-8);
});

void test("patch and point loads preserve their resultant force and moment", () => {
  const patchModel = createMasonryArch({
    id: "patch",
    units: { force: "kN", length: "m" },
    geometry: circularGeometry(40),
    loads: [
      {
        id: "Q-patch",
        type: "patch",
        loadCaseId: "Q",
        components: { x: 0, y: -10 },
        startStation: 0.25,
        endStation: 0.75,
      },
    ],
  });
  const patch = resolveMasonryArchLoads(patchModel).appliedLoads[0]!;
  close(patch.resultantForce.y, -100 / Math.sqrt(2), 2e-9);
  close(patch.resultantMomentAboutOrigin, 0, 2e-9);

  const ambiguousPointModel = createMasonryArch({
    id: "ambiguous-point",
    units: { force: "kN", length: "m" },
    geometry: circularGeometry(20),
    loads: [
      {
        id: "P",
        type: "point",
        loadCaseId: "Q",
        station: 0.5,
        force: { x: 5, y: -20 },
        moment: 3,
      },
    ],
  });
  assert.throws(
    () => resolveMasonryArchLoads(ambiguousPointModel),
    /targetVoussoirId is required/i,
  );

  const pointModel = createMasonryArch({
    id: "targeted-point",
    units: { force: "kN", length: "m" },
    geometry: circularGeometry(20),
    loads: [
      {
        id: "P",
        type: "point",
        loadCaseId: "Q",
        station: 0.5,
        targetVoussoirId: "V-009",
        force: { x: 5, y: -20 },
        moment: 3,
      },
    ],
  });
  const point = resolveMasonryArchLoads(pointModel).appliedLoads[0]!;
  assert.deepEqual(point.resultantForce, { x: 5, y: -20 });
  close(point.resultantMomentAboutOrigin, -27, 1e-12);
});

void test("arch loads consume the existing NTC load combination factors", () => {
  const permanentAction = createNTC2018PermanentAction({ id: "G1-action", permanentClass: "G1" });
  const variableAction = createNTC2018VariableAction({ id: "Q-action", category: "A" });
  const permanentCase = new LoadCase({ id: "G1", action: permanentAction });
  const variableCase = new LoadCase({ id: "Q", action: variableAction });
  const combination = createNTC2018ULSFundamentalCombination({
    id: "ULS",
    permanentActions: [permanentAction],
    variableActions: [variableAction],
    leadingVariableAction: variableAction,
  });
  assert.equal(permanentAction.loadCase, permanentCase);
  assert.equal(variableAction.loadCase, variableCase);

  const model = createMasonryArch({
    id: "combined",
    units: { force: "kN", length: "m" },
    geometry: circularGeometry(20),
    masonry: { unitWeight: 20 },
    loads: [
      { id: "SW", type: "self-weight", loadCase: permanentCase },
      {
        id: "Q-uniform",
        type: "uniform",
        loadCase: variableCase,
        components: { x: 0, y: -10 },
      },
    ],
  });
  const resolved = resolveMasonryArchLoads(model, { loadCombination: combination });
  close(resolved.loadFactorsByCaseId.G1!, 1.3, 1e-12);
  close(resolved.loadFactorsByCaseId.Q!, 1.5, 1e-12);
  close(resolved.appliedLoads[1]!.resultantForce.y, -150, 1e-9);
});

void test("symmetric self-weight state has symmetric reactions and thrust line with exact equilibrium", () => {
  const model = createMasonryArch({
    id: "symmetric-state",
    units: { force: "kN", length: "m" },
    geometry: circularGeometry(40),
    masonry: { unitWeight: 20 },
    loads: [{ id: "SW", type: "self-weight", loadCaseId: "G1" }],
  });
  const result = analyzeMasonryArchState(model);
  assert.equal(result.status, "ok");
  assert.equal(result.outputs.equilibrium.feasible, true);
  close(result.outputs.reactions.left.force.x, -result.outputs.reactions.right.force.x, 1e-9);
  close(result.outputs.reactions.left.force.y, result.outputs.reactions.right.force.y, 1e-9);
  close(result.outputs.reactions.left.moment, -result.outputs.reactions.right.moment, 1e-9);

  const thrustLine = result.outputs.thrustLine;
  for (let index = 0; index < thrustLine.length; index += 1) {
    const left = thrustLine[index];
    const right = thrustLine[thrustLine.length - 1 - index];
    assert.notEqual(left, null);
    assert.notEqual(right, null);
    close(left!.x, -right!.x, 2e-9);
    close(left!.y, right!.y, 2e-9);
  }
  for (const item of result.outputs.interfaces) {
    assert.ok(item.normalForce > 0);
    assert.ok(Math.abs(item.normalizedEccentricity!) <= 1 + 1e-9);
  }
  assert.ok(Math.abs(result.outputs.equilibrium.normalizedResidual.forceX) < 1e-12);
  assert.ok(Math.abs(result.outputs.equilibrium.normalizedResidual.forceY) < 1e-12);
  assert.ok(Math.abs(result.outputs.equilibrium.normalizedResidual.moment) < 1e-12);
});

void test("a geometrically insufficient arch reports Heyman infeasibility without hiding residuals", () => {
  const result = analyzeMasonryArchState(
    createMasonryArch({
      id: "thin-infeasible",
      units: { force: "kN", length: "m" },
      geometry: circularGeometry(40, 0.2),
      masonry: { unitWeight: 20 },
      loads: [{ id: "SW", type: "self-weight", loadCaseId: "G1" }],
    }),
  );
  assert.equal(result.status, "failed");
  assert.equal(result.outputs.equilibrium.feasible, false);
  assert.ok(result.outputs.equilibrium.representativeMargin < 0);
  assert.ok(
    result.outputs.interfaces.some((item) => item.state === "outside-admissible-thickness"),
  );
  assert.ok(Math.abs(result.outputs.equilibrium.normalizedResidual.forceX) < 1e-12);
  assert.ok(Math.abs(result.outputs.equilibrium.normalizedResidual.forceY) < 1e-12);
  assert.ok(Math.abs(result.outputs.equilibrium.normalizedResidual.moment) < 1e-12);
  assert.ok(result.warnings.some((warning) => String(warning).includes("No interface-admissible")));
});

void test("collapse analysis applies combination factors before lambda only to checked load cases", () => {
  const model = collapseModel(40);
  const unfactored = analyzeMasonryArchCollapse(model, { scalableLoadCaseIds: ["Q"] });
  assert.equal(unfactored.status, "ok");
  assert.equal(unfactored.outputs.failureMode, "mechanism");
  assert.notEqual(unfactored.outputs.lambdaCritical, null);

  const factored = analyzeMasonryArchCollapse(model, {
    scalableLoadCaseIds: ["Q"],
    loadCombination: {
      id: "ULS",
      combinationType: "ULS",
      factors: [
        { loadCase: { id: "G1" }, factor: 1.3 },
        { loadCase: { id: "Q" }, factor: 1.5 },
      ],
    },
  });
  assert.equal(factored.status, "ok");
  close(factored.outputs.lambdaCritical!, (unfactored.outputs.lambdaCritical! * 1.3) / 1.5, 2e-10);
  assert.equal(factored.outputs.analysis.analysisObjective, "capacity");
  assert.deepEqual(factored.outputs.analysis.lambda.fixedLoadCaseIds, ["G1"]);
  assert.deepEqual(factored.outputs.analysis.lambda.scalableLoadCaseIds, ["Q"]);
  assert.equal(
    factored.outputs.analysis.lambda.expression,
    "F(lambda) = F_fixed + lambda * F_scalable",
  );
  assert.equal(factored.outputs.analysis.lambda.currentValue, factored.outputs.lambdaCritical);
  assert.ok(factored.outputs.analysis.lambda.excludedQuantities.includes("initial-tendon-force"));
  assert.ok(
    factored.outputs.analysis.lambda.excludedQuantities.includes(
      "passive-tendon-compatibility-force",
    ),
  );
  assert.deepEqual(factored.outputs.loadCases.roleByCaseId, {
    G1: "fixed",
    Q: "scalable",
  });
  close(factored.outputs.loadCases.baseCombinationFactorsByCaseId.G1!, 1.3, 1e-12);
  close(factored.outputs.loadCases.baseCombinationFactorsByCaseId.Q!, 1.5, 1e-12);
  close(factored.outputs.loads.fixed[0]!.factor, 1.3, 1e-12);
  close(factored.outputs.loads.scalableAtUnitLambda[0]!.factor, 1.5, 1e-12);
  assert.ok(
    factored.outputs.loads.fixedBlockWrenches.every(
      (wrench) => !wrench.sourceLoadIds.includes("Q-patch"),
    ),
  );
  assert.ok(
    factored.outputs.loads.scalableBlockWrenchesAtUnitLambda.every(
      (wrench) => !wrench.sourceLoadIds.includes("SW"),
    ),
  );
  close(
    factored.outputs.loadCases.effectiveFactorsAtCollapseByCaseId.Q!,
    factored.outputs.lambdaCritical! * 1.5,
    2e-10,
  );

  const splitScalablePattern = createMasonryArch({
    id: "split-scalable-pattern",
    units: { force: "kN", length: "m" },
    geometry: circularGeometry(40, 1),
    masonry: { unitWeight: 20 },
    loads: [
      { id: "SW", type: "self-weight", loadCaseId: "G1" },
      {
        id: "Q1-patch",
        type: "patch",
        loadCaseId: "Q1",
        components: { x: 0, y: -5 },
        startStation: 0.05,
        endStation: 0.45,
      },
      {
        id: "Q2-patch",
        type: "patch",
        loadCaseId: "Q2",
        components: { x: 0, y: -5 },
        startStation: 0.05,
        endStation: 0.45,
      },
    ],
  });
  const split = analyzeMasonryArchCollapse(splitScalablePattern, {
    scalableLoadCaseIds: ["Q1", "Q2"],
  });
  assert.equal(split.status, "ok");
  close(split.outputs.lambdaCritical!, unfactored.outputs.lambdaCritical!, 2e-10);
  assert.equal(split.outputs.loadCases.roleByCaseId.Q1, "scalable");
  assert.equal(split.outputs.loadCases.roleByCaseId.Q2, "scalable");
});

void test("analysis-local load scaling represents G + lambda Q, lambda(G + Q), and G1 + lambda(G2 + Q1)", () => {
  const model = createMasonryArch({
    id: "load-scaling-patterns",
    units: { force: "kN", length: "m" },
    geometry: circularGeometry(20, 1),
    masonry: { unitWeight: 20 },
    loads: [
      { id: "G1", type: "self-weight", loadCaseId: "G1" },
      {
        id: "G2",
        type: "uniform",
        loadCaseId: "G2",
        components: { x: 0, y: -1 },
      },
      {
        id: "Q1",
        type: "patch",
        loadCaseId: "Q1",
        components: { x: 0, y: -2 },
        startStation: 0.05,
        endStation: 0.45,
      },
    ],
  });
  const loadCombination = {
    id: "factored-pattern",
    factors: [
      { loadCase: { id: "G1" }, factor: 1.2 },
      { loadCase: { id: "G2" }, factor: 1.3 },
      { loadCase: { id: "Q1" }, factor: 1.5 },
    ],
  } as const;

  const gPlusLambdaQ = analyzeMasonryArchCollapse(model, {
    loadCombination,
    scalableLoadCaseIds: ["Q1"],
  });
  assert.deepEqual(gPlusLambdaQ.outputs.analysis.lambda.fixedLoadCaseIds, ["G1", "G2"]);
  assert.deepEqual(gPlusLambdaQ.outputs.analysis.lambda.scalableLoadCaseIds, ["Q1"]);

  const lambdaAll = analyzeMasonryArchCollapse(model, {
    loadCombination,
    scalableLoadCaseIds: ["G1", "G2", "Q1"],
  });
  assert.deepEqual(lambdaAll.outputs.analysis.lambda.fixedLoadCaseIds, []);
  assert.deepEqual(lambdaAll.outputs.analysis.lambda.scalableLoadCaseIds, ["G1", "G2", "Q1"]);

  const splitPermanent = analyzeMasonryArchCollapse(model, {
    loadCombination,
    scalableLoadCaseIds: ["G2", "Q1"],
  });
  assert.deepEqual(splitPermanent.outputs.analysis.lambda.fixedLoadCaseIds, ["G1"]);
  assert.deepEqual(splitPermanent.outputs.analysis.lambda.scalableLoadCaseIds, ["G2", "Q1"]);
  assert.deepEqual(splitPermanent.outputs.analysis.lambda.baseCombinationFactorsByCaseId, {
    G1: 1.2,
    G2: 1.3,
    Q1: 1.5,
  });
  assert.throws(
    () =>
      analyzeMasonryArchCollapse(model, {
        scalableLoadCaseIds: ["Q1"],
        loadCombination: {
          factors: [
            { loadCase: { id: "G1" }, factor: 1 },
            { loadCase: { id: "G2" }, factor: 1 },
            { loadCase: { id: "Q1" }, factor: 0 },
          ],
        },
      }),
    /zero factored wrench field/,
  );
});

void test("finite Heyman multiplier exposes four active hinges and a virtual-work mechanism", () => {
  const result = analyzeMasonryArchCollapse(collapseModel(40), {
    scalableLoadCaseIds: ["Q"],
  });
  assert.equal(result.status, "ok");
  close(result.outputs.lambdaCritical!, 7.014005097629142, 2e-10);
  assert.equal(result.outputs.hinges.length, 4);
  assert.deepEqual(
    result.outputs.hinges.map((hinge) => hinge.index),
    [5, 17, 29, 40],
  );
  assert.equal(result.outputs.mechanism.kinematicallyVerified, true);
  assert.equal(result.outputs.loadFactorCheck.status, "pass");
  close(result.outputs.loadFactorCheck.utilizationRatio!, 1 / 7.014005097629142, 1e-12);
  assert.equal(result.outputs.mechanism.degreesOfFreedom, 1);
  assert.equal(result.outputs.mechanism.blockMotions.length, 40);
  assert.ok(result.outputs.mechanism.maximumConstraintResidual < 1e-12);
  assert.ok(result.outputs.mechanism.virtualWork.normalizedResidual! < 1e-12);
  assert.ok(Math.abs(result.outputs.equilibrium.normalizedResidual.forceX) < 1e-12);
  assert.ok(Math.abs(result.outputs.equilibrium.normalizedResidual.forceY) < 1e-12);
  assert.ok(Math.abs(result.outputs.equilibrium.normalizedResidual.moment) < 1e-12);

  const below = analyzeMasonryArchState(collapseModel(40), {
    loadFactorsByCaseId: { G1: 1, Q: result.outputs.lambdaCritical! * (1 - 1e-6) },
  });
  const above = analyzeMasonryArchState(collapseModel(40), {
    loadFactorsByCaseId: { G1: 1, Q: result.outputs.lambdaCritical! * (1 + 1e-6) },
  });
  assert.equal(below.status, "ok");
  assert.equal(above.status, "failed");
});

void test("a bonded intrados layer raises static capacity and remains separate from masonry thrust", () => {
  const unreinforced = analyzeMasonryArchCollapse(collapseModel(40), {
    scalableLoadCaseIds: ["Q"],
  });
  const reinforcedModel = createMasonryArch({
    id: "bonded-collapse",
    units: { force: "kN", length: "m" },
    geometry: circularGeometry(40, 1),
    masonry: { unitWeight: 20 },
    loads: [
      { id: "SW", type: "self-weight", loadCaseId: "G1" },
      {
        id: "Q-patch",
        type: "patch",
        loadCaseId: "Q",
        components: { x: 0, y: -10 },
        startStation: 0.05,
        endStation: 0.45,
      },
    ],
    bondedLayers: [
      {
        id: "FRCM-intrados",
        family: "frcm",
        side: "intrados",
        area: 0.001,
        elasticModulus: 200_000_000,
        tensileStrength: 100_000,
      },
    ],
  });
  const reinforced = analyzeMasonryArchCollapse(reinforcedModel, {
    scalableLoadCaseIds: ["Q"],
  });
  assert.ok(reinforced.outputs.lambdaCritical! > unreinforced.outputs.lambdaCritical!);
  assert.equal(reinforced.outputs.bondedLayerState.length, 1);
  assert.equal(reinforced.outputs.bondedLayerState[0]!.maximumUtilizationRatio, 1);
  assert.ok(reinforced.outputs.bondedLayerState[0]!.interfaces.some((item) => item.force! > 0));
  assert.ok(reinforced.outputs.thrustLine.every((point) => point !== null));
  assert.equal(reinforced.outputs.failureMode, "mixed");
});

void test("collapse multiplier converges under equal-arc-length refinement", () => {
  const values = [20, 40, 80, 160].map((voussoirCount) => {
    const result = analyzeMasonryArchCollapse(collapseModel(voussoirCount), {
      scalableLoadCaseIds: ["Q"],
    });
    assert.equal(result.status, "ok");
    return result.outputs.lambdaCritical!;
  });
  assert.ok(Math.abs(values[3]! - values[2]!) / values[3]! < 0.003);
  assert.ok(Math.abs(values[3]! - values[1]!) / values[3]! < 0.006);
});

void test("published KCLC point-load benchmark is reproduced within the polygonal geometry tolerance", () => {
  // Stockdale et al., SoftwareX 7 (2018), DOI 10.1016/j.softx.2018.05.006.
  // Published KCLC result: 2.751 kN; independent virtual-powers result: 2.756 kN.
  const intradosRadius = 1.806;
  const model = createMasonryArch({
    id: "stockdale-kclc-point-load",
    units: { force: "kN", length: "m" },
    geometry: {
      kind: "simplified-symmetric",
      referenceCurve: "intrados",
      profile: { type: "circular" },
      span: 2 * intradosRadius,
      rise: intradosRadius,
      thickness: 0.1661 * intradosRadius,
      outOfPlaneWidth: 0.25,
      voussoirCount: 27,
    },
    masonry: { unitWeight: (1530 * 9.81) / 1000 },
    loads: [
      { id: "SW", type: "self-weight", loadCaseId: "G" },
      {
        id: "P",
        type: "point",
        loadCaseId: "Q",
        station: 8 / 27,
        targetVoussoirId: "V-007",
        applicationCurve: "extrados",
        force: { x: 0, y: -1 },
      },
    ],
  });
  const result = analyzeMasonryArchCollapse(model, { scalableLoadCaseIds: ["Q"] });
  assert.equal(result.status, "ok");
  close(result.outputs.lambdaCritical!, 2.751, 0.005);
  assert.deepEqual(
    result.outputs.hinges.map((hinge) => hinge.index),
    [3, 8, 20, 27],
  );
  assert.ok(result.outputs.mechanism.virtualWork.normalizedResidual! < 1e-12);
});

void test("scale-invariant and fixed-load-infeasible limit cases remain explicit", () => {
  const scaleInvariant = createMasonryArch({
    id: "scale-invariant",
    units: { force: "kN", length: "m" },
    geometry: circularGeometry(40, 1),
    masonry: { unitWeight: 20 },
    loads: [{ id: "SW", type: "self-weight", loadCaseId: "G1" }],
  });
  const unbounded = analyzeMasonryArchCollapse(scaleInvariant, {
    scalableLoadCaseIds: ["G1"],
  });
  assert.equal(unbounded.status, "failed");
  assert.equal(unbounded.outputs.lambdaCritical, null);
  assert.equal(unbounded.outputs.failureMode, "no-collapse-within-model");

  const fixedInfeasible = analyzeMasonryArchCollapse(collapseModel(40, 0.2), {
    scalableLoadCaseIds: ["Q"],
  });
  assert.equal(fixedInfeasible.status, "failed");
  assert.equal(fixedInfeasible.outputs.lambdaCritical, 0);
  assert.equal(fixedInfeasible.outputs.failureMode, "fixed-load-infeasible");
  assert.ok(fixedInfeasible.warnings.some((warning) => String(warning).includes("lambda = 0")));
});

void test("Coulomb input defaults to zero-dilation non-associated flow and validates psi", () => {
  const model = createMasonryArch({
    id: "coulomb-normalization",
    units: { force: "kN", length: "m" },
    geometry: circularGeometry(20, 1),
    interfaces: { model: "coulomb", frictionCoefficient: 0.6 },
    supports: {
      right: {
        type: "rigid-contact",
        interface: { model: "coulomb", frictionCoefficient: 0.4 },
      },
    },
  });
  assert.deepEqual(model.interfaces.friction?.flowRule, {
    type: "non-associated",
    dilationAngle: 0,
  });
  close(model.supports.left.interface.friction!.frictionCoefficient, 0.6);
  close(model.supports.right.interface.friction!.frictionCoefficient, 0.4);

  assert.throws(
    () =>
      createMasonryArch({
        id: "invalid-dilation",
        units: { force: "kN", length: "m" },
        geometry: circularGeometry(20, 1),
        interfaces: {
          model: "coulomb",
          frictionCoefficient: 0.2,
          flowRule: { type: "non-associated", dilationAngle: 30, angleUnits: "deg" },
        },
      }),
    /0 <= psi <= atan\(mu\)/,
  );
});

void test("assigned-load state exposes Coulomb demand, capacity, and utilization", () => {
  const model = createMasonryArch({
    id: "coulomb-state",
    units: { force: "kN", length: "m" },
    geometry: circularGeometry(20, 1),
    masonry: { unitWeight: 20 },
    interfaces: { model: "coulomb", frictionCoefficient: 0.5 },
    loads: [
      { id: "SW", type: "self-weight", loadCaseId: "G1" },
      {
        id: "Q-patch",
        type: "patch",
        loadCaseId: "Q",
        components: { x: 0, y: -10 },
        startStation: 0.05,
        endStation: 0.45,
      },
    ],
  });
  const result = analyzeMasonryArchState(model, {
    loadFactorsByCaseId: { G1: 1, Q: 1 },
  });
  assert.equal(result.status, "ok");
  const checked = result.outputs.interfaces.filter((item) => item.checks.friction !== null);
  assert.equal(checked.length, 21);
  for (const item of checked) {
    const check = item.checks.friction!;
    close(check.demand, Math.abs(item.shearForce), 1e-12);
    close(check.capacity, 0.5 * item.normalForce, 1e-10);
    close(check.utilizationRatio!, check.demand / check.capacity, 1e-12);
    assert.equal(check.status, "pass");
  }
  assert.ok(Math.max(...checked.map((item) => item.frictionUtilization!)) < 1);
  assert.ok(Math.abs(result.outputs.equilibrium.normalizedResidual.forceX) < 1e-12);
  assert.ok(Math.abs(result.outputs.equilibrium.normalizedResidual.forceY) < 1e-12);
  assert.ok(Math.abs(result.outputs.equilibrium.normalizedResidual.moment) < 1e-12);
});

void test("decreasing friction changes rocking collapse into verified zero-dilation sliding", () => {
  const withFriction = (frictionCoefficient: number) =>
    createMasonryArch({
      id: `friction-collapse-${frictionCoefficient}`,
      units: { force: "kN", length: "m" },
      geometry: circularGeometry(20, 1),
      masonry: { unitWeight: 20 },
      interfaces: { model: "coulomb", frictionCoefficient },
      loads: [
        { id: "SW", type: "self-weight", loadCaseId: "G1" },
        {
          id: "Q-patch",
          type: "patch",
          loadCaseId: "Q",
          components: { x: 0, y: -10 },
          startStation: 0.05,
          endStation: 0.45,
        },
      ],
    });
  const rocking = analyzeMasonryArchCollapse(withFriction(0.7), {
    scalableLoadCaseIds: ["Q"],
  });
  const sliding = analyzeMasonryArchCollapse(withFriction(0.5), {
    scalableLoadCaseIds: ["Q"],
  });
  assert.equal(rocking.status, "ok");
  assert.equal(rocking.outputs.failureMode, "mechanism");
  assert.deepEqual(rocking.outputs.slidingInterfaces, []);
  assert.equal(sliding.status, "ok");
  assert.equal(sliding.outputs.failureMode, "mixed");
  assert.ok(sliding.outputs.slidingInterfaces.length > 0);
  assert.ok(sliding.outputs.lambdaCritical! < rocking.outputs.lambdaCritical!);
  assert.equal(sliding.outputs.limitMeaning, "kinematically-verified-collapse");
  assert.equal(sliding.outputs.mechanism.nonAssociatedFlow?.verified, true);
  assert.ok(
    sliding.outputs.mechanism.nonAssociatedFlow.slidingRates.every(
      (rate) => Math.abs(rate.normalRate) < 1e-12 && rate.directionVerified,
    ),
  );
  assert.ok(sliding.outputs.mechanism.virtualWork.internalDissipation! > 0);
  assert.ok(sliding.outputs.mechanism.virtualWork.normalizedResidual! < 1e-12);
  assert.equal(sliding.outputs.convergenceInfo.optimizer, "sequential-linear-programming");
  assert.equal(sliding.outputs.convergenceInfo.nonAssociated.converged, true);
});

void test("finite compression changes the governing mode to masonry crushing", () => {
  const model = createMasonryArch({
    id: "finite-compression-collapse",
    units: { force: "kN", length: "m" },
    geometry: circularGeometry(20, 1),
    masonry: { unitWeight: 20 },
    interfaces: {
      model: "finite-compression",
      compressiveStrength: 1000,
      compressionFacetCount: 16,
    },
    loads: [
      { id: "SW", type: "self-weight", loadCaseId: "G1" },
      {
        id: "Q-patch",
        type: "patch",
        loadCaseId: "Q",
        components: { x: 0, y: -10 },
        startStation: 0.05,
        endStation: 0.45,
      },
    ],
  });
  const state = analyzeMasonryArchState(model, {
    loadFactorsByCaseId: { G1: 1, Q: 1 },
  });
  assert.equal(state.status, "ok");
  assert.ok(state.outputs.interfaces.every((item) => item.checks.compression !== null));
  assert.ok(
    Math.max(...state.outputs.interfaces.map((item) => item.compressionUtilization ?? 0)) < 1,
  );

  const heyman = analyzeMasonryArchCollapse(collapseModel(20), {
    scalableLoadCaseIds: ["Q"],
  });
  const crushing = analyzeMasonryArchCollapse(model, { scalableLoadCaseIds: ["Q"] });
  assert.equal(crushing.status, "not-verified");
  assert.equal(crushing.outputs.failureMode, "masonry-crushing");
  assert.equal(crushing.outputs.limitMeaning, "maximum-static-admissibility");
  assert.ok(crushing.outputs.crushingInterfaces.length > 0);
  assert.ok(crushing.outputs.lambdaCritical! < heyman.outputs.lambdaCritical!);
  assert.ok(
    crushing.outputs.crushingInterfaces.every(
      (id) =>
        crushing.outputs.interfaces.find((item) => item.interfaceId === id)?.state === "crushing",
    ),
  );
});

void test("finite-compression multiplier converges as the safe chord domain is refined", () => {
  const values = [8, 16, 24].map((compressionFacetCount) => {
    const model = createMasonryArch({
      id: `compression-facets-${compressionFacetCount}`,
      units: { force: "kN", length: "m" },
      geometry: circularGeometry(20, 1),
      masonry: { unitWeight: 20 },
      interfaces: {
        model: "finite-compression",
        compressiveStrength: 1000,
        compressionFacetCount,
      },
      loads: [
        { id: "SW", type: "self-weight", loadCaseId: "G1" },
        {
          id: "Q-patch",
          type: "patch",
          loadCaseId: "Q",
          components: { x: 0, y: -10 },
          startStation: 0.05,
          endStation: 0.45,
        },
      ],
    });
    return analyzeMasonryArchCollapse(model, { scalableLoadCaseIds: ["Q"] }).outputs
      .lambdaCritical!;
  });
  assert.ok(values[0]! < values[1]! && values[1]! < values[2]!);
  assert.ok((values[2]! - values[1]!) / values[2]! < 0.01);
});
