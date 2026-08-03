// Mechanical TypeScript migration from strutture-js 6f33baead8b88166c4b2cf94af41763412e3c751; source path: src/applications/timber-concrete-composite-beams/analysis/TimberConcreteCompositeBeamSectionProvider.js.

import type {
  BeamUnits,
  ElasticBeamSectionProperties,
} from "../../../domain/beams/ElasticBeamSectionProvider.js";
import { applySectionRotationToBeamProperties } from "../../../domain/beams/SectionRotation.js";
import type { SectionRotationInput } from "../../../domain/beams/SectionRotation.js";

const DEFAULT_UNITS = Object.freeze({ force: "N", length: "mm" }) satisfies BeamUnits;

export interface TimberConcreteCompositeBeamSectionLike {
  area: unknown;
  inertiaY?: unknown;
  inertiaZ?: unknown;
  shearAreaY?: unknown;
  width?: unknown;
  height?: unknown;
}

export interface TimberConcreteCompositeBeamMaterialLike {
  elasticModulus?: unknown;
  shearModulus?: unknown;
  poissonRatio?: unknown;
}

export interface TimberConcreteCompositeBeamIdealSectionLike {
  area: unknown;
  inertiaY?: unknown;
  inertiaZ?: unknown;
}

export interface TimberConcreteCompositeBeamModelLike {
  span: unknown;
  slabSection: TimberConcreteCompositeBeamSectionLike;
  timberSection: TimberConcreteCompositeBeamSectionLike;
  timberMaterial: TimberConcreteCompositeBeamMaterialLike;
  concreteMaterial: TimberConcreteCompositeBeamMaterialLike;
  connector: unknown;
  connectorSpacing: unknown;
  kdef: unknown;
  kmod: unknown;
  gammaTimber: unknown;
  gammaConcrete: unknown;
  gammaConnector: unknown;
  metadata: Record<string, unknown>;
  timberCentroidY(): number;
  slabCentroidY(): number;
  createIdealCompositeSection(): TimberConcreteCompositeBeamIdealSectionLike;
}

export interface TimberConcreteCompositeBeamSectionProviderContext extends Record<string, unknown> {
  limitState?: unknown;
  deformationState?: unknown;
  serviceCombination?: unknown;
  sectionRotation?: number | SectionRotationInput | null;
}

export interface TimberConcreteCompositeBeamSectionProviderOptions {
  model?: TimberConcreteCompositeBeamModelLike | null;
  defaultFinalStiffnessForSle?: boolean;
  shearCorrectionFactor?: number | null;
  units?: BeamUnits | null;
  metadata?: Record<string, unknown> | null;
}

interface ProviderBeamProperties extends Record<string, unknown> {
  axialRigidity: number;
  flexuralRigidity: number;
  shearRigidity: number | null;
  shearCorrectionFactor: number | null;
  units: BeamUnits;
  metadata: Record<string, unknown>;
}

export interface TimberConcreteCompositeBeamGammaProperties {
  idealComposite: TimberConcreteCompositeBeamIdealSectionLike;
  ew: number;
  ec: number;
  n: number;
  timberCentroid: number;
  slabCentroid: number;
  centroidDistance: number;
  disconnectedInertia: number;
  idealInertia: number;
  collaborationInertia: number;
  gammaUls: number;
  gammaSle: number;
  inertiaEffUls: number;
  inertiaEffSle: number;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function assertPositive(value: unknown, label: string): asserts value is number {
  if (!isFiniteNumber(value) || value <= 0) {
    throw new Error(`${label} must be a positive number.`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function readProperty(value: unknown, key: string): unknown {
  if (!isRecord(value)) {
    return undefined;
  }

  return value[key];
}

function resolveShearModulus(
  material: TimberConcreteCompositeBeamMaterialLike | null | undefined,
  fallbackDivisor: number | null = null,
): number | null {
  const shearModulus = readProperty(material, "shearModulus");
  if (isFiniteNumber(shearModulus)) {
    return shearModulus;
  }

  const elasticModulus = readProperty(material, "elasticModulus");
  const poissonRatio = readProperty(material, "poissonRatio");
  if (isFiniteNumber(elasticModulus) && isFiniteNumber(poissonRatio)) {
    return elasticModulus / (2 * (1 + poissonRatio));
  }

  if (isFiniteNumber(elasticModulus) && isFiniteNumber(fallbackDivisor)) {
    return elasticModulus / fallbackDivisor;
  }

  return null;
}

function resolveShearArea(section: TimberConcreteCompositeBeamSectionLike): unknown {
  return section?.shearAreaY ?? section?.area ?? null;
}

function sourceString(value: unknown): string {
  return Reflect.apply(String, undefined, [value]);
}

function isUltimateContext(context: TimberConcreteCompositeBeamSectionProviderContext): boolean {
  return sourceString(context.limitState ?? "").toUpperCase() === "ULS";
}

function isFinalServiceContext(
  context: TimberConcreteCompositeBeamSectionProviderContext,
  defaultFinalStiffnessForSle: boolean,
): boolean {
  if (context.deformationState === "instant" || context.serviceCombination === "instant") {
    return false;
  }

  if (
    context.deformationState === "final" ||
    context.serviceCombination === "final" ||
    context.serviceCombination === "quasi-permanent"
  ) {
    return true;
  }

  return defaultFinalStiffnessForSle && !isUltimateContext(context);
}

function isBeamUnits(value: unknown): value is BeamUnits {
  if (!isRecord(value)) {
    return false;
  }

  const force = value.force;
  const length = value.length;
  return (
    (force === "N" || force === "kN" || force === "MN") &&
    (length === "m" || length === "dm" || length === "cm" || length === "mm")
  );
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
    axialRigidity: rotated.axialRigidity,
    flexuralRigidity: rotated.flexuralRigidity,
    shearRigidity: rotated.shearRigidity,
    shearCorrectionFactor: rotated.shearCorrectionFactor ?? properties.shearCorrectionFactor,
    units: properties.units,
    metadata: rotated.metadata ?? properties.metadata,
    flexuralRigidityY: rotated.flexuralRigidityY ?? rotated.flexuralRigidity,
    flexuralRigidityZ: rotated.flexuralRigidityZ ?? null,
    shearRigidityY: rotated.shearRigidityY ?? rotated.shearRigidity,
    shearRigidityZ: rotated.shearRigidityZ ?? null,
  };
}

function sourceAdd(left: unknown, right: number): unknown {
  if (typeof left === "string") {
    return left + sourceString(right);
  }

  return Number(left) + right;
}

export class TimberConcreteCompositeBeamSectionProvider {
  model: TimberConcreteCompositeBeamModelLike;
  defaultFinalStiffnessForSle: boolean;
  shearCorrectionFactor: number | null;
  units: BeamUnits;
  metadata: Record<string, unknown>;

  constructor({
    model,
    defaultFinalStiffnessForSle = true,
    shearCorrectionFactor = 1,
    units = null,
    metadata = {},
  }: TimberConcreteCompositeBeamSectionProviderOptions = {}) {
    if (!model) {
      throw new Error("TimberConcreteCompositeBeamSectionProvider requires a model.");
    }

    this.model = model;
    this.defaultFinalStiffnessForSle = defaultFinalStiffnessForSle;
    this.shearCorrectionFactor = shearCorrectionFactor;
    this.units =
      units ??
      (isBeamUnits(model.metadata?.unitSystem) ? model.metadata.unitSystem : DEFAULT_UNITS);
    this.metadata = { ...metadata };
  }

  calculateGammaProperties(): TimberConcreteCompositeBeamGammaProperties {
    const {
      span,
      slabSection,
      timberSection,
      timberMaterial,
      concreteMaterial,
      connector,
      connectorSpacing,
    } = this.model;

    const timberElasticModulus = timberMaterial.elasticModulus;
    const concreteElasticModulus = concreteMaterial.elasticModulus;
    const connectorKser = readProperty(connector, "kser");
    const connectorKu = readProperty(connector, "ku");
    assertPositive(span, "Beam span");
    assertPositive(connectorSpacing, "Connector spacing");
    assertPositive(timberElasticModulus, "Timber elastic modulus");
    assertPositive(concreteElasticModulus, "Concrete elastic modulus");
    assertPositive(connectorKser, "Connector service stiffness kser");
    assertPositive(connectorKu, "Connector ultimate stiffness ku");

    const idealComposite = this.model.createIdealCompositeSection();
    const ew = timberElasticModulus;
    const ec = concreteElasticModulus;
    const n = ec / ew;
    const timberCentroid = this.model.timberCentroidY();
    const slabCentroid = this.model.slabCentroidY();
    const centroidDistance = slabCentroid - timberCentroid;
    assertPositive(centroidDistance, "Composite centroid distance");
    const disconnectedInertiaValue = sourceAdd(
      timberSection.inertiaY,
      n * Number(slabSection.inertiaY),
    );
    assertPositive(disconnectedInertiaValue, "Disconnected transformed inertia");
    const disconnectedInertia = disconnectedInertiaValue;
    const idealInertiaValue = idealComposite.inertiaY;
    assertPositive(idealInertiaValue, "Ideal transformed inertia");
    const idealInertia = idealInertiaValue;
    const collaborationInertia = idealInertia - disconnectedInertia;
    assertPositive(collaborationInertia, "Collaboration inertia contribution");

    const gammaUls =
      1 /
      (1 +
        (Math.PI ** 2 * ew * collaborationInertia * connectorSpacing) /
          (connectorKu * span ** 2 * centroidDistance ** 2));
    const gammaSle =
      1 /
      (1 +
        (Math.PI ** 2 * ew * collaborationInertia * connectorSpacing) /
          (connectorKser * span ** 2 * centroidDistance ** 2));

    return {
      idealComposite,
      ew,
      ec,
      n,
      timberCentroid,
      slabCentroid,
      centroidDistance,
      disconnectedInertia,
      idealInertia,
      collaborationInertia,
      gammaUls,
      gammaSle,
      inertiaEffUls: disconnectedInertia + gammaUls * collaborationInertia,
      inertiaEffSle: disconnectedInertia + gammaSle * collaborationInertia,
    };
  }

  getElasticBeamProperties(
    context: TimberConcreteCompositeBeamSectionProviderContext = {},
  ): ElasticBeamSectionProperties {
    const {
      slabSection,
      timberSection,
      timberMaterial,
      concreteMaterial,
      connector,
      connectorSpacing,
      kdef,
      kmod,
      gammaTimber,
      gammaConcrete,
      gammaConnector,
    } = this.model;
    const gammaProperties = this.calculateGammaProperties();
    const ultimate = isUltimateContext(context);
    const finalStiffness = isFinalServiceContext(context, this.defaultFinalStiffnessForSle);
    const stiffnessReduction = finalStiffness && isFiniteNumber(kdef) ? 1 + kdef : 1;
    const effectiveTimberModulus = gammaProperties.ew / stiffnessReduction;
    const inertiaEffective = ultimate
      ? gammaProperties.inertiaEffUls
      : gammaProperties.inertiaEffSle;
    const gamma = ultimate ? gammaProperties.gammaUls : gammaProperties.gammaSle;
    const connectorStiffness = ultimate
      ? readProperty(connector, "ku")
      : readProperty(connector, "kser");
    const timberShearModulus = resolveShearModulus(timberMaterial, 16);
    const concreteShearModulus = resolveShearModulus(concreteMaterial);
    const timberShearArea = resolveShearArea(timberSection);
    const slabShearArea = resolveShearArea(slabSection);
    const shearRigidity =
      isFiniteNumber(timberShearModulus) &&
      isFiniteNumber(concreteShearModulus) &&
      isFiniteNumber(timberShearArea) &&
      isFiniteNumber(slabShearArea)
        ? timberShearModulus * timberShearArea + concreteShearModulus * slabShearArea
        : null;

    assertPositive(gammaProperties.idealComposite.area, "Ideal transformed area");
    const properties: ProviderBeamProperties = {
      axialRigidity: effectiveTimberModulus * gammaProperties.idealComposite.area,
      flexuralRigidity: effectiveTimberModulus * inertiaEffective,
      shearRigidity,
      shearCorrectionFactor: shearRigidity === null ? null : this.shearCorrectionFactor,
      units: this.units,
      metadata: {
        ...this.metadata,
        provider: "TimberConcreteCompositeBeamSectionProvider",
        source: "timber-concrete-gamma-method",
        limitState: ultimate ? "ULS" : "SLE",
        finalStiffness,
        stiffnessReduction,
        kdef,
        kmod,
        gammaTimber,
        gammaConcrete,
        gammaConnector,
        connectorSpacing,
        connectorStiffness,
        modularRatio: gammaProperties.n,
        gamma,
        gammaUls: gammaProperties.gammaUls,
        gammaSle: gammaProperties.gammaSle,
        inertiaEffective,
        inertiaEffUls: gammaProperties.inertiaEffUls,
        inertiaEffSle: gammaProperties.inertiaEffSle,
        disconnectedInertia: gammaProperties.disconnectedInertia,
        idealInertia: gammaProperties.idealInertia,
        collaborationInertia: gammaProperties.collaborationInertia,
        timberCentroid: gammaProperties.timberCentroid,
        slabCentroid: gammaProperties.slabCentroid,
        centroidDistance: gammaProperties.centroidDistance,
      },
    };

    return rotateProperties(
      properties,
      context.sectionRotation,
      effectiveTimberModulus * inertiaEffective,
      isFiniteNumber(gammaProperties.idealComposite.inertiaZ)
        ? effectiveTimberModulus * gammaProperties.idealComposite.inertiaZ
        : null,
      shearRigidity,
      shearRigidity,
    );
  }
}

export function createTimberConcreteCompositeBeamSectionProvider(
  options: TimberConcreteCompositeBeamSectionProviderOptions = {},
): TimberConcreteCompositeBeamSectionProvider {
  return new TimberConcreteCompositeBeamSectionProvider(options);
}
