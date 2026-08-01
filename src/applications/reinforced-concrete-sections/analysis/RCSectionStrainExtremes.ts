import type { ReinforcedConcreteSection } from "../../../domain/geometry/ReinforcedConcreteSection.js";
import type { AffineStrainField, StrainFieldLike } from "./types.js";

const TWO_PI = 2 * Math.PI;
const ANGLE_TOLERANCE = 1e-14;

function hasStrainFieldCoefficients(
  strainField: StrainFieldLike | null | undefined,
): strainField is AffineStrainField {
  return (
    strainField != null &&
    Number.isFinite(strainField.eps0) &&
    Number.isFinite(strainField.kappaY) &&
    Number.isFinite(strainField.kappaZ)
  );
}

function strainAtPoint(strainField: StrainFieldLike, point: { y: number; z: number }): number {
  if (!Number.isFinite(point.y) || !Number.isFinite(point.z)) {
    throw new Error("StrainField strainAt requires finite y and z coordinates.");
  }

  if (hasStrainFieldCoefficients(strainField)) {
    return strainField.eps0 + strainField.kappaY * point.z - strainField.kappaZ * point.y;
  }

  if (typeof strainField.strainAt !== "function") {
    throw new Error("StrainField strainAt requires a strain field.");
  }

  return strainField.strainAt(point);
}

export function normalizeNeutralAxisAngle(theta: number): number {
  if (!Number.isFinite(theta)) {
    throw new Error("Neutral-axis theta must be finite.");
  }

  let normalized = theta % TWO_PI;

  if (normalized < 0) {
    normalized += TWO_PI;
  }

  if (Math.abs(normalized) <= ANGLE_TOLERANCE || Math.abs(normalized - TWO_PI) <= ANGLE_TOLERANCE) {
    return 0;
  }

  for (const cardinal of [Math.PI / 2, Math.PI, (3 * Math.PI) / 2]) {
    if (Math.abs(normalized - cardinal) <= ANGLE_TOLERANCE) {
      return cardinal;
    }
  }

  return Number(normalized.toPrecision(15));
}

export interface NeutralAxisDirection {
  theta: number;
  cos: number;
  sin: number;
}

export function neutralAxisDirection(theta: number): NeutralAxisDirection {
  const normalizedTheta = normalizeNeutralAxisAngle(theta);
  const cos = Math.cos(normalizedTheta);
  const sin = Math.sin(normalizedTheta);

  return {
    theta: normalizedTheta,
    cos: Math.abs(cos) <= ANGLE_TOLERANCE ? 0 : cos,
    sin: Math.abs(sin) <= ANGLE_TOLERANCE ? 0 : sin,
  };
}

export function projectionAt(theta: number, { y, z }: { y: number; z: number }): number {
  const direction = neutralAxisDirection(theta);
  return y * direction.cos - z * direction.sin;
}

export interface ProjectedPoint {
  y: number;
  z: number;
  projection: number;
}

export interface ConcreteProjectedBounds {
  minimum: ProjectedPoint;
  maximum: ProjectedPoint;
  points: ProjectedPoint[];
}

export function getConcreteProjectedBounds(
  section: ReinforcedConcreteSection,
  theta: number,
): ConcreteProjectedBounds {
  if (!section?.concreteSection) {
    throw new Error("getConcreteProjectedBounds requires a reinforced concrete section.");
  }

  if (!Number.isFinite(theta)) {
    throw new Error("getConcreteProjectedBounds requires a finite theta.");
  }

  const outlinePoints = section.getConcreteOutlinePoints();

  if (outlinePoints.length < 3) {
    throw new Error("getConcreteProjectedBounds requires at least three concrete outline points.");
  }

  const projectedPoints = outlinePoints.map((point) => ({
    ...point,
    projection: projectionAt(theta, point),
  }));
  const first = projectedPoints[0];

  if (first === undefined) {
    throw new Error("getConcreteProjectedBounds requires at least three concrete outline points.");
  }

  return {
    minimum: projectedPoints.reduce((current, point) =>
      point.projection < current.projection ? point : current,
    ),
    maximum: projectedPoints.reduce((current, point) =>
      point.projection > current.projection ? point : current,
    ),
    points: projectedPoints,
  };
}

export interface ConcreteStrainPoint {
  y: number;
  z: number;
  strain: number;
}

export interface ConcreteStrainExtremes {
  minimum: ConcreteStrainPoint;
  maximum: ConcreteStrainPoint;
  compression: ConcreteStrainPoint & { demand: number };
  tension: ConcreteStrainPoint & { demand: number };
  points: ConcreteStrainPoint[];
}

export function resolveConcreteStrainExtremes({
  section,
  strainField,
}: {
  section: ReinforcedConcreteSection;
  strainField: StrainFieldLike;
}): ConcreteStrainExtremes {
  if (!hasStrainFieldCoefficients(strainField) && typeof strainField.strainAt !== "function") {
    throw new Error("resolveConcreteStrainExtremes requires a strain field.");
  }

  const outlinePoints = section.getConcreteOutlinePoints();

  if (outlinePoints.length < 3) {
    throw new Error(
      "resolveConcreteStrainExtremes requires at least three concrete outline points.",
    );
  }

  const strainedPoints = outlinePoints.map((point) => ({
    ...point,
    strain: strainAtPoint(strainField, point),
  }));
  const first = strainedPoints[0];

  if (first === undefined) {
    throw new Error(
      "resolveConcreteStrainExtremes requires at least three concrete outline points.",
    );
  }

  const minimum = strainedPoints.reduce((current, point) =>
    point.strain < current.strain ? point : current,
  );
  const maximum = strainedPoints.reduce((current, point) =>
    point.strain > current.strain ? point : current,
  );

  return {
    minimum,
    maximum,
    compression: {
      ...minimum,
      demand: Math.max(0, -minimum.strain),
    },
    tension: {
      ...maximum,
      demand: Math.max(0, maximum.strain),
    },
    points: strainedPoints,
  };
}
