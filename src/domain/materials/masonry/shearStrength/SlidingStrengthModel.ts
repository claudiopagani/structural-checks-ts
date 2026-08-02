// Mechanical TypeScript migration from strutture-js 6f33baead8b88166c4b2cf94af41763412e3c751;
// source path: src/domain/materials/masonry/shearStrength/SlidingStrengthModel.js.

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

export interface SlidingStrengthModelInput {
  id?: string | null;
  type?: string;
  units?: UnitSystemInput | null | undefined;
  cohesion?: number | null | undefined;
  frictionCoefficient?: number | undefined;
  residualCohesionRatio?: number | undefined;
  cohesionDamageCoefficient?: number | undefined;
  frictionDamageCoefficient?: number | undefined;
  metadata?: Record<string, unknown>;
}

export interface SlidingStrengthModelJson {
  id: string | null;
  type: string;
  units: UnitSystem;
  cohesion: number;
  frictionCoefficient: number;
  residualCohesionRatio: number;
  cohesionDamageCoefficient: number;
  frictionDamageCoefficient: number;
  metadata: Record<string, unknown>;
}

function assertPositive(value: number | null | undefined, label: string): asserts value is number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new Error(`SlidingStrengthModel requires a positive ${label}.`);
  }
}

function assertNonNegative(
  value: number | null | undefined,
  label: string,
): asserts value is number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(`SlidingStrengthModel requires a non-negative ${label}.`);
  }
}

function assertRatio(value: number | null | undefined, label: string): asserts value is number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`SlidingStrengthModel requires ${label} between 0 and 1.`);
  }
}

function clamp(value: number, minimum = 0, maximum = 1): number {
  return Math.max(minimum, Math.min(maximum, value));
}

/** V_SL = c_d*t*l_c + mu_d*max(N_c, 0). */
export class SlidingStrengthModel implements MasonryShearStrengthModel {
  declare readonly id: string | null;
  declare readonly type: string;
  declare readonly units: UnitSystem;
  declare readonly cohesion: number;
  declare readonly frictionCoefficient: number;
  declare readonly residualCohesionRatio: number;
  declare readonly cohesionDamageCoefficient: number;
  declare readonly frictionDamageCoefficient: number;
  declare readonly metadata: Record<string, unknown>;

  constructor({
    id = null,
    units = null,
    cohesion,
    frictionCoefficient,
    residualCohesionRatio = 0,
    cohesionDamageCoefficient = 1,
    frictionDamageCoefficient = 0,
    metadata = {},
  }: SlidingStrengthModelInput = {}) {
    assertExplicitUnitSystem(units, "SlidingStrengthModel");
    const resolver = createUnitResolver(units, INTERNAL_UNITS);

    this.id = id;
    this.type = "bed-joint-sliding";
    this.units = resolver.targetUnitSystem;
    this.cohesion = resolver.stress(cohesion)!;
    this.frictionCoefficient = frictionCoefficient!;
    this.residualCohesionRatio = residualCohesionRatio;
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
    assertRatio(this.residualCohesionRatio, "residualCohesionRatio");
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
    const residualCohesion = this.residualCohesionRatio * this.cohesion;
    const degradedCohesion = Math.max(
      residualCohesion,
      this.cohesion * (1 - this.cohesionDamageCoefficient * damage),
    );
    const degradedFriction =
      this.frictionCoefficient * clamp(1 - this.frictionDamageCoefficient * damage);
    const cohesionContribution = degradedCohesion * effectiveArea;
    const frictionContribution = degradedFriction * compression;
    const residualCohesionContribution = residualCohesion * effectiveArea;
    const strengthDegradationFloor = residualCohesionContribution + frictionContribution;

    return {
      type: this.type,
      capacity: cohesionContribution + frictionContribution,
      cohesionContribution,
      frictionContribution,
      residualCohesionContribution,
      strengthDegradationFloor,
      effectiveArea,
      effectiveLength,
      compression,
      degradedCohesion,
      degradedFriction,
    };
  }

  clone(): SlidingStrengthModel {
    return new SlidingStrengthModel(this.toJSON());
  }

  toJSON(): SlidingStrengthModelJson {
    return {
      id: this.id,
      type: this.type,
      units: { ...this.units },
      cohesion: this.cohesion,
      frictionCoefficient: this.frictionCoefficient,
      residualCohesionRatio: this.residualCohesionRatio,
      cohesionDamageCoefficient: this.cohesionDamageCoefficient,
      frictionDamageCoefficient: this.frictionDamageCoefficient,
      metadata: { ...this.metadata },
    };
  }
}
