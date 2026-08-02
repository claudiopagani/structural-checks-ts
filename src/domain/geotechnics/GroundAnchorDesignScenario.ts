import {
  assertExplicitUnitSystem,
  createUnitResolver,
  type UnitSystem,
  type UnitSystemInput,
} from "../units/UnitSystem.js";
import { GEOTECHNICAL_INTERNAL_UNITS } from "./SoilMaterial.js";

export const GROUND_ANCHOR_DESIGN_SCENARIO_SCHEMA_VERSION = "ground-anchor-design-scenario/v1";

export const GROUND_ANCHOR_DEMAND_SOURCES = Object.freeze([
  "assigned-tendon-load",
  "assigned-horizontal-line-load",
  "embedded-retaining-wall-result",
] as const);

export const GROUND_ANCHOR_FAILURE_SURFACE_MODELS = Object.freeze([
  "assigned-distance",
  "assigned-polyline",
  "rankine-active-wedge",
] as const);

export const GROUND_ANCHOR_BOND_RESISTANCE_MODELS = Object.freeze([
  "fhwa-presumptive",
  "ultimate-transfer-load",
  "ultimate-bond-stress",
] as const);

export const GROUND_ANCHOR_GROUND_CLASSES = Object.freeze([
  "soil",
  "weak-rock",
  "competent-rock",
] as const);

export const GROUND_ANCHOR_TEST_TYPES = Object.freeze([
  "proof",
  "performance",
  "extended-creep",
] as const);

const SERVICE_LIFE_CLASSES = Object.freeze([
  "temporary-support-of-excavation",
  "permanent",
] as const);
const AGGRESSIVITY_CLASSES = Object.freeze(["unknown", "non-aggressive", "aggressive"] as const);
const CONSEQUENCE_CLASSES = Object.freeze(["not-serious", "serious"] as const);
const COST_CLASSES = Object.freeze(["small", "significant"] as const);

export type GroundAnchorDemandSource = (typeof GROUND_ANCHOR_DEMAND_SOURCES)[number];
export type GroundAnchorDemandSelection = "maximum-absolute" | "selected-stage";
export type GroundAnchorFailureSurfaceModel = (typeof GROUND_ANCHOR_FAILURE_SURFACE_MODELS)[number];
export type GroundAnchorBondResistanceModel = (typeof GROUND_ANCHOR_BOND_RESISTANCE_MODELS)[number];
export type GroundAnchorGroundClass = (typeof GROUND_ANCHOR_GROUND_CLASSES)[number];
export type GroundAnchorTestType = (typeof GROUND_ANCHOR_TEST_TYPES)[number];
export type GroundAnchorServiceLife = (typeof SERVICE_LIFE_CLASSES)[number];
export type GroundAnchorAggressivity = (typeof AGGRESSIVITY_CLASSES)[number];
export type GroundAnchorConsequenceClass = (typeof CONSEQUENCE_CLASSES)[number];
export type GroundAnchorCostClass = (typeof COST_CLASSES)[number];

export interface GroundAnchorDemandInput {
  source?: string;
  selection?: string;
  supportId?: unknown;
  stageId?: unknown;
  designLoad?: unknown;
  horizontalLineLoad?: unknown;
  provenance?: Record<string, unknown> | null;
  metadata?: Record<string, unknown>;
}

export interface GroundAnchorFailureSurfaceInput {
  model?: string;
  wallHeight?: unknown;
  distanceAlongAnchor?: unknown;
  points?: Array<{ x?: unknown; z?: unknown }>;
  frictionAngle?: unknown;
  excavationBaseElevation?: unknown;
  provenance?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface GroundAnchorBondResistanceInput {
  model?: string;
  catalogId?: unknown;
  groundClass?: string;
  capacityDivisor?: unknown;
  ultimateTransferLoad?: unknown;
  ultimateBondStress?: unknown;
  provenance?: Record<string, unknown> | null;
  metadata?: Record<string, unknown>;
}

export interface GroundAnchorCorrosionMeasurementsInput {
  pH?: unknown;
  resistivityOhmCm?: unknown;
  sulfidesPresent?: unknown;
  strayCurrentsPresent?: unknown;
  adjacentConcreteChemicalAttack?: unknown;
}

export interface GroundAnchorCorrosionEnvironmentInput {
  serviceLife?: string;
  aggressivity?: string;
  consequencesOfFailure?: string;
  higherProtectionCost?: string;
  measurements?: GroundAnchorCorrosionMeasurementsInput | null;
  provenance?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface GroundAnchorTestObservationInput {
  timeMinutes?: unknown;
  movement?: unknown;
}

export interface GroundAnchorTestHoldInput {
  load?: unknown;
  observations?: GroundAnchorTestObservationInput[];
}

export interface GroundAnchorTestRecordInput {
  id?: unknown;
  type?: string;
  alignmentLoad?: unknown;
  testLoad?: unknown;
  elasticMovementAtTestLoad?: unknown;
  totalMovementAtTestLoad?: unknown;
  initialLiftOffLoad?: unknown;
  holds?: GroundAnchorTestHoldInput[];
  provenance?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface GroundAnchorTestingInput {
  jackLength?: unknown;
  records?: GroundAnchorTestRecordInput[];
  metadata?: Record<string, unknown>;
}

export interface GroundAnchorDesignScenarioOptions {
  id?: string;
  name?: string | null;
  designMethod?: string;
  demand?: GroundAnchorDemandInput;
  lockOffLoadFactor?: unknown;
  testLoadFactor?: unknown;
  criticalFailureSurface?: GroundAnchorFailureSurfaceInput;
  bondResistanceByZone?: Record<string, GroundAnchorBondResistanceInput>;
  bondResistanceByMaterial?: Record<string, GroundAnchorBondResistanceInput>;
  defaultBondResistance?: GroundAnchorBondResistanceInput | null;
  corrosionEnvironment?: GroundAnchorCorrosionEnvironmentInput;
  testing?: GroundAnchorTestingInput | null;
  angleUnits?: string;
  units?: UnitSystemInput | null;
  metadata?: Record<string, unknown> | null;
}

export interface GroundAnchorDemand {
  source: GroundAnchorDemandSource;
  selection: GroundAnchorDemandSelection;
  supportId: string | null;
  stageId: string | null;
  designLoad: number | null;
  horizontalLineLoad: number | null;
  provenance: Record<string, unknown> | null;
  metadata: Record<string, unknown>;
}

export interface GroundAnchorPoint {
  x: number;
  z: number;
}

export interface GroundAnchorFailureSurface {
  model: GroundAnchorFailureSurfaceModel;
  wallHeight: number;
  distanceAlongAnchor?: number;
  points?: GroundAnchorPoint[];
  frictionAngle?: number;
  excavationBaseElevation?: number;
  provenance: Record<string, unknown>;
  metadata: Record<string, unknown>;
}

export interface FhwaPresumptiveBondResistance {
  model: "fhwa-presumptive";
  catalogId: string;
  groundClass: string | null;
  capacityDivisor: number | null;
  provenance: Record<string, unknown> | null;
  metadata: Record<string, unknown>;
}

export interface UltimateTransferLoadBondResistance {
  model: "ultimate-transfer-load";
  groundClass: GroundAnchorGroundClass;
  capacityDivisor: number;
  ultimateTransferLoad: number;
  provenance: Record<string, unknown>;
  metadata: Record<string, unknown>;
}

export interface UltimateBondStressResistance {
  model: "ultimate-bond-stress";
  groundClass: GroundAnchorGroundClass;
  capacityDivisor: number;
  ultimateBondStress: number;
  provenance: Record<string, unknown>;
  metadata: Record<string, unknown>;
}

export type GroundAnchorBondResistance =
  | FhwaPresumptiveBondResistance
  | UltimateTransferLoadBondResistance
  | UltimateBondStressResistance;

export interface GroundAnchorCorrosionMeasurements {
  pH: number | null;
  resistivityOhmCm: number | null;
  sulfidesPresent: boolean;
  strayCurrentsPresent: boolean;
  adjacentConcreteChemicalAttack: boolean;
}

export interface GroundAnchorCorrosionEnvironment {
  serviceLife: GroundAnchorServiceLife;
  aggressivity: GroundAnchorAggressivity;
  consequencesOfFailure: GroundAnchorConsequenceClass;
  higherProtectionCost: GroundAnchorCostClass;
  measurements: GroundAnchorCorrosionMeasurements | null;
  provenance: Record<string, unknown>;
  metadata: Record<string, unknown>;
}

export interface GroundAnchorTestObservation {
  timeMinutes: number;
  movement: number;
}

export interface GroundAnchorTestHold {
  load: number;
  observations: GroundAnchorTestObservation[];
}

export interface GroundAnchorTestRecord {
  id: string;
  type: GroundAnchorTestType;
  alignmentLoad: number;
  testLoad: number;
  elasticMovementAtTestLoad: number | null;
  totalMovementAtTestLoad: number | null;
  initialLiftOffLoad: number | null;
  holds: GroundAnchorTestHold[];
  provenance: Record<string, unknown>;
  metadata: Record<string, unknown>;
}

export interface GroundAnchorTesting {
  jackLength: number;
  records: GroundAnchorTestRecord[];
  metadata: Record<string, unknown>;
}

export interface GroundAnchorDesignScenarioJson {
  schemaVersion: string;
  id: string;
  name: string;
  designMethod: string;
  demand: GroundAnchorDemand;
  lockOffLoadFactor: number;
  testLoadFactor: number;
  criticalFailureSurface: GroundAnchorFailureSurface & { angleUnits?: "deg" };
  bondResistanceByZone: Record<string, GroundAnchorBondResistance>;
  bondResistanceByMaterial: Record<string, GroundAnchorBondResistance>;
  defaultBondResistance: GroundAnchorBondResistance | null;
  corrosionEnvironment: GroundAnchorCorrosionEnvironment;
  testing: GroundAnchorTesting;
  units: UnitSystem;
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

function nonNegative(value: unknown, label: string): number {
  const number = finite(value, label);
  if (number < 0) throw new Error(`${label} must be non-negative.`);
  return number;
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : String(value);
}

function provenance(
  value: Record<string, unknown> | null | undefined,
  label: string,
): Record<string, unknown> {
  const normalized = structuredClone(value ?? {});
  if (typeof normalized.source !== "string" || !normalized.source.trim()) {
    throw new Error(`${label}.source is required.`);
  }
  normalized.source = normalized.source.trim();
  return normalized;
}

function isDemandSource(value: string | undefined): value is GroundAnchorDemandSource {
  return GROUND_ANCHOR_DEMAND_SOURCES.some((candidate) => candidate === value);
}

function isFailureSurfaceModel(
  value: string | undefined,
): value is GroundAnchorFailureSurfaceModel {
  return GROUND_ANCHOR_FAILURE_SURFACE_MODELS.some((candidate) => candidate === value);
}

function isBondResistanceModel(
  value: string | undefined,
): value is GroundAnchorBondResistanceModel {
  return GROUND_ANCHOR_BOND_RESISTANCE_MODELS.some((candidate) => candidate === value);
}

function isGroundClass(value: string | undefined): value is GroundAnchorGroundClass {
  return GROUND_ANCHOR_GROUND_CLASSES.some((candidate) => candidate === value);
}

function isTestType(value: string | undefined): value is GroundAnchorTestType {
  return GROUND_ANCHOR_TEST_TYPES.some((candidate) => candidate === value);
}

function isServiceLife(value: string | undefined): value is GroundAnchorServiceLife {
  return SERVICE_LIFE_CLASSES.some((candidate) => candidate === value);
}

function isAggressivity(value: string): value is GroundAnchorAggressivity {
  return AGGRESSIVITY_CLASSES.some((candidate) => candidate === value);
}

function isConsequenceClass(value: string): value is GroundAnchorConsequenceClass {
  return CONSEQUENCE_CLASSES.some((candidate) => candidate === value);
}

function isCostClass(value: string): value is GroundAnchorCostClass {
  return COST_CLASSES.some((candidate) => candidate === value);
}

function normalizeDemand(
  input: GroundAnchorDemandInput | undefined,
  resolver: ReturnType<typeof createUnitResolver>,
): GroundAnchorDemand {
  const source = input?.source;
  if (!isDemandSource(source)) {
    throw new Error(`Unsupported ground-anchor demand source: ${stringValue(source)}.`);
  }
  const selection = input?.selection ?? "maximum-absolute";
  const normalized: GroundAnchorDemand = {
    source,
    selection: "maximum-absolute",
    supportId: input?.supportId == null ? null : stringValue(input.supportId),
    stageId: input?.stageId == null ? null : stringValue(input.stageId),
    designLoad: null,
    horizontalLineLoad: null,
    provenance:
      input?.provenance == null ? null : provenance(input.provenance, "demand.provenance"),
    metadata: structuredClone(input?.metadata ?? {}),
  };
  if (source === "assigned-tendon-load") {
    normalized.designLoad = positive(
      resolver.force(finite(input?.designLoad, "demand.designLoad")),
      "demand.designLoad",
    );
  }
  if (source === "assigned-horizontal-line-load") {
    normalized.horizontalLineLoad = positive(
      resolver.lineLoad(finite(input?.horizontalLineLoad, "demand.horizontalLineLoad")),
      "demand.horizontalLineLoad",
    );
  }
  if (source !== "embedded-retaining-wall-result" && normalized.provenance == null) {
    throw new Error("Assigned ground-anchor demand requires provenance.");
  }
  if (source === "embedded-retaining-wall-result" && !normalized.supportId) {
    throw new Error("Embedded-wall demand requires demand.supportId.");
  }
  if (selection !== "maximum-absolute" && selection !== "selected-stage") {
    throw new Error(`Unsupported demand.selection: ${selection}.`);
  }
  normalized.selection = selection;
  if (selection === "selected-stage" && !normalized.stageId) {
    throw new Error("selected-stage demand requires demand.stageId.");
  }
  return normalized;
}

function normalizeFailureSurface(
  input: GroundAnchorFailureSurfaceInput | undefined,
  resolver: ReturnType<typeof createUnitResolver>,
  angleUnits: string,
): GroundAnchorFailureSurface {
  const model = input?.model;
  if (!isFailureSurfaceModel(model)) {
    throw new Error(`Unsupported critical-failure-surface model: ${stringValue(model)}.`);
  }
  const normalized: GroundAnchorFailureSurface = {
    model,
    wallHeight: positive(
      resolver.length(finite(input?.wallHeight, "criticalFailureSurface.wallHeight")),
      "criticalFailureSurface.wallHeight",
    ),
    provenance: provenance(input?.provenance, "criticalFailureSurface.provenance"),
    metadata: structuredClone(input?.metadata ?? {}),
  };
  if (model === "assigned-distance") {
    normalized.distanceAlongAnchor = positive(
      resolver.length(
        finite(input?.distanceAlongAnchor, "criticalFailureSurface.distanceAlongAnchor"),
      ),
      "criticalFailureSurface.distanceAlongAnchor",
    );
  }
  if (model === "assigned-polyline") {
    if (!Array.isArray(input?.points) || input.points.length < 2) {
      throw new Error("An assigned critical-failure polyline requires points.");
    }
    normalized.points = input.points.map((point, index) => ({
      x: resolver.length(finite(point.x, `criticalFailureSurface.points[${index}].x`)),
      z: resolver.length(finite(point.z, `criticalFailureSurface.points[${index}].z`)),
    }));
  }
  if (model === "rankine-active-wedge") {
    const phiInput = finite(input?.frictionAngle, "criticalFailureSurface.frictionAngle");
    const phi = angleUnits === "rad" ? phiInput : (phiInput * Math.PI) / 180;
    if (phi <= 0 || phi >= Math.PI / 2) {
      throw new Error("Rankine frictionAngle must be between 0 and 90 degrees.");
    }
    normalized.frictionAngle = phi;
    normalized.excavationBaseElevation = resolver.length(
      finite(input?.excavationBaseElevation, "criticalFailureSurface.excavationBaseElevation"),
    );
  }
  return normalized;
}

function normalizeBondResistance(
  input: GroundAnchorBondResistanceInput | undefined,
  resolver: ReturnType<typeof createUnitResolver>,
  label: string,
): GroundAnchorBondResistance {
  const model = input?.model;
  if (!isBondResistanceModel(model)) {
    throw new Error(`${label}.model is unsupported.`);
  }
  if (model === "fhwa-presumptive") {
    if (!input?.catalogId) throw new Error(`${label}.catalogId is required.`);
    return {
      model,
      catalogId: stringValue(input.catalogId),
      groundClass: input.groundClass == null ? null : String(input.groundClass),
      capacityDivisor:
        input.capacityDivisor == null
          ? null
          : positive(input.capacityDivisor, `${label}.capacityDivisor`),
      provenance:
        input.provenance == null ? null : provenance(input.provenance, `${label}.provenance`),
      metadata: structuredClone(input.metadata ?? {}),
    };
  }
  const groundClass = input?.groundClass;
  if (!isGroundClass(groundClass)) {
    throw new Error(`${label}.groundClass is unsupported.`);
  }
  const capacityDivisor = positive(input?.capacityDivisor, `${label}.capacityDivisor`);
  const base = {
    model,
    groundClass,
    capacityDivisor,
    provenance: provenance(input?.provenance, `${label}.provenance`),
    metadata: structuredClone(input?.metadata ?? {}),
  };
  if (model === "ultimate-transfer-load") {
    return {
      ...base,
      model,
      ultimateTransferLoad: positive(
        resolver.lineLoad(finite(input?.ultimateTransferLoad, `${label}.ultimateTransferLoad`)),
        `${label}.ultimateTransferLoad`,
      ),
    };
  }
  return {
    ...base,
    model,
    ultimateBondStress: positive(
      resolver.stress(finite(input?.ultimateBondStress, `${label}.ultimateBondStress`)),
      `${label}.ultimateBondStress`,
    ),
  };
}

function normalizeResistanceMap(
  input: Record<string, GroundAnchorBondResistanceInput> | null | undefined,
  resolver: ReturnType<typeof createUnitResolver>,
  label: string,
): Record<string, GroundAnchorBondResistance> {
  if (input == null) return {};
  if (typeof input !== "object" || Array.isArray(input)) {
    throw new Error(`${label} must be an object map.`);
  }
  return Object.fromEntries(
    Object.entries(input).map(([id, value]) => [
      id,
      normalizeBondResistance(value, resolver, `${label}.${id}`),
    ]),
  );
}

function normalizeCorrosionEnvironment(
  input: GroundAnchorCorrosionEnvironmentInput | undefined,
): GroundAnchorCorrosionEnvironment {
  const serviceLife = input?.serviceLife;
  const aggressivity = input?.aggressivity ?? "unknown";
  const consequencesOfFailure = input?.consequencesOfFailure ?? "serious";
  const higherProtectionCost = input?.higherProtectionCost ?? "significant";
  if (!isServiceLife(serviceLife)) {
    throw new Error("corrosionEnvironment.serviceLife is unsupported.");
  }
  if (!isAggressivity(aggressivity)) {
    throw new Error("corrosionEnvironment.aggressivity is unsupported.");
  }
  if (!isConsequenceClass(consequencesOfFailure)) {
    throw new Error("corrosionEnvironment.consequencesOfFailure is unsupported.");
  }
  if (!isCostClass(higherProtectionCost)) {
    throw new Error("corrosionEnvironment.higherProtectionCost is unsupported.");
  }
  const measurements =
    input?.measurements == null
      ? null
      : {
          pH:
            input.measurements.pH == null
              ? null
              : finite(input.measurements.pH, "corrosionEnvironment.measurements.pH"),
          resistivityOhmCm:
            input.measurements.resistivityOhmCm == null
              ? null
              : positive(
                  input.measurements.resistivityOhmCm,
                  "corrosionEnvironment.measurements.resistivityOhmCm",
                ),
          sulfidesPresent: Boolean(input.measurements.sulfidesPresent),
          strayCurrentsPresent: Boolean(input.measurements.strayCurrentsPresent),
          adjacentConcreteChemicalAttack: Boolean(
            input.measurements.adjacentConcreteChemicalAttack,
          ),
        };
  return {
    serviceLife,
    aggressivity,
    consequencesOfFailure,
    higherProtectionCost,
    measurements,
    provenance: provenance(input?.provenance, "corrosionEnvironment.provenance"),
    metadata: structuredClone(input?.metadata ?? {}),
  };
}

function isTestObservationArray(
  value: GroundAnchorTestObservationInput[] | undefined,
): value is GroundAnchorTestObservationInput[] {
  return Array.isArray(value);
}

function normalizeTestRecord(
  input: GroundAnchorTestRecordInput,
  resolver: ReturnType<typeof createUnitResolver>,
  index: number,
): GroundAnchorTestRecord {
  const type = input.type;
  if (!isTestType(type)) {
    throw new Error(`testing.records[${index}].type is unsupported.`);
  }
  const holds = (input.holds ?? []).map((hold, holdIndex) => {
    if (!isTestObservationArray(hold.observations) || hold.observations.length < 2) {
      throw new Error(`testing.records[${index}].holds[${holdIndex}] requires observations.`);
    }
    const observations = hold.observations
      .map((observation, obsIndex) => ({
        timeMinutes: positive(
          observation.timeMinutes,
          `testing.records[${index}].holds[${holdIndex}].observations[${obsIndex}].timeMinutes`,
        ),
        movement: nonNegative(
          resolver.length(
            finite(
              observation.movement,
              `testing.records[${index}].holds[${holdIndex}].observations[${obsIndex}].movement`,
            ),
          ),
          `testing.records[${index}].holds[${holdIndex}].observations[${obsIndex}].movement`,
        ),
      }))
      .sort((left, right) => left.timeMinutes - right.timeMinutes);
    for (let obsIndex = 1; obsIndex < observations.length; obsIndex += 1) {
      if (observations[obsIndex]!.timeMinutes <= observations[obsIndex - 1]!.timeMinutes) {
        throw new Error("Ground-anchor test observation times must be unique.");
      }
    }
    return {
      load: positive(
        resolver.force(finite(hold.load, `testing.records[${index}].holds[${holdIndex}].load`)),
        `testing.records[${index}].holds[${holdIndex}].load`,
      ),
      observations,
    };
  });
  return {
    id: stringValue(input.id ?? `anchor-test-${index + 1}`),
    type,
    alignmentLoad: nonNegative(
      resolver.force(finite(input.alignmentLoad ?? 0, `testing.records[${index}].alignmentLoad`)),
      `testing.records[${index}].alignmentLoad`,
    ),
    testLoad: positive(
      resolver.force(finite(input.testLoad, `testing.records[${index}].testLoad`)),
      `testing.records[${index}].testLoad`,
    ),
    elasticMovementAtTestLoad:
      input.elasticMovementAtTestLoad == null
        ? null
        : nonNegative(
            resolver.length(
              finite(
                input.elasticMovementAtTestLoad,
                `testing.records[${index}].elasticMovementAtTestLoad`,
              ),
            ),
            `testing.records[${index}].elasticMovementAtTestLoad`,
          ),
    totalMovementAtTestLoad:
      input.totalMovementAtTestLoad == null
        ? null
        : nonNegative(
            resolver.length(
              finite(
                input.totalMovementAtTestLoad,
                `testing.records[${index}].totalMovementAtTestLoad`,
              ),
            ),
            `testing.records[${index}].totalMovementAtTestLoad`,
          ),
    initialLiftOffLoad:
      input.initialLiftOffLoad == null
        ? null
        : nonNegative(
            resolver.force(
              finite(input.initialLiftOffLoad, `testing.records[${index}].initialLiftOffLoad`),
            ),
            `testing.records[${index}].initialLiftOffLoad`,
          ),
    holds,
    provenance: provenance(input.provenance, `testing.records[${index}].provenance`),
    metadata: structuredClone(input.metadata ?? {}),
  };
}

export class GroundAnchorDesignScenario {
  schemaVersion: string;
  id: string;
  name: string;
  designMethod: string;
  demand: GroundAnchorDemand;
  lockOffLoadFactor: number;
  testLoadFactor: number;
  criticalFailureSurface: GroundAnchorFailureSurface;
  bondResistanceByZone: Record<string, GroundAnchorBondResistance>;
  bondResistanceByMaterial: Record<string, GroundAnchorBondResistance>;
  defaultBondResistance: GroundAnchorBondResistance | null;
  corrosionEnvironment: GroundAnchorCorrosionEnvironment;
  testing: GroundAnchorTesting;
  units: UnitSystem;
  metadata: Record<string, unknown>;

  constructor({
    id,
    name = null,
    designMethod = "fhwa-gec4-allowable-load",
    demand,
    lockOffLoadFactor = 1,
    testLoadFactor = 1.33,
    criticalFailureSurface,
    bondResistanceByZone = {},
    bondResistanceByMaterial = {},
    defaultBondResistance = null,
    corrosionEnvironment,
    testing = null,
    angleUnits = "deg",
    units = null,
    metadata = {},
  }: GroundAnchorDesignScenarioOptions = {}) {
    if (!id) throw new Error("A GroundAnchorDesignScenario id is required.");
    if (designMethod !== "fhwa-gec4-allowable-load") {
      throw new Error(`Unsupported ground-anchor designMethod: ${designMethod}.`);
    }
    assertExplicitUnitSystem(units, "GroundAnchorDesignScenario");
    const resolver = createUnitResolver(units, GEOTECHNICAL_INTERNAL_UNITS);
    this.schemaVersion = GROUND_ANCHOR_DESIGN_SCENARIO_SCHEMA_VERSION;
    this.id = String(id);
    this.name = name ?? this.id;
    this.designMethod = designMethod;
    this.demand = normalizeDemand(demand, resolver);
    this.lockOffLoadFactor = positive(lockOffLoadFactor, "lockOffLoadFactor");
    this.testLoadFactor = positive(testLoadFactor, "testLoadFactor");
    this.criticalFailureSurface = normalizeFailureSurface(
      criticalFailureSurface,
      resolver,
      angleUnits,
    );
    this.bondResistanceByZone = normalizeResistanceMap(
      bondResistanceByZone,
      resolver,
      "bondResistanceByZone",
    );
    this.bondResistanceByMaterial = normalizeResistanceMap(
      bondResistanceByMaterial,
      resolver,
      "bondResistanceByMaterial",
    );
    this.defaultBondResistance =
      defaultBondResistance == null
        ? null
        : normalizeBondResistance(defaultBondResistance, resolver, "defaultBondResistance");
    if (
      Object.keys(this.bondResistanceByZone).length === 0 &&
      Object.keys(this.bondResistanceByMaterial).length === 0 &&
      this.defaultBondResistance == null
    ) {
      throw new Error("At least one ground-anchor bond resistance is required.");
    }
    this.corrosionEnvironment = normalizeCorrosionEnvironment(corrosionEnvironment);
    this.testing = {
      jackLength: nonNegative(
        resolver.length(finite(testing?.jackLength ?? 0, "testing.jackLength")),
        "testing.jackLength",
      ),
      records: (testing?.records ?? []).map((record, index) =>
        normalizeTestRecord(record, resolver, index),
      ),
      metadata: structuredClone(testing?.metadata ?? {}),
    };
    this.units = GEOTECHNICAL_INTERNAL_UNITS;
    this.metadata = {
      ...structuredClone(metadata ?? {}),
      unitSystem: GEOTECHNICAL_INTERNAL_UNITS,
      sourceUnitSystem: resolver.sourceUnitSystem,
    };
  }

  toJSON(): GroundAnchorDesignScenarioJson {
    const criticalFailureSurface = {
      ...structuredClone(this.criticalFailureSurface),
      ...(this.criticalFailureSurface.frictionAngle == null
        ? {}
        : {
            frictionAngle: (this.criticalFailureSurface.frictionAngle * 180) / Math.PI,
            angleUnits: "deg" as const,
          }),
    };
    return {
      schemaVersion: this.schemaVersion,
      id: this.id,
      name: this.name,
      designMethod: this.designMethod,
      demand: structuredClone(this.demand),
      lockOffLoadFactor: this.lockOffLoadFactor,
      testLoadFactor: this.testLoadFactor,
      criticalFailureSurface,
      bondResistanceByZone: structuredClone(this.bondResistanceByZone),
      bondResistanceByMaterial: structuredClone(this.bondResistanceByMaterial),
      defaultBondResistance: structuredClone(this.defaultBondResistance),
      corrosionEnvironment: structuredClone(this.corrosionEnvironment),
      testing: structuredClone(this.testing),
      units: { ...this.units },
      metadata: structuredClone(this.metadata),
    };
  }
}
