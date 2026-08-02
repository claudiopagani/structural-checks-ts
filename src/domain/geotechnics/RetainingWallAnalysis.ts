import { RectangularFootingContactAnalysis } from "../foundations/RectangularFootingContactAnalysis.js";
import { assertExplicitUnitSystem, type UnitSystemInput } from "../units/UnitSystem.js";
import {
  CircularSlopeStabilityAnalysis,
  type CircularSlopeStabilityAnalysisInput,
} from "./CircularSlopeStabilityAnalysis.js";
import type { CircularSlipSurface2DOptions } from "./CircularSlipSurface2D.js";
import {
  GeotechnicalDesignSituation,
  type GeotechnicalDesignSituationInput,
} from "./GeotechnicalDesignSituation.js";
import { GroundModel, type GroundModelInput } from "./GroundModel.js";
import {
  LateralEarthPressureAnalysis,
  type LateralEarthPressureAnalysisInput,
  type LateralEarthPressureAnalysisResult,
  type LateralEarthPressureSeismicInput,
} from "./LateralEarthPressureAnalysis.js";
import type { TrialWedgeSearchOptions } from "./LayeredPseudostaticTrialWedge.js";
import {
  RetainingWallLoadScenario,
  type RetainingWallLoadScenarioOptions,
} from "./RetainingWallLoadScenario.js";
import {
  RetainingWallModel,
  calculateRetainingWallPolygonProperties,
  type RetainingWallModelOptions,
} from "./RetainingWallModel.js";
import {
  ShallowFoundationActionState,
  type ShallowFoundationActionStateOptions,
} from "./ShallowFoundationModel.js";
import {
  ShallowFoundationUltimateLimitStateAnalysis,
  calculateShallowFoundationEffectiveGeometry,
  calculateShallowFoundationSlidingResistance,
} from "./ShallowFoundationUltimateLimitStateAnalysis.js";
import { GEOTECHNICAL_INTERNAL_UNITS, type SoilRecord } from "./SoilMaterial.js";
import type { SoilStructureInterface } from "./SoilStructureInterface.js";
import type { GroundLayer, GroundProfile } from "./GroundProfile.js";
import type { SlopeSurfaceSurcharge2DOptions } from "./SlopeSurfaceSurcharge2D.js";

export const RETAINING_WALL_ANALYSIS_RESULT_SCHEMA_VERSION = "retaining-wall-analysis-result/v1";

const USACE_2022_REFERENCE = "USACE EM 1110-2-2502 (2022), Retaining and Flood Walls";
const USACE_2022_URL =
  "https://www.publications.usace.army.mil/Portals/76/Users/182/86/2486/EM%201110-2-2502.pdf";
const USACE_1989_REFERENCE = "USACE EM 1110-2-2502 (1989), Chapter 4, Stability Analysis";
const USACE_1989_URL =
  "https://www.publications.usace.army.mil/portals/76/publications/engineermanuals/em_1110-2-2502.pdf";
const TOLERANCE = 1e-10;

type RecordValue = Record<string, unknown>;

export interface RetainingWallAnalysisInput {
  groundModel?: GroundModel | GroundModelInput;
  designSituation?: GeotechnicalDesignSituation | GeotechnicalDesignSituationInput;
  wall?: RetainingWallModel | RetainingWallModelOptions;
  scenario?: RetainingWallLoadScenario | RetainingWallLoadScenarioOptions;
  units?: UnitSystemInput | null;
}

export interface RetainingWallAnalysisResult {
  status: "ok" | "not-verified" | "not-supported" | "failed";
  summary: string;
  outputs: RecordValue;
  warnings: string[];
  assumptions: string[];
  metadata: RecordValue;
}

interface AnalysisResultOptions {
  status: RetainingWallAnalysisResult["status"];
  summary: string;
  outputs?: RecordValue;
  warnings?: string[];
  assumptions?: string[];
  metadata?: RecordValue;
}

interface Point {
  x: number;
  z: number;
}

interface Face {
  bottom: Point;
  top: Point;
  inclinationFromVertical: number;
}

interface Load {
  id: string;
  name: string;
  category: string;
  source: string;
  force: { x: number; z: number };
  applicationPoint: Point;
  momentAboutToe: number;
  metadata: RecordValue;
}

interface RetainedSide {
  profileId: string;
  state: string;
  method: string | null;
  interface: SoilStructureInterface | null;
  interfaceParameterSetId: string | null;
  surcharge: number;
  includeSurchargeOverHeel: boolean;
  backfillInclination: number;
  parameterSetId: string | null;
  parameterSetByLayer: Record<string, string>;
  parameterSetByMaterial: Record<string, string>;
  allowIndicativeValues: boolean;
  resultantApplicationHeightRatio: number | null;
  seismic: SoilRecord;
}

interface FrontSideDisabled {
  enabled: false;
}

interface FrontSideEnabled {
  enabled: true;
  profileId: string;
  method: string | null;
  interface: SoilStructureInterface | null;
  interfaceParameterSetId: string | null;
  surcharge: number;
  backfillInclination: number;
  parameterSetId: string | null;
  parameterSetByLayer: Record<string, string>;
  parameterSetByMaterial: Record<string, string>;
  allowIndicativeValues: boolean;
  topElevation: number | null;
  bottomElevation: number | null;
  applicationX: number | null;
  wallInclinationFromVertical: number | null;
  mobilizationFactor: number;
  justification: string;
}

type FrontSide = FrontSideDisabled | FrontSideEnabled;

interface BaseUplift {
  model: string;
  reductionFactor: number;
  justification: string;
}

interface AppliedLoad {
  id: string;
  name: string;
  category: string;
  horizontalForce: number;
  verticalForce: number;
  point: Point;
  metadata: RecordValue;
}

interface ParameterSelection {
  byMaterial: Record<string, string>;
  byLayer: Record<string, string>;
  byInterface: Record<string, string>;
}

interface FoundationDisabled {
  enabled: false;
}

interface FoundationEnabled {
  enabled: true;
  profileId: string;
  porePressureFieldId: string | null;
  baseInterface: SoilStructureInterface | null;
  interfaceParameterSetId: string | null;
  drainedAdhesionRatio: number;
  undrainedAdhesionRatio: number;
  surfaceSurcharge: number;
  parameterSelection: ParameterSelection;
  allowIndicativeValues: boolean;
  bearing: { enabled: boolean; selection: string; criteria: RecordValue };
}

type Foundation = FoundationDisabled | FoundationEnabled;

type GlobalStability =
  | { enabled: false }
  | {
      enabled: true;
      includeWallWeightAsSurcharge: boolean;
      analysisInput: RecordValue;
      inputUnits: UnitSystemInput | null;
    };

interface Criteria {
  minimumSlidingFactorOfSafety: number | null;
  minimumOverturningFactorOfSafety: number | null;
  requireFullBaseContact: boolean;
}

interface ScenarioLike {
  id: string;
  name: string;
  retainedSide: RetainedSide;
  frontSide: FrontSide;
  baseUplift: BaseUplift;
  includeSoilOverHeel: boolean;
  appliedLoads: AppliedLoad[];
  foundation: Foundation;
  globalStability: GlobalStability;
  seismicDirection: "retained-to-front" | "front-to-retained" | null;
  criteria: Criteria;
  toJSON(): unknown;
}

interface PressureResult extends LateralEarthPressureAnalysisResult {
  outputs: RecordValue;
}

interface Equilibrium {
  forceX: number;
  forceZ: number;
  verticalDownward: number;
  momentAboutToe: number;
  resultantDistanceFromToe: number | null;
  resultantLocalX: number | null;
  eccentricityFromBaseCenter: number | null;
  baseCenterX: number;
  momentForFoundationAction: number | null;
}

interface ContactResult extends RecordValue {
  status: string;
  contactType: string;
  equilibriumUtilization?: number;
  kernUtilizationX?: number;
  maximumPressure?: number | null;
}

interface SoilGeometry {
  polygon: Point[];
  heelTop: Point;
}

interface SoilOverHeelResult {
  loads: Load[];
  geometry: SoilGeometry;
}

interface UpliftResult {
  load: Load | null;
  output: RecordValue;
}

interface SlidingOutput extends RecordValue {
  status: "ok" | "not-analyzed";
  direction: "retained-to-front" | "front-to-retained";
  grossDrivingDemand: number;
  opposingExternalActions: number;
  netHorizontalDemand: number;
  baseResistance: number | null;
  totalResistanceAgainstGrossDriving: number | null;
  factorOfSafety: number | null;
  requiredFactorOfSafety: number | null;
  utilizationRatio: number | null;
  ok: boolean | null;
  baseCalculation: RecordValue;
}

interface OverturningOutput extends RecordValue {
  overturningMoment: number;
  resistingMoment: number;
  factorOfSafety: number | null;
  requiredFactorOfSafety: number | null;
  utilizationRatio: number | null;
  ok: boolean | null;
}

interface FoundationCouplingResult extends RecordValue {
  baseSliding: RecordValue & { status: string; reason?: string; capacity?: number };
  bearing: RecordValue & { status: string; outputs?: RecordValue };
  designSituation: RecordValue | null;
  foundation?: RecordValue;
  actionState?: RecordValue;
}

interface GlobalStabilityResult extends RecordValue {
  status: string;
  warning?: string;
}

function result({
  status,
  summary,
  outputs = {},
  warnings = [],
  assumptions = [],
  metadata = {},
}: AnalysisResultOptions): RetainingWallAnalysisResult {
  return { status, summary, outputs, warnings, assumptions, metadata };
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function isRecord(value: unknown): value is RecordValue {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function numberValue(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function normalizeGroundModel(
  input: GroundModel | GroundModelInput | undefined,
  units: UnitSystemInput | null,
): GroundModel {
  return input instanceof GroundModel
    ? input
    : new GroundModel({ ...(input ?? {}), units: input?.units ?? units });
}

function normalizeDesignSituation(
  input: GeotechnicalDesignSituation | GeotechnicalDesignSituationInput | undefined,
  groundModel: GroundModel,
  units: UnitSystemInput | null,
): GeotechnicalDesignSituation {
  return input instanceof GeotechnicalDesignSituation
    ? input
    : new GeotechnicalDesignSituation({
        ...(input ?? {}),
        groundModelId: input?.groundModelId ?? groundModel.id,
        units: input?.units ?? units,
      });
}

function normalizeWall(
  input: RetainingWallModel | RetainingWallModelOptions | undefined,
  units: UnitSystemInput | null,
): RetainingWallModel {
  return input instanceof RetainingWallModel
    ? input
    : new RetainingWallModel({ ...(input ?? {}), units: input?.units ?? units });
}

function normalizeScenario(
  input: RetainingWallLoadScenario | RetainingWallLoadScenarioOptions | undefined,
  units: UnitSystemInput | null,
): ScenarioLike {
  return input instanceof RetainingWallLoadScenario
    ? input
    : new RetainingWallLoadScenario({ ...(input ?? {}), units: input?.units ?? units });
}

function notSupported(message: string): Error {
  const error = new Error(message);
  error.name = "RetainingWallNotSupportedError";
  return error;
}

function makeLoad({
  id,
  name = null,
  category,
  source,
  forceX,
  forceZ,
  point,
  metadata = {},
}: {
  id: string;
  name?: string | null;
  category: string;
  source: string;
  forceX: number;
  forceZ: number;
  point: Point;
  metadata?: RecordValue;
}): Load {
  const momentAboutToe = point.x * forceZ - point.z * forceX;
  return {
    id,
    name: name ?? id,
    category,
    source,
    force: { x: forceX, z: forceZ },
    applicationPoint: { ...point },
    momentAboutToe,
    metadata: structuredClone(metadata ?? {}),
  };
}

function interpolateFaceX(face: Face, z: number): number {
  const ratio = (z - face.bottom.z) / (face.top.z - face.bottom.z);
  return face.bottom.x + ratio * (face.top.x - face.bottom.x);
}

function recordValue(value: unknown, label: string): RecordValue {
  if (!isRecord(value)) throw new Error(`${label} must be an object.`);
  return value;
}

function pressureComponentLoad({
  id,
  category,
  side,
  component,
  magnitude,
  applicationElevation,
  wall,
  face,
  inclination,
  applicationX = null,
  mobilizationFactor = 1,
}: {
  id: string;
  category: string;
  side: "retained" | "front";
  component: "normal" | "tangent";
  magnitude: number;
  applicationElevation: number | null;
  wall: RetainingWallModel;
  face: Face;
  inclination: number;
  applicationX?: number | null;
  mobilizationFactor?: number;
}): Load | null {
  if (Math.abs(magnitude) <= TOLERANCE || applicationElevation == null) return null;
  const z = applicationElevation - wall.baseGlobalElevation;
  const x = applicationX ?? interpolateFaceX(face, z);
  const scaled = magnitude * mobilizationFactor;
  let forceX: number;
  let forceZ: number;
  if (side === "retained") {
    if (component === "normal") {
      forceX = -scaled * Math.cos(inclination);
      forceZ = scaled * Math.sin(inclination);
    } else {
      forceX = -scaled * Math.sin(inclination);
      forceZ = -scaled * Math.cos(inclination);
    }
  } else if (component === "normal") {
    forceX = scaled * Math.cos(inclination);
    forceZ = -scaled * Math.sin(inclination);
  } else {
    forceX = -scaled * Math.sin(inclination);
    forceZ = -scaled * Math.cos(inclination);
  }
  return makeLoad({
    id,
    category,
    source: `${side}-earth-pressure`,
    forceX,
    forceZ,
    point: { x, z },
    metadata: {
      side,
      component,
      unscaledMagnitude: magnitude,
      mobilizationFactor,
      applicationElevation,
    },
  });
}

function buildPressureLoads({
  pressureResult,
  side,
  wall,
  face,
  inclination,
  applicationX = null,
  soilMobilizationFactor = 1,
  resultantApplicationHeightRatio = null,
}: {
  pressureResult: PressureResult;
  side: "retained" | "front";
  wall: RetainingWallModel;
  face: Face;
  inclination: number;
  applicationX?: number | null;
  soilMobilizationFactor?: number;
  resultantApplicationHeightRatio?: number | null;
}): Load[] {
  const outputs = pressureResult.outputs;
  const diagram = outputs.diagram;
  if (isRecord(diagram)) {
    const resultants = recordValue(diagram.resultants, "pressure diagram resultants");
    const soilNormal = recordValue(resultants.soilNormal, "soil normal resultant");
    const soilTangent = recordValue(resultants.soilTangent, "soil tangent resultant");
    const waterNormal = recordValue(resultants.waterNormal, "water normal resultant");
    return [
      pressureComponentLoad({
        id: `${side}-soil-normal`,
        category: side === "retained" ? "earth-pressure" : "passive-pressure",
        side,
        component: "normal",
        magnitude: numberValue(soilNormal.forcePerUnitWidth),
        applicationElevation:
          typeof soilNormal.applicationElevation === "number"
            ? soilNormal.applicationElevation
            : null,
        wall,
        face,
        inclination,
        applicationX,
        mobilizationFactor: soilMobilizationFactor,
      }),
      pressureComponentLoad({
        id: `${side}-soil-tangent`,
        category: side === "retained" ? "earth-pressure" : "passive-pressure",
        side,
        component: "tangent",
        magnitude: numberValue(soilTangent.forcePerUnitWidth),
        applicationElevation:
          typeof soilTangent.applicationElevation === "number"
            ? soilTangent.applicationElevation
            : null,
        wall,
        face,
        inclination,
        applicationX,
        mobilizationFactor: soilMobilizationFactor,
      }),
      pressureComponentLoad({
        id: `${side}-water-normal`,
        category: "water-pressure",
        side,
        component: "normal",
        magnitude: numberValue(waterNormal.forcePerUnitWidth),
        applicationElevation:
          typeof waterNormal.applicationElevation === "number"
            ? waterNormal.applicationElevation
            : null,
        wall,
        face,
        inclination,
        applicationX,
      }),
    ].filter((load): load is Load => load !== null);
  }

  const resultants = recordValue(outputs.resultants, `${side} pressure resultants`);
  const seismic = recordValue(resultants.seismicTotal, `${side} seismic resultant`);
  const bottomElevation = wall.baseGlobalElevation + face.bottom.z;
  const topElevation = wall.baseGlobalElevation + face.top.z;
  const assignedElevation =
    typeof seismic.applicationElevation === "number" ? seismic.applicationElevation : null;
  const applicationElevation =
    assignedElevation ??
    (resultantApplicationHeightRatio == null
      ? null
      : bottomElevation + resultantApplicationHeightRatio * (topElevation - bottomElevation));
  if (applicationElevation == null) {
    throw notSupported(
      `${side} resultant-only pressure requires an explicit resultantApplicationHeightRatio.`,
    );
  }
  const z = applicationElevation - wall.baseGlobalElevation;
  const x = applicationX ?? interpolateFaceX(face, z);
  const normal = numberValue(seismic.normal);
  const tangent = numberValue(seismic.tangent);
  let forceX: number;
  let forceZ: number;
  if (side === "retained") {
    forceX = -normal * Math.cos(inclination) - tangent * Math.sin(inclination);
    forceZ = normal * Math.sin(inclination) - tangent * Math.cos(inclination);
  } else {
    forceX = normal * Math.cos(inclination) - tangent * Math.sin(inclination);
    forceZ = -normal * Math.sin(inclination) - tangent * Math.cos(inclination);
  }
  return [
    makeLoad({
      id: `${side}-seismic-total`,
      category: side === "retained" ? "seismic-earth-pressure" : "passive-pressure",
      source: `${side}-earth-pressure`,
      forceX: forceX * soilMobilizationFactor,
      forceZ: forceZ * soilMobilizationFactor,
      point: { x, z },
      metadata: {
        side,
        component: "seismic-total",
        resultantApplicationHeightRatio,
        assignedApplicationElevation: applicationElevation,
        mobilizationFactor: soilMobilizationFactor,
      },
    }),
  ];
}

function pressureInput({
  profile,
  state,
  method,
  topElevation,
  bottomElevation,
  wallInclinationFromVertical,
  backfillInclination,
  interfaceModel,
  interfaceParameterSetId,
  surcharge,
  parameterSetId,
  parameterSetByLayer,
  parameterSetByMaterial,
  allowIndicativeValues,
  seismic,
}: {
  profile: GroundProfile | null;
  state: string;
  method: string | null;
  topElevation: number;
  bottomElevation: number;
  wallInclinationFromVertical: number;
  backfillInclination: number;
  interfaceModel: SoilStructureInterface | null;
  interfaceParameterSetId: string | null;
  surcharge: number;
  parameterSetId: string | null;
  parameterSetByLayer: Record<string, string>;
  parameterSetByMaterial: Record<string, string>;
  allowIndicativeValues: boolean;
  seismic: LateralEarthPressureSeismicInput;
}): LateralEarthPressureAnalysisInput {
  return {
    ...(profile ? { profile } : {}),
    state,
    method,
    geometry: {
      topElevation,
      bottomElevation,
      wallInclinationFromVertical,
      backfillInclination,
      angleUnits: "rad",
    },
    ...(interfaceModel ? { interface: interfaceModel } : {}),
    interfaceParameterSetId,
    surcharge,
    parameterSetId,
    parameterSetByLayer,
    parameterSetByMaterial,
    allowIndicativeValues,
    seismic,
    units: GEOTECHNICAL_INTERNAL_UNITS,
  };
}

function lateralSeismicInput(
  input: SoilRecord,
  khOverride?: number,
  kvOverride?: number,
): LateralEarthPressureSeismicInput {
  const output: LateralEarthPressureSeismicInput = {};
  const kh = khOverride ?? input.kh;
  const kv = kvOverride ?? input.kv;
  if (typeof kh === "number") output.kh = kh;
  if (typeof kv === "number") output.kv = kv;
  if (typeof input.distributionModel === "string") {
    output.distributionModel = input.distributionModel;
  }
  if (isRecord(input.search)) {
    const search: TrialWedgeSearchOptions = {};
    if (typeof input.search.sampleCount === "number") {
      search.sampleCount = input.search.sampleCount;
    }
    if (typeof input.search.angleTolerance === "number") {
      search.angleTolerance = input.search.angleTolerance;
    }
    if (typeof input.search.maxRefinementIterations === "number") {
      search.maxRefinementIterations = input.search.maxRefinementIterations;
    }
    output.search = search;
  }
  return output;
}

function clipAgainstElevation(
  polygon: readonly Point[],
  elevation: number,
  keepAbove: boolean,
): Point[] {
  const output: Point[] = [];
  const inside = (point: Point): boolean =>
    keepAbove ? point.z >= elevation - TOLERANCE : point.z <= elevation + TOLERANCE;
  for (let index = 0; index < polygon.length; index += 1) {
    const current = polygon[index];
    const next = polygon[(index + 1) % polygon.length];
    if (!current || !next) continue;
    const currentInside = inside(current);
    const nextInside = inside(next);
    if (currentInside) output.push(current);
    if (currentInside !== nextInside) {
      const ratio = (elevation - current.z) / (next.z - current.z);
      output.push({
        x: current.x + ratio * (next.x - current.x),
        z: elevation,
      });
    }
  }
  return output;
}

function clipToBand(polygon: readonly Point[], bottom: number, top: number): Point[] {
  const belowTop = clipAgainstElevation(polygon, top, false);
  if (belowTop.length < 3) return [];
  return clipAgainstElevation(belowTop, bottom, true);
}

function retainedSoilPolygon(wall: RetainingWallModel, backfillInclination: number): SoilGeometry {
  const faceBottom = wall.retainedFace.bottom;
  const faceTop = wall.retainedFace.top;
  const heelBottom = wall.retainedSoil.heelPoint;
  if (faceTop.x >= heelBottom.x - TOLERANCE) {
    throw notSupported(
      "The retained face reaches or crosses the heel; an automatic soil-over-heel polygon cannot be formed.",
    );
  }
  const heelTop: Point = {
    x: heelBottom.x,
    z: faceTop.z + Math.tan(backfillInclination) * (heelBottom.x - faceTop.x),
  };
  if (heelTop.z <= heelBottom.z + TOLERANCE) {
    throw notSupported(
      "The retained surface reaches the heel at or below its bearing point; an automatic soil-over-heel polygon cannot be formed.",
    );
  }
  const polygon: Point[] = [faceBottom, heelBottom, heelTop, faceTop];
  const properties = calculateRetainingWallPolygonProperties(polygon);
  if (properties.area <= TOLERANCE) {
    throw notSupported("The automatic soil-over-heel polygon has zero area.");
  }
  return { polygon, heelTop };
}

function layerForElevation(profile: GroundProfile, elevation: number): GroundLayer {
  if (elevation > profile.groundSurfaceElevation + TOLERANCE) {
    const layer = profile.layers[0];
    if (!layer) throw new Error(`GroundProfile ${profile.id} has no layers.`);
    return layer;
  }
  return profile.getLayerAtElevation(elevation);
}

function soilOverHeelLoads({
  wall,
  profile,
  backfillInclination,
  warnings,
}: {
  wall: RetainingWallModel;
  profile: GroundProfile;
  backfillInclination: number;
  warnings: string[];
}): SoilOverHeelResult {
  const geometry = retainedSoilPolygon(wall, backfillInclination);
  const minimumZ = Math.min(...geometry.polygon.map(({ z }) => z));
  const maximumZ = Math.max(...geometry.polygon.map(({ z }) => z));
  const groundwaterElevation =
    profile.groundwater.model === "hydrostatic" ? profile.groundwater.waterTableElevation : null;
  const boundaries = new Set<number>([minimumZ, maximumZ]);
  for (const layer of profile.layers) {
    boundaries.add(layer.topElevation - wall.baseGlobalElevation);
    boundaries.add(layer.bottomElevation - wall.baseGlobalElevation);
  }
  if (groundwaterElevation != null) {
    boundaries.add(groundwaterElevation - wall.baseGlobalElevation);
  }
  const sorted = [...boundaries]
    .filter((value) => value >= minimumZ - TOLERANCE && value <= maximumZ + TOLERANCE)
    .sort((left, right) => left - right);
  const loads: Load[] = [];
  for (let index = 0; index < sorted.length - 1; index += 1) {
    const bottom = sorted[index];
    const top = sorted[index + 1];
    if (bottom === undefined || top === undefined || top <= bottom + TOLERANCE) continue;
    const clipped = clipToBand(geometry.polygon, bottom, top);
    if (clipped.length < 3) continue;
    const properties = calculateRetainingWallPolygonProperties(clipped);
    if (properties.area <= TOLERANCE) continue;
    const globalMidElevation = wall.baseGlobalElevation + (bottom + top) / 2;
    const layer = layerForElevation(profile, globalMidElevation);
    const material = profile.getMaterial(layer.materialId);
    const saturated =
      groundwaterElevation != null && globalMidElevation < groundwaterElevation - TOLERANCE;
    let unitWeight = saturated ? material.unitWeight.saturated : material.unitWeight.bulk;
    if (unitWeight == null) {
      unitWeight = material.unitWeight.bulk;
      warnings.push(
        `Material ${material.id} has no saturated unit weight; bulk unit weight was used below groundwater for soil over the heel.`,
      );
    }
    const weight = properties.area * unitWeight;
    loads.push(
      makeLoad({
        id: `soil-over-heel-${index + 1}`,
        category: "soil-over-heel",
        source: "retained-profile",
        forceX: 0,
        forceZ: -weight,
        point: properties.centroid,
        metadata: {
          seismicMassWeight: weight,
          layerId: layer.id,
          materialId: material.id,
          saturated,
          unitWeight,
          polygon: clipped,
          area: properties.area,
        },
      }),
    );
  }
  return { loads, geometry };
}

function wallWeightLoads(wall: RetainingWallModel): Load[] {
  return wall.components.map((component) =>
    makeLoad({
      id: `wall-component-${component.id}`,
      name: component.name,
      category: "wall-self-weight",
      source: "retaining-wall-model",
      forceX: 0,
      forceZ: -component.weightPerUnitWidth,
      point: component.centroid,
      metadata: {
        seismicMassWeight: component.weightPerUnitWidth,
        componentId: component.id,
        role: component.role,
        area: component.area,
        unitWeight: component.unitWeight,
      },
    }),
  );
}

function surchargeOverHeelLoad({
  wall,
  scenario,
  soilGeometry,
}: {
  wall: RetainingWallModel;
  scenario: ScenarioLike;
  soilGeometry: SoilGeometry;
}): Load | null {
  if (
    !scenario.retainedSide.includeSurchargeOverHeel ||
    scenario.retainedSide.surcharge <= TOLERANCE
  ) {
    return null;
  }
  const minimumX = wall.retainedFace.top.x;
  const maximumX = soilGeometry.heelTop.x;
  const width = maximumX - minimumX;
  if (width <= TOLERANCE) return null;
  const force = scenario.retainedSide.surcharge * width;
  return makeLoad({
    id: "retained-surcharge-over-heel",
    category: "surface-surcharge",
    source: "retained-side-surcharge",
    forceX: 0,
    forceZ: -force,
    point: {
      x: (minimumX + maximumX) / 2,
      z: (wall.retainedFace.top.z + soilGeometry.heelTop.z) / 2,
    },
    metadata: {
      intensity: scenario.retainedSide.surcharge,
      horizontalLoadedWidth: width,
      seismicMassWeight: 0,
    },
  });
}

function hydrostaticPressureAtBase(profile: GroundProfile | null, baseElevation: number): number {
  if (!profile || profile.groundwater.model === "none") return 0;
  return (
    profile.groundwater.waterUnitWeight *
    Math.max(profile.groundwater.waterTableElevation - baseElevation, 0)
  );
}

function upliftLoad({
  wall,
  scenario,
  heelProfile,
  toeProfile,
  warnings,
}: {
  wall: RetainingWallModel;
  scenario: ScenarioLike;
  heelProfile: GroundProfile;
  toeProfile: GroundProfile | null;
  warnings: string[];
}): UpliftResult {
  const heelPressure = hydrostaticPressureAtBase(heelProfile, wall.baseGlobalElevation);
  const toePressure = hydrostaticPressureAtBase(toeProfile, wall.baseGlobalElevation);
  if (toeProfile == null && heelPressure > TOLERANCE) {
    warnings.push(
      "No front-side or foundation profile was supplied; zero hydrostatic pressure was assumed at the toe of the base.",
    );
  }
  if (scenario.baseUplift.model === "none") {
    if (
      (heelPressure > TOLERANCE || toePressure > TOLERANCE) &&
      !scenario.baseUplift.justification
    ) {
      warnings.push(
        "Base uplift was disabled despite groundwater at the base and no justification was supplied.",
      );
    }
    return {
      load: null,
      output: {
        model: "none",
        toePressure,
        heelPressure,
        reductionFactor: scenario.baseUplift.reductionFactor,
        justification: scenario.baseUplift.justification,
      },
    };
  }
  const factor = scenario.baseUplift.reductionFactor;
  const width = wall.base.width;
  const uplift = (factor * width * (toePressure + heelPressure)) / 2;
  const denominator = toePressure + heelPressure;
  const distanceFromToe =
    denominator <= TOLERANCE
      ? width / 2
      : (width * (toePressure + 2 * heelPressure)) / (3 * denominator);
  return {
    load:
      uplift <= TOLERANCE
        ? null
        : makeLoad({
            id: "base-uplift",
            category: "base-uplift",
            source: "hydrostatic-base-pressure",
            forceX: 0,
            forceZ: uplift,
            point: { x: wall.base.toeX + distanceFromToe, z: 0 },
            metadata: {
              toePressure,
              heelPressure,
              reductionFactor: factor,
              pressureDistribution: "linear",
            },
          }),
    output: {
      model: "linear-hydrostatic",
      toePressure,
      heelPressure,
      reductionFactor: factor,
      forcePerUnitWidth: uplift,
      distanceFromToe,
    },
  };
}

function appliedLoads(scenario: ScenarioLike): Load[] {
  return scenario.appliedLoads.map((load) =>
    makeLoad({
      id: `applied-${load.id}`,
      name: load.name,
      category: load.category,
      source: "assigned-load",
      forceX: load.horizontalForce,
      forceZ: -load.verticalForce,
      point: load.point,
      metadata: load.metadata,
    }),
  );
}

function seismicInertiaLoads(
  loads: readonly Load[],
  designSituation: GeotechnicalDesignSituation,
  scenario: ScenarioLike,
): Load[] {
  if (designSituation.seismic.model !== "pseudostatic") return [];
  if (!scenario.seismicDirection) {
    throw notSupported("A pseudostatic wall analysis requires an explicit seismicDirection.");
  }
  const horizontalSign = scenario.seismicDirection === "retained-to-front" ? -1 : 1;
  const kh = numberValue(designSituation.seismic.kh);
  const kv = numberValue(designSituation.seismic.kv);
  return loads.flatMap((load) => {
    const weight = numberValue(load.metadata.seismicMassWeight);
    if (weight <= TOLERANCE) return [];
    const inertia: Load[] = [];
    if (Math.abs(kh) > TOLERANCE) {
      inertia.push(
        makeLoad({
          id: `${load.id}-horizontal-inertia`,
          category: "pseudostatic-inertia",
          source: load.id,
          forceX: horizontalSign * kh * weight,
          forceZ: 0,
          point: load.applicationPoint,
          metadata: { kh, massWeight: weight, seismicDirection: scenario.seismicDirection },
        }),
      );
    }
    if (Math.abs(kv) > TOLERANCE) {
      inertia.push(
        makeLoad({
          id: `${load.id}-vertical-inertia`,
          category: "pseudostatic-inertia",
          source: load.id,
          forceX: 0,
          forceZ: kv * weight,
          point: load.applicationPoint,
          metadata: {
            kv,
            massWeight: weight,
            convention: "positive-kv-reduces-effective-gravity",
          },
        }),
      );
    }
    return inertia;
  });
}

function totals(loads: readonly Load[], wall: RetainingWallModel): Equilibrium {
  const forceX = loads.reduce((sum, load) => sum + load.force.x, 0);
  const forceZ = loads.reduce((sum, load) => sum + load.force.z, 0);
  const momentAboutToe = loads.reduce((sum, load) => sum + load.momentAboutToe, 0);
  const verticalDownward = -forceZ;
  const resultantDistanceFromToe =
    verticalDownward > TOLERANCE ? -momentAboutToe / verticalDownward : null;
  const baseCenterX = (wall.base.toeX + wall.base.heelX) / 2;
  return {
    forceX,
    forceZ,
    verticalDownward,
    momentAboutToe,
    resultantDistanceFromToe,
    resultantLocalX:
      resultantDistanceFromToe == null ? null : wall.base.toeX + resultantDistanceFromToe,
    eccentricityFromBaseCenter:
      resultantDistanceFromToe == null ? null : resultantDistanceFromToe - wall.base.width / 2,
    baseCenterX,
    momentForFoundationAction:
      resultantDistanceFromToe == null
        ? null
        : verticalDownward * (wall.base.toeX + resultantDistanceFromToe - baseCenterX),
  };
}

function contactAnalysis(equilibrium: Equilibrium, wall: RetainingWallModel): ContactResult {
  if (equilibrium.verticalDownward <= TOLERANCE || equilibrium.momentForFoundationAction == null) {
    return {
      status: "no-compressive-equilibrium",
      contactType: "none",
      reason: "The net downward base action is non-positive.",
    };
  }
  return new RectangularFootingContactAnalysis().analyze({
    widthX: wall.base.width,
    widthY: 1,
    nEd: equilibrium.verticalDownward,
    mxEd: 0,
    myEd: equilibrium.momentForFoundationAction,
  });
}

function actionStateFromEquilibrium(
  wall: RetainingWallModel,
  scenario: ScenarioLike,
  equilibrium: Equilibrium,
): ShallowFoundationActionState | null {
  if (equilibrium.verticalDownward <= TOLERANCE || equilibrium.momentForFoundationAction == null) {
    return null;
  }
  const options: ShallowFoundationActionStateOptions = {
    id: `${wall.id}-${scenario.id}-base-actions`,
    basis: "per-unit-length",
    resultantScope: "total-at-foundation-base",
    actions: {
      verticalForcePerUnitLength: equilibrium.verticalDownward,
      horizontalForcePerUnitLength: equilibrium.forceX,
      momentPerUnitLength: equilibrium.momentForFoundationAction,
    },
    units: GEOTECHNICAL_INTERNAL_UNITS,
    metadata: {
      sourceRetainingWallId: wall.id,
      sourceScenarioId: scenario.id,
      baseUpliftAlreadyIncluded: true,
    },
  };
  return new ShallowFoundationActionState(options);
}

function derivedFoundationSituation({
  designSituation,
  groundModel,
  scenario,
}: {
  designSituation: GeotechnicalDesignSituation;
  groundModel: GroundModel;
  scenario: ScenarioLike;
}): GeotechnicalDesignSituation {
  const original = designSituation.toJSON();
  const requested = scenario.foundation;
  if (!requested.enabled) {
    throw new Error("Foundation data is required to derive a foundation design situation.");
  }
  return new GeotechnicalDesignSituation({
    ...original,
    id: `${designSituation.id}-${scenario.id}-foundation`,
    name: `${designSituation.name} - retaining-wall base`,
    groundModel,
    profileId: requested.profileId,
    porePressureFieldId:
      requested.porePressureFieldId ?? designSituation.spatialSelection.porePressureFieldId,
    sectionId: null,
    parameterSelection: {
      byMaterial: {
        ...designSituation.parameterSelection.byMaterial,
        ...requested.parameterSelection.byMaterial,
      },
      byLayer: requested.parameterSelection.byLayer,
      byInterface: {
        ...designSituation.parameterSelection.byInterface,
        ...requested.parameterSelection.byInterface,
      },
    },
    units: GEOTECHNICAL_INTERNAL_UNITS,
  });
}

function foundationCoupling({
  wall,
  scenario,
  groundModel,
  designSituation,
  actionState,
}: {
  wall: RetainingWallModel;
  scenario: ScenarioLike;
  groundModel: GroundModel;
  designSituation: GeotechnicalDesignSituation;
  actionState: ShallowFoundationActionState | null;
}): FoundationCouplingResult {
  if (!scenario.foundation.enabled) {
    return {
      baseSliding: {
        status: "not-analyzed",
        reason: "Supply foundation data and a base interface to calculate sliding resistance.",
      },
      bearing: { status: "not-analyzed" },
      designSituation: null,
    };
  }
  if (!actionState) {
    return {
      baseSliding: {
        status: "not-analyzed",
        reason: "A positive compressive base action is required.",
      },
      bearing: {
        status: "not-analyzed",
        reason: "A positive compressive base action is required.",
      },
      designSituation: null,
    };
  }
  const foundation = wall.toShallowFoundationModel();
  const foundationSituation = derivedFoundationSituation({
    designSituation,
    groundModel,
    scenario,
  });
  const profile = groundModel.getProfile(scenario.foundation.profileId);
  if (!profile) {
    return {
      baseSliding: {
        status: "not-analyzed",
        reason: `Foundation profile ${scenario.foundation.profileId} was not found.`,
      },
      bearing: {
        status: "not-analyzed",
        reason: `Foundation profile ${scenario.foundation.profileId} was not found.`,
      },
      designSituation: foundationSituation.toJSON(),
    };
  }
  const layer = profile.getLayerAtElevation(
    wall.baseGlobalElevation - Math.max(1e-8, wall.base.width * 1e-8),
  );
  const resolution = foundationSituation.resolveParameterSet({
    groundModel,
    layerId: layer.id,
  });
  let baseSliding: FoundationCouplingResult["baseSliding"];
  if (scenario.foundation.baseInterface == null) {
    baseSliding = {
      status: "not-analyzed",
      reason: "foundation.baseInterface is required for base sliding.",
    };
  } else {
    try {
      const selectedInterfaceParameterSetId =
        scenario.foundation.interfaceParameterSetId ??
        foundationSituation.resolveInterfaceParameterSetId(scenario.foundation.baseInterface.id);
      const selectedInterfaceSet = scenario.foundation.baseInterface.getParameterSet(
        selectedInterfaceParameterSetId,
      );
      if (
        selectedInterfaceSet.basis === "indicative" &&
        !scenario.foundation.allowIndicativeValues &&
        !designSituation.allowIndicativeValues
      ) {
        throw new Error("Indicative base-interface parameters were not explicitly authorized.");
      }
      const effectiveGeometry = calculateShallowFoundationEffectiveGeometry({
        foundation,
        actionState,
      });
      const calculated = calculateShallowFoundationSlidingResistance({
        parameterSet: resolution.parameterSet,
        effectiveGeometry,
        porePressureAtBase: 0,
        interfaceModel: scenario.foundation.baseInterface,
        interfaceParameterSetId: selectedInterfaceParameterSetId,
        drainedAdhesionRatio: scenario.foundation.drainedAdhesionRatio,
        undrainedAdhesionRatio: scenario.foundation.undrainedAdhesionRatio,
      });
      const metadata = recordValue(calculated.metadata ?? {}, "base sliding metadata");
      baseSliding = {
        ...calculated,
        metadata: {
          ...metadata,
          upliftTreatment: "included-in-action-resultant",
          baseLayerId: layer.id,
          parameterResolution: resolution,
        },
      };
    } catch (error) {
      baseSliding = {
        status: "not-analyzed",
        reason: error instanceof Error ? error.message : String(error),
      };
    }
  }
  const bearing = scenario.foundation.bearing.enabled
    ? {
        ...new ShallowFoundationUltimateLimitStateAnalysis().analyze({
          groundModel,
          designSituation: foundationSituation,
          foundation,
          actionState,
          profileId: scenario.foundation.profileId,
          porePressureFieldId: scenario.foundation.porePressureFieldId,
          surfaceSurcharge: scenario.foundation.surfaceSurcharge,
          bearingSelection: scenario.foundation.bearing.selection,
          baseUpliftTreatment: "included-in-action-resultant",
          sliding: {},
          criteria: scenario.foundation.bearing.criteria,
          units: GEOTECHNICAL_INTERNAL_UNITS,
        }),
      }
    : { status: "not-analyzed", summary: "Bearing analysis was disabled." };
  return {
    foundation: { ...foundation.toJSON() },
    actionState: { ...actionState.toJSON() },
    baseSliding,
    bearing,
    designSituation: foundationSituation.toJSON(),
  };
}

function slidingOutput({
  loads,
  baseSliding,
  criteria,
}: {
  loads: readonly Load[];
  baseSliding: FoundationCouplingResult["baseSliding"];
  criteria: Criteria;
}): SlidingOutput {
  const towardToe = loads.reduce((sum, load) => sum + Math.max(-load.force.x, 0), 0);
  const towardRetainedSide = loads.reduce((sum, load) => sum + Math.max(load.force.x, 0), 0);
  const netForce = loads.reduce((sum, load) => sum + load.force.x, 0);
  const direction = netForce <= 0 ? "retained-to-front" : "front-to-retained";
  const grossDriving = direction === "retained-to-front" ? towardToe : towardRetainedSide;
  const opposing = direction === "retained-to-front" ? towardRetainedSide : towardToe;
  const netDemand = Math.abs(netForce);
  const baseResistance =
    baseSliding.status === "ok" ? numberValue(baseSliding.capacity, Number.NaN) : null;
  const factorOfSafety =
    baseResistance == null || grossDriving <= TOLERANCE
      ? null
      : (baseResistance + opposing) / grossDriving;
  const required = criteria.minimumSlidingFactorOfSafety;
  return {
    status: baseResistance == null ? "not-analyzed" : "ok",
    direction,
    actionsTowardToe: towardToe,
    actionsTowardRetainedSide: towardRetainedSide,
    grossDrivingDemand: grossDriving,
    opposingExternalActions: opposing,
    netHorizontalDemand: netDemand,
    baseResistance,
    totalResistanceAgainstGrossDriving: baseResistance == null ? null : baseResistance + opposing,
    factorOfSafety,
    requiredFactorOfSafety: required,
    utilizationRatio:
      baseResistance == null || baseResistance <= TOLERANCE ? null : netDemand / baseResistance,
    ok:
      required == null
        ? null
        : grossDriving <= TOLERANCE
          ? true
          : factorOfSafety == null
            ? null
            : factorOfSafety >= required,
    baseCalculation: baseSliding,
  };
}

function overturningOutput(loads: readonly Load[], criteria: Criteria): OverturningOutput {
  const overturningMoment = loads.reduce((sum, load) => sum + Math.max(load.momentAboutToe, 0), 0);
  const resistingMoment = loads.reduce((sum, load) => sum + Math.max(-load.momentAboutToe, 0), 0);
  const factorOfSafety = overturningMoment > TOLERANCE ? resistingMoment / overturningMoment : null;
  const required = criteria.minimumOverturningFactorOfSafety;
  return {
    referencePoint: "base-toe",
    overturningMoment,
    resistingMoment,
    netMoment: overturningMoment - resistingMoment,
    factorOfSafety,
    requiredFactorOfSafety: required,
    utilizationRatio:
      resistingMoment > TOLERANCE
        ? overturningMoment / resistingMoment
        : overturningMoment <= TOLERANCE
          ? 0
          : null,
    ok:
      required == null
        ? null
        : overturningMoment <= TOLERANCE
          ? true
          : factorOfSafety == null
            ? null
            : factorOfSafety >= required,
  };
}

function globalStabilityCoupling({
  wall,
  scenario,
  groundModel,
  designSituation,
}: {
  wall: RetainingWallModel;
  scenario: ScenarioLike;
  groundModel: GroundModel;
  designSituation: GeotechnicalDesignSituation;
}): GlobalStabilityResult {
  if (!scenario.globalStability.enabled) return { status: "not-analyzed" };
  if (designSituation.seismic.model !== "none") {
    return {
      status: "not-supported",
      reason:
        "Pseudostatic wall inertia cannot be represented by the current vertical surface-surcharge coupling.",
    };
  }
  const input = scenario.globalStability.analysisInput;
  const sourceSurcharges = input.surfaceSurcharges;
  const surfaceSurcharges: SlopeSurfaceSurcharge2DOptions[] = Array.isArray(sourceSurcharges)
    ? sourceSurcharges.flatMap((value) => {
        if (!isRecord(value)) return [];
        const surcharge: SlopeSurfaceSurcharge2DOptions = {};
        if (typeof value.id === "string") surcharge.id = value.id;
        if (typeof value.intensity === "number") surcharge.intensity = value.intensity;
        if (typeof value.minimumX === "number") surcharge.minimumX = value.minimumX;
        if (typeof value.maximumX === "number") surcharge.maximumX = value.maximumX;
        if (isRecord(value.metadata)) surcharge.metadata = value.metadata;
        return [surcharge];
      })
    : [];
  let equivalentWallSurcharge: RecordValue | null = null;
  if (scenario.globalStability.includeWallWeightAsSurcharge) {
    const weight = wall.components.reduce(
      (sum, component) => sum + component.weightPerUnitWidth,
      0,
    );
    equivalentWallSurcharge = {
      id: `${wall.id}-equivalent-global-stability-surcharge`,
      intensity: weight / wall.base.width,
      minimumX: wall.toeGlobalX,
      maximumX: wall.heelGlobalX,
      units: GEOTECHNICAL_INTERNAL_UNITS,
      metadata: {
        sourceRetainingWallId: wall.id,
        representation: "uniform-vertical-equivalent-surcharge",
      },
    };
    surfaceSurcharges.push(equivalentWallSurcharge);
  }
  const analysisInput: CircularSlopeStabilityAnalysisInput = {
    groundModel,
    designSituation,
    surfaceSurcharges,
    units: scenario.globalStability.inputUnits ?? GEOTECHNICAL_INTERNAL_UNITS,
  };
  if (typeof input.mode === "string") analysisInput.mode = input.mode;
  if (typeof input.method === "string") analysisInput.method = input.method;
  if (typeof input.movementDirection === "string") {
    analysisInput.movementDirection = input.movementDirection;
  }
  if (typeof input.sectionId === "string") analysisInput.sectionId = input.sectionId;
  if (typeof input.porePressureFieldId === "string") {
    analysisInput.porePressureFieldId = input.porePressureFieldId;
  }
  if (typeof input.sliceCount === "number") analysisInput.sliceCount = input.sliceCount;
  if (isRecord(input.slipSurface)) {
    const slipSurfaceInput: CircularSlipSurface2DOptions = {};
    if (typeof input.slipSurface.id === "string") slipSurfaceInput.id = input.slipSurface.id;
    if (isRecord(input.slipSurface.center)) {
      slipSurfaceInput.center = {
        x: input.slipSurface.center.x,
        z: input.slipSurface.center.z,
      };
    }
    if (typeof input.slipSurface.radius === "number") {
      slipSurfaceInput.radius = input.slipSurface.radius;
    }
    if (typeof input.slipSurface.entryX === "number" || input.slipSurface.entryX === null) {
      slipSurfaceInput.entryX = input.slipSurface.entryX;
    }
    if (typeof input.slipSurface.exitX === "number" || input.slipSurface.exitX === null) {
      slipSurfaceInput.exitX = input.slipSurface.exitX;
    }
    if (typeof input.slipSurface.movementDirection === "string") {
      slipSurfaceInput.movementDirection = input.slipSurface.movementDirection;
    }
    if (isRecord(input.slipSurface.metadata)) {
      slipSurfaceInput.metadata = input.slipSurface.metadata;
    }
    analysisInput.slipSurface = slipSurfaceInput;
  }
  const analysis = new CircularSlopeStabilityAnalysis().analyze(analysisInput);
  return {
    status: analysis.status,
    fidelity: "screening-equivalent-surcharge",
    equivalentWallSurcharge,
    analysis,
    warning:
      "The circular global-stability solver represents wall self-weight as a vertical surface surcharge; wall geometry, wall-soil contact forces and structural inertia are not finite elements.",
  };
}

export class RetainingWallAnalysis {
  analyze({
    groundModel: groundModelInput,
    designSituation: designSituationInput,
    wall: wallInput,
    scenario: scenarioInput,
    units = null,
  }: RetainingWallAnalysisInput = {}): RetainingWallAnalysisResult {
    try {
      assertExplicitUnitSystem(units, "RetainingWallAnalysis");
      const groundModel = normalizeGroundModel(groundModelInput, units);
      const designSituation = normalizeDesignSituation(designSituationInput, groundModel, units);
      designSituation.validateAgainst(groundModel);
      const wall = normalizeWall(wallInput, units);
      const scenario = normalizeScenario(scenarioInput, units);
      const pseudostatic = designSituation.seismic.model === "pseudostatic";
      if (pseudostatic && scenario.retainedSide.state !== "seismic-active") {
        throw notSupported(
          "A pseudostatic design situation requires retainedSide.state=seismic-active.",
        );
      }
      if (!pseudostatic && scenario.retainedSide.state === "seismic-active") {
        throw notSupported(
          "A seismic-active pressure state requires a pseudostatic design situation.",
        );
      }

      const warnings: string[] = [];
      const assumptions: string[] = [];
      const retainedProfile = groundModel.getProfile(scenario.retainedSide.profileId);
      const retainedTop = wall.toGlobalPoint(wall.retainedFace.top).z;
      const retainedBottom = wall.toGlobalPoint(wall.retainedFace.bottom).z;
      const seismic = pseudostatic
        ? lateralSeismicInput(
            scenario.retainedSide.seismic,
            numberValue(designSituation.seismic.kh),
            numberValue(designSituation.seismic.kv),
          )
        : lateralSeismicInput(scenario.retainedSide.seismic);
      const retainedPressure = new LateralEarthPressureAnalysis().analyze(
        pressureInput({
          profile: retainedProfile,
          state: scenario.retainedSide.state,
          method: scenario.retainedSide.method,
          topElevation: retainedTop,
          bottomElevation: retainedBottom,
          wallInclinationFromVertical: wall.retainedFace.inclinationFromVertical,
          backfillInclination: scenario.retainedSide.backfillInclination,
          interfaceModel: scenario.retainedSide.interface,
          interfaceParameterSetId:
            scenario.retainedSide.interfaceParameterSetId ??
            (scenario.retainedSide.interface == null
              ? null
              : designSituation.resolveInterfaceParameterSetId(scenario.retainedSide.interface.id)),
          surcharge: scenario.retainedSide.surcharge,
          parameterSetId: scenario.retainedSide.parameterSetId,
          parameterSetByLayer: {
            ...(designSituation.spatialSelection.profileId === scenario.retainedSide.profileId
              ? designSituation.parameterSelection.byLayer
              : {}),
            ...scenario.retainedSide.parameterSetByLayer,
          },
          parameterSetByMaterial: {
            ...designSituation.parameterSelection.byMaterial,
            ...scenario.retainedSide.parameterSetByMaterial,
          },
          allowIndicativeValues:
            scenario.retainedSide.allowIndicativeValues || designSituation.allowIndicativeValues,
          seismic,
        }),
      );
      if (retainedPressure.status !== "ok") {
        return result({
          status: retainedPressure.status,
          summary: `Retained-side pressure is unavailable: ${retainedPressure.summary}`,
          outputs: {
            schemaVersion: RETAINING_WALL_ANALYSIS_RESULT_SCHEMA_VERSION,
            wall: wall.toJSON(),
            scenario: recordValue(scenario.toJSON(), "retaining-wall scenario"),
            retainedPressure,
          },
          warnings: retainedPressure.warnings,
          metadata: { stage: "retained-pressure" },
        });
      }
      warnings.push(...retainedPressure.warnings);
      assumptions.push(...retainedPressure.assumptions);
      const loads: Load[] = [
        ...wallWeightLoads(wall),
        ...buildPressureLoads({
          pressureResult: retainedPressure,
          side: "retained",
          wall,
          face: wall.retainedFace,
          inclination: wall.retainedFace.inclinationFromVertical,
          resultantApplicationHeightRatio: scenario.retainedSide.resultantApplicationHeightRatio,
        }),
      ];

      let soilGeometry: SoilGeometry | null = null;
      if (scenario.includeSoilOverHeel) {
        if (!retainedProfile) {
          throw new Error(`Retained profile ${scenario.retainedSide.profileId} was not found.`);
        }
        const soil = soilOverHeelLoads({
          wall,
          profile: retainedProfile,
          backfillInclination: scenario.retainedSide.backfillInclination,
          warnings,
        });
        soilGeometry = soil.geometry;
        loads.push(...soil.loads);
        const surcharge = surchargeOverHeelLoad({ wall, scenario, soilGeometry });
        if (surcharge) loads.push(surcharge);
      }

      let frontPressure: PressureResult | null = null;
      let frontProfile: GroundProfile | null = null;
      if (scenario.frontSide.enabled) {
        frontProfile = groundModel.getProfile(scenario.frontSide.profileId);
        if (!frontProfile) {
          throw new Error(`Front profile ${scenario.frontSide.profileId} was not found.`);
        }
        const topElevation = scenario.frontSide.topElevation ?? frontProfile.groundSurfaceElevation;
        const bottomElevation = scenario.frontSide.bottomElevation ?? wall.baseGlobalElevation;
        const physicalInclination = scenario.frontSide.wallInclinationFromVertical ?? 0;
        frontPressure = new LateralEarthPressureAnalysis().analyze(
          pressureInput({
            profile: frontProfile,
            state: "passive",
            method: scenario.frontSide.method,
            topElevation,
            bottomElevation,
            wallInclinationFromVertical: -physicalInclination,
            backfillInclination: scenario.frontSide.backfillInclination,
            interfaceModel: scenario.frontSide.interface,
            interfaceParameterSetId:
              scenario.frontSide.interfaceParameterSetId ??
              (scenario.frontSide.interface == null
                ? null
                : designSituation.resolveInterfaceParameterSetId(scenario.frontSide.interface.id)),
            surcharge: scenario.frontSide.surcharge,
            parameterSetId: scenario.frontSide.parameterSetId,
            parameterSetByLayer: {
              ...(designSituation.spatialSelection.profileId === scenario.frontSide.profileId
                ? designSituation.parameterSelection.byLayer
                : {}),
              ...scenario.frontSide.parameterSetByLayer,
            },
            parameterSetByMaterial: {
              ...designSituation.parameterSelection.byMaterial,
              ...scenario.frontSide.parameterSetByMaterial,
            },
            allowIndicativeValues:
              scenario.frontSide.allowIndicativeValues || designSituation.allowIndicativeValues,
            seismic: {},
          }),
        );
        if (frontPressure.status !== "ok") {
          return result({
            status: frontPressure.status,
            summary: `Front-side pressure is unavailable: ${frontPressure.summary}`,
            outputs: {
              schemaVersion: RETAINING_WALL_ANALYSIS_RESULT_SCHEMA_VERSION,
              wall: wall.toJSON(),
              scenario: recordValue(scenario.toJSON(), "retaining-wall scenario"),
              retainedPressure,
              frontPressure,
            },
            warnings: unique([...warnings, ...frontPressure.warnings]),
            metadata: { stage: "front-pressure" },
          });
        }
        warnings.push(...frontPressure.warnings);
        assumptions.push(...frontPressure.assumptions);
        const face: Face = {
          bottom: {
            x: scenario.frontSide.applicationX ?? wall.base.toeX,
            z: bottomElevation - wall.baseGlobalElevation,
          },
          top: {
            x:
              (scenario.frontSide.applicationX ?? wall.base.toeX) +
              (topElevation - bottomElevation) * Math.tan(physicalInclination),
            z: topElevation - wall.baseGlobalElevation,
          },
          inclinationFromVertical: physicalInclination,
        };
        loads.push(
          ...buildPressureLoads({
            pressureResult: frontPressure,
            side: "front",
            wall,
            face,
            inclination: physicalInclination,
            soilMobilizationFactor: scenario.frontSide.mobilizationFactor,
          }),
        );
      }

      const toeWaterProfile =
        frontProfile ??
        (scenario.foundation.enabled
          ? groundModel.getProfile(scenario.foundation.profileId)
          : null);
      const uplift = upliftLoad({
        wall,
        scenario,
        heelProfile:
          retainedProfile ??
          (() => {
            throw new Error(`Retained profile ${scenario.retainedSide.profileId} was not found.`);
          })(),
        toeProfile: toeWaterProfile,
        warnings,
      });
      if (uplift.load) loads.push(uplift.load);
      loads.push(...appliedLoads(scenario));
      const massLoads = [...loads];
      const inertia = seismicInertiaLoads(massLoads, designSituation, scenario);
      loads.push(...inertia);
      if (pseudostatic && scenario.retainedSide.surcharge > TOLERANCE) {
        warnings.push(
          "The surface surcharge contributes to earth pressure but receives no separate inertial force in the retaining-wall rigid-body equilibrium.",
        );
      }

      const equilibrium = totals(loads, wall);
      const contact = contactAnalysis(equilibrium, wall);
      const actionState = actionStateFromEquilibrium(wall, scenario, equilibrium);
      const foundation = foundationCoupling({
        wall,
        scenario,
        groundModel,
        designSituation,
        actionState,
      });
      const sliding = slidingOutput({
        loads,
        baseSliding: foundation.baseSliding,
        criteria: scenario.criteria,
      });
      const overturning = overturningOutput(loads, scenario.criteria);
      const globalStability = globalStabilityCoupling({
        wall,
        scenario,
        groundModel,
        designSituation,
      });
      if (globalStability.warning) warnings.push(globalStability.warning);

      const checks: RecordValue[] = [
        {
          id: "compressive-base-equilibrium",
          demand: contact.equilibriumUtilization ?? null,
          capacity: 1,
          utilizationRatio: contact.equilibriumUtilization ?? null,
          ok: contact.status === "ok",
        },
        {
          id: "full-base-contact",
          demand: contact.kernUtilizationX ?? null,
          capacity: 1,
          utilizationRatio: contact.kernUtilizationX ?? null,
          ok: scenario.criteria.requireFullBaseContact ? contact.contactType === "full" : null,
        },
        {
          id: "base-sliding",
          demand: sliding.grossDrivingDemand,
          capacity: sliding.totalResistanceAgainstGrossDriving,
          utilizationRatio: sliding.utilizationRatio,
          factorOfSafety: sliding.factorOfSafety,
          requiredFactorOfSafety: sliding.requiredFactorOfSafety,
          ok: sliding.ok,
        },
        {
          id: "overturning-about-toe",
          demand: overturning.overturningMoment,
          capacity: overturning.resistingMoment,
          utilizationRatio: overturning.utilizationRatio,
          factorOfSafety: overturning.factorOfSafety,
          requiredFactorOfSafety: overturning.requiredFactorOfSafety,
          ok: overturning.ok,
        },
      ];
      const foundationOutputs = foundation.bearing.outputs;
      const foundationChecks = isRecord(foundationOutputs) ? foundationOutputs.checks : undefined;
      if (Array.isArray(foundationChecks)) {
        for (const check of foundationChecks) {
          if (!isRecord(check) || typeof check.id !== "string") continue;
          checks.push({ ...check, id: `foundation-${check.id}` });
        }
      }
      const failedCheck = checks.some(({ ok }) => ok === false);
      const requestedNotSupported =
        (scenario.criteria.minimumSlidingFactorOfSafety != null && sliding.status !== "ok") ||
        (scenario.foundation.enabled &&
          scenario.foundation.bearing.enabled &&
          foundation.bearing.status === "not-supported") ||
        (scenario.globalStability.enabled && globalStability.status === "not-supported");
      const coupledFailed =
        (scenario.foundation.enabled &&
          scenario.foundation.bearing.enabled &&
          foundation.bearing.status === "failed") ||
        (scenario.globalStability.enabled && globalStability.status === "failed");
      const status: RetainingWallAnalysisResult["status"] = coupledFailed
        ? "failed"
        : requestedNotSupported
          ? "not-supported"
          : failedCheck || foundation.bearing.status === "not-verified"
            ? "not-verified"
            : "ok";

      const bearingCapacity = isRecord(foundationOutputs)
        ? recordValue(foundationOutputs.capacity ?? {}, "foundation capacity")
        : {};
      return result({
        status,
        summary:
          status === "ok"
            ? "Retaining-wall actions, rigid-body equilibrium and requested geotechnical couplings completed."
            : status === "not-verified"
              ? "Retaining-wall analysis completed, but one or more explicit checks are not verified."
              : status === "not-supported"
                ? "Retaining-wall equilibrium completed, but a requested coupled analysis is outside its supported field."
                : "Retaining-wall equilibrium completed, but a requested coupled analysis failed.",
        outputs: {
          schemaVersion: RETAINING_WALL_ANALYSIS_RESULT_SCHEMA_VERSION,
          groundModelId: groundModel.id,
          designSituationId: designSituation.id,
          wall: wall.toJSON(),
          scenario: recordValue(scenario.toJSON(), "retaining-wall scenario"),
          pressureActions: {
            retained: retainedPressure,
            front: frontPressure,
          },
          soilOverHeel:
            soilGeometry == null
              ? { status: "not-included" }
              : { status: "included", geometry: soilGeometry },
          baseUplift: uplift.output,
          loads,
          equilibrium,
          sliding,
          overturning,
          contact,
          foundation,
          globalStability,
          checks,
          demand: {
            horizontal: sliding.grossDrivingDemand,
            overturningMoment: overturning.overturningMoment,
            maximumBasePressure: contact.maximumPressure ?? null,
          },
          capacity: {
            baseSliding: sliding.totalResistanceAgainstGrossDriving,
            overturningMoment: overturning.resistingMoment,
            bearingPressure: bearingCapacity.bearingPressure ?? null,
          },
          utilizationRatio: Math.max(
            ...checks.map(({ utilizationRatio }) => numberValue(utilizationRatio)),
          ),
          structuralCoupling: {
            level: "actions-and-contact-transfer",
            retainedFacePressureDiagram: isRecord(retainedPressure.outputs.diagram)
              ? retainedPressure.outputs.diagram
              : null,
            frontFacePressureDiagram:
              frontPressure && isRecord(frontPressure.outputs.diagram)
                ? frontPressure.outputs.diagram
                : null,
            rigidBodyLoads: loads,
            baseActionState: actionState?.toJSON() ?? null,
            compressionOnlyContact: contact,
            foundationCapacity: foundationOutputs ?? null,
            structuralVerification: {
              status: "not-analyzed",
              reason:
                "Stem, heel, toe and reinforcement checks belong to a structural retaining-wall verifier consuming these actions.",
            },
            femTransfer: {
              status: "contract-available",
              pressureDiagramBasis: "per-unit-vertical-projection",
              signConvention: {
                x: "positive-from-toe-toward-retained-side",
                z: "positive-upward",
                moment: "positive-counterclockwise",
              },
            },
          },
        },
        warnings: unique([
          ...warnings,
          ...(scenario.frontSide.enabled && scenario.frontSide.mobilizationFactor > 0
            ? [
                `Front passive soil resistance is multiplied by the explicit mobilization factor ${scenario.frontSide.mobilizationFactor}; water pressure is not reduced.`,
              ]
            : []),
          ...(foundation.baseSliding.status !== "ok"
            ? [`Base sliding was not analyzed: ${foundation.baseSliding.reason}`]
            : []),
          ...(contact.contactType !== "full"
            ? [
                "The base is not in full compression; use the reported compression-only contact distribution for structural base actions.",
              ]
            : []),
        ]),
        assumptions: unique([
          ...assumptions,
          "The wall is analyzed in plane strain per unit out-of-plane width.",
          "The wall and assigned soil-over-heel loads are rigid-body actions; structural deformation is not used to redistribute earth pressure.",
          "Earth pressure acts on the retained face, while soil self-weight over the heel is transferred as a separate vertical action.",
          "The base reaction is compression-only and is reconstructed from the net vertical force and moment resultant.",
          "No normative partial factors or default safety-factor limits are introduced by the method-neutral solver.",
          pseudostatic
            ? "Pseudostatic wall and soil-over-heel inertia use the assigned kh and kv coefficients and do not predict dynamic response or permanent displacement."
            : "Wall and soil-over-heel inertia are absent in the static design situation.",
        ]),
        metadata: {
          method: "two-dimensional-rigid-body-limit-equilibrium",
          references: [
            { reference: USACE_2022_REFERENCE, url: USACE_2022_URL },
            { reference: USACE_1989_REFERENCE, url: USACE_1989_URL },
          ],
          designSituation: designSituation.toJSON(),
          units: {
            length: "m",
            forcePerUnitWidth: "kN/m",
            momentPerUnitWidth: "kN.m/m",
            pressure: "kN/m2",
            unitWeight: "kN/m3",
            angle: "rad",
          },
        },
      });
    } catch (error) {
      const name = error instanceof Error ? error.name : Object.prototype.toString.call(error);
      const message = error instanceof Error ? error.message : String(error);
      return result({
        status: name === "RetainingWallNotSupportedError" ? "not-supported" : "failed",
        summary:
          name === "RetainingWallNotSupportedError" ? message : "Retaining-wall analysis failed.",
        warnings: [message],
        metadata: { errorName: name },
      });
    }
  }
}
