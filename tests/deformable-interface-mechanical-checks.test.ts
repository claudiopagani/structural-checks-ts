import assert from "node:assert/strict";
import test from "node:test";

import {
  evaluateRigidBlockDeformableInterface2D,
  type EvaluateRigidBlockDeformableInterface2DInput,
  type RigidBlockDeformableInterfaceLaw2D,
  type RigidBlockDeformableInterfaceState2D,
} from "structural-checks-ts-migration-workspace";

/**
 * Direct tests of the mechanical checks published by `evaluateRigidBlockDeformableInterface2D`.
 * The checks are produced where the law is evaluated; application layers must copy these
 * quantities instead of recomputing them. Units: force N, length m. Geometry: unit-area joint at
 * the origin with chain tangent along +x and joint axis along +y; the right block displacement
 * sets the normal gap through its x component and the tangential slip through its y component.
 *
 *   normal stiffness K = elasticModulus / characteristicLength = 2000 N/m³
 *   shear stiffness  = shearModulus / characteristicLength * area = 1000 N/m
 *   compression trial = -K * dx, shear trial = -1000 * dy.
 */

const GEOMETRY = {
  id: "J",
  index: 0,
  midpoint: { x: 0, y: 0 },
  chainTangent: { x: 1, y: 0 },
  jointAxis: { x: 0, y: 1 },
  length: 1,
  outOfPlaneWidth: 1,
} as const;

const BLOCK = {
  id: "B",
  index: 0,
  polygon: [
    { x: -1, y: -1 },
    { x: 1, y: -1 },
    { x: 1, y: 1 },
    { x: -1, y: 1 },
  ],
  area: 4,
  centroid: { x: 0, y: 0 },
  outOfPlaneWidth: 1,
  volume: 4,
  leftInterfaceId: "J",
  rightInterfaceId: "J",
} as const;

interface LawOverrides {
  readonly compressiveStrength?: number | null;
  readonly postCrushingBehavior?: "stop-at-onset" | "perfectly-plastic";
  readonly frictionCoefficient?: number;
  readonly cohesion?: number;
}

function law(overrides: LawOverrides = {}): RigidBlockDeformableInterfaceLaw2D {
  return {
    normal: {
      elasticModulus: 2_000,
      characteristicLength: 1,
      compressiveStrength: overrides.compressiveStrength ?? null,
      integrationPointCount: 4,
      postCrushingBehavior: overrides.postCrushingBehavior ?? "stop-at-onset",
    },
    tangential: {
      shearModulus: 1_000,
      characteristicLength: 1,
      frictionCoefficient: overrides.frictionCoefficient ?? 0.5,
      cohesion: overrides.cohesion ?? 0,
      dilationAngle: 0,
    },
  };
}

function evaluate(
  overrides: LawOverrides,
  translation: { readonly x: number; readonly y: number },
  committedState: RigidBlockDeformableInterfaceState2D | null = null,
) {
  const input: EvaluateRigidBlockDeformableInterface2DInput = {
    geometry: GEOMETRY,
    left: null,
    right: {
      block: BLOCK,
      displacement: { blockId: "B", translation, rotation: 0 },
    },
    law: law(overrides),
    committedState,
    computeTangent: false,
  };
  return evaluateRigidBlockDeformableInterface2D(input);
}

void test("A. friction check below the limit is produced by the mechanics", () => {
  const result = evaluate({ frictionCoefficient: 0.5 }, { x: -0.1, y: -0.05 });
  // Uniform closure 0.1 -> compression trial 200 -> normal force 200; shear trial 50.
  assert.equal(result.normalForce, 200);
  assert.equal(result.shearForce, 50);
  assert.equal(result.sliding, false);
  const check = result.checks.friction!;
  assert.ok(check !== null, "the Coulomb check is produced");
  assert.equal(check.criterion, "coulomb-friction");
  assert.equal(check.demand, Math.abs(result.shearForce));
  assert.equal(check.demand, 50);
  assert.equal(check.capacity, 100);
  assert.equal(check.utilizationRatio, 0.5);
  assert.equal(check.status, "pass");
});

void test("B. friction at the limit reports the capacity produced by the law", () => {
  const result = evaluate({ frictionCoefficient: 0.5 }, { x: -0.1, y: -0.25 });
  // Shear trial 250 exceeds capacity 100: sliding clamps the force to the capacity.
  assert.equal(result.sliding, true);
  assert.equal(result.shearForce, 100);
  const check = result.checks.friction!;
  assert.ok(check !== null);
  assert.equal(check.criterion, "coulomb-friction");
  assert.equal(check.demand, Math.abs(result.shearForce));
  assert.equal(check.capacity, 100);
  assert.equal(check.utilizationRatio, 1);
  assert.equal(check.status, "fail");
});

void test("C. friction with zero capacity is not-verifiable instead of invented", () => {
  const result = evaluate({ frictionCoefficient: 0, cohesion: 0 }, { x: -0.1, y: 0 });
  const check = result.checks.friction!;
  assert.ok(check !== null, "the tangential law exists and the check is still published");
  assert.equal(check.criterion, "coulomb-friction");
  assert.equal(check.demand, Math.abs(result.shearForce));
  assert.equal(check.capacity, 0);
  assert.equal(check.utilizationRatio, null);
  assert.equal(check.status, "not-verifiable");
});

void test("D. friction capacity includes the assigned cohesion term", () => {
  const result = evaluate({ frictionCoefficient: 0, cohesion: 10 }, { x: -0.1, y: -0.005 });
  const check = result.checks.friction!;
  assert.ok(check !== null);
  assert.equal(check.demand, 5);
  assert.equal(check.capacity, 10);
  assert.equal(check.utilizationRatio, 0.5);
  assert.equal(check.status, "pass");
});

void test("E. compression check with finite strength carries the trial demand", () => {
  const result = evaluate({ compressiveStrength: 300 }, { x: -0.1, y: 0 });
  // Trial compression 200 below strength 300.
  assert.equal(result.maxCompression, 200);
  assert.equal(result.crushing, false);
  const check = result.checks.compression!;
  assert.ok(check !== null, "the finite-strength check is produced");
  assert.equal(check.criterion, "deformable-interface-compression-strength");
  assert.equal(check.demand, 200);
  assert.equal(check.capacity, 300);
  assert.ok(Math.abs(check.utilizationRatio! - 2 / 3) < 1e-12);
  assert.equal(check.status, "pass");
});

void test("F. stop-at-onset reaching the strength fails the current-state check", () => {
  const result = evaluate(
    { compressiveStrength: 300, postCrushingBehavior: "stop-at-onset" },
    { x: -0.2, y: 0 },
  );
  // Trial compression 400 exceeds strength 300; the published stress is clipped.
  assert.equal(result.maxCompression, 300);
  assert.equal(result.crushing, true);
  const check = result.checks.compression!;
  assert.ok(check !== null);
  assert.equal(check.criterion, "deformable-interface-compression-strength");
  assert.equal(check.demand, 400);
  assert.equal(check.capacity, 300);
  assert.ok(Math.abs(check.utilizationRatio! - 4 / 3) < 1e-12);
  assert.equal(check.status, "fail");
});

void test("G. no finite strength means no compression check", () => {
  const result = evaluate({ compressiveStrength: null }, { x: -0.1, y: 0 });
  assert.equal(result.checks.compression, null);
});

void test("H. perfectly-plastic crushing reaching the limit fails the current-state check", () => {
  const first = evaluate(
    { compressiveStrength: 300, postCrushingBehavior: "perfectly-plastic" },
    { x: -0.25, y: 0 },
  );
  // Trial compression 500 exceeds strength 300; plastic closure absorbs 0.1 of the gap.
  assert.equal(first.crushing, true);
  assert.equal(first.maxCompression, 300);
  const firstCheck = first.checks.compression!;
  assert.ok(firstCheck !== null);
  assert.equal(firstCheck.demand, 500);
  assert.equal(firstCheck.capacity, 300);
  assert.equal(firstCheck.status, "fail");
  assert.equal(first.trialState.plasticClosureByIntegrationPoint.length, 4);
  for (const closure of first.trialState.plasticClosureByIntegrationPoint) {
    assert.ok(Math.abs(closure - 0.1) < 1e-12);
  }
});

void test("I. developed plastic crushing below the current limit stays a pass", () => {
  const first = evaluate(
    { compressiveStrength: 300, postCrushingBehavior: "perfectly-plastic" },
    { x: -0.25, y: 0 },
  );
  // Unload to closure 0.2: trial compression 200 sits below strength while the committed
  // plastic closure keeps the developed-crushing state alive. The current-state check must not
  // re-flag a historical limit as a new failure.
  const second = evaluate(
    { compressiveStrength: 300, postCrushingBehavior: "perfectly-plastic" },
    { x: -0.2, y: 0 },
    first.trialState,
  );
  assert.equal(second.crushing, true, "developed plastic crushing remains a state");
  assert.equal(second.maxCompression, 200);
  const check = second.checks.compression!;
  assert.ok(check !== null);
  assert.equal(check.demand, 200);
  assert.equal(check.capacity, 300);
  assert.ok(Math.abs(check.utilizationRatio! - 2 / 3) < 1e-12);
  assert.equal(check.status, "pass");
});
