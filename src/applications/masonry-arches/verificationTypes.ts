import type { CalculationResult } from "../../core/results/CalculationResult.js";
import type { UnitSystemInput } from "../../domain/units/UnitSystem.js";
import type {
  MasonryArchAnalysisDescriptor,
  MasonryArchCapacityLandmarks,
  MasonryArchDesignFailureEventKind,
  MasonryArchEngineeringCriterion,
  MasonryArchEngineeringAssessmentStatus,
  MasonryArchEquilibriumResult,
  MasonryArchFailureMode,
  MasonryArchLimitResult,
  MasonryArchLoadCombinationLike,
} from "./types.js";
import type {
  MasonryArchLambdaBracket,
  MasonryArchPathControl,
  MasonryArchPathEngineeringAssessment,
  MasonryArchPathResult,
  MasonryArchVerifiedLimitPoint,
} from "./pathTypes.js";

export const MASONRY_ARCH_VERIFICATION_RESULT_SCHEMA_VERSION = "7.0.0";

export type MasonryArchVerificationRoute = "rigid-plastic-static" | "arc-length-continuation";

export interface AnalyzeMasonryArchVerificationOptions {
  readonly units: UnitSystemInput;
  readonly loadCombination?: MasonryArchLoadCombinationLike | null;
  /** Load cases whose already-factored contribution is multiplied by lambda. */
  readonly scalableLoadCaseIds: readonly string[];
  // Arc-length route numerical options.
  readonly equilibriumTolerance?: number;
  readonly maxIterations?: number;
  readonly maxSteps?: number;
  readonly maximumLineSearchIterations?: number;
  readonly minimumLineSearchFactor?: number;
  readonly contactInitialization?: "cohesion-homotopy" | "none";
  readonly linearSolver?: "automatic" | "dense";
  readonly designFailureEvents?: readonly MasonryArchDesignFailureEventKind[];
  // Rigid-plastic static route tolerances.
  readonly hingeTolerance?: number;
  readonly simplexTolerance?: number;
  readonly maxSimplexIterations?: number;
  readonly nonAssociatedTolerance?: number;
  readonly maxNonAssociatedIterations?: number;
  /**
   * Expert override of the continuation control. The standard verification is arc-length
   * governed: only arc-length controls with targetLambda 1 are accepted here; adaptive load
   * control and displacement control remain available through `analyzeMasonryArchPath`.
   */
  readonly control?: MasonryArchPathControl;
}

/**
 * Verification result of the fixed-load state F_fixed at lambda = 0 (logical phase A of the
 * standard verification; not a construction stage). FAIL stops the verification: no scalable
 * lambda is defined. INDETERMINATE stops it too, without inventing a failure.
 */
export interface MasonryArchVerificationFixedState {
  readonly status: MasonryArchEngineeringAssessmentStatus;
  readonly lambda: 0;
  readonly step: number | null;
  readonly failedCriteria: readonly MasonryArchEngineeringCriterion[];
  readonly failureMode: MasonryArchFailureMode | null;
  readonly source: "assigned-equilibrium" | "path-fixed-preload";
}

/**
 * Significant states of the verification, pointing at the underlying analyses and steps so that
 * FAIL diagrams (thrust line, interface forces, openings, reinforcement forces, external
 * fixed-anchor actions, bonded layers, displacements) can always be recovered.
 */
export interface MasonryArchVerificationSignificantStates {
  readonly fixedState: {
    readonly source: "assigned-equilibrium" | "path-step";
    readonly step: number | null;
  };
  readonly designState: {
    readonly source: "assigned-equilibrium" | "path-step";
    readonly step: number | null;
  } | null;
  readonly verificationLimit: {
    readonly source: "limit-analysis" | "path-step";
    readonly step: number | null;
  } | null;
  readonly firstLimit: { readonly source: "path-step"; readonly step: number | null } | null;
  readonly peak: { readonly source: "path-step"; readonly step: number | null } | null;
  readonly lastConverged: { readonly source: "path-step"; readonly step: number | null } | null;
  readonly termination: { readonly source: "path-step"; readonly step: number | null } | null;
}

/**
 * Numerical diagnostics of the verification. These are observables, never capacity and never a
 * physical failure: an INDETERMINATE verdict carries them so the caller can inspect the run.
 */
export interface MasonryArchVerificationDiagnostics {
  readonly lastConvergedLambda: number | null;
  readonly maximumObservedLambda: number | null;
  readonly lastConvergedStep: number | null;
  readonly terminationReason: string | null;
  readonly cutbacks: number;
  readonly lambdaBracket: MasonryArchLambdaBracket | null;
  readonly verifiedLimitPoint: MasonryArchVerifiedLimitPoint | null;
  readonly designStateCorrectorAttempts: number;
}

export interface MasonryArchVerificationOutputs extends Record<string, unknown> {
  readonly modelId: string;
  /** Route selected for this model: rigid-plastic models use the static route, deformable models the arc-length route. */
  readonly route: MasonryArchVerificationRoute;
  readonly analysis: MasonryArchAnalysisDescriptor;
  /** Logical phase A: the fixed-load state at lambda = 0. */
  readonly fixedState: MasonryArchVerificationFixedState;
  /**
   * Overall engineering verdict. The design state is the exact lambda = 1 state (assigned
   * equilibrium for the static route, fixed-lambda corrector for the arc-length route).
   * `engineeringAssessment.lambda` is always the lambda of the load state the verdict refers to:
   * 1 on PASS, the state where the verdict was decided on FAIL (0 when the fixed state fails,
   * 1 when the assigned design state fails, the first blocking state on the path route), and the
   * last verified state when available on INDETERMINATE. It is never a capacity: a design FAIL
   * with a limit-analysis lambda of 0.72 still reports lambda 1 here, while
   * `lambdaVerificationLimit` reports 0.72.
   */
  readonly engineeringAssessment: MasonryArchPathEngineeringAssessment;
  /**
   * Lambda of the first event that makes satisfying the design verification at lambda = 1
   * impossible on the primary branch: a certified global limit point below one, terminal
   * crushing, reinforcement or bonded-layer failure, or another genuinely
   * design-blocking criterion. Null on PASS, on fixed-state failure (no scalable lambda is
   * defined), and when no blocking event could be certified (INDETERMINATE). Never confused with
   * the first local limit.
   */
  readonly lambdaVerificationLimit: number | null;
  /**
   * Global mechanism classification of the FAIL verdict, always identical to
   * `engineeringAssessment.failureMode`: null on PASS and INDETERMINATE, a physical mode or
   * "undetermined" on FAIL. The path primitive's own termination classification (for example
   * `no-collapse-within-model`) is NOT copied here; it remains available, semantically named,
   * inside `subAnalyses.path.outputs.failureMode` and `subAnalyses.path.outputs.convergenceInfo`.
   */
  readonly failureMode: MasonryArchFailureMode | null;
  readonly capacity: MasonryArchCapacityLandmarks;
  readonly significantStates: MasonryArchVerificationSignificantStates;
  readonly diagnostics: MasonryArchVerificationDiagnostics;
  /** Underlying expert-level analyses; consumers read significant states from these results. */
  readonly subAnalyses: {
    readonly fixedStateEquilibrium: MasonryArchEquilibriumResult | null;
    readonly designStateEquilibrium: MasonryArchEquilibriumResult | null;
    readonly limitAnalysis: MasonryArchLimitResult | null;
    readonly path: MasonryArchPathResult | null;
  };
}

export type MasonryArchVerificationResult = CalculationResult<MasonryArchVerificationOutputs>;
