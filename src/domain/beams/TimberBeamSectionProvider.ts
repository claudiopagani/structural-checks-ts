// Mechanical TypeScript migration from strutture-js 6f33baead8b88166c4b2cf94af41763412e3c751; source path: src/domain/beams/TimberBeamSectionProvider.js.

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

export interface TimberBeamSectionMetadata extends Record<string, unknown> {
  unitSystem?: BeamUnits;
  timberType?: unknown;
  gammaM?: unknown;
  kdef?: unknown;
}

export interface TimberBeamSectionLike extends BeamSectionLike {
  readonly [key: string]: unknown;
  units?: BeamUnits | null;
  metadata?: TimberBeamSectionMetadata;
}

export interface TimberBeamMaterialLike extends BeamMaterialLike {
  readonly [key: string]: unknown;
  serviceClass?: unknown;
  timberType?: unknown;
  loadDurationClass?: unknown;
  gMean?: unknown;
  g0Mean?: unknown;
  fmK?: unknown;
  fvK?: unknown;
  fc0K?: unknown;
  ft0K?: unknown;
  kdef?: unknown;
  kmod?: unknown;
  metadata?: TimberBeamSectionMetadata;
}

export interface TimberBeamSectionProviderContext extends Record<string, unknown> {
  governingLoadDurationClass?: unknown;
  loadDurationClass?: unknown;
  deformationState?: unknown;
  serviceCombination?: unknown;
  sectionRotation?: number | SectionRotationInput | null;
}

export interface TimberKmodResolverOptions {
  context: TimberBeamSectionProviderContext;
  material: TimberBeamMaterialLike;
  serviceClass: unknown;
  materialType: string;
  loadDurationClass: unknown;
}

export interface TimberBeamSectionProviderOptions {
  section?: TimberBeamSectionLike | null;
  material?: TimberBeamMaterialLike | null;
  bendingInertiaAxis?: string;
  shearAreaAxis?: string;
  shearCorrectionFactor?: number | null;
  serviceClass?: unknown;
  materialType?: unknown;
  gammaM?: unknown;
  kdef?: unknown;
  kmod?: unknown;
  kmodByDuration?: Record<string, unknown> | null;
  kmodResolver?: ((options: TimberKmodResolverOptions) => unknown) | null;
  useFinalStiffness?: boolean;
  units?: BeamUnits | null;
  metadata?: Record<string, unknown>;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function numericOperand(value: unknown): number {
  return typeof value === "number" ? value : Number(value);
}

function sourceString(value: unknown): string {
  return Reflect.apply(String, undefined, [value]);
}

function assertPositive(value: unknown, label: string): asserts value is number {
  if (!isFiniteNumber(value) || value <= 0) {
    throw new Error(`${label} must be a positive number.`);
  }
}

function resolveUnits(
  ...sources: Array<TimberBeamSectionLike | TimberBeamMaterialLike | null | undefined>
): BeamUnits {
  for (const source of sources) {
    const unitSystem = source?.units ?? source?.metadata?.unitSystem;

    if (unitSystem?.force && unitSystem.length) {
      return unitSystem;
    }
  }

  return DEFAULT_UNITS;
}

function resolveShearModulus(material: TimberBeamMaterialLike): number | null {
  if (isFiniteNumber(material.shearModulus)) {
    return material.shearModulus;
  }

  if (isFiniteNumber(material.gMean)) {
    return material.gMean;
  }

  if (isFiniteNumber(material.g0Mean)) {
    return material.g0Mean;
  }

  if (isFiniteNumber(material.elasticModulus)) {
    return material.elasticModulus / 16;
  }

  return null;
}

function normalizeTimberMaterialType(materialType: unknown): string {
  const normalized = sourceString(materialType ?? "")
    .trim()
    .toLowerCase()
    .replaceAll("-", "_");

  const aliases: Record<string, string> = {
    solid_timber: "solid_timber",
    solid: "solid_timber",
    glulam: "glulam",
    glued_laminated_timber: "glulam",
    lvl: "lvL",
    lv_l: "lvL",
    wood_based_panels: "wood_based_panels",
    panel: "wood_based_panels",
  };

  return aliases[normalized] ?? normalized;
}

function resolveKmod({
  context,
  material,
  kmod,
  kmodByDuration,
  kmodResolver,
  serviceClass,
  materialType,
}: {
  context: TimberBeamSectionProviderContext;
  material: TimberBeamMaterialLike;
  kmod: unknown;
  kmodByDuration: Record<string, unknown> | null;
  kmodResolver: ((options: TimberKmodResolverOptions) => unknown) | null;
  serviceClass: unknown;
  materialType: string;
}): { kmod: unknown; loadDurationClass: unknown } {
  const loadDurationClass =
    context.governingLoadDurationClass ??
    context.loadDurationClass ??
    material.loadDurationClass ??
    "medium";

  if (typeof kmodResolver === "function") {
    return {
      kmod: kmodResolver({
        context,
        material,
        serviceClass,
        materialType,
        loadDurationClass,
      }),
      loadDurationClass,
    };
  }

  const loadDurationKey = sourceString(loadDurationClass);

  if (kmodByDuration && isFiniteNumber(kmodByDuration[loadDurationKey])) {
    return {
      kmod: kmodByDuration[loadDurationKey],
      loadDurationClass,
    };
  }

  return {
    kmod: kmod ?? material.kmod ?? null,
    loadDurationClass,
  };
}

function designStrength(value: unknown, kmod: unknown, gammaM: unknown): number | null {
  if (!isFiniteNumber(value) || !isFiniteNumber(kmod) || !isFiniteNumber(gammaM)) {
    return null;
  }

  return (kmod * value) / gammaM;
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

export class TimberBeamSectionProvider {
  section: TimberBeamSectionLike;
  material: TimberBeamMaterialLike;
  bendingInertiaAxis: string;
  shearAreaAxis: string;
  shearCorrectionFactor: number | null;
  serviceClass: unknown;
  materialType: string;
  gammaM: unknown;
  kdef: unknown;
  kmod: unknown;
  kmodByDuration: Record<string, unknown> | null;
  kmodResolver: ((options: TimberKmodResolverOptions) => unknown) | null;
  useFinalStiffness: boolean;
  units: BeamUnits;
  metadata: Record<string, unknown>;

  constructor({
    section,
    material,
    bendingInertiaAxis = "inertiaY",
    shearAreaAxis = "shearAreaY",
    shearCorrectionFactor = null,
    serviceClass = null,
    materialType = null,
    gammaM = null,
    kdef = null,
    kmod = null,
    kmodByDuration = null,
    kmodResolver = null,
    useFinalStiffness = false,
    units = null,
    metadata = {},
  }: TimberBeamSectionProviderOptions = {}) {
    if (!section) {
      throw new Error("TimberBeamSectionProvider requires a section.");
    }

    if (!material) {
      throw new Error("TimberBeamSectionProvider requires a material.");
    }

    this.section = section;
    this.material = material;
    this.bendingInertiaAxis = bendingInertiaAxis;
    this.shearAreaAxis = shearAreaAxis;
    this.shearCorrectionFactor = shearCorrectionFactor;
    this.serviceClass = serviceClass ?? material.serviceClass ?? 1;
    this.materialType = normalizeTimberMaterialType(
      materialType ?? material.metadata?.timberType ?? material.timberType,
    );
    this.gammaM = gammaM ?? material.metadata?.gammaM ?? null;
    this.kdef = kdef ?? material.kdef ?? material.metadata?.kdef ?? null;
    this.kmod = kmod;
    this.kmodByDuration = kmodByDuration ? { ...kmodByDuration } : null;
    this.kmodResolver = kmodResolver;
    this.useFinalStiffness = useFinalStiffness;
    this.units = units ?? resolveUnits(section, material);
    this.metadata = { ...metadata };
  }

  getElasticBeamProperties(
    context: TimberBeamSectionProviderContext = {},
  ): ElasticBeamSectionProperties {
    const area = this.section.area;
    const inertia = this.section[this.bendingInertiaAxis];
    const elasticModulusValue = this.material.elasticModulus;
    const shearModulus = resolveShearModulus(this.material);
    const shearArea = this.section[this.shearAreaAxis] ?? area;
    const finalStiffness =
      context.deformationState === "final" ||
      context.serviceCombination === "final" ||
      context.serviceCombination === "quasi-permanent" ||
      this.useFinalStiffness;
    const stiffnessReduction = finalStiffness && isFiniteNumber(this.kdef) ? 1 + this.kdef : 1;
    const effectiveElasticModulus = numericOperand(elasticModulusValue) / stiffnessReduction;
    const effectiveShearModulus = isFiniteNumber(shearModulus)
      ? shearModulus / stiffnessReduction
      : null;
    const { kmod, loadDurationClass } = resolveKmod({
      context,
      material: this.material,
      kmod: this.kmod,
      kmodByDuration: this.kmodByDuration,
      kmodResolver: this.kmodResolver,
      serviceClass: this.serviceClass,
      materialType: this.materialType,
    });

    assertPositive(area, "timber section area");
    assertPositive(inertia, `timber section ${this.bendingInertiaAxis}`);
    assertPositive(elasticModulusValue, "timber material elasticModulus");
    assertPositive(shearArea, `timber section ${this.shearAreaAxis} or area`);

    const properties: ProviderBeamProperties = {
      axialRigidity: effectiveElasticModulus * area,
      flexuralRigidity: effectiveElasticModulus * inertia,
      shearRigidity: isFiniteNumber(effectiveShearModulus)
        ? effectiveShearModulus * shearArea
        : null,
      shearCorrectionFactor: this.shearCorrectionFactor ?? 5 / 6,
      units: this.units,
      metadata: {
        ...this.metadata,
        provider: "TimberBeamSectionProvider",
        source: "timber-simple-section",
        bendingInertiaAxis: this.bendingInertiaAxis,
        shearAreaAxis: this.shearAreaAxis,
        materialType: this.materialType,
        serviceClass: this.serviceClass,
        loadDurationClass,
        governingLoadDurationClass: context.governingLoadDurationClass ?? loadDurationClass,
        kmod,
        kdef: this.kdef,
        gammaM: this.gammaM,
        finalStiffness,
        stiffnessReduction,
        fmD: designStrength(this.material.fmK, kmod, this.gammaM),
        fvD: designStrength(this.material.fvK, kmod, this.gammaM),
        fc0D: designStrength(this.material.fc0K, kmod, this.gammaM),
        ft0D: designStrength(this.material.ft0K, kmod, this.gammaM),
      },
    };

    return rotateProperties(
      properties,
      context.sectionRotation,
      isFiniteNumber(this.section.inertiaY)
        ? effectiveElasticModulus * this.section.inertiaY
        : properties.flexuralRigidity,
      isFiniteNumber(this.section.inertiaZ)
        ? effectiveElasticModulus * this.section.inertiaZ
        : null,
      isFiniteNumber(effectiveShearModulus)
        ? effectiveShearModulus * (this.section.shearAreaY ?? area)
        : null,
      isFiniteNumber(effectiveShearModulus)
        ? effectiveShearModulus * (this.section.shearAreaZ ?? area)
        : null,
    );
  }
}

export function createTimberBeamSectionProvider(
  options: TimberBeamSectionProviderOptions = {},
): TimberBeamSectionProvider {
  return new TimberBeamSectionProvider(options);
}
