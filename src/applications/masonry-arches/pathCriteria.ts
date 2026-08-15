import type { MasonryArchEngineeringCriterion, NormalizedMasonryArchModel } from "./types.js";
import type { MasonryArchEvent, MasonryArchPathState, MasonryArchPathStep } from "./pathTypes.js";
import {
  createMasonryArchEngineeringCriterion,
  isMasonryArchPhysicalLimitEventKind,
} from "./engineeringAssessment.js";

/**
 * Path-criterion numeric recovery. A failed design criterion produced by a path event reads its
 * demand, capacity, and utilization exclusively from the converged state of the event's own step.
 * Quantities that the step does not carry stay null; no formula is re-derived and no earlier or
 * later step is consulted.
 */

function normalizedInterfaceLaw(
  model: NormalizedMasonryArchModel,
  index: number,
): NormalizedMasonryArchModel["interfaceLaw"] {
  if (index === 0) return model.supports.left.interfaceLaw;
  if (index === model.geometry.interfaces.length - 1) return model.supports.right.interfaceLaw;
  return model.interfaceLaw;
}

function interfaceCriterionFromState(
  model: NormalizedMasonryArchModel,
  state: MasonryArchPathState,
  interfaceId: string,
  kind: "plastic-sliding" | "compression-strength-reached" | "crushing",
  lambda: number | null,
): MasonryArchEngineeringCriterion {
  const index = model.geometry.interfaces.findIndex((item) => item.id === interfaceId);
  const geometry = index < 0 ? undefined : model.geometry.interfaces[index];
  const item = index < 0 ? undefined : state.interfaces[index];
  if (item === undefined || geometry === undefined) {
    return createMasonryArchEngineeringCriterion(kind, [interfaceId], { lambda });
  }
  if (kind === "plastic-sliding") {
    const law = normalizedInterfaceLaw(model, index);
    const area = geometry.length * geometry.outOfPlaneWidth;
    const capacity =
      law.friction === null
        ? null
        : law.friction.cohesion * area +
          law.friction.frictionCoefficient * Math.max(0, item.normalForce);
    return createMasonryArchEngineeringCriterion(kind, [interfaceId], {
      lambda,
      demand: Math.abs(item.shearForce),
      capacity,
      utilizationRatio: item.frictionUtilization,
    });
  }
  const capacity = normalizedInterfaceLaw(model, index).compressiveStrength;
  const demand = item.maxCompression;
  const utilizationRatio =
    capacity !== null && capacity > 0 && Number.isFinite(demand) ? demand / capacity : null;
  return createMasonryArchEngineeringCriterion(kind, [interfaceId], {
    lambda,
    demand,
    capacity,
    utilizationRatio,
  });
}

function reinforcementCriteriaFromState(
  state: MasonryArchPathState,
  reinforcementId: string,
  lambda: number | null,
  eventKind: "reinforcement-yielded" | "reinforcement-rupture",
): MasonryArchEngineeringCriterion[] {
  const reinforcement = state.reinforcementState.find(
    (item) => item.reinforcementId === reinforcementId,
  );
  if (reinforcement === undefined) {
    return [createMasonryArchEngineeringCriterion(eventKind, [reinforcementId], { lambda })];
  }
  const criteria: MasonryArchEngineeringCriterion[] = [];
  const yielding = reinforcement.checks.yielding;
  if (yielding !== null && yielding.status === "fail") {
    criteria.push(
      createMasonryArchEngineeringCriterion("reinforcement-yielded", [reinforcementId], {
        lambda,
        checkId: "reinforcement-yield-stress",
        demand: yielding.demand,
        capacity: yielding.capacity,
        utilizationRatio: yielding.utilizationRatio,
      }),
    );
  }
  const tensile = reinforcement.checks.tensileFailure;
  if (tensile !== null && tensile.status === "fail") {
    criteria.push(
      createMasonryArchEngineeringCriterion("reinforcement-rupture", [reinforcementId], {
        lambda,
        checkId: "reinforcement-tensile-strength",
        demand: tensile.demand,
        capacity: tensile.capacity,
        utilizationRatio: tensile.utilizationRatio,
      }),
    );
  }
  const ultimate = reinforcement.checks.ultimateStrain;
  if (ultimate !== null && ultimate.status === "fail") {
    criteria.push(
      createMasonryArchEngineeringCriterion("reinforcement-rupture", [reinforcementId], {
        lambda,
        checkId: "reinforcement-ultimate-strain",
        demand: ultimate.demand,
        capacity: ultimate.capacity,
        utilizationRatio: ultimate.utilizationRatio,
      }),
    );
  }
  return criteria;
}

/**
 * Builds every failed engineering criterion certified by one design-failure path event, reading
 * the numeric quantities from the converged state of the event's own step when they are directly
 * available there. A `reinforcement-rupture` event can yield several criteria, one per actually
 * failing tensile or ultimate-strain sub-check. Returns an empty array when the event kind is not
 * a physical-limit kind or the event references no known entity.
 */
export function masonryArchEngineeringCriteriaFromPathEvent(
  model: NormalizedMasonryArchModel,
  event: MasonryArchEvent,
  step: MasonryArchPathStep | null,
): MasonryArchEngineeringCriterion[] {
  if (!isMasonryArchPhysicalLimitEventKind(event.kind)) return [];
  const lambda = event.lambda;
  if (step === null) {
    return [createMasonryArchEngineeringCriterion(event.kind, event.entityIds, { lambda })];
  }
  const state = step.state;
  switch (event.kind) {
    case "plastic-sliding":
    case "compression-strength-reached":
    case "crushing": {
      const interfaceId = event.entityIds[0];
      return interfaceId === undefined
        ? []
        : [interfaceCriterionFromState(model, state, interfaceId, event.kind, lambda)];
    }
    case "reinforcement-yielded":
    case "reinforcement-rupture": {
      const reinforcementId = event.entityIds[0];
      return reinforcementId === undefined
        ? []
        : reinforcementCriteriaFromState(state, reinforcementId, lambda, event.kind);
    }
    case "anchor-capacity-reached": {
      const anchorId = event.entityIds[0];
      const anchor =
        anchorId === undefined
          ? undefined
          : state.anchorForces.find((item) => item.anchorId === anchorId);
      return anchor === undefined
        ? [createMasonryArchEngineeringCriterion(event.kind, event.entityIds, { lambda })]
        : [
            createMasonryArchEngineeringCriterion(event.kind, [anchor.anchorId], {
              lambda,
              demand: anchor.demand.resultant,
              capacity: anchor.capacity.resultant,
              utilizationRatio: anchor.utilizationRatio,
            }),
          ];
    }
    case "bonded-layer-capacity-reached": {
      const [layerId, interfaceId] = event.entityIds;
      const layer =
        layerId === undefined
          ? undefined
          : state.bondedLayerState.find((item) => item.reinforcementId === layerId);
      const item =
        layer === undefined
          ? undefined
          : layer.interfaces.find((entry) => entry.interfaceId === interfaceId);
      return item === undefined
        ? [createMasonryArchEngineeringCriterion(event.kind, event.entityIds, { lambda })]
        : [
            createMasonryArchEngineeringCriterion(
              event.kind,
              [item.reinforcementId, item.interfaceId],
              {
                lambda,
                demand: item.force,
                capacity: item.capacity,
                utilizationRatio: item.utilizationRatio,
              },
            ),
          ];
    }
    case "extrados-contact-invalid":
      return [createMasonryArchEngineeringCriterion(event.kind, event.entityIds, { lambda })];
  }
}
