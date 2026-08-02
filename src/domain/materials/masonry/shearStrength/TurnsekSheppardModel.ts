// Mechanical TypeScript migration from strutture-js 6f33baead8b88166c4b2cf94af41763412e3c751;
// source path: src/domain/materials/masonry/shearStrength/TurnsekSheppardModel.js.

import {
  assertExplicitUnitSystem,
  createUnitResolver,
  type UnitSystem,
  type UnitSystemInput,
} from "../../../units/UnitSystem.js";
import type {
  MasonryShearStrengthContext,
  MasonryShearStrengthEvaluation,
  MasonryShearStrengthModel,
} from "./MohrCoulombModel.js";

const INTERNAL_UNITS = Object.freeze({ force: "kN", length: "m" });

export interface TurnsekSheppardModelInput {
  id?: string | null;
  type?: string;
  units?: UnitSystemInput | null | undefined;
  tensileStrength?: number | null | undefined;
  shearStressDistributionFactor?: number | undefined;
  damageCoefficient?: number | undefined;
  crushingReductionCoefficient?: number | undefined;
  metadata?: Record<string, unknown>;
}

export interface TurnsekSheppardModelJson {
  id: string | null;
  type: string;
  units: UnitSystem;
  tensileStrength: number;
  shearStressDistributionFactor: number;
  damageCoefficient: number;
  crushingReductionCoefficient: number;
  metadata: Record<string, unknown>;
}

function assertPositive(value: number | null | undefined, label: string): asserts value is number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new Error(`TurnsekSheppardModel requires a positive ${label}.`);
  }
}

function assertNonNegative(
  value: number | null | undefined,
  label: string,
): asserts value is number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(`TurnsekSheppardModel requires a non-negative ${label}.`);
  }
}

function clamp(value: number, minimum = 0, maximum = 1): number {
  return Math.max(minimum, Math.min(maximum, value));
}

/**
 * Replaceable diagonal-tension strength strategy.
 *
 * V_DT = t*l_c*ft/b*sqrt(1 + sigma_c/ft),
 * sigma_c = max(N_c, 0)/(t*l_c).
 *
 * The shear-stress distribution factor b is deliberately explicit: no code or
 * slenderness rule is embedded in this domain strategy.
 */
export class TurnsekSheppardModel implements MasonryShearStrengthModel {
  declare readonly id: string | null;
  declare readonly type: string;
  declare readonly units: UnitSystem;
  declare readonly tensileStrength: number;
  declare readonly shearStressDistributionFactor: number;
  declare readonly damageCoefficient: number;
  declare readonly crushingReductionCoefficient: number;
  declare readonly metadata: Record<string, unknown>;

  constructor({
    id = null,
    units = null,
    tensileStrength,
    shearStressDistributionFactor,
    damageCoefficient = 1,
    crushingReductionCoefficient = 0,
    metadata = {},
  }: TurnsekSheppardModelInput = {}) {
    assertExplicitUnitSystem(units, "TurnsekSheppardModel");
    const resolver = createUnitResolver(units, INTERNAL_UNITS);

    this.id = id;
    this.type = "turnsek-sheppard";
    this.units = resolver.targetUnitSystem;
    this.tensileStrength = resolver.stress(tensileStrength)!;
    this.shearStressDistributionFactor = shearStressDistributionFactor!;
    this.damageCoefficient = damageCoefficient;
    this.crushingReductionCoefficient = crushingReductionCoefficient;
    this.metadata = {
      ...metadata,
      unitSystem: resolver.targetUnitSystem,
      sourceUnitSystem: metadata.sourceUnitSystem ?? resolver.sourceUnitSystem,
      calibrationRequired: true,
    };

    assertPositive(this.tensileStrength, "tensileStrength");
    assertPositive(this.shearStressDistributionFactor, "shearStressDistributionFactor");
    assertNonNegative(this.damageCoefficient, "damageCoefficient");
    assertNonNegative(this.crushingReductionCoefficient, "crushingReductionCoefficient");
  }

  evaluate({
    currentAxialCompression = 0,
    compressedLength = 0,
    thickness,
    shearDamage = 0,
    compressionDamage = 0,
  }: MasonryShearStrengthContext = {}): MasonryShearStrengthEvaluation {
    assertPositive(thickness, "context thickness");

    const effectiveLength = Math.max(0, compressedLength);
    const effectiveArea = thickness * effectiveLength;
    const compression = Math.max(0, currentAxialCompression);

    if (effectiveArea === 0) {
      return {
        type: this.type,
        capacity: 0,
        effectiveArea,
        effectiveLength,
        compression,
        compressiveStress: 0,
        damageFactor: 0,
      };
    }

    const compressiveStress = compression / effectiveArea;
    const undamagedCapacity =
      ((effectiveArea * this.tensileStrength) / this.shearStressDistributionFactor) *
      Math.sqrt(1 + compressiveStress / this.tensileStrength);
    const damageFactor = clamp(
      (1 - this.damageCoefficient * clamp(shearDamage)) *
        (1 - this.crushingReductionCoefficient * clamp(compressionDamage)),
    );

    return {
      type: this.type,
      capacity: undamagedCapacity * damageFactor,
      undamagedCapacity,
      effectiveArea,
      effectiveLength,
      compression,
      compressiveStress,
      damageFactor,
      tensileStrength: this.tensileStrength,
      shearStressDistributionFactor: this.shearStressDistributionFactor,
    };
  }

  clone(): TurnsekSheppardModel {
    return new TurnsekSheppardModel(this.toJSON());
  }

  toJSON(): TurnsekSheppardModelJson {
    return {
      id: this.id,
      type: this.type,
      units: { ...this.units },
      tensileStrength: this.tensileStrength,
      shearStressDistributionFactor: this.shearStressDistributionFactor,
      damageCoefficient: this.damageCoefficient,
      crushingReductionCoefficient: this.crushingReductionCoefficient,
      metadata: { ...this.metadata },
    };
  }
}
