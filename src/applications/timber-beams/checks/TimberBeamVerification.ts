// Mechanical TypeScript migration from strutture-js 6f33baead8b88166c4b2cf94af41763412e3c751; source path: src/applications/timber-beams/checks/TimberBeamVerification.js.

import {
  VerificationResult,
  type VerificationCheck,
} from "../../../core/results/VerificationResult.js";
import {
  isFinitePositive,
  round,
  uniqueStrings,
  utilizationCheck,
} from "../../../core/results/checkUtils.js";
import { RESULT_STATUS, type ResultStatus } from "../../../core/results/resultStatus.js";
import {
  BeamSectionActionVerifier,
  type BeamInternalForceSample,
  type BeamSectionActionVerificationProvider,
  type BeamStationInput,
  type BeamVerificationStations,
} from "../../../domain/beams/BeamSectionActionVerifier.js";
import {
  createUnitResolver,
  type UnitResolver,
  type UnitSystemInput,
} from "../../../domain/units/UnitSystem.js";
import type {
  TimberBeamMaterialLike,
  TimberBeamSectionLike,
} from "../../../domain/beams/TimberBeamSectionProvider.js";
import {
  verifyTimberLateralTorsionalStability,
  type TimberLateralTorsionalCheck,
} from "./TimberLateralTorsionalStability.js";

type JsonRecord = Record<string, unknown>;

const DEFAULT_SECTION_UNITS = Object.freeze({ force: "N", length: "mm" });

interface TimberVerificationSection extends TimberBeamSectionLike {
  elasticSectionModulusY?: number | null;
  elasticSectionModulusZ?: number | null;
  width?: number | null;
  height?: number | null;
}

interface TimberVerificationMaterial extends TimberBeamMaterialLike {
  fmK?: number | null;
  fvK?: number | null;
  fc0K?: number | null;
  ft0K?: number | null;
}

interface TimberVerificationGeometry extends JsonRecord {
  length?: number;
  horizontalSpan?: number;
}

interface TimberVerificationSectionProperties extends JsonRecord {
  metadata?: JsonRecord;
}

interface TimberVerificationContext extends JsonRecord {
  limitState?: string | null;
  combinationType?: string | null;
  serviceCombination?: string | null;
  deformationState?: string | null;
}

interface TimberVerificationInternalForces extends JsonRecord {
  samples?: BeamInternalForceSample[];
  maxAbsBendingMoment?: { station?: number };
  maxShearForce?: { station?: number };
  minShearForce?: { station?: number };
}

interface TimberDisplacementSample extends JsonRecord {
  uy?: number;
  station?: number;
}

interface TimberVerificationResultEntry extends JsonRecord {
  id: string;
  resultType?: string;
  geometry?: TimberVerificationGeometry;
  supports?: BeamStationInput[];
  loads?: Array<BeamStationInput & { type?: string }>;
  internalForces?: TimberVerificationInternalForces;
  context?: TimberVerificationContext;
  sectionProperties?: TimberVerificationSectionProperties;
  units?: UnitSystemInput;
  displacements?: {
    maxAbsVerticalDisplacement?: TimberDisplacementSample;
  };
}

interface TimberBeamAnalysisResult extends JsonRecord {
  combinations?: Record<string, TimberVerificationResultEntry>;
  loadCases?: Record<string, TimberVerificationResultEntry>;
  units?: UnitSystemInput;
  geometry?: TimberVerificationGeometry;
}

interface TimberLtbSegmentInput extends JsonRecord {
  id?: unknown;
  from?: unknown;
  start?: unknown;
  to?: unknown;
  end?: unknown;
  unbracedLength?: unknown;
  length?: unknown;
}

interface TimberLtbOptions extends JsonRecord {
  enabled?: boolean;
  restrained?: boolean;
  fmK?: unknown;
  kcrit?: unknown;
  kCrit?: unknown;
  sigmaMcrit?: unknown;
  sigmaMcr?: unknown;
  criticalBendingStress?: unknown;
  e0_05?: unknown;
  e005?: unknown;
  E0_05?: unknown;
  unbracedLength?: unknown;
  length?: unknown;
  segments?: TimberLtbSegmentInput[];
  unbracedSegments?: TimberLtbSegmentInput[];
}

interface TimberStabilityOptions extends JsonRecord {
  lateralTorsionalBuckling?: TimberLtbOptions;
  ltb?: TimberLtbOptions;
}

interface TimberLtbSegment extends JsonRecord {
  id: unknown;
  from: unknown;
  to: unknown;
  length: unknown;
}

interface TimberDeflectionCandidate {
  resultId: string;
  resultType: string | undefined;
  value: number;
  sample: TimberDisplacementSample;
  final: boolean;
}

interface ResolvedStrengths {
  gammaM: unknown;
  kmod: unknown;
  fmD: unknown;
  fvD: unknown;
  fc0D: unknown;
  ft0D: unknown;
}

interface LateralTorsionalStabilityChecks {
  checks: VerificationCheck[];
  warnings: string[];
  assumptions: string[];
  status: ResultStatus;
}

export interface TimberBeamVerificationOptions {
  code?: unknown;
  gammaM?: unknown;
  deflectionLimitDenominator?: unknown;
  finalDeflectionLimitDenominator?: unknown;
  stability?: TimberStabilityOptions;
  verificationStations?: BeamVerificationStations;
  metadata?: JsonRecord;
}

export interface TimberBeamVerificationInput {
  beamId?: unknown;
  section?: TimberVerificationSection | null;
  material?: TimberVerificationMaterial | null;
  analysisResult?: TimberBeamAnalysisResult | null;
  deflectionLimitDenominator?: unknown;
  finalDeflectionLimitDenominator?: unknown;
  stability?: TimberStabilityOptions;
  verificationStations?: BeamVerificationStations;
}

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function recordProperty(value: unknown, key: string): unknown {
  return isRecord(value) ? value[key] : undefined;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function numericOperand(value: unknown): number {
  return Number(value);
}

function numberOrNullish(value: unknown): number | null {
  return typeof value === "number" ? value : null;
}

function sourceString(value: unknown): string {
  return Reflect.apply(String, undefined, [value]);
}

function isUnknownArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

function normalizeLimitState(limitState: unknown): string {
  return Reflect.apply(String, undefined, [limitState ?? ""])
    .trim()
    .toUpperCase();
}

function normalizeCombinationType(combinationType: unknown): string {
  return Reflect.apply(String, undefined, [combinationType ?? ""])
    .trim()
    .toUpperCase()
    .replaceAll("-", "_");
}

function designStrength(
  value: unknown,
  { kmod, gammaM }: { kmod: unknown; gammaM: unknown },
): number | null {
  if (!isFiniteNumber(value) || !isFiniteNumber(kmod) || !isFiniteNumber(gammaM)) {
    return null;
  }

  return (kmod * value) / gammaM;
}

interface RatioCheck extends JsonRecord {
  id: string;
  description: string;
  demand: number;
  capacity: number;
  utilizationRatio: number;
  ok: boolean;
  metadata: JsonRecord;
}

function ratioCheck({
  id,
  description,
  utilizationRatio,
  metadata = {},
}: {
  id: string;
  description: string;
  utilizationRatio: number;
  metadata?: JsonRecord;
}): RatioCheck {
  const safeRatio = Number.isFinite(utilizationRatio) ? utilizationRatio : Infinity;

  return {
    id,
    description,
    demand: round(safeRatio),
    capacity: 1,
    utilizationRatio: round(safeRatio),
    ok: safeRatio <= 1,
    metadata,
  };
}

function combinationEntries(
  analysisResult: TimberBeamAnalysisResult = {},
): TimberVerificationResultEntry[] {
  return Object.values(analysisResult.combinations ?? {});
}

function loadCaseEntries(
  analysisResult: TimberBeamAnalysisResult = {},
): TimberVerificationResultEntry[] {
  return Object.values(analysisResult.loadCases ?? {});
}

function entriesByLimitState(
  entries: TimberVerificationResultEntry[],
  limitState: string,
): TimberVerificationResultEntry[] {
  return entries.filter(
    (entry) => normalizeLimitState(entry.context?.limitState) === normalizeLimitState(limitState),
  );
}

function isFinalServiceEntry(entry: TimberVerificationResultEntry): boolean {
  const serviceCombination = Reflect.apply(String, undefined, [
    entry.context?.serviceCombination ?? "",
  ])
    .trim()
    .toLowerCase();
  const deformationState = Reflect.apply(String, undefined, [entry.context?.deformationState ?? ""])
    .trim()
    .toLowerCase();

  return (
    serviceCombination === "final" ||
    serviceCombination === "quasi-permanent" ||
    deformationState === "final" ||
    entry.sectionProperties?.metadata?.finalStiffness === true
  );
}

function maxAbsDeflection(
  entries: TimberVerificationResultEntry[],
): TimberDeflectionCandidate | null {
  return entries.reduce<TimberDeflectionCandidate | null>((selected, entry) => {
    const sample = entry.displacements?.maxAbsVerticalDisplacement;

    if (!sample || !isFiniteNumber(sample.uy)) {
      return selected;
    }

    const candidate: TimberDeflectionCandidate = {
      resultId: entry.id,
      resultType: entry.resultType,
      value: Math.abs(sample.uy),
      sample,
      final: isFinalServiceEntry(entry),
    };

    return !selected || candidate.value > selected.value ? candidate : selected;
  }, null);
}

function spanForResult(
  entries: TimberVerificationResultEntry[],
  resultId: string | undefined,
  analysisResult: TimberBeamAnalysisResult,
): unknown {
  const result = entries.find((entry) => entry.id === resultId);

  return (
    result?.geometry?.length ??
    result?.geometry?.horizontalSpan ??
    analysisResult.geometry?.length ??
    analysisResult.geometry?.horizontalSpan ??
    null
  );
}

function resultEntries(
  analysisResult: TimberBeamAnalysisResult = {},
): TimberVerificationResultEntry[] {
  const combinations = combinationEntries(analysisResult);

  return combinations.length > 0 ? combinations : loadCaseEntries(analysisResult);
}

function lateralTorsionalBucklingOptions(stability: TimberStabilityOptions = {}): TimberLtbOptions {
  return stability.lateralTorsionalBuckling ?? stability.ltb ?? {};
}

function isLtbEnabled(options: TimberLtbOptions = {}): boolean {
  return options.enabled !== false && options.restrained !== true;
}

function optionValue(options: TimberLtbOptions, keys: string[], fallback: unknown = null): unknown {
  for (const key of keys) {
    if (options[key] != null) {
      return options[key];
    }
  }

  return fallback;
}

function ltbOptionValue(
  segment: TimberLtbSegment,
  options: TimberLtbOptions,
  keys: string[],
  fallback: unknown = null,
): unknown {
  for (const key of keys) {
    if (segment[key] != null) {
      return segment[key];
    }

    if (options[key] != null) {
      return options[key];
    }
  }

  return fallback;
}

function createLtbSegments({
  result,
  options,
}: {
  result: TimberVerificationResultEntry;
  options: TimberLtbOptions;
}): TimberLtbSegment[] {
  const span = result.geometry?.length ?? result.geometry?.horizontalSpan;
  const rawSegments = options.segments ?? options.unbracedSegments;

  if (Array.isArray(rawSegments) && rawSegments.length > 0) {
    return rawSegments.map((segment, index) => {
      const from = segment.from ?? segment.start ?? 0;
      const to = segment.to ?? segment.end ?? span;
      const length =
        segment.unbracedLength ??
        segment.length ??
        (isFiniteNumber(to) && isFiniteNumber(from) ? to - from : null);

      return {
        ...segment,
        id: segment.id ?? `ltb-segment-${index + 1}`,
        from,
        to,
        length,
      };
    });
  }

  return [
    {
      id: "ltb-full-span",
      from: 0,
      to: span,
      length: options.unbracedLength ?? options.length ?? span,
    },
  ];
}

function sampleInSegment(sample: BeamInternalForceSample, segment: TimberLtbSegment): boolean {
  const station = sample.station;
  const from = segment.from ?? 0;
  const to = segment.to;

  if (!isFiniteNumber(station)) {
    return false;
  }

  return (
    (!isFiniteNumber(from) || station >= from - 1e-9) &&
    (!isFiniteNumber(to) || station <= to + 1e-9)
  );
}

function sampleStrongAxisMoment(sample: BeamInternalForceSample): number {
  return numericOperand(sample.principalActions?.mY ?? sample.mY ?? sample.m ?? 0);
}

function sampleWeakAxisMoment(sample: BeamInternalForceSample): number {
  return numericOperand(sample.principalActions?.mZ ?? sample.mZ ?? 0);
}

function moreSevereCheck(
  candidate: VerificationCheck | null,
  selected: VerificationCheck | null,
): VerificationCheck | null {
  if (!candidate) {
    return selected;
  }

  if (
    !selected ||
    numericOperand(candidate.utilizationRatio) > numericOperand(selected.utilizationRatio)
  ) {
    return candidate;
  }

  return selected;
}

function copyMetadata(metadata: JsonRecord = {}): JsonRecord {
  return Object.fromEntries(
    Object.entries(metadata).map(([key, value]) => {
      if (isUnknownArray(value)) {
        return [key, [...value]];
      }

      if (isRecord(value)) {
        return [key, { ...value }];
      }

      return [key, value];
    }),
  );
}

function metadataRecord(check: VerificationCheck): JsonRecord {
  const metadata = recordProperty(check, "metadata");
  return isRecord(metadata) ? metadata : {};
}

function checkIdentifier(check: VerificationCheck): string {
  return Reflect.apply(String, undefined, [recordProperty(check, "id")]);
}

function copyCheck(check: VerificationCheck): VerificationCheck {
  return {
    ...check,
    metadata: copyMetadata(metadataRecord(check)),
  };
}

function mostSevereGroupedCheck(
  candidate: VerificationCheck,
  current: VerificationCheck | undefined,
): boolean {
  if (!current) {
    return true;
  }

  return numericOperand(candidate.utilizationRatio) > numericOperand(current.utilizationRatio);
}

function resolveStrengths({
  material,
  sectionProperties,
  gammaM,
  fallbackKmod,
}: {
  material: TimberVerificationMaterial;
  sectionProperties?: unknown;
  gammaM?: unknown;
  fallbackKmod: unknown;
}): ResolvedStrengths {
  const metadataValue = recordProperty(sectionProperties, "metadata");
  const metadata = isRecord(metadataValue) ? metadataValue : {};
  const materialMetadata = material.metadata ?? {};
  const resolvedGammaM = gammaM ?? metadata.gammaM ?? materialMetadata.gammaM ?? 1.5;
  const resolvedKmod = metadata.kmod ?? fallbackKmod ?? material.kmod;

  return {
    gammaM: resolvedGammaM,
    kmod: resolvedKmod,
    fmD:
      metadata.fmD ?? designStrength(material.fmK, { kmod: resolvedKmod, gammaM: resolvedGammaM }),
    fvD:
      metadata.fvD ?? designStrength(material.fvK, { kmod: resolvedKmod, gammaM: resolvedGammaM }),
    fc0D:
      metadata.fc0D ??
      designStrength(material.fc0K, { kmod: resolvedKmod, gammaM: resolvedGammaM }),
    ft0D:
      metadata.ft0D ??
      designStrength(material.ft0K, { kmod: resolvedKmod, gammaM: resolvedGammaM }),
  };
}

function createLateralTorsionalStabilityChecks({
  analysisResult,
  section,
  material,
  resultToSectionUnits,
  stability = {},
  gammaM = null,
}: {
  analysisResult: TimberBeamAnalysisResult;
  section: TimberVerificationSection;
  material: TimberVerificationMaterial;
  resultToSectionUnits: UnitResolver;
  stability?: TimberStabilityOptions;
  gammaM?: unknown;
}): LateralTorsionalStabilityChecks {
  const options = lateralTorsionalBucklingOptions(stability);
  const checks: VerificationCheck[] = [];
  const warnings: string[] = [];
  const assumptions: string[] = [];

  if (!isLtbEnabled(options)) {
    assumptions.push(
      "Timber lateral-torsional stability check is disabled because the beam is declared restrained or ltb.enabled is false.",
    );
    return {
      checks,
      warnings,
      assumptions,
      status: RESULT_STATUS.OK,
    };
  }

  assumptions.push(
    "Timber lateral-torsional stability is checked on ULS FEM principal-axis bending for declared unbraced segments; automatic kcrit is limited to rectangular sections unless kcrit or sigmaMcrit is provided.",
  );
  assumptions.push(
    "The strong-axis moment My is reduced by kcrit; any weak-axis moment Mz from section rotation is included as an elastic weak-axis bending term.",
  );

  const ulsEntries = resultEntries(analysisResult).filter(
    (entry) => normalizeLimitState(entry.context?.limitState) === "ULS",
  );

  if (ulsEntries.length === 0) {
    warnings.push("No ULS FEM result was found for timber lateral-torsional stability.");
  }

  for (const result of ulsEntries) {
    for (const segment of createLtbSegments({ result, options })) {
      const unbracedLength = isFiniteNumber(segment.length)
        ? resultToSectionUnits.length(segment.length)
        : null;
      const segmentSamples = (result.internalForces?.samples ?? []).filter((sample) =>
        sampleInSegment(sample, segment),
      );

      if (segmentSamples.length === 0) {
        warnings.push(
          `No FEM internal-force sample was found for timber LTB segment ${sourceString(segment.id)}.`,
        );
        continue;
      }

      if (!isFinitePositive(unbracedLength)) {
        warnings.push(
          `Timber LTB segment ${sourceString(segment.id)} requires a positive unbraced length.`,
        );
        continue;
      }

      const strengths = resolveStrengths({
        material,
        sectionProperties: result.sectionProperties,
        gammaM,
        fallbackKmod: material.kmod,
      });
      let selectedCheck: TimberLateralTorsionalCheck | null = null;
      let selectedSample: BeamInternalForceSample | null = null;

      for (const sample of segmentSamples) {
        const myEdSectionUnits = resultToSectionUnits.moment(sampleStrongAxisMoment(sample));
        const mzEdSectionUnits = resultToSectionUnits.moment(sampleWeakAxisMoment(sample));
        const ltbResult = verifyTimberLateralTorsionalStability({
          section,
          material,
          myEd: myEdSectionUnits,
          mzEd: mzEdSectionUnits,
          unbracedLength,
          fmD: numberOrNullish(strengths.fmD),
          fmK: numberOrNullish(optionValue(options, ["fmK"], material.fmK)),
          kcrit: numberOrNullish(ltbOptionValue(segment, options, ["kcrit", "kCrit"])),
          sigmaMcrit: numberOrNullish(
            ltbOptionValue(segment, options, ["sigmaMcrit", "sigmaMcr", "criticalBendingStress"]),
          ),
          e0_05: numberOrNullish(ltbOptionValue(segment, options, ["e0_05", "e005", "E0_05"])),
          metadata: {
            kmod: round(strengths.kmod),
            gammaM: round(strengths.gammaM),
          },
        });

        warnings.push(...ltbResult.warnings);

        if (!ltbResult.check) {
          continue;
        }

        if (
          !selectedCheck ||
          numericOperand(ltbResult.check.utilizationRatio) >
            numericOperand(selectedCheck.utilizationRatio)
        ) {
          selectedCheck = ltbResult.check;
          selectedSample = sample;
        }
      }

      if (!selectedCheck || !selectedSample) {
        warnings.push(
          `Timber LTB verification was not generated for segment ${sourceString(segment.id)}.`,
        );
        continue;
      }

      const myEd = sampleStrongAxisMoment(selectedSample);
      const mzEd = sampleWeakAxisMoment(selectedSample);

      checks.push({
        ...selectedCheck,
        utilizationRatio: numericOperand(selectedCheck.utilizationRatio),
        metadata: {
          ...selectedCheck.metadata,
          resultId: result.id,
          resultType: result.resultType,
          station: selectedSample.station,
          limitState: result.context?.limitState ?? null,
          combinationType: normalizeCombinationType(result.context?.combinationType),
          segmentId: segment.id,
          segmentFrom: round(segment.from),
          segmentTo: round(segment.to),
          unbracedLength: round(segment.length),
          unbracedLengthSectionUnits: round(unbracedLength),
          myEd: round(myEd),
          mzEd: round(mzEd),
          myEdSectionUnits: round(resultToSectionUnits.moment(myEd)),
          mzEdSectionUnits: round(resultToSectionUnits.moment(mzEd)),
          principalAxes: selectedSample.principalActions
            ? {
                alpha: selectedSample.principalActions.alpha,
                convention: selectedSample.principalActions.convention,
              }
            : null,
        },
      });
    }
  }

  if (checks.length === 0) {
    warnings.push(
      "No timber lateral-torsional stability check was generated; provide ULS FEM results and valid unbraced length data, or declare the beam restrained when applicable.",
    );
  }

  return {
    checks,
    warnings: uniqueStrings(warnings),
    assumptions,
    status:
      checks.length > 0 && checks.every((check) => check.ok === true)
        ? RESULT_STATUS.OK
        : RESULT_STATUS.NOT_VERIFIED,
  };
}

function createTimberActionVerifier({
  section,
  material,
  sectionToResultUnits,
  gammaM,
}: {
  section: TimberVerificationSection;
  material: TimberVerificationMaterial;
  sectionToResultUnits: UnitResolver;
  gammaM: unknown;
}): BeamSectionActionVerificationProvider {
  return {
    verifySectionActions({ vEd, mEd, principalActions, context }) {
      const strengths = resolveStrengths({
        material,
        sectionProperties: context?.sectionProperties,
        gammaM,
        fallbackKmod: material.kmod,
      });
      const mYEd = principalActions?.mY ?? mEd ?? 0;
      const mZEd = principalActions?.mZ ?? 0;
      const vYEd = principalActions?.vY ?? vEd ?? 0;
      const vZEd = principalActions?.vZ ?? 0;
      const bendingCapacityY = sectionToResultUnits.moment(
        numericOperand(strengths.fmD) * numericOperand(section.elasticSectionModulusY),
      );
      const bendingCapacityZ = Number.isFinite(section.elasticSectionModulusZ)
        ? sectionToResultUnits.moment(
            numericOperand(strengths.fmD) * numericOperand(section.elasticSectionModulusZ),
          )
        : null;
      const shearArea = section.shearAreaY ?? section.area;
      const shearAreaZ = section.shearAreaZ ?? section.area;
      const shearCapacityY = sectionToResultUnits.force(
        (numericOperand(strengths.fvD) * numericOperand(shearArea)) / 1.5,
      );
      const shearCapacityZ = sectionToResultUnits.force(
        (numericOperand(strengths.fvD) * numericOperand(shearAreaZ)) / 1.5,
      );
      const bendingRatioY = Math.abs(mYEd) / bendingCapacityY;
      const bendingRatioZ =
        isFiniteNumber(bendingCapacityZ) && bendingCapacityZ > 0
          ? Math.abs(mZEd) / bendingCapacityZ
          : Math.abs(mZEd) > 1e-12
            ? Infinity
            : 0;
      const bending = ratioCheck({
        id: "timber-bending",
        description: "Biaxial bending stress verification on principal section axes",
        utilizationRatio: bendingRatioY + bendingRatioZ,
        metadata: {
          fmD: round(strengths.fmD),
          kmod: round(strengths.kmod),
          gammaM: round(strengths.gammaM),
          actionBasis: principalActions ? "principal-actions" : "global-actions",
          mYEd: round(mYEd),
          mZEd: round(mZEd),
          bendingCapacityY: round(bendingCapacityY),
          bendingCapacityZ: round(bendingCapacityZ),
          utilizationRatioY: round(bendingRatioY),
          utilizationRatioZ: round(bendingRatioZ),
        },
      });
      const shearRatioY = Math.abs(vYEd) / shearCapacityY;
      const shearRatioZ = Math.abs(vZEd) / shearCapacityZ;
      const shear = ratioCheck({
        id: "timber-shear",
        description: "Biaxial shear verification on principal section axes",
        utilizationRatio: shearRatioY + shearRatioZ,
        metadata: {
          fvD: round(strengths.fvD),
          shearArea: round(shearArea),
          shearAreaY: round(shearArea),
          shearAreaZ: round(shearAreaZ),
          vYEd: round(vYEd),
          vZEd: round(vZEd),
          shearCapacityY: round(shearCapacityY),
          shearCapacityZ: round(shearCapacityZ),
          utilizationRatioY: round(shearRatioY),
          utilizationRatioZ: round(shearRatioZ),
        },
      });
      const governing = bending.utilizationRatio >= shear.utilizationRatio ? bending : shear;

      return {
        status: bending.ok && shear.ok ? RESULT_STATUS.OK : RESULT_STATUS.NOT_VERIFIED,
        utilizationRatio: governing.utilizationRatio,
        demand: governing.demand,
        capacity: governing.capacity,
        checks: [bending, shear],
        metadata: {
          governingCheckId: governing.id,
        },
      };
    },
  };
}

export class TimberBeamVerification {
  code: unknown;
  gammaM: unknown;
  deflectionLimitDenominator: unknown;
  finalDeflectionLimitDenominator: unknown;
  stability: TimberStabilityOptions;
  verificationStations: BeamVerificationStations;
  metadata: JsonRecord;

  constructor({
    code = "NTC2018",
    gammaM = null,
    deflectionLimitDenominator = 300,
    finalDeflectionLimitDenominator = null,
    stability = {},
    verificationStations = null,
    metadata = {},
  }: TimberBeamVerificationOptions = {}) {
    this.code = code;
    this.gammaM = gammaM;
    this.deflectionLimitDenominator = deflectionLimitDenominator;
    this.finalDeflectionLimitDenominator =
      finalDeflectionLimitDenominator ?? deflectionLimitDenominator;
    this.stability = { ...stability };
    this.verificationStations = verificationStations;
    this.metadata = { ...metadata };
  }

  verify({
    beamId = null,
    section = null,
    material = null,
    analysisResult = null,
    deflectionLimitDenominator = this.deflectionLimitDenominator,
    finalDeflectionLimitDenominator = this.finalDeflectionLimitDenominator,
    stability = this.stability,
    verificationStations = this.verificationStations,
  }: TimberBeamVerificationInput = {}): VerificationResult {
    if (!section || !material || !analysisResult) {
      return new VerificationResult({
        applicationId: "timber-beams",
        status: RESULT_STATUS.NOT_IMPLEMENTED,
        summary: "Timber beam verification workflow scaffolded.",
        warnings: ["Bending, shear, deflection and lateral stability checks are placeholders."],
        metadata: {
          code: this.code,
          beamId,
          ...this.metadata,
        },
      });
    }

    const resultUnits = analysisResult.units;
    const sectionUnits = section.metadata?.unitSystem ?? DEFAULT_SECTION_UNITS;
    const sectionToResultUnits = createUnitResolver(sectionUnits, resultUnits);
    const resultToSectionUnits = createUnitResolver(resultUnits, sectionUnits);
    const allEntries = combinationEntries(analysisResult);
    const availableEntries = allEntries.length > 0 ? allEntries : loadCaseEntries(analysisResult);
    const sleEntries = entriesByLimitState(availableEntries, "SLE");
    const instantSleEntries = sleEntries.filter((entry) => !isFinalServiceEntry(entry));
    const finalSleEntries = sleEntries.filter(isFinalServiceEntry);
    const actionVerification = new BeamSectionActionVerifier({
      applicationId: "timber-beams",
      sectionVerifier: createTimberActionVerifier({
        section,
        material,
        sectionToResultUnits,
        gammaM: this.gammaM,
      }),
      limitStates: "ULS",
      verificationStations,
    }).verify({ analysisResult });
    const lateralTorsionalStability = createLateralTorsionalStabilityChecks({
      analysisResult,
      section,
      material,
      resultToSectionUnits,
      stability,
      gammaM: this.gammaM,
    });
    const governingDeflection = maxAbsDeflection(
      instantSleEntries.length > 0 ? instantSleEntries : sleEntries,
    );
    const governingFinalDeflection = maxAbsDeflection(finalSleEntries);
    const span = spanForResult(availableEntries, governingDeflection?.resultId, analysisResult);
    const finalSpan = spanForResult(
      availableEntries,
      governingFinalDeflection?.resultId,
      analysisResult,
    );
    const deflectionCheck =
      governingDeflection && isFinitePositive(span)
        ? utilizationCheck({
            id: "timber-deflection",
            description: "Serviceability vertical deflection verification",
            demand: governingDeflection.sample?.uy ?? governingDeflection.value,
            capacity: span / numericOperand(deflectionLimitDenominator),
            metadata: {
              resultId: governingDeflection.resultId,
              station: governingDeflection.sample?.station ?? null,
              limitDenominator: deflectionLimitDenominator,
            },
          })
        : null;
    const finalDeflectionCheck =
      governingFinalDeflection == null || !isFinitePositive(finalSpan)
        ? null
        : utilizationCheck({
            id: "timber-final-deflection",
            description: "Final serviceability vertical deflection verification",
            demand: governingFinalDeflection.sample?.uy ?? governingFinalDeflection.value,
            capacity: finalSpan / numericOperand(finalDeflectionLimitDenominator),
            metadata: {
              resultId: governingFinalDeflection.resultId,
              station: governingFinalDeflection.sample?.station ?? null,
              limitDenominator: finalDeflectionLimitDenominator,
            },
          });
    const governingActionChecks = Object.values(
      actionVerification.checks.reduce<Record<string, VerificationCheck>>((acc, check) => {
        const id = checkIdentifier(check);
        const current = acc[id];

        if (
          !current ||
          numericOperand(check.utilizationRatio) > numericOperand(current.utilizationRatio)
        ) {
          acc[id] = check;
        }

        return acc;
      }, {}),
    );
    const checks: VerificationCheck[] = [
      ...governingActionChecks,
      ...lateralTorsionalStability.checks,
      ...(deflectionCheck ? [deflectionCheck] : []),
      ...(finalDeflectionCheck ? [finalDeflectionCheck] : []),
    ];
    const groupedChecks = Object.values(
      checks.reduce<Record<string, VerificationCheck>>((acc, check) => {
        const id = checkIdentifier(check);

        if (mostSevereGroupedCheck(check, acc[id])) {
          acc[id] = check;
        }

        return acc;
      }, {}),
    );
    const governingCheck = groupedChecks.reduce<VerificationCheck | null>(
      (selected, check) => moreSevereCheck(check, selected),
      null,
    );
    const ulsOk = actionVerification.status === RESULT_STATUS.OK;
    const lateralStabilityOk = lateralTorsionalStability.status === RESULT_STATUS.OK;
    const deflectionOk =
      (!deflectionCheck || deflectionCheck.ok) &&
      (!finalDeflectionCheck || finalDeflectionCheck.ok);
    const serviceabilityStatus =
      deflectionCheck || finalDeflectionCheck
        ? deflectionOk
          ? RESULT_STATUS.OK
          : RESULT_STATUS.NOT_VERIFIED
        : RESULT_STATUS.NOT_ANALYZED;

    return new VerificationResult({
      applicationId: "timber-beams",
      status:
        ulsOk && lateralStabilityOk && deflectionOk ? RESULT_STATUS.OK : RESULT_STATUS.NOT_VERIFIED,
      summary:
        "Timber beam bending, shear, lateral stability and deflection verification from FEM beam results.",
      utilizationRatio: governingCheck ? numericOperand(governingCheck.utilizationRatio) : null,
      demand: governingCheck ? recordProperty(governingCheck, "demand") : null,
      capacity: governingCheck ? recordProperty(governingCheck, "capacity") : null,
      checks: groupedChecks,
      outputs: {
        stationResultCount: actionVerification.outputs.stationResultCount,
        uls: actionVerification.outputs,
        stability: {
          lateralTorsionalBuckling: {
            status: lateralTorsionalStability.status,
            checkCount: lateralTorsionalStability.checks.length,
            checks: lateralTorsionalStability.checks.map(copyCheck),
          },
        },
        serviceability: {
          status: serviceabilityStatus,
          deflectionLimitDenominator,
          finalDeflectionLimitDenominator,
          checks: [
            ...(deflectionCheck ? [deflectionCheck] : []),
            ...(finalDeflectionCheck ? [finalDeflectionCheck] : []),
          ].map(copyCheck),
        },
        governing: governingCheck
          ? {
              utilizationRatio: governingCheck.utilizationRatio,
              demand: recordProperty(governingCheck, "demand"),
              capacity: recordProperty(governingCheck, "capacity"),
              metadata: copyMetadata(metadataRecord(governingCheck)),
            }
          : null,
      },
      warnings: uniqueStrings([
        ...(deflectionCheck || finalDeflectionCheck
          ? []
          : ["No SLE timber deflection check was generated because no SLE combination was found."]),
        ...actionVerification.warnings,
        ...lateralTorsionalStability.warnings,
      ]),
      assumptions: [
        ...actionVerification.assumptions,
        ...lateralTorsionalStability.assumptions,
        `SLE vertical deflection limit defaults to L/${sourceString(deflectionLimitDenominator)} unless overridden.`,
      ],
      metadata: {
        code: this.code,
        beamId,
        governingCheckId: recordProperty(governingCheck, "id") ?? null,
        verificationStations,
        ...this.metadata,
      },
    });
  }
}
