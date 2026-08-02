import {
  assertExplicitUnitSystem,
  createUnitResolver,
  type UnitSystemInput,
} from "../units/UnitSystem.js";
import { SlabLoad, type SlabLoadOptions } from "./SlabLoad.js";

export interface LinearLoadFromLineWeightOptions extends SlabLoadOptions {
  lineWeight: number;
  spacing: number;
}

export class LinearLoadFromLineWeight extends SlabLoad {
  lineWeight: number;
  spacing: number;
  declare readonly intensity: number;

  constructor({
    description,
    loadGroup,
    effect = "unfavourable",
    lineWeight,
    spacing,
    units = null,
  }: LinearLoadFromLineWeightOptions & { units?: UnitSystemInput | null }) {
    super({ description, loadGroup, effect, units });
    assertExplicitUnitSystem(units, "LinearLoadFromLineWeight");
    const unitResolver = createUnitResolver(units, { force: "kN", length: "m" });
    const resolvedLineWeight = unitResolver.lineLoad(lineWeight);
    const resolvedSpacing = unitResolver.length(spacing);
    if (
      !Number.isFinite(resolvedLineWeight) ||
      !Number.isFinite(resolvedSpacing) ||
      resolvedSpacing === 0
    ) {
      throw new Error("Finite line weight and spacing values are required.");
    }
    this.lineWeight = resolvedLineWeight;
    this.spacing = resolvedSpacing;
    this.intensity = resolvedLineWeight / resolvedSpacing;
  }

  get value(): number {
    return this.referenceValue();
  }
}
