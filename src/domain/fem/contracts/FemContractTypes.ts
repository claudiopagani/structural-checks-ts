/** JSON-safe values accepted by the solver-neutral FEM contracts. */
export type FemJsonPrimitive = string | number | boolean | null;
export type FemJsonValue = FemJsonPrimitive | FemJsonObject | FemJsonValue[];
export interface FemJsonObject {
  readonly [key: string]: FemJsonValue;
}

export type FemId = string;
export type FemAnalysisCapabilityKey =
  | "linearStatic"
  | "secondOrder"
  | "modal"
  | "responseSpectrum"
  | "nonlinearStatic"
  | "timeHistory";
export type FemElementCapabilityKey = "line" | "shell" | "solid" | "link";
export type FemResultCapabilityKey =
  | "nodalDisplacements"
  | "reactions"
  | "lineElementActions"
  | "shellResultants"
  | "stresses"
  | "strains"
  | "modes"
  | "sectionCuts"
  | "storeyResults"
  | "equilibriumResiduals";
export type FemAnalysisType =
  | "linear-static"
  | "second-order-static"
  | "modal"
  | "response-spectrum"
  | "nonlinear-static"
  | "time-history";
export type FemResultStatus =
  | "completed"
  | "completed-with-warnings"
  | "partial"
  | "failed"
  | "not-supported";
export type FemDirection = "X" | "Y" | "Z";
export type FemCoordinateAxis = "x" | "y" | "z";

export interface FemDiagnostic {
  readonly code: string;
  readonly path: string;
  readonly message: string;
}

export interface FemValidationResult<T> {
  readonly ok: boolean;
  readonly value: T | null;
  readonly errors: readonly FemDiagnostic[];
  readonly warnings: readonly FemDiagnostic[];
}

export interface FemVector3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface FemAxes {
  readonly x: FemVector3;
  readonly y: FemVector3;
  readonly z: FemVector3;
}

export interface FemUnitSystem {
  readonly length: string;
  readonly force: string;
  readonly mass: string;
  readonly time: string;
  readonly angle: string;
  readonly moment: string;
  readonly stress: string;
  readonly strain: string;
  readonly acceleration: string;
  readonly frequency: string;
  readonly lineForce: string;
  readonly lineMoment: string;
}

export interface FemCoordinateSystem {
  readonly id: FemId;
  readonly type: "cartesian";
  readonly handedness: "right";
  readonly verticalAxis: FemDirection;
  readonly rotationConvention: "right-hand-rule";
  readonly origin: FemVector3;
  readonly axes: FemAxes;
  readonly gravityDirection: FemVector3;
}

export interface FemContractHeader {
  readonly schema: string;
  readonly version: number;
}

export interface FemSolverProvenance {
  readonly id: FemId;
  readonly name: string;
  readonly version: string;
}

export interface FemCapabilitiesGroup {
  readonly [key: string]: boolean;
}

export type FemAnalysisCapabilities = Record<FemAnalysisCapabilityKey, boolean>;
export type FemElementCapabilities = Record<FemElementCapabilityKey, boolean>;
export type FemResultCapabilities = Record<FemResultCapabilityKey, boolean>;

export interface FemCapabilitiesContract extends FemContractHeader {
  readonly schema: "strutture-js/fem-capabilities";
  readonly version: 0;
  readonly id: FemId;
  readonly solver: FemSolverProvenance;
  readonly analyses: FemAnalysisCapabilities;
  readonly elements: FemElementCapabilities;
  readonly results: FemResultCapabilities;
  readonly metadata?: FemJsonObject;
}

export interface FemNode {
  readonly id: FemId;
  readonly coordinates: FemVector3;
  readonly metadata?: FemJsonObject;
}

export interface FemMaterial {
  readonly id: FemId;
  readonly type: string;
  readonly properties: FemJsonObject;
}

export interface FemSection {
  readonly id: FemId;
  readonly type: "line" | "shell" | "solid";
  readonly materialId: FemId;
  readonly properties: FemJsonObject;
}

export interface FemOffset {
  readonly referenceSystem: "global" | "local";
  readonly vector: FemVector3;
}

export interface FemLineElement {
  readonly id: FemId;
  readonly nodeIds: readonly [FemId, FemId];
  readonly sectionId: FemId;
  readonly materialId: FemId;
  readonly localAxes: FemAxes;
  readonly offsets?: {
    readonly start: FemOffset;
    readonly end: FemOffset;
  };
}

export interface FemShellElement {
  readonly id: FemId;
  readonly nodeIds: readonly [FemId, FemId, FemId] | readonly [FemId, FemId, FemId, FemId];
  readonly sectionId: FemId;
  readonly materialId: FemId;
  readonly localAxes: FemAxes;
  readonly faceConvention: "positive-local-z";
}

export type FemDofName = "ux" | "uy" | "uz" | "rx" | "ry" | "rz";
export interface FemSupport {
  readonly id: FemId;
  readonly nodeId: FemId;
  readonly restraints: Record<FemDofName, boolean>;
}
export interface FemLink {
  readonly id: FemId;
  readonly nodeIds: readonly [FemId, FemId];
  readonly type: string;
  readonly localAxes: FemAxes;
  readonly properties: FemJsonObject;
}
export interface FemConstraint {
  readonly id: FemId;
  readonly type: string;
  readonly masterNodeId: FemId;
  readonly slaveNodeIds: readonly FemId[];
  readonly dofs: readonly FemDofName[];
}
export interface FemDiaphragm {
  readonly id: FemId;
  readonly type: "rigid" | "semi-rigid";
  readonly nodeIds: readonly FemId[];
  readonly plane: { readonly origin: FemVector3; readonly localAxes: FemAxes };
}
export interface FemStorey {
  readonly id: FemId;
  readonly name: string;
  readonly elevation: number;
  readonly levelIndex: number;
  readonly diaphragmIds: readonly FemId[];
}
export interface FemGroup {
  readonly id: FemId;
  readonly entityType:
    | "nodes"
    | "line-elements"
    | "shell-elements"
    | "links"
    | "diaphragms"
    | "storeys"
    | "section-cuts";
  readonly entityIds: readonly FemId[];
}
export interface FemSectionCut {
  readonly id: FemId;
  readonly plane: { readonly origin: FemVector3; readonly localAxes: FemAxes };
  readonly lineElementIds: readonly FemId[];
  readonly shellElementIds: readonly FemId[];
}

export interface GlobalFemModelContract extends FemContractHeader {
  readonly schema: "strutture-js/global-fem-model";
  readonly version: 0;
  readonly id: FemId;
  readonly hash: FemId;
  readonly units: FemUnitSystem;
  readonly globalCoordinateSystem: FemCoordinateSystem;
  readonly nodes: readonly FemNode[];
  readonly materials: readonly FemMaterial[];
  readonly sections: readonly FemSection[];
  readonly lineElements: readonly FemLineElement[];
  readonly shellElements: readonly FemShellElement[];
  readonly supports: readonly FemSupport[];
  readonly links: readonly FemLink[];
  readonly constraints: readonly FemConstraint[];
  readonly diaphragms: readonly FemDiaphragm[];
  readonly storeys: readonly FemStorey[];
  readonly groups: readonly FemGroup[];
  readonly sectionCuts: readonly FemSectionCut[];
  readonly metadata?: FemJsonObject;
}

export interface FemLoadPattern extends FemIdentified {
  readonly nature: string;
  readonly metadata?: FemJsonObject;
}
export interface FemLoadCase extends FemIdentified {
  readonly nature: string;
  readonly loadPatternIds: readonly FemId[];
  readonly selfWeightFactor: number;
}
export interface FemCombinationTerm {
  readonly loadCaseId: FemId;
  readonly factor: number;
}
export interface FemCombination extends FemIdentified {
  readonly limitState:
    | "ultimate"
    | "serviceability"
    | "accidental"
    | "seismic"
    | "fatigue"
    | "other";
  readonly nature: string;
  readonly terms: readonly FemCombinationTerm[];
}
export interface FemMassSourceContribution {
  readonly loadCaseId: FemId;
  readonly factor: number;
}
export interface FemMassSource extends FemIdentified {
  readonly directions: readonly FemDirection[];
  readonly contributions: readonly FemMassSourceContribution[];
}
export interface FemSpectrumPoint {
  readonly period: number;
  readonly acceleration: number;
}
export interface FemSpectrum extends FemIdentified {
  readonly direction: FemDirection;
  readonly dampingRatio: number;
  readonly points: readonly FemSpectrumPoint[];
}
export interface FemTimeSeries extends FemIdentified {
  readonly timeStep: number;
  readonly values: readonly number[];
}
export interface FemStiffnessAssumption {
  readonly id: FemId;
  readonly scope: string;
  readonly property: string;
  readonly factor: number;
  readonly description: string;
}
export interface FemSecondOrderSettings {
  readonly enabled: boolean;
  readonly method: string | null;
}
export interface FemAccidentalEccentricity extends FemIdentified {
  readonly direction: FemDirection;
  readonly offset: number;
  readonly storeyId?: FemId;
}
export interface FemProcedureBase extends FemIdentified {
  readonly type: FemAnalysisType;
  readonly requestedOutputs: readonly FemResultCapabilityKey[];
  readonly loadCaseIds?: readonly FemId[];
  readonly combinationIds?: readonly FemId[];
  readonly secondOrder?: FemSecondOrderSettings;
  readonly stiffnessAssumptions?: readonly FemStiffnessAssumption[];
  readonly accidentalEccentricities?: readonly FemAccidentalEccentricity[];
  readonly massSourceId?: FemId;
  readonly requestedModes?: number;
  readonly directions?: readonly FemDirection[];
  readonly spectrumIds?: readonly FemId[];
  readonly modalCombinationMethod?: "cqc";
  readonly componentCombinationRule?: "100-30-30";
  readonly requestedSteps?: number;
  readonly timeSeriesIds?: readonly FemId[];
}
export type FemProcedure = FemProcedureBase;

export interface GlobalFemAnalysisContract extends FemContractHeader {
  readonly schema: "strutture-js/global-fem-analysis";
  readonly version: 0;
  readonly id: FemId;
  readonly hash: FemId;
  readonly modelId: FemId;
  readonly modelHash: FemId;
  readonly units: FemUnitSystem;
  readonly loadPatterns: readonly FemLoadPattern[];
  readonly loadCases: readonly FemLoadCase[];
  readonly combinations: readonly FemCombination[];
  readonly procedures: readonly FemProcedure[];
  readonly massSources?: readonly FemMassSource[];
  readonly spectra?: readonly FemSpectrum[];
  readonly timeSeries?: readonly FemTimeSeries[];
  readonly metadata?: FemJsonObject;
}

export interface FemAxisTransformation {
  readonly [row: number]: readonly number[];
}
export interface FemResistanceAxisMapping {
  readonly [key: string]: unknown;
  readonly sourceCoordinateSystem: string;
  readonly resistanceCoordinateSystemId: FemId;
  readonly sourceToResistance: readonly (readonly number[])[];
}
export interface FemLineActionMapping extends FemResistanceAxisMapping {
  readonly lineElementId: FemId;
}
export interface FemSectionCutActionMapping extends FemResistanceAxisMapping {
  readonly sectionCutId: FemId;
}
export interface FemShellResultantMapping extends FemResistanceAxisMapping {
  readonly shellElementId: FemId;
}
export interface FemSupportReactionMapping extends FemResistanceAxisMapping {
  readonly supportNodeId: FemId;
}
export interface FemStructuralMember extends FemIdentified {
  readonly role: "beam" | "column" | "brace" | "other";
  readonly lineElementIds: readonly FemId[];
  readonly lineActionMappings?: readonly FemLineActionMapping[];
}
export interface FemStructuralWall extends FemIdentified {
  readonly shellElementIds: readonly FemId[];
  readonly sectionCutIds: readonly FemId[];
  readonly storeyIds: readonly FemId[];
  readonly sectionCutActionMappings?: readonly FemSectionCutActionMapping[];
}
export interface FemStructuralSlab extends FemIdentified {
  readonly shellElementIds: readonly FemId[];
  readonly diaphragmIds: readonly FemId[];
  readonly storeyId: FemId;
  readonly shellResultantMappings?: readonly FemShellResultantMapping[];
}
export interface FemPunchingConnection extends FemIdentified {
  readonly slabId: FemId;
  readonly nodeId: FemId;
  readonly shellElementIds: readonly FemId[];
  readonly supportLineElementEnds: readonly FemLineElementEnd[];
}
export interface FemFoundation extends FemIdentified {
  readonly type: "isolated-footing" | "foundation-beam" | "raft" | "pile-cap" | "other";
  readonly supportIds: readonly FemId[];
  readonly supportNodeIds: readonly FemId[];
  readonly supportReactionMappings?: readonly FemSupportReactionMapping[];
}
export interface FemStoreyMapping extends FemIdentified {
  readonly storeyId: FemId;
  readonly nodeIds: readonly FemId[];
  readonly diaphragmIds: readonly FemId[];
  readonly lineElementIds: readonly FemId[];
  readonly shellElementIds: readonly FemId[];
}
export interface FemLineElementEnd {
  readonly lineElementId: FemId;
  readonly end: "start" | "end";
}
export interface FemJoint extends FemIdentified {
  readonly nodeId: FemId;
  readonly lineElementEnds: readonly FemLineElementEnd[];
}
export interface FemEntityMappingContract extends FemContractHeader {
  readonly schema: "strutture-js/fem-entity-mapping";
  readonly version: 0;
  readonly id: FemId;
  readonly modelId: FemId;
  readonly modelHash: FemId;
  readonly members: readonly FemStructuralMember[];
  readonly walls: readonly FemStructuralWall[];
  readonly slabs: readonly FemStructuralSlab[];
  readonly storeys: readonly FemStoreyMapping[];
  readonly joints: readonly FemJoint[];
  readonly punchingConnections?: readonly FemPunchingConnection[];
  readonly foundations?: readonly FemFoundation[];
  readonly metadata?: FemJsonObject;
}

export interface FemProvenance {
  readonly solver: FemSolverProvenance;
  readonly model: { readonly id: FemId; readonly hash: FemId };
  readonly analysis: { readonly id: FemId; readonly hash: FemId };
}
export interface FemConvergenceEntry {
  readonly procedureId: FemId;
  readonly converged: boolean;
  readonly iterations: number;
  readonly residualNorm: number;
  readonly tolerance: number;
  readonly diagnostics: readonly string[];
}
export interface FemResultCaseReference {
  readonly loadCaseId?: FemId;
  readonly combinationId?: FemId;
  readonly step?: number;
  readonly time?: number;
}
export interface FemNodalDisplacementResult extends FemResultCaseReference {
  readonly procedureId: FemId;
  readonly nodeId: FemId;
  readonly coordinateSystem: "global";
  readonly translations: FemVector3;
  readonly rotations: FemVector3;
}
export interface FemReactionResult extends FemResultCaseReference {
  readonly procedureId: FemId;
  readonly nodeId: FemId;
  readonly coordinateSystem: "global";
  readonly forces: FemVector3;
  readonly moments: FemVector3;
}
export interface FemLineActionStation {
  readonly xi: number;
  readonly position: number;
  readonly side: "single" | "before" | "after";
  readonly actions: Record<string, number>;
}
export interface FemLineElementActionResult extends FemResultCaseReference {
  readonly procedureId: FemId;
  readonly lineElementId: FemId;
  readonly coordinateSystem: "element-local";
  readonly stations: readonly FemLineActionStation[];
}
export type FemResultLocationKind =
  | "centroid"
  | "element-average"
  | "node"
  | "integration-point"
  | "coordinate";
export interface FemResultLocation {
  readonly kind: FemResultLocationKind;
  readonly position: FemVector3;
  readonly averaging?: {
    readonly method: "arithmetic-mean";
    readonly source: "nodal-smoothed";
    readonly sampleCount: number;
  };
  readonly nodeId?: FemId;
  readonly integrationPointId?: FemId;
}
export interface FemShellResultantResult extends FemResultCaseReference {
  readonly procedureId: FemId;
  readonly shellElementId: FemId;
  readonly coordinateSystem: "element-local";
  readonly face: "mid-surface" | "positive-local-z" | "negative-local-z";
  readonly location: FemResultLocation;
  readonly components: Record<string, number>;
}
export interface FemTensorResult extends FemResultCaseReference {
  readonly procedureId: FemId;
  readonly entityType: "line-element" | "shell-element" | "solid-element";
  readonly entityId: FemId;
  readonly coordinateSystem: string;
  readonly face: string;
  readonly location: FemResultLocation;
  readonly components: Record<string, number>;
}
export interface FemSectionCutResult extends FemResultCaseReference {
  readonly procedureId: FemId;
  readonly sectionCutId: FemId;
  readonly coordinateSystem: "section-cut-local";
  readonly position: FemVector3;
  readonly resultants: Record<string, number>;
}
export interface FemModalShape {
  readonly nodeId: FemId;
  readonly translations: FemVector3;
  readonly rotations: FemVector3;
}
export interface FemModeResult extends FemResultCaseReference {
  readonly procedureId: FemId;
  readonly modeNumber: number;
  readonly period: number;
  readonly frequency: number;
  readonly eigenvalue: number;
  readonly modalShape: readonly FemModalShape[];
  readonly participationFactors: Record<string, number>;
  readonly participatingMasses: Record<string, number>;
  readonly participatingMassRatios: Record<string, number>;
}
export interface FemStoreyResult extends FemResultCaseReference {
  readonly procedureId: FemId;
  readonly storeyId: FemId;
  readonly diaphragmId: FemId;
  readonly centerOfMass: FemVector3;
  readonly centerOfRigidity: FemVector3;
  readonly translations: Record<string, number>;
  readonly rotations: Record<string, number>;
  readonly driftRatios: Record<string, number>;
  readonly resultants: Record<string, number>;
  readonly torsionalMetrics: Record<string, number>;
}
export interface FemEquilibriumResidual extends FemResultCaseReference {
  readonly procedureId: FemId;
  readonly forces: FemVector3;
  readonly moments: FemVector3;
  readonly normalizedResidual: number;
}
export interface FemEnvelope extends FemIdentified {
  readonly quantity: string;
  readonly target: { readonly entityType: string; readonly entityId: FemId };
  readonly governing: readonly { readonly combinationId: FemId; readonly value: number }[];
}
export interface FemResultCollections {
  readonly nodalDisplacements: readonly FemNodalDisplacementResult[];
  readonly reactions: readonly FemReactionResult[];
  readonly lineElementActions: readonly FemLineElementActionResult[];
  readonly shellResultants: readonly FemShellResultantResult[];
  readonly stresses: readonly FemTensorResult[];
  readonly strains: readonly FemTensorResult[];
  readonly modes: readonly FemModeResult[];
  readonly sectionCuts: readonly FemSectionCutResult[];
  readonly storeyResults: readonly FemStoreyResult[];
  readonly equilibriumResiduals: readonly FemEquilibriumResidual[];
  readonly envelopes: readonly FemEnvelope[];
}
/** Internal coverage evidence used when a result contract is explicitly partial. */
export interface FemPartialCoverage {
  readonly lineElements: ReadonlySet<FemId>;
  readonly shellElements: ReadonlySet<FemId>;
}
export interface FemSignConventions {
  readonly [key: string]: string;
}
export interface GlobalFemResultContract extends FemContractHeader {
  readonly schema: "strutture-js/global-fem-result";
  readonly version: 0;
  readonly id: FemId;
  readonly modelId: FemId;
  readonly modelHash: FemId;
  readonly analysisId: FemId;
  readonly analysisHash: FemId;
  readonly capabilitiesId: FemId;
  readonly status: FemResultStatus;
  readonly units: FemUnitSystem;
  readonly signConventions: FemSignConventions;
  readonly provenance: FemProvenance;
  readonly convergence: readonly FemConvergenceEntry[];
  readonly results: FemResultCollections;
  readonly qualityIndicators?: Record<string, number>;
  readonly metadata?: FemJsonObject;
}

export interface FemIdentified {
  readonly id: FemId;
}

export interface FemContractSet {
  readonly capabilities: FemCapabilitiesContract;
  readonly model: GlobalFemModelContract;
  readonly analysis: GlobalFemAnalysisContract;
  readonly mapping: FemEntityMappingContract;
  readonly result: GlobalFemResultContract;
}

export interface FemValidationContext {
  readonly model?: GlobalFemModelContract | null;
  readonly analysis?: GlobalFemAnalysisContract | null;
  readonly capabilities?: FemCapabilitiesContract | null;
  readonly mapping?: FemEntityMappingContract | null;
}
