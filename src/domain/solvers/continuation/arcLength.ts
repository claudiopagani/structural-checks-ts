import type { ArcLengthMetric } from "./types.js";

function scaleAt(metric: ArcLengthMetric, index: number): number {
  const scale = metric.displacementScales[index];
  if (scale === undefined || !Number.isFinite(scale) || scale <= 0) {
    throw new Error(`Arc-length displacement scale ${index} must be finite and positive.`);
  }
  return scale;
}

export function sphericalArcLengthNorm(
  displacementIncrement: readonly number[],
  lambdaIncrement: number,
  metric: ArcLengthMetric,
): number {
  if (displacementIncrement.length === 0) {
    throw new Error("Arc-length displacement increment cannot be empty.");
  }
  if (metric.displacementScales.length !== displacementIncrement.length) {
    throw new Error("Arc-length displacement scales must match the displacement vector size.");
  }
  if (!Number.isFinite(metric.loadScale) || metric.loadScale <= 0) {
    throw new Error("Arc-length loadScale must be finite and positive.");
  }
  const displacementTerm = displacementIncrement.reduce((sum, value, index) => {
    const normalized = value / scaleAt(metric, index);
    return sum + (normalized * normalized) / displacementIncrement.length;
  }, 0);
  return Math.sqrt(displacementTerm + (metric.loadScale * lambdaIncrement) ** 2);
}

export function sphericalArcLengthConstraint(
  displacementIncrement: readonly number[],
  lambdaIncrement: number,
  radius: number,
  metric: ArcLengthMetric,
): {
  readonly gap: number;
  readonly displacementGradient: readonly number[];
  readonly lambdaGradient: number;
} {
  if (!Number.isFinite(radius) || radius <= 0) {
    throw new Error("Arc-length radius must be finite and positive.");
  }
  const norm = sphericalArcLengthNorm(displacementIncrement, lambdaIncrement, metric);
  return {
    gap: norm * norm - radius * radius,
    displacementGradient: displacementIncrement.map(
      (value, index) =>
        (2 * value) /
        (displacementIncrement.length * scaleAt(metric, index) * scaleAt(metric, index)),
    ),
    lambdaGradient: 2 * metric.loadScale * metric.loadScale * lambdaIncrement,
  };
}

export function scaleArcLengthDirection(
  displacementDirection: readonly number[],
  lambdaDirection: number,
  radius: number,
  metric: ArcLengthMetric,
): { readonly displacement: number[]; readonly lambda: number } {
  const norm = sphericalArcLengthNorm(displacementDirection, lambdaDirection, metric);
  if (!Number.isFinite(norm) || norm <= Number.EPSILON) {
    throw new Error("Arc-length direction has zero scaled norm.");
  }
  const factor = radius / norm;
  return {
    displacement: displacementDirection.map((value) => factor * value),
    lambda: factor * lambdaDirection,
  };
}
