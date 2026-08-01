import {
  VerificationResult,
  type VerificationCheck,
} from "../../../core/results/VerificationResult.js";
import { RESULT_STATUS, type ResultStatus } from "../../../core/results/resultStatus.js";
import type { ReinforcedConcreteSection } from "../../../domain/geometry/ReinforcedConcreteSection.js";
import type { ConcreteMaterial } from "../../../domain/materials/ConcreteMaterial.js";
import type { SteelMaterial } from "../../../domain/materials/SteelMaterial.js";
import {
  governingCheck,
  hasSignificantAction,
  isFinitePositive,
  normalizeCombinationType,
  round,
  utilizationCheck,
} from "../shared/rcCommon.js";
import {
  solveRcServiceSectionState,
  type RcServiceStressSolverConfiguration,
} from "../shared/solveRcServiceSectionState.js";
import type { ReinforcedConcreteSectionMeshOptions } from "../models/ReinforcedConcreteSectionModel.js";
import {
  createIndirectCrackControlChecks,
  crackWidthLimit,
  filterBarsForCrackControl,
  localSpacing,
  tensionBars,
} from "./serviceability/crackControl.js";
import {
  normalizeEnvironment,
  resolveServiceabilityOptions,
  type RcServiceabilityOptions,
  type ResolvedRcServiceabilityOptions,
} from "./serviceability/serviceabilityOptions.js";
import { NTC2018_RC_CHAPTER_4_REFERENCES } from "../../../norms/ntc2018/normativeReferences.js";
import {
  withNormativeReferences,
  type NormativeReference,
} from "../../../norms/normativeReference.js";

interface StressLimit {
  id: string;
  factor: number;
  normativeReference: NormativeReference;
  value: number;
  method: string;
}

interface ServiceStressActions {
  nEd: number;
  primaryMoment: number;
  userMxEd: number;
  userMyEd: number;
  stressMxEd: number;
  stressMyEd: number;
  biaxialStress: boolean;
}

export interface RcServiceabilityVerificationOptions {
  code?: string;
  mesh?: ReinforcedConcreteSectionMeshOptions;
  solver?: RcServiceStressSolverConfiguration;
  serviceability?: RcServiceabilityOptions;
  metadata?: Record<string, unknown>;
}

export interface RcServiceabilityContext extends Record<string, unknown> {
  section?: ReinforcedConcreteSection | null;
  concreteMaterial?: ConcreteMaterial | null;
  reinforcementMaterial?: SteelMaterial | null;
  combinationType?: string | null;
  serviceability?: RcServiceabilityOptions;
  mesh?: ReinforcedConcreteSectionMeshOptions;
  solver?: RcServiceStressSolverConfiguration;
}

export interface RcServiceabilitySectionActionsInput {
  nEd?: number;
  mEd?: number;
  mxEd?: number | null;
  myEd?: number | null;
  context?: RcServiceabilityContext;
  section?: ReinforcedConcreteSection | null;
  concreteMaterial?: ConcreteMaterial | null;
  reinforcementMaterial?: SteelMaterial | null;
  serviceability?: RcServiceabilityOptions;
  mesh?: ReinforcedConcreteSectionMeshOptions;
  solver?: RcServiceStressSolverConfiguration;
}

export interface RcServiceabilityActions extends Record<string, unknown> {
  nEd?: number;
  n?: number;
  mEd?: number;
  m?: number;
  mxEd?: number;
  myEd?: number;
  mzEd?: number;
  combinationType?: string;
}

export interface RcServiceabilityVerifyInput {
  section?: ReinforcedConcreteSection | null;
  concreteMaterial?: ConcreteMaterial | null;
  reinforcementMaterial?: SteelMaterial | null;
  actions?: RcServiceabilityActions;
  combinationType?: string;
  serviceability?: RcServiceabilityOptions;
  mesh?: ReinforcedConcreteSectionMeshOptions;
  solver?: RcServiceStressSolverConfiguration;
}

export interface RcServiceabilitySectionResult {
  status: ResultStatus;
  utilizationRatio: number | null;
  demand: unknown;
  capacity: unknown;
  checks: VerificationCheck[];
  warnings: string[];
  assumptions: string[];
  outputs?: Record<string, unknown>;
  metadata: Record<string, unknown>;
}

function concreteStressLimit({
  combinationType,
  concreteMaterial,
}: {
  combinationType?: string | null | undefined;
  concreteMaterial?: ConcreteMaterial | null | undefined;
}): StressLimit | null {
  const normalizedCombination = normalizeCombinationType(combinationType);
  const fck = concreteMaterial?.fck;

  if (!isFinitePositive(fck)) {
    return null;
  }

  if (
    normalizedCombination === "SLE_RARE" ||
    normalizedCombination === "SLE_CHARACTERISTIC" ||
    normalizedCombination === "SLE_CHAR"
  ) {
    return {
      id: "rare",
      factor: 0.6,
      normativeReference: NTC2018_RC_CHAPTER_4_REFERENCES.concreteStressCharacteristic,
      value: 0.6 * fck,
      method: "ntc2018-4.1.2.2.5.1-characteristic",
    };
  }

  if (normalizedCombination === "SLE_QUASI_PERMANENT") {
    return {
      id: "quasi-permanent",
      factor: 0.45,
      normativeReference: NTC2018_RC_CHAPTER_4_REFERENCES.concreteStressQuasiPermanent,
      value: 0.45 * fck,
      method: "ntc2018-4.1.2.2.5.1-quasi-permanent",
    };
  }

  return null;
}

function steelStressLimit({
  combinationType,
  reinforcementMaterial,
}: {
  combinationType?: string | null | undefined;
  reinforcementMaterial?: SteelMaterial | null | undefined;
}): StressLimit | null {
  const normalizedCombination = normalizeCombinationType(combinationType);
  const fyk = reinforcementMaterial?.fyk;

  if (!isFinitePositive(fyk)) {
    return null;
  }

  if (
    normalizedCombination === "SLE_RARE" ||
    normalizedCombination === "SLE_CHARACTERISTIC" ||
    normalizedCombination === "SLE_CHAR"
  ) {
    return {
      id: "rare",
      factor: 0.8,
      normativeReference: NTC2018_RC_CHAPTER_4_REFERENCES.reinforcementStress,
      value: 0.8 * fyk,
      method: "ntc2018-4.1.2.2.5.2-characteristic",
    };
  }

  return null;
}

function isNormativeReference(
  value: NormativeReference | null | undefined,
): value is NormativeReference {
  return value != null;
}

function serviceabilityReferences({
  combinationType,
  concreteMaterial,
  reinforcementMaterial,
  includeCrackControl = false,
}: {
  combinationType?: string | null;
  concreteMaterial?: ConcreteMaterial | null;
  reinforcementMaterial?: SteelMaterial | null;
  includeCrackControl?: boolean;
}): NormativeReference[] {
  return [
    concreteStressLimit({ combinationType, concreteMaterial })?.normativeReference,
    steelStressLimit({ combinationType, reinforcementMaterial })?.normativeReference,
    includeCrackControl ? NTC2018_RC_CHAPTER_4_REFERENCES.crackWidth : null,
  ].filter(isNormativeReference);
}

function resolveStressActions({
  nEd,
  mEd,
  mxEd,
  myEd,
}: {
  nEd: number;
  mEd: number;
  mxEd: number | null;
  myEd: number | null;
}): ServiceStressActions {
  const userMxEd = Number.isFinite(mxEd) ? (mxEd as number) : Number.isFinite(mEd) ? mEd : 0;
  const userMyEd = Number.isFinite(myEd) ? (myEd as number) : 0;
  const primaryMoment = Number.isFinite(mEd) ? mEd : userMxEd;

  return {
    nEd,
    primaryMoment,
    userMxEd,
    userMyEd,
    stressMxEd: userMxEd,
    stressMyEd: userMyEd,
    biaxialStress: hasSignificantAction(userMyEd, userMxEd),
  };
}

function maxAbsSteelStress(state: { steel: { bars: Record<string, unknown>[] } }): number {
  return state.steel.bars.reduce((max, bar) => {
    const stress = Number.isFinite(bar.stress) ? Math.abs(bar.stress as number) : 0;
    return Math.max(max, stress);
  }, 0);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export class ReinforcedConcreteServiceabilityVerification {
  code: string;
  mesh: ReinforcedConcreteSectionMeshOptions;
  solver: RcServiceStressSolverConfiguration;
  serviceability: ResolvedRcServiceabilityOptions;
  metadata: Record<string, unknown>;

  constructor({
    code = "NTC2018",
    mesh = { targetFiberCount: 100 },
    solver = { tolerance: 1e-2, maxIterations: 50 },
    serviceability = {},
    metadata = {},
  }: RcServiceabilityVerificationOptions = {}) {
    this.code = code;
    this.mesh = { ...mesh };
    this.solver = { ...solver };
    this.serviceability = resolveServiceabilityOptions(serviceability);
    this.metadata = { ...metadata };
  }

  verifySectionActions({
    nEd = 0,
    mEd = 0,
    mxEd = null,
    myEd = null,
    context = {},
    section = context.section ?? null,
    concreteMaterial = context.concreteMaterial ?? (section?.concreteMaterial as ConcreteMaterial),
    reinforcementMaterial = context.reinforcementMaterial ??
      (section?.reinforcementMaterial as SteelMaterial),
    serviceability = context.serviceability ?? this.serviceability,
    mesh = context.mesh ?? this.mesh,
    solver = context.solver ?? this.solver,
  }: RcServiceabilitySectionActionsInput = {}): RcServiceabilitySectionResult {
    const options = resolveServiceabilityOptions(serviceability);
    const warnings: string[] = [];
    const assumptions = [
      "RC SLE stresses are solved with a linear no-tension concrete section and the modular-ratio method.",
      "The first SLE cracking MVP uses ordinary reinforcing steel as low-sensitivity reinforcement.",
      `Creep coefficient for the deflection MVP is set to phi = ${options.deflection.creepCoefficient}; shrinkage curvature is not included.`,
    ];
    const checks: VerificationCheck[] = [];
    const stressActions = resolveStressActions({
      nEd,
      mEd,
      mxEd,
      myEd,
    });
    const combinationType = context.combinationType ?? null;

    if (
      Math.abs(nEd) <= 1e-6 &&
      Math.abs(stressActions.stressMxEd) <= 1 &&
      Math.abs(stressActions.stressMyEd) <= 1
    ) {
      return {
        status: RESULT_STATUS.OK,
        utilizationRatio: null,
        demand: null,
        capacity: null,
        checks,
        warnings,
        assumptions,
        outputs: {
          nEd: 0,
          mEd: 0,
          mxEd: 0,
          myEd: 0,
          biaxialStress: false,
          crackControlMomentEd: 0,
          combinationType,
          modularRatio: options.modularRatio,
          creepCoefficient: options.deflection.creepCoefficient,
          includeShrinkage: options.deflection.includeShrinkage,
          concreteCompression: 0,
          steelStress: 0,
          crackWidthClass: crackWidthLimit({
            environment: options.environment,
            combinationType,
          }),
          crackControlGroupId: null,
          crackControlFace: null,
          crackControlComplete: true,
          tensileBars: [],
        },
        metadata: withNormativeReferences(
          {
            code: this.code,
            method: "ntc2018-sle-serviceability",
            governingCheckId: null,
            combinationType,
            mEd: 0,
            mxEd: 0,
            myEd: 0,
            biaxialStress: false,
            crackControlMomentBasis: "primary-moment-only",
            weakAxisMomentNeglectedInCrackControl: false,
            modularRatio: options.modularRatio,
            environment: normalizeEnvironment(options.environment),
            reinforcementSensitivity: options.reinforcementSensitivity,
            creepCoefficient: options.deflection.creepCoefficient,
            includeShrinkage: options.deflection.includeShrinkage,
            ...this.metadata,
          },
          serviceabilityReferences({
            combinationType,
            concreteMaterial,
            reinforcementMaterial,
            includeCrackControl: true,
          }),
        ),
      };
    }

    if (normalizeEnvironment(options.environment) !== "ordinary") {
      warnings.push(
        `Crack-control environment ${options.environment} was used; default is ordinary.`,
      );
    }

    if (options.reinforcementSensitivity !== "low") {
      warnings.push(
        "Only low-sensitivity ordinary reinforcement is supported in this SLE cracking MVP.",
      );
    }

    if (section == null || concreteMaterial == null || reinforcementMaterial == null) {
      return {
        status: RESULT_STATUS.NOT_VERIFIED,
        utilizationRatio: null,
        demand: null,
        capacity: null,
        checks: [],
        warnings: [
          ...warnings,
          "RC SLE verification requires section, concrete material, and reinforcement material.",
        ],
        assumptions,
        metadata: withNormativeReferences(
          {
            code: this.code,
            method: "ntc2018-sle-serviceability",
            ...this.metadata,
          },
          serviceabilityReferences({
            combinationType,
            concreteMaterial,
            reinforcementMaterial,
          }),
        ),
      };
    }

    let solvedState;
    let meshResult;

    try {
      const solved = solveRcServiceSectionState({
        section,
        reinforcementMaterial,
        actions: {
          nEd,
          mxEd: stressActions.stressMxEd,
          myEd: stressActions.stressMyEd,
        },
        mesh,
        solver,
        modularRatio: options.modularRatio,
      });
      solvedState = solved.solved;
      meshResult = solved.mesh;
    } catch (error) {
      return {
        status: RESULT_STATUS.NOT_VERIFIED,
        utilizationRatio: null,
        demand: null,
        capacity: null,
        checks: [],
        warnings: [...warnings, errorMessage(error)],
        assumptions,
        metadata: withNormativeReferences(
          {
            code: this.code,
            method: "ntc2018-sle-serviceability",
            ...this.metadata,
          },
          serviceabilityReferences({
            combinationType,
            concreteMaterial,
            reinforcementMaterial,
          }),
        ),
      };
    }

    if (!solvedState.converged) {
      warnings.push("The RC SLE stress solver did not converge within the configured limits.");
    }

    const concreteCompression = Math.abs(
      solvedState.state.extremes.maxConcreteCompression?.value ?? 0,
    );
    const steelStress = maxAbsSteelStress(solvedState.state);
    const concreteLimit = concreteStressLimit({
      combinationType,
      concreteMaterial,
    });
    const steelLimit = steelStressLimit({
      combinationType,
      reinforcementMaterial,
    });

    if (concreteLimit !== null) {
      checks.push(
        utilizationCheck({
          id: "rc-sle-concrete-stress",
          description: "Concrete compression stress limit in service",
          demand: concreteCompression,
          capacity: concreteLimit.value,
          metadata: withNormativeReferences(
            {
              method: concreteLimit.method,
              combinationType,
              limitFactor: concreteLimit.factor,
              fck: round(concreteMaterial.fck as number),
              sigmaCMax: round(concreteCompression),
              modularRatio: options.modularRatio,
              mxEd: round(stressActions.userMxEd),
              myEd: round(stressActions.userMyEd),
              biaxialStress: stressActions.biaxialStress,
            },
            [concreteLimit.normativeReference],
          ),
        }),
      );
    }

    if (steelLimit !== null) {
      checks.push(
        utilizationCheck({
          id: "rc-sle-steel-stress",
          description: "Reinforcement stress limit in service",
          demand: steelStress,
          capacity: steelLimit.value,
          metadata: withNormativeReferences(
            {
              method: steelLimit.method,
              combinationType,
              limitFactor: steelLimit.factor,
              fyk: round(reinforcementMaterial.fyk as number),
              sigmaSMax: round(steelStress),
              modularRatio: options.modularRatio,
              mxEd: round(stressActions.userMxEd),
              myEd: round(stressActions.userMyEd),
              biaxialStress: stressActions.biaxialStress,
            },
            [steelLimit.normativeReference],
          ),
        }),
      );
    }

    const widthClass = crackWidthLimit({
      environment: options.environment,
      combinationType,
    });
    let crackSolvedState = solvedState;
    let crackStateUnavailable = false;

    if (widthClass !== null && stressActions.biaxialStress) {
      warnings.push(
        "RC indirect crack control neglects the weak-axis service moment component and uses only the primary bending moment for top/bottom reinforcement groups.",
      );

      try {
        const crackSolved = solveRcServiceSectionState({
          section,
          reinforcementMaterial,
          actions: {
            nEd,
            mxEd: stressActions.primaryMoment,
            myEd: 0,
          },
          mesh,
          solver,
          modularRatio: options.modularRatio,
        });
        crackSolvedState = crackSolved.solved;

        if (!crackSolvedState.converged) {
          warnings.push(
            "The RC SLE crack-control uniaxial stress state did not converge within the configured limits.",
          );
          crackStateUnavailable = true;
        }
      } catch (error) {
        warnings.push(errorMessage(error));
        crackStateUnavailable = true;
      }
    }

    const crackControlSelection = filterBarsForCrackControl({
      bars: tensionBars(crackSolvedState.state, section),
      section,
      serviceability: options,
      mEd: stressActions.primaryMoment,
      warnings,
    });
    const barsInTension = crackControlSelection.bars;
    let crackControlNotVerified = crackStateUnavailable;

    if (widthClass !== null) {
      const crackCheckCountBefore = checks.length;

      if (crackControlSelection.missingRequiredGroup) {
        crackControlNotVerified = true;
      }

      checks.push(
        ...createIndirectCrackControlChecks({
          barsInTension,
          widthClass,
          options,
          combinationType,
          selection: crackControlSelection,
          stressActions,
        }),
      );

      if (barsInTension.length === 0) {
        warnings.push(
          "No tensile reinforcement bars were found for indirect crack control at this station.",
        );
        crackControlNotVerified = true;
      }

      if (checks.length === crackCheckCountBefore) {
        warnings.push("No indirect crack-control checks were generated for this station.");
        crackControlNotVerified = true;
      }
    }

    const governing = governingCheck(
      checks.filter(
        (
          check,
        ): check is VerificationCheck & {
          id: string;
          demand: number;
          capacity: number;
          utilizationRatio: number | null;
        } =>
          typeof check.id === "string" &&
          Number.isFinite(check.demand) &&
          Number.isFinite(check.capacity) &&
          (check.utilizationRatio === null || Number.isFinite(check.utilizationRatio)),
      ),
    );

    return {
      status:
        solvedState.converged &&
        !crackControlNotVerified &&
        checks.every((check) => check.ok === true)
          ? RESULT_STATUS.OK
          : RESULT_STATUS.NOT_VERIFIED,
      utilizationRatio: governing?.utilizationRatio ?? null,
      demand: governing?.demand ?? null,
      capacity: governing?.capacity ?? null,
      checks,
      warnings,
      assumptions,
      outputs: {
        nEd: round(nEd),
        mEd: round(stressActions.primaryMoment),
        mxEd: round(stressActions.userMxEd),
        myEd: round(stressActions.userMyEd),
        biaxialStress: stressActions.biaxialStress,
        crackControlMomentEd: round(stressActions.primaryMoment),
        combinationType,
        fiberCount: meshResult.generatedCount,
        modularRatio: options.modularRatio,
        creepCoefficient: options.deflection.creepCoefficient,
        includeShrinkage: options.deflection.includeShrinkage,
        concreteCompression: round(concreteCompression),
        steelStress: round(steelStress),
        crackWidthClass: widthClass,
        crackControlGroupId: crackControlSelection.groupId,
        crackControlFace: crackControlSelection.face,
        crackControlComplete: !crackControlNotVerified,
        tensileBars: barsInTension.map((bar) => ({
          id: bar.id,
          y: round(bar.y),
          z: round(bar.z),
          diameter: round(bar.diameter),
          stress: round(bar.stress),
          spacing: round(
            crackControlSelection.spacing ?? localSpacing(bar, barsInTension, options.rowTolerance),
          ),
        })),
        strainField: {
          eps0: round(solvedState.strainField.eps0, 12),
          kappaY: round(solvedState.strainField.kappaY, 12),
          kappaZ: round(solvedState.strainField.kappaZ, 12),
        },
      },
      metadata: withNormativeReferences(
        {
          code: this.code,
          method: "ntc2018-sle-serviceability",
          governingCheckId: governing?.id ?? null,
          combinationType,
          mEd: round(stressActions.primaryMoment),
          mxEd: round(stressActions.userMxEd),
          myEd: round(stressActions.userMyEd),
          biaxialStress: stressActions.biaxialStress,
          crackControlMomentBasis: "primary-moment-only",
          weakAxisMomentNeglectedInCrackControl: stressActions.biaxialStress,
          modularRatio: options.modularRatio,
          environment: normalizeEnvironment(options.environment),
          reinforcementSensitivity: options.reinforcementSensitivity,
          creepCoefficient: options.deflection.creepCoefficient,
          includeShrinkage: options.deflection.includeShrinkage,
          ...this.metadata,
        },
        serviceabilityReferences({
          combinationType,
          concreteMaterial,
          reinforcementMaterial,
          includeCrackControl: widthClass !== null,
        }),
      ),
    };
  }

  verify({
    section = null,
    concreteMaterial = section?.concreteMaterial as ConcreteMaterial,
    reinforcementMaterial = section?.reinforcementMaterial as SteelMaterial,
    actions = {},
    combinationType = actions.combinationType ?? "SLE_RARE",
    serviceability = this.serviceability,
    mesh = this.mesh,
    solver = this.solver,
  }: RcServiceabilityVerifyInput = {}): VerificationResult {
    const finiteMxEd =
      typeof actions.mxEd === "number" && Number.isFinite(actions.mxEd) ? actions.mxEd : 0;
    const primaryMoment = actions.mEd ?? actions.m ?? finiteMxEd;
    const result = this.verifySectionActions({
      nEd: actions.nEd ?? actions.n ?? 0,
      mEd: primaryMoment,
      mxEd: actions.mxEd ?? null,
      myEd: actions.myEd ?? actions.mzEd ?? null,
      context: {
        section,
        concreteMaterial,
        reinforcementMaterial,
        combinationType,
        serviceability,
        mesh,
        solver,
      },
    });

    return new VerificationResult({
      applicationId: "reinforced-concrete-serviceability",
      status: result.status,
      summary:
        "RC serviceability verification with modular-ratio stresses and indirect crack control.",
      utilizationRatio: result.utilizationRatio,
      demand: result.demand,
      capacity: result.capacity,
      checks: result.checks,
      outputs: result.outputs ?? {},
      warnings: result.warnings,
      assumptions: result.assumptions,
      metadata: {
        code: this.code,
        ...result.metadata,
      },
    });
  }
}
