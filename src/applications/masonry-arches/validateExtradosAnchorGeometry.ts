import type {
  RigidBlockPoint2D,
  RigidBlockVector2D,
} from "../../domain/masonry/rigid-blocks/types.js";
import { normalize2d } from "../../domain/masonry/rigid-blocks/vector2d.js";
import type {
  MasonryArchReferenceCurve,
  NormalizedMasonryArchGeometry,
  NormalizedMasonryArchProfile,
} from "./types.js";

/**
 * Geometric validation of extrados reinforcement terminals.
 *
 * Two independent invariants are enforced before any nonlinear continuation:
 *
 * 1. Terminal order — for the simplified-symmetric arch, "left" and "right" are geometric sides:
 *    the resolved left terminal must not lie geometrically right of the right terminal
 *    (numerical tolerance only; a shared x-coordinate, as in vertical terminal branches, is
 *    allowed).
 *
 * 2. External-anchor placement — an extrados external anchor must lie outside the masonry body,
 *    and its straight free branch to the first resolved contact must not travel through the
 *    masonry. The masonry body is the normal-offset band of the reference curve between the two
 *    springing joints, evaluated from the same normalized-profile parameterization the geometry
 *    builder uses (circular and elliptical). Penetrations smaller than the polygonal sagitta of
 *    the unilateral-contact discretization are accepted as an inherent discretization
 *    characteristic; deeper penetrations are rejected.
 */

const PROJECTION_SCAN_COUNT = 32;
const PROJECTION_REFINEMENT_ITERATIONS = 64;
const BRANCH_MAX_DEPTH = 24;
/** Branch sampling resolution: relative to one thickness. */
const BRANCH_SAMPLE_SPACING_FACTOR = 1e-2;
const ANGLE_TOLERANCE = 1e-12;

interface ReferenceFrame {
  readonly point: RigidBlockPoint2D;
  readonly tangent: RigidBlockVector2D;
  readonly outwardNormal: RigidBlockVector2D;
}

interface BandBounds {
  /** Signed offset of the intrados boundary from the reference point along the outward normal. */
  readonly intrados: number;
  /** Signed offset of the extrados boundary from the reference point along the outward normal. */
  readonly extrados: number;
}

function bandBounds(referenceCurve: MasonryArchReferenceCurve, thickness: number): BandBounds {
  if (referenceCurve === "intrados") {
    return { intrados: 0, extrados: thickness };
  }
  if (referenceCurve === "centerline") {
    return { intrados: -thickness / 2, extrados: thickness / 2 };
  }
  return { intrados: -thickness, extrados: 0 };
}

function profileFrame(profile: NormalizedMasonryArchProfile, parameter: number): ReferenceFrame {
  if (profile.type === "circular") {
    const point = {
      x: profile.radius * Math.sin(parameter),
      y: profile.center.y + profile.radius * Math.cos(parameter),
    };
    const tangent = normalize2d(
      { x: profile.radius * Math.cos(parameter), y: -profile.radius * Math.sin(parameter) },
      "Circular arch tangent",
    );
    return { point, tangent, outwardNormal: { x: -tangent.y, y: tangent.x } };
  }
  const point = {
    x: profile.semiAxisX * Math.sin(parameter),
    y:
      profile.semiAxisY * Math.cos(parameter) - profile.semiAxisY * Math.cos(profile.halfParameter),
  };
  const tangent = normalize2d(
    {
      x: profile.semiAxisX * Math.cos(parameter),
      y: -profile.semiAxisY * Math.sin(parameter),
    },
    "Elliptical arch tangent",
  );
  return { point, tangent, outwardNormal: { x: -tangent.y, y: tangent.x } };
}

/** Parameter bounds of the reference curve: [startParameter, endParameter]. */
function parameterSpan(profile: NormalizedMasonryArchProfile): {
  readonly start: number;
  readonly end: number;
} {
  if (profile.type === "circular") {
    return { start: -profile.halfAngle, end: profile.halfAngle };
  }
  return { start: -profile.halfParameter, end: profile.halfParameter };
}

/**
 * Projects a point onto the reference curve of the supported simplified-symmetric arch. Circular
 * profiles project analytically; elliptical profiles use a coarse scan plus golden-section
 * refinement on the profile parameter. Returns the nearest parameter and the reference frame.
 */
function projectPoint(
  geometry: NormalizedMasonryArchGeometry,
  point: RigidBlockPoint2D,
): { readonly parameter: number; readonly frame: ReferenceFrame } {
  const profile = geometry.profile;
  const span = parameterSpan(profile);
  if (profile.type === "circular") {
    // The circular profile parameter is measured from the vertical (crown) axis: the point is
    // (R * sin(parameter), centerY + R * cos(parameter)).
    const angle = Math.atan2(point.x, point.y - profile.center.y);
    const parameter = Math.min(span.end, Math.max(span.start, angle));
    return { parameter, frame: profileFrame(profile, parameter) };
  }
  const distanceAt = (parameter: number): number => {
    const frame = profileFrame(profile, parameter);
    return Math.hypot(point.x - frame.point.x, point.y - frame.point.y);
  };
  let best = span.start;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let index = 0; index <= PROJECTION_SCAN_COUNT; index += 1) {
    const parameter = span.start + ((span.end - span.start) * index) / PROJECTION_SCAN_COUNT;
    const distance = distanceAt(parameter);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = parameter;
    }
  }
  let lower = Math.max(span.start, best - (span.end - span.start) / PROJECTION_SCAN_COUNT);
  let upper = Math.min(span.end, best + (span.end - span.start) / PROJECTION_SCAN_COUNT);
  const golden = (Math.sqrt(5) - 1) / 2;
  let left = upper - golden * (upper - lower);
  let right = lower + golden * (upper - lower);
  let leftDistance = distanceAt(left);
  let rightDistance = distanceAt(right);
  for (let iteration = 0; iteration < PROJECTION_REFINEMENT_ITERATIONS; iteration += 1) {
    if (leftDistance <= rightDistance) {
      upper = right;
      right = left;
      rightDistance = leftDistance;
      left = upper - golden * (upper - lower);
      leftDistance = distanceAt(left);
    } else {
      lower = left;
      left = right;
      leftDistance = rightDistance;
      right = lower + golden * (upper - lower);
      rightDistance = distanceAt(right);
    }
  }
  const parameter = (lower + upper) / 2;
  return { parameter, frame: profileFrame(profile, parameter) };
}

/**
 * True when the point lies strictly inside the masonry body. The masonry body is the normal-offset
 * band of the reference curve between the two springing joints (the joints are normal cuts of the
 * curve, exactly as the geometry builder constructs them).
 */
function pointInsideMasonry(
  geometry: NormalizedMasonryArchGeometry,
  point: RigidBlockPoint2D,
  tolerance: number,
): boolean {
  const profile = geometry.profile;
  const span = parameterSpan(profile);
  const { parameter, frame } = projectPoint(geometry, point);
  const bounds = bandBounds(geometry.referenceCurve, geometry.thickness);
  const offset =
    (point.x - frame.point.x) * frame.outwardNormal.x +
    (point.y - frame.point.y) * frame.outwardNormal.y;
  const nearStart = parameter - span.start <= ANGLE_TOLERANCE;
  const nearEnd = span.end - parameter <= ANGLE_TOLERANCE;
  if (nearStart) {
    const longitudinal =
      (point.x - frame.point.x) * frame.tangent.x + (point.y - frame.point.y) * frame.tangent.y;
    if (longitudinal < -tolerance) return false;
  } else if (nearEnd) {
    const longitudinal =
      (point.x - frame.point.x) * frame.tangent.x + (point.y - frame.point.y) * frame.tangent.y;
    if (longitudinal > tolerance) return false;
  }
  return offset > bounds.intrados + tolerance && offset < bounds.extrados - tolerance;
}

/** Minimum radius of curvature of the inner (intrados-side) boundary of the masonry band. */
function minimumInnerRadius(geometry: NormalizedMasonryArchGeometry): number {
  const profile = geometry.profile;
  const bounds = bandBounds(geometry.referenceCurve, geometry.thickness);
  if (profile.type === "circular") {
    return profile.radius + bounds.intrados;
  }
  const radius = (parameter: number): number => {
    const term =
      profile.semiAxisX ** 2 * Math.sin(parameter) ** 2 +
      profile.semiAxisY ** 2 * Math.cos(parameter) ** 2;
    return term ** 1.5 / (profile.semiAxisX * profile.semiAxisY);
  };
  return (
    Math.min(radius(0), radius(profile.halfParameter), radius(-profile.halfParameter)) +
    bounds.intrados
  );
}

/** True when the straight segment passes strictly inside the masonry body. */
function segmentCrossesMasonry(
  geometry: NormalizedMasonryArchGeometry,
  start: RigidBlockPoint2D,
  end: RigidBlockPoint2D,
  tolerance: number,
): boolean {
  const length = Math.hypot(end.x - start.x, end.y - start.y);
  const spacing = BRANCH_SAMPLE_SPACING_FACTOR * Math.max(1, geometry.thickness);
  const evaluate = (ratio: number): boolean =>
    pointInsideMasonry(
      geometry,
      { x: start.x + ratio * (end.x - start.x), y: start.y + ratio * (end.y - start.y) },
      tolerance,
    );
  const inspect = (lower: number, upper: number, depth: number): boolean => {
    if (evaluate(lower) || evaluate(upper)) return true;
    if (length * (upper - lower) <= spacing || depth >= BRANCH_MAX_DEPTH) return false;
    const midpoint = (lower + upper) / 2;
    return inspect(lower, midpoint, depth + 1) || inspect(midpoint, upper, depth + 1);
  };
  return inspect(0, 1, 0);
}

/**
 * Validates the geometric order of an open tendon's terminals: the left terminal must lie
 * geometrically left of (or on the same x-coordinate as) the right terminal. `left`/`right` are
 * physical sides of the simplified-symmetric arch, not arbitrary labels.
 */
export function validateOpenTendonTerminalOrder(
  geometry: NormalizedMasonryArchGeometry,
  reinforcementId: string,
  leftPoint: RigidBlockPoint2D,
  rightPoint: RigidBlockPoint2D,
): void {
  const tolerance = 1e-9 * Math.max(1, geometry.totalReferenceArcLength);
  if (leftPoint.x > rightPoint.x + tolerance) {
    throw new Error(
      `Reinforcement ${reinforcementId} left termination must lie geometrically left of the right termination (left x = ${leftPoint.x}, right x = ${rightPoint.x}).`,
    );
  }
}

/**
 * Validates one extrados external anchor and its resolved free branch against the masonry body.
 * The branch is the straight segment from the fixed anchor to the adjacent resolved contact
 * point. Penetrations smaller than the contact discretization sagitta are accepted as an inherent
 * discretization characteristic.
 */
export function validateExtradosExternalAnchorGeometry(
  geometry: NormalizedMasonryArchGeometry,
  reinforcementId: string,
  side: "left" | "right",
  anchorPoint: RigidBlockPoint2D,
  adjacentContactPoint: RigidBlockPoint2D,
  sideArcLength: number,
  segmentCount: number,
): void {
  const scale = Math.max(1, geometry.thickness, geometry.span);
  const anchorTolerance = 1e-9 * scale;
  if (pointInsideMasonry(geometry, anchorPoint, anchorTolerance)) {
    throw new Error(
      `Reinforcement ${reinforcementId} ${side} external anchor (${anchorPoint.x}, ${anchorPoint.y}) lies inside the masonry body.`,
    );
  }
  const spacing = sideArcLength / segmentCount;
  const sagitta = spacing ** 2 / (8 * minimumInnerRadius(geometry));
  const branchTolerance = 1e-9 * scale + sagitta;
  if (segmentCrossesMasonry(geometry, anchorPoint, adjacentContactPoint, branchTolerance)) {
    throw new Error(
      `Reinforcement ${reinforcementId} ${side} free terminal branch crosses the masonry before reaching the extrados contact envelope.`,
    );
  }
}
