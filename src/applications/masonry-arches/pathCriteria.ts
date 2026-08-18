import type { MasonryArchEngineeringCriterion } from "./types.js";
import type { MasonryArchEvent, MasonryArchPathState, MasonryArchPathStep } from "./pathTypes.js";
import {
  createMasonryArchEngineeringCriterion,
  isMasonryArchPhysicalLimitEventKind,
} from "./engineeringAssessment.js";

/**
 * Path-criterion mapping. A failed design criterion produced by a path event is the exact copy of
 * the mechanical check that the event's own converged step already published. The mechanical layer
 * owns every formula: demand, capacity, and utilization are read from the step state and never
 * re-derived here. Quantities that the step does not carry stay null; no earlier or later step is
 * consulted.
 */

function interfaceCriterionFromState(
  state: MasonryArchPathState,
  interfaceId: string,
  kind: "plastic-sliding" | "compression-strength-reached" | "crushing",
  lambda: number | null,
): MasonryArchEngineeringCriterion {
  const item = state.interfaces.find((entry) => entry.interfaceId === interfaceId);
  const check = kind === "plastic-sliding" ? item?.checks.friction : item?.checks.compression;
  return check === undefined || check === null
    ? createMasonryArchEngineeringCriterion(kind, [interfaceId], { lambda })
    : createMasonryArchEngineeringCriterion(kind, [interfaceId], {
        lambda,
        checkId: check.criterion,
        demand: check.demand,
        capacity: check.capacity,
        utilizationRatio: check.utilizationRatio,
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
 * Builds the failed engineering criterion for a certified global equilibrium limit point.
 * The demand is the required design lambda (one), the capacity is the certified limit lambda of
 * the primary branch, and the utilization ratio is their ratio. These quantities are the global
 * branch property itself; they are never read from a single interface.
 */
function equilibriumLimitPointCriterion(lambda: number | null): MasonryArchEngineeringCriterion[] {
  const limit = lambda ?? null;
  return [
    createMasonryArchEngineeringCriterion("equilibrium-limit-point", [], {
      lambda: limit,
      checkId: "equilibrium-limit-point",
      demand: 1,
      capacity: limit,
      utilizationRatio: limit === null || limit <= 0 ? null : 1 / limit,
    }),
  ];
}

/**
 * Builds every failed engineering criterion certified by one design-failure path event by copying
 * the checks published by the converged state of the event's own step. Interface criteria are the
 * exact copy of the step's deformable-interface mechanical checks; reinforcement, anchor, and
 * bonded-layer criteria copy the checks the corresponding evaluation already carries. A
 * `reinforcement-rupture` event can yield several criteria, one per actually failing tensile or
 * ultimate-strain sub-check. A certified `equilibrium-limit-point` event yields one global
 * criterion whose quantities are the branch property. Returns an empty array when the event kind
 * is neither a physical-limit kind nor the global limit point, or the event references no known
 * entity.
 */
export function masonryArchEngineeringCriteriaFromPathEvent(
  event: MasonryArchEvent,
  step: MasonryArchPathStep | null,
): MasonryArchEngineeringCriterion[] {
  if (event.kind === "equilibrium-limit-point") {
    return equilibriumLimitPointCriterion(event.lambda);
  }
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
        : [interfaceCriterionFromState(state, interfaceId, event.kind, lambda)];
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
      const device =
        anchorId === undefined
          ? undefined
          : state.deviceForces.find((item) => item.deviceId === anchorId);
      const connector =
        anchorId === undefined
          ? undefined
          : state.deviceForces
              .flatMap((item) => item.connectors ?? [])
              .find((item) => item.connectorId === anchorId);
      if (device === undefined && connector === undefined) {
        return [createMasonryArchEngineeringCriterion(event.kind, event.entityIds, { lambda })];
      }
      if (connector !== undefined) {
        return [
          createMasonryArchEngineeringCriterion(event.kind, [connector.connectorId], {
            lambda,
            demand: connector.demand.resultant,
            capacity: connector.capacity.resultant,
            utilizationRatio: connector.utilizationRatio,
          }),
        ];
      }
      return [
        createMasonryArchEngineeringCriterion(event.kind, [device!.deviceId], {
          lambda,
          demand: device!.demand.resultant,
          capacity: device!.capacity.resultant,
          utilizationRatio: device!.utilizationRatio,
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
