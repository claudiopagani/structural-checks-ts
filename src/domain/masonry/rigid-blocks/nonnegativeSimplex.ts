export interface NonnegativeLinearProgram {
  readonly matrix: readonly (readonly number[])[];
  readonly rightHandSide: readonly number[];
  readonly objective: readonly number[];
}

export interface NonnegativeLinearProgramOptions {
  readonly tolerance?: number;
  readonly maxIterations?: number;
}

export interface NonnegativeLinearProgramResult {
  readonly status: "optimal" | "unbounded" | "iteration-limit";
  readonly solution: readonly number[];
  readonly objectiveValue: number;
  readonly iterations: number;
}

function finite(value: number, label: string): number {
  if (!Number.isFinite(value)) {
    throw new Error(`${label} must be finite.`);
  }
  return value;
}

/**
 * Deterministic primal simplex for `max c^T x` subject to `A x <= b`, `x >= 0`, and `b >= 0`.
 *
 * This small internal kernel is intentionally limited to the feasible-slack form used by the
 * fixed-dimensional rigid-block equilibrium problem. Bland ordering prevents cycling.
 */
export function maximizeNonnegativeLinearProgram(
  { matrix, rightHandSide, objective }: NonnegativeLinearProgram,
  { tolerance = 1e-11, maxIterations = 20_000 }: NonnegativeLinearProgramOptions = {},
): NonnegativeLinearProgramResult {
  if (!Number.isFinite(tolerance) || tolerance <= 0) {
    throw new Error("Simplex tolerance must be finite and positive.");
  }
  if (!Number.isInteger(maxIterations) || maxIterations <= 0) {
    throw new Error("Simplex maxIterations must be a positive integer.");
  }

  const constraintCount = matrix.length;
  const variableCount = objective.length;
  if (rightHandSide.length !== constraintCount) {
    throw new Error("Simplex matrix and right-hand-side row counts must match.");
  }
  if (variableCount === 0) {
    throw new Error("Simplex objective must contain at least one variable.");
  }

  const rowCount = constraintCount + 1;
  const columnCount = variableCount + constraintCount + 1;
  const rightHandSideColumn = columnCount - 1;
  const objectiveRow = constraintCount;
  const tableau = new Float64Array(rowCount * columnCount);
  const basis = new Int32Array(constraintCount);
  const cell = (row: number, column: number): number => row * columnCount + column;
  const readCell = (row: number, column: number): number => tableau[cell(row, column)] ?? 0;
  const writeCell = (row: number, column: number, value: number): void => {
    tableau[cell(row, column)] = value;
  };

  for (let row = 0; row < constraintCount; row += 1) {
    const coefficients = matrix[row];
    if (coefficients === undefined || coefficients.length !== variableCount) {
      throw new Error(`Simplex row ${row} must contain ${variableCount} coefficients.`);
    }
    for (let column = 0; column < variableCount; column += 1) {
      tableau[cell(row, column)] = finite(
        coefficients[column] ?? Number.NaN,
        `Simplex coefficient [${row}, ${column}]`,
      );
    }
    tableau[cell(row, variableCount + row)] = 1;
    const value = finite(rightHandSide[row] ?? Number.NaN, `Simplex right-hand side ${row}`);
    if (value < -tolerance) {
      throw new Error("Simplex feasible-slack form requires non-negative right-hand sides.");
    }
    tableau[cell(row, rightHandSideColumn)] = Math.max(0, value);
    basis[row] = variableCount + row;
  }

  for (let column = 0; column < variableCount; column += 1) {
    tableau[cell(objectiveRow, column)] = -finite(
      objective[column] ?? Number.NaN,
      `Simplex objective coefficient ${column}`,
    );
  }

  let iterations = 0;
  let status: NonnegativeLinearProgramResult["status"] = "optimal";

  while (iterations < maxIterations) {
    let enteringColumn = -1;
    for (let column = 0; column < rightHandSideColumn; column += 1) {
      if (readCell(objectiveRow, column) < -tolerance) {
        enteringColumn = column;
        break;
      }
    }
    if (enteringColumn < 0) {
      status = "optimal";
      break;
    }

    let leavingRow = -1;
    let smallestRatio = Number.POSITIVE_INFINITY;
    for (let row = 0; row < constraintCount; row += 1) {
      const coefficient = readCell(row, enteringColumn);
      if (coefficient <= tolerance) {
        continue;
      }
      const ratio = readCell(row, rightHandSideColumn) / coefficient;
      const ratioTolerance = tolerance * Math.max(1, Math.abs(smallestRatio));
      if (
        leavingRow < 0 ||
        ratio < smallestRatio - ratioTolerance ||
        (Math.abs(ratio - smallestRatio) <= ratioTolerance && basis[row]! < basis[leavingRow]!)
      ) {
        smallestRatio = ratio;
        leavingRow = row;
      }
    }

    if (leavingRow < 0) {
      status = "unbounded";
      break;
    }

    const pivot = readCell(leavingRow, enteringColumn);
    for (let column = 0; column < columnCount; column += 1) {
      writeCell(leavingRow, column, readCell(leavingRow, column) / pivot);
    }

    for (let row = 0; row < rowCount; row += 1) {
      if (row === leavingRow) {
        continue;
      }
      const factor = readCell(row, enteringColumn);
      if (Math.abs(factor) <= tolerance) {
        writeCell(row, enteringColumn, 0);
        continue;
      }
      for (let column = 0; column < columnCount; column += 1) {
        writeCell(row, column, readCell(row, column) - factor * readCell(leavingRow, column));
      }
      writeCell(row, enteringColumn, 0);
    }

    basis[leavingRow] = enteringColumn;
    iterations += 1;
  }

  if (iterations >= maxIterations) {
    status = "iteration-limit";
  }

  const solution = Array.from({ length: variableCount }, () => 0);
  for (let row = 0; row < constraintCount; row += 1) {
    const variable = basis[row]!;
    if (variable < variableCount) {
      solution[variable] = readCell(row, rightHandSideColumn);
    }
  }

  return {
    status,
    solution,
    objectiveValue: readCell(objectiveRow, rightHandSideColumn),
    iterations,
  };
}
