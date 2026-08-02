// Mechanical TypeScript migration from strutture-js 6f33baead8b88166c4b2cf94af41763412e3c751;
// source path: src/norms/ntc2018/actions/ntc2018SnowLoad.js.

import { CalculationResult } from "../../../core/results/CalculationResult.js";
import { AreaLoad } from "../../../domain/loads/AreaLoad.js";
import {
  assertExplicitUnitSystem,
  createUnitResolver,
  type UnitSystem,
  type UnitSystemInput,
} from "../../../domain/units/UnitSystem.js";
import { createNTC2018SnowAction } from "./createNTC2018Action.js";

const INTERNAL_UNITS = Object.freeze({ force: "kN", length: "m" }) satisfies UnitSystem;
const MAXIMUM_TABULATED_ALTITUDE = 1500;

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

export const NTC2018_SNOW_REFERENCES = Object.freeze({
  roofLoad: "D.M. 17/01/2018, NTC 2018, section 3.4.1, equation [3.4.1]",
  groundLoad: "D.M. 17/01/2018, NTC 2018, section 3.4.2, equations [3.4.2]-[3.4.5]",
  shapeCoefficient: "D.M. 17/01/2018, NTC 2018, section 3.4.3, Table 3.4.II",
  exposureCoefficient: "D.M. 17/01/2018, NTC 2018, section 3.4.4, Table 3.4.I",
  thermalCoefficient: "D.M. 17/01/2018, NTC 2018, section 3.4.5",
  combinationFactors: "D.M. 17/01/2018, NTC 2018, section 2.5.2, Table 2.5.I",
});

export interface Ntc2018SnowGroundZoneDefinition extends Record<string, unknown> {
  id: string;
  description: string;
  lowAltitudeLoad: number;
  highAltitudeCoefficient: number;
  altitudeScale: number;
  equation: string;
}

export const NTC2018_SNOW_GROUND_ZONES: Readonly<Record<string, Ntc2018SnowGroundZoneDefinition>> =
  freezeDefinitions({
    I_ALPINE: {
      description: "Zona I - Alpina",
      lowAltitudeLoad: 1.5,
      highAltitudeCoefficient: 1.39,
      altitudeScale: 728,
      equation: "[3.4.2]",
    },
    I_MEDITERRANEAN: {
      description: "Zona I - Mediterranea",
      lowAltitudeLoad: 1.5,
      highAltitudeCoefficient: 1.35,
      altitudeScale: 602,
      equation: "[3.4.3]",
    },
    II: {
      description: "Zona II",
      lowAltitudeLoad: 1,
      highAltitudeCoefficient: 0.85,
      altitudeScale: 481,
      equation: "[3.4.4]",
    },
    III: {
      description: "Zona III",
      lowAltitudeLoad: 0.6,
      highAltitudeCoefficient: 0.51,
      altitudeScale: 481,
      equation: "[3.4.5]",
    },
  });

export interface Ntc2018SnowExposureClassDefinition extends Record<string, unknown> {
  id: string;
  description: string;
  value: number;
}

export const NTC2018_SNOW_EXPOSURE_CLASSES: Readonly<
  Record<string, Ntc2018SnowExposureClassDefinition>
> = freezeDefinitions({
  WIND_SWEPT: {
    description: "Area battuta dai venti",
    value: 0.9,
  },
  NORMAL: {
    description: "Esposizione normale",
    value: 1,
  },
  SHELTERED: {
    description: "Area riparata",
    value: 1.1,
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

function booleanValue(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") {
    throw new Error(`${label} must be a boolean.`);
  }

  return value;
}

function groundZoneDefinition(zone: unknown): Ntc2018SnowGroundZoneDefinition {
  const definition = typeof zone === "string" ? NTC2018_SNOW_GROUND_ZONES[zone] : undefined;

  if (!definition) {
    throw new Error(`Unsupported NTC 2018 snow ground zone: ${String(zone)}.`);
  }

  return definition;
}

function exposureClassDefinition(exposureClass: unknown): Ntc2018SnowExposureClassDefinition {
  const definition =
    typeof exposureClass === "string" ? NTC2018_SNOW_EXPOSURE_CLASSES[exposureClass] : undefined;

  if (!definition) {
    throw new Error(`Unsupported NTC 2018 snow exposure class: ${String(exposureClass)}.`);
  }

  return definition;
}

export function getNTC2018SnowGroundZoneDefinition(zone: unknown): JsonRecord {
  return cloneRecord(groundZoneDefinition(zone));
}

export function getNTC2018SnowExposureClassDefinition(exposureClass: unknown): JsonRecord {
  return cloneRecord(exposureClassDefinition(exposureClass));
}

export interface CalculateNTC2018GroundSnowLoadOptions {
  zone?: unknown;
  siteAltitude?: number | null;
  units?: UnitSystemInput | null;
}

export interface Ntc2018GroundSnowLoadResult {
  zone: unknown;
  zoneDescription: string;
  siteAltitude: number;
  value: number;
  quantity: "area-load";
  formula: string;
  operands: Record<string, number>;
  equation?: string;
  units: UnitSystem;
  reference: string;
  metadata: {
    source: string;
    sourceUnitSystem: UnitSystem;
    unitSystem: UnitSystem;
    [key: string]: unknown;
  };
}

export function calculateNTC2018GroundSnowLoad({
  zone,
  siteAltitude,
  units = null,
}: CalculateNTC2018GroundSnowLoadOptions = {}): Ntc2018GroundSnowLoadResult {
  const sourceUnits = assertExplicitUnitSystem(units, "calculateNTC2018GroundSnowLoad");
  const resolver = createUnitResolver(sourceUnits, INTERNAL_UNITS);
  const altitude = finiteNonNegative(resolver.length(siteAltitude), "siteAltitude");

  if (altitude > MAXIMUM_TABULATED_ALTITUDE) {
    throw new RangeError(
      "The NTC 2018 zonal ground-snow formula is not applicable above 1500 m; documented local climate and exposure data are required.",
    );
  }

  const definition = groundZoneDefinition(zone);
  const lowAltitude = altitude <= 200;
  const value = lowAltitude
    ? definition.lowAltitudeLoad
    : definition.highAltitudeCoefficient * (1 + (altitude / definition.altitudeScale) ** 2);

  return {
    zone,
    zoneDescription: definition.description,
    siteAltitude: altitude,
    value,
    quantity: "area-load",
    formula: lowAltitude
      ? "qsk = lowAltitudeLoad"
      : "qsk = coefficient * [1 + (siteAltitude / altitudeScale)^2]",
    operands: {
      lowAltitudeLoad: definition.lowAltitudeLoad,
      coefficient: definition.highAltitudeCoefficient,
      altitudeScale: definition.altitudeScale,
      siteAltitude: altitude,
    },
    equation: definition.equation,
    units: { ...INTERNAL_UNITS },
    reference: NTC2018_SNOW_REFERENCES.groundLoad,
    metadata: {
      source: "ntc2018-zonal-minimum",
      sourceUnitSystem: sourceUnits,
      unitSystem: { ...INTERNAL_UNITS },
    },
  };
}

export interface CalculateNTC2018PitchedRoofShapeCoefficientOptions {
  roofAngleDegrees?: number | null;
  slidingPrevented?: boolean;
}

export interface Ntc2018PitchedRoofShapeCoefficientResult {
  roofAngleDegrees: number;
  slidingPrevented: boolean;
  nominalValue: number;
  minimumValue: number;
  minimumApplied: boolean;
  value: number;
  formula: string;
  reference: string;
}

export function calculateNTC2018PitchedRoofShapeCoefficient({
  roofAngleDegrees,
  slidingPrevented = false,
}: CalculateNTC2018PitchedRoofShapeCoefficientOptions = {}): Ntc2018PitchedRoofShapeCoefficientResult {
  const angle = finiteNonNegative(roofAngleDegrees, "roofAngleDegrees");
  if (angle > 90) {
    throw new Error("roofAngleDegrees must not exceed 90 degrees.");
  }
  const hasSlidingObstruction = booleanValue(slidingPrevented, "slidingPrevented");

  let nominalValue: number;
  let formula: string;
  if (angle <= 30) {
    nominalValue = 0.8;
    formula = "mu1 = 0.8";
  } else if (angle < 60) {
    nominalValue = (0.8 * (60 - angle)) / 30;
    formula = "mu1 = 0.8 * (60 - roofAngleDegrees) / 30";
  } else {
    nominalValue = 0;
    formula = "mu1 = 0";
  }

  const minimumValue = hasSlidingObstruction ? 0.8 : 0;
  const value = Math.max(nominalValue, minimumValue);

  return {
    roofAngleDegrees: angle,
    slidingPrevented: hasSlidingObstruction,
    nominalValue,
    minimumValue,
    minimumApplied: value > nominalValue,
    value,
    formula: hasSlidingObstruction ? `max(${formula.replace("mu1 = ", "")}, 0.8)` : formula,
    reference: NTC2018_SNOW_REFERENCES.shapeCoefficient,
  };
}

export interface CalculateNTC2018RoofSnowLoadOptions {
  groundSnowLoad?: number | null;
  shapeCoefficient?: number | null;
  exposureCoefficient?: number | null;
  thermalCoefficient?: number | null;
  units?: UnitSystemInput | null;
}

export interface Ntc2018RoofSnowLoadResult {
  value: number;
  quantity: "area-load";
  formula: string;
  operands: {
    groundSnowLoad: number;
    shapeCoefficient: number;
    exposureCoefficient: number;
    thermalCoefficient: number;
  };
  applicationDirection: "vertical";
  referenceSurface: "horizontal-projection";
  units: UnitSystem;
  reference: string;
  metadata: {
    sourceUnitSystem: UnitSystem;
    unitSystem: UnitSystem;
    [key: string]: unknown;
  };
}

export function calculateNTC2018RoofSnowLoad({
  groundSnowLoad,
  shapeCoefficient,
  exposureCoefficient,
  thermalCoefficient = 1,
  units = null,
}: CalculateNTC2018RoofSnowLoadOptions = {}): Ntc2018RoofSnowLoadResult {
  const sourceUnits = assertExplicitUnitSystem(units, "calculateNTC2018RoofSnowLoad");
  const resolver = createUnitResolver(sourceUnits, INTERNAL_UNITS);
  const qsk = finiteNonNegative(resolver.areaLoad(groundSnowLoad), "groundSnowLoad");
  const mu = finiteNonNegative(shapeCoefficient, "shapeCoefficient");
  const ce = finitePositive(exposureCoefficient, "exposureCoefficient");
  const ct = finitePositive(thermalCoefficient, "thermalCoefficient");

  return {
    value: qsk * mu * ce * ct,
    quantity: "area-load",
    formula: "qs = shapeCoefficient * groundSnowLoad * exposureCoefficient * thermalCoefficient",
    operands: {
      groundSnowLoad: qsk,
      shapeCoefficient: mu,
      exposureCoefficient: ce,
      thermalCoefficient: ct,
    },
    applicationDirection: "vertical",
    referenceSurface: "horizontal-projection",
    units: { ...INTERNAL_UNITS },
    reference: NTC2018_SNOW_REFERENCES.roofLoad,
    metadata: {
      sourceUnitSystem: sourceUnits,
      unitSystem: { ...INTERNAL_UNITS },
    },
  };
}

interface ResolveGroundSnowLoadOptions {
  zone: unknown;
  siteAltitude: number;
  groundSnowLoad: number | null;
  groundSnowLoadSource: string | null;
  resolver: ReturnType<typeof createUnitResolver>;
  sourceUnits: UnitSystem;
}

type GroundSnowResolution =
  | { supported: false; minimum: Ntc2018GroundSnowLoadResult }
  | { supported: true; groundSnowLoad: Ntc2018GroundSnowLoadResult };

function resolveGroundSnowLoad({
  zone,
  siteAltitude,
  groundSnowLoad,
  groundSnowLoadSource,
  resolver,
  sourceUnits,
}: ResolveGroundSnowLoadOptions): GroundSnowResolution {
  const maximumFormulaAltitude = Math.min(siteAltitude, MAXIMUM_TABULATED_ALTITUDE);
  const minimum = calculateNTC2018GroundSnowLoad({
    zone,
    siteAltitude: maximumFormulaAltitude,
    units: INTERNAL_UNITS,
  });

  if (groundSnowLoad == null) {
    if (siteAltitude > MAXIMUM_TABULATED_ALTITUDE) {
      return {
        supported: false,
        minimum,
      };
    }

    return {
      supported: true,
      groundSnowLoad: minimum,
    };
  }

  const value = finiteNonNegative(resolver.areaLoad(groundSnowLoad), "groundSnowLoad");
  const source = nonEmptyString(groundSnowLoadSource, "groundSnowLoadSource");
  if (value < minimum.value) {
    throw new Error(
      `groundSnowLoad must not be lower than the NTC 2018 minimum ${minimum.value} kN/m^2.`,
    );
  }

  return {
    supported: true,
    groundSnowLoad: {
      zone,
      zoneDescription: groundZoneDefinition(zone).description,
      siteAltitude,
      value,
      quantity: "area-load",
      formula: "qsk = documented explicit value",
      operands: {
        documentedValue: value,
        ntc2018Minimum: minimum.value,
        minimumEvaluationAltitude: maximumFormulaAltitude,
      },
      units: { ...INTERNAL_UNITS },
      reference: NTC2018_SNOW_REFERENCES.groundLoad,
      metadata: {
        source: "documented-explicit-value",
        sourceReference: source,
        sourceUnitSystem: sourceUnits,
        unitSystem: { ...INTERNAL_UNITS },
      },
    },
  };
}

interface ResolveShapeCoefficientOptions {
  roofAngleDegrees: number | null;
  slidingPrevented: boolean;
  shapeCoefficient: number | null;
  shapeCoefficientSource: string | null;
}

interface ResolvedShapeCoefficient {
  roofAngleDegrees?: number;
  slidingPrevented?: boolean;
  nominalValue?: number;
  minimumValue?: number;
  minimumApplied?: boolean;
  value: number;
  formula?: string;
  reference: string;
  source: string;
  sourceReference?: string;
}

function resolveShapeCoefficient({
  roofAngleDegrees,
  slidingPrevented,
  shapeCoefficient,
  shapeCoefficientSource,
}: ResolveShapeCoefficientOptions): ResolvedShapeCoefficient {
  const hasAngle = roofAngleDegrees != null;
  const hasExplicitValue = shapeCoefficient != null;
  if (hasAngle === hasExplicitValue) {
    throw new Error("Provide exactly one of roofAngleDegrees or shapeCoefficient.");
  }

  if (hasAngle) {
    return {
      ...calculateNTC2018PitchedRoofShapeCoefficient({
        roofAngleDegrees,
        slidingPrevented,
      }),
      source: "ntc2018-nominal-pitched-roof",
    };
  }

  return {
    value: finiteNonNegative(shapeCoefficient, "shapeCoefficient"),
    source: "documented-explicit-value",
    sourceReference: nonEmptyString(shapeCoefficientSource, "shapeCoefficientSource"),
    reference: NTC2018_SNOW_REFERENCES.shapeCoefficient,
  };
}

interface ResolveExposureCoefficientOptions {
  exposureClass: string | null;
  exposureCoefficient: number | null;
  exposureCoefficientSource: string | null;
}

interface ResolvedExposureCoefficient {
  exposureClass: string | null;
  description?: string;
  value: number;
  source: string;
  sourceReference?: string;
  reference: string;
}

function resolveExposureCoefficient({
  exposureClass,
  exposureCoefficient,
  exposureCoefficientSource,
}: ResolveExposureCoefficientOptions): ResolvedExposureCoefficient {
  const hasClass = exposureClass != null;
  const hasExplicitValue = exposureCoefficient != null;
  if (hasClass === hasExplicitValue) {
    throw new Error("Provide exactly one of exposureClass or exposureCoefficient.");
  }

  if (hasClass) {
    const definition = exposureClassDefinition(exposureClass);
    return {
      exposureClass,
      description: definition.description,
      value: definition.value,
      source: "ntc2018-exposure-class",
      reference: NTC2018_SNOW_REFERENCES.exposureCoefficient,
    };
  }

  return {
    exposureClass: null,
    value: finitePositive(exposureCoefficient, "exposureCoefficient"),
    source: "documented-explicit-value",
    sourceReference: nonEmptyString(exposureCoefficientSource, "exposureCoefficientSource"),
    reference: NTC2018_SNOW_REFERENCES.exposureCoefficient,
  };
}

interface ResolveThermalCoefficientOptions {
  thermalCoefficient: number | null;
  thermalCoefficientSource: string | null;
}

interface ResolvedThermalCoefficient {
  value: number;
  defaultApplied: boolean;
  source: string;
  sourceReference: string | null;
  reference: string;
}

function resolveThermalCoefficient({
  thermalCoefficient,
  thermalCoefficientSource,
}: ResolveThermalCoefficientOptions): ResolvedThermalCoefficient {
  const defaultApplied = thermalCoefficient == null;
  const value = finitePositive(thermalCoefficient ?? 1, "thermalCoefficient");
  const sourceReference =
    value === 1 ? null : nonEmptyString(thermalCoefficientSource, "thermalCoefficientSource");

  return {
    value,
    defaultApplied,
    source: value === 1 ? "ntc2018-default" : "documented-specific-study",
    sourceReference,
    reference: NTC2018_SNOW_REFERENCES.thermalCoefficient,
  };
}

function notSupportedHighAltitudeResult({
  zone,
  siteAltitude,
  sourceUnits,
  minimum,
}: {
  zone: unknown;
  siteAltitude: number;
  sourceUnits: UnitSystem;
  minimum: Ntc2018GroundSnowLoadResult;
}): CalculationResult {
  return new CalculationResult({
    applicationId: "ntc2018-snow-area-load",
    status: "not-supported",
    summary: "The NTC 2018 zonal formula does not determine ground snow load above 1500 m.",
    outputs: {
      schemaVersion: "ntc2018-snow-area-load/v1",
      units: { ...INTERNAL_UNITS },
      zone,
      siteAltitude,
      minimumGroundSnowLoadAt1500m: minimum,
    },
    warnings: [
      "Provide a documented local ground snow load not lower than the NTC 2018 value evaluated at 1500 m.",
    ],
    assumptions: [],
    metadata: {
      method: "ntc2018-snow-area-load",
      normativePreset: "NTC2018",
      references: { ...NTC2018_SNOW_REFERENCES },
      unitSystem: { ...INTERNAL_UNITS },
      sourceUnitSystem: sourceUnits,
    },
  });
}

export interface CalculateNTC2018SnowAreaLoadOptions {
  id?: string | null;
  actionId?: string | null;
  name?: string | null;
  zone?: unknown;
  siteAltitude?: number | null;
  groundSnowLoad?: number | null;
  groundSnowLoadSource?: string | null;
  roofAngleDegrees?: number | null;
  slidingPrevented?: boolean;
  shapeCoefficient?: number | null;
  shapeCoefficientSource?: string | null;
  exposureClass?: string | null;
  exposureCoefficient?: number | null;
  exposureCoefficientSource?: string | null;
  thermalCoefficient?: number | null;
  thermalCoefficientSource?: string | null;
  units?: UnitSystemInput | null;
}

export function calculateNTC2018SnowAreaLoad({
  id = "NTC2018-SNOW-LOAD",
  actionId = "NTC2018-SNOW",
  name = "NTC 2018 roof snow load",
  zone,
  siteAltitude,
  groundSnowLoad = null,
  groundSnowLoadSource = null,
  roofAngleDegrees = null,
  slidingPrevented = false,
  shapeCoefficient = null,
  shapeCoefficientSource = null,
  exposureClass = null,
  exposureCoefficient = null,
  exposureCoefficientSource = null,
  thermalCoefficient = null,
  thermalCoefficientSource = null,
  units = null,
}: CalculateNTC2018SnowAreaLoadOptions = {}): CalculationResult {
  const loadId = nonEmptyString(id, "id");
  const normalizedActionId = nonEmptyString(actionId, "actionId");
  const sourceUnits = assertExplicitUnitSystem(units, "calculateNTC2018SnowAreaLoad");
  const resolver = createUnitResolver(sourceUnits, INTERNAL_UNITS);
  const altitude = finiteNonNegative(resolver.length(siteAltitude), "siteAltitude");
  groundZoneDefinition(zone);

  const groundResolution = resolveGroundSnowLoad({
    zone,
    siteAltitude: altitude,
    groundSnowLoad,
    groundSnowLoadSource,
    resolver,
    sourceUnits,
  });
  if (!groundResolution.supported) {
    return notSupportedHighAltitudeResult({
      zone,
      siteAltitude: altitude,
      sourceUnits,
      minimum: groundResolution.minimum,
    });
  }

  const shape = resolveShapeCoefficient({
    roofAngleDegrees,
    slidingPrevented,
    shapeCoefficient,
    shapeCoefficientSource,
  });
  const exposure = resolveExposureCoefficient({
    exposureClass,
    exposureCoefficient,
    exposureCoefficientSource,
  });
  const thermal = resolveThermalCoefficient({
    thermalCoefficient,
    thermalCoefficientSource,
  });
  const roofSnowLoad = calculateNTC2018RoofSnowLoad({
    groundSnowLoad: groundResolution.groundSnowLoad.value,
    shapeCoefficient: shape.value,
    exposureCoefficient: exposure.value,
    thermalCoefficient: thermal.value,
    units: INTERNAL_UNITS,
  });
  const highAltitude = altitude > 1000;
  const action = createNTC2018SnowAction({
    id: normalizedActionId,
    name,
    highAltitude,
    metadata: {
      siteAltitude: altitude,
      reference: NTC2018_SNOW_REFERENCES.combinationFactors,
    },
  });
  const load = new AreaLoad({
    id: loadId,
    name,
    type: "snow-area",
    direction: "vertical",
    referenceSystem: "site",
    intensity: roofSnowLoad.value,
    action,
    units: INTERNAL_UNITS,
    metadata: {
      applicationDirection: roofSnowLoad.applicationDirection,
      referenceSurface: roofSnowLoad.referenceSurface,
      formula: roofSnowLoad.formula,
      operands: roofSnowLoad.operands,
      groundSnowLoadSource: groundResolution.groundSnowLoad.metadata.source,
      shapeCoefficientSource: shape.source,
      exposureCoefficientSource: exposure.source,
      thermalCoefficientSource: thermal.source,
      sourceUnitSystem: sourceUnits,
    },
  });
  const warnings: string[] = [];
  if (roofAngleDegrees != null) {
    warnings.push(
      "The nominal mu1 value represents one roof surface; alternative two-pitch patterns and local accumulations are not generated.",
    );
  }
  if (shapeCoefficient != null) {
    warnings.push(
      "The explicit shape coefficient is preserved as documented input; the library does not reconstruct its roof load pattern.",
    );
  }

  return new CalculationResult({
    applicationId: "ntc2018-snow-area-load",
    status: "ok",
    summary: "Calculated the NTC 2018 characteristic snow area load on the roof.",
    outputs: {
      schemaVersion: "ntc2018-snow-area-load/v1",
      units: { ...INTERNAL_UNITS },
      zone: cloneRecord(groundZoneDefinition(zone)),
      siteAltitude: altitude,
      groundSnowLoad: groundResolution.groundSnowLoad,
      shapeCoefficient: shape,
      exposureCoefficient: exposure,
      thermalCoefficient: thermal,
      roofSnowLoad,
      action: action.toJSON(),
      load: load.toJSON(),
    },
    warnings,
    assumptions: [
      "The snow action is vertical and referred to the horizontal projection of the roof.",
      "The site snow zone is an explicit caller decision; no geographic lookup is performed.",
      ...(thermal.defaultApplied
        ? ["The thermal coefficient Ct is 1 because no documented specific study was supplied."]
        : []),
    ],
    metadata: {
      method: "ntc2018-snow-area-load",
      normativePreset: "NTC2018",
      references: { ...NTC2018_SNOW_REFERENCES },
      unitSystem: { ...INTERNAL_UNITS },
      sourceUnitSystem: sourceUnits,
    },
  });
}
