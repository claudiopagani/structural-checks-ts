const DEFAULT_TOLERANCE = 1e-9;

export interface RayPolygonPoint {
  x: number;
  y: number;
}

export interface RayPolygonCapacityOptions {
  tolerance?: number;
}

export interface RayPolygonIntersection extends RayPolygonPoint {
  distance: number;
  segmentIndex: number;
  segmentParameter: number;
}

export interface RayPolygonCapacityResult {
  demandNorm: number;
  capacityNorm: number | null;
  utilizationRatio: number;
  intersection: RayPolygonIntersection | null;
}

function cross(first: RayPolygonPoint, second: RayPolygonPoint): number {
  return first.x * second.y - first.y * second.x;
}

export function rayPolygonCapacity(
  points: readonly RayPolygonPoint[] | null | undefined,
  demandX: number,
  demandY: number,
  { tolerance = DEFAULT_TOLERANCE }: RayPolygonCapacityOptions = {},
): RayPolygonCapacityResult {
  if (!Number.isFinite(demandX) || !Number.isFinite(demandY)) {
    throw new Error("Ray-polygon demand components must be finite.");
  }

  if (!Number.isFinite(tolerance) || tolerance <= 0) {
    throw new Error("Ray-polygon tolerance must be positive and finite.");
  }

  const demandNorm = Math.hypot(demandX, demandY);

  if (demandNorm <= tolerance) {
    return {
      demandNorm: 0,
      capacityNorm: Number.POSITIVE_INFINITY,
      utilizationRatio: 0,
      intersection: null,
    };
  }

  const direction = { x: demandX / demandNorm, y: demandY / demandNorm };
  const intersections: RayPolygonIntersection[] = [];
  const pointCount = points?.length ?? 0;

  for (let index = 0; index < pointCount; index += 1) {
    const start = points?.[index];
    const end = points?.[(index + 1) % pointCount];

    if (
      !Number.isFinite(start?.x) ||
      !Number.isFinite(start?.y) ||
      !Number.isFinite(end?.x) ||
      !Number.isFinite(end?.y)
    ) {
      continue;
    }

    const resolvedStart = start as RayPolygonPoint;
    const resolvedEnd = end as RayPolygonPoint;
    const segment = {
      x: resolvedEnd.x - resolvedStart.x,
      y: resolvedEnd.y - resolvedStart.y,
    };
    const denominator = cross(direction, segment);

    if (Math.abs(denominator) <= tolerance) {
      continue;
    }

    const distance = cross(resolvedStart, segment) / denominator;
    const segmentParameter = cross(resolvedStart, direction) / denominator;

    if (
      distance >= -tolerance &&
      segmentParameter >= -tolerance &&
      segmentParameter <= 1 + tolerance
    ) {
      const nonNegativeDistance = Math.max(0, distance);
      intersections.push({
        distance: nonNegativeDistance,
        x: direction.x * nonNegativeDistance,
        y: direction.y * nonNegativeDistance,
        segmentIndex: index,
        segmentParameter: Math.min(1, Math.max(0, segmentParameter)),
      });
    }
  }

  const selected =
    intersections
      .filter((item) => item.distance > tolerance)
      .sort((first, second) => first.distance - second.distance)[0] ?? null;

  return {
    demandNorm,
    capacityNorm: selected?.distance ?? null,
    utilizationRatio: selected ? demandNorm / selected.distance : Number.POSITIVE_INFINITY,
    intersection: selected,
  };
}
