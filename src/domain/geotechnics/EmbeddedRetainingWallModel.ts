import {
  assertExplicitUnitSystem,
  createUnitResolver,
  type UnitSystemInput,
} from "../units/UnitSystem.js";
import { GEOTECHNICAL_INTERNAL_UNITS } from "./SoilMaterial.js";

export const EMBEDDED_RETAINING_WALL_MODEL_SCHEMA_VERSION = "embedded-retaining-wall-model/v1";

export const EMBEDDED_RETAINING_WALL_TYPES = Object.freeze([
  "continuous-wall-strip",
  "equivalent-beam-strip",
]);

export const EMBEDDED_RETAINING_WALL_END_RESTRAINTS = Object.freeze(["free", "fixed"]);

export type EmbeddedRetainingWallType = (typeof EMBEDDED_RETAINING_WALL_TYPES)[number];
export type EmbeddedRetainingWallEndRestraint =
  (typeof EMBEDDED_RETAINING_WALL_END_RESTRAINTS)[number];

export interface EmbeddedRetainingWallProvenance extends Record<string, unknown> {
  source: string;
}

export interface EmbeddedRetainingWallEndConditionInput {
  translation?: string;
  rotation?: string;
}

export interface EmbeddedRetainingWallEndCondition {
  translation: EmbeddedRetainingWallEndRestraint;
  rotation: EmbeddedRetainingWallEndRestraint;
}

export interface FlexuralRigiditySegmentInput {
  id?: string | number;
  topElevation: number;
  bottomElevation: number;
  flexuralRigidity: number;
  provenance: EmbeddedRetainingWallProvenance;
  metadata?: Record<string, unknown>;
}

export interface FlexuralRigiditySegment {
  id: string;
  topElevation: number;
  bottomElevation: number;
  flexuralRigidity: number;
  provenance: EmbeddedRetainingWallProvenance;
  metadata: Record<string, unknown>;
}

export interface EmbeddedRetainingWallModelOptions {
  id?: string;
  name?: string | null;
  type?: string;
  topElevation?: number;
  toeElevation?: number;
  analysisWidth?: number;
  flexuralRigiditySegments?: readonly FlexuralRigiditySegmentInput[];
  headCondition?: EmbeddedRetainingWallEndConditionInput | null;
  toeCondition?: EmbeddedRetainingWallEndConditionInput | null;
  units?: UnitSystemInput | null;
  metadata?: Record<string, unknown>;
}

export interface EmbeddedRetainingWallModelJson {
  schemaVersion: string;
  id: string;
  name: string;
  type: EmbeddedRetainingWallType;
  topElevation: number;
  toeElevation: number;
  analysisWidth: number;
  flexuralRigiditySegments: FlexuralRigiditySegment[];
  headCondition: EmbeddedRetainingWallEndCondition;
  toeCondition: EmbeddedRetainingWallEndCondition;
  units: typeof GEOTECHNICAL_INTERNAL_UNITS;
  metadata: Record<string, unknown>;
}

function finite(value: unknown, label: string): number {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    throw new Error(`${label} must be finite.`);
  }
  return number;
}

function positive(value: unknown, label: string): number {
  const number = finite(value, label);
  if (number <= 0) {
    throw new Error(`${label} must be positive.`);
  }
  return number;
}

function provenance(
  value: EmbeddedRetainingWallProvenance | null | undefined,
  label: string,
): EmbeddedRetainingWallProvenance {
  const normalized: Record<string, unknown> = structuredClone(value ?? {});
  if (typeof normalized.source !== "string" || !normalized.source.trim()) {
    throw new Error(`${label}.source is required.`);
  }
  const normalizedSource = normalized.source.trim();
  return {
    ...normalized,
    source: normalizedSource,
  };
}

function restraint(
  value: EmbeddedRetainingWallEndConditionInput | null | undefined,
  label: string,
): EmbeddedRetainingWallEndCondition {
  const translation = value?.translation ?? "free";
  const rotation = value?.rotation ?? "free";
  if (!EMBEDDED_RETAINING_WALL_END_RESTRAINTS.includes(translation)) {
    throw new Error(`${label}.translation must be free or fixed.`);
  }
  if (!EMBEDDED_RETAINING_WALL_END_RESTRAINTS.includes(rotation)) {
    throw new Error(`${label}.rotation must be free or fixed.`);
  }
  return {
    translation,
    rotation,
  };
}

function isFlexuralRigiditySegmentArray(
  value: unknown,
): value is readonly FlexuralRigiditySegmentInput[] {
  return Array.isArray(value);
}

export class EmbeddedRetainingWallModel {
  readonly schemaVersion: string;
  readonly id: string;
  readonly name: string;
  readonly type: EmbeddedRetainingWallType;
  readonly topElevation: number;
  readonly toeElevation: number;
  readonly analysisWidth: number;
  readonly flexuralRigiditySegments: FlexuralRigiditySegment[];
  readonly headCondition: EmbeddedRetainingWallEndCondition;
  readonly toeCondition: EmbeddedRetainingWallEndCondition;
  readonly units: typeof GEOTECHNICAL_INTERNAL_UNITS;
  readonly metadata: Record<string, unknown>;

  constructor({
    id,
    name = null,
    type = "continuous-wall-strip",
    topElevation,
    toeElevation,
    analysisWidth = 1,
    flexuralRigiditySegments = [],
    headCondition = null,
    toeCondition = null,
    units = null,
    metadata = {},
  }: EmbeddedRetainingWallModelOptions = {}) {
    if (!id) {
      throw new Error("An EmbeddedRetainingWallModel id is required.");
    }
    if (!EMBEDDED_RETAINING_WALL_TYPES.includes(type)) {
      throw new Error(`Unsupported embedded retaining-wall type: ${type}.`);
    }
    assertExplicitUnitSystem(units, "EmbeddedRetainingWallModel");
    const resolver = createUnitResolver(units, GEOTECHNICAL_INTERNAL_UNITS);
    const top = resolver.length(finite(topElevation, "topElevation"));
    const toe = resolver.length(finite(toeElevation, "toeElevation"));
    if (top <= toe) {
      throw new Error("Embedded wall topElevation must exceed toeElevation.");
    }
    const runtimeSegments: unknown = flexuralRigiditySegments;
    if (!isFlexuralRigiditySegmentArray(runtimeSegments) || runtimeSegments.length === 0) {
      throw new Error("EmbeddedRetainingWallModel requires flexuralRigiditySegments.");
    }
    const segments = runtimeSegments
      .map((segment, index) => ({
        id: String(segment.id ?? `wall-section-${index + 1}`),
        topElevation: resolver.length(
          finite(segment.topElevation, `flexuralRigiditySegments[${index}].topElevation`),
        ),
        bottomElevation: resolver.length(
          finite(segment.bottomElevation, `flexuralRigiditySegments[${index}].bottomElevation`),
        ),
        flexuralRigidity: positive(
          resolver.convert(
            finite(segment.flexuralRigidity, `flexuralRigiditySegments[${index}].flexuralRigidity`),
            { forceExponent: 1, lengthExponent: 2 },
          ),
          `flexuralRigiditySegments[${index}].flexuralRigidity`,
        ),
        provenance: provenance(segment.provenance, `flexuralRigiditySegments[${index}].provenance`),
        metadata: structuredClone(segment.metadata ?? {}),
      }))
      .sort((left, right) => right.topElevation - left.topElevation);
    const tolerance = 1e-10 * Math.max(1, Math.abs(top), Math.abs(toe));
    const firstSegment = segments[0];
    const lastSegment = segments.at(-1);
    if (
      !firstSegment ||
      !lastSegment ||
      Math.abs(firstSegment.topElevation - top) > tolerance ||
      Math.abs(lastSegment.bottomElevation - toe) > tolerance
    ) {
      throw new Error("Flexural-rigidity segments must cover the wall from top to toe.");
    }
    for (let index = 0; index < segments.length; index += 1) {
      const segment = segments[index];
      if (!segment) {
        throw new Error("EmbeddedRetainingWallModel section is unavailable.");
      }
      if (segment.topElevation <= segment.bottomElevation) {
        throw new Error("Wall section top must be above its bottom.");
      }
      const previous = segments[index - 1];
      if (
        index > 0 &&
        previous &&
        Math.abs(previous.bottomElevation - segment.topElevation) > tolerance
      ) {
        throw new Error("Flexural-rigidity segments must be contiguous and non-overlapping.");
      }
    }

    this.schemaVersion = EMBEDDED_RETAINING_WALL_MODEL_SCHEMA_VERSION;
    this.id = String(id);
    this.name = name ?? this.id;
    this.type = type;
    this.topElevation = top;
    this.toeElevation = toe;
    this.analysisWidth = positive(resolver.length(analysisWidth), "analysisWidth");
    this.flexuralRigiditySegments = segments;
    this.headCondition = restraint(headCondition, "headCondition");
    this.toeCondition = restraint(toeCondition, "toeCondition");
    this.units = GEOTECHNICAL_INTERNAL_UNITS;
    this.metadata = {
      ...structuredClone(metadata ?? {}),
      unitSystem: GEOTECHNICAL_INTERNAL_UNITS,
      sourceUnitSystem: resolver.sourceUnitSystem,
      axisConvention: {
        verticalCoordinate: "elevation z positive upward",
        localDepth: "positive downward from wall top",
        wallDisplacement: "positive from retained side toward excavation side",
      },
    };
  }

  flexuralRigidityAtElevation(elevation: number): FlexuralRigiditySegment {
    const z = finite(elevation, "elevation");
    const tolerance = 1e-10 * Math.max(1, Math.abs(z));
    const segment = this.flexuralRigiditySegments.find(
      (candidate) =>
        z <= candidate.topElevation + tolerance && z >= candidate.bottomElevation - tolerance,
    );
    if (!segment) {
      throw new Error(`Elevation ${z} lies outside embedded wall ${this.id}.`);
    }
    return segment;
  }

  toJSON(): EmbeddedRetainingWallModelJson {
    return {
      schemaVersion: this.schemaVersion,
      id: this.id,
      name: this.name,
      type: this.type,
      topElevation: this.topElevation,
      toeElevation: this.toeElevation,
      analysisWidth: this.analysisWidth,
      flexuralRigiditySegments: structuredClone(this.flexuralRigiditySegments),
      headCondition: { ...this.headCondition },
      toeCondition: { ...this.toeCondition },
      units: { ...this.units },
      metadata: structuredClone(this.metadata),
    };
  }
}
