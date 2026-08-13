import type { RigidBlockDeformableInterfaceLaw2D } from "../rigid-blocks/evaluateDeformableInterface2D.js";
import type { RigidBlockInterfaceLimitLaw2D } from "../rigid-blocks/types.js";
import type { NormalizedMasonryInterfaceLaw } from "./types.js";

export function toRigidBlockInterfaceLimitLaw2D(
  source: NormalizedMasonryInterfaceLaw,
): RigidBlockInterfaceLimitLaw2D {
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

export function toRigidBlockDeformableInterfaceLaw2D(
  source: NormalizedMasonryInterfaceLaw,
  label: string,
  cohesionOffset = 0,
): RigidBlockDeformableInterfaceLaw2D {
  if (source.response !== "deformable" || source.deformability === null) {
    throw new Error(`${label} requires a deformable masonry-interface law.`);
  }
  if (source.friction === null) {
    throw new Error(`${label} requires explicit tangential parameters.`);
  }
  if (!Number.isFinite(cohesionOffset) || cohesionOffset < 0) {
    throw new Error(`${label} cohesionOffset must be finite and non-negative.`);
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
      cohesion: source.friction.cohesion + cohesionOffset,
      dilationAngle: source.friction.flowRule.dilationAngle,
    },
  };
}
