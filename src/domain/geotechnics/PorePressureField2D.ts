import {
  assertExplicitUnitSystem,
  createUnitResolver,
  type UnitSystemInput,
} from "../units/UnitSystem.js";
import { GroundProfile, type GroundwaterModel } from "./GroundProfile.js";
import { GEOTECHNICAL_INTERNAL_UNITS } from "./SoilMaterial.js";

export const PORE_PRESSURE_FIELD_2D_SCHEMA_VERSION = "pore-pressure-field-2d/v1";

export const PORE_PRESSURE_FIELD_2D_MODELS: readonly PorePressureField2DModel[] = Object.freeze([
  "none",
  "hydrostatic-horizontal",
  "phreatic-line",
  "assigned-grid",
]);

type PorePressureField2DModel =
  | "none"
  | "hydrostatic-horizontal"
  | "phreatic-line"
  | "assigned-grid";
type PorePressureOutsideDomainPolicy = "error" | "constant";

const OUTSIDE_DOMAIN_POLICIES: readonly PorePressureOutsideDomainPolicy[] = Object.freeze([
  "error",
  "constant",
]);
const TOLERANCE = 1e-12;

export interface PorePressurePoint {
  x: number;
  z: number;
}

export interface PorePressurePointInput {
  x?: number;
  z?: number;
}

export interface PorePressurePhreaticLine {
  points: PorePressurePoint[];
  metadata: Record<string, unknown>;
}

export interface PorePressurePhreaticLineInput {
  points?: PorePressurePointInput[];
  metadata?: Record<string, unknown>;
}

export interface PorePressureAssignedGrid {
  xCoordinates: number[];
  zCoordinates: number[];
  values: number[][];
  metadata: Record<string, unknown>;
}

export interface PorePressureAssignedGridInput {
  xCoordinates?: number[];
  zCoordinates?: number[];
  values?: number[][];
  metadata?: Record<string, unknown>;
}

export interface PorePressureField2DOptions {
  id?: string;
  name?: string | null;
  model?: string;
  waterTableElevation?: number | null;
  waterUnitWeight?: number;
  phreaticLine?: PorePressurePhreaticLineInput | null;
  assignedGrid?: PorePressureAssignedGridInput | null;
  outsideDomain?: string;
  units?: UnitSystemInput | null;
  metadata?: Record<string, unknown>;
}

export interface PorePressureField2DJson {
  schemaVersion: string;
  id: string;
  name: string;
  model: PorePressureField2DModel;
  waterTableElevation: number | null;
  waterUnitWeight: number | null;
  phreaticLine: PorePressurePhreaticLine | null;
  assignedGrid: PorePressureAssignedGrid | null;
  outsideDomain: PorePressureOutsideDomainPolicy;
  units: typeof GEOTECHNICAL_INTERNAL_UNITS;
  metadata: Record<string, unknown>;
}

function finite(value: unknown, label: string): number {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`${label} must be finite.`);
  return number;
}

function positive(value: unknown, label: string): number {
  const number = finite(value, label);
  if (number <= 0) throw new Error(`${label} must be positive.`);
  return number;
}

function isPorePressureModel(value: unknown): value is PorePressureField2DModel {
  return (
    value === "none" ||
    value === "hydrostatic-horizontal" ||
    value === "phreatic-line" ||
    value === "assigned-grid"
  );
}

function isOutsideDomainPolicy(value: unknown): value is PorePressureOutsideDomainPolicy {
  return value === "error" || value === "constant";
}

function normalizeOutsideDomain(value: unknown): PorePressureOutsideDomainPolicy {
  const policy = value ?? "error";
  if (!isOutsideDomainPolicy(policy)) {
    throw new Error(`outsideDomain must be one of: ${OUTSIDE_DOMAIN_POLICIES.join(", ")}.`);
  }
  return policy;
}

function strictlyIncreasing(values: number[], label: string): number[] {
  for (let index = 1; index < values.length; index += 1) {
    if (values[index]! <= values[index - 1]! + TOLERANCE) {
      throw new Error(`${label} must be strictly increasing.`);
    }
  }
  return values;
}

function isPointInputArray(value: unknown): value is PorePressurePointInput[] {
  return Array.isArray(value);
}

function isNumberArray(value: unknown): value is number[] {
  return Array.isArray(value);
}

function isNumberMatrix(value: unknown): value is number[][] {
  return Array.isArray(value);
}

function normalizePhreaticLine(
  line: PorePressurePhreaticLineInput | null | undefined,
  resolver: ReturnType<typeof createUnitResolver>,
): PorePressurePhreaticLine {
  if (!isPointInputArray(line?.points) || line.points.length < 2) {
    throw new Error("phreaticLine.points requires at least two points.");
  }
  const points = line.points.map((point, index) => ({
    x: resolver.length(finite(point?.x, `phreaticLine.points[${index}].x`)),
    z: resolver.length(finite(point?.z, `phreaticLine.points[${index}].z`)),
  }));
  strictlyIncreasing(
    points.map(({ x }) => x),
    "phreaticLine x coordinates",
  );
  return {
    points,
    metadata: structuredClone(line.metadata ?? {}),
  };
}

function normalizeAssignedGrid(
  grid: PorePressureAssignedGridInput | null | undefined,
  resolver: ReturnType<typeof createUnitResolver>,
): PorePressureAssignedGrid {
  if (!isNumberArray(grid?.xCoordinates) || grid.xCoordinates.length < 2) {
    throw new Error("assignedGrid.xCoordinates requires at least two values.");
  }
  if (!isNumberArray(grid?.zCoordinates) || grid.zCoordinates.length < 2) {
    throw new Error("assignedGrid.zCoordinates requires at least two values.");
  }
  const xCoordinates = strictlyIncreasing(
    grid.xCoordinates.map((value, index) =>
      resolver.length(finite(value, `assignedGrid.xCoordinates[${index}]`)),
    ),
    "assignedGrid.xCoordinates",
  );
  const zCoordinates = strictlyIncreasing(
    grid.zCoordinates.map((value, index) =>
      resolver.length(finite(value, `assignedGrid.zCoordinates[${index}]`)),
    ),
    "assignedGrid.zCoordinates",
  );
  if (!isNumberMatrix(grid.values) || grid.values.length !== zCoordinates.length) {
    throw new Error("assignedGrid.values must contain one row for each z coordinate.");
  }
  const values = grid.values.map((row, zIndex) => {
    if (!isNumberArray(row) || row.length !== xCoordinates.length) {
      throw new Error(
        `assignedGrid.values[${zIndex}] must contain one value for each x coordinate.`,
      );
    }
    return row.map((value, xIndex) =>
      resolver.stress(finite(value, `assignedGrid.values[${zIndex}][${xIndex}]`)),
    );
  });

  return {
    xCoordinates,
    zCoordinates,
    values,
    metadata: structuredClone(grid.metadata ?? {}),
  };
}

function interpolateLine(
  points: PorePressurePoint[],
  x: number,
  outsideDomain: PorePressureOutsideDomainPolicy,
): number {
  let coordinate = x;
  if (coordinate < points[0]!.x - TOLERANCE) {
    if (outsideDomain === "error") {
      throw new Error(`x=${x} lies outside the phreatic-line domain.`);
    }
    coordinate = points[0]!.x;
  }
  if (coordinate > points.at(-1)!.x + TOLERANCE) {
    if (outsideDomain === "error") {
      throw new Error(`x=${x} lies outside the phreatic-line domain.`);
    }
    coordinate = points.at(-1)!.x;
  }
  if (coordinate <= points[0]!.x + TOLERANCE) return points[0]!.z;
  if (coordinate >= points.at(-1)!.x - TOLERANCE) return points.at(-1)!.z;

  const index = points.findIndex(
    (point, pointIndex) =>
      pointIndex < points.length - 1 &&
      coordinate >= point.x - TOLERANCE &&
      coordinate <= points[pointIndex + 1]!.x + TOLERANCE,
  );
  const left = points[index]!;
  const right = points[index + 1]!;
  const ratio = (coordinate - left.x) / (right.x - left.x);
  return left.z + ratio * (right.z - left.z);
}

interface GridBracket {
  lower: number;
  upper: number;
  ratio: number;
}

function bracket(
  coordinates: number[],
  value: number,
  outsideDomain: PorePressureOutsideDomainPolicy,
  label: string,
): GridBracket {
  let coordinate = value;
  if (coordinate < coordinates[0]! - TOLERANCE) {
    if (outsideDomain === "error") {
      throw new Error(`${label}=${value} lies outside the assigned-grid domain.`);
    }
    coordinate = coordinates[0]!;
  }
  if (coordinate > coordinates.at(-1)! + TOLERANCE) {
    if (outsideDomain === "error") {
      throw new Error(`${label}=${value} lies outside the assigned-grid domain.`);
    }
    coordinate = coordinates.at(-1)!;
  }
  if (coordinate <= coordinates[0]! + TOLERANCE) {
    return { lower: 0, upper: 1, ratio: 0 };
  }
  if (coordinate >= coordinates.at(-1)! - TOLERANCE) {
    return {
      lower: coordinates.length - 2,
      upper: coordinates.length - 1,
      ratio: 1,
    };
  }
  const lower = coordinates.findIndex(
    (current, index) =>
      index < coordinates.length - 1 &&
      coordinate >= current - TOLERANCE &&
      coordinate <= coordinates[index + 1]! + TOLERANCE,
  );
  return {
    lower,
    upper: lower + 1,
    ratio: (coordinate - coordinates[lower]!) / (coordinates[lower + 1]! - coordinates[lower]!),
  };
}

function bilinearGridValue(
  grid: PorePressureAssignedGrid,
  x: number,
  z: number,
  outsideDomain: PorePressureOutsideDomainPolicy,
): number {
  const xBracket = bracket(grid.xCoordinates, x, outsideDomain, "x");
  const zBracket = bracket(grid.zCoordinates, z, outsideDomain, "z");
  const lowerZ = grid.values[zBracket.lower]!;
  const upperZ = grid.values[zBracket.upper]!;
  const lowerValue =
    lowerZ[xBracket.lower]! + xBracket.ratio * (lowerZ[xBracket.upper]! - lowerZ[xBracket.lower]!);
  const upperValue =
    upperZ[xBracket.lower]! + xBracket.ratio * (upperZ[xBracket.upper]! - upperZ[xBracket.lower]!);
  return lowerValue + zBracket.ratio * (upperValue - lowerValue);
}

export class PorePressureField2D {
  readonly schemaVersion: string;
  readonly id: string;
  readonly name: string;
  readonly model: PorePressureField2DModel;
  readonly waterTableElevation: number | null;
  readonly waterUnitWeight: number | null;
  readonly phreaticLine: PorePressurePhreaticLine | null;
  readonly assignedGrid: PorePressureAssignedGrid | null;
  readonly outsideDomain: PorePressureOutsideDomainPolicy;
  readonly units: typeof GEOTECHNICAL_INTERNAL_UNITS;
  readonly metadata: Record<string, unknown>;

  constructor({
    id,
    name = null,
    model = "none",
    waterTableElevation = null,
    waterUnitWeight = 9.81,
    phreaticLine = null,
    assignedGrid = null,
    outsideDomain = "error",
    units = null,
    metadata = {},
  }: PorePressureField2DOptions = {}) {
    if (!id) throw new Error("A PorePressureField2D id is required.");
    if (!isPorePressureModel(model)) {
      throw new Error(`Unsupported PorePressureField2D model: ${model}.`);
    }
    assertExplicitUnitSystem(units, "PorePressureField2D");
    const resolver = createUnitResolver(units, GEOTECHNICAL_INTERNAL_UNITS);
    const policy = normalizeOutsideDomain(outsideDomain);

    this.schemaVersion = PORE_PRESSURE_FIELD_2D_SCHEMA_VERSION;
    this.id = id;
    this.name = name ?? id;
    this.model = model;
    this.waterTableElevation =
      model === "hydrostatic-horizontal"
        ? resolver.length(finite(waterTableElevation, "waterTableElevation"))
        : null;
    this.waterUnitWeight = ["hydrostatic-horizontal", "phreatic-line"].includes(model)
      ? positive(resolver.volumeLoad(finite(waterUnitWeight, "waterUnitWeight")), "waterUnitWeight")
      : null;
    this.phreaticLine =
      model === "phreatic-line" ? normalizePhreaticLine(phreaticLine, resolver) : null;
    this.assignedGrid =
      model === "assigned-grid" ? normalizeAssignedGrid(assignedGrid, resolver) : null;
    this.outsideDomain = policy;
    this.units = GEOTECHNICAL_INTERNAL_UNITS;
    this.metadata = {
      ...structuredClone(metadata ?? {}),
      unitSystem: GEOTECHNICAL_INTERNAL_UNITS,
      sourceUnitSystem: resolver.sourceUnitSystem,
      pressureSignConvention: "positive-compression",
    };
  }

  static fromGroundProfile({
    profile,
    id = null,
    name = null,
  }: {
    profile?: GroundProfile;
    id?: string | null;
    name?: string | null;
  } = {}): PorePressureField2D {
    if (!(profile instanceof GroundProfile)) {
      throw new Error("PorePressureField2D.fromGroundProfile requires a GroundProfile.");
    }
    const groundwater: GroundwaterModel = profile.groundwater;
    return new PorePressureField2D({
      id: id ?? `${profile.id}-pore-pressure`,
      name: name ?? `${profile.name} pore pressure`,
      model: groundwater.model === "hydrostatic" ? "hydrostatic-horizontal" : "none",
      waterTableElevation:
        groundwater.model === "hydrostatic" ? groundwater.waterTableElevation : null,
      waterUnitWeight: groundwater.model === "hydrostatic" ? groundwater.waterUnitWeight : 9.81,
      units: GEOTECHNICAL_INTERNAL_UNITS,
      metadata: {
        sourceProfileId: profile.id,
        conversion: "ground-profile-groundwater",
      },
    });
  }

  waterElevationAt(x: number): number | null {
    if (this.model === "none" || this.model === "assigned-grid") return null;
    if (this.model === "hydrostatic-horizontal") {
      finite(x, "x");
      return this.waterTableElevation;
    }
    return interpolateLine(this.phreaticLine!.points, finite(x, "x"), this.outsideDomain);
  }

  porePressureAt({ x, z }: { x?: number; z?: number } = {}): number {
    const horizontal = finite(x, "point.x");
    const elevation = finite(z, "point.z");
    if (this.model === "none") return 0;
    if (this.model === "assigned-grid") {
      return bilinearGridValue(this.assignedGrid!, horizontal, elevation, this.outsideDomain);
    }
    const waterElevation = this.waterElevationAt(horizontal);
    return this.waterUnitWeight! * Math.max(waterElevation! - elevation, 0);
  }

  breakpointsAtX(x: number): number[] {
    const horizontal = finite(x, "x");
    if (this.model === "none") return [];
    if (this.model === "assigned-grid") {
      bracket(this.assignedGrid!.xCoordinates, horizontal, this.outsideDomain, "x");
      return [...this.assignedGrid!.zCoordinates];
    }
    const waterElevation = this.waterElevationAt(horizontal);
    return [waterElevation!];
  }

  toJSON(): PorePressureField2DJson {
    return {
      schemaVersion: this.schemaVersion,
      id: this.id,
      name: this.name,
      model: this.model,
      waterTableElevation: this.waterTableElevation,
      waterUnitWeight: this.waterUnitWeight,
      phreaticLine: structuredClone(this.phreaticLine),
      assignedGrid: structuredClone(this.assignedGrid),
      outsideDomain: this.outsideDomain,
      units: { ...this.units },
      metadata: structuredClone(this.metadata),
    };
  }
}
