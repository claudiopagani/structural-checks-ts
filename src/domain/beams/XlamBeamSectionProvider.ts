// Mechanical TypeScript migration from strutture-js 6f33baead8b88166c4b2cf94af41763412e3c751; source path: src/domain/beams/XlamBeamSectionProvider.js.

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

export interface XlamBeamSectionLayer {
  thickness: number;
}

export interface XlamBeamShearStiffness {
  shearStiffness?: unknown;
  shearCorrectionCoefficient?: unknown;
  shearAreaWeighted?: unknown;
  [key: string]: unknown;
}

export interface XlamBeamSectionLike extends BeamSectionLike {
  readonly [key: string]: unknown;
  area: number;
  effectiveWidth: number;
  layerThicknesses: readonly number[];
  activeLayerIndexes: readonly number[];
  crossLayers: () => readonly XlamBeamSectionLayer[];
  activeThickness: () => number;
  totalThickness: () => number;
  calculateBendingStiffness: (
    material: XlamBeamMaterialLike,
    options: { includeCrossLayerBending: boolean },
  ) => number;
  calculateShearStiffness: (
    material: XlamBeamMaterialLike,
    options: Record<string, unknown>,
  ) => XlamBeamShearStiffness;
}

export interface XlamBeamMaterialMetadata extends Record<string, unknown> {
  kdef?: unknown;
}

export interface XlamBeamMaterialLike extends BeamMaterialLike {
  readonly [key: string]: unknown;
  e0Mean?: unknown;
  g0Mean?: unknown;
  g90Mean?: unknown;
  kdef?: unknown;
  metadata?: XlamBeamMaterialMetadata;
}

export interface XlamBeamSectionProviderContext extends Record<string, unknown> {
  deformationState?: unknown;
  serviceCombination?: unknown;
  sectionRotation?: number | SectionRotationInput | null;
}

export interface XlamBeamSectionProviderOptions {
  section?: XlamBeamSectionLike | null;
  material?: XlamBeamMaterialLike | null;
  includeCrossLayerBending?: boolean;
  shearOptions?: Record<string, unknown>;
  kdef?: unknown;
  useFinalStiffness?: boolean;
  metadata?: Record<string, unknown>;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function numericOperand(value: unknown): number {
  return typeof value === "number" ? value : Number(value);
}

function assertPositive(value: unknown, label: string): asserts value is number {
  if (!isFiniteNumber(value) || value <= 0) {
    throw new Error(`${label} must be a positive number.`);
  }
}

function materialValue(
  material: XlamBeamMaterialLike,
  keys: readonly string[],
  fallback: unknown = null,
): unknown {
  for (const key of keys) {
    const value = material[key];
    if (isFiniteNumber(value)) {
      return value;
    }
  }

  return fallback;
}

function resolveBeamShearRigidity(
  section: XlamBeamSectionLike,
  material: XlamBeamMaterialLike,
  shear: XlamBeamShearStiffness,
): { value: number; source: string } {
  if (isFiniteNumber(shear.shearStiffness) && shear.shearStiffness > 1) {
    return {
      value: shear.shearStiffness,
      source: "xlam-panel-shear-stiffness",
    };
  }

  const g0 = materialValue(material, ["g0Mean", "shearModulus"]);
  const g90 = materialValue(material, ["g90Mean"], isFiniteNumber(g0) ? g0 / 10 : null);
  const crossThickness = section.crossLayers().reduce((sum, layer) => sum + layer.thickness, 0);
  const activeThickness = section.activeThickness();
  const effectiveWidth = numericOperand(section.effectiveWidth);

  if (isFiniteNumber(g90) && crossThickness > 0) {
    return {
      value: g90 * effectiveWidth * crossThickness,
      source: "rolling-shear-cross-layers",
    };
  }

  return {
    value: numericOperand(g0) * effectiveWidth * activeThickness,
    source: "longitudinal-shear-active-layers",
  };
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

export class XlamBeamSectionProvider {
  section: XlamBeamSectionLike;
  material: XlamBeamMaterialLike;
  includeCrossLayerBending: boolean;
  shearOptions: Record<string, unknown>;
  kdef: unknown;
  useFinalStiffness: boolean;
  metadata: Record<string, unknown>;

  constructor({
    section,
    material,
    includeCrossLayerBending = false,
    shearOptions = {},
    kdef = null,
    useFinalStiffness = false,
    metadata = {},
  }: XlamBeamSectionProviderOptions = {}) {
    if (!section) {
      throw new Error("XlamBeamSectionProvider requires a section.");
    }

    if (!material) {
      throw new Error("XlamBeamSectionProvider requires a material.");
    }

    this.section = section;
    this.material = material;
    this.includeCrossLayerBending = includeCrossLayerBending;
    this.shearOptions = { ...shearOptions };
    this.kdef = kdef ?? material.kdef ?? material.metadata?.kdef ?? null;
    this.useFinalStiffness = useFinalStiffness;
    this.metadata = { ...metadata };
  }

  getElasticBeamProperties(
    context: XlamBeamSectionProviderContext = {},
  ): ElasticBeamSectionProperties {
    const e0 = materialValue(this.material, ["e0Mean", "elasticModulus"]);
    const bendingStiffness = this.section.calculateBendingStiffness(this.material, {
      includeCrossLayerBending: this.includeCrossLayerBending,
    });
    const shear = this.section.calculateShearStiffness(this.material, this.shearOptions);
    const beamShearRigidity = resolveBeamShearRigidity(this.section, this.material, shear);
    const finalStiffness =
      context.deformationState === "final" ||
      context.serviceCombination === "final" ||
      context.serviceCombination === "quasi-permanent" ||
      this.useFinalStiffness;
    const stiffnessReduction = finalStiffness && isFiniteNumber(this.kdef) ? 1 + this.kdef : 1;
    const e0Value = numericOperand(e0);
    const area = this.section.area;

    assertPositive(e0, "XLAM longitudinal modulus");
    assertPositive(area, "XLAM active area");
    assertPositive(bendingStiffness, "XLAM bending stiffness");
    assertPositive(beamShearRigidity.value, "XLAM beam shear stiffness");

    const properties: ProviderBeamProperties = {
      axialRigidity: (e0Value * area) / stiffnessReduction,
      flexuralRigidity: bendingStiffness / stiffnessReduction,
      shearRigidity: beamShearRigidity.value / stiffnessReduction,
      shearCorrectionFactor: 1,
      units: DEFAULT_UNITS,
      metadata: {
        ...this.metadata,
        provider: "XlamBeamSectionProvider",
        source: "xlam-strip-timoshenko",
        layerThicknesses: [...this.section.layerThicknesses],
        activeLayerIndexes: [...this.section.activeLayerIndexes],
        effectiveWidth: this.section.effectiveWidth,
        totalThickness: this.section.totalThickness(),
        activeThickness: this.section.activeThickness(),
        includeCrossLayerBending: this.includeCrossLayerBending,
        shearCorrectionCoefficient: shear.shearCorrectionCoefficient,
        shearAreaWeighted: shear.shearAreaWeighted,
        rawPanelShearStiffness: shear.shearStiffness,
        beamShearRigiditySource: beamShearRigidity.source,
        kdef: this.kdef,
        finalStiffness,
        stiffnessReduction,
      },
    };

    const shearModulus = materialValue(this.material, ["g0Mean", "shearModulus"]);
    return rotateProperties(
      properties,
      context.sectionRotation,
      bendingStiffness / stiffnessReduction,
      isFiniteNumber(this.section.inertiaZ)
        ? (e0Value * this.section.inertiaZ) / stiffnessReduction
        : null,
      beamShearRigidity.value / stiffnessReduction,
      isFiniteNumber(shearModulus) && isFiniteNumber(area)
        ? (shearModulus * area) / stiffnessReduction
        : null,
    );
  }
}

export function createXlamBeamSectionProvider(
  options: XlamBeamSectionProviderOptions = {},
): XlamBeamSectionProvider {
  return new XlamBeamSectionProvider(options);
}
