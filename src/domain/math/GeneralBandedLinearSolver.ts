import type { NumericMatrix, NumericVector } from "./arrayLinearAlgebra.js";
import { SingularMatrixError } from "./SingularMatrixError.js";

export interface CompactBandedMatrix {
  readonly size: number;
  readonly lowerBandwidth: number;
  readonly upperBandwidth: number;
  readonly values: Float64Array;
}

export interface GeneralBandedLinearSolverOptions {
  readonly singularityTolerance?: number;
}

function validateSize(size: number, label: string): number {
  if (!Number.isInteger(size) || size <= 0) throw new Error(`${label} must be a positive integer.`);
  return size;
}

function validateBandwidth(value: number, label: string): number {
  if (!Number.isInteger(value) || value < 0)
    throw new Error(`${label} must be a non-negative integer.`);
  return value;
}

function storageIndex(matrix: CompactBandedMatrix, row: number, column: number): number | null {
  if (row < 0 || row >= matrix.size || column < 0 || column >= matrix.size) {
    throw new Error("Compact banded matrix index is outside the matrix bounds.");
  }
  const diagonalOffset = column - row;
  if (diagonalOffset < -matrix.lowerBandwidth || diagonalOffset > matrix.upperBandwidth)
    return null;
  return (
    row * (matrix.lowerBandwidth + matrix.upperBandwidth + 1) +
    diagonalOffset +
    matrix.lowerBandwidth
  );
}

export function createCompactBandedMatrix(
  size: number,
  lowerBandwidth: number,
  upperBandwidth = lowerBandwidth,
): CompactBandedMatrix {
  const resolvedSize = validateSize(size, "Compact banded matrix size");
  const resolvedLower = validateBandwidth(lowerBandwidth, "Compact banded matrix lowerBandwidth");
  const resolvedUpper = validateBandwidth(upperBandwidth, "Compact banded matrix upperBandwidth");
  return {
    size: resolvedSize,
    lowerBandwidth: resolvedLower,
    upperBandwidth: resolvedUpper,
    values: new Float64Array(resolvedSize * (resolvedLower + resolvedUpper + 1)),
  };
}

export function compactBandedValue(
  matrix: CompactBandedMatrix,
  row: number,
  column: number,
): number {
  const index = storageIndex(matrix, row, column);
  return index === null ? 0 : matrix.values[index]!;
}

export function addCompactBandedValue(
  matrix: CompactBandedMatrix,
  row: number,
  column: number,
  value: number,
): void {
  if (!Number.isFinite(value)) throw new Error("Compact banded matrix additions must be finite.");
  const index = storageIndex(matrix, row, column);
  if (index === null) {
    if (value !== 0) throw new Error("A nonzero value lies outside the compact matrix bandwidth.");
    return;
  }
  matrix.values[index] = matrix.values[index]! + value;
}

export function setCompactBandedValue(
  matrix: CompactBandedMatrix,
  row: number,
  column: number,
  value: number,
): void {
  if (!Number.isFinite(value)) throw new Error("Compact banded matrix values must be finite.");
  const index = storageIndex(matrix, row, column);
  if (index === null) {
    if (value !== 0) throw new Error("A nonzero value lies outside the compact matrix bandwidth.");
    return;
  }
  matrix.values[index] = value;
}

export function compactBandedMatrixToDense(matrix: CompactBandedMatrix): NumericMatrix {
  const dense = Array.from({ length: matrix.size }, () => new Array<number>(matrix.size).fill(0));
  for (let row = 0; row < matrix.size; row += 1) {
    const firstColumn = Math.max(0, row - matrix.lowerBandwidth);
    const lastColumn = Math.min(matrix.size - 1, row + matrix.upperBandwidth);
    for (let column = firstColumn; column <= lastColumn; column += 1) {
      dense[row]![column] = compactBandedValue(matrix, row, column);
    }
  }
  return dense;
}

function validateVector(vector: NumericVector, size: number): NumericVector {
  if (!Array.isArray(vector) || vector.length !== size) {
    throw new Error(
      "GeneralBandedLinearSolver requires a right-hand side vector matching the matrix size.",
    );
  }
  return vector.map((value, index) => {
    if (!Number.isFinite(value)) {
      throw new Error(
        `GeneralBandedLinearSolver right-hand side value at index ${index + 1} must be finite.`,
      );
    }
    return value;
  });
}

/** LU factorization of a general band matrix with row pivoting restricted to the lower band. */
export class GeneralBandedLUFactorization {
  readonly size: number;
  readonly rows: readonly Map<number, number>[];
  readonly rowSwaps: readonly number[];

  constructor({ rows, rowSwaps }: { rows: Map<number, number>[]; rowSwaps: number[] }) {
    this.size = rows.length;
    this.rows = rows;
    this.rowSwaps = rowSwaps;
  }

  solve(rhs: NumericVector): NumericVector {
    const solution = validateVector(rhs, this.size);
    for (let pivot = 0; pivot < this.size; pivot += 1) {
      const swap = this.rowSwaps[pivot]!;
      if (swap !== pivot) [solution[pivot], solution[swap]] = [solution[swap]!, solution[pivot]!];
    }
    for (let row = 0; row < this.size; row += 1) {
      for (const [column, value] of this.rows[row]!) {
        if (column < row) solution[row] = solution[row]! - value * solution[column]!;
      }
    }
    for (let row = this.size - 1; row >= 0; row -= 1) {
      let value = solution[row]!;
      let diagonal = 0;
      for (const [column, coefficient] of this.rows[row]!) {
        if (column === row) diagonal = coefficient;
        else if (column > row) value -= coefficient * solution[column]!;
      }
      solution[row] = value / diagonal;
    }
    return solution;
  }

  solveMany(rightHandSides: readonly NumericVector[]): NumericVector[] {
    return rightHandSides.map((rightHandSide) => this.solve(rightHandSide));
  }
}

export class GeneralBandedLinearSolver {
  readonly singularityTolerance: number;

  constructor({ singularityTolerance = 1e-12 }: GeneralBandedLinearSolverOptions = {}) {
    if (!Number.isFinite(singularityTolerance) || singularityTolerance <= 0) {
      throw new Error("GeneralBandedLinearSolver requires a positive singularityTolerance.");
    }
    this.singularityTolerance = singularityTolerance;
  }

  factorize(matrix: CompactBandedMatrix): GeneralBandedLUFactorization {
    validateSize(matrix.size, "General banded matrix size");
    validateBandwidth(matrix.lowerBandwidth, "General banded matrix lowerBandwidth");
    validateBandwidth(matrix.upperBandwidth, "General banded matrix upperBandwidth");
    const expectedLength = matrix.size * (matrix.lowerBandwidth + matrix.upperBandwidth + 1);
    if (matrix.values.length !== expectedLength) {
      throw new Error("General banded matrix storage length is inconsistent with its dimensions.");
    }
    const rows = Array.from({ length: matrix.size }, (_, row) => {
      const values = new Map<number, number>();
      const firstColumn = Math.max(0, row - matrix.lowerBandwidth);
      const lastColumn = Math.min(matrix.size - 1, row + matrix.upperBandwidth);
      for (let column = firstColumn; column <= lastColumn; column += 1) {
        const value = compactBandedValue(matrix, row, column);
        if (!Number.isFinite(value)) {
          throw new Error(
            `GeneralBandedLinearSolver matrix value at row ${row + 1}, column ${column + 1} must be finite.`,
          );
        }
        if (value !== 0) values.set(column, value);
      }
      return values;
    });
    const scale = matrix.values.reduce((maximum, value) => Math.max(maximum, Math.abs(value)), 0);
    if (scale === 0) {
      throw new SingularMatrixError(
        "GeneralBandedLinearSolver detected a singular matrix with zero stiffness scale.",
      );
    }
    const rowSwaps = new Array<number>(matrix.size).fill(0);
    for (let pivot = 0; pivot < matrix.size; pivot += 1) {
      const lastCandidate = Math.min(matrix.size - 1, pivot + matrix.lowerBandwidth);
      let bestRow = pivot;
      let bestValue = Math.abs(rows[pivot]!.get(pivot) ?? 0);
      for (let row = pivot + 1; row <= lastCandidate; row += 1) {
        const candidate = Math.abs(rows[row]!.get(pivot) ?? 0);
        if (candidate > bestValue) {
          bestValue = candidate;
          bestRow = row;
        }
      }
      if (bestValue <= this.singularityTolerance * scale) {
        throw new SingularMatrixError(
          `GeneralBandedLinearSolver detected a singular matrix near pivot ${pivot + 1}.`,
        );
      }
      rowSwaps[pivot] = bestRow;
      if (bestRow !== pivot) [rows[pivot], rows[bestRow]] = [rows[bestRow]!, rows[pivot]!];
      const pivotRow = rows[pivot]!;
      const pivotValue = pivotRow.get(pivot)!;
      for (let row = pivot + 1; row <= lastCandidate; row += 1) {
        const targetRow = rows[row]!;
        const entry = targetRow.get(pivot) ?? 0;
        if (entry === 0) continue;
        const factor = entry / pivotValue;
        targetRow.set(pivot, factor);
        for (const [column, value] of pivotRow) {
          if (column <= pivot) continue;
          const updated = (targetRow.get(column) ?? 0) - factor * value;
          if (updated === 0) targetRow.delete(column);
          else targetRow.set(column, updated);
        }
      }
    }
    return new GeneralBandedLUFactorization({ rows, rowSwaps });
  }

  solve(matrix: CompactBandedMatrix, rhs: NumericVector): NumericVector {
    return this.factorize(matrix).solve(rhs);
  }
}
