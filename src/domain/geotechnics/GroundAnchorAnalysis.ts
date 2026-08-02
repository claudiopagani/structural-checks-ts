import { assertExplicitUnitSystem, type UnitSystemInput } from "../units/UnitSystem.js";
import {
  EmbeddedRetainingWallModel,
  type EmbeddedRetainingWallModelOptions,
} from "./EmbeddedRetainingWallModel.js";
import {
  GeotechnicalDesignSituation,
  type GeotechnicalDesignSituationInput,
} from "./GeotechnicalDesignSituation.js";
import {
  GroundAnchorDesignScenario,
  type GroundAnchorCorrosionEnvironment,
  type GroundAnchorAggressivity,
  type GroundAnchorDesignScenarioOptions,
  type GroundAnchorFailureSurface,
  type GroundAnchorTestRecord,
  type GroundAnchorTestObservation,
} from "./GroundAnchorDesignScenario.js";
import {
  GroundAnchorModel,
  type GroundAnchorCorrosionClass,
  type GroundAnchorModelOptions,
} from "./GroundAnchorModel.js";
import { GroundModel, type GroundModelInput } from "./GroundModel.js";
import type { GroundSection2D, GroundSectionPoint } from "./GroundSection2D.js";
import {
  GROUND_ANCHOR_BOND_CATALOG_REFERENCE,
  getGroundAnchorBondCatalogEntry,
} from "./groundAnchorBondCatalog.js";

export const GROUND_ANCHOR_DESIGN_RESULT_SCHEMA_VERSION = "ground-anchor-design-result/v1";

export const GROUND_ANCHOR_DESIGN_REFERENCE = Object.freeze({
  title: "FHWA GEC 4, Ground Anchors and Anchored Systems",
  publication: "FHWA-IF-99-015",
  year: 1999,
  chapters: [5, 6, 7],
  url: "https://www.fhwa.dot.gov/engineering/geotech/pubs/if99015.pdf",
});

export const GROUND_ANCHOR_FHWA_CRITERIA = Object.freeze({
  minimumHorizontalSpacing: 1.2,
  minimumSoilOverburden: 4.5,
  minimumClearanceAbsolute: 1.5,
  minimumClearanceWallHeightRatio: 0.2,
  minimumFreeLengthByTendonType: Object.freeze({ bar: 3, strand: 4.5 }),
  minimumSoilBondLength: 4.5,
  minimumRockBondLengthByTendonType: Object.freeze({ bar: 3, strand: 4.5 }),
  maximumDesignLoadToSmts: 0.6,
  maximumLockOffLoadToSmts: 0.7,
  maximumTestLoadToSmts: 0.8,
  minimumApparentFreeLengthRatio: 0.8,
  proofPerformanceCreep10Minute: 0.001,
  proofPerformanceCreep60Minute: 0.002,
  extendedCreepPerLogCycle: 0.002,
});

const TOLERANCE = 1e-9;

type JsonObject = Record<string, unknown>;
type CheckStatus = "ok" | "failed" | "not-analyzed";

interface Check {
  id: string;
  status: CheckStatus;
  demand: unknown;
  capacity: unknown;
  utilizationRatio: number | null;
  units: string | null;
  criterion: string | null;
  notes: string[];
}

interface CheckInput {
  id: string;
  status: CheckStatus;
  demand?: unknown;
  capacity?: unknown;
  utilizationRatio?: number | null;
  units?: string | null;
  criterion?: string | null;
  notes?: string[];
}

interface UpperBoundCheckInput {
  id: string;
  demand: number;
  capacity: number;
  units: string | null;
  criterion: string;
  notes?: string[];
}

interface LowerBoundCheckInput {
  id: string;
  actual: number;
  minimum: number;
  units: string | null;
  criterion: string;
  notes?: string[];
}

interface ResolvedFailureSurface {
  model: GroundAnchorFailureSurface["model"];
  distanceAlongAnchor: number;
  intersection: GroundSectionPoint;
  wallHeight: number;
  failureSurfaceInclination: number | null;
  provenance?: JsonObject;
}

interface BondSegment {
  zoneId: string;
  materialId: string;
  startDistanceAlongBond: number;
  endDistanceAlongBond: number;
  length: number;
  start: GroundSectionPoint;
  end: GroundSectionPoint;
}

interface ResolvedBondResistance extends JsonObject {
  model: "ultimate-transfer-load" | "ultimate-bond-stress";
  groundClass: "soil" | "weak-rock" | "competent-rock";
  capacityDivisor: number;
  ultimateTransferLoad?: number;
  ultimateBondStress?: number;
  catalogId?: string;
  provenance: JsonObject | null;
  metadata: JsonObject;
  source: "assigned" | "fhwa-presumptive";
}

interface BondContribution extends BondSegment {
  groundClass: ResolvedBondResistance["groundClass"];
  resistance: ResolvedBondResistance;
  effectiveLength: number;
  ultimateTransferLoad: number;
  ultimateCapacity: number;
  allowableCapacity: number;
}

interface BondCapacity {
  model: "sum-of-zone-transfer-capacities";
  contributions: BondContribution[];
  ultimateCapacity: number;
  allowableCapacity: number;
  soilCatalogLength: number;
}

interface ResolvedDemand extends JsonObject {
  source: string;
  horizontalLineLoad: number;
  horizontalForcePerAnchor: number;
  designLoad: number;
  verticalForcePerAnchor: number;
  lockOffLoad: number;
  testLoad: number;
  lockOffLoadFactor: number;
  testLoadFactor: number;
  selectedStageId?: string | null;
  supportId?: string | null | undefined;
  selection?: string;
  analysisWidth?: number;
  wallId?: string;
  provenance?: JsonObject | null;
}

interface AssignedDemand extends JsonObject {
  source: "assigned-horizontal-line-load" | "assigned-tendon-load";
  horizontalLineLoad: number;
  horizontalForcePerAnchor: number;
  designLoad: number;
  verticalForcePerAnchor: number;
  provenance: JsonObject | null;
}

interface CorrosionEvaluation extends JsonObject {
  effectiveAggressivity: GroundAnchorAggressivity;
  requiredClass: GroundAnchorCorrosionClass;
  selectedClass: GroundAnchorCorrosionClass;
  environment: GroundAnchorCorrosionEnvironment;
}

interface TestingEvaluation extends JsonObject {
  record: GroundAnchorTestRecord;
  apparentFreeLength: JsonObject | null;
  checks: Check[];
  status: CheckStatus;
}

interface EmbeddedWallSupport {
  supportId: string;
  scalarForce: number;
  status: string;
}

interface EmbeddedWallStage {
  id: string;
  response: { supports: EmbeddedWallSupport[] };
}

interface EmbeddedWallPayload {
  schemaVersion: string;
  wall: EmbeddedRetainingWallModel | EmbeddedRetainingWallModelOptions;
  stages: EmbeddedWallStage[];
}

type EmbeddedWallResultInput =
  | EmbeddedWallPayload
  | { schemaVersion?: string; outputs: EmbeddedWallPayload };

interface EmbeddedWallDemand extends JsonObject {
  source: "embedded-retaining-wall-result";
  wallId: string;
  supportId: string | undefined;
  selectedStageId: string;
  selection: string;
  analysisWidth: number;
  wallStripSupportForce: number;
  horizontalLineLoad: number;
  horizontalSpacing: number;
  horizontalForcePerAnchor: number;
  designLoad: number;
  verticalForcePerAnchor: number;
  inclination: number;
  units: JsonObject;
}

interface GroundAnchorDemandOptions {
  embeddedRetainingWallResult?: EmbeddedWallResultInput | null;
  supportId?: string | undefined;
  stageId?: string | null;
  selection?: string;
  horizontalSpacing?: number;
  inclination?: number;
  angleUnits?: string;
}

export interface GroundAnchorAnalysisOptions {
  groundModel?: GroundModel | GroundModelInput;
  designSituation?: GeotechnicalDesignSituation | GeotechnicalDesignSituationInput;
  anchor?: GroundAnchorModel | GroundAnchorModelOptions;
  scenario?: GroundAnchorDesignScenario | GroundAnchorDesignScenarioOptions;
  embeddedRetainingWallResult?: EmbeddedWallResultInput | null;
  units?: UnitSystemInput | null;
}

export interface GroundAnchorAnalysisResult {
  status: string;
  summary: string;
  outputs: JsonObject;
  warnings: string[];
  assumptions: string[];
  metadata: JsonObject;
}

type AnalysisResult = GroundAnchorAnalysisResult;

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function errorName(error: unknown): string {
  return error instanceof Error ? error.name : Object.prototype.toString.call(error);
}

class GroundAnchorNotSupportedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GroundAnchorNotSupportedError";
  }
}

function result({
  status,
  summary,
  outputs = {},
  warnings = [],
  assumptions = [],
  metadata = {},
}: {
  status: string;
  summary: string;
  outputs?: JsonObject;
  warnings?: string[];
  assumptions?: string[];
  metadata?: JsonObject;
}): AnalysisResult {
  return { status, summary, outputs, warnings, assumptions, metadata };
}

function normalizeGroundModel(
  value: GroundModel | GroundModelInput | undefined,
  units: UnitSystemInput | null,
): GroundModel {
  return value instanceof GroundModel
    ? value
    : new GroundModel({ ...value, units: value?.units ?? units });
}

function normalizeDesignSituation(
  value: GeotechnicalDesignSituation | GeotechnicalDesignSituationInput | undefined,
  groundModel: GroundModel,
  units: UnitSystemInput | null,
): GeotechnicalDesignSituation {
  return value instanceof GeotechnicalDesignSituation
    ? value
    : new GeotechnicalDesignSituation({
        ...value,
        groundModel,
        units: value?.units ?? units,
      });
}

function normalizeAnchor(
  value: GroundAnchorModel | GroundAnchorModelOptions | undefined,
  units: UnitSystemInput | null,
): GroundAnchorModel {
  return value instanceof GroundAnchorModel
    ? value
    : new GroundAnchorModel({ ...value, units: value?.units ?? units });
}

function normalizeScenario(
  value: GroundAnchorDesignScenario | GroundAnchorDesignScenarioOptions | undefined,
  units: UnitSystemInput | null,
): GroundAnchorDesignScenario {
  return value instanceof GroundAnchorDesignScenario
    ? value
    : new GroundAnchorDesignScenario({
        ...value,
        units: value?.units ?? units,
      });
}

function check({
  id,
  status,
  demand = null,
  capacity = null,
  utilizationRatio = null,
  units = null,
  criterion = null,
  notes = [],
}: CheckInput): Check {
  return {
    id,
    status,
    demand,
    capacity,
    utilizationRatio,
    units,
    criterion,
    notes: [...notes],
  };
}

function upperBoundCheck({
  id,
  demand,
  capacity,
  units,
  criterion,
  notes = [],
}: UpperBoundCheckInput): Check {
  const ratio = demand / capacity;
  return check({
    id,
    status: ratio <= 1 + TOLERANCE ? "ok" : "failed",
    demand,
    capacity,
    utilizationRatio: ratio,
    units,
    criterion,
    notes,
  });
}

function lowerBoundCheck({
  id,
  actual,
  minimum,
  units,
  criterion,
  notes = [],
}: LowerBoundCheckInput): Check {
  const ratio = actual > 0 ? minimum / actual : null;
  return check({
    id,
    status: actual + TOLERANCE >= minimum ? "ok" : "failed",
    demand: minimum,
    capacity: actual,
    utilizationRatio: ratio,
    units,
    criterion,
    notes,
  });
}

function vectorCross(left: GroundSectionPoint, right: GroundSectionPoint): number {
  return left.x * right.z - left.z * right.x;
}

function intersectionParameters(
  startA: GroundSectionPoint,
  endA: GroundSectionPoint,
  startB: GroundSectionPoint,
  endB: GroundSectionPoint,
): { alongA: number; alongB: number } | null {
  const directionA = {
    x: endA.x - startA.x,
    z: endA.z - startA.z,
  };
  const directionB = {
    x: endB.x - startB.x,
    z: endB.z - startB.z,
  };
  const delta = { x: startB.x - startA.x, z: startB.z - startA.z };
  const denominator = vectorCross(directionA, directionB);
  if (Math.abs(denominator) <= TOLERANCE) return null;
  const alongA = vectorCross(delta, directionB) / denominator;
  const alongB = vectorCross(delta, directionA) / denominator;
  if (
    alongA < -TOLERANCE ||
    alongA > 1 + TOLERANCE ||
    alongB < -TOLERANCE ||
    alongB > 1 + TOLERANCE
  )
    return null;
  return {
    alongA: Math.max(0, Math.min(1, alongA)),
    alongB: Math.max(0, Math.min(1, alongB)),
  };
}

function uniqueSorted(values: number[]): number[] {
  return [...values]
    .sort((left, right) => left - right)
    .filter((value, index, sorted) => {
      const previous = sorted[index - 1];
      return index === 0 || (previous !== undefined && Math.abs(value - previous) > TOLERANCE);
    });
}

function resolveFailureSurface(
  anchor: GroundAnchorModel,
  definition: GroundAnchorFailureSurface,
): ResolvedFailureSurface {
  if (definition.model === "assigned-distance") {
    const distanceAlongAnchor = definition.distanceAlongAnchor ?? Number.NaN;
    return {
      model: definition.model,
      distanceAlongAnchor,
      intersection: anchor.pointAtDistance(distanceAlongAnchor),
      wallHeight: definition.wallHeight,
      failureSurfaceInclination: null,
    };
  }
  if (definition.model === "rankine-active-wedge") {
    const inclination = Math.PI / 4 + (definition.frictionAngle ?? Number.NaN) / 2;
    const numerator = anchor.head.z - (definition.excavationBaseElevation ?? Number.NaN);
    const denominator =
      Math.sin(anchor.inclination) + Math.cos(anchor.inclination) * Math.tan(inclination);
    const distanceAlongAnchor = numerator / denominator;
    if (distanceAlongAnchor <= 0 || distanceAlongAnchor > anchor.totalLength) {
      throw new Error(
        "The restricted Rankine failure surface does not intersect the anchor within its length.",
      );
    }
    return {
      model: definition.model,
      distanceAlongAnchor,
      intersection: anchor.pointAtDistance(distanceAlongAnchor),
      wallHeight: definition.wallHeight,
      failureSurfaceInclination: inclination,
    };
  }
  const anchorEnd = anchor.pointAtDistance(anchor.totalLength);
  const intersections = [];
  const points = definition.points ?? [];
  for (let index = 0; index < points.length - 1; index += 1) {
    const startPoint = points[index];
    const endPoint = points[index + 1];
    if (!startPoint || !endPoint) continue;
    const selected = intersectionParameters(anchor.head, anchorEnd, startPoint, endPoint);
    if (selected && selected.alongA > TOLERANCE) {
      intersections.push(selected.alongA * anchor.totalLength);
    }
  }
  const unique = uniqueSorted(intersections);
  if (unique.length !== 1) {
    throw new Error(
      `The assigned failure polyline must intersect the anchor exactly once; found ${unique.length}.`,
    );
  }
  const selectedDistance = unique[0] ?? Number.NaN;
  return {
    model: definition.model,
    distanceAlongAnchor: selectedDistance,
    intersection: anchor.pointAtDistance(selectedDistance),
    wallHeight: definition.wallHeight,
    failureSurfaceInclination: null,
  };
}

function bondZoneSegments(anchor: GroundAnchorModel, section: GroundSection2D): BondSegment[] {
  const start = anchor.bondStart;
  const end = anchor.bondEnd;
  const breakpoints: number[] = [0, 1];
  for (const zone of section.zones) {
    for (let index = 0; index < zone.polygon.length; index += 1) {
      const zoneStart = zone.polygon[index];
      const zoneEnd = zone.polygon[(index + 1) % zone.polygon.length];
      if (!zoneStart || !zoneEnd) continue;
      const intersection = intersectionParameters(start, end, zoneStart, zoneEnd);
      if (intersection) breakpoints.push(intersection.alongA);
    }
  }
  const parameters = uniqueSorted(breakpoints);
  const segments: BondSegment[] = [];
  for (let index = 0; index < parameters.length - 1; index += 1) {
    const startParameter = parameters[index];
    const endParameter = parameters[index + 1];
    if (startParameter === undefined || endParameter === undefined) continue;
    if (endParameter - startParameter <= TOLERANCE) continue;
    const middle = (startParameter + endParameter) / 2;
    const point = {
      x: start.x + middle * (end.x - start.x),
      z: start.z + middle * (end.z - start.z),
    };
    const zone = section.getZoneAtPoint(point, {
      includeBoundary: false,
      requireUnique: true,
    });
    if (!zone) {
      throw new Error(
        `Ground-anchor bond zone crosses an unassigned GroundSection2D gap near x=${point.x}, z=${point.z}.`,
      );
    }
    const segment: BondSegment = {
      zoneId: zone.id,
      materialId: zone.materialId,
      startDistanceAlongBond: startParameter * anchor.bondLength,
      endDistanceAlongBond: endParameter * anchor.bondLength,
      length: (endParameter - startParameter) * anchor.bondLength,
      start: {
        x: start.x + startParameter * (end.x - start.x),
        z: start.z + startParameter * (end.z - start.z),
      },
      end: {
        x: start.x + endParameter * (end.x - start.x),
        z: start.z + endParameter * (end.z - start.z),
      },
    };
    const previous = segments.at(-1);
    if (previous?.zoneId === segment.zoneId) {
      previous.endDistanceAlongBond = segment.endDistanceAlongBond;
      previous.end = segment.end;
      previous.length += segment.length;
    } else {
      segments.push(segment);
    }
  }
  return segments;
}

function validateAnchorGeometry(anchor: GroundAnchorModel, section: GroundSection2D): void {
  const end = anchor.pointAtDistance(anchor.totalLength);
  const anchorPoints: Array<[string, GroundSectionPoint]> = [
    ["head", anchor.head],
    ["bond start", anchor.bondStart],
    ["bond end", end],
  ];
  for (const [label, point] of anchorPoints) {
    if (
      point.x < section.bounds.minimumX - TOLERANCE ||
      point.x > section.bounds.maximumX + TOLERANCE
    ) {
      throw new Error(`Ground-anchor ${label} lies outside the section x domain.`);
    }
    if (!section.isBelowGroundSurface(point)) {
      throw new Error(`Ground-anchor ${label} lies above the ground surface.`);
    }
  }
  for (let index = 0; index < section.surface.points.length - 1; index += 1) {
    const surfaceStart = section.surface.points[index];
    const surfaceEnd = section.surface.points[index + 1];
    if (!surfaceStart || !surfaceEnd) continue;
    const intersection = intersectionParameters(anchor.head, end, surfaceStart, surfaceEnd);
    if (intersection && intersection.alongA > TOLERANCE) {
      throw new Error("Ground-anchor axis crosses above the GroundSection2D surface.");
    }
  }
}

function isGroundClass(value: string | null): value is ResolvedBondResistance["groundClass"] {
  return value === "soil" || value === "weak-rock" || value === "competent-rock";
}

function resolvedBondResistance(
  scenario: GroundAnchorDesignScenario,
  segment: BondSegment,
): ResolvedBondResistance {
  const assigned =
    scenario.bondResistanceByZone[segment.zoneId] ??
    scenario.bondResistanceByMaterial[segment.materialId] ??
    scenario.defaultBondResistance;
  if (!assigned) {
    throw new Error(
      `No bond resistance is assigned for zone ${segment.zoneId} or material ${segment.materialId}.`,
    );
  }
  if (assigned.model !== "fhwa-presumptive") {
    return { ...structuredClone(assigned), source: "assigned" };
  }
  const catalog = getGroundAnchorBondCatalogEntry(assigned.catalogId);
  const groundClass = assigned.groundClass ?? catalog.groundClass;
  if (!isGroundClass(groundClass)) {
    throw new Error(`Ground class ${groundClass} is invalid for catalog entry ${catalog.id}.`);
  }
  return {
    model: "ultimate-transfer-load",
    ultimateTransferLoad: catalog.ultimateTransferLoad,
    groundClass,
    capacityDivisor: assigned.capacityDivisor ?? catalog.capacityDivisor,
    catalogId: catalog.id,
    provenance: assigned.provenance ?? {
      source: `${GROUND_ANCHOR_BOND_CATALOG_REFERENCE.publication}, ${GROUND_ANCHOR_BOND_CATALOG_REFERENCE.sections.join(", ")}`,
    },
    metadata: structuredClone(assigned.metadata),
    source: "fhwa-presumptive",
  };
}

function buildBondCapacity(
  anchor: GroundAnchorModel,
  scenario: GroundAnchorDesignScenario,
  segments: BondSegment[],
): BondCapacity {
  let soilCatalogLength = 0;
  const contributions = segments.map((segment) => {
    const resistance = resolvedBondResistance(scenario, segment);
    let effectiveLength = segment.length;
    if (
      resistance.source === "fhwa-presumptive" &&
      resistance.groundClass === "soil" &&
      !anchor.installation.specializedLoadTransfer
    ) {
      const remaining = Math.max(0, 12 - soilCatalogLength);
      effectiveLength = Math.min(effectiveLength, remaining);
      soilCatalogLength += segment.length;
    }
    const ultimateTransferLoad =
      resistance.model === "ultimate-transfer-load"
        ? (resistance.ultimateTransferLoad ?? Number.NaN)
        : Math.PI * anchor.groutBodyDiameter * (resistance.ultimateBondStress ?? Number.NaN);
    const ultimateCapacity = ultimateTransferLoad * effectiveLength;
    return {
      ...segment,
      groundClass: resistance.groundClass,
      resistance,
      effectiveLength,
      ultimateTransferLoad,
      ultimateCapacity,
      allowableCapacity: ultimateCapacity / resistance.capacityDivisor,
    };
  });
  return {
    model: "sum-of-zone-transfer-capacities",
    contributions,
    ultimateCapacity: contributions.reduce(
      (sum, contribution) => sum + contribution.ultimateCapacity,
      0,
    ),
    allowableCapacity: contributions.reduce(
      (sum, contribution) => sum + contribution.allowableCapacity,
      0,
    ),
    soilCatalogLength,
  };
}

function outputPayload(value: EmbeddedWallResultInput | null | undefined): EmbeddedWallPayload {
  if (
    value &&
    "schemaVersion" in value &&
    value.schemaVersion?.startsWith("embedded-retaining-wall-result/") &&
    "wall" in value &&
    "stages" in value
  ) {
    return value;
  }
  if (
    value &&
    "outputs" in value &&
    value.outputs.schemaVersion?.startsWith("embedded-retaining-wall-result/")
  ) {
    return value.outputs;
  }
  throw new Error("embeddedRetainingWallResult is not an embedded-retaining-wall result.");
}

export function groundAnchorDemandFromEmbeddedWallResult({
  embeddedRetainingWallResult,
  supportId,
  stageId = null,
  selection = "maximum-absolute",
  horizontalSpacing,
  inclination,
  angleUnits = "rad",
}: GroundAnchorDemandOptions = {}): EmbeddedWallDemand {
  const outputs = outputPayload(embeddedRetainingWallResult);
  const wall =
    outputs.wall instanceof EmbeddedRetainingWallModel
      ? outputs.wall
      : new EmbeddedRetainingWallModel(outputs.wall);
  const candidates = outputs.stages.flatMap((stage) =>
    stage.response.supports
      .filter((support) => support.supportId === supportId && support.status !== "inactive")
      .map((support) => ({
        stageId: stage.id,
        scalarForce: support.scalarForce,
        status: support.status,
      })),
  );
  const filtered =
    selection === "selected-stage"
      ? candidates.filter((candidate) => candidate.stageId === stageId)
      : candidates;
  if (filtered.length === 0) {
    throw new Error(`No active support result found for ${supportId}.`);
  }
  const governing = filtered.reduce((selected, candidate) =>
    Math.abs(candidate.scalarForce) > Math.abs(selected.scalarForce) ? candidate : selected,
  );
  const resolvedInclination = inclination ?? Number.NaN;
  const resolvedSpacing = horizontalSpacing ?? Number.NaN;
  const angle = angleUnits === "deg" ? (resolvedInclination * Math.PI) / 180 : resolvedInclination;
  const cosine = Math.cos(angle);
  if (cosine <= TOLERANCE) {
    throw new Error("Ground-anchor inclination has no horizontal component.");
  }
  const horizontalLineLoad = Math.abs(governing.scalarForce) / wall.analysisWidth;
  const horizontalForcePerAnchor = horizontalLineLoad * resolvedSpacing;
  const designLoad = horizontalForcePerAnchor / cosine;
  return {
    source: "embedded-retaining-wall-result",
    wallId: wall.id,
    supportId,
    selectedStageId: governing.stageId,
    selection,
    analysisWidth: wall.analysisWidth,
    wallStripSupportForce: governing.scalarForce,
    horizontalLineLoad,
    horizontalSpacing: resolvedSpacing,
    horizontalForcePerAnchor,
    designLoad,
    verticalForcePerAnchor: designLoad * Math.sin(angle),
    inclination: angle,
    units: {
      force: "kN",
      length: "m",
      lineLoad: "kN/m",
      angle: "rad",
    },
  };
}

function resolveDemand(
  anchor: GroundAnchorModel,
  scenario: GroundAnchorDesignScenario,
  embeddedRetainingWallResult: EmbeddedWallResultInput | null,
): ResolvedDemand {
  const definition = scenario.demand;
  let resolved: EmbeddedWallDemand | AssignedDemand;
  if (definition.source === "embedded-retaining-wall-result") {
    if (!embeddedRetainingWallResult) {
      throw new Error("embeddedRetainingWallResult is required by the selected demand source.");
    }
    resolved = groundAnchorDemandFromEmbeddedWallResult({
      embeddedRetainingWallResult,
      supportId: definition.supportId ?? undefined,
      stageId: definition.stageId,
      selection: definition.selection,
      horizontalSpacing: anchor.horizontalSpacing,
      inclination: anchor.inclination,
    });
  } else if (definition.source === "assigned-horizontal-line-load") {
    const horizontalLineLoad = definition.horizontalLineLoad ?? Number.NaN;
    const horizontalForcePerAnchor = horizontalLineLoad * anchor.horizontalSpacing;
    const designLoad = horizontalForcePerAnchor / Math.cos(anchor.inclination);
    resolved = {
      source: definition.source,
      horizontalLineLoad,
      horizontalForcePerAnchor,
      designLoad,
      verticalForcePerAnchor: designLoad * Math.sin(anchor.inclination),
      provenance: structuredClone(definition.provenance),
    };
  } else {
    const designLoad = definition.designLoad ?? Number.NaN;
    const horizontalForcePerAnchor = designLoad * Math.cos(anchor.inclination);
    resolved = {
      source: definition.source,
      horizontalLineLoad: horizontalForcePerAnchor / anchor.horizontalSpacing,
      horizontalForcePerAnchor,
      designLoad,
      verticalForcePerAnchor: designLoad * Math.sin(anchor.inclination),
      provenance: structuredClone(definition.provenance),
    };
  }
  return {
    ...resolved,
    lockOffLoad: resolved.designLoad * scenario.lockOffLoadFactor,
    testLoad: resolved.designLoad * scenario.testLoadFactor,
    lockOffLoadFactor: scenario.lockOffLoadFactor,
    testLoadFactor: scenario.testLoadFactor,
  };
}

function effectiveAggressivity(
  environment: GroundAnchorCorrosionEnvironment,
): GroundAnchorAggressivity {
  const measured = environment.measurements;
  if (
    measured &&
    ((measured.pH != null && measured.pH < 4.5) ||
      (measured.resistivityOhmCm != null && measured.resistivityOhmCm < 2000) ||
      measured.sulfidesPresent ||
      measured.strayCurrentsPresent ||
      measured.adjacentConcreteChemicalAttack)
  )
    return "aggressive";
  return environment.aggressivity;
}

function requiredCorrosionClass(
  environment: GroundAnchorCorrosionEnvironment,
): GroundAnchorCorrosionClass {
  const aggressivity = effectiveAggressivity(environment);
  if (environment.serviceLife === "temporary-support-of-excavation") {
    return aggressivity === "non-aggressive" ? "none" : "II";
  }
  if (aggressivity !== "non-aggressive") return "I";
  if (environment.consequencesOfFailure === "serious") return "I";
  return environment.higherProtectionCost === "small" ? "I" : "II";
}

function minimumBondLength(
  anchor: GroundAnchorModel,
  groundClasses: ResolvedBondResistance["groundClass"][],
): number {
  if (groundClasses.some((groundClass) => groundClass === "soil")) {
    return GROUND_ANCHOR_FHWA_CRITERIA.minimumSoilBondLength;
  }
  return anchor.tendon.type === "bar"
    ? GROUND_ANCHOR_FHWA_CRITERIA.minimumRockBondLengthByTendonType.bar
    : GROUND_ANCHOR_FHWA_CRITERIA.minimumRockBondLengthByTendonType.strand;
}

function observationAt(observations: GroundAnchorTestObservation[], time: number): number | null {
  const exact = observations.find(
    (observation) => Math.abs(observation.timeMinutes - time) <= TOLERANCE,
  );
  if (exact) return exact.movement;
  const leftIndex = observations.findLastIndex((observation) => observation.timeMinutes < time);
  if (leftIndex < 0 || leftIndex >= observations.length - 1) return null;
  const left = observations[leftIndex];
  const right = observations[leftIndex + 1];
  if (!left || !right) return null;
  if (right.timeMinutes < time) return null;
  const ratio =
    (Math.log10(time) - Math.log10(left.timeMinutes)) /
    (Math.log10(right.timeMinutes) - Math.log10(left.timeMinutes));
  return left.movement + ratio * (right.movement - left.movement);
}

function evaluateCreep(record: GroundAnchorTestRecord): Check {
  if (record.holds.length === 0) {
    return check({
      id: `test-${record.id}-creep`,
      status: "not-analyzed",
      criterion: "No load-hold observations supplied.",
    });
  }
  if (record.type === "extended-creep") {
    const evaluations = record.holds.map((hold) => {
      const lastObservation = hold.observations.at(-1);
      if (!lastObservation) return null;
      const end = lastObservation.timeMinutes;
      const start = end / 10;
      const startMovement = observationAt(hold.observations, start);
      const endMovement = observationAt(hold.observations, end);
      return startMovement == null || endMovement == null ? null : endMovement - startMovement;
    });
    if (evaluations.some((value) => value == null)) {
      return check({
        id: `test-${record.id}-creep`,
        status: "not-analyzed",
        criterion: "Extended-creep records must span the final logarithmic time cycle.",
      });
    }
    const completeEvaluations = evaluations.filter((value): value is number => value != null);
    const demand = Math.max(...completeEvaluations);
    return upperBoundCheck({
      id: `test-${record.id}-creep`,
      demand,
      capacity: GROUND_ANCHOR_FHWA_CRITERIA.extendedCreepPerLogCycle,
      units: "m/log-cycle",
      criterion: "FHWA GEC 4 section 7.4.5.2",
      notes: ["Maximum movement over the final log cycle of every load hold."],
    });
  }
  const hold = record.holds.reduce((selected, candidate) =>
    Math.abs(candidate.load - record.testLoad) < Math.abs(selected.load - record.testLoad)
      ? candidate
      : selected,
  );
  const movement1 = observationAt(hold.observations, 1);
  const movement10 = observationAt(hold.observations, 10);
  if (movement1 == null || movement10 == null) {
    return check({
      id: `test-${record.id}-creep`,
      status: "not-analyzed",
      criterion: "Proof/performance hold requires 1- and 10-minute readings.",
    });
  }
  const movement10Minute = movement10 - movement1;
  if (movement10Minute <= GROUND_ANCHOR_FHWA_CRITERIA.proofPerformanceCreep10Minute + TOLERANCE) {
    return upperBoundCheck({
      id: `test-${record.id}-creep`,
      demand: movement10Minute,
      capacity: GROUND_ANCHOR_FHWA_CRITERIA.proofPerformanceCreep10Minute,
      units: "m",
      criterion: "FHWA GEC 4 section 7.4.5.2, 1 to 10 minutes",
    });
  }
  const movement6 = observationAt(hold.observations, 6);
  const movement60 = observationAt(hold.observations, 60);
  if (movement6 == null || movement60 == null) {
    return check({
      id: `test-${record.id}-creep`,
      status: "failed",
      demand: movement10Minute,
      capacity: GROUND_ANCHOR_FHWA_CRITERIA.proofPerformanceCreep10Minute,
      utilizationRatio:
        movement10Minute / GROUND_ANCHOR_FHWA_CRITERIA.proofPerformanceCreep10Minute,
      units: "m",
      criterion: "The 10-minute limit was exceeded and 6-to-60-minute data are missing.",
    });
  }
  return upperBoundCheck({
    id: `test-${record.id}-creep`,
    demand: movement60 - movement6,
    capacity: GROUND_ANCHOR_FHWA_CRITERIA.proofPerformanceCreep60Minute,
    units: "m",
    criterion: "FHWA GEC 4 section 7.4.5.2, 6 to 60 minutes",
  });
}

function evaluateApparentFreeLength(
  anchor: GroundAnchorModel,
  scenario: GroundAnchorDesignScenario,
  record: GroundAnchorTestRecord,
): { output: JsonObject | null; check: Check } {
  const movement =
    record.elasticMovementAtTestLoad ??
    (record.type === "proof" ? record.totalMovementAtTestLoad : null);
  if (movement == null) {
    return {
      output: null,
      check: check({
        id: `test-${record.id}-apparent-free-length`,
        status: "not-analyzed",
        criterion: "Elastic movement at test load was not supplied.",
      }),
    };
  }
  const loadIncrement = record.testLoad - record.alignmentLoad;
  if (loadIncrement <= 0) {
    throw new Error(`Test ${record.id} testLoad must exceed alignmentLoad.`);
  }
  const apparentFreeLength =
    (anchor.tendon.steelArea * anchor.tendon.elasticModulus * movement) / loadIncrement;
  const minimum =
    scenario.testing.jackLength +
    GROUND_ANCHOR_FHWA_CRITERIA.minimumApparentFreeLengthRatio * anchor.freeLength;
  return {
    output: {
      apparentFreeLength,
      movementBasis:
        record.elasticMovementAtTestLoad == null
          ? "total-movement-for-proof-test"
          : "elastic-movement",
      loadIncrement,
      minimum,
    },
    check: lowerBoundCheck({
      id: `test-${record.id}-apparent-free-length`,
      actual: apparentFreeLength,
      minimum,
      units: "m",
      criterion: "FHWA GEC 4 equation 49 and section 7.4.5.3",
    }),
  };
}

function evaluateTesting(
  anchor: GroundAnchorModel,
  scenario: GroundAnchorDesignScenario,
  demand: ResolvedDemand,
  bond: BondCapacity,
): TestingEvaluation[] {
  const tendonSmts = anchor.tendon.steelArea * anchor.tendon.specifiedMinimumTensileStrength;
  return scenario.testing.records.map((record) => {
    const creep = evaluateCreep(record);
    const apparent = evaluateApparentFreeLength(anchor, scenario, record);
    const plannedLoad = lowerBoundCheck({
      id: `test-${record.id}-planned-load-reached`,
      actual: record.testLoad,
      minimum: demand.testLoad,
      units: "kN",
      criterion: "Actual maximum test load must reach the design test load.",
    });
    const tendonLoad = upperBoundCheck({
      id: `test-${record.id}-tendon-smts`,
      demand: record.testLoad,
      capacity: GROUND_ANCHOR_FHWA_CRITERIA.maximumTestLoadToSmts * tendonSmts,
      units: "kN",
      criterion: "FHWA GEC 4 section 5.3.8: test load <= 0.80 SMTS",
    });
    const bondLoad = upperBoundCheck({
      id: `test-${record.id}-estimated-ultimate-bond`,
      demand: record.testLoad,
      capacity: bond.ultimateCapacity,
      units: "kN",
      criterion: "Actual test load compared with estimated ultimate bond capacity.",
    });
    const liftOff =
      record.initialLiftOffLoad == null
        ? check({
            id: `test-${record.id}-initial-lift-off`,
            status: "not-analyzed",
            criterion: "No initial lift-off reading was supplied.",
          })
        : upperBoundCheck({
            id: `test-${record.id}-initial-lift-off`,
            demand: Math.abs(record.initialLiftOffLoad - demand.lockOffLoad),
            capacity: 0.05 * demand.lockOffLoad,
            units: "kN",
            criterion:
              "FHWA GEC 4 generic specification section 6.07: lift-off within +/-5% of design lock-off load.",
          });
    const checks = [plannedLoad, tendonLoad, bondLoad, creep, apparent.check, liftOff];
    return {
      record: structuredClone(record),
      apparentFreeLength: apparent.output,
      checks,
      status: checks.some(({ status }) => status === "failed")
        ? "failed"
        : checks.every(({ status }) => status === "ok")
          ? "ok"
          : "not-analyzed",
    };
  });
}

function corrosionDetailsCheck(anchor: GroundAnchorModel): Check {
  if (anchor.corrosionProtection.class === "none") {
    return check({
      id: "corrosion-protection-details",
      status: "ok",
      criterion: "No component barrier is required by the selected class.",
    });
  }
  const details = anchor.corrosionProtection.details;
  const anchorage = isJsonObject(details.anchorage) ? details.anchorage : null;
  const unbonded = isJsonObject(details.unbondedLength) ? details.unbondedLength : null;
  const bonded = isJsonObject(details.bondLength) ? details.bondLength : null;
  if (!anchorage || !unbonded || !bonded) {
    return check({
      id: "corrosion-protection-details",
      status: "not-analyzed",
      criterion:
        "Anchorage, unbonded-length and bond-length protection details were not all supplied.",
    });
  }
  const anchorageOk =
    anchorage.trumpet === true && (anchorage.exposed !== true || anchorage.cover === true);
  const unbondedSystem = typeof unbonded.system === "string" ? unbonded.system : "";
  const bondedSystem = typeof bonded.system === "string" ? bonded.system : "";
  const classOneUnbonded = [
    "encapsulated-grease-filled-strand-sheaths",
    "encapsulated-grout-filled-strand-sheaths",
    "smooth-bondbreaker-over-grout-filled-bar-sheath",
  ].includes(unbondedSystem);
  const classOneBond = ["grout-filled-encapsulation", "fusion-bonded-epoxy"].includes(bondedSystem);
  const classTwoUnbonded = ["grease-filled-sheath", "heat-shrink-sleeve"].includes(unbondedSystem);
  const classTwoBond = bondedSystem === "grout";
  const passed =
    anchor.corrosionProtection.class === "I"
      ? anchorageOk && classOneUnbonded && classOneBond
      : anchorageOk && classTwoUnbonded && classTwoBond;
  return check({
    id: "corrosion-protection-details",
    status: passed ? "ok" : "failed",
    demand: anchor.corrosionProtection.class,
    capacity: structuredClone(details),
    criterion: "FHWA GEC 4 table 20",
  });
}

function buildDesignChecks({
  anchor,
  scenario,
  section,
  demand,
  failureSurface,
  bond,
  corrosion,
  testing,
}: {
  anchor: GroundAnchorModel;
  scenario: GroundAnchorDesignScenario;
  section: GroundSection2D;
  demand: ResolvedDemand;
  failureSurface: ResolvedFailureSurface;
  bond: BondCapacity;
  corrosion: CorrosionEvaluation;
  testing: TestingEvaluation[];
}): Check[] {
  const checks = [];
  const criteria = GROUND_ANCHOR_FHWA_CRITERIA;
  const steelSmts = anchor.tendon.steelArea * anchor.tendon.specifiedMinimumTensileStrength;
  checks.push(
    upperBoundCheck({
      id: "tendon-design-load",
      demand: demand.designLoad,
      capacity: criteria.maximumDesignLoadToSmts * steelSmts,
      units: "kN",
      criterion: "FHWA GEC 4 section 5.3.8: design load <= 0.60 SMTS",
    }),
    upperBoundCheck({
      id: "tendon-lock-off-load",
      demand: demand.lockOffLoad,
      capacity: criteria.maximumLockOffLoadToSmts * steelSmts,
      units: "kN",
      criterion: "FHWA GEC 4 section 5.3.8: lock-off <= 0.70 SMTS",
    }),
    upperBoundCheck({
      id: "tendon-test-load",
      demand: demand.testLoad,
      capacity: criteria.maximumTestLoadToSmts * steelSmts,
      units: "kN",
      criterion: "FHWA GEC 4 section 5.3.8: test load <= 0.80 SMTS",
    }),
    upperBoundCheck({
      id: "ground-bond-design-load",
      demand: demand.designLoad,
      capacity: bond.allowableCapacity,
      units: "kN",
      criterion: "FHWA GEC 4 section 5.3.6",
    }),
    upperBoundCheck({
      id: "ground-bond-test-load-vs-estimated-ultimate",
      demand: demand.testLoad,
      capacity: bond.ultimateCapacity,
      units: "kN",
      criterion: "Field test load compared with estimated ultimate bond capacity",
    }),
  );
  const clearanceWallHeight =
    failureSurface.wallHeight ?? scenario.criticalFailureSurface.wallHeight ?? 0;
  const requiredClearance = Math.max(
    criteria.minimumClearanceAbsolute,
    criteria.minimumClearanceWallHeightRatio * clearanceWallHeight,
  );
  checks.push(
    lowerBoundCheck({
      id: "minimum-free-length",
      actual: anchor.freeLength,
      minimum:
        anchor.tendon.type === "bar"
          ? criteria.minimumFreeLengthByTendonType.bar
          : criteria.minimumFreeLengthByTendonType.strand,
      units: "m",
      criterion: "FHWA GEC 4 section 5.3.4",
    }),
    lowerBoundCheck({
      id: "bond-zone-clearance-behind-failure-surface",
      actual: anchor.freeLength - failureSurface.distanceAlongAnchor,
      minimum: requiredClearance,
      units: "m",
      criterion: "FHWA GEC 4 sections 5.3.2 and 5.3.4: max(1.5 m, H/5)",
    }),
    lowerBoundCheck({
      id: "minimum-bond-length",
      actual: anchor.bondLength,
      minimum: minimumBondLength(
        anchor,
        bond.contributions.map(({ groundClass }) => groundClass),
      ),
      units: "m",
      criterion: "FHWA GEC 4 generic specification section 3.06",
    }),
    check({
      id: "minimum-horizontal-spacing",
      status:
        anchor.horizontalSpacing > criteria.minimumHorizontalSpacing + TOLERANCE ? "ok" : "failed",
      demand: criteria.minimumHorizontalSpacing,
      capacity: anchor.horizontalSpacing,
      utilizationRatio: criteria.minimumHorizontalSpacing / anchor.horizontalSpacing,
      units: "m",
      criterion: "FHWA GEC 4 figure 37: horizontal spacing > 1.2 m",
    }),
  );
  const classes = new Set(bond.contributions.map(({ groundClass }) => groundClass));
  if (classes.size === 1 && classes.has("soil")) {
    const middle = anchor.pointAtDistance(anchor.freeLength + anchor.bondLength / 2);
    const overburden = section.surfaceElevationAt(middle.x) - middle.z;
    checks.push(
      lowerBoundCheck({
        id: "minimum-soil-overburden",
        actual: overburden,
        minimum: criteria.minimumSoilOverburden,
        units: "m",
        criterion: "FHWA GEC 4 section 5.3.7 and figure 37",
      }),
    );
  } else if (classes.has("soil")) {
    checks.push(
      check({
        id: "minimum-soil-overburden",
        status: "not-analyzed",
        criterion: "Mixed soil-rock bond zone requires a project-specific overburden assessment.",
      }),
    );
  }
  const corrosionRank = (value: GroundAnchorCorrosionClass): number =>
    value === "I" ? 2 : value === "II" ? 1 : 0;
  checks.push(
    check({
      id: "corrosion-protection-class",
      status:
        corrosionRank(anchor.corrosionProtection.class) >= corrosionRank(corrosion.requiredClass)
          ? "ok"
          : "failed",
      demand: corrosion.requiredClass,
      capacity: anchor.corrosionProtection.class,
      criterion: "FHWA GEC 4 section 6.4 and figure 63",
    }),
  );
  checks.push(corrosionDetailsCheck(anchor));
  const assignedCapacities: Array<{
    id: string;
    assigned: GroundAnchorModel["anchorage"]["tensileCapacity"];
  }> = [
    { id: "anchorage-tensile-capacity", assigned: anchor.anchorage.tensileCapacity },
    { id: "tendon-grout-bond-capacity", assigned: anchor.anchorage.tendonGroutBondCapacity },
  ];
  for (const { id, assigned } of assignedCapacities) {
    checks.push(
      assigned == null
        ? check({
            id,
            status: "not-analyzed",
            criterion: "No assigned component capacity was supplied.",
          })
        : upperBoundCheck({
            id,
            demand: demand.testLoad,
            capacity: assigned.value,
            units: "kN",
            criterion: "Assigned component capacity at maximum test load",
          }),
    );
  }
  const inclinationDegrees = (anchor.inclination * 180) / Math.PI;
  checks.push(
    check({
      id: "installation-inclination-range",
      status:
        inclinationDegrees >= 10 - TOLERANCE && inclinationDegrees <= 45 + TOLERANCE
          ? "ok"
          : inclinationDegrees < 10 && anchor.installation.specialGrouting
            ? "ok"
            : "not-analyzed",
      demand: inclinationDegrees,
      capacity: { minimum: 10, maximum: 45 },
      units: "deg",
      criterion:
        "FHWA GEC 4 section 5.3.6; inclinations outside 10-45 degrees require project-specific constructability review",
    }),
  );
  checks.push(
    check({
      id: "lock-off-factor-range",
      status:
        scenario.lockOffLoadFactor >= 0.75 - TOLERANCE &&
        scenario.lockOffLoadFactor <= 1 + TOLERANCE
          ? "ok"
          : "not-analyzed",
      demand: scenario.lockOffLoadFactor,
      capacity: { minimum: 0.75, maximum: 1 },
      criterion: "FHWA GEC 4 section 7.5 general lock-off range",
    }),
  );
  checks.push(
    lowerBoundCheck({
      id: "minimum-test-load-factor",
      actual: scenario.testLoadFactor,
      minimum: 1.33,
      units: null,
      criterion: "FHWA GEC 4 performance/proof maximum test load",
    }),
  );
  checks.push(...testing.flatMap((item) => item.checks));
  return checks;
}

function maximumUtilizationRatio(checks: Check[]): number | null {
  const values = checks
    .map(({ utilizationRatio }) => utilizationRatio)
    .filter((value): value is number => Number.isFinite(value));
  return values.length === 0 ? null : Math.max(...values);
}

export class GroundAnchorAnalysis {
  analyze({
    groundModel: groundModelInput,
    designSituation: designSituationInput,
    anchor: anchorInput,
    scenario: scenarioInput,
    embeddedRetainingWallResult = null,
    units = null,
  }: GroundAnchorAnalysisOptions = {}): AnalysisResult {
    try {
      assertExplicitUnitSystem(units, "GroundAnchorAnalysis");
      const groundModel = normalizeGroundModel(groundModelInput, units);
      const designSituation = normalizeDesignSituation(designSituationInput, groundModel, units);
      designSituation.validateAgainst(groundModel);
      const anchor = normalizeAnchor(anchorInput, units);
      const scenario = normalizeScenario(scenarioInput, units);
      const section = groundModel.getSection(designSituation.spatialSelection.sectionId);
      if (!section) {
        throw new GroundAnchorNotSupportedError("Ground-anchor design requires a GroundSection2D.");
      }
      const demand = resolveDemand(anchor, scenario, embeddedRetainingWallResult);
      const failureSurface = resolveFailureSurface(anchor, scenario.criticalFailureSurface);
      validateAnchorGeometry(anchor, section);
      const segments = bondZoneSegments(anchor, section);
      const bond = buildBondCapacity(anchor, scenario, segments);
      const corrosion = {
        effectiveAggressivity: effectiveAggressivity(scenario.corrosionEnvironment),
        requiredClass: requiredCorrosionClass(scenario.corrosionEnvironment),
        selectedClass: anchor.corrosionProtection.class,
        environment: structuredClone(scenario.corrosionEnvironment),
      };
      const testing = evaluateTesting(anchor, scenario, demand, bond);
      const checks = buildDesignChecks({
        anchor,
        scenario,
        section,
        demand,
        failureSurface,
        bond,
        corrosion,
        testing,
      });
      const failed = checks.some(({ status }) => status === "failed");
      const catalogUsed = bond.contributions.some(
        ({ resistance }) => resistance.source === "fhwa-presumptive",
      );
      const soilCatalogBeyondTwelve =
        bond.soilCatalogLength > 12 + TOLERANCE && !anchor.installation.specializedLoadTransfer;
      const outputs = {
        schemaVersion: GROUND_ANCHOR_DESIGN_RESULT_SCHEMA_VERSION,
        groundModelId: groundModel.id,
        groundSectionId: section.id,
        designSituationId: designSituation.id,
        anchor: anchor.toJSON(),
        scenario: scenario.toJSON(),
        geometry: {
          head: { ...anchor.head },
          bondStart: anchor.bondStart,
          bondEnd: anchor.bondEnd,
          totalLength: anchor.totalLength,
          inclination: anchor.inclination,
          criticalFailureSurface: {
            ...failureSurface,
            provenance: structuredClone(scenario.criticalFailureSurface.provenance),
          },
          bondZoneSegments: bond.contributions.map((contribution) => ({
            zoneId: contribution.zoneId,
            materialId: contribution.materialId,
            start: contribution.start,
            end: contribution.end,
            length: contribution.length,
            effectiveLength: contribution.effectiveLength,
          })),
        },
        demand,
        capacity: {
          tendonSmts: anchor.tendon.steelArea * anchor.tendon.specifiedMinimumTensileStrength,
          groundBond: bond,
          anchorage: structuredClone(anchor.anchorage),
        },
        corrosion,
        testing: {
          status:
            testing.length === 0
              ? "not-analyzed"
              : testing.some(({ status }) => status === "failed")
                ? "failed"
                : testing.every(({ status }) => status === "ok")
                  ? "ok"
                  : "not-analyzed",
          requirement:
            "Each production anchor is load-tested after installation and before service.",
          records: testing,
        },
        checks,
        utilizationRatio: maximumUtilizationRatio(checks),
        couplings: {
          embeddedRetainingWall: {
            status: demand.source === "embedded-retaining-wall-result" ? "consumed" : "available",
            demandSource: demand.source,
            horizontalLineLoad: demand.horizontalLineLoad,
            supportId: scenario.demand.supportId,
            selectedStageId: demand.selectedStageId ?? null,
          },
          structuralWallAndWaler: {
            status: "available",
            anchorHeadActionPerAnchor: {
              horizontal: demand.horizontalForcePerAnchor,
              verticalDownward: demand.verticalForcePerAnchor,
              tendon: demand.designLoad,
              testTendon: demand.testLoad,
            },
            actionPerUnitWallWidth: {
              horizontal: demand.horizontalLineLoad,
              verticalDownward: demand.verticalForcePerAnchor / anchor.horizontalSpacing,
            },
          },
          globalStability: {
            status: "available",
            anchorAxis: {
              head: { ...anchor.head },
              bondStart: anchor.bondStart,
              bondEnd: anchor.bondEnd,
            },
            actions: {
              designTendonForce: demand.designLoad,
              lockOffTendonForce: demand.lockOffLoad,
              designTendonForcePerUnitWidth: demand.designLoad / anchor.horizontalSpacing,
              lockOffTendonForcePerUnitWidth: demand.lockOffLoad / anchor.horizontalSpacing,
            },
            note: "The receiving stability solver determines full, proportional or zero mobilized restraint from the intersection of each trial surface with the free and bond lengths.",
          },
          fem: {
            status: "available-reduced-order",
            type: "prestressed-axial-link-with-external-ground-bond-capacity",
            axialStiffness:
              (anchor.tendon.steelArea * anchor.tendon.elasticModulus) / anchor.freeLength,
            initialForce: demand.lockOffLoad,
            head: { ...anchor.head },
            remotePoint: anchor.bondStart,
          },
        },
      };
      return result({
        status: failed ? "not-verified" : "ok",
        summary: failed
          ? "Ground-anchor design completed, but one or more checks failed."
          : "Ground-anchor geometry, bond, tendon, corrosion and available acceptance-test records were evaluated.",
        outputs,
        warnings: [
          ...(catalogUsed
            ? [
                "FHWA transfer-load catalog values are presumptive preliminary-design values; production anchor testing governs acceptance.",
              ]
            : []),
          ...(soilCatalogBeyondTwelve
            ? [
                "Presumptive soil capacity was credited over at most 12 m because longer soil bond zones require specialized load-transfer methods.",
              ]
            : []),
          ...(testing.length === 0
            ? [
                "No field acceptance-test record was supplied; design checks do not constitute acceptance of an installed anchor.",
              ]
            : []),
          ...(anchor.anchorage.tensileCapacity == null
            ? [
                "Anchor-head, bearing-plate and wall/waler connection resistance must be verified by the structural workflow.",
              ]
            : []),
          ...(outputs.checks.some(
            ({ id, status }) => id === "corrosion-protection-details" && status === "not-analyzed",
          )
            ? [
                "The selected corrosion class is adequate, but its anchorage, free-length and bond-length construction details were not checked.",
              ]
            : []),
          ...(designSituation.limitState !== "SLS" && designSituation.limitState !== "not-specified"
            ? [
                "The selected FHWA workflow is allowable-load based; equivalence with the selected limit-state format was not established automatically.",
              ]
            : []),
        ],
        assumptions: [
          "The anchor is straight and lies in the selected GroundSection2D plane.",
          "The tendon force is obtained from the horizontal wall action using anchor spacing and the cosine of the downward inclination.",
          "Ground-bond capacity is the sum of the assigned allowable transfer capacities along the intersected material zones.",
          "The restricted Rankine surface, when selected, applies only to a vertical wall with horizontal retained ground and drained cohesionless soil.",
          "Field testing is evaluated from supplied readings and does not replace construction quality assurance.",
        ],
        metadata: {
          reference: GROUND_ANCHOR_DESIGN_REFERENCE,
          criteria: GROUND_ANCHOR_FHWA_CRITERIA,
          designSituation: designSituation.toJSON(),
          units: {
            force: "kN",
            length: "m",
            stress: "kN/m2",
            lineLoad: "kN/m",
            axialStiffness: "kN/m",
            angle: "rad",
          },
        },
      });
    } catch (error) {
      const notSupported = error instanceof GroundAnchorNotSupportedError;
      return result({
        status: notSupported ? "not-supported" : "failed",
        summary: notSupported ? errorMessage(error) : "Ground-anchor design failed.",
        warnings: notSupported ? [] : [errorMessage(error)],
        metadata: { errorName: errorName(error) },
      });
    }
  }
}
