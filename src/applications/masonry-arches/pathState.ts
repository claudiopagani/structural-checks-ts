import type { RigidBlockDeformableInterfaceEvaluation2D } from "../../domain/masonry/rigid-blocks/evaluateDeformableInterface2D.js";
import type {
  ArchAnchorForceResult,
  ArchContactForceResult,
  ArchReinforcementStateResult,
  BondedLayerStateResult,
  NormalizedMasonryArchBlockDisplacement,
} from "./types.js";
import type {
  MasonryArchEquilibriumResidual,
  MasonryArchPathState,
  MasonryArchSupportReaction,
} from "./pathTypes.js";

export interface MasonryArchPathStateEvaluation {
  readonly interfaces: readonly RigidBlockDeformableInterfaceEvaluation2D[];
  readonly reinforcement: {
    readonly reinforcementState: readonly ArchReinforcementStateResult[];
    readonly anchorForces: readonly ArchAnchorForceResult[];
    readonly contactForces: readonly ArchContactForceResult[];
  };
  readonly bondedLayerState: readonly BondedLayerStateResult[];
  readonly displacements: readonly NormalizedMasonryArchBlockDisplacement[];
}

function supportReaction(
  item: RigidBlockDeformableInterfaceEvaluation2D | undefined,
): MasonryArchSupportReaction {
  const action = item?.actions[0];
  return action === undefined
    ? { force: { x: 0, y: 0 }, moment: 0, applicationPoint: { x: 0, y: 0 } }
    : {
        force: action.force,
        moment: action.moment,
        applicationPoint: item?.currentMidpoint ?? { x: 0, y: 0 },
      };
}

function thrustPoint(
  item: RigidBlockDeformableInterfaceEvaluation2D,
): MasonryArchPathState["thrustLine"][number] {
  return item.eccentricity === null
    ? null
    : {
        x: item.currentMidpoint.x + item.eccentricity * item.currentJointAxis.x,
        y: item.currentMidpoint.y + item.eccentricity * item.currentJointAxis.y,
      };
}

export function createMasonryArchPathState(
  evaluation: MasonryArchPathStateEvaluation,
  input: {
    readonly lambda: number;
    readonly fixedLoadFactor: number;
    readonly effectiveLoadFactorsByCaseId: Readonly<Record<string, number>>;
    readonly equilibrium: MasonryArchEquilibriumResidual;
  },
): MasonryArchPathState {
  return {
    lambda: input.lambda,
    fixedLoadFactor: input.fixedLoadFactor,
    effectiveLoadFactorsByCaseId: input.effectiveLoadFactorsByCaseId,
    deformedConfiguration: evaluation.displacements,
    interfaces: evaluation.interfaces,
    thrustLine: evaluation.interfaces.map(thrustPoint),
    reinforcementState: evaluation.reinforcement.reinforcementState,
    anchorForces: evaluation.reinforcement.anchorForces,
    contactForces: evaluation.reinforcement.contactForces,
    bondedLayerState: evaluation.bondedLayerState,
    reactions: {
      left: supportReaction(evaluation.interfaces[0]),
      right: supportReaction(evaluation.interfaces.at(-1)),
    },
    equilibrium: input.equilibrium,
  };
}
