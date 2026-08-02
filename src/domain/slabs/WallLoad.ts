import {
  assertExplicitUnitSystem,
  createUnitResolver,
  type UnitSystemInput,
} from "../units/UnitSystem.js";
import { SlabLoad, type SlabLoadOptions } from "./SlabLoad.js";

export interface WallLoadOptions extends SlabLoadOptions {
  density: number;
  height: number;
  thickness: number;
  spacing: number;
}

export class WallLoad extends SlabLoad {
  density: number;
  height: number;
  thickness: number;
  spacing: number;
  declare readonly intensity: number;

  constructor({
    description,
    loadGroup,
    effect = "unfavourable",
    density,
    height,
    thickness,
    spacing,
    units = null,
  }: WallLoadOptions & { units?: UnitSystemInput | null }) {
    super({ description, loadGroup, effect, units });
    assertExplicitUnitSystem(units, "WallLoad");
    const unitResolver = createUnitResolver(units, { force: "kN", length: "m" });
    const resolvedDensity = unitResolver.volumeLoad(density);
    const resolvedHeight = unitResolver.length(height);
    const resolvedThickness = unitResolver.length(thickness);
    const resolvedSpacing = unitResolver.length(spacing);
    if (
      !Number.isFinite(resolvedDensity) ||
      !Number.isFinite(resolvedHeight) ||
      !Number.isFinite(resolvedThickness) ||
      !Number.isFinite(resolvedSpacing) ||
      resolvedSpacing === 0
    ) {
      throw new Error("Finite wall load parameters are required and spacing cannot be zero.");
    }
    this.density = resolvedDensity;
    this.height = resolvedHeight;
    this.thickness = resolvedThickness;
    this.spacing = resolvedSpacing;
    this.intensity = (resolvedDensity * resolvedHeight * resolvedThickness) / resolvedSpacing;
  }

  get value(): number {
    return this.referenceValue();
  }
}
