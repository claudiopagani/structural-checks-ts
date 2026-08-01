import type { MomentCurvaturePoint } from "./types.js";

export const EVENT_CURVATURE_TOLERANCE = 1e-13;

export interface AxialSample {
  eps0: number;
  value: number;
}

export interface AxialBracket {
  min: number;
  max: number;
}

export function createLinearSamples({
  minimum,
  maximum,
  count,
}: {
  minimum: number;
  maximum: number;
  count: number;
}): number[] {
  if (!Number.isFinite(minimum) || !Number.isFinite(maximum) || minimum > maximum) {
    throw new Error("RCMomentCurvatureAnalyzer requires a valid sample interval.");
  }

  if (!Number.isInteger(count) || count < 2) {
    throw new Error("RCMomentCurvatureAnalyzer requires at least two samples.");
  }

  const step = (maximum - minimum) / (count - 1);

  return Array.from({ length: count }, (_, index) => minimum + step * index);
}

export function createCurvatureValues({
  curvatureMax,
  pointCount,
}: {
  curvatureMax: number;
  pointCount: number;
}): number[] {
  if (!Number.isFinite(curvatureMax) || curvatureMax <= 0) {
    throw new Error("RCMomentCurvatureAnalyzer requires a positive curvatureMax.");
  }

  return createLinearSamples({
    minimum: 0,
    maximum: curvatureMax,
    count: pointCount,
  });
}

export function findBrackets(samples: AxialSample[], target: number): AxialBracket[] {
  const brackets: AxialBracket[] = [];

  for (let index = 1; index < samples.length; index += 1) {
    const previous = samples[index - 1];
    const current = samples[index];

    if (previous === undefined || current === undefined) {
      continue;
    }

    if (Math.abs(previous.value - target) === 0) {
      brackets.push({ min: previous.eps0, max: previous.eps0 });
      continue;
    }

    if ((previous.value - target) * (current.value - target) <= 0) {
      brackets.push({
        min: previous.eps0,
        max: current.eps0,
      });
    }
  }

  const last = samples.at(-1);

  if (last && Math.abs(last.value - target) === 0) {
    brackets.push({ min: last.eps0, max: last.eps0 });
  }

  return brackets.filter((bracket, index) => {
    const previous = brackets[index - 1];
    return (
      index === 0 ||
      previous === undefined ||
      bracket.min !== previous.min ||
      bracket.max !== previous.max
    );
  });
}

export function bracketDistanceFromHint(
  bracket: AxialBracket,
  eps0Hint: number | null | undefined,
): number {
  if (!Number.isFinite(eps0Hint)) {
    return 0;
  }

  const hint = eps0Hint as number;

  if (hint < bracket.min) {
    return bracket.min - hint;
  }

  if (hint > bracket.max) {
    return hint - bracket.max;
  }

  return 0;
}

export function appendUniquePoint(
  points: MomentCurvaturePoint[],
  point: MomentCurvaturePoint,
  tolerance = EVENT_CURVATURE_TOLERANCE,
): void {
  const previous = points.at(-1);

  if (previous && Math.abs(previous.absoluteCurvature - point.absoluteCurvature) <= tolerance) {
    points[points.length - 1] = point;
    return;
  }

  points.push(point);
}
