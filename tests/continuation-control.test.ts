import assert from "node:assert/strict";
import test from "node:test";

import {
  NonlinearEquilibriumContinuationSolver,
  scaleArcLengthDirection,
  sphericalArcLengthConstraint,
  sphericalArcLengthNorm,
} from "structural-checks-ts";

const metric = { displacementScales: [2, 4], loadScale: 0.5 };

void test("spherical arc-length helpers share one metric definition", () => {
  const scaled = scaleArcLengthDirection([2, 4], 2, 0.25, metric);
  const norm = sphericalArcLengthNorm(scaled.displacement, scaled.lambda, metric);
  assert.ok(Math.abs(norm - 0.25) < 1e-14);
  const constraint = sphericalArcLengthConstraint(scaled.displacement, scaled.lambda, 0.25, metric);
  assert.ok(Math.abs(constraint.gap) < 1e-14);
  assert.equal(constraint.displacementGradient.length, 2);
});

void test("arc-length metric rejects inconsistent displacement scales", () => {
  assert.throws(
    () => sphericalArcLengthNorm([1, 2], 0, { displacementScales: [1], loadScale: 1 }),
    /must match/,
  );
});

void test("generic nonlinear equilibrium kernel supports load and displacement control", () => {
  const solver = new NonlinearEquilibriumContinuationSolver({
    scaling: { residualScales: [1], coordinateScales: [1] },
    tolerance: 1e-12,
    maxIterations: 12,
    maximumLineSearchIterations: 8,
    minimumLineSearchFactor: 2 ** -8,
  });
  const evaluate = (coordinates: readonly number[], lambda: number) => ({
    residual: [coordinates[0]! * coordinates[0]! - lambda],
    tangent: [[2 * coordinates[0]!]],
    scalableDerivative: [-1],
  });

  const loadControlled = solver.solve({
    initialCoordinates: [0.8],
    initialLambda: 1,
    evaluate,
  });
  assert.equal(loadControlled.converged, true);
  assert.ok(Math.abs(loadControlled.coordinates[0]! - 1) < 1e-10);

  const displacementControlled = solver.solve({
    initialCoordinates: [1.1],
    initialLambda: 1,
    evaluate,
    constraint: { type: "displacement", dof: 0, reference: 0, target: 2 },
  });
  assert.equal(displacementControlled.converged, true);
  assert.ok(Math.abs(displacementControlled.coordinates[0]! - 2) < 1e-10);
  assert.ok(Math.abs(displacementControlled.lambda - 4) < 1e-10);
});

void test("4A. an expected singular tangent stays a non-convergence diagnostic", () => {
  const solver = new NonlinearEquilibriumContinuationSolver({
    scaling: { residualScales: [1], coordinateScales: [1] },
    tolerance: 1e-12,
    maxIterations: 12,
    maximumLineSearchIterations: 8,
    minimumLineSearchFactor: 2 ** -8,
  });
  const result = solver.solve({
    initialCoordinates: [0.5],
    initialLambda: 0,
    evaluate: () => ({
      residual: [1],
      tangent: [[0]],
      scalableDerivative: [-1],
    }),
  });
  assert.equal(result.converged, false);
  assert.ok(result.warning !== null && /singular or ill-conditioned/.test(result.warning));
});

void test("4A. a degenerate displacement-control response stays a non-convergence diagnostic", () => {
  const solver = new NonlinearEquilibriumContinuationSolver({
    scaling: { residualScales: [1, 1], coordinateScales: [1, 1] },
    tolerance: 1e-12,
    maxIterations: 12,
    maximumLineSearchIterations: 8,
    minimumLineSearchFactor: 2 ** -8,
  });
  const result = solver.solve({
    initialCoordinates: [0, 0],
    initialLambda: 0,
    evaluate: () => ({
      residual: [0.5, 0.5],
      tangent: [
        [1, 0],
        [0, 1],
      ],
      // The continued load acts only on the second coordinate: the displacement-control
      // correction on dof 0 has zero incremental load response, an expected numerical
      // degeneracy of the augmented tangent system.
      scalableDerivative: [0, -1],
    }),
    constraint: { type: "displacement", dof: 0, reference: 0, target: 1 },
  });
  assert.equal(result.converged, false);
  assert.ok(result.warning !== null && /singular or ill-conditioned/.test(result.warning));
});

void test("4B. an unexpected error inside the tangent correction propagates", () => {
  const solver = new NonlinearEquilibriumContinuationSolver({
    scaling: { residualScales: [1], coordinateScales: [1] },
    tolerance: 1e-12,
    maxIterations: 12,
    maximumLineSearchIterations: 8,
    minimumLineSearchFactor: 2 ** -8,
  });
  // A non-finite tangent coefficient is a caller contract violation, not a singular tangent:
  // it must never be relabeled as a numerical non-convergence.
  assert.throws(
    () =>
      solver.solve({
        initialCoordinates: [0.5],
        initialLambda: 0,
        evaluate: () => ({
          residual: [1],
          tangent: [[Number.NaN]],
          scalableDerivative: [-1],
        }),
      }),
    /must be finite/,
  );
});

void test("generic nonlinear equilibrium kernel follows a spherical arc-length constraint", () => {
  const solver = new NonlinearEquilibriumContinuationSolver({
    scaling: { residualScales: [1], coordinateScales: [1] },
    tolerance: 1e-12,
    maxIterations: 20,
    maximumLineSearchIterations: 12,
    minimumLineSearchFactor: 2 ** -12,
  });
  const result = solver.solve({
    initialCoordinates: [0.1],
    initialLambda: 0.1,
    evaluate: (coordinates, lambda) => ({
      residual: [coordinates[0]! - lambda],
      tangent: [[1]],
      scalableDerivative: [-1],
    }),
    constraint: {
      type: "arc-length",
      referenceCoordinates: [0],
      referenceLambda: 0,
      radius: Math.sqrt(0.02),
      loadScale: 1,
    },
  });
  assert.equal(result.converged, true);
  assert.ok(Math.abs(result.coordinates[0]! - 0.1) < 1e-10);
  assert.ok(Math.abs(result.lambda - 0.1) < 1e-10);
});
