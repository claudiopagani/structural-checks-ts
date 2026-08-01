import {
  assertExplicitUnitSystem,
  createUnitResolver,
  type UnitResolver,
  type UnitSystem,
  type UnitSystemInput,
} from "../units/UnitSystem.js";
import { GEOTECHNICAL_INTERNAL_UNITS, type SoilRecord } from "./SoilMaterial.js";

export const DEEP_FOUNDATION_MODEL_SCHEMA_VERSION = "deep-foundation-model/v1";
export const DEEP_FOUNDATION_ELEMENT_TYPES = Object.freeze([
  "pile",
  "micropile",
  "deep-foundation-element",
]);
export const DEEP_FOUNDATION_GEOMETRY_MODELS = Object.freeze(["circular", "assigned-section"]);
export const DEEP_FOUNDATION_DISPLACEMENT_CLASSES = Object.freeze([
  "displacement",
  "low-displacement",
  "non-displacement",
  "not-classified",
]);

export interface DeepFoundationModelInput {
  id?: string;
  name?: string | null;
  elementType?: string;
  geometry?: SoilRecord;
  placement?: SoilRecord;
  construction?: SoilRecord | null;
  units?: UnitSystemInput | null;
  metadata?: SoilRecord;
}

function finite(value: unknown, label: string): number {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`${label} must be finite.`);
  return number;
}

function positive(value: unknown, label: string): number {
  const number = finite(value, label);
  if (number <= 0) throw new Error(`${label} must be positive.`);
  return number;
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} must be a non-empty string.`);
  }
  return value.trim();
}

function recordString(value: unknown, fallback: string): string {
  if (value == null) return fallback;
  return typeof value === "string" ? value : Object.prototype.toString.call(value);
}

function normalizeGeometry(geometry: SoilRecord, resolver: UnitResolver) {
  const model = recordString(geometry.model, "circular");
  if (!DEEP_FOUNDATION_GEOMETRY_MODELS.includes(model)) {
    throw new Error(`Unsupported deep-foundation geometry model: ${model}.`);
  }
  if (model === "circular") {
    const diameter = positive(resolver.length(Number(geometry.diameter)), "geometry.diameter");
    return {
      model,
      diameter,
      equivalentDiameter: diameter,
      shaftPerimeter: Math.PI * diameter,
      baseArea: (Math.PI * diameter ** 2) / 4,
    };
  }
  return {
    model,
    diameter: null,
    equivalentDiameter: positive(
      resolver.length(Number(geometry.equivalentDiameter)),
      "geometry.equivalentDiameter",
    ),
    shaftPerimeter: positive(
      resolver.length(Number(geometry.shaftPerimeter)),
      "geometry.shaftPerimeter",
    ),
    baseArea: positive(resolver.area(Number(geometry.baseArea)), "geometry.baseArea"),
  };
}

function normalizePlacement(placement: SoilRecord, resolver: UnitResolver) {
  const headElevation = resolver.length(finite(placement.headElevation, "placement.headElevation"));
  const soilContactTopElevation = resolver.length(
    finite(placement.soilContactTopElevation, "placement.soilContactTopElevation"),
  );
  const toeElevation = resolver.length(finite(placement.toeElevation, "placement.toeElevation"));
  if (headElevation < soilContactTopElevation) {
    throw new Error("placement.headElevation must be at or above soilContactTopElevation.");
  }
  if (soilContactTopElevation <= toeElevation) {
    throw new Error("placement.soilContactTopElevation must be above toeElevation.");
  }
  return {
    x: resolver.length(finite(placement.x ?? 0, "placement.x")),
    y: resolver.length(finite(placement.y ?? 0, "placement.y")),
    headElevation,
    soilContactTopElevation,
    toeElevation,
    axis: "vertical-z" as const,
    pileLength: headElevation - toeElevation,
    soilContactLength: soilContactTopElevation - toeElevation,
  };
}

function normalizeConstruction(construction: SoilRecord | null) {
  if (!construction) {
    throw new Error("DeepFoundationModel construction data are required.");
  }
  const displacementClass = recordString(construction.displacementClass, "not-classified");
  if (!DEEP_FOUNDATION_DISPLACEMENT_CLASSES.includes(displacementClass)) {
    throw new Error(`Unsupported deep-foundation displacement class: ${displacementClass}.`);
  }
  return {
    installationMethod: requiredString(
      construction.installationMethod,
      "construction.installationMethod",
    ),
    structuralMaterial: requiredString(
      construction.structuralMaterial,
      "construction.structuralMaterial",
    ),
    displacementClass,
    baseCondition: requiredString(
      construction.baseCondition ?? "assigned",
      "construction.baseCondition",
    ),
    metadata: structuredClone((construction.metadata as SoilRecord | undefined) ?? {}),
  };
}

export class DeepFoundationModel {
  schemaVersion: string;
  id: string;
  name: string;
  elementType: string;
  geometry: ReturnType<typeof normalizeGeometry>;
  placement: ReturnType<typeof normalizePlacement>;
  construction: ReturnType<typeof normalizeConstruction>;
  units: UnitSystem;
  metadata: SoilRecord;

  constructor({
    id,
    name = null,
    elementType = "pile",
    geometry = {},
    placement = {},
    construction = null,
    units = null,
    metadata = {},
  }: DeepFoundationModelInput = {}) {
    if (!id) throw new Error("A DeepFoundationModel id is required.");
    if (!DEEP_FOUNDATION_ELEMENT_TYPES.includes(elementType)) {
      throw new Error(`Unsupported deep-foundation element type: ${elementType}.`);
    }
    assertExplicitUnitSystem(units, "DeepFoundationModel");
    const resolver = createUnitResolver(units, GEOTECHNICAL_INTERNAL_UNITS);
    this.schemaVersion = DEEP_FOUNDATION_MODEL_SCHEMA_VERSION;
    this.id = id;
    this.name = name ?? id;
    this.elementType = elementType;
    this.geometry = normalizeGeometry(geometry, resolver);
    this.placement = normalizePlacement(placement, resolver);
    this.construction = normalizeConstruction(construction);
    this.units = GEOTECHNICAL_INTERNAL_UNITS;
    this.metadata = {
      ...structuredClone(metadata),
      unitSystem: GEOTECHNICAL_INTERNAL_UNITS,
      sourceUnitSystem: resolver.sourceUnitSystem,
      localAxes: {
        z: "up-along-vertical-axis",
        axialForce: "positive-magnitude-with-direction-stored-by-load-scenario",
      },
    };
  }

  toJSON(): Record<string, unknown> {
    return {
      schemaVersion: this.schemaVersion,
      id: this.id,
      name: this.name,
      elementType: this.elementType,
      geometry: structuredClone(this.geometry),
      placement: structuredClone(this.placement),
      construction: structuredClone(this.construction),
      units: { ...this.units },
      metadata: structuredClone(this.metadata),
    };
  }
}
