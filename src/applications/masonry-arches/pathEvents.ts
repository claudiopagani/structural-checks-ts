import type { RigidBlockDeformableInterfaceEvaluation2D } from "../../domain/masonry/rigid-blocks/evaluateDeformableInterface2D.js";
import type {
  ArchAnchorForceResult,
  ArchContactForceResult,
  ArchReinforcementStateResult,
  BondedLayerStateResult,
  MasonryArchAnalysisObjective,
  MasonryArchFailureMode,
  MasonryArchPhysicalLimitEventKind,
  NormalizedMasonryArchModel,
} from "./types.js";
import { masonryArchFailureModeFromKinds } from "./engineeringAssessment.js";
import type {
  MasonryArchEvent,
  MasonryArchEventCategory,
  MasonryArchEventKind,
} from "./pathTypes.js";

export const DEFAULT_DESIGN_FAILURE_EVENTS: readonly MasonryArchEventKind[] = [
  "plastic-sliding",
  "compression-strength-reached",
  "crushing",
  "reinforcement-yielded",
  "reinforcement-rupture",
  "anchor-capacity-reached",
  "bonded-layer-capacity-reached",
  "extrados-contact-invalid",
] satisfies readonly MasonryArchPhysicalLimitEventKind[];

interface MasonryArchEventEvaluation {
  readonly interfaces: readonly RigidBlockDeformableInterfaceEvaluation2D[];
  readonly reinforcement: {
    readonly reinforcementState: readonly ArchReinforcementStateResult[];
    readonly anchorForces: readonly ArchAnchorForceResult[];
    readonly contactForces: readonly ArchContactForceResult[];
  };
  readonly bondedLayerState: readonly BondedLayerStateResult[];
}

function normalizedInterfaceLaw(
  model: NormalizedMasonryArchModel,
  index: number,
): NormalizedMasonryArchModel["interfaceLaw"] {
  if (index === 0) return model.supports.left.interfaceLaw;
  if (index === model.geometry.interfaces.length - 1) return model.supports.right.interfaceLaw;
  return model.interfaceLaw;
}

export function createMasonryArchEvent(
  category: MasonryArchEventCategory,
  kind: MasonryArchEventKind,
  step: number | null,
  lambda: number | null,
  entityIds: readonly string[],
  message: string,
): MasonryArchEvent {
  return { category, kind, step, lambda, entityIds, message };
}

export function detectMasonryArchStepEvents(
  model: NormalizedMasonryArchModel,
  previous: MasonryArchEventEvaluation,
  current: MasonryArchEventEvaluation,
  step: number,
  lambda: number,
): MasonryArchEvent[] {
  const events: MasonryArchEvent[] = [];
  const gapTolerance = 1e-12 * Math.max(1, model.geometry.span);
  for (const [index, currentInterface] of current.interfaces.entries()) {
    const previousInterface = previous.interfaces[index]!;
    const id = currentInterface.interfaceId;
    const wasOpen = previousInterface.maximumOpening > gapTolerance;
    const isOpen = currentInterface.maximumOpening > gapTolerance;
    if (!wasOpen && isOpen) {
      events.push(
        createMasonryArchEvent(
          "observable-event",
          "joint-opened",
          step,
          lambda,
          [id],
          `Joint ${id} opened.`,
        ),
      );
    } else if (wasOpen && !isOpen) {
      events.push(
        createMasonryArchEvent(
          "observable-event",
          "joint-closed",
          step,
          lambda,
          [id],
          `Joint ${id} closed.`,
        ),
      );
    }
    if (!previousInterface.sliding && currentInterface.sliding) {
      events.push(
        createMasonryArchEvent(
          "observable-event",
          "sliding-started",
          step,
          lambda,
          [id],
          `Sliding initiated at joint ${id}.`,
        ),
        createMasonryArchEvent(
          "engineering-limit",
          "plastic-sliding",
          step,
          lambda,
          [id],
          `Plastic sliding is active at joint ${id}.`,
        ),
      );
    }
    if (!previousInterface.crushing && currentInterface.crushing) {
      const law = normalizedInterfaceLaw(model, index);
      const terminal = law.deformability?.normal.postCrushingBehavior === "stop-at-onset";
      events.push(
        createMasonryArchEvent(
          "engineering-limit",
          "compression-strength-reached",
          step,
          lambda,
          [id],
          `Joint ${id} reached its assigned compression strength.`,
        ),
        createMasonryArchEvent(
          terminal ? "terminal-physical-event" : "engineering-limit",
          "crushing",
          step,
          lambda,
          [id],
          terminal
            ? `Crushing onset at joint ${id} terminates the stop-at-onset law.`
            : `Perfectly-plastic crushing is active at joint ${id}.`,
        ),
      );
    }
  }

  const previousReinforcement = new Map(
    previous.reinforcement.reinforcementState.map((item) => [item.reinforcementId, item]),
  );
  for (const currentState of current.reinforcement.reinforcementState) {
    const prior = previousReinforcement.get(currentState.reinforcementId);
    if (prior?.state === "slack" && currentState.state === "active-passive") {
      events.push(
        createMasonryArchEvent(
          "observable-event",
          "passive-tendon-activated",
          step,
          lambda,
          [currentState.reinforcementId],
          `Passive tendon ${currentState.reinforcementId} activated by compatibility.`,
        ),
      );
    }
    if (prior !== undefined && prior.state !== "slack" && currentState.state === "slack") {
      events.push(
        createMasonryArchEvent(
          "warning",
          "tendon-slackened",
          step,
          lambda,
          [currentState.reinforcementId],
          `Tendon ${currentState.reinforcementId} became slack.`,
        ),
      );
    }
    if (prior?.state !== "yielded" && currentState.state === "yielded") {
      events.push(
        createMasonryArchEvent(
          "terminal-physical-event",
          "reinforcement-yielded",
          step,
          lambda,
          [currentState.reinforcementId],
          `Reinforcement ${currentState.reinforcementId} reached yield; no post-yield law is assigned.`,
        ),
      );
    }
    if (prior?.state !== "failed" && currentState.state === "failed") {
      events.push(
        createMasonryArchEvent(
          "terminal-physical-event",
          "reinforcement-rupture",
          step,
          lambda,
          [currentState.reinforcementId],
          `Reinforcement ${currentState.reinforcementId} reached tensile or ultimate-strain failure.`,
        ),
      );
    }
  }

  const previousAnchors = new Map(
    previous.reinforcement.anchorForces.map((item) => [item.anchorId, item]),
  );
  for (const anchor of current.reinforcement.anchorForces) {
    if (previousAnchors.get(anchor.anchorId)?.status !== "fail" && anchor.status === "fail") {
      events.push(
        createMasonryArchEvent(
          "terminal-physical-event",
          "anchor-capacity-reached",
          step,
          lambda,
          [anchor.anchorId],
          `Anchor ${anchor.anchorId} exceeded its assigned capacity.`,
        ),
      );
    }
  }

  const previousLayerStates = new Map(
    previous.bondedLayerState.flatMap((layer) =>
      layer.interfaces.map(
        (item) => [`${item.reinforcementId}:${item.interfaceId}`, item.state] as const,
      ),
    ),
  );
  for (const item of current.bondedLayerState.flatMap((layer) => layer.interfaces)) {
    const id: `${string}:${string}` = `${item.reinforcementId}:${item.interfaceId}`;
    if (previousLayerStates.get(id) !== "at-capacity" && item.state === "at-capacity") {
      events.push(
        createMasonryArchEvent(
          "engineering-limit",
          "bonded-layer-capacity-reached",
          step,
          lambda,
          [item.reinforcementId, item.interfaceId],
          `Bonded layer ${item.reinforcementId} reached capacity at ${item.interfaceId}.`,
        ),
      );
    }
  }

  const previousContacts = new Map(
    previous.reinforcement.contactForces.map((item) => [item.contactId, item.state]),
  );
  const changedContacts = current.reinforcement.contactForces.filter(
    (item) => previousContacts.get(item.contactId) !== item.state,
  );
  if (changedContacts.length > 0) {
    events.push(
      createMasonryArchEvent(
        "observable-event",
        "extrados-contact-active-set-changed",
        step,
        lambda,
        changedContacts.map((item) => item.contactId),
        "The extrados tendon contact active set changed.",
      ),
    );
  }
  const invalidContacts = changedContacts.filter(
    (item) => item.state === "contact-cannot-enforce-path",
  );
  if (invalidContacts.length > 0) {
    events.push(
      createMasonryArchEvent(
        "terminal-physical-event",
        "extrados-contact-invalid",
        step,
        lambda,
        invalidContacts.map((item) => item.contactId),
        "The extrados tendon path would require tensile contact.",
      ),
    );
  }
  return events;
}

export function masonryArchFailureModeFromEvents(
  events: readonly MasonryArchEvent[],
): MasonryArchFailureMode {
  return masonryArchFailureModeFromKinds(events.map((item) => item.kind));
}

export function shouldStopMasonryArchPathForEvents(
  objective: MasonryArchAnalysisObjective,
  policy: "stop" | "continue",
  events: readonly MasonryArchEvent[],
  designFailureEvents: ReadonlySet<MasonryArchEventKind>,
): boolean {
  if (events.some((item) => item.category === "terminal-physical-event")) return true;
  if (policy === "stop" && events.some((item) => item.category === "engineering-limit"))
    return true;
  return (
    objective === "design-state-check" && events.some((item) => designFailureEvents.has(item.kind))
  );
}
