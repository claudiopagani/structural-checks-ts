import assert from "node:assert/strict";
import test from "node:test";

import {
  analyzeMasonryArchCollapse,
  analyzeMasonryArchState,
  createMasonryArch,
  evaluateArchReinforcementConfiguration,
  resolveArchReinforcements,
} from "structural-checks-ts-migration-workspace/applications/masonry-arches";

function close(actual: number, expected: number, tolerance = 1e-9): void {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `Expected ${actual} to be within ${tolerance} of ${expected}.`,
  );
}

function geometry(voussoirCount = 20) {
  return {
    kind: "simplified-symmetric" as const,
    referenceCurve: "centerline" as const,
    profile: { type: "circular" as const },
    span: 10,
    rise: 5,
    thickness: 1,
    outOfPlaneWidth: 1,
    voussoirCount,
  };
}

function wrenchResultant(resolved: ReturnType<typeof resolveArchReinforcements>): {
  forceX: number;
  forceY: number;
  moment: number;
} {
  return resolved.blockWrenches.reduce(
    (total, wrench) => ({
      forceX: total.forceX + wrench.force.x,
      forceY: total.forceY + wrench.force.y,
      moment:
        total.moment +
        wrench.applicationPoint.x * wrench.force.y -
        wrench.applicationPoint.y * wrench.force.x +
        wrench.moment,
    }),
    { forceX: 0, forceY: 0, moment: 0 },
  );
}

void test("intrados deviators are independent, equally spaced physical entities with one at the crown", () => {
  assert.throws(
    () =>
      createMasonryArch({
        id: "invalid-even-deviators",
        units: { force: "kN", length: "m" },
        geometry: geometry(),
        reinforcements: [
          {
            id: "PT",
            side: "intrados",
            area: 0.001,
            elasticModulus: 200_000_000,
            initialForce: 100,
            interaction: { type: "rigid-deviators", count: 4 },
          },
        ],
      }),
    /count must be odd/i,
  );

  const model = createMasonryArch({
    id: "five-intrados-deviators",
    units: { force: "kN", length: "m" },
    geometry: geometry(),
    reinforcements: [
      {
        id: "PT",
        side: "intrados",
        area: 0.001,
        elasticModulus: 200_000_000,
        initialForce: 100,
        interaction: { type: "rigid-deviators", count: 5 },
      },
    ],
  });
  const resolved = resolveArchReinforcements(model);
  const state = resolved.reinforcementState[0]!;
  assert.equal(state.deviators.length, 5);
  assert.equal(state.segments.length, 4);
  for (let index = 0; index < 5; index += 1) {
    close(state.deviators[index]!.normalizedSideArcStation, index / 4, 2e-12);
  }
  close(state.deviators[2]!.point.x, 0, 2e-12);
  close(state.deviators[2]!.point.y, 4.5, 2e-12);
  assert.equal(model.geometry.voussoirs.length, 20);

  const crownForce = resolved.anchorForces.find(
    (item) => item.kind === "deviator" && item.index === 2,
  )!;
  close(crownForce.tensionLeft, 100, 1e-12);
  close(crownForce.tensionRight, 100, 1e-12);
  close(crownForce.resultant, 200 * Math.sin(Math.PI / 8), 2e-12);
  close(crownForce.normalComponent, crownForce.resultant, 2e-12);
  close(crownForce.tangentialComponent, 0, 2e-12);
});

void test("extrados post-tensioning uses contact samples and converges to q = T kappa", () => {
  const tension = 120;
  const segmentCount = 100;
  const extradosRadius = 5.5;
  const model = createMasonryArch({
    id: "extrados-contact",
    units: { force: "kN", length: "m" },
    geometry: geometry(40),
    reinforcements: [
      {
        id: "PT-ext",
        side: "extrados",
        area: 0.001,
        elasticModulus: 200_000_000,
        initialForce: tension,
        interaction: { type: "unilateral-contact", segmentCount },
      },
    ],
  });
  const resolved = resolveArchReinforcements(model);
  assert.equal(resolved.reinforcementState[0]!.deviators.length, 0);
  assert.equal(resolved.anchorForces.length, 0);
  assert.equal(resolved.contactForces.length, segmentCount + 1);
  assert.equal(resolved.hasInvalidContact, false);

  const crown = resolved.contactForces.find(
    (item) => Math.abs(item.normalizedSideArcStation - 0.5) < 1e-12,
  )!;
  const angularIncrement = Math.PI / segmentCount;
  close(crown.normalComponent, 2 * tension * Math.sin(angularIncrement / 2), 2e-11);
  close(crown.tangentialComponent, 0, 2e-11);
  const equivalentPressure = crown.normalComponent / (extradosRadius * angularIncrement);
  close(equivalentPressure, tension / extradosRadius, 1e-3);

  const archAction = wrenchResultant(resolved);
  const externalAction = resolved.boundaryForces.reduce(
    (total, item) => ({
      x: total.x + item.forceTransmittedToExternalSystem.x,
      y: total.y + item.forceTransmittedToExternalSystem.y,
      moment:
        total.moment +
        item.point.x * item.forceTransmittedToExternalSystem.y -
        item.point.y * item.forceTransmittedToExternalSystem.x,
    }),
    { x: 0, y: 0, moment: 0 },
  );
  close(archAction.forceX + externalAction.x, 0, 2e-10);
  close(archAction.forceY + externalAction.y, 0, 2e-10);
  close(archAction.moment + externalAction.moment, 0, 2e-9);
});

void test("moved extrados contact releases samples that would require adhesion", () => {
  const model = createMasonryArch({
    id: "extrados-contact-release",
    units: { force: "kN", length: "m" },
    geometry: geometry(20),
    reinforcements: [
      {
        id: "PT-release",
        side: "extrados",
        area: 0.001,
        elasticModulus: 200_000_000,
        initialForce: 100,
        interaction: { type: "unilateral-contact", segmentCount: 40 },
      },
    ],
  });
  const evaluated = evaluateArchReinforcementConfiguration(model, {
    units: { force: "kN", length: "m" },
    blockDisplacements: [
      {
        blockId: "V-010",
        translation: { x: 0, y: -0.25 },
        rotation: 0,
      },
    ],
  });
  const separated = evaluated.contactForces.filter((item) => item.state === "separated");
  assert.ok(separated.length > 0);
  assert.equal(evaluated.hasInvalidContact, false);
  assert.ok(
    evaluated.contactForces
      .filter((item) => item.state === "in-contact")
      .every((item) => item.normalComponent >= -1e-8),
  );
  assert.ok(
    separated.every(
      (item) =>
        item.tensionLeft === 0 &&
        item.tensionRight === 0 &&
        item.resultantForce.x === 0 &&
        item.resultantForce.y === 0,
    ),
  );
  const archAction = wrenchResultant(evaluated);
  const externalAction = evaluated.boundaryForces.reduce(
    (total, item) => ({
      x: total.x + item.forceTransmittedToExternalSystem.x,
      y: total.y + item.forceTransmittedToExternalSystem.y,
      moment:
        total.moment +
        item.point.x * item.forceTransmittedToExternalSystem.y -
        item.point.y * item.forceTransmittedToExternalSystem.x,
    }),
    { x: 0, y: 0, moment: 0 },
  );
  close(archAction.forceX + externalAction.x, 0, 2e-9);
  close(archAction.forceY + externalAction.y, 0, 2e-9);
  close(archAction.moment + externalAction.moment, 0, 2e-8);
});

void test("distributed terminal connector groups transfer tension progressively and remain self-equilibrated", () => {
  const model = createMasonryArch({
    id: "distributed-terminal-transfer",
    units: { force: "kN", length: "m" },
    geometry: geometry(24),
    reinforcements: [
      {
        id: "PT-int",
        side: "intrados",
        area: 0.002,
        elasticModulus: 200_000_000,
        initialForce: 90,
        interaction: {
          type: "rigid-deviators",
          count: 5,
          capacity: { resultantResistance: 200 },
        },
        terminations: {
          left: {
            type: "distributed-anchorage",
            connectorCount: 3,
            connectorSpacing: 0.2,
            capacity: { resultantResistance: 20 },
          },
          right: {
            type: "distributed-anchorage",
            connectorCount: 3,
            connectorSpacing: 0.2,
            capacity: { resultantResistance: 200 },
          },
        },
      },
    ],
  });
  const resolved = resolveArchReinforcements(model);
  const left = resolved.anchorForces
    .filter((item) => item.terminationSide === "left")
    .sort((a, b) => a.index - b.index);
  const right = resolved.anchorForces
    .filter((item) => item.terminationSide === "right")
    .sort((a, b) => a.index - b.index);
  assert.equal(left.length, 3);
  assert.equal(right.length, 3);
  close(left[0]!.tensionLeft, 0, 1e-12);
  close(left[0]!.tensionRight, 30, 1e-12);
  close(left[1]!.tensionLeft, 30, 1e-12);
  close(left[1]!.tensionRight, 60, 1e-12);
  close(left[2]!.tensionLeft, 60, 1e-12);
  close(left[2]!.tensionRight, 90, 1e-12);
  close(right[0]!.tensionLeft, 30, 1e-12);
  close(right[0]!.tensionRight, 0, 1e-12);
  close(right[1]!.tensionLeft, 60, 1e-12);
  close(right[1]!.tensionRight, 30, 1e-12);
  close(right[2]!.tensionLeft, 90, 1e-12);
  close(right[2]!.tensionRight, 60, 1e-12);
  assert.equal(left[0]!.kind, "terminal-connector-and-deviator");
  assert.equal(left[0]!.status, "fail");
  assert.equal(resolved.hasAnchorFailure, true);
  for (const boundary of resolved.boundaryForces) {
    close(boundary.tension, 0, 1e-12);
    close(boundary.forceTransmittedToExternalSystem.x, 0, 1e-12);
    close(boundary.forceTransmittedToExternalSystem.y, 0, 1e-12);
  }
  const archAction = wrenchResultant(resolved);
  close(archAction.forceX, 0, 2e-10);
  close(archAction.forceY, 0, 2e-10);
  close(archAction.moment, 0, 2e-9);
});

void test("post-tensioning actions enter arch equilibrium while masonry compression stays separate", () => {
  const model = createMasonryArch({
    id: "post-tensioned-state",
    units: { force: "kN", length: "m" },
    geometry: geometry(40),
    reinforcements: [
      {
        id: "PT-ext",
        side: "extrados",
        area: 0.002,
        elasticModulus: 200_000_000,
        initialForce: 50,
        yieldStrength: 100_000,
        tensileStrength: 150_000,
        interaction: { type: "unilateral-contact", segmentCount: 80 },
      },
    ],
  });
  const result = analyzeMasonryArchState(model);
  assert.equal(result.outputs.reinforcementState[0]!.state, "active-post-tensioned");
  close(result.outputs.reinforcementState[0]!.force, 50, 1e-12);
  close(result.outputs.reinforcementState[0]!.axialStress, 25_000, 1e-9);
  assert.equal(result.outputs.interfaces.length, 41);
  assert.equal(result.outputs.contactForces.length, 81);
  assert.ok(result.outputs.blockWrenches.some((item) => item.force.y < 0));
  const totalVerticalReaction =
    result.outputs.reactions.left.force.y + result.outputs.reactions.right.force.y;
  const totalVerticalAction = result.outputs.blockWrenches.reduce(
    (sum, item) => sum + item.force.y,
    0,
  );
  close(totalVerticalReaction + totalVerticalAction, 0, 2e-9);
  assert.ok(result.outputs.interfaces.every((item) => item.thrustPoint !== null));
});

void test("zero initial force remains slack and produces no action in linear geometry", () => {
  const model = createMasonryArch({
    id: "passive-reference-state",
    units: { force: "kN", length: "m" },
    geometry: geometry(),
    reinforcements: [
      {
        id: "passive",
        side: "intrados",
        area: 0.001,
        elasticModulus: 200_000_000,
        initialForce: 0,
        interaction: { type: "rigid-deviators", count: 3 },
      },
    ],
  });
  const resolved = resolveArchReinforcements(model);
  assert.equal(resolved.reinforcementState[0]!.state, "slack");
  for (const wrench of resolved.blockWrenches) {
    close(wrench.force.x, 0, 1e-15);
    close(wrench.force.y, 0, 1e-15);
    close(wrench.moment, 0, 1e-15);
  }
  assert.ok(resolved.anchorForces.every((item) => item.resultant === 0));
});

void test("an anchor already over capacity governs collapse at zero scalable multiplier", () => {
  const model = createMasonryArch({
    id: "anchor-fixed-failure",
    units: { force: "kN", length: "m" },
    geometry: geometry(30),
    loads: [
      {
        id: "Q",
        type: "patch",
        loadCaseId: "Q",
        components: { x: 0, y: -1 },
        startStation: 0.1,
        endStation: 0.4,
      },
    ],
    reinforcements: [
      {
        id: "PT",
        side: "intrados",
        area: 0.002,
        elasticModulus: 200_000_000,
        initialForce: 60,
        interaction: { type: "rigid-deviators", count: 5 },
        terminations: {
          left: {
            type: "distributed-anchorage",
            connectorCount: 1,
            capacity: { resultantResistance: 10 },
          },
          right: {
            type: "distributed-anchorage",
            connectorCount: 1,
            capacity: { resultantResistance: 10 },
          },
        },
      },
    ],
  });
  const result = analyzeMasonryArchCollapse(model, { scalableLoadCaseIds: ["Q"] });
  assert.equal(result.outputs.lambdaCritical, 0);
  assert.equal(result.outputs.failureMode, "anchor-capacity");
  assert.equal(result.outputs.limitMeaning, "not-determined");
  assert.equal(result.outputs.criticalInterfaces.length, 0);
  assert.ok(result.outputs.anchorForces.some((item) => item.status === "fail"));
  close(result.outputs.equilibrium.normalizedResidual.forceX, 0, 1e-12);
  close(result.outputs.equilibrium.normalizedResidual.forceY, 0, 1e-12);
  close(result.outputs.equilibrium.normalizedResidual.moment, 0, 1e-12);
  const scalableAtCollapse = result.outputs.loads.totalAtCollapse.find(
    (item) => item.loadCaseId === "Q",
  )!;
  close(scalableAtCollapse.factor, 0, 1e-12);
});

function passiveAnchoredModel(
  overrides: Partial<{
    initialForce: number;
    yieldStrength: number;
    tensileStrength: number;
    ultimateStrain: number;
  }> = {},
) {
  return createMasonryArch({
    id: "passive-compatible",
    units: { force: "kN", length: "m" },
    geometry: geometry(20),
    reinforcements: [
      {
        id: "passive",
        side: "intrados",
        area: 0.001,
        elasticModulus: 200_000_000,
        initialForce: overrides.initialForce ?? 0,
        ...(overrides.yieldStrength === undefined
          ? {}
          : { yieldStrength: overrides.yieldStrength }),
        ...(overrides.tensileStrength === undefined
          ? {}
          : { tensileStrength: overrides.tensileStrength }),
        ...(overrides.ultimateStrain === undefined
          ? {}
          : { ultimateStrain: overrides.ultimateStrain }),
        interaction: { type: "rigid-deviators", count: 3 },
        terminations: {
          left: { type: "distributed-anchorage", connectorCount: 1 },
          right: { type: "distributed-anchorage", connectorCount: 1 },
        },
      },
    ],
  });
}

void test("a passive anchored tendon activates from prescribed path elongation", () => {
  const model = passiveAnchoredModel();
  const displacementMillimetres = 1;
  const result = evaluateArchReinforcementConfiguration(model, {
    units: { force: "kN", length: "mm" },
    blockDisplacements: [
      {
        blockId: "V-009",
        translation: { x: 0, y: displacementMillimetres },
        rotation: 0,
      },
      {
        blockId: "V-010",
        translation: { x: 0, y: displacementMillimetres },
        rotation: 0,
      },
    ],
  });
  const state = result.reinforcementState[0]!;
  assert.equal(result.configuration.solutionMeaning, "prescribed-configuration-not-equilibrated");
  assert.equal(result.configuration.equilibriumSolved, false);
  assert.deepEqual(result.configuration.sourceUnits, { force: "kN", length: "mm" });
  assert.deepEqual(result.configuration.units, { force: "kN", length: "m" });
  assert.equal(state.compatibilityMode, "anchored-length-compatible");
  assert.equal(state.state, "active-passive");
  close(state.referencePath[1]!.y, 4.5, 2e-12);
  close(state.path[1]!.y, 4.501, 2e-12);
  assert.ok(state.elongation > 0);
  close(state.currentPathLength - state.referencePathLength, state.elongation, 1e-15);
  close(state.effectiveElasticLength!, state.referencePathLength, 2e-12);
  close(
    state.force,
    (200_000_000 * 0.001 * state.elongation) / state.effectiveElasticLength!,
    2e-10,
  );
  close(state.elasticTangentStiffness, 200_000 / state.referencePathLength, 2e-10);
  close(state.elasticStrain, state.geometricStrain, 2e-15);
  assert.ok(state.segments.every((segment) => segment.tension === state.force));

  const action = wrenchResultant(result);
  close(action.forceX, 0, 2e-10);
  close(action.forceY, 0, 2e-10);
  close(action.moment, 0, 2e-9);
});

void test("distributed transfer zones contribute their actual elastic compliance", () => {
  const model = createMasonryArch({
    id: "passive-distributed-transfer",
    units: { force: "kN", length: "m" },
    geometry: geometry(20),
    reinforcements: [
      {
        id: "passive",
        side: "intrados",
        area: 0.001,
        elasticModulus: 200_000_000,
        initialForce: 0,
        interaction: { type: "rigid-deviators", count: 5 },
        terminations: {
          left: {
            type: "distributed-anchorage",
            connectorCount: 3,
            connectorSpacing: 0.2,
          },
          right: {
            type: "distributed-anchorage",
            connectorCount: 3,
            connectorSpacing: 0.2,
          },
        },
      },
    ],
  });
  const state = evaluateArchReinforcementConfiguration(model, {
    units: { force: "kN", length: "m" },
    blockDisplacements: [
      { blockId: "V-009", translation: { x: 0, y: 0.001 }, rotation: 0 },
      { blockId: "V-010", translation: { x: 0, y: 0.001 }, rotation: 0 },
    ],
  }).reinforcementState[0]!;
  assert.ok(state.effectiveElasticLength! < state.referencePathLength);
  assert.ok(state.segments.some((segment) => segment.tensionRatio < 1));
  close(
    state.force,
    (200_000_000 * 0.001 * state.elongation) / state.effectiveElasticLength!,
    2e-10,
  );
});

void test("shortening makes a passive tendon slack and can unload initial post-tension", () => {
  const passive = passiveAnchoredModel();
  const shortened = evaluateArchReinforcementConfiguration(passive, {
    units: { force: "kN", length: "m" },
    blockDisplacements: [
      { blockId: "V-009", translation: { x: 0, y: -0.001 }, rotation: 0 },
      { blockId: "V-010", translation: { x: 0, y: -0.001 }, rotation: 0 },
    ],
  }).reinforcementState[0]!;
  assert.ok(shortened.trialForce < 0);
  close(shortened.force, 0, 1e-15);
  close(shortened.elasticTangentStiffness, 0, 1e-15);
  assert.equal(shortened.state, "slack");

  const postTensioned = passiveAnchoredModel({ initialForce: 10 });
  const unloaded = evaluateArchReinforcementConfiguration(postTensioned, {
    units: { force: "kN", length: "m" },
    blockDisplacements: [
      { blockId: "V-009", translation: { x: 0, y: -0.001 }, rotation: 0 },
      { blockId: "V-010", translation: { x: 0, y: -0.001 }, rotation: 0 },
    ],
  }).reinforcementState[0]!;
  assert.ok(unloaded.trialForce < 0);
  close(unloaded.force, 0, 1e-15);
  assert.equal(unloaded.state, "slack");
});

void test("a tendon continuing outside the model remains force-controlled", () => {
  const model = createMasonryArch({
    id: "external-force-controlled",
    units: { force: "kN", length: "m" },
    geometry: geometry(20),
    reinforcements: [
      {
        id: "external",
        side: "intrados",
        area: 0.001,
        elasticModulus: 200_000_000,
        initialForce: 12,
        interaction: { type: "rigid-deviators", count: 3 },
      },
    ],
  });
  const result = evaluateArchReinforcementConfiguration(model, {
    units: { force: "kN", length: "m" },
    blockDisplacements: [
      { blockId: "V-009", translation: { x: 0, y: 0.002 }, rotation: 0 },
      { blockId: "V-010", translation: { x: 0, y: 0.002 }, rotation: 0 },
    ],
  });
  const state = result.reinforcementState[0]!;
  assert.equal(state.compatibilityMode, "externally-force-controlled");
  assert.ok(state.elongation > 0);
  close(state.force, 12, 1e-12);
  close(state.elasticForceIncrement, 0, 1e-15);
  close(state.elasticTangentStiffness, 0, 1e-15);
});

void test("yield, tensile-strength and ultimate-strain limits are explicit under elongation", () => {
  const displacement = {
    units: { force: "kN" as const, length: "m" as const },
    blockDisplacements: [
      { blockId: "V-009", translation: { x: 0, y: 0.001 }, rotation: 0 },
      { blockId: "V-010", translation: { x: 0, y: 0.001 }, rotation: 0 },
    ],
  };
  const yielded = evaluateArchReinforcementConfiguration(
    passiveAnchoredModel({ yieldStrength: 10_000, tensileStrength: 100_000 }),
    displacement,
  ).reinforcementState[0]!;
  assert.equal(yielded.state, "yielded");
  assert.equal(yielded.checks.yielding!.status, "fail");
  assert.equal(yielded.checks.tensileFailure!.status, "pass");

  const ruptured = evaluateArchReinforcementConfiguration(
    passiveAnchoredModel({ tensileStrength: 10_000 }),
    displacement,
  ).reinforcementState[0]!;
  assert.equal(ruptured.state, "failed");
  assert.equal(ruptured.checks.tensileFailure!.status, "fail");

  const strainFailure = evaluateArchReinforcementConfiguration(
    passiveAnchoredModel({ ultimateStrain: 0.00005 }),
    displacement,
  ).reinforcementState[0]!;
  assert.equal(strainFailure.state, "failed");
  assert.equal(strainFailure.checks.ultimateStrain!.status, "fail");
});

void test("a crown device on a joint uses work-conjugate two-block interpolation", () => {
  const model = passiveAnchoredModel();
  const result = evaluateArchReinforcementConfiguration(model, {
    units: { force: "kN", length: "m" },
    blockDisplacements: [{ blockId: "V-009", translation: { x: 0, y: 0.002 }, rotation: 0 }],
  });
  const crown = result.reinforcementState[0]!.deviators[1]!;
  close(crown.point.y - crown.referencePoint.y, 0.001, 2e-12);
  const leftWrench = result.blockWrenches[9]!;
  const rightWrench = result.blockWrenches[10]!;
  assert.ok(leftWrench.sourceLoadIds.some((id) => id.includes("reinforcement:passive")));
  assert.ok(rightWrench.sourceLoadIds.some((id) => id.includes("reinforcement:passive")));
  const action = wrenchResultant(result);
  close(action.forceX, 0, 2e-10);
  close(action.forceY, 0, 2e-10);
  close(action.moment, 0, 2e-9);
});

void test("a global finite rigid-body motion does not activate a passive tendon", () => {
  const model = passiveAnchoredModel();
  const rotation = 0.17;
  const cosine = Math.cos(rotation);
  const sine = Math.sin(rotation);
  const rigidTranslation = { x: 0.23, y: -0.14 };
  const result = evaluateArchReinforcementConfiguration(model, {
    units: { force: "kN", length: "m" },
    blockDisplacements: model.geometry.voussoirs.map((block) => {
      const transformedCentroid = {
        x: cosine * block.centroid.x - sine * block.centroid.y + rigidTranslation.x,
        y: sine * block.centroid.x + cosine * block.centroid.y + rigidTranslation.y,
      };
      return {
        blockId: block.id,
        translation: {
          x: transformedCentroid.x - block.centroid.x,
          y: transformedCentroid.y - block.centroid.y,
        },
        rotation,
      };
    }),
  });
  const state = result.reinforcementState[0]!;
  close(state.currentPathLength, state.referencePathLength, 2e-12);
  assert.ok(Math.abs(state.elongation) <= state.elongationTolerance);
  close(state.force, 0, 1e-12);
  assert.equal(state.state, "slack");
});

void test("prescribed configurations reject unknown and duplicate block identifiers", () => {
  const model = passiveAnchoredModel();
  assert.throws(
    () =>
      evaluateArchReinforcementConfiguration(model, {
        units: { force: "kN", length: "m" },
        blockDisplacements: [{ blockId: "not-a-block", translation: { x: 0, y: 0 }, rotation: 0 }],
      }),
    /unknown prescribed-displacement block/i,
  );
  assert.throws(
    () =>
      evaluateArchReinforcementConfiguration(model, {
        units: { force: "kN", length: "m" },
        blockDisplacements: [
          { blockId: "V-000", translation: { x: 0, y: 0 }, rotation: 0 },
          { blockId: "V-000", translation: { x: 0, y: 0 }, rotation: 0 },
        ],
      }),
    /duplicate prescribed-displacement/i,
  );
});
