import {
  VerificationResult,
  type VerificationCheck,
} from "../../../core/results/VerificationResult.js";
import { RESULT_STATUS, type ResultStatus } from "../../../core/results/resultStatus.js";
import {
  BeamSectionActionVerifier,
  type BeamAnalysisResult,
  type BeamSectionActionInput,
  type BeamSectionActionVerification,
  type BeamVerificationStations,
} from "../../../domain/beams/BeamSectionActionVerifier.js";
import type { ReinforcedConcreteSection } from "../../../domain/geometry/ReinforcedConcreteSection.js";
import { rayPolygonCapacity } from "../../../domain/math/rayPolygonCapacity.js";
import type { ConcreteMaterial } from "../../../domain/materials/ConcreteMaterial.js";
import type { SteelMaterial } from "../../../domain/materials/SteelMaterial.js";
import {
  createUnitResolver,
  type UnitResolver,
  type UnitSystemInput,
} from "../../../domain/units/UnitSystem.js";
import {
  withNormativeReferences,
  type NormativeReference,
} from "../../../norms/normativeReference.js";
import { ReinforcedConcreteSectionModel } from "../models/ReinforcedConcreteSectionModel.js";
import type {
  ReinforcedConcreteSectionMeshOptions,
  ReinforcedConcreteSectionSolverOptions,
} from "../models/ReinforcedConcreteSectionModel.js";
import { ReinforcedConcreteBeamDetailingVerification } from "./ReinforcedConcreteBeamDetailingVerification.js";
import { ReinforcedConcreteSectionVerification } from "./ReinforcedConcreteSectionVerification.js";
import { ReinforcedConcreteServiceabilityVerification } from "./ReinforcedConcreteServiceabilityVerification.js";
import { ReinforcedConcreteShearVerification } from "./ReinforcedConcreteShearVerification.js";
import { ReinforcedConcreteTorsionVerification } from "./ReinforcedConcreteTorsionVerification.js";
import { CrackedSectionDeflectionAnalysis } from "../../rc-cracked-deflection/analysis/CrackedSectionDeflectionAnalysis.js";
import type { RcBeamDetailingInput } from "./detailing/beamTypes.js";
import type { RcServiceabilityOptions } from "./serviceability/serviceabilityOptions.js";
import type { RcShearInput } from "./shear/types.js";
import type { RcTorsionInput } from "./torsion/types.js";

const DEFAULT_SECTION_UNITS = Object.freeze({
  force: "N",
  length: "mm",
}) satisfies UnitSystemInput;

export interface RcBeamSolverOptions extends ReinforcedConcreteSectionSolverOptions {
  serviceTolerance?: number;
  serviceMaxIterations?: number;
}

export interface ReinforcedConcreteBeamVerificationOptions {
  code?: string;
  mesh?: ReinforcedConcreteSectionMeshOptions;
  solver?: RcBeamSolverOptions;
  shear?: RcShearInput | null;
  torsion?: RcTorsionInput | null;
  serviceability?: RcServiceabilityOptions | false;
  detailing?: RcBeamDetailingInput | null;
  verificationStations?: BeamVerificationStations;
  metadata?: Record<string, unknown>;
}

export interface ReinforcedConcreteBeamVerificationInput {
  beamId?: string | null;
  section?: ReinforcedConcreteSection | null;
  concreteMaterial?: ConcreteMaterial | null;
  reinforcementMaterial?: SteelMaterial | null;
  analysisResult?: BeamAnalysisResult | null;
  beamModel?: unknown;
  mesh?: ReinforcedConcreteSectionMeshOptions;
  solver?: RcBeamSolverOptions;
  shear?: RcShearInput | null;
  torsion?: RcTorsionInput | null;
  serviceability?: RcServiceabilityOptions | false;
  detailing?: RcBeamDetailingInput | null;
  verificationStations?: BeamVerificationStations;
}

interface RequiredRcActionContext extends Record<string, unknown> {
  resultId?: string;
  station?: number;
  biaxialAngleCount?: number;
}

interface BeamCombinedVerification {
  status: ResultStatus;
  utilizationRatio: number | null;
  demand: unknown;
  capacity: unknown;
  checks: VerificationCheck[];
  outputs: Record<string, unknown>;
  warnings: string[];
  assumptions: string[];
}

interface GoverningVerification {
  utilizationRatio: number;
  demand: unknown;
  capacity: unknown;
  metadata: Record<string, unknown>;
}

function governingCheck(checks: VerificationCheck[]): VerificationCheck | null {
  return checks.reduce<VerificationCheck | null>((selected, check) => {
    if (!Number.isFinite(check.utilizationRatio)) {
      return selected;
    }

    if (
      selected === null ||
      !Number.isFinite(selected.utilizationRatio) ||
      (check.utilizationRatio as number) > (selected.utilizationRatio as number)
    ) {
      return check;
    }

    return selected;
  }, null);
}

function hasSignificantAction(value: unknown, reference = 0, tolerance = 1e-9): boolean {
  return (
    Number.isFinite(value) &&
    Math.abs(value as number) > Math.max(tolerance, Math.abs(reference) * tolerance)
  );
}

function compressedEdgeForMoment(mEd: number): "top" | "bottom" {
  return mEd >= 0 ? "top" : "bottom";
}

function outputRecord(result: VerificationResult): Record<string, unknown> {
  return result.outputs;
}

function checkMetadata(check: VerificationCheck): Record<string, unknown> {
  return (check.metadata as Record<string, unknown> | undefined) ?? {};
}

function stringValues(values: readonly unknown[] | undefined): string[] {
  return (values ?? []).map(String);
}

function contextFromInput(input: BeamSectionActionInput): RequiredRcActionContext {
  return input.context ?? {};
}

function createRcActionVerifier({
  section,
  concreteMaterial,
  reinforcementMaterial,
  resultToSectionUnits,
  code,
  mesh,
  solver,
  shear = null,
  torsion = null,
}: {
  section: ReinforcedConcreteSection;
  concreteMaterial: ConcreteMaterial;
  reinforcementMaterial: SteelMaterial;
  resultToSectionUnits: UnitResolver;
  code: string;
  mesh: ReinforcedConcreteSectionMeshOptions;
  solver: RcBeamSolverOptions;
  shear?: RcShearInput | null;
  torsion?: RcTorsionInput | null;
}): { verifySectionActions: (input: BeamSectionActionInput) => BeamSectionActionVerification } {
  const sectionVerification = new ReinforcedConcreteSectionVerification({ code });
  const shearVerification =
    shear !== null ? new ReinforcedConcreteShearVerification({ code }) : null;
  const torsionVerification =
    torsion !== null ? new ReinforcedConcreteTorsionVerification({ code, torsion, shear }) : null;

  return {
    verifySectionActions(input): BeamSectionActionVerification {
      const { nEd, vEd, mEd, tEd, principalActions } = input;
      const context = contextFromInput(input);
      const convertedNEd = resultToSectionUnits.force(nEd ?? 0);
      const convertedVEd = resultToSectionUnits.force(principalActions?.vY ?? vEd ?? 0);
      const convertedVZEd = resultToSectionUnits.force(principalActions?.vZ ?? 0);
      const convertedMEd = resultToSectionUnits.moment(principalActions?.mY ?? mEd ?? 0);
      const convertedMZEd = resultToSectionUnits.moment(principalActions?.mZ ?? 0);
      const convertedTEd = resultToSectionUnits.moment(tEd ?? 0);
      const isBiaxial = Math.abs(convertedMZEd) > Math.max(1e-9, Math.abs(convertedMEd) * 1e-9);
      const hasWeakAxisShear = hasSignificantAction(convertedVZEd, convertedVEd);
      const model = new ReinforcedConcreteSectionModel({
        id: `${context.resultId ?? "beam"}-${Math.round((context.station ?? 0) * 1000)}`,
        section,
        materials: {
          concreteMaterial,
          reinforcementMaterial,
        },
        analysisType: isBiaxial ? "uls-biaxial-domain" : "uls-uniaxial-resistance",
        analysisSettings: {
          compressedEdge: compressedEdgeForMoment(convertedMEd),
          angleCount: context.biaxialAngleCount ?? 48,
        },
        mesh,
        solver,
        actions: {
          nEd: convertedNEd,
          mEd: convertedMEd,
          mxEd: convertedMEd,
          myEd: convertedMZEd,
        },
        units: DEFAULT_SECTION_UNITS,
        metadata: {
          sourceResultId: context.resultId ?? null,
          sourceStation: context.station ?? null,
        },
      });
      const result = sectionVerification.verify(model);
      const resultOutputs = outputRecord(result);
      const bendingChecks: VerificationCheck[] = isBiaxial
        ? (() => {
            const points = Array.isArray(resultOutputs.points)
              ? (resultOutputs.points as Array<Record<string, unknown>>)
              : [];
            const capacity = rayPolygonCapacity(
              points.map((point) => ({
                x: point.MxRd as number,
                y: point.MyRd as number,
              })),
              convertedMEd,
              convertedMZEd,
            );

            return [
              {
                id: "rc-uls-biaxial-bending",
                description: "Biaxial bending resistance at assigned axial force",
                demand: capacity.demandNorm,
                capacity: capacity.capacityNorm,
                utilizationRatio: capacity.utilizationRatio,
                ok: capacity.utilizationRatio <= 1,
                metadata: {
                  method: "sampled-biaxial-domain-ray-intersection",
                  mxEd: convertedMEd,
                  myEd: convertedMZEd,
                  angleCount: model.analysisSettings.angleCount,
                  intersection:
                    capacity.intersection !== null
                      ? {
                          mxRd: capacity.intersection.x,
                          myRd: capacity.intersection.y,
                          segmentIndex: capacity.intersection.segmentIndex,
                        }
                      : null,
                },
              },
            ];
          })()
        : result.checks.map((check) => ({
            ...check,
            id: `rc-${String(check.id)}`,
            metadata: {
              compressedEdge: model.analysisSettings.compressedEdge,
              ...checkMetadata(check),
            },
          }));
      const torsionResult = torsionVerification?.verifySectionActions({
        tEd: convertedTEd,
        vEd: convertedVEd,
        nEd: convertedNEd,
        mEd: convertedMEd,
        context: {
          ...context,
          section,
          concreteMaterial,
          reinforcementMaterial,
          ...(torsion !== null ? { torsion } : {}),
          ...(shear !== null ? { shear } : {}),
          units: DEFAULT_SECTION_UNITS,
        },
      });
      const shearForStation =
        shear !== null && torsionResult?.outputs.cotTheta != null
          ? {
              ...shear,
              thetaSelection: "fixed",
              cotTheta: torsionResult.outputs.cotTheta as number,
              torsionHandled: true,
            }
          : shear;
      const shearResult = shearVerification?.verifySectionActions({
        nEd: convertedNEd,
        vEd: convertedVEd,
        mEd: convertedMEd,
        context: {
          ...context,
          section,
          concreteMaterial,
          reinforcementMaterial,
          ...(shearForStation !== null ? { shear: shearForStation } : {}),
          units: DEFAULT_SECTION_UNITS,
        },
      });
      const checks = [
        ...bendingChecks,
        ...(shearResult?.checks ?? []),
        ...(torsionResult?.checks ?? []),
      ];
      const governing = governingCheck(checks);
      const statuses = [
        result.status,
        ...(shearResult !== undefined ? [shearResult.status] : []),
        ...(torsionResult !== undefined ? [torsionResult.status] : []),
      ];

      return {
        status: statuses.every((status) => status === RESULT_STATUS.OK)
          ? RESULT_STATUS.OK
          : RESULT_STATUS.NOT_VERIFIED,
        utilizationRatio: governing?.utilizationRatio ?? result.utilizationRatio,
        demand: governing?.demand ?? result.demand,
        capacity: governing?.capacity ?? result.capacity,
        checks,
        warnings: [
          ...stringValues(result.warnings),
          ...(shearResult?.warnings ?? []),
          ...(torsionResult?.warnings ?? []),
          ...(hasWeakAxisShear
            ? [
                "RC shear verification uses the principal vY component; vZ from section rotation is reported and its effects are neglected in this MVP.",
              ]
            : []),
        ],
        assumptions: [
          ...stringValues(result.assumptions),
          ...(shearResult?.assumptions ?? []),
          ...(torsionResult?.assumptions ?? []),
        ],
        metadata: {
          governingCheckId:
            governing?.id ?? result.metadata.governingCheckId ?? "rc-uls-uniaxial-bending",
          compressedEdge: model.analysisSettings.compressedEdge,
          sectionResult: result.toJSON(),
          biaxial: isBiaxial,
          vYEd: convertedVEd,
          vZEd: convertedVZEd,
          tEd: convertedTEd,
          weakAxisShearVerified: !hasWeakAxisShear,
          weakAxisShearNeglected: hasWeakAxisShear,
          shearResult:
            shearResult !== undefined
              ? {
                  status: shearResult.status,
                  utilizationRatio: shearResult.utilizationRatio,
                  demand: shearResult.demand,
                  capacity: shearResult.capacity,
                  outputs: shearResult.outputs,
                  metadata: shearResult.metadata,
                }
              : null,
          torsionResult:
            torsionResult !== undefined
              ? {
                  status: torsionResult.status,
                  utilizationRatio: torsionResult.utilizationRatio,
                  demand: torsionResult.demand,
                  capacity: torsionResult.capacity,
                  outputs: torsionResult.outputs,
                  metadata: torsionResult.metadata,
                }
              : null,
        },
      };
    },
  };
}

function createRcServiceabilityActionVerifier({
  section,
  concreteMaterial,
  reinforcementMaterial,
  resultToSectionUnits,
  code,
  mesh,
  solver,
  serviceability,
}: {
  section: ReinforcedConcreteSection;
  concreteMaterial: ConcreteMaterial;
  reinforcementMaterial: SteelMaterial;
  resultToSectionUnits: UnitResolver;
  code: string;
  mesh: ReinforcedConcreteSectionMeshOptions;
  solver: RcBeamSolverOptions;
  serviceability: RcServiceabilityOptions;
}): { verifySectionActions: (input: BeamSectionActionInput) => BeamSectionActionVerification } {
  const serviceabilityVerification = new ReinforcedConcreteServiceabilityVerification({
    code,
    mesh,
    solver,
    serviceability,
  });

  return {
    verifySectionActions(input): BeamSectionActionVerification {
      const { nEd, mEd, principalActions } = input;
      const context = contextFromInput(input);
      const convertedNEd = resultToSectionUnits.force(nEd ?? 0);
      const convertedMEd = resultToSectionUnits.moment(principalActions?.mY ?? mEd ?? 0);
      const convertedMZEd = resultToSectionUnits.moment(principalActions?.mZ ?? 0);
      const hasWeakAxisMoment = hasSignificantAction(convertedMZEd, convertedMEd);
      const result = serviceabilityVerification.verifySectionActions({
        nEd: convertedNEd,
        mEd: convertedMEd,
        mxEd: convertedMEd,
        myEd: convertedMZEd,
        context: {
          ...context,
          section,
          concreteMaterial,
          reinforcementMaterial,
          serviceability,
          mesh,
          solver,
        },
      });

      return {
        ...result,
        warnings: [
          ...(result.warnings ?? []),
          ...(hasWeakAxisMoment
            ? [
                "RC SLE stress verification includes mZ from section rotation; indirect crack control uses only the primary mY component and neglects mZ effects.",
              ]
            : []),
        ],
        metadata: {
          ...result.metadata,
          mYEd: convertedMEd,
          mZEd: convertedMZEd,
          weakAxisServiceStressVerified: hasWeakAxisMoment,
          weakAxisMomentNeglectedInCrackControl: hasWeakAxisMoment,
        },
      };
    },
  };
}

function governingFromResults(results: VerificationResult[]): GoverningVerification | null {
  return results.reduce<GoverningVerification | null>((selected, candidate) => {
    if (!Number.isFinite(candidate.utilizationRatio)) {
      return selected;
    }

    if (selected === null || (candidate.utilizationRatio as number) > selected.utilizationRatio) {
      const candidateOutputs = outputRecord(candidate);
      const governingOutput = candidateOutputs.governing as
        | { metadata?: Record<string, unknown> }
        | null
        | undefined;

      return {
        utilizationRatio: candidate.utilizationRatio as number,
        demand: candidate.demand,
        capacity: candidate.capacity,
        metadata: governingOutput?.metadata ?? candidate.metadata,
      };
    }

    return selected;
  }, null);
}

export class ReinforcedConcreteBeamVerification {
  code: string;
  mesh: ReinforcedConcreteSectionMeshOptions;
  solver: RcBeamSolverOptions;
  shear: RcShearInput | null;
  torsion: RcTorsionInput | null;
  serviceability: RcServiceabilityOptions | false;
  detailing: RcBeamDetailingInput | null;
  verificationStations: BeamVerificationStations;
  metadata: Record<string, unknown>;

  constructor({
    code = "NTC2018",
    mesh = { targetFiberCount: 80 },
    solver = { tolerance: 1e-6, maxIterations: 100 },
    shear = null,
    torsion = null,
    serviceability = {},
    detailing = null,
    verificationStations = null,
    metadata = {},
  }: ReinforcedConcreteBeamVerificationOptions = {}) {
    this.code = code;
    this.mesh = { ...mesh };
    this.solver = { ...solver };
    this.shear = shear;
    this.torsion = torsion;
    this.serviceability = serviceability;
    this.detailing = detailing;
    this.verificationStations = verificationStations;
    this.metadata = { ...metadata };
  }

  verify({
    beamId = null,
    section = null,
    concreteMaterial = null,
    reinforcementMaterial = null,
    analysisResult = null,
    beamModel = null,
    mesh = this.mesh,
    solver = this.solver,
    shear = this.shear,
    torsion = this.torsion,
    serviceability = this.serviceability,
    detailing = this.detailing,
    verificationStations = this.verificationStations,
  }: ReinforcedConcreteBeamVerificationInput = {}): VerificationResult {
    if (section === null || analysisResult === null) {
      return new VerificationResult({
        applicationId: "reinforced-concrete-beams",
        status: RESULT_STATUS.NOT_ANALYZED,
        summary: "RC beam verification requires a section and a FEM beam analysis result.",
        warnings: [
          "RC beam verification from FEM actions was not run because required inputs are missing.",
        ],
        metadata: {
          code: this.code,
          beamId,
          ...this.metadata,
        },
      });
    }

    void beamModel;
    const resolvedConcreteMaterial =
      concreteMaterial ?? (section.concreteMaterial as ConcreteMaterial | null);
    const resolvedReinforcementMaterial =
      reinforcementMaterial ?? (section.reinforcementMaterial as SteelMaterial | null);

    if (resolvedConcreteMaterial === null || resolvedReinforcementMaterial === null) {
      return new VerificationResult({
        applicationId: "reinforced-concrete-beams",
        status: RESULT_STATUS.NOT_ANALYZED,
        summary: "RC beam verification requires concrete and reinforcement materials.",
        warnings: [
          "RC beam verification from FEM actions was not run because material inputs are missing.",
        ],
        metadata: {
          code: this.code,
          beamId,
          ...this.metadata,
        },
      });
    }

    const sectionUnits =
      (section.metadata.unitSystem as UnitSystemInput | undefined) ?? DEFAULT_SECTION_UNITS;
    const resultToSectionUnits = createUnitResolver(
      analysisResult.units as UnitSystemInput | null | undefined,
      sectionUnits,
    );
    const ulsVerification = new BeamSectionActionVerifier({
      applicationId: "reinforced-concrete-beams",
      sectionVerifier: createRcActionVerifier({
        section,
        concreteMaterial: resolvedConcreteMaterial,
        reinforcementMaterial: resolvedReinforcementMaterial,
        resultToSectionUnits,
        code: this.code,
        mesh,
        solver,
        shear,
        torsion,
      }),
      limitStates: "ULS",
      verificationStations,
    }).verify({ analysisResult });
    const serviceabilityOptions = serviceability === false ? null : serviceability;
    const serviceabilityVerification =
      serviceabilityOptions === null
        ? null
        : new BeamSectionActionVerifier({
            applicationId: "reinforced-concrete-beams",
            sectionVerifier: createRcServiceabilityActionVerifier({
              section,
              concreteMaterial: resolvedConcreteMaterial,
              reinforcementMaterial: resolvedReinforcementMaterial,
              resultToSectionUnits,
              code: this.code,
              mesh,
              solver: {
                tolerance: solver.serviceTolerance ?? 1e-2,
                maxIterations: solver.serviceMaxIterations ?? 50,
                finiteDifferenceStep: solver.finiteDifferenceStep ?? 1e-8,
              },
              serviceability: serviceabilityOptions,
            }),
            limitStates: "SLE",
            verificationStations,
          }).verify({ analysisResult });
    const deflectionVerification =
      serviceabilityOptions === null || serviceabilityOptions.deflection === false
        ? null
        : new CrackedSectionDeflectionAnalysis({
            code: this.code,
          }).analyze({
            beamId,
            analysisResult,
            section,
            concreteMaterial: resolvedConcreteMaterial,
            reinforcementMaterial: resolvedReinforcementMaterial,
            serviceability: serviceabilityOptions,
            mesh,
            solver: {
              tolerance: solver.serviceTolerance ?? 1e-2,
              maxIterations: solver.serviceMaxIterations ?? 50,
              finiteDifferenceStep: solver.finiteDifferenceStep ?? 1e-8,
            },
            beamModel,
          });
    const includeDeflection =
      deflectionVerification !== null &&
      Number(deflectionVerification.outputs.combinationCount ?? 0) > 0;
    const detailingVerification =
      detailing !== null
        ? new ReinforcedConcreteBeamDetailingVerification({
            code: this.code,
          }).verify({
            section,
            concreteMaterial: resolvedConcreteMaterial,
            reinforcementMaterial: resolvedReinforcementMaterial,
            detailing,
          })
        : null;
    const ulsOutputs = outputRecord(ulsVerification);
    const serviceabilityOutputs =
      serviceabilityVerification === null ? null : outputRecord(serviceabilityVerification);
    const actionVerification: BeamCombinedVerification =
      serviceabilityVerification !== null &&
      Number(serviceabilityOutputs?.stationResultCount ?? 0) > 0
        ? {
            status:
              ulsVerification.status === RESULT_STATUS.OK &&
              serviceabilityVerification.status === RESULT_STATUS.OK &&
              (!includeDeflection || deflectionVerification?.status === RESULT_STATUS.OK)
                ? RESULT_STATUS.OK
                : RESULT_STATUS.NOT_VERIFIED,
            utilizationRatio: Math.max(
              ulsVerification.utilizationRatio ?? 0,
              serviceabilityVerification.utilizationRatio ?? 0,
              includeDeflection ? (deflectionVerification?.utilizationRatio ?? 0) : 0,
            ),
            demand: null,
            capacity: null,
            checks: [
              ...ulsVerification.checks,
              ...serviceabilityVerification.checks,
              ...(includeDeflection ? (deflectionVerification?.checks ?? []) : []),
            ],
            outputs: {
              stationResultCount:
                Number(ulsOutputs.stationResultCount ?? 0) +
                Number(serviceabilityOutputs?.stationResultCount ?? 0),
              uls: ulsOutputs,
              serviceability: serviceabilityOutputs,
              deflection:
                includeDeflection && deflectionVerification !== null
                  ? {
                      status: deflectionVerification.status,
                      utilizationRatio: deflectionVerification.utilizationRatio,
                      outputs: deflectionVerification.outputs,
                      metadata: deflectionVerification.metadata,
                    }
                  : null,
              detailing: detailingVerification?.toJSON() ?? null,
              governing: governingFromResults([
                ulsVerification,
                serviceabilityVerification,
                ...(includeDeflection && deflectionVerification !== null
                  ? [deflectionVerification]
                  : []),
              ]),
            },
            warnings: [
              ...stringValues(ulsVerification.warnings),
              ...stringValues(serviceabilityVerification.warnings),
              ...(includeDeflection ? stringValues(deflectionVerification?.warnings) : []),
            ],
            assumptions: [
              ...stringValues(ulsVerification.assumptions),
              ...stringValues(serviceabilityVerification.assumptions),
              ...(includeDeflection ? stringValues(deflectionVerification?.assumptions) : []),
            ],
          }
        : {
            status: ulsVerification.status,
            utilizationRatio: ulsVerification.utilizationRatio,
            demand: ulsVerification.demand,
            capacity: ulsVerification.capacity,
            checks: [...ulsVerification.checks],
            outputs: {
              ...ulsOutputs,
              uls: ulsOutputs,
              serviceability: null,
              deflection:
                includeDeflection && deflectionVerification !== null
                  ? {
                      status: deflectionVerification.status,
                      utilizationRatio: deflectionVerification.utilizationRatio,
                      outputs: deflectionVerification.outputs,
                      metadata: deflectionVerification.metadata,
                    }
                  : null,
              detailing: detailingVerification?.toJSON() ?? null,
            },
            warnings: [
              ...stringValues(ulsVerification.warnings),
              ...(includeDeflection ? stringValues(deflectionVerification?.warnings) : []),
            ],
            assumptions: [
              ...stringValues(ulsVerification.assumptions),
              ...(includeDeflection ? stringValues(deflectionVerification?.assumptions) : []),
            ],
          };

    if (detailingVerification !== null) {
      if (detailingVerification.status !== RESULT_STATUS.OK) {
        actionVerification.status = detailingVerification.status;
      }
      actionVerification.utilizationRatio = Math.max(
        actionVerification.utilizationRatio ?? 0,
        detailingVerification.utilizationRatio ?? 0,
      );
      actionVerification.checks = [...actionVerification.checks, ...detailingVerification.checks];
      actionVerification.warnings = [
        ...actionVerification.warnings,
        ...stringValues(detailingVerification.warnings),
      ];
      actionVerification.assumptions = [
        ...actionVerification.assumptions,
        ...stringValues(detailingVerification.assumptions),
      ];
      actionVerification.outputs.detailing = detailingVerification.toJSON();
    }

    const checksById: Record<string, VerificationCheck> = {};
    for (const check of actionVerification.checks) {
      const id = String(check.id);
      const current = checksById[id];
      if (
        current === undefined ||
        (!Number.isFinite(current.utilizationRatio) && Number.isFinite(check.utilizationRatio)) ||
        (Number.isFinite(check.utilizationRatio) &&
          (check.utilizationRatio as number) > (current.utilizationRatio as number))
      ) {
        checksById[id] = check;
      }
    }

    const groupedChecks = Object.values(checksById);
    const governing = governingCheck(groupedChecks);
    const normativeReferences = groupedChecks.flatMap((check) => {
      const references = checkMetadata(check).normativeReferences;
      return Array.isArray(references) ? (references as NormativeReference[]) : [];
    });

    return new VerificationResult({
      applicationId: "reinforced-concrete-beams",
      status: actionVerification.status,
      summary: "RC beam ULS and SLE section verification from FEM beam actions.",
      utilizationRatio: governing?.utilizationRatio ?? actionVerification.utilizationRatio,
      demand: governing?.demand ?? actionVerification.demand,
      capacity: governing?.capacity ?? actionVerification.capacity,
      checks: groupedChecks,
      outputs: {
        stationResultCount: actionVerification.outputs.stationResultCount,
        uls: actionVerification.outputs.uls,
        serviceability: actionVerification.outputs.serviceability,
        deflection: actionVerification.outputs.deflection,
        detailing: actionVerification.outputs.detailing ?? detailingVerification?.toJSON() ?? null,
        governing: actionVerification.outputs.governing,
      },
      warnings: [
        ...actionVerification.warnings,
        "Global second-order effects are not generated by the local RC beam verifier; supply actions from the appropriate structural analysis.",
        ...(shear !== null
          ? [
              torsion !== null
                ? detailing === null
                  ? "Full member detailing is not included because no detailing contract was supplied."
                  : null
                : detailing !== null
                  ? "Torsion is not included in this RC beam verification step."
                  : "Torsion and full member detailing are not included in this RC beam verification step.",
            ]
          : [
              torsion !== null
                ? detailing !== null
                  ? "Shear resistance is not included in this RC beam verification step."
                  : "Shear resistance and full member detailing are not included in this RC beam verification step."
                : detailing !== null
                  ? "Shear resistance and torsion are not included in this RC beam verification step."
                  : "Shear resistance, torsion and full member detailing are not included in this RC beam verification step.",
            ]
        ).filter((warning): warning is string => warning !== null),
      ],
      assumptions: [
        ...actionVerification.assumptions,
        "Each FEM station is checked as an independent RC section; ULS bending and SLE stress checks use biaxial actions when present, while crack control remains based on the primary bending plane.",
      ],
      metadata: withNormativeReferences(
        {
          code: this.code,
          beamId,
          governingCheckId: governing?.id ?? null,
          verificationStations,
          ...this.metadata,
        },
        normativeReferences,
      ),
    });
  }
}
