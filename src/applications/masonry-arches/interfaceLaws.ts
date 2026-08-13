import { toRigidBlockInterfaceLimitLaw2D } from "../../domain/masonry/interfaces/adapters.js";
import type { RigidBlockInterfaceLimitLaw2D } from "../../domain/masonry/rigid-blocks/types.js";
import type { NormalizedMasonryArchModel } from "./types.js";
import {
  applyBondedLayerSectionToLaw,
  resolveBondedLayerInterfaceSections,
} from "./bondedLayers.js";

/** Resolves internal joints and the two explicit springing-contact overrides in chain order. */
export function resolveBaseMasonryArchInterfaceLaws(
  model: NormalizedMasonryArchModel,
): readonly RigidBlockInterfaceLimitLaw2D[] {
  const lastIndex = model.geometry.interfaces.length - 1;
  return model.geometry.interfaces.map((_, index) =>
    toRigidBlockInterfaceLimitLaw2D(
      index === 0
        ? model.supports.left.interfaceLaw
        : index === lastIndex
          ? model.supports.right.interfaceLaw
          : model.interfaceLaw,
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
