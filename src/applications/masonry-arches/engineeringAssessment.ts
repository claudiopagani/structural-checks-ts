import { RESULT_STATUS, type ResultStatus } from "../../core/results/resultStatus.js";
import type {
  MasonryArchEngineeringAssessmentStatus,
  MasonryArchEngineeringCheckId,
  MasonryArchEngineeringCriterion,
  MasonryArchEngineeringCriterionKind,
  MasonryArchEventKind,
  MasonryArchFailureMode,
  MasonryArchGlobalBranchEventKind,
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
  if (isMasonryArchPhysicalLimitEventKind(kind)) return kind;
  return kind === "equilibrium-limit-point" ? "equilibrium-limit-point" : null;
}

/**
 * True for the certified global branch limit point. It is a criterion candidate but is never
 * part of the configurable physical-limit taxonomy: it is always design-blocking and can never
 * be enabled or disabled through `designFailureEvents`.
 */
export function isMasonryArchGlobalBranchEventKind(
  kind: MasonryArchEventKind,
): kind is MasonryArchGlobalBranchEventKind {
  return kind === "equilibrium-limit-point";
}

/**
 * Physical mechanism family of one violated criterion kind. Several criterion kinds can describe
 * stages of the same family (for example yielding and tensile rupture of one reinforcement
 * system); the family, not the number of failed criteria, is what the global failure mode
 * classifies. `equilibrium-infeasible` and every kind without a physical family map to null.
 */
type MasonryArchMechanismFamily =
  | "masonry-compression"
  | "sliding"
  | "reinforcement"
  | "anchor"
  | "instability";

function masonryArchMechanismFamily(
  kind: MasonryArchEngineeringCriterionKind,
): MasonryArchMechanismFamily | null {
  switch (kind) {
    case "compression-strength-reached":
    case "crushing":
      return "masonry-compression";
    case "plastic-sliding":
      return "sliding";
    case "reinforcement-yielded":
    case "reinforcement-rupture":
    case "bonded-layer-capacity-reached":
      return "reinforcement";
    case "anchor-capacity-reached":
      return "anchor";
    case "extrados-contact-invalid":
      return "instability";
    case "equilibrium-limit-point":
      return "instability";
    case "equilibrium-infeasible":
      return null;
  }
}

/**
 * Shared mapping from violated criterion kinds to a global mechanism classification. Criteria are
 * first grouped by physical mechanism family: a single family resolves to the family's failure
 * mode (within the reinforcement family, rupture or bonded-layer capacity prevails over bare
 * yielding), and several distinct families resolve to `mixed`. `mixed` therefore means multiple
 * distinct physical mechanism families, never merely multiple failed criteria of one family.
 * `equilibrium-infeasible` and every kind without a physical family leave the mode `undetermined`.
 * Used by both the path event interpretation and the equilibrium assessment so that the same
 * physical violation receives the same failure mode regardless of the producing analysis.
 */
export function masonryArchFailureModeFromKinds(
  kinds: readonly MasonryArchEngineeringCriterionKind[],
): MasonryArchFailureMode {
  const families = new Set<MasonryArchMechanismFamily>();
  let reinforcementYielded = false;
  let reinforcementFailed = false;
  for (const kind of kinds) {
    const family = masonryArchMechanismFamily(kind);
    if (family === "reinforcement") {
      if (kind === "reinforcement-yielded") reinforcementYielded = true;
      else reinforcementFailed = true;
    }
    if (family !== null) families.add(family);
  }
  const uniqueFamilies = [...families];
  if (uniqueFamilies.length > 1) return "mixed";
  const family = uniqueFamilies[0];
  if (family === undefined) return "undetermined";
  switch (family) {
    case "masonry-compression":
      return "masonry-crushing";
    case "sliding":
      return "sliding";
    case "reinforcement":
      return reinforcementFailed
        ? "reinforcement-failure"
        : reinforcementYielded
          ? "reinforcement-yield"
          : "undetermined";
    case "anchor":
      return "anchor-capacity";
    case "instability":
      return "instability";
  }
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
