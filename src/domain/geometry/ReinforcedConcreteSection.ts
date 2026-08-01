import { CompositeSection, type CompositeSectionJson } from "../composite/CompositeSection.js";
import { CompositeSectionComponent } from "../composite/CompositeSectionComponent.js";
import type { ReinforcementBar, ReinforcementBarJson } from "../reinforcement/ReinforcementBar.js";
import {
  assertExplicitUnitSystem,
  createUnitResolver,
  type UnitSystemInput,
} from "../units/UnitSystem.js";
import {
  CrossSection,
  type CrossSectionJson,
  type SectionMetadata,
  type SectionPoint,
} from "./CrossSection.js";

export type ReinforcedConcreteReferencePointType =
  | "concrete-centroid"
  | "transformed-centroid"
  | "section-center"
  | "custom";

export interface ReinforcedConcreteSectionOptions {
  id?: string | null;
  name?: string;
  concreteSection: CrossSection;
  reinforcementBars?: ReinforcementBar[];
  concreteMaterial?: unknown;
  reinforcementMaterial?: unknown;
  referenceModularRatio?: number;
  units?: UnitSystemInput | null;
  metadata?: SectionMetadata;
}

export interface ReferencePointCoordinates {
  y: number;
  z: number;
  units?: UnitSystemInput | null;
}

export interface ReferencePoint {
  y: number | null;
  z: number | null;
}

export interface SectionBoundingBox {
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
}

export interface ReinforcedConcreteSectionJson extends CrossSectionJson {
  concreteSection: CrossSectionJson;
  reinforcementBars: ReinforcementBarJson[];
  concreteMaterial: unknown;
  reinforcementMaterial: unknown;
  referenceModularRatio: number;
  transformedSection: CompositeSectionJson;
}

interface Serializable {
  toJSON: () => unknown;
}

function serializeWithFallback(value: unknown): unknown {
  const method =
    value !== null &&
    (typeof value === "object" || typeof value === "function") &&
    "toJSON" in value
      ? (value as { toJSON?: unknown }).toJSON
      : undefined;

  if (method != null) {
    const serialized = (method as Serializable["toJSON"]).call(value);
    return serialized ?? value;
  }

  return value;
}

export class ReinforcedConcreteSection extends CrossSection {
  concreteSection: CrossSection;
  reinforcementBars: ReinforcementBar[];
  concreteMaterial: unknown;
  reinforcementMaterial: unknown;
  transformedSection: CompositeSection;
  referenceModularRatio: number;

  constructor({
    id = null,
    name = "Reinforced concrete section",
    concreteSection,
    reinforcementBars = [],
    concreteMaterial = null,
    reinforcementMaterial = null,
    referenceModularRatio = 1,
    units = null,
    metadata = {},
  }: ReinforcedConcreteSectionOptions) {
    if (!concreteSection) {
      throw new Error("ReinforcedConcreteSection requires a concreteSection.");
    }

    const sectionUnits = concreteSection.metadata.unitSystem as UnitSystemInput | null | undefined;
    const reinforcementUnits = reinforcementBars[0]?.metadata.unitSystem as
      | UnitSystemInput
      | null
      | undefined;

    assertExplicitUnitSystem(
      units ?? sectionUnits ?? reinforcementUnits,
      "ReinforcedConcreteSection",
    );

    const resolvedUnits = units ?? sectionUnits ?? reinforcementUnits ?? null;
    const concreteComponent = new CompositeSectionComponent({
      name: "Concrete core",
      section: concreteSection,
      material: concreteMaterial,
      centroidY: concreteSection.centroidY ?? Number(concreteSection.height) / 2,
      centroidZ: concreteSection.centroidZ ?? Number(concreteSection.width) / 2,
      modularRatio: 1,
      role: "concrete",
      units: resolvedUnits,
    });
    const reinforcementComponents = reinforcementBars.map(
      (bar, index) =>
        new CompositeSectionComponent({
          id: bar.id ?? `rebar-${index + 1}`,
          name: bar.name ?? `Rebar ${index + 1}`,
          section: new CrossSection({
            name: `Equivalent bar ${index + 1}`,
            area: bar.area,
            centroidY: 0,
            centroidZ: 0,
            inertiaY: 0,
            inertiaZ: 0,
            height: 0,
            width: 0,
            units: resolvedUnits,
          }),
          material: bar.material ?? reinforcementMaterial,
          centroidY: bar.y as number,
          centroidZ: bar.z ?? concreteSection.centroidZ ?? Number(concreteSection.width) / 2,
          modularRatio: referenceModularRatio,
          role: "reinforcement",
          units: resolvedUnits,
          metadata: {
            reinforcementArea: bar.area,
            reinforcementDiameter: bar.diameter,
          },
        }),
    );
    const transformed = new CompositeSection({
      name,
      components: [concreteComponent, ...reinforcementComponents],
      units: resolvedUnits,
      metadata,
    });

    super({
      id,
      name,
      area: concreteSection.area,
      centroidY: transformed.centroidY,
      centroidZ: transformed.centroidZ,
      inertiaY: transformed.inertiaY,
      inertiaZ: transformed.inertiaZ,
      elasticSectionModulusY: transformed.elasticSectionModulusY,
      elasticSectionModulusZ: transformed.elasticSectionModulusZ,
      height: concreteSection.height,
      width: concreteSection.width,
      outlinePoints: concreteSection.outlinePoints,
      units: resolvedUnits,
      metadata: {
        ...metadata,
        shape: "reinforced-concrete",
      },
    });

    this.concreteSection = concreteSection;
    this.reinforcementBars = [...reinforcementBars];
    this.concreteMaterial = concreteMaterial;
    this.reinforcementMaterial = reinforcementMaterial;
    this.transformedSection = transformed;
    this.referenceModularRatio = referenceModularRatio;
  }

  totalReinforcementArea(): number {
    return this.reinforcementBars.reduce((sum, bar) => sum + bar.area, 0);
  }

  getConcreteOutlinePoints(): SectionPoint[] {
    return this.concreteSection.outlinePoints.map((point) => ({ ...point }));
  }

  getReinforcementBars(): ReinforcementBar[] {
    return [...this.reinforcementBars];
  }

  getBoundingBox(): SectionBoundingBox {
    const outlinePoints = this.getConcreteOutlinePoints();

    if (outlinePoints.length > 0) {
      const yValues = outlinePoints.map((point) => point.y);
      const zValues = outlinePoints.map((point) => point.z);

      return {
        minY: Math.min(...yValues),
        maxY: Math.max(...yValues),
        minZ: Math.min(...zValues),
        maxZ: Math.max(...zValues),
      };
    }

    const centroidY = this.concreteSection.centroidY ?? this.centroidY ?? 0;
    const centroidZ = this.concreteSection.centroidZ ?? this.centroidZ ?? 0;
    const height = this.concreteSection.height ?? this.height ?? 0;
    const width = this.concreteSection.width ?? this.width ?? 0;

    return {
      minY: centroidY - height / 2,
      maxY: centroidY + height / 2,
      minZ: centroidZ - width / 2,
      maxZ: centroidZ + width / 2,
    };
  }

  getReferencePoint(
    type: ReinforcedConcreteReferencePointType = "concrete-centroid",
    coordinates: ReferencePointCoordinates | null = null,
  ): ReferencePoint {
    const unitResolver = createUnitResolver(coordinates?.units ?? null, {
      force: "N",
      length: "mm",
    });

    switch (type) {
      case "concrete-centroid":
        return {
          y: this.concreteSection.centroidY,
          z: this.concreteSection.centroidZ,
        };
      case "transformed-centroid":
        return {
          y: this.centroidY,
          z: this.centroidZ,
        };
      case "section-center": {
        const bounds = this.getBoundingBox();

        return {
          y: (bounds.minY + bounds.maxY) / 2,
          z: (bounds.minZ + bounds.maxZ) / 2,
        };
      }
      case "custom":
        if (!coordinates || !Number.isFinite(coordinates.y) || !Number.isFinite(coordinates.z)) {
          throw new Error(
            "ReinforcedConcreteSection custom reference point requires finite y and z coordinates.",
          );
        }

        return {
          y: unitResolver.length(coordinates.y),
          z: unitResolver.length(coordinates.z),
        };
      default:
        throw new Error(`Unsupported reference point type: ${String(type)}.`);
    }
  }

  override toJSON(): ReinforcedConcreteSectionJson {
    return {
      ...super.toJSON(),
      concreteSection: this.concreteSection.toJSON(),
      reinforcementBars: this.reinforcementBars.map((bar) => bar.toJSON()),
      concreteMaterial: serializeWithFallback(this.concreteMaterial),
      reinforcementMaterial: serializeWithFallback(this.reinforcementMaterial),
      referenceModularRatio: this.referenceModularRatio,
      transformedSection: this.transformedSection.toJSON(),
    };
  }
}
