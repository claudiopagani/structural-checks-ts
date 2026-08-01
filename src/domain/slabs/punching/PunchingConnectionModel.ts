import {
  assertExplicitUnitSystem,
  createUnitResolver,
  type UnitResolver,
  type UnitSystemInput,
} from "../../units/UnitSystem.js";
import type {
  NormalizedPunchingReinforcement,
  PunchingConnectionModelJson,
  PunchingConnectionModelOptions,
  PunchingDirection3D,
  PunchingFlexuralTension,
  PunchingFlexuralTensionDirection,
  PunchingFlexuralTensionDirectionInput,
  PunchingFlexuralTensionInput,
  PunchingFootprint,
  PunchingFootprintInput,
  PunchingLocalFrame,
  PunchingLocalFrameInput,
  PunchingMaterialMapInput,
  PunchingPlanPoint,
  PunchingReinforcement,
  PunchingReinforcementInput,
  PunchingSlabOpening,
  PunchingSlabOpeningInput,
  PunchingSupportPosition,
} from "./types.js";

const INTERNAL_UNITS = Object.freeze({
  force: "N",
  length: "mm",
}) satisfies UnitSystemInput;
const FRAME_TOLERANCE = 1e-6;

function finite(value: unknown, label: string): number {
  if (!Number.isFinite(value)) {
    throw new Error(`${label} must be finite.`);
  }
  return value as number;
}

function positive(value: unknown, label: string): number {
  const normalized = finite(value, label);
  if (normalized <= 0) {
    throw new Error(`${label} must be positive.`);
  }
  return normalized;
}

function vectorNorm(vector: PunchingDirection3D): number {
  return Math.hypot(vector.x, vector.y, vector.z);
}

function dot(first: PunchingDirection3D, second: PunchingDirection3D): number {
  return first.x * second.x + first.y * second.y + first.z * second.z;
}

function cross(first: PunchingDirection3D, second: PunchingDirection3D): PunchingDirection3D {
  return {
    x: first.y * second.z - first.z * second.y,
    y: first.z * second.x - first.x * second.z,
    z: first.x * second.y - first.y * second.x,
  };
}

function normalizeDirection(
  input: Partial<PunchingDirection3D> | undefined,
  fallback: PunchingDirection3D,
  label: string,
): PunchingDirection3D {
  const source = input ?? fallback;
  const vector = {
    x: finite(Number(source.x), `${label}.x`),
    y: finite(Number(source.y), `${label}.y`),
    z: finite(Number(source.z), `${label}.z`),
  };
  const norm = vectorNorm(vector);
  if (Math.abs(norm - 1) > FRAME_TOLERANCE) {
    throw new Error(`${label} must be a unit vector.`);
  }
  return { x: vector.x / norm, y: vector.y / norm, z: vector.z / norm };
}

function normalizeLocalFrame(
  input: PunchingLocalFrameInput | undefined,
  resolver: UnitResolver,
  connectionId: string,
): PunchingLocalFrame {
  const source = input ?? {};
  const xAxis = normalizeDirection(source.xAxis, { x: 1, y: 0, z: 0 }, "localFrame.xAxis");
  const yAxis = normalizeDirection(source.yAxis, { x: 0, y: 1, z: 0 }, "localFrame.yAxis");
  const derivedZ = cross(xAxis, yAxis);
  if (Math.abs(dot(xAxis, yAxis)) > FRAME_TOLERANCE) {
    throw new Error("localFrame.xAxis and localFrame.yAxis must be orthogonal.");
  }

  const zAxis =
    source.zAxis == null
      ? derivedZ
      : normalizeDirection(source.zAxis, derivedZ, "localFrame.zAxis");
  if (
    Math.abs(dot(xAxis, zAxis)) > FRAME_TOLERANCE ||
    Math.abs(dot(yAxis, zAxis)) > FRAME_TOLERANCE ||
    dot(derivedZ, zAxis) < 1 - FRAME_TOLERANCE
  ) {
    throw new Error("localFrame must be orthonormal and right-handed (xAxis cross yAxis = zAxis).");
  }

  return {
    id: source.id ?? `${connectionId}:local-frame`,
    origin: {
      x: resolver.length(finite(Number(source.origin?.x ?? 0), "localFrame.origin.x")),
      y: resolver.length(finite(Number(source.origin?.y ?? 0), "localFrame.origin.y")),
      z: resolver.length(finite(Number(source.origin?.z ?? 0), "localFrame.origin.z")),
    },
    xAxis,
    yAxis,
    zAxis,
  };
}

function pointsCoincide(first: PunchingPlanPoint, second: PunchingPlanPoint): boolean {
  return first.x === second.x && first.y === second.y;
}

function normalizePlanPoint(
  input: Partial<PunchingPlanPoint> | undefined,
  resolver: UnitResolver,
  label: string,
): PunchingPlanPoint {
  return {
    x: resolver.length(finite(Number(input?.x), `${label}.x`)),
    y: resolver.length(finite(Number(input?.y), `${label}.y`)),
  };
}

function signedArea(points: readonly PunchingPlanPoint[]): number {
  return (
    points.reduce((sum, point, index) => {
      const next = points[(index + 1) % points.length];
      if (!next) {
        return sum;
      }
      return sum + point.x * next.y - next.x * point.y;
    }, 0) / 2
  );
}

function normalizeRing(
  input: Array<Partial<PunchingPlanPoint>> | undefined,
  resolver: UnitResolver,
  label: string,
): PunchingPlanPoint[] {
  if (!Array.isArray(input) || input.length < 3) {
    throw new Error(`${label} must contain at least three plan points.`);
  }
  const points = input.map((planPoint, index) =>
    normalizePlanPoint(planPoint, resolver, `${label}[${index}]`),
  );
  const first = points[0];
  const last = points.at(-1);
  if (points.length > 3 && first && last && pointsCoincide(first, last)) {
    points.pop();
  }
  if (points.length < 3 || Math.abs(signedArea(points)) <= 1e-9) {
    throw new Error(`${label} must enclose a non-zero plan area.`);
  }
  return points;
}

function normalizeOpening(
  input: PunchingSlabOpeningInput | undefined,
  resolver: UnitResolver,
  index: number,
): PunchingSlabOpening {
  if (!input?.id) {
    throw new Error(`slab.openings[${index}].id is required.`);
  }
  return {
    id: input.id,
    boundary: normalizeRing(input.boundary, resolver, `slab.openings[${index}].boundary`),
  };
}

function normalizeFootprint(
  input: PunchingFootprintInput | undefined,
  resolver: UnitResolver,
): PunchingFootprint {
  if (!input?.shape) {
    throw new Error("support.footprint.shape is required.");
  }
  const center = normalizePlanPoint(
    input.center ?? { x: 0, y: 0 },
    resolver,
    "support.footprint.center",
  );

  if (input.shape === "circle") {
    return {
      shape: "circle",
      center,
      diameter: positive(resolver.length(Number(input.diameter)), "support.footprint.diameter"),
    };
  }
  if (input.shape === "rectangle") {
    return {
      shape: "rectangle",
      center,
      sizeX: positive(resolver.length(Number(input.sizeX)), "support.footprint.sizeX"),
      sizeY: positive(resolver.length(Number(input.sizeY)), "support.footprint.sizeY"),
      rotation: finite(Number(input.rotation ?? 0), "support.footprint.rotation"),
    };
  }
  if (input.shape === "polygon") {
    return {
      shape: "polygon",
      center,
      boundary: normalizeRing(input.boundary, resolver, "support.footprint.boundary"),
    };
  }
  throw new Error(
    `Unsupported support footprint shape: ${String((input as { shape?: unknown }).shape)}.`,
  );
}

function normalizeMemberIds(input: string[] | null | undefined, label: string): string[] {
  if (input == null) {
    return [];
  }
  if (!Array.isArray(input) || input.some((id) => typeof id !== "string" || id.length === 0)) {
    throw new Error(`${label} must be an array of non-empty member ids.`);
  }
  return [...input];
}

function normalizeSupportPosition(
  value: PunchingSupportPosition | null | undefined,
): PunchingSupportPosition | null {
  if (value == null) {
    return null;
  }
  if (!["interior", "edge", "corner"].includes(value)) {
    throw new Error("support.position must be interior, edge, corner or null.");
  }
  return value;
}

function normalizeFlexuralDirection(
  direction: PunchingFlexuralTensionDirectionInput | undefined,
  resolver: UnitResolver,
  label: string,
): PunchingFlexuralTensionDirection {
  const ratio = positive(Number(direction?.ratio), `${label}.ratio`);
  if (ratio >= 1) {
    throw new Error(`${label}.ratio must be lower than 1.`);
  }
  return {
    effectiveDepth: positive(
      resolver.length(Number(direction?.effectiveDepth)),
      `${label}.effectiveDepth`,
    ),
    ratio,
  };
}

function normalizeFlexuralTension(
  input: PunchingFlexuralTensionInput | null | undefined,
  resolver: UnitResolver,
): PunchingFlexuralTension | null {
  if (input == null) {
    return null;
  }
  return {
    x: normalizeFlexuralDirection(input.x, resolver, "reinforcement.flexuralTension.x"),
    y: normalizeFlexuralDirection(input.y, resolver, "reinforcement.flexuralTension.y"),
    source: structuredClone(input.source ?? { method: "explicit-effective-ratio" }),
  };
}

function optionalPositive(
  value: number | null | undefined,
  converter: (value: number) => number,
  label: string,
): number | null {
  if (value == null) {
    return null;
  }
  return positive(converter(Number(value)), label);
}

function normalizePunchingReinforcement(
  input: PunchingReinforcementInput["punching"],
  resolver: UnitResolver,
): NormalizedPunchingReinforcement {
  if (input == null || input.present !== true) {
    return { present: false };
  }
  const system = input.system;
  const orientation = input.orientation ?? "vertical";
  if (system !== "studs" && system !== "links") {
    throw new Error("reinforcement.punching.system must be studs or links.");
  }
  if (orientation !== "vertical") {
    throw new Error(
      "Only vertical punching reinforcement is represented by this contract version.",
    );
  }
  const steel = input.steel ?? {};
  const layout = input.layout ?? {};
  const perimeterCount = Number(layout.perimeterCount);
  if (!Number.isInteger(perimeterCount) || perimeterCount <= 0) {
    throw new Error("reinforcement.punching.layout.perimeterCount must be a positive integer.");
  }

  return {
    present: true,
    system,
    orientation,
    steel: {
      fywk: optionalPositive(steel.fywk, resolver.stress, "reinforcement.punching.steel.fywk"),
      gammaS: optionalPositive(
        steel.gammaS,
        (value) => value,
        "reinforcement.punching.steel.gammaS",
      ),
      fywd: optionalPositive(steel.fywd, resolver.stress, "reinforcement.punching.steel.fywd"),
    },
    layout: {
      legDiameter: optionalPositive(
        layout.legDiameter,
        resolver.length,
        "reinforcement.punching.layout.legDiameter",
      ),
      legArea: optionalPositive(
        layout.legArea,
        resolver.area,
        "reinforcement.punching.layout.legArea",
      ),
      areaPerPerimeter: optionalPositive(
        layout.areaPerPerimeter,
        resolver.area,
        "reinforcement.punching.layout.areaPerPerimeter",
      ),
      radialSpacing: optionalPositive(
        layout.radialSpacing,
        resolver.length,
        "reinforcement.punching.layout.radialSpacing",
      ),
      tangentialSpacing: optionalPositive(
        layout.tangentialSpacing,
        resolver.length,
        "reinforcement.punching.layout.tangentialSpacing",
      ),
      firstPerimeterOffset: optionalPositive(
        layout.firstPerimeterOffset,
        resolver.length,
        "reinforcement.punching.layout.firstPerimeterOffset",
      ),
      perimeterCount,
    },
    source: structuredClone(input.source ?? { method: "explicit-layout" }),
  };
}

function normalizeReinforcement(
  input: PunchingReinforcementInput | undefined,
  resolver: UnitResolver,
): PunchingReinforcement {
  const source = input ?? {};
  return {
    ...structuredClone(source),
    flexuralTension: normalizeFlexuralTension(source.flexuralTension, resolver),
    punching: normalizePunchingReinforcement(source.punching, resolver),
  };
}

function normalizeConcreteAggregate(
  input: (Record<string, unknown> & { lowerSize?: number }) | null | undefined,
  resolver: UnitResolver,
): Record<string, unknown> | null {
  if (input == null) {
    return null;
  }
  return {
    ...structuredClone(input),
    lowerSize: positive(
      resolver.length(Number(input.lowerSize)),
      "materials.concreteAggregate.lowerSize",
    ),
  };
}

function hasToJSON(value: unknown): value is { toJSON: () => unknown } {
  return (
    typeof value === "object" &&
    value !== null &&
    "toJSON" in value &&
    typeof value.toJSON === "function"
  );
}

function normalizeMaterials(
  materials: PunchingMaterialMapInput,
  resolver: UnitResolver,
): Record<string, unknown> {
  const concrete = materials.concrete;
  const normalizedConcrete =
    concrete == null || hasToJSON(concrete)
      ? (concrete ?? null)
      : {
          ...(structuredClone(concrete) as Record<string, unknown>),
          fck: positive(
            resolver.stress(Number((concrete as Record<string, unknown>).fck)),
            "materials.concrete.fck",
          ),
        };

  return {
    ...materials,
    concrete: normalizedConcrete,
    concreteAggregate: normalizeConcreteAggregate(materials.concreteAggregate, resolver),
  };
}

function serializeMaterialMap(materials: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(materials).map(([key, value]) => [
      key,
      hasToJSON(value) ? value.toJSON() : value,
    ]),
  );
}

export const PUNCHING_CONNECTION_SCHEMA_VERSION = "rc-punching-connection/v0";

export class PunchingConnectionModel {
  id: string;
  schemaVersion = PUNCHING_CONNECTION_SCHEMA_VERSION;
  units = INTERNAL_UNITS;
  localFrame: PunchingConnectionModelJson["localFrame"];
  slab: PunchingConnectionModelJson["slab"];
  support: PunchingConnectionModelJson["support"];
  materials: Record<string, unknown>;
  reinforcement: PunchingReinforcement;
  metadata: Record<string, unknown>;

  constructor({
    id,
    units = null,
    localFrame = {},
    slab = {},
    support = {},
    materials = {},
    reinforcement = {},
    metadata = {},
  }: PunchingConnectionModelOptions = {}) {
    if (!id) {
      throw new Error("A punching connection id is required.");
    }

    assertExplicitUnitSystem(units, "PunchingConnectionModel");
    const resolver = createUnitResolver(units, INTERNAL_UNITS);
    const thickness = positive(resolver.length(Number(slab.thickness)), "slab.thickness");
    if (!Array.isArray(slab.openings ?? [])) {
      throw new Error("slab.openings must be an array.");
    }

    const normalizedReinforcement = normalizeReinforcement(reinforcement, resolver);
    if (
      normalizedReinforcement.flexuralTension != null &&
      (normalizedReinforcement.flexuralTension.x.effectiveDepth >= thickness ||
        normalizedReinforcement.flexuralTension.y.effectiveDepth >= thickness)
    ) {
      throw new Error(
        "reinforcement.flexuralTension effective depths must be lower than slab.thickness.",
      );
    }

    this.id = id;
    this.localFrame = normalizeLocalFrame(localFrame, resolver, id);
    this.slab = {
      thickness,
      boundary: normalizeRing(slab.boundary, resolver, "slab.boundary"),
      openings: (slab.openings ?? []).map((opening, index) =>
        normalizeOpening(opening, resolver, index),
      ),
      beams: structuredClone(slab.beams ?? []),
    };
    this.support = {
      id: support.id ?? `${id}:support`,
      kind: support.kind ?? "supporting-area",
      position: normalizeSupportPosition(support.position),
      footprint: normalizeFootprint(support.footprint, resolver),
      capital: support.capital == null ? null : structuredClone(support.capital),
      memberIdsAbove: normalizeMemberIds(support.memberIdsAbove, "support.memberIdsAbove"),
      memberIdsBelow: normalizeMemberIds(support.memberIdsBelow, "support.memberIdsBelow"),
    };
    this.materials = normalizeMaterials(materials, resolver);
    this.reinforcement = normalizedReinforcement;
    this.metadata = {
      ...metadata,
      unitSystem: INTERNAL_UNITS,
      sourceUnitSystem: resolver.sourceUnitSystem,
      geometryScope: "planar-slab-boundary-and-support-footprint",
    };
  }

  toJSON(): PunchingConnectionModelJson {
    return {
      id: this.id,
      schemaVersion: this.schemaVersion,
      units: { ...this.units },
      localFrame: structuredClone(this.localFrame),
      slab: structuredClone(this.slab),
      support: structuredClone(this.support),
      materials: serializeMaterialMap(this.materials),
      reinforcement: structuredClone(this.reinforcement),
      metadata: { ...this.metadata },
    };
  }
}
