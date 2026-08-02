// Mechanical TypeScript migration from strutture-js 6f33baead8b88166c4b2cf94af41763412e3c751;
// source path: src/domain/fem/elements/masonry/MasonryPierKinematics.js.

import {
  createZeroMatrix,
  type NumericMatrix,
  type NumericVector,
} from "../../../math/arrayLinearAlgebra.js";

export function transpose(matrix: NumericMatrix): NumericMatrix {
  return matrix[0]!.map((_, column) => matrix.map((row) => row[column]!));
}

export function multiplyMatrices(left: NumericMatrix, right: NumericMatrix): NumericMatrix {
  return left.map((leftRow) =>
    right[0]!.map((_, column) =>
      leftRow.reduce((sum, value, index) => sum + value * right[index]![column]!, 0),
    ),
  );
}

export function multiplyMatrixVector(matrix: NumericMatrix, vector: NumericVector): NumericVector {
  return matrix.map((row) => row.reduce((sum, value, index) => sum + value * vector[index]!, 0));
}

export function subtractVectors(left: NumericVector, right: NumericVector): NumericVector {
  return left.map((value, index) => value - right[index]!);
}

export function addVectors(left: NumericVector, right: NumericVector): NumericVector {
  return left.map((value, index) => value + right[index]!);
}

export function subtractMatrices(left: NumericMatrix, right: NumericMatrix): NumericMatrix {
  return left.map((row, rowIndex) =>
    row.map((value, columnIndex) => value - right[rowIndex]![columnIndex]!),
  );
}

export function identityMatrix(size: number): NumericMatrix {
  const matrix = createZeroMatrix(size);

  for (let index = 0; index < size; index += 1) {
    matrix[index]![index] = 1;
  }

  return matrix;
}

/**
 * Basic frame deformations [axial elongation, end-I rotation relative to
 * chord, end-J rotation relative to chord].
 */
export function masonryPierBasicKinematicMatrix(length: number): NumericMatrix {
  return [
    [-1, 0, 0, 1, 0, 0],
    [0, 1 / length, 1, 0, -1 / length, 0],
    [0, 1 / length, 0, 0, -1 / length, 1],
  ];
}

/**
 * Compatibility v = v_body + C*z for
 * z=[deltaI, phiI, deltaJ, phiJ, deltaShear].
 */
export function masonryPierComponentCompatibilityMatrix(length: number): NumericMatrix {
  return [
    [1, 0, 1, 0, 0],
    [0, 1, 0, 0, -1 / length],
    [0, 0, 0, 1, -1 / length],
  ];
}

export function frameTransformationMatrix(c: number, s: number): NumericMatrix {
  return [
    [c, s, 0, 0, 0, 0],
    [-s, c, 0, 0, 0, 0],
    [0, 0, 1, 0, 0, 0],
    [0, 0, 0, c, s, 0],
    [0, 0, 0, -s, c, 0],
    [0, 0, 0, 0, 0, 1],
  ];
}
