import {
  createZeroMatrix,
  createZeroVector,
  type NumericMatrix,
  type NumericVector,
} from "./arrayLinearAlgebra.js";

export interface BandedLinearSolverOptions {
  bandwidth?: number | null;
  singularityTolerance?: number;
  symmetryTolerance?: number;
}

export interface BandedLinearSolverDiagnostics {
  method: "banded-cholesky-factorization";
  size: number;
  bandwidth: number;
  solution: NumericVector;
  warnings: string[];
}

interface BandedCholeskyFactorizationOptions {
  lower: NumericMatrix;
  bandwidth: number;
}

function matrixRow(matrix: NumericMatrix, index: number): NumericVector {
  const row = matrix[index];
  if (row === undefined) {
    throw new Error("BandedLinearSolver internal matrix row is unavailable.");
  }
  return row;
}

function vectorValue(vector: NumericVector, index: number): number {
  const value = vector[index];
  if (value === undefined) {
    throw new Error("BandedLinearSolver internal vector value is unavailable.");
  }
  return value;
}

function cloneSymmetricMatrix(matrix: NumericMatrix, symmetryTolerance: number): NumericMatrix {
  if (!Array.isArray(matrix) || matrix.length === 0) {
    throw new Error("BandedLinearSolver requires a non-empty matrix.");
  }

  const size = matrix.length;
  const clone = matrix.map((row, rowIndex) => {
    if (!Array.isArray(row) || row.length !== size) {
      throw new Error("BandedLinearSolver requires a square matrix.");
    }

    return row.map((value, columnIndex) => {
      if (!Number.isFinite(value)) {
        throw new Error(
          `BandedLinearSolver matrix value at row ${rowIndex + 1}, column ${columnIndex + 1} must be finite.`,
        );
      }

      return value;
    });
  });

  for (let row = 0; row < size; row += 1) {
    for (let column = 0; column < row; column += 1) {
      const rowValue = vectorValue(matrixRow(clone, row), column);
      const columnValue = vectorValue(matrixRow(clone, column), row);
      const scale = Math.max(1, Math.abs(rowValue), Math.abs(columnValue));

      if (Math.abs(rowValue - columnValue) > symmetryTolerance * scale) {
        throw new Error("BandedLinearSolver requires a symmetric matrix.");
      }
    }
  }

  return clone;
}

function cloneVector(vector: NumericVector, size: number): NumericVector {
  if (!Array.isArray(vector) || vector.length !== size) {
    throw new Error(
      "BandedLinearSolver requires a right-hand side vector matching the matrix size.",
    );
  }

  return vector.map((value, index) => {
    if (!Number.isFinite(value)) {
      throw new Error(
        `BandedLinearSolver right-hand side value at index ${index + 1} must be finite.`,
      );
    }

    return value;
  });
}

function matrixScale(matrix: NumericMatrix): number {
  return matrix.reduce(
    (scale, row) => row.reduce((rowScale, value) => Math.max(rowScale, Math.abs(value)), scale),
    0,
  );
}

export function detectMatrixSemiBandwidth(matrix: NumericMatrix, zeroTolerance = 0): number {
  let bandwidth = 0;

  for (let row = 0; row < matrix.length; row += 1) {
    for (let column = 0; column < matrix.length; column += 1) {
      if (Math.abs(vectorValue(matrixRow(matrix, row), column)) > zeroTolerance) {
        bandwidth = Math.max(bandwidth, Math.abs(row - column));
      }
    }
  }

  return bandwidth;
}

export class BandedCholeskyFactorization {
  readonly lower: NumericMatrix;
  readonly bandwidth: number;
  readonly size: number;

  constructor({ lower, bandwidth }: BandedCholeskyFactorizationOptions) {
    this.lower = lower;
    this.bandwidth = bandwidth;
    this.size = lower.length;
  }

  solve(rhs: NumericVector): NumericVector {
    const vector = cloneVector(rhs, this.size);
    const intermediate = createZeroVector(this.size);
    const solution = createZeroVector(this.size);

    for (let row = 0; row < this.size; row += 1) {
      let value = vectorValue(vector, row);
      const firstColumn = Math.max(0, row - this.bandwidth);

      for (let column = firstColumn; column < row; column += 1) {
        value -=
          vectorValue(matrixRow(this.lower, row), column) * vectorValue(intermediate, column);
      }

      intermediate[row] = value / vectorValue(matrixRow(this.lower, row), row);
    }

    for (let row = this.size - 1; row >= 0; row -= 1) {
      let value = vectorValue(intermediate, row);
      const lastColumn = Math.min(this.size - 1, row + this.bandwidth);

      for (let column = row + 1; column <= lastColumn; column += 1) {
        value -= vectorValue(matrixRow(this.lower, column), row) * vectorValue(solution, column);
      }

      solution[row] = value / vectorValue(matrixRow(this.lower, row), row);
    }

    return solution;
  }

  solveMany(rightHandSides: NumericVector[]): NumericVector[] {
    if (!Array.isArray(rightHandSides)) {
      throw new Error("BandedCholeskyFactorization solveMany requires an array of vectors.");
    }

    return rightHandSides.map((rhs) => this.solve(rhs));
  }
}

export class BandedLinearSolver {
  readonly bandwidth: number | null;
  readonly singularityTolerance: number;
  readonly symmetryTolerance: number;

  constructor({
    bandwidth = null,
    singularityTolerance = 1e-12,
    symmetryTolerance = 1e-10,
  }: BandedLinearSolverOptions = {}) {
    if (bandwidth !== null && (!Number.isInteger(bandwidth) || bandwidth < 0)) {
      throw new Error("BandedLinearSolver bandwidth must be a non-negative integer.");
    }

    this.bandwidth = bandwidth;
    this.singularityTolerance = singularityTolerance;
    this.symmetryTolerance = symmetryTolerance;
  }

  factorize(matrix: NumericMatrix): BandedCholeskyFactorization {
    const source = cloneSymmetricMatrix(matrix, this.symmetryTolerance);
    const size = source.length;
    const bandwidth = this.bandwidth ?? detectMatrixSemiBandwidth(source);
    const scale = matrixScale(source);
    const lower = createZeroMatrix(size);

    if (scale === 0) {
      throw new Error("BandedLinearSolver detected a singular matrix with zero stiffness scale.");
    }

    for (let row = 0; row < size; row += 1) {
      const firstColumn = Math.max(0, row - bandwidth);

      for (let column = firstColumn; column <= row; column += 1) {
        let value = vectorValue(matrixRow(source, row), column);
        const firstProduct = Math.max(0, row - bandwidth, column - bandwidth);

        for (let index = firstProduct; index < column; index += 1) {
          value -=
            vectorValue(matrixRow(lower, row), index) *
            vectorValue(matrixRow(lower, column), index);
        }

        if (row === column) {
          if (value <= this.singularityTolerance * scale) {
            throw new Error(
              `BandedLinearSolver requires a positive-definite matrix near pivot ${row + 1}.`,
            );
          }

          matrixRow(lower, row)[column] = Math.sqrt(value);
        } else {
          matrixRow(lower, row)[column] = value / vectorValue(matrixRow(lower, column), column);
        }
      }
    }

    return new BandedCholeskyFactorization({ lower, bandwidth });
  }

  solve(matrix: NumericMatrix, rhs: NumericVector): NumericVector {
    return this.factorize(matrix).solve(rhs);
  }

  solveWithDiagnostics(matrix: NumericMatrix, rhs: NumericVector): BandedLinearSolverDiagnostics {
    const factorization = this.factorize(matrix);
    const solution = factorization.solve(rhs);

    return {
      method: "banded-cholesky-factorization",
      size: factorization.size,
      bandwidth: factorization.bandwidth,
      solution,
      warnings: [],
    };
  }
}
