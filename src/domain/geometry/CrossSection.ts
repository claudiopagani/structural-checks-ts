import {
  assertExplicitUnitSystem,
  createUnitResolver,
  convertPointCoordinates,
  type UnitSystem,
  type UnitSystemInput,
} from "../units/UnitSystem.js";

export interface SectionPoint extends Record<string, unknown> {
  y: number;
  z: number;
}

export type SectionMetadata = Record<string, unknown>;

export interface CrossSectionOptions {
  id?: string | null;
  name: string;
  area: number;
  centroidY?: number | null;
  centroidZ?: number | null;
  inertiaY?: number | null;
  inertiaZ?: number | null;
  productOfInertiaYZ?: number | null;
  torsionalConstant?: number | null;
  shearAreaY?: number | null;
  shearAreaZ?: number | null;
  elasticSectionModulusY?: number | null;
  elasticSectionModulusZ?: number | null;
  plasticSectionModulusY?: number | null;
  plasticSectionModulusZ?: number | null;
  height?: number | null;
  width?: number | null;
  outlinePoints?: SectionPoint[];
  units?: UnitSystemInput | null;
  metadata?: SectionMetadata;
}

export interface CrossSectionJson {
  id: string | null;
  name: string;
  area: number;
  centroidY: number | null;
  centroidZ: number | null;
  inertiaY: number | null;
  inertiaZ: number | null;
  productOfInertiaYZ: number | null;
  torsionalConstant: number | null;
  shearAreaY: number | null;
  shearAreaZ: number | null;
  elasticSectionModulusY: number | null;
  elasticSectionModulusZ: number | null;
  plasticSectionModulusY: number | null;
  plasticSectionModulusZ: number | null;
  height: number | null;
  width: number | null;
  outlinePoints: SectionPoint[];
  units: UnitSystem;
  metadata: SectionMetadata;
}

export class CrossSection {
  id: string | null;
  name: string;
  area: number;
  centroidY: number | null;
  centroidZ: number | null;
  inertiaY: number | null;
  inertiaZ: number | null;
  productOfInertiaYZ: number | null;
  torsionalConstant: number | null;
  shearAreaY: number | null;
  shearAreaZ: number | null;
  elasticSectionModulusY: number | null;
  elasticSectionModulusZ: number | null;
  plasticSectionModulusY: number | null;
  plasticSectionModulusZ: number | null;
  height: number | null;
  width: number | null;
  outlinePoints: SectionPoint[];
  units: UnitSystem;
  metadata: SectionMetadata;

  constructor({
    id = null,
    name,
    area,
    centroidY = null,
    centroidZ = null,
    inertiaY = null,
    inertiaZ = null,
    productOfInertiaYZ = null,
    torsionalConstant = null,
    shearAreaY = null,
    shearAreaZ = null,
    elasticSectionModulusY = null,
    elasticSectionModulusZ = null,
    plasticSectionModulusY = null,
    plasticSectionModulusZ = null,
    height = null,
    width = null,
    outlinePoints = [],
    units = null,
    metadata = {},
  }: CrossSectionOptions) {
    if (!name) {
      throw new Error("A cross-section name is required.");
    }

    assertExplicitUnitSystem(units, "CrossSection");
    const unitResolver = createUnitResolver(units, { force: "N", length: "mm" });
    const resolvedArea = unitResolver.area(area);

    if (!Number.isFinite(resolvedArea) || resolvedArea <= 0) {
      throw new Error("A positive cross-section area is required.");
    }

    this.id = id;
    this.name = name;
    this.area = resolvedArea;
    this.centroidY = unitResolver.length(centroidY);
    this.centroidZ = unitResolver.length(centroidZ);
    this.inertiaY = unitResolver.inertia(inertiaY);
    this.inertiaZ = unitResolver.inertia(inertiaZ);
    this.productOfInertiaYZ = unitResolver.inertia(productOfInertiaYZ);
    this.torsionalConstant = unitResolver.inertia(torsionalConstant);
    this.shearAreaY = unitResolver.area(shearAreaY);
    this.shearAreaZ = unitResolver.area(shearAreaZ);
    this.elasticSectionModulusY = unitResolver.sectionModulus(elasticSectionModulusY);
    this.elasticSectionModulusZ = unitResolver.sectionModulus(elasticSectionModulusZ);
    this.plasticSectionModulusY = unitResolver.sectionModulus(plasticSectionModulusY);
    this.plasticSectionModulusZ = unitResolver.sectionModulus(plasticSectionModulusZ);
    this.height = unitResolver.length(height);
    this.width = unitResolver.length(width);
    this.outlinePoints = outlinePoints.map(
      (point) => convertPointCoordinates(point, unitResolver, ["y", "z"]) as SectionPoint,
    );
    this.units = unitResolver.targetUnitSystem;
    this.metadata = {
      ...metadata,
      unitSystem: unitResolver.targetUnitSystem,
      sourceUnitSystem: metadata.sourceUnitSystem ?? unitResolver.sourceUnitSystem,
    };
  }

  toJSON(): CrossSectionJson {
    return {
      id: this.id,
      name: this.name,
      area: this.area,
      centroidY: this.centroidY,
      centroidZ: this.centroidZ,
      inertiaY: this.inertiaY,
      inertiaZ: this.inertiaZ,
      productOfInertiaYZ: this.productOfInertiaYZ,
      torsionalConstant: this.torsionalConstant,
      shearAreaY: this.shearAreaY,
      shearAreaZ: this.shearAreaZ,
      elasticSectionModulusY: this.elasticSectionModulusY,
      elasticSectionModulusZ: this.elasticSectionModulusZ,
      plasticSectionModulusY: this.plasticSectionModulusY,
      plasticSectionModulusZ: this.plasticSectionModulusZ,
      height: this.height,
      width: this.width,
      outlinePoints: this.outlinePoints.map((point) => ({ ...point })),
      units: { ...this.units },
      metadata: { ...this.metadata },
    };
  }
}
