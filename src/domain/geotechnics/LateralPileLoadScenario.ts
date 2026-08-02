import {
  assertExplicitUnitSystem,
  createUnitResolver,
  type UnitSystemInput,
} from "../units/UnitSystem.js";
import { GEOTECHNICAL_INTERNAL_UNITS, type SoilRecord } from "./SoilMaterial.js";

export const LATERAL_PILE_LOAD_SCENARIO_SCHEMA_VERSION = "lateral-pile-load-scenario/v1";

export type LateralPileCapacityMethod = "broms-short-free-head";
export const LATERAL_PILE_CAPACITY_METHODS = Object.freeze([
  "broms-short-free-head",
]) satisfies readonly LateralPileCapacityMethod[];

export type LateralPileSoilBranch = "cohesive-undrained" | "cohesionless-drained";
export const LATERAL_PILE_SOIL_BRANCHES = Object.freeze([
  "cohesive-undrained",
  "cohesionless-drained",
]) satisfies readonly LateralPileSoilBranch[];

export type LateralPileHeadCondition = "free-to-rotate";
export const LATERAL_PILE_HEAD_CONDITIONS = Object.freeze([
  "free-to-rotate",
]) satisfies readonly LateralPileHeadCondition[];

export type LateralPileBehaviorClassification = "short-rigid";
export const LATERAL_PILE_BEHAVIOR_CLASSIFICATIONS = Object.freeze([
  "short-rigid",
]) satisfies readonly LateralPileBehaviorClassification[];

export type LateralPileResistanceConversionModel = "soil-reaction-factor";
export const LATERAL_PILE_RESISTANCE_CONVERSION_MODELS = Object.freeze([
  "soil-reaction-factor",
]) satisfies readonly LateralPileResistanceConversionModel[];

export interface LateralPileActionInput {
  lateralShear?: number;
  overturningMoment?: number;
  basis?: string;
  referencePoint?: string;
  direction?: string;
  metadata?: SoilRecord;
}

export interface LateralPileAction {
  lateralShear: number;
  overturningMoment: number;
  basis: string;
  referencePoint: "groundline-at-pile-axis";
  direction: string;
  metadata: SoilRecord;
}

export interface LateralPileBehaviorAssertionInput {
  classification?: string;
  basis?: string;
  provenance?: SoilRecord;
  metadata?: SoilRecord;
}

export interface LateralPileBehaviorAssertion {
  classification: LateralPileBehaviorClassification;
  basis: string;
  provenance: SoilRecord;
  metadata: SoilRecord;
}

export interface LateralPileResistanceConversionInput {
  model?: string;
  factor?: number;
  provenance?: SoilRecord;
  metadata?: SoilRecord;
}

export interface LateralPileResistanceConversion {
  model: LateralPileResistanceConversionModel;
  factor: number;
  provenance: SoilRecord;
  metadata: SoilRecord;
}

export interface LateralPileLoadScenarioOptions {
  id?: string;
  name?: string | null;
  method?: string;
  soilBranch?: string;
  headCondition?: string;
  action?: LateralPileActionInput | null;
  behaviorAssertion?: LateralPileBehaviorAssertionInput | null;
  resistanceConversion?: LateralPileResistanceConversionInput | null;
  units?: UnitSystemInput | null;
  metadata?: SoilRecord;
}

export interface LateralPileLoadScenarioJson {
  schemaVersion: string;
  id: string;
  name: string;
  method: LateralPileCapacityMethod;
  soilBranch: LateralPileSoilBranch;
  headCondition: LateralPileHeadCondition;
  action: LateralPileAction;
  behaviorAssertion: LateralPileBehaviorAssertion;
  resistanceConversion: LateralPileResistanceConversion | null;
  units: typeof GEOTECHNICAL_INTERNAL_UNITS;
  metadata: SoilRecord;
}

function isLateralPileCapacityMethod(value: unknown): value is LateralPileCapacityMethod {
  return value === "broms-short-free-head";
}

function isLateralPileSoilBranch(value: unknown): value is LateralPileSoilBranch {
  return value === "cohesive-undrained" || value === "cohesionless-drained";
}

function isLateralPileHeadCondition(value: unknown): value is LateralPileHeadCondition {
  return value === "free-to-rotate";
}

function isLateralPileBehaviorClassification(
  value: unknown,
): value is LateralPileBehaviorClassification {
  return value === "short-rigid";
}

function isLateralPileResistanceConversionModel(
  value: unknown,
): value is LateralPileResistanceConversionModel {
  return value === "soil-reaction-factor";
}

function stringValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (value == null) return "";
  if (
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "bigint" ||
    typeof value === "symbol"
  ) {
    return String(value);
  }
  return Object.prototype.toString.call(value);
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

function positive(value: unknown, label: string): number {
  const number = finite(value, label);
  if (number <= 0) throw new Error(`${label} must be positive.`);
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
  action: LateralPileActionInput | null | undefined,
  resolver: ReturnType<typeof createUnitResolver>,
): LateralPileAction {
  if (!action || typeof action !== "object") {
    throw new Error("LateralPileLoadScenario action is required.");
  }
  if (action.referencePoint !== "groundline-at-pile-axis") {
    throw new Error(
      "action.referencePoint must be groundline-at-pile-axis; transfer any elevated-head action to groundline before analysis.",
    );
  }
  const lateralShear = nonNegative(
    resolver.force(Number(action.lateralShear)),
    "action.lateralShear",
  );
  const overturningMoment = nonNegative(
    resolver.moment(Number(action.overturningMoment ?? 0)),
    "action.overturningMoment",
  );
  if (lateralShear === 0 && overturningMoment === 0) {
    throw new Error(
      "At least one of action.lateralShear or action.overturningMoment must be positive.",
    );
  }
  return {
    lateralShear,
    overturningMoment,
    basis: stringValue(action.basis ?? "assigned"),
    referencePoint: "groundline-at-pile-axis",
    direction: action.direction ?? "local-positive-x",
    metadata: structuredClone(action.metadata ?? {}),
  };
}

function normalizeBehaviorAssertion(
  assertion: LateralPileBehaviorAssertionInput | null | undefined,
): LateralPileBehaviorAssertion {
  if (!assertion || typeof assertion !== "object") {
    throw new Error(
      "behaviorAssertion is required because the Broms branch is restricted to short rigid piles.",
    );
  }
  const classification = assertion.classification;
  if (!isLateralPileBehaviorClassification(classification)) {
    throw new Error(
      `Unsupported lateral pile behavior classification: ${stringValue(classification)}.`,
    );
  }
  return {
    classification,
    basis: assertion.basis ?? "project-assessment",
    provenance: normalizeProvenance(assertion.provenance, "behaviorAssertion.provenance"),
    metadata: structuredClone(assertion.metadata ?? {}),
  };
}

function normalizeResistanceConversion(
  input: LateralPileResistanceConversionInput | null | undefined,
): LateralPileResistanceConversion | null {
  if (input == null) return null;
  const model = input.model ?? "soil-reaction-factor";
  if (!isLateralPileResistanceConversionModel(model)) {
    throw new Error(`Unsupported resistanceConversion.model: ${stringValue(model)}.`);
  }
  const factor = positive(input.factor, "resistanceConversion.factor");
  if (factor > 1) {
    throw new Error("resistanceConversion.factor must not exceed 1.");
  }
  return {
    model,
    factor,
    provenance: normalizeProvenance(input.provenance, "resistanceConversion.provenance"),
    metadata: structuredClone(input.metadata ?? {}),
  };
}

export class LateralPileLoadScenario {
  schemaVersion: string;
  id: string;
  name: string;
  method: LateralPileCapacityMethod;
  soilBranch: LateralPileSoilBranch;
  headCondition: LateralPileHeadCondition;
  action: LateralPileAction;
  behaviorAssertion: LateralPileBehaviorAssertion;
  resistanceConversion: LateralPileResistanceConversion | null;
  units: typeof GEOTECHNICAL_INTERNAL_UNITS;
  metadata: SoilRecord;

  constructor({
    id,
    name = null,
    method = "broms-short-free-head",
    soilBranch,
    headCondition = "free-to-rotate",
    action = null,
    behaviorAssertion = null,
    resistanceConversion = null,
    units = null,
    metadata = {},
  }: LateralPileLoadScenarioOptions = {}) {
    if (!id) throw new Error("A LateralPileLoadScenario id is required.");
    if (!isLateralPileCapacityMethod(method)) {
      throw new Error(`Unsupported lateral pile capacity method: ${stringValue(method)}.`);
    }
    if (!isLateralPileSoilBranch(soilBranch)) {
      throw new Error(`Unsupported lateral pile soil branch: ${stringValue(soilBranch)}.`);
    }
    if (!isLateralPileHeadCondition(headCondition)) {
      throw new Error(`Unsupported lateral pile head condition: ${stringValue(headCondition)}.`);
    }
    assertExplicitUnitSystem(units, "LateralPileLoadScenario");
    const resolver = createUnitResolver(units, GEOTECHNICAL_INTERNAL_UNITS);

    this.schemaVersion = LATERAL_PILE_LOAD_SCENARIO_SCHEMA_VERSION;
    this.id = id;
    this.name = name ?? id;
    this.method = method;
    this.soilBranch = soilBranch;
    this.headCondition = headCondition;
    this.action = normalizeAction(action, resolver);
    this.behaviorAssertion = normalizeBehaviorAssertion(behaviorAssertion);
    this.resistanceConversion = normalizeResistanceConversion(resistanceConversion);
    this.units = GEOTECHNICAL_INTERNAL_UNITS;
    this.metadata = {
      ...structuredClone(metadata ?? {}),
      unitSystem: GEOTECHNICAL_INTERNAL_UNITS,
      sourceUnitSystem: resolver.sourceUnitSystem,
      signConvention: {
        lateralShear: "non-negative-magnitude-in-action-direction",
        overturningMoment: "non-negative-magnitude-acting-in-the-same-rotational-sense-as-shear",
      },
    };
  }

  toJSON(): LateralPileLoadScenarioJson {
    return {
      schemaVersion: this.schemaVersion,
      id: this.id,
      name: this.name,
      method: this.method,
      soilBranch: this.soilBranch,
      headCondition: this.headCondition,
      action: structuredClone(this.action),
      behaviorAssertion: structuredClone(this.behaviorAssertion),
      resistanceConversion: structuredClone(this.resistanceConversion),
      units: { ...this.units },
      metadata: structuredClone(this.metadata),
    };
  }
}
