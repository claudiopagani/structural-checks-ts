import type {
  MasonryArchEngineeringCriterion,
  MasonryArchEngineeringCriterionKind,
  MasonryArchFailureMode,
} from "./types.js";
import type { MasonryArchEvent } from "./pathTypes.js";

export interface MasonryArchEngineeringCriterionData {
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
    entityIds,
    lambda: data.lambda ?? null,
    demand: data.demand ?? null,
    capacity: data.capacity ?? null,
    utilizationRatio: data.utilizationRatio ?? null,
  };
}

/**
 * Maps one path event onto the shared criterion taxonomy. Every event kind is a valid criterion
 * kind, so the mapping is total; demand, capacity, and utilization are not carried by path events
 * and remain null. The event log stays available for step, category, and message details.
 */
export function masonryArchEngineeringCriterionFromEvent(
  event: MasonryArchEvent,
): MasonryArchEngineeringCriterion {
  return {
    kind: event.kind,
    entityIds: event.entityIds,
    lambda: event.lambda,
    demand: null,
    capacity: null,
    utilizationRatio: null,
  };
}

/**
 * Shared mapping from violated criterion kinds to a global mechanism classification. Observable,
 * warning, numerical, and infeasibility kinds do not determine a mechanism and leave the mode
 * undetermined. Used by both the path event interpretation and the equilibrium assessment so that
 * the same physical violation receives the same failure mode regardless of the producing analysis.
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
