import type { RigidBlockDeformableInterfaceEvaluation2D } from "../../domain/masonry/rigid-blocks/evaluateDeformableInterface2D.js";
import type {
  ArchContactForceResult,
  ArchDeviceForceResult,
  ArchReinforcementStateResult,
  BondedLayerStateResult,
  MasonryArchAnalysisObjective,
  MasonryArchDesignFailureEventKind,
  MasonryArchFailureMode,
  MasonryArchPhysicalLimitEventKind,
  NormalizedMasonryArchModel,
} from "./types.js";
import {
  isMasonryArchPhysicalLimitEventKind,
  masonryArchEngineeringCriterionKindFromEventKind,
  masonryArchFailureModeFromKinds,
} from "./engineeringAssessment.js";
import type {
  MasonryArchEvent,
  MasonryArchEventCategory,
  MasonryArchEventKind,
} from "./pathTypes.js";

/**
 * Default design-failure events. The default policy follows the assigned constitutive law:
 * reaching a local plastic surface is not automatically a global design failure. Local sliding
 * and perfectly-plastic crushing continue the path by default (the system may redistribute and
 * reach the design state), while limits without an assigned post-limit law terminate. The
 * remaining physical-limit kinds keep their default status:
 *
 * - `plastic-sliding` — local plastic slip can redistribute; NOT a default failure;
 * - `compression-strength-reached` / `crushing` — default failures only through the law's own
 *   terminal semantics: `stop-at-onset` emits a terminal event and fails automatically, while
 *   `perfectly-plastic` continues by default;
 * - `reinforcement-yielded` — terminal because no post-yield law is assigned;
 * - `reinforcement-rupture`, `anchor-capacity-reached`, `extrados-contact-invalid` — terminal;
 * - `bonded-layer-capacity-reached` — the assigned law defines no post-capacity behavior.
 *
 * Callers can always opt into a stricter policy by configuring `designFailureEvents`, for
 * example `designFailureEvents: ["plastic-sliding"]` to treat the first plastic sliding as a
 * design failure. The configured kinds are added to this default set: the option can only make
 * the policy stricter, never remove a default failure.
 */
export const DEFAULT_DESIGN_FAILURE_EVENTS: readonly MasonryArchDesignFailureEventKind[] = [
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
    readonly deviceForces: readonly ArchDeviceForceResult[];
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

  const previousDevices = new Map(
    previous.reinforcement.deviceForces.map((item) => [
      item.deviceId,
      item.status === "fail" || item.connectors?.some((connector) => connector.status === "fail"),
    ]),
  );
  const previousConnectors = new Map(
    previous.reinforcement.deviceForces.flatMap((item) =>
      (item.connectors ?? []).map((entry) => [entry.connectorId, entry.status === "fail"] as const),
    ),
  );
  for (const device of current.reinforcement.deviceForces) {
    const failingConnectors =
      device.connectors?.filter((connector) => connector.status === "fail") ?? [];
    const currentlyFailed = device.status === "fail" || failingConnectors.length > 0;
    if (previousDevices.get(device.deviceId) !== true && currentlyFailed) {
      events.push(
        createMasonryArchEvent(
          "terminal-physical-event",
          "anchor-capacity-reached",
          step,
          lambda,
          [device.deviceId],
          `Device ${device.deviceId} exceeded its assigned capacity.`,
        ),
      );
    }
    for (const connector of failingConnectors) {
      if (previousConnectors.get(connector.connectorId) !== true) {
        events.push(
          createMasonryArchEvent(
            "terminal-physical-event",
            "anchor-capacity-reached",
            step,
            lambda,
            [connector.connectorId],
            `Connector ${connector.connectorId} exceeded its assigned capacity.`,
          ),
        );
      }
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
  const kinds = events
    .map((item) => masonryArchEngineeringCriterionKindFromEventKind(item.kind))
    .filter((kind): kind is Exclude<typeof kind, null> => kind !== null);
  return masonryArchFailureModeFromKinds(kinds);
}

export function shouldStopMasonryArchPathForEvents(
  objective: MasonryArchAnalysisObjective,
  policy: "stop" | "continue",
  events: readonly MasonryArchEvent[],
  designFailureEvents: ReadonlySet<MasonryArchDesignFailureEventKind>,
): boolean {
  // A certified global limit point of the primary branch is always continuation-blocking: no
  // lambda target can be reached on this branch and no local policy can re-enable it.
  if (events.some((item) => item.kind === "equilibrium-limit-point")) return true;
  if (events.some((item) => item.category === "terminal-physical-event")) return true;
  if (policy === "stop" && events.some((item) => item.category === "engineering-limit"))
    return true;
  return (
    objective === "design-state-check" &&
    events.some(
      (item) =>
        isMasonryArchPhysicalLimitEventKind(item.kind) && designFailureEvents.has(item.kind),
    )
  );
}
