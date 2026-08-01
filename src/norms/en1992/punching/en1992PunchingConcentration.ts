import type {
  PunchingFootprint,
  PunchingPlanPoint,
  PunchingSupportPosition,
} from "../../../domain/slabs/punching/types.js";
import { withNormativeReferences, type NormativeReference } from "../../normativeReference.js";
import { EN1992_RC_EXTERNAL_REFERENCES } from "../normativeReferences.js";

function positive(value: unknown, label: string): number {
  if (!Number.isFinite(value) || (value as number) <= 0) {
    throw new Error(`${label} must be finite and positive.`);
  }
  return value as number;
}

function finitePoint(
  point: Partial<PunchingPlanPoint> | null | undefined,
  label: string,
): PunchingPlanPoint {
  const x = point?.x;
  const y = point?.y;
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    throw new Error(`${label} must contain finite x and y coordinates.`);
  }
  return { x: x as number, y: y as number };
}

function interpolateK(ratio: number): number {
  const points: ReadonlyArray<readonly [number, number]> = [
    [0.5, 0.45],
    [1, 0.6],
    [2, 0.7],
    [3, 0.8],
  ];
  const first = points[0] as readonly [number, number];
  const last = points.at(-1) as readonly [number, number];
  if (ratio <= first[0]) return first[1];
  if (ratio >= last[0]) return last[1];

  const upperIndex = points.findIndex(([limit]) => ratio <= limit);
  const lower = points[upperIndex - 1] as readonly [number, number];
  const upper = points[upperIndex] as readonly [number, number];
  return lower[1] + ((ratio - lower[0]) / (upper[0] - lower[0])) * (upper[1] - lower[1]);
}

function concentrationMetadata(reference: NormativeReference): Record<string, unknown> {
  return withNormativeReferences({}, [reference]);
}

export interface En1992PunchingBeta2004Input {
  position?: PunchingSupportPosition;
  footprint?: PunchingFootprint;
  effectiveDepth?: number;
  controlPerimeter?: number;
  lineOfAction?: Partial<PunchingPlanPoint>;
}

export function calculateEn1992PunchingBeta2004({
  position,
  footprint,
  effectiveDepth,
  controlPerimeter,
  lineOfAction,
}: En1992PunchingBeta2004Input = {}): Record<string, unknown> {
  const d = positive(effectiveDepth, "effectiveDepth");
  const u1 = positive(controlPerimeter, "controlPerimeter");
  const point = finitePoint(lineOfAction, "lineOfAction");
  const center = finitePoint(footprint?.center, "footprint.center");
  const ex = point.x - center.x;
  const ey = point.y - center.y;

  if (position === "interior" && footprint?.shape === "circle") {
    const eccentricity = Math.hypot(ex, ey);
    const beta =
      1 +
      (0.6 * Math.PI * eccentricity) / (positive(footprint.diameter, "footprint.diameter") + 4 * d);
    return {
      beta,
      method: "equation-6.42-circular-interior",
      eccentricity: { x: ex, y: ey, resultant: eccentricity },
      reference: "EN 1992-1-1:2004+A1:2014 Eq. (6.42)",
      metadata: concentrationMetadata(EN1992_RC_EXTERNAL_REFERENCES.punching2004),
    };
  }

  if (footprint?.shape !== "rectangle") {
    throw new Error(
      "Automatic beta requires a rectangular support, except for interior circular supports.",
    );
  }

  const c1 = positive(footprint.sizeX, "footprint.sizeX");
  const c2 = positive(footprint.sizeY, "footprint.sizeY");

  if (position === "interior") {
    const widthX = c1 + 4 * d;
    const widthY = c2 + 4 * d;
    const beta = 1 + 1.8 * Math.hypot(ex / widthX, ey / widthY);
    return {
      beta,
      method: "equation-6.43-rectangular-interior-biaxial",
      eccentricity: { x: ex, y: ey },
      controlWidths: { x: widthX, y: widthY },
      reference: "EN 1992-1-1:2004+A1:2014 Eq. (6.43)",
      metadata: concentrationMetadata(EN1992_RC_EXTERNAL_REFERENCES.punching2004),
    };
  }

  if (position === "edge") {
    if (ex < 0) {
      throw new Error(
        "Automatic 2004 beta for an edge column with eccentricity toward the free edge is not implemented; supply beta explicitly.",
      );
    }
    const reducedNormalLength = Math.min(1.5 * d, 0.5 * c1);
    const u1Star = 2 * reducedNormalLength + c2 + 2 * Math.PI * d;
    const k = interpolateK(c1 / (2 * c2));
    const w1 = c2 ** 2 / 4 + c1 * c2 + 4 * c1 * d + 8 * d ** 2 + Math.PI * d * c2;
    const beta = u1 / u1Star + ((k * u1) / w1) * Math.abs(ey);
    return {
      beta,
      method: "equation-6.44-edge-inward",
      eccentricity: { x: ex, y: ey },
      u1Star,
      k,
      w1,
      reference: "EN 1992-1-1:2004+A1:2014 Eqs. (6.44)-(6.45)",
      metadata: concentrationMetadata(EN1992_RC_EXTERNAL_REFERENCES.punching2004),
    };
  }

  if (position === "corner") {
    if (ex < 0 || ey < 0) {
      throw new Error(
        "Automatic 2004 beta for a corner column with eccentricity toward a free edge is not implemented; supply beta explicitly.",
      );
    }
    const u1Star = Math.min(1.5 * d, 0.5 * c1) + Math.min(1.5 * d, 0.5 * c2) + Math.PI * d;
    return {
      beta: u1 / u1Star,
      method: "equation-6.46-corner-inward",
      eccentricity: { x: ex, y: ey },
      u1Star,
      reference: "EN 1992-1-1:2004+A1:2014 Eq. (6.46)",
      metadata: concentrationMetadata(EN1992_RC_EXTERNAL_REFERENCES.punching2004),
    };
  }

  throw new Error(`Unsupported support position for automatic beta: ${String(position)}.`);
}

export interface En1992PunchingBetaE2023Input {
  position?: PunchingSupportPosition;
  controlPerimeterCentroid?: Partial<PunchingPlanPoint>;
  controlPerimeterWidths?: Partial<PunchingPlanPoint>;
  lineOfAction?: Partial<PunchingPlanPoint>;
}

export function calculateEn1992PunchingBetaE2023({
  position,
  controlPerimeterCentroid,
  controlPerimeterWidths,
  lineOfAction,
}: En1992PunchingBetaE2023Input = {}): Record<string, unknown> {
  const centroid = finitePoint(controlPerimeterCentroid, "controlPerimeterCentroid");
  const point = finitePoint(lineOfAction, "lineOfAction");
  const widthX = positive(controlPerimeterWidths?.x, "controlPerimeterWidths.x");
  const widthY = positive(controlPerimeterWidths?.y, "controlPerimeterWidths.y");
  const ebx = point.x - centroid.x;
  const eby = point.y - centroid.y;
  let eb: number;

  if (position === "interior") {
    eb = Math.hypot(ebx, eby);
  } else if (position === "edge") {
    eb = 0.5 * (Math.abs(ebx) + Math.hypot(ebx, eby));
  } else if (position === "corner") {
    eb = 0.27 * (Math.abs(ebx) + Math.abs(eby));
  } else {
    throw new Error(`Unsupported support position for automatic betaE: ${String(position)}.`);
  }

  const bb = Math.sqrt(widthX * widthY);
  const rawBetaE = 1 + (1.1 * eb) / bb;
  return {
    betaE: Math.max(1.05, rawBetaE),
    rawBetaE,
    minimum: 1.05,
    eb,
    eccentricity: { x: ebx, y: eby },
    bb,
    controlPerimeterWidths: { x: widthX, y: widthY },
    method: `table-8.3-${position}`,
    reference: "EN 1992-1-1:2023 8.4.3, Eq. (8.93) and Table 8.3",
    metadata: concentrationMetadata(EN1992_RC_EXTERNAL_REFERENCES.punching2023),
  };
}
