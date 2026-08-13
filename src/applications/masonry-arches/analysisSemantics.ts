import {
  resolveMasonryArchLoads,
  type ResolvedMasonryArchLoads,
} from "./resolveMasonryArchLoads.js";
import type {
  MasonryArchAnalysisDescriptor,
  MasonryArchAnalysisObjective,
  MasonryArchLambdaDefinition,
  MasonryArchLoadCombinationLike,
  MasonryArchMechanicalResponse,
  MasonryArchNumericalStrategy,
  NormalizedMasonryArchModel,
} from "./types.js";

const LAMBDA_EXCLUDED_QUANTITIES = [
  "initial-tendon-force",
  "passive-tendon-compatibility-force",
  "support-reactions",
  "contact-actions",
  "deviator-actions",
  "other-solved-response-quantities",
] as const;

export interface ResolvedMasonryArchAnalysisLoads {
  readonly base: ResolvedMasonryArchLoads;
  readonly fixed: ResolvedMasonryArchLoads;
  readonly scalable: ResolvedMasonryArchLoads;
  readonly roleByCaseId: Readonly<Record<string, "fixed" | "scalable">>;
  readonly fixedLoadCaseIds: readonly string[];
  readonly scalableLoadCaseIds: readonly string[];
}

function selectedScalableCases(
  model: NormalizedMasonryArchModel,
  ids: readonly string[],
): ReadonlySet<string> {
  if (ids.length === 0) {
    throw new Error("Masonry-arch analysis requires at least one scalable load case id.");
  }
  const known = new Set(model.loads.map((load) => load.loadCaseId));
  const selected = new Set<string>();
  for (const id of ids) {
    if (typeof id !== "string" || id.trim().length === 0) {
      throw new Error("Every scalable load case id must be a non-empty string.");
    }
    if (!known.has(id)) throw new Error(`Unknown scalable masonry-arch load case: ${id}.`);
    if (selected.has(id)) throw new Error(`Duplicate scalable masonry-arch load case: ${id}.`);
    selected.add(id);
  }
  return selected;
}

function hasNonzeroWrench(loads: ResolvedMasonryArchLoads): boolean {
  return loads.blockWrenches.some(
    (wrench) => wrench.force.x !== 0 || wrench.force.y !== 0 || wrench.moment !== 0,
  );
}

export function resolveMasonryArchAnalysisLoads(
  model: NormalizedMasonryArchModel,
  options: {
    readonly loadCombination?: MasonryArchLoadCombinationLike | null;
    readonly scalableLoadCaseIds: readonly string[];
  },
): ResolvedMasonryArchAnalysisLoads {
  const selected = selectedScalableCases(model, options.scalableLoadCaseIds);
  const base = resolveMasonryArchLoads(model, {
    ...(options.loadCombination === undefined ? {} : { loadCombination: options.loadCombination }),
  });
  const fixedFactors: Record<string, number> = {};
  const scalableFactors: Record<string, number> = {};
  const roleByCaseId: Record<string, "fixed" | "scalable"> = {};
  for (const [id, factor] of Object.entries(base.loadFactorsByCaseId)) {
    const role = selected.has(id) ? "scalable" : "fixed";
    fixedFactors[id] = role === "fixed" ? factor : 0;
    scalableFactors[id] = role === "scalable" ? factor : 0;
    roleByCaseId[id] = role;
  }
  const fixed = resolveMasonryArchLoads(model, { loadFactorsByCaseId: fixedFactors });
  const scalable = resolveMasonryArchLoads(model, { loadFactorsByCaseId: scalableFactors });
  if (!hasNonzeroWrench(scalable)) {
    throw new Error(
      "The selected scalable load cases produce a zero factored wrench field; lambda would be undefined.",
    );
  }
  return {
    base,
    fixed,
    scalable,
    roleByCaseId,
    fixedLoadCaseIds: Object.keys(roleByCaseId)
      .filter((id) => roleByCaseId[id] === "fixed")
      .sort((left, right) => left.localeCompare(right)),
    scalableLoadCaseIds: Object.keys(roleByCaseId)
      .filter((id) => roleByCaseId[id] === "scalable")
      .sort((left, right) => left.localeCompare(right)),
  };
}

export function effectiveMasonryArchLoadFactors(
  baseFactors: Readonly<Record<string, number>>,
  roles: Readonly<Record<string, "fixed" | "scalable">>,
  lambda: number | null,
  fixedLoadFactor = 1,
): Readonly<Record<string, number | null>> {
  return Object.fromEntries(
    Object.entries(baseFactors).map(([id, factor]) => [
      id,
      roles[id] === "scalable"
        ? lambda === null
          ? null
          : lambda * factor
        : fixedLoadFactor * factor,
    ]),
  );
}

export function createMasonryArchLambdaDefinition(
  loading: ResolvedMasonryArchAnalysisLoads,
  currentValue: number | null,
  fixedLoadFactor = 1,
): MasonryArchLambdaDefinition {
  return {
    active: true,
    expression: "F(lambda) = F_fixed + lambda * F_scalable",
    combinationFactorsAppliedBeforePartition: true,
    fixedLoadCaseIds: loading.fixedLoadCaseIds,
    scalableLoadCaseIds: loading.scalableLoadCaseIds,
    baseCombinationFactorsByCaseId: loading.base.loadFactorsByCaseId,
    effectiveLoadFactorsByCaseId: effectiveMasonryArchLoadFactors(
      loading.base.loadFactorsByCaseId,
      loading.roleByCaseId,
      currentValue,
      fixedLoadFactor,
    ),
    currentValue,
    lambdaEqualsOneMeaning:
      "The complete base load combination after its factors are applied: F_fixed + F_scalable.",
    excludedQuantities: LAMBDA_EXCLUDED_QUANTITIES,
  };
}

export function createMasonryArchAssignedStateLambdaDefinition(
  loads: ResolvedMasonryArchLoads,
): MasonryArchLambdaDefinition {
  const fixedLoadCaseIds = Object.keys(loads.loadFactorsByCaseId).sort((left, right) =>
    left.localeCompare(right),
  );
  return {
    active: false,
    expression: "F(lambda) = F_fixed + lambda * F_scalable",
    combinationFactorsAppliedBeforePartition: true,
    fixedLoadCaseIds,
    scalableLoadCaseIds: [],
    baseCombinationFactorsByCaseId: loads.loadFactorsByCaseId,
    effectiveLoadFactorsByCaseId: loads.loadFactorsByCaseId,
    currentValue: 1,
    lambdaEqualsOneMeaning:
      "The assigned factored load state; lambda is inactive because this analysis has no scalable load cases.",
    excludedQuantities: LAMBDA_EXCLUDED_QUANTITIES,
  };
}

export function createMasonryArchAnalysisDescriptor(
  model: NormalizedMasonryArchModel,
  options: {
    readonly analysisObjective: MasonryArchAnalysisObjective;
    readonly interfaceResponse: MasonryArchMechanicalResponse;
    readonly kinematics: "reference-geometry" | "finite-rigid-block";
    readonly numericalStrategy: MasonryArchNumericalStrategy;
    readonly lambda: MasonryArchLambdaDefinition;
  },
): MasonryArchAnalysisDescriptor {
  return {
    analysisObjective: options.analysisObjective,
    mechanicalModel: {
      blockModel: "rigid-voussoir-chain",
      interfaceResponse: options.interfaceResponse,
      constitutiveResponse: model.interfaceLaw.response,
      kinematics: options.kinematics,
    },
    numericalStrategy: options.numericalStrategy,
    lambda: options.lambda,
  };
}
