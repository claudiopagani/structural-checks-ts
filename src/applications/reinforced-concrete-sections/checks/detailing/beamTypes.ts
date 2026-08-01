import type { CrossSection } from "../../../../domain/geometry/CrossSection.js";
import type { ReinforcedConcreteSection } from "../../../../domain/geometry/ReinforcedConcreteSection.js";
import type { ConcreteMaterial } from "../../../../domain/materials/ConcreteMaterial.js";
import type { SteelMaterial } from "../../../../domain/materials/SteelMaterial.js";

export interface RcBeamLongitudinalLayerInput extends Record<string, unknown> {
  diameter?: number;
  barCount?: number;
  area?: number;
  continuousArea?: number;
}

export interface RcBeamTransverseDetailingInput extends Record<string, unknown> {
  diameter?: number;
  spacing?: number;
  areaPerSet?: number;
  hookAngle?: number;
  hookExtension?: number;
}

export interface RcBeamAnchorageInput extends Record<string, unknown> {
  id?: string;
  diameter?: number;
  availableLength?: number;
  designSteelStress?: number;
  fyd?: number;
  bondConditionFactor?: number;
  tension?: boolean;
  alpha1?: number;
  alpha2?: number;
  alpha3?: number;
  alpha4?: number;
  alpha5?: number;
}

export interface RcBeamDetailingInput extends Record<string, unknown> {
  geometry?: {
    width?: number;
    height?: number;
    effectiveDepth?: number;
    tensionZoneWidth?: number;
  };
  longitudinal?: {
    top?: RcBeamLongitudinalLayerInput;
    bottom?: RcBeamLongitudinalLayerInput;
  };
  transverse?: RcBeamTransverseDetailingInput;
  seismic?: {
    enabled?: boolean;
    ductilityClass?: string;
    firstHoopDistance?: number;
  };
  anchors?: RcBeamAnchorageInput[];
  fctd?: number;
}

export interface RcBeamDetailingVerificationOptions {
  code?: string;
}

export interface RcBeamDetailingVerificationInput {
  section?: CrossSection | ReinforcedConcreteSection | null;
  concreteMaterial?: ConcreteMaterial | null;
  reinforcementMaterial?: SteelMaterial | null;
  detailing?: RcBeamDetailingInput | null;
}
