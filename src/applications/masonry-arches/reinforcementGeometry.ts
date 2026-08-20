import type {
  RigidBlockPoint2D,
  RigidBlockVector2D,
} from "../../domain/masonry/rigid-blocks/types.js";

/**
 * Derives a fixed external anchor point from an arch-side terminal point, a global direction, and
 * a physical free-branch length. This is a pure input helper: the returned point, not the direction
 * or length, belongs to the tendon mechanics contract.
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
