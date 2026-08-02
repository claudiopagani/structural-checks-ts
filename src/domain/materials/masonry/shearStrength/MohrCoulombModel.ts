// Mechanical TypeScript migration from strutture-js 6f33baead8b88166c4b2cf94af41763412e3c751;
// source path: src/domain/materials/masonry/shearStrength/MohrCoulombModel.js.

import {
  assertExplicitUnitSystem,
  createUnitResolver,
  type UnitSystem,
  type UnitSystemInput,
} from "../../../units/UnitSystem.js";

const INTERNAL_UNITS = Object.freeze({ force: "kN", length: "m" });

export interface MasonryShearStrengthContext {
  currentAxialCompression?: number;
  compressedLength?: number;
  thickness?: number;
  shearDamage?: number;
  compressionDamage?: number;
}

export interface MasonryShearStrengthEvaluation {
  type: string;
  [key: string]: number | string;
}

export interface MasonryShearStrengthModel {
  readonly type?: string;
  evaluate(context?: MasonryShearStrengthContext): MasonryShearStrengthEvaluation;
  clone?(): MasonryShearStrengthModel;
  toJSON?(): object;
}

export interface MohrCoulombModelInput {
  id?: string | null;
  type?: string;
  units?: UnitSystemInput | null | undefined;
  cohesion?: number | null | undefined;
  frictionCoefficient?: number | undefined;
  cohesionDamageCoefficient?: number | undefined;
  frictionDamageCoefficient?: number | undefined;
  metadata?: Record<string, unknown>;
}

export interface MohrCoulombModelJson {
  id: string | null;
  type: string;
  units: UnitSystem;
  cohesion: number;
  frictionCoefficient: number;
  cohesionDamageCoefficient: number;
  frictionDamageCoefficient: number;
  metadata: Record<string, unknown>;
}

function assertPositive(value: number | null | undefined, label: string): asserts value is number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new Error(`MohrCoulombModel requires a positive ${label}.`);
  }
}

function assertNonNegative(
  value: number | null | undefined,
  label: string,
): asserts value is number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(`MohrCoulombModel requires a non-negative ${label}.`);
  }
}

function clamp(value: number, minimum = 0, maximum = 1): number {
  return Math.max(minimum, Math.min(maximum, value));
}

/** Generic Mohr-Coulomb alternative for the diagonal/shear strength slot. */
export class MohrCoulombModel implements MasonryShearStrengthModel {
  declare readonly id: string | null;
  declare readonly type: string;
  declare readonly units: UnitSystem;
  declare readonly cohesion: number;
  declare readonly frictionCoefficient: number;
  declare readonly cohesionDamageCoefficient: number;
  declare readonly frictionDamageCoefficient: number;
  declare readonly metadata: Record<string, unknown>;

  constructor({
    id = null,
    units = null,
    cohesion,
    frictionCoefficient,
    cohesionDamageCoefficient = 1,
    frictionDamageCoefficient = 0,
    metadata = {},
  }: MohrCoulombModelInput = {}) {
    assertExplicitUnitSystem(units, "MohrCoulombModel");
    const resolver = createUnitResolver(units, INTERNAL_UNITS);

    this.id = id;
    this.type = "mohr-coulomb";
    this.units = resolver.targetUnitSystem;
    this.cohesion = resolver.stress(cohesion)!;
    this.frictionCoefficient = frictionCoefficient!;
    this.cohesionDamageCoefficient = cohesionDamageCoefficient;
    this.frictionDamageCoefficient = frictionDamageCoefficient;
    this.metadata = {
      ...metadata,
      unitSystem: resolver.targetUnitSystem,
      sourceUnitSystem: metadata.sourceUnitSystem ?? resolver.sourceUnitSystem,
      calibrationRequired: true,
    };

    assertPositive(this.cohesion, "cohesion");
    assertNonNegative(this.frictionCoefficient, "frictionCoefficient");
    assertNonNegative(this.cohesionDamageCoefficient, "cohesionDamageCoefficient");
    assertNonNegative(this.frictionDamageCoefficient, "frictionDamageCoefficient");
  }

  evaluate({
    currentAxialCompression = 0,
    compressedLength = 0,
    thickness,
    shearDamage = 0,
  }: MasonryShearStrengthContext = {}): MasonryShearStrengthEvaluation {
    assertPositive(thickness, "context thickness");
    const effectiveLength = Math.max(0, compressedLength);
    const effectiveArea = thickness * effectiveLength;
    const compression = Math.max(0, currentAxialCompression);
    const damage = clamp(shearDamage);
    const cohesionFactor = clamp(1 - this.cohesionDamageCoefficient * damage);
    const frictionFactor = clamp(1 - this.frictionDamageCoefficient * damage);
    const cohesionContribution = this.cohesion * cohesionFactor * effectiveArea;
    const frictionContribution = this.frictionCoefficient * frictionFactor * compression;
    const strengthDegradationFloor = frictionContribution;

    return {
      type: this.type,
      capacity: cohesionContribution + frictionContribution,
      cohesionContribution,
      frictionContribution,
      strengthDegradationFloor,
      effectiveArea,
      effectiveLength,
      compression,
      cohesionFactor,
      frictionFactor,
    };
  }

  clone(): MohrCoulombModel {
    return new MohrCoulombModel(this.toJSON());
  }

  toJSON(): MohrCoulombModelJson {
    return {
      id: this.id,
      type: this.type,
      units: { ...this.units },
      cohesion: this.cohesion,
      frictionCoefficient: this.frictionCoefficient,
      cohesionDamageCoefficient: this.cohesionDamageCoefficient,
      frictionDamageCoefficient: this.frictionDamageCoefficient,
      metadata: { ...this.metadata },
    };
  }
}
