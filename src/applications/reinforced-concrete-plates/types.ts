import type { VerificationCheck } from "../../core/results/VerificationResult.js";
import type { ConcreteMaterial } from "../../domain/materials/ConcreteMaterial.js";
import type { SteelMaterial } from "../../domain/materials/SteelMaterial.js";
import type { UnitSystem, UnitSystemInput } from "../../domain/units/UnitSystem.js";
import type { RcServiceStressSolverConfiguration } from "../reinforced-concrete-sections/shared/solveRcServiceSectionState.js";
import type {
  ReinforcedConcreteSectionMeshOptions,
  ReinforcedConcreteSectionSolverOptions,
} from "../reinforced-concrete-sections/models/ReinforcedConcreteSectionModel.js";
import type { RcServiceabilityOptions } from "../reinforced-concrete-sections/checks/serviceability/serviceabilityOptions.js";
import type { ReinforcedConcretePlateModel } from "./ReinforcedConcretePlateModel.js";

export type RcPlateDirection = "x" | "y";
export type RcPlateFace = "bottom" | "top";
export type RcPlateAnalysisType =
  | "ULS_BENDING_SHEAR"
  | "SLS_STRESS_CRACKING"
  | "SLS_SIMPLIFIED_DEFLECTION";

export interface RcPlateActions extends Record<string, unknown> {
  mxx: number;
  myy: number;
  mxy: number;
  qx: number;
  qy: number;
}

export interface RcPlateActionsInput extends Record<string, unknown> {
  mxx?: number;
  myy?: number;
  mxy?: number;
  qx?: number;
  qy?: number;
  nxx?: number;
  nyy?: number;
  nxy?: number;
  nx?: number;
  ny?: number;
  n?: number;
}

export interface RcPlateStateInput {
  id?: string;
  combinationType?: string | null;
  actions?: RcPlateActionsInput;
}

export interface RcPlateState {
  id: string;
  combinationType: string | null;
  actions: RcPlateActions;
}

export interface RcPlateLayerInput {
  barsPerMeter?: number;
  diameter?: number;
  clearCover?: number;
}

export interface RcPlateLayer {
  barsPerMeter: number;
  diameter: number;
  clearCover: number;
  area: number;
  spacing: number;
  axis: number;
  face: RcPlateFace;
  direction: RcPlateDirection;
}

export interface RcPlateShearReinforcementInput {
  diameter?: number;
  spacingX?: number;
  spacingY?: number;
}

export interface RcPlateShearReinforcement {
  type: "vertical-s-links";
  diameter: number;
  spacingX: number;
  spacingY: number;
  angle: 90;
  effectiveLegsPerLink: 1;
  areaPerLink: number;
  linksPerSquareMeter: number;
  areaPerSpacingForUnitStrip: number;
  anchorageAssumption: string;
}

export interface RcPlateReinforcementInput {
  angle?: number;
  bottom?: Partial<Record<RcPlateDirection, RcPlateLayerInput>>;
  top?: Partial<Record<RcPlateDirection, RcPlateLayerInput>>;
  shear?: RcPlateShearReinforcementInput | null;
}

export interface RcPlateReinforcement {
  angle: number;
  bottom: Record<RcPlateDirection, RcPlateLayer>;
  top: Record<RcPlateDirection, RcPlateLayer>;
  shear: RcPlateShearReinforcement | null;
}

export interface RcPlateMaterials extends Record<string, unknown> {
  concreteMaterial: ConcreteMaterial;
  reinforcementMaterial: SteelMaterial;
}

export interface RcPlateGeometryInput {
  thickness?: number;
  unitWidth?: number;
}

export interface RcPlateGeometry {
  thickness: number;
  unitWidth: number;
}

export interface RcPlateDeflectionInput extends Record<string, unknown> {
  spanX?: number;
  spanY?: number;
  system?: unknown;
  structuralSystem?: unknown;
  supportSystem?: unknown;
  scheme?: unknown;
}

export interface RcPlateDeflection {
  spanX: number | null;
  spanY: number | null;
}

export interface RcPlateAnalysisInput extends Record<string, unknown> {
  type?: RcPlateAnalysisType;
  stateId?: string;
  combinationType?: string | null;
  actions?: RcPlateActionsInput;
  states?: RcPlateStateInput[];
  deflection?: RcPlateDeflectionInput;
  serviceability?: RcServiceabilityOptions;
  mesh?: ReinforcedConcreteSectionMeshOptions;
  solver?: ReinforcedConcreteSectionSolverOptions & RcServiceStressSolverConfiguration;
}

export interface RcPlateAnalysis
  extends Omit<
    RcPlateAnalysisInput,
    | "type"
    | "combinationType"
    | "actions"
    | "states"
    | "deflection"
    | "serviceability"
    | "mesh"
    | "solver"
  > {
  type: RcPlateAnalysisType;
  combinationType: string | null;
  actions: RcPlateActions;
  states: RcPlateState[];
  deflection: RcPlateDeflection;
  serviceability: RcServiceabilityOptions;
  mesh: ReinforcedConcreteSectionMeshOptions;
  solver: ReinforcedConcreteSectionSolverOptions & RcServiceStressSolverConfiguration;
}

export interface ReinforcedConcretePlateModelOptions {
  id?: string;
  units?: UnitSystemInput | null;
  materials?: Partial<RcPlateMaterials>;
  geometry?: RcPlateGeometryInput;
  reinforcement?: RcPlateReinforcementInput;
  analysis?: RcPlateAnalysisInput;
  metadata?: Record<string, unknown>;
}

export interface RcPlateModelJson {
  id: string;
  units: UnitSystem;
  materials: {
    concreteMaterial: unknown;
    reinforcementMaterial: unknown;
  };
  geometry: RcPlateGeometry;
  reinforcement: RcPlateReinforcement;
  analysis: {
    type: RcPlateAnalysisType;
    combinationType: string | null;
    actions: RcPlateActions;
    states: RcPlateState[];
    deflection: RcPlateDeflection;
    serviceability: RcServiceabilityOptions;
    mesh: ReinforcedConcreteSectionMeshOptions;
    solver: ReinforcedConcreteSectionSolverOptions & RcServiceStressSolverConfiguration;
  };
  metadata: Record<string, unknown>;
}

export interface RotatedPlateMoments {
  mxx: number;
  myy: number;
  mxy: number;
  angle: number;
  angleRadians: number;
  invariants: {
    trace: number;
    determinant: number;
  };
}

export interface RotatedPlateShear {
  qx: number;
  qy: number;
  angle: number;
  angleRadians: number;
  resultant: number;
  resultantAngle: number;
}

export interface WoodArmerMoment {
  id: `${RcPlateFace}-${RcPlateDirection}`;
  face: RcPlateFace;
  direction: RcPlateDirection;
  value: number;
}

export interface WoodArmerResult extends Record<`${RcPlateFace}-${RcPlateDirection}`, number> {
  moments: WoodArmerMoment[];
  torsionAbsolute: number;
  method: string;
}

export interface TransformedRcPlateState {
  id: string;
  combinationType: string | null;
  sourceActions: RcPlateActions;
  moments: RotatedPlateMoments;
  shear: RotatedPlateShear;
  woodArmer: WoodArmerResult;
  torsionRatio: number | null;
  torsionDiagnostic: "pure-torsion" | "ratio-to-maximum-direct-moment";
}

export interface RcPlateCheckMetadata {
  id?: string;
  direction?: RcPlateDirection;
  face?: string;
  analysisType?: RcPlateAnalysisType;
  combinationType?: string | null;
  stateId?: string;
  method?: string;
}

export interface RcPlateCheck extends VerificationCheck {
  id?: string | undefined;
  description?: string | undefined;
  demand?: number | null | undefined;
  capacity?: number | null | undefined;
  direction?: RcPlateDirection | undefined;
  face?: string | undefined;
  analysisType?: RcPlateAnalysisType | undefined;
  combinationType?: string | null | undefined;
  method?: string | undefined;
  metadata?: Record<string, unknown> | undefined;
}

export interface ReinforcedConcretePlateVerificationOptions {
  code?: string;
  metadata?: Record<string, unknown>;
}

export interface ReinforcedConcretePlateApplicationInput {
  model?: ReinforcedConcretePlateModelOptions | ReinforcedConcretePlateModel;
  code?: string;
  metadata?: Record<string, unknown>;
}
