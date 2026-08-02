import {
  assertExplicitUnitSystem,
  createUnitResolver,
  type UnitSystemInput,
} from "../units/UnitSystem.js";
import { GEOTECHNICAL_INTERNAL_UNITS } from "./SoilMaterial.js";

export const CIRCULAR_SLIP_SURFACE_2D_SCHEMA_VERSION = "circular-slip-surface-2d/v1";

export const SLOPE_MOVEMENT_DIRECTIONS = Object.freeze(["left-to-right", "right-to-left"]);

const TOLERANCE = 1e-10;

export type SlopeMovementDirection = (typeof SLOPE_MOVEMENT_DIRECTIONS)[number];

export interface SlipSurfacePoint {
  x: number;
  z: number;
}

export interface SlipSurfacePointInput {
  x?: unknown;
  z?: unknown;
}

export interface SlipSurfaceIntersection extends SlipSurfacePoint {
  segmentParameter: number;
  segmentIndex?: number;
}

export interface CircularSlipSurface2DOptions {
  id?: string | undefined;
  center?: SlipSurfacePointInput;
  radius?: number;
  entryX?: number | null;
  exitX?: number | null;
  movementDirection?: string;
  units?: UnitSystemInput | null;
  metadata?: Record<string, unknown>;
}

export interface CircularSlipSurface2DChordAndSagittaOptions {
  id?: string | undefined;
  entry?: SlipSurfacePointInput;
  exit?: SlipSurfacePointInput;
  sagitta?: number;
  movementDirection?: string;
  units?: UnitSystemInput | null;
  metadata?: Record<string, unknown>;
}

export interface CircularSlipSurface2DJson {
  schemaVersion: string;
  id: string;
  center: SlipSurfacePoint;
  radius: number;
  entryX: number | null;
  exitX: number | null;
  movementDirection: SlopeMovementDirection;
  branch: "lower";
  units: typeof GEOTECHNICAL_INTERNAL_UNITS;
  metadata: Record<string, unknown>;
}

interface Circle {
  center: SlipSurfacePoint;
  radius: number;
}

function finite(value: unknown, label: string): number {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    throw new Error(`${label} must be finite.`);
  }
  return number;
}

function positive(value: unknown, label: string): number {
  const number = finite(value, label);
  if (number <= 0) {
    throw new Error(`${label} must be positive.`);
  }
  return number;
}

function point(
  pointValue: SlipSurfacePointInput | undefined,
  resolver: ReturnType<typeof createUnitResolver>,
  label: string,
): SlipSurfacePoint {
  return {
    x: resolver.length(finite(pointValue?.x, `${label}.x`)),
    z: resolver.length(finite(pointValue?.z, `${label}.z`)),
  };
}

function uniqueIntersections(
  intersections: SlipSurfaceIntersection[],
  tolerance: number,
): SlipSurfaceIntersection[] {
  return intersections
    .sort((left, right) => left.x - right.x || left.z - right.z)
    .filter(
      (candidate, index, values) =>
        index === 0 ||
        Math.abs(candidate.x - (values[index - 1]?.x ?? 0)) > tolerance ||
        Math.abs(candidate.z - (values[index - 1]?.z ?? 0)) > tolerance,
    );
}

function circumcircle(
  first: SlipSurfacePoint,
  second: SlipSurfacePoint,
  third: SlipSurfacePoint,
): Circle {
  const determinant =
    2 *
    (first.x * (second.z - third.z) +
      second.x * (third.z - first.z) +
      third.x * (first.z - second.z));
  const scale = Math.max(
    1,
    Math.hypot(second.x - first.x, second.z - first.z),
    Math.hypot(third.x - first.x, third.z - first.z),
  );
  if (Math.abs(determinant) <= TOLERANCE * scale ** 2) {
    throw new Error("Slip-surface chord and sagitta define a degenerate circle.");
  }

  const firstSquared = first.x ** 2 + first.z ** 2;
  const secondSquared = second.x ** 2 + second.z ** 2;
  const thirdSquared = third.x ** 2 + third.z ** 2;
  const center = {
    x:
      (firstSquared * (second.z - third.z) +
        secondSquared * (third.z - first.z) +
        thirdSquared * (first.z - second.z)) /
      determinant,
    z:
      (firstSquared * (third.x - second.x) +
        secondSquared * (first.x - third.x) +
        thirdSquared * (second.x - first.x)) /
      determinant,
  };
  return {
    center,
    radius: Math.hypot(first.x - center.x, first.z - center.z),
  };
}

function isSlipSurfacePointArray(value: unknown): value is readonly SlipSurfacePoint[] {
  return Array.isArray(value);
}

export class CircularSlipSurface2D {
  readonly schemaVersion: string;
  readonly id: string;
  readonly center: SlipSurfacePoint;
  readonly radius: number;
  readonly entryX: number | null;
  readonly exitX: number | null;
  readonly movementDirection: SlopeMovementDirection;
  readonly branch: "lower";
  readonly units: typeof GEOTECHNICAL_INTERNAL_UNITS;
  readonly metadata: Record<string, unknown>;

  constructor({
    id,
    center,
    radius,
    entryX = null,
    exitX = null,
    movementDirection = "left-to-right",
    units = null,
    metadata = {},
  }: CircularSlipSurface2DOptions = {}) {
    if (!id) {
      throw new Error("A CircularSlipSurface2D id is required.");
    }
    assertExplicitUnitSystem(units, "CircularSlipSurface2D");
    if (!SLOPE_MOVEMENT_DIRECTIONS.includes(movementDirection)) {
      throw new Error(`Unsupported slope movement direction: ${movementDirection}.`);
    }
    const resolver = createUnitResolver(units, GEOTECHNICAL_INTERNAL_UNITS);
    const normalizedCenter = point(center, resolver, "center");
    const normalizedRadius = positive(resolver.length(finite(radius, "radius")), "radius");
    const normalizedEntryX = entryX == null ? null : resolver.length(finite(entryX, "entryX"));
    const normalizedExitX = exitX == null ? null : resolver.length(finite(exitX, "exitX"));
    if (
      (normalizedEntryX == null) !== (normalizedExitX == null) ||
      (normalizedEntryX != null && normalizedExitX != null && normalizedExitX <= normalizedEntryX)
    ) {
      throw new Error("entryX and exitX must be supplied together with entryX < exitX.");
    }

    this.schemaVersion = CIRCULAR_SLIP_SURFACE_2D_SCHEMA_VERSION;
    this.id = id;
    this.center = normalizedCenter;
    this.radius = normalizedRadius;
    this.entryX = normalizedEntryX;
    this.exitX = normalizedExitX;
    this.movementDirection = movementDirection;
    this.branch = "lower";
    this.units = GEOTECHNICAL_INTERNAL_UNITS;
    this.metadata = {
      ...structuredClone(metadata ?? {}),
      unitSystem: GEOTECHNICAL_INTERNAL_UNITS,
      sourceUnitSystem: resolver.sourceUnitSystem,
    };
  }

  static fromChordAndSagitta({
    id,
    entry,
    exit,
    sagitta,
    movementDirection = "left-to-right",
    units = null,
    metadata = {},
  }: CircularSlipSurface2DChordAndSagittaOptions = {}): CircularSlipSurface2D {
    assertExplicitUnitSystem(units, "CircularSlipSurface2D.fromChordAndSagitta");
    const resolver = createUnitResolver(units, GEOTECHNICAL_INTERNAL_UNITS);
    const first = point(entry, resolver, "entry");
    const second = point(exit, resolver, "exit");
    if (second.x <= first.x) {
      throw new Error("Slip-surface entry.x must be smaller than exit.x.");
    }
    const depth = positive(resolver.length(finite(sagitta, "sagitta")), "sagitta");
    const chord = {
      x: second.x - first.x,
      z: second.z - first.z,
    };
    const chordLength = Math.hypot(chord.x, chord.z);
    if (depth >= chordLength / 2 - TOLERANCE) {
      throw new Error(
        "The first circular search model requires sagitta smaller than half the chord length.",
      );
    }
    const midpoint = {
      x: (first.x + second.x) / 2,
      z: (first.z + second.z) / 2,
    };
    const third = {
      x: midpoint.x + (depth * chord.z) / chordLength,
      z: midpoint.z - (depth * chord.x) / chordLength,
    };
    const circle = circumcircle(first, second, third);
    const branchTolerance = TOLERANCE * Math.max(1, circle.radius);
    if (
      first.z > circle.center.z + branchTolerance ||
      second.z > circle.center.z + branchTolerance ||
      third.z > circle.center.z + branchTolerance
    ) {
      throw new Error("Chord and sagitta do not define the lower circular branch.");
    }

    return new CircularSlipSurface2D({
      id,
      center: circle.center,
      radius: circle.radius,
      entryX: first.x,
      exitX: second.x,
      movementDirection,
      units: GEOTECHNICAL_INTERNAL_UNITS,
      metadata: {
        ...structuredClone(metadata ?? {}),
        generation: {
          model: "chord-and-sagitta",
          entry: first,
          exit: second,
          sagitta: depth,
          sagittaPoint: third,
        },
      },
    });
  }

  lowerElevationAt(x: number): number {
    const horizontal = finite(x, "x");
    const relative = horizontal - this.center.x;
    const radicand = this.radius ** 2 - relative ** 2;
    const tolerance = TOLERANCE * Math.max(1, this.radius ** 2);
    if (radicand < -tolerance) {
      throw new Error(`x=${horizontal} lies outside CircularSlipSurface2D ${this.id}.`);
    }
    return this.center.z - Math.sqrt(Math.max(0, radicand));
  }

  baseInclinationAt(x: number): number {
    const horizontal = finite(x, "x");
    const elevation = this.lowerElevationAt(horizontal);
    const tangentAngle = Math.atan2(horizontal - this.center.x, this.center.z - elevation);
    return this.movementDirection === "left-to-right" ? -tangentAngle : tangentAngle;
  }

  intersectionsWithSegment(
    start: SlipSurfacePoint,
    end: SlipSurfacePoint,
  ): SlipSurfaceIntersection[] {
    const direction = { x: end.x - start.x, z: end.z - start.z };
    const offset = {
      x: start.x - this.center.x,
      z: start.z - this.center.z,
    };
    const a = direction.x ** 2 + direction.z ** 2;
    if (a <= 0) return [];
    const b = 2 * (offset.x * direction.x + offset.z * direction.z);
    const c = offset.x ** 2 + offset.z ** 2 - this.radius ** 2;
    const discriminant = b ** 2 - 4 * a * c;
    const tolerance = TOLERANCE * Math.max(1, b ** 2, Math.abs(4 * a * c));
    if (discriminant < -tolerance) return [];
    const root = Math.sqrt(Math.max(0, discriminant));
    const parameters =
      root <= tolerance ? [-b / (2 * a)] : [(-b - root) / (2 * a), (-b + root) / (2 * a)];
    const coordinateTolerance = TOLERANCE * Math.max(1, this.radius);

    return parameters
      .filter((parameter) => parameter >= -TOLERANCE && parameter <= 1 + TOLERANCE)
      .map((parameter) => {
        const bounded = Math.max(0, Math.min(1, parameter));
        return {
          x: start.x + bounded * direction.x,
          z: start.z + bounded * direction.z,
          segmentParameter: bounded,
        };
      })
      .filter(({ z }) => z <= this.center.z + coordinateTolerance);
  }

  intersectionsWithPolyline(points: readonly SlipSurfacePoint[]): SlipSurfaceIntersection[] {
    const runtimePoints: unknown = points;
    if (!isSlipSurfacePointArray(runtimePoints) || runtimePoints.length < 2) {
      throw new Error("intersectionsWithPolyline requires at least two points.");
    }
    const intersections: SlipSurfaceIntersection[] = [];
    for (let index = 0; index < runtimePoints.length - 1; index += 1) {
      const start = runtimePoints[index]!;
      const end = runtimePoints[index + 1]!;
      for (const intersection of this.intersectionsWithSegment(start, end)) {
        intersections.push({ ...intersection, segmentIndex: index });
      }
    }
    return uniqueIntersections(intersections, TOLERANCE * Math.max(1, this.radius));
  }

  toJSON(): CircularSlipSurface2DJson {
    return {
      schemaVersion: this.schemaVersion,
      id: this.id,
      center: { ...this.center },
      radius: this.radius,
      entryX: this.entryX,
      exitX: this.exitX,
      movementDirection: this.movementDirection,
      branch: this.branch,
      units: { ...this.units },
      metadata: structuredClone(this.metadata),
    };
  }
}
