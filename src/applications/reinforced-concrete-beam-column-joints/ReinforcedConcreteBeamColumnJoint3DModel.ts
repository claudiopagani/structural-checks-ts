// Mechanical TypeScript migration from strutture-js 6f33baead8b88166c4b2cf94af41763412e3c751; source path: src/applications/reinforced-concrete-beam-column-joints/ReinforcedConcreteBeamColumnJoint3DModel.js.
/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return */
import { ReinforcedConcreteBeamColumnJointModel } from "./ReinforcedConcreteBeamColumnJointModel.js";

export interface ReinforcedConcreteBeamColumnJoint3DModelOptions {
  [key: string]: any;
}

export class ReinforcedConcreteBeamColumnJoint3DModel {
  [key: string]: any;
  constructor({
    id,
    directions = [],
    concurrentActionState = false,
    metadata = {},
    ...common
  }: ReinforcedConcreteBeamColumnJoint3DModelOptions = {}) {
    if (!id) {
      throw new Error("A reinforced-concrete 3D joint id is required.");
    }

    if (!Array.isArray(directions) || directions.length < 2) {
      throw new Error("A 3D joint requires at least two directional joint models.");
    }

    if (concurrentActionState !== true) {
      throw new Error(
        "concurrentActionState must be true: all directional actions must belong to the same concurrent design state.",
      );
    }

    const ids = new Set();
    this.directions = directions.map((direction, index) => {
      const directionId = direction.directionId ?? `direction-${index + 1}`;
      if (ids.has(directionId)) {
        throw new Error(`Duplicate 3D joint directionId: ${directionId}.`);
      }
      ids.add(directionId);

      return new ReinforcedConcreteBeamColumnJointModel({
        ...common,
        ...direction,
        id: `${id}-${directionId}`,
        directionId,
        materials: direction.materials ?? common.materials,
        units: direction.units ?? common.units,
        metadata: {
          ...common.metadata,
          ...direction.metadata,
          parentJointId: id,
        },
      });
    });
    this.id = id;
    this.concurrentActionState = true;
    this.metadata = { ...metadata };
  }
}
