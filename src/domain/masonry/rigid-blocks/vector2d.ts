import type { RigidBlockPoint2D, RigidBlockVector2D } from "./types.js";

export function add2d(a: RigidBlockVector2D, b: RigidBlockVector2D): RigidBlockVector2D {
  return { x: a.x + b.x, y: a.y + b.y };
}

export function subtract2d(a: RigidBlockPoint2D, b: RigidBlockPoint2D): RigidBlockVector2D {
  return { x: a.x - b.x, y: a.y - b.y };
}

export function scale2d(vector: RigidBlockVector2D, factor: number): RigidBlockVector2D {
  return { x: vector.x * factor, y: vector.y * factor };
}

export function dot2d(a: RigidBlockVector2D, b: RigidBlockVector2D): number {
  return a.x * b.x + a.y * b.y;
}

export function cross2d(a: RigidBlockVector2D, b: RigidBlockVector2D): number {
  return a.x * b.y - a.y * b.x;
}

export function norm2d(vector: RigidBlockVector2D): number {
  return Math.hypot(vector.x, vector.y);
}

export function normalize2d(vector: RigidBlockVector2D, label = "vector"): RigidBlockVector2D {
  const norm = norm2d(vector);
  if (!Number.isFinite(norm) || norm <= 0) {
    throw new Error(`${label} must have a finite positive norm.`);
  }
  return { x: vector.x / norm, y: vector.y / norm };
}

export function interpolate2d(
  a: RigidBlockPoint2D,
  b: RigidBlockPoint2D,
  ratio: number,
): RigidBlockPoint2D {
  return {
    x: a.x + ratio * (b.x - a.x),
    y: a.y + ratio * (b.y - a.y),
  };
}
