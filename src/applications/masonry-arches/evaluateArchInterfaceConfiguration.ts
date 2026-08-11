import {
  evaluateRigidBlockDeformableInterface2D,
  type RigidBlockDeformableInterfaceEvaluation2D,
  type RigidBlockDeformableInterfaceLaw2D,
  type RigidBlockDeformableInterfaceState2D,
} from "../../domain/masonry/rigid-blocks/evaluateDeformableInterface2D.js";
import {
  normalizeMasonryArchPrescribedConfiguration,
  type NormalizedMasonryArchConfiguration,
} from "./resolveArchReinforcements.js";
import type {
  MasonryArchPrescribedConfigurationInput,
  NormalizedMasonryArchBlockDisplacement,
  NormalizedMasonryArchInterface,
  NormalizedMasonryArchModel,
} from "./types.js";

export interface MasonryArchInterfaceConfigurationInput
  extends MasonryArchPrescribedConfigurationInput {
  readonly committedStatesByInterfaceId?: Readonly<
    Record<string, RigidBlockDeformableInterfaceState2D>
  >;
  /** Defaults to true. Residual-only nonlinear line searches disable tangent construction. */
  readonly computeTangent?: boolean;
}

export interface EvaluatedMasonryArchInterfaceConfiguration {
  readonly blockDisplacements: readonly NormalizedMasonryArchBlockDisplacement[];
  readonly interfaces: readonly RigidBlockDeformableInterfaceEvaluation2D[];
  readonly trialStatesByInterfaceId: Readonly<Record<string, RigidBlockDeformableInterfaceState2D>>;
  readonly configuration: {
    readonly sourceUnits: NormalizedMasonryArchModel["units"];
    readonly units: NormalizedMasonryArchModel["units"];
    readonly solutionMeaning: "prescribed-configuration-not-equilibrated";
    readonly kinematics: "finite-corotational-rigid-block-interface";
    readonly equilibriumSolved: false;
  };
}

function deformableLaw(
  source: NormalizedMasonryArchInterface,
  interfaceId: string,
  numericalCohesionOffset: number,
): RigidBlockDeformableInterfaceLaw2D {
  if (source.model !== "deformable-no-tension" || source.deformability === null) {
    throw new Error(
      `Interface ${interfaceId} requires model "deformable-no-tension" for nonlinear configuration evaluation.`,
    );
  }
  if (source.friction === null) {
    throw new Error(`Deformable interface ${interfaceId} requires explicit tangential parameters.`);
  }
  return {
    normal: {
      elasticModulus: source.deformability.normal.elasticModulus,
      characteristicLength: source.deformability.normal.characteristicLength,
      compressiveStrength: source.compressiveStrength,
      integrationPointCount: source.deformability.normal.integrationPointCount,
      postCrushingBehavior: source.deformability.normal.postCrushingBehavior,
    },
    tangential: {
      shearModulus: source.deformability.tangential.shearModulus,
      characteristicLength: source.deformability.tangential.characteristicLength,
      frictionCoefficient: source.friction.frictionCoefficient,
      cohesion: source.friction.cohesion + numericalCohesionOffset,
      dilationAngle: source.friction.flowRule.dilationAngle,
    },
  };
}

function displacementForBlock(
  configuration: NormalizedMasonryArchConfiguration,
  blockId: string,
): NormalizedMasonryArchBlockDisplacement {
  const displacement = configuration.displacementsByBlockId.get(blockId);
  if (displacement === undefined) {
    throw new Error(`Missing normalized masonry-arch displacement for block ${blockId}.`);
  }
  return displacement;
}

function evaluateConfiguration(
  model: NormalizedMasonryArchModel,
  input: MasonryArchInterfaceConfigurationInput,
  numericalCohesionOffset: number,
): EvaluatedMasonryArchInterfaceConfiguration {
  const normalized = normalizeMasonryArchPrescribedConfiguration(model, input);
  const lastIndex = model.geometry.interfaces.length - 1;
  const interfaces = model.geometry.interfaces.map((geometry, index) => {
    const source =
      index === 0
        ? model.supports.left.interface
        : index === lastIndex
          ? model.supports.right.interface
          : model.interfaces;
    const leftBlock = index === 0 ? null : model.geometry.voussoirs[index - 1]!;
    const rightBlock = index === lastIndex ? null : model.geometry.voussoirs[index]!;
    return evaluateRigidBlockDeformableInterface2D({
      geometry,
      left:
        leftBlock === null
          ? null
          : {
              block: leftBlock,
              displacement: displacementForBlock(normalized.configuration, leftBlock.id),
            },
      right:
        rightBlock === null
          ? null
          : {
              block: rightBlock,
              displacement: displacementForBlock(normalized.configuration, rightBlock.id),
            },
      law: deformableLaw(source, geometry.id, numericalCohesionOffset),
      committedState: input.committedStatesByInterfaceId?.[geometry.id] ?? null,
      computeTangent: input.computeTangent ?? true,
    });
  });
  return {
    blockDisplacements: normalized.blockDisplacements,
    interfaces,
    trialStatesByInterfaceId: Object.fromEntries(
      interfaces.map((item) => [item.interfaceId, item.trialState]),
    ),
    configuration: {
      sourceUnits: normalized.sourceUnits,
      units: model.units,
      solutionMeaning: "prescribed-configuration-not-equilibrated",
      kinematics: "finite-corotational-rigid-block-interface",
      equilibriumSolved: false,
    },
  };
}

export function evaluateMasonryArchInterfaceConfiguration(
  model: NormalizedMasonryArchModel,
  input: MasonryArchInterfaceConfigurationInput,
): EvaluatedMasonryArchInterfaceConfiguration {
  return evaluateConfiguration(model, input, 0);
}

/** @internal Numerical continuation hook; not part of the package-root API. */
export function evaluateMasonryArchInterfaceConfigurationForSolver(
  model: NormalizedMasonryArchModel,
  input: MasonryArchInterfaceConfigurationInput,
  numericalCohesionOffset: number,
): EvaluatedMasonryArchInterfaceConfiguration {
  if (!Number.isFinite(numericalCohesionOffset) || numericalCohesionOffset < 0) {
    throw new Error("Numerical interface-cohesion offset must be finite and non-negative.");
  }
  return evaluateConfiguration(model, input, numericalCohesionOffset);
}
