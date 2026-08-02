// Mechanical TypeScript migration from strutture-js 6f33baead8b88166c4b2cf94af41763412e3c751;
// source path: src/domain/materials/masonry/shearStrength/createMasonryShearStrengthModel.js.

import { MohrCoulombModel, type MasonryShearStrengthModel } from "./MohrCoulombModel.js";
import { SlidingStrengthModel } from "./SlidingStrengthModel.js";
import { TurnsekSheppardModel } from "./TurnsekSheppardModel.js";
import type { MohrCoulombModelInput } from "./MohrCoulombModel.js";
import type { SlidingStrengthModelInput } from "./SlidingStrengthModel.js";
import type { TurnsekSheppardModelInput } from "./TurnsekSheppardModel.js";

export type MasonryShearStrengthModelInput =
  | MohrCoulombModelInput
  | SlidingStrengthModelInput
  | TurnsekSheppardModelInput
  | MasonryShearStrengthModel;

function isExecutableModel(value: unknown): value is MasonryShearStrengthModel {
  return (
    value !== null &&
    typeof value === "object" &&
    "evaluate" in value &&
    typeof Reflect.get(value, "evaluate") === "function"
  );
}

export function createMasonryShearStrengthModel(
  model: MasonryShearStrengthModelInput | null | undefined,
  { role = "diagonal" }: { role?: string } = {},
): MasonryShearStrengthModel {
  if (isExecutableModel(model)) {
    return typeof model.clone === "function" ? model.clone() : model;
  }

  const options = model ?? {};
  const type = String(options.type ?? "")
    .trim()
    .toLowerCase();

  if (["turnsek-sheppard", "turnseksheppard"].includes(type)) {
    return new TurnsekSheppardModel(options);
  }

  if (["mohr-coulomb", "mohrcoulomb"].includes(type)) {
    return new MohrCoulombModel(options);
  }

  if (["bed-joint-sliding", "sliding"].includes(type)) {
    return new SlidingStrengthModel(options);
  }

  if (type === "user-defined") {
    throw new Error(
      `A ${role} user-defined masonry shear model must provide an evaluate(context) function; a serializable type tag alone is not executable.`,
    );
  }

  throw new Error(
    `Unsupported ${role} masonry shear strength model type: ${model?.type ?? "<missing>"}.`,
  );
}
