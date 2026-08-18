/**
 * Small two-phase simplex kernel used by the masonry-arch bonded-layer static recovery.
 *
 * The kernel solves, with exact-arithmetic-friendly tolerances, the bounded problem
 *
 *   minimize  sum(x_i)
 *   subject to  A x <= b,  0 <= x_i <= c_i
 *
 * where `b` may contain negative entries. The solution is reported together with a uniqueness
 * certificate: a layer-force vector is returned only when the minimizer is unique, so the bonded
 * static recovery never fabricates a force distribution that the limit/static problem does not
 * determine.
 */

export interface BoundedMinimumProblem {
  /** One row per constraint: `sum(coefficients[j] * x_j) <= rightHandSide`. */
  readonly constraints: readonly {
    readonly coefficients: readonly number[];
    readonly rightHandSide: number;
  }[];
  /** Positive upper bound of every variable (the lower bound is zero). */
  readonly capacities: readonly number[];
}

export interface BoundedMinimumResult {
  readonly feasible: boolean;
  /** True only when the minimizing force vector is unique up to numerical tolerance. */
  readonly unique: boolean;
  readonly solution: readonly number[] | null;
  readonly objectiveValue: number | null;
  readonly iterations: number;
}

const DEFAULT_TOLERANCE = 1e-11;
const MAX_ITERATIONS = 100_000;

/**
 * Two-phase primal simplex with Bland's rule for the bounded minimum problem above. Uniqueness is
 * certified by inspecting the optimal dictionary: every nonbasic column with a vanishing reduced
 * cost spans an alternative-optimal ray, and the solution is non-unique when any such ray changes
 * an original variable.
 */
export function solveBoundedMinimumProblem(
  problem: BoundedMinimumProblem,
  tolerance = DEFAULT_TOLERANCE,
): BoundedMinimumResult {
  const variableCount = problem.capacities.length;
  if (variableCount === 0) {
    return { feasible: true, unique: true, solution: [], objectiveValue: 0, iterations: 0 };
  }
  for (let index = 0; index < variableCount; index += 1) {
    if (!Number.isFinite(problem.capacities[index]!) || problem.capacities[index]! <= 0) {
      throw new Error(`Bounded-minimum capacity ${index} must be finite and positive.`);
    }
  }
  const capacityScale = Math.max(...problem.capacities, 1);
  const tol = Math.max(Number.EPSILON * 64, tolerance * Math.max(1, capacityScale));
  if (!Number.isFinite(tol) || tol <= 0) {
    throw new Error("Bounded-minimum tolerance must be finite and positive.");
  }
  const initialConstraintCount = problem.constraints.length;

  // Tableau columns: 0..k-1 originals, k..k+m-1 slacks, k+m..k+2m-1 artificials, last = RHS.
  // The m constraints include every user row plus the box rows `x_i <= capacity_i`.
  const totalConstraintCount = initialConstraintCount + variableCount;
  const slackOffset = variableCount;
  const artificialOffset = variableCount + totalConstraintCount;
  const rhsColumn = variableCount + 2 * totalConstraintCount;
  const columnCount = rhsColumn + 1;
  const tableau: number[][] = [];
  const basis: number[] = [];

  let rowCount = 0;
  for (let row = 0; row < totalConstraintCount; row += 1) {
    const coefficients: number[] = Array.from({ length: variableCount }, (_, column) =>
      row >= initialConstraintCount ? (column === row - initialConstraintCount ? 1 : 0) : 0,
    );
    const rightHandSide =
      row >= initialConstraintCount
        ? problem.capacities[row - initialConstraintCount]!
        : (() => {
            const constraint = problem.constraints[row];
            if (constraint === undefined) {
              throw new Error(`Bounded-minimum constraint ${row} is missing.`);
            }
            if (constraint.coefficients.length !== variableCount) {
              throw new Error(
                `Bounded-minimum constraint ${row} must contain ${variableCount} coefficients.`,
              );
            }
            for (let column = 0; column < variableCount; column += 1) {
              const value = constraint.coefficients[column] ?? Number.NaN;
              if (!Number.isFinite(value)) {
                throw new Error(`Bounded-minimum coefficient [${row}, ${column}] must be finite.`);
              }
              coefficients[column] = value;
            }
            if (!Number.isFinite(constraint.rightHandSide)) {
              throw new Error(`Bounded-minimum right-hand side ${row} must be finite.`);
            }
            return constraint.rightHandSide;
          })();
    const flipped = rightHandSide < -tol;
    const sign = flipped ? -1 : 1;
    const tableauRow: number[] = Array.from({ length: columnCount }, () => 0);
    for (let column = 0; column < variableCount; column += 1) {
      tableauRow[column] = sign * coefficients[column]!;
    }
    // Slack: +1 for a non-flipped <= row; the flipped row uses -1 and an artificial variable.
    tableauRow[slackOffset + row] = sign;
    tableauRow[rhsColumn] = sign * rightHandSide;
    if (flipped) {
      tableauRow[artificialOffset + row] = 1;
      basis.push(artificialOffset + row);
    } else {
      basis.push(slackOffset + row);
    }
    tableau.push(tableauRow);
    rowCount += 1;
  }
  const objectiveRow: number[] = Array.from({ length: columnCount }, () => 0);
  // Phase I minimizes the artificial sum: with the stored-reduced-cost convention (-c in the
  // objective row for maximize c^T x), maximize -sum(artificials) stores +1 per artificial.
  for (let row = 0; row < initialConstraintCount; row += 1) {
    if (basis.includes(artificialOffset + row)) {
      objectiveRow[artificialOffset + row] = 1;
    }
  }
  // Express the phase-I objective in nonbasic coordinates.
  for (let row = 0; row < rowCount; row += 1) {
    if (basis[row]! >= artificialOffset) {
      addScaledRow(objectiveRow, tableau[row]!, -1, columnCount);
    }
  }
  tableau.push(objectiveRow);

  let iterations = 0;
  const pivot = (enteringColumn: number, leavingRow: number): void => {
    const pivotValue = tableau[leavingRow]![enteringColumn]!;
    for (let column = 0; column < columnCount; column += 1) {
      tableau[leavingRow]![column] = tableau[leavingRow]![column]! / pivotValue;
    }
    for (let row = 0; row <= rowCount; row += 1) {
      if (row === leavingRow) continue;
      const factor = tableau[row]![enteringColumn]!;
      if (Math.abs(factor) <= tol) {
        tableau[row]![enteringColumn] = 0;
        continue;
      }
      for (let column = 0; column < columnCount; column += 1) {
        tableau[row]![column] = tableau[row]![column]! - factor * tableau[leavingRow]![column]!;
      }
      tableau[row]![enteringColumn] = 0;
    }
    basis[leavingRow] = enteringColumn;
    iterations += 1;
  };

  const objective = (): number[] => tableau[rowCount]!;

  const enterLeaving = (columnLimit: number): { entering: number; leaving: number } | null => {
    let entering = -1;
    for (let column = 0; column < columnLimit; column += 1) {
      if (objective()[column]! < -tol) {
        entering = column;
        break;
      }
    }
    if (entering < 0) return null;
    let leaving = -1;
    let smallestRatio = Number.POSITIVE_INFINITY;
    for (let row = 0; row < rowCount; row += 1) {
      const coefficient = tableau[row]![entering]!;
      if (coefficient <= tol) continue;
      const ratio = tableau[row]![rhsColumn]! / coefficient;
      const ratioTolerance = tol * Math.max(1, Math.abs(smallestRatio));
      if (
        leaving < 0 ||
        ratio < smallestRatio - ratioTolerance ||
        (Math.abs(ratio - smallestRatio) <= ratioTolerance && basis[row]! < basis[leaving]!)
      ) {
        smallestRatio = ratio;
        leaving = row;
      }
    }
    if (leaving < 0) return { entering, leaving: -2 }; // unbounded ray, never improving
    return { entering, leaving };
  };

  // ---- Phase I: drive the artificial variables to zero ----
  for (;;) {
    if (iterations >= MAX_ITERATIONS) {
      return { feasible: false, unique: false, solution: null, objectiveValue: null, iterations };
    }
    const next = enterLeaving(rhsColumn);
    if (next === null) break;
    if (next.leaving === -2) break; // artificial sum cannot decrease further
    pivot(next.entering, next.leaving);
  }
  const phaseOneValue = -objective()[rhsColumn]!;
  if (phaseOneValue > tol) {
    return { feasible: false, unique: false, solution: null, objectiveValue: null, iterations };
  }
  // Drive out any artificial that remained basic at zero; delete provably redundant rows.
  for (let row = 0; row < rowCount; row += 1) {
    if (basis[row]! < artificialOffset) continue;
    let replacement = -1;
    for (let column = 0; column < artificialOffset; column += 1) {
      if (Math.abs(tableau[row]![column]!) > tol) {
        replacement = column;
        break;
      }
    }
    if (replacement >= 0) {
      pivot(replacement, row);
      continue;
    }
    // Redundant row: `0 * x <= b` with b >= 0. Remove it from the tableau and basis.
    for (let shift = row; shift < rowCount; shift += 1) {
      tableau[shift] = tableau[shift + 1]!;
    }
    tableau[rowCount] = Array.from({ length: columnCount }, () => 0);
    basis.splice(row, 1);
    rowCount -= 1;
    row -= 1;
  }

  // ---- Phase II: minimize sum(x_i) ----
  const objectivePhaseTwo = objective();
  for (let column = 0; column < columnCount; column += 1) {
    objectivePhaseTwo[column] = column < variableCount ? 1 : 0;
  }
  for (let row = 0; row < rowCount; row += 1) {
    const basicVariable = basis[row]!;
    if (basicVariable < variableCount) {
      addScaledRow(
        objectivePhaseTwo,
        tableau[row]!,
        -objectivePhaseTwo[basicVariable]!,
        columnCount,
      );
      objectivePhaseTwo[basicVariable] = 0;
    }
  }
  for (;;) {
    if (iterations >= MAX_ITERATIONS) {
      return { feasible: false, unique: false, solution: null, objectiveValue: null, iterations };
    }
    // Phase II never enters artificial columns.
    const next = enterLeaving(artificialOffset);
    if (next === null) break;
    if (next.leaving === -2) break;
    pivot(next.entering, next.leaving);
  }

  const solution: number[] = Array.from({ length: variableCount }, () => 0);
  for (let row = 0; row < rowCount; row += 1) {
    const variable = basis[row]!;
    if (variable < variableCount) {
      solution[variable] = Math.max(0, tableau[row]![rhsColumn]!);
    }
  }
  const objectiveValue = -objective()[rhsColumn]!;

  // ---- Uniqueness certificate ----
  // An alternative-optimal ray exists for every nonbasic column with vanishing reduced cost; the
  // solution is non-unique when any such ray changes an original variable. Artificial columns are
  // solver machinery and never participate.
  let unique = true;
  for (let column = 0; column < artificialOffset && unique; column += 1) {
    if (basis.includes(column)) continue;
    if (Math.abs(objective()[column]!) > tol) continue;
    if (column < variableCount) {
      unique = false;
      break;
    }
    for (let row = 0; row < rowCount; row += 1) {
      const direction = -tableau[row]![column]!;
      if (Math.abs(direction) <= tol) continue;
      if (basis[row]! < variableCount) {
        unique = false;
        break;
      }
    }
  }

  return { feasible: true, unique, solution, objectiveValue, iterations };
}

function addScaledRow(target: number[], source: number[], factor: number, columns: number): void {
  for (let column = 0; column < columns; column += 1) {
    target[column] = target[column]! + factor * source[column]!;
  }
}
