import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import test from "node:test";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

import { BandedLinearSolver, DenseLinearSolver } from "../dist/index.js";
import * as MathApi from "structural-checks-ts/domain/math";

const execFileAsync = promisify(execFile);
const expectedRevision = "6f33baead8b88166c4b2cf94af41763412e3c751";
const baselinePath = process.env.STRUTTURE_JS_BASELINE_PATH
  ? path.resolve(process.env.STRUTTURE_JS_BASELINE_PATH)
  : path.resolve(import.meta.dirname, "..", "..", "strutture-js");

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
assert.equal(
  revisionOutput.trim(),
  expectedRevision,
  "Compatibility test loaded the wrong source revision.",
);
assert.equal(statusOutput.trim(), "", "Compatibility test requires a clean source worktree.");

const JavaScriptMathApi = (await import(
  pathToFileURL(path.join(baselinePath, "src", "domain", "math", "index.js")).href
)) as Record<string, unknown>;

function baselineMathExport<TExport>(name: string): TExport {
  const value = JavaScriptMathApi[name];
  assert.notEqual(value, undefined, `The baseline math API is missing ${name}.`);
  return value as TExport;
}

function approximateVector(
  actual: readonly number[],
  expected: readonly number[],
  tolerance = 1e-9,
): void {
  assert.equal(actual.length, expected.length);

  for (let index = 0; index < actual.length; index += 1) {
    const actualValue = actual[index] as number;
    const expectedValue = expected[index] as number;
    assert.ok(
      Math.abs(actualValue - expectedValue) <= tolerance,
      `${actualValue} != ${expectedValue}`,
    );
  }
}

const rectangle = [
  { x: -100, y: -50 },
  { x: 100, y: -50 },
  { x: 100, y: 50 },
  { x: -100, y: 50 },
];

void test("the public math subpath exposes the canonical source boundary", () => {
  assert.deepEqual(
    Object.keys(MathApi).sort(),
    [
      "BandedCholeskyFactorization",
      "BandedLinearSolver",
      "DenseLinearSolver",
      "GeneralBandedLUFactorization",
      "GeneralBandedLinearSolver",
      "addCompactBandedValue",
      "clamp",
      "compactBandedMatrixToDense",
      "compactBandedValue",
      "createCompactBandedMatrix",
      "createZeroMatrix",
      "createZeroVector",
      "detectMatrixSemiBandwidth",
      "rayPolygonCapacity",
      "roundTo",
      "setCompactBandedValue",
      "solveLinearSystem3x3",
    ].sort(),
  );
});

void test("ray-polygon capacity determines inside and outside demand points", () => {
  const inside = MathApi.rayPolygonCapacity(rectangle, 60, 40);
  const boundary = MathApi.rayPolygonCapacity(rectangle, 75, 50);
  const outside = MathApi.rayPolygonCapacity(rectangle, 90, 60);

  assert.ok(Math.abs((inside.intersection?.x ?? Number.NaN) - 75) < 1e-9);
  assert.ok(Math.abs((inside.intersection?.y ?? Number.NaN) - 50) < 1e-9);
  assert.ok(Math.abs((inside.capacityNorm ?? Number.NaN) - Math.hypot(75, 50)) < 1e-9);
  assert.ok(Math.abs(inside.utilizationRatio - 0.8) < 1e-12);
  assert.equal(inside.utilizationRatio <= 1, true);
  assert.ok(Math.abs(boundary.utilizationRatio - 1) < 1e-12);
  assert.equal(boundary.utilizationRatio <= 1, true);
  assert.ok(Math.abs(outside.utilizationRatio - 1.2) < 1e-12);
  assert.equal(outside.utilizationRatio <= 1, false);
});

void test("ray-polygon capacity handles zero demand without an intersection", () => {
  const result = MathApi.rayPolygonCapacity(rectangle, 0, 0);

  assert.equal(result.demandNorm, 0);
  assert.equal(result.capacityNorm, Number.POSITIVE_INFINITY);
  assert.equal(result.utilizationRatio, 0);
  assert.equal(result.intersection, null);
});

void test("ray-polygon capacity matches the pinned JavaScript baseline", () => {
  const javascriptRayPolygonCapacity =
    baselineMathExport<typeof MathApi.rayPolygonCapacity>("rayPolygonCapacity");

  for (const demand of [
    [60, 40],
    [90, 60],
    [-20, 15],
    [0, 0],
  ] as const) {
    assert.deepEqual(
      MathApi.rayPolygonCapacity(rectangle, demand[0], demand[1]),
      javascriptRayPolygonCapacity(rectangle, demand[0], demand[1]),
    );
  }
});

void test("dense linear solving and diagnostics match the source oracles", () => {
  const solver = new DenseLinearSolver();
  const result = solver.solveWithDiagnostics(
    [
      [3, 2, -1],
      [2, -2, 4],
      [-1, 0.5, -1],
    ],
    [1, -2, 0],
  );

  approximateVector(result.solution, [1, -2, -2]);
  assert.equal(result.method, "dense-gaussian-elimination-partial-pivoting");
  assert.equal(result.size, 3);
  assert.equal(result.warnings.length, 0);
  assert.ok(result.residual.infNorm < 1e-12);

  const pivoted = solver.solveWithDiagnostics(
    [
      [0, 2],
      [1, 1],
    ],
    [4, 3],
  );
  approximateVector(pivoted.solution, [1, 2]);
  assert.deepEqual(pivoted.rowPermutation, [1, 0]);
  assert.ok(Math.abs(pivoted.determinant + 2) < 1e-12);
});

void test("dense factorization is reusable and preserves its inputs", () => {
  const solver = new DenseLinearSolver();
  const matrix = [
    [0, 2, 1],
    [1, 1, 0],
    [2, 0, 3],
  ];
  const rightHandSides = [
    [7, 3, 11],
    [0, -1, 4],
  ];
  const solutions = solver.factorize(matrix).solveMany(rightHandSides);

  approximateVector(solutions[0] as number[], solver.solve(matrix, rightHandSides[0] as number[]));
  approximateVector(solutions[1] as number[], solver.solve(matrix, rightHandSides[1] as number[]));
  assert.deepEqual(matrix, [
    [0, 2, 1],
    [1, 1, 0],
    [2, 0, 3],
  ]);
});

void test("banded Cholesky solving matches the dense solver", () => {
  const matrix = [
    [4, -1, 0],
    [-1, 4, -1],
    [0, -1, 3],
  ];
  const rhs = [2, 4, 7];
  const result = new BandedLinearSolver().solveWithDiagnostics(matrix, rhs);

  approximateVector(result.solution, [1, 2, 3]);
  assert.equal(result.method, "banded-cholesky-factorization");
  assert.equal(result.bandwidth, 1);
  approximateVector(
    new BandedLinearSolver().factorize(matrix).solve([4, -1, 0]),
    new DenseLinearSolver().solve(matrix, [4, -1, 0]),
  );
});

void test("general banded pivoting solves a non-symmetric matrix and reuses its factorization", () => {
  const denseMatrix = [
    [0, 2, 0, 0],
    [1, 3, 4, 0],
    [0, 5, 6, 7],
    [0, 0, 8, 9],
  ];
  const bandedMatrix = MathApi.createCompactBandedMatrix(4, 1);
  for (let row = 0; row < denseMatrix.length; row += 1) {
    for (let column = Math.max(0, row - 1); column <= Math.min(3, row + 1); column += 1) {
      MathApi.addCompactBandedValue(bandedMatrix, row, column, denseMatrix[row]![column]!);
    }
  }
  assert.deepEqual(MathApi.compactBandedMatrixToDense(bandedMatrix), denseMatrix);
  const rightHandSides = [
    [2, 18, 46, 60],
    [4, 5, 6, 7],
  ];
  const factorization = new MathApi.GeneralBandedLinearSolver().factorize(bandedMatrix);
  const actual = factorization.solveMany(rightHandSides);
  const dense = new DenseLinearSolver();
  approximateVector(actual[0]!, dense.solve(denseMatrix, rightHandSides[0]!));
  approximateVector(actual[1]!, dense.solve(denseMatrix, rightHandSides[1]!));
});

void test("general banded storage rejects invalid bounds and singular pivots", () => {
  assert.throws(() => MathApi.createCompactBandedMatrix(0, 1), /positive integer/iu);
  const diagonal = MathApi.createCompactBandedMatrix(3, 0);
  assert.throws(
    () => MathApi.addCompactBandedValue(diagonal, 0, 1, 1),
    /outside the compact matrix bandwidth/iu,
  );
  MathApi.addCompactBandedValue(diagonal, 0, 0, 1);
  MathApi.addCompactBandedValue(diagonal, 2, 2, 1);
  assert.throws(
    () => new MathApi.GeneralBandedLinearSolver().solve(diagonal, [1, 0, 1]),
    /singular matrix near pivot 2/iu,
  );
});

void test("linear solver results match the pinned JavaScript baseline", () => {
  const JavaScriptDenseLinearSolver =
    baselineMathExport<typeof DenseLinearSolver>("DenseLinearSolver");
  const JavaScriptBandedLinearSolver =
    baselineMathExport<typeof BandedLinearSolver>("BandedLinearSolver");
  const denseMatrix = [
    [0, 2, 1],
    [1, 1, 0],
    [2, 0, 3],
  ];
  const denseRhs = [7, 3, 11];
  const bandedMatrix = [
    [4, -1, 0],
    [-1, 4, -1],
    [0, -1, 3],
  ];
  const bandedRhs = [2, 4, 7];

  assert.deepEqual(
    new DenseLinearSolver().solveWithDiagnostics(denseMatrix, denseRhs),
    new JavaScriptDenseLinearSolver().solveWithDiagnostics(denseMatrix, denseRhs),
  );
  assert.deepEqual(
    new BandedLinearSolver().solveWithDiagnostics(bandedMatrix, bandedRhs),
    new JavaScriptBandedLinearSolver().solveWithDiagnostics(bandedMatrix, bandedRhs),
  );
});

void test("linear solvers preserve baseline input validation", () => {
  const dense = new DenseLinearSolver();
  const banded = new BandedLinearSolver();

  assert.throws(() => dense.solve([[1, 2]], [1]), /square matrix/iu);
  assert.throws(() => dense.solve([[1]], [Number.NaN]), /right-hand side/iu);
  assert.throws(
    () => new DenseLinearSolver({ singularityTolerance: 0 }),
    /positive singularityTolerance/iu,
  );
  assert.throws(
    () =>
      dense.solve(
        [
          [1, 2],
          [2, 4],
        ],
        [3, 6],
      ),
    /singular matrix/iu,
  );
  assert.throws(
    () =>
      banded.solve(
        [
          [2, 1],
          [0, 2],
        ],
        [1, 1],
      ),
    /symmetric matrix/iu,
  );
  assert.throws(
    () =>
      banded.solve(
        [
          [1, 2],
          [2, 1],
        ],
        [1, 1],
      ),
    /positive-definite matrix/iu,
  );
});
