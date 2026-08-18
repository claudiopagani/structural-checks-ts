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
  ArchContactForceResult,
  ArchDeviceForceResult,
  ArchExternalAnchorForceResult,
  ArchReinforcementStateResult,
  BondedLayerStateResult,
  MasonryArchAnalysisDescriptor,
  MasonryArchAnalysisObjective,
  MasonryArchAnalysisOutcome,
  MasonryArchCapacityLandmarks,
  MasonryArchDesignFailureEventKind,
  MasonryArchEngineeringAssessment,
  MasonryArchEngineeringAssessmentStatus,
  MasonryArchEngineeringCriterion,
  MasonryArchEventKind,
  MasonryArchFailureMode,
  MasonryArchLoadCombinationLike,
  NormalizedMasonryArchBlockDisplacement,
} from "./types.js";

export type { MasonryArchEventKind } from "./types.js";

export const MASONRY_ARCH_PATH_RESULT_SCHEMA_VERSION = "12.0.0";

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
  /**
   * Continuation control. Design-state checks default to adaptive arc length with
   * `targetLambda: 1` (crossing plus fixed-lambda corrector); capacity defaults to spherical
   * arc length without a lambda target. Adaptive load control remains available as an explicit
   * expert choice: the standard verification façade never selects it.
   */
  readonly control?: MasonryArchPathControl;
  readonly equilibriumTolerance?: number;
  readonly maxIterations?: number;
  readonly maxSteps?: number;
  readonly maximumLineSearchIterations?: number;
  readonly minimumLineSearchFactor?: number;
  readonly engineeringLimitPolicy?: "objective-default" | "stop" | "continue";
  /**
   * Additional physical-limit event kinds that fail a design-state check, on top of the
   * always-active default set. Restricted to the physical-limit taxonomy at the type level;
   * observable, warning, and numerical event kinds can never be configured here, and numerical
   * failures always produce INDETERMINATE, never FAIL. The default set follows the constitutive
   * law and is always in force: local sliding and perfectly-plastic crushing continue by
   * default, while terminal-physical events and the remaining default kinds fail.
   * `designFailureEvents` only makes the policy stricter by adding kinds — for example
   * `["plastic-sliding"]` treats the first plastic sliding as a design failure while every
   * default failure stays active. It can never be used to remove a default failure; omitting
   * the option or passing an empty array keeps the default policy unchanged.
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
  /** One entry per physical reinforcement device (anchors, deviators, return deviators). */
  readonly deviceForces: readonly ArchDeviceForceResult[];
  readonly contactForces: readonly ArchContactForceResult[];
  /** Forces transmitted by open tendons to external structural systems, never applied to blocks. */
  readonly externalAnchorForces: readonly ArchExternalAnchorForceResult[];
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

/**
 * Verification result of the fixed-load state F_fixed at lambda = 0. This is the logical phase A
 * of the standard verification, not a construction stage: it is only the necessary check that
 * the fixed state is admissible before any scalable load is applied.
 */
export interface MasonryArchPathFixedStateResult {
  readonly status: MasonryArchEngineeringAssessmentStatus;
  /** Last converged fixed-preload step; null when no fixed-preload step converged. */
  readonly lambda: 0;
  readonly step: number | null;
  readonly failedCriteria: readonly MasonryArchEngineeringCriterion[];
  readonly failureMode: MasonryArchFailureMode | null;
}

/**
 * Certified global equilibrium limit point of the primary branch, detected exclusively by
 * positive branch-turning evidence: two consecutive converged states whose arc-length load
 * increments have tangent load components of opposite sign above the numerical noise threshold.
 * The turning point of lambda(s) (where d(lambda)/ds = 0) therefore lies between the rising-side
 * state and the descending-side state in arc-length coordinate; both sides are reported as step
 * identifiers and lambdas. `lambda` is the maximum lambda verified on the primary branch: the
 * rising-side lambda refined with halved arc increments, which approaches the turning point from
 * below, so `lambda <= lambda_turning` always. A numerical exception (tangent solve, linear
 * solve, corrector, predictor, continuation) is never evidence for this result, and a discrete
 * local plastic event is never a certified limit point.
 */
export interface MasonryArchVerifiedLimitPoint {
  /** Maximum lambda verified on the primary branch, refined from the rising side. */
  readonly lambda: number;
  /** How the turning point was certified; only positive converged evidence qualifies. */
  readonly detection: "branch-turning";
  /** Last converged state with a positive load increment (rising side, before the turn). */
  readonly risingSideStep: number;
  /** First converged state with a negative load increment (descending side, after the turn). */
  readonly descendingSideStep: number;
  readonly risingSideLambda: number;
  readonly descendingSideLambda: number;
  /** Number of halved-arc refinement steps advanced from the rising side. */
  readonly refinementSteps: number;
  readonly certified: true;
}

/**
 * Raw diagnostic lambda interval. `certified` is false for every meaning published here; a
 * certified turning point is described by `MasonryArchVerifiedLimitPoint` instead, because its
 * two converged sides bracket the turn in arc-length coordinate, not a lambda interval.
 */
export interface MasonryArchLambdaBracket {
  readonly lower: number;
  readonly upper: number;
  readonly certified: false;
  readonly meaning: "load-control-failure-bracket";
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
  /** Logical phase A of the standard verification: the fixed-load state at lambda = 0. */
  readonly fixedState: MasonryArchPathFixedStateResult;
  readonly significantSteps: {
    readonly fixedState: number | null;
    readonly designState: number | null;
    readonly firstLimit: number | null;
    readonly verificationLimit: number | null;
    readonly peak: number | null;
    readonly lastConverged: number | null;
    readonly termination: number | null;
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
      | "design-state-reached"
      | "engineering-limit"
      | "terminal-physical-event"
      | "global-limit-point"
      | "design-state-not-certified"
      | "minimum-step"
      | "maximum-steps"
      | "fixed-preload-failed";
    /** Human- and machine-readable reason the continuation terminated. */
    readonly terminationReason: string | null;
    /** Diagnostics only, never capacity: lambda of the last converged step. */
    readonly lastConvergedLambda: number | null;
    /** Diagnostics only, never capacity: maximum lambda observed over the converged history. */
    readonly maximumObservedLambda: number | null;
    /** Diagnostics only: index of the last converged step. */
    readonly lastConvergedStep: number | null;
    readonly completedSteps: number;
    readonly totalIterations: number;
    readonly cutbacks: number;
    readonly nonMonotoneLineSearchAcceptances: number;
    readonly numericalCohesionHomotopy: {
      readonly used: boolean;
      readonly initialOffset: number;
      readonly completedStages: number;
    };
    /**
     * Raw numerical diagnostic interval (load-control failure only, never certified). A certified
     * turning point is described by `verifiedLimitPoint` and never by a lambda interval.
     */
    readonly lambdaBracket: MasonryArchLambdaBracket | null;
    /**
     * Certified global limit point of the primary branch, present only for termination
     * "global-limit-point" and produced exclusively by positive branch-turning evidence between
     * converged states.
     */
    readonly verifiedLimitPoint: MasonryArchVerifiedLimitPoint | null;
    /** Number of fixed-lambda corrector attempts used to certify the design state. */
    readonly designStateCorrectorAttempts: number;
    /**
     * Lambda component of the unit continuation tangent at the last converged state, when the
     * tangent load-correction solve succeeded. A vanishing value is the classical turning-point
     * condition but is only a suspected-critical-point diagnostic here: it never certifies a
     * limit point by itself. Null when the tangent solve failed (numerical diagnostic only).
     */
    readonly tangentLambdaComponentAtTermination: number | null;
    readonly tangent: "corotational-interface-plus-numerical-reinforcement";
    readonly linearSolver:
      | "compact-banded-gaussian-elimination-partial-pivoting"
      | "dense-gaussian-elimination-partial-pivoting"
      | "hybrid-compact-banded-and-dense-gaussian-elimination";
  };
}

export type MasonryArchPathResult = CalculationResult<MasonryArchPathOutputs>;
