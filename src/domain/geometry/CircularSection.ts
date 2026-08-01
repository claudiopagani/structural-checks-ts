import {
  assertExplicitUnitSystem,
  createUnitResolver,
  type UnitSystem,
  type UnitSystemInput,
} from "../units/UnitSystem.js";
import { CrossSection, type CrossSectionJson, type SectionMetadata } from "./CrossSection.js";

const INTERNAL_UNITS = Object.freeze({ force: "N", length: "mm" }) satisfies UnitSystem;

export interface CircularSectionOptions {
  diameter: number;
  id?: string | null;
  name?: string | null;
  units?: UnitSystemInput | null;
  metadata?: SectionMetadata;
}

export interface CircularSectionJson extends CrossSectionJson {
  diameter: number;
  radius: number;
}

export class CircularSection extends CrossSection {
  diameter: number;
  radius: number;

  constructor({
    diameter,
    id = null,
    name = null,
    units = null,
    metadata = {},
  }: CircularSectionOptions) {
    assertExplicitUnitSystem(units, "CircularSection");
    const unitResolver = createUnitResolver(units, INTERNAL_UNITS);
    const resolvedDiameter = unitResolver.length(diameter);

    if (!Number.isFinite(resolvedDiameter) || resolvedDiameter <= 0) {
      throw new Error("A positive circular section diameter is required.");
    }

    const radius = resolvedDiameter / 2;
    const area = Math.PI * radius ** 2;
    const inertia = (Math.PI * radius ** 4) / 4;

    super({
      id,
      name: name ?? `Circular d=${resolvedDiameter}`,
      area,
      centroidY: radius,
      centroidZ: radius,
      inertiaY: inertia,
      inertiaZ: inertia,
      elasticSectionModulusY: inertia / radius,
      elasticSectionModulusZ: inertia / radius,
      height: resolvedDiameter,
      width: resolvedDiameter,
      units: INTERNAL_UNITS,
      metadata: {
        ...metadata,
        shape: "circular",
        unitSystem: INTERNAL_UNITS,
        sourceUnitSystem: metadata.sourceUnitSystem ?? unitResolver.sourceUnitSystem,
      },
    });

    this.diameter = resolvedDiameter;
    this.radius = radius;
  }

  override toJSON(): CircularSectionJson {
    return {
      ...super.toJSON(),
      diameter: this.diameter,
      radius: this.radius,
    };
  }
}
