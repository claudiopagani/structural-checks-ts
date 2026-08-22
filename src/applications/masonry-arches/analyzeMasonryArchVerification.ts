import { CalculationResult } from "../../core/results/CalculationResult.js";
import { assertExplicitUnitSystem } from "../../domain/units/UnitSystem.js";
import { asMasonryArchModel, type MasonryArchModel } from "./MasonryArchModel.js";
import type {
  MasonryArchEngineeringAssessmentStatus,
  MasonryArchModelInput,
  NormalizedMasonryArchModel,
} from "./types.js";
import { MASONRY_ARCH_PATH_ASSESSMENT_QUESTION } from "./types.js";
import {
  createMasonryArchAnalysisDescriptor,
  createMasonryArchLambdaDefinition,
  resolveMasonryArchAnalysisLoads,
} from "./analysisSemantics.js";
import { masonryArchResultStatusFromAssessmentStatus } from "./engineeringAssessment.js";
import { analyzeMasonryArchEquilibrium } from "./analyzeMasonryArchEquilibrium.js";
import { analyzeMasonryArchLimit } from "./analyzeMasonryArchLimit.js";
import {
  analyzeMasonryArchPath,
  analyzeMasonryArchPathWithPerformanceMetrics,
  type MasonryArchPathPerformanceMetrics,
} from "./analyzeMasonryArchPath.js";
import type {
  AnalyzeMasonryArchVerificationOptions,
  MasonryArchVerificationDiagnostics,
  MasonryArchVerificationFixedState,
  MasonryArchVerificationOutputs,
  MasonryArchVerificationResult,
  MasonryArchVerificationRoute,
  MasonryArchVerificationSignificantStates,
} from "./verificationTypes.js";
import { MASONRY_ARCH_VERIFICATION_RESULT_SCHEMA_VERSION } from "./verificationTypes.js";
import type {
  AnalyzeMasonryArchPathOptions,
  MasonryArchPathEngineeringAssessment,
} from "./pathTypes.js";
import type { MasonryArchEquilibriumResult, MasonryArchLimitResult } from "./types.js";

type MasonryArchModelLike = MasonryArchModel | NormalizedMasonryArchModel | MasonryArchModelInput;

function emptyDiagnostics(): MasonryArchVerificationDiagnostics {
  return {
    lastConvergedLambda: null,
    maximumObservedLambda: null,
    lastConvergedStep: null,
    terminationReason: null,
    cutbacks: 0,
    lambdaBracket: null,
    verifiedLimitPoint: null,
    designStateCorrectorAttempts: 0,
  };
}

/**
 * Maps an assigned-state equilibrium verdict onto the standard design-state question. The
 * equilibrium assessment answers its own assigned-state question; the verification façade
 * re-states it under the lambda-one question with the identical status, criteria, and failure
 * mode. No quantity is recomputed.
 */
function verificationAssessmentFromEquilibrium(
  status: MasonryArchEngineeringAssessmentStatus,
  lambda: number | null,
  failedCriteria: MasonryArchPathEngineeringAssessment["failedCriteria"],
  failureMode: MasonryArchPathEngineeringAssessment["failureMode"],
): MasonryArchPathEngineeringAssessment {
  return {
    question: MASONRY_ARCH_PATH_ASSESSMENT_QUESTION,
    status,
    requiredLambda: 1,
    lambda,
    failedCriteria,
    failureMode,
  };
}

function staticRoute(
  model: NormalizedMasonryArchModel,
  options: AnalyzeMasonryArchVerificationOptions,
): { readonly outputs: MasonryArchVerificationOutputs } {
  const loading = resolveMasonryArchAnalysisLoads(model, options);
  const equilibriumOptions = {
    loadFactorsByCaseId: loading.fixed.loadFactorsByCaseId,
    ...(options.hingeTolerance === undefined ? {} : { hingeTolerance: options.hingeTolerance }),
    ...(options.maxSimplexIterations === undefined
      ? {}
      : { maxSimplexIterations: options.maxSimplexIterations }),
  };
  const fixedResult = analyzeMasonryArchEquilibrium(model, equilibriumOptions);
  const fixedAssessment = fixedResult.outputs.engineeringAssessment;
  const fixedState: MasonryArchVerificationFixedState = {
    status: fixedAssessment.status,
    lambda: 0,
    step: null,
    failedCriteria: fixedAssessment.failedCriteria,
    failureMode: fixedAssessment.failureMode,
    source: "assigned-equilibrium",
  };
  let designState: MasonryArchVerificationSignificantStates["designState"] = null;
  let verificationState: MasonryArchVerificationSignificantStates["verificationLimit"] = null;
  let terminationReason: string | null;
  let designResult: MasonryArchEquilibriumResult | null = null;
  let limitResult: MasonryArchLimitResult | null = null;
  let assessment: MasonryArchPathEngineeringAssessment;
  let lambdaVerificationLimit: number | null = null;
  if (fixedAssessment.status === "INDETERMINATE") {
    assessment = verificationAssessmentFromEquilibrium("INDETERMINATE", null, [], null);
    terminationReason =
      "The fixed-load state could not be determined numerically; the verification stops before any scalable lambda.";
  } else if (fixedAssessment.status === "FAIL") {
    assessment = verificationAssessmentFromEquilibrium(
      "FAIL",
      0,
      fixedAssessment.failedCriteria,
      fixedAssessment.failureMode,
    );
    terminationReason = "The fixed-load state is not verified; no scalable lambda is defined.";
  } else {
    designResult = analyzeMasonryArchEquilibrium(model, {
      loadFactorsByCaseId: loading.base.loadFactorsByCaseId,
      ...(options.hingeTolerance === undefined ? {} : { hingeTolerance: options.hingeTolerance }),
      ...(options.maxSimplexIterations === undefined
        ? {}
        : { maxSimplexIterations: options.maxSimplexIterations }),
    });
    const designAssessment = designResult.outputs.engineeringAssessment;
    if (designAssessment.status === "PASS") {
      assessment = verificationAssessmentFromEquilibrium("PASS", 1, [], null);
      designState = { source: "assigned-equilibrium", step: null };
      terminationReason =
        "The assigned design state at lambda = 1 admits a verified statically admissible equilibrium.";
    } else if (designAssessment.status === "INDETERMINATE") {
      assessment = verificationAssessmentFromEquilibrium("INDETERMINATE", null, [], null);
      terminationReason =
        "The assigned design state at lambda = 1 could not be determined numerically.";
    } else {
      // The fixed state passed but the assigned lambda = 1 state did not: quantify the capacity
      // of the scalable pattern with direct limit analysis so a meaningful lambda limit exists.
      limitResult = analyzeMasonryArchLimit(model, {
        ...(options.loadCombination === undefined
          ? {}
          : { loadCombination: options.loadCombination }),
        scalableLoadCaseIds: options.scalableLoadCaseIds,
        ...(options.hingeTolerance === undefined ? {} : { hingeTolerance: options.hingeTolerance }),
        ...(options.simplexTolerance === undefined
          ? {}
          : { simplexTolerance: options.simplexTolerance }),
        ...(options.maxSimplexIterations === undefined
          ? {}
          : { maxSimplexIterations: options.maxSimplexIterations }),
        ...(options.nonAssociatedTolerance === undefined
          ? {}
          : { nonAssociatedTolerance: options.nonAssociatedTolerance }),
        ...(options.maxNonAssociatedIterations === undefined
          ? {}
          : { maxNonAssociatedIterations: options.maxNonAssociatedIterations }),
      });
      const limit = limitResult.outputs.capacity.lambdaFirstLimit;
      lambdaVerificationLimit = limit;
      // The assessed load state remains the assigned lambda = 1 state: the verdict answers
      // "can the design state at lambda = 1 be reached?". The limit-analysis lambda is a
      // capacity of the scalable pattern and is reported ONLY through lambdaVerificationLimit.
      assessment = verificationAssessmentFromEquilibrium(
        "FAIL",
        1,
        designAssessment.failedCriteria,
        designAssessment.failureMode,
      );
      if (limit !== null) {
        verificationState = { source: "limit-analysis", step: null };
        terminationReason =
          `The assigned lambda = 1 state is not statically admissible; direct limit analysis ` +
          `quantified the capacity of the scalable pattern at lambda = ${limit}.`;
      } else {
        terminationReason =
          "The assigned lambda = 1 state is not statically admissible and the limit analysis could not determine a capacity lambda.";
      }
    }
  }
  const analysis = createMasonryArchAnalysisDescriptor(model, {
    analysisObjective: "design-state-check",
    interfaceResponse: "rigid-plastic-resultant-domain",
    kinematics: "reference-geometry",
    numericalStrategy: { type: "representative-static-equilibrium", control: null },
    lambda: createMasonryArchLambdaDefinition(loading, assessment.lambda),
  });
  const outputs: MasonryArchVerificationOutputs = {
    modelId: model.id,
    route: "rigid-plastic-static",
    analysis,
    fixedState,
    engineeringAssessment: assessment,
    lambdaVerificationLimit,
    failureMode: assessment.failureMode,
    capacity: {
      lambdaFirstLimit: limitResult?.outputs.capacity.lambdaFirstLimit ?? null,
      lambdaPeak: limitResult?.outputs.capacity.lambdaPeak ?? null,
      lambdaTermination: limitResult?.outputs.capacity.lambdaTermination ?? null,
      lambdaCollapse: limitResult?.outputs.capacity.lambdaCollapse ?? null,
      lambdaVerificationLimit,
      steps: {
        firstLimit: null,
        peak: null,
        termination: null,
        collapse: null,
        verificationLimit: null,
      },
      collapseDefinition: limitResult?.outputs.capacity.collapseDefinition ?? null,
    },
    significantStates: {
      fixedState: { source: "assigned-equilibrium", step: null },
      designState,
      verificationLimit: verificationState,
      firstLimit: null,
      peak: null,
      lastConverged: null,
      termination: null,
    },
    diagnostics: {
      ...emptyDiagnostics(),
      terminationReason,
    },
    subAnalyses: {
      fixedStateEquilibrium: fixedResult,
      designStateEquilibrium: designResult,
      limitAnalysis: limitResult,
      path: null,
    },
  };
  return { outputs };
}

/**
 * Arc-length route: deformable and reinforced models. The primary equilibrium branch is followed
 * with adaptive arc length; the exact design state is certified by a fixed-lambda corrector at
 * the crossing of lambda = 1. A certified global limit point below one is an instability failure
 * carrying its verification limit. Numerical failure stays INDETERMINATE with diagnostics.
 */
function arcLengthRoute(
  model: NormalizedMasonryArchModel,
  options: AnalyzeMasonryArchVerificationOptions,
  collectPerformanceMetrics = false,
): {
  readonly outputs: MasonryArchVerificationOutputs;
  readonly performanceMetrics: MasonryArchPathPerformanceMetrics | null;
} {
  if (
    options.control !== undefined &&
    (options.control.type !== "arc-length" ||
      options.control.targetLambda === undefined ||
      Math.abs(options.control.targetLambda - 1) > 1e-12)
  ) {
    throw new Error(
      "analyzeMasonryArchVerification: the standard verification is arc-length governed; the control override must be arc-length with targetLambda: 1.",
    );
  }
  const pathOptions = {
    units: options.units,
    analysisObjective: "design-state-check",
    scalableLoadCaseIds: options.scalableLoadCaseIds,
    ...(options.loadCombination === undefined ? {} : { loadCombination: options.loadCombination }),
    ...(options.control === undefined ? {} : { control: options.control }),
    ...(options.equilibriumTolerance === undefined
      ? {}
      : { equilibriumTolerance: options.equilibriumTolerance }),
    ...(options.maxIterations === undefined ? {} : { maxIterations: options.maxIterations }),
    ...(options.maxSteps === undefined ? {} : { maxSteps: options.maxSteps }),
    ...(options.maximumLineSearchIterations === undefined
      ? {}
      : { maximumLineSearchIterations: options.maximumLineSearchIterations }),
    ...(options.minimumLineSearchFactor === undefined
      ? {}
      : { minimumLineSearchFactor: options.minimumLineSearchFactor }),
    ...(options.contactInitialization === undefined
      ? {}
      : { contactInitialization: options.contactInitialization }),
    ...(options.linearSolver === undefined ? {} : { linearSolver: options.linearSolver }),
    ...(options.designFailureEvents === undefined
      ? {}
      : { designFailureEvents: options.designFailureEvents }),
  } satisfies AnalyzeMasonryArchPathOptions;
  const pathAnalysis = collectPerformanceMetrics
    ? analyzeMasonryArchPathWithPerformanceMetrics(model, pathOptions)
    : { result: analyzeMasonryArchPath(model, pathOptions), performanceMetrics: null };
  const pathResult = pathAnalysis.result;
  const pathOutputs = pathResult.outputs;
  const fixedState: MasonryArchVerificationFixedState = {
    status: pathOutputs.fixedState.status,
    lambda: 0,
    step: pathOutputs.fixedState.step,
    failedCriteria: pathOutputs.fixedState.failedCriteria,
    failureMode: pathOutputs.fixedState.failureMode,
    source: "path-fixed-preload",
  };
  const significantStates: MasonryArchVerificationSignificantStates = {
    fixedState: { source: "path-step", step: pathOutputs.significantSteps.fixedState },
    designState:
      pathOutputs.significantSteps.designState === null
        ? null
        : { source: "path-step", step: pathOutputs.significantSteps.designState },
    verificationLimit:
      pathOutputs.significantSteps.verificationLimit === null
        ? null
        : {
            source: "path-step",
            step: pathOutputs.significantSteps.verificationLimit,
          },
    firstLimit:
      pathOutputs.significantSteps.firstLimit === null
        ? null
        : { source: "path-step", step: pathOutputs.significantSteps.firstLimit },
    peak:
      pathOutputs.significantSteps.peak === null
        ? null
        : { source: "path-step", step: pathOutputs.significantSteps.peak },
    lastConverged:
      pathOutputs.significantSteps.lastConverged === null
        ? null
        : { source: "path-step", step: pathOutputs.significantSteps.lastConverged },
    termination:
      pathOutputs.significantSteps.termination === null
        ? null
        : { source: "path-step", step: pathOutputs.significantSteps.termination },
  };
  const assessment = pathOutputs.engineeringAssessment!;
  const outputs: MasonryArchVerificationOutputs = {
    modelId: model.id,
    route: "arc-length-continuation",
    analysis: pathOutputs.analysis,
    fixedState,
    engineeringAssessment: assessment,
    lambdaVerificationLimit: pathOutputs.capacity.lambdaVerificationLimit,
    failureMode: assessment.failureMode,
    capacity: pathOutputs.capacity,
    significantStates,
    diagnostics: {
      lastConvergedLambda: pathOutputs.convergenceInfo.lastConvergedLambda,
      maximumObservedLambda: pathOutputs.convergenceInfo.maximumObservedLambda,
      lastConvergedStep: pathOutputs.convergenceInfo.lastConvergedStep,
      terminationReason: pathOutputs.convergenceInfo.terminationReason,
      cutbacks: pathOutputs.convergenceInfo.cutbacks,
      lambdaBracket: pathOutputs.convergenceInfo.lambdaBracket,
      verifiedLimitPoint: pathOutputs.convergenceInfo.verifiedLimitPoint,
      designStateCorrectorAttempts: pathOutputs.convergenceInfo.designStateCorrectorAttempts,
    },
    subAnalyses: {
      fixedStateEquilibrium: null,
      designStateEquilibrium: null,
      limitAnalysis: null,
      path: pathResult,
    },
  };
  return { outputs, performanceMetrics: pathAnalysis.performanceMetrics };
}

/**
 * Standard masonry-arch design verification. This façade is the authority on the fixed-state
 * result, the PASS/FAIL/INDETERMINATE verdict, the exact lambda = 1 design state, the
 * verification limit, the failure mode, the failed criteria, the significant states, and the
 * numerical diagnostics; consumers do not orchestrate the underlying primitives.
 *
 * Route selection: rigid-plastic models (unreinforced or reinforced) use the static route —
 * fixed-state equilibrium first, then the assigned lambda = 1 equilibrium, with direct limit
 * analysis quantifying a meaningful lambda limit when lambda = 1 is not statically admissible.
 * Deformable models use the arc-length route — the primary equilibrium branch is followed with
 * adaptive arc length, the exact design state is certified by a fixed-lambda corrector at the
 * crossing of lambda = 1, and a certified global limit point below one is reported as an
 * instability failure with its verification limit.
 *
 * F(lambda) = F_fixed + lambda * F_scalable after combination factors; lambda is never called a
 * safety factor. If the fixed state fails or is numerically undeterminable, no scalable lambda
 * is defined. A numerical difficulty is never transformed into a capacity or a physical failure.
 */
function analyzeMasonryArchVerificationCore(
  modelInput: MasonryArchModelLike,
  options: AnalyzeMasonryArchVerificationOptions,
  collectPerformanceMetrics: boolean,
): {
  readonly result: MasonryArchVerificationResult;
  readonly performanceMetrics: MasonryArchPathPerformanceMetrics | null;
} {
  const model = asMasonryArchModel(modelInput);
  assertExplicitUnitSystem(options.units, "AnalyzeMasonryArchVerificationOptions");
  const route: MasonryArchVerificationRoute =
    model.interfaceLaw.response === "deformable"
      ? "arc-length-continuation"
      : "rigid-plastic-static";
  const analyzed =
    route === "rigid-plastic-static"
      ? { ...staticRoute(model, options), performanceMetrics: null }
      : arcLengthRoute(model, options, collectPerformanceMetrics);
  const { outputs } = analyzed;
  const assessment = outputs.engineeringAssessment;
  const warnings =
    assessment.status === "INDETERMINATE" && outputs.diagnostics.terminationReason !== null
      ? [outputs.diagnostics.terminationReason]
      : [];
  const result = new CalculationResult<MasonryArchVerificationOutputs>({
    applicationId: "masonry-arch-verification",
    status: masonryArchResultStatusFromAssessmentStatus(assessment.status),
    summary:
      assessment.status === "PASS"
        ? "The fixed-load state is verified and the exact design state at lambda = 1 satisfies the prescribed criteria."
        : assessment.status === "FAIL"
          ? outputs.fixedState.status === "FAIL"
            ? `Verification failed on the fixed-load state (${assessment.failureMode ?? "undetermined"}); no scalable lambda is defined.`
            : `Verification failed at lambda ${assessment.lambda} (${assessment.failureMode ?? "undetermined"}) with verification limit ${outputs.lambdaVerificationLimit ?? "unknown"}.`
          : "The numerical process could not determine whether the design state satisfies the prescribed criteria.",
    outputs,
    warnings,
    assumptions: [
      "F(lambda) = F_fixed + lambda * F_scalable after combination factors; lambda is a load proportionality parameter, never a safety factor.",
      "The fixed-load state at lambda = 0 is verified first; FAIL or INDETERMINATE stops the verification without defining a scalable lambda.",
      "Rigid-plastic models are verified with assigned static equilibrium and, on a fixed-passed/design-failed outcome, direct limit analysis of the scalable pattern.",
      "Deformable and reinforced models are verified along the primary equilibrium branch with adaptive arc length; the exact lambda = 1 state is certified by a fixed-lambda Newton corrector.",
      "A certified global limit point requires opposite-signed tangent load components between consecutive converged states plus bracketing refinement; a discrete local plastic event is never a certified limit point.",
      "Numerical diagnostics are published on INDETERMINATE but are never capacity, never a failure, and never the engineering verdict.",
      "Active reinforcement uses its assigned T0 as part of the fixed state; passive reinforcement has T0 = 0.",
    ],
    metadata: {
      schemaVersion: MASONRY_ARCH_VERIFICATION_RESULT_SCHEMA_VERSION,
      modelSchemaVersion: model.schemaVersion,
      sourceUnits: model.sourceUnits,
      analysisSourceUnits: options.units,
      units: model.units,
      axes: { x: "right", y: "up", moment: "counter-clockwise" },
      route,
      analysisObjective: "design-state-check",
      loadCombinationId: options.loadCombination?.id ?? null,
      loadCombinationType: options.loadCombination?.combinationType ?? null,
      normativeConformityClaimed: false,
    },
  });
  return { result, performanceMetrics: analyzed.performanceMetrics };
}

export function analyzeMasonryArchVerification(
  modelInput: MasonryArchModelLike,
  options: AnalyzeMasonryArchVerificationOptions,
): MasonryArchVerificationResult {
  return analyzeMasonryArchVerificationCore(modelInput, options, false).result;
}

/** Internal benchmark entry; no counters are added to the public verification DTO. */
export function analyzeMasonryArchVerificationWithPerformanceMetrics(
  modelInput: MasonryArchModelLike,
  options: AnalyzeMasonryArchVerificationOptions,
): {
  readonly result: MasonryArchVerificationResult;
  readonly performanceMetrics: MasonryArchPathPerformanceMetrics | null;
} {
  return analyzeMasonryArchVerificationCore(modelInput, options, true);
}
