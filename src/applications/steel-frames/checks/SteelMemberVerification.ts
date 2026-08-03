// Mechanical TypeScript migration from strutture-js 6f33baead8b88166c4b2cf94af41763412e3c751; source path: src/applications/steel-frames/checks/SteelMemberVerification.js.

import {
  VerificationResult,
  type VerificationCheck,
} from "../../../core/results/VerificationResult.js";
import { governingCheck, uniqueStrings } from "../../../core/results/checkUtils.js";
import {
  BeamSectionActionVerifier,
  type BeamAnalysisResult,
  type BeamInternalForceSample,
  type BeamResultEntry,
  type BeamVerificationStations,
} from "../../../domain/beams/BeamSectionActionVerifier.js";
import { createUnitResolver, type UnitSystemInput } from "../../../domain/units/UnitSystem.js";
import { RESULT_STATUS } from "../../../core/results/resultStatus.js";
import {
  validateSteelMemberFem3DResult,
  steelMemberFem3DToLegacyAnalysisResult,
} from "../fem/SteelMemberFem3DContract.js";
import type { SteelMemberFem3DResult } from "../fem/SteelMemberFem3DContract.js";
import {
  steelUnsupportedFeatureCatalog,
  verifySteelFem3DAdvanced,
  type SteelFem3DCheckLike,
  type SteelFem3DContractLike,
  type SteelFem3DServiceabilityOptions,
} from "./SteelFem3DVerification.js";
import {
  DEFAULT_SECTION_UNITS,
  classificationActionMagnitude,
  createBeamColumnInteractionChecks,
  createCompressionBucklingChecks,
  createDeflectionChecks,
  createLateralTorsionalBucklingChecks,
  createSteelActionVerifier,
  type SteelMemberVerificationPolicyMaterial,
  type SteelMemberVerificationPolicySection,
} from "./SteelMemberVerificationPolicies.js";
import type { resultEntries } from "./SteelMemberVerificationPolicies.js";

type JsonRecord = Record<string, unknown>;
type PolicyAnalysisResult = Parameters<typeof createDeflectionChecks>[0]["analysisResult"];
type PolicyResultEntry = ReturnType<typeof resultEntries>[number];
type PolicyClassification = NonNullable<
  Parameters<typeof createLateralTorsionalBucklingChecks>[0]["classification"]
>;
type PolicyResistance = NonNullable<
  Parameters<typeof createLateralTorsionalBucklingChecks>[0]["resistance"]
>;
type PolicyStability = NonNullable<
  Parameters<typeof createLateralTorsionalBucklingChecks>[0]["stability"]
>;

export interface SteelMemberVerificationServiceabilityOptions
  extends JsonRecord,
    SteelFem3DServiceabilityOptions {
  deflectionLimitRatio?: number | null;
  deflection?: { limitRatio?: number | null } | null;
}

export interface SteelMemberVerificationOptions {
  code?: string;
  gammaM0?: number | null;
  serviceability?: SteelMemberVerificationServiceabilityOptions;
  classification?: PolicyClassification;
  resistance?: PolicyResistance;
  stability?: PolicyStability;
  deflectionLimitRatio?: number | null;
  verificationStations?: BeamVerificationStations;
  metadata?: JsonRecord;
}

export interface SteelMemberVerificationInput {
  memberId?: string | null;
  combinations?: readonly unknown[];
  section?: SteelMemberVerificationPolicySection | null;
  material?: SteelMemberVerificationPolicyMaterial | null;
  analysisResult?: JsonRecord | null;
  serviceability?: SteelMemberVerificationServiceabilityOptions;
  classification?: PolicyClassification;
  resistance?: PolicyResistance;
  stability?: PolicyStability;
  verificationStations?: BeamVerificationStations;
  deflectionLimitRatio?: number | null;
}

export interface SteelMemberVerificationOutputs extends JsonRecord {
  stationResultCount?: unknown;
  fem3d?: SteelMemberFem3DResult;
  contractValidation?: JsonRecord;
  uls?: JsonRecord;
  serviceability?: JsonRecord;
  stability?: JsonRecord;
  advanced?: JsonRecord;
  vibration?: JsonRecord;
  unsupportedFeatures?: readonly SteelFem3DCheckLike[];
  governing?: JsonRecord | null;
}

type SteelMemberCheck = JsonRecord & {
  id: string;
  utilizationRatio: number | null;
  metadata?: JsonRecord;
};

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isUnknownArray(value: unknown): value is readonly unknown[] {
  return Array.isArray(value);
}

function isPolicyResultEntry(value: unknown): value is PolicyResultEntry {
  return isRecord(value) && typeof value.id === "string";
}

function isPolicyAnalysisResult(value: JsonRecord): value is PolicyAnalysisResult {
  if (value.combinations === undefined) return true;
  return (
    isRecord(value.combinations) && Object.values(value.combinations).every(isPolicyResultEntry)
  );
}

function asPolicyAnalysisResult(value: JsonRecord): PolicyAnalysisResult {
  return isPolicyAnalysisResult(value) ? value : { ...value, combinations: {} };
}

function asBeamAnalysisResult(value: PolicyAnalysisResult): BeamAnalysisResult {
  const combinations = Object.fromEntries(
    Object.entries(value.combinations ?? {}).map(([id, entry]) => {
      const beamEntry: BeamResultEntry = { id: entry.id };
      for (const [key, rawValue] of Object.entries(entry)) {
        beamEntry[key] = rawValue;
      }
      const internalForces = entry.internalForces;
      if (internalForces && Array.isArray(internalForces.samples)) {
        const samples: BeamInternalForceSample[] = internalForces.samples.map((sample) => {
          const beamSample: BeamInternalForceSample = { station: sample.station };
          for (const [key, rawValue] of Object.entries(sample)) {
            beamSample[key] = rawValue;
          }
          return beamSample;
        });
        const beamInternalForces: NonNullable<BeamResultEntry["internalForces"]> = {};
        for (const [key, rawValue] of Object.entries(internalForces)) {
          beamInternalForces[key] = rawValue;
        }
        beamInternalForces.samples = samples;
        beamEntry.internalForces = beamInternalForces;
      }
      return [id, beamEntry];
    }),
  );
  return { ...value, combinations };
}

function asAdvancedContract(contract: SteelMemberFem3DResult): SteelFem3DContractLike {
  return {
    member: {
      frameClassification: {
        sway:
          contract.member.frameClassification.sway === true
            ? true
            : contract.member.frameClassification.sway === false
              ? false
              : null,
        nonSway:
          contract.member.frameClassification.nonSway === true
            ? true
            : contract.member.frameClassification.nonSway === false
              ? false
              : null,
      },
      effectiveLengths: { ...contract.member.effectiveLengths },
      effectiveLengthFactors: { ...contract.member.effectiveLengthFactors },
      webPanels: contract.member.webPanels.map((panel) => ({
        id: typeof panel.id === "string" ? panel.id : null,
        from: panel.from,
        to: panel.to,
        length: panel.length,
        endPost: typeof panel.endPost === "string" ? panel.endPost : null,
      })),
      concentratedLoads: contract.member.concentratedLoads.map((load) => ({
        id: typeof load.id === "string" ? load.id : null,
        combinationId: typeof load.combinationId === "string" ? load.combinationId : null,
        station: typeof load.station === "number" ? load.station : 0,
        force: load.force,
        bearingLength: load.bearingLength,
        loadType: typeof load.loadType === "string" ? load.loadType : null,
      })),
    },
    combinations: contract.combinations.map((combination) => ({
      id: combination.id,
      limitState: combination.limitState,
      stations: combination.stations.flatMap((station) =>
        station.station === null
          ? []
          : [
              {
                station: station.station,
                coordinates: { ...station.coordinates },
                actions: { ...station.actions },
              },
            ],
      ),
    })),
  };
}

function asUnitSystemInput(value: unknown): UnitSystemInput | null {
  if (!isRecord(value)) return null;
  const force = value.force;
  const length = value.length;
  return {
    ...(force === "N" || force === "kN" || force === "MN" ? { force } : {}),
    ...(length === "m" || length === "dm" || length === "cm" || length === "mm" ? { length } : {}),
  };
}

function optionalNumber(value: unknown): number | null | undefined {
  return typeof value === "number" || value === null ? value : undefined;
}

function asPolicyPrincipalActions(value: unknown): Record<string, number | null> | null {
  if (!isRecord(value)) return null;
  const vY = optionalNumber(value.vY);
  const vZ = optionalNumber(value.vZ);
  const mY = optionalNumber(value.mY);
  const mZ = optionalNumber(value.mZ);
  const n = optionalNumber(value.n);
  return {
    ...(vY === undefined ? {} : { vY }),
    ...(vZ === undefined ? {} : { vZ }),
    ...(mY === undefined ? {} : { mY }),
    ...(mZ === undefined ? {} : { mZ }),
    ...(n === undefined ? {} : { n }),
  };
}

function isSteelMemberCheck(
  value: VerificationCheck | SteelFem3DCheckLike,
): value is SteelMemberCheck {
  return (
    typeof value.id === "string" &&
    (value.utilizationRatio === null || typeof value.utilizationRatio === "number")
  );
}

function requireSteelMemberCheck(value: VerificationCheck | SteelFem3DCheckLike): SteelMemberCheck {
  if (!isSteelMemberCheck(value)) {
    throw new Error("Steel member verification produced an invalid check.");
  }
  return value;
}

function isMoreSevereCheck(
  candidate: SteelMemberCheck,
  current: SteelMemberCheck | undefined,
): boolean {
  if (!current) return true;
  if (candidate.id === "steel-section-classification") {
    const candidateClass =
      typeof candidate.metadata?.sectionClass === "number" ? candidate.metadata.sectionClass : 0;
    const currentClass =
      typeof current.metadata?.sectionClass === "number" ? current.metadata.sectionClass : 0;
    if (candidateClass !== currentClass) return candidateClass > currentClass;
    const candidateSeverity =
      typeof candidate.metadata?.classificationSeverity === "number"
        ? candidate.metadata.classificationSeverity
        : 0;
    const currentSeverity =
      typeof current.metadata?.classificationSeverity === "number"
        ? current.metadata.classificationSeverity
        : 0;
    if (candidateSeverity !== currentSeverity) return candidateSeverity > currentSeverity;
    return classificationActionMagnitude(candidate) > classificationActionMagnitude(current);
  }
  return (candidate.utilizationRatio ?? -Infinity) > (current.utilizationRatio ?? -Infinity);
}

export class SteelMemberVerification {
  public code: string;
  public gammaM0: number | null;
  public serviceability: SteelMemberVerificationServiceabilityOptions;
  public classification: PolicyClassification;
  public resistance: PolicyResistance;
  public stability: PolicyStability;
  public verificationStations: BeamVerificationStations;
  public deflectionLimitRatio: number;
  public metadata: JsonRecord;

  public constructor({
    code = "NTC2018",
    gammaM0 = null,
    serviceability = {},
    classification = {},
    resistance = {},
    stability = {},
    deflectionLimitRatio = null,
    verificationStations = null,
    metadata = {},
  }: SteelMemberVerificationOptions = {}) {
    this.code = code;
    this.gammaM0 = gammaM0;
    this.serviceability = { ...serviceability };
    this.classification = { ...classification };
    this.resistance = { ...resistance };
    this.stability = { ...stability };
    this.verificationStations = verificationStations;
    this.deflectionLimitRatio =
      deflectionLimitRatio ??
      serviceability.deflectionLimitRatio ??
      serviceability.deflection?.limitRatio ??
      250;
    this.metadata = { ...metadata };
  }

  public verify({
    memberId = null,
    combinations = [],
    section = null,
    material = null,
    analysisResult = null,
    serviceability = this.serviceability,
    classification = this.classification,
    resistance = this.resistance,
    stability = this.stability,
    verificationStations = this.verificationStations,
    deflectionLimitRatio = serviceability.deflectionLimitRatio ??
      serviceability.deflection?.limitRatio ??
      this.deflectionLimitRatio,
  }: SteelMemberVerificationInput = {}): VerificationResult<SteelMemberVerificationOutputs> {
    if (!section || !material || !analysisResult) {
      return new VerificationResult<SteelMemberVerificationOutputs>({
        applicationId: "steel-frames",
        status: RESULT_STATUS.NOT_IMPLEMENTED,
        summary: "Steel member verification workflow scaffolded.",
        checks: [],
        warnings: ["Resistance, stability, class and connection checks are not implemented yet."],
        metadata: {
          code: this.code,
          memberId,
          combinations: combinations.length,
          ...this.metadata,
        },
      });
    }

    const resolvedSection = section;
    const resolvedMaterial = material;
    const rawCombinations = analysisResult.combinations;
    const explicitFem3D = Boolean(
      analysisResult.fem3d ||
        Array.isArray(rawCombinations) ||
        (isRecord(rawCombinations) &&
          Object.values(rawCombinations).some(
            (combination) => isRecord(combination) && Array.isArray(combination.stations),
          )),
    );
    const fem3DValidation = validateSteelMemberFem3DResult(analysisResult, {
      strict: explicitFem3D,
    });
    if (!fem3DValidation.ok) {
      const contractCheck = {
        id: "steel-fem-3d-contract",
        description: "Steel member FEM 3D input contract",
        demand: null,
        capacity: null,
        utilizationRatio: null,
        ok: null,
        status: RESULT_STATUS.NOT_SUPPORTED,
        metadata: {
          norm: "NTC 2018 / Circolare 2019",
          method: "steel-member-fem-3d-contract-v1",
          missingInputs: [...fem3DValidation.errors],
          reference: "NTC 2018 §4.2.4 and Circolare 2019 C4.2.4",
          combinationId: null,
          station: null,
          restraintAssumptions: null,
        },
        warnings: ["The FEM 3D result is incomplete; no member capacity has been calculated."],
        assumptions: [],
      };
      const contractResult = new VerificationResult<SteelMemberVerificationOutputs>({
        applicationId: "steel-frames",
        status: RESULT_STATUS.NOT_SUPPORTED,
        summary:
          "Steel member verification not supported because the FEM 3D contract is incomplete.",
        checks: [{ ...contractCheck, ok: false }],
        warnings: contractCheck.warnings,
        outputs: {
          fem3d: fem3DValidation.value,
          contractValidation: {
            ok: false,
            errors: fem3DValidation.errors,
            warnings: fem3DValidation.warnings,
          },
          unsupportedFeatures: steelUnsupportedFeatureCatalog(),
        },
        metadata: {
          code: this.code,
          memberId,
          method: "steel-member-fem-3d-contract-v1",
          ...this.metadata,
        },
      });
      const serializedContractCheck = contractResult.checks[0];
      if (serializedContractCheck) {
        const serializedContractRecord: JsonRecord = serializedContractCheck;
        serializedContractRecord.ok = null;
      }
      return contractResult;
    }

    const workingAnalysisResult = asPolicyAnalysisResult(
      explicitFem3D
        ? steelMemberFem3DToLegacyAnalysisResult(fem3DValidation.value)
        : analysisResult,
    );
    const contractMember = fem3DValidation.value.member;
    const contractCompression = {
      effectiveLengthY: contractMember.effectiveLengths.y,
      effectiveLengthZ: contractMember.effectiveLengths.z,
      effectiveLengthFactorY: contractMember.effectiveLengthFactors.y,
      effectiveLengthFactorZ: contractMember.effectiveLengthFactors.z,
    };
    const contractLtbSegments =
      contractMember.restraintSegments.length > 0
        ? contractMember.restraintSegments.map((segment) => ({
            ...(typeof segment.id === "string" ? { id: segment.id } : {}),
            from: segment.from,
            to: segment.to,
            length:
              typeof segment.to === "number" &&
              Number.isFinite(segment.to) &&
              typeof segment.from === "number" &&
              Number.isFinite(segment.from)
                ? segment.to - segment.from
                : null,
          }))
        : undefined;
    const resolvedStability: PolicyStability = {
      ...stability,
      compressionBuckling: {
        ...contractCompression,
        ...(stability.compressionBuckling ?? stability.buckling ?? {}),
      },
      lateralTorsionalBuckling: {
        ...(contractLtbSegments ? { segments: contractLtbSegments } : {}),
        ...(stability.lateralTorsionalBuckling ?? stability.ltb ?? {}),
      },
      beamColumnInteraction: {
        compressionBuckling: contractCompression,
        ...(stability.beamColumnInteraction ?? stability.interaction ?? {}),
      },
    };

    const resultUnits = asUnitSystemInput(workingAnalysisResult.units);
    const sectionUnits = DEFAULT_SECTION_UNITS;
    const sectionToResultUnits = createUnitResolver(sectionUnits, resultUnits ?? undefined);
    const resultToSectionUnits = createUnitResolver(resultUnits, sectionUnits);
    const actionVerifier = createSteelActionVerifier({
      section: resolvedSection,
      material: resolvedMaterial,
      sectionToResultUnits,
      resultToSectionUnits,
      gammaM0: this.gammaM0,
      classification,
      resistance,
    });
    const actionVerification = new BeamSectionActionVerifier({
      applicationId: "steel-frames",
      sectionVerifier: {
        verifySectionActions(input) {
          return actionVerifier.verifySectionActions({
            nEd: input.nEd ?? null,
            vEd: input.vEd ?? null,
            mEd: input.mEd ?? null,
            principalActions: asPolicyPrincipalActions(input.principalActions),
            context: {
              sectionProperties: isRecord(input.context?.sectionProperties)
                ? {
                    metadata: isRecord(input.context.sectionProperties.metadata)
                      ? input.context.sectionProperties.metadata
                      : null,
                  }
                : null,
            },
          });
        },
      },
      limitStates: "ULS",
      verificationStations,
    }).verify({ analysisResult: asBeamAnalysisResult(workingAnalysisResult) });
    const deflectionChecks = createDeflectionChecks({
      analysisResult: workingAnalysisResult,
      deflectionLimitRatio,
    });
    const lateralTorsionalBuckling = createLateralTorsionalBucklingChecks({
      analysisResult: workingAnalysisResult,
      section: resolvedSection,
      material: resolvedMaterial,
      resultToSectionUnits,
      sectionToResultUnits,
      stability: resolvedStability,
      resistance,
      classification,
    });
    const compressionBuckling = createCompressionBucklingChecks({
      analysisResult: workingAnalysisResult,
      section: resolvedSection,
      material: resolvedMaterial,
      resultToSectionUnits,
      sectionToResultUnits,
      stability: resolvedStability,
      classification,
    });
    const beamColumnInteraction = createBeamColumnInteractionChecks({
      analysisResult: workingAnalysisResult,
      section: resolvedSection,
      material: resolvedMaterial,
      resultToSectionUnits,
      sectionToResultUnits,
      stability: resolvedStability,
      resistance,
      classification,
    });
    const class4Detected = actionVerification.checks.some((check) => {
      const metadata = isRecord(check.metadata) ? check.metadata : {};
      return check.id === "steel-section-classification" && metadata.sectionClass === 4;
    });
    const advanced = verifySteelFem3DAdvanced({
      contract: asAdvancedContract(fem3DValidation.value),
      section: resolvedSection,
      material: resolvedMaterial,
      resultToSectionUnits,
      sectionToResultUnits,
      serviceability,
      resistance: { ...resistance, class4Detected },
      stability: resolvedStability,
    });
    const allChecks: SteelMemberCheck[] = [
      ...actionVerification.checks.map(requireSteelMemberCheck),
      ...lateralTorsionalBuckling.checks,
      ...compressionBuckling.checks,
      ...beamColumnInteraction.checks,
      ...deflectionChecks,
      ...advanced.checks.map(requireSteelMemberCheck),
      ...(class4Detected
        ? advanced.unsupportedFeatures
            .filter((check) => check.id === "steel-class-4-effective-properties")
            .map(requireSteelMemberCheck)
        : []),
    ];
    const groupedChecks = Object.values(
      allChecks.reduce<Record<string, SteelMemberCheck>>((acc, check) => {
        const current = acc[check.id];
        if (isMoreSevereCheck(check, current)) acc[check.id] = check;
        return acc;
      }, {}),
    );
    const governing = governingCheck(groupedChecks);
    const ulsOk = actionVerification.status === RESULT_STATUS.OK;
    const ltbOk = lateralTorsionalBuckling.status === RESULT_STATUS.OK;
    const compressionBucklingOk = compressionBuckling.status === RESULT_STATUS.OK;
    const beamColumnInteractionOk = beamColumnInteraction.status === RESULT_STATUS.OK;
    const sleOk = deflectionChecks.length === 0 || deflectionChecks.every((check) => check.ok);
    const hasNotSupported =
      class4Detected ||
      advanced.status === RESULT_STATUS.NOT_SUPPORTED ||
      groupedChecks.some((check) => check.status === RESULT_STATUS.NOT_SUPPORTED);
    const uniformChecks = groupedChecks.map((check) => ({
      ...check,
      metadata: {
        norm: "NTC 2018 / Circolare 2019",
        combinationId: check.metadata?.combinationId ?? check.metadata?.resultId ?? null,
        station: check.metadata?.station ?? null,
        governingSegment: check.metadata?.governingSegment ?? check.metadata?.segmentId ?? null,
        restraintAssumptions: check.metadata?.restraintAssumptions ?? {
          sway: contractMember.frameClassification.sway,
          nonSway: contractMember.frameClassification.nonSway,
          effectiveLengths: { ...contractMember.effectiveLengths },
          effectiveLengthFactors: { ...contractMember.effectiveLengthFactors },
        },
        ...(check.metadata ?? {}),
      },
      warnings: [...(isUnknownArray(check.warnings) ? check.warnings : [])],
      assumptions: [...(isUnknownArray(check.assumptions) ? check.assumptions : [])],
    }));

    return new VerificationResult<SteelMemberVerificationOutputs>({
      applicationId: "steel-frames",
      status: hasNotSupported
        ? RESULT_STATUS.NOT_SUPPORTED
        : ulsOk &&
            ltbOk &&
            compressionBucklingOk &&
            beamColumnInteractionOk &&
            sleOk &&
            advanced.status === RESULT_STATUS.OK
          ? RESULT_STATUS.OK
          : RESULT_STATUS.NOT_VERIFIED,
      summary:
        "Steel member ULS section resistance, stability and SLE deflection verification from FEM beam results.",
      utilizationRatio: governing?.utilizationRatio ?? null,
      demand: governing?.demand ?? null,
      capacity: governing?.capacity ?? null,
      checks: uniformChecks,
      outputs: {
        stationResultCount: actionVerification.outputs.stationResultCount,
        fem3d: fem3DValidation.value,
        contractValidation: {
          ok: fem3DValidation.ok,
          errors: [...fem3DValidation.errors],
          warnings: [...fem3DValidation.warnings],
        },
        uls: actionVerification.outputs,
        serviceability: {
          deflectionLimitRatio,
          checkCount: deflectionChecks.length,
          checks: deflectionChecks.map((check) => ({
            ...check,
            metadata: { ...check.metadata },
          })),
        },
        stability: {
          lateralTorsionalBuckling: {
            status: lateralTorsionalBuckling.status,
            checkCount: lateralTorsionalBuckling.checks.length,
            checks: lateralTorsionalBuckling.checks.map((check) => ({
              ...check,
              metadata: { ...check.metadata },
            })),
          },
          compressionBuckling: {
            status: compressionBuckling.status,
            checkCount: compressionBuckling.checks.length,
            checks: compressionBuckling.checks.map((check) => ({
              ...check,
              metadata: { ...check.metadata },
            })),
          },
          beamColumnInteraction: {
            status: beamColumnInteraction.status,
            checkCount: beamColumnInteraction.checks.length,
            checks: beamColumnInteraction.checks.map((check) => ({
              ...check,
              metadata: { ...check.metadata },
            })),
          },
        },
        advanced: {
          status: advanced.status,
          checks: advanced.checks.map((check) => ({
            ...check,
            metadata: { ...check.metadata },
          })),
        },
        vibration: advanced.vibration,
        unsupportedFeatures: advanced.unsupportedFeatures,
        governing: governing
          ? {
              utilizationRatio: governing.utilizationRatio,
              demand: governing.demand,
              capacity: governing.capacity,
              metadata: { ...(governing.metadata ?? {}) },
            }
          : null,
      },
      warnings: uniqueStrings([
        ...(deflectionChecks.length === 0
          ? ["No SLE steel deflection check was generated because no SLE combination was found."]
          : []),
        "Section classification is included for supported catalog steel profiles, but effective class-4 section properties are not implemented yet.",
        ...(groupedChecks.some(
          (check) =>
            check.id === "steel-section-classification" && check.metadata?.sectionClass === 4,
        )
          ? [
              "Steel section class 4 detected: effective section properties are required and are not implemented yet.",
            ]
          : []),
        ...lateralTorsionalBuckling.warnings,
        ...compressionBuckling.warnings,
        ...beamColumnInteraction.warnings,
        ...advanced.warnings,
        ...fem3DValidation.warnings,
        "Steel member stability excludes torsion and torsional interactions from Method B; N+My+Mz is available for supported doubly symmetric profiles.",
        "Warping torsion and bimoment are never approximated; uniform Saint-Venant torsion is checked only when the required section data are available.",
      ]),
      assumptions: [
        ...actionVerification.assumptions,
        ...lateralTorsionalBuckling.assumptions,
        ...compressionBuckling.assumptions,
        ...beamColumnInteraction.assumptions,
        `SLE vertical deflection limit defaults to L/${deflectionLimitRatio} unless overridden.`,
      ],
      metadata: {
        code: this.code,
        memberId,
        method: "steel-elastic-member-mvp",
        governingCheckId: governing?.id ?? null,
        deflectionLimitRatio,
        verificationStations,
        ...this.metadata,
      },
    });
  }
}
