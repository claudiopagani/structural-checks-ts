import { neutralAxisDirection } from "./RCSectionStrainExtremes.js";
import type { AffineStrainField, StrainFieldLike } from "./types.js";

export function createAffineStrainField({
  eps0 = 0,
  kappaY = 0,
  kappaZ = 0,
}: Partial<AffineStrainField> = {}): AffineStrainField {
  if (!Number.isFinite(eps0) || !Number.isFinite(kappaY) || !Number.isFinite(kappaZ)) {
    throw new Error("StrainField requires finite eps0, kappaY and kappaZ values.");
  }

  return { eps0, kappaY, kappaZ };
}

export function hasStrainFieldCoefficients(
  strainField: StrainFieldLike | null | undefined,
): strainField is AffineStrainField {
  return (
    strainField != null &&
    Number.isFinite(strainField.eps0) &&
    Number.isFinite(strainField.kappaY) &&
    Number.isFinite(strainField.kappaZ)
  );
}

export function strainAtPoint(
  strainField: StrainFieldLike,
  point: { y: number; z: number },
): number {
  if (!Number.isFinite(point.y) || !Number.isFinite(point.z)) {
    throw new Error("StrainField strainAt requires finite y and z coordinates.");
  }

  if (hasStrainFieldCoefficients(strainField)) {
    return strainField.eps0 + strainField.kappaY * point.z - strainField.kappaZ * point.y;
  }

  if (typeof strainField.strainAt === "function") {
    return strainField.strainAt(point);
  }

  throw new Error("StrainField strainAt requires a strain field.");
}

export class StrainField implements AffineStrainField {
  eps0: number;
  kappaY: number;
  kappaZ: number;

  constructor(options: Partial<AffineStrainField> = {}) {
    const coefficients = createAffineStrainField(options);

    this.eps0 = coefficients.eps0;
    this.kappaY = coefficients.kappaY;
    this.kappaZ = coefficients.kappaZ;
  }

  strainAt({ y, z }: { y: number; z: number }): number {
    return strainAtPoint(this, { y, z });
  }

  static fromNeutralAxis({
    theta,
    curvature,
    neutralAxisOffset = 0,
  }: {
    theta: number;
    curvature: number;
    neutralAxisOffset?: number;
  }): StrainField {
    if (
      !Number.isFinite(theta) ||
      !Number.isFinite(curvature) ||
      !Number.isFinite(neutralAxisOffset)
    ) {
      throw new Error(
        "StrainField.fromNeutralAxis requires finite theta, curvature and neutralAxisOffset.",
      );
    }

    const direction = neutralAxisDirection(theta);

    return new StrainField({
      eps0: -curvature * neutralAxisOffset,
      kappaY: -curvature * direction.sin,
      kappaZ: -curvature * direction.cos,
    });
  }
}
