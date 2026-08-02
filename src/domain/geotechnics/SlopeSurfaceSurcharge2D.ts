import { assertExplicitUnitSystem, createUnitResolver } from "../units/UnitSystem.js";
import type { UnitSystem, UnitSystemInput } from "../units/UnitSystem.js";
import { GEOTECHNICAL_INTERNAL_UNITS } from "./SoilMaterial.js";

export const SLOPE_SURFACE_SURCHARGE_2D_SCHEMA_VERSION = "slope-surface-surcharge-2d/v1";

type NumericInput = number | string | null | undefined;

export interface SlopeSurfaceSurcharge2DOptions {
  id?: string;
  intensity?: NumericInput;
  minimumX?: NumericInput;
  maximumX?: NumericInput;
  units?: UnitSystemInput | null;
  metadata?: Record<string, unknown> | null;
}

export interface SlopeSurfaceSurcharge2DJson {
  schemaVersion: string;
  id: string;
  model: string;
  intensity: number;
  minimumX: number;
  maximumX: number;
  units: UnitSystem;
  metadata: Record<string, unknown>;
}

function finite(value: NumericInput, label: string): number {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    throw new Error(`${label} must be finite.`);
  }
  return number;
}

export class SlopeSurfaceSurcharge2D {
  readonly schemaVersion: string;
  readonly id: string;
  readonly model: string;
  readonly intensity: number;
  readonly minimumX: number;
  readonly maximumX: number;
  readonly units: UnitSystem;
  readonly metadata: Record<string, unknown>;

  constructor({
    id,
    intensity,
    minimumX,
    maximumX,
    units = null,
    metadata = {},
  }: SlopeSurfaceSurcharge2DOptions = {}) {
    if (!id) {
      throw new Error("A SlopeSurfaceSurcharge2D id is required.");
    }
    assertExplicitUnitSystem(units, "SlopeSurfaceSurcharge2D");
    const resolver = createUnitResolver(units, GEOTECHNICAL_INTERNAL_UNITS);
    const normalizedIntensity = resolver.stress(finite(intensity, "intensity"));
    const normalizedMinimumX = resolver.length(finite(minimumX, "minimumX"));
    const normalizedMaximumX = resolver.length(finite(maximumX, "maximumX"));
    if (normalizedIntensity < 0) {
      throw new Error("Slope surface-surcharge intensity must be non-negative.");
    }
    if (normalizedMaximumX <= normalizedMinimumX) {
      throw new Error("Slope surface-surcharge maximumX must exceed minimumX.");
    }

    this.schemaVersion = SLOPE_SURFACE_SURCHARGE_2D_SCHEMA_VERSION;
    this.id = id;
    this.model = "uniform-vertical-on-horizontal-projection";
    this.intensity = normalizedIntensity;
    this.minimumX = normalizedMinimumX;
    this.maximumX = normalizedMaximumX;
    this.units = GEOTECHNICAL_INTERNAL_UNITS;
    this.metadata = {
      ...structuredClone(metadata ?? {}),
      unitSystem: GEOTECHNICAL_INTERNAL_UNITS,
      sourceUnitSystem: resolver.sourceUnitSystem,
      positiveDirection: "downward",
    };
  }

  forcePerUnitWidthBetween(minimumX: NumericInput, maximumX: NumericInput): number {
    const left = Math.max(this.minimumX, finite(minimumX, "minimumX"));
    const right = Math.min(this.maximumX, finite(maximumX, "maximumX"));
    return this.intensity * Math.max(0, right - left);
  }

  toJSON(): SlopeSurfaceSurcharge2DJson {
    return {
      schemaVersion: this.schemaVersion,
      id: this.id,
      model: this.model,
      intensity: this.intensity,
      minimumX: this.minimumX,
      maximumX: this.maximumX,
      units: { ...this.units },
      metadata: structuredClone(this.metadata),
    };
  }
}
