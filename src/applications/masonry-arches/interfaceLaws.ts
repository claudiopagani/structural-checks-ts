import type { RigidBlockInterfaceLimitLaw2D } from "../../domain/masonry/rigid-blocks/types.js";
import type { NormalizedMasonryArchInterface, NormalizedMasonryArchModel } from "./types.js";
import {
  applyBondedLayerSectionToLaw,
  resolveBondedLayerInterfaceSections,
} from "./bondedLayers.js";

function asRigidBlockLaw(source: NormalizedMasonryArchInterface): RigidBlockInterfaceLimitLaw2D {
  return {
    friction:
      source.friction === null
        ? null
        : {
            frictionCoefficient: source.friction.frictionCoefficient,
            cohesion: source.friction.cohesion,
            flowRule: { ...source.friction.flowRule },
          },
    compressiveStrength: source.compressiveStrength,
    compressionFacetCount: source.compressionFacetCount,
  };
}

/** Resolves internal joints and the two explicit springing-contact overrides in chain order. */
export function resolveBaseMasonryArchInterfaceLaws(
  model: NormalizedMasonryArchModel,
): readonly RigidBlockInterfaceLimitLaw2D[] {
  const lastIndex = model.geometry.interfaces.length - 1;
  return model.geometry.interfaces.map((_, index) =>
    asRigidBlockLaw(
      index === 0
        ? model.supports.left.interface
        : index === lastIndex
          ? model.supports.right.interface
          : model.interfaces,
    ),
  );
}

/** Resolves the complete interface domains, including any local bonded-layer contribution. */
export function resolveMasonryArchInterfaceLaws(
  model: NormalizedMasonryArchModel,
): readonly RigidBlockInterfaceLimitLaw2D[] {
  const base = resolveBaseMasonryArchInterfaceLaws(model);
  const sections = resolveBondedLayerInterfaceSections(model);
  return base.map((law, index) => applyBondedLayerSectionToLaw(law, sections[index]!));
}
