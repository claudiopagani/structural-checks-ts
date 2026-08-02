// Mechanical TypeScript migration from strutture-js 6f33baead8b88166c4b2cf94af41763412e3c751;
// source path: src/domain/loads/AreaLoad.js.

import {
  assertExplicitUnitSystem,
  createUnitResolver,
  type UnitSystem,
  type UnitSystemInput,
} from "../units/UnitSystem.js";
import { Load, type LoadInput, type LoadJson, type LoadTarget } from "./Load.js";

export interface AreaLoadInput extends Omit<LoadInput, "dimension" | "type"> {
  type?: string;
  direction?: string | null;
  intensity: number;
  area?: number | null | undefined;
  referenceSystem?: string;
  units?: UnitSystemInput | null | undefined;
  target?: AreaLoadTarget | null | undefined;
}

export interface AreaLoadTarget extends LoadTarget {
  area?: number | (() => number);
}

export interface AreaLoadJson extends LoadJson {
  direction: string | null;
  intensity: number;
  area: number | null;
  referenceSystem: string;
  resultant: number | null;
}

export class AreaLoad extends Load {
  declare readonly direction: string | null;
  declare readonly intensity: number;
  declare readonly areaOverride: number | null;
  declare readonly referenceSystem: string;
  declare readonly units: UnitSystem;

  constructor({
    type = "area",
    direction = null,
    intensity,
    area = null,
    referenceSystem = "global",
    units = null,
    ...baseProps
  }: AreaLoadInput) {
    super({
      ...baseProps,
      type,
      dimension: "area",
    });

    assertExplicitUnitSystem(units, "AreaLoad");
    const unitResolver = createUnitResolver(units, { force: "kN", length: "m" });
    const resolvedIntensity = unitResolver.areaLoad(intensity);

    if (!Number.isFinite(resolvedIntensity)) {
      throw new Error("A finite area load intensity is required.");
    }

    this.direction = direction;
    this.intensity = resolvedIntensity;
    this.areaOverride = area == null ? area : unitResolver.area(area);
    this.referenceSystem = referenceSystem;
    this.units = unitResolver.targetUnitSystem;
    this.metadata = {
      ...this.metadata,
      unitSystem: unitResolver.targetUnitSystem,
      sourceUnitSystem: this.metadata.sourceUnitSystem ?? unitResolver.sourceUnitSystem,
    };
  }

  resolvedArea(): number | null {
    if (Number.isFinite(this.areaOverride)) {
      return this.areaOverride;
    }

    if (typeof this.target?.area === "function") {
      return this.target.area();
    }

    const targetArea = this.target?.area;
    if (typeof targetArea === "number" && Number.isFinite(targetArea)) {
      return targetArea;
    }

    return null;
  }

  override referenceValue(): number {
    return this.intensity;
  }

  override resultant(): number | null {
    const area = this.resolvedArea();
    return area === null ? null : this.intensity * area;
  }

  override toJSON(): AreaLoadJson {
    return {
      ...super.toJSON(),
      direction: this.direction,
      intensity: this.intensity,
      area: this.resolvedArea(),
      referenceSystem: this.referenceSystem,
      resultant: this.resultant(),
    };
  }
}
