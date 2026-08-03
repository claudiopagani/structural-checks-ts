// Mechanical TypeScript migration from strutture-js 6f33baead8b88166c4b2cf94af41763412e3c751; source path: src/applications/steel-frames/checks/SteelMemberVerificationPolicies.js.

import {
  createUnitResolver,
  type UnitResolver,
  type UnitSystemInput,
} from "../../../domain/units/UnitSystem.js";
import { RESULT_STATUS, type ResultStatus } from "../../../core/results/resultStatus.js";
import {
  governingCheck,
  isFinitePositive,
  round,
  uniqueStrings,
  utilizationCheck,
  type UtilizationCheck,
} from "../../../core/results/checkUtils.js";
import {
  calculateSteelMomentDiagramFactor,
  steelNotSupportedCheck,
} from "./SteelAdvancedMemberChecks.js";
import {
  verifySteelBeamColumnInteractionMy,
  verifySteelBeamColumnInteractionMyMz,
  type SteelBeamColumnInteractionCheck,
  type SteelBeamColumnInteractionResult,
} from "./SteelBeamColumnInteraction.js";
import {
  verifySteelCompressionBuckling,
  type SteelCompressionBucklingCheck,
} from "./SteelCompressionBuckling.js";
import {
  verifySteelLateralTorsionalBuckling,
  type SteelLateralTorsionalCheck,
} from "./SteelLateralTorsionalBuckling.js";
import {
  classifySteelSection,
  type SteelSectionClassificationResult,
} from "./SteelSectionClassification.js";

const DEFAULT_SECTION_UNITS = Object.freeze({ force: "N", length: "mm" }) satisfies UnitSystemInput;
export { DEFAULT_SECTION_UNITS };

interface PolicyCatalogProperties extends Record<string, unknown> {
  family?: string | null;
  h?: number | null;
  height?: number | null;
  b?: number | null;
  width?: number | null;
  tw?: number | null;
  webThickness?: number | null;
  tf?: number | null;
  flangeThickness?: number | null;
  r?: number | null;
}

interface PolicyMetadata extends Record<string, unknown> {
  gammaM0?: number | null;
  gammaM1?: number | null;
  fyd?: number | null;
  catalogUnitSystem?: UnitSystemInput | null;
  unitSystem?: UnitSystemInput | null;
}

export interface SteelMemberVerificationPolicySection extends Record<string, unknown> {
  family?: string | null;
  catalogProperties?: PolicyCatalogProperties | null;
  convertedCatalogProperties?: Record<string, unknown> | null;
  metadata?: PolicyMetadata | null;
  area?: number | null;
  height?: number | null;
  width?: number | null;
  webThickness?: number | null;
  flangeThickness?: number | null;
  rootRadius?: number | null;
  shearAreaY?: number | null;
  shearAreaZ?: number | null;
  elasticSectionModulusY?: number | null;
  elasticSectionModulusZ?: number | null;
  plasticSectionModulusY?: number | null;
  plasticSectionModulusZ?: number | null;
  inertiaY?: number | null;
  inertiaZ?: number | null;
  torsionalConstant?: number | null;
  warpingConstant?: number | null;
}

export interface SteelMemberVerificationPolicyMaterial extends Record<string, unknown> {
  fyk?: number | null;
  fyd?: number | null;
  E?: number | null;
  elasticModulus?: number | null;
  shearModulus?: number | null;
  poissonRatio?: number | null;
  metadata?: PolicyMetadata | null;
}

interface PolicyPrincipalActions extends Record<string, number | null | undefined> {
  vY?: number | null;
  vZ?: number | null;
  mY?: number | null;
  mZ?: number | null;
}

interface PolicySample extends Record<string, unknown> {
  station: number;
  n?: number | null;
  v?: number | null;
  m?: number | null;
  t?: number | null;
  vY?: number | null;
  vZ?: number | null;
  mY?: number | null;
  mZ?: number | null;
  principalActions?: PolicyPrincipalActions | null;
}

interface PolicyResultEntry extends Record<string, unknown> {
  id: string;
  resultType?: string;
  geometry?: {
    length?: number | null;
    horizontalSpan?: number | null;
    [key: string]: unknown;
  };
  internalForces?: {
    samples?: PolicySample[];
    [key: string]: unknown;
  };
  supports?: PolicySupport[];
  context?: {
    limitState?: string | null;
    combinationType?: string | null;
    [key: string]: unknown;
  };
  displacements?: {
    maxAbsVerticalDisplacement?: { uy?: number | null; station?: number | null };
    [key: string]: unknown;
  };
}

interface PolicyAnalysisResult extends Record<string, unknown> {
  combinations?: Record<string, PolicyResultEntry>;
}

interface PolicyOptionRecord extends Record<string, unknown> {
  enabled?: boolean;
  restrained?: boolean;
  segments?: PolicySegment[];
  unbracedSegments?: PolicySegment[];
  unbracedLength?: number | null;
  compressionBuckling?: PolicyOptionRecord;
}

interface PolicySegment extends Record<string, unknown> {
  id?: string;
  from?: number | null;
  to?: number | null;
  start?: number | null;
  end?: number | null;
  length?: number | null;
}

interface PolicySupport extends Record<string, unknown> {
  station?: number | null;
  restraints?: Record<string, unknown> | null;
}

interface PolicyClassificationOptions extends Record<string, unknown> {
  axialForceConvention?: string;
}

interface PolicyResistanceOptions extends Record<string, unknown> {
  allowPlastic?: boolean;
}

interface PolicyStabilityOptions extends Record<string, unknown> {
  lateralTorsionalBuckling?: PolicyOptionRecord;
  ltb?: PolicyOptionRecord;
  compressionBuckling?: PolicyOptionRecord;
  buckling?: PolicyOptionRecord;
  beamColumnInteraction?: PolicyOptionRecord;
  interaction?: PolicyOptionRecord;
}

interface PolicyCheck extends Record<string, unknown> {
  id: string;
  description?: string;
  demand?: number | null;
  capacity?: number | null;
  utilizationRatio: number | null;
  ok?: boolean;
  metadata?: Record<string, unknown>;
}

interface PolicyChecksResult {
  checks: PolicyCheck[];
  warnings: string[];
  assumptions: string[];
  status: ResultStatus;
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function numberOrNull(value: unknown): number | null {
  return isNumber(value) ? value : null;
}

function stringValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "bigint" ||
    typeof value === "symbol"
  ) {
    return String(value);
  }
  return Object.prototype.toString.call(value);
}

function metadataNumber(
  metadata: Record<string, unknown> | null | undefined,
  key: string,
): number | null {
  return numberOrNull(metadata?.[key]);
}

function checkMetadata(check: PolicyCheck | null | undefined): Record<string, unknown> {
  return check?.metadata ?? {};
}

function policySamples(result: PolicyResultEntry): PolicySample[] {
  return result.internalForces?.samples ?? [];
}

export function hasSignificantAction(value: unknown, tolerance = 1e-9): boolean {
  return isNumber(value) && Math.abs(value) > tolerance;
}

export function designStrength(
  material: SteelMemberVerificationPolicyMaterial | null | undefined,
  gammaM0: number | null | undefined,
): number | null {
  if (isNumber(material?.fyd)) {
    return material.fyd;
  }

  if (isNumber(material?.fyk) && isNumber(gammaM0)) {
    return material.fyk / gammaM0;
  }

  return null;
}

export function classificationPartById(
  classificationResult: SteelSectionClassificationResult,
  id: string,
): SteelSectionClassificationResult["parts"][number] | null {
  return classificationResult.parts.find((part) => part.id === id) ?? null;
}

export function classificationPartMetadata(
  classificationResult: SteelSectionClassificationResult,
  key: string,
): Record<string, unknown> {
  return Object.fromEntries(
    classificationResult.parts.map((part) => [part.id, { ...part }[key] ?? null]),
  );
}

export function classificationPartSeverity(
  part: SteelSectionClassificationResult["parts"][number] | null | undefined,
): number {
  if (!isNumber(part?.ratio) || !isFinitePositive(part.limits?.class3)) {
    return 0;
  }

  return part.ratio / part.limits.class3;
}

export function classificationSeverity(
  classificationResult: SteelSectionClassificationResult,
): number {
  return Math.max(...classificationResult.parts.map((part) => classificationPartSeverity(part)), 0);
}

export function classificationActionMagnitude(check: PolicyCheck): number {
  return (
    Math.abs(
      metadataNumber(check.metadata, "nEdSectionUnits") ??
        metadataNumber(check.metadata, "nEd") ??
        0,
    ) +
    Math.abs(
      metadataNumber(check.metadata, "mEdSectionUnits") ??
        metadataNumber(check.metadata, "mEd") ??
        0,
    )
  );
}

export function isMoreSevereGroupedCheck(
  candidate: PolicyCheck,
  current: PolicyCheck | null | undefined,
): boolean {
  if (!current) {
    return true;
  }

  if (candidate.id === "steel-section-classification") {
    const candidateClass = metadataNumber(candidate.metadata, "sectionClass") ?? 0;
    const currentClass = metadataNumber(current.metadata, "sectionClass") ?? 0;

    if (candidateClass !== currentClass) {
      return candidateClass > currentClass;
    }

    const candidateSeverity = metadataNumber(candidate.metadata, "classificationSeverity") ?? 0;
    const currentSeverity = metadataNumber(current.metadata, "classificationSeverity") ?? 0;

    if (candidateSeverity !== currentSeverity) {
      return candidateSeverity > currentSeverity;
    }

    return classificationActionMagnitude(candidate) > classificationActionMagnitude(current);
  }

  return (candidate.utilizationRatio ?? -Infinity) > (current.utilizationRatio ?? -Infinity);
}

export function resultEntries(
  resultMap: Record<string, PolicyResultEntry> | null | undefined = {},
): PolicyResultEntry[] {
  return Object.values(resultMap ?? {});
}

export function normalizeLimitState(limitState: unknown): string {
  return stringValue(limitState).trim().toUpperCase();
}

export function normalizeCombinationType(combinationType: unknown): string {
  return stringValue(combinationType).trim().toUpperCase().replaceAll("-", "_");
}

export function steelSectionModulus(
  section: SteelMemberVerificationPolicySection,
  type = "elastic",
  axis = "Y",
): number | null {
  const normalizedAxis = stringValue(axis).toUpperCase();
  const keys =
    type === "plastic"
      ? normalizedAxis === "Z"
        ? ["Wpl_z", "Wpl_weak"]
        : ["Wpl_y", "Wpl_strong"]
      : normalizedAxis === "Z"
        ? ["Wel_z", "Wel_weak"]
        : ["Wel_y", "Wel_strong"];

  for (const key of keys) {
    const value = section.convertedCatalogProperties?.[key];

    if (isNumber(value)) {
      return value;
    }

    const rawValue = section.catalogProperties?.[key];

    if (isNumber(rawValue) && section.metadata?.catalogUnitSystem) {
      return createUnitResolver(
        section.metadata.catalogUnitSystem,
        DEFAULT_SECTION_UNITS,
      ).sectionModulus(rawValue);
    }
  }

  if (type === "plastic") {
    return normalizedAxis === "Z"
      ? numberOrNull(section.plasticSectionModulusZ)
      : numberOrNull(section.plasticSectionModulusY);
  }

  return normalizedAxis === "Z"
    ? numberOrNull(section.elasticSectionModulusZ)
    : numberOrNull(section.elasticSectionModulusY);
}

export function selectBendingResistanceBasis({
  classificationResult,
  elasticSectionModulus,
  plasticSectionModulus,
  allowPlasticResistance = true,
}: {
  classificationResult: SteelSectionClassificationResult;
  elasticSectionModulus: number | null;
  plasticSectionModulus: number | null;
  allowPlasticResistance?: boolean;
}): { basis: string; sectionModulus: number | null; warning: string | null } {
  const sectionClass = classificationResult.class ?? 4;

  if (allowPlasticResistance && sectionClass <= 2 && isFinitePositive(plasticSectionModulus)) {
    return { basis: "plastic", sectionModulus: plasticSectionModulus, warning: null };
  }

  if (allowPlasticResistance && sectionClass <= 2 && !isFinitePositive(plasticSectionModulus)) {
    return {
      basis: "elastic",
      sectionModulus: elasticSectionModulus,
      warning:
        "Plastic bending resistance was requested for class 1/2 steel section, but Wpl is not available; elastic modulus is used.",
    };
  }

  return {
    basis: sectionClass === 3 ? "elastic-class-3" : "elastic",
    sectionModulus: elasticSectionModulus,
    warning: null,
  };
}

export function steelShearArea(section: SteelMemberVerificationPolicySection): number | null {
  return numberOrNull(section.shearAreaY ?? section.area);
}

export function createDeflectionChecks({
  analysisResult,
  deflectionLimitRatio,
}: {
  analysisResult: PolicyAnalysisResult;
  deflectionLimitRatio: number | null | undefined;
}): UtilizationCheck[] {
  const checks: UtilizationCheck[] = [];

  for (const result of resultEntries(analysisResult.combinations)) {
    if (normalizeLimitState(result.context?.limitState) !== "SLE") continue;

    const span = result.geometry?.length ?? result.geometry?.horizontalSpan;
    const maxDeflection = result.displacements?.maxAbsVerticalDisplacement;
    const demand = Math.abs(maxDeflection?.uy ?? 0);
    const capacity =
      isFinitePositive(span) && isFinitePositive(deflectionLimitRatio)
        ? span / deflectionLimitRatio
        : null;

    if (!isFinitePositive(capacity)) continue;

    checks.push(
      utilizationCheck({
        id: "steel-sle-deflection",
        description: "Steel beam vertical deflection in service",
        demand,
        capacity,
        metadata: {
          method: "ntc2018-4.2.4.2.1-screening",
          resultId: result.id,
          resultType: result.resultType,
          limitState: result.context?.limitState ?? null,
          combinationType: normalizeCombinationType(result.context?.combinationType),
          station: round(maxDeflection?.station ?? null),
          span: round(span ?? null),
          deflectionLimitRatio,
          maxAbsDeflection: round(demand),
        },
      }),
    );
  }

  return checks;
}

export function lateralTorsionalBucklingOptions(
  stability: PolicyStabilityOptions = {},
): PolicyOptionRecord {
  return stability.lateralTorsionalBuckling ?? stability.ltb ?? {};
}

export function isLtbEnabled(options: PolicyOptionRecord = {}): boolean {
  return options.enabled !== false && options.restrained !== true;
}

export function ltbOptionValue(
  segment: PolicySegment | null | undefined,
  options: PolicyOptionRecord,
  keys: readonly string[],
  fallback: unknown = null,
): unknown {
  for (const key of keys) {
    if (segment?.[key] != null) return segment[key];
    if (options[key] != null) return options[key];
  }
  return fallback;
}

export function createLtbSegments({
  result,
  options,
}: {
  result: PolicyResultEntry;
  options: PolicyOptionRecord;
}): PolicySegment[] {
  const span = result.geometry?.length ?? result.geometry?.horizontalSpan ?? null;
  const rawSegments = options.segments ?? options.unbracedSegments;

  if (Array.isArray(rawSegments) && rawSegments.length > 0) {
    return rawSegments.map((segment, index) => {
      const from = segment.from ?? segment.start ?? 0;
      const to = segment.to ?? segment.end ?? span;
      const length = segment.length ?? (isNumber(to) && isNumber(from) ? to - from : null);

      return { ...segment, id: segment.id ?? `ltb-segment-${index + 1}`, from, to, length };
    });
  }

  return [
    {
      id: "ltb-full-span",
      from: 0,
      to: span,
      length: options.unbracedLength ?? span,
    },
  ];
}

export function sampleInSegment(sample: PolicySample, segment: PolicySegment): boolean {
  const station = sample.station;
  const from = segment.from ?? 0;
  const to = segment.to;

  if (!isNumber(station)) return false;
  return (!isNumber(from) || station >= from - 1e-9) && (!isNumber(to) || station <= to + 1e-9);
}

export function sampleStrongAxisMoment(sample: PolicySample): number {
  return sample.principalActions?.mY ?? sample.mY ?? sample.m ?? 0;
}

export function maxAbsMomentSample(
  samples: readonly PolicySample[],
  segment: PolicySegment,
): PolicySample | null {
  return samples
    .filter((sample) => sampleInSegment(sample, segment))
    .reduce<PolicySample | null>((selected, sample) => {
      if (
        !selected ||
        Math.abs(sampleStrongAxisMoment(sample)) > Math.abs(sampleStrongAxisMoment(selected))
      ) {
        return sample;
      }
      return selected;
    }, null);
}

export function ltbOptionMomentToSectionUnits(
  value: unknown,
  resultToSectionUnits: UnitResolver,
): number | null {
  return isNumber(value) ? resultToSectionUnits.moment(value) : null;
}

export function optionValue(
  options: PolicyOptionRecord,
  keys: readonly string[],
  fallback: unknown = null,
): unknown {
  for (const key of keys) {
    if (options[key] != null) return options[key];
  }
  return fallback;
}

export function compressionBucklingOptions(
  stability: PolicyStabilityOptions = {},
): PolicyOptionRecord {
  return stability.compressionBuckling ?? stability.buckling ?? {};
}

export function beamColumnInteractionOptions(
  stability: PolicyStabilityOptions = {},
): PolicyOptionRecord {
  return stability.beamColumnInteraction ?? stability.interaction ?? {};
}

export function isCompressionBucklingEnabled(options: PolicyOptionRecord = {}): boolean {
  return options.enabled !== false;
}

export function isBeamColumnInteractionEnabled(options: PolicyOptionRecord = {}): boolean {
  return options.enabled !== false;
}

export function compressionAxialForce(nEd: unknown, convention = "absolute"): number {
  if (!isNumber(nEd)) return 0;
  if (convention === "compression-positive") return Math.max(nEd, 0);
  if (convention === "compression-negative") return Math.max(-nEd, 0);
  return Math.abs(nEd);
}

export function supportAtStation(
  supports: readonly PolicySupport[],
  station: number,
  tolerance: number,
): PolicySupport | undefined {
  return supports.find(
    (support) => isNumber(support.station) && Math.abs(support.station - station) <= tolerance,
  );
}

export function inferCompressionBucklingLengthFactor(result: PolicyResultEntry): {
  factor: number;
  source: string;
} {
  const span = result.geometry?.length ?? result.geometry?.horizontalSpan;

  if (!isFinitePositive(span)) return { factor: 1, source: "default-factor-no-span" };

  const supports = (result.supports ?? []).filter(
    (support): support is PolicySupport => typeof support === "object" && support !== null,
  );
  const tolerance = Math.max(Math.abs(span) * 1e-6, 1e-9);
  const start = supportAtStation(supports, 0, tolerance);
  const end = supportAtStation(supports, span, tolerance);
  const startFixed = start?.restraints?.rz === true;
  const endFixed = end?.restraints?.rz === true;

  if ((startFixed && !end) || (endFixed && !start))
    return { factor: 2, source: "inferred-cantilever-fixed-free" };
  if (start && end) {
    if (startFixed && endFixed) return { factor: 0.5, source: "inferred-fixed-fixed" };
    if (startFixed || endFixed) return { factor: 0.7, source: "inferred-fixed-pinned" };
    return { factor: 1, source: "inferred-pinned-pinned" };
  }
  return { factor: 1, source: "default-member-length" };
}

interface ResolvedBucklingLengths {
  lengthY: number | null;
  lengthZ: number | null;
  effectiveLengthY: number | null;
  effectiveLengthZ: number | null;
  effectiveLengthFactorY: number | null;
  effectiveLengthFactorZ: number | null;
  lengthYModelUnits: number | null;
  lengthZModelUnits: number | null;
  effectiveLengthYModelUnits: number | null;
  effectiveLengthZModelUnits: number | null;
  inferenceSource: string;
}

export function resolveCompressionBucklingLengths({
  result,
  options,
  resultToSectionUnits,
}: {
  result: PolicyResultEntry;
  options: PolicyOptionRecord;
  resultToSectionUnits: UnitResolver;
}): ResolvedBucklingLengths {
  const span = result.geometry?.length ?? result.geometry?.horizontalSpan ?? null;
  const inference = inferCompressionBucklingLengthFactor(result);
  const lengthYRaw = optionValue(
    options,
    ["lengthY", "memberLengthY", "freeLengthY", "length", "memberLength", "freeLength"],
    span,
  );
  const lengthZRaw = optionValue(
    options,
    ["lengthZ", "memberLengthZ", "freeLengthZ", "length", "memberLength", "freeLength"],
    span,
  );
  const effectiveLengthYRaw = optionValue(
    options,
    ["effectiveLengthY", "bucklingLengthY", "l0Y", "LcrY"],
    null,
  );
  const effectiveLengthZRaw = optionValue(
    options,
    ["effectiveLengthZ", "bucklingLengthZ", "l0Z", "LcrZ"],
    null,
  );
  const factorY = numberOrNull(
    optionValue(options, ["effectiveLengthFactorY", "kY", "factorY", "k"], inference.factor),
  );
  const factorZ = numberOrNull(
    optionValue(options, ["effectiveLengthFactorZ", "kZ", "factorZ", "k"], inference.factor),
  );
  const lengthYNumber = numberOrNull(lengthYRaw);
  const lengthZNumber = numberOrNull(lengthZRaw);
  const effectiveLengthYNumber = numberOrNull(effectiveLengthYRaw);
  const effectiveLengthZNumber = numberOrNull(effectiveLengthZRaw);

  return {
    lengthY: lengthYNumber === null ? null : resultToSectionUnits.length(lengthYNumber),
    lengthZ: lengthZNumber === null ? null : resultToSectionUnits.length(lengthZNumber),
    effectiveLengthY:
      effectiveLengthYNumber === null ? null : resultToSectionUnits.length(effectiveLengthYNumber),
    effectiveLengthZ:
      effectiveLengthZNumber === null ? null : resultToSectionUnits.length(effectiveLengthZNumber),
    effectiveLengthFactorY: factorY,
    effectiveLengthFactorZ: factorZ,
    lengthYModelUnits: lengthYNumber,
    lengthZModelUnits: lengthZNumber,
    effectiveLengthYModelUnits:
      effectiveLengthYNumber ??
      (lengthYNumber !== null && factorY !== null ? lengthYNumber * factorY : null),
    effectiveLengthZModelUnits:
      effectiveLengthZNumber ??
      (lengthZNumber !== null && factorZ !== null ? lengthZNumber * factorZ : null),
    inferenceSource: inference.source,
  };
}

export function maxCompressionSample(
  samples: readonly PolicySample[],
  axialForceConvention: string,
): PolicySample | null {
  return samples.reduce<PolicySample | null>((selected, sample) => {
    const demand = compressionAxialForce(sample.n ?? 0, axialForceConvention);
    const selectedDemand = selected
      ? compressionAxialForce(selected.n ?? 0, axialForceConvention)
      : -1;
    return demand > selectedDemand ? sample : selected;
  }, null);
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function booleanOrNull(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function policyCheck(
  check:
    | SteelLateralTorsionalCheck
    | SteelCompressionBucklingCheck
    | SteelBeamColumnInteractionCheck,
): PolicyCheck {
  return { ...check };
}

export function createLateralTorsionalBucklingChecks({
  analysisResult,
  section,
  material,
  resultToSectionUnits,
  sectionToResultUnits,
  stability = {},
  resistance = {},
  classification = {},
}: {
  analysisResult: PolicyAnalysisResult;
  section: SteelMemberVerificationPolicySection;
  material: SteelMemberVerificationPolicyMaterial;
  resultToSectionUnits: UnitResolver;
  sectionToResultUnits: UnitResolver;
  stability?: PolicyStabilityOptions;
  resistance?: PolicyResistanceOptions;
  classification?: PolicyClassificationOptions;
}): PolicyChecksResult {
  const options = lateralTorsionalBucklingOptions(stability);
  const checks: PolicyCheck[] = [];
  const warnings: string[] = [];
  const assumptions: string[] = [];

  if (!isLtbEnabled(options)) {
    assumptions.push(
      "Lateral-torsional buckling check is disabled because the beam is declared restrained or ltb.enabled is false.",
    );
    return { checks, warnings, assumptions, status: RESULT_STATUS.OK };
  }

  assumptions.push(
    "Lateral-torsional buckling is checked on ULS FEM bending maxima for declared unbraced segments; automatic Mcr is available for I/H and RHS profiles, while CHS/SHS/ROUND are treated as not susceptible to the classic LTB check.",
  );

  for (const result of resultEntries(analysisResult.combinations)) {
    if (normalizeLimitState(result.context?.limitState) !== "ULS") continue;

    for (const segment of createLtbSegments({ result, options })) {
      const sample = maxAbsMomentSample(policySamples(result), segment);
      const unbracedLength = resultToSectionUnits.length(segment.length ?? null);

      if (!sample) {
        warnings.push(`No FEM internal-force sample was found for LTB segment ${segment.id}.`);
        continue;
      }
      if (!isFinitePositive(unbracedLength)) {
        warnings.push(`LTB segment ${segment.id} requires a positive unbraced length.`);
        continue;
      }

      const strongAxisMoment = sampleStrongAxisMoment(sample);
      const weakAxisMoment = sample.principalActions?.mZ ?? sample.mZ ?? 0;
      const mEdSectionUnits = resultToSectionUnits.moment(strongAxisMoment);
      const mzEdSectionUnits = resultToSectionUnits.moment(weakAxisMoment);
      const nEdSectionUnits = resultToSectionUnits.force(sample.n ?? 0);
      const classificationResult = classifySteelSection({
        section,
        material,
        nEd: nEdSectionUnits,
        mEd: mEdSectionUnits,
        mzEd: mzEdSectionUnits,
        axialForceConvention: classification.axialForceConvention ?? "absolute",
      });
      const bendingResistanceBasis = selectBendingResistanceBasis({
        classificationResult,
        elasticSectionModulus: steelSectionModulus(section, "elastic"),
        plasticSectionModulus: steelSectionModulus(section, "plastic"),
        allowPlasticResistance: resistance.allowPlastic !== false,
      });
      const criticalMoment = ltbOptionMomentToSectionUnits(
        ltbOptionValue(segment, options, ["criticalMoment", "mCr"]),
        resultToSectionUnits,
      );
      const ltbResult = verifySteelLateralTorsionalBuckling({
        section,
        material,
        mEd: mEdSectionUnits,
        sectionClass: classificationResult.class,
        bendingSectionModulus: bendingResistanceBasis.sectionModulus,
        unbracedLength,
        criticalMoment,
        criticalMomentSource: criticalMoment
          ? stringOrNull(
              ltbOptionValue(
                segment,
                options,
                ["criticalMomentSource", "mCrSource"],
                "user-provided",
              ),
            )
          : null,
        gammaM1: numberOrNull(ltbOptionValue(segment, options, ["gammaM1"])),
        curve: stringOrNull(ltbOptionValue(segment, options, ["curve"])),
        imperfectionFactor: numberOrNull(
          ltbOptionValue(segment, options, ["imperfectionFactor", "alphaLT"]),
        ),
        beta: numberOrNull(ltbOptionValue(segment, options, ["beta"], 1)) ?? 1,
        lambda0:
          numberOrNull(ltbOptionValue(segment, options, ["lambda0", "lambdaLT0"], 0.2)) ?? 0.2,
        fFactor:
          numberOrNull(
            ltbOptionValue(segment, options, ["fFactor", "momentDistributionReduction"], 1),
          ) ?? 1,
        kChi: numberOrNull(ltbOptionValue(segment, options, ["kChi"], 1)) ?? 1,
        effectiveLengthFactor:
          numberOrNull(ltbOptionValue(segment, options, ["effectiveLengthFactor", "k"], 1)) ?? 1,
        warpingLengthFactor:
          numberOrNull(ltbOptionValue(segment, options, ["warpingLengthFactor", "kw"], 1)) ?? 1,
        momentGradientFactor:
          numberOrNull(ltbOptionValue(segment, options, ["momentGradientFactor", "C1"], 1)) ?? 1,
      });

      warnings.push(...ltbResult.warnings);
      if (!ltbResult.check) {
        warnings.push(`LTB verification was not generated for segment ${segment.id}.`);
        continue;
      }

      const ltbCheck = policyCheck(ltbResult.check);
      checks.push({
        ...ltbCheck,
        demand: round(Math.abs(strongAxisMoment)),
        capacity: round(sectionToResultUnits.moment(ltbCheck.capacity ?? null)),
        metadata: {
          ...checkMetadata(ltbCheck),
          resultId: result.id,
          resultType: result.resultType,
          station: sample.station,
          limitState: result.context?.limitState ?? null,
          combinationType: normalizeCombinationType(result.context?.combinationType),
          segmentId: segment.id,
          segmentFrom: round(segment.from ?? null),
          segmentTo: round(segment.to ?? null),
          unbracedLength: round(segment.length ?? null),
          unbracedLengthSectionUnits: round(unbracedLength),
          mEd: round(strongAxisMoment),
          mzEd: round(weakAxisMoment),
          mEdSectionUnits: round(mEdSectionUnits),
          mzEdSectionUnits: round(mzEdSectionUnits),
          nEdSectionUnits: round(nEdSectionUnits),
          resistanceBasis: bendingResistanceBasis.basis,
          criticalMoment: round(
            sectionToResultUnits.moment(metadataNumber(ltbCheck.metadata, "criticalMoment")),
          ),
          criticalMomentSectionUnits: metadataNumber(ltbCheck.metadata, "criticalMoment"),
        },
      });
    }
  }

  if (checks.length === 0) {
    warnings.push(
      "No lateral-torsional buckling check was generated; provide Mcr or valid I/H automatic-Mcr inputs, or disable LTB only for restrained beams.",
    );
  }

  return {
    checks,
    warnings: uniqueStrings(warnings),
    assumptions,
    status:
      checks.length > 0 && checks.every((check) => check.ok)
        ? RESULT_STATUS.OK
        : RESULT_STATUS.NOT_VERIFIED,
  };
}

export function createCompressionBucklingChecks({
  analysisResult,
  section,
  material,
  resultToSectionUnits,
  sectionToResultUnits,
  stability = {},
  classification = {},
}: {
  analysisResult: PolicyAnalysisResult;
  section: SteelMemberVerificationPolicySection;
  material: SteelMemberVerificationPolicyMaterial;
  resultToSectionUnits: UnitResolver;
  sectionToResultUnits: UnitResolver;
  stability?: PolicyStabilityOptions;
  classification?: PolicyClassificationOptions;
}): PolicyChecksResult {
  const options = compressionBucklingOptions(stability);
  const checks: PolicyCheck[] = [];
  const warnings: string[] = [];
  const assumptions: string[] = [];

  if (!isCompressionBucklingEnabled(options)) {
    assumptions.push(
      "Compression buckling check is disabled because compressionBuckling.enabled is false.",
    );
    return { checks, warnings, assumptions, status: RESULT_STATUS.OK };
  }

  assumptions.push(
    "Compression buckling uses NTC 2018 flexural buckling reductions about y and z; effective lengths default from the simple-beam supports and can be overridden.",
  );

  for (const result of resultEntries(analysisResult.combinations)) {
    if (normalizeLimitState(result.context?.limitState) !== "ULS") continue;

    const axialForceConvention =
      stringOrNull(optionValue(options, ["axialForceConvention"], null)) ??
      classification.axialForceConvention ??
      "absolute";
    const sample = maxCompressionSample(policySamples(result), axialForceConvention);
    if (!sample) {
      warnings.push(
        `No FEM internal-force sample was found for compression buckling in result ${result.id}.`,
      );
      continue;
    }

    const lengths = resolveCompressionBucklingLengths({ result, options, resultToSectionUnits });
    const nEdSectionUnits = resultToSectionUnits.force(sample.n ?? 0);
    const strongAxisMoment = sampleStrongAxisMoment(sample);
    const weakAxisMoment = sample.principalActions?.mZ ?? sample.mZ ?? 0;
    const mEdSectionUnits = resultToSectionUnits.moment(strongAxisMoment);
    const mzEdSectionUnits = resultToSectionUnits.moment(weakAxisMoment);
    const classificationResult = classifySteelSection({
      section,
      material,
      nEd: nEdSectionUnits,
      mEd: mEdSectionUnits,
      mzEd: mzEdSectionUnits,
      axialForceConvention: classification.axialForceConvention ?? "absolute",
    });
    const bucklingOptions = {
      section,
      material,
      nEd: nEdSectionUnits,
      sectionClass: classificationResult.class,
      lengthY: lengths.lengthY,
      lengthZ: lengths.lengthZ,
      effectiveLengthY: lengths.effectiveLengthY,
      effectiveLengthZ: lengths.effectiveLengthZ,
      curveY: stringOrNull(optionValue(options, ["curveY"])),
      curveZ: stringOrNull(optionValue(options, ["curveZ"])),
      imperfectionFactorY: numberOrNull(optionValue(options, ["imperfectionFactorY", "alphaY"])),
      imperfectionFactorZ: numberOrNull(optionValue(options, ["imperfectionFactorZ", "alphaZ"])),
      gammaM1: numberOrNull(optionValue(options, ["gammaM1"])),
      allowOpenSectionFlexuralBuckling:
        booleanOrNull(
          optionValue(
            options,
            ["allowOpenSectionFlexuralBuckling", "allowFlexuralOnlyOpenSections"],
            false,
          ),
        ) ?? false,
      axialForceConvention,
      ...(lengths.effectiveLengthFactorY !== null
        ? { effectiveLengthFactorY: lengths.effectiveLengthFactorY }
        : {}),
      ...(lengths.effectiveLengthFactorZ !== null
        ? { effectiveLengthFactorZ: lengths.effectiveLengthFactorZ }
        : {}),
    };
    const bucklingResult = verifySteelCompressionBuckling(bucklingOptions);

    warnings.push(...bucklingResult.warnings);
    if (!bucklingResult.check) {
      warnings.push(`Compression buckling verification was not generated for result ${result.id}.`);
      continue;
    }

    const bucklingCheck = policyCheck(bucklingResult.check);
    checks.push({
      ...bucklingCheck,
      demand: round(sectionToResultUnits.force(bucklingCheck.demand ?? null)),
      capacity: round(sectionToResultUnits.force(bucklingCheck.capacity ?? null)),
      metadata: {
        ...checkMetadata(bucklingCheck),
        resultId: result.id,
        resultType: result.resultType,
        station: sample.station,
        limitState: result.context?.limitState ?? null,
        combinationType: normalizeCombinationType(result.context?.combinationType),
        nEd: round(sample.n ?? 0),
        nEdSectionUnits: round(nEdSectionUnits),
        mEd: round(strongAxisMoment),
        mzEd: round(weakAxisMoment),
        mEdSectionUnits: round(mEdSectionUnits),
        lengthY: round(lengths.lengthYModelUnits),
        lengthZ: round(lengths.lengthZModelUnits),
        effectiveLengthY: round(lengths.effectiveLengthYModelUnits),
        effectiveLengthZ: round(lengths.effectiveLengthZModelUnits),
        lengthInferenceSource: lengths.inferenceSource,
        axisYResistance: round(
          sectionToResultUnits.force(metadataNumber(bucklingCheck.metadata, "axisYResistance")),
        ),
        axisZResistance: round(
          sectionToResultUnits.force(metadataNumber(bucklingCheck.metadata, "axisZResistance")),
        ),
        axisYResistanceSectionUnits: metadataNumber(bucklingCheck.metadata, "axisYResistance"),
        axisZResistanceSectionUnits: metadataNumber(bucklingCheck.metadata, "axisZResistance"),
      },
    });
  }

  if (checks.length === 0) {
    warnings.push(
      "No compression buckling check was generated; provide ULS FEM results and valid effective lengths or disable the check when not relevant.",
    );
  }

  return {
    checks,
    warnings: uniqueStrings(warnings),
    assumptions,
    status:
      checks.length > 0 && checks.every((check) => check.ok)
        ? RESULT_STATUS.OK
        : RESULT_STATUS.NOT_VERIFIED,
  };
}

export function ltbReductionForInteraction({
  result,
  sample,
  section,
  material,
  resultToSectionUnits,
  sectionToResultUnits,
  stability,
  resistance,
  classification,
  classificationResult,
  bendingResistanceBasis,
}: {
  result: PolicyResultEntry;
  sample: PolicySample;
  section: SteelMemberVerificationPolicySection;
  material: SteelMemberVerificationPolicyMaterial;
  resultToSectionUnits: UnitResolver;
  sectionToResultUnits: UnitResolver;
  stability: PolicyStabilityOptions;
  resistance: PolicyResistanceOptions;
  classification: PolicyClassificationOptions;
  classificationResult: SteelSectionClassificationResult;
  bendingResistanceBasis: { basis: string; sectionModulus: number | null; warning: string | null };
}): {
  chiLT: number | null;
  warnings: string[];
  metadata: Record<string, unknown>;
} {
  void resistance;
  void classification;
  const options = lateralTorsionalBucklingOptions(stability);

  if (!isLtbEnabled(options)) {
    return {
      chiLT: 1,
      warnings: [],
      metadata: { chiLTSource: "ltb-disabled-or-restrained" },
    };
  }

  const segment =
    createLtbSegments({ result, options }).find((candidate) =>
      sampleInSegment(sample, candidate),
    ) ?? createLtbSegments({ result, options })[0];
  const unbracedLength = resultToSectionUnits.length(segment?.length ?? null);

  if (!isFinitePositive(unbracedLength)) {
    return {
      chiLT: null,
      warnings: [
        `N+My interaction requires a positive LTB segment length for station ${sample.station}.`,
      ],
      metadata: { chiLTSource: "not-available" },
    };
  }

  const criticalMoment = ltbOptionMomentToSectionUnits(
    ltbOptionValue(segment, options, ["criticalMoment", "mCr"]),
    resultToSectionUnits,
  );
  const ltbResult = verifySteelLateralTorsionalBuckling({
    section,
    material,
    mEd: resultToSectionUnits.moment(sampleStrongAxisMoment(sample)),
    sectionClass: classificationResult.class,
    bendingSectionModulus: bendingResistanceBasis.sectionModulus,
    unbracedLength,
    criticalMoment,
    criticalMomentSource: criticalMoment
      ? stringOrNull(
          ltbOptionValue(segment, options, ["criticalMomentSource", "mCrSource"], "user-provided"),
        )
      : null,
    gammaM1: numberOrNull(ltbOptionValue(segment, options, ["gammaM1"])),
    curve: stringOrNull(ltbOptionValue(segment, options, ["curve"])),
    imperfectionFactor: numberOrNull(
      ltbOptionValue(segment, options, ["imperfectionFactor", "alphaLT"]),
    ),
    beta: numberOrNull(ltbOptionValue(segment, options, ["beta"], 1)) ?? 1,
    lambda0: numberOrNull(ltbOptionValue(segment, options, ["lambda0", "lambdaLT0"], 0.2)) ?? 0.2,
    fFactor:
      numberOrNull(
        ltbOptionValue(segment, options, ["fFactor", "momentDistributionReduction"], 1),
      ) ?? 1,
    kChi: numberOrNull(ltbOptionValue(segment, options, ["kChi"], 1)) ?? 1,
    effectiveLengthFactor:
      numberOrNull(ltbOptionValue(segment, options, ["effectiveLengthFactor", "k"], 1)) ?? 1,
    warpingLengthFactor:
      numberOrNull(ltbOptionValue(segment, options, ["warpingLengthFactor", "kw"], 1)) ?? 1,
    momentGradientFactor:
      numberOrNull(ltbOptionValue(segment, options, ["momentGradientFactor", "C1"], 1)) ?? 1,
  });
  const ltbCheck = ltbResult.check ? policyCheck(ltbResult.check) : null;
  const ltbMetadata = checkMetadata(ltbCheck);

  return {
    chiLT: metadataNumber(ltbMetadata, "chiLT"),
    warnings: ltbResult.warnings,
    metadata: {
      chiLTSource: ltbCheck ? "ltb-verification" : "not-available",
      segmentId: segment?.id ?? null,
      unbracedLength: round(segment?.length ?? null),
      unbracedLengthSectionUnits: round(unbracedLength),
      resistanceBasis: bendingResistanceBasis.basis,
      criticalMoment: ltbCheck
        ? round(sectionToResultUnits.moment(metadataNumber(ltbMetadata, "criticalMoment")))
        : null,
      criticalMomentSectionUnits: metadataNumber(ltbMetadata, "criticalMoment"),
      criticalMomentSource: stringOrNull(ltbMetadata.criticalMomentSource),
    },
  };
}

export function createBeamColumnInteractionChecks({
  analysisResult,
  section,
  material,
  resultToSectionUnits,
  sectionToResultUnits,
  stability = {},
  resistance = {},
  classification = {},
}: {
  analysisResult: PolicyAnalysisResult;
  section: SteelMemberVerificationPolicySection;
  material: SteelMemberVerificationPolicyMaterial;
  resultToSectionUnits: UnitResolver;
  sectionToResultUnits: UnitResolver;
  stability?: PolicyStabilityOptions;
  resistance?: PolicyResistanceOptions;
  classification?: PolicyClassificationOptions;
}): PolicyChecksResult {
  const interactionOptions = beamColumnInteractionOptions(stability);
  const bucklingOptions = compressionBucklingOptions(stability);
  const checks: PolicyCheck[] = [];
  const warnings: string[] = [];
  const assumptions: string[] = [];

  if (!isBeamColumnInteractionEnabled(interactionOptions)) {
    assumptions.push(
      "Steel beam-column interaction check is disabled because beamColumnInteraction.enabled is false.",
    );
    return { checks, warnings, assumptions, status: RESULT_STATUS.OK };
  }

  assumptions.push(
    "Steel beam-column stability interaction uses Circolare NTC 2018 Method B; Mz is included for supported doubly symmetric profiles, while torsion and torsional interactions are excluded.",
  );

  for (const result of resultEntries(analysisResult.combinations)) {
    if (normalizeLimitState(result.context?.limitState) !== "ULS") continue;

    const lengths = resolveCompressionBucklingLengths({
      result,
      options: { ...bucklingOptions, ...(interactionOptions.compressionBuckling ?? {}) },
      resultToSectionUnits,
    });
    const samples = policySamples(result);
    const momentFactorY = calculateSteelMomentDiagramFactor(samples, "My");
    const momentFactorZ = calculateSteelMomentDiagramFactor(samples, "Mz");
    const useBiaxialInteraction = samples.some((sample) =>
      hasSignificantAction(
        resultToSectionUnits.moment(sample.principalActions?.mZ ?? sample.mZ ?? 0),
      ),
    );

    for (const sample of samples) {
      const axialForceConvention =
        stringOrNull(optionValue(interactionOptions, ["axialForceConvention"], null)) ??
        stringOrNull(optionValue(bucklingOptions, ["axialForceConvention"], null)) ??
        classification.axialForceConvention ??
        "absolute";
      const nEdSectionUnits = resultToSectionUnits.force(sample.n ?? 0);
      const strongAxisMoment = sampleStrongAxisMoment(sample);
      const weakAxisMoment = sample.principalActions?.mZ ?? sample.mZ ?? 0;
      const mEdSectionUnits = resultToSectionUnits.moment(strongAxisMoment);
      const mzEdSectionUnits = resultToSectionUnits.moment(weakAxisMoment);
      const hasWeakAxisMomentDemand =
        useBiaxialInteraction || hasSignificantAction(mzEdSectionUnits);
      const classificationResult = classifySteelSection({
        section,
        material,
        nEd: nEdSectionUnits,
        mEd: mEdSectionUnits,
        mzEd: mzEdSectionUnits,
        axialForceConvention: classification.axialForceConvention ?? "absolute",
      });
      const bendingResistanceBasis = selectBendingResistanceBasis({
        classificationResult,
        elasticSectionModulus: steelSectionModulus(section, "elastic"),
        plasticSectionModulus: steelSectionModulus(section, "plastic"),
        allowPlasticResistance: resistance.allowPlastic !== false,
      });
      const bendingResistanceBasisZ = selectBendingResistanceBasis({
        classificationResult,
        elasticSectionModulus: steelSectionModulus(section, "elastic", "Z"),
        plasticSectionModulus: steelSectionModulus(section, "plastic", "Z"),
        allowPlasticResistance: resistance.allowPlastic !== false,
      });
      const compressionOptions = {
        section,
        material,
        nEd: nEdSectionUnits,
        sectionClass: classificationResult.class,
        lengthY: lengths.lengthY,
        lengthZ: lengths.lengthZ,
        effectiveLengthY: lengths.effectiveLengthY,
        effectiveLengthZ: lengths.effectiveLengthZ,
        curveY:
          stringOrNull(optionValue(interactionOptions, ["curveY"], null)) ??
          stringOrNull(optionValue(bucklingOptions, ["curveY"])),
        curveZ:
          stringOrNull(optionValue(interactionOptions, ["curveZ"], null)) ??
          stringOrNull(optionValue(bucklingOptions, ["curveZ"])),
        imperfectionFactorY:
          numberOrNull(optionValue(interactionOptions, ["imperfectionFactorY", "alphaY"], null)) ??
          numberOrNull(optionValue(bucklingOptions, ["imperfectionFactorY", "alphaY"])),
        imperfectionFactorZ:
          numberOrNull(optionValue(interactionOptions, ["imperfectionFactorZ", "alphaZ"], null)) ??
          numberOrNull(optionValue(bucklingOptions, ["imperfectionFactorZ", "alphaZ"])),
        gammaM1:
          numberOrNull(optionValue(interactionOptions, ["gammaM1"], null)) ??
          numberOrNull(optionValue(bucklingOptions, ["gammaM1"])),
        allowOpenSectionFlexuralBuckling:
          booleanOrNull(
            optionValue(
              interactionOptions,
              ["allowOpenSectionFlexuralBuckling", "allowFlexuralOnlyOpenSections"],
              null,
            ),
          ) ??
          booleanOrNull(
            optionValue(
              bucklingOptions,
              ["allowOpenSectionFlexuralBuckling", "allowFlexuralOnlyOpenSections"],
              false,
            ),
          ) ??
          false,
        axialForceConvention,
        ...(lengths.effectiveLengthFactorY !== null
          ? { effectiveLengthFactorY: lengths.effectiveLengthFactorY }
          : {}),
        ...(lengths.effectiveLengthFactorZ !== null
          ? { effectiveLengthFactorZ: lengths.effectiveLengthFactorZ }
          : {}),
      };
      const compressionBucklingResult = verifySteelCompressionBuckling(compressionOptions);
      const ltbReduction = ltbReductionForInteraction({
        result,
        sample,
        section,
        material,
        resultToSectionUnits,
        sectionToResultUnits,
        stability,
        resistance,
        classification,
        classificationResult,
        bendingResistanceBasis,
      });
      const commonInteractionOptions = {
        section,
        material,
        nEd: nEdSectionUnits,
        myEd: mEdSectionUnits,
        sectionClass: classificationResult.class,
        compressionBucklingResult,
        alphaMy:
          numberOrNull(
            optionValue(
              interactionOptions,
              ["alphaMy", "momentFactorY", "cmy"],
              momentFactorY?.factor ?? 1,
            ),
          ) ?? 1,
        alphaMLT:
          numberOrNull(
            optionValue(
              interactionOptions,
              ["alphaMLT", "momentFactorLT", "cmLT"],
              momentFactorY?.factor ?? 1,
            ),
          ) ?? 1,
        gammaM1:
          numberOrNull(optionValue(interactionOptions, ["gammaM1"], null)) ??
          numberOrNull(optionValue(bucklingOptions, ["gammaM1"])),
        axialForceConvention,
        allowSinglySymmetric:
          booleanOrNull(
            optionValue(interactionOptions, ["allowSinglySymmetric", "allowUnsymmetric"], false),
          ) ?? false,
        ...(ltbReduction.chiLT !== null ? { chiLT: ltbReduction.chiLT } : {}),
      };
      const interactionResult: SteelBeamColumnInteractionResult = hasWeakAxisMomentDemand
        ? verifySteelBeamColumnInteractionMyMz({
            ...commonInteractionOptions,
            mzEd: mzEdSectionUnits,
            bendingSectionModulusY: bendingResistanceBasis.sectionModulus,
            bendingSectionModulusZ: bendingResistanceBasisZ.sectionModulus,
            alphaMz:
              numberOrNull(
                optionValue(
                  interactionOptions,
                  ["alphaMz", "momentFactorZ", "cmz"],
                  momentFactorZ?.factor ?? 1,
                ),
              ) ?? 1,
          })
        : verifySteelBeamColumnInteractionMy({
            ...commonInteractionOptions,
            bendingSectionModulus: bendingResistanceBasis.sectionModulus,
          });

      warnings.push(
        ...compressionBucklingResult.warnings,
        ...ltbReduction.warnings,
        ...interactionResult.warnings,
      );
      if (!interactionResult.check) continue;

      const interactionCheck = policyCheck(interactionResult.check);
      checks.push({
        ...interactionCheck,
        metadata: {
          ...checkMetadata(interactionCheck),
          resultId: result.id,
          resultType: result.resultType,
          station: sample.station,
          limitState: result.context?.limitState ?? null,
          combinationType: normalizeCombinationType(result.context?.combinationType),
          nEd: round(sample.n ?? 0),
          nEdSectionUnits: round(nEdSectionUnits),
          myEd: round(strongAxisMoment),
          mzEd: round(weakAxisMoment),
          myEdSectionUnits: round(mEdSectionUnits),
          mzEdSectionUnits: round(mzEdSectionUnits),
          lengthY: round(lengths.lengthYModelUnits),
          lengthZ: round(lengths.lengthZModelUnits),
          effectiveLengthY: round(lengths.effectiveLengthYModelUnits),
          effectiveLengthZ: round(lengths.effectiveLengthZModelUnits),
          lengthInferenceSource: lengths.inferenceSource,
          resistanceBasis: bendingResistanceBasis.basis,
          resistanceBasisZ: bendingResistanceBasisZ.basis,
          momentDiagramFactorY: momentFactorY?.factor ?? 1,
          momentDiagramPsiY: momentFactorY?.psi ?? null,
          momentDiagramFactorYSource: momentFactorY?.source ?? "default-uniform-moment",
          momentDiagramFactorZ: momentFactorZ?.factor ?? 1,
          momentDiagramPsiZ: momentFactorZ?.psi ?? null,
          momentDiagramFactorZSource: momentFactorZ?.source ?? "default-uniform-moment",
          ...ltbReduction.metadata,
        },
      });
    }
  }

  if (checks.length === 0) {
    warnings.push(
      "No steel beam-column interaction check was generated; Method B needs ULS FEM samples, class 1-3 section, compression buckling data, chiLT and section moduli.",
    );
  }

  return {
    checks,
    warnings: uniqueStrings(warnings),
    assumptions,
    status:
      checks.length > 0 && checks.every((check) => check.ok)
        ? RESULT_STATUS.OK
        : RESULT_STATUS.NOT_VERIFIED,
  };
}

export interface SteelActionVerificationResult extends Record<string, unknown> {
  status: ResultStatus;
  utilizationRatio: number | null;
  demand: number | null;
  capacity: number | null;
  checks: Array<Record<string, unknown>>;
  warnings: string[];
  assumptions: string[];
  metadata: Record<string, unknown>;
}

interface SteelActionVerificationContext {
  sectionProperties?: { metadata?: PolicyMetadata | null } | null;
}

interface SteelActionVerificationInput {
  nEd?: number | null;
  vEd?: number | null;
  mEd?: number | null;
  principalActions?: PolicyPrincipalActions | null;
  context: SteelActionVerificationContext;
}

export function createSteelActionVerifier({
  section,
  material,
  sectionToResultUnits,
  resultToSectionUnits,
  gammaM0,
  classification = {},
  resistance = {},
}: {
  section: SteelMemberVerificationPolicySection;
  material: SteelMemberVerificationPolicyMaterial;
  sectionToResultUnits: UnitResolver;
  resultToSectionUnits: UnitResolver;
  gammaM0?: number | null;
  classification?: PolicyClassificationOptions;
  resistance?: PolicyResistanceOptions;
}): {
  verifySectionActions: (input: SteelActionVerificationInput) => SteelActionVerificationResult;
} {
  return {
    verifySectionActions({ nEd, vEd, mEd, principalActions, context }) {
      const metadata = context.sectionProperties?.metadata ?? {};
      const resolvedGammaM0 = gammaM0 ?? metadata.gammaM0 ?? material.metadata?.gammaM0 ?? 1.05;
      const fyd = metadata.fyd ?? designStrength(material, resolvedGammaM0);
      const elasticSectionModulus = steelSectionModulus(section, "elastic", "Y");
      const plasticSectionModulus = steelSectionModulus(section, "plastic", "Y");
      const elasticSectionModulusZ = steelSectionModulus(section, "elastic", "Z");
      const plasticSectionModulusZ = steelSectionModulus(section, "plastic", "Z");
      const shearArea = steelShearArea(section);
      const shearAreaZ = numberOrNull(section.shearAreaZ ?? section.area);
      const elasticMomentResistance =
        metadata.elasticMomentResistance ??
        (isNumber(fyd) && isNumber(elasticSectionModulus) ? fyd * elasticSectionModulus : null);
      const plasticMomentResistance =
        metadata.plasticMomentResistance ??
        (isNumber(fyd) && isNumber(plasticSectionModulus) ? fyd * plasticSectionModulus : null);
      const shearResistance =
        metadata.shearResistance ??
        (isNumber(fyd) && isNumber(shearArea) ? (fyd * shearArea) / Math.sqrt(3) : null);
      const axialResistance = isNumber(fyd) && isNumber(section.area) ? fyd * section.area : null;
      const shearResistanceZ =
        isNumber(fyd) && isNumber(shearAreaZ) ? (fyd * shearAreaZ) / Math.sqrt(3) : null;
      const shearCapacity = sectionToResultUnits.force(numberOrNull(shearResistance));
      const shearCapacityZ = sectionToResultUnits.force(numberOrNull(shearResistanceZ));
      const axialCapacity = sectionToResultUnits.force(numberOrNull(axialResistance));
      const convertedNEd = resultToSectionUnits.force(nEd ?? 0);
      const mYEd = principalActions?.mY ?? mEd ?? 0;
      const mZEd = principalActions?.mZ ?? 0;
      const vYEd = principalActions?.vY ?? vEd ?? 0;
      const vZEd = principalActions?.vZ ?? 0;
      const convertedVEd = resultToSectionUnits.force(vYEd);
      const convertedVZEd = resultToSectionUnits.force(vZEd);
      const convertedMEd = resultToSectionUnits.moment(mYEd);
      const convertedMZEd = resultToSectionUnits.moment(mZEd);
      const classificationResult = classifySteelSection({
        section,
        material,
        nEd: convertedNEd,
        mEd: convertedMEd,
        mzEd: convertedMZEd,
        axialForceConvention: classification.axialForceConvention ?? "absolute",
      });
      const bendingResistanceBasis = selectBendingResistanceBasis({
        classificationResult,
        elasticSectionModulus,
        plasticSectionModulus,
        allowPlasticResistance: resistance.allowPlastic !== false,
      });
      const bendingResistance =
        bendingResistanceBasis.basis === "plastic"
          ? plasticMomentResistance
          : elasticMomentResistance;
      const flangePart = classificationPartById(classificationResult, "flange");
      const webPart = classificationPartById(classificationResult, "web");
      const classificationCheck: PolicyCheck = {
        id: "steel-section-classification",
        description: "Local steel section classification for the current N-M state",
        demand: classificationResult.class,
        capacity: 3,
        utilizationRatio:
          classificationResult.class > 3 ? round(classificationResult.class / 3) : 0,
        ok: classificationResult.status === RESULT_STATUS.OK && classificationResult.class <= 3,
        metadata: {
          method: classificationResult.metadata?.method,
          sectionClass: classificationResult.class,
          profileName: classificationResult.profileName,
          family: classificationResult.family,
          epsilon: classificationResult.epsilon,
          axialForceConvention: classificationResult.metadata?.axialForceConvention,
          axialCompressionForce: classificationResult.metadata?.axialCompressionForce,
          nEd: round(nEd ?? 0),
          mEd: round(mYEd),
          mzEd: round(mZEd),
          nEdSectionUnits: classificationResult.metadata?.nEd,
          mEdSectionUnits: classificationResult.metadata?.mEd,
          mzEdSectionUnits: round(convertedMZEd),
          classificationSeverity: round(classificationSeverity(classificationResult)),
          flangeClass: flangePart?.class ?? null,
          webClass: webPart?.class ?? null,
          flangeRatio: flangePart?.ratio ?? null,
          webRatio: webPart?.ratio ?? null,
          webAlpha: webPart?.metadata?.alpha ?? null,
          webPsi: webPart?.metadata?.psi ?? null,
          partClasses: classificationPartMetadata(classificationResult, "class"),
          partRatios: classificationPartMetadata(classificationResult, "ratio"),
        },
      };

      if (classificationResult.class > 3) {
        const unsupported = steelNotSupportedCheck({
          id: "steel-class-4-effective-properties",
          description: "Class 4 effective properties and stability",
          missingInputs: [
            "effective area Aeff",
            "effective section moduli Weff,y/Weff,z",
            "neutral-axis shift",
            "plate buckling reduction factors",
          ],
          reference: "NTC 2018 §4.2.4.1.2.2; UNI EN 1993-1-5 §4",
        });
        return {
          status: RESULT_STATUS.NOT_SUPPORTED,
          utilizationRatio: null,
          demand: null,
          capacity: null,
          checks: [classificationCheck, { ...unsupported }],
          warnings: [...classificationResult.warnings, ...unsupported.warnings],
          assumptions: [],
          metadata: { governingCheckId: unsupported.id, classification: classificationResult },
        };
      }

      const axialStress = isFinitePositive(section.area)
        ? Math.abs(convertedNEd) / section.area
        : null;
      const bendingStress = isFinitePositive(bendingResistanceBasis.sectionModulus)
        ? Math.abs(convertedMEd) / bendingResistanceBasis.sectionModulus
        : null;
      const bendingResistanceBasisZ = selectBendingResistanceBasis({
        classificationResult,
        elasticSectionModulus: elasticSectionModulusZ,
        plasticSectionModulus: plasticSectionModulusZ,
        allowPlasticResistance: resistance.allowPlastic !== false,
      });
      const bendingResistanceZ =
        bendingResistanceBasisZ.basis === "plastic"
          ? isNumber(fyd) && isNumber(plasticSectionModulusZ)
            ? fyd * plasticSectionModulusZ
            : null
          : isNumber(fyd) && isNumber(elasticSectionModulusZ)
            ? fyd * elasticSectionModulusZ
            : null;
      const bendingStressZ = isFinitePositive(bendingResistanceBasisZ.sectionModulus)
        ? Math.abs(convertedMZEd) / bendingResistanceBasisZ.sectionModulus
        : null;
      const maxNormalStress = (axialStress ?? 0) + (bendingStress ?? 0) + (bendingStressZ ?? 0);
      const shearStress = isFinitePositive(shearArea) ? Math.abs(convertedVEd) / shearArea : null;
      const shearStressZ = isFinitePositive(shearAreaZ)
        ? Math.abs(convertedVZEd) / shearAreaZ
        : null;
      const equivalentStress =
        isNumber(maxNormalStress) && isNumber(shearStress) && isNumber(shearStressZ)
          ? Math.sqrt(maxNormalStress ** 2 + 3 * (shearStress ** 2 + shearStressZ ** 2))
          : null;
      const bendingCapacity = sectionToResultUnits.moment(numberOrNull(bendingResistance));
      const bendingCapacityZ = sectionToResultUnits.moment(numberOrNull(bendingResistanceZ));
      const bendingRatioY =
        isNumber(bendingCapacity) && bendingCapacity > 0
          ? Math.abs(mYEd) / bendingCapacity
          : Infinity;
      const bendingRatioZ =
        isNumber(bendingCapacityZ) && bendingCapacityZ > 0
          ? Math.abs(mZEd) / bendingCapacityZ
          : Math.abs(mZEd) > 1e-12
            ? Infinity
            : 0;
      const bendingRatio = bendingRatioY + bendingRatioZ;
      const bendingCapacityForReport =
        isNumber(bendingCapacity) && bendingCapacity > 0 ? bendingCapacity : 1;
      const bendingDemandForReport =
        isNumber(bendingCapacity) && bendingCapacity > 0
          ? bendingRatio * bendingCapacity
          : bendingRatio;
      const bending: PolicyCheck = {
        id: "steel-bending",
        description: "Biaxial bending resistance verification governed by section class",
        demand: round(bendingDemandForReport),
        capacity: round(bendingCapacityForReport),
        utilizationRatio: round(bendingRatio),
        ok: bendingRatio <= 1,
        metadata: {
          fyd: round(fyd ?? null),
          gammaM0: round(resolvedGammaM0),
          sectionClass: classificationResult.class,
          resistanceBasis: bendingResistanceBasis.basis,
          resistanceBasisZ: bendingResistanceBasisZ.basis,
          actionBasis: principalActions ? "principal-actions" : "global-actions",
          mYEd: round(mYEd),
          mZEd: round(mZEd),
          selectedSectionModulus: round(bendingResistanceBasis.sectionModulus),
          selectedSectionModulusZ: round(bendingResistanceBasisZ.sectionModulus),
          elasticSectionModulus: round(elasticSectionModulus),
          elasticSectionModulusZ: round(elasticSectionModulusZ),
          plasticSectionModulus: round(plasticSectionModulus),
          plasticSectionModulusZ: round(plasticSectionModulusZ),
          elasticMomentResistance: round(numberOrNull(elasticMomentResistance)),
          plasticMomentResistance: round(numberOrNull(plasticMomentResistance)),
          bendingCapacityY: round(bendingCapacity),
          bendingCapacityZ: round(bendingCapacityZ),
          utilizationRatioY: round(bendingRatioY),
          utilizationRatioZ: round(bendingRatioZ),
        },
      };
      const shearRatioY =
        isNumber(shearCapacity) && shearCapacity > 0 ? Math.abs(vYEd) / shearCapacity : Infinity;
      const shearRatioZ =
        isNumber(shearCapacityZ) && shearCapacityZ > 0
          ? Math.abs(vZEd) / shearCapacityZ
          : Math.abs(vZEd) > 1e-12
            ? Infinity
            : 0;
      const shearRatio = shearRatioY + shearRatioZ;
      const shearCapacityForReport =
        isNumber(shearCapacity) && shearCapacity > 0 ? shearCapacity : 1;
      const shearDemandForReport =
        isNumber(shearCapacity) && shearCapacity > 0 ? shearRatio * shearCapacity : shearRatio;
      const shear: PolicyCheck = {
        id: "steel-shear",
        description: "Biaxial shear resistance verification",
        demand: round(shearDemandForReport),
        capacity: round(shearCapacityForReport),
        utilizationRatio: round(shearRatio),
        ok: shearRatio <= 1,
        metadata: {
          fyd: round(fyd ?? null),
          shearArea: round(shearArea),
          shearAreaY: round(shearArea),
          shearAreaZ: round(shearAreaZ),
          vYEd: round(vYEd),
          vZEd: round(vZEd),
          shearCapacityY: round(shearCapacity),
          shearCapacityZ: round(shearCapacityZ),
          utilizationRatioY: round(shearRatioY),
          utilizationRatioZ: round(shearRatioZ),
        },
      };
      const axial = utilizationCheck({
        id: "steel-axial",
        description: "Axial resistance verification",
        demand: nEd ?? 0,
        capacity: axialCapacity ?? 0,
        metadata: { fyd: round(fyd ?? null), area: round(section.area ?? null) },
      });
      const elasticStress = utilizationCheck({
        id: "steel-elastic-stress",
        description: "Normal-plus-shear stress screening with selected section modulus",
        demand: equivalentStress ?? 0,
        capacity: fyd ?? 0,
        metadata: {
          method: "selected-modulus-von-mises-section-stress-screening",
          fyd: round(fyd ?? null),
          axialStress: round(axialStress),
          bendingStress: round(bendingStress),
          bendingStressZ: round(bendingStressZ),
          maxNormalStress: round(maxNormalStress),
          shearStress: round(shearStress),
          shearStressZ: round(shearStressZ),
          equivalentStress: round(equivalentStress),
          area: round(section.area ?? null),
          resistanceBasis: bendingResistanceBasis.basis,
          selectedSectionModulus: round(bendingResistanceBasis.sectionModulus),
          elasticSectionModulus: round(elasticSectionModulus),
          shearArea: round(shearArea),
        },
      });
      const interactionRatio = (axial.utilizationRatio ?? 0) + (bending.utilizationRatio ?? 0);
      const interaction: PolicyCheck = {
        id: "steel-axial-bending-interaction",
        description: "Linear axial-bending interaction",
        demand: round(interactionRatio),
        capacity: 1,
        utilizationRatio: round(interactionRatio),
        ok: interactionRatio <= 1,
        metadata: {
          axialUtilizationRatio: axial.utilizationRatio,
          bendingUtilizationRatio: bending.utilizationRatio,
        },
      };
      const checks: PolicyCheck[] = [
        classificationCheck,
        bending,
        shear,
        axial,
        elasticStress,
        interaction,
      ];
      const governing = governingCheck(checks);

      return {
        status: checks.every((check) => check.ok) ? RESULT_STATUS.OK : RESULT_STATUS.NOT_VERIFIED,
        utilizationRatio: governing?.utilizationRatio ?? null,
        demand: numberOrNull(governing?.demand),
        capacity: numberOrNull(governing?.capacity),
        checks,
        assumptions: [
          "Steel section bending resistance is governed by local section class: class 1/2 can use Wpl, class 3 uses Wel, class 4 is blocked until effective properties exist.",
          "Steel section classification is evaluated locally for each ULS FEM station.",
          "Axial force is treated as compression by absolute value for section classification unless a different convention is configured.",
        ],
        warnings: uniqueStrings([...classificationResult.warnings, bendingResistanceBasis.warning]),
        metadata: { governingCheckId: governing?.id ?? null, classification: classificationResult },
      };
    },
  };
}
