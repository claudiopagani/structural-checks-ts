import type { ReinforcedConcreteSection } from "../../domain/geometry/ReinforcedConcreteSection.js";
import type { ConcreteMaterial } from "../../domain/materials/ConcreteMaterial.js";
import type { SteelMaterial } from "../../domain/materials/SteelMaterial.js";
import type { UnitSystem, UnitSystemInput } from "../../domain/units/UnitSystem.js";
import type {
  ReinforcedConcreteSectionMeshOptions,
  ReinforcedConcreteSectionSolverOptions,
} from "../reinforced-concrete-sections/models/ReinforcedConcreteSectionModel.js";
import type { RcShearInput } from "../reinforced-concrete-sections/checks/shear/types.js";
import type { ReinforcedConcreteColumnModel } from "./ReinforcedConcreteColumnModel.js";

export interface RcColumnStabilityInput extends Record<string, unknown> {
  effectiveLengthMx?: number;
  effectiveLengthMy?: number;
  effectiveLengthY?: number;
  effectiveLengthZ?: number;
  l0y?: number;
  l0z?: number;
  compressionSignConvention?: string;
  designMomentsIncludeSecondOrder?: boolean;
  secondOrderMethod?: string;
  creepCoefficient?: number | null;
  momentDistributionFactor?: number | null;
  includeImperfectionWhenMomentIsZero?: boolean;
  biaxialAngleCount?: number;
  gammaCE?: number;
  mxIncludesSecondOrder?: boolean;
  myIncludesSecondOrder?: boolean;
}

export interface RcColumnActionsInput extends Record<string, unknown> {
  nEd?: number;
  n?: number;
  mxEd?: number;
  mzEd?: number;
  myEd?: number;
  mxEdTotal?: number | null;
  mzEdTotal?: number | null;
  myEdTotal?: number | null;
  vxEd?: number;
  vyEd?: number;
}

export interface RcColumnShearTransverseInput extends Record<string, unknown> {
  areaPerSpacing?: number;
  spacing?: number | null;
  area?: number | null;
}

export interface RcColumnShearAxisInput extends RcShearInput {
  vEd?: number | null;
  bw?: number;
  effectiveDepth?: number;
  longitudinalReinforcementArea?: number;
  transverseReinforcement?: RcShearInput["transverseReinforcement"] & RcColumnShearTransverseInput;
}

export interface RcColumnCapacityDesignInput extends Record<string, unknown> {
  clearLength?: number;
  endMomentsX?: number[];
  endMomentsY?: number[];
  endMomentsPreAdjustedForHierarchy?: boolean;
}

export interface RcColumnShearInput {
  x?: RcColumnShearAxisInput | null;
  y?: RcColumnShearAxisInput | null;
  capacityDesign?: RcColumnCapacityDesignInput | null;
}

export interface RcColumnLongitudinalDetailingInput extends Record<string, unknown> {
  area?: number | null;
  minimumBarDiameter?: number | null;
  maximumBarDiameter?: number | null;
  maximumBarSpacing?: number | null;
}

export interface RcColumnTransverseDetailingInput extends Record<string, unknown> {
  diameter?: number | null;
  spacing?: number | null;
  designStrength?: number;
}

export interface RcColumnSeismicDetailingInput extends Record<string, unknown> {
  enabled?: boolean;
  ductilityClass?: string;
  clearHeight?: number;
  sectionDepthInBending?: number;
  curvatureDuctilityDemand?: number;
}

export interface RcColumnConfinementInput extends Record<string, unknown> {
  coreWidth?: number | null;
  coreDepth?: number | null;
  volumePerSet?: number | null;
  restrainedBarSpacings?: (number | null)[];
}

export interface RcColumnAnchorageInput extends Record<string, unknown> {
  fctd?: number;
  barDiameter?: number | null;
  availableLength?: number | null;
  bondConditionFactor?: number;
  designSteelStress?: number;
  tension?: boolean;
}

export interface RcColumnDetailingInput extends Record<string, unknown> {
  longitudinal?: RcColumnLongitudinalDetailingInput | null;
  transverse?: RcColumnTransverseDetailingInput | null;
  seismic?: RcColumnSeismicDetailingInput | null;
  confinement?: RcColumnConfinementInput | null;
  anchorage?: RcColumnAnchorageInput | null;
}

export interface ReinforcedConcreteColumnModelOptions {
  id: string;
  section: ReinforcedConcreteSection;
  concreteMaterial?: ConcreteMaterial | null;
  reinforcementMaterial?: SteelMaterial | null;
  length: number;
  stability?: RcColumnStabilityInput;
  actions?: RcColumnActionsInput;
  shear?: RcColumnShearInput | null;
  detailing?: RcColumnDetailingInput | null;
  mesh?: ReinforcedConcreteSectionMeshOptions;
  solver?: ReinforcedConcreteSectionSolverOptions;
  units: UnitSystemInput;
  metadata?: Record<string, unknown>;
}

export interface ResolvedRcColumnActions extends Record<string, unknown> {
  nEd: number;
  mxEd: number;
  myEd: number;
  mxEdTotal: number | null;
  myEdTotal: number | null;
  vxEd: number;
  vyEd: number;
}

export interface ResolvedRcColumnStability extends Record<string, unknown> {
  effectiveLengthMx: number;
  effectiveLengthMy: number;
  compressionSignConvention: string;
  designMomentsIncludeSecondOrder: boolean;
  secondOrderMethod: string;
  creepCoefficient: number | null;
  momentDistributionFactor: number;
  includeImperfectionWhenMomentIsZero: boolean;
  gammaCE?: number;
  mxIncludesSecondOrder?: boolean;
  myIncludesSecondOrder?: boolean;
  biaxialAngleCount?: number;
}

export interface ResolvedRcColumnShearAxis
  extends Omit<RcColumnShearAxisInput, "transverseReinforcement"> {
  label: "x" | "y";
  vEd: number | null;
  bw: number;
  effectiveDepth: number;
  longitudinalReinforcementArea: number;
  transverseReinforcement:
    | (Omit<
        NonNullable<RcColumnShearAxisInput["transverseReinforcement"]>,
        "areaPerSpacing" | "spacing" | "area"
      > & {
        areaPerSpacing: number;
        spacing: number | null;
        area: number | null;
      })
    | null;
}

export interface ResolvedRcColumnShear {
  x: ResolvedRcColumnShearAxis | null;
  y: ResolvedRcColumnShearAxis | null;
  capacityDesign:
    | (Omit<RcColumnCapacityDesignInput, "clearLength" | "endMomentsX" | "endMomentsY"> & {
        clearLength: number;
        endMomentsX: number[];
        endMomentsY: number[];
      })
    | null;
}

export interface ResolvedRcColumnDetailing extends RcColumnDetailingInput {
  longitudinal: RcColumnLongitudinalDetailingInput | null;
  transverse: RcColumnTransverseDetailingInput | null;
  confinement: RcColumnConfinementInput | null;
  anchorage: RcColumnAnchorageInput | null;
}

export interface RcColumnModelMetadata extends Record<string, unknown> {
  unitSystem: UnitSystem;
  sourceUnitSystem: UnitSystem | null;
}

export interface RcColumnDetailingVerificationOptions {
  code?: string;
}

export interface RcColumnDetailingVerificationInput {
  model: ReinforcedConcreteColumnModel;
  compression?: number;
  normalizedAxialForce?: number;
}

export interface ReinforcedConcreteColumnVerificationOptions {
  code?: string;
  metadata?: Record<string, unknown>;
}
