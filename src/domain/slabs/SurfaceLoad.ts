import {
  assertExplicitUnitSystem,
  createUnitResolver,
  type UnitSystemInput,
} from "../units/UnitSystem.js";
import { SlabLoad, type SlabLoadOptions } from "./SlabLoad.js";

export interface SurfaceLoadOptions extends SlabLoadOptions {
  surfaceWeight: number;
}

export class SurfaceLoad extends SlabLoad {
  surfaceWeight: number;
  declare readonly intensity: number;

  constructor({
    description,
    loadGroup,
    effect = "unfavourable",
    surfaceWeight,
    units = null,
  }: SurfaceLoadOptions & { units?: UnitSystemInput | null }) {
    super({ description, loadGroup, effect, units });
    assertExplicitUnitSystem(units, "SurfaceLoad");
    const unitResolver = createUnitResolver(units, { force: "kN", length: "m" });
    const resolvedSurfaceWeight = unitResolver.areaLoad(surfaceWeight);
    if (!Number.isFinite(resolvedSurfaceWeight)) {
      throw new Error("A finite surface weight is required.");
    }
    this.surfaceWeight = resolvedSurfaceWeight;
    this.intensity = resolvedSurfaceWeight;
  }

  get value(): number {
    return this.referenceValue();
  }
}
