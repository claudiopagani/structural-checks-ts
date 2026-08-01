import type { NumericMatrix, NumericVector } from "./arrayLinearAlgebra.js";

export interface DenseLinearSolverOptions {
  singularityTolerance?: number;
  nearSingularityTolerance?: number;
}

export interface DenseResidual {
  infNorm: number;
  l2Norm: number;
  relativeInfNorm: number;
}

export interface DenseLinearSolverDiagnostics {
  method: "dense-gaussian-elimination-partial-pivoting";
  size: number;
  solution: NumericVector;
  rowPermutation: number[];
  pivots: number[];
  determinant: number;
  scale: number;
  minAbsPivot: number;
  maxAbsPivot: number;
  pivotScaleRatio: number;
  pivotSpreadRatio: number;
  residual: DenseResidual;
  warnings: string[];
}

interface DenseLUFactorizationOptions {
  lu: NumericMatrix;
  rowPermutation: number[];
  scale: number;
  singularityTolerance: number;
}

interface EliminationOptions {
  upperMatrix: NumericMatrix;
  transformedRhs: NumericVector;
  scale: number;
  singularityTolerance: number;
  includeDiagnostics?: boolean;
}

interface EliminationResult {
  solution: NumericVector;
  rowPermutation: number[] | null;
  pivots: number[] | null;
  determinantSign: number;
}

function matrixRow(matrix: NumericMatrix, index: number): NumericVector {
  const row = matrix[index];
  if (row === undefined) {
    throw new Error("DenseLinearSolver internal matrix row is unavailable.");
  }
  return row;
}

function vectorValue(vector: NumericVector, index: number): number {
  const value = vector[index];
  if (value === undefined) {
    throw new Error("DenseLinearSolver internal vector value is unavailable.");
  }
  return value;
}

function cloneDenseSquareMatrix(matrix: NumericMatrix): NumericMatrix {
  if (!Array.isArray(matrix) || matrix.length === 0) {
    throw new Error("DenseLinearSolver requires a non-empty matrix.");
  }

  const size = matrix.length;

  return matrix.map((row, rowIndex) => {
    if (!Array.isArray(row) || row.length !== size) {
      throw new Error("DenseLinearSolver requires a square matrix.");
    }

    return row.map((value, columnIndex) => {
      if (!Number.isFinite(value)) {
        throw new Error(
          `DenseLinearSolver matrix value at row ${rowIndex + 1}, column ${columnIndex + 1} must be finite.`,
        );
      }

      return value;
    });
  });
}

function cloneVector(vector: NumericVector, size: number): NumericVector {
  if (!Array.isArray(vector) || vector.length !== size) {
    throw new Error(
      "DenseLinearSolver requires a right-hand side vector matching the matrix size.",
    );
  }

  return vector.map((value, index) => {
    if (!Number.isFinite(value)) {
      throw new Error(
        `DenseLinearSolver right-hand side value at index ${index + 1} must be finite.`,
      );
    }

    return value;
  });
}

function matrixScale(matrix: NumericMatrix): number {
  let scale = 0;

  for (const row of matrix) {
    for (const value of row) {
      scale = Math.max(scale, Math.abs(value));
    }
  }

  return scale;
}

function computeResidual(
  matrix: NumericMatrix,
  solution: NumericVector,
  rhs: NumericVector,
): DenseResidual {
  let infNorm = 0;
  let l2NormSquared = 0;
  let rhsInfNorm = 0;

  for (let row = 0; row < matrix.length; row += 1) {
    let value = -vectorValue(rhs, row);
    rhsInfNorm = Math.max(rhsInfNorm, Math.abs(vectorValue(rhs, row)));

    for (let column = 0; column < matrix.length; column += 1) {
      value += vectorValue(matrixRow(matrix, row), column) * vectorValue(solution, column);
    }

    infNorm = Math.max(infNorm, Math.abs(value));
    l2NormSquared += value ** 2;
  }

  return {
    infNorm,
    l2Norm: Math.sqrt(l2NormSquared),
    relativeInfNorm: rhsInfNorm === 0 ? infNorm : infNorm / rhsInfNorm,
  };
}

function backSubstitute(upperMatrix: NumericMatrix, rhs: NumericVector): NumericVector {
  const size = upperMatrix.length;
  const solution = new Array<number>(size).fill(0);

  for (let row = size - 1; row >= 0; row -= 1) {
    let value = vectorValue(rhs, row);

    for (let column = row + 1; column < size; column += 1) {
      value -= vectorValue(matrixRow(upperMatrix, row), column) * vectorValue(solution, column);
    }

    solution[row] = value / vectorValue(matrixRow(upperMatrix, row), row);
  }

  return solution;
}

function eliminateAndSolve({
  upperMatrix,
  transformedRhs,
  scale,
  singularityTolerance,
  includeDiagnostics = false,
}: EliminationOptions): EliminationResult {
  const size = upperMatrix.length;
  const rowPermutation = includeDiagnostics
    ? Array.from({ length: size }, (_, index) => index)
    : null;
  const pivots: number[] | null = includeDiagnostics ? [] : null;
  let determinantSign = 1;

  for (let pivot = 0; pivot < size; pivot += 1) {
    let pivotRow = pivot;
    let pivotMagnitude = Math.abs(vectorValue(matrixRow(upperMatrix, pivot), pivot));

    for (let row = pivot + 1; row < size; row += 1) {
      const candidateMagnitude = Math.abs(vectorValue(matrixRow(upperMatrix, row), pivot));

      if (candidateMagnitude > pivotMagnitude) {
        pivotRow = row;
        pivotMagnitude = candidateMagnitude;
      }
    }

    if (pivotMagnitude <= singularityTolerance * scale) {
      throw new Error(`DenseLinearSolver detected a singular matrix near pivot ${pivot + 1}.`);
    }

    if (pivotRow !== pivot) {
      const originalPivotRow = matrixRow(upperMatrix, pivot);
      upperMatrix[pivot] = matrixRow(upperMatrix, pivotRow);
      upperMatrix[pivotRow] = originalPivotRow;

      const originalPivotRhs = vectorValue(transformedRhs, pivot);
      transformedRhs[pivot] = vectorValue(transformedRhs, pivotRow);
      transformedRhs[pivotRow] = originalPivotRhs;

      if (rowPermutation !== null) {
        const originalPermutation = rowPermutation[pivot];
        rowPermutation[pivot] = rowPermutation[pivotRow] as number;
        rowPermutation[pivotRow] = originalPermutation as number;
        determinantSign *= -1;
      }
    }

    const pivotValue = vectorValue(matrixRow(upperMatrix, pivot), pivot);
    pivots?.push(pivotValue);

    for (let row = pivot + 1; row < size; row += 1) {
      const rowValues = matrixRow(upperMatrix, row);
      const factor = vectorValue(rowValues, pivot) / pivotValue;
      rowValues[pivot] = 0;

      for (let column = pivot + 1; column < size; column += 1) {
        rowValues[column] =
          vectorValue(rowValues, column) -
          factor * vectorValue(matrixRow(upperMatrix, pivot), column);
      }

      transformedRhs[row] =
        vectorValue(transformedRhs, row) - factor * vectorValue(transformedRhs, pivot);
    }
  }

  return {
    solution: backSubstitute(upperMatrix, transformedRhs),
    rowPermutation,
    pivots,
    determinantSign,
  };
}

export class DenseLUFactorization {
  readonly lu: NumericMatrix;
  readonly rowPermutation: number[];
  readonly scale: number;
  readonly singularityTolerance: number;
  readonly size: number;
  readonly pivots: number[];

  constructor({ lu, rowPermutation, scale, singularityTolerance }: DenseLUFactorizationOptions) {
    this.lu = lu;
    this.rowPermutation = rowPermutation;
    this.scale = scale;
    this.singularityTolerance = singularityTolerance;
    this.size = lu.length;
    this.pivots = lu.map((row, index) => vectorValue(row, index));
  }

  solve(rhs: NumericVector): NumericVector {
    const originalRhs = cloneVector(rhs, this.size);
    const transformedRhs = this.rowPermutation.map((originalRow) =>
      vectorValue(originalRhs, originalRow),
    );

    for (let row = 0; row < this.size; row += 1) {
      for (let column = 0; column < row; column += 1) {
        transformedRhs[row] =
          vectorValue(transformedRhs, row) -
          vectorValue(matrixRow(this.lu, row), column) * vectorValue(transformedRhs, column);
      }
    }

    return backSubstitute(this.lu, transformedRhs);
  }

  solveMany(rightHandSides: NumericVector[]): NumericVector[] {
    if (!Array.isArray(rightHandSides)) {
      throw new Error("DenseLUFactorization solveMany requires an array of vectors.");
    }

    return rightHandSides.map((rhs) => this.solve(rhs));
  }
}

function factorizeDenseMatrix(
  matrix: NumericMatrix,
  singularityTolerance: number,
): DenseLUFactorization {
  const lu = cloneDenseSquareMatrix(matrix);
  const size = lu.length;
  const scale = matrixScale(lu);
  const rowPermutation = Array.from({ length: size }, (_, index) => index);

  if (scale === 0) {
    throw new Error("DenseLinearSolver detected a singular matrix with zero stiffness scale.");
  }

  for (let pivot = 0; pivot < size; pivot += 1) {
    let pivotRow = pivot;
    let pivotMagnitude = Math.abs(vectorValue(matrixRow(lu, pivot), pivot));

    for (let row = pivot + 1; row < size; row += 1) {
      const candidateMagnitude = Math.abs(vectorValue(matrixRow(lu, row), pivot));

      if (candidateMagnitude > pivotMagnitude) {
        pivotRow = row;
        pivotMagnitude = candidateMagnitude;
      }
    }

    if (pivotMagnitude <= singularityTolerance * scale) {
      throw new Error(`DenseLinearSolver detected a singular matrix near pivot ${pivot + 1}.`);
    }

    if (pivotRow !== pivot) {
      const originalPivotRow = matrixRow(lu, pivot);
      lu[pivot] = matrixRow(lu, pivotRow);
      lu[pivotRow] = originalPivotRow;

      const originalPermutation = rowPermutation[pivot];
      rowPermutation[pivot] = rowPermutation[pivotRow] as number;
      rowPermutation[pivotRow] = originalPermutation as number;
    }

    const pivotValue = vectorValue(matrixRow(lu, pivot), pivot);

    for (let row = pivot + 1; row < size; row += 1) {
      const rowValues = matrixRow(lu, row);
      const factor = vectorValue(rowValues, pivot) / pivotValue;
      rowValues[pivot] = factor;

      for (let column = pivot + 1; column < size; column += 1) {
        rowValues[column] =
          vectorValue(rowValues, column) - factor * vectorValue(matrixRow(lu, pivot), column);
      }
    }
  }

  return new DenseLUFactorization({
    lu,
    rowPermutation,
    scale,
    singularityTolerance,
  });
}

export class DenseLinearSolver {
  readonly singularityTolerance: number;
  readonly nearSingularityTolerance: number;

  constructor({
    singularityTolerance = 1e-12,
    nearSingularityTolerance = 1e-9,
  }: DenseLinearSolverOptions = {}) {
    if (!Number.isFinite(singularityTolerance) || singularityTolerance <= 0) {
      throw new Error("DenseLinearSolver requires a positive singularityTolerance.");
    }

    if (!Number.isFinite(nearSingularityTolerance) || nearSingularityTolerance <= 0) {
      throw new Error("DenseLinearSolver requires a positive nearSingularityTolerance.");
    }

    if (nearSingularityTolerance < singularityTolerance) {
      throw new Error(
        "DenseLinearSolver nearSingularityTolerance must be greater than or equal to singularityTolerance.",
      );
    }

    this.singularityTolerance = singularityTolerance;
    this.nearSingularityTolerance = nearSingularityTolerance;
  }

  solve(matrix: NumericMatrix, rhs: NumericVector): NumericVector {
    const upperMatrix = cloneDenseSquareMatrix(matrix);
    const transformedRhs = cloneVector(rhs, upperMatrix.length);
    const scale = matrixScale(upperMatrix);

    if (scale === 0) {
      throw new Error("DenseLinearSolver detected a singular matrix with zero stiffness scale.");
    }

    return eliminateAndSolve({
      upperMatrix,
      transformedRhs,
      scale,
      singularityTolerance: this.singularityTolerance,
    }).solution;
  }

  factorize(matrix: NumericMatrix): DenseLUFactorization {
    return factorizeDenseMatrix(matrix, this.singularityTolerance);
  }

  solveWithDiagnostics(matrix: NumericMatrix, rhs: NumericVector): DenseLinearSolverDiagnostics {
    const originalMatrix = cloneDenseSquareMatrix(matrix);
    const originalRhs = cloneVector(rhs, originalMatrix.length);
    const upperMatrix = originalMatrix.map((row) => [...row]);
    const transformedRhs = [...originalRhs];
    const size = upperMatrix.length;
    const scale = matrixScale(upperMatrix);

    if (scale === 0) {
      throw new Error("DenseLinearSolver detected a singular matrix with zero stiffness scale.");
    }

    const elimination = eliminateAndSolve({
      upperMatrix,
      transformedRhs,
      scale,
      singularityTolerance: this.singularityTolerance,
      includeDiagnostics: true,
    });
    const { solution, determinantSign } = elimination;
    const rowPermutation = elimination.rowPermutation as number[];
    const pivots = elimination.pivots as number[];
    const absPivots = pivots.map((value) => Math.abs(value));
    const minAbsPivot = Math.min(...absPivots);
    const maxAbsPivot = Math.max(...absPivots);
    const pivotScaleRatio = minAbsPivot / scale;
    const pivotSpreadRatio =
      maxAbsPivot === 0 ? Number.POSITIVE_INFINITY : minAbsPivot / maxAbsPivot;
    const warnings: string[] = [];

    if (
      pivotScaleRatio <= this.nearSingularityTolerance ||
      pivotSpreadRatio <= this.nearSingularityTolerance
    ) {
      warnings.push("DenseLinearSolver detected a small pivot; the matrix may be ill-conditioned.");
    }

    return {
      method: "dense-gaussian-elimination-partial-pivoting",
      size,
      solution,
      rowPermutation,
      pivots,
      determinant: determinantSign * pivots.reduce((product, value) => product * value, 1),
      scale,
      minAbsPivot,
      maxAbsPivot,
      pivotScaleRatio,
      pivotSpreadRatio,
      residual: computeResidual(originalMatrix, solution, originalRhs),
      warnings,
    };
  }
}
