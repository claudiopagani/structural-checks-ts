import { RESULT_STATUS, type ResultStatus } from "../../core/results/resultStatus.js";
import type {
  MasonryArchEngineeringAssessmentStatus,
  MasonryArchEngineeringCheckId,
  MasonryArchEngineeringCriterion,
  MasonryArchEngineeringCriterionKind,
  MasonryArchEventKind,
  MasonryArchFailureMode,
  MasonryArchPhysicalLimitEventKind,
} from "./types.js";

export interface MasonryArchEngineeringCriterionData {
  readonly checkId?: MasonryArchEngineeringCheckId | null;
  readonly lambda?: number | null;
  readonly demand?: number | null;
  readonly capacity?: number | null;
  readonly utilizationRatio?: number | null;
}

/**
 * Builds one failed engineering criterion. Quantities that the producing analysis does not know
 * are null; callers must never substitute unrelated solver output for a missing quantity.
 */
export function createMasonryArchEngineeringCriterion(
  kind: MasonryArchEngineeringCriterionKind,
  entityIds: readonly string[],
  data: MasonryArchEngineeringCriterionData = {},
): MasonryArchEngineeringCriterion {
  return {
    kind,
    checkId: data.checkId ?? null,
    entityIds,
    lambda: data.lambda ?? null,
    demand: data.demand ?? null,
    capacity: data.capacity ?? null,
    utilizationRatio: data.utilizationRatio ?? null,
  };
}

/**
 * Event kinds that share the failed-criterion taxonomy. Only physical-limit event kinds can be
 * engineering criteria; observable, warning, and numerical event kinds are never criteria.
 */
export const MASONRY_ARCH_PHYSICAL_LIMIT_EVENT_KINDS: readonly MasonryArchPhysicalLimitEventKind[] =
  [
    "plastic-sliding",
    "compression-strength-reached",
    "crushing",
    "reinforcement-yielded",
    "reinforcement-rupture",
    "anchor-capacity-reached",
    "bonded-layer-capacity-reached",
    "extrados-contact-invalid",
  ];

const PHYSICAL_LIMIT_EVENT_KIND_SET: ReadonlySet<MasonryArchEventKind> = new Set(
  MASONRY_ARCH_PHYSICAL_LIMIT_EVENT_KINDS,
);

/** True when the event kind is a physical limit and therefore a candidate failed criterion. */
export function isMasonryArchPhysicalLimitEventKind(
  kind: MasonryArchEventKind,
): kind is MasonryArchPhysicalLimitEventKind {
  return PHYSICAL_LIMIT_EVENT_KIND_SET.has(kind);
}

/**
 * Maps one event kind onto the failed-criterion taxonomy. Observable, warning, and numerical
 * event kinds have no criterion counterpart and return null, so they can never feed a FAIL
 * verdict or a failure-mode classification.
 */
export function masonryArchEngineeringCriterionKindFromEventKind(
  kind: MasonryArchEventKind,
): MasonryArchEngineeringCriterionKind | null {
  return isMasonryArchPhysicalLimitEventKind(kind) ? kind : null;
}

/**
 * Shared mapping from violated criterion kinds to a global mechanism classification.
 * `equilibrium-infeasible` and every kind without a physical mode leave the mode `undetermined`;
 * simultaneously violated physically distinct criteria produce `mixed`. Used by both the path
 * event interpretation and the equilibrium assessment so that the same physical violation receives
 * the same failure mode regardless of the producing analysis.
 */
export function masonryArchFailureModeFromKinds(
  kinds: readonly MasonryArchEngineeringCriterionKind[],
): MasonryArchFailureMode {
  const set = new Set(kinds);
  const modes: MasonryArchFailureMode[] = [];
  if (set.has("crushing") || set.has("compression-strength-reached"))
    modes.push("masonry-crushing");
  if (set.has("plastic-sliding")) modes.push("sliding");
  if (set.has("reinforcement-yielded")) modes.push("reinforcement-yield");
  if (set.has("reinforcement-rupture") || set.has("bonded-layer-capacity-reached"))
    modes.push("reinforcement-failure");
  if (set.has("anchor-capacity-reached")) modes.push("anchor-capacity");
  if (set.has("extrados-contact-invalid")) modes.push("instability");
  return modes.length > 1 ? "mixed" : (modes[0] ?? "undetermined");
}

/**
 * The single mapping from a design-state engineering verdict to the serialized result status.
 * The assessment is the only source of the design verdict:
 *
 * - PASS: the numerical process succeeded and the verification is satisfied;
 * - FAIL: the numerical process succeeded and determined that the verification is NOT satisfied;
 * - INDETERMINATE: the numerical process produced no determinable engineering judgment.
 */
export function masonryArchResultStatusFromAssessmentStatus(
  status: MasonryArchEngineeringAssessmentStatus,
): ResultStatus {
  switch (status) {
    case "PASS":
      return RESULT_STATUS.OK;
    case "FAIL":
      return RESULT_STATUS.NOT_VERIFIED;
    case "INDETERMINATE":
      return RESULT_STATUS.FAILED;
  }
}
