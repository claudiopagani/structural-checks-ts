import type { CalculationResult } from "../../core/results/CalculationResult.js";
import type { RigidBlockDeformableInterfaceEvaluation2D } from "../../domain/masonry/rigid-blocks/evaluateDeformableInterface2D.js";
import type {
  RigidBlockPoint2D,
  RigidBlockVector2D,
} from "../../domain/masonry/rigid-blocks/types.js";
import type {
  AdaptiveLoadControl,
  DisplacementControl,
  SphericalArcLengthControl,
} from "../../domain/solvers/continuation/index.js";
import type { UnitSystemInput } from "../../domain/units/UnitSystem.js";
import type {
  ArchAnchorForceResult,
  ArchContactForceResult,
  ArchReinforcementStateResult,
  BondedLayerStateResult,
  MasonryArchAnalysisDescriptor,
  MasonryArchAnalysisObjective,
  MasonryArchAnalysisOutcome,
  MasonryArchCapacityLandmarks,
  MasonryArchDesignFailureEventKind,
  MasonryArchEngineeringAssessment,
  MasonryArchEngineeringCriterion,
  MasonryArchEventKind,
  MasonryArchFailureMode,
  MasonryArchLoadCombinationLike,
  NormalizedMasonryArchBlockDisplacement,
} from "./types.js";

export type { MasonryArchEventKind } from "./types.js";

export const MASONRY_ARCH_PATH_RESULT_SCHEMA_VERSION = "8.0.0";

export interface MasonryArchDof {
  readonly blockId: string;
  readonly component: "x" | "y" | "rotation";
}

export interface MasonryArchLoadControl extends AdaptiveLoadControl {
  /** Optional response coordinate used only to report load-displacement curves. */
  readonly monitor?: MasonryArchDof;
}

export type MasonryArchDisplacementControl = DisplacementControl<MasonryArchDof>;

export interface MasonryArchArcLengthControl extends SphericalArcLengthControl {
  /** Optional response coordinate used only to report path curves. */
  readonly monitor?: MasonryArchDof;
}

export type MasonryArchPathControl =
  | MasonryArchLoadControl
  | MasonryArchDisplacementControl
  | MasonryArchArcLengthControl;

export interface AnalyzeMasonryArchPathOptions {
  readonly units: UnitSystemInput;
  readonly analysisObjective: MasonryArchAnalysisObjective;
  readonly loadCombination?: MasonryArchLoadCombinationLike | null;
  readonly scalableLoadCaseIds: readonly string[];
  /** Design checks default to load control; capacity defaults to spherical arc length. */
  readonly control?: MasonryArchPathControl;
  readonly equilibriumTolerance?: number;
  readonly maxIterations?: number;
  readonly maxSteps?: number;
  readonly maximumLineSearchIterations?: number;
  readonly minimumLineSearchFactor?: number;
  readonly engineeringLimitPolicy?: "objective-default" | "stop" | "continue";
  /**
   * Physical-limit event kinds that fail a design-state check. Restricted to the physical-limit
   * taxonomy at the type level; observable, warning, and numerical event kinds can never be
   * configured here, and numerical failures always produce INDETERMINATE, never FAIL. The
   * default follows the constitutive law: local sliding and perfectly-plastic crushing continue
   * by default, while terminal-physical events and the remaining default kinds fail. Callers
   * can opt into a stricter policy, for example `["plastic-sliding"]`.
   */
  readonly designFailureEvents?: readonly MasonryArchDesignFailureEventKind[];
  readonly contactInitialization?: "cohesion-homotopy" | "none";
  readonly linearSolver?: "automatic" | "dense";
}

export type MasonryArchEventCategory =
  | "observable-event"
  | "warning"
  | "engineering-limit"
  | "terminal-physical-event"
  | "numerical-failure";

export interface MasonryArchEvent {
  readonly category: MasonryArchEventCategory;
  readonly kind: MasonryArchEventKind;
  readonly step: number | null;
  readonly lambda: number | null;
  readonly entityIds: readonly string[];
  readonly message: string;
}

export interface MasonryArchEquilibriumResidual {
  readonly forceResidual: RigidBlockVector2D;
  readonly momentResidual: number;
  readonly maximumNormalizedBlockResidual: number;
  readonly normalizedGlobalResidual: {
    readonly forceX: number;
    readonly forceY: number;
    readonly moment: number;
  };
  readonly tolerance: number;
}

export interface MasonryArchSupportReaction {
  readonly force: RigidBlockVector2D;
  readonly moment: number;
  readonly applicationPoint: RigidBlockPoint2D;
}

export interface MasonryArchPathState {
  readonly lambda: number;
  readonly fixedLoadFactor: number;
  readonly effectiveLoadFactorsByCaseId: Readonly<Record<string, number>>;
  readonly deformedConfiguration: readonly NormalizedMasonryArchBlockDisplacement[];
  readonly interfaces: readonly RigidBlockDeformableInterfaceEvaluation2D[];
  readonly thrustLine: readonly (RigidBlockPoint2D | null)[];
  readonly reinforcementState: readonly ArchReinforcementStateResult[];
  readonly anchorForces: readonly ArchAnchorForceResult[];
  readonly contactForces: readonly ArchContactForceResult[];
  readonly bondedLayerState: readonly BondedLayerStateResult[];
  readonly reactions: {
    readonly left: MasonryArchSupportReaction;
    readonly right: MasonryArchSupportReaction;
  };
  readonly equilibrium: MasonryArchEquilibriumResidual;
}

/**
 * Engineering assessment of a design-state path analysis. The common assessment fields answer the
 * same structural questions as the equilibrium assessment; `requiredLambda` is path-specific.
 * `failedCriteria` uses the shared criterion taxonomy instead of raw events and carries the demand,
 * capacity, and utilization of the event's own converged step when those quantities are directly
 * available there; the full event log remains available in `outputs.events`.
 */
export interface MasonryArchPathEngineeringAssessment extends MasonryArchEngineeringAssessment {
  readonly question: "can-reach-lambda-one-with-admissible-equilibrium-and-prescribed-criteria";
  readonly requiredLambda: 1;
  readonly failedCriteria: readonly MasonryArchEngineeringCriterion[];
}

export interface MasonryArchPathStep {
  readonly step: number;
  readonly stage: "fixed-preload" | "scalable-loading";
  readonly controlDisplacement: number;
  readonly iterations: number;
  readonly events: readonly MasonryArchEvent[];
  /** Complete, coherent equilibrium state for this converged step. */
  readonly state: MasonryArchPathState;
}

export interface MasonryArchPathOutputs extends Record<string, unknown> {
  readonly modelId: string;
  readonly analysis: MasonryArchAnalysisDescriptor;
  readonly analysisOutcome: MasonryArchAnalysisOutcome;
  readonly engineeringAssessment: MasonryArchPathEngineeringAssessment | null;
  readonly capacity: MasonryArchCapacityLandmarks;
  readonly events: readonly MasonryArchEvent[];
  readonly limitState: {
    readonly lambda: number;
    readonly failureMode: MasonryArchFailureMode;
  } | null;
  readonly failureMode: MasonryArchFailureMode;
  readonly control: MasonryArchPathControl;
  readonly steps: readonly MasonryArchPathStep[];
  readonly significantSteps: {
    readonly designState: number | null;
    readonly firstLimit: number | null;
    readonly peak: number | null;
    readonly lastConverged: number | null;
  };
  readonly curves: {
    readonly lambdaDisplacement: readonly {
      readonly displacement: number;
      readonly lambda: number;
    }[];
    readonly reinforcementForceDisplacement: Readonly<
      Record<string, readonly { readonly displacement: number; readonly force: number }[]>
    >;
  };
  readonly convergenceInfo: {
    readonly converged: boolean;
    readonly termination:
      | "target-reached"
      | "engineering-limit"
      | "terminal-physical-event"
      | "minimum-step"
      | "maximum-steps"
      | "fixed-preload-failed";
    readonly completedSteps: number;
    readonly totalIterations: number;
    readonly cutbacks: number;
    readonly nonMonotoneLineSearchAcceptances: number;
    readonly numericalCohesionHomotopy: {
      readonly used: boolean;
      readonly initialOffset: number;
      readonly completedStages: number;
    };
    readonly lambdaBracket: { readonly lower: number; readonly upper: number } | null;
    readonly tangent: "corotational-interface-plus-numerical-reinforcement";
    readonly linearSolver:
      | "compact-banded-gaussian-elimination-partial-pivoting"
      | "dense-gaussian-elimination-partial-pivoting"
      | "hybrid-compact-banded-and-dense-gaussian-elimination";
  };
}

export type MasonryArchPathResult = CalculationResult<MasonryArchPathOutputs>;
