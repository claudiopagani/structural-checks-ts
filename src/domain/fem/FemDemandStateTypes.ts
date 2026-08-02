import type { FemAxes, FemJsonValue, FemLineElementEnd } from "./contracts/FemContractTypes.js";

export interface ConcurrentFemReference {
  readonly [key: string]: unknown;
  readonly procedureId?: string;
  readonly loadCaseId?: string;
  readonly combinationId?: string;
  readonly modeNumber?: number;
  readonly step?: number;
  readonly time?: number;
  readonly envelopeId?: string;
}

export interface ConcurrentFemLineActions {
  readonly N: number;
  readonly Vy: number;
  readonly Vz: number;
  readonly T: number;
  readonly My: number;
  readonly Mz: number;
}

export type ConcurrentFemLineActionsInput = Partial<ConcurrentFemLineActions>;

export interface ConcurrentFemShellResultantComponents {
  readonly Nx: number;
  readonly Ny: number;
  readonly Nxy: number;
  readonly Mx: number;
  readonly My: number;
  readonly Mxy: number;
  readonly Vx: number;
  readonly Vy: number;
}

export interface ConcurrentFemSectionCutResultants {
  readonly Fx: number;
  readonly Fy: number;
  readonly Fz: number;
  readonly Mx: number;
  readonly My: number;
  readonly Mz: number;
}

export interface ConcurrentFemVectorComponents {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface ConcurrentFemStationInput {
  readonly xi: number;
  readonly position?: number | null;
  readonly side?: string | null;
  readonly actions: ConcurrentFemLineActionsInput;
}

export interface ConcurrentFemStation {
  readonly xi: number;
  readonly position?: number;
  readonly side?: string;
}

export interface ConcurrentFemLineActionStateInput {
  readonly coordinateSystem?: string | null;
  readonly reference?: ConcurrentFemReference | null;
  readonly stations?: readonly ConcurrentFemStationInput[] | null;
}

export interface ConcurrentFemLineElementDemand {
  readonly lineElementId: string;
  readonly sectionId?: string | null;
  readonly materialId?: string | null;
  readonly localAxes?: FemAxes | null;
  readonly actionStates?:
    | readonly (ConcurrentFemLineActionStateInput & {
        readonly stations: readonly ConcurrentFemStationInput[];
      })[]
    | null;
}

export interface ConcurrentFemLineActionState extends ConcurrentFemLineElementDemand {
  readonly sectionId: string | null;
  readonly materialId: string | null;
  readonly localAxes: FemAxes | null;
  readonly coordinateSystem: string | null;
  readonly reference: ConcurrentFemReference;
  readonly station: ConcurrentFemStation;
  readonly actions: ConcurrentFemLineActions;
}

export interface ConcurrentFemMemberDemand {
  readonly id: string;
  readonly classification?: Record<string, unknown> | null;
  readonly elementDemands?: readonly ConcurrentFemLineElementDemand[] | null;
}

export interface ConcurrentFemMemberActionState extends ConcurrentFemLineActionState {
  readonly memberId: string;
  readonly classification: Record<string, unknown> | null;
}

export interface ConcurrentFemReferenceSelector {
  readonly procedureId?: string;
  readonly loadCaseId?: string;
  readonly combinationId?: string;
  readonly modeNumber?: number;
  readonly step?: number;
  readonly time?: number;
  readonly envelopeId?: string;
}

export type ConcurrentFemJointStationInput = ConcurrentFemStationInput;

export interface ConcurrentFemJointElementEndInput {
  readonly lineElementId: string;
  readonly end: string;
  readonly coordinateSystem?: string | null;
  readonly atElementEnd?: boolean;
  readonly station?: ConcurrentFemJointStationInput | null;
}

export interface ConcurrentFemJointDemand {
  readonly jointId: string;
  readonly nodeId: string;
  readonly demandStates?: readonly ConcurrentFemJointDemandStateInput[] | null;
}

export interface ConcurrentFemJointDemandStateInput {
  readonly reference?: ConcurrentFemReference | null;
  readonly complete?: boolean;
  readonly missingElementEnds?: readonly FemLineElementEnd[] | null;
  readonly elementEnds?: readonly ConcurrentFemJointElementEndInput[] | null;
}

export interface ConcurrentFemJointElementEnd {
  readonly lineElementId: string;
  readonly end: string;
  readonly coordinateSystem: string | null;
  readonly atElementEnd: boolean;
  readonly station: (ConcurrentFemStation & { readonly actions: ConcurrentFemLineActions }) | null;
}

export interface ConcurrentFemJointActionState {
  readonly jointId: string;
  readonly nodeId: string;
  readonly reference: ConcurrentFemReference;
  readonly complete: boolean;
  readonly missingElementEnds: readonly FemLineElementEnd[];
  readonly elementEnds: readonly ConcurrentFemJointElementEnd[];
}

export interface ConcurrentFemSurfaceResultantStateInput {
  readonly coordinateSystem?: string | null;
  readonly face?: string | null;
  readonly location?: FemJsonValue | null;
  readonly reference?: ConcurrentFemReference | null;
  readonly components: ConcurrentFemShellResultantComponents;
}

export interface ConcurrentFemSurfaceElementDemand {
  readonly shellElementId: string;
  readonly sectionId?: string | null;
  readonly materialId?: string | null;
  readonly localAxes?: FemAxes | null;
  readonly resultantStates?: readonly ConcurrentFemSurfaceResultantStateInput[] | null;
}

export interface ConcurrentFemSurfaceDemand {
  readonly id: string;
  readonly classification?: Record<string, unknown> | null;
  readonly elementDemands?: readonly ConcurrentFemSurfaceElementDemand[] | null;
}

export interface ConcurrentFemSurfaceResultantState {
  readonly surfaceId: string;
  readonly classification: Record<string, unknown> | null;
  readonly shellElementId: string;
  readonly sectionId: string | null;
  readonly materialId: string | null;
  readonly localAxes: FemAxes | null;
  readonly coordinateSystem: string | null;
  readonly face: string | null;
  readonly location: FemJsonValue | null;
  readonly reference: ConcurrentFemReference;
  readonly components: ConcurrentFemShellResultantComponents;
}

export interface ConcurrentFemSectionCutResponse extends ConcurrentFemReference {
  readonly sectionCutId: string;
  readonly coordinateSystem?: string | null;
  readonly position?: FemJsonValue | null;
  readonly resultants: ConcurrentFemSectionCutResultants;
}

export interface ConcurrentFemReactionResponse extends ConcurrentFemReference {
  readonly nodeId: string;
  readonly coordinateSystem?: string | null;
  readonly forces: ConcurrentFemVectorComponents;
  readonly moments: ConcurrentFemVectorComponents;
}

export interface ConcurrentFemGlobalResponses {
  readonly sectionCuts?: readonly ConcurrentFemSectionCutResponse[] | null;
  readonly reactions?: readonly ConcurrentFemReactionResponse[] | null;
}

export interface ConcurrentFemSectionCutCollectionInput {
  readonly sectionCutIds?: readonly string[];
  readonly globalResponses?: ConcurrentFemGlobalResponses | null;
}

export interface ConcurrentFemSectionCutState {
  readonly sectionCutId: string;
  readonly coordinateSystem: string | null;
  readonly position: FemJsonValue | null;
  readonly reference: ConcurrentFemReference;
  readonly resultants: ConcurrentFemSectionCutResultants;
}

export interface ConcurrentFemSupportReactionCollectionInput {
  readonly nodeId?: string;
  readonly globalResponses?: ConcurrentFemGlobalResponses | null;
}

export interface ConcurrentFemSupportReactionState {
  readonly nodeId: string;
  readonly coordinateSystem: string | null;
  readonly reference: ConcurrentFemReference;
  readonly forces: ConcurrentFemVectorComponents;
  readonly moments: ConcurrentFemVectorComponents;
}

export type ConcurrentFemState =
  | ConcurrentFemLineActionState
  | ConcurrentFemMemberActionState
  | ConcurrentFemJointActionState
  | ConcurrentFemSurfaceResultantState
  | ConcurrentFemSectionCutState
  | ConcurrentFemSupportReactionState;

export type ResistanceAxisVector = readonly [number, number, number];
export type ResistanceAxisMatrix = readonly [
  ResistanceAxisVector,
  ResistanceAxisVector,
  ResistanceAxisVector,
];
export type ResistanceAxisMatrixInput = readonly (readonly number[])[];

export type ResistanceAxisSourceCoordinateSystem = "element-local" | "section-cut-local" | "global";

export interface ResistanceAxisValidationOptions {
  readonly tolerance?: number;
}

export interface ResistanceAxisMappingBase {
  readonly [key: string]: unknown;
  readonly sourceCoordinateSystem: ResistanceAxisSourceCoordinateSystem;
  readonly resistanceCoordinateSystemId: string;
  readonly sourceToResistance: ResistanceAxisMatrixInput;
  readonly localAxes?: FemAxes | null;
}

export interface ResistanceLineAxisMapping extends ResistanceAxisMappingBase {
  readonly lineElementId: string;
}

export interface ResistanceSectionCutAxisMapping extends ResistanceAxisMappingBase {
  readonly sectionCutId: string;
}

export interface ResistanceShellAxisMapping extends ResistanceAxisMappingBase {
  readonly shellElementId: string;
}

export interface ResistanceSupportAxisMapping extends ResistanceAxisMappingBase {
  readonly supportNodeId: string;
}

export interface ResistanceSupportAxisMappingWithFoundation extends ResistanceSupportAxisMapping {
  readonly foundationId?: string | null;
}

export interface ResistanceMappedMember {
  readonly id: string;
  readonly lineElementIds: readonly string[];
  readonly lineActionMappings?: readonly ResistanceLineAxisMapping[] | null;
}

export interface ResistanceMappedWall {
  readonly id: string;
  readonly sectionCutIds: readonly string[];
  readonly sectionCutActionMappings?: readonly ResistanceSectionCutAxisMapping[] | null;
}

export interface ResistanceMappedSlab {
  readonly id: string;
  readonly shellElementIds: readonly string[];
  readonly shellResultantMappings?: readonly ResistanceShellAxisMapping[] | null;
}

export interface ResistanceMappedFoundation {
  readonly id: string;
  readonly supportNodeIds: readonly string[];
  readonly supportReactionMappings?: readonly ResistanceSupportAxisMapping[] | null;
}

export interface ResistanceLineActionStateInput {
  readonly lineElementId: string;
  readonly coordinateSystem?: string | null;
  readonly localAxes?: FemAxes | null;
  readonly reference?: ConcurrentFemReference | null;
  readonly station?: ConcurrentFemStation | null;
  readonly actions: ConcurrentFemLineActions;
}

export interface ResistanceCoordinateSystem {
  readonly id: string;
  readonly sourceCoordinateSystem: ResistanceAxisSourceCoordinateSystem;
  readonly sourceToResistance: ResistanceAxisMatrix;
}

export interface ResistanceCoordinateSystemWithAxes extends ResistanceCoordinateSystem {
  readonly axes: FemAxes | null;
}

export interface ResistanceLineActions {
  readonly axialForce: number;
  readonly shearY: number;
  readonly shearZ: number;
  readonly torsion: number;
  readonly momentY: number;
  readonly momentZ: number;
}

export interface ResistanceLineActionState extends ResistanceLineActionStateInput {
  readonly resistanceCoordinateSystem: ResistanceCoordinateSystemWithAxes;
  readonly resistanceActions: ResistanceLineActions;
}

export interface ResistanceSectionCutStateInput {
  readonly sectionCutId: string;
  readonly coordinateSystem?: string | null;
  readonly position?: FemJsonValue | null;
  readonly reference?: ConcurrentFemReference | null;
  readonly resultants: ConcurrentFemSectionCutResultants;
}

export interface ResistanceSectionCutResultants {
  readonly forceX: number;
  readonly forceY: number;
  readonly axialForce: number;
  readonly momentX: number;
  readonly momentY: number;
  readonly torsion: number;
}

export interface ResistanceSectionCutState extends ResistanceSectionCutStateInput {
  readonly resistanceCoordinateSystem: ResistanceCoordinateSystem;
  readonly resistanceResultants: ResistanceSectionCutResultants;
}

export interface ResistanceShellResultantStateInput {
  readonly shellElementId: string;
  readonly coordinateSystem?: string | null;
  readonly localAxes?: FemAxes | null;
  readonly reference?: ConcurrentFemReference | null;
  readonly components: ConcurrentFemShellResultantComponents;
}

export interface ResistanceShellResultants {
  readonly Nx: number;
  readonly Ny: number;
  readonly Nxy: number;
  readonly Mx: number;
  readonly My: number;
  readonly Mxy: number;
  readonly Vx: number;
  readonly Vy: number;
}

export interface ResistanceShellResultantState extends ResistanceShellResultantStateInput {
  readonly resistanceCoordinateSystem: ResistanceCoordinateSystemWithAxes;
  readonly resistanceResultants: ResistanceShellResultants;
}

export interface ResistanceSupportReactionStateInput {
  readonly nodeId: string;
  readonly coordinateSystem?: string | null;
  readonly reference?: ConcurrentFemReference | null;
  readonly forces: ConcurrentFemVectorComponents;
  readonly moments: ConcurrentFemVectorComponents;
}

export interface ResistanceReaction {
  readonly forceX: number;
  readonly forceY: number;
  readonly forceZ: number;
  readonly momentX: number;
  readonly momentY: number;
  readonly momentZ: number;
}

export interface ResistanceSupportReactionState extends ResistanceSupportReactionStateInput {
  readonly foundationId: string | null;
  readonly resistanceCoordinateSystem: ResistanceCoordinateSystem;
  readonly resistanceReaction: ResistanceReaction;
}

export interface ResistanceJointElementEnd extends ConcurrentFemJointElementEnd {
  readonly resistanceCoordinateSystem?: ResistanceCoordinateSystemWithAxes;
  readonly resistanceActions: ResistanceLineActions | null;
}

export interface ResistanceJointActionState
  extends Omit<ConcurrentFemJointActionState, "elementEnds"> {
  readonly elementEnds: readonly ResistanceJointElementEnd[];
}
