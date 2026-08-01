export type NumericVector = number[];
export type NumericMatrix = number[][];

function matrixRow(matrix: NumericMatrix, index: number): NumericVector {
  const row = matrix[index];
  if (row === undefined) {
    throw new Error("Matrix row is unavailable.");
  }
  return row;
}

function vectorValue(vector: NumericVector, index: number): number {
  const value = vector[index];
  if (value === undefined) {
    throw new Error("Vector value is unavailable.");
  }
  return value;
}

export function createZeroVector(size: number): NumericVector {
  if (!Number.isInteger(size) || size < 0) {
    throw new Error("Vector size must be a non-negative integer.");
  }

  return new Array<number>(size).fill(0);
}

export function createZeroMatrix(rows: number, columns = rows): NumericMatrix {
  if (!Number.isInteger(rows) || rows < 0 || !Number.isInteger(columns) || columns < 0) {
    throw new Error("Matrix dimensions must be non-negative integers.");
  }

  return Array.from({ length: rows }, () => new Array<number>(columns).fill(0));
}

export function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

export function roundTo(value: number, decimals = 6): number {
  return Number.isFinite(value) ? Number(value.toFixed(decimals)) : value;
}

export function solveLinearSystem3x3(
  matrix: NumericMatrix,
  vector: NumericVector,
): [number, number, number] {
  if (
    !Array.isArray(matrix) ||
    matrix.length !== 3 ||
    matrix.some((row) => !Array.isArray(row) || row.length !== 3) ||
    !Array.isArray(vector) ||
    vector.length !== 3
  ) {
    throw new Error("A finite 3x3 matrix and three-entry vector are required.");
  }

  const augmented = matrix.map((row, index) => [...row, vectorValue(vector, index)]);

  if (augmented.some((row) => row.some((value) => !Number.isFinite(value)))) {
    throw new Error("A finite 3x3 matrix and three-entry vector are required.");
  }

  for (let pivot = 0; pivot < 3; pivot += 1) {
    let maxRow = pivot;

    for (let row = pivot + 1; row < 3; row += 1) {
      if (
        Math.abs(vectorValue(matrixRow(augmented, row), pivot)) >
        Math.abs(vectorValue(matrixRow(augmented, maxRow), pivot))
      ) {
        maxRow = row;
      }
    }

    if (Math.abs(vectorValue(matrixRow(augmented, maxRow), pivot)) < 1e-18) {
      throw new Error("Singular 3x3 linear system.");
    }

    if (maxRow !== pivot) {
      const pivotRow = matrixRow(augmented, pivot);
      augmented[pivot] = matrixRow(augmented, maxRow);
      augmented[maxRow] = pivotRow;
    }

    const pivotValues = matrixRow(augmented, pivot);
    const pivotValue = vectorValue(pivotValues, pivot);

    for (let column = pivot; column < 4; column += 1) {
      pivotValues[column] = vectorValue(pivotValues, column) / pivotValue;
    }

    for (let row = 0; row < 3; row += 1) {
      if (row === pivot) {
        continue;
      }

      const rowValues = matrixRow(augmented, row);
      const factor = vectorValue(rowValues, pivot);

      for (let column = pivot; column < 4; column += 1) {
        rowValues[column] =
          vectorValue(rowValues, column) - factor * vectorValue(pivotValues, column);
      }
    }
  }

  return [
    vectorValue(matrixRow(augmented, 0), 3),
    vectorValue(matrixRow(augmented, 1), 3),
    vectorValue(matrixRow(augmented, 2), 3),
  ];
}
