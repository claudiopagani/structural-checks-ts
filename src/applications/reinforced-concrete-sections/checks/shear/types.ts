import type { VerificationCheck } from "../../../../core/results/VerificationResult.js";
import type { ResultStatus } from "../../../../core/results/resultStatus.js";
import type { ReinforcedConcreteSection } from "../../../../domain/geometry/ReinforcedConcreteSection.js";
import type { ConcreteMaterial } from "../../../../domain/materials/ConcreteMaterial.js";
import type { SteelMaterial } from "../../../../domain/materials/SteelMaterial.js";
import type { UnitSystemInput } from "../../../../domain/units/UnitSystem.js";

export type RcShearMode = "without-transverse-reinforcement" | "with-transverse-reinforcement";
export type RcShearMethod = "ntc2018" | "cosenza-et-al-2016";
export type RcShearTensionFace = "bottom" | "top" | "auto-from-moment-sign";

export interface RcLongitudinalReinforcementGroup extends Record<string, unknown> {
  id?: string;
  face?: RcShearTensionFace;
  barIds?: (string | number)[];
  effectiveDepth?: number;
  d?: number;
  longitudinalReinforcementArea?: number;
  area?: number;
  asl?: number;
}

export interface RcTransverseReinforcementInput extends Record<string, unknown> {
  type?: string;
  angle?: number;
  legs?: number;
  numberOfLegs?: number;
  spacing?: number | null;
  diameter?: number;
  areaPerLeg?: number;
  area?: number | null;
  fyd?: number;
  material?:
    | SteelMaterial
    | {
        fyd?: number;
      };
}

export interface RcShearInput extends Record<string, unknown> {
  mode?: string | null;
  method?: string | null;
  formulation?: string | null;
  units?: UnitSystemInput;
  bw?: number;
  webWidth?: number;
  effectiveDepth?: number;
  d?: number;
  longitudinalReinforcementArea?: number;
  asl?: number;
  concreteArea?: number;
  ac?: number;
  nEdCompression?: number;
  normalForceSignConvention?: string;
  gammaC?: number;
  alphaCc?: number;
  fck?: number;
  fcd?: number;
  tensionFace?: RcShearTensionFace;
  longitudinalReinforcementGroup?: RcLongitudinalReinforcementGroup;
  longitudinalReinforcementGroupId?: string;
  longitudinalReinforcementGroups?: RcLongitudinalReinforcementGroup[];
  transverseReinforcement?: RcTransverseReinforcementInput | null;
  cotThetaMin?: number;
  cotThetaMax?: number;
  cotThetaRange?: {
    min?: number;
    max?: number;
  };
  cotAlpha?: number;
  leverArm?: number;
  leverArmFactor?: number;
  fcdPrime?: number;
  fcdPrimeFactor?: number;
  alphaC?: number;
  alphaCw?: number;
  thetaSelection?: string;
  cotTheta?: number;
  torsionHandled?: boolean;
  sectionDiameter?: number;
  D?: number;
  fcPrime?: number;
  concreteCylinderStrength?: number;
}

export interface RcShearActions {
  nEd?: number | null;
  vEd?: number | null;
  v?: number | null;
  mEd?: number | null;
  m?: number | null;
}

export interface RcResolvedTransverseReinforcement {
  type: string;
  angle: number;
  legs: number;
  spacing: number;
  diameter: number | null;
  areaPerLeg: number;
  area: number;
  areaPerSpacing: number;
  fyd: number | null;
}

export interface RcResolvedShearParameters extends Record<string, unknown> {
  ok: boolean;
  mode: RcShearMode | null;
  bw: number | null;
  effectiveDepth: number | null;
  concreteArea: number | null;
  longitudinalArea: number | null;
  rhoL: number | null;
  rhoLEffective: number | null;
  nEdCompression: number;
  sigmaCpRaw: number;
  sigmaCp: number;
  fck: number | null;
  fcd: number | null;
  gammaC: number;
  alphaCc: number;
  tensionFace: string;
  groupId: string | null;
  barIds: (string | number)[];
  transverseReinforcement: RcResolvedTransverseReinforcement | null;
  sources: Record<string, string>;
  warnings: string[];
}

export interface RcResolvedCosenzaParameters extends Record<string, unknown> {
  mode: RcShearMode;
  shape: string | null;
  diameter: number | null;
  concreteArea: number | null;
  longitudinalArea: number | null;
  rhoL: number | null;
  fcPrime: number | null;
  transverseReinforcement: RcResolvedTransverseReinforcement | null;
  rhoW: number | null;
  sources: Record<string, string>;
  warnings: string[];
}

export interface RcShearComputationUnavailable {
  available: false;
  missing?: string[];
  warnings: string[];
}

export interface RcShearVerificationData {
  status: ResultStatus;
  utilizationRatio: number | null;
  demand: number;
  capacity: number | null;
  checks: VerificationCheck[];
  warnings: string[];
  assumptions: string[];
  outputs: Record<string, unknown>;
  metadata: Record<string, unknown>;
}

export interface RcShearVerificationOptions {
  code?: string;
  mode?: RcShearMode | null;
  method?: string | null;
  shear?: RcShearInput;
  section?: ReinforcedConcreteSection | null;
  concreteMaterial?: ConcreteMaterial | null;
  reinforcementMaterial?: SteelMaterial | null;
  metadata?: Record<string, unknown>;
}

export interface RcShearVerificationInput {
  section?: ReinforcedConcreteSection | null;
  concreteMaterial?: ConcreteMaterial | null;
  reinforcementMaterial?: SteelMaterial | null;
  shear?: RcShearInput;
  actions?: RcShearActions;
  units?: UnitSystemInput;
}

export interface RcShearSectionActionInput extends RcShearVerificationInput {
  nEd?: number | null;
  vEd?: number | null;
  mEd?: number | null;
  context?: RcShearVerificationInput;
}
