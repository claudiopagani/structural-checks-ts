import {
  assertExplicitUnitSystem,
  createUnitResolver,
  type UnitResolver,
  type UnitSystem,
  type UnitSystemInput,
} from "../units/UnitSystem.js";
import { GEOTECHNICAL_INTERNAL_UNITS, type SoilRecord } from "./SoilMaterial.js";
import { WallSoilReactionLaw, type WallSoilReactionLawOptions } from "./WallSoilReactionLaw.js";

export const EMBEDDED_RETAINING_WALL_SCENARIO_SCHEMA_VERSION =
  "embedded-retaining-wall-scenario/v1";

export const EMBEDDED_RETAINING_WALL_LOADING_CONDITIONS: readonly string[] = Object.freeze([
  "static",
  "pseudostatic",
]);

export const EMBEDDED_RETAINING_WALL_SUPPORT_TYPES: readonly string[] = Object.freeze([
  "ground-anchor",
  "strut",
  "generic-support",
]);

export const EMBEDDED_RETAINING_WALL_SUPPORT_BEHAVIORS: readonly string[] = Object.freeze([
  "unilateral",
  "bilateral",
]);

const SIDES: readonly string[] = Object.freeze(["retained", "excavation"]);
const DIRECTIONS: readonly string[] = Object.freeze([
  "toward-retained-side",
  "toward-excavation-side",
]);

type InputRecord = Record<string, unknown>;

export interface EmbeddedRetainingWallScenarioOptions {
  id?: unknown;
  name?: unknown;
  loadingCondition?: unknown;
  loadingProvenance?: SoilRecord | null;
  soilResponse?: unknown;
  supports?: readonly unknown[];
  stages?: readonly unknown[];
  discretization?: unknown;
  solver?: unknown;
  units?: UnitSystemInput | null;
  metadata?: SoilRecord | null;
}

interface NormalizedStation {
  depth: number;
  law: WallSoilReactionLaw;
  metadata: SoilRecord;
}

interface NormalizedLayerCurve {
  layerId: string;
  interpolation: "linear-response";
  outsideStationRange: "nearest-station";
  reactionMultiplier: number;
  provenance: SoilRecord | null;
  stations: NormalizedStation[];
  metadata: SoilRecord;
}

interface NormalizedSide {
  side: string;
  profileId: string;
  xCoordinate: number;
  defaultPorePressureFieldId: string | null;
  curvesByLayer: Record<string, NormalizedLayerCurve>;
  metadata: SoilRecord;
}

interface NormalizedSupport {
  id: string;
  name: unknown;
  type: string;
  elevation: number;
  stiffness: number;
  prestress: number;
  actionDirection: string;
  behavior: string;
  capacity: {
    maximumForce: number;
    basis: string;
    provenance: SoilRecord;
  } | null;
  provenance: SoilRecord;
  metadata: SoilRecord;
}

interface NormalizedPressureSegment {
  topElevation: number;
  bottomElevation: number;
  topPressure: number;
  bottomPressure: number;
}

interface NormalizedPressureLoad {
  id: string;
  side: string;
  component: string;
  category: string;
  scale: number;
  segments: NormalizedPressureSegment[];
  provenance: SoilRecord;
  metadata: SoilRecord;
}

interface NormalizedNodalAction {
  id: string;
  elevation: number;
  force: number;
  moment: number;
  provenance: SoilRecord;
  metadata: SoilRecord;
}

interface NormalizedStage {
  id: string;
  name: unknown;
  retainedGroundElevation: number;
  excavationGroundElevation: number;
  activeSupportIds: string[];
  porePressureFieldIdBySide: Record<string, string | null>;
  pressureLoads: NormalizedPressureLoad[];
  nodalActions: NormalizedNodalAction[];
  metadata: SoilRecord;
}

interface NormalizedSolver {
  strategy: "staged-incremental-damped-newton";
  incrementsPerStage: number;
  maxIterations: number;
  maxLineSearchReductions: number;
  relativeResidualTolerance: number;
  displacementTolerance: number;
  minimumStageIncrement: number;
}

interface NormalizedSoilResponse {
  model: "assigned-effective-pressure-displacement-curves";
  sides: {
    retained: NormalizedSide;
    excavation: NormalizedSide;
  };
  loading: "static-envelope-memoryless";
  metadata: SoilRecord;
}

export interface EmbeddedRetainingWallScenarioJson {
  schemaVersion: string;
  id: string;
  name: unknown;
  loadingCondition: string;
  loadingProvenance: SoilRecord | null;
  soilResponse: {
    model: string;
    sides: {
      retained: SoilRecord;
      excavation: SoilRecord;
    };
    loading: string;
    metadata: SoilRecord;
  };
  supports: NormalizedSupport[];
  stages: NormalizedStage[];
  discretization: {
    model: "boundary-conforming-euler-bernoulli";
    maxElementLength: number;
  };
  solver: NormalizedSolver;
  units: UnitSystem;
  metadata: SoilRecord;
}

function isRecord(value: unknown): value is InputRecord {
  return value !== null && typeof value === "object";
}

function record(value: unknown): InputRecord {
  return isRecord(value) ? value : {};
}

function cloneRecord(value: unknown): SoilRecord {
  const clone: unknown = structuredClone(value ?? {});
  return isRecord(clone) && !Array.isArray(clone) ? clone : {};
}

function stringValue(value: unknown, fallback = ""): string {
  if (value == null) return fallback;
  if (typeof value === "string") return value;
  if (typeof value === "number") return value.toString();
  if (typeof value === "boolean") return value.toString();
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "symbol") return value.toString();
  const stringified: unknown = Reflect.apply(String, undefined, [value]);
  if (typeof stringified === "string") return stringified;
  throw new Error("Unable to stringify a wall-scenario value.");
}

function sourceString(value: unknown): string {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  return stringValue(value);
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

function nonNegative(value: unknown, label: string): number {
  const number = finite(value, label);
  if (number < 0) throw new Error(`${label} must be non-negative.`);
  return number;
}

function positiveInteger(value: unknown, label: string): number {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) {
    throw new Error(`${label} must be a positive integer.`);
  }
  return number;
}

function provenance(value: unknown, label: string): SoilRecord {
  const normalized = cloneRecord(value);
  if (typeof normalized.source !== "string" || !normalized.source.trim()) {
    throw new Error(`${label}.source is required.`);
  }
  normalized.source = normalized.source.trim();
  return normalized;
}

function unitInput(value: unknown, fallback: UnitSystemInput | null): UnitSystemInput | null {
  if (value == null) return fallback;
  const input = record(value);
  const normalized: UnitSystemInput = {};
  if (input.force != null) {
    if (input.force !== "N" && input.force !== "kN" && input.force !== "MN") {
      throw new Error(`Unsupported force unit: ${stringValue(input.force)}.`);
    }
    normalized.force = input.force;
  }
  if (input.length != null) {
    if (
      input.length !== "m" &&
      input.length !== "dm" &&
      input.length !== "cm" &&
      input.length !== "mm"
    ) {
      throw new Error(`Unsupported length unit: ${stringValue(input.length)}.`);
    }
    normalized.length = input.length;
  }
  return normalized;
}

function wallLawOptions(
  value: unknown,
  id: string,
  units: UnitSystemInput | null,
): WallSoilReactionLawOptions {
  const input = record(value);
  const pointsValue = input.points;
  const points = Array.isArray(pointsValue)
    ? pointsValue.map((point) => {
        const pointRecord = record(point);
        return {
          closureDisplacement: Number(pointRecord.closureDisplacement),
          effectivePressure: Number(pointRecord.effectivePressure),
        };
      })
    : [];
  return {
    id: stringValue(input.id, id),
    name: input.name == null ? null : stringValue(input.name),
    model: stringValue(input.model, "monotone-piecewise-linear"),
    points,
    extrapolation: stringValue(input.extrapolation, "constant"),
    provenance: input.provenance == null ? null : cloneRecord(input.provenance),
    units: unitInput(input.units, units),
    metadata: cloneRecord(input.metadata),
  };
}

function normalizeLayerCurve(
  side: string,
  layerId: string,
  input: unknown,
  resolver: UnitResolver,
  units: UnitSystemInput | null,
): NormalizedLayerCurve {
  const curveInput = record(input);
  const stationsInput = curveInput.stations;
  if (!Array.isArray(stationsInput) || stationsInput.length === 0) {
    throw new Error(`soilResponse.sides.${side}.curvesByLayer.${layerId} requires stations.`);
  }
  const stations = stationsInput
    .map((station, index): NormalizedStation => {
      const stationInput = record(station);
      const lawInput = stationInput.law ?? stationInput.curve;
      const law =
        lawInput instanceof WallSoilReactionLaw
          ? lawInput
          : new WallSoilReactionLaw(
              wallLawOptions(
                lawInput,
                `${side}-${layerId}-wall-law-${index + 1}`,
                unitInput(record(lawInput).units, units),
              ),
            );
      const depth = resolver.length(
        finite(stationInput.depth, `${side}.${layerId}.stations[${index}].depth`),
      );
      if (depth < 0) throw new Error("Wall-soil station depth cannot be negative.");
      return {
        depth,
        law,
        metadata: cloneRecord(stationInput.metadata),
      };
    })
    .sort((left, right) => left.depth - right.depth);
  for (let index = 1; index < stations.length; index += 1) {
    if (stations[index]!.depth <= stations[index - 1]!.depth) {
      throw new Error(`${side}.${layerId} station depths must be unique.`);
    }
  }
  const reactionMultiplier = positive(
    curveInput.reactionMultiplier ?? 1,
    `${side}.${layerId}.reactionMultiplier`,
  );
  if (reactionMultiplier !== 1 && curveInput.provenance == null) {
    throw new Error(`${side}.${layerId}.provenance is required for a reactionMultiplier.`);
  }
  return {
    layerId,
    interpolation: "linear-response",
    outsideStationRange: "nearest-station",
    reactionMultiplier,
    provenance:
      curveInput.provenance == null
        ? null
        : provenance(curveInput.provenance, `${side}.${layerId}.provenance`),
    stations,
    metadata: cloneRecord(curveInput.metadata),
  };
}

function normalizeSide(
  side: string,
  input: unknown,
  resolver: UnitResolver,
  units: UnitSystemInput | null,
): NormalizedSide {
  const sideInput = record(input);
  if (!sideInput.profileId) {
    throw new Error(`soilResponse.sides.${side}.profileId is required.`);
  }
  const curvesInput = sideInput.curvesByLayer;
  if (curvesInput == null || typeof curvesInput !== "object" || Array.isArray(curvesInput)) {
    throw new Error(`soilResponse.sides.${side}.curvesByLayer must be an object map.`);
  }
  const curvesByLayer: Record<string, NormalizedLayerCurve> = Object.fromEntries(
    Object.entries(curvesInput).map(([layerId, curve]) => [
      layerId,
      normalizeLayerCurve(side, layerId, curve, resolver, units),
    ]),
  );
  if (Object.keys(curvesByLayer).length === 0) {
    throw new Error(`soilResponse.sides.${side}.curvesByLayer is empty.`);
  }
  return {
    side,
    profileId: stringValue(sideInput.profileId),
    xCoordinate: resolver.length(
      finite(
        sideInput.xCoordinate ?? (side === "retained" ? -0.5 : 0.5),
        `soilResponse.sides.${side}.xCoordinate`,
      ),
    ),
    defaultPorePressureFieldId:
      sideInput.defaultPorePressureFieldId == null
        ? null
        : stringValue(sideInput.defaultPorePressureFieldId),
    curvesByLayer,
    metadata: cloneRecord(sideInput.metadata),
  };
}

function normalizeSupport(
  input: unknown,
  index: number,
  resolver: UnitResolver,
): NormalizedSupport {
  const supportInput = record(input);
  const typeInput = supportInput.type ?? "generic-support";
  const behaviorInput = supportInput.behavior ?? "unilateral";
  const actionDirectionInput = supportInput.actionDirection ?? "toward-retained-side";
  if (typeof typeInput !== "string" || !EMBEDDED_RETAINING_WALL_SUPPORT_TYPES.includes(typeInput)) {
    throw new Error(`Unsupported embedded-wall support type: ${sourceString(typeInput)}.`);
  }
  if (
    typeof behaviorInput !== "string" ||
    !EMBEDDED_RETAINING_WALL_SUPPORT_BEHAVIORS.includes(behaviorInput)
  ) {
    throw new Error(`Unsupported embedded-wall support behavior: ${sourceString(behaviorInput)}.`);
  }
  if (typeof actionDirectionInput !== "string" || !DIRECTIONS.includes(actionDirectionInput)) {
    throw new Error(`Unsupported support actionDirection: ${sourceString(actionDirectionInput)}.`);
  }
  const capacityInput = supportInput.capacity;
  const capacity =
    capacityInput == null
      ? null
      : (() => {
          const capacityRecord = record(capacityInput);
          const maximumForce = positive(
            resolver.force(
              finite(capacityRecord.maximumForce, `supports[${index}].capacity.maximumForce`),
            ),
            `supports[${index}].capacity.maximumForce`,
          );
          return {
            maximumForce,
            basis: stringValue(capacityRecord.basis, "assigned"),
            provenance: provenance(
              capacityRecord.provenance,
              `supports[${index}].capacity.provenance`,
            ),
          };
        })();
  const supportId = stringValue(supportInput.id, `support-${index + 1}`);
  return {
    id: supportId,
    name: supportInput.name ?? supportInput.id ?? `support-${index + 1}`,
    type: typeInput,
    elevation: resolver.length(finite(supportInput.elevation, `supports[${index}].elevation`)),
    stiffness: positive(
      resolver.convert(finite(supportInput.stiffness, `supports[${index}].stiffness`), {
        forceExponent: 1,
        lengthExponent: -1,
      }),
      `supports[${index}].stiffness`,
    ),
    prestress: nonNegative(
      resolver.force(finite(supportInput.prestress ?? 0, `supports[${index}].prestress`)),
      `supports[${index}].prestress`,
    ),
    actionDirection: actionDirectionInput,
    behavior: behaviorInput,
    capacity,
    provenance: provenance(supportInput.provenance, `supports[${index}].provenance`),
    metadata: cloneRecord(supportInput.metadata),
  };
}

function diagramValue(value: unknown): unknown {
  const input = record(value);
  const toJSON = input.toJSON;
  if (typeof toJSON !== "function") return value;
  return Reflect.apply(toJSON, value, []);
}

function normalizePressureSegments(
  input: unknown,
  component: string,
  resolver: UnitResolver,
  label: string,
): NormalizedPressureSegment[] {
  const inputRecord = record(input);
  const diagram = diagramValue(inputRecord.diagram);
  const diagramRecord = record(diagram);
  if (diagramRecord.segments) {
    const segments = diagramRecord.segments;
    if (!Array.isArray(segments)) return [];
    return segments.map((segment, index) => {
      const segmentRecord = record(segment);
      const top = record(segmentRecord.top);
      const bottom = record(segmentRecord.bottom);
      return {
        topElevation: finite(
          segmentRecord.topElevation,
          `${label}.diagram.segments[${index}].topElevation`,
        ),
        bottomElevation: finite(
          segmentRecord.bottomElevation,
          `${label}.diagram.segments[${index}].bottomElevation`,
        ),
        topPressure: finite(top[component], `${label}.diagram.segments[${index}].top.${component}`),
        bottomPressure: finite(
          bottom[component],
          `${label}.diagram.segments[${index}].bottom.${component}`,
        ),
      };
    });
  }
  const segments = inputRecord.segments;
  if (!Array.isArray(segments) || segments.length === 0) {
    throw new Error(`${label} requires a diagram or pressure segments.`);
  }
  return segments.map((segment, index) => {
    const segmentRecord = record(segment);
    return {
      topElevation: resolver.length(
        finite(segmentRecord.topElevation, `${label}.segments[${index}].topElevation`),
      ),
      bottomElevation: resolver.length(
        finite(segmentRecord.bottomElevation, `${label}.segments[${index}].bottomElevation`),
      ),
      topPressure: resolver.stress(
        finite(segmentRecord.topPressure, `${label}.segments[${index}].topPressure`),
      ),
      bottomPressure: resolver.stress(
        finite(segmentRecord.bottomPressure, `${label}.segments[${index}].bottomPressure`),
      ),
    };
  });
}

function normalizePressureLoad(
  input: unknown,
  index: number,
  resolver: UnitResolver,
): NormalizedPressureLoad {
  const loadInput = record(input);
  const side = sourceString(loadInput.side);
  const component = stringValue(loadInput.component, "totalNormal");
  if (!SIDES.includes(side)) {
    throw new Error(`pressureLoads[${index}].side is invalid.`);
  }
  const segments = normalizePressureSegments(
    loadInput,
    component,
    resolver,
    `pressureLoads[${index}]`,
  );
  for (const segment of segments) {
    if (segment.topElevation <= segment.bottomElevation) {
      throw new Error("Pressure-load segment top must be above bottom.");
    }
    if (segment.topPressure < 0 || segment.bottomPressure < 0) {
      throw new Error("Pressure-load magnitudes must be non-negative.");
    }
  }
  return {
    id: stringValue(loadInput.id, `pressure-load-${index + 1}`),
    side,
    component,
    category: stringValue(loadInput.category, "assigned"),
    scale: finite(loadInput.scale ?? 1, `pressureLoads[${index}].scale`),
    segments,
    provenance: provenance(loadInput.provenance, `pressureLoads[${index}].provenance`),
    metadata: cloneRecord(loadInput.metadata),
  };
}

function normalizeNodalAction(
  input: unknown,
  index: number,
  resolver: UnitResolver,
): NormalizedNodalAction {
  const actionInput = record(input);
  const force = resolver.force(finite(actionInput.force ?? 0, `nodalActions[${index}].force`));
  const moment = resolver.moment(finite(actionInput.moment ?? 0, `nodalActions[${index}].moment`));
  if (force === 0 && moment === 0) {
    throw new Error("A nodal action must contain a non-zero force or moment.");
  }
  return {
    id: stringValue(actionInput.id, `nodal-action-${index + 1}`),
    elevation: resolver.length(finite(actionInput.elevation, `nodalActions[${index}].elevation`)),
    force,
    moment,
    provenance: provenance(actionInput.provenance, `nodalActions[${index}].provenance`),
    metadata: cloneRecord(actionInput.metadata),
  };
}

function normalizeStage(input: unknown, index: number, resolver: UnitResolver): NormalizedStage {
  const stageInput = record(input);
  const porePressureFieldIdBySide: Record<string, string | null> = {};
  const porePressureInput = record(stageInput.porePressureFieldIdBySide);
  for (const side of SIDES) {
    if (Object.hasOwn(porePressureInput, side)) {
      const value = porePressureInput[side];
      porePressureFieldIdBySide[side] = value == null ? null : stringValue(value);
    }
  }
  const activeSupportIdsInput = stageInput.activeSupportIds;
  const activeSupportIds = Array.isArray(activeSupportIdsInput)
    ? [...new Set(activeSupportIdsInput.map((value) => sourceString(value)))]
    : [];
  const pressureLoadsInput = stageInput.pressureLoads;
  const nodalActionsInput = stageInput.nodalActions;
  return {
    id: stringValue(stageInput.id, `stage-${index + 1}`),
    name: stageInput.name ?? stageInput.id ?? `Stage ${index + 1}`,
    retainedGroundElevation: resolver.length(
      finite(stageInput.retainedGroundElevation, `stages[${index}].retainedGroundElevation`),
    ),
    excavationGroundElevation: resolver.length(
      finite(stageInput.excavationGroundElevation, `stages[${index}].excavationGroundElevation`),
    ),
    activeSupportIds,
    porePressureFieldIdBySide,
    pressureLoads: Array.isArray(pressureLoadsInput)
      ? pressureLoadsInput.map((load, loadIndex) =>
          normalizePressureLoad(load, loadIndex, resolver),
        )
      : [],
    nodalActions: Array.isArray(nodalActionsInput)
      ? nodalActionsInput.map((action, actionIndex) =>
          normalizeNodalAction(action, actionIndex, resolver),
        )
      : [],
    metadata: cloneRecord(stageInput.metadata),
  };
}

function normalizeSolver(input: unknown, resolver: UnitResolver): NormalizedSolver {
  const solverInput = record(input);
  const minimumStageIncrement = positive(
    solverInput.minimumStageIncrement ?? 1 / 1024,
    "solver.minimumStageIncrement",
  );
  if (minimumStageIncrement >= 1) {
    throw new Error("solver.minimumStageIncrement must be less than one.");
  }
  return {
    strategy: "staged-incremental-damped-newton",
    incrementsPerStage: positiveInteger(
      solverInput.incrementsPerStage ?? 10,
      "solver.incrementsPerStage",
    ),
    maxIterations: positiveInteger(solverInput.maxIterations ?? 50, "solver.maxIterations"),
    maxLineSearchReductions: positiveInteger(
      solverInput.maxLineSearchReductions ?? 12,
      "solver.maxLineSearchReductions",
    ),
    relativeResidualTolerance: positive(
      solverInput.relativeResidualTolerance ?? 1e-8,
      "solver.relativeResidualTolerance",
    ),
    displacementTolerance: positive(
      resolver.length(
        finite(solverInput.displacementTolerance ?? 1e-10, "solver.displacementTolerance"),
      ),
      "solver.displacementTolerance",
    ),
    minimumStageIncrement,
  };
}

function serializeSide(side: NormalizedSide): SoilRecord {
  return {
    side: side.side,
    profileId: side.profileId,
    xCoordinate: side.xCoordinate,
    defaultPorePressureFieldId: side.defaultPorePressureFieldId,
    curvesByLayer: Object.fromEntries(
      Object.entries(side.curvesByLayer).map(([layerId, curve]) => [
        layerId,
        {
          layerId,
          interpolation: curve.interpolation,
          outsideStationRange: curve.outsideStationRange,
          reactionMultiplier: curve.reactionMultiplier,
          provenance: structuredClone(curve.provenance),
          stations: curve.stations.map((station) => ({
            depth: station.depth,
            law: station.law.toJSON(),
            metadata: structuredClone(station.metadata),
          })),
          metadata: structuredClone(curve.metadata),
        },
      ]),
    ),
    metadata: structuredClone(side.metadata),
  };
}

export class EmbeddedRetainingWallScenario {
  schemaVersion: string;
  id: string;
  name: unknown;
  loadingCondition: string;
  loadingProvenance: SoilRecord | null;
  soilResponse: NormalizedSoilResponse;
  supports: NormalizedSupport[];
  stages: NormalizedStage[];
  discretization: {
    model: "boundary-conforming-euler-bernoulli";
    maxElementLength: number;
  };
  solver: NormalizedSolver;
  units: UnitSystem;
  metadata: SoilRecord;

  constructor({
    id,
    name = null,
    loadingCondition = "static",
    loadingProvenance = null,
    soilResponse = null,
    supports = [],
    stages = [],
    discretization = null,
    solver = null,
    units = null,
    metadata = {},
  }: EmbeddedRetainingWallScenarioOptions = {}) {
    if (!id) throw new Error("An EmbeddedRetainingWallScenario id is required.");
    if (
      typeof loadingCondition !== "string" ||
      !EMBEDDED_RETAINING_WALL_LOADING_CONDITIONS.includes(loadingCondition)
    ) {
      throw new Error(`Unsupported wall loading condition: ${sourceString(loadingCondition)}.`);
    }
    assertExplicitUnitSystem(units, "EmbeddedRetainingWallScenario");
    const resolver = createUnitResolver(units, GEOTECHNICAL_INTERNAL_UNITS);
    const soilResponseInput = record(soilResponse);
    const modelInput = soilResponseInput.model ?? "assigned-effective-pressure-displacement-curves";
    if (modelInput !== "assigned-effective-pressure-displacement-curves") {
      throw new Error(`Unsupported embedded-wall soil response: ${sourceString(modelInput)}.`);
    }
    const normalizedSupports = Array.isArray(supports)
      ? supports.map((support, index) => normalizeSupport(support, index, resolver))
      : [];
    const supportIds = normalizedSupports.map(({ id: supportId }) => supportId);
    if (new Set(supportIds).size !== supportIds.length) {
      throw new Error("Embedded-wall support ids must be unique.");
    }
    if (!Array.isArray(stages) || stages.length === 0) {
      throw new Error("EmbeddedRetainingWallScenario requires stages.");
    }
    const normalizedStages = stages.map((stage, index) => normalizeStage(stage, index, resolver));
    const stageIds = normalizedStages.map(({ id: stageId }) => stageId);
    if (new Set(stageIds).size !== stageIds.length) {
      throw new Error("Embedded-wall stage ids must be unique.");
    }
    for (const stage of normalizedStages) {
      for (const supportId of stage.activeSupportIds) {
        if (!supportIds.includes(supportId)) {
          throw new Error(`Stage ${stage.id} references unknown support ${supportId}.`);
        }
      }
    }
    if (loadingCondition === "pseudostatic") {
      if (loadingProvenance == null) {
        throw new Error("Pseudostatic loading requires loadingProvenance.source.");
      }
      if (
        !normalizedStages.some((stage) =>
          stage.pressureLoads.some(({ category }) => category === "seismic"),
        )
      ) {
        throw new Error("Pseudostatic loading requires at least one seismic pressure load.");
      }
    }

    this.schemaVersion = EMBEDDED_RETAINING_WALL_SCENARIO_SCHEMA_VERSION;
    this.id = stringValue(id);
    this.name = name ?? this.id;
    this.loadingCondition = loadingCondition;
    this.loadingProvenance =
      loadingProvenance == null ? null : provenance(loadingProvenance, "loadingProvenance");
    this.soilResponse = {
      model: "assigned-effective-pressure-displacement-curves",
      sides: {
        retained: normalizeSide(
          "retained",
          soilResponseInput.sides && record(soilResponseInput.sides).retained,
          resolver,
          units,
        ),
        excavation: normalizeSide(
          "excavation",
          soilResponseInput.sides && record(soilResponseInput.sides).excavation,
          resolver,
          units,
        ),
      },
      loading: "static-envelope-memoryless",
      metadata: cloneRecord(soilResponseInput.metadata),
    };
    this.supports = normalizedSupports;
    this.stages = normalizedStages;
    const discretizationInput = record(discretization);
    this.discretization = {
      model: "boundary-conforming-euler-bernoulli",
      maxElementLength: positive(
        resolver.length(
          finite(discretizationInput.maxElementLength ?? 0.5, "discretization.maxElementLength"),
        ),
        "discretization.maxElementLength",
      ),
    };
    this.solver = normalizeSolver(solver, resolver);
    this.units = GEOTECHNICAL_INTERNAL_UNITS;
    this.metadata = {
      ...cloneRecord(metadata),
      unitSystem: GEOTECHNICAL_INTERNAL_UNITS,
      sourceUnitSystem: resolver.sourceUnitSystem,
      signConvention: {
        displacement: "positive from retained side toward excavation side",
        rotation: "dy/dx with x positive downward from wall top",
        pressure: "positive magnitude acts from the selected soil side into wall",
        supportForce: "positive scalar acts in support.actionDirection",
      },
    };
  }

  toJSON(): EmbeddedRetainingWallScenarioJson {
    return {
      schemaVersion: this.schemaVersion,
      id: this.id,
      name: this.name,
      loadingCondition: this.loadingCondition,
      loadingProvenance: structuredClone(this.loadingProvenance),
      soilResponse: {
        model: this.soilResponse.model,
        sides: {
          retained: serializeSide(this.soilResponse.sides.retained),
          excavation: serializeSide(this.soilResponse.sides.excavation),
        },
        loading: this.soilResponse.loading,
        metadata: structuredClone(this.soilResponse.metadata),
      },
      supports: structuredClone(this.supports),
      stages: structuredClone(this.stages),
      discretization: { ...this.discretization },
      solver: { ...this.solver },
      units: { ...this.units },
      metadata: structuredClone(this.metadata),
    };
  }
}
