import {
  assertExplicitUnitSystem,
  createUnitResolver,
  type UnitSystemInput,
} from "../units/UnitSystem.js";
import { GEOTECHNICAL_INTERNAL_UNITS } from "./SoilMaterial.js";
import { ShallowFoundationModel } from "./ShallowFoundationModel.js";

export const RETAINING_WALL_MODEL_SCHEMA_VERSION = "retaining-wall-model/v1";

export type RetainingWallType = "cantilever-rc" | "generic-section";
export const RETAINING_WALL_TYPES = Object.freeze([
  "cantilever-rc",
  "generic-section",
]) satisfies readonly RetainingWallType[];

const TOLERANCE = 1e-10;
type RecordValue = Record<string, unknown>;

export interface RetainingWallPointInput {
  x?: number;
  z?: number;
}

export interface RetainingWallPoint {
  x: number;
  z: number;
}

export interface RetainingWallComponentInput {
  id?: string;
  name?: string;
  role?: string;
  materialId?: string | null;
  polygon?: RetainingWallPointInput[];
  unitWeight?: number;
  metadata?: RecordValue;
}

export interface RetainingWallComponent {
  id: string;
  name: string;
  role: string;
  materialId: string | null;
  polygon: RetainingWallPoint[];
  area: number;
  centroid: RetainingWallPoint;
  unitWeight: number;
  weightPerUnitWidth: number;
  metadata: RecordValue;
}

export interface RetainingWallFaceInput {
  bottom?: RetainingWallPointInput;
  top?: RetainingWallPointInput;
}

export interface RetainingWallFace {
  bottom: RetainingWallPoint;
  top: RetainingWallPoint;
  inclinationFromVertical: number;
  inclinationPositiveDirection: "wall-top-toward-retained-side";
}

export interface RetainingWallPlacementInput {
  originX?: number;
  baseElevation?: number;
}

export interface RetainingWallBaseInput {
  toeX?: number;
  heelX?: number;
}

export interface RetainingWallGeometryInput {
  toeLength?: number;
  heelLength?: number;
  baseThickness?: number;
  stemHeight?: number;
  stemBaseThickness?: number;
  stemTopThickness?: number;
  retainedFaceInclinationFromVertical?: number;
}

export interface RetainingWallModelOptions {
  id?: string;
  name?: string | null;
  type?: string;
  placement?: RetainingWallPlacementInput;
  base?: RetainingWallBaseInput;
  components?: RetainingWallComponentInput[];
  retainedFace?: RetainingWallFaceInput;
  frontFace?: RetainingWallFaceInput | null;
  retainedSoil?: { heelPoint?: RetainingWallPointInput };
  interfaces?: {
    retainedFaceId?: string | null;
    frontFaceId?: string | null;
    baseId?: string | null;
  };
  units?: UnitSystemInput | null;
  metadata?: RecordValue;
}

export interface RetainingWallModelJson {
  schemaVersion: string;
  id: string;
  name: string;
  type: RetainingWallType;
  placement: { originX: number; baseElevation: number };
  base: { toeX: number; heelX: number; width: number; referenceElevation: number };
  components: RetainingWallComponent[];
  retainedFace: RetainingWallFace;
  frontFace: RetainingWallFace | null;
  retainedSoil: { heelPoint: RetainingWallPoint };
  interfaces: {
    retainedFaceId: string | null;
    frontFaceId: string | null;
    baseId: string | null;
  };
  units: typeof GEOTECHNICAL_INTERNAL_UNITS;
  metadata: RecordValue;
}

export interface RetainingWallCantileverOptions {
  id?: string;
  name?: string | null;
  geometry?: RetainingWallGeometryInput;
  concreteUnitWeight?: number;
  placement?: RetainingWallPlacementInput;
  interfaces?: RetainingWallModelOptions["interfaces"];
  angleUnits?: string;
  units?: UnitSystemInput | null;
  metadata?: RecordValue;
}

function isRetainingWallType(value: unknown): value is RetainingWallType {
  return value === "cantilever-rc" || value === "generic-section";
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

function normalizeAngle(value: unknown, angleUnits: unknown, label: string): number {
  const number = finite(value, label);
  if (angleUnits === "deg") return (number * Math.PI) / 180;
  if (angleUnits === "rad") return number;
  throw new Error(`${label} requires angleUnits equal to "deg" or "rad".`);
}

function normalizePoint(
  point: RetainingWallPointInput | undefined,
  resolver: ReturnType<typeof createUnitResolver>,
  label: string,
): RetainingWallPoint {
  return {
    x: resolver.length(finite(point?.x, `${label}.x`)),
    z: resolver.length(finite(point?.z, `${label}.z`)),
  };
}

function cross(first: RetainingWallPoint, second: RetainingWallPoint, third: RetainingWallPoint) {
  return (second.x - first.x) * (third.z - first.z) - (second.z - first.z) * (third.x - first.x);
}

function onSegment(
  first: RetainingWallPoint,
  second: RetainingWallPoint,
  point: RetainingWallPoint,
): boolean {
  return (
    Math.abs(cross(first, second, point)) <= TOLERANCE &&
    point.x >= Math.min(first.x, second.x) - TOLERANCE &&
    point.x <= Math.max(first.x, second.x) + TOLERANCE &&
    point.z >= Math.min(first.z, second.z) - TOLERANCE &&
    point.z <= Math.max(first.z, second.z) + TOLERANCE
  );
}

function segmentsIntersect(
  first: RetainingWallPoint,
  second: RetainingWallPoint,
  third: RetainingWallPoint,
  fourth: RetainingWallPoint,
): boolean {
  const c1 = cross(first, second, third);
  const c2 = cross(first, second, fourth);
  const c3 = cross(third, fourth, first);
  const c4 = cross(third, fourth, second);
  if (
    ((c1 > TOLERANCE && c2 < -TOLERANCE) || (c1 < -TOLERANCE && c2 > TOLERANCE)) &&
    ((c3 > TOLERANCE && c4 < -TOLERANCE) || (c3 < -TOLERANCE && c4 > TOLERANCE))
  ) {
    return true;
  }
  return (
    onSegment(first, second, third) ||
    onSegment(first, second, fourth) ||
    onSegment(third, fourth, first) ||
    onSegment(third, fourth, second)
  );
}

function validateSimplePolygon(points: RetainingWallPoint[], label: string): void {
  for (let index = 0; index < points.length; index += 1) {
    const next = (index + 1) % points.length;
    for (let candidate = index + 1; candidate < points.length; candidate += 1) {
      const candidateNext = (candidate + 1) % points.length;
      const adjacent = index === candidate || next === candidate || candidateNext === index;
      if (adjacent) continue;
      const first = points[index];
      const second = points[next];
      const third = points[candidate];
      const fourth = points[candidateNext];
      if (first && second && third && fourth && segmentsIntersect(first, second, third, fourth)) {
        throw new Error(`${label} must be a simple non-self-intersecting polygon.`);
      }
    }
  }
}

export function calculateRetainingWallPolygonProperties(points: RetainingWallPoint[]): {
  area: number;
  signedArea: number;
  centroid: RetainingWallPoint;
} {
  if (!Array.isArray(points) || points.length < 3) {
    throw new Error("A retaining-wall polygon requires at least three points.");
  }
  let doubledArea = 0;
  let firstMomentX = 0;
  let firstMomentZ = 0;
  for (let index = 0; index < points.length; index += 1) {
    const first = points[index];
    const second = points[(index + 1) % points.length];
    if (!first || !second) throw new Error("A retaining-wall polygon requires valid points.");
    const term = first.x * second.z - second.x * first.z;
    doubledArea += term;
    firstMomentX += (first.x + second.x) * term;
    firstMomentZ += (first.z + second.z) * term;
  }
  if (Math.abs(doubledArea) <= TOLERANCE) {
    throw new Error("A retaining-wall polygon must have nonzero area.");
  }
  return {
    area: Math.abs(doubledArea) / 2,
    signedArea: doubledArea / 2,
    centroid: {
      x: firstMomentX / (3 * doubledArea),
      z: firstMomentZ / (3 * doubledArea),
    },
  };
}

function normalizeComponent(
  component: RetainingWallComponentInput,
  resolver: ReturnType<typeof createUnitResolver>,
  index: number,
): RetainingWallComponent {
  const label = `components[${index}]`;
  if (!component?.id) throw new Error(`${label}.id is required.`);
  if (!Array.isArray(component.polygon) || component.polygon.length < 3) {
    throw new Error(`${label}.polygon requires at least three points.`);
  }
  const polygon = component.polygon.map((point, pointIndex) =>
    normalizePoint(point, resolver, `${label}.polygon[${pointIndex}]`),
  );
  validateSimplePolygon(polygon, `${label}.polygon`);
  const properties = calculateRetainingWallPolygonProperties(polygon);
  const unitWeight = resolver.volumeLoad(positive(component.unitWeight, `${label}.unitWeight`));
  return {
    id: component.id,
    name: component.name ?? component.id,
    role: component.role ?? "body",
    materialId: component.materialId ?? null,
    polygon,
    area: properties.area,
    centroid: properties.centroid,
    unitWeight,
    weightPerUnitWidth: properties.area * unitWeight,
    metadata: structuredClone(component.metadata ?? {}),
  };
}

function normalizeFace(
  face: RetainingWallFaceInput | undefined,
  resolver: ReturnType<typeof createUnitResolver>,
  label: string,
): RetainingWallFace {
  const bottom = normalizePoint(face?.bottom, resolver, `${label}.bottom`);
  const top = normalizePoint(face?.top, resolver, `${label}.top`);
  if (top.z <= bottom.z + TOLERANCE) {
    throw new Error(`${label}.top must lie above ${label}.bottom.`);
  }
  return {
    bottom,
    top,
    inclinationFromVertical: Math.atan2(top.x - bottom.x, top.z - bottom.z),
    inclinationPositiveDirection: "wall-top-toward-retained-side",
  };
}

function normalizeInterfaces(interfaces: RetainingWallModelOptions["interfaces"] = {}) {
  return {
    retainedFaceId: interfaces.retainedFaceId ?? null,
    frontFaceId: interfaces.frontFaceId ?? null,
    baseId: interfaces.baseId ?? null,
  };
}

export class RetainingWallModel {
  schemaVersion: string;
  id: string;
  name: string;
  type: RetainingWallType;
  placement: { originX: number; baseElevation: number };
  base: { toeX: number; heelX: number; width: number; referenceElevation: number };
  components: RetainingWallComponent[];
  retainedFace: RetainingWallFace;
  frontFace: RetainingWallFace | null;
  retainedSoil: { heelPoint: RetainingWallPoint };
  interfaces: {
    retainedFaceId: string | null;
    frontFaceId: string | null;
    baseId: string | null;
  };
  units: typeof GEOTECHNICAL_INTERNAL_UNITS;
  metadata: RecordValue;

  constructor({
    id,
    name = null,
    type = "generic-section",
    placement = {},
    base = {},
    components = [],
    retainedFace,
    frontFace = null,
    retainedSoil = {},
    interfaces = {},
    units = null,
    metadata = {},
  }: RetainingWallModelOptions = {}) {
    if (!id) throw new Error("A RetainingWallModel id is required.");
    if (!isRetainingWallType(type)) {
      throw new Error(`Unsupported retaining-wall type: ${type}.`);
    }
    assertExplicitUnitSystem(units, "RetainingWallModel");
    const resolver = createUnitResolver(units, GEOTECHNICAL_INTERNAL_UNITS);
    const toeX = resolver.length(finite(base.toeX, "base.toeX"));
    const heelX = resolver.length(finite(base.heelX, "base.heelX"));
    if (heelX <= toeX + TOLERANCE) {
      throw new Error("base.heelX must exceed base.toeX.");
    }
    if (!Array.isArray(components) || components.length === 0) {
      throw new Error("RetainingWallModel requires at least one component.");
    }
    const normalizedComponents = components.map((component, index) =>
      normalizeComponent(component, resolver, index),
    );
    const componentIds = normalizedComponents.map(({ id: componentId }) => componentId);
    if (new Set(componentIds).size !== componentIds.length) {
      throw new Error("RetainingWallModel component ids must be unique.");
    }
    const normalizedRetainedFace = normalizeFace(retainedFace, resolver, "retainedFace");
    const normalizedFrontFace =
      frontFace == null ? null : normalizeFace(frontFace, resolver, "frontFace");
    const heelPoint = normalizePoint(retainedSoil.heelPoint, resolver, "retainedSoil.heelPoint");
    if (Math.abs(heelPoint.x - heelX) > TOLERANCE) {
      throw new Error("retainedSoil.heelPoint.x must equal base.heelX.");
    }
    if (heelPoint.z > normalizedRetainedFace.top.z + TOLERANCE) {
      throw new Error("retainedSoil.heelPoint must lie below the retained-face top.");
    }

    this.schemaVersion = RETAINING_WALL_MODEL_SCHEMA_VERSION;
    this.id = id;
    this.name = name ?? id;
    this.type = type;
    this.placement = {
      originX: resolver.length(finite(placement.originX ?? 0, "placement.originX")),
      baseElevation: resolver.length(finite(placement.baseElevation, "placement.baseElevation")),
    };
    this.base = { toeX, heelX, width: heelX - toeX, referenceElevation: 0 };
    this.components = normalizedComponents;
    this.retainedFace = normalizedRetainedFace;
    this.frontFace = normalizedFrontFace;
    this.retainedSoil = { heelPoint };
    this.interfaces = normalizeInterfaces(interfaces);
    this.units = GEOTECHNICAL_INTERNAL_UNITS;
    this.metadata = {
      ...structuredClone(metadata ?? {}),
      unitSystem: GEOTECHNICAL_INTERNAL_UNITS,
      sourceUnitSystem: resolver.sourceUnitSystem,
      coordinateSystem: {
        origin: "local-model-origin",
        x: "positive-from-toe-toward-retained-side",
        z: "positive-upward-from-base-contact-plane",
        outOfPlaneBasis: "one-unit-width",
      },
    };
  }

  static cantilever({
    id,
    name = null,
    geometry = {},
    concreteUnitWeight,
    placement = {},
    interfaces = {},
    angleUnits = "rad",
    units = null,
    metadata = {},
  }: RetainingWallCantileverOptions = {}): RetainingWallModel {
    assertExplicitUnitSystem(units, "RetainingWallModel.cantilever");
    const resolver = createUnitResolver(units, GEOTECHNICAL_INTERNAL_UNITS);
    const toeLength = resolver.length(positive(geometry.toeLength, "geometry.toeLength"));
    const heelLength = resolver.length(positive(geometry.heelLength, "geometry.heelLength"));
    const baseThickness = resolver.length(
      positive(geometry.baseThickness, "geometry.baseThickness"),
    );
    const stemHeight = resolver.length(positive(geometry.stemHeight, "geometry.stemHeight"));
    const stemBaseThickness = resolver.length(
      positive(geometry.stemBaseThickness, "geometry.stemBaseThickness"),
    );
    const stemTopThickness = resolver.length(
      positive(geometry.stemTopThickness, "geometry.stemTopThickness"),
    );
    if (stemTopThickness > stemBaseThickness + TOLERANCE) {
      throw new Error("stemTopThickness must not exceed stemBaseThickness.");
    }
    const inclination = normalizeAngle(
      geometry.retainedFaceInclinationFromVertical ?? 0,
      angleUnits,
      "geometry.retainedFaceInclinationFromVertical",
    );
    if (Math.abs(inclination) >= Math.PI / 2) {
      throw new Error("The retained-face inclination must be below 90 degrees.");
    }
    const baseWidth = toeLength + stemBaseThickness + heelLength;
    const retainedBottom = { x: toeLength + stemBaseThickness, z: baseThickness };
    const retainedTop = {
      x: retainedBottom.x + stemHeight * Math.tan(inclination),
      z: baseThickness + stemHeight,
    };
    const frontBottom = { x: toeLength, z: baseThickness };
    const frontTop = { x: retainedTop.x - stemTopThickness, z: retainedTop.z };
    if (frontTop.x <= 0 || retainedTop.x >= baseWidth) {
      throw new Error("The inclined stem top must remain inside the base plan projection.");
    }
    const normalizedUnitWeight = resolver.volumeLoad(
      positive(concreteUnitWeight, "concreteUnitWeight"),
    );
    const internalPlacement = {
      originX: resolver.length(finite(placement.originX ?? 0, "placement.originX")),
      baseElevation: resolver.length(finite(placement.baseElevation, "placement.baseElevation")),
    };
    return new RetainingWallModel({
      id: id ?? "",
      name,
      type: "cantilever-rc",
      placement: internalPlacement,
      base: { toeX: 0, heelX: baseWidth },
      components: [
        {
          id: "base",
          role: "base",
          unitWeight: normalizedUnitWeight,
          polygon: [
            { x: 0, z: 0 },
            { x: baseWidth, z: 0 },
            { x: baseWidth, z: baseThickness },
            { x: 0, z: baseThickness },
          ],
        },
        {
          id: "stem",
          role: "stem",
          unitWeight: normalizedUnitWeight,
          polygon: [frontBottom, retainedBottom, retainedTop, frontTop],
        },
      ],
      retainedFace: { bottom: retainedBottom, top: retainedTop },
      frontFace: { bottom: frontBottom, top: frontTop },
      retainedSoil: { heelPoint: { x: baseWidth, z: baseThickness } },
      interfaces,
      units: GEOTECHNICAL_INTERNAL_UNITS,
      metadata: {
        ...structuredClone(metadata ?? {}),
        generator: "cantilever-parametric-v1",
        inputGeometry: {
          toeLength,
          heelLength,
          baseThickness,
          stemHeight,
          stemBaseThickness,
          stemTopThickness,
          retainedFaceInclinationFromVertical: inclination,
        },
      },
    });
  }

  get toeGlobalX(): number {
    return this.placement.originX + this.base.toeX;
  }

  get heelGlobalX(): number {
    return this.placement.originX + this.base.heelX;
  }

  get baseGlobalElevation(): number {
    return this.placement.baseElevation;
  }

  toGlobalPoint(point: RetainingWallPoint): RetainingWallPoint {
    return {
      x: this.placement.originX + point.x,
      z: this.placement.baseElevation + point.z,
    };
  }

  toShallowFoundationModel({
    id = null,
    name = null,
  }: { id?: string | null; name?: string | null } = {}) {
    return new ShallowFoundationModel({
      id: id ?? `${this.id}-base`,
      name: name ?? `${this.name} base`,
      shape: "strip",
      geometry: { width: this.base.width },
      placement: {
        x: this.placement.originX + (this.base.toeX + this.base.heelX) / 2,
        y: 0,
        baseElevation: this.placement.baseElevation,
      },
      units: GEOTECHNICAL_INTERNAL_UNITS,
      metadata: {
        sourceRetainingWallId: this.id,
        sourceModel: RETAINING_WALL_MODEL_SCHEMA_VERSION,
      },
    });
  }

  toJSON(): RetainingWallModelJson {
    return {
      schemaVersion: this.schemaVersion,
      id: this.id,
      name: this.name,
      type: this.type,
      placement: { ...this.placement },
      base: { ...this.base },
      components: structuredClone(this.components),
      retainedFace: structuredClone(this.retainedFace),
      frontFace: structuredClone(this.frontFace),
      retainedSoil: structuredClone(this.retainedSoil),
      interfaces: { ...this.interfaces },
      units: { ...this.units },
      metadata: structuredClone(this.metadata),
    };
  }
}
