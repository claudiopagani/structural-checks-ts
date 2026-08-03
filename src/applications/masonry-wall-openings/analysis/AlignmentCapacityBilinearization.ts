import { RESULT_STATUS, type ResultStatus } from "../../../core/results/resultStatus.js";

const DEFAULT_DROP_RATIO = 0.2;
const EPS = 1e-9;

export interface CapacityCurvePointInput {
  id?: string;
  displacement?: number;
  controlDisplacement?: number;
  baseShear?: number;
  force?: number;
}

export interface CapacityCurveInput {
  points?: readonly CapacityCurvePointInput[];
}

export interface BilinearizationOptions {
  dropRatio?: number;
}

export interface BilinearizationPoint {
  id: string;
  displacement: number;
  baseShear: number;
}

export interface BilinearizationSourceSegment {
  startId: string;
  endId: string;
}

export interface BilinearizationSecantPoint {
  displacement: number;
  baseShear: number;
  sourceSegment: BilinearizationSourceSegment;
}

export interface BilinearizationUltimatePoint {
  displacement: number;
  baseShear: number;
  sourceSegment: BilinearizationSourceSegment;
  fallbackToLastPoint: boolean;
}

export interface BilinearizedCapacityCurve {
  status: ResultStatus;
  warnings: string[];
  ks: number;
  Vy: number;
  du: number;
  yieldDisplacement: number;
  peakPoint: BilinearizationPoint | null;
  secantPoint: BilinearizationSecantPoint | null;
  ultimatePoint: BilinearizationUltimatePoint | null;
  actualEnergy: number;
  bilinearEnergy: number;
  points: BilinearizationPoint[];
}

function normalizePoint(point: CapacityCurvePointInput, index: number): BilinearizationPoint {
  return {
    id: point.id ?? `point-${index + 1}`,
    displacement:
      typeof point.displacement === "number" && Number.isFinite(point.displacement)
        ? point.displacement
        : (point.controlDisplacement ?? Number.NaN),
    baseShear:
      typeof point.baseShear === "number" && Number.isFinite(point.baseShear)
        ? point.baseShear
        : (point.force ?? Number.NaN),
  };
}

function sortCurvePoints(points: readonly CapacityCurvePointInput[] = []): BilinearizationPoint[] {
  return points
    .map(normalizePoint)
    .filter((point) => Number.isFinite(point.displacement) && Number.isFinite(point.baseShear))
    .sort((left, right) => left.displacement - right.displacement);
}

function findPeakPoint(points: readonly BilinearizationPoint[]): BilinearizationPoint | null {
  return points.reduce<BilinearizationPoint | null>(
    (selected, point) => (!selected || point.baseShear > selected.baseShear ? point : selected),
    null,
  );
}

function interpolateCrossing(
  startPoint: BilinearizationPoint,
  endPoint: BilinearizationPoint,
  targetForce: number,
): number {
  const deltaForce = endPoint.baseShear - startPoint.baseShear;

  if (Math.abs(deltaForce) <= EPS) {
    return endPoint.displacement;
  }

  const ratio = (targetForce - startPoint.baseShear) / deltaForce;

  return startPoint.displacement + ratio * (endPoint.displacement - startPoint.displacement);
}

function insertPointAtDisplacement(
  points: readonly BilinearizationPoint[],
  displacement: number,
): BilinearizationPoint[] {
  if (!Number.isFinite(displacement) || points.length === 0) {
    return [...points];
  }

  const existingPoint = points.find((point) => Math.abs(point.displacement - displacement) <= EPS);

  if (existingPoint) {
    return [...points];
  }

  const firstPoint = points[0];
  if (firstPoint === undefined) {
    return [...points];
  }

  if (displacement <= firstPoint.displacement + EPS) {
    return [
      {
        id: "inserted-start",
        displacement,
        baseShear: firstPoint.baseShear,
      },
      ...points,
    ];
  }

  for (let index = 0; index < points.length - 1; index += 1) {
    const startPoint = points[index];
    const endPoint = points[index + 1];
    if (startPoint === undefined || endPoint === undefined) {
      continue;
    }

    if (
      displacement > startPoint.displacement + EPS &&
      displacement < endPoint.displacement - EPS
    ) {
      const ratio =
        (displacement - startPoint.displacement) /
        (endPoint.displacement - startPoint.displacement);
      const baseShear = startPoint.baseShear + ratio * (endPoint.baseShear - startPoint.baseShear);

      return [
        ...points.slice(0, index + 1),
        {
          id: `inserted-${index + 1}`,
          displacement,
          baseShear,
        },
        ...points.slice(index + 1),
      ];
    }
  }

  const lastPoint = points.at(-1);
  return [
    ...points,
    {
      id: "inserted-end",
      displacement,
      baseShear: lastPoint?.baseShear ?? 0,
    },
  ];
}

function integrateCurveArea(
  points: readonly BilinearizationPoint[],
  maxDisplacement: number,
): number {
  const clippedPoints = insertPointAtDisplacement(points, maxDisplacement).filter(
    (point) => point.displacement <= maxDisplacement + EPS,
  );
  let area = 0;

  for (let index = 0; index < clippedPoints.length - 1; index += 1) {
    const startPoint = clippedPoints[index];
    const endPoint = clippedPoints[index + 1];
    if (startPoint === undefined || endPoint === undefined) {
      continue;
    }
    const deltaDisplacement = endPoint.displacement - startPoint.displacement;

    if (deltaDisplacement <= EPS) {
      continue;
    }

    area += ((startPoint.baseShear + endPoint.baseShear) / 2) * deltaDisplacement;
  }

  return area;
}

function resolveSecantPoint(
  points: readonly BilinearizationPoint[],
  peakPoint: BilinearizationPoint | null,
): BilinearizationSecantPoint | null {
  if (!peakPoint || peakPoint.baseShear <= EPS) {
    return null;
  }

  const targetForce = 0.7 * peakPoint.baseShear;
  const peakIndex = points.findIndex((point) => point.id === peakPoint.id);
  const ascendingBranch = points.slice(0, peakIndex + 1);

  for (let index = 0; index < ascendingBranch.length - 1; index += 1) {
    const startPoint = ascendingBranch[index];
    const endPoint = ascendingBranch[index + 1];
    if (startPoint === undefined || endPoint === undefined) {
      continue;
    }

    if (endPoint.baseShear + EPS < targetForce) {
      continue;
    }

    return {
      displacement: interpolateCrossing(startPoint, endPoint, targetForce),
      baseShear: targetForce,
      sourceSegment: {
        startId: startPoint.id,
        endId: endPoint.id,
      },
    };
  }

  return {
    displacement: peakPoint.displacement,
    baseShear: targetForce,
    sourceSegment: {
      startId: peakPoint.id,
      endId: peakPoint.id,
    },
  };
}

function resolveUltimatePoint(
  points: readonly BilinearizationPoint[],
  peakPoint: BilinearizationPoint | null,
  dropRatio: number,
): BilinearizationUltimatePoint | null {
  if (!peakPoint) {
    return null;
  }

  const targetForce = peakPoint.baseShear * (1 - dropRatio);
  const peakIndex = points.findIndex((point) => point.id === peakPoint.id);

  for (let index = peakIndex; index < points.length - 1; index += 1) {
    const startPoint = points[index];
    const endPoint = points[index + 1];
    if (startPoint === undefined || endPoint === undefined) {
      continue;
    }

    if (endPoint.baseShear > targetForce + EPS) {
      continue;
    }

    return {
      displacement: interpolateCrossing(startPoint, endPoint, targetForce),
      baseShear: targetForce,
      sourceSegment: {
        startId: startPoint.id,
        endId: endPoint.id,
      },
      fallbackToLastPoint: false,
    };
  }

  const lastPoint = points.at(-1);
  return {
    displacement: lastPoint?.displacement ?? peakPoint.displacement,
    baseShear: lastPoint?.baseShear ?? peakPoint.baseShear,
    sourceSegment: {
      startId: lastPoint?.id ?? peakPoint.id,
      endId: lastPoint?.id ?? peakPoint.id,
    },
    fallbackToLastPoint: true,
  };
}

export interface BilinearizeCapacityCurveInput {
  curve?: CapacityCurveInput | null;
  points?: readonly CapacityCurvePointInput[];
  options?: BilinearizationOptions;
}

export function bilinearizeCapacityCurve({
  curve,
  points = curve?.points ?? [],
  options = {},
}: BilinearizeCapacityCurveInput = {}): BilinearizedCapacityCurve {
  const warnings: string[] = [];
  const normalizedPoints = sortCurvePoints(points);

  if (normalizedPoints.length < 2) {
    return {
      status: RESULT_STATUS.NOT_VERIFIED,
      warnings: ["At least two capacity-curve points are required for bilinearization."],
      ks: 0,
      Vy: 0,
      du: 0,
      yieldDisplacement: 0,
      peakPoint: null,
      secantPoint: null,
      ultimatePoint: null,
      actualEnergy: 0,
      bilinearEnergy: 0,
      points: normalizedPoints,
    };
  }

  const peakPoint = findPeakPoint(normalizedPoints);
  const secantPoint = resolveSecantPoint(normalizedPoints, peakPoint);
  const dropRatio =
    typeof options.dropRatio === "number" && Number.isFinite(options.dropRatio)
      ? options.dropRatio
      : DEFAULT_DROP_RATIO;
  const ultimatePoint = resolveUltimatePoint(normalizedPoints, peakPoint, dropRatio);
  const ks =
    secantPoint && secantPoint.displacement > EPS
      ? secantPoint.baseShear / secantPoint.displacement
      : 0;
  const actualEnergy = integrateCurveArea(normalizedPoints, ultimatePoint?.displacement ?? 0);

  if (ultimatePoint?.fallbackToLastPoint) {
    warnings.push(
      "The capacity curve never dropped by the requested 20% from peak resistance, so the last available point was used as ultimate displacement.",
    );
  }

  if (ks <= EPS || !ultimatePoint || ultimatePoint.displacement <= EPS) {
    return {
      status: RESULT_STATUS.NOT_VERIFIED,
      warnings: [
        ...warnings,
        "The capacity curve does not provide a finite elastic secant stiffness or a positive ultimate displacement.",
      ],
      ks: ks > EPS ? ks : 0,
      Vy: 0,
      du: ultimatePoint?.displacement ?? 0,
      yieldDisplacement: 0,
      peakPoint,
      secantPoint,
      ultimatePoint,
      actualEnergy,
      bilinearEnergy: 0,
      points: normalizedPoints,
    };
  }

  const radicand = ultimatePoint.displacement ** 2 - (2 * actualEnergy) / ks;
  const clampedRadicand = Math.max(radicand, 0);

  if (radicand < -EPS) {
    warnings.push(
      "Equivalent-energy bilinearization reached a negative quadratic radicand; the solution was clamped to preserve a valid bilinear curve.",
    );
  }

  const yieldDisplacement = ultimatePoint.displacement - Math.sqrt(clampedRadicand);
  const limitedYieldDisplacement = Math.min(
    Math.max(yieldDisplacement, 0),
    ultimatePoint.displacement,
  );
  const Vy = ks * limitedYieldDisplacement;
  const bilinearEnergy = Vy * ultimatePoint.displacement - (Vy * limitedYieldDisplacement) / 2;

  return {
    status: RESULT_STATUS.OK,
    warnings,
    ks,
    Vy,
    du: ultimatePoint.displacement,
    yieldDisplacement: limitedYieldDisplacement,
    peakPoint,
    secantPoint,
    ultimatePoint,
    actualEnergy,
    bilinearEnergy,
    points: normalizedPoints,
  };
}
