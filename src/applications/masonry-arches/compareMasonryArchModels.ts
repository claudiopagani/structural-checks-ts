import { CalculationResult } from "../../core/results/CalculationResult.js";
import { RESULT_STATUS } from "../../core/results/resultStatus.js";
import type { ResultStatus } from "../../core/results/resultStatus.js";
import { analyzeMasonryArchEquilibrium } from "./analyzeMasonryArchEquilibrium.js";
import { analyzeMasonryArchLimit } from "./analyzeMasonryArchLimit.js";
import { analyzeMasonryArchPath } from "./analyzeMasonryArchPath.js";
import type { AnalyzeMasonryArchPathOptions, MasonryArchPathResult } from "./pathTypes.js";
import type { MasonryArchModel } from "./MasonryArchModel.js";
import { asMasonryArchModel } from "./MasonryArchModel.js";
import { resolveMasonryArchLoads } from "./resolveMasonryArchLoads.js";
import type {
  AnalyzeMasonryArchEquilibriumOptions,
  AnalyzeMasonryArchLimitOptions,
  MasonryArchCapacityLandmarks,
  MasonryArchFailureMode,
  MasonryArchLimitResult,
  MasonryArchModelInput,
  NormalizedMasonryArchModel,
} from "./types.js";

export const MASONRY_ARCH_MODEL_COMPARISON_RESULT_SCHEMA_VERSION = "6.0.0";

export type MasonryArchComparisonModelLike =
  | MasonryArchModel
  | NormalizedMasonryArchModel
  | MasonryArchModelInput;

export type MasonryArchComparisonAnalysis =
  | { readonly type: "equilibrium"; readonly options?: AnalyzeMasonryArchEquilibriumOptions }
  | { readonly type: "limit"; readonly options: AnalyzeMasonryArchLimitOptions }
  | { readonly type: "path"; readonly options: AnalyzeMasonryArchPathOptions };

export interface MasonryArchModelComparisonCaseInput {
  readonly caseId: string;
  readonly label?: string;
  readonly model: MasonryArchComparisonModelLike;
  readonly analysis: MasonryArchComparisonAnalysis;
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
  | "analysis-type-mismatch"
  | "geometry-mismatch"
  | "load-definition-mismatch"
  | "load-factor-mismatch"
  | "load-role-mismatch"
  | "analysis-objective-mismatch";

export interface MasonryArchComparisonReason {
  readonly code: MasonryArchComparisonReasonCode;
  readonly message: string;
  readonly differingPaths: readonly string[];
}

export interface MasonryArchComparisonMaximum {
  readonly value: number | null;
  readonly itemId: string | null;
}

export interface MasonryArchCapacityDifference {
  readonly difference: number;
  readonly ratio: number;
  readonly differencePercent: number;
}

export interface MasonryArchModelComparisonSummary {
  readonly caseId: string;
  readonly label: string;
  readonly modelId: string;
  readonly analysisType: MasonryArchComparisonAnalysis["type"];
  readonly analysisStatus: ResultStatus;
  readonly numericallyConverged: boolean;
  readonly analysisObjective: string;
  readonly control: "load" | "displacement" | "arc-length" | null;
  readonly constitutiveResponse: NormalizedMasonryArchModel["interfaceLaw"]["response"];
  readonly voussoirCount: number;
  readonly reinforcementIds: readonly string[];
  readonly capacity: MasonryArchCapacityLandmarks | null;
  readonly capacityRelativeToReference: {
    readonly lambdaFirstLimit: MasonryArchCapacityDifference | null;
    readonly lambdaPeak: MasonryArchCapacityDifference | null;
    readonly lambdaTermination: MasonryArchCapacityDifference | null;
    readonly lambdaCollapse: MasonryArchCapacityDifference | null;
  } | null;
  readonly failureMode: MasonryArchFailureMode | null;
  readonly maximumCompression: MasonryArchComparisonMaximum;
  readonly maximumReinforcementForce: MasonryArchComparisonMaximum;
  readonly maximumDeviceForce: MasonryArchComparisonMaximum;
  readonly maximumContactForce: MasonryArchComparisonMaximum;
  /** Null when the case analysis did not certify an equilibrium state (numerical iteration limit). */
  readonly maximumNormalizedEquilibriumResidual: number | null;
  readonly comparableToReference: boolean;
  readonly nonComparableReasons: readonly MasonryArchComparisonReason[];
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

type AnalysisResult =
  | ReturnType<typeof analyzeMasonryArchEquilibrium>
  | MasonryArchLimitResult
  | MasonryArchPathResult;

interface CompletedCase {
  readonly input: MasonryArchModelComparisonCaseInput;
  readonly model: NormalizedMasonryArchModel;
  readonly result: AnalysisResult;
  readonly fingerprint: ComparisonFingerprint;
}

interface ComparisonFingerprint {
  readonly analysisType: MasonryArchComparisonAnalysis["type"];
  readonly geometry: unknown;
  readonly loadDefinitions: unknown;
  readonly loadFactors: unknown;
  readonly loadRoles: unknown;
  readonly analysisObjective: unknown;
}

function nonEmpty(value: string, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string.`);
  }
  return value;
}

function finitePositive(value: number, label: string): number {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${label} must be positive.`);
  return value;
}

function optionsOf(
  analysis: MasonryArchComparisonAnalysis,
):
  | AnalyzeMasonryArchEquilibriumOptions
  | AnalyzeMasonryArchLimitOptions
  | AnalyzeMasonryArchPathOptions {
  return analysis.options ?? {};
}

function fingerprint(
  model: NormalizedMasonryArchModel,
  analysis: MasonryArchComparisonAnalysis,
): ComparisonFingerprint {
  const options = optionsOf(analysis);
  // Resolve the effective factors through the same canonical resolver used by the analyses,
  // honoring the explicit loadFactorsByCaseId precedence over the assigned combination.
  const loads = resolveMasonryArchLoads(model, {
    ...(options.loadCombination === undefined ? {} : { loadCombination: options.loadCombination }),
    ...("loadFactorsByCaseId" in options && options.loadFactorsByCaseId !== undefined
      ? { loadFactorsByCaseId: options.loadFactorsByCaseId }
      : {}),
  });
  const scalableIds = "scalableLoadCaseIds" in options ? options.scalableLoadCaseIds : [];
  const scalable = new Set(scalableIds);
  return {
    analysisType: analysis.type,
    geometry: model.geometry,
    loadDefinitions: { masonry: model.masonry, loads: model.loads },
    loadFactors: loads.loadFactorsByCaseId,
    loadRoles: Object.fromEntries(
      Object.keys(loads.loadFactorsByCaseId)
        .sort()
        .map((id) => [id, scalable.has(id) ? "scalable" : "fixed"]),
    ),
    analysisObjective:
      analysis.type === "path"
        ? analysis.options.analysisObjective
        : analysis.type === "limit"
          ? "capacity"
          : "design-state-check",
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
  const left = reference as Record<string, unknown>;
  const right = candidate as Record<string, unknown>;
  const keys = [...new Set([...Object.keys(left), ...Object.keys(right)])].sort();
  return keys.flatMap((key) =>
    key in left && key in right
      ? differingPaths(left[key], right[key], tolerance, `${path}.${key}`)
      : [`${path}.${key}`],
  );
}

function convergence(result: AnalysisResult): boolean {
  if (result.applicationId === "masonry-arch-equilibrium") {
    return (result as ReturnType<typeof analyzeMasonryArchEquilibrium>).outputs.convergence
      .converged;
  }
  return (result as MasonryArchLimitResult | MasonryArchPathResult).outputs.convergenceInfo
    .converged;
}

function addReason(
  reasons: MasonryArchComparisonReason[],
  code: MasonryArchComparisonReasonCode,
  message: string,
  reference: unknown,
  candidate: unknown,
  tolerance: number,
  path: string,
): void {
  const paths = differingPaths(reference, candidate, tolerance, path);
  if (paths.length > 0) reasons.push({ code, message, differingPaths: paths });
}

function comparisonReasons(
  reference: CompletedCase,
  candidate: CompletedCase,
  tolerance: number,
): MasonryArchComparisonReason[] {
  const reasons: MasonryArchComparisonReason[] = [];
  if (!convergence(reference.result)) {
    reasons.push({
      code: "reference-analysis-not-converged",
      message: "The reference analysis did not converge.",
      differingPaths: [],
    });
  }
  if (candidate !== reference && !convergence(candidate.result)) {
    reasons.push({
      code: "analysis-not-converged",
      message: "The candidate analysis did not converge.",
      differingPaths: [],
    });
  }
  const comparisons: readonly [
    MasonryArchComparisonReasonCode,
    string,
    keyof ComparisonFingerprint,
  ][] = [
    ["analysis-type-mismatch", "Analysis types differ.", "analysisType"],
    ["geometry-mismatch", "Physical arch geometries differ.", "geometry"],
    ["load-definition-mismatch", "Load definitions differ.", "loadDefinitions"],
    ["load-factor-mismatch", "Combination factors differ.", "loadFactors"],
    ["load-role-mismatch", "Fixed/scalable partitions differ.", "loadRoles"],
    ["analysis-objective-mismatch", "Engineering objectives differ.", "analysisObjective"],
  ];
  for (const [code, message, key] of comparisons) {
    addReason(
      reasons,
      code,
      message,
      reference.fingerprint[key],
      candidate.fingerprint[key],
      tolerance,
      key,
    );
  }
  return reasons;
}

function completeCase(input: MasonryArchModelComparisonCaseInput): CompletedCase {
  const model = asMasonryArchModel(input.model);
  const result =
    input.analysis.type === "equilibrium"
      ? analyzeMasonryArchEquilibrium(model, input.analysis.options)
      : input.analysis.type === "limit"
        ? analyzeMasonryArchLimit(model, input.analysis.options)
        : analyzeMasonryArchPath(model, input.analysis.options);
  return { input, model, result, fingerprint: fingerprint(model, input.analysis) };
}

function maximum<T>(
  items: readonly T[],
  value: (item: T) => number | null,
  id: (item: T) => string,
): MasonryArchComparisonMaximum {
  let maximumValue: number | null = null;
  let itemId: string | null = null;
  for (const item of items) {
    const candidate = value(item);
    if (
      candidate !== null &&
      Number.isFinite(candidate) &&
      (maximumValue === null || candidate > maximumValue)
    ) {
      maximumValue = candidate;
      itemId = id(item);
    }
  }
  return { value: maximumValue, itemId };
}

function difference(
  value: number | null,
  reference: number | null,
): MasonryArchCapacityDifference | null {
  if (value === null || reference === null || Math.abs(reference) <= Number.EPSILON) return null;
  return {
    difference: value - reference,
    ratio: value / reference,
    differencePercent: (100 * (value - reference)) / Math.abs(reference),
  };
}

function capacityOf(result: AnalysisResult): MasonryArchCapacityLandmarks | null {
  return result.applicationId === "masonry-arch-equilibrium"
    ? null
    : (result as MasonryArchLimitResult | MasonryArchPathResult).outputs.capacity;
}

function caseSummary(
  completed: CompletedCase,
  reference: CompletedCase,
  tolerance: number,
): MasonryArchModelComparisonSummary {
  const { input, model, result } = completed;
  const reasons = comparisonReasons(reference, completed, tolerance);
  const capacity = capacityOf(result);
  const referenceCapacity = capacityOf(reference.result);
  const state =
    result.applicationId === "masonry-arch-path"
      ? ((result as MasonryArchPathResult).outputs.steps.at(-1)?.state ?? null)
      : null;
  const interfaces: readonly {
    readonly interfaceId: string;
    readonly maxCompression: number | null;
  }[] =
    state?.interfaces ??
    (result as ReturnType<typeof analyzeMasonryArchEquilibrium> | MasonryArchLimitResult).outputs
      .interfaces ??
    [];
  const reinforcementState =
    state?.reinforcementState ??
    (result as ReturnType<typeof analyzeMasonryArchEquilibrium> | MasonryArchLimitResult).outputs
      .reinforcementState;
  const bondedLayerState =
    state?.bondedLayerState ??
    (result as ReturnType<typeof analyzeMasonryArchEquilibrium> | MasonryArchLimitResult).outputs
      .bondedLayerState ??
    [];
  const capacityRelativeToReference =
    reasons.length === 0 && capacity !== null && referenceCapacity !== null
      ? {
          lambdaFirstLimit: difference(
            capacity.lambdaFirstLimit,
            referenceCapacity.lambdaFirstLimit,
          ),
          lambdaPeak: difference(capacity.lambdaPeak, referenceCapacity.lambdaPeak),
          lambdaTermination: difference(
            capacity.lambdaTermination,
            referenceCapacity.lambdaTermination,
          ),
          lambdaCollapse: difference(capacity.lambdaCollapse, referenceCapacity.lambdaCollapse),
        }
      : null;
  const equilibrium =
    state?.equilibrium ??
    (result as ReturnType<typeof analyzeMasonryArchEquilibrium> | MasonryArchLimitResult).outputs
      .equilibrium ??
    null;
  const maximumNormalizedEquilibriumResidual =
    equilibrium === null
      ? null
      : "maximumNormalizedBlockResidual" in equilibrium
        ? equilibrium.maximumNormalizedBlockResidual
        : Math.max(...Object.values(equilibrium.normalizedResidual).map(Math.abs));
  const deviceForces =
    state?.deviceForces ??
    (result as ReturnType<typeof analyzeMasonryArchEquilibrium> | MasonryArchLimitResult).outputs
      .deviceForces;
  const contactForces =
    state?.contactForces ??
    (result as ReturnType<typeof analyzeMasonryArchEquilibrium> | MasonryArchLimitResult).outputs
      .contactForces;
  return {
    caseId: input.caseId,
    label: input.label ?? input.caseId,
    modelId: model.id,
    analysisType: input.analysis.type,
    analysisStatus: result.status,
    numericallyConverged: convergence(result),
    analysisObjective: result.outputs.analysis.analysisObjective,
    control: result.outputs.analysis.numericalStrategy.control,
    constitutiveResponse: model.interfaceLaw.response,
    voussoirCount: model.geometry.voussoirCount,
    reinforcementIds: [...model.reinforcements, ...model.bondedLayers].map((item) => item.id),
    capacity,
    capacityRelativeToReference,
    failureMode:
      result.applicationId === "masonry-arch-equilibrium"
        ? null
        : (result as MasonryArchLimitResult | MasonryArchPathResult).outputs.failureMode,
    maximumCompression: maximum(
      interfaces,
      (item) => item.maxCompression,
      (item) => item.interfaceId,
    ),
    maximumReinforcementForce: maximum(
      [
        ...reinforcementState,
        ...bondedLayerState.map((item) => ({
          reinforcementId: item.reinforcementId,
          force: item.maximumForce,
        })),
      ],
      (item) => item.force,
      (item) => item.reinforcementId,
    ),
    maximumDeviceForce: maximum(
      deviceForces,
      (item) => item.resultant,
      (item) => item.deviceId,
    ),
    maximumContactForce: maximum(
      contactForces,
      (item) => Math.hypot(item.resultantForce.x, item.resultantForce.y),
      (item) => item.contactId,
    ),
    maximumNormalizedEquilibriumResidual,
    comparableToReference: reasons.length === 0,
    nonComparableReasons: reasons,
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
  const ids = new Set<string>();
  for (const item of cases) {
    const id = nonEmpty(item.caseId, "Masonry arch comparison caseId");
    if (ids.has(id)) throw new Error(`Duplicate masonry arch comparison caseId: ${id}.`);
    ids.add(id);
  }
  const tolerance = finitePositive(
    options.comparabilityTolerance ?? 1e-9,
    "Masonry arch comparabilityTolerance",
  );
  const referenceCaseId = options.referenceCaseId ?? cases[0]!.caseId;
  if (!ids.has(referenceCaseId))
    throw new Error(`Unknown masonry arch comparison referenceCaseId: ${referenceCaseId}.`);
  const completed = cases.map(completeCase);
  const reference = completed.find((item) => item.input.caseId === referenceCaseId)!;
  const summaries = completed.map((item) => caseSummary(item, reference, tolerance));
  const nonReference = summaries.filter((item) => item.caseId !== referenceCaseId);
  const comparableCaseCount = nonReference.filter((item) => item.comparableToReference).length;
  const overallComparability =
    comparableCaseCount === nonReference.length
      ? "all-comparable"
      : comparableCaseCount === 0
        ? "none-comparable"
        : "partially-comparable";
  const outputs: MasonryArchModelComparisonOutputs = {
    referenceCaseId,
    overallComparability,
    comparableCaseCount,
    cases: summaries,
  };
  return new CalculationResult({
    applicationId: "masonry-arch-model-comparison",
    status:
      overallComparability === "all-comparable" ? RESULT_STATUS.OK : RESULT_STATUS.NOT_VERIFIED,
    summary: `${comparableCaseCount} of ${nonReference.length} non-reference cases are comparable.`,
    outputs,
    warnings: summaries.flatMap((item) =>
      item.nonComparableReasons.map((reason) => `${item.caseId}: ${reason.message}`),
    ),
    assumptions: [
      "Relative capacity values are reported only between mechanically and semantically comparable analyses.",
    ],
    metadata: {
      schemaVersion: MASONRY_ARCH_MODEL_COMPARISON_RESULT_SCHEMA_VERSION,
      referenceCaseId,
      comparabilityTolerance: tolerance,
      normativeConformityClaimed: false,
    },
  });
}
