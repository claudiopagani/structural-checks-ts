import {
  assertExplicitUnitSystem,
  createUnitResolver,
  type UnitSystemInput,
} from "../units/UnitSystem.js";
import { EARTH_PRESSURE_STATES, type EarthPressureState } from "./LateralEarthPressureAnalysis.js";
import { GEOTECHNICAL_INTERNAL_UNITS, type SoilRecord } from "./SoilMaterial.js";
import {
  SoilStructureInterface,
  type SoilStructureInterfaceOptions,
} from "./SoilStructureInterface.js";

export const RETAINING_WALL_LOAD_SCENARIO_SCHEMA_VERSION = "retaining-wall-load-scenario/v1";

export type RetainingWallSeismicDirection = "retained-to-front" | "front-to-retained";
export const RETAINING_WALL_SEISMIC_DIRECTIONS = Object.freeze([
  "retained-to-front",
  "front-to-retained",
]) satisfies readonly RetainingWallSeismicDirection[];

export type RetainingWallBaseUpliftModel = "linear-hydrostatic" | "none";
export const RETAINING_WALL_BASE_UPLIFT_MODELS = Object.freeze([
  "linear-hydrostatic",
  "none",
]) satisfies readonly RetainingWallBaseUpliftModel[];

type RecordValue = Record<string, unknown>;

export interface RetainingWallRetainedSideInput {
  profileId?: string;
  state?: string;
  method?: string | null;
  interface?: SoilStructureInterface | SoilStructureInterfaceOptions | null;
  interfaceParameterSetId?: string | null;
  surcharge?: number;
  includeSurchargeOverHeel?: boolean;
  backfillInclination?: number;
  angleUnits?: string;
  parameterSetId?: string | null;
  parameterSetByLayer?: Record<string, string>;
  parameterSetByMaterial?: Record<string, string>;
  allowIndicativeValues?: boolean;
  resultantApplicationHeightRatio?: number | null;
  seismic?: RecordValue;
}

export interface RetainingWallFrontSideInput extends RetainingWallRetainedSideInput {
  enabled?: boolean;
  mobilizationFactor?: number;
  justification?: string;
  topElevation?: number | null;
  bottomElevation?: number | null;
  applicationX?: number | null;
  wallInclinationFromVertical?: number | null;
}

export interface RetainingWallBaseUpliftInput {
  model?: string;
  reductionFactor?: number;
  justification?: string;
}

export interface RetainingWallAppliedLoadInput {
  id?: string;
  name?: string;
  category?: string;
  horizontalForce?: number;
  verticalForce?: number;
  point?: { x?: number; z?: number };
  metadata?: RecordValue;
}

export interface RetainingWallFoundationInput {
  enabled?: boolean;
  profileId?: string;
  porePressureFieldId?: string | null;
  baseInterface?: SoilStructureInterface | SoilStructureInterfaceOptions | null;
  interfaceParameterSetId?: string | null;
  drainedAdhesionRatio?: number;
  undrainedAdhesionRatio?: number;
  surfaceSurcharge?: number;
  parameterSelection?: {
    byMaterial?: Record<string, string>;
    byLayer?: Record<string, string>;
    byInterface?: Record<string, string>;
  };
  allowIndicativeValues?: boolean;
  bearing?: { enabled?: boolean; selection?: string; criteria?: RecordValue };
}

export interface RetainingWallGlobalStabilityInput {
  enabled?: boolean;
  includeWallWeightAsSurcharge?: boolean;
  analysisInput?: RecordValue;
  inputUnits?: UnitSystemInput | null;
}

export interface RetainingWallCriteriaInput {
  minimumSlidingFactorOfSafety?: number | null;
  minimumOverturningFactorOfSafety?: number | null;
  requireFullBaseContact?: boolean;
}

export interface RetainingWallLoadScenarioOptions {
  id?: string;
  name?: string | null;
  retainedSide?: RetainingWallRetainedSideInput;
  frontSide?: RetainingWallFrontSideInput | null;
  baseUplift?: RetainingWallBaseUpliftInput;
  includeSoilOverHeel?: boolean;
  appliedLoads?: RetainingWallAppliedLoadInput[];
  foundation?: RetainingWallFoundationInput | null;
  globalStability?: RetainingWallGlobalStabilityInput | null;
  seismicDirection?: string | null;
  criteria?: RetainingWallCriteriaInput;
  angleUnits?: string;
  units?: UnitSystemInput | null;
  metadata?: SoilRecord;
}

export interface RetainingWallLoadScenarioJson {
  schemaVersion: string;
  id: string;
  name: string;
  retainedSide: unknown;
  frontSide: unknown;
  baseUplift: unknown;
  includeSoilOverHeel: boolean;
  appliedLoads: unknown[];
  foundation: unknown;
  globalStability: unknown;
  seismicDirection: RetainingWallSeismicDirection | null;
  criteria: unknown;
  units: typeof GEOTECHNICAL_INTERNAL_UNITS;
  metadata: RecordValue;
}

interface RetainingSide {
  profileId: string;
  state: EarthPressureState;
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
  seismic: RecordValue;
}

interface FrontSideDisabled {
  enabled: false;
}

interface FrontSideEnabled
  extends Omit<
    RetainingSide,
    "state" | "includeSurchargeOverHeel" | "seismic" | "resultantApplicationHeightRatio"
  > {
  enabled: true;
  topElevation: number | null;
  bottomElevation: number | null;
  applicationX: number | null;
  wallInclinationFromVertical: number | null;
  mobilizationFactor: number;
  justification: string;
}

type FrontSide = FrontSideDisabled | FrontSideEnabled;

interface BaseUplift {
  model: RetainingWallBaseUpliftModel;
  reductionFactor: number;
  justification: string;
}

interface AppliedLoad {
  id: string;
  name: string;
  category: string;
  horizontalForce: number;
  verticalForce: number;
  point: { x: number; z: number };
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

function isEarthPressureState(value: unknown): value is EarthPressureState {
  return EARTH_PRESSURE_STATES.some((candidate) => candidate === value);
}

function isRetainingWallSeismicDirection(value: unknown): value is RetainingWallSeismicDirection {
  return value === "retained-to-front" || value === "front-to-retained";
}

function isRetainingWallBaseUpliftModel(value: unknown): value is RetainingWallBaseUpliftModel {
  return value === "linear-hydrostatic" || value === "none";
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

function ratio(value: unknown, label: string): number {
  const number = finite(value, label);
  if (number < 0 || number > 1) {
    throw new Error(`${label} must satisfy 0 <= value <= 1.`);
  }
  return number;
}

function positiveOrNull(value: unknown, label: string): number | null {
  if (value == null) return null;
  const number = finite(value, label);
  if (number <= 0) throw new Error(`${label} must be positive when supplied.`);
  return number;
}

function normalizeAngle(value: unknown, angleUnits: unknown, label: string): number {
  const number = finite(value, label);
  if (angleUnits === "deg") return (number * Math.PI) / 180;
  if (angleUnits === "rad") return number;
  throw new Error(`${label} requires angleUnits equal to "deg" or "rad".`);
}

function normalizeInterface(
  input: SoilStructureInterface | SoilStructureInterfaceOptions | null | undefined,
): SoilStructureInterface | null {
  if (input == null) return null;
  return input instanceof SoilStructureInterface ? input : new SoilStructureInterface(input);
}

function serializeInterface(input: SoilStructureInterface | null): unknown {
  return input?.toJSON?.() ?? null;
}

function normalizeStringMap(
  input: Record<string, string> | null | undefined,
  label: string,
): Record<string, string> {
  if (input == null) return {};
  if (typeof input !== "object" || Array.isArray(input)) {
    throw new Error(`${label} must be an object map.`);
  }
  return Object.fromEntries(
    Object.entries(input).map(([key, value]) => {
      if (!key || typeof value !== "string" || !value) {
        throw new Error(`${label} requires nonempty string keys and values.`);
      }
      return [key, value];
    }),
  );
}

function normalizeRetainedSide(
  input: RetainingWallRetainedSideInput | undefined,
  resolver: ReturnType<typeof createUnitResolver>,
  angleUnits: string,
): RetainingSide {
  if (!input?.profileId) throw new Error("retainedSide.profileId is required.");
  const state = input.state ?? "active";
  if (!isEarthPressureState(state)) {
    throw new Error(`Unsupported retainedSide.state: ${state}.`);
  }
  if (state === "passive") {
    throw new Error("retainedSide.state cannot be passive.");
  }
  return {
    profileId: input.profileId,
    state,
    method: input.method ?? null,
    interface: normalizeInterface(input.interface),
    interfaceParameterSetId: input.interfaceParameterSetId ?? null,
    surcharge: resolver.stress(nonNegative(input.surcharge ?? 0, "retainedSide.surcharge")),
    includeSurchargeOverHeel: input.includeSurchargeOverHeel !== false,
    backfillInclination: normalizeAngle(
      input.backfillInclination ?? 0,
      input.angleUnits ?? angleUnits,
      "retainedSide.backfillInclination",
    ),
    parameterSetId: input.parameterSetId ?? null,
    parameterSetByLayer: normalizeStringMap(
      input.parameterSetByLayer,
      "retainedSide.parameterSetByLayer",
    ),
    parameterSetByMaterial: normalizeStringMap(
      input.parameterSetByMaterial,
      "retainedSide.parameterSetByMaterial",
    ),
    allowIndicativeValues: Boolean(input.allowIndicativeValues),
    resultantApplicationHeightRatio:
      input.resultantApplicationHeightRatio == null
        ? null
        : ratio(
            input.resultantApplicationHeightRatio,
            "retainedSide.resultantApplicationHeightRatio",
          ),
    seismic: structuredClone(input.seismic ?? {}),
  };
}

function normalizeFrontSide(
  input: RetainingWallFrontSideInput | null | undefined,
  resolver: ReturnType<typeof createUnitResolver>,
  angleUnits: string,
): FrontSide {
  if (input == null || input.enabled === false) return { enabled: false };
  if (!input.profileId) throw new Error("frontSide.profileId is required.");
  const mobilizationFactor = ratio(input.mobilizationFactor ?? 0, "frontSide.mobilizationFactor");
  const justification = String(input.justification ?? "").trim();
  if (mobilizationFactor > 0 && !justification) {
    throw new Error("frontSide.justification is required when passive resistance is mobilized.");
  }
  return {
    enabled: true,
    profileId: input.profileId,
    method: input.method ?? "rankine",
    interface: normalizeInterface(input.interface),
    interfaceParameterSetId: input.interfaceParameterSetId ?? null,
    surcharge: resolver.stress(nonNegative(input.surcharge ?? 0, "frontSide.surcharge")),
    backfillInclination: normalizeAngle(
      input.backfillInclination ?? 0,
      input.angleUnits ?? angleUnits,
      "frontSide.backfillInclination",
    ),
    topElevation:
      input.topElevation == null
        ? null
        : resolver.length(finite(input.topElevation, "frontSide.topElevation")),
    bottomElevation:
      input.bottomElevation == null
        ? null
        : resolver.length(finite(input.bottomElevation, "frontSide.bottomElevation")),
    applicationX:
      input.applicationX == null
        ? null
        : resolver.length(finite(input.applicationX, "frontSide.applicationX")),
    wallInclinationFromVertical:
      input.wallInclinationFromVertical == null
        ? null
        : normalizeAngle(
            input.wallInclinationFromVertical,
            input.angleUnits ?? angleUnits,
            "frontSide.wallInclinationFromVertical",
          ),
    parameterSetId: input.parameterSetId ?? null,
    parameterSetByLayer: normalizeStringMap(
      input.parameterSetByLayer,
      "frontSide.parameterSetByLayer",
    ),
    parameterSetByMaterial: normalizeStringMap(
      input.parameterSetByMaterial,
      "frontSide.parameterSetByMaterial",
    ),
    allowIndicativeValues: Boolean(input.allowIndicativeValues),
    mobilizationFactor,
    justification,
  };
}

function normalizeBaseUplift(input: RetainingWallBaseUpliftInput = {}): BaseUplift {
  const model = input.model ?? "linear-hydrostatic";
  if (!isRetainingWallBaseUpliftModel(model)) {
    throw new Error(`Unsupported baseUplift.model: ${model}.`);
  }
  return {
    model,
    reductionFactor: ratio(input.reductionFactor ?? 1, "baseUplift.reductionFactor"),
    justification: String(input.justification ?? "").trim(),
  };
}

function normalizeAppliedLoads(
  input: RetainingWallAppliedLoadInput[] | undefined,
  resolver: ReturnType<typeof createUnitResolver>,
): AppliedLoad[] {
  if (!Array.isArray(input)) throw new Error("appliedLoads must be an array.");
  const loads = input.map((load, index) => {
    const label = `appliedLoads[${index}]`;
    if (!load?.id) throw new Error(`${label}.id is required.`);
    return {
      id: load.id,
      name: load.name ?? load.id,
      category: load.category ?? "assigned",
      horizontalForce: resolver.lineLoad(
        finite(load.horizontalForce ?? 0, `${label}.horizontalForce`),
      ),
      verticalForce: resolver.lineLoad(finite(load.verticalForce ?? 0, `${label}.verticalForce`)),
      point: {
        x: resolver.length(finite(load.point?.x, `${label}.point.x`)),
        z: resolver.length(finite(load.point?.z, `${label}.point.z`)),
      },
      metadata: structuredClone(load.metadata ?? {}),
    };
  });
  const ids = loads.map(({ id }) => id);
  if (new Set(ids).size !== ids.length) {
    throw new Error("appliedLoads ids must be unique.");
  }
  return loads;
}

function normalizeParameterSelection(
  input: RetainingWallFoundationInput["parameterSelection"] = {},
): ParameterSelection {
  return {
    byMaterial: normalizeStringMap(input.byMaterial, "foundation.parameterSelection.byMaterial"),
    byLayer: normalizeStringMap(input.byLayer, "foundation.parameterSelection.byLayer"),
    byInterface: normalizeStringMap(input.byInterface, "foundation.parameterSelection.byInterface"),
  };
}

function normalizeFoundation(
  input: RetainingWallFoundationInput | null | undefined,
  resolver: ReturnType<typeof createUnitResolver>,
): Foundation {
  if (input == null || input.enabled === false) return { enabled: false };
  if (!input.profileId) throw new Error("foundation.profileId is required.");
  const baseInterface = normalizeInterface(input.baseInterface);
  return {
    enabled: true,
    profileId: input.profileId,
    porePressureFieldId: input.porePressureFieldId ?? null,
    baseInterface,
    interfaceParameterSetId: input.interfaceParameterSetId ?? null,
    drainedAdhesionRatio: ratio(input.drainedAdhesionRatio ?? 0, "foundation.drainedAdhesionRatio"),
    undrainedAdhesionRatio: ratio(
      input.undrainedAdhesionRatio ?? 0,
      "foundation.undrainedAdhesionRatio",
    ),
    surfaceSurcharge: resolver.stress(
      nonNegative(input.surfaceSurcharge ?? 0, "foundation.surfaceSurcharge"),
    ),
    parameterSelection: normalizeParameterSelection(input.parameterSelection),
    allowIndicativeValues: Boolean(input.allowIndicativeValues),
    bearing: {
      enabled: input.bearing?.enabled !== false,
      selection: input.bearing?.selection ?? "minimum",
      criteria: structuredClone(input.bearing?.criteria ?? {}),
    },
  };
}

function normalizeCriteria(input: RetainingWallCriteriaInput = {}): Criteria {
  return {
    minimumSlidingFactorOfSafety: positiveOrNull(
      input.minimumSlidingFactorOfSafety,
      "criteria.minimumSlidingFactorOfSafety",
    ),
    minimumOverturningFactorOfSafety: positiveOrNull(
      input.minimumOverturningFactorOfSafety,
      "criteria.minimumOverturningFactorOfSafety",
    ),
    requireFullBaseContact: Boolean(input.requireFullBaseContact),
  };
}

export class RetainingWallLoadScenario {
  schemaVersion: string;
  id: string;
  name: string;
  retainedSide: RetainingSide;
  frontSide: FrontSide;
  baseUplift: BaseUplift;
  includeSoilOverHeel: boolean;
  appliedLoads: AppliedLoad[];
  foundation: Foundation;
  globalStability: GlobalStability;
  seismicDirection: RetainingWallSeismicDirection | null;
  criteria: Criteria;
  units: typeof GEOTECHNICAL_INTERNAL_UNITS;
  metadata: RecordValue;

  constructor({
    id,
    name = null,
    retainedSide,
    frontSide = null,
    baseUplift = {},
    includeSoilOverHeel = true,
    appliedLoads = [],
    foundation = null,
    globalStability = null,
    seismicDirection = null,
    criteria = {},
    angleUnits = "rad",
    units = null,
    metadata = {},
  }: RetainingWallLoadScenarioOptions = {}) {
    if (!id) throw new Error("A RetainingWallLoadScenario id is required.");
    assertExplicitUnitSystem(units, "RetainingWallLoadScenario");
    const resolver = createUnitResolver(units, GEOTECHNICAL_INTERNAL_UNITS);
    if (seismicDirection != null && !isRetainingWallSeismicDirection(seismicDirection)) {
      throw new Error(`Unsupported seismicDirection: ${seismicDirection}.`);
    }

    this.schemaVersion = RETAINING_WALL_LOAD_SCENARIO_SCHEMA_VERSION;
    this.id = id;
    this.name = name ?? id;
    this.retainedSide = normalizeRetainedSide(retainedSide, resolver, angleUnits);
    this.frontSide = normalizeFrontSide(frontSide, resolver, angleUnits);
    this.baseUplift = normalizeBaseUplift(baseUplift);
    this.includeSoilOverHeel = Boolean(includeSoilOverHeel);
    this.appliedLoads = normalizeAppliedLoads(appliedLoads, resolver);
    this.foundation = normalizeFoundation(foundation, resolver);
    this.globalStability =
      globalStability == null || globalStability.enabled === false
        ? { enabled: false }
        : {
            enabled: true,
            includeWallWeightAsSurcharge: globalStability.includeWallWeightAsSurcharge !== false,
            analysisInput: structuredClone(globalStability.analysisInput ?? {}),
            inputUnits: structuredClone(
              globalStability.inputUnits ??
                globalStability.analysisInput?.units ??
                resolver.sourceUnitSystem,
            ),
          };
    this.seismicDirection = seismicDirection;
    this.criteria = normalizeCriteria(criteria);
    this.units = GEOTECHNICAL_INTERNAL_UNITS;
    this.metadata = {
      ...structuredClone(metadata ?? {}),
      unitSystem: GEOTECHNICAL_INTERNAL_UNITS,
      sourceUnitSystem: resolver.sourceUnitSystem,
      forceConvention: {
        horizontal: "positive-from-toe-toward-retained-side",
        vertical: "positive-downward",
        basis: "per-unit-out-of-plane-width",
      },
    };
  }

  toJSON(): RetainingWallLoadScenarioJson {
    return {
      schemaVersion: this.schemaVersion,
      id: this.id,
      name: this.name,
      retainedSide: {
        ...structuredClone(this.retainedSide),
        interface: serializeInterface(this.retainedSide.interface),
      },
      frontSide: this.frontSide.enabled
        ? {
            ...structuredClone(this.frontSide),
            interface: serializeInterface(this.frontSide.interface),
          }
        : { enabled: false },
      baseUplift: { ...this.baseUplift },
      includeSoilOverHeel: this.includeSoilOverHeel,
      appliedLoads: structuredClone(this.appliedLoads),
      foundation: this.foundation.enabled
        ? {
            ...structuredClone(this.foundation),
            baseInterface: serializeInterface(this.foundation.baseInterface),
          }
        : { enabled: false },
      globalStability: structuredClone(this.globalStability),
      seismicDirection: this.seismicDirection,
      criteria: { ...this.criteria },
      units: { ...this.units },
      metadata: structuredClone(this.metadata),
    };
  }
}
