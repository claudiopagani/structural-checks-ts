import {
  assertExplicitUnitSystem,
  createUnitResolver,
  type UnitSystem,
  type UnitSystemInput,
} from "../units/UnitSystem.js";
import type { SectionMetadata } from "../geometry/CrossSection.js";

export interface CompositeComponentSection {
  area: number;
  inertiaY?: number | null;
  inertiaZ?: number | null;
  productOfInertiaYZ?: number | null;
  height?: number | null;
  width?: number | null;
  toJSON?: () => unknown;
}

export interface CompositeSectionComponentOptions {
  id?: string | null;
  name: string;
  section: CompositeComponentSection;
  material?: unknown;
  centroidY: number;
  centroidZ?: number;
  modularRatio?: number;
  role?: string;
  units?: UnitSystemInput | null;
  metadata?: SectionMetadata;
}

export interface CompositeSectionComponentJson {
  id: string | null;
  name: string;
  section: unknown;
  material: unknown;
  centroidY: number;
  centroidZ: number;
  modularRatio: number;
  role: string;
  units: UnitSystem;
  metadata: SectionMetadata;
}

interface Serializable {
  toJSON: () => unknown;
}

function serialize(value: unknown): unknown {
  if (
    value !== null &&
    (typeof value === "object" || typeof value === "function") &&
    "toJSON" in value &&
    (value as { toJSON?: unknown }).toJSON
  ) {
    return (value as Serializable).toJSON();
  }

  return value;
}

export class CompositeSectionComponent {
  id: string | null;
  name: string;
  section: CompositeComponentSection;
  material: unknown;
  centroidY: number;
  centroidZ: number;
  modularRatio: number;
  role: string;
  units: UnitSystem;
  metadata: SectionMetadata;

  constructor({
    id = null,
    name,
    section,
    material = null,
    centroidY,
    centroidZ = 0,
    modularRatio = 1,
    role = "generic",
    units = null,
    metadata = {},
  }: CompositeSectionComponentOptions) {
    if (!name) {
      throw new Error("A composite component name is required.");
    }

    if (!section) {
      throw new Error("A composite component section is required.");
    }

    assertExplicitUnitSystem(units, "CompositeSectionComponent");
    const unitResolver = createUnitResolver(units, { force: "N", length: "mm" });
    const resolvedCentroidY = unitResolver.length(centroidY);
    const resolvedCentroidZ = unitResolver.length(centroidZ);

    if (!Number.isFinite(resolvedCentroidY)) {
      throw new Error("A composite component centroidY is required.");
    }

    if (!Number.isFinite(resolvedCentroidZ)) {
      throw new Error("A composite component centroidZ is required.");
    }

    if (!Number.isFinite(modularRatio) || modularRatio <= 0) {
      throw new Error("A positive composite component modularRatio is required.");
    }

    this.id = id;
    this.name = name;
    this.section = section;
    this.material = material;
    this.centroidY = resolvedCentroidY;
    this.centroidZ = resolvedCentroidZ;
    this.modularRatio = modularRatio;
    this.role = role;
    this.units = unitResolver.targetUnitSystem;
    this.metadata = {
      ...metadata,
      unitSystem: unitResolver.targetUnitSystem,
      sourceUnitSystem: metadata.sourceUnitSystem ?? unitResolver.sourceUnitSystem,
    };
  }

  transformedArea(): number {
    return this.modularRatio * this.section.area;
  }

  transformedInertiaY(): number {
    return this.modularRatio * (this.section.inertiaY ?? 0);
  }

  transformedInertiaZ(): number {
    return this.modularRatio * (this.section.inertiaZ ?? 0);
  }

  transformedProductOfInertiaYZ(): number {
    return this.modularRatio * (this.section.productOfInertiaYZ ?? 0);
  }

  toJSON(): CompositeSectionComponentJson {
    return {
      id: this.id,
      name: this.name,
      section: serialize(this.section),
      material: serialize(this.material),
      centroidY: this.centroidY,
      centroidZ: this.centroidZ,
      modularRatio: this.modularRatio,
      role: this.role,
      units: { ...this.units },
      metadata: { ...this.metadata },
    };
  }
}
