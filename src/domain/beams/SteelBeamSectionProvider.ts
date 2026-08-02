// Mechanical TypeScript migration from strutture-js 6f33baead8b88166c4b2cf94af41763412e3c751; source path: src/domain/beams/SteelBeamSectionProvider.js.

import { createUnitResolver, type UnitSystemInput } from "../units/UnitSystem.js";
import type {
  BeamMaterialLike,
  BeamSectionLike,
  BeamUnits,
  ElasticBeamSectionProperties,
} from "./ElasticBeamSectionProvider.js";
import {
  applySectionRotationToBeamProperties,
  type BeamRotationProperties,
  type SectionRotationInput,
} from "./SectionRotation.js";

const DEFAULT_UNITS = Object.freeze({ force: "N", length: "mm" }) satisfies BeamUnits;

interface ProviderBeamProperties extends BeamRotationProperties {
  units: BeamUnits;
  metadata: Record<string, unknown>;
  shearCorrectionFactor: number | null;
}

export interface SteelBeamSectionMetadata extends Record<string, unknown> {
  catalogUnitSystem?: UnitSystemInput;
}

export interface SteelBeamSectionLike extends BeamSectionLike {
  readonly [key: string]: unknown;
  profileName?: string | null;
  family?: string | null;
  catalogProperties?: Record<string, unknown>;
  convertedCatalogProperties?: Record<string, unknown>;
  metadata?: SteelBeamSectionMetadata;
}

export interface SteelBeamMaterialMetadata extends Record<string, unknown> {
  gammaM0?: unknown;
}

export interface SteelBeamMaterialLike extends BeamMaterialLike {
  readonly [key: string]: unknown;
  grade?: string | null;
  fyk?: unknown;
  fyd?: unknown;
  metadata?: SteelBeamMaterialMetadata;
}

export interface SteelBeamSectionProviderContext extends Record<string, unknown> {
  limitState?: unknown;
  sectionRotation?: number | SectionRotationInput | null;
}

export interface SteelBeamSectionProviderOptions {
  section?: SteelBeamSectionLike | null;
  material?: SteelBeamMaterialLike | null;
  bendingInertiaAxis?: string;
  shearAreaAxis?: string;
  elasticSectionModulusAxis?: string;
  plasticSectionModulusAxis?: string;
  shearCorrectionFactor?: number | null;
  gammaM0?: unknown;
  units?: BeamUnits | null;
  metadata?: Record<string, unknown>;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function assertPositive(value: unknown, label: string): asserts value is number {
  if (!isFiniteNumber(value) || value <= 0) {
    throw new Error(`${label} must be a positive number.`);
  }
}

function resolveShearModulus(material: SteelBeamMaterialLike): number | null {
  if (isFiniteNumber(material.shearModulus)) {
    return material.shearModulus;
  }

  if (isFiniteNumber(material.elasticModulus) && isFiniteNumber(material.poissonRatio)) {
    return material.elasticModulus / (2 * (1 + material.poissonRatio));
  }

  if (isFiniteNumber(material.elasticModulus)) {
    return material.elasticModulus / (2 * (1 + 0.3));
  }

  return null;
}

function designStrength(material: SteelBeamMaterialLike, gammaM0: unknown): number | null {
  if (isFiniteNumber(material.fyd)) {
    return material.fyd;
  }

  if (isFiniteNumber(material.fyk) && isFiniteNumber(gammaM0)) {
    return material.fyk / gammaM0;
  }

  return null;
}

function catalogKeyForSectionModulus(axis: string): readonly string[] {
  const aliases: Record<string, readonly string[]> = {
    elasticSectionModulusY: ["Wel_y", "Wel_strong"],
    elasticSectionModulusZ: ["Wel_z", "Wel_weak"],
    plasticSectionModulusY: ["Wpl_y", "Wpl_strong"],
    plasticSectionModulusZ: ["Wpl_z", "Wpl_weak"],
  };

  return aliases[axis] ?? [];
}

function resolveSectionModulus(section: SteelBeamSectionLike, axis: string): unknown {
  for (const key of catalogKeyForSectionModulus(axis)) {
    const convertedValue = section.convertedCatalogProperties?.[key];

    if (isFiniteNumber(convertedValue)) {
      return convertedValue;
    }

    const rawValue = section.catalogProperties?.[key];

    if (isFiniteNumber(rawValue) && section.metadata?.catalogUnitSystem) {
      return createUnitResolver(section.metadata.catalogUnitSystem, DEFAULT_UNITS).sectionModulus(
        rawValue,
      );
    }
  }

  return section[axis];
}

function rotateProperties(
  properties: ProviderBeamProperties,
  sectionRotation: number | SectionRotationInput | null | undefined,
  flexuralRigidityY: number,
  flexuralRigidityZ: number | null,
  shearRigidityY: number | null,
  shearRigidityZ: number | null,
): ElasticBeamSectionProperties {
  const rotated = applySectionRotationToBeamProperties({
    properties,
    sectionRotation,
    flexuralRigidityY,
    flexuralRigidityZ,
    shearRigidityY,
    shearRigidityZ,
  });

  return {
    ...rotated,
    units: properties.units,
    metadata: rotated.metadata ?? properties.metadata,
    shearCorrectionFactor: properties.shearCorrectionFactor,
    flexuralRigidityY: rotated.flexuralRigidityY ?? rotated.flexuralRigidity,
    flexuralRigidityZ: rotated.flexuralRigidityZ ?? null,
    shearRigidityY: rotated.shearRigidityY ?? rotated.shearRigidity,
    shearRigidityZ: rotated.shearRigidityZ ?? null,
  };
}

export class SteelBeamSectionProvider {
  section: SteelBeamSectionLike;
  material: SteelBeamMaterialLike;
  bendingInertiaAxis: string;
  shearAreaAxis: string;
  elasticSectionModulusAxis: string;
  plasticSectionModulusAxis: string;
  shearCorrectionFactor: number | null;
  gammaM0: unknown;
  units: BeamUnits;
  metadata: Record<string, unknown>;

  constructor({
    section,
    material,
    bendingInertiaAxis = "inertiaY",
    shearAreaAxis = "shearAreaY",
    elasticSectionModulusAxis = "elasticSectionModulusY",
    plasticSectionModulusAxis = "plasticSectionModulusY",
    shearCorrectionFactor = null,
    gammaM0 = null,
    units = null,
    metadata = {},
  }: SteelBeamSectionProviderOptions = {}) {
    void units;

    if (!section) {
      throw new Error("SteelBeamSectionProvider requires a section.");
    }

    if (!material) {
      throw new Error("SteelBeamSectionProvider requires a material.");
    }

    this.section = section;
    this.material = material;
    this.bendingInertiaAxis = bendingInertiaAxis;
    this.shearAreaAxis = shearAreaAxis;
    this.elasticSectionModulusAxis = elasticSectionModulusAxis;
    this.plasticSectionModulusAxis = plasticSectionModulusAxis;
    this.shearCorrectionFactor = shearCorrectionFactor;
    this.gammaM0 = gammaM0 ?? material.metadata?.gammaM0 ?? null;
    this.units = DEFAULT_UNITS;
    this.metadata = { ...metadata };
  }

  getElasticBeamProperties(
    context: SteelBeamSectionProviderContext = {},
  ): ElasticBeamSectionProperties {
    const area = this.section.area;
    const inertia = this.section[this.bendingInertiaAxis];
    const elasticModulus = this.material.elasticModulus;
    const shearModulus = resolveShearModulus(this.material);
    const shearArea = this.section[this.shearAreaAxis] ?? area;
    const fyd = designStrength(this.material, this.gammaM0);
    const elasticSectionModulus = resolveSectionModulus(
      this.section,
      this.elasticSectionModulusAxis,
    );
    const plasticSectionModulus = resolveSectionModulus(
      this.section,
      this.plasticSectionModulusAxis,
    );

    assertPositive(area, "steel section area");
    assertPositive(inertia, `steel section ${this.bendingInertiaAxis}`);
    assertPositive(elasticModulus, "steel material elasticModulus");
    assertPositive(shearArea, `steel section ${this.shearAreaAxis} or area`);

    const properties: ProviderBeamProperties = {
      axialRigidity: elasticModulus * area,
      flexuralRigidity: elasticModulus * inertia,
      shearRigidity: isFiniteNumber(shearModulus) ? shearModulus * shearArea : null,
      shearCorrectionFactor: this.shearCorrectionFactor ?? 1,
      units: this.units,
      metadata: {
        ...this.metadata,
        provider: "SteelBeamSectionProvider",
        source: "steel-elastic-section",
        bendingInertiaAxis: this.bendingInertiaAxis,
        shearAreaAxis: this.shearAreaAxis,
        elasticSectionModulusAxis: this.elasticSectionModulusAxis,
        plasticSectionModulusAxis: this.plasticSectionModulusAxis,
        profileName: this.section.profileName ?? null,
        family: this.section.family ?? null,
        grade: this.material.grade ?? null,
        fyk: this.material.fyk ?? null,
        fyd,
        gammaM0: this.gammaM0,
        elasticMomentResistance:
          isFiniteNumber(fyd) && isFiniteNumber(elasticSectionModulus)
            ? fyd * elasticSectionModulus
            : null,
        plasticMomentResistance:
          isFiniteNumber(fyd) && isFiniteNumber(plasticSectionModulus)
            ? fyd * plasticSectionModulus
            : null,
        shearResistance: isFiniteNumber(fyd) ? (fyd * shearArea) / Math.sqrt(3) : null,
        limitState: context.limitState ?? null,
      },
    };

    return rotateProperties(
      properties,
      context.sectionRotation,
      isFiniteNumber(this.section.inertiaY)
        ? elasticModulus * this.section.inertiaY
        : properties.flexuralRigidity,
      isFiniteNumber(this.section.inertiaZ) ? elasticModulus * this.section.inertiaZ : null,
      isFiniteNumber(shearModulus) ? shearModulus * (this.section.shearAreaY ?? area) : null,
      isFiniteNumber(shearModulus) ? shearModulus * (this.section.shearAreaZ ?? area) : null,
    );
  }
}

export function createSteelBeamSectionProvider(
  options: SteelBeamSectionProviderOptions = {},
): SteelBeamSectionProvider {
  return new SteelBeamSectionProvider(options);
}
