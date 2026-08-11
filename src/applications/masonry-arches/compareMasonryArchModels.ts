import { CalculationResult } from "../../core/results/CalculationResult.js";
import { RESULT_STATUS } from "../../core/results/resultStatus.js";
import type { ResultStatus } from "../../core/results/resultStatus.js";
import { analyzeMasonryArchCollapse } from "./analyzeMasonryArchCollapse.js";
import type {
  AnalyzeMasonryArchNonlinearOptions,
  MasonryArchNonlinearResult,
} from "./analyzeMasonryArchNonlinear.js";
import { asMasonryArchModel } from "./analyzeMasonryArchState.js";
import type { MasonryArchModel } from "./MasonryArchModel.js";
import { resolveMasonryArchLoads } from "./resolveMasonryArchLoads.js";
import type {
  AnalyzeMasonryArchCollapseOptions,
  MasonryArchCollapseResult,
  MasonryArchFailureMode,
  MasonryArchModelInput,
  NormalizedMasonryArchModel,
} from "./types.js";

export const MASONRY_ARCH_MODEL_COMPARISON_RESULT_SCHEMA_VERSION = "1.0.0";

export type MasonryArchComparisonModelLike =
  | MasonryArchModel
  | NormalizedMasonryArchModel
  | MasonryArchModelInput;
export type MasonryArchComparisonAnalysisOptions =
  | AnalyzeMasonryArchCollapseOptions
  | AnalyzeMasonryArchNonlinearOptions;
type MasonryArchComparisonAnalysisResult = MasonryArchCollapseResult | MasonryArchNonlinearResult;

export interface MasonryArchModelComparisonCaseInput {
  readonly caseId: string;
  readonly label?: string;
  readonly model: MasonryArchComparisonModelLike;
  readonly analysisOptions: MasonryArchComparisonAnalysisOptions;
}

export interface CompareMasonryArchModelsOptions {
  /** Defaults to the first comparison case. */
  readonly referenceCaseId?: string;
  /** Relative tolerance used only for comparability fingerprints. Defaults to 1e-9. */
  readonly comparabilityTolerance?: number;
}

export type MasonryArchComparisonReasonCode =
  | "reference-analysis-not-converged"
  | "analysis-not-converged"
  | "geometry-mismatch"
  | "load-definition-mismatch"
  | "load-factor-mismatch"
  | "load-role-mismatch";

export interface MasonryArchComparisonReason {
  readonly code: MasonryArchComparisonReasonCode;
  readonly message: string;
  readonly differingPaths: readonly string[];
}

export interface MasonryArchComparisonMaximum {
  readonly value: number | null;
  readonly itemId: string | null;
}

export interface MasonryArchModelComparisonSummary {
  readonly caseId: string;
  readonly label: string;
  readonly modelId: string;
  readonly analysisApplicationId: "masonry-arch-collapse" | "masonry-arch-nonlinear";
  readonly analysisStatus: ResultStatus;
  readonly numericallyConverged: boolean;
  readonly geometricNonlinearity: boolean;
  readonly interfaceModel: NormalizedMasonryArchModel["interfaces"]["model"];
  readonly voussoirCount: number;
  readonly reinforcementIds: readonly string[];
  readonly lambdaCritical: number | null;
  readonly failureMode: MasonryArchFailureMode;
  readonly limitMeaning:
    | "kinematically-verified-collapse"
    | "maximum-static-admissibility"
    | "not-determined"
    | "incremental-material-or-path-limit";
  readonly maximumCompression: MasonryArchComparisonMaximum;
  readonly maximumReinforcementForce: MasonryArchComparisonMaximum;
  readonly maximumAnchorForce: MasonryArchComparisonMaximum;
  readonly maximumContactForce: MasonryArchComparisonMaximum;
  readonly maximumNormalizedEquilibriumResidual: number;
  readonly comparableToReference: boolean;
  readonly nonComparableReasons: readonly MasonryArchComparisonReason[];
  readonly relativeToReference: {
    readonly lambdaDifference: number;
    readonly lambdaRatio: number;
    readonly lambdaDifferencePercent: number;
  } | null;
  readonly warnings: readonly unknown[];
  readonly assumptions: readonly unknown[];
}

export interface MasonryArchModelComparisonOutputs extends Record<string, unknown> {
  readonly referenceCaseId: string;
  readonly overallComparability: "all-comparable" | "partially-comparable" | "none-comparable";
  readonly comparableCaseCount: number;
  readonly cases: readonly MasonryArchModelComparisonSummary[];
}

export type MasonryArchModelComparisonResult = CalculationResult<MasonryArchModelComparisonOutputs>;

interface ComparisonFingerprint {
  readonly geometry: unknown;
  readonly loadDefinitions: unknown;
  readonly loadFactors: unknown;
  readonly loadRoles: unknown;
}

interface CompletedComparisonCase {
  readonly input: MasonryArchModelComparisonCaseInput;
  readonly model: NormalizedMasonryArchModel;
  readonly result: MasonryArchComparisonAnalysisResult;
  readonly fingerprint: ComparisonFingerprint;
}

interface ComparableInterfaceResult {
  readonly interfaceId: string;
  readonly maxCompression: number | null;
}

function nonEmpty(value: string, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string.`);
  }
  return value;
}

function finitePositive(value: number, label: string): number {
  if (!Number.isFinite(value) || value <= 0)
    throw new Error(`${label} must be finite and positive.`);
  return value;
}

function sortedRecord<T>(source: Readonly<Record<string, T>>): Readonly<Record<string, T>> {
  return Object.fromEntries(
    Object.entries(source).sort(([left], [right]) => left.localeCompare(right)),
  );
}

function geometryFingerprint(model: NormalizedMasonryArchModel): unknown {
  const { geometry } = model;
  return {
    kind: geometry.kind,
    referenceCurve: geometry.referenceCurve,
    profile: geometry.profile,
    span: geometry.span,
    rise: geometry.rise,
    thickness: geometry.thickness,
    outOfPlaneWidth: geometry.outOfPlaneWidth,
  };
}

function comparisonFingerprint(
  model: NormalizedMasonryArchModel,
  options: MasonryArchComparisonAnalysisOptions,
): ComparisonFingerprint {
  const loads = resolveMasonryArchLoads(model, {
    ...(options.loadCombination === undefined ? {} : { loadCombination: options.loadCombination }),
  });
  const scalable = new Set(options.scalableLoadCaseIds);
  const loadRoles = Object.fromEntries(
    Object.keys(loads.loadFactorsByCaseId)
      .sort((left, right) => left.localeCompare(right))
      .map((id) => [id, scalable.has(id) ? "scalable" : "fixed"]),
  );
  return {
    geometry: geometryFingerprint(model),
    loadDefinitions: {
      masonryUnitWeight: model.masonry.unitWeight,
      loads: [...model.loads].sort((left, right) => left.id.localeCompare(right.id)),
    },
    loadFactors: {
      combinationType: options.loadCombination?.combinationType ?? null,
      values: sortedRecord(loads.loadFactorsByCaseId),
    },
    loadRoles,
  };
}

function differingPaths(
  reference: unknown,
  candidate: unknown,
  tolerance: number,
  path: string,
): string[] {
  if (typeof reference === "number" && typeof candidate === "number") {
    const scale = Math.max(1, Math.abs(reference), Math.abs(candidate));
    return Math.abs(reference - candidate) <= tolerance * scale ? [] : [path];
  }
  if (
    reference === null ||
    candidate === null ||
    typeof reference !== "object" ||
    typeof candidate !== "object"
  ) {
    return Object.is(reference, candidate) ? [] : [path];
  }
  if (Array.isArray(reference) || Array.isArray(candidate)) {
    if (!Array.isArray(reference) || !Array.isArray(candidate)) return [path];
    const differences = reference.length === candidate.length ? [] : [`${path}.length`];
    for (let index = 0; index < Math.min(reference.length, candidate.length); index += 1) {
      differences.push(
        ...differingPaths(reference[index], candidate[index], tolerance, `${path}[${index}]`),
      );
    }
    return differences;
  }
  const referenceRecord = reference as Record<string, unknown>;
  const candidateRecord = candidate as Record<string, unknown>;
  const keys = [
    ...new Set([...Object.keys(referenceRecord), ...Object.keys(candidateRecord)]),
  ].sort();
  return keys.flatMap((key) =>
    key in referenceRecord && key in candidateRecord
      ? differingPaths(referenceRecord[key], candidateRecord[key], tolerance, `${path}.${key}`)
      : [`${path}.${key}`],
  );
}

function maximum<T>(
  items: readonly T[],
  value: (item: T) => number | null,
  id: (item: T) => string,
): MasonryArchComparisonMaximum {
  let governingValue: number | null = null;
  let governingId: string | null = null;
  for (const item of items) {
    const candidate = value(item);
    if (candidate === null || !Number.isFinite(candidate)) continue;
    if (governingValue === null || candidate > governingValue) {
      governingValue = candidate;
      governingId = id(item);
    }
  }
  return { value: governingValue, itemId: governingId };
}

function comparisonReasons(
  reference: CompletedComparisonCase,
  candidate: CompletedComparisonCase,
  tolerance: number,
): MasonryArchComparisonReason[] {
  const reasons: MasonryArchComparisonReason[] = [];
  const addDifference = (
    code: MasonryArchComparisonReasonCode,
    message: string,
    referenceValue: unknown,
    candidateValue: unknown,
    path: string,
  ): void => {
    const differences = differingPaths(referenceValue, candidateValue, tolerance, path);
    if (differences.length > 0) reasons.push({ code, message, differingPaths: differences });
  };
  if (!reference.result.outputs.convergenceInfo.converged) {
    reasons.push({
      code: "reference-analysis-not-converged",
      message: `Reference case ${reference.input.caseId} did not converge numerically.`,
      differingPaths: [],
    });
  }
  if (candidate !== reference && !candidate.result.outputs.convergenceInfo.converged) {
    reasons.push({
      code: "analysis-not-converged",
      message: `Case ${candidate.input.caseId} did not converge numerically.`,
      differingPaths: [],
    });
  }
  addDifference(
    "geometry-mismatch",
    "Physical arch geometry differs from the reference case.",
    reference.fingerprint.geometry,
    candidate.fingerprint.geometry,
    "geometry",
  );
  addDifference(
    "load-definition-mismatch",
    "Normalized load definitions differ from the reference case.",
    reference.fingerprint.loadDefinitions,
    candidate.fingerprint.loadDefinitions,
    "loading.definitions",
  );
  addDifference(
    "load-factor-mismatch",
    "Combination factors differ from the reference case.",
    reference.fingerprint.loadFactors,
    candidate.fingerprint.loadFactors,
    "loading.factors",
  );
  addDifference(
    "load-role-mismatch",
    "Fixed and scalable load-case selections differ from the reference case.",
    reference.fingerprint.loadRoles,
    candidate.fingerprint.loadRoles,
    "loading.roles",
  );
  return reasons;
}

function completeCase(input: MasonryArchModelComparisonCaseInput): CompletedComparisonCase {
  const model = asMasonryArchModel(input.model);
  let result: MasonryArchComparisonAnalysisResult;
  if (input.analysisOptions.geometricNonlinearity === true) {
    result = analyzeMasonryArchCollapse(model, input.analysisOptions);
  } else {
    result = analyzeMasonryArchCollapse(model, input.analysisOptions);
  }
  return {
    input,
    model,
    result,
    fingerprint: comparisonFingerprint(model, input.analysisOptions),
  };
}

function caseSummary(
  completed: CompletedComparisonCase,
  reference: CompletedComparisonCase,
  tolerance: number,
): MasonryArchModelComparisonSummary {
  const { input, model, result } = completed;
  const reasons = comparisonReasons(reference, completed, tolerance);
  const comparable = reasons.length === 0;
  const referenceLambda = reference.result.outputs.lambdaCritical;
  const lambda = result.outputs.lambdaCritical;
  const relativeToReference =
    comparable && referenceLambda !== null && lambda !== null && Math.abs(referenceLambda) > 0
      ? {
          lambdaDifference: lambda - referenceLambda,
          lambdaRatio: lambda / referenceLambda,
          lambdaDifferencePercent: (100 * (lambda - referenceLambda)) / Math.abs(referenceLambda),
        }
      : null;
  const interfaceResults: readonly ComparableInterfaceResult[] = result.outputs.interfaces;
  const maximumCompression = maximum(
    interfaceResults,
    (item) => item.maxCompression,
    (item) => item.interfaceId,
  );
  const maximumReinforcementForce = maximum(
    [
      ...result.outputs.reinforcementState,
      ...result.outputs.bondedLayerState.map((item) => ({
        reinforcementId: item.reinforcementId,
        force: item.maximumForce,
      })),
    ],
    (item) => item.force,
    (item) => item.reinforcementId,
  );
  const maximumAnchorForce = maximum(
    result.outputs.anchorForces,
    (item) => item.resultant,
    (item) => item.anchorId,
  );
  const maximumContactForce = maximum(
    result.outputs.contactForces,
    (item) => Math.hypot(item.resultantForce.x, item.resultantForce.y),
    (item) => item.contactId,
  );
  const nonlinear = result.applicationId === "masonry-arch-nonlinear";
  const maximumNormalizedEquilibriumResidual = nonlinear
    ? (result as MasonryArchNonlinearResult).outputs.equilibrium.maximumNormalizedBlockResidual
    : Math.max(
        ...Object.values(
          (result as MasonryArchCollapseResult).outputs.equilibrium.normalizedResidual,
        ).map(Math.abs),
      );
  return {
    caseId: input.caseId,
    label: input.label ?? input.caseId,
    modelId: model.id,
    analysisApplicationId: nonlinear ? "masonry-arch-nonlinear" : "masonry-arch-collapse",
    analysisStatus: result.status,
    numericallyConverged: result.outputs.convergenceInfo.converged,
    geometricNonlinearity: nonlinear,
    interfaceModel: model.interfaces.model,
    voussoirCount: model.geometry.voussoirCount,
    reinforcementIds: [
      ...model.reinforcements.map((item) => item.id),
      ...model.bondedLayers.map((item) => item.id),
    ],
    lambdaCritical: lambda,
    failureMode: result.outputs.failureMode,
    limitMeaning: nonlinear
      ? "incremental-material-or-path-limit"
      : (result as MasonryArchCollapseResult).outputs.limitMeaning,
    maximumCompression,
    maximumReinforcementForce,
    maximumAnchorForce,
    maximumContactForce,
    maximumNormalizedEquilibriumResidual,
    comparableToReference: comparable,
    nonComparableReasons: reasons,
    relativeToReference,
    warnings: result.warnings,
    assumptions: result.assumptions,
  };
}

export function compareMasonryArchModels(
  cases: readonly MasonryArchModelComparisonCaseInput[],
  options: CompareMasonryArchModelsOptions = {},
): MasonryArchModelComparisonResult {
  if (cases.length < 2)
    throw new Error("Masonry arch model comparison requires at least two cases.");
  const seen = new Set<string>();
  for (const item of cases) {
    const id = nonEmpty(item.caseId, "Masonry arch comparison caseId");
    if (seen.has(id)) throw new Error(`Duplicate masonry arch comparison caseId: ${id}.`);
    seen.add(id);
  }
  const tolerance = finitePositive(
    options.comparabilityTolerance ?? 1e-9,
    "Masonry arch comparabilityTolerance",
  );
  const referenceCaseId = options.referenceCaseId ?? cases[0]!.caseId;
  if (!seen.has(referenceCaseId)) {
    throw new Error(`Unknown masonry arch comparison referenceCaseId: ${referenceCaseId}.`);
  }
  const completed = cases.map(completeCase);
  const reference = completed.find((item) => item.input.caseId === referenceCaseId)!;
  const summaries = completed.map((item) => caseSummary(item, reference, tolerance));
  const nonReference = summaries.filter((item) => item.caseId !== referenceCaseId);
  const comparableCaseCount = nonReference.filter((item) => item.comparableToReference).length;
  const overallComparability =
    comparableCaseCount === nonReference.length
      ? ("all-comparable" as const)
      : comparableCaseCount === 0
        ? ("none-comparable" as const)
        : ("partially-comparable" as const);
  const warnings = summaries.flatMap((item) =>
    item.nonComparableReasons.map((reason) => `${item.caseId}: ${reason.message}`),
  );
  const status =
    overallComparability === "all-comparable" ? RESULT_STATUS.OK : RESULT_STATUS.NOT_VERIFIED;
  return new CalculationResult<MasonryArchModelComparisonOutputs>({
    applicationId: "masonry-arch-model-comparison",
    status,
    summary:
      overallComparability === "all-comparable"
        ? `All ${summaries.length} masonry-arch cases are comparable to ${referenceCaseId}.`
        : `${comparableCaseCount} of ${nonReference.length} non-reference masonry-arch cases are comparable to ${referenceCaseId}.`,
    outputs: {
      referenceCaseId,
      overallComparability,
      comparableCaseCount,
      cases: summaries,
    },
    warnings,
    assumptions: [
      "Quantitative relative values are reported only for equal normalized geometry, loading, combination factors, and fixed/scalable load roles.",
      "Differences in interface laws, reinforcement, discretization, and geometric nonlinearity are intentional model variables and do not by themselves prevent comparison.",
      "A null lambda comparison means that at least one analysis did not identify a finite critical multiplier; it is not replaced with zero.",
    ],
    metadata: {
      schemaVersion: MASONRY_ARCH_MODEL_COMPARISON_RESULT_SCHEMA_VERSION,
      units: { force: "kN", length: "m" },
      solutionMeaning: "diagnostic-model-comparison",
      normativeConformityClaimed: false,
    },
  });
}
