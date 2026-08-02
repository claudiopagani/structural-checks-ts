import {
  assertExplicitUnitSystem,
  createUnitResolver,
  type UnitSystemInput,
} from "../units/UnitSystem.js";
import {
  GeotechnicalDesignSituation,
  type GeotechnicalDesignSituationInput,
} from "./GeotechnicalDesignSituation.js";
import { GroundModel, type GroundModelInput } from "./GroundModel.js";
import {
  SHALLOW_FOUNDATION_ACTION_BASES,
  ShallowFoundationActionState,
  ShallowFoundationModel,
  type ShallowFoundationActionStateOptions,
  type ShallowFoundationModelOptions,
  type ShallowFoundationShape,
} from "./ShallowFoundationModel.js";
import {
  SoilStructureInterface,
  type SoilStructureInterfaceOptions,
  type SoilStructureInterfaceResolution,
} from "./SoilStructureInterface.js";
import { GEOTECHNICAL_INTERNAL_UNITS, type SoilParameterSet } from "./SoilMaterial.js";
import type { GroundLayer, GroundProfile } from "./GroundProfile.js";
import type { PorePressureField2D } from "./PorePressureField2D.js";

export const SHALLOW_FOUNDATION_ULS_RESULT_SCHEMA_VERSION = "shallow-foundation-uls-result/v1";

export type ShallowFoundationBearingMethod = "usace-meyerhof-2025" | "fhwa-vesic-2002";
export const SHALLOW_FOUNDATION_BEARING_METHODS = Object.freeze([
  "usace-meyerhof-2025",
  "fhwa-vesic-2002",
]) satisfies readonly ShallowFoundationBearingMethod[];

export type ShallowFoundationBearingSelection = "minimum" | "mean" | ShallowFoundationBearingMethod;
export const SHALLOW_FOUNDATION_BEARING_SELECTIONS = Object.freeze([
  "minimum",
  "mean",
  "usace-meyerhof-2025",
  "fhwa-vesic-2002",
]) satisfies readonly ShallowFoundationBearingSelection[];

export type ShallowFoundationBaseUpliftTreatment =
  | "subtract-uniform-pressure"
  | "included-in-action-resultant";
export const SHALLOW_FOUNDATION_BASE_UPLIFT_TREATMENTS = Object.freeze([
  "subtract-uniform-pressure",
  "included-in-action-resultant",
]) satisfies readonly ShallowFoundationBaseUpliftTreatment[];

const USACE_REFERENCE =
  "USACE EM 1110-1-1905 (31 July 2025), Chapter 5, equations 5-2 through 5-30 and Tables 5-2 through 5-4";
const FHWA_REFERENCE = "FHWA GEC 6, FHWA-IF-02-054 (2002), Chapter 5";
const TOLERANCE = 1e-10;
type RecordValue = Record<string, unknown>;
type ResultStatus = "ok" | "not-supported" | "not-verified" | "failed";

export interface ShallowFoundationUltimateLimitStateAnalysisInput {
  groundModel?: GroundModel | GroundModelInput;
  designSituation?: GeotechnicalDesignSituation | GeotechnicalDesignSituationInput;
  foundation?: ShallowFoundationModel | ShallowFoundationModelOptions;
  actionState?: ShallowFoundationActionState | ShallowFoundationActionStateOptions;
  profileId?: string | null;
  porePressureFieldId?: string | null;
  surfaceSurcharge?: number;
  bearingSelection?: string;
  baseUpliftTreatment?: string;
  sliding?: ShallowFoundationSlidingInput;
  criteria?: ShallowFoundationUlsCriteriaInput;
  units?: UnitSystemInput | null;
}

export interface ShallowFoundationUltimateLimitStateAnalysisResult {
  status: ResultStatus;
  summary: string;
  outputs: RecordValue;
  warnings: string[];
  assumptions: string[];
  metadata: RecordValue;
}

interface EffectiveActions {
  vertical: number;
  horizontalX: number;
  horizontalY: number;
  horizontalMagnitude: number;
  momentX: number;
  momentY: number;
}

export interface ShallowFoundationEffectiveGeometry {
  shape: ShallowFoundationShape;
  eccentricity: number;
  eccentricityX?: number;
  eccentricityY?: number;
  eccentricityWidth?: number;
  eccentricityLength?: number;
  effectiveWidth: number;
  effectiveLength: number | null;
  effectiveArea: number | null;
  effectiveAreaPerUnitLength?: number | null;
  effectiveWidthOnWidthAxis?: number;
  effectiveLengthOnLengthAxis?: number;
  shapeRatio: number;
  originalWidth: number;
  originalLength: number | null;
  originalArea: number | null;
  middleThirdUtilization: number;
  exactNoTensionKernUtilization: number;
  compressiveEquilibriumUtilization: number;
  actions: EffectiveActions;
}

export interface ShallowFoundationUlsCriteriaInput {
  minimumBearingFactorOfSafety?: number | null;
  minimumSlidingFactorOfSafety?: number | null;
}

export interface ShallowFoundationSlidingInput {
  interface?: SoilStructureInterface | SoilStructureInterfaceOptions | null;
  interfaceParameterSetId?: string | null;
  drainedAdhesionRatio?: number;
  undrainedAdhesionRatio?: number;
  includePassiveResistance?: boolean;
}

type EffectiveGeometry = ShallowFoundationEffectiveGeometry;

interface AnalysisResultOptions {
  status: ResultStatus;
  summary: string;
  outputs?: RecordValue;
  warnings?: string[];
  assumptions?: string[];
  metadata?: RecordValue;
}

function result({
  status,
  summary,
  outputs = {},
  warnings = [],
  assumptions = [],
  metadata = {},
}: AnalysisResultOptions): ShallowFoundationUltimateLimitStateAnalysisResult {
  return { status, summary, outputs, warnings, assumptions, metadata };
}

function finite(value: unknown, label: string): number {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`${label} must be finite.`);
  return number;
}

function nonNegative(value: unknown, label: string): number {
  const number = finite(value, label);
  if (number < 0) throw new Error(`${label} must be non-negative.`);
  return number;
}

function positiveOrNull(value: unknown, label: string): number | null {
  if (value == null) return null;
  const number = finite(value, label);
  if (number <= 0) throw new Error(`${label} must be positive when supplied.`);
  return number;
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function clamp(value: number, minimum = 0, maximum = 1): number {
  return Math.min(maximum, Math.max(minimum, value));
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

function normalizeFoundation(
  input: ShallowFoundationModel | ShallowFoundationModelOptions | undefined,
  units: UnitSystemInput | null,
): ShallowFoundationModel {
  return input instanceof ShallowFoundationModel
    ? input
    : new ShallowFoundationModel({ ...(input ?? {}), units: input?.units ?? units });
}

function normalizeActions(
  input: ShallowFoundationActionState | ShallowFoundationActionStateOptions | undefined,
  units: UnitSystemInput | null,
): ShallowFoundationActionState {
  return input instanceof ShallowFoundationActionState
    ? input
    : new ShallowFoundationActionState({ ...(input ?? {}), units: input?.units ?? units });
}

function validateActionBasis(
  foundation: ShallowFoundationModel,
  actions: ShallowFoundationActionState,
): void {
  const expected = foundation.shape === "strip" ? "per-unit-length" : "total";
  if (!SHALLOW_FOUNDATION_ACTION_BASES.some((candidate) => candidate === actions.basis)) {
    throw new Error(`Unsupported action basis: ${actions.basis}.`);
  }
  if (actions.basis !== expected) {
    throw new Error(`${foundation.shape} foundations require ${expected} actions.`);
  }
}

function totalActionComponents(actions: ShallowFoundationActionState): EffectiveActions {
  const values = actions.actions;
  if (!("verticalForce" in values)) throw new Error("Total action components are required.");
  return {
    vertical: values.verticalForce,
    horizontalX: values.horizontalX,
    horizontalY: values.horizontalY,
    horizontalMagnitude: Math.hypot(values.horizontalX, values.horizontalY),
    momentX: values.momentX,
    momentY: values.momentY,
  };
}

function stripActionComponents(actions: ShallowFoundationActionState): EffectiveActions {
  const values = actions.actions;
  if (!("verticalForcePerUnitLength" in values)) {
    throw new Error("Per-unit-length action components are required.");
  }
  return {
    vertical: values.verticalForcePerUnitLength,
    horizontalX: values.horizontalForcePerUnitLength,
    horizontalY: 0,
    horizontalMagnitude: Math.abs(values.horizontalForcePerUnitLength),
    momentX: 0,
    momentY: values.momentPerUnitLength,
  };
}

export interface ShallowFoundationEffectiveGeometryInput {
  foundation?: ShallowFoundationModel;
  actionState?: ShallowFoundationActionState;
}

export function calculateShallowFoundationEffectiveGeometry({
  foundation,
  actionState,
}: ShallowFoundationEffectiveGeometryInput = {}): ShallowFoundationEffectiveGeometry {
  if (!(foundation instanceof ShallowFoundationModel)) {
    throw new Error("foundation must be a ShallowFoundationModel.");
  }
  if (!(actionState instanceof ShallowFoundationActionState)) {
    throw new Error("actionState must be a ShallowFoundationActionState.");
  }
  validateActionBasis(foundation, actionState);
  const actions =
    foundation.shape === "strip"
      ? stripActionComponents(actionState)
      : totalActionComponents(actionState);
  const vertical = actions.vertical;

  if (foundation.shape === "circular") {
    if (!("diameter" in foundation.geometry)) {
      throw new Error("Circular foundation geometry is required.");
    }
    const diameter = foundation.geometry.diameter;
    const radius = diameter / 2;
    const momentMagnitude = Math.hypot(actions.momentX, actions.momentY);
    const eccentricity = momentMagnitude / vertical;
    if (eccentricity >= radius - TOLERANCE * Math.max(radius, 1)) {
      throw new Error(
        "The circular-foundation resultant lies at or outside the base radius; a positive effective area does not exist.",
      );
    }

    if (eccentricity <= TOLERANCE * Math.max(radius, 1)) {
      return {
        shape: foundation.shape,
        eccentricity,
        eccentricityX: actions.momentY / vertical,
        eccentricityY: actions.momentX / vertical,
        effectiveWidth: diameter,
        effectiveLength: diameter,
        effectiveArea: foundation.geometry.area,
        shapeRatio: 1,
        originalWidth: diameter,
        originalLength: diameter,
        originalArea: foundation.geometry.area,
        middleThirdUtilization: 0,
        exactNoTensionKernUtilization: 0,
        compressiveEquilibriumUtilization: 0,
        actions,
      };
    }

    const effectiveArea =
      2 *
      (radius ** 2 * Math.acos(eccentricity / radius) -
        eccentricity * Math.sqrt(radius ** 2 - eccentricity ** 2));
    const ellipseWidth = 2 * (radius - eccentricity);
    const ellipseLength = 2 * radius * Math.sqrt(1 - (1 - ellipseWidth / (2 * radius)) ** 2);
    const effectiveLength = Math.sqrt((effectiveArea * ellipseLength) / ellipseWidth);
    const effectiveWidth = (effectiveLength * ellipseWidth) / ellipseLength;
    return {
      shape: foundation.shape,
      eccentricity,
      eccentricityX: actions.momentY / vertical,
      eccentricityY: actions.momentX / vertical,
      effectiveWidth,
      effectiveLength,
      effectiveArea,
      shapeRatio: effectiveWidth / effectiveLength,
      originalWidth: diameter,
      originalLength: diameter,
      originalArea: foundation.geometry.area,
      middleThirdUtilization: (6 * eccentricity) / diameter,
      exactNoTensionKernUtilization: (8 * eccentricity) / diameter,
      compressiveEquilibriumUtilization: eccentricity / radius,
      actions,
    };
  }

  if (!("width" in foundation.geometry)) {
    throw new Error("Rectangular or strip foundation geometry is required.");
  }
  const width = foundation.geometry.width;
  const eccentricityWidth = Math.abs(actions.momentY) / vertical;
  const effectiveWidthOnAxis = width - 2 * eccentricityWidth;
  if (effectiveWidthOnAxis <= TOLERANCE * Math.max(width, 1)) {
    throw new Error(
      "The foundation resultant lies at or outside the width edge; a positive effective width does not exist.",
    );
  }

  if (foundation.shape === "strip") {
    return {
      shape: foundation.shape,
      eccentricity: eccentricityWidth,
      eccentricityWidth,
      effectiveWidth: effectiveWidthOnAxis,
      effectiveLength: null,
      effectiveArea: null,
      effectiveAreaPerUnitLength: effectiveWidthOnAxis,
      shapeRatio: 0,
      originalWidth: width,
      originalLength: null,
      originalArea: null,
      middleThirdUtilization: (6 * eccentricityWidth) / width,
      exactNoTensionKernUtilization: (6 * eccentricityWidth) / width,
      compressiveEquilibriumUtilization: (2 * eccentricityWidth) / width,
      actions,
    };
  }

  if (!("length" in foundation.geometry)) {
    throw new Error("Rectangular foundation length is required.");
  }
  const length = foundation.geometry.length;
  const eccentricityLength = Math.abs(actions.momentX) / vertical;
  const effectiveLengthOnAxis = length - 2 * eccentricityLength;
  if (effectiveLengthOnAxis <= TOLERANCE * Math.max(length, 1)) {
    throw new Error(
      "The foundation resultant lies at or outside the length edge; a positive effective area does not exist.",
    );
  }

  const effectiveWidth = Math.min(effectiveWidthOnAxis, effectiveLengthOnAxis);
  const effectiveLength = Math.max(effectiveWidthOnAxis, effectiveLengthOnAxis);
  return {
    shape: foundation.shape,
    eccentricity: Math.hypot(eccentricityWidth, eccentricityLength),
    eccentricityWidth,
    eccentricityLength,
    effectiveWidthOnWidthAxis: effectiveWidthOnAxis,
    effectiveLengthOnLengthAxis: effectiveLengthOnAxis,
    effectiveWidth,
    effectiveLength,
    effectiveArea: effectiveWidthOnAxis * effectiveLengthOnAxis,
    shapeRatio: effectiveWidth / effectiveLength,
    originalWidth: width,
    originalLength: length,
    originalArea: foundation.geometry.area,
    middleThirdUtilization: Math.max(
      (6 * eccentricityWidth) / width,
      (6 * eccentricityLength) / length,
    ),
    exactNoTensionKernUtilization:
      (6 * eccentricityWidth) / width + (6 * eccentricityLength) / length,
    compressiveEquilibriumUtilization: Math.max(
      (2 * eccentricityWidth) / width,
      (2 * eccentricityLength) / length,
    ),
    actions,
  };
}

function groundwaterCorrection({
  method,
  waterTableDepth,
  embedmentDepth,
  originalWidth,
}: {
  method: ShallowFoundationBearingMethod;
  waterTableDepth: number | null;
  embedmentDepth: number;
  originalWidth: number;
}): { factor: number; model: string } {
  if (waterTableDepth == null) return { factor: 1, model: "dry-or-water-below-shear-zone" };
  if (method === "usace-meyerhof-2025") {
    return {
      factor: Math.min(
        0.45 + (0.55 * Math.max(waterTableDepth - embedmentDepth, 0)) / originalWidth,
        1,
      ),
      model: "USACE-EM-1110-1-1905-equation-5-19",
    };
  }
  return {
    factor: Math.min(0.5 + (0.5 * waterTableDepth) / (1.5 * originalWidth + embedmentDepth), 1),
    model: "FHWA-GEC6-equation-5-20",
  };
}

interface BearingFactors {
  bearing: { flowNumber: number; nc: number; nq: number; nGamma: number };
  shape: { c: number; q: number; gamma: number };
  depth: { c: number; q: number; gamma: number };
  inclination: { beta: number; c: number; q: number; gamma: number; policy: string };
}

function drainedFactors({
  method,
  strength,
  geometry,
  embedmentDepth,
  horizontalToVerticalRatio,
}: {
  method: ShallowFoundationBearingMethod;
  strength: SoilParameterSet["strength"];
  geometry: EffectiveGeometry;
  embedmentDepth: number;
  horizontalToVerticalRatio: number;
}): BearingFactors {
  const phi = Number(strength.frictionAngle);
  const phiDegrees = (phi * 180) / Math.PI;
  const sinPhi = Math.sin(phi);
  const flowNumber = (1 + sinPhi) / (1 - sinPhi);
  const nq = flowNumber * Math.exp(Math.PI * Math.tan(phi));
  const nc = phi > 1e-10 ? (nq - 1) / Math.tan(phi) : 2 + Math.PI;
  const nGamma =
    method === "usace-meyerhof-2025"
      ? (nq - 1) * Math.tan(1.4 * phi)
      : 2 * (nq + 1) * Math.tan(phi);
  const ratio = geometry.shapeRatio;
  const depthRatio = embedmentDepth / geometry.effectiveWidth;
  const beta = Math.atan(horizontalToVerticalRatio);
  const betaDegrees = (beta * 180) / Math.PI;

  if (method === "usace-meyerhof-2025") {
    const iq = clamp(1 - betaDegrees / 90) ** 2;
    const iGamma =
      phiDegrees <= TOLERANCE
        ? betaDegrees <= TOLERANCE
          ? 1
          : 0
        : clamp(1 - betaDegrees / phiDegrees) ** 2;
    return {
      bearing: { flowNumber, nc, nq, nGamma },
      shape: {
        c: 1 + 0.2 * flowNumber * ratio,
        q: 1 + 0.1 * flowNumber * ratio,
        gamma: 1 + 0.1 * flowNumber * ratio,
      },
      depth: {
        c: 1 + 0.2 * Math.sqrt(flowNumber) * depthRatio,
        q: 1 + 0.1 * Math.sqrt(flowNumber) * depthRatio,
        gamma: 1 + 0.1 * Math.sqrt(flowNumber) * depthRatio,
      },
      inclination: {
        beta,
        c: iq,
        q: iq,
        gamma: iGamma,
        policy: "included-with-shape-per-usace-2025",
      },
    };
  }

  const dq = Math.min(1 + 2 * Math.tan(phi) * (1 - sinPhi) ** 2 * Math.atan(depthRatio), 1.4);
  return {
    bearing: { flowNumber, nc, nq, nGamma },
    shape: {
      c: 1 + (ratio * nq) / nc,
      q: 1 + ratio * Math.tan(phi),
      gamma: 1 - 0.4 * ratio,
    },
    depth: { c: 1, q: dq, gamma: 1 },
    inclination: {
      beta,
      c: 1,
      q: 1,
      gamma: 1,
      policy: "omitted-per-fhwa-2002-recommendation-when-shape-is-used",
    },
  };
}

function undrainedFactors({
  method,
  geometry,
  embedmentDepth,
  horizontalToVerticalRatio,
}: {
  method: ShallowFoundationBearingMethod;
  geometry: EffectiveGeometry;
  embedmentDepth: number;
  horizontalToVerticalRatio: number;
}): BearingFactors {
  const ratio = geometry.shapeRatio;
  const beta = Math.atan(horizontalToVerticalRatio);
  const inclination =
    method === "usace-meyerhof-2025" ? clamp(1 - 1.3 * horizontalToVerticalRatio) : 1;
  return {
    bearing: {
      flowNumber: 1,
      nc: 2 + Math.PI,
      nq: 1,
      nGamma: 0,
    },
    shape: { c: 1 + 0.2 * ratio, q: 1, gamma: 1 },
    depth: {
      c:
        method === "usace-meyerhof-2025"
          ? Math.min(1 + (0.2 * embedmentDepth) / geometry.effectiveWidth, 1.5)
          : 1,
      q: 1,
      gamma: 1,
    },
    inclination: {
      beta,
      c: inclination,
      q: 1,
      gamma: 1,
      policy:
        method === "usace-meyerhof-2025"
          ? "included-with-shape-per-usace-2025"
          : "omitted-per-fhwa-2002-recommendation-when-shape-is-used",
    },
  };
}

export interface ShallowFoundationBearingCapacityInput {
  method?: string;
  parameterSet?: SoilParameterSet;
  effectiveGeometry?: EffectiveGeometry;
  embedmentDepth?: number;
  surchargeStress?: number;
  totalUnitWeightBelowBase?: number;
  waterTableDepth?: number | null;
}

export function calculateShallowFoundationBearingCapacity({
  method,
  parameterSet,
  effectiveGeometry,
  embedmentDepth,
  surchargeStress,
  totalUnitWeightBelowBase,
  waterTableDepth = null,
}: ShallowFoundationBearingCapacityInput = {}): MethodResult {
  if (!isBearingMethod(method)) {
    throw new Error(`Unsupported shallow-foundation bearing method: ${method}.`);
  }
  if (!parameterSet?.strength) {
    throw new Error("A resolved soil parameter set is required.");
  }
  if (!effectiveGeometry) throw new Error("An effective foundation geometry is required.");
  const depth = nonNegative(embedmentDepth, "embedmentDepth");
  const surcharge = nonNegative(surchargeStress, "surchargeStress");
  const unitWeight = nonNegative(totalUnitWeightBelowBase, "totalUnitWeightBelowBase");
  const horizontalToVerticalRatio =
    effectiveGeometry.actions.horizontalMagnitude / effectiveGeometry.actions.vertical;
  const isDrained = parameterSet.strength.model === "mohr-coulomb-effective";
  const factors = isDrained
    ? drainedFactors({
        method,
        strength: parameterSet.strength,
        geometry: effectiveGeometry,
        embedmentDepth: depth,
        horizontalToVerticalRatio,
      })
    : undrainedFactors({
        method,
        geometry: effectiveGeometry,
        embedmentDepth: depth,
        horizontalToVerticalRatio,
      });
  const groundwater = groundwaterCorrection({
    method,
    waterTableDepth,
    embedmentDepth: depth,
    originalWidth: effectiveGeometry.originalWidth,
  });
  const effectiveUnitWeight = isDrained ? unitWeight * groundwater.factor : 0;
  const strength = parameterSet.strength;
  const cohesionStrength = isDrained
    ? Number(strength.cohesion)
    : Number(strength.undrainedShearStrength);
  const cohesionContribution =
    factors.shape.c *
    factors.depth.c *
    factors.inclination.c *
    cohesionStrength *
    factors.bearing.nc;
  const surchargeContribution =
    factors.shape.q * factors.depth.q * factors.inclination.q * surcharge * factors.bearing.nq;
  const unitWeightContribution = isDrained
    ? factors.shape.gamma *
      factors.depth.gamma *
      factors.inclination.gamma *
      0.5 *
      effectiveGeometry.effectiveWidth *
      effectiveUnitWeight *
      factors.bearing.nGamma
    : 0;
  const ultimateGrossBearingPressure =
    cohesionContribution + surchargeContribution + unitWeightContribution;

  return {
    method,
    drainage: parameterSet.drainage,
    strengthModel: strength.model,
    parameterSetId: parameterSet.id,
    parameterBasis: parameterSet.basis,
    factors,
    groundwater: {
      ...groundwater,
      waterTableDepth,
      inputTotalUnitWeight: unitWeight,
      effectiveUnitWeight,
    },
    contributions: {
      cohesion: cohesionContribution,
      surcharge: surchargeContribution,
      unitWeight: unitWeightContribution,
    },
    ultimateGrossBearingPressure,
    metadata: {
      reference:
        method === "usace-meyerhof-2025"
          ? USACE_REFERENCE
          : `${USACE_REFERENCE}; factors originally presented in ${FHWA_REFERENCE}`,
      baseInclinationFactor: 1,
      groundInclinationFactor: 1,
      units: {
        pressure: "kN/m2",
        unitWeight: "kN/m3",
        length: "m",
        angle: "rad",
      },
    },
  };
}

interface WaterState {
  waterElevation: number | null;
  waterUnitWeight: number | null;
  porePressureAtBase: number;
  source: string;
  unsupported?: string;
}

function localWaterState({
  profile,
  field,
  foundation,
}: {
  profile: GroundProfile;
  field: PorePressureField2D | null;
  foundation: ShallowFoundationModel;
}): WaterState {
  const x = foundation.placement.x;
  const baseElevation = foundation.placement.baseElevation;
  if (field?.model === "assigned-grid") {
    return {
      unsupported:
        "Assigned-grid pore pressure is not sufficient to select total unit weights and the bearing-capacity groundwater correction; use a hydrostatic or phreatic-line field for this ULS method.",
      waterElevation: null,
      waterUnitWeight: null,
      porePressureAtBase: 0,
      source: `pore-pressure-field:${field.id}`,
    };
  }
  if (field && field.model !== "none") {
    return {
      waterElevation: field.waterElevationAt(x),
      waterUnitWeight: field.waterUnitWeight,
      porePressureAtBase: field.porePressureAt({ x, z: baseElevation }),
      source: `pore-pressure-field:${field.id}`,
    };
  }
  if (field?.model === "none") {
    return {
      waterElevation: null,
      waterUnitWeight: null,
      porePressureAtBase: 0,
      source: `pore-pressure-field:${field.id}`,
    };
  }
  const groundwater = profile.groundwater;
  if (groundwater.model === "hydrostatic") {
    return {
      waterElevation: groundwater.waterTableElevation,
      waterUnitWeight: groundwater.waterUnitWeight,
      porePressureAtBase:
        groundwater.waterUnitWeight * Math.max(groundwater.waterTableElevation - baseElevation, 0),
      source: `ground-profile:${profile.id}`,
    };
  }
  return {
    waterElevation: null,
    waterUnitWeight: null,
    porePressureAtBase: 0,
    source: `ground-profile:${profile.id}`,
  };
}

function verticalStressAtBase({
  groundModel,
  profile,
  foundation,
  waterState,
  surcharge,
}: {
  groundModel: GroundModel;
  profile: GroundProfile;
  foundation: ShallowFoundationModel;
  waterState: WaterState;
  surcharge: number;
}): RecordValue {
  const surface = profile.groundSurfaceElevation;
  const base = foundation.placement.baseElevation;
  let soilOverburden = 0;
  const contributions: RecordValue[] = [];
  for (const layer of profile.layers) {
    const top = Math.min(layer.topElevation, surface);
    const bottom = Math.max(layer.bottomElevation, base);
    if (bottom >= top - TOLERANCE) continue;
    const material = groundModel.getMaterial(layer.materialId);
    const boundaries = [top, bottom];
    const water = waterState.waterElevation;
    if (water != null && water < top - TOLERANCE && water > bottom + TOLERANCE) {
      boundaries.splice(1, 0, water);
    }
    for (let index = 0; index < boundaries.length - 1; index += 1) {
      const intervalTop = boundaries[index];
      const intervalBottom = boundaries[index + 1];
      if (intervalTop === undefined || intervalBottom === undefined) continue;
      const midpoint = (intervalTop + intervalBottom) / 2;
      const saturated = water != null && midpoint < water;
      const saturatedUnitWeight = material.unitWeight.saturated;
      const unitWeight = saturated ? saturatedUnitWeight : material.unitWeight.bulk;
      if (typeof unitWeight !== "number" || !Number.isFinite(unitWeight)) {
        throw new Error(
          `SoilMaterial ${material.id} requires saturated unit weight below the selected water surface.`,
        );
      }
      const stress = unitWeight * (intervalTop - intervalBottom);
      soilOverburden += stress;
      contributions.push({
        layerId: layer.id,
        materialId: material.id,
        topElevation: intervalTop,
        bottomElevation: intervalBottom,
        saturated,
        unitWeight,
        stress,
      });
    }
    if (base >= layer.bottomElevation - TOLERANCE) break;
  }
  const totalVerticalStress = surcharge + soilOverburden;
  return {
    elevation: base,
    depth: surface - base,
    surcharge,
    soilOverburden,
    porePressure: waterState.porePressureAtBase,
    totalVerticalStress,
    effectiveVerticalStress: totalVerticalStress - waterState.porePressureAtBase,
    contributions,
    units: { stress: "kN/m2", elevation: "m", depth: "m" },
  };
}

function layerImmediatelyBelow(profile: GroundProfile, elevation: number): GroundLayer {
  const scale = Math.max(1, Math.abs(elevation));
  const sample = elevation - 1e-9 * scale;
  return profile.getLayerAtElevation(sample);
}

function totalUnitWeightBelowBase({
  groundModel,
  layer,
  waterState,
  baseElevation,
  influenceDepth,
}: {
  groundModel: GroundModel;
  layer: GroundLayer;
  waterState: WaterState;
  baseElevation: number;
  influenceDepth: number;
}): number {
  const material = groundModel.getMaterial(layer.materialId);
  const waterIntersects =
    waterState.waterElevation != null && waterState.waterElevation > baseElevation - influenceDepth;
  if (!waterIntersects) return material.unitWeight.bulk;
  const saturated = material.unitWeight.saturated;
  if (typeof saturated !== "number" || !Number.isFinite(saturated)) {
    throw new Error(
      `SoilMaterial ${material.id} requires saturated unit weight because groundwater intersects the bearing shear zone.`,
    );
  }
  return saturated;
}

type MethodResult = RecordValue & { ultimateGrossBearingPressure: number };
type MethodMap = Record<ShallowFoundationBearingMethod, MethodResult>;

function methodMap({
  parameterSet,
  effectiveGeometry,
  embedmentDepth,
  stress,
  totalUnitWeight,
  waterTableDepth,
}: {
  parameterSet: SoilParameterSet;
  effectiveGeometry: EffectiveGeometry;
  embedmentDepth: number;
  stress: RecordValue;
  totalUnitWeight: number;
  waterTableDepth: number | null;
}): MethodMap {
  const surchargeStress =
    parameterSet.drainage === "undrained"
      ? Number(stress.totalVerticalStress)
      : Number(stress.effectiveVerticalStress);
  const usace = calculateShallowFoundationBearingCapacity({
    method: "usace-meyerhof-2025",
    parameterSet,
    effectiveGeometry,
    embedmentDepth,
    surchargeStress,
    totalUnitWeightBelowBase: totalUnitWeight,
    waterTableDepth,
  });
  const fhwa = calculateShallowFoundationBearingCapacity({
    method: "fhwa-vesic-2002",
    parameterSet,
    effectiveGeometry,
    embedmentDepth,
    surchargeStress,
    totalUnitWeightBelowBase: totalUnitWeight,
    waterTableDepth,
  });
  return {
    "usace-meyerhof-2025": usace,
    "fhwa-vesic-2002": fhwa,
  };
}

function punchingSpreadRatio({
  foundation,
  geometry,
  strongLayerThickness,
}: {
  foundation: ShallowFoundationModel;
  geometry: EffectiveGeometry;
  strongLayerThickness: number;
}): number | null {
  if (foundation.shape === "rectangular") {
    return (
      ((Number(geometry.effectiveWidthOnWidthAxis) + strongLayerThickness) *
        (Number(geometry.effectiveLengthOnLengthAxis) + strongLayerThickness)) /
      Number(geometry.originalArea)
    );
  }
  if (foundation.shape === "strip") {
    return (geometry.effectiveWidth + strongLayerThickness) / geometry.effectiveWidth;
  }
  return null;
}

function isBearingMethod(value: unknown): value is ShallowFoundationBearingMethod {
  return value === "usace-meyerhof-2025" || value === "fhwa-vesic-2002";
}

function isBearingSelection(value: unknown): value is ShallowFoundationBearingSelection {
  return (
    value === "minimum" ||
    value === "mean" ||
    value === "usace-meyerhof-2025" ||
    value === "fhwa-vesic-2002"
  );
}

function isBaseUpliftTreatment(value: unknown): value is ShallowFoundationBaseUpliftTreatment {
  return value === "subtract-uniform-pressure" || value === "included-in-action-resultant";
}

function selectCapacity(
  methodValues: Record<ShallowFoundationBearingMethod, number>,
  selection: ShallowFoundationBearingSelection,
): number {
  const usace = methodValues["usace-meyerhof-2025"];
  const fhwa = methodValues["fhwa-vesic-2002"];
  if (selection === "usace-meyerhof-2025") return usace;
  if (selection === "fhwa-vesic-2002") return fhwa;
  if (selection === "mean") return (usace + fhwa) / 2;
  return Math.min(usace, fhwa);
}

interface Comparison {
  demand: number;
  capacity: number;
  utilizationRatio: number | null;
  factorOfSafety: number | null;
  requiredFactorOfSafety: number | null;
  ok: boolean | null;
}

function compare({
  demand,
  capacity,
  minimumFactorOfSafety = null,
}: {
  demand: number;
  capacity: number;
  minimumFactorOfSafety?: number | null;
}): Comparison {
  const utilizationRatio = capacity > 0 ? demand / capacity : null;
  const factorOfSafety = demand > TOLERANCE ? capacity / demand : null;
  return {
    demand,
    capacity,
    utilizationRatio,
    factorOfSafety,
    requiredFactorOfSafety: minimumFactorOfSafety,
    ok:
      minimumFactorOfSafety == null || factorOfSafety == null
        ? null
        : factorOfSafety >= minimumFactorOfSafety,
  };
}

function normalizeInterface(
  input: SoilStructureInterface | SoilStructureInterfaceOptions | null | undefined,
): SoilStructureInterface | null {
  if (input == null) return null;
  return input instanceof SoilStructureInterface ? input : new SoilStructureInterface(input);
}

export interface ShallowFoundationSlidingResistanceInput {
  parameterSet?: SoilParameterSet;
  effectiveGeometry?: EffectiveGeometry;
  porePressureAtBase?: number;
  interfaceModel?: SoilStructureInterface;
  interfaceParameterSetId?: string | null;
  drainedAdhesionRatio?: number;
  undrainedAdhesionRatio?: number;
}

interface SlidingResistanceResult extends RecordValue {
  status: "ok";
  demand: number;
  capacity: number;
  utilizationRatio: number | null;
  factorOfSafety: number | null;
  interface: SoilStructureInterfaceResolution | RecordValue;
}

function hasParameterBasis(value: unknown): value is { parameterBasis: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    "parameterBasis" in value &&
    typeof value.parameterBasis === "string"
  );
}

export function calculateShallowFoundationSlidingResistance({
  parameterSet,
  effectiveGeometry,
  porePressureAtBase,
  interfaceModel,
  interfaceParameterSetId = null,
  drainedAdhesionRatio = 0,
  undrainedAdhesionRatio = 0,
}: ShallowFoundationSlidingResistanceInput = {}): SlidingResistanceResult {
  if (!(interfaceModel instanceof SoilStructureInterface)) {
    throw new Error("interfaceModel must be a SoilStructureInterface.");
  }
  if (!parameterSet || !effectiveGeometry) {
    throw new Error("parameterSet and effectiveGeometry are required.");
  }
  const drainedRatio = nonNegative(drainedAdhesionRatio, "drainedAdhesionRatio");
  const undrainedRatio = nonNegative(undrainedAdhesionRatio, "undrainedAdhesionRatio");
  if (drainedRatio > 1 || undrainedRatio > 1) {
    throw new Error("Interface adhesion ratios must not exceed 1.");
  }
  const originalArea =
    effectiveGeometry.shape === "strip"
      ? effectiveGeometry.originalWidth
      : Number(effectiveGeometry.originalArea);
  const adhesionArea =
    effectiveGeometry.exactNoTensionKernUtilization <= 1
      ? originalArea
      : effectiveGeometry.shape === "strip"
        ? Number(effectiveGeometry.effectiveAreaPerUnitLength)
        : Number(effectiveGeometry.effectiveArea);
  const vertical = effectiveGeometry.actions.vertical;
  const uplift = Number(porePressureAtBase) * originalArea;
  const effectiveNormal = Math.max(vertical - uplift, 0);
  const horizontalDemand = effectiveGeometry.actions.horizontalMagnitude;
  const interfaceSet = interfaceModel.getParameterSet(interfaceParameterSetId);
  let friction = 0;
  let adhesion: number;
  let interfaceResolution: SoilStructureInterfaceResolution | null = null;

  if (parameterSet.drainage === "drained") {
    const resolution = interfaceModel.resolveFrictionAngle({
      soilFrictionAngles: [Number(parameterSet.strength.frictionAngle)],
      parameterSetId: interfaceSet.id,
    });
    interfaceResolution = resolution;
    friction = effectiveNormal * Math.tan(resolution.frictionAngle);
    adhesion = drainedRatio * Number(parameterSet.strength.cohesion) * adhesionArea;
  } else {
    adhesion = undrainedRatio * Number(parameterSet.strength.undrainedShearStrength) * adhesionArea;
  }
  const resistance = friction + adhesion;
  return {
    status: "ok",
    drainage: parameterSet.drainage,
    demand: horizontalDemand,
    capacity: resistance,
    utilizationRatio:
      resistance > 0 ? horizontalDemand / resistance : horizontalDemand <= TOLERANCE ? 0 : null,
    factorOfSafety: horizontalDemand > TOLERANCE ? resistance / horizontalDemand : null,
    components: { friction, adhesion },
    effectiveNormalForce: effectiveNormal,
    upliftForce: uplift,
    baseArea: originalArea,
    adhesionArea,
    interface: interfaceResolution ?? {
      interfaceId: interfaceModel.id,
      parameterSetId: interfaceSet.id,
      parameterBasis: interfaceSet.basis,
      wallSurface: structuredClone(interfaceModel.wallSurface),
      model: "undrained-adhesion-ratio",
      frictionAngle: null,
    },
    adhesionRatios: { drained: drainedRatio, undrained: undrainedRatio },
    passiveResistance: {
      status: "not-analyzed",
      value: 0,
      reason:
        "Developed active/passive earth forces for embedded footings require a separate explicit sliding workflow.",
    },
    units: {
      force: effectiveGeometry.shape === "strip" ? "kN/m" : "kN",
      area: effectiveGeometry.shape === "strip" ? "m2/m" : "m2",
      stress: "kN/m2",
    },
    metadata: { reference: `${USACE_REFERENCE}, equations 5-28 through 5-30` },
  };
}

interface PunchingMethodResult extends MethodResult {
  lowerLayerUltimateGrossBearingPressure: number;
}

interface PunchingCandidate extends RecordValue {
  layerId: string;
  methods: MethodMap & {
    "usace-meyerhof-2025": PunchingMethodResult;
    "fhwa-vesic-2002": PunchingMethodResult;
  };
}

interface GoverningMethod extends RecordValue {
  ultimateGrossBearingPressure: number;
  governingMechanism: RecordValue;
  mechanisms: RecordValue[];
}

type GoverningMethods = Record<ShallowFoundationBearingMethod, GoverningMethod>;

interface NotAnalyzedSlidingOutput extends RecordValue {
  status: "not-analyzed";
  reason: string;
  capacity?: null;
  utilizationRatio?: null;
}

interface AnalyzedSlidingOutput extends SlidingResistanceResult {
  requiredFactorOfSafety: number | null;
  ok: boolean | null;
}

type SlidingOutput = NotAnalyzedSlidingOutput | AnalyzedSlidingOutput;

function errorDetails(error: unknown): { message: string; name: string } {
  if (error instanceof Error) return { message: error.message, name: error.name };
  return { message: String(error), name: "Error" };
}

export class ShallowFoundationUltimateLimitStateAnalysis {
  analyze(
    input: ShallowFoundationUltimateLimitStateAnalysisInput = {},
  ): ShallowFoundationUltimateLimitStateAnalysisResult {
    const {
      groundModel: groundModelInput,
      designSituation: designSituationInput,
      foundation: foundationInput,
      actionState: actionStateInput,
      profileId = null,
      porePressureFieldId = null,
      surfaceSurcharge = 0,
      bearingSelection = "minimum",
      baseUpliftTreatment = "subtract-uniform-pressure",
      sliding = {},
      criteria = {},
      units = null,
    } = input;
    try {
      assertExplicitUnitSystem(units, "ShallowFoundationUltimateLimitStateAnalysis");
      if (!isBearingSelection(bearingSelection)) {
        throw new Error(`Unsupported bearingSelection: ${bearingSelection}.`);
      }
      if (!isBaseUpliftTreatment(baseUpliftTreatment)) {
        throw new Error(`Unsupported baseUpliftTreatment: ${baseUpliftTreatment}.`);
      }

      const groundModel = normalizeGroundModel(groundModelInput, units);
      const designSituation = normalizeDesignSituation(designSituationInput, groundModel, units);
      designSituation.validateAgainst(groundModel);
      if (designSituation.limitState !== "ULS") {
        return result({
          status: "not-supported",
          summary: "The shallow-foundation ULS solver requires limitState=ULS.",
        });
      }
      if (designSituation.seismic.model !== "none") {
        return result({
          status: "not-supported",
          summary:
            "Seismic shallow-foundation bearing and sliding are not implemented in this static ULS solver.",
        });
      }

      const foundation = normalizeFoundation(foundationInput, units);
      const actionState = normalizeActions(actionStateInput, units);
      validateActionBasis(foundation, actionState);
      const geometry = calculateShallowFoundationEffectiveGeometry({
        foundation,
        actionState,
      });
      const resolver = createUnitResolver(units, GEOTECHNICAL_INTERNAL_UNITS);
      const surcharge = nonNegative(
        resolver.stress(Number(surfaceSurcharge ?? 0)),
        "surfaceSurcharge",
      );
      const profile = groundModel.getProfile(
        profileId ?? designSituation.spatialSelection.profileId,
      );
      if (!profile) {
        return result({
          status: "not-supported",
          summary: "A GroundProfile is required for shallow-foundation ULS.",
        });
      }
      const base = foundation.placement.baseElevation;
      const embedmentDepth = profile.groundSurfaceElevation - base;
      if (embedmentDepth < -TOLERANCE) {
        throw new Error("The foundation base cannot lie above the ground surface.");
      }
      if (base <= profile.bottomElevation + TOLERANCE) {
        throw new Error("The GroundProfile must extend below the foundation base.");
      }
      const field = groundModel.getPorePressureField(
        porePressureFieldId ?? designSituation.spatialSelection.porePressureFieldId,
      );
      const waterState = localWaterState({ profile, field, foundation });
      if (waterState.unsupported) {
        return result({
          status: "not-supported",
          summary: "The selected pore-pressure model is outside the ULS method.",
          warnings: [waterState.unsupported],
        });
      }
      if (
        waterState.waterElevation != null &&
        waterState.waterElevation > profile.groundSurfaceElevation + TOLERANCE
      ) {
        return result({
          status: "not-supported",
          summary: "External water above ground surface is not implemented.",
        });
      }
      const stress = verticalStressAtBase({
        groundModel,
        profile,
        foundation,
        waterState,
        surcharge,
      });
      const waterTableDepth =
        waterState.waterElevation == null
          ? null
          : profile.groundSurfaceElevation - waterState.waterElevation;
      const baseLayer = layerImmediatelyBelow(profile, base);
      const baseResolution = designSituation.resolveParameterSet({
        groundModel,
        layerId: baseLayer.id,
      });
      const baseParameterSet = baseResolution.parameterSet;
      const influenceDepth =
        foundation.shape === "strip" ? 4 * geometry.effectiveWidth : 2 * geometry.effectiveWidth;
      const baseUnitWeight = totalUnitWeightBelowBase({
        groundModel,
        layer: baseLayer,
        waterState,
        baseElevation: base,
        influenceDepth,
      });
      if (profile.bottomElevation > base - influenceDepth + TOLERANCE) {
        return result({
          status: "not-supported",
          summary:
            "The GroundProfile does not extend through the required bearing/punch-through influence depth.",
          warnings: [
            `Extend profile ${profile.id} to elevation ${base - influenceDepth} m or lower.`,
          ],
        });
      }
      const baseMethods = methodMap({
        parameterSet: baseParameterSet,
        effectiveGeometry: geometry,
        embedmentDepth: Math.max(0, embedmentDepth),
        stress,
        totalUnitWeight: baseUnitWeight,
        waterTableDepth,
      });

      const warnings = [...baseResolution.warnings];
      const punchingCandidates: PunchingCandidate[] = [];
      const unsupportedLayered: string[] = [];
      const typicalDepth = geometry.effectiveWidth;
      const maximumPunchingDepth =
        foundation.shape === "strip" ? 4 * geometry.effectiveWidth : 2 * geometry.effectiveWidth;
      const minimumPunchingDepth =
        foundation.shape === "strip" ? geometry.effectiveWidth : 0.5 * geometry.effectiveWidth;
      const lowerLayers = profile.layers.filter(
        (layer) =>
          layer.topElevation < base - TOLERANCE &&
          base - layer.topElevation <= maximumPunchingDepth + TOLERANCE,
      );

      for (const layer of lowerLayers) {
        const strongLayerThickness = base - layer.topElevation;
        const layerResolution = designSituation.resolveParameterSet({
          groundModel,
          layerId: layer.id,
        });
        const parameterSet = layerResolution.parameterSet;
        warnings.push(...layerResolution.warnings);
        if (layer.materialId === baseLayer.materialId && parameterSet.id === baseParameterSet.id) {
          continue;
        }
        if (foundation.shape === "circular") {
          unsupportedLayered.push(
            `Layer ${layer.id} enters the circular-foundation influence zone; the cited rectangular 2V:1H punch-through equation is not applied to circular foundations.`,
          );
          continue;
        }
        if (parameterSet.drainage !== "undrained") {
          if (strongLayerThickness <= typicalDepth + TOLERANCE) {
            unsupportedLayered.push(
              `Layer ${layer.id} with drained parameters enters the typical shear zone; a supported layered bearing-capacity model is required.`,
            );
          } else {
            warnings.push(
              `Drained layer ${layer.id} lies inside the maximum search depth but outside the typical shear-zone depth; no punch-through model is applied.`,
            );
          }
          continue;
        }
        if (strongLayerThickness < minimumPunchingDepth - TOLERANCE) {
          unsupportedLayered.push(
            `Undrained layer ${layer.id} begins too close to the base for the cited strong-over-weak 2V:1H punch-through range.`,
          );
          continue;
        }
        const layerMethods = methodMap({
          parameterSet,
          effectiveGeometry: geometry,
          embedmentDepth: Math.max(0, embedmentDepth),
          stress,
          totalUnitWeight: 0,
          waterTableDepth,
        });
        const spreadRatio = punchingSpreadRatio({
          foundation,
          geometry,
          strongLayerThickness,
        });
        const punchingMethods = {
          "usace-meyerhof-2025": {
            ...layerMethods["usace-meyerhof-2025"],
            lowerLayerUltimateGrossBearingPressure:
              layerMethods["usace-meyerhof-2025"].ultimateGrossBearingPressure,
            ultimateGrossBearingPressure:
              layerMethods["usace-meyerhof-2025"].ultimateGrossBearingPressure *
              Number(spreadRatio),
          },
          "fhwa-vesic-2002": {
            ...layerMethods["fhwa-vesic-2002"],
            lowerLayerUltimateGrossBearingPressure:
              layerMethods["fhwa-vesic-2002"].ultimateGrossBearingPressure,
            ultimateGrossBearingPressure:
              layerMethods["fhwa-vesic-2002"].ultimateGrossBearingPressure * Number(spreadRatio),
          },
        };
        punchingCandidates.push({
          layerId: layer.id,
          materialId: layer.materialId,
          parameterSetId: parameterSet.id,
          parameterBasis: parameterSet.basis,
          drainage: parameterSet.drainage,
          strongLayerThickness,
          spreadRatio,
          methods: punchingMethods,
          metadata: {
            model:
              foundation.shape === "strip"
                ? "USACE-equation-5-18-continuous-2V1H"
                : "USACE-equation-5-17-isolated-2V1H",
            reference: USACE_REFERENCE,
          },
        });
      }

      if (unsupportedLayered.length > 0) {
        return result({
          status: "not-supported",
          summary:
            "The selected stratigraphy is outside the implemented homogeneous/strong-over-weak ULS models.",
          outputs: {
            schemaVersion: SHALLOW_FOUNDATION_ULS_RESULT_SCHEMA_VERSION,
            foundation: foundation.toJSON(),
            actionState: actionState.toJSON(),
            effectiveGeometry: geometry,
            baseMechanism: { layerId: baseLayer.id, methods: baseMethods },
          },
          warnings: unique([...warnings, ...unsupportedLayered]),
        });
      }

      const governingByMethod: GoverningMethods = {
        "usace-meyerhof-2025": {
          ultimateGrossBearingPressure: 0,
          governingMechanism: {},
          mechanisms: [],
        },
        "fhwa-vesic-2002": {
          ultimateGrossBearingPressure: 0,
          governingMechanism: {},
          mechanisms: [],
        },
      };
      for (const method of SHALLOW_FOUNDATION_BEARING_METHODS) {
        const mechanisms: RecordValue[] = [
          {
            type: "base-layer-general-shear",
            layerId: baseLayer.id,
            capacity: baseMethods[method].ultimateGrossBearingPressure,
          },
          ...punchingCandidates.map((candidate) => ({
            type: "strong-over-weak-punch-through",
            layerId: candidate.layerId,
            capacity: candidate.methods[method].ultimateGrossBearingPressure,
          })),
        ];
        const firstMechanism = mechanisms[0];
        if (!firstMechanism || typeof firstMechanism.capacity !== "number") {
          throw new Error("A base bearing mechanism is required.");
        }
        const governing = mechanisms.reduce((current, candidate) =>
          Number(candidate.capacity) < Number(current.capacity) ? candidate : current,
        );
        governingByMethod[method] = {
          ultimateGrossBearingPressure: Number(governing.capacity),
          governingMechanism: governing,
          mechanisms,
        };
      }
      const methodCapacities = {
        "usace-meyerhof-2025":
          governingByMethod["usace-meyerhof-2025"].ultimateGrossBearingPressure,
        "fhwa-vesic-2002": governingByMethod["fhwa-vesic-2002"].ultimateGrossBearingPressure,
      };
      const selectedBearingCapacity = selectCapacity(methodCapacities, bearingSelection);
      const upliftPressure =
        baseUpliftTreatment === "included-in-action-resultant" ? 0 : waterState.porePressureAtBase;
      const equivalentBearingPressure =
        foundation.shape === "strip"
          ? geometry.actions.vertical / geometry.effectiveWidth - upliftPressure
          : geometry.actions.vertical / Number(geometry.effectiveArea) - upliftPressure;
      if (equivalentBearingPressure <= TOLERANCE) {
        return result({
          status: "not-supported",
          summary:
            "Net equivalent bearing pressure is non-positive; uplift must be checked in a dedicated workflow.",
          warnings: unique(warnings),
        });
      }
      const bearingCriterion = positiveOrNull(
        criteria.minimumBearingFactorOfSafety,
        "criteria.minimumBearingFactorOfSafety",
      );
      const bearingCheck = compare({
        demand: equivalentBearingPressure,
        capacity: selectedBearingCapacity,
        minimumFactorOfSafety: bearingCriterion,
      });

      const interfaceModel = normalizeInterface(sliding.interface ?? null);
      const slidingCriterion = positiveOrNull(
        criteria.minimumSlidingFactorOfSafety,
        "criteria.minimumSlidingFactorOfSafety",
      );
      let slidingOutput: SlidingOutput;
      if (interfaceModel == null) {
        slidingOutput = {
          status: "not-analyzed",
          reason:
            "Supply a SoilStructureInterface and explicit adhesion ratios to calculate base sliding resistance.",
        };
      } else if (geometry.exactNoTensionKernUtilization > 1 + TOLERANCE) {
        slidingOutput = {
          status: "not-analyzed",
          reason:
            "The resultant lies outside the no-tension kern; determine the actual compression-contact area before using interface adhesion in sliding.",
        };
      } else if (sliding.includePassiveResistance === true) {
        return result({
          status: "not-supported",
          summary:
            "Embedded-footing passive resistance is not included in the base-only sliding workflow.",
          warnings: unique(warnings),
        });
      } else {
        const calculatedSliding = calculateShallowFoundationSlidingResistance({
          parameterSet: baseParameterSet,
          effectiveGeometry: geometry,
          porePressureAtBase: upliftPressure,
          interfaceModel,
          interfaceParameterSetId:
            sliding.interfaceParameterSetId ??
            designSituation.resolveInterfaceParameterSetId(interfaceModel.id),
          drainedAdhesionRatio: sliding.drainedAdhesionRatio ?? 0,
          undrainedAdhesionRatio: sliding.undrainedAdhesionRatio ?? 0,
        });
        const calculatedOk =
          slidingCriterion == null || calculatedSliding.factorOfSafety == null
            ? null
            : calculatedSliding.factorOfSafety >= slidingCriterion;
        slidingOutput = {
          ...calculatedSliding,
          requiredFactorOfSafety: slidingCriterion,
          ok: calculatedOk,
        };
        if (
          hasParameterBasis(calculatedSliding.interface) &&
          calculatedSliding.interface.parameterBasis === "indicative"
        ) {
          warnings.push(
            "An indicative soil-structure interface parameter was explicitly supplied; confirm it against project data before design use.",
          );
        }
      }

      const meanCapacity =
        (methodCapacities["usace-meyerhof-2025"] + methodCapacities["fhwa-vesic-2002"]) / 2;
      const spread = Math.abs(
        methodCapacities["usace-meyerhof-2025"] - methodCapacities["fhwa-vesic-2002"],
      );
      const checks: RecordValue[] = [
        {
          id: "compressive-equilibrium",
          demand: geometry.compressiveEquilibriumUtilization,
          capacity: 1,
          utilizationRatio: geometry.compressiveEquilibriumUtilization,
          ok: geometry.compressiveEquilibriumUtilization < 1,
        },
        {
          id: "full-compression-kern",
          demand: geometry.exactNoTensionKernUtilization,
          capacity: 1,
          utilizationRatio: geometry.exactNoTensionKernUtilization,
          ok: geometry.exactNoTensionKernUtilization <= 1 + TOLERANCE,
        },
        { id: "bearing", ...bearingCheck },
        ...(slidingOutput.status === "ok"
          ? [
              {
                id: "base-sliding",
                demand: slidingOutput.demand,
                capacity: slidingOutput.capacity,
                utilizationRatio: slidingOutput.utilizationRatio,
                factorOfSafety: slidingOutput.factorOfSafety,
                requiredFactorOfSafety: slidingOutput.requiredFactorOfSafety,
                ok: slidingOutput.ok,
              },
            ]
          : []),
      ];
      const isVerified = checks.every((check) => check.ok !== false);

      return result({
        status: isVerified ? "ok" : "not-verified",
        summary: isVerified
          ? "Static shallow-foundation bearing capacity and base sliding analysis completed."
          : "The shallow-foundation analysis completed, but one or more explicit checks are not verified.",
        outputs: {
          schemaVersion: SHALLOW_FOUNDATION_ULS_RESULT_SCHEMA_VERSION,
          groundModelId: groundModel.id,
          designSituationId: designSituation.id,
          foundation: foundation.toJSON(),
          actionState: actionState.toJSON(),
          effectiveGeometry: geometry,
          stressAtBase: stress,
          groundwater: {
            ...waterState,
            waterTableDepth,
            baseUpliftTreatment,
            porePressureAppliedToActionResultant: upliftPressure,
          },
          bearing: {
            demand: equivalentBearingPressure,
            capacity: selectedBearingCapacity,
            utilizationRatio: bearingCheck.utilizationRatio,
            factorOfSafety: bearingCheck.factorOfSafety,
            selection: bearingSelection,
            selectedUltimateGrossBearingPressure: selectedBearingCapacity,
            methodCapacities,
            meanUltimateGrossBearingPressure: meanCapacity,
            methodAbsoluteSpread: spread,
            methodRelativeSpreadToMean: meanCapacity > 0 ? spread / meanCapacity : null,
            baseMechanism: {
              layerId: baseLayer.id,
              materialId: baseLayer.materialId,
              parameterResolution: baseResolution,
              methods: baseMethods,
            },
            punchThroughCandidates: punchingCandidates,
            governingByMethod,
          },
          sliding: slidingOutput,
          checks,
          demand: {
            equivalentBearingPressure,
            horizontal: geometry.actions.horizontalMagnitude,
          },
          capacity: {
            bearingPressure: selectedBearingCapacity,
            baseSliding: slidingOutput.capacity ?? null,
          },
          utilizationRatio: Math.max(
            bearingCheck.utilizationRatio ?? 0,
            slidingOutput.utilizationRatio ?? 0,
          ),
          structuralCoupling: {
            level: "one-way-geotechnical-capacity-transfer",
            foundationId: foundation.id,
            actionStateId: actionState.id,
            actionReferencePoint: actionState.referencePoint,
            ultimateResistances: {
              grossBearingPressure: selectedBearingCapacity,
              baseSliding: slidingOutput.capacity ?? null,
            },
            designConversion: {
              status: "required",
              reason:
                "A normative adapter must transform parameter values and ultimate resistances before they are assigned as design resistances to a structural foundation verifier.",
            },
          },
        },
        warnings: unique([
          ...warnings,
          ...(geometry.exactNoTensionKernUtilization > 1 + TOLERANCE
            ? [
                "The resultant lies outside the no-tension kern; bearing uses effective dimensions, while structural contact and overturning require a separate review.",
              ]
            : []),
          "The difference between the USACE/Meyerhof and FHWA/Vesic results is reported as method uncertainty; no normative resistance factor is applied.",
          ...(slidingOutput.status !== "ok"
            ? [`Base sliding was not analyzed: ${slidingOutput.reason}`]
            : []),
        ]),
        assumptions: [
          "The foundation base and adjacent ground surface are horizontal.",
          "The supplied action resultant acts at the base center and includes foundation self-weight and all other applicable permanent vertical loads.",
          baseUpliftTreatment === "included-in-action-resultant"
            ? "Base uplift, including any nonuniform uplift moment, is already included in the supplied action resultant and is not subtracted again as a uniform pressure."
            : "Hydrostatic uplift at the base is represented by a uniform pressure evaluated at the foundation center and is subtracted by this solver.",
          "Bearing failure is represented by general shear with superposed Nc, Nq and Ngamma terms.",
          "USACE/Meyerhof includes shape and load-inclination factors; FHWA/Vesic omits inclination factors when shape factors are used, following the cited FHWA recommendation.",
          "Hydrostatic-horizontal and phreatic-line pore-pressure fields are represented by their local water elevation at the foundation center.",
          "The strong-over-weak check is limited to the cited 2V:1H punch-through model with an undrained weaker layer in its stated depth range.",
          "Passive resistance in front of an embedded footing, uplift resistance, settlements, consolidation and seismic effects are excluded.",
        ],
        metadata: {
          references: [USACE_REFERENCE, FHWA_REFERENCE],
          designSituation: designSituation.toJSON(),
          units: {
            force: foundation.shape === "strip" ? "kN/m" : "kN",
            moment: foundation.shape === "strip" ? "kN.m/m" : "kN.m",
            length: "m",
            pressure: "kN/m2",
            unitWeight: "kN/m3",
            angle: "rad",
          },
        },
      });
    } catch (error) {
      const details = errorDetails(error);
      return result({
        status: "failed",
        summary: "Shallow-foundation ULS analysis failed.",
        warnings: [details.message],
        metadata: { errorName: details.name },
      });
    }
  }
}
