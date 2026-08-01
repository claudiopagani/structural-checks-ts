import {
  assertExplicitUnitSystem,
  createUnitResolver,
  type UnitResolver,
  type UnitSystemInput,
} from "../../units/UnitSystem.js";
import type {
  PunchingArcSegment,
  PunchingControlPerimeterJson,
  PunchingControlPerimeterOptions,
  PunchingControlPerimeterProperties,
  PunchingPerimeterComponent,
  PunchingPerimeterComponentInput,
  PunchingPlanPoint,
  PunchingSegment,
  PunchingSegmentInput,
} from "./types.js";

const INTERNAL_UNITS = Object.freeze({
  force: "N",
  length: "mm",
}) satisfies UnitSystemInput;
const CONTINUITY_TOLERANCE = 1e-6;

function finite(value: unknown, label: string): number {
  if (!Number.isFinite(value)) {
    throw new Error(`${label} must be finite.`);
  }
  return value as number;
}

function positive(value: unknown, label: string): number {
  if (!Number.isFinite(value) || (value as number) <= 0) {
    throw new Error(`${label} must be finite and positive.`);
  }
  return value as number;
}

function point(
  input: Partial<PunchingPlanPoint> | undefined,
  resolver: UnitResolver,
  label: string,
): PunchingPlanPoint {
  return {
    x: resolver.length(finite(Number(input?.x), `${label}.x`)),
    y: resolver.length(finite(Number(input?.y), `${label}.y`)),
  };
}

function arcEndpoint(segment: PunchingArcSegment, atEnd: boolean): PunchingPlanPoint {
  const angle = segment.startAngle + (atEnd ? segment.sweepAngle : 0);
  return {
    x: segment.center.x + segment.radius * Math.cos(angle),
    y: segment.center.y + segment.radius * Math.sin(angle),
  };
}

function segmentStart(segment: PunchingSegment): PunchingPlanPoint {
  return segment.type === "line" ? segment.start : arcEndpoint(segment, false);
}

function segmentEnd(segment: PunchingSegment): PunchingPlanPoint {
  return segment.type === "line" ? segment.end : arcEndpoint(segment, true);
}

function pointsAreClose(first: PunchingPlanPoint, second: PunchingPlanPoint): boolean {
  return Math.hypot(first.x - second.x, first.y - second.y) <= CONTINUITY_TOLERANCE;
}

function normalizeSegment(
  input: PunchingSegmentInput | undefined,
  resolver: UnitResolver,
  label: string,
): PunchingSegment {
  if (input?.type === "line") {
    const start = point(input.start, resolver, `${label}.start`);
    const end = point(input.end, resolver, `${label}.end`);
    const length = positive(Math.hypot(end.x - start.x, end.y - start.y), `${label}.length`);
    return { type: "line", start, end, length };
  }

  if (input?.type === "arc") {
    const center = point(input.center, resolver, `${label}.center`);
    const radius = positive(resolver.length(Number(input.radius)), `${label}.radius`);
    const startAngle = finite(Number(input.startAngle), `${label}.startAngle`);
    const sweepAngle = finite(Number(input.sweepAngle), `${label}.sweepAngle`);

    if (Math.abs(sweepAngle) <= 1e-12 || Math.abs(sweepAngle) > 2 * Math.PI + 1e-9) {
      throw new Error(`${label}.sweepAngle must be non-zero and no greater than 2*pi.`);
    }

    return {
      type: "arc",
      center,
      radius,
      startAngle,
      sweepAngle,
      length: radius * Math.abs(sweepAngle),
    };
  }

  throw new Error(`${label}.type must be line or arc.`);
}

function normalizeComponent(
  input: PunchingPerimeterComponentInput | undefined,
  resolver: UnitResolver,
  index: number,
): PunchingPerimeterComponent {
  const label = `components[${index}]`;
  if (!Array.isArray(input?.segments) || input.segments.length === 0) {
    throw new Error(`${label}.segments must be a non-empty array.`);
  }

  const segments = input.segments.map((segment, segmentIndex) =>
    normalizeSegment(segment, resolver, `${label}.segments[${segmentIndex}]`),
  );

  for (let segmentIndex = 1; segmentIndex < segments.length; segmentIndex += 1) {
    const previous = segments[segmentIndex - 1];
    const current = segments[segmentIndex];
    if (!previous || !current || !pointsAreClose(segmentEnd(previous), segmentStart(current))) {
      throw new Error(`${label}.segments must form a continuous curve.`);
    }
  }

  const closed = input.closed === true;
  const last = segments.at(-1);
  const first = segments[0];
  if (closed && (!last || !first || !pointsAreClose(segmentEnd(last), segmentStart(first)))) {
    throw new Error(`${label} is declared closed but its endpoints do not coincide.`);
  }

  return { closed, segments };
}

function segmentLineCentroid(segment: PunchingSegment): PunchingPlanPoint {
  if (segment.type === "line") {
    return {
      x: (segment.start.x + segment.end.x) / 2,
      y: (segment.start.y + segment.end.y) / 2,
    };
  }

  const start = segment.startAngle;
  const end = start + segment.sweepAngle;
  return {
    x: segment.center.x + (segment.radius * (Math.sin(end) - Math.sin(start))) / segment.sweepAngle,
    y: segment.center.y + (segment.radius * (Math.cos(start) - Math.cos(end))) / segment.sweepAngle,
  };
}

function calculateProperties(
  components: readonly PunchingPerimeterComponent[],
): PunchingControlPerimeterProperties {
  const segments = components.flatMap((component) => component.segments);
  const length = segments.reduce((sum, segment) => sum + segment.length, 0);
  const firstMoment = segments.reduce(
    (sum, segment) => {
      const centroid = segmentLineCentroid(segment);
      return {
        x: sum.x + centroid.x * segment.length,
        y: sum.y + centroid.y * segment.length,
      };
    },
    { x: 0, y: 0 },
  );

  return {
    length,
    lineCentroid: {
      x: firstMoment.x / length,
      y: firstMoment.y / length,
    },
    componentCount: components.length,
    segmentCount: segments.length,
  };
}

export const PUNCHING_CONTROL_PERIMETER_SCHEMA_VERSION = "rc-punching-control-perimeter/v0";

export class PunchingControlPerimeter {
  id: string;
  schemaVersion = PUNCHING_CONTROL_PERIMETER_SCHEMA_VERSION;
  codeId: string;
  role: string;
  position: string;
  offset: number;
  units = INTERNAL_UNITS;
  components: PunchingPerimeterComponent[];
  properties: PunchingControlPerimeterProperties;
  source: Record<string, unknown>;
  metadata: Record<string, unknown>;

  constructor({
    id,
    codeId,
    role,
    position,
    offset,
    units = null,
    components,
    source = { method: "explicit" },
    metadata = {},
  }: PunchingControlPerimeterOptions = {}) {
    if (!id || !codeId || !role || !position) {
      throw new Error("PunchingControlPerimeter requires id, codeId, role and position.");
    }

    assertExplicitUnitSystem(units, "PunchingControlPerimeter");
    const resolver = createUnitResolver(units, INTERNAL_UNITS);
    if (!Array.isArray(components) || components.length === 0) {
      throw new Error("PunchingControlPerimeter components must be a non-empty array.");
    }

    this.id = id;
    this.codeId = codeId;
    this.role = role;
    this.position = position;
    this.offset = resolver.length(finite(Number(offset ?? 0), "offset"));
    this.components = components.map((component, index) =>
      normalizeComponent(component, resolver, index),
    );
    this.properties = calculateProperties(this.components);
    this.source = structuredClone(source);
    this.metadata = {
      ...metadata,
      unitSystem: INTERNAL_UNITS,
      sourceUnitSystem: resolver.sourceUnitSystem,
      centroidDefinition: "length-weighted-centroid-of-active-control-perimeter",
    };
  }

  toJSON(): PunchingControlPerimeterJson {
    return {
      id: this.id,
      schemaVersion: this.schemaVersion,
      codeId: this.codeId,
      role: this.role,
      position: this.position,
      offset: this.offset,
      units: { ...this.units },
      components: structuredClone(this.components),
      properties: structuredClone(this.properties),
      source: structuredClone(this.source),
      metadata: { ...this.metadata },
    };
  }
}
