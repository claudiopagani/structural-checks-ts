// Mechanical TypeScript migration from strutture-js 6f33baead8b88166c4b2cf94af41763412e3c751; source path: src/applications/steel-frames/analysis/SteelDisplacementControlPushoverSolver2D.js.

import {
  DisplacementControlNonlinearStaticSolver2D,
  type DisplacementControlEvaluation,
  type DisplacementControlEvaluatorContext,
  type DisplacementControlLinearSolverLike,
  type DisplacementControlModel2D,
  type DisplacementControlSolveOptions,
  type DisplacementControlSolveResult,
} from "../../../domain/fem/nonlinear/DisplacementControlNonlinearStaticSolver2D.js";
import { DenseLinearSolver } from "../../../domain/math/DenseLinearSolver.js";
import { SteelRingFrameInternalForces } from "./SteelRingFrameInternalForces.js";

export interface SteelDisplacementControlPushoverSolver2DOptions {
  linearSolver?: DisplacementControlLinearSolverLike;
  internalForces?: SteelRingFrameInternalForces;
  nonlinearSolver?: DisplacementControlNonlinearStaticSolver2D;
}

export interface SteelDisplacementControlPushoverSolveOptions {
  frame?: DisplacementControlModel2D;
  controlDisplacementIncrement?: number;
  maxControlDisplacement?: number;
  tolerance?: number;
  maxIterations?: number;
  maxSteps?: number;
  yieldTolerance?: number;
}

export interface SteelDisplacementControlPushoverSolveResult
  extends DisplacementControlSolveResult {
  hingeEvents: Record<string, unknown>[];
  hingeStatesByElementId: unknown;
}

interface CloneableState {
  clone(): unknown;
}

interface ActiveCountState {
  activeCount(): number;
}

function isObjectLike(value: unknown): value is object {
  return value !== null && (typeof value === "object" || typeof value === "function");
}

function hasClone(value: unknown): value is CloneableState {
  return isObjectLike(value) && typeof Reflect.get(value, "clone") === "function";
}

function hasActiveCount(value: unknown): value is ActiveCountState {
  return isObjectLike(value) && typeof Reflect.get(value, "activeCount") === "function";
}

function enumerableEntries(value: unknown): [string, unknown][] {
  if (value === null) {
    throw new TypeError("Cannot convert undefined or null to object");
  }

  const objectValue: object = isObjectLike(value)
    ? value
    : typeof value === "string"
      ? new String(value)
      : {};
  return Object.keys(objectValue).map((key): [string, unknown] => [
    key,
    Reflect.get(objectValue, key),
  ]);
}

function cloneHingeStates(statesByElementId: unknown = {}): Record<string, unknown> {
  return Object.fromEntries(
    enumerableEntries(statesByElementId).map(([elementId, state]) => [
      elementId,
      hasClone(state) ? state.clone() : state,
    ]),
  );
}

function countActiveHinges(statesByElementId: unknown = {}): number {
  return enumerableEntries(statesByElementId).reduce((sum, [, state]) => {
    return sum + (hasActiveCount(state) ? state.activeCount() : 0);
  }, 0);
}

function baseShearFromEvaluation(
  frame: DisplacementControlModel2D,
  evaluation: DisplacementControlEvaluation | null | undefined,
): number {
  const constrainedUxIndices = (frame.supports ?? []).map((support) => {
    const getIndex: unknown = Reflect.get(frame.dofRegistry, "getIndex");
    if (typeof getIndex !== "function") {
      throw new TypeError("Cannot read properties of undefined (reading 'getIndex')");
    }
    const index: unknown = Reflect.apply(getIndex, frame.dofRegistry, [support.node, "ux"]);
    if (typeof index !== "number") {
      throw new Error("SteelDisplacementControlPushoverSolver2D support DOF index is unavailable.");
    }
    return index;
  });

  return Math.abs(
    constrainedUxIndices.reduce(
      (sum, index) => sum + (evaluation?.internalForceVector?.[index] ?? 0),
      0,
    ),
  );
}

function isDisplacementControlEvaluation(value: unknown): value is DisplacementControlEvaluation {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  return (
    Array.isArray(Reflect.get(value, "internalForceVector")) &&
    Array.isArray(Reflect.get(value, "tangentStiffnessMatrix"))
  );
}

function evaluateInternalForces(
  internalForces: SteelRingFrameInternalForces,
  context: DisplacementControlEvaluatorContext,
): DisplacementControlEvaluation {
  const evaluate: unknown = Reflect.get(internalForces, "evaluate");
  if (typeof evaluate !== "function") {
    throw new TypeError("Cannot read properties of undefined (reading 'evaluate')");
  }
  const evaluation: unknown = Reflect.apply(evaluate, internalForces, [context]);
  if (!isDisplacementControlEvaluation(evaluation)) {
    throw new Error(
      "DisplacementControlNonlinearStaticSolver2D evaluator must return an object with internal forces and tangent stiffness.",
    );
  }
  return evaluation;
}

export class SteelDisplacementControlPushoverSolver2D {
  readonly linearSolver: DisplacementControlLinearSolverLike;
  readonly internalForces: SteelRingFrameInternalForces;
  readonly nonlinearSolver: DisplacementControlNonlinearStaticSolver2D;

  constructor({
    linearSolver = new DenseLinearSolver(),
    internalForces = new SteelRingFrameInternalForces(),
    nonlinearSolver = new DisplacementControlNonlinearStaticSolver2D({
      linearSolver,
    }),
  }: SteelDisplacementControlPushoverSolver2DOptions = {}) {
    this.linearSolver = linearSolver;
    this.internalForces = internalForces;
    this.nonlinearSolver = nonlinearSolver;
  }

  solve({
    frame,
    controlDisplacementIncrement,
    maxControlDisplacement,
    tolerance = 1e-2,
    maxIterations = 100,
    maxSteps = 200,
    yieldTolerance = 1e-9,
  }: SteelDisplacementControlPushoverSolveOptions = {}): SteelDisplacementControlPushoverSolveResult {
    const solverOptions: DisplacementControlSolveOptions = {
      evaluator: (context) => evaluateInternalForces(this.internalForces, context),
      initialState: {},
      cloneState: cloneHingeStates,
      tolerance,
      maxIterations,
      maxSteps,
      evaluationOptions: { yieldTolerance },
      pointBuilder: ({ model, evaluation, state }) => ({
        baseShear: evaluation ? baseShearFromEvaluation(model, evaluation) : 0,
        hingeCount: countActiveHinges(state),
      }),
    };
    if (frame !== undefined) solverOptions.model = frame;
    if (controlDisplacementIncrement !== undefined) {
      solverOptions.controlDisplacementIncrement = controlDisplacementIncrement;
    }
    if (maxControlDisplacement !== undefined) {
      solverOptions.maxControlDisplacement = maxControlDisplacement;
    }

    const solverResult = this.nonlinearSolver.solve(solverOptions);

    return {
      ...solverResult,
      hingeEvents: solverResult.events,
      hingeStatesByElementId: solverResult.finalState ?? {},
    };
  }
}
