import { CalculationResult } from "../../../core/results/CalculationResult.js";
import { createNTC2018SeismicAction } from "./createNTC2018Action.js";

const GRAVITY_METERS_PER_SECOND_SQUARED = 9.81;
const MAXIMUM_HORIZONTAL_SPECTRUM_PERIOD = 4;
const AG_UNIT = "g";
const PERIOD_UNIT = "s";

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

export const NTC2018_SEISMIC_REFERENCES = Object.freeze({
  hazardParameters: "D.M. 17/01/2018, NTC 2018, section 3.2; D.M. 14/01/2008, Annexes A and B",
  limitStates: "D.M. 17/01/2018, NTC 2018, section 3.2.1, Table 3.2.I",
  horizontalSpectrum: "D.M. 17/01/2018, NTC 2018, section 3.2.3.2.1, equations [3.2.2]-[3.2.7]",
  subsoilAmplification: "D.M. 17/01/2018, NTC 2018, section 3.2.3.2.1, Table 3.2.IV",
  topographicAmplification: "D.M. 17/01/2018, NTC 2018, section 3.2.3.2.1, Table 3.2.V",
});

interface SeismicLimitStateDefinition extends Record<string, unknown> {
  id: string;
  description: string;
  nominalExceedanceProbabilityInReferencePeriod: number;
}

export const NTC2018_SEISMIC_LIMIT_STATES: Readonly<Record<string, SeismicLimitStateDefinition>> =
  freezeDefinitions({
    SLO: {
      description: "Operational limit state",
      nominalExceedanceProbabilityInReferencePeriod: 0.81,
    },
    SLD: {
      description: "Damage limitation state",
      nominalExceedanceProbabilityInReferencePeriod: 0.63,
    },
    SLV: {
      description: "Life-safety limit state",
      nominalExceedanceProbabilityInReferencePeriod: 0.1,
    },
    SLC: {
      description: "Collapse-prevention limit state",
      nominalExceedanceProbabilityInReferencePeriod: 0.05,
    },
  });

export type Ntc2018SeismicLimitState = keyof typeof NTC2018_SEISMIC_LIMIT_STATES;
export type Ntc2018SiteHazardSourceKind = "manual-entry" | "external-service" | "documented-study";

export const NTC2018_SITE_HAZARD_SOURCE_KINDS: readonly Ntc2018SiteHazardSourceKind[] =
  Object.freeze(["manual-entry", "external-service", "documented-study"]);

interface FixedSubsoilDefinition extends Record<string, unknown> {
  id: string;
  ssKind: "fixed";
  ssValue: number;
  ccMultiplier: number;
  ccExponent: number;
}

interface BoundedSubsoilDefinition extends Record<string, unknown> {
  id: string;
  ssKind: "bounded-linear";
  ssMinimum: number;
  ssMaximum: number;
  ssIntercept: number;
  ssScale: number;
  ccMultiplier: number;
  ccExponent: number;
}

type SubsoilDefinition = FixedSubsoilDefinition | BoundedSubsoilDefinition;

export const NTC2018_SUBSOIL_SPECTRUM_COEFFICIENTS: Readonly<Record<string, SubsoilDefinition>> =
  freezeDefinitions({
    A: {
      ssKind: "fixed",
      ssValue: 1,
      ccMultiplier: 1,
      ccExponent: 0,
    },
    B: {
      ssKind: "bounded-linear",
      ssMinimum: 1,
      ssMaximum: 1.2,
      ssIntercept: 1.4,
      ssScale: 0.4,
      ccMultiplier: 1.1,
      ccExponent: -0.2,
    },
    C: {
      ssKind: "bounded-linear",
      ssMinimum: 1,
      ssMaximum: 1.5,
      ssIntercept: 1.7,
      ssScale: 0.6,
      ccMultiplier: 1.05,
      ccExponent: -0.33,
    },
    D: {
      ssKind: "bounded-linear",
      ssMinimum: 0.9,
      ssMaximum: 1.8,
      ssIntercept: 2.4,
      ssScale: 1.5,
      ccMultiplier: 1.25,
      ccExponent: -0.5,
    },
    E: {
      ssKind: "bounded-linear",
      ssMinimum: 1,
      ssMaximum: 1.6,
      ssIntercept: 2,
      ssScale: 1.1,
      ccMultiplier: 1.15,
      ccExponent: -0.4,
    },
  });

interface TopographicDefinition extends Record<string, unknown> {
  id: string;
  description: string;
  referenceLocation: string;
  maximumCoefficient: number;
}

export const NTC2018_TOPOGRAPHIC_AMPLIFICATION_MAXIMA: Readonly<
  Record<string, TopographicDefinition>
> = freezeDefinitions({
  T1: {
    description: "Flat surface, isolated slopes and reliefs with mean inclination <= 15 degrees",
    referenceLocation: "not-applicable",
    maximumCoefficient: 1,
  },
  T2: {
    description: "Slope with mean inclination greater than 15 degrees",
    referenceLocation: "slope-summit",
    maximumCoefficient: 1.2,
  },
  T3: {
    description: "Relief with narrow crest and mean inclination between 15 and 30 degrees",
    referenceLocation: "relief-crest",
    maximumCoefficient: 1.2,
  },
  T4: {
    description: "Relief with narrow crest and mean inclination greater than 30 degrees",
    referenceLocation: "relief-crest",
    maximumCoefficient: 1.4,
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

function finitePositive(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be a finite positive number.`);
  }

  return value;
}

function finiteNonNegative(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be a finite non-negative number.`);
  }

  return value;
}

function nonEmptyString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${label} must be a non-empty string.`);
  }

  return value.trim();
}

function optionalNonEmptyString(value: unknown, label: string): string | null {
  return value == null ? null : nonEmptyString(value, label);
}

function limitStateDefinition(limitState: unknown): SeismicLimitStateDefinition {
  const definition =
    typeof limitState === "string" ? NTC2018_SEISMIC_LIMIT_STATES[limitState] : undefined;
  if (!definition) {
    throw new Error(`Unsupported NTC 2018 seismic limit state: ${String(limitState)}.`);
  }

  return definition;
}

function subsoilDefinition(subsoilCategory: unknown): SubsoilDefinition {
  const definition =
    typeof subsoilCategory === "string"
      ? NTC2018_SUBSOIL_SPECTRUM_COEFFICIENTS[subsoilCategory]
      : undefined;
  if (!definition) {
    throw new Error(
      `Unsupported NTC 2018 simplified-spectrum subsoil category: ${String(subsoilCategory)}.`,
    );
  }

  return definition;
}

function topographicDefinition(topographicCategory: unknown): TopographicDefinition {
  const definition =
    typeof topographicCategory === "string"
      ? NTC2018_TOPOGRAPHIC_AMPLIFICATION_MAXIMA[topographicCategory]
      : undefined;
  if (!definition) {
    throw new Error(`Unsupported NTC 2018 topographic category: ${String(topographicCategory)}.`);
  }

  return definition;
}

interface SiteHazardSource {
  kind: Ntc2018SiteHazardSourceKind;
  reference: string;
  datasetVersion: string | null;
  resultId: string | null;
}

export interface Ntc2018SiteHazardParametersInput {
  siteReference?: unknown;
  limitState?: unknown;
  returnPeriodYears?: unknown;
  ag?: unknown;
  agUnit?: unknown;
  f0?: unknown;
  tcStar?: unknown;
  tcStarUnit?: unknown;
  source?: unknown;
}

export interface Ntc2018SiteHazardParameters {
  schemaVersion: "ntc2018-site-hazard-parameters/v1";
  siteReference: string;
  limitState: unknown;
  limitStateDescription: string;
  nominalExceedanceProbabilityInReferencePeriod: number;
  returnPeriodYears: number;
  ag: number;
  agUnit: "g";
  agOverG: number;
  agMetersPerSecondSquared: number;
  f0: number;
  tcStar: number;
  tcStarUnit: "s";
  source: SiteHazardSource;
  reference: string;
}

function normalizeSource(source: unknown): SiteHazardSource {
  if (!isRecord(source) || Array.isArray(source)) {
    throw new Error("hazardParameters.source must be an object.");
  }
  const sourceKind = NTC2018_SITE_HAZARD_SOURCE_KINDS.find((kind) => kind === source.kind);
  if (sourceKind === undefined) {
    throw new Error(
      `hazardParameters.source.kind must be one of: ${NTC2018_SITE_HAZARD_SOURCE_KINDS.join(", ")}.`,
    );
  }

  return {
    kind: sourceKind,
    reference: nonEmptyString(source.reference, "hazardParameters.source.reference"),
    datasetVersion: optionalNonEmptyString(
      source.datasetVersion,
      "hazardParameters.source.datasetVersion",
    ),
    resultId: optionalNonEmptyString(source.resultId, "hazardParameters.source.resultId"),
  };
}

export function getNTC2018SeismicLimitStateDefinition(limitState: unknown): JsonRecord {
  return cloneRecord(limitStateDefinition(limitState));
}

export function getNTC2018SubsoilSpectrumCoefficientDefinition(
  subsoilCategory: unknown,
): JsonRecord {
  return cloneRecord(subsoilDefinition(subsoilCategory));
}

export function getNTC2018TopographicAmplificationDefinition(
  topographicCategory: unknown,
): JsonRecord {
  return cloneRecord(topographicDefinition(topographicCategory));
}

export function normalizeNTC2018SiteHazardParameters({
  siteReference,
  limitState,
  returnPeriodYears,
  ag,
  agUnit = null,
  f0,
  tcStar,
  tcStarUnit = null,
  source,
}: Ntc2018SiteHazardParametersInput = {}): Ntc2018SiteHazardParameters {
  const definition = limitStateDefinition(limitState);
  if (agUnit !== AG_UNIT) {
    throw new Error(`hazardParameters.agUnit must be '${AG_UNIT}'.`);
  }
  if (tcStarUnit !== PERIOD_UNIT) {
    throw new Error(`hazardParameters.tcStarUnit must be '${PERIOD_UNIT}'.`);
  }

  const normalizedAg = finitePositive(ag, "hazardParameters.ag");
  const normalizedF0 = finitePositive(f0, "hazardParameters.f0");
  if (normalizedF0 < 2.2) {
    throw new Error("hazardParameters.f0 must not be lower than the NTC 2018 minimum of 2.2.");
  }

  return {
    schemaVersion: "ntc2018-site-hazard-parameters/v1",
    siteReference: nonEmptyString(siteReference, "hazardParameters.siteReference"),
    limitState,
    limitStateDescription: definition.description,
    nominalExceedanceProbabilityInReferencePeriod:
      definition.nominalExceedanceProbabilityInReferencePeriod,
    returnPeriodYears: finitePositive(returnPeriodYears, "hazardParameters.returnPeriodYears"),
    ag: normalizedAg,
    agUnit: AG_UNIT,
    agOverG: normalizedAg,
    agMetersPerSecondSquared: normalizedAg * GRAVITY_METERS_PER_SECOND_SQUARED,
    f0: normalizedF0,
    tcStar: finitePositive(tcStar, "hazardParameters.tcStar"),
    tcStarUnit: PERIOD_UNIT,
    source: normalizeSource(source),
    reference: NTC2018_SEISMIC_REFERENCES.hazardParameters,
  };
}

interface FixedStratigraphicResult {
  subsoilCategory: unknown;
  ss: number;
  ssUnbounded: number;
  ssLimitApplied: "fixed";
  cc: number;
  formulas: { ss: "SS = 1"; cc: "CC = 1" };
  reference: string;
}

interface BoundedStratigraphicResult {
  subsoilCategory: unknown;
  ss: number;
  ssUnbounded: number;
  ssLimitApplied: "minimum" | "maximum" | "none";
  cc: number;
  formulas: {
    ss: "SS = clamp(ssIntercept - ssScale * F0 * ag/g, ssMinimum, ssMaximum)";
    cc: "CC = ccMultiplier * TCstar^ccExponent";
  };
  operands: JsonRecord;
  reference: string;
}

type StratigraphicResult = FixedStratigraphicResult | BoundedStratigraphicResult;

export interface Ntc2018StratigraphicSpectrumOptions {
  subsoilCategory?: unknown;
  agOverG?: unknown;
  f0?: unknown;
  tcStar?: unknown;
}

export function calculateNTC2018StratigraphicSpectrumCoefficients({
  subsoilCategory,
  agOverG,
  f0,
  tcStar,
}: Ntc2018StratigraphicSpectrumOptions = {}): StratigraphicResult {
  const definition = subsoilDefinition(subsoilCategory);
  const accelerationRatio = finitePositive(agOverG, "agOverG");
  const maximumAmplification = finitePositive(f0, "f0");
  if (maximumAmplification < 2.2) {
    throw new Error("f0 must not be lower than the NTC 2018 minimum of 2.2.");
  }
  const referencePeriod = finitePositive(tcStar, "tcStar");

  if (definition.ssKind === "fixed") {
    return {
      subsoilCategory,
      ss: definition.ssValue,
      ssUnbounded: definition.ssValue,
      ssLimitApplied: "fixed",
      cc: 1,
      formulas: {
        ss: "SS = 1",
        cc: "CC = 1",
      },
      reference: NTC2018_SEISMIC_REFERENCES.subsoilAmplification,
    };
  }

  const ssUnbounded =
    definition.ssIntercept - definition.ssScale * maximumAmplification * accelerationRatio;
  const ss = Math.min(Math.max(ssUnbounded, definition.ssMinimum), definition.ssMaximum);
  const ssLimitApplied =
    ss === definition.ssMinimum ? "minimum" : ss === definition.ssMaximum ? "maximum" : "none";
  const cc = definition.ccMultiplier * referencePeriod ** definition.ccExponent;

  return {
    subsoilCategory,
    ss,
    ssUnbounded,
    ssLimitApplied,
    cc,
    formulas: {
      ss: "SS = clamp(ssIntercept - ssScale * F0 * ag/g, ssMinimum, ssMaximum)",
      cc: "CC = ccMultiplier * TCstar^ccExponent",
    },
    operands: {
      agOverG: accelerationRatio,
      f0: maximumAmplification,
      tcStar: referencePeriod,
      ssMinimum: definition.ssMinimum,
      ssMaximum: definition.ssMaximum,
      ssIntercept: definition.ssIntercept,
      ssScale: definition.ssScale,
      ccMultiplier: definition.ccMultiplier,
      ccExponent: definition.ccExponent,
    },
    reference: NTC2018_SEISMIC_REFERENCES.subsoilAmplification,
  };
}

export interface Ntc2018TopographicAmplificationOptions {
  topographicCategory?: unknown;
  atReferenceLocation?: unknown;
  coefficient?: unknown;
  coefficientSource?: unknown;
}

interface TopographicAmplificationResult extends JsonRecord {
  topographicCategory: unknown;
  value: number;
  selection: string;
  location: string;
  sourceReference: string | null;
  reference: string;
}

export function resolveNTC2018TopographicAmplification({
  topographicCategory,
  atReferenceLocation = null,
  coefficient = null,
  coefficientSource = null,
}: Ntc2018TopographicAmplificationOptions = {}): TopographicAmplificationResult {
  const definition = topographicDefinition(topographicCategory);
  const hasExplicitCoefficient = coefficient != null;

  if (topographicCategory === "T1") {
    if (atReferenceLocation != null || hasExplicitCoefficient || coefficientSource != null) {
      throw new Error(
        "atReferenceLocation, coefficient and coefficientSource must be omitted for topographic category T1.",
      );
    }

    return {
      topographicCategory,
      value: 1,
      selection: "ntc2018-tabulated",
      location: definition.referenceLocation,
      sourceReference: null,
      reference: NTC2018_SEISMIC_REFERENCES.topographicAmplification,
    };
  }

  if ((atReferenceLocation === true) === hasExplicitCoefficient) {
    throw new Error(
      "For topographic categories T2-T4 provide exactly one of atReferenceLocation=true or an explicit coefficient.",
    );
  }
  if (atReferenceLocation != null && atReferenceLocation !== true) {
    throw new Error("atReferenceLocation must be true when provided.");
  }

  if (atReferenceLocation === true) {
    if (coefficientSource != null) {
      throw new Error(
        "coefficientSource must be omitted when the tabulated maximum coefficient is used.",
      );
    }

    return {
      topographicCategory,
      value: definition.maximumCoefficient,
      selection: "ntc2018-tabulated-maximum-at-reference-location",
      location: definition.referenceLocation,
      sourceReference: null,
      reference: NTC2018_SEISMIC_REFERENCES.topographicAmplification,
    };
  }

  const explicitCoefficient = finitePositive(coefficient, "coefficient");
  if (explicitCoefficient < 1 || explicitCoefficient > definition.maximumCoefficient) {
    throw new Error(
      `coefficient for ${String(topographicCategory)} must be between 1 and ${definition.maximumCoefficient}.`,
    );
  }

  return {
    topographicCategory,
    value: explicitCoefficient,
    selection: "documented-explicit-within-tabulated-range",
    location: "between-base-and-reference-location",
    sourceReference: nonEmptyString(coefficientSource, "coefficientSource"),
    reference: NTC2018_SEISMIC_REFERENCES.topographicAmplification,
  };
}

interface HorizontalSpectrumParameters {
  agOverG: number;
  f0: number;
  tcStar: number;
  ss: number;
  st: number;
  s: number;
  cc: number;
  eta: number;
  dampingUnbounded: number;
  viscousDampingPercent: number;
  tb: number;
  tc: number;
  td: number;
  periodUnit: "s";
  formulas: JsonRecord;
  stratigraphic: StratigraphicResult;
  topographic: TopographicAmplificationResult;
  reference: string;
}

export interface Ntc2018HorizontalSpectrumParametersOptions
  extends Ntc2018StratigraphicSpectrumOptions,
    Ntc2018TopographicAmplificationOptions {
  topographicAtReferenceLocation?: unknown;
  topographicCoefficient?: unknown;
  topographicCoefficientSource?: unknown;
  viscousDampingPercent?: unknown;
}

export function calculateNTC2018HorizontalSpectrumParameters({
  agOverG,
  f0,
  tcStar,
  subsoilCategory,
  topographicCategory,
  topographicAtReferenceLocation = null,
  topographicCoefficient = null,
  topographicCoefficientSource = null,
  viscousDampingPercent = 5,
}: Ntc2018HorizontalSpectrumParametersOptions = {}): HorizontalSpectrumParameters {
  const accelerationRatio = finitePositive(agOverG, "agOverG");
  const maximumAmplification = finitePositive(f0, "f0");
  const referencePeriod = finitePositive(tcStar, "tcStar");
  const damping = finiteNonNegative(viscousDampingPercent, "viscousDampingPercent");
  const stratigraphic = calculateNTC2018StratigraphicSpectrumCoefficients({
    subsoilCategory,
    agOverG: accelerationRatio,
    f0: maximumAmplification,
    tcStar: referencePeriod,
  });
  const topographic = resolveNTC2018TopographicAmplification({
    topographicCategory,
    atReferenceLocation: topographicAtReferenceLocation,
    coefficient: topographicCoefficient,
    coefficientSource: topographicCoefficientSource,
  });
  const dampingUnbounded = Math.sqrt(10 / (5 + damping));
  const eta = Math.max(dampingUnbounded, 0.55);
  const tc = stratigraphic.cc * referencePeriod;
  const tb = tc / 3;
  const td = 4 * accelerationRatio + 1.6;

  return {
    agOverG: accelerationRatio,
    f0: maximumAmplification,
    tcStar: referencePeriod,
    ss: stratigraphic.ss,
    st: topographic.value,
    s: stratigraphic.ss * topographic.value,
    cc: stratigraphic.cc,
    eta,
    dampingUnbounded,
    viscousDampingPercent: damping,
    tb,
    tc,
    td,
    periodUnit: PERIOD_UNIT,
    formulas: {
      s: "S = SS * ST",
      eta: "eta = max(sqrt(10 / (5 + xi)), 0.55)",
      tc: "TC = CC * TCstar",
      tb: "TB = TC / 3",
      td: "TD = 4 * ag/g + 1.6",
    },
    stratigraphic,
    topographic,
    reference: NTC2018_SEISMIC_REFERENCES.horizontalSpectrum,
  };
}

function normalizePeriods(periods: unknown): number[] {
  if (!Array.isArray(periods) || periods.length === 0) {
    throw new Error("periods must be a non-empty array.");
  }

  return periods.map((period, index) => finiteNonNegative(period, `periods[${index}]`));
}

interface SpectrumPoint {
  period: number;
  periodUnit: "s";
  value: number;
  accelerationUnit: "g";
  metersPerSecondSquared: number;
  branch: string;
}

function calculateHorizontalElasticSpectrumPoint(
  period: number,
  parameters: HorizontalSpectrumParameters,
): SpectrumPoint {
  const { agOverG, f0, s, eta, tb, tc, td } = parameters;
  let value: number;
  let branch: string;

  if (period < tb) {
    value = agOverG * s * eta * f0 * (period / tb + (1 / (eta * f0)) * (1 - period / tb));
    branch = "rising-acceleration";
  } else if (period < tc) {
    value = agOverG * s * eta * f0;
    branch = "constant-acceleration";
  } else if (period < td) {
    value = agOverG * s * eta * f0 * (tc / period);
    branch = "constant-velocity";
  } else {
    value = agOverG * s * eta * f0 * ((tc * td) / period ** 2);
    branch = "constant-displacement";
  }

  return {
    period,
    periodUnit: PERIOD_UNIT,
    value,
    accelerationUnit: AG_UNIT,
    metersPerSecondSquared: value * GRAVITY_METERS_PER_SECOND_SQUARED,
    branch,
  };
}

export interface Ntc2018HorizontalElasticSpectrumOptions {
  actionId?: unknown;
  hazardParameters?: Ntc2018SiteHazardParametersInput;
  subsoilCategory?: unknown;
  topographicCategory?: unknown;
  topographicAtReferenceLocation?: unknown;
  topographicCoefficient?: unknown;
  topographicCoefficientSource?: unknown;
  viscousDampingPercent?: unknown;
  periods?: unknown;
}

export function calculateNTC2018HorizontalElasticSpectrum({
  actionId = "NTC2018-SEISMIC-HORIZONTAL",
  hazardParameters,
  subsoilCategory,
  topographicCategory,
  topographicAtReferenceLocation = null,
  topographicCoefficient = null,
  topographicCoefficientSource = null,
  viscousDampingPercent = 5,
  periods,
}: Ntc2018HorizontalElasticSpectrumOptions = {}): CalculationResult {
  const normalizedActionId = nonEmptyString(actionId, "actionId");
  const hazard = normalizeNTC2018SiteHazardParameters(hazardParameters);
  const normalizedPeriods = normalizePeriods(periods);
  const spectrumParameters = calculateNTC2018HorizontalSpectrumParameters({
    agOverG: hazard.agOverG,
    f0: hazard.f0,
    tcStar: hazard.tcStar,
    subsoilCategory,
    topographicCategory,
    topographicAtReferenceLocation,
    topographicCoefficient,
    topographicCoefficientSource,
    viscousDampingPercent,
  });
  const unsupportedPeriods = normalizedPeriods.filter(
    (period) => period > MAXIMUM_HORIZONTAL_SPECTRUM_PERIOD,
  );
  const commonOutputs = {
    schemaVersion: "ntc2018-horizontal-elastic-spectrum/v1",
    hazardParameters: hazard,
    spectrumParameters,
  };
  const metadata = {
    method: "ntc2018-horizontal-elastic-acceleration-spectrum",
    normativePreset: "NTC2018",
    references: { ...NTC2018_SEISMIC_REFERENCES },
    accelerationUnit: AG_UNIT,
    periodUnit: PERIOD_UNIT,
  };

  if (unsupportedPeriods.length > 0) {
    return new CalculationResult({
      applicationId: "ntc2018-horizontal-elastic-spectrum",
      status: "not-supported",
      summary: "The requested periods exceed the NTC 2018 applicability limit for this spectrum.",
      outputs: {
        ...commonOutputs,
        maximumSupportedPeriod: MAXIMUM_HORIZONTAL_SPECTRUM_PERIOD,
        unsupportedPeriods,
      },
      warnings: [
        "For fundamental periods above 4.0 s, NTC 2018 requires dedicated analyses or ground-motion time histories.",
      ],
      assumptions: [
        "The caller supplied the site hazard parameters; no geographic lookup or interpolation was performed.",
      ],
      metadata,
    });
  }

  const points = normalizedPeriods.map((period) =>
    calculateHorizontalElasticSpectrumPoint(period, spectrumParameters),
  );
  const action = createNTC2018SeismicAction({
    id: normalizedActionId,
    name: `NTC 2018 horizontal seismic action - ${String(hazard.limitState)}`,
    metadata: {
      component: "horizontal",
      limitState: hazard.limitState,
      returnPeriodYears: hazard.returnPeriodYears,
      siteReference: hazard.siteReference,
      hazardSource: { ...hazard.source },
      spectrumSchemaVersion: "ntc2018-horizontal-elastic-spectrum/v1",
      reference: NTC2018_SEISMIC_REFERENCES.horizontalSpectrum,
    },
  });

  return new CalculationResult({
    applicationId: "ntc2018-horizontal-elastic-spectrum",
    status: "ok",
    summary: "Calculated the NTC 2018 horizontal elastic acceleration spectrum.",
    outputs: {
      ...commonOutputs,
      spectrum: {
        component: "horizontal",
        quantity: "elastic-spectral-acceleration",
        accelerationUnit: AG_UNIT,
        periodUnit: PERIOD_UNIT,
        maximumSupportedPeriod: MAXIMUM_HORIZONTAL_SPECTRUM_PERIOD,
        points,
      },
      action: action.toJSON(),
    },
    warnings: [
      "The workflow does not determine ag, F0 or TCstar from coordinates and does not interpolate the national hazard grid.",
      "Only the horizontal elastic acceleration spectrum is generated; vertical, displacement, design and time-history representations are excluded.",
    ],
    assumptions: [
      "The supplied subsoil category is applicable to the simplified NTC 2018 approach.",
      `The equivalent viscous damping ratio is ${spectrumParameters.viscousDampingPercent} percent.`,
      spectrumParameters.topographic.selection.startsWith("ntc2018-tabulated")
        ? "The NTC 2018 tabulated topographic coefficient applies to the declared location."
        : "The documented topographic coefficient was supplied by the caller.",
    ],
    metadata,
  });
}
