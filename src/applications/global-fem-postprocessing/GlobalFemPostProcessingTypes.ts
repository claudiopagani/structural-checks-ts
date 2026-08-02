import type {
  FemAxes,
  FemCapabilitiesContract,
  FemDiagnostic,
  FemEntityMappingContract,
  FemId,
  FemJsonObject,
  FemLineElementEnd,
  FemModeResult,
  FemNodalDisplacementResult,
  FemReactionResult,
  FemResultLocation,
  FemSectionCutResult,
  FemSignConventions,
  FemStoreyResult,
  FemUnitSystem,
  FemValidationResult,
  FemVector3,
  GlobalFemAnalysisContract,
  GlobalFemModelContract,
  GlobalFemResultContract,
} from "../../domain/fem/contracts/FemContractTypes.js";
import type { GLOBAL_FEM_POSTPROCESSING_PROFILES } from "./classificationPolicy.js";

export type GlobalFemPostProcessingProfile =
  (typeof GLOBAL_FEM_POSTPROCESSING_PROFILES)[keyof typeof GLOBAL_FEM_POSTPROCESSING_PROFILES];

export interface GlobalFemClassificationPolicyLine {
  readonly verticalToleranceDegrees: number;
  readonly horizontalToleranceDegrees: number;
  readonly maximumBeamInclinationDegrees: number | null;
  readonly groupingAngleToleranceDegrees: number;
}

export interface GlobalFemClassificationPolicyShell {
  readonly horizontalPlaneToleranceDegrees: number;
  readonly verticalPlaneToleranceDegrees: number;
  readonly groupingNormalToleranceDegrees: number;
  readonly coplanarityTolerance: number | null;
}

export interface GlobalFemClassificationPolicyStoreys {
  readonly elevationTolerance: number | null;
  readonly relativeElevationTolerance: number;
}

export interface GlobalFemClassificationPolicyJoints {
  readonly minimumIncidentLineElements: number;
}

export interface GlobalFemClassificationPolicy {
  readonly line: GlobalFemClassificationPolicyLine;
  readonly shell: GlobalFemClassificationPolicyShell;
  readonly storeys: GlobalFemClassificationPolicyStoreys;
  readonly joints: GlobalFemClassificationPolicyJoints;
}

export interface GlobalFemClassificationPolicyInput {
  readonly line?: Partial<GlobalFemClassificationPolicyLine> | null;
  readonly shell?: Partial<GlobalFemClassificationPolicyShell> | null;
  readonly storeys?: Partial<GlobalFemClassificationPolicyStoreys> | null;
  readonly joints?: Partial<GlobalFemClassificationPolicyJoints> | null;
}

export type GlobalFemClassificationStatus = "confirmed" | "proposed" | "ambiguous";
export type GlobalFemStructuralRole =
  | "beam"
  | "column"
  | "brace"
  | "wall"
  | "slab"
  | "generic-shell"
  | "other"
  | "diaphragm"
  | "storey"
  | "beam-column-joint";

export interface GlobalFemClassification {
  readonly role: GlobalFemStructuralRole;
  readonly status: GlobalFemClassificationStatus;
  readonly source: string;
  readonly confidence: number;
  readonly evidence: readonly string[];
  readonly requiresConfirmation: boolean;
}

export interface GlobalFemClassificationDiagnostic extends Omit<FemDiagnostic, "path"> {
  readonly path?: string;
  readonly severity?: "error" | "warning";
  readonly entityId?: FemId;
}

export interface GlobalFemClassifiedMember {
  readonly id: FemId;
  readonly lineElementIds: readonly FemId[];
  readonly classification: GlobalFemClassification;
  readonly metadata: FemJsonObject;
}

export interface GlobalFemClassifiedSurface {
  readonly id: FemId;
  readonly shellElementIds: readonly FemId[];
  readonly classification: GlobalFemClassification;
  readonly storeyIds?: readonly FemId[];
  readonly centroid?: FemVector3;
  readonly normal?: FemVector3;
  readonly metadata: FemJsonObject;
}

export interface GlobalFemClassifiedStorey {
  readonly id: FemId;
  readonly storeyId: FemId;
  readonly elevation: number | null;
  readonly nodeIds: readonly FemId[];
  readonly diaphragmIds: readonly FemId[];
  readonly classification: GlobalFemClassification;
}

export interface GlobalFemClassifiedDiaphragm {
  readonly id: FemId;
  readonly nodeIds: readonly FemId[];
  readonly classification: GlobalFemClassification;
  readonly sourceEntityId: FemId;
}

export interface GlobalFemClassifiedJoint {
  readonly id: FemId;
  readonly nodeId: FemId;
  readonly lineElementEnds: readonly FemLineElementEnd[];
  readonly classification: GlobalFemClassification;
}

export interface GlobalFemClassificationSummary {
  readonly confirmed: number;
  readonly proposed: number;
  readonly ambiguous: number;
}

export interface GlobalFemStructuralClassificationProposal {
  readonly schema: "strutture-js/fem-structural-classification-proposal";
  readonly version: number;
  readonly modelId: FemId;
  readonly modelHash: FemId;
  readonly policy:
    | (GlobalFemClassificationPolicy & {
        readonly resolved: {
          readonly characteristicLength: number;
          readonly coplanarityTolerance: number;
          readonly elevationTolerance: number;
          readonly modelLengthUnit: string;
        };
      })
    | null;
  readonly members: readonly GlobalFemClassifiedMember[];
  readonly surfaces: readonly GlobalFemClassifiedSurface[];
  readonly storeys: readonly GlobalFemClassifiedStorey[];
  readonly diaphragms: readonly GlobalFemClassifiedDiaphragm[];
  readonly joints: readonly GlobalFemClassifiedJoint[];
  readonly diagnostics: readonly GlobalFemClassificationDiagnostic[];
  readonly warnings: readonly GlobalFemClassificationDiagnostic[];
  readonly summary: GlobalFemClassificationSummary;
  readonly metadata?: FemJsonObject;
}

export interface GlobalFemClassificationRequest {
  readonly model?: GlobalFemModelContract;
  readonly mapping?: FemEntityMappingContract | null | undefined;
  readonly policy?: GlobalFemClassificationPolicyInput | undefined;
}

export interface GlobalFemResultReference {
  readonly procedureId?: FemId;
  readonly loadCaseId?: FemId;
  readonly combinationId?: FemId;
  readonly modeNumber?: number;
  readonly step?: number;
  readonly time?: number;
  readonly envelopeId?: FemId;
}

export interface GlobalFemLineDemandState {
  readonly reference: GlobalFemResultReference;
  readonly coordinateSystem: "element-local";
  readonly stations: readonly GlobalFemLineDemandStation[];
}

export interface GlobalFemLineDemandStation {
  readonly xi: number;
  readonly position: number;
  readonly side: "single" | "before" | "after";
  readonly actions: Readonly<Record<string, number>>;
}

export interface GlobalFemLineDemandLocation {
  readonly xi?: number;
  readonly position?: number;
  readonly side?: "single" | "before" | "after";
}

export interface GlobalFemShellDemandLocation extends FemResultLocation {
  readonly face?: "mid-surface" | "positive-local-z" | "negative-local-z";
}

export type GlobalFemDemandLocation = GlobalFemLineDemandLocation | GlobalFemShellDemandLocation;

export interface GlobalFemComponentEnvelopeValue {
  readonly value: number;
  readonly reference: GlobalFemResultReference;
  readonly location: GlobalFemDemandLocation;
}

export interface GlobalFemComponentEnvelope {
  readonly minimum: GlobalFemComponentEnvelopeValue | null;
  readonly maximum: GlobalFemComponentEnvelopeValue | null;
}

export interface GlobalFemLineElementDemand {
  readonly lineElementId: FemId;
  readonly nodeIds: readonly FemId[];
  readonly sectionId: FemId;
  readonly materialId: FemId;
  readonly localAxes: FemAxes;
  readonly actionStates: readonly GlobalFemLineDemandState[];
  readonly componentEnvelopes: Readonly<Record<string, GlobalFemComponentEnvelope>>;
}

export interface GlobalFemShellDemandState {
  readonly reference: GlobalFemResultReference;
  readonly coordinateSystem: "element-local";
  readonly face: "mid-surface" | "positive-local-z" | "negative-local-z";
  readonly location: FemResultLocation;
  readonly components: Readonly<Record<string, number>>;
}

export interface GlobalFemShellElementDemand {
  readonly shellElementId: FemId;
  readonly nodeIds: readonly FemId[];
  readonly sectionId: FemId;
  readonly materialId: FemId;
  readonly localAxes: FemAxes;
  readonly resultantStates: readonly GlobalFemShellDemandState[];
  readonly componentEnvelopes: Readonly<Record<string, GlobalFemComponentEnvelope>>;
}

export interface GlobalFemMemberDemandGroup {
  readonly id: FemId;
  readonly classification: GlobalFemClassification;
  readonly lineElementIds: readonly FemId[];
  readonly elementDemands: readonly GlobalFemLineElementDemand[];
}

export interface GlobalFemSurfaceDemandGroup {
  readonly id: FemId;
  readonly classification: GlobalFemClassification;
  readonly shellElementIds: readonly FemId[];
  readonly elementDemands: readonly GlobalFemShellElementDemand[];
}

export interface GlobalFemJointDemandElementEnd {
  readonly lineElementId: FemId;
  readonly end: "start" | "end";
  readonly coordinateSystem: "element-local";
  readonly station: GlobalFemLineDemandStation | null;
  readonly atElementEnd: boolean;
}

export interface GlobalFemJointDemandState {
  readonly reference: GlobalFemResultReference;
  readonly elementEnds: readonly GlobalFemJointDemandElementEnd[];
  readonly complete: boolean;
  readonly missingElementEnds: readonly FemLineElementEnd[];
}

export interface GlobalFemJointDemand {
  readonly jointId: FemId;
  readonly nodeId: FemId;
  readonly classification: GlobalFemClassification;
  readonly lineElementEnds: readonly FemLineElementEnd[];
  readonly demandStates: readonly GlobalFemJointDemandState[];
  readonly complete: boolean;
}

export interface GlobalFemGlobalResponses {
  readonly nodalDisplacements: readonly FemNodalDisplacementResult[];
  readonly reactions: readonly FemReactionResult[];
  readonly modes: readonly FemModeResult[];
  readonly sectionCuts: readonly FemSectionCutResult[];
  readonly storeyResults: readonly FemStoreyResult[];
  readonly equilibriumResiduals: readonly GlobalFemResultContract["results"]["equilibriumResiduals"][number][];
  readonly envelopes: readonly GlobalFemResultContract["results"]["envelopes"][number][];
  readonly qualityIndicators: Readonly<Record<string, number>>;
}

export interface GlobalFemDemandSet {
  readonly schema: "strutture-js/global-fem-demand-set";
  readonly version: number;
  readonly model: { readonly id: FemId; readonly hash: FemId };
  readonly analysis: { readonly id: FemId; readonly hash: FemId };
  readonly resultId: FemId;
  readonly units: FemUnitSystem;
  readonly signConventions: FemSignConventions;
  readonly provenance: GlobalFemResultContract["provenance"];
  readonly lineElementDemands: readonly GlobalFemLineElementDemand[];
  readonly shellElementDemands: readonly GlobalFemShellElementDemand[];
  readonly memberDemands: readonly GlobalFemMemberDemandGroup[];
  readonly surfaceDemands: readonly GlobalFemSurfaceDemandGroup[];
  readonly jointDemands: readonly GlobalFemJointDemand[];
  readonly globalResponses: GlobalFemGlobalResponses;
  readonly metadata: {
    readonly noCrossElementAxisAggregation: true;
    readonly normativeVerificationPerformed: false;
  };
}

export interface GlobalFemDemandExtractionRequest {
  readonly model?: GlobalFemModelContract;
  readonly analysis?: GlobalFemAnalysisContract;
  readonly result?: GlobalFemResultContract;
  readonly classification?: GlobalFemStructuralClassificationProposal;
}

export type GlobalFemReadinessAssessmentId =
  | "generic-demands"
  | "semantic-demands"
  | "global-displacement-data"
  | "modal-data"
  | "second-order-data"
  | "rc-member-verification"
  | "rc-wall-verification"
  | "rc-joint-verification"
  | "capacity-design"
  | "complete-ntc2018-building-verification";

export type GlobalFemImplementationStatus = "available" | "not-implemented";
export type GlobalFemInputStatus = "ready" | "provisional" | "blocked";
export type GlobalFemAssessmentStatus = "ready" | "provisional" | "blocked" | "not-implemented";

export interface GlobalFemReadinessMissingInput {
  readonly code: string;
  readonly path: string;
  readonly message: string;
}

export interface GlobalFemReadinessAssessment {
  readonly id: GlobalFemReadinessAssessmentId;
  readonly normative: boolean;
  readonly implementationStatus: GlobalFemImplementationStatus;
  readonly inputStatus: GlobalFemInputStatus;
  readonly status: GlobalFemAssessmentStatus;
  readonly missingInputs: readonly GlobalFemReadinessMissingInput[];
}

export interface GlobalFemReadinessMapping {
  readonly confirmed: boolean;
  readonly provisional: boolean;
  readonly ambiguousClassificationCount: number;
}

export interface GlobalFemVerificationReadinessReport {
  readonly schema: "strutture-js/global-fem-verification-readiness";
  readonly version: number;
  readonly profile: GlobalFemPostProcessingProfile;
  readonly model: { readonly id: FemId; readonly hash: FemId };
  readonly analysis: { readonly id: FemId; readonly hash: FemId };
  readonly assessments: readonly GlobalFemReadinessAssessment[];
  readonly readyForRequestedProcessing: boolean;
  readonly normativeVerificationEligible: boolean;
  readonly mapping: GlobalFemReadinessMapping;
}

export interface GlobalFemValidationSet {
  readonly capabilities: FemValidationResult<FemCapabilitiesContract>;
  readonly model: FemValidationResult<GlobalFemModelContract>;
  readonly analysis: FemValidationResult<GlobalFemAnalysisContract>;
  readonly mapping: FemValidationResult<FemEntityMappingContract> | null;
  readonly result: FemValidationResult<GlobalFemResultContract>;
}

export interface GlobalFemProjectContext {
  readonly intendedUse?: string;
  readonly nominalLife?: number;
  readonly useClass?: string;
  readonly seismicParameters?: FemJsonObject;
  readonly ductilityClass?: string;
  readonly dissipativeBehavior?: string;
}

export type GlobalFemDesignDataCollection =
  | readonly { readonly id: FemId }[]
  | Readonly<Record<string, unknown>>;

export interface GlobalFemDesignData {
  readonly members?: GlobalFemDesignDataCollection;
  readonly walls?: GlobalFemDesignDataCollection;
  readonly slabs?: GlobalFemDesignDataCollection;
  readonly joints?: GlobalFemDesignDataCollection;
}

export interface GlobalFemVerificationReadinessRequest {
  readonly profile?: GlobalFemPostProcessingProfile;
  readonly validations?: GlobalFemValidationSet;
  readonly mappingValidation?: FemValidationResult<FemEntityMappingContract> | null;
  readonly classification?: GlobalFemStructuralClassificationProposal;
  readonly capabilities?: FemCapabilitiesContract | undefined;
  readonly model?: GlobalFemModelContract | undefined;
  readonly analysis?: GlobalFemAnalysisContract | undefined;
  readonly result?: GlobalFemResultContract;
  readonly projectContext?: GlobalFemProjectContext | null | undefined;
  readonly designData?: GlobalFemDesignData | null | undefined;
  readonly requestedAssessments?: readonly GlobalFemReadinessAssessmentId[] | null | undefined;
}

export interface GlobalFemPostProcessingInput {
  readonly capabilities?: FemCapabilitiesContract;
  readonly model?: GlobalFemModelContract;
  readonly analysis?: GlobalFemAnalysisContract;
  readonly mapping?: FemEntityMappingContract | null;
  readonly result?: GlobalFemResultContract | undefined;
  readonly profile?: GlobalFemPostProcessingProfile | undefined;
  readonly classificationPolicy?: GlobalFemClassificationPolicyInput | undefined;
  readonly projectContext?: GlobalFemProjectContext | null;
  readonly designData?: GlobalFemDesignData | null;
  readonly requestedAssessments?: readonly GlobalFemReadinessAssessmentId[] | null;
}

export interface GlobalFemPostProcessingOutputs extends Record<string, unknown> {
  readonly profile: GlobalFemPostProcessingProfile;
  readonly validations: Record<string, unknown>;
  readonly classification: GlobalFemStructuralClassificationProposal;
  readonly demands: GlobalFemDemandSet;
  readonly readiness: GlobalFemVerificationReadinessReport;
}
