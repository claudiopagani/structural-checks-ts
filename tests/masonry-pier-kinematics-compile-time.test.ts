import test from "node:test";

import {
  addVectors,
  frameTransformationMatrix,
  identityMatrix,
  masonryPierBasicKinematicMatrix,
  masonryPierComponentCompatibilityMatrix,
  multiplyMatrices,
  multiplyMatrixVector,
  subtractMatrices,
  subtractVectors,
  transpose,
} from "../dist/domain/fem/elements/masonry/MasonryPierKinematics.js";
import type { NumericMatrix, NumericVector } from "../dist/domain/math/arrayLinearAlgebra.js";

const matrix: NumericMatrix = [
  [1, 2],
  [3, 4],
];
const vector: NumericVector = [5, 6];
const transposed: NumericMatrix = transpose(matrix);
const product: NumericMatrix = multiplyMatrices(matrix, transposed);
const vectorProduct: NumericVector = multiplyMatrixVector(matrix, vector);
const difference: NumericVector = subtractVectors(vector, vector);
const sum: NumericVector = addVectors(vector, vector);
const matrixDifference: NumericMatrix = subtractMatrices(matrix, matrix);
const identity: NumericMatrix = identityMatrix(2);
const basic: NumericMatrix = masonryPierBasicKinematicMatrix(3);
const compatibility: NumericMatrix = masonryPierComponentCompatibilityMatrix(3);
const transformation: NumericMatrix = frameTransformationMatrix(1, 0);

void test("masonry pier kinematics expose strict typed matrix contracts", () => {
  void transposed;
  void product;
  void vectorProduct;
  void difference;
  void sum;
  void matrixDifference;
  void identity;
  void basic;
  void compatibility;
  void transformation;
});
