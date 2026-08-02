import type { ResultStatus } from "../../core/results/resultStatus.js";
import type { ReinforcedConcreteSection } from "../../domain/geometry/ReinforcedConcreteSection.js";
import type {
  ConcurrentFemGlobalResponses,
  ConcurrentFemJointActionState,
  ConcurrentFemMemberActionState,
  ConcurrentFemSectionCutState,
  ConcurrentFemSurfaceResultantState,
  ResistanceJointActionState,
  ResistanceLineActionState,
  ResistanceSectionCutState,
  ResistanceSupportReactionState,
} from "../../domain/fem/index.js";
import type {
  FemFoundation,
  FemJoint,
  FemPunchingConnection,
  FemSignConventions,
  FemStructuralMember,
  FemStructuralSlab,
  FemStructuralWall,
  FemUnitSystem,
  GlobalFemAnalysisContract,
  GlobalFemResultContract,
} from "../../domain/fem/contracts/FemContractTypes.js";
import type {
  GlobalFemDemandSet,
  GlobalFemJointDemand,
  GlobalFemMemberDemandGroup,
  GlobalFemPostProcessingInput,
  GlobalFemSurfaceDemandGroup,
} from "../global-fem-postprocessing/GlobalFemPostProcessingTypes.js";
import type {
  Ntc2018BeamColumnHierarchyInput,
  Ntc2018CapacityDesignAssessment,
} from "../../norms/ntc2018/reinforced-concrete/capacityDesign.js";
import type { Ntc2018RcBuildingCompleteness } from "./ntc2018RcBuildingCoverage.js";
import type { Ntc2018BehaviorInput } from "../../norms/ntc2018/reinforced-concrete/structuralBehavior.js";
import type {
  Ntc2018DisplacementAssessmentInput,
  Ntc2018StoreyDisplacementInput,
} from "../../norms/ntc2018/reinforced-concrete/displacementChecks.js";
import type { Ntc2018LinearDynamicAssessmentInput } from "../../norms/ntc2018/seismicAnalysisChecks.js";
import type { Ntc2018RegularityAssessmentInput } from "../../norms/ntc2018/reinforced-concrete/structuralRegularity.js";
import type {
  Ntc2018StructuralBehavior,
  Ntc2018StructuralType,
  Ntc2018TopologyInput,
} from "../../norms/ntc2018/reinforced-concrete/structuralBehavior.js";
import type {
  FoundationSystemData,
  FoundationSystemVerificationContext,
  FoundationVerifier,
} from "./foundationSystemVerification.js";
import type {
  DiaphragmStateVerifier,
  PunchingVerifier,
  SlabStateVerifier,
  SlabSystemData,
  SlabSystemContext,
} from "./slabSystemVerification.js";
import type {
  WallSectionStateVerifier,
  WallSystemData,
  WallSystemVerificationContext,
} from "./wallSystemVerification.js";

export type JsonRecord = Record<string, unknown>;

export interface RcCheckDto extends JsonRecord {
  readonly id?: string;
  readonly ok?: boolean;
  readonly utilizationRatio?: number | null;
}

export type RcBuildingAssessmentStatus =
  | "ready"
  | "blocked"
  | "covered-by-wall-system"
  | "not-applicable"
  | "not-evaluated";

export interface RcBuildingReadinessAssessment extends JsonRecord {
  readonly assessment: string;
  readonly status: RcBuildingAssessmentStatus;
  readonly missing: readonly string[];
  readonly reason?: string | null;
}

export interface RcBuildingGlobalFemContext {
  readonly units: FemUnitSystem;
  readonly signConventions: FemSignConventions;
  readonly model: GlobalFemDemandSet["model"];
  readonly analysis: GlobalFemDemandSet["analysis"];
  readonly resultId: string;
}

export interface RcBuildingVerifierContext {
  readonly behavior: Ntc2018StructuralBehavior | null;
  readonly structuralType: Ntc2018StructuralType | null;
  readonly q: number | null;
  readonly q0: number | null;
  readonly kr: number | null;
  readonly units: FemUnitSystem | null;
  readonly analysis?: GlobalFemAnalysisContract | null;
  readonly globalFem: RcBuildingGlobalFemContext | null;
}

export interface RcMemberFemDemandContext {
  readonly schema: "strutture-js/rc-member-fem-demand-context";
  readonly version: 0;
  readonly units: FemUnitSystem;
  readonly signConventions: FemSignConventions;
  readonly memberDemand: GlobalFemMemberDemandGroup;
  readonly concurrentActionStates: readonly ConcurrentFemMemberActionState[];
  readonly concurrentResistanceActionStates: readonly ResistanceLineActionState[];
}

export interface RcJointFemDemandContext {
  readonly schema: "strutture-js/rc-joint-fem-demand-context";
  readonly version: 0;
  readonly units: FemUnitSystem;
  readonly signConventions: FemSignConventions;
  readonly jointDemand: GlobalFemJointDemand;
  readonly concurrentActionStates: readonly ConcurrentFemJointActionState[];
  readonly concurrentResistanceActionStates: readonly ResistanceJointActionState[];
}

export interface RcWallFemDemandContext {
  readonly schema: "strutture-js/rc-wall-fem-demand-context";
  readonly version: 0;
  readonly units: FemUnitSystem | null;
  readonly signConventions: FemSignConventions | null;
  readonly surfaceDemand: GlobalFemSurfaceDemandGroup | null;
  readonly concurrentShellResultantStates: readonly ConcurrentFemSurfaceResultantState[];
  readonly concurrentSectionCutStates: readonly ConcurrentFemSectionCutState[];
  concurrentResistanceSectionCutStates?: readonly ResistanceSectionCutState[];
}

export interface RcMemberVerifierOutcome extends JsonRecord {
  readonly status?: ResultStatus;
  readonly utilizationRatio?: number | null;
  readonly checks?: readonly RcCheckDto[];
  readonly outputs?: unknown;
}

export interface RcMemberVerifierInput {
  readonly member: FemStructuralMember;
  readonly data: JsonRecord | null;
  readonly demand: RcMemberFemDemandContext;
  readonly context: RcBuildingVerifierContext;
}

export type RcMemberVerifier = (input: RcMemberVerifierInput) => RcMemberVerifierOutcome;

export interface RcJointVerifierInput {
  readonly joint: FemJoint;
  readonly data: JsonRecord | null;
  readonly demand: RcJointFemDemandContext;
  readonly context: RcBuildingVerifierContext;
}

export type RcJointVerifier = (input: RcJointVerifierInput) => RcMemberVerifierOutcome;

export interface RcWallSectionInput {
  readonly section: ReinforcedConcreteSection;
  readonly actions?: RcWallActions | null;
  readonly concreteDesignStrength: number;
  readonly reinforcementDesignStrength: number;
  readonly concreteEc2?: number;
  readonly concreteEcu?: number;
  readonly steelElasticModulus?: number;
  readonly steelUltimateStrain?: number;
  readonly targetFiberCount?: number;
  readonly angleCount?: number;
  readonly selectActionsFromFem?: (input: {
    readonly wall: FemStructuralWall;
    readonly data: RcWallSectionInput;
    readonly demand: RcWallFemDemandContext;
  }) => RcWallActions | null;
}

export interface RcWallActions extends JsonRecord {
  readonly axialForce: number;
  readonly momentX: number;
  readonly momentY: number;
  readonly reference?: unknown;
}

export interface RcBuildingVerificationInput extends GlobalFemPostProcessingInput {
  readonly behavior?: Ntc2018BehaviorInput;
  readonly structuralType?: string | null;
  readonly regularityAssessmentInput?: Omit<Ntc2018RegularityAssessmentInput, "behavior">;
  readonly linearDynamicAssessmentInput?: Ntc2018LinearDynamicAssessmentInput;
  readonly displacementAssessmentInput?: Ntc2018DisplacementAssessmentInput;
  readonly structuralBehaviorParameters?: Ntc2018TopologyInput;
  readonly units?: FemUnitSystem | null;
  readonly metadata?: JsonRecord;
  readonly memberVerifiers?: Readonly<Record<string, RcMemberVerifier>> | null;
  readonly memberData?: Readonly<Record<string, JsonRecord>> | null;
  readonly jointVerifier?: RcJointVerifier | null;
  readonly jointData?: Readonly<Record<string, JsonRecord>> | null;
  readonly jointHierarchy?: Readonly<
    Record<string, Omit<Ntc2018BeamColumnHierarchyInput, "behavior">>
  > | null;
  readonly wallSections?: Readonly<Record<string, RcWallSectionInput>> | null;
  readonly wallSystemData?: Readonly<Record<string, WallSystemData>> | null;
  readonly wallSectionStateVerifier?: WallSectionStateVerifier | null;
  readonly slabSystemData?: Readonly<Record<string, SlabSystemData>> | null;
  readonly slabStateVerifier?: SlabStateVerifier | null;
  readonly punchingVerifier?: PunchingVerifier | null;
  readonly diaphragmStateVerifier?: DiaphragmStateVerifier | null;
  readonly foundationSystemData?: Readonly<Record<string, FoundationSystemData>> | null;
  readonly foundationVerifier?: FoundationVerifier | null;
}

export interface RcBuildingVerificationOutputs extends JsonRecord {
  readonly globalFemDemandSet: GlobalFemDemandSet | null;
  readonly readiness: readonly RcBuildingReadinessAssessment[];
  readonly blockedAssessments: readonly RcBuildingReadinessAssessment[];
  readonly capacityDesign: JsonRecord & {
    readonly applicable: boolean;
    readonly jointCount: number;
    readonly checks: readonly (JsonRecord & { readonly jointId: string })[];
  };
  readonly displacement: JsonRecord & {
    readonly status?: string;
    readonly storeyResults?: readonly JsonRecord[];
  };
  readonly regularity: JsonRecord & {
    readonly status?: string;
    readonly planRegularity?: string;
    readonly elevationRegularity?: string;
  };
  readonly linearDynamicAnalysis: JsonRecord & {
    readonly status: string;
    readonly ok: boolean;
    readonly complete: boolean;
    readonly checks: readonly RcCheckDto[];
    readonly massParticipation?: {
      readonly directions: readonly {
        readonly direction: string;
        readonly totalParticipatingMassRatio: number;
      }[];
    };
  };
  readonly normativeCoverage: JsonRecord;
  readonly completeness: Ntc2018RcBuildingCompleteness;
  readonly behavior: JsonRecord & {
    readonly status: string;
    readonly behavior: Ntc2018StructuralBehavior | null;
    readonly structuralType: Ntc2018StructuralType | null;
    readonly q?: number;
    readonly reason?: string;
  };
  readonly members: RcBuildingVerificationCollection;
  readonly joints: RcBuildingVerificationCollection;
  readonly jointHierarchy: RcBuildingVerificationCollection;
  readonly walls: RcBuildingVerificationCollection;
  readonly wallSystems: RcBuildingVerificationCollection<RcWallSystemResultItem>;
  readonly slabSystems: RcBuildingVerificationCollection<RcSlabSystemResultItem>;
  readonly foundationSystems: RcBuildingVerificationCollection<RcFoundationSystemResultItem>;
  readonly checks: readonly RcCheckDto[];
  readonly checkCount: number;
}

export interface RcBuildingVerificationItem extends JsonRecord {
  readonly status?: string;
  readonly role?: string;
  readonly missing?: readonly string[];
  readonly sourceStateCount?: number;
  readonly resistanceStateCount?: number;
}

export interface RcBuildingVerificationCollection<
  TItem extends RcBuildingVerificationItem = RcBuildingVerificationItem,
> extends JsonRecord {
  readonly count: number;
  readonly verified: number;
  readonly notAnalyzed: number;
  readonly results: readonly TItem[];
}

export interface RcWallSystemResultItem extends RcBuildingVerificationItem {
  readonly sourceStateCount: number;
  readonly resistanceStateCount: number;
  readonly sectionStateAssessments: readonly {
    readonly missing: readonly string[];
  }[];
}

export interface RcSlabSystemResultItem extends RcBuildingVerificationItem {
  readonly stateAssessments: readonly {
    readonly missing: readonly string[];
  }[];
  readonly punching: JsonRecord & {
    readonly status: string;
    readonly connections: readonly { readonly missingCombinationIds: readonly string[] }[];
  };
}

export interface RcFoundationSystemResultItem extends RcBuildingVerificationItem {
  readonly missing: readonly string[];
}

export interface RcBuildingVerificationResultDto {
  readonly applicationId: string;
  readonly status: ResultStatus;
  readonly summary: string;
  readonly outputs: RcBuildingVerificationOutputs;
  readonly warnings: readonly unknown[];
  readonly assumptions: readonly unknown[];
  readonly metadata: JsonRecord;
}

export type RcBuildingSolverResult = GlobalFemResultContract | null | undefined;

export type RcBuildingMappedSurface = FemStructuralSlab;
export type RcBuildingMappedWall = FemStructuralWall;
export type RcBuildingMappedFoundation = FemFoundation;
export type RcBuildingMappedPunchingConnection = FemPunchingConnection;
export type RcBuildingResponses = ConcurrentFemGlobalResponses;
export type RcBuildingStoreyInput = Ntc2018StoreyDisplacementInput;
export type RcBuildingCapacityDesignAssessment = Ntc2018CapacityDesignAssessment;
export type RcBuildingAnalysisState = {
  readonly sectionCuts: readonly ConcurrentFemSectionCutState[];
  readonly shellResultants: readonly ConcurrentFemSurfaceResultantState[];
  readonly supportReactions: readonly ResistanceSupportReactionState[];
};

export type RcBuildingSubVerifierContext =
  | WallSystemVerificationContext
  | SlabSystemContext
  | FoundationSystemVerificationContext;
