import type { RigidBlockDeformableInterfaceEvaluation2D } from "../../domain/masonry/rigid-blocks/evaluateDeformableInterface2D.js";
import type { RigidBlockInterfaceResultant2D } from "../../domain/masonry/rigid-blocks/types.js";
import { recoverBondedLayerStaticState } from "./bondedLayers.js";
import { resolveBaseMasonryArchInterfaceLaws } from "./interfaceLaws.js";
import type {
  ArchContactForceResult,
  ArchDeviceForceResult,
  ArchExternalAnchorForceResult,
  ArchReinforcementStateResult,
  BondedLayerStateResult,
  NormalizedMasonryArchBlockDisplacement,
  NormalizedMasonryArchModel,
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
    readonly deviceForces: readonly ArchDeviceForceResult[];
    readonly contactForces: readonly ArchContactForceResult[];
    readonly externalAnchorForces: readonly ArchExternalAnchorForceResult[];
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

/**
 * Minimum-required static-admissibility state of the bonded layers for one converged deformable
 * configuration. The deformable interface resultants are assessed against the model's masonry-only
 * limit domain; the recovered per-interface forces keep the lower-bound meaning of the static
 * analyses. Bonded layers exert no force in the deformable equilibrium itself.
 */
export function recoverBondedLayerStateFromDeformable(
  model: NormalizedMasonryArchModel,
  evaluations: readonly RigidBlockDeformableInterfaceEvaluation2D[],
  tolerance: number,
): readonly BondedLayerStateResult[] {
  if (model.bondedLayers.length === 0) return [];
  const baseLaws = resolveBaseMasonryArchInterfaceLaws(model);
  const resultants: RigidBlockInterfaceResultant2D[] = evaluations.map((item, index) => ({
    interfaceId: item.interfaceId,
    index,
    normalForce: item.normalForce,
    shearForce: item.shearForce,
    moment: item.moment,
    eccentricity: item.eccentricity,
    normalizedEccentricity: null,
    thrustPoint: null,
    admissibilityMargins: {
      compression: item.normalForce,
      intrados: 0,
      extrados: 0,
      friction: null,
      compressionStrength: null,
      resultantDomain: null,
    },
  }));
  return recoverBondedLayerStaticState(model, baseLaws, resultants, tolerance).bondedLayerState;
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
    deviceForces: evaluation.reinforcement.deviceForces,
    contactForces: evaluation.reinforcement.contactForces,
    externalAnchorForces: evaluation.reinforcement.externalAnchorForces,
    bondedLayerState: evaluation.bondedLayerState,
    reactions: {
      left: supportReaction(evaluation.interfaces[0]),
      right: supportReaction(evaluation.interfaces.at(-1)),
    },
    equilibrium: input.equilibrium,
  };
}
