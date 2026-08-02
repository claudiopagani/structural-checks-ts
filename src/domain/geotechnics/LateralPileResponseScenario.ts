import {
  assertExplicitUnitSystem,
  createUnitResolver,
  type UnitSystemInput,
} from "../units/UnitSystem.js";
import { GEOTECHNICAL_INTERNAL_UNITS, type SoilRecord } from "./SoilMaterial.js";
import {
  PileTransferLaw,
  type PileTransferLawOptions,
  type PileTransferLawJson,
} from "./PileTransferLaw.js";

export const LATERAL_PILE_RESPONSE_SCENARIO_SCHEMA_VERSION = "lateral-pile-response-scenario/v1";

export type LateralPileResponseMethod = "beam-on-py-springs";
export const LATERAL_PILE_RESPONSE_METHODS = Object.freeze([
  "beam-on-py-springs",
]) satisfies readonly LateralPileResponseMethod[];

export type LateralPileActionReferencePoint = "pile-head" | "groundline-at-pile-axis";
export const LATERAL_PILE_ACTION_REFERENCE_POINTS = Object.freeze([
  "pile-head",
  "groundline-at-pile-axis",
]) satisfies readonly LateralPileActionReferencePoint[];

export type LateralPileEndRestraint = "free" | "fixed";
export const LATERAL_PILE_END_RESTRAINTS = Object.freeze([
  "free",
  "fixed",
]) satisfies readonly LateralPileEndRestraint[];

export type LateralPileSoilResponseModel = "assigned-py-curves";
export const LATERAL_PILE_SOIL_RESPONSE_MODELS = Object.freeze([
  "assigned-py-curves",
]) satisfies readonly LateralPileSoilResponseModel[];

export interface LateralPileResponseActionInput {
  lateralShear?: number | string;
  overturningMoment?: number | string;
  referencePoint?: string;
  basis?: string;
  direction?: string;
  metadata?: SoilRecord;
}

export interface LateralPileResponseAction {
  lateralShear: number;
  overturningMoment: number;
  referencePoint: LateralPileActionReferencePoint;
  basis: string;
  direction: string;
  metadata: SoilRecord;
}

export interface LateralPileBoundaryConditionInput {
  translation?: string;
  rotation?: string;
}

export interface LateralPileBoundaryCondition {
  translation: LateralPileEndRestraint;
  rotation: LateralPileEndRestraint;
}

export interface LateralPileFlexuralRigidityInput {
  model?: string;
  value?: number | string;
  provenance?: SoilRecord | null;
  metadata?: SoilRecord;
}

export interface LateralPileFlexuralRigidity {
  model: "constant";
  value: number;
  provenance: SoilRecord;
  metadata: SoilRecord;
}

export interface LateralPileCurveStationInput {
  depth?: number | string;
  law?: PileTransferLaw | PileTransferLawOptions | null;
  curve?: PileTransferLaw | PileTransferLawOptions | null;
  metadata?: SoilRecord;
}

export interface LateralPileCurveStation {
  depth: number;
  law: PileTransferLaw;
  metadata: SoilRecord;
}

export interface LateralPileLayerCurveInput {
  stations?: LateralPileCurveStationInput[];
  reactionMultiplier?: number | string;
  provenance?: SoilRecord | null;
  metadata?: SoilRecord;
}

export interface LateralPileLayerCurve {
  layerId: string;
  interpolation: "linear-response";
  outsideStationRange: "nearest-station";
  reactionMultiplier: number;
  provenance: SoilRecord | null;
  stations: LateralPileCurveStation[];
  metadata: SoilRecord;
}

export interface LateralPileSoilResponseInput {
  model?: string;
  curvesByLayer?: Record<string, LateralPileLayerCurveInput>;
  metadata?: SoilRecord;
}

export interface LateralPileSoilResponse {
  model: LateralPileSoilResponseModel;
  curvesByLayer: Record<string, LateralPileLayerCurve>;
  loading: "static-monotonic";
  metadata: SoilRecord;
}

export interface LateralPileDiscretizationInput {
  maxElementLength?: number | string;
}

export interface LateralPileDiscretization {
  model: "layer-boundary-conforming-euler-bernoulli";
  maxElementLength: number;
}

export interface LateralPileSolverInput {
  loadSteps?: number | string;
  maxIterations?: number | string;
  maxLineSearchReductions?: number | string;
  relativeResidualTolerance?: number | string;
  displacementTolerance?: number | string;
  minimumLoadIncrement?: number | string;
}

export interface LateralPileSolver {
  strategy: "incremental-load-control-damped-newton";
  loadSteps: number;
  maxIterations: number;
  maxLineSearchReductions: number;
  relativeResidualTolerance: number;
  displacementTolerance: number;
  minimumLoadIncrement: number;
}

export interface LateralPileResponseScenarioOptions {
  id?: string;
  name?: string | null;
  method?: string;
  action?: LateralPileResponseActionInput | null;
  flexuralRigidity?: LateralPileFlexuralRigidityInput | null;
  headCondition?: LateralPileBoundaryConditionInput | null;
  tipCondition?: LateralPileBoundaryConditionInput | null;
  soilResponse?: LateralPileSoilResponseInput | null;
  discretization?: LateralPileDiscretizationInput | null;
  solver?: LateralPileSolverInput | null;
  units?: UnitSystemInput | null;
  metadata?: SoilRecord;
}

export interface LateralPileResponseScenarioJson {
  schemaVersion: string;
  id: string;
  name: string;
  method: LateralPileResponseMethod;
  action: LateralPileResponseAction;
  flexuralRigidity: LateralPileFlexuralRigidity;
  headCondition: LateralPileBoundaryCondition;
  tipCondition: LateralPileBoundaryCondition;
  soilResponse: LateralPileSoilResponseJson;
  discretization: LateralPileDiscretization;
  solver: LateralPileSolver;
  units: typeof GEOTECHNICAL_INTERNAL_UNITS;
  metadata: SoilRecord;
}

export interface LateralPileSoilResponseJson {
  model: LateralPileSoilResponseModel;
  loading: "static-monotonic";
  curvesByLayer: Record<string, LateralPileLayerCurveJson>;
  metadata: SoilRecord;
}

export interface LateralPileLayerCurveJson {
  layerId: string;
  interpolation: "linear-response";
  outsideStationRange: "nearest-station";
  reactionMultiplier: number;
  provenance: SoilRecord | null;
  stations: Array<{
    depth: number;
    law: PileTransferLawJson;
    metadata: SoilRecord;
  }>;
  metadata: SoilRecord;
}

function isLateralPileResponseMethod(value: unknown): value is LateralPileResponseMethod {
  return value === "beam-on-py-springs";
}

function isLateralPileActionReferencePoint(
  value: unknown,
): value is LateralPileActionReferencePoint {
  return value === "pile-head" || value === "groundline-at-pile-axis";
}

function isLateralPileEndRestraint(value: unknown): value is LateralPileEndRestraint {
  return value === "free" || value === "fixed";
}

function isLateralPileSoilResponseModel(value: unknown): value is LateralPileSoilResponseModel {
  return value === "assigned-py-curves";
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

function positiveInteger(value: unknown, label: string): number {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) {
    throw new Error(`${label} must be a positive integer.`);
  }
  return number;
}

function normalizeProvenance(value: SoilRecord | null | undefined, label: string): SoilRecord {
  const normalized = structuredClone(value ?? {});
  if (typeof normalized.source !== "string" || !normalized.source.trim()) {
    throw new Error(`${label}.source is required.`);
  }
  normalized.source = normalized.source.trim();
  return normalized;
}

function normalizeAction(
  action: LateralPileResponseActionInput | null | undefined,
  resolver: ReturnType<typeof createUnitResolver>,
): LateralPileResponseAction {
  if (!action || typeof action !== "object") {
    throw new Error("LateralPileResponseScenario action is required.");
  }
  const referencePoint = action.referencePoint ?? "pile-head";
  if (!isLateralPileActionReferencePoint(referencePoint)) {
    throw new Error(`Unsupported lateral-pile action reference point: ${referencePoint}.`);
  }
  const lateralShear = resolver.force(finite(action.lateralShear ?? 0, "action.lateralShear"));
  const overturningMoment = resolver.moment(
    finite(action.overturningMoment ?? 0, "action.overturningMoment"),
  );
  if (lateralShear === 0 && overturningMoment === 0) {
    throw new Error("At least one lateral-pile response action must be non-zero.");
  }
  return {
    lateralShear,
    overturningMoment,
    referencePoint,
    basis: String(action.basis ?? "assigned"),
    direction: String(action.direction ?? "local-positive-y"),
    metadata: structuredClone(action.metadata ?? {}),
  };
}

function normalizeBoundaryCondition(
  value: LateralPileBoundaryConditionInput | null | undefined,
  label: string,
  defaults: LateralPileBoundaryCondition,
): LateralPileBoundaryCondition {
  const translation = value?.translation ?? defaults.translation;
  const rotation = value?.rotation ?? defaults.rotation;
  if (!isLateralPileEndRestraint(translation)) {
    throw new Error(`${label}.translation must be free or fixed.`);
  }
  if (!isLateralPileEndRestraint(rotation)) {
    throw new Error(`${label}.rotation must be free or fixed.`);
  }
  return {
    translation,
    rotation,
  };
}

function normalizeFlexuralRigidity(
  input: LateralPileFlexuralRigidityInput | null | undefined,
  resolver: ReturnType<typeof createUnitResolver>,
): LateralPileFlexuralRigidity {
  const model = input?.model ?? "constant";
  if (model !== "constant") {
    throw new Error("LateralPileResponseScenario currently supports constant flexural rigidity.");
  }
  return {
    model,
    value: positive(
      resolver.convert(finite(input?.value, "flexuralRigidity.value"), {
        forceExponent: 1,
        lengthExponent: 2,
      }),
      "flexuralRigidity.value",
    ),
    provenance: normalizeProvenance(input?.provenance, "flexuralRigidity.provenance"),
    metadata: structuredClone(input?.metadata ?? {}),
  };
}

function normalizeLayerCurve(
  layerId: string,
  input: LateralPileLayerCurveInput | null | undefined,
  resolver: ReturnType<typeof createUnitResolver>,
  units: UnitSystemInput,
): LateralPileLayerCurve {
  const stationsInput = input?.stations ?? [];
  if (!Array.isArray(stationsInput) || stationsInput.length === 0) {
    throw new Error(`soilResponse.curvesByLayer.${layerId} requires at least one station.`);
  }
  const stations = stationsInput
    .map((station, index) => {
      const depth = resolver.length(
        finite(station.depth, `soilResponse.curvesByLayer.${layerId}.stations[${index}].depth`),
      );
      if (depth < 0) {
        throw new Error("P-y station depth must be non-negative below ground.");
      }
      const lawInput = station.law ?? station.curve;
      const law =
        lawInput instanceof PileTransferLaw
          ? lawInput
          : new PileTransferLaw({
              ...(lawInput ?? {}),
              id: lawInput?.id ?? `${layerId}-py-${index + 1}`,
              units: lawInput?.units ?? units,
            });
      if (law.kind !== "p-y") {
        throw new Error(`Layer ${layerId} requires p-y transfer laws.`);
      }
      return {
        depth,
        law,
        metadata: structuredClone(station.metadata ?? {}),
      };
    })
    .sort((left, right) => left.depth - right.depth);

  for (let index = 1; index < stations.length; index += 1) {
    if (stations[index]!.depth <= stations[index - 1]!.depth) {
      throw new Error(`Layer ${layerId} p-y station depths must be unique.`);
    }
  }
  const reactionMultiplier = positive(
    input?.reactionMultiplier ?? 1,
    `soilResponse.curvesByLayer.${layerId}.reactionMultiplier`,
  );
  if (reactionMultiplier !== 1 && input?.provenance == null) {
    throw new Error(
      `soilResponse.curvesByLayer.${layerId}.provenance is required when reactionMultiplier differs from 1.`,
    );
  }
  return {
    layerId,
    interpolation: "linear-response",
    outsideStationRange: "nearest-station",
    reactionMultiplier,
    provenance:
      input?.provenance == null
        ? null
        : normalizeProvenance(input.provenance, `soilResponse.curvesByLayer.${layerId}.provenance`),
    stations,
    metadata: structuredClone(input?.metadata ?? {}),
  };
}

function normalizeSoilResponse(
  input: LateralPileSoilResponseInput | null | undefined,
  resolver: ReturnType<typeof createUnitResolver>,
  units: UnitSystemInput,
): LateralPileSoilResponse {
  const model = input?.model ?? "assigned-py-curves";
  if (!isLateralPileSoilResponseModel(model)) {
    throw new Error(`Unsupported lateral-pile soil response model: ${model}.`);
  }
  if (
    !input?.curvesByLayer ||
    typeof input.curvesByLayer !== "object" ||
    Array.isArray(input.curvesByLayer)
  ) {
    throw new Error("soilResponse.curvesByLayer must be an object map.");
  }
  const curvesByLayer = Object.fromEntries(
    Object.entries(input.curvesByLayer).map(([layerId, value]) => [
      layerId,
      normalizeLayerCurve(layerId, value, resolver, units),
    ]),
  );
  if (Object.keys(curvesByLayer).length === 0) {
    throw new Error("soilResponse.curvesByLayer must not be empty.");
  }
  return {
    model,
    curvesByLayer,
    loading: "static-monotonic",
    metadata: structuredClone(input.metadata ?? {}),
  };
}

function normalizeDiscretization(
  input: LateralPileDiscretizationInput | null | undefined,
  resolver: ReturnType<typeof createUnitResolver>,
): LateralPileDiscretization {
  return {
    model: "layer-boundary-conforming-euler-bernoulli",
    maxElementLength: positive(
      resolver.length(finite(input?.maxElementLength ?? 0.5, "discretization.maxElementLength")),
      "discretization.maxElementLength",
    ),
  };
}

function normalizeSolver(
  input: LateralPileSolverInput | null | undefined,
  resolver: ReturnType<typeof createUnitResolver>,
): LateralPileSolver {
  const minimumLoadIncrement = positive(
    input?.minimumLoadIncrement ?? 1 / 1024,
    "solver.minimumLoadIncrement",
  );
  if (minimumLoadIncrement >= 1) {
    throw new Error("solver.minimumLoadIncrement must be less than 1.");
  }
  return {
    strategy: "incremental-load-control-damped-newton",
    loadSteps: positiveInteger(input?.loadSteps ?? 10, "solver.loadSteps"),
    maxIterations: positiveInteger(input?.maxIterations ?? 50, "solver.maxIterations"),
    maxLineSearchReductions: positiveInteger(
      input?.maxLineSearchReductions ?? 12,
      "solver.maxLineSearchReductions",
    ),
    relativeResidualTolerance: positive(
      input?.relativeResidualTolerance ?? 1e-8,
      "solver.relativeResidualTolerance",
    ),
    displacementTolerance: positive(
      resolver.length(
        finite(input?.displacementTolerance ?? 1e-10, "solver.displacementTolerance"),
      ),
      "solver.displacementTolerance",
    ),
    minimumLoadIncrement,
  };
}

function serializeSoilResponse(soilResponse: LateralPileSoilResponse): LateralPileSoilResponseJson {
  return {
    model: soilResponse.model,
    loading: soilResponse.loading,
    curvesByLayer: Object.fromEntries(
      Object.entries(soilResponse.curvesByLayer).map(([layerId, value]) => [
        layerId,
        {
          layerId: value.layerId,
          interpolation: value.interpolation,
          outsideStationRange: value.outsideStationRange,
          reactionMultiplier: value.reactionMultiplier,
          provenance: structuredClone(value.provenance),
          stations: value.stations.map((station) => ({
            depth: station.depth,
            law: station.law.toJSON(),
            metadata: structuredClone(station.metadata),
          })),
          metadata: structuredClone(value.metadata),
        },
      ]),
    ),
    metadata: structuredClone(soilResponse.metadata),
  };
}

export class LateralPileResponseScenario {
  schemaVersion: string;
  id: string;
  name: string;
  method: LateralPileResponseMethod;
  action: LateralPileResponseAction;
  flexuralRigidity: LateralPileFlexuralRigidity;
  headCondition: LateralPileBoundaryCondition;
  tipCondition: LateralPileBoundaryCondition;
  soilResponse: LateralPileSoilResponse;
  discretization: LateralPileDiscretization;
  solver: LateralPileSolver;
  units: typeof GEOTECHNICAL_INTERNAL_UNITS;
  metadata: SoilRecord;

  constructor({
    id,
    name = null,
    method = "beam-on-py-springs",
    action = null,
    flexuralRigidity = null,
    headCondition = null,
    tipCondition = null,
    soilResponse = null,
    discretization = null,
    solver = null,
    units = null,
    metadata = {},
  }: LateralPileResponseScenarioOptions = {}) {
    if (!id) throw new Error("A LateralPileResponseScenario id is required.");
    if (!isLateralPileResponseMethod(method)) {
      throw new Error(`Unsupported lateral-pile response method: ${method}.`);
    }
    const explicitUnits = assertExplicitUnitSystem(units, "LateralPileResponseScenario");
    const resolver = createUnitResolver(units ?? explicitUnits, GEOTECHNICAL_INTERNAL_UNITS);

    this.schemaVersion = LATERAL_PILE_RESPONSE_SCENARIO_SCHEMA_VERSION;
    this.id = String(id);
    this.name = name ?? this.id;
    this.method = method;
    this.action = normalizeAction(action, resolver);
    this.flexuralRigidity = normalizeFlexuralRigidity(flexuralRigidity, resolver);
    this.headCondition = normalizeBoundaryCondition(headCondition, "headCondition", {
      translation: "free",
      rotation: "free",
    });
    this.tipCondition = normalizeBoundaryCondition(tipCondition, "tipCondition", {
      translation: "free",
      rotation: "free",
    });
    this.soilResponse = normalizeSoilResponse(soilResponse, resolver, units ?? explicitUnits);
    this.discretization = normalizeDiscretization(discretization, resolver);
    this.solver = normalizeSolver(solver, resolver);
    this.units = GEOTECHNICAL_INTERNAL_UNITS;
    this.metadata = {
      ...structuredClone(metadata ?? {}),
      unitSystem: GEOTECHNICAL_INTERNAL_UNITS,
      sourceUnitSystem: resolver.sourceUnitSystem,
      signConvention: {
        coordinate: "depth x is positive downward from pile head",
        displacement: "positive in action.direction",
        rotation: "dy/dx, positive with increasing downward depth",
        action: "signed shear and moment are work-conjugate to displacement and rotation",
      },
    };
  }

  toJSON(): LateralPileResponseScenarioJson {
    return {
      schemaVersion: this.schemaVersion,
      id: this.id,
      name: this.name,
      method: this.method,
      action: structuredClone(this.action),
      flexuralRigidity: structuredClone(this.flexuralRigidity),
      headCondition: { ...this.headCondition },
      tipCondition: { ...this.tipCondition },
      soilResponse: serializeSoilResponse(this.soilResponse),
      discretization: { ...this.discretization },
      solver: { ...this.solver },
      units: { ...this.units },
      metadata: structuredClone(this.metadata),
    };
  }
}
