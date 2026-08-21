import type {
  RigidBlockPoint2D,
  RigidBlockVector2D,
} from "../../domain/masonry/rigid-blocks/types.js";
import { evaluateMasonryArchCurveAtStation } from "./geometry.js";
import type { MasonryArchAngleUnits, NormalizedMasonryArchGeometry } from "./types.js";

const GAUSS_NODES = [
  0.1834346424956498, 0.525532409916329, 0.7966664774136267, 0.9602898564975363,
] as const;
const GAUSS_WEIGHTS = [
  0.362683783378362, 0.3137066458778873, 0.2223810344533745, 0.1012285362903763,
] as const;
const STATION_TOLERANCE = 1e-12;

export type ExtradosTangentSide = "left" | "right";

/** Exact extrados geometry resolved at one normalized physical side-arc station. */
export interface ExtradosTangentAtStation {
  /** Normalized extrados side-arc station: 0 at the left springing and 1 at the right. */
  readonly normalizedSideArcStation: number;
  /** Corresponding physical station on the geometry reference curve. */
  readonly referenceCurveStation: number;
  readonly point: RigidBlockPoint2D;
  /** Exact unit tangent directed from the left springing toward the right springing. */
  readonly chainTangent: RigidBlockVector2D;
  /** Exact unit tangent directed from the contact point toward the selected external side. */
  readonly outwardTangent: RigidBlockVector2D;
  /** Side-unwrapped global angle of `outwardTangent`, in radians. */
  readonly outwardTangentAngle: number;
}

function integrateExtradosArcLength(
  geometry: NormalizedMasonryArchGeometry,
  start: number,
  end: number,
): number {
  if (end <= start) return 0;
  const midpoint = (start + end) / 2;
  const halfLength = (end - start) / 2;
  let result = 0;
  for (let index = 0; index < GAUSS_NODES.length; index += 1) {
    const offset = halfLength * GAUSS_NODES[index]!;
    const weight = halfLength * GAUSS_WEIGHTS[index]!;
    result +=
      weight *
      (evaluateMasonryArchCurveAtStation(geometry, midpoint - offset).arcLengthJacobian.extrados +
        evaluateMasonryArchCurveAtStation(geometry, midpoint + offset).arcLengthJacobian.extrados);
  }
  return result;
}

function referenceStationAtExtradosStation(
  geometry: NormalizedMasonryArchGeometry,
  normalizedStation: number,
): number {
  if (!Number.isFinite(normalizedStation)) {
    throw new Error("Extrados tangency station must be finite.");
  }
  if (normalizedStation < -STATION_TOLERANCE || normalizedStation > 1 + STATION_TOLERANCE) {
    throw new Error("Extrados tangency station must satisfy 0 <= station <= 1.");
  }
  const clamped = Math.min(1, Math.max(0, normalizedStation));
  if (clamped === 0) return 0;
  if (clamped === 1) return geometry.totalReferenceArcLength;
  if (geometry.referenceCurve === "extrados") {
    return clamped * geometry.totalReferenceArcLength;
  }
  const totalLength = integrateExtradosArcLength(geometry, 0, geometry.totalReferenceArcLength);
  const targetLength = clamped * totalLength;
  let lower = 0;
  let upper = geometry.totalReferenceArcLength;
  for (let iteration = 0; iteration < 64; iteration += 1) {
    const trial = (lower + upper) / 2;
    if (integrateExtradosArcLength(geometry, 0, trial) < targetLength) lower = trial;
    else upper = trial;
  }
  return (lower + upper) / 2;
}

function sideUnwrappedAngle(side: ExtradosTangentSide, vector: RigidBlockVector2D): number {
  const angle = Math.atan2(vector.y, vector.x);
  return side === "left" && angle > 0 ? angle - 2 * Math.PI : angle;
}

/**
 * Resolves the exact point and tangent of the actual extrados at a normalized physical side-arc
 * station. `side` selects the tangent direction that points away from the arch: opposite the
 * left-to-right chain tangent on the left and along it on the right. This is pure reference
 * geometry and does not constrain the nonlinear contact state.
 */
export function resolveExtradosTangentAtStation(
  geometry: NormalizedMasonryArchGeometry,
  side: ExtradosTangentSide,
  tangencyStation: number,
): ExtradosTangentAtStation {
  if (side !== "left" && side !== "right") {
    throw new Error(`Extrados tangent side must be left or right, received ${String(side)}.`);
  }
  const referenceCurveStation = referenceStationAtExtradosStation(geometry, tangencyStation);
  const sample = evaluateMasonryArchCurveAtStation(geometry, referenceCurveStation);
  const outwardTangent =
    side === "left"
      ? { x: -sample.chainTangent.x, y: -sample.chainTangent.y }
      : { ...sample.chainTangent };
  return {
    normalizedSideArcStation: Math.min(1, Math.max(0, tangencyStation)),
    referenceCurveStation,
    point: sample.extrados,
    chainTangent: sample.chainTangent,
    outwardTangent,
    outwardTangentAngle: sideUnwrappedAngle(side, outwardTangent),
  };
}

/**
 * Constructs a fixed global external-anchor point from a convenient reference tangency and free
 * branch length. Only the returned point belongs to the tendon input; the station and length are
 * not retained as kinematic constraints.
 */
export function externalAnchorPointFromExtradosTangency(
  geometry: NormalizedMasonryArchGeometry,
  side: ExtradosTangentSide,
  tangencyStation: number,
  branchLength: number,
): RigidBlockPoint2D {
  if (!Number.isFinite(branchLength) || branchLength <= 0) {
    throw new Error("branchLength must be finite and positive.");
  }
  const tangency = resolveExtradosTangentAtStation(geometry, side, tangencyStation);
  return {
    x: tangency.point.x + branchLength * tangency.outwardTangent.x,
    y: tangency.point.y + branchLength * tangency.outwardTangent.y,
  };
}

/**
 * Inverts a global outward-tangent angle to a normalized extrados side-arc station. The selected
 * side removes the crown ambiguity: left searches [0, 0.5], right searches [0.5, 1].
 */
export function extradosTangencyStationFromAngle(
  geometry: NormalizedMasonryArchGeometry,
  side: ExtradosTangentSide,
  tangentAngle: number,
  angleUnits: MasonryArchAngleUnits = "rad",
): number {
  if (!Number.isFinite(tangentAngle)) {
    throw new Error("Extrados tangent angle must be finite.");
  }
  if (angleUnits !== "deg" && angleUnits !== "rad") {
    throw new Error(
      `Extrados tangent angleUnits must be deg or rad, received ${String(angleUnits)}.`,
    );
  }
  const target = angleUnits === "deg" ? (tangentAngle * Math.PI) / 180 : tangentAngle;
  const startStation = side === "left" ? 0 : 0.5;
  const endStation = side === "left" ? 0.5 : 1;
  const startAngle = resolveExtradosTangentAtStation(
    geometry,
    side,
    startStation,
  ).outwardTangentAngle;
  const endAngle = resolveExtradosTangentAtStation(geometry, side, endStation).outwardTangentAngle;
  const minimum = Math.min(startAngle, endAngle);
  const maximum = Math.max(startAngle, endAngle);
  const angleTolerance = 1e-12;
  if (target < minimum - angleTolerance || target > maximum + angleTolerance) {
    throw new Error(
      `Extrados tangent angle is outside the admissible ${side}-side range [${minimum}, ${maximum}] radians.`,
    );
  }
  if (Math.abs(target - startAngle) <= angleTolerance) return startStation;
  if (Math.abs(target - endAngle) <= angleTolerance) return endStation;

  let lower = startStation;
  let upper = endStation;
  const increasing = endAngle > startAngle;
  for (let iteration = 0; iteration < 64; iteration += 1) {
    const trial = (lower + upper) / 2;
    const angle = resolveExtradosTangentAtStation(geometry, side, trial).outwardTangentAngle;
    if (angle < target === increasing) lower = trial;
    else upper = trial;
  }
  return (lower + upper) / 2;
}

/**
 * Derives a fixed external anchor point from a point, a global direction, and a physical branch
 * length. This general pure geometry helper does not create an arch-side device.
 */
export function externalAnchorPointFromDirectionAndLength(
  terminalPoint: RigidBlockPoint2D,
  direction: RigidBlockVector2D,
  branchLength: number,
): RigidBlockPoint2D {
  for (const [label, value] of [
    ["terminalPoint.x", terminalPoint.x],
    ["terminalPoint.y", terminalPoint.y],
    ["direction.x", direction.x],
    ["direction.y", direction.y],
    ["branchLength", branchLength],
  ] as const) {
    if (!Number.isFinite(value)) {
      throw new Error(`${label} must be finite.`);
    }
  }
  if (branchLength <= 0) {
    throw new Error("branchLength must be positive.");
  }
  const directionNorm = Math.hypot(direction.x, direction.y);
  if (directionNorm <= 0) {
    throw new Error("direction must have positive magnitude.");
  }
  return {
    x: terminalPoint.x + (branchLength * direction.x) / directionNorm,
    y: terminalPoint.y + (branchLength * direction.y) / directionNorm,
  };
}
