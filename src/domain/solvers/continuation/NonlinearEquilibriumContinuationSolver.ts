import { DenseLinearSolver } from "../../math/DenseLinearSolver.js";
import {
  GeneralBandedLinearSolver,
  compactBandedMatrixToDense,
  compactBandedValue,
  createCompactBandedMatrix,
  setCompactBandedValue,
  type CompactBandedMatrix,
} from "../../math/GeneralBandedLinearSolver.js";
import { sphericalArcLengthConstraint } from "./arcLength.js";

export type NonlinearTangentMatrix = number[][] | CompactBandedMatrix;

export interface NonlinearEquilibriumEvaluation {
  readonly residual: readonly number[];
  readonly tangent: NonlinearTangentMatrix;
  /** Derivative of the residual with respect to the continued load coordinate. */
  readonly scalableDerivative: readonly number[];
}

export interface NonlinearEquilibriumScaling {
  /** Multipliers that make every residual component dimensionless. */
  readonly residualScales: readonly number[];
  /** Characteristic magnitudes used to normalize the solution coordinates. */
  readonly coordinateScales: readonly number[];
}

export interface NonlinearEquilibriumSolverOptions {
  readonly scaling: NonlinearEquilibriumScaling;
  readonly tolerance: number;
  readonly maxIterations: number;
  readonly maximumLineSearchIterations: number;
  readonly minimumLineSearchFactor: number;
  readonly linearSolver?: "automatic" | "dense";
}

export interface NonlinearDisplacementConstraint {
  readonly type: "displacement";
  readonly dof: number;
  readonly target: number;
  readonly reference: number;
}

export interface NonlinearArcLengthConstraint {
  readonly type: "arc-length";
  readonly referenceCoordinates: readonly number[];
  readonly referenceLambda: number;
  readonly radius: number;
  readonly loadScale: number;
}

export type NonlinearEquilibriumConstraint =
  | NonlinearDisplacementConstraint
  | NonlinearArcLengthConstraint;

export interface NonlinearEquilibriumSolveInput<
  TEvaluation extends NonlinearEquilibriumEvaluation,
> {
  readonly initialCoordinates: readonly number[];
  readonly initialLambda: number;
  readonly evaluate: (
    coordinates: readonly number[],
    lambda: number,
    includeTangent: boolean,
  ) => TEvaluation;
  /** Omit for direct load control at initialLambda. */
  readonly constraint?: NonlinearEquilibriumConstraint;
}

export interface NonlinearEquilibriumSolveResult<
  TEvaluation extends NonlinearEquilibriumEvaluation,
> {
  readonly converged: boolean;
  readonly coordinates: readonly number[];
  readonly lambda: number;
  readonly iterations: number;
  readonly evaluation: TEvaluation;
  readonly warning: string | null;
  readonly nonMonotoneAcceptances: number;
}

export type NonlinearLinearSolverMethod = "banded" | "dense";

function finitePositive(value: number, label: string): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be finite and positive.`);
  }
  return value;
}

function positiveInteger(value: number, label: string): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive integer.`);
  }
  return value;
}

function isCompactBandedMatrix(matrix: NonlinearTangentMatrix): matrix is CompactBandedMatrix {
  return !Array.isArray(matrix);
}

function tangentValue(matrix: NonlinearTangentMatrix, row: number, column: number): number {
  return isCompactBandedMatrix(matrix)
    ? compactBandedValue(matrix, row, column)
    : matrix[row]![column]!;
}

function zeroVector(size: number): number[] {
  return new Array<number>(size).fill(0);
}

function zeroMatrix(size: number): number[][] {
  return Array.from({ length: size }, () => new Array<number>(size).fill(0));
}

function addScaled(
  base: readonly number[],
  correction: readonly number[],
  factor: number,
): number[] {
  return base.map((value, index) => value + factor * correction[index]!);
}

/**
 * Generic Newton continuation kernel for a nonlinear equilibrium problem
 * R(q, lambda) = 0. Mechanical assembly and engineering termination policy remain
 * responsibilities of the caller.
 */
export class NonlinearEquilibriumContinuationSolver<
  TEvaluation extends NonlinearEquilibriumEvaluation,
> {
  readonly coordinateScales: readonly number[];
  readonly residualScales: readonly number[];
  readonly tolerance: number;
  readonly maxIterations: number;
  readonly maximumLineSearchIterations: number;
  readonly minimumLineSearchFactor: number;

  readonly #denseLinearSolver = new DenseLinearSolver();
  readonly #bandedLinearSolver = new GeneralBandedLinearSolver();
  readonly #linearSolverPreference: "automatic" | "dense";
  readonly #usedLinearSolvers = new Set<NonlinearLinearSolverMethod>();

  constructor(options: NonlinearEquilibriumSolverOptions) {
    if (options.scaling.residualScales.length === 0) {
      throw new Error("Nonlinear equilibrium scaling cannot be empty.");
    }
    if (options.scaling.coordinateScales.length !== options.scaling.residualScales.length) {
      throw new Error("Nonlinear residual and coordinate scales must have the same size.");
    }
    this.residualScales = options.scaling.residualScales.map((value, index) =>
      finitePositive(value, `Nonlinear residual scale ${index}`),
    );
    this.coordinateScales = options.scaling.coordinateScales.map((value, index) =>
      finitePositive(value, `Nonlinear coordinate scale ${index}`),
    );
    this.tolerance = finitePositive(options.tolerance, "Nonlinear tolerance");
    this.maxIterations = positiveInteger(options.maxIterations, "Nonlinear maxIterations");
    this.maximumLineSearchIterations = positiveInteger(
      options.maximumLineSearchIterations,
      "Nonlinear maximumLineSearchIterations",
    );
    this.minimumLineSearchFactor = finitePositive(
      options.minimumLineSearchFactor,
      "Nonlinear minimumLineSearchFactor",
    );
    if (this.minimumLineSearchFactor >= 1) {
      throw new Error("Nonlinear minimumLineSearchFactor must be smaller than one.");
    }
    this.#linearSolverPreference = options.linearSolver ?? "automatic";
  }

  get usedLinearSolvers(): ReadonlySet<NonlinearLinearSolverMethod> {
    return this.#usedLinearSolvers;
  }

  residualMeasure(residual: readonly number[]): number {
    this.#assertVectorSize(residual, "residual");
    return residual.reduce(
      (maximum, value, index) => Math.max(maximum, Math.abs(value) * this.residualScales[index]!),
      0,
    );
  }

  solveLoadCorrection(
    evaluation: TEvaluation,
    residual: readonly number[] = evaluation.residual,
  ): number[] {
    this.#assertEvaluation(evaluation);
    this.#assertVectorSize(residual, "residual override");
    const tangent =
      this.#linearSolverPreference === "dense" && isCompactBandedMatrix(evaluation.tangent)
        ? compactBandedMatrixToDense(evaluation.tangent)
        : evaluation.tangent;
    const columnScales = this.#tangentColumnScales(tangent);
    const matrix = this.#scaledTangent(tangent, columnScales);
    const rightHandSide = residual.map((value, row) => -this.residualScales[row]! * value);
    const scaledCorrection = isCompactBandedMatrix(matrix)
      ? (() => {
          this.#usedLinearSolvers.add("banded");
          return this.#bandedLinearSolver.solve(matrix, rightHandSide);
        })()
      : (() => {
          this.#usedLinearSolvers.add("dense");
          return this.#denseLinearSolver.solve(matrix, rightHandSide);
        })();
    return scaledCorrection.map((value, index) => value * columnScales[index]!);
  }

  solve(
    input: NonlinearEquilibriumSolveInput<TEvaluation>,
  ): NonlinearEquilibriumSolveResult<TEvaluation> {
    this.#assertVectorSize(input.initialCoordinates, "initial coordinates");
    if (!Number.isFinite(input.initialLambda)) {
      throw new Error("Nonlinear initialLambda must be finite.");
    }
    this.#assertConstraint(input.constraint);
    let coordinates = [...input.initialCoordinates];
    let lambda = input.initialLambda;
    let evaluation = input.evaluate(coordinates, lambda, true);
    this.#assertEvaluation(evaluation);
    let nonMonotoneAcceptances = 0;

    for (let iteration = 1; iteration <= this.maxIterations; iteration += 1) {
      const constraintValues = this.#constraintValues(coordinates, lambda, input.constraint);
      const measure = Math.max(
        this.residualMeasure(evaluation.residual),
        constraintValues.normalizedGap,
      );
      if (measure <= this.tolerance) {
        return {
          converged: true,
          coordinates,
          lambda,
          iterations: iteration - 1,
          evaluation,
          warning: null,
          nonMonotoneAcceptances,
        };
      }

      let correction: { readonly coordinates: number[]; readonly lambda: number };
      try {
        correction =
          input.constraint === undefined
            ? { coordinates: this.solveLoadCorrection(evaluation), lambda: 0 }
            : input.constraint.type === "displacement"
              ? this.#solveDisplacementCorrection(
                  evaluation,
                  input.constraint.dof,
                  constraintValues.gap,
                )
              : this.#solveArcLengthCorrection(evaluation, constraintValues.arcLength!);
      } catch (error) {
        return {
          converged: false,
          coordinates,
          lambda,
          iterations: iteration,
          evaluation,
          warning: `The nonlinear tangent is singular or ill-conditioned: ${String(error)}`,
          nonMonotoneAcceptances,
        };
      }

      let accepted = false;
      let lineFactor = 1;
      let bestTrialMeasure = Number.POSITIVE_INFINITY;
      let bestTrialCoordinates: number[] | null = null;
      let bestTrialLambda = lambda;
      for (
        let lineIteration = 0;
        lineIteration < this.maximumLineSearchIterations;
        lineIteration += 1
      ) {
        const trialCoordinates = addScaled(coordinates, correction.coordinates, lineFactor);
        const trialLambda = lambda + lineFactor * correction.lambda;
        const trial = input.evaluate(trialCoordinates, trialLambda, false);
        this.#assertEvaluation(trial);
        const trialConstraint = this.#constraintValues(
          trialCoordinates,
          trialLambda,
          input.constraint,
        );
        const trialMeasure = Math.max(
          this.residualMeasure(trial.residual),
          trialConstraint.normalizedGap,
        );
        if (trialMeasure < bestTrialMeasure) {
          bestTrialMeasure = trialMeasure;
          bestTrialCoordinates = trialCoordinates;
          bestTrialLambda = trialLambda;
        }
        if (trialMeasure < measure || trialMeasure <= this.tolerance) {
          coordinates = trialCoordinates;
          lambda = trialLambda;
          evaluation = input.evaluate(coordinates, lambda, true);
          this.#assertEvaluation(evaluation);
          accepted = true;
          break;
        }
        lineFactor /= 2;
        if (lineFactor < this.minimumLineSearchFactor) break;
      }
      if (!accepted && bestTrialCoordinates !== null && bestTrialMeasure <= 5 * measure) {
        coordinates = bestTrialCoordinates;
        lambda = bestTrialLambda;
        evaluation = input.evaluate(coordinates, lambda, true);
        this.#assertEvaluation(evaluation);
        nonMonotoneAcceptances += 1;
        accepted = true;
      }
      if (!accepted) {
        return {
          converged: false,
          coordinates,
          lambda,
          iterations: iteration,
          evaluation,
          warning:
            `The nonlinear backtracking line search could not reduce the normalized residual ` +
            `(current ${measure}, best trial ${bestTrialMeasure}).`,
          nonMonotoneAcceptances,
        };
      }
    }

    return {
      converged: false,
      coordinates,
      lambda,
      iterations: this.maxIterations,
      evaluation,
      warning:
        `The nonlinear iteration did not converge in ${this.maxIterations} iterations; ` +
        `the final normalized residual was ${this.residualMeasure(evaluation.residual)}.`,
      nonMonotoneAcceptances,
    };
  }

  #assertVectorSize(vector: readonly number[], label: string): void {
    if (vector.length !== this.coordinateScales.length) {
      throw new Error(
        `Nonlinear ${label} size ${vector.length} does not match the configured size ${this.coordinateScales.length}.`,
      );
    }
    if (vector.some((value) => !Number.isFinite(value))) {
      throw new Error(`Nonlinear ${label} must contain only finite values.`);
    }
  }

  #assertEvaluation(evaluation: NonlinearEquilibriumEvaluation): void {
    this.#assertVectorSize(evaluation.residual, "residual");
    this.#assertVectorSize(evaluation.scalableDerivative, "load derivative");
    const size = isCompactBandedMatrix(evaluation.tangent)
      ? evaluation.tangent.size
      : evaluation.tangent.length;
    if (size !== this.coordinateScales.length) {
      throw new Error("Nonlinear tangent size does not match the configured coordinate size.");
    }
    if (
      !isCompactBandedMatrix(evaluation.tangent) &&
      evaluation.tangent.some((row) => row.length !== size)
    ) {
      throw new Error("Nonlinear dense tangent must be square.");
    }
  }

  #assertConstraint(constraint: NonlinearEquilibriumConstraint | undefined): void {
    if (constraint === undefined) return;
    if (constraint.type === "displacement") {
      if (
        !Number.isInteger(constraint.dof) ||
        constraint.dof < 0 ||
        constraint.dof >= this.coordinateScales.length
      ) {
        throw new Error("Nonlinear displacement-control DOF is outside the solution vector.");
      }
      if (!Number.isFinite(constraint.target) || !Number.isFinite(constraint.reference)) {
        throw new Error("Nonlinear displacement-control target and reference must be finite.");
      }
      return;
    }
    this.#assertVectorSize(constraint.referenceCoordinates, "arc-length reference coordinates");
    finitePositive(constraint.radius, "Nonlinear arc-length radius");
    finitePositive(constraint.loadScale, "Nonlinear arc-length loadScale");
    if (!Number.isFinite(constraint.referenceLambda)) {
      throw new Error("Nonlinear arc-length referenceLambda must be finite.");
    }
  }

  #tangentColumnScales(tangent: NonlinearTangentMatrix): number[] {
    const size = isCompactBandedMatrix(tangent) ? tangent.size : tangent.length;
    return Array.from({ length: size }, (_, column) => {
      let maximum = 0;
      const firstRow = isCompactBandedMatrix(tangent)
        ? Math.max(0, column - tangent.upperBandwidth)
        : 0;
      const lastRow = isCompactBandedMatrix(tangent)
        ? Math.min(size - 1, column + tangent.lowerBandwidth)
        : size - 1;
      for (let row = firstRow; row <= lastRow; row += 1) {
        maximum = Math.max(
          maximum,
          Math.abs(this.residualScales[row]! * tangentValue(tangent, row, column)),
        );
      }
      return maximum > 0 ? 1 / maximum : 1;
    });
  }

  #scaledTangent(
    tangent: NonlinearTangentMatrix,
    columnScales: readonly number[],
  ): NonlinearTangentMatrix {
    const size = isCompactBandedMatrix(tangent) ? tangent.size : tangent.length;
    if (isCompactBandedMatrix(tangent)) {
      const scaled = createCompactBandedMatrix(
        size,
        tangent.lowerBandwidth,
        tangent.upperBandwidth,
      );
      for (let row = 0; row < size; row += 1) {
        const firstColumn = Math.max(0, row - tangent.lowerBandwidth);
        const lastColumn = Math.min(size - 1, row + tangent.upperBandwidth);
        for (let column = firstColumn; column <= lastColumn; column += 1) {
          setCompactBandedValue(
            scaled,
            row,
            column,
            this.residualScales[row]! *
              compactBandedValue(tangent, row, column) *
              columnScales[column]!,
          );
        }
      }
      return scaled;
    }
    const scaled = zeroMatrix(size);
    for (let row = 0; row < size; row += 1) {
      for (let column = 0; column < size; column += 1) {
        scaled[row]![column] =
          this.residualScales[row]! * tangent[row]![column]! * columnScales[column]!;
      }
    }
    return scaled;
  }

  #lambdaColumnScale(evaluation: TEvaluation): number {
    let maximum = 0;
    for (let row = 0; row < evaluation.residual.length; row += 1) {
      maximum = Math.max(
        maximum,
        Math.abs(this.residualScales[row]! * evaluation.scalableDerivative[row]!),
      );
    }
    if (maximum === 0) {
      throw new Error("The continued load coordinate has a zero residual derivative.");
    }
    return 1 / maximum;
  }

  #solveDisplacementCorrection(
    evaluation: TEvaluation,
    controlDof: number,
    controlGap: number,
  ): { readonly coordinates: number[]; readonly lambda: number } {
    const size = evaluation.residual.length;
    const tangent =
      this.#linearSolverPreference === "dense" && isCompactBandedMatrix(evaluation.tangent)
        ? compactBandedMatrixToDense(evaluation.tangent)
        : evaluation.tangent;
    const columnScales = this.#tangentColumnScales(tangent);
    const lambdaColumnScale = this.#lambdaColumnScale(evaluation);
    if (isCompactBandedMatrix(tangent)) {
      const scaled = this.#scaledTangent(tangent, columnScales);
      if (!isCompactBandedMatrix(scaled)) {
        throw new Error("Internal compact tangent scaling changed the storage type.");
      }
      const residualRightHandSide = zeroVector(size);
      const lambdaRightHandSide = zeroVector(size);
      for (let row = 0; row < size; row += 1) {
        residualRightHandSide[row] = -this.residualScales[row]! * evaluation.residual[row]!;
        lambdaRightHandSide[row] =
          this.residualScales[row]! * evaluation.scalableDerivative[row]! * lambdaColumnScale;
      }
      this.#usedLinearSolvers.add("banded");
      const factorization = this.#bandedLinearSolver.factorize(scaled);
      const [residualResponse, lambdaResponse] = factorization.solveMany([
        residualRightHandSide,
        lambdaRightHandSide,
      ]);
      const physicalResidualResponse = residualResponse!.map(
        (value, index) => value * columnScales[index]!,
      );
      const physicalLambdaResponse = lambdaResponse!.map(
        (value, index) => value * columnScales[index]!,
      );
      const controlDenominator = physicalLambdaResponse[controlDof]!;
      if (Math.abs(controlDenominator) <= 1e-14 * this.coordinateScales[controlDof]!) {
        throw new Error(
          "The selected displacement-control coordinate has zero incremental load response.",
        );
      }
      const scaledLambdaCorrection =
        (controlGap + physicalResidualResponse[controlDof]!) / controlDenominator;
      return {
        coordinates: physicalResidualResponse.map(
          (value, index) => value - physicalLambdaResponse[index]! * scaledLambdaCorrection,
        ),
        lambda: scaledLambdaCorrection * lambdaColumnScale,
      };
    }

    const augmented = Array.from({ length: size + 1 }, () => new Array<number>(size + 1).fill(0));
    const rightHandSide = new Array<number>(size + 1).fill(0);
    const controlRowScale = 1 / Math.abs(columnScales[controlDof]!);
    for (let row = 0; row < size; row += 1) {
      rightHandSide[row] = -this.residualScales[row]! * evaluation.residual[row]!;
      for (let column = 0; column < size; column += 1) {
        augmented[row]![column] =
          this.residualScales[row]! * tangent[row]![column]! * columnScales[column]!;
      }
      augmented[row]![size] =
        this.residualScales[row]! * evaluation.scalableDerivative[row]! * lambdaColumnScale;
    }
    augmented[size]![controlDof] = columnScales[controlDof]! * controlRowScale;
    rightHandSide[size] = -controlGap * controlRowScale;
    this.#usedLinearSolvers.add("dense");
    const correction = this.#denseLinearSolver.solve(augmented, rightHandSide);
    return {
      coordinates: correction.slice(0, size).map((value, index) => value * columnScales[index]!),
      lambda: correction[size]! * lambdaColumnScale,
    };
  }

  #solveArcLengthCorrection(
    evaluation: TEvaluation,
    values: {
      readonly gap: number;
      readonly displacementGradient: readonly number[];
      readonly lambdaGradient: number;
    },
  ): { readonly coordinates: number[]; readonly lambda: number } {
    const size = evaluation.residual.length;
    const tangent = isCompactBandedMatrix(evaluation.tangent)
      ? compactBandedMatrixToDense(evaluation.tangent)
      : evaluation.tangent;
    const columnScales = this.#tangentColumnScales(tangent);
    const lambdaColumnScale = this.#lambdaColumnScale(evaluation);
    const augmented = Array.from({ length: size + 1 }, () => new Array<number>(size + 1).fill(0));
    const rightHandSide = new Array<number>(size + 1).fill(0);
    for (let row = 0; row < size; row += 1) {
      rightHandSide[row] = -this.residualScales[row]! * evaluation.residual[row]!;
      for (let column = 0; column < size; column += 1) {
        augmented[row]![column] =
          this.residualScales[row]! * tangent[row]![column]! * columnScales[column]!;
      }
      augmented[row]![size] =
        this.residualScales[row]! * evaluation.scalableDerivative[row]! * lambdaColumnScale;
    }
    const maximumConstraintCoefficient = Math.max(
      ...values.displacementGradient.map((value, index) => Math.abs(value * columnScales[index]!)),
      Math.abs(values.lambdaGradient * lambdaColumnScale),
    );
    if (maximumConstraintCoefficient <= Number.EPSILON) {
      throw new Error("The arc-length correction was requested at a zero-increment predictor.");
    }
    const constraintRowScale = 1 / maximumConstraintCoefficient;
    for (let column = 0; column < size; column += 1) {
      augmented[size]![column] =
        constraintRowScale * values.displacementGradient[column]! * columnScales[column]!;
    }
    augmented[size]![size] = constraintRowScale * values.lambdaGradient * lambdaColumnScale;
    rightHandSide[size] = -constraintRowScale * values.gap;
    this.#usedLinearSolvers.add("dense");
    const correction = this.#denseLinearSolver.solve(augmented, rightHandSide);
    return {
      coordinates: correction.slice(0, size).map((value, index) => value * columnScales[index]!),
      lambda: correction[size]! * lambdaColumnScale,
    };
  }

  #constraintValues(
    coordinates: readonly number[],
    lambda: number,
    constraint: NonlinearEquilibriumConstraint | undefined,
  ): {
    readonly gap: number;
    readonly normalizedGap: number;
    readonly arcLength: {
      readonly gap: number;
      readonly displacementGradient: readonly number[];
      readonly lambdaGradient: number;
    } | null;
  } {
    if (constraint === undefined) {
      return { gap: 0, normalizedGap: 0, arcLength: null };
    }
    if (constraint.type === "displacement") {
      const gap = coordinates[constraint.dof]! - constraint.reference - constraint.target;
      return {
        gap,
        normalizedGap: Math.abs(gap) / this.coordinateScales[constraint.dof]!,
        arcLength: null,
      };
    }
    const increment = coordinates.map(
      (value, index) => value - constraint.referenceCoordinates[index]!,
    );
    const values = sphericalArcLengthConstraint(
      increment,
      lambda - constraint.referenceLambda,
      constraint.radius,
      {
        displacementScales: this.coordinateScales,
        loadScale: constraint.loadScale,
      },
    );
    return {
      gap: values.gap,
      normalizedGap: Math.abs(values.gap) / (constraint.radius * constraint.radius),
      arcLength: values,
    };
  }
}
