import {
  SingleBeamModel,
  type BeamLoadInput,
  type SingleBeamModelOptions,
} from "../beams/index.js";
import { createUnitResolver, type UnitSystem } from "../units/UnitSystem.js";

const FEM_UNITS = Object.freeze({ force: "kN", length: "m" }) satisfies UnitSystem;

export interface FoundationBeamSegmentInput {
  id?: string;
  from?: number;
  to?: number;
  subgradeModulus?: number;
  metadata?: Record<string, unknown>;
}

export interface FoundationBeamDefinitionInput {
  contactWidth?: number;
  subgradeModulus?: number;
  segments?: FoundationBeamSegmentInput[];
  contactModel?: string;
  iteration?: {
    tolerance?: number;
    maxIterations?: number;
    relaxationFactor?: number;
  };
  metadata?: Record<string, unknown>;
}

export interface FoundationBeamModelOptions extends Partial<SingleBeamModelOptions> {
  foundation?: FoundationBeamDefinitionInput;
}

export interface FoundationBeamSegment {
  id: string;
  from: number;
  to: number;
  subgradeModulus: number;
  metadata: Record<string, unknown>;
  fromFem: number;
  toFem: number;
  subgradeModulusFem: number;
}

interface NormalizedFoundationBeamSegment {
  id: string;
  from: number;
  to: number;
  subgradeModulus: number;
  metadata: Record<string, unknown>;
}

export interface FoundationBeamDefinition {
  contactWidth: number;
  contactWidthFem: number;
  segments: FoundationBeamSegment[];
  contactModel: string;
  model: string;
  iteration: {
    tolerance: number;
    maxIterations: number;
    relaxationFactor: number;
  };
  metadata: Record<string, unknown>;
}

function finite(value: number, label: string): number {
  if (!Number.isFinite(value)) {
    throw new Error(`FoundationBeamModel requires a finite ${label}.`);
  }

  return value;
}

function positive(value: number, label: string): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`FoundationBeamModel requires a positive ${label}.`);
  }

  return value;
}

interface FoundationBeamGeometryInput {
  length?: number;
  start?: { x?: number; y?: number };
  end?: { x?: number; y?: number };
}

function geometryLength(geometry: FoundationBeamGeometryInput | null | undefined): number {
  if (typeof geometry?.length === "number" && Number.isFinite(geometry.length)) {
    return geometry.length;
  }

  const start = geometry?.start ?? { x: 0, y: 0 };
  const end = geometry?.end;

  if (
    !end ||
    typeof start.x !== "number" ||
    typeof start.y !== "number" ||
    typeof end.x !== "number" ||
    typeof end.y !== "number" ||
    !Number.isFinite(start.x) ||
    !Number.isFinite(start.y) ||
    !Number.isFinite(end.x) ||
    !Number.isFinite(end.y)
  ) {
    throw new Error(
      "FoundationBeamModel geometry requires length or finite start/end coordinates.",
    );
  }

  if (Math.abs(end.y - start.y) > 1e-12) {
    throw new Error("The first FoundationBeamModel supports only horizontal beams.");
  }

  return Math.abs(end.x - start.x);
}

function normalizeSegments(
  foundation: FoundationBeamDefinitionInput,
  span: number,
): NormalizedFoundationBeamSegment[] {
  const defaultSegment: FoundationBeamSegmentInput = { from: 0, to: span };
  if (foundation.subgradeModulus !== undefined) {
    defaultSegment.subgradeModulus = foundation.subgradeModulus;
  }
  const rawSegments: FoundationBeamSegmentInput[] = foundation.segments ?? [defaultSegment];

  if (!Array.isArray(rawSegments) || rawSegments.length === 0) {
    throw new Error("FoundationBeamModel requires at least one foundation segment.");
  }

  const segments = rawSegments
    .map((segment, index) => ({
      id: segment.id ?? `foundation-segment-${index + 1}`,
      from: finite(Number(segment.from ?? 0), `foundation.segments[${index}].from`),
      to: finite(Number(segment.to ?? span), `foundation.segments[${index}].to`),
      subgradeModulus: positive(
        Number(segment.subgradeModulus),
        `foundation.segments[${index}].subgradeModulus`,
      ),
      metadata: { ...segment.metadata },
    }))
    .sort((left, right) => left.from - right.from);
  const tolerance = Math.max(span * 1e-10, 1e-12);

  const first = segments[0];
  const last = segments.at(-1);
  if (!first || !last || Math.abs(first.from) > tolerance || Math.abs(last.to - span) > tolerance) {
    throw new Error("Foundation segments must cover the complete beam span.");
  }

  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];
    if (!segment) {
      throw new Error("Foundation segment is unavailable.");
    }

    if (
      segment.from < -tolerance ||
      segment.to > span + tolerance ||
      segment.to <= segment.from + tolerance
    ) {
      throw new Error("Each foundation segment must satisfy 0 <= from < to <= span.");
    }

    const previous = segments[index - 1];
    if (previous && Math.abs(segment.from - previous.to) > tolerance) {
      throw new Error("Foundation segments must be contiguous and non-overlapping.");
    }
  }

  return segments;
}

function settlementStations(loads: BeamLoadInput[], span: number): number[] {
  return loads
    .filter((load) => load.type === "soil-settlement")
    .flatMap((load) => [load.from ?? 0, load.to ?? span])
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
}

export class FoundationBeamModel extends SingleBeamModel {
  readonly foundation: FoundationBeamDefinition;

  constructor({ foundation = {}, ...beamInput }: FoundationBeamModelOptions = {}) {
    const span = positive(geometryLength(beamInput.geometry), "geometry length");
    const contactWidth = positive(Number(foundation.contactWidth), "foundation.contactWidth");
    const segments = normalizeSegments(foundation, span);
    const rawLoads = Array.isArray(beamInput.loads) ? beamInput.loads : [];
    const stations = [
      ...(typeof beamInput.discretization === "object" && beamInput.discretization
        ? ((beamInput.discretization.stations as number[] | undefined) ?? [])
        : []),
      ...segments.flatMap((segment) => [segment.from, segment.to]),
      ...settlementStations(rawLoads, span),
    ];

    super({
      ...beamInput,
      loads: rawLoads,
      discretization: {
        ...beamInput.discretization,
        stations: [...new Set(stations)],
      },
    } as SingleBeamModelOptions);

    const resolver = createUnitResolver(this.units, FEM_UNITS);

    this.foundation = {
      contactWidth,
      contactWidthFem: resolver.length(contactWidth),
      segments: segments.map((segment) => ({
        ...segment,
        fromFem: resolver.length(segment.from),
        toFem: resolver.length(segment.to),
        subgradeModulusFem: resolver.convert(segment.subgradeModulus, {
          forceExponent: 1,
          lengthExponent: -3,
        }),
      })),
      contactModel: foundation.contactModel ?? "bilateral",
      model:
        (foundation.contactModel ?? "bilateral") === "compression-only"
          ? "winkler-linear-compression-only-lumped"
          : "winkler-linear-bilateral-lumped",
      iteration: {
        tolerance: foundation.iteration?.tolerance ?? 1e-7,
        maxIterations: foundation.iteration?.maxIterations ?? 50,
        relaxationFactor: foundation.iteration?.relaxationFactor ?? 0.5,
      },
      metadata: { ...foundation.metadata },
    };
  }
}
