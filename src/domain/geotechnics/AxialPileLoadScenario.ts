import {
  assertExplicitUnitSystem,
  createUnitResolver,
  type UnitResolver,
  type UnitSystem,
  type UnitSystemInput,
} from "../units/UnitSystem.js";
import { GEOTECHNICAL_INTERNAL_UNITS, type SoilRecord } from "./SoilMaterial.js";

export const AXIAL_PILE_LOAD_SCENARIO_SCHEMA_VERSION = "axial-pile-load-scenario/v1";
export const AXIAL_PILE_LOAD_DIRECTIONS = Object.freeze(["compression", "tension"]);
export const AXIAL_PILE_SHAFT_RESISTANCE_METHODS = Object.freeze([
  "alpha-undrained",
  "effective-stress",
  "assigned-unit-resistance",
]);
export const AXIAL_PILE_EFFECTIVE_STRESS_COEFFICIENT_MODELS = Object.freeze([
  "assigned-beta",
  "k-tan-delta",
]);
export const AXIAL_PILE_BASE_RESISTANCE_METHODS = Object.freeze([
  "undrained-nc",
  "effective-stress-nq",
  "assigned-unit-resistance",
]);
export const AXIAL_PILE_RESISTANCE_CONVERSION_MODELS = Object.freeze(["component-divisors"]);

export interface AxialPileLoadScenarioInput {
  id?: string;
  name?: string | null;
  direction?: string;
  action?: SoilRecord | null;
  surfaceSurcharge?: number;
  shaftResistanceByLayer?: Record<string, SoilRecord>;
  baseResistance?: SoilRecord | null;
  resistanceConversion?: SoilRecord | null;
  units?: UnitSystemInput | null;
  metadata?: SoilRecord;
}

function finite(value: unknown, label: string): number {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`${label} must be finite.`);
  return number;
}

function positive(value: unknown, label: string, { allowZero = false } = {}): number {
  const number = finite(value, label);
  if (allowZero ? number < 0 : number <= 0) {
    throw new Error(`${label} must be ${allowZero ? "non-negative" : "positive"}.`);
  }
  return number;
}

function provenance(value: unknown, label: string): SoilRecord {
  const normalized = structuredClone((value as SoilRecord | null | undefined) ?? {});
  if (typeof normalized.source !== "string" || !normalized.source.trim()) {
    throw new Error(`${label}.source is required.`);
  }
  normalized.source = normalized.source.trim();
  return normalized;
}

function optionalStress(value: unknown, resolver: UnitResolver, label: string): number | null {
  if (value == null) return null;
  return positive(resolver.stress(Number(value)), label);
}

function angle(value: unknown, units: unknown, label: string): number {
  const numeric = finite(value, label);
  const normalizedUnits =
    typeof units === "string" ? units.trim().toLowerCase() : Object.prototype.toString.call(units);
  const radians =
    normalizedUnits === "deg"
      ? (numeric * Math.PI) / 180
      : normalizedUnits === "rad"
        ? numeric
        : null;
  if (radians == null) {
    throw new Error(`${label} requires angleUnits equal to "deg" or "rad".`);
  }
  if (radians < 0 || radians >= Math.PI / 2) {
    throw new Error(`${label} must satisfy 0 <= angle < 90 degrees.`);
  }
  return radians;
}

function normalizeShaftMethod(
  input: SoilRecord,
  resolver: UnitResolver,
  layerId: string,
): SoilRecord {
  const label = `shaftResistanceByLayer.${layerId}`;
  const method = input.method;
  if (typeof method !== "string" || !AXIAL_PILE_SHAFT_RESISTANCE_METHODS.includes(method)) {
    throw new Error(`${label}.method is unsupported: ${String(method)}.`);
  }
  const common = {
    method,
    maximumUnitResistance: optionalStress(
      input.maximumUnitResistance,
      resolver,
      `${label}.maximumUnitResistance`,
    ),
    provenance: provenance(input.provenance, `${label}.provenance`),
    metadata: structuredClone((input.metadata as SoilRecord | undefined) ?? {}),
  };
  if (method === "alpha-undrained") {
    return {
      ...common,
      adhesionFactor: positive(input.adhesionFactor, `${label}.adhesionFactor`, {
        allowZero: true,
      }),
    };
  }
  if (method === "assigned-unit-resistance") {
    return {
      ...common,
      assignedUnitResistance: positive(
        resolver.stress(Number(input.assignedUnitResistance)),
        `${label}.assignedUnitResistance`,
        { allowZero: true },
      ),
    };
  }
  const coefficientModel =
    typeof input.coefficientModel === "string" ? input.coefficientModel : "assigned-beta";
  if (!AXIAL_PILE_EFFECTIVE_STRESS_COEFFICIENT_MODELS.includes(coefficientModel)) {
    throw new Error(`${label}.coefficientModel is unsupported: ${coefficientModel}.`);
  }
  let beta: number;
  let lateralEarthPressureCoefficient: number | null = null;
  let interfaceFrictionAngle: number | null = null;
  if (coefficientModel === "assigned-beta") {
    beta = positive(input.beta, `${label}.beta`, { allowZero: true });
  } else {
    lateralEarthPressureCoefficient = positive(
      input.lateralEarthPressureCoefficient,
      `${label}.lateralEarthPressureCoefficient`,
      { allowZero: true },
    );
    interfaceFrictionAngle = angle(
      input.interfaceFrictionAngle,
      input.angleUnits,
      `${label}.interfaceFrictionAngle`,
    );
    beta = lateralEarthPressureCoefficient * Math.tan(interfaceFrictionAngle);
  }
  return {
    ...common,
    coefficientModel,
    beta,
    lateralEarthPressureCoefficient,
    interfaceFrictionAngle,
    angleUnits: interfaceFrictionAngle == null ? null : "rad",
    maximumEffectiveVerticalStress: optionalStress(
      input.maximumEffectiveVerticalStress,
      resolver,
      `${label}.maximumEffectiveVerticalStress`,
    ),
  };
}

function normalizeBaseMethod(input: SoilRecord | null, resolver: UnitResolver): SoilRecord {
  if (!input) {
    throw new Error("baseResistance is required for compression.");
  }
  const label = "baseResistance";
  const method = input.method;
  if (typeof method !== "string" || !AXIAL_PILE_BASE_RESISTANCE_METHODS.includes(method)) {
    throw new Error(`${label}.method is unsupported: ${String(method)}.`);
  }
  if (typeof input.bearingLayerId !== "string" || !input.bearingLayerId) {
    throw new Error(`${label}.bearingLayerId is required.`);
  }
  const common = {
    method,
    bearingLayerId: input.bearingLayerId,
    maximumUnitResistance: optionalStress(
      input.maximumUnitResistance,
      resolver,
      `${label}.maximumUnitResistance`,
    ),
    provenance: provenance(input.provenance, `${label}.provenance`),
    metadata: structuredClone((input.metadata as SoilRecord | undefined) ?? {}),
  };
  if (method === "undrained-nc") {
    return {
      ...common,
      bearingCapacityFactor: positive(
        input.bearingCapacityFactor,
        `${label}.bearingCapacityFactor`,
      ),
    };
  }
  if (method === "effective-stress-nq") {
    return {
      ...common,
      bearingCapacityFactor: positive(
        input.bearingCapacityFactor,
        `${label}.bearingCapacityFactor`,
      ),
      maximumEffectiveVerticalStress: optionalStress(
        input.maximumEffectiveVerticalStress,
        resolver,
        `${label}.maximumEffectiveVerticalStress`,
      ),
    };
  }
  return {
    ...common,
    assignedUnitResistance: positive(
      resolver.stress(Number(input.assignedUnitResistance)),
      `${label}.assignedUnitResistance`,
      { allowZero: true },
    ),
  };
}

function normalizeAction(action: SoilRecord | null, resolver: UnitResolver): SoilRecord | null {
  if (action == null) return null;
  if (action.referencePoint !== "pile-head") {
    throw new Error("action.referencePoint must be pile-head.");
  }
  return {
    axialForce: positive(resolver.force(Number(action.axialForce)), "action.axialForce", {
      allowZero: true,
    }),
    basis:
      action.basis == null
        ? "assigned"
        : typeof action.basis === "string"
          ? action.basis
          : Object.prototype.toString.call(action.basis),
    referencePoint: "pile-head",
    includesPileSelfWeight: Boolean(action.includesPileSelfWeight),
    metadata: structuredClone((action.metadata as SoilRecord | undefined) ?? {}),
  };
}

function normalizeResistanceConversion(
  input: SoilRecord | null,
  direction: string,
): SoilRecord | null {
  if (input == null) return null;
  const model = typeof input.model === "string" ? input.model : "component-divisors";
  if (!AXIAL_PILE_RESISTANCE_CONVERSION_MODELS.includes(model)) {
    throw new Error(`Unsupported resistanceConversion.model: ${model}.`);
  }
  return {
    model,
    shaftDivisor: positive(input.shaftDivisor, "resistanceConversion.shaftDivisor"),
    baseDivisor:
      direction === "compression"
        ? positive(input.baseDivisor, "resistanceConversion.baseDivisor")
        : null,
    overallDivisor: positive(input.overallDivisor ?? 1, "resistanceConversion.overallDivisor"),
    provenance: provenance(input.provenance, "resistanceConversion.provenance"),
    metadata: structuredClone((input.metadata as SoilRecord | undefined) ?? {}),
  };
}

export class AxialPileLoadScenario {
  schemaVersion: string;
  id: string;
  name: string;
  direction: string;
  action: SoilRecord | null;
  surfaceSurcharge: number;
  shaftResistanceByLayer: Record<string, SoilRecord>;
  baseResistance: SoilRecord | null;
  resistanceConversion: SoilRecord | null;
  units: UnitSystem;
  metadata: SoilRecord;

  constructor({
    id,
    name = null,
    direction = "compression",
    action = null,
    surfaceSurcharge = 0,
    shaftResistanceByLayer = {},
    baseResistance = null,
    resistanceConversion = null,
    units = null,
    metadata = {},
  }: AxialPileLoadScenarioInput = {}) {
    if (!id) throw new Error("An AxialPileLoadScenario id is required.");
    if (!AXIAL_PILE_LOAD_DIRECTIONS.includes(direction)) {
      throw new Error(`Unsupported axial pile load direction: ${direction}.`);
    }
    assertExplicitUnitSystem(units, "AxialPileLoadScenario");
    const resolver = createUnitResolver(units, GEOTECHNICAL_INTERNAL_UNITS);
    const entries = Object.entries(shaftResistanceByLayer);
    if (entries.length === 0) {
      throw new Error("At least one shaft-resistance layer definition is required.");
    }
    if (direction === "tension" && baseResistance != null) {
      throw new Error("baseResistance must be omitted for tension scenarios.");
    }

    this.schemaVersion = AXIAL_PILE_LOAD_SCENARIO_SCHEMA_VERSION;
    this.id = id;
    this.name = name ?? id;
    this.direction = direction;
    this.action = normalizeAction(action, resolver);
    this.surfaceSurcharge = positive(
      resolver.stress(Number(surfaceSurcharge ?? 0)),
      "surfaceSurcharge",
      { allowZero: true },
    );
    this.shaftResistanceByLayer = Object.fromEntries(
      entries.map(([layerId, method]) => [
        layerId,
        normalizeShaftMethod(method, resolver, layerId),
      ]),
    );
    this.baseResistance =
      direction === "compression" ? normalizeBaseMethod(baseResistance, resolver) : null;
    this.resistanceConversion = normalizeResistanceConversion(resistanceConversion, direction);
    this.units = GEOTECHNICAL_INTERNAL_UNITS;
    this.metadata = {
      ...structuredClone(metadata),
      unitSystem: GEOTECHNICAL_INTERNAL_UNITS,
      sourceUnitSystem: resolver.sourceUnitSystem,
      signConvention: {
        axialForce: "non-negative-magnitude",
        direction: "stored-separately-as-compression-or-tension",
      },
    };
  }

  toJSON(): Record<string, unknown> {
    return {
      schemaVersion: this.schemaVersion,
      id: this.id,
      name: this.name,
      direction: this.direction,
      action: structuredClone(this.action),
      surfaceSurcharge: this.surfaceSurcharge,
      shaftResistanceByLayer: structuredClone(this.shaftResistanceByLayer),
      baseResistance: structuredClone(this.baseResistance),
      resistanceConversion: structuredClone(this.resistanceConversion),
      units: { ...this.units },
      metadata: structuredClone(this.metadata),
    };
  }
}
