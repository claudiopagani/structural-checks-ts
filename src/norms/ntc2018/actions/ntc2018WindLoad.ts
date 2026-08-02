// Mechanical TypeScript migration from strutture-js 6f33baead8b88166c4b2cf94af41763412e3c751;
// source path: src/norms/ntc2018/actions/ntc2018WindLoad.js.

import { CalculationResult } from "../../../core/results/CalculationResult.js";
import { AreaLoad } from "../../../domain/loads/AreaLoad.js";
import {
  assertExplicitUnitSystem,
  createUnitResolver,
  type UnitSystem,
  type UnitSystemInput,
} from "../../../domain/units/UnitSystem.js";
import { createNTC2018WindAction } from "./createNTC2018Action.js";

const INTERNAL_UNITS = Object.freeze({ force: "kN", length: "m" }) satisfies UnitSystem;
const VELOCITY_UNIT = "m/s";
const AIR_DENSITY_KG_PER_CUBIC_METRE = 1.25;
const MAXIMUM_ZONAL_ALTITUDE = 1500;
const MAXIMUM_EXPOSURE_HEIGHT = 200;

type JsonRecord = Record<string, unknown>;
type ReadonlyJsonRecord = Readonly<Record<string, unknown>>;

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

type DefinitionWithId<TDefinition extends Record<string, unknown>> = Readonly<
  TDefinition & { id: string }
>;

function freezeDefinitions<TDefinition extends Record<string, unknown>>(
  definitions: Record<string, TDefinition>,
): Readonly<Record<string, DefinitionWithId<TDefinition>>> {
  const entries: Array<[string, DefinitionWithId<TDefinition>]> = Object.entries(definitions).map(
    ([id, definition]) => [id, Object.freeze({ id, ...definition })],
  );
  return Object.freeze(Object.fromEntries(entries));
}

export const NTC2018_WIND_REFERENCES = Object.freeze({
  baseSpeed:
    "D.M. 17/01/2018, NTC 2018, section 3.3.1, equations [3.3.1] and [3.3.1.b], Table 3.3.I",
  referenceSpeed: "D.M. 17/01/2018, NTC 2018, section 3.3.2, equations [3.3.2] and [3.3.3]",
  pressure: "D.M. 17/01/2018, NTC 2018, section 3.3.4, equation [3.3.4]",
  kineticPressure: "D.M. 17/01/2018, NTC 2018, section 3.3.6, equation [3.3.6]",
  exposure: "D.M. 17/01/2018, NTC 2018, section 3.3.7, equation [3.3.7], Table 3.3.II",
  aerodynamicCoefficients: "D.M. 17/01/2018, NTC 2018, section 3.3.8",
  dynamicCoefficient: "D.M. 17/01/2018, NTC 2018, section 3.3.9",
  combinationFactors: "D.M. 17/01/2018, NTC 2018, section 2.5.2, Table 2.5.I",
});

export interface Ntc2018WindZoneDefinition extends Record<string, unknown> {
  id: string;
  description: string;
  baseSeaLevelSpeed: number;
  referenceAltitude: number;
  altitudeCoefficient: number;
}

export const NTC2018_WIND_ZONES: Readonly<Record<string, Ntc2018WindZoneDefinition>> =
  freezeDefinitions({
    ZONE_1: {
      description: "Zona 1",
      baseSeaLevelSpeed: 25,
      referenceAltitude: 1000,
      altitudeCoefficient: 0.4,
    },
    ZONE_2: {
      description: "Zona 2",
      baseSeaLevelSpeed: 25,
      referenceAltitude: 750,
      altitudeCoefficient: 0.45,
    },
    ZONE_3: {
      description: "Zona 3",
      baseSeaLevelSpeed: 27,
      referenceAltitude: 500,
      altitudeCoefficient: 0.37,
    },
    ZONE_4: {
      description: "Zona 4",
      baseSeaLevelSpeed: 28,
      referenceAltitude: 500,
      altitudeCoefficient: 0.36,
    },
    ZONE_5: {
      description: "Zona 5",
      baseSeaLevelSpeed: 28,
      referenceAltitude: 750,
      altitudeCoefficient: 0.4,
    },
    ZONE_6: {
      description: "Zona 6",
      baseSeaLevelSpeed: 28,
      referenceAltitude: 500,
      altitudeCoefficient: 0.36,
    },
    ZONE_7: {
      description: "Zona 7",
      baseSeaLevelSpeed: 28,
      referenceAltitude: 1000,
      altitudeCoefficient: 0.54,
    },
    ZONE_8: {
      description: "Zona 8",
      baseSeaLevelSpeed: 30,
      referenceAltitude: 1500,
      altitudeCoefficient: 0.5,
    },
    ZONE_9: {
      description: "Zona 9",
      baseSeaLevelSpeed: 31,
      referenceAltitude: 500,
      altitudeCoefficient: 0.32,
    },
  });

export interface Ntc2018WindExposureCategoryDefinition extends Record<string, unknown> {
  id: string;
  roughnessFactor: number;
  roughnessLength: number;
  minimumHeight: number;
}

export const NTC2018_WIND_EXPOSURE_CATEGORIES: Readonly<
  Record<string, Ntc2018WindExposureCategoryDefinition>
> = freezeDefinitions({
  I: {
    roughnessFactor: 0.17,
    roughnessLength: 0.01,
    minimumHeight: 2,
  },
  II: {
    roughnessFactor: 0.19,
    roughnessLength: 0.05,
    minimumHeight: 4,
  },
  III: {
    roughnessFactor: 0.2,
    roughnessLength: 0.1,
    minimumHeight: 5,
  },
  IV: {
    roughnessFactor: 0.22,
    roughnessLength: 0.3,
    minimumHeight: 8,
  },
  V: {
    roughnessFactor: 0.23,
    roughnessLength: 0.7,
    minimumHeight: 12,
  },
});

function cloneRecord(value: ReadonlyJsonRecord): JsonRecord {
  const serialized = JSON.stringify(value);
  if (serialized === undefined) {
    throw new Error("Unable to clone a non-serializable value.");
  }
  const parsed: unknown = JSON.parse(serialized);
  if (!isRecord(parsed)) {
    throw new Error("Expected a serializable object.");
  }
  return parsed;
}

function finiteNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number.`);
  }

  return value;
}

function finiteNonNegative(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be a finite non-negative number.`);
  }

  return value;
}

function finitePositive(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be a finite positive number.`);
  }

  return value;
}

function nonEmptyString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${label} must be a non-empty string.`);
  }

  return value.trim();
}

function optionalBoolean(value: unknown, label: string): boolean | null | undefined {
  if (value != null && typeof value !== "boolean") {
    throw new Error(`${label} must be a boolean when provided.`);
  }

  return value;
}

function assertVelocityUnit(value: unknown, label = "velocityUnit"): "m/s" {
  if (value !== VELOCITY_UNIT) {
    throw new Error(`${label} must be '${VELOCITY_UNIT}'.`);
  }

  return VELOCITY_UNIT;
}

function windZoneDefinition(zone: unknown): Ntc2018WindZoneDefinition {
  const definition = typeof zone === "string" ? NTC2018_WIND_ZONES[zone] : undefined;
  if (!definition) {
    throw new Error(`Unsupported NTC 2018 wind zone: ${String(zone)}.`);
  }

  return definition;
}

function exposureCategoryDefinition(
  exposureCategory: unknown,
): Ntc2018WindExposureCategoryDefinition {
  const definition =
    typeof exposureCategory === "string"
      ? NTC2018_WIND_EXPOSURE_CATEGORIES[exposureCategory]
      : undefined;
  if (!definition) {
    throw new Error(`Unsupported NTC 2018 wind exposure category: ${String(exposureCategory)}.`);
  }

  return definition;
}

export function getNTC2018WindZoneDefinition(zone: unknown): JsonRecord {
  return cloneRecord(windZoneDefinition(zone));
}

export function getNTC2018WindExposureCategoryDefinition(exposureCategory: unknown): JsonRecord {
  return cloneRecord(exposureCategoryDefinition(exposureCategory));
}

interface ZonalBaseWindSpeed {
  altitudeFactor: number;
  value: number;
}

function zonalBaseWindSpeed(
  definition: Ntc2018WindZoneDefinition,
  altitude: number,
): ZonalBaseWindSpeed {
  const altitudeFactor =
    altitude <= definition.referenceAltitude
      ? 1
      : 1 + definition.altitudeCoefficient * (altitude / definition.referenceAltitude - 1);

  return {
    altitudeFactor,
    value: definition.baseSeaLevelSpeed * altitudeFactor,
  };
}

export interface CalculateNTC2018BaseWindSpeedOptions {
  zone?: unknown;
  siteAltitude?: number | null;
  baseWindSpeed?: number | null;
  baseWindSpeedUnit?: string | null;
  baseWindSpeedSource?: string | null;
  units?: UnitSystemInput | null;
}

export interface Ntc2018BaseWindSpeedResult {
  zone: unknown;
  zoneDescription: string;
  siteAltitude: number;
  value: number;
  velocityUnit: "m/s";
  formula: string;
  operands: Record<string, number>;
  reference: string;
  metadata: {
    source: string;
    sourceReference?: string;
    sourceUnitSystem: UnitSystem;
    [key: string]: unknown;
  };
}

export function calculateNTC2018BaseWindSpeed({
  zone,
  siteAltitude,
  baseWindSpeed = null,
  baseWindSpeedUnit = null,
  baseWindSpeedSource = null,
  units = null,
}: CalculateNTC2018BaseWindSpeedOptions = {}): Ntc2018BaseWindSpeedResult {
  const sourceUnits = assertExplicitUnitSystem(units, "calculateNTC2018BaseWindSpeed");
  const resolver = createUnitResolver(sourceUnits, INTERNAL_UNITS);
  const altitude = finiteNonNegative(resolver.length(siteAltitude), "siteAltitude");
  const definition = windZoneDefinition(zone);
  const minimumAltitude = Math.min(altitude, MAXIMUM_ZONAL_ALTITUDE);
  const minimum = zonalBaseWindSpeed(definition, minimumAltitude);

  if (baseWindSpeed == null) {
    if (altitude > MAXIMUM_ZONAL_ALTITUDE) {
      throw new RangeError(
        "The NTC 2018 zonal base-wind formula is not applicable above 1500 m; documented local climate and exposure data are required.",
      );
    }

    return {
      zone,
      zoneDescription: definition.description,
      siteAltitude: altitude,
      value: minimum.value,
      velocityUnit: VELOCITY_UNIT,
      formula:
        altitude <= definition.referenceAltitude
          ? "vb = vb0"
          : "vb = vb0 * {1 + ks * [(siteAltitude / a0) - 1]}",
      operands: {
        baseSeaLevelSpeed: definition.baseSeaLevelSpeed,
        altitudeFactor: minimum.altitudeFactor,
        referenceAltitude: definition.referenceAltitude,
        altitudeCoefficient: definition.altitudeCoefficient,
        siteAltitude: altitude,
      },
      reference: NTC2018_WIND_REFERENCES.baseSpeed,
      metadata: {
        source: "ntc2018-zonal-minimum",
        sourceUnitSystem: sourceUnits,
      },
    };
  }

  assertVelocityUnit(baseWindSpeedUnit, "baseWindSpeedUnit");
  const documentedValue = finitePositive(baseWindSpeed, "baseWindSpeed");
  const sourceReference = nonEmptyString(baseWindSpeedSource, "baseWindSpeedSource");
  if (documentedValue < minimum.value) {
    throw new Error(
      `baseWindSpeed must not be lower than the NTC 2018 minimum ${minimum.value} m/s.`,
    );
  }

  return {
    zone,
    zoneDescription: definition.description,
    siteAltitude: altitude,
    value: documentedValue,
    velocityUnit: VELOCITY_UNIT,
    formula: "vb = documented explicit value",
    operands: {
      documentedValue,
      ntc2018Minimum: minimum.value,
      minimumEvaluationAltitude: minimumAltitude,
    },
    reference: NTC2018_WIND_REFERENCES.baseSpeed,
    metadata: {
      source: "documented-explicit-value",
      sourceReference,
      sourceUnitSystem: sourceUnits,
    },
  };
}

export interface CalculateNTC2018WindReturnCoefficientOptions {
  returnPeriodYears?: number | null;
}

export interface Ntc2018WindReturnCoefficientResult {
  returnPeriodYears: number;
  value: number;
  formula: string;
  reference: string;
}

export function calculateNTC2018WindReturnCoefficient({
  returnPeriodYears = 50,
}: CalculateNTC2018WindReturnCoefficientOptions = {}): Ntc2018WindReturnCoefficientResult {
  const period = finitePositive(returnPeriodYears, "returnPeriodYears");
  if (period < 5) {
    throw new Error("returnPeriodYears must be at least 5 years.");
  }

  const value = period === 50 ? 1 : 0.75 * Math.sqrt(1 - 0.2 * Math.log(-Math.log(1 - 1 / period)));

  return {
    returnPeriodYears: period,
    value,
    formula:
      period === 50
        ? "cr = 1 for TR = 50 years"
        : "cr = 0.75 * sqrt{1 - 0.2 * ln[-ln(1 - 1 / TR)]}",
    reference: NTC2018_WIND_REFERENCES.referenceSpeed,
  };
}

export interface CalculateNTC2018ReferenceWindSpeedOptions {
  baseWindSpeed?: number | null;
  returnPeriodYears?: number | null;
  velocityUnit?: string | null;
}

export interface Ntc2018ReferenceWindSpeedResult {
  value: number;
  velocityUnit: "m/s";
  formula: string;
  operands: {
    baseWindSpeed: number;
    returnCoefficient: number;
    returnPeriodYears: number;
  };
  reference: string;
}

export function calculateNTC2018ReferenceWindSpeed({
  baseWindSpeed,
  returnPeriodYears = 50,
  velocityUnit = null,
}: CalculateNTC2018ReferenceWindSpeedOptions = {}): Ntc2018ReferenceWindSpeedResult {
  assertVelocityUnit(velocityUnit);
  const baseSpeed = finitePositive(baseWindSpeed, "baseWindSpeed");
  const returnCoefficient = calculateNTC2018WindReturnCoefficient({
    returnPeriodYears,
  });

  return {
    value: baseSpeed * returnCoefficient.value,
    velocityUnit: VELOCITY_UNIT,
    formula: "vr = vb * cr",
    operands: {
      baseWindSpeed: baseSpeed,
      returnCoefficient: returnCoefficient.value,
      returnPeriodYears: returnCoefficient.returnPeriodYears,
    },
    reference: NTC2018_WIND_REFERENCES.referenceSpeed,
  };
}

export interface CalculateNTC2018ReferenceWindPressureOptions {
  referenceWindSpeed?: number | null;
  velocityUnit?: string | null;
}

export interface Ntc2018ReferenceWindPressureResult {
  value: number;
  quantity: "area-load";
  formula: string;
  operands: {
    referenceWindSpeed: number;
    velocityUnit: "m/s";
    airDensity: number;
    airDensityUnit: "kg/m^3";
  };
  units: UnitSystem;
  reference: string;
}

export function calculateNTC2018ReferenceWindPressure({
  referenceWindSpeed,
  velocityUnit = null,
}: CalculateNTC2018ReferenceWindPressureOptions = {}): Ntc2018ReferenceWindPressureResult {
  assertVelocityUnit(velocityUnit);
  const speed = finitePositive(referenceWindSpeed, "referenceWindSpeed");
  const pressureInNewtonsPerSquareMetre = 0.5 * AIR_DENSITY_KG_PER_CUBIC_METRE * speed ** 2;

  return {
    value: pressureInNewtonsPerSquareMetre / 1000,
    quantity: "area-load",
    formula: "qr = 0.5 * airDensity * referenceWindSpeed^2",
    operands: {
      referenceWindSpeed: speed,
      velocityUnit: VELOCITY_UNIT,
      airDensity: AIR_DENSITY_KG_PER_CUBIC_METRE,
      airDensityUnit: "kg/m^3",
    },
    units: { ...INTERNAL_UNITS },
    reference: NTC2018_WIND_REFERENCES.kineticPressure,
  };
}

export interface CalculateNTC2018WindExposureCoefficientOptions {
  exposureCategory?: unknown;
  heightAboveGround?: number | null;
  topographyCoefficient?: number | null;
  units?: UnitSystemInput | null;
}

export interface Ntc2018WindExposureCoefficientResult {
  exposureCategory: unknown;
  heightAboveGround: number;
  effectiveHeight: number;
  minimumHeightApplied: boolean;
  value: number;
  formula: string;
  operands: Record<string, number>;
  reference: string;
  metadata: {
    sourceUnitSystem: UnitSystem;
    unitSystem: UnitSystem;
    [key: string]: unknown;
  };
}

export function calculateNTC2018WindExposureCoefficient({
  exposureCategory,
  heightAboveGround,
  topographyCoefficient = 1,
  units = null,
}: CalculateNTC2018WindExposureCoefficientOptions = {}): Ntc2018WindExposureCoefficientResult {
  const sourceUnits = assertExplicitUnitSystem(units, "calculateNTC2018WindExposureCoefficient");
  const resolver = createUnitResolver(sourceUnits, INTERNAL_UNITS);
  const height = finiteNonNegative(resolver.length(heightAboveGround), "heightAboveGround");
  if (height > MAXIMUM_EXPOSURE_HEIGHT) {
    throw new RangeError(
      "The NTC 2018 nominal exposure formula is limited to heights not exceeding 200 m.",
    );
  }

  const definition = exposureCategoryDefinition(exposureCategory);
  const ct = finitePositive(topographyCoefficient, "topographyCoefficient");
  const effectiveHeight = Math.max(height, definition.minimumHeight);
  const logarithmicTerm = Math.log(effectiveHeight / definition.roughnessLength);
  const value = definition.roughnessFactor ** 2 * ct * logarithmicTerm * (7 + ct * logarithmicTerm);

  return {
    exposureCategory,
    heightAboveGround: height,
    effectiveHeight,
    minimumHeightApplied: effectiveHeight !== height,
    value,
    formula: "ce = kr^2 * ct * ln(z / z0) * [7 + ct * ln(z / z0)]",
    operands: {
      roughnessFactor: definition.roughnessFactor,
      roughnessLength: definition.roughnessLength,
      minimumHeight: definition.minimumHeight,
      topographyCoefficient: ct,
      logarithmicTerm,
    },
    reference: NTC2018_WIND_REFERENCES.exposure,
    metadata: {
      sourceUnitSystem: sourceUnits,
      unitSystem: { ...INTERNAL_UNITS },
    },
  };
}

export interface CalculateNTC2018WindPressureOptions {
  referenceWindPressure?: number | null;
  exposureCoefficient?: number | null;
  pressureCoefficient?: number | null;
  dynamicCoefficient?: number | null;
  units?: UnitSystemInput | null;
}

export interface Ntc2018WindPressureResult {
  value: number;
  quantity: "area-load";
  formula: string;
  operands: {
    referenceWindPressure: number;
    exposureCoefficient: number;
    pressureCoefficient: number;
    dynamicCoefficient: number;
  };
  applicationDirection: "surface-normal";
  signConvention: "positive-pressure-negative-suction";
  units: UnitSystem;
  reference: string;
  metadata: {
    sourceUnitSystem: UnitSystem;
    unitSystem: UnitSystem;
    [key: string]: unknown;
  };
}

export function calculateNTC2018WindPressure({
  referenceWindPressure,
  exposureCoefficient,
  pressureCoefficient,
  dynamicCoefficient,
  units = null,
}: CalculateNTC2018WindPressureOptions = {}): Ntc2018WindPressureResult {
  const sourceUnits = assertExplicitUnitSystem(units, "calculateNTC2018WindPressure");
  const resolver = createUnitResolver(sourceUnits, INTERNAL_UNITS);
  const qr = finiteNonNegative(resolver.areaLoad(referenceWindPressure), "referenceWindPressure");
  const ce = finitePositive(exposureCoefficient, "exposureCoefficient");
  const cp = finiteNumber(pressureCoefficient, "pressureCoefficient");
  const cd = finitePositive(dynamicCoefficient, "dynamicCoefficient");

  return {
    value: qr * ce * cp * cd,
    quantity: "area-load",
    formula:
      "p = referenceWindPressure * exposureCoefficient * pressureCoefficient * dynamicCoefficient",
    operands: {
      referenceWindPressure: qr,
      exposureCoefficient: ce,
      pressureCoefficient: cp,
      dynamicCoefficient: cd,
    },
    applicationDirection: "surface-normal",
    signConvention: "positive-pressure-negative-suction",
    units: { ...INTERNAL_UNITS },
    reference: NTC2018_WIND_REFERENCES.pressure,
    metadata: {
      sourceUnitSystem: sourceUnits,
      unitSystem: { ...INTERNAL_UNITS },
    },
  };
}

interface ResolveExposureOptions {
  exposureCategory: unknown;
  exposureCoefficient: number | null;
  exposureCoefficientSource: string | null;
  heightAboveGround: number;
  topographyCoefficient: number | null;
  topographyCoefficientSource: string | null;
  sourceUnits: UnitSystem;
}

type ExposureResolution =
  | { supported: false; reason: "exposure-height-above-200m" }
  | {
      supported: true;
      exposure: ResolvedExposure;
    };

interface ResolvedExposure {
  exposureCategory: unknown;
  heightAboveGround: number;
  effectiveHeight?: number;
  minimumHeightApplied?: boolean;
  value: number;
  formula?: string;
  operands?: Record<string, number>;
  source: string;
  sourceReference?: string;
  topographyCoefficientSource?: string;
  reference: string;
  metadata?: JsonRecord;
}

function resolveExposure({
  exposureCategory,
  exposureCoefficient,
  exposureCoefficientSource,
  heightAboveGround,
  topographyCoefficient,
  topographyCoefficientSource,
  sourceUnits,
}: ResolveExposureOptions): ExposureResolution {
  const hasCategory = exposureCategory != null;
  const hasExplicitValue = exposureCoefficient != null;
  if (hasCategory === hasExplicitValue) {
    throw new Error("Provide exactly one of exposureCategory or exposureCoefficient.");
  }

  if (hasExplicitValue) {
    if (topographyCoefficient != null || topographyCoefficientSource != null) {
      throw new Error(
        "topographyCoefficient must be omitted when exposureCoefficient is provided explicitly.",
      );
    }

    return {
      supported: true,
      exposure: {
        exposureCategory: null,
        heightAboveGround,
        value: finitePositive(exposureCoefficient, "exposureCoefficient"),
        source: "documented-explicit-value",
        sourceReference: nonEmptyString(exposureCoefficientSource, "exposureCoefficientSource"),
        reference: NTC2018_WIND_REFERENCES.exposure,
      },
    };
  }

  exposureCategoryDefinition(exposureCategory);
  if (heightAboveGround > MAXIMUM_EXPOSURE_HEIGHT) {
    return {
      supported: false,
      reason: "exposure-height-above-200m",
    };
  }

  const ct = finitePositive(topographyCoefficient ?? 1, "topographyCoefficient");
  const topographySource =
    ct === 1
      ? "ntc2018-general-value"
      : nonEmptyString(topographyCoefficientSource, "topographyCoefficientSource");
  const exposure = calculateNTC2018WindExposureCoefficient({
    exposureCategory,
    heightAboveGround,
    topographyCoefficient: ct,
    units: INTERNAL_UNITS,
  });

  return {
    supported: true,
    exposure: {
      ...exposure,
      source: "ntc2018-exposure-category",
      topographyCoefficientSource: topographySource,
      metadata: {
        ...exposure.metadata,
        sourceUnitSystem: sourceUnits,
      },
    },
  };
}

interface ResolveDynamicCoefficientOptions {
  dynamicCoefficient: number | null;
  dynamicCoefficientSource: string | null;
  regularConstruction: boolean | null;
  constructionHeight: number;
}

type DynamicResolution =
  | {
      supported: false;
      reason: "construction-not-declared-regular" | "construction-height-above-80m";
    }
  | { supported: true; dynamic: ResolvedDynamicCoefficient };

interface ResolvedDynamicCoefficient {
  value: number;
  source: string;
  sourceReference: string | null;
  reference: string;
}

function resolveDynamicCoefficient({
  dynamicCoefficient,
  dynamicCoefficientSource,
  regularConstruction,
  constructionHeight,
}: ResolveDynamicCoefficientOptions): DynamicResolution {
  optionalBoolean(regularConstruction, "regularConstruction");
  if (dynamicCoefficient != null) {
    return {
      supported: true,
      dynamic: {
        value: finitePositive(dynamicCoefficient, "dynamicCoefficient"),
        source: "documented-explicit-value",
        sourceReference: nonEmptyString(dynamicCoefficientSource, "dynamicCoefficientSource"),
        reference: NTC2018_WIND_REFERENCES.dynamicCoefficient,
      },
    };
  }

  if (regularConstruction !== true || constructionHeight > 80) {
    return {
      supported: false,
      reason:
        regularConstruction !== true
          ? "construction-not-declared-regular"
          : "construction-height-above-80m",
    };
  }

  return {
    supported: true,
    dynamic: {
      value: 1,
      source: "ntc2018-conservative-regular-construction-value",
      sourceReference: null,
      reference: NTC2018_WIND_REFERENCES.dynamicCoefficient,
    },
  };
}

function notSupportedWindResult({
  summary,
  warning,
  outputs,
  sourceUnits,
}: {
  summary: string;
  warning: string;
  outputs: JsonRecord;
  sourceUnits: UnitSystem;
}): CalculationResult {
  return new CalculationResult({
    applicationId: "ntc2018-wind-area-load",
    status: "not-supported",
    summary,
    outputs: {
      schemaVersion: "ntc2018-wind-area-load/v1",
      units: { ...INTERNAL_UNITS },
      velocityUnit: VELOCITY_UNIT,
      ...outputs,
    },
    warnings: [warning],
    assumptions: [],
    metadata: {
      method: "ntc2018-wind-area-load",
      normativePreset: "NTC2018",
      references: { ...NTC2018_WIND_REFERENCES },
      unitSystem: { ...INTERNAL_UNITS },
      sourceUnitSystem: sourceUnits,
    },
  });
}

export interface CalculateNTC2018WindAreaLoadOptions {
  id?: string | null;
  actionId?: string | null;
  name?: string | null;
  zone?: unknown;
  siteAltitude?: number | null;
  baseWindSpeed?: number | null;
  baseWindSpeedUnit?: string | null;
  baseWindSpeedSource?: string | null;
  returnPeriodYears?: number | null;
  exposureCategory?: unknown;
  heightAboveGround?: number | null;
  exposureCoefficient?: number | null;
  exposureCoefficientSource?: string | null;
  topographyCoefficient?: number | null;
  topographyCoefficientSource?: string | null;
  pressureCoefficient?: number | null;
  pressureCoefficientSource?: string | null;
  constructionHeight?: number | null;
  regularConstruction?: boolean | null;
  dynamicCoefficient?: number | null;
  dynamicCoefficientSource?: string | null;
  units?: UnitSystemInput | null;
}

export function calculateNTC2018WindAreaLoad({
  id = "NTC2018-WIND-LOAD",
  actionId = "NTC2018-WIND",
  name = "NTC 2018 wind pressure",
  zone,
  siteAltitude,
  baseWindSpeed = null,
  baseWindSpeedUnit = null,
  baseWindSpeedSource = null,
  returnPeriodYears = 50,
  exposureCategory = null,
  heightAboveGround,
  exposureCoefficient = null,
  exposureCoefficientSource = null,
  topographyCoefficient = null,
  topographyCoefficientSource = null,
  pressureCoefficient,
  pressureCoefficientSource,
  constructionHeight,
  regularConstruction = null,
  dynamicCoefficient = null,
  dynamicCoefficientSource = null,
  units = null,
}: CalculateNTC2018WindAreaLoadOptions = {}): CalculationResult {
  const loadId = nonEmptyString(id, "id");
  const normalizedActionId = nonEmptyString(actionId, "actionId");
  const sourceUnits = assertExplicitUnitSystem(units, "calculateNTC2018WindAreaLoad");
  const resolver = createUnitResolver(sourceUnits, INTERNAL_UNITS);
  const altitude = finiteNonNegative(resolver.length(siteAltitude), "siteAltitude");
  const evaluationHeight = finiteNonNegative(
    resolver.length(heightAboveGround),
    "heightAboveGround",
  );
  const normalizedConstructionHeight = finitePositive(
    resolver.length(constructionHeight),
    "constructionHeight",
  );
  if (evaluationHeight > normalizedConstructionHeight) {
    throw new Error("heightAboveGround must not exceed constructionHeight.");
  }
  windZoneDefinition(zone);

  if (altitude > MAXIMUM_ZONAL_ALTITUDE && baseWindSpeed == null) {
    const minimumBaseWindSpeed = calculateNTC2018BaseWindSpeed({
      zone,
      siteAltitude: MAXIMUM_ZONAL_ALTITUDE,
      units: INTERNAL_UNITS,
    });
    return notSupportedWindResult({
      summary: "The NTC 2018 zonal formula does not determine base wind speed above 1500 m.",
      warning:
        "Provide a documented local base wind speed not lower than the NTC 2018 value evaluated at 1500 m.",
      outputs: {
        zone: cloneRecord(windZoneDefinition(zone)),
        siteAltitude: altitude,
        minimumBaseWindSpeedAt1500m: minimumBaseWindSpeed,
      },
      sourceUnits,
    });
  }

  const base = calculateNTC2018BaseWindSpeed({
    zone,
    siteAltitude: altitude,
    baseWindSpeed,
    baseWindSpeedUnit,
    baseWindSpeedSource,
    units: INTERNAL_UNITS,
  });
  base.metadata.sourceUnitSystem = sourceUnits;
  const referenceSpeed = calculateNTC2018ReferenceWindSpeed({
    baseWindSpeed: base.value,
    returnPeriodYears,
    velocityUnit: VELOCITY_UNIT,
  });
  const referencePressure = calculateNTC2018ReferenceWindPressure({
    referenceWindSpeed: referenceSpeed.value,
    velocityUnit: VELOCITY_UNIT,
  });
  const exposureResolution = resolveExposure({
    exposureCategory,
    exposureCoefficient,
    exposureCoefficientSource,
    heightAboveGround: evaluationHeight,
    topographyCoefficient,
    topographyCoefficientSource,
    sourceUnits,
  });
  if (!exposureResolution.supported) {
    return notSupportedWindResult({
      summary: "The NTC 2018 nominal exposure formula is limited to heights not exceeding 200 m.",
      warning: "Provide a documented exposure coefficient for the evaluation height.",
      outputs: {
        zone: cloneRecord(windZoneDefinition(zone)),
        siteAltitude: altitude,
        heightAboveGround: evaluationHeight,
        baseWindSpeed: base,
        referenceWindSpeed: referenceSpeed,
        referenceWindPressure: referencePressure,
      },
      sourceUnits,
    });
  }

  const dynamicResolution = resolveDynamicCoefficient({
    dynamicCoefficient,
    dynamicCoefficientSource,
    regularConstruction,
    constructionHeight: normalizedConstructionHeight,
  });
  if (!dynamicResolution.supported) {
    return notSupportedWindResult({
      summary: "The nominal dynamic coefficient is not applicable to the declared construction.",
      warning: "Provide a dynamic coefficient from a documented analysis or reliable source.",
      outputs: {
        zone: cloneRecord(windZoneDefinition(zone)),
        siteAltitude: altitude,
        constructionHeight: normalizedConstructionHeight,
        dynamicCoefficientReason: dynamicResolution.reason,
        baseWindSpeed: base,
        referenceWindSpeed: referenceSpeed,
        referenceWindPressure: referencePressure,
        exposureCoefficient: exposureResolution.exposure,
      },
      sourceUnits,
    });
  }

  const cp = finiteNumber(pressureCoefficient, "pressureCoefficient");
  const cpSource = nonEmptyString(pressureCoefficientSource, "pressureCoefficientSource");
  const windPressure = calculateNTC2018WindPressure({
    referenceWindPressure: referencePressure.value,
    exposureCoefficient: exposureResolution.exposure.value,
    pressureCoefficient: cp,
    dynamicCoefficient: dynamicResolution.dynamic.value,
    units: INTERNAL_UNITS,
  });
  const action = createNTC2018WindAction({
    id: normalizedActionId,
    name,
    metadata: {
      siteAltitude: altitude,
      returnPeriodYears: referenceSpeed.operands.returnPeriodYears,
      reference: NTC2018_WIND_REFERENCES.combinationFactors,
    },
  });
  const load = new AreaLoad({
    id: loadId,
    name,
    type: "wind-area",
    direction: "surface-normal",
    referenceSystem: "local",
    intensity: windPressure.value,
    action,
    units: INTERNAL_UNITS,
    metadata: {
      signConvention: windPressure.signConvention,
      formula: windPressure.formula,
      operands: windPressure.operands,
      baseWindSpeedSource: base.metadata.source,
      exposureCoefficientSource: exposureResolution.exposure.source,
      pressureCoefficientSource: cpSource,
      dynamicCoefficientSource: dynamicResolution.dynamic.source,
      sourceUnitSystem: sourceUnits,
    },
  });

  return new CalculationResult({
    applicationId: "ntc2018-wind-area-load",
    status: "ok",
    summary: "Calculated the NTC 2018 static-equivalent wind pressure on a surface.",
    outputs: {
      schemaVersion: "ntc2018-wind-area-load/v1",
      units: { ...INTERNAL_UNITS },
      velocityUnit: VELOCITY_UNIT,
      zone: cloneRecord(windZoneDefinition(zone)),
      siteAltitude: altitude,
      heightAboveGround: evaluationHeight,
      constructionHeight: normalizedConstructionHeight,
      baseWindSpeed: base,
      referenceWindSpeed: referenceSpeed,
      referenceWindPressure: referencePressure,
      exposureCoefficient: exposureResolution.exposure,
      pressureCoefficient: {
        value: cp,
        source: "documented-explicit-value",
        sourceReference: cpSource,
        reference: NTC2018_WIND_REFERENCES.aerodynamicCoefficients,
      },
      dynamicCoefficient: dynamicResolution.dynamic,
      windPressure,
      action: action.toJSON(),
      load: load.toJSON(),
    },
    warnings: [
      "The pressure coefficient is accepted as documented input; geometry-dependent aerodynamic derivation is not performed.",
    ],
    assumptions: [
      "Wind is treated as a static-equivalent action normal to the selected surface.",
      "The site wind zone and exposure category are explicit caller decisions; no geographic lookup is performed.",
      ...(topographyCoefficient == null && exposureCoefficient == null
        ? ["The topography coefficient ct is 1 according to the NTC 2018 general value."]
        : []),
      ...(dynamicCoefficient == null
        ? [
            "The dynamic coefficient cd is 1 for the declared regular construction not exceeding 80 m.",
          ]
        : []),
    ],
    metadata: {
      method: "ntc2018-wind-area-load",
      normativePreset: "NTC2018",
      references: { ...NTC2018_WIND_REFERENCES },
      unitSystem: { ...INTERNAL_UNITS },
      sourceUnitSystem: sourceUnits,
    },
  });
}
