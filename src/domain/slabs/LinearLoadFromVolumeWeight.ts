import {
  assertExplicitUnitSystem,
  createUnitResolver,
  type UnitSystemInput,
} from "../units/UnitSystem.js";
import { SlabLoad, type SlabLoadOptions } from "./SlabLoad.js";

export interface LinearLoadFromVolumeWeightOptions extends SlabLoadOptions {
  density: number;
  area: number;
  spacing: number;
}

export class LinearLoadFromVolumeWeight extends SlabLoad {
  density: number;
  area: number;
  spacing: number;
  declare readonly intensity: number;

  constructor({
    description,
    loadGroup,
    effect = "unfavourable",
    density,
    area,
    spacing,
    units = null,
  }: LinearLoadFromVolumeWeightOptions & { units?: UnitSystemInput | null }) {
    super({ description, loadGroup, effect, units });
    assertExplicitUnitSystem(units, "LinearLoadFromVolumeWeight");
    const unitResolver = createUnitResolver(units, { force: "kN", length: "m" });
    const resolvedDensity = unitResolver.volumeLoad(density);
    const resolvedArea = unitResolver.area(area);
    const resolvedSpacing = unitResolver.length(spacing);
    if (
      !Number.isFinite(resolvedDensity) ||
      !Number.isFinite(resolvedArea) ||
      !Number.isFinite(resolvedSpacing) ||
      resolvedSpacing === 0
    ) {
      throw new Error("Finite density, area and spacing values are required.");
    }
    this.density = resolvedDensity;
    this.area = resolvedArea;
    this.spacing = resolvedSpacing;
    this.intensity = (resolvedDensity * resolvedArea) / resolvedSpacing;
  }

  get value(): number {
    return this.referenceValue();
  }
}
