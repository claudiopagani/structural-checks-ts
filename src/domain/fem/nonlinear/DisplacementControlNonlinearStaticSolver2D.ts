import { DenseLinearSolver } from "../../math/DenseLinearSolver.js";
import {
  createZeroVector,
  type NumericMatrix,
  type NumericVector,
} from "../../math/arrayLinearAlgebra.js";
import {
  KinematicConstraintReducer2D,
  type FemSupportConstraintLike,
  type KinematicConstraintLike,
  type KinematicReduction2D,
} from "../KinematicConstraintReducer2D.js";
import type { DofRegistry } from "../DofRegistry.js";

export interface DisplacementControlModel2D {
  dofRegistry: DofRegistry;
  referenceLoadVector: NumericVector;
  controlVector: NumericVector;
  supports?: readonly FemSupportConstraintLike[];
  constraints?: readonly KinematicConstraintLike[];
}

export interface DisplacementControlEvaluation {
  internalForceVector: NumericVector;
  tangentStiffnessMatrix: NumericMatrix;
  state?: unknown;
  hingeStatesByElementId?: unknown;
  events?: readonly Record<string, unknown>[];
  hingeEvents?: readonly Record<string, unknown>[];
  responses?: readonly Record<string, unknown>[];
  elementResponses?: readonly Record<string, unknown>[];
  [key: string]: unknown;
}

export interface DisplacementControlEvaluatorContext {
  model: DisplacementControlModel2D;
  displacements: NumericVector;
  state: unknown;
  [key: string]: unknown;
}

export type DisplacementControlEvaluator =
  | ((context: DisplacementControlEvaluatorContext) => DisplacementControlEvaluation)
  | { evaluate: (context: DisplacementControlEvaluatorContext) => DisplacementControlEvaluation };

export interface DisplacementControlPointContext {
  step: number;
  iterationCount: number;
  model: DisplacementControlModel2D;
  displacements: NumericVector;
  loadFactor: number;
  controlDisplacement: number;
  state: unknown;
  evaluation: DisplacementControlEvaluation | null;
  freeIndices: string[];
  restrainedIndices: string[];
  reducedDisplacements: NumericVector;
  kinematicReduction: ReturnType<KinematicReduction2D["toJSON"]>;
}

export interface DisplacementControlSolveOptions {
  model?: DisplacementControlModel2D;
  evaluator?: DisplacementControlEvaluator;
  initialState?: unknown;
  cloneState?: (state: unknown) => unknown;
  controlDisplacementIncrement?: number;
  maxControlDisplacement?: number;
  tolerance?: number;
  maxIterations?: number;
  maxSteps?: number;
  evaluationOptions?: Record<string, unknown>;
  pointBuilder?:
    | ((context: DisplacementControlPointContext) => Record<string, unknown> | null | undefined)
    | null;
}

export interface DisplacementControlPoint {
  step: number;
  iterationCount: number;
  controlDisplacement: number;
  loadFactor: number;
  [key: string]: unknown;
}

export interface DisplacementControlTermination {
  reason: string;
  step: number;
  iteration: number;
}

export interface DisplacementControlSolveResult {
  points: DisplacementControlPoint[];
  events: Record<string, unknown>[];
  finalState: unknown;
  finalEvaluation: DisplacementControlEvaluation | null;
  finalDisplacements: NumericVector;
  finalLoadFactor: number;
  warnings: string[];
  assumptions: string[];
  termination: DisplacementControlTermination;
  freeDofIds: string[];
  restrainedDofIds: string[];
  kinematicReduction: ReturnType<KinematicReduction2D["toJSON"]>;
}

export interface DisplacementControlLinearSolverLike {
  solve(matrix: NumericMatrix, rhs: NumericVector): NumericVector;
}

export interface DisplacementControlConstraintReducerLike {
  build(input: {
    dofRegistry: DofRegistry;
    supports: readonly FemSupportConstraintLike[];
    constraints: readonly KinematicConstraintLike[];
  }): KinematicReduction2D;
}

interface NormalizedEvaluation extends DisplacementControlEvaluation {
  state: unknown;
  events: readonly Record<string, unknown>[];
  responses: readonly Record<string, unknown>[];
}

interface CommittedStepState {
  fullDisplacements: NumericVector;
  evaluation: NormalizedEvaluation;
}

function vectorValue(vector: NumericVector, index: number): number {
  const value = vector[index];
  if (value === undefined) {
    throw new Error("DisplacementControlNonlinearStaticSolver2D vector value is unavailable.");
  }
  return value;
}

function addVectors(left: NumericVector, right: NumericVector): NumericVector {
  return left.map((value, index) => value + vectorValue(right, index));
}

function subtractVectors(left: NumericVector, right: NumericVector): NumericVector {
  return left.map((value, index) => value - vectorValue(right, index));
}

function scalarVector(scalar: number, vector: NumericVector): NumericVector {
  return vector.map((value) => scalar * value);
}

function dot(left: NumericVector, right: NumericVector): number {
  return left.reduce((sum, value, index) => sum + value * vectorValue(right, index), 0);
}

function norm(vector: NumericVector): number {
  return Math.sqrt(vector.reduce((sum, value) => sum + value ** 2, 0));
}

function buildAugmentedMatrix(
  tangentMatrix: NumericMatrix,
  referenceLoadVector: NumericVector,
  controlVector: NumericVector,
): NumericMatrix {
  const size = tangentMatrix.length;
  const augmented = tangentMatrix.map((row, rowIndex) => [
    ...row,
    -vectorValue(referenceLoadVector, rowIndex),
  ]);

  augmented.push([...controlVector, 0]);

  if (augmented.length !== size + 1 || augmented.some((row) => row.length !== size + 1)) {
    throw new Error(
      "DisplacementControlNonlinearStaticSolver2D could not assemble the augmented displacement-control system.",
    );
  }

  return augmented;
}

function maxAbs(values: NumericVector): number {
  return values.reduce((maxValue, value) => Math.max(maxValue, Math.abs(value)), 0);
}

function detectRelevantLocalDofIndices(
  tangentMatrix: NumericMatrix,
  referenceLoadVector: NumericVector,
  controlVector: NumericVector,
  residualVector: NumericVector,
  relativeTolerance = 1e-12,
): number[] {
  const size = tangentMatrix.length;
  const scale = Math.max(
    maxAbs(referenceLoadVector),
    maxAbs(controlVector),
    maxAbs(residualVector),
    ...tangentMatrix.map((row) => maxAbs(row)),
  );
  const threshold = Math.max(relativeTolerance * Math.max(scale, 1), 1e-14);
  const indices: number[] = [];

  for (let index = 0; index < size; index += 1) {
    const row = tangentMatrix[index] ?? [];
    const rowNorm = maxAbs(row);
    const columnNorm = maxAbs(tangentMatrix.map((matrixRow) => matrixRow[index] ?? 0));
    const signature = Math.max(
      rowNorm,
      columnNorm,
      Math.abs(referenceLoadVector[index] ?? 0),
      Math.abs(controlVector[index] ?? 0),
      Math.abs(residualVector[index] ?? 0),
    );

    if (signature > threshold) {
      indices.push(index);
    }
  }

  return indices.length > 0 ? indices : Array.from({ length: size }, (_, index) => index);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isUnknownArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

function isEvaluatorFunction(
  value: unknown,
): value is (context: DisplacementControlEvaluatorContext) => DisplacementControlEvaluation {
  return typeof value === "function";
}

function defaultCloneState(state: unknown): unknown {
  if (state == null) {
    return state;
  }

  if (typeof structuredClone === "function") {
    try {
      return structuredClone(state);
    } catch {
      // Fall through to shallow clones below when class instances are not structured-clone friendly.
    }
  }

  if (isUnknownArray(state)) {
    return [...state];
  }

  if (isRecord(state)) {
    return { ...state };
  }

  return state;
}

function normalizeEvaluation(
  evaluation: DisplacementControlEvaluation | null | undefined,
  fallbackState: unknown,
): NormalizedEvaluation {
  if (!evaluation || typeof evaluation !== "object") {
    throw new Error(
      "DisplacementControlNonlinearStaticSolver2D evaluator must return an object with internal forces and tangent stiffness.",
    );
  }

  return {
    ...evaluation,
    state: evaluation.state ?? evaluation.hingeStatesByElementId ?? fallbackState,
    events: evaluation.events ?? evaluation.hingeEvents ?? [],
    responses: evaluation.responses ?? evaluation.elementResponses ?? [],
  };
}

function scatterLocalCorrection(
  size: number,
  activeIndices: readonly number[],
  reducedCorrection: NumericVector,
): NumericVector {
  const fullCorrection = createZeroVector(size);

  for (let index = 0; index < activeIndices.length; index += 1) {
    const activeIndex = activeIndices[index];
    const correction = reducedCorrection[index];
    if (activeIndex === undefined || correction === undefined) {
      throw new Error("DisplacementControlNonlinearStaticSolver2D correction is unavailable.");
    }
    fullCorrection[activeIndex] = correction;
  }

  return fullCorrection;
}

function basePoint({
  step,
  iterationCount,
  controlDisplacement,
  loadFactor,
}: {
  step: number;
  iterationCount: number;
  controlDisplacement: number;
  loadFactor: number;
}): DisplacementControlPoint {
  return {
    step,
    iterationCount,
    controlDisplacement,
    loadFactor,
  };
}

function errorMessage(error: unknown): string {
  if (isRecord(error) && "message" in error) {
    return String(error.message);
  }
  return String(error);
}

export class DisplacementControlNonlinearStaticSolver2D {
  readonly linearSolver: DisplacementControlLinearSolverLike;
  readonly constraintReducer: DisplacementControlConstraintReducerLike;

  constructor({
    linearSolver = new DenseLinearSolver(),
    constraintReducer = new KinematicConstraintReducer2D(),
  }: {
    linearSolver?: DisplacementControlLinearSolverLike;
    constraintReducer?: DisplacementControlConstraintReducerLike;
  } = {}) {
    this.linearSolver = linearSolver;
    this.constraintReducer = constraintReducer;
  }

  solve({
    model,
    evaluator,
    initialState = null,
    cloneState = defaultCloneState,
    controlDisplacementIncrement,
    maxControlDisplacement,
    tolerance = 1e-2,
    maxIterations = 100,
    maxSteps = 200,
    evaluationOptions = {},
    pointBuilder = null,
  }: DisplacementControlSolveOptions = {}): DisplacementControlSolveResult {
    const fullSize = model?.dofRegistry?.size?.();

    if (!model || typeof fullSize !== "number" || !Number.isFinite(fullSize) || fullSize <= 0) {
      throw new Error(
        "DisplacementControlNonlinearStaticSolver2D requires a model with a valid dofRegistry.",
      );
    }

    if (
      typeof controlDisplacementIncrement !== "number" ||
      !Number.isFinite(controlDisplacementIncrement) ||
      controlDisplacementIncrement <= 0
    ) {
      throw new Error(
        "DisplacementControlNonlinearStaticSolver2D requires a positive controlDisplacementIncrement.",
      );
    }

    if (
      typeof maxControlDisplacement !== "number" ||
      !Number.isFinite(maxControlDisplacement) ||
      maxControlDisplacement <= 0
    ) {
      throw new Error(
        "DisplacementControlNonlinearStaticSolver2D requires a positive maxControlDisplacement.",
      );
    }

    const evaluatorMethod: unknown =
      evaluator == null ? undefined : Reflect.get(evaluator, "evaluate");
    const evaluatorFunction = isEvaluatorFunction(evaluatorMethod)
      ? (context: DisplacementControlEvaluatorContext) => evaluatorMethod.call(evaluator, context)
      : isEvaluatorFunction(evaluator)
        ? evaluator
        : null;

    if (!evaluatorFunction) {
      throw new Error(
        "DisplacementControlNonlinearStaticSolver2D requires an evaluator with an evaluate() method or a function.",
      );
    }

    const reduction = this.constraintReducer.build({
      dofRegistry: model.dofRegistry,
      supports: model.supports ?? [],
      constraints: model.constraints ?? [],
    });
    const reducedLoadVector = reduction.reduceVector(model.referenceLoadVector);
    const reducedControlVector = reduction.reduceVector(model.controlVector);
    let reducedDisplacements = createZeroVector(reduction.reducedSize());
    let displacements = reduction.expandReducedVector(reducedDisplacements);
    let loadFactor = 0;
    let state = cloneState(initialState);
    let finalEvaluation: NormalizedEvaluation | null = null;
    const warnings: string[] = [];
    const assumptions = [
      "The non-linear displacement-control solver uses the augmented equilibrium system [Kt -Fext; c^T 0], so it can continue through singular tangents when the control equation regularizes the mechanism.",
      "The displacement-control step length is currently constant; no adaptive step-size strategy or line search is applied yet.",
    ];
    const events: Record<string, unknown>[] = [];
    const points: DisplacementControlPoint[] = [
      {
        ...basePoint({
          step: 0,
          iterationCount: 0,
          controlDisplacement: 0,
          loadFactor: 0,
        }),
        ...(pointBuilder?.({
          step: 0,
          iterationCount: 0,
          model,
          displacements,
          loadFactor: 0,
          controlDisplacement: 0,
          state,
          evaluation: null,
          freeIndices: [...reduction.reducedDofIds],
          restrainedIndices: [...reduction.constrainedDofIds],
          reducedDisplacements,
          kinematicReduction: reduction.toJSON(),
        }) ?? {}),
      },
    ];
    let termination: DisplacementControlTermination = {
      reason: "max-steps-reached",
      step: 0,
      iteration: 0,
    };

    for (let step = 1; step <= maxSteps; step += 1) {
      let deltaDisplacements = createZeroVector(reduction.reducedSize());
      let deltaLoadFactor = 0;
      let trialState = cloneState(state);
      let committedStepState: CommittedStepState | null = null;
      let converged = false;
      let abortAnalysis = false;
      let stepIterationCount = 0;
      const stepEvents: Record<string, unknown>[] = [];

      for (let iteration = 1; iteration <= maxIterations; iteration += 1) {
        stepIterationCount = iteration;
        const trialReducedDisplacements = addVectors(reducedDisplacements, deltaDisplacements);
        const trialFullDisplacements = reduction.expandReducedVector(trialReducedDisplacements);
        const evaluation = normalizeEvaluation(
          evaluatorFunction({
            model,
            displacements: trialFullDisplacements,
            state: trialState,
            ...evaluationOptions,
          }),
          trialState,
        );
        const tangentFree = reduction.reduceStiffnessMatrix(evaluation.tangentStiffnessMatrix);
        const internalFree = reduction.reduceVector(evaluation.internalForceVector);
        const residual = subtractVectors(
          scalarVector(loadFactor + deltaLoadFactor, reducedLoadVector),
          internalFree,
        );
        const residualNorm = norm(residual);
        const controlGap =
          controlDisplacementIncrement - dot(reducedControlVector, deltaDisplacements);

        trialState = cloneState(evaluation.state);
        stepEvents.push(
          ...evaluation.events.map((event) => ({
            ...event,
            step,
            iteration,
          })),
        );

        if (
          iteration > 1 &&
          residualNorm < tolerance &&
          Math.abs(controlGap) < tolerance &&
          evaluation.events.length === 0
        ) {
          committedStepState = {
            fullDisplacements: trialFullDisplacements,
            evaluation,
          };
          converged = true;
          break;
        }

        try {
          const activeLocalIndices = detectRelevantLocalDofIndices(
            tangentFree,
            reducedLoadVector,
            reducedControlVector,
            residual,
          );
          const reducedTangent = activeLocalIndices.map((row) =>
            activeLocalIndices.map((column) => vectorValue(tangentFree[row] ?? [], column)),
          );
          const reducedLoadSubvector = activeLocalIndices.map((index) =>
            vectorValue(reducedLoadVector, index),
          );
          const reducedControlSubvector = activeLocalIndices.map((index) =>
            vectorValue(reducedControlVector, index),
          );
          const reducedResidual = activeLocalIndices.map((index) => vectorValue(residual, index));
          const augmentedMatrix = buildAugmentedMatrix(
            reducedTangent,
            reducedLoadSubvector,
            reducedControlSubvector,
          );
          const augmentedCorrection = this.linearSolver.solve(augmentedMatrix, [
            ...reducedResidual,
            controlGap,
          ]);
          const displacementCorrection = scatterLocalCorrection(
            reduction.reducedSize(),
            activeLocalIndices,
            augmentedCorrection.slice(0, activeLocalIndices.length),
          );
          const loadFactorCorrection = augmentedCorrection.at(-1);

          if (loadFactorCorrection === undefined) {
            throw new Error(
              "DisplacementControlNonlinearStaticSolver2D load-factor correction is unavailable.",
            );
          }

          deltaDisplacements = addVectors(deltaDisplacements, displacementCorrection);
          deltaLoadFactor += loadFactorCorrection;
        } catch (error) {
          warnings.push(
            `Non-linear displacement-control analysis stopped at step ${step}, iteration ${iteration} because the augmented system became singular or ill-conditioned: ${errorMessage(error)}`,
          );
          termination = {
            reason: "singular-augmented-system",
            step,
            iteration,
          };
          abortAnalysis = true;
          break;
        }
      }

      if (!converged && committedStepState == null) {
        if (abortAnalysis) {
          break;
        }

        if (stepIterationCount >= maxIterations) {
          warnings.push(
            `Non-linear displacement-control analysis stopped at step ${step} because convergence was not reached within ${maxIterations} iterations.`,
          );
          termination = {
            reason: "max-iterations",
            step,
            iteration: stepIterationCount,
          };
        }

        break;
      }

      if (!committedStepState) {
        const committedReducedDisplacements = addVectors(reducedDisplacements, deltaDisplacements);
        const committedFullDisplacements = reduction.expandReducedVector(
          committedReducedDisplacements,
        );

        committedStepState = {
          fullDisplacements: committedFullDisplacements,
          evaluation: normalizeEvaluation(
            evaluatorFunction({
              model,
              displacements: committedFullDisplacements,
              state: trialState,
              ...evaluationOptions,
            }),
            trialState,
          ),
        };
      }

      displacements = [...committedStepState.fullDisplacements];
      reducedDisplacements = addVectors(reducedDisplacements, deltaDisplacements);
      loadFactor += deltaLoadFactor;
      state = cloneState(committedStepState.evaluation.state);
      finalEvaluation = committedStepState.evaluation;
      events.push(...stepEvents);

      const controlDisplacement = dot(model.controlVector, displacements);

      points.push({
        ...basePoint({
          step,
          iterationCount: stepIterationCount,
          controlDisplacement,
          loadFactor,
        }),
        ...(pointBuilder?.({
          step,
          iterationCount: stepIterationCount,
          model,
          displacements,
          loadFactor,
          controlDisplacement,
          state,
          evaluation: committedStepState.evaluation,
          freeIndices: [...reduction.reducedDofIds],
          restrainedIndices: [...reduction.constrainedDofIds],
          reducedDisplacements,
          kinematicReduction: reduction.toJSON(),
        }) ?? {}),
      });

      if (controlDisplacement >= maxControlDisplacement - Math.max(1e-9, tolerance)) {
        termination = {
          reason: "target-displacement-reached",
          step,
          iteration: stepIterationCount,
        };
        break;
      }
    }

    if (points.length === 1 && termination.reason === "max-steps-reached") {
      termination = {
        reason: "no-progress",
        step: 0,
        iteration: 0,
      };
    }

    return {
      points,
      events,
      finalState: state,
      finalEvaluation,
      finalDisplacements: displacements,
      finalLoadFactor: loadFactor,
      warnings,
      assumptions,
      termination,
      freeDofIds: [...reduction.reducedDofIds],
      restrainedDofIds: [...reduction.constrainedDofIds],
      kinematicReduction: reduction.toJSON(),
    };
  }
}
