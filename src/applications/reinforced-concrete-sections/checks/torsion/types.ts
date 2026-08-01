import type { VerificationCheck } from "../../../../core/results/VerificationResult.js";
import type { ResultStatus } from "../../../../core/results/resultStatus.js";
import type { ReinforcedConcreteSection } from "../../../../domain/geometry/ReinforcedConcreteSection.js";
import type { ConcreteMaterial } from "../../../../domain/materials/ConcreteMaterial.js";
import type { SteelMaterial } from "../../../../domain/materials/SteelMaterial.js";
import type { UnitSystemInput } from "../../../../domain/units/UnitSystem.js";
import type { RcShearInput } from "../shear/types.js";

export interface RcTorsionReinforcementMaterial {
  fyd?: number;
}

export interface RcTorsionTransverseReinforcementInput extends Record<string, unknown> {
  closed?: boolean;
  diameter?: number;
  areaPerLeg?: number;
  area?: number;
  spacing?: number;
  fyd?: number;
  material?: SteelMaterial | RcTorsionReinforcementMaterial;
}

export interface RcTorsionLongitudinalReinforcementInput extends Record<string, unknown> {
  area?: number;
  fyd?: number;
  material?: SteelMaterial | RcTorsionReinforcementMaterial;
}

export interface RcTorsionInput extends Record<string, unknown> {
  units?: UnitSystemInput;
  equilibriumRequired?: boolean;
  concreteArea?: number;
  ac?: number;
  sectionPerimeter?: number;
  perimeter?: number;
  edgeToLongitudinalBarCenter?: number;
  edgeDistance?: number;
  effectiveWallThickness?: number;
  t?: number;
  medianArea?: number;
  ak?: number;
  medianPerimeter?: number;
  um?: number;
  transverseReinforcement?: RcTorsionTransverseReinforcementInput;
  longitudinalReinforcement?: RcTorsionLongitudinalReinforcementInput;
  torsionalLongitudinalReinforcementArea?: number;
  longitudinalReinforcementArea?: number;
  longitudinalFyd?: number;
  cotTheta?: number;
  fcdPrime?: number;
  fcdPrimeFactor?: number;
}

export interface RcTorsionActions {
  tEd?: number | null;
  t?: number | null;
  vEd?: number | null;
  v?: number | null;
  nEd?: number | null;
  n?: number | null;
  mEd?: number | null;
  m?: number | null;
}

export interface RcTorsionVerificationOptions {
  code?: string;
  torsion?: RcTorsionInput;
  shear?: RcShearInput | null;
  metadata?: Record<string, unknown>;
}

export interface RcTorsionVerificationContext {
  section?: ReinforcedConcreteSection | null;
  concreteMaterial?: ConcreteMaterial | null;
  reinforcementMaterial?: SteelMaterial | null;
  torsion?: RcTorsionInput;
  shear?: RcShearInput | null;
  units?: UnitSystemInput;
}

export interface RcTorsionVerificationInput extends RcTorsionVerificationContext {
  actions?: RcTorsionActions;
}

export interface RcTorsionSectionActionInput extends RcTorsionVerificationContext {
  tEd?: number | null;
  vEd?: number | null;
  nEd?: number | null;
  mEd?: number | null;
  context?: RcTorsionVerificationContext;
}

export interface RcTorsionVerificationData {
  status: ResultStatus;
  utilizationRatio: number | null;
  demand: number;
  capacity: number | null;
  checks: VerificationCheck[];
  outputs: Record<string, unknown>;
  warnings: string[];
  assumptions: string[];
  metadata: Record<string, unknown>;
}
