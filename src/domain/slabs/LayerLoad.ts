import {
  assertExplicitUnitSystem,
  createUnitResolver,
  type UnitSystemInput,
} from "../units/UnitSystem.js";
import { SlabLoad, type SlabLoadOptions } from "./SlabLoad.js";

export interface LayerLoadOptions extends SlabLoadOptions {
  density: number;
  thickness: number;
}

export class LayerLoad extends SlabLoad {
  density: number;
  thickness: number;
  declare readonly intensity: number;

  constructor({
    description,
    loadGroup,
    effect = "unfavourable",
    density,
    thickness,
    units = null,
  }: LayerLoadOptions & { units?: UnitSystemInput | null }) {
    super({ description, loadGroup, effect, units });
    assertExplicitUnitSystem(units, "LayerLoad");
    const unitResolver = createUnitResolver(units, { force: "kN", length: "m" });
    const resolvedDensity = unitResolver.volumeLoad(density);
    const resolvedThickness = unitResolver.length(thickness);
    if (!Number.isFinite(resolvedDensity) || !Number.isFinite(resolvedThickness)) {
      throw new Error("Finite density and thickness values are required.");
    }
    this.density = resolvedDensity;
    this.thickness = resolvedThickness;
    this.intensity = resolvedDensity * resolvedThickness;
  }

  get value(): number {
    return this.referenceValue();
  }
}
