import {
  assertExplicitUnitSystem,
  createUnitResolver,
  FORCE_UNIT_FACTORS,
  LENGTH_UNIT_FACTORS,
  type ForceUnit,
  type LengthUnit,
  type UnitSystem,
  type UnitSystemInput,
} from "../units/UnitSystem.js";
import { CircularSlipSurface2D } from "./CircularSlipSurface2D.js";
import { GEOTECHNICAL_INTERNAL_UNITS } from "./SoilMaterial.js";

export const GROUND_ANCHOR_STABILITY_ACTION_2D_SCHEMA_VERSION =
  "ground-anchor-stability-action-2d/v1";

export const GROUND_ANCHOR_STABILITY_FORCE_MODELS = Object.freeze([
  "fhwa-uniform-bond-proportional",
] as const);

export const GROUND_ANCHOR_STABILITY_REFERENCE = Object.freeze({
  title: "FHWA GEC 4, Ground Anchors and Anchored Systems",
  publication: "FHWA-IF-99-015",
  year: 1999,
  section: "5.8.3.2",
  url: "https://www.fhwa.dot.gov/engineering/geotech/pubs/if99015.pdf",
});

const RESULT_STATUSES = Object.freeze([
  "ok",
  "not-verified",
  "not-supported",
  "not-analyzed",
  "not-implemented",
  "failed",
] as const);

const TOLERANCE = 1e-9;

export type GroundAnchorSourceVerificationStatus = (typeof RESULT_STATUSES)[number];
export type GroundAnchorStabilityForceModel = (typeof GROUND_ANCHOR_STABILITY_FORCE_MODELS)[number];

export interface GroundAnchorPoint {
  x: number;
  z: number;
}

export interface GroundAnchorPointInput {
  x?: unknown;
  z?: unknown;
}

export interface GroundAnchorStabilityAction2DOptions {
  id?: string;
  head?: GroundAnchorPointInput | undefined;
  bondStart?: GroundAnchorPointInput | undefined;
  bondEnd?: GroundAnchorPointInput | undefined;
  designTendonForce?: unknown;
  horizontalSpacing?: unknown;
  sourceVerificationStatus?: string;
  forceModel?: string;
  units?: UnitSystemInput | null;
  provenance?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
}

export interface GroundAnchorStabilityAction2DJson {
  schemaVersion: string;
  id: string;
  head: GroundAnchorPoint;
  bondStart: GroundAnchorPoint;
  bondEnd: GroundAnchorPoint;
  freeLength: number;
  bondLength: number;
  totalLength: number;
  axisUnitVector: GroundAnchorPoint;
  designTendonForce: number;
  horizontalSpacing: number;
  designTendonForcePerUnitWidth: number;
  sourceVerificationStatus: GroundAnchorSourceVerificationStatus;
  forceModel: GroundAnchorStabilityForceModel;
  provenance: Record<string, unknown>;
  units: UnitSystem;
  metadata: Record<string, unknown>;
}

export type GroundAnchorStabilityRelation =
  | "behind-bond-zone"
  | "no-axis-crossing"
  | "in-front-of-bond-zone"
  | "through-bond-zone"
  | "at-or-behind-bond-end";

export interface GroundAnchorStabilityEvaluation {
  anchorId: string;
  status: "mobilized" | "not-mobilized";
  relation: GroundAnchorStabilityRelation;
  intersection: GroundAnchorPoint | null;
  intersectionDistance: number | null;
  remainingBondLength: number;
  mobilizationRatio: number;
  mobilizedTendonForce: number;
  mobilizedForcePerUnitWidth: number;
  globalForcePerUnitWidth: GroundAnchorPoint;
  horizontalForceInMovementDirection: number;
  verticalDownwardForce: number;
  drivingMoment: number;
  forceModel: GroundAnchorStabilityForceModel;
}

interface GroundAnchorResultOptions {
  id?: string | null;
  metadata?: Record<string, unknown>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function property(value: unknown, key: string): unknown {
  return value !== null && typeof value === "object" ? Reflect.get(value, key) : undefined;
}

function hasToJSON(value: unknown): value is { toJSON(): unknown } {
  return (
    value !== null &&
    typeof value === "object" &&
    typeof Reflect.get(value, "toJSON") === "function"
  );
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

function point(
  value: GroundAnchorPointInput | undefined,
  resolver: ReturnType<typeof createUnitResolver>,
  label: string,
): GroundAnchorPoint {
  return {
    x: resolver.length(finite(value?.x, `${label}.x`)),
    z: resolver.length(finite(value?.z, `${label}.z`)),
  };
}

function pointInput(value: unknown): GroundAnchorPointInput | undefined {
  if (value === null || typeof value !== "object") return undefined;
  return { x: property(value, "x"), z: property(value, "z") };
}

function provenance(value: Record<string, unknown> | null | undefined): Record<string, unknown> {
  const normalized = structuredClone(value ?? {});
  if (typeof normalized.source !== "string" || !normalized.source.trim()) {
    throw new Error("Ground-anchor stability action provenance.source is required.");
  }
  normalized.source = normalized.source.trim();
  return normalized;
}

function normalizedResult(value: unknown): unknown {
  return hasToJSON(value) ? value.toJSON() : value;
}

function pointDistance(first: GroundAnchorPoint, second: GroundAnchorPoint): number {
  return Math.hypot(second.x - first.x, second.z - first.z);
}

function projectionAlongAxis(
  pointValue: GroundAnchorPoint,
  head: GroundAnchorPoint,
  unitVector: GroundAnchorPoint,
): number {
  return (pointValue.x - head.x) * unitVector.x + (pointValue.z - head.z) * unitVector.z;
}

function bounded(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function isOnMovingSideOfSurface(
  pointValue: GroundAnchorPoint,
  slipSurface: CircularSlipSurface2D,
  tolerance: number,
): boolean {
  if (
    slipSurface.entryX != null &&
    (pointValue.x < slipSurface.entryX - tolerance || pointValue.x > slipSurface.exitX! + tolerance)
  ) {
    return false;
  }
  try {
    return pointValue.z >= slipSurface.lowerElevationAt(pointValue.x) - tolerance;
  } catch {
    return false;
  }
}

function isSourceVerificationStatus(value: string): value is GroundAnchorSourceVerificationStatus {
  return RESULT_STATUSES.some((status) => status === value);
}

function isForceModel(value: string): value is GroundAnchorStabilityForceModel {
  return GROUND_ANCHOR_STABILITY_FORCE_MODELS.some((model) => model === value);
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : String(value);
}

function isForceUnit(value: unknown): value is ForceUnit {
  return typeof value === "string" && Object.hasOwn(FORCE_UNIT_FACTORS, value);
}

function isLengthUnit(value: unknown): value is LengthUnit {
  return typeof value === "string" && Object.hasOwn(LENGTH_UNIT_FACTORS, value);
}

function resultUnits(value: unknown): UnitSystemInput {
  if (!isRecord(value)) return GEOTECHNICAL_INTERNAL_UNITS;
  const force = property(value, "force");
  const length = property(value, "length");
  if (force != null && !isForceUnit(force)) {
    throw new Error(`Unsupported force unit: ${stringValue(force)}.`);
  }
  if (length != null && !isLengthUnit(length)) {
    throw new Error(`Unsupported length unit: ${stringValue(length)}.`);
  }
  const units: UnitSystemInput = {};
  if (isForceUnit(force)) units.force = force;
  if (isLengthUnit(length)) units.length = length;
  return units;
}

export class GroundAnchorStabilityAction2D {
  schemaVersion: string;
  id: string;
  head: GroundAnchorPoint;
  bondStart: GroundAnchorPoint;
  bondEnd: GroundAnchorPoint;
  freeLength: number;
  bondLength: number;
  totalLength: number;
  axisUnitVector: GroundAnchorPoint;
  designTendonForce: number;
  horizontalSpacing: number;
  designTendonForcePerUnitWidth: number;
  sourceVerificationStatus: GroundAnchorSourceVerificationStatus;
  forceModel: GroundAnchorStabilityForceModel;
  provenance: Record<string, unknown>;
  units: UnitSystem;
  metadata: Record<string, unknown>;

  constructor({
    id,
    head,
    bondStart,
    bondEnd,
    designTendonForce,
    horizontalSpacing,
    sourceVerificationStatus = "not-analyzed",
    forceModel = "fhwa-uniform-bond-proportional",
    units = null,
    provenance: provenanceInput = null,
    metadata = {},
  }: GroundAnchorStabilityAction2DOptions = {}) {
    if (!id) throw new Error("A GroundAnchorStabilityAction2D id is required.");
    assertExplicitUnitSystem(units, "GroundAnchorStabilityAction2D");
    if (!isSourceVerificationStatus(sourceVerificationStatus)) {
      throw new Error(
        `Unsupported ground-anchor source verification status: ${sourceVerificationStatus}.`,
      );
    }
    if (!isForceModel(forceModel)) {
      throw new Error(`Unsupported ground-anchor stability force model: ${forceModel}.`);
    }
    const resolver = createUnitResolver(units, GEOTECHNICAL_INTERNAL_UNITS);
    const normalizedHead = point(head, resolver, "head");
    const normalizedBondStart = point(bondStart, resolver, "bondStart");
    const normalizedBondEnd = point(bondEnd, resolver, "bondEnd");
    const totalLength = pointDistance(normalizedHead, normalizedBondEnd);
    const freeLength = pointDistance(normalizedHead, normalizedBondStart);
    const bondLength = pointDistance(normalizedBondStart, normalizedBondEnd);
    if (totalLength <= TOLERANCE || freeLength <= TOLERANCE || bondLength <= TOLERANCE) {
      throw new Error("Ground-anchor stability geometry requires positive free and bond lengths.");
    }
    const unitVector = {
      x: (normalizedBondEnd.x - normalizedHead.x) / totalLength,
      z: (normalizedBondEnd.z - normalizedHead.z) / totalLength,
    };
    const bondStartProjection = projectionAlongAxis(
      normalizedBondStart,
      normalizedHead,
      unitVector,
    );
    const bondStartOffset = Math.hypot(
      normalizedBondStart.x - normalizedHead.x - bondStartProjection * unitVector.x,
      normalizedBondStart.z - normalizedHead.z - bondStartProjection * unitVector.z,
    );
    const scale = Math.max(1, totalLength);
    if (
      bondStartOffset > TOLERANCE * scale ||
      bondStartProjection <= TOLERANCE ||
      bondStartProjection >= totalLength - TOLERANCE
    ) {
      throw new Error(
        "head, bondStart and bondEnd must lie in this order on one straight anchor axis.",
      );
    }

    this.schemaVersion = GROUND_ANCHOR_STABILITY_ACTION_2D_SCHEMA_VERSION;
    this.id = String(id);
    this.head = normalizedHead;
    this.bondStart = normalizedBondStart;
    this.bondEnd = normalizedBondEnd;
    this.freeLength = bondStartProjection;
    this.bondLength = totalLength - bondStartProjection;
    this.totalLength = totalLength;
    this.axisUnitVector = unitVector;
    this.designTendonForce = positive(
      resolver.force(finite(designTendonForce, "designTendonForce")),
      "designTendonForce",
    );
    this.horizontalSpacing = positive(
      resolver.length(finite(horizontalSpacing, "horizontalSpacing")),
      "horizontalSpacing",
    );
    this.designTendonForcePerUnitWidth = this.designTendonForce / this.horizontalSpacing;
    this.sourceVerificationStatus = sourceVerificationStatus;
    this.forceModel = forceModel;
    this.provenance = provenance(provenanceInput);
    this.units = GEOTECHNICAL_INTERNAL_UNITS;
    this.metadata = {
      ...structuredClone(metadata ?? {}),
      unitSystem: GEOTECHNICAL_INTERNAL_UNITS,
      sourceUnitSystem: resolver.sourceUnitSystem,
      forceSelection: "design-tendon-force",
      outOfPlaneConversion: "one-anchor-force-divided-by-horizontal-spacing",
    };
  }

  static fromGroundAnchorResult(
    resultInput: unknown,
    { id = null, metadata = {} }: GroundAnchorResultOptions = {},
  ): GroundAnchorStabilityAction2D {
    const result = normalizedResult(resultInput);
    const outputs = property(result, "outputs");
    const anchor = property(outputs, "anchor");
    const coupling = property(property(outputs, "couplings"), "globalStability");
    const anchorAxis = property(coupling, "anchorAxis");
    const actions = property(coupling, "actions");
    if (!anchor || !anchorAxis || !actions) {
      throw new Error(
        "GroundAnchorStabilityAction2D.fromGroundAnchorResult requires a ground-anchor design result with globalStability coupling data.",
      );
    }
    return new GroundAnchorStabilityAction2D({
      id: id ?? stringValue(property(anchor, "id")),
      head: pointInput(property(anchorAxis, "head")),
      bondStart: pointInput(property(anchorAxis, "bondStart")),
      bondEnd: pointInput(property(anchorAxis, "bondEnd")),
      designTendonForce: property(actions, "designTendonForce"),
      horizontalSpacing: property(anchor, "horizontalSpacing"),
      sourceVerificationStatus: stringValue(property(result, "status")),
      forceModel: "fhwa-uniform-bond-proportional",
      units: resultUnits(property(anchor, "units")),
      provenance: {
        source: "ground-anchor-design-result",
        applicationId: property(result, "applicationId") ?? null,
        resultSchemaVersion: property(outputs, "schemaVersion") ?? null,
        groundModelId: property(outputs, "groundModelId") ?? null,
        designSituationId: property(outputs, "designSituationId") ?? null,
      },
      metadata: {
        ...structuredClone(metadata ?? {}),
        sourceWarnings: structuredClone(property(result, "warnings") ?? []),
      },
    });
  }

  evaluateForSlipSurface(slipSurface: CircularSlipSurface2D): GroundAnchorStabilityEvaluation {
    if (!(slipSurface instanceof CircularSlipSurface2D)) {
      throw new Error("GroundAnchorStabilityAction2D requires a CircularSlipSurface2D.");
    }
    const tolerance = TOLERANCE * Math.max(1, this.totalLength, slipSurface.radius);
    const intersections = slipSurface
      .intersectionsWithSegment(this.head, this.bondEnd)
      .filter(
        ({ x }) =>
          (slipSurface.entryX == null || x >= slipSurface.entryX - tolerance) &&
          (slipSurface.exitX == null || x <= slipSurface.exitX + tolerance),
      );
    if (intersections.length > 1) {
      throw new Error(
        `Ground anchor ${this.id} intersects slip surface ${slipSurface.id} more than once; the FHWA single-crossing model is not applicable.`,
      );
    }
    if (intersections.length === 0) {
      const anchorEnclosedByMovingMass = [this.head, this.bondStart, this.bondEnd].every(
        (pointValue) => isOnMovingSideOfSurface(pointValue, slipSurface, tolerance),
      );
      return {
        anchorId: this.id,
        status: "not-mobilized",
        relation: anchorEnclosedByMovingMass ? "behind-bond-zone" : "no-axis-crossing",
        intersection: null,
        intersectionDistance: null,
        remainingBondLength: 0,
        mobilizationRatio: 0,
        mobilizedTendonForce: 0,
        mobilizedForcePerUnitWidth: 0,
        globalForcePerUnitWidth: { x: 0, z: 0 },
        horizontalForceInMovementDirection: 0,
        verticalDownwardForce: 0,
        drivingMoment: 0,
        forceModel: this.forceModel,
      };
    }

    const intersection = intersections[0]!;
    const intersectionDistance = bounded(
      projectionAlongAxis(intersection, this.head, this.axisUnitVector),
      0,
      this.totalLength,
    );
    let relation: GroundAnchorStabilityRelation;
    let remainingBondLength: number;
    let mobilizationRatio: number;
    if (intersectionDistance <= this.freeLength + tolerance) {
      relation = "in-front-of-bond-zone";
      remainingBondLength = this.bondLength;
      mobilizationRatio = 1;
    } else if (intersectionDistance < this.totalLength - tolerance) {
      relation = "through-bond-zone";
      remainingBondLength = this.totalLength - intersectionDistance;
      mobilizationRatio = bounded(remainingBondLength / this.bondLength, 0, 1);
    } else {
      relation = "at-or-behind-bond-end";
      remainingBondLength = 0;
      mobilizationRatio = 0;
    }
    const mobilizedTendonForce = this.designTendonForce * mobilizationRatio;
    const mobilizedForcePerUnitWidth = this.designTendonForcePerUnitWidth * mobilizationRatio;
    const globalForcePerUnitWidth = {
      x: mobilizedForcePerUnitWidth * this.axisUnitVector.x,
      z: mobilizedForcePerUnitWidth * this.axisUnitVector.z,
    };
    const movementSign = slipSurface.movementDirection === "left-to-right" ? 1 : -1;
    const horizontalForceInMovementDirection = movementSign * globalForcePerUnitWidth.x;
    if (mobilizationRatio > 0 && horizontalForceInMovementDirection >= -tolerance) {
      throw new Error(
        `Ground anchor ${this.id} does not oppose the selected ${slipSurface.movementDirection} movement direction.`,
      );
    }
    const verticalDownwardForce = -globalForcePerUnitWidth.z;
    const drivingMoment =
      movementSign * (slipSurface.center.x - intersection.x) * verticalDownwardForce +
      (slipSurface.center.z - intersection.z) * horizontalForceInMovementDirection;

    return {
      anchorId: this.id,
      status: mobilizationRatio > 0 ? "mobilized" : "not-mobilized",
      relation,
      intersection: { x: intersection.x, z: intersection.z },
      intersectionDistance,
      remainingBondLength,
      mobilizationRatio,
      mobilizedTendonForce,
      mobilizedForcePerUnitWidth,
      globalForcePerUnitWidth,
      horizontalForceInMovementDirection,
      verticalDownwardForce,
      drivingMoment,
      forceModel: this.forceModel,
    };
  }

  toJSON(): GroundAnchorStabilityAction2DJson {
    return {
      schemaVersion: this.schemaVersion,
      id: this.id,
      head: { ...this.head },
      bondStart: { ...this.bondStart },
      bondEnd: { ...this.bondEnd },
      freeLength: this.freeLength,
      bondLength: this.bondLength,
      totalLength: this.totalLength,
      axisUnitVector: { ...this.axisUnitVector },
      designTendonForce: this.designTendonForce,
      horizontalSpacing: this.horizontalSpacing,
      designTendonForcePerUnitWidth: this.designTendonForcePerUnitWidth,
      sourceVerificationStatus: this.sourceVerificationStatus,
      forceModel: this.forceModel,
      provenance: structuredClone(this.provenance),
      units: { ...this.units },
      metadata: structuredClone(this.metadata),
    };
  }
}
