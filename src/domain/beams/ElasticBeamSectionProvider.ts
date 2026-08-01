import {
  applySectionRotationToBeamProperties,
  type BeamRotationProperties,
} from "./SectionRotation.js";
import type { SectionRotationInput } from "./SectionRotation.js";
import type { UnitSystem } from "../units/UnitSystem.js";

const DEFAULT_PROPERTY_UNITS = Object.freeze({ force: "N", length: "mm" });

export type BeamUnits = UnitSystem;

export interface ElasticBeamSectionProperties extends BeamRotationProperties {
  units: BeamUnits;
  metadata: Record<string, unknown>;
  shearCorrectionFactor: number | null;
  flexuralRigidityY: number | null | undefined;
  flexuralRigidityZ: number | null | undefined;
  shearRigidityY: number | null | undefined;
  shearRigidityZ: number | null | undefined;
}

export interface BeamMaterialLike {
  elasticModulus?: number | null;
  shearModulus?: number | null;
  poissonRatio?: number | null;
  units?: BeamUnits | null;
  metadata?: Record<string, unknown>;
}

export interface BeamSectionLike {
  area?: number | null;
  inertiaY?: number | null;
  inertiaZ?: number | null;
  shearAreaY?: number | null;
  shearAreaZ?: number | null;
  components?: BeamCompositeComponent[];
}

interface BeamCompositeComponent {
  name?: string;
  role?: string;
  section?: BeamSectionLike | null;
  material?: unknown;
  centroidY: number;
  centroidZ: number;
}

export interface ElasticBeamPropertiesContext extends Record<string, unknown> {
  section?: BeamSectionLike | null;
  material?: BeamMaterialLike | null;
  provider?: ElasticBeamSectionProvider;
  bendingInertiaAxis?: string;
  shearAreaAxis?: string;
  shearCorrectionFactor?: number | null;
  context?: Record<string, unknown>;
}

export interface ElasticBeamPropertyResolver {
  (
    context: ElasticBeamPropertiesContext,
  ): Partial<ElasticBeamSectionProperties> & Record<string, unknown>;
}

export interface ElasticBeamSectionProviderOptions {
  section?: BeamSectionLike | null;
  material?: BeamMaterialLike | null;
  source?: object | null;
  propertyResolver?: ElasticBeamPropertyResolver | null;
  bendingInertiaAxis?: string;
  shearAreaAxis?: string;
  shearCorrectionFactor?: number | null;
  units?: BeamUnits | null;
  metadata?: Record<string, unknown>;
}

function assertPositive(value: unknown, label: string): asserts value is number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be a positive number.`);
  }
}

function firstFinite(...values: unknown[]): number | undefined {
  return values.find(
    (value): value is number => typeof value === "number" && Number.isFinite(value),
  );
}

function readProperty(source: object | null | undefined, key: string): unknown {
  return source && typeof source === "object"
    ? (source as Record<string, unknown>)[key]
    : undefined;
}

function resolveMaterial(value: unknown): BeamMaterialLike | null {
  return value !== null && typeof value === "object" ? value : null;
}

function resolveUnits(...sources: Array<object | BeamMaterialLike | null | undefined>): BeamUnits {
  for (const source of sources) {
    const sourceRecord = source as Record<string, unknown> | undefined | null;
    const sourceMetadata = sourceRecord?.metadata;
    const metadataRecord =
      sourceMetadata && typeof sourceMetadata === "object"
        ? (sourceMetadata as Record<string, unknown>)
        : undefined;
    const unitSystem = sourceRecord?.units ?? metadataRecord?.unitSystem;

    if (unitSystem && typeof unitSystem === "object") {
      const candidate = unitSystem as { force?: unknown; length?: unknown };
      if (typeof candidate.force === "string" && typeof candidate.length === "string") {
        return unitSystem as BeamUnits;
      }
    }
  }

  return DEFAULT_PROPERTY_UNITS;
}

function normalizeBeamProperties(
  properties: Partial<ElasticBeamSectionProperties> & Record<string, unknown>,
  fallbackUnits: BeamUnits | null,
  fallbackMetadata: Record<string, unknown> = {},
): ElasticBeamSectionProperties {
  if (!properties || typeof properties !== "object") {
    throw new Error("Elastic beam properties must be returned as an object.");
  }

  const axialRigidity = firstFinite(properties.axialRigidity, properties.EA, properties.ea);
  const flexuralRigidity = firstFinite(
    properties.flexuralRigidity,
    properties.effectiveFlexuralRigidity,
    properties.EI,
    properties.ei,
  );
  const shearRigidity = firstFinite(
    properties.shearRigidity,
    properties.effectiveShearRigidity,
    properties.GA,
    properties.ga,
  );

  assertPositive(axialRigidity, "axialRigidity");
  assertPositive(flexuralRigidity, "flexuralRigidity");

  if (shearRigidity !== undefined) {
    assertPositive(shearRigidity, "shearRigidity");
  }

  return {
    axialRigidity,
    flexuralRigidity,
    shearRigidity: shearRigidity ?? null,
    flexuralRigidityY: firstFinite(properties.flexuralRigidityY, properties.EIy, properties.EIY),
    flexuralRigidityZ: firstFinite(properties.flexuralRigidityZ, properties.EIz, properties.EIZ),
    shearRigidityY: firstFinite(properties.shearRigidityY, properties.GAy, properties.GAY),
    shearRigidityZ: firstFinite(properties.shearRigidityZ, properties.GAz, properties.GAZ),
    shearCorrectionFactor: properties.shearCorrectionFactor ?? null,
    units: resolveUnits(properties, { units: fallbackUnits }),
    metadata: {
      ...fallbackMetadata,
      ...properties.metadata,
    },
  };
}

function resolveShearModulus(material: BeamMaterialLike | null): number | null {
  if (typeof material?.shearModulus === "number" && Number.isFinite(material.shearModulus)) {
    return material.shearModulus;
  }

  if (
    typeof material?.elasticModulus === "number" &&
    Number.isFinite(material.elasticModulus) &&
    typeof material.poissonRatio === "number" &&
    Number.isFinite(material.poissonRatio)
  ) {
    return material.elasticModulus / (2 * (1 + material.poissonRatio));
  }

  return null;
}

function resolveShearArea(
  section: BeamSectionLike | null | undefined,
  shearAreaAxis: string,
): { shearArea: number | null; usesEffectiveShearArea: boolean } {
  const shearArea = readProperty(section, shearAreaAxis);

  if (typeof shearArea === "number" && Number.isFinite(shearArea)) {
    return {
      shearArea,
      usesEffectiveShearArea: true,
    };
  }

  if (typeof section?.area === "number" && Number.isFinite(section.area)) {
    return {
      shearArea: section.area,
      usesEffectiveShearArea: false,
    };
  }

  return {
    shearArea: null,
    usesEffectiveShearArea: false,
  };
}

function oppositeInertiaAxis(axis: string): string {
  return axis === "inertiaZ" ? "inertiaY" : "inertiaZ";
}

function oppositeShearAreaAxis(axis: string): string {
  return axis === "shearAreaZ" ? "shearAreaY" : "shearAreaZ";
}

function resolveBendingCoordinate(
  component: BeamCompositeComponent,
  bendingInertiaAxis: string,
): number {
  if (bendingInertiaAxis === "inertiaZ") {
    return component.centroidZ;
  }

  return component.centroidY;
}

function calculateCompositeFlexuralRigidity(
  section: BeamSectionLike & { components: BeamCompositeComponent[] },
  material: BeamMaterialLike | null,
  inertiaAxis: string,
): number | null {
  const pieces = section.components.map((component) => {
    const componentMaterial = resolveMaterial(component.material) ?? material;
    const elasticModulus = componentMaterial?.elasticModulus;
    const area = component.section?.area;
    const inertia = readProperty(component.section, inertiaAxis);
    const centroid = resolveBendingCoordinate(component, inertiaAxis);

    if (
      typeof elasticModulus !== "number" ||
      !Number.isFinite(elasticModulus) ||
      typeof area !== "number" ||
      !Number.isFinite(area) ||
      typeof inertia !== "number" ||
      !Number.isFinite(inertia)
    ) {
      return null;
    }

    return {
      elasticModulus,
      area,
      inertia,
      centroid,
    };
  });

  if (pieces.some((piece) => piece === null)) {
    return null;
  }

  const resolvedPieces = pieces.filter(
    (piece): piece is NonNullable<typeof piece> => piece !== null,
  );
  const axialRigidity = resolvedPieces.reduce(
    (sum, piece) => sum + piece.elasticModulus * piece.area,
    0,
  );
  const elasticCentroid =
    resolvedPieces.reduce(
      (sum, piece) => sum + piece.elasticModulus * piece.area * piece.centroid,
      0,
    ) / axialRigidity;

  return resolvedPieces.reduce(
    (sum, piece) =>
      sum +
      piece.elasticModulus * (piece.inertia + piece.area * (piece.centroid - elasticCentroid) ** 2),
    0,
  );
}

function calculateCompositeShearRigidity(
  section: BeamSectionLike & { components: BeamCompositeComponent[] },
  material: BeamMaterialLike | null,
  shearAreaAxis: string,
): number | null {
  const value = section.components.reduce((sum, component) => {
    const componentMaterial = resolveMaterial(component.material) ?? material;
    const shearModulus = resolveShearModulus(componentMaterial);
    const { shearArea } = resolveShearArea(component.section, shearAreaAxis);

    return shearModulus !== null && shearArea !== null ? sum + shearModulus * shearArea : sum;
  }, 0);

  return value > 0 ? value : null;
}

function calculateSimpleSectionProperties({
  section,
  material,
  bendingInertiaAxis,
  shearAreaAxis,
  shearCorrectionFactor,
  units,
  context = {},
}: {
  section: BeamSectionLike;
  material: BeamMaterialLike;
  bendingInertiaAxis: string;
  shearAreaAxis: string;
  shearCorrectionFactor: number | null;
  units: BeamUnits;
  context: Record<string, unknown>;
}): ElasticBeamSectionProperties {
  const elasticModulus = material.elasticModulus;
  const area = section.area;
  const inertia = readProperty(section, bendingInertiaAxis);

  assertPositive(elasticModulus, "material elasticModulus");
  assertPositive(area, "section area");
  assertPositive(inertia, `section ${bendingInertiaAxis}`);

  const shearModulus = resolveShearModulus(material);
  const { shearArea, usesEffectiveShearArea } = resolveShearArea(section, shearAreaAxis);
  const resolvedShearCorrectionFactor =
    shearCorrectionFactor ?? (usesEffectiveShearArea ? 1 : 5 / 6);
  const shearRigidity =
    shearModulus !== null && shearArea !== null ? shearModulus * shearArea : null;

  const oppositeInertia = readProperty(section, oppositeInertiaAxis(bendingInertiaAxis));
  const { shearArea: shearAreaOpposite } = resolveShearArea(
    section,
    oppositeShearAreaAxis(shearAreaAxis),
  );
  const normalized = normalizeBeamProperties(
    {
      axialRigidity: elasticModulus * area,
      flexuralRigidity: elasticModulus * inertia,
      shearRigidity,
      shearCorrectionFactor: shearRigidity === null ? null : resolvedShearCorrectionFactor,
      metadata: {
        source: "simple-section",
        bendingInertiaAxis,
        shearAreaAxis,
        usesEffectiveShearArea,
      },
    },
    units,
  );

  return applySectionRotationToBeamProperties({
    properties: normalized,
    sectionRotation: context.sectionRotation as SectionRotationInput | number | null | undefined,
    flexuralRigidityY:
      typeof section.inertiaY === "number"
        ? elasticModulus * section.inertiaY
        : elasticModulus * inertia,
    flexuralRigidityZ:
      typeof section.inertiaZ === "number"
        ? elasticModulus * section.inertiaZ
        : typeof oppositeInertia === "number"
          ? elasticModulus * oppositeInertia
          : null,
    shearRigidityY:
      shearModulus !== null &&
      (typeof section.shearAreaY === "number" || typeof section.area === "number")
        ? shearModulus * (section.shearAreaY ?? section.area ?? 0)
        : null,
    shearRigidityZ:
      shearModulus !== null && shearAreaOpposite !== null ? shearModulus * shearAreaOpposite : null,
  }) as unknown as ElasticBeamSectionProperties;
}

function calculateCompositeSectionProperties({
  section,
  material,
  bendingInertiaAxis,
  shearAreaAxis,
  shearCorrectionFactor,
  units,
  context = {},
}: {
  section: BeamSectionLike & { components: BeamCompositeComponent[] };
  material: BeamMaterialLike | null;
  bendingInertiaAxis: string;
  shearAreaAxis: string;
  shearCorrectionFactor: number | null;
  units: BeamUnits;
  context: Record<string, unknown>;
}): ElasticBeamSectionProperties {
  const pieces = section.components.map((component) => {
    const componentMaterial = resolveMaterial(component.material) ?? material;
    const elasticModulus = componentMaterial?.elasticModulus;
    const area = component.section?.area;
    const inertia = readProperty(component.section, bendingInertiaAxis);
    const centroid = resolveBendingCoordinate(component, bendingInertiaAxis);

    assertPositive(elasticModulus, `component ${component.name ?? component.role} elasticModulus`);
    assertPositive(area, `component ${component.name ?? component.role} area`);
    assertPositive(inertia, `component ${component.name ?? component.role} ${bendingInertiaAxis}`);

    const shearModulus = resolveShearModulus(componentMaterial);
    const { shearArea } = resolveShearArea(component.section, shearAreaAxis);

    return {
      elasticModulus,
      area,
      inertia,
      centroid,
      shearRigidity: shearModulus !== null && shearArea !== null ? shearModulus * shearArea : 0,
    };
  });
  const axialRigidity = pieces.reduce((sum, piece) => sum + piece.elasticModulus * piece.area, 0);
  const elasticCentroid =
    pieces.reduce((sum, piece) => sum + piece.elasticModulus * piece.area * piece.centroid, 0) /
    axialRigidity;
  const flexuralRigidity = pieces.reduce(
    (sum, piece) =>
      sum +
      piece.elasticModulus * (piece.inertia + piece.area * (piece.centroid - elasticCentroid) ** 2),
    0,
  );
  const shearRigidity = pieces.reduce((sum, piece) => sum + piece.shearRigidity, 0);

  const flexuralRigidityY = calculateCompositeFlexuralRigidity(section, material, "inertiaY");
  const flexuralRigidityZ = calculateCompositeFlexuralRigidity(section, material, "inertiaZ");
  const shearRigidityY = calculateCompositeShearRigidity(section, material, "shearAreaY");
  const shearRigidityZ = calculateCompositeShearRigidity(section, material, "shearAreaZ");
  const normalized = normalizeBeamProperties(
    {
      axialRigidity,
      flexuralRigidity,
      shearRigidity: shearRigidity > 0 ? shearRigidity : null,
      shearCorrectionFactor: shearRigidity > 0 ? (shearCorrectionFactor ?? 1) : null,
      metadata: {
        source: "composite-section-rigid-collaboration",
        bendingInertiaAxis,
        shearAreaAxis,
        elasticCentroid,
      },
    },
    units,
  );

  return applySectionRotationToBeamProperties({
    properties: normalized,
    sectionRotation: context.sectionRotation as SectionRotationInput | number | null | undefined,
    flexuralRigidityY,
    flexuralRigidityZ,
    shearRigidityY,
    shearRigidityZ,
  }) as unknown as ElasticBeamSectionProperties;
}

export class ElasticBeamSectionProvider {
  section: BeamSectionLike | null;
  material: BeamMaterialLike | null;
  source: object | null;
  propertyResolver: ElasticBeamPropertyResolver | null;
  bendingInertiaAxis: string;
  shearAreaAxis: string;
  shearCorrectionFactor: number | null;
  units: BeamUnits;
  metadata: Record<string, unknown>;

  constructor({
    section = null,
    material = null,
    source = null,
    propertyResolver = null,
    bendingInertiaAxis = "inertiaY",
    shearAreaAxis = "shearAreaY",
    shearCorrectionFactor = null,
    units = null,
    metadata = {},
  }: ElasticBeamSectionProviderOptions = {}) {
    this.section = section;
    this.material = material;
    this.source = source ?? section;
    this.propertyResolver = propertyResolver;
    this.bendingInertiaAxis = bendingInertiaAxis;
    this.shearAreaAxis = shearAreaAxis;
    this.shearCorrectionFactor = shearCorrectionFactor;
    this.units = units ?? resolveUnits(section, material);
    this.metadata = { ...metadata };
  }

  getElasticBeamProperties(context: Record<string, unknown> = {}): ElasticBeamSectionProperties {
    const fallbackUnits = this.units;
    const fallbackMetadata = {
      ...this.metadata,
      provider: "ElasticBeamSectionProvider",
    };

    if (this.propertyResolver) {
      const normalized = normalizeBeamProperties(
        this.propertyResolver({
          section: this.section,
          material: this.material,
          provider: this,
          context,
        }),
        fallbackUnits,
        fallbackMetadata,
      );

      return applySectionRotationToBeamProperties({
        properties: normalized,
        sectionRotation: context.sectionRotation as
          | SectionRotationInput
          | number
          | null
          | undefined,
      }) as unknown as ElasticBeamSectionProperties;
    }

    for (const methodName of ["getElasticBeamProperties", "calculateElasticBeamProperties"]) {
      const method = readProperty(this.source, methodName);

      if (typeof method === "function") {
        const normalized = normalizeBeamProperties(
          (method as (input: Record<string, unknown>) => unknown).call(this.source, {
            section: this.section,
            material: this.material,
            bendingInertiaAxis: this.bendingInertiaAxis,
            shearAreaAxis: this.shearAreaAxis,
            shearCorrectionFactor: this.shearCorrectionFactor,
            context,
          }) as Partial<ElasticBeamSectionProperties> & Record<string, unknown>,
          fallbackUnits,
          fallbackMetadata,
        );

        return applySectionRotationToBeamProperties({
          properties: normalized,
          sectionRotation: context.sectionRotation as
            | SectionRotationInput
            | number
            | null
            | undefined,
        }) as ElasticBeamSectionProperties;
      }
    }

    if (!this.section) {
      throw new Error("ElasticBeamSectionProvider requires a section or propertyResolver.");
    }

    if (Array.isArray(this.section.components) && this.section.components.length > 0) {
      return calculateCompositeSectionProperties({
        section: this.section as BeamSectionLike & { components: BeamCompositeComponent[] },
        material: this.material,
        bendingInertiaAxis: this.bendingInertiaAxis,
        shearAreaAxis: this.shearAreaAxis,
        shearCorrectionFactor: this.shearCorrectionFactor,
        units: fallbackUnits,
        context,
      });
    }

    if (!this.material) {
      throw new Error("ElasticBeamSectionProvider requires a material for simple sections.");
    }

    return calculateSimpleSectionProperties({
      section: this.section,
      material: this.material,
      bendingInertiaAxis: this.bendingInertiaAxis,
      shearAreaAxis: this.shearAreaAxis,
      shearCorrectionFactor: this.shearCorrectionFactor,
      units: fallbackUnits,
      context,
    });
  }
}

export function createElasticBeamSectionProvider(
  options: ElasticBeamSectionProviderOptions = {},
): ElasticBeamSectionProvider {
  return new ElasticBeamSectionProvider(options);
}
