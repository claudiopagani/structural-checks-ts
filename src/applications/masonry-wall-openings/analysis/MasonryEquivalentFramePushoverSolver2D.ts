import {
  DisplacementControlNonlinearStaticSolver2D,
  type DisplacementControlEvaluation,
  type DisplacementControlLinearSolverLike,
  type DisplacementControlModel2D,
  type DisplacementControlSolveOptions,
  type DisplacementControlSolveResult,
} from "../../../domain/fem/nonlinear/DisplacementControlNonlinearStaticSolver2D.js";
import type { DofNodeLike } from "../../../domain/fem/DofRegistry.js";
import type { FemSupportConstraintLike } from "../../../domain/fem/KinematicConstraintReducer2D.js";
import { DenseLinearSolver } from "../../../domain/math/DenseLinearSolver.js";
import {
  MasonryEquivalentFramePushoverInternalForces,
  type MasonryEquivalentFrameContributorDefinition,
} from "./MasonryEquivalentFramePushoverInternalForces.js";

type JsonRecord = Record<string, unknown>;

interface ContributorHingeState extends JsonRecord {
  start?: unknown;
  end?: unknown;
  shear?: unknown;
  history?: unknown[];
}

interface ContributorState extends JsonRecord {
  kind?: string;
  failed?: boolean;
  hingeState?: ContributorHingeState;
}

type SolverFrame = DisplacementControlModel2D;

interface NonlinearSolverLike {
  solve: (options: DisplacementControlSolveOptions) => DisplacementControlSolveResult;
}

export interface MasonryEquivalentFramePushoverSolver2DOptions {
  linearSolver?: DisplacementControlLinearSolverLike;
  nonlinearSolver?: NonlinearSolverLike;
}

export interface MasonryEquivalentFramePushoverSolver2DSolveInput {
  frame?: SolverFrame;
  contributorsByElementId?: Record<string, MasonryEquivalentFrameContributorDefinition>;
  controlDisplacementIncrement?: number;
  maxControlDisplacement?: number;
  tolerance?: number;
  maxIterations?: number;
  maxSteps?: number;
  yieldTolerance?: number;
}

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isUnknownArray(value: unknown): value is readonly unknown[] {
  return Array.isArray(value);
}

function cloneUnknownArray(value: unknown): unknown[] {
  return isUnknownArray(value) ? [...value] : [];
}

function cloneContributorState(state: unknown = null): ContributorState {
  const record = isRecord(state) ? state : null;
  const hingeState = isRecord(record?.hingeState) ? record.hingeState : null;

  if (record?.kind === "steel-ring-frame") {
    return {
      kind: "steel-ring-frame",
      hingeState: {
        start: hingeState?.start ?? null,
        end: hingeState?.end ?? null,
        history: cloneUnknownArray(hingeState?.history),
      },
    };
  }

  return {
    failed: Boolean(record?.failed),
    hingeState: {
      start: hingeState?.start ?? null,
      end: hingeState?.end ?? null,
      shear: hingeState?.shear ?? null,
      history: cloneUnknownArray(hingeState?.history),
    },
  };
}

function cloneContributorStates(statesByElementId: unknown = {}): Record<string, ContributorState> {
  if (!isRecord(statesByElementId)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(statesByElementId).map(([elementId, state]) => [
      elementId,
      cloneContributorState(state),
    ]),
  );
}

function recordKey(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
    return String(value);
  }

  return "";
}

function countActiveHinges(statesByElementId: unknown = {}): number {
  if (!isRecord(statesByElementId)) {
    return 0;
  }

  return Object.values(statesByElementId).reduce<number>((sum, state) => {
    const record = isRecord(state) ? state : null;
    const hingeState = isRecord(record?.hingeState) ? record.hingeState : null;
    const shearHingeCount =
      record?.kind === "steel-ring-frame" ? 0 : Number(hingeState?.shear != null);

    return (
      sum + Number(hingeState?.start != null) + Number(hingeState?.end != null) + shearHingeCount
    );
  }, 0);
}

function baseShearFromEvaluation(
  frame: SolverFrame,
  evaluation: DisplacementControlEvaluation | null,
): number {
  const constrainedUxIndices = (frame.supports ?? [])
    .filter(
      (support): support is FemSupportConstraintLike & { node: DofNodeLike } =>
        support.node !== undefined &&
        support.node !== null &&
        (support.isRestrained?.("ux") ?? support.restraints?.ux ?? false),
    )
    .map((support) => frame.dofRegistry.getIndex(support.node, "ux"));
  const internalForceVector = evaluation?.internalForceVector ?? [];

  return Math.abs(
    constrainedUxIndices.reduce((sum, index) => sum + (internalForceVector[index] ?? 0), 0),
  );
}

function pierBaseShearsById(responses: readonly JsonRecord[] = []): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const response of responses) {
    if (!response?.pierId) {
      continue;
    }

    result[recordKey(response.pierId)] = response.baseShear ?? 0;
  }

  return result;
}

function pierHingeCountsById(responses: readonly JsonRecord[] = []): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const response of responses) {
    if (!response?.pierId) {
      continue;
    }

    result[recordKey(response.pierId)] = response.hingeCount ?? 0;
  }

  return result;
}

export class MasonryEquivalentFramePushoverSolver2D {
  readonly linearSolver: DisplacementControlLinearSolverLike;
  readonly nonlinearSolver: NonlinearSolverLike;

  constructor({
    linearSolver = new DenseLinearSolver(),
    nonlinearSolver = new DisplacementControlNonlinearStaticSolver2D({
      linearSolver,
    }),
  }: MasonryEquivalentFramePushoverSolver2DOptions = {}) {
    this.linearSolver = linearSolver;
    this.nonlinearSolver = nonlinearSolver;
  }

  solve({
    frame,
    contributorsByElementId,
    controlDisplacementIncrement,
    maxControlDisplacement,
    tolerance = 1e-2,
    maxIterations = 100,
    maxSteps = 200,
    yieldTolerance = 1e-9,
  }: MasonryEquivalentFramePushoverSolver2DSolveInput = {}): DisplacementControlSolveResult & {
    hingeEvents: JsonRecord[];
    hingeStatesByElementId: unknown;
  } {
    const internalForces =
      contributorsByElementId === undefined
        ? new MasonryEquivalentFramePushoverInternalForces()
        : new MasonryEquivalentFramePushoverInternalForces({ contributorsByElementId });
    const solveOptions: DisplacementControlSolveOptions = {
      evaluator: internalForces,
      initialState: {},
      cloneState: cloneContributorStates,
      tolerance,
      maxIterations,
      maxSteps,
      evaluationOptions: { yieldTolerance },
      pointBuilder: ({ model, evaluation, state }) => ({
        baseShear: evaluation ? baseShearFromEvaluation(model, evaluation) : 0,
        hingeCount: countActiveHinges(state),
        pierBaseShearsById: pierBaseShearsById(evaluation?.responses ?? []),
        pierHingeCountsById: pierHingeCountsById(evaluation?.responses ?? []),
      }),
    };
    if (frame !== undefined) {
      solveOptions.model = frame;
    }
    if (controlDisplacementIncrement !== undefined) {
      solveOptions.controlDisplacementIncrement = controlDisplacementIncrement;
    }
    if (maxControlDisplacement !== undefined) {
      solveOptions.maxControlDisplacement = maxControlDisplacement;
    }

    const solverResult = this.nonlinearSolver.solve(solveOptions);

    return {
      ...solverResult,
      hingeEvents: solverResult.events,
      hingeStatesByElementId: solverResult.finalState ?? {},
    };
  }
}
