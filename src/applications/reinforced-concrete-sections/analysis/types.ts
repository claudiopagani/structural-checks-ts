import type { ConstitutiveLaw } from "../../../domain/constitutive-laws/types.js";
import type {
  ReferencePoint,
  ReinforcedConcreteSection,
} from "../../../domain/geometry/ReinforcedConcreteSection.js";

export interface SectionFiber {
  id: string;
  area: number;
  y: number;
  z: number;
  height: number;
  width: number;
  materialRole: "concrete";
}

export interface AffineStrainField {
  eps0: number;
  kappaY: number;
  kappaZ: number;
}

export interface StrainFieldLike {
  eps0?: number;
  kappaY?: number;
  kappaZ?: number;
  strainAt?: (point: { y: number; z: number }) => number;
}

export interface MaterialExtreme {
  value: number;
  strain: number;
  y: number;
  z: number;
  id?: string | null;
  stress?: number;
}

export interface SectionState {
  N: number;
  Mx: number;
  My: number;
  referencePoint: ReferencePoint;
  concrete: {
    axialForce: number;
    fibers: Record<string, unknown>[];
  };
  steel: {
    axialForce: number;
    bars: Record<string, unknown>[];
  };
  postUltimate: {
    response: string;
    fractureEnergyDensity: {
      concrete: number;
      steel: number;
    };
    fractureEnergyDensityUnits: "N/mm2";
    fractureEnergyInterpretation: "energy-per-unit-volume";
    concreteFiberCount: number;
    steelBarCount: number;
    active: boolean;
  };
  extremes: {
    minStrain: number | null;
    maxStrain: number | null;
    maxConcreteCompression: MaterialExtreme | null;
    maxConcreteTension: MaterialExtreme | null;
    maxSteelCompression: MaterialExtreme | null;
    maxSteelTension: MaterialExtreme | null;
    maxSteelCompressionStrain: MaterialExtreme | null;
    maxSteelTensionStrain: MaterialExtreme | null;
  };
}

export interface SectionAnalysisInput {
  section: ReinforcedConcreteSection;
  concreteFibers: SectionFiber[];
  concreteLaw: ConstitutiveLaw;
  steelLaw: ConstitutiveLaw;
  referencePoint?: ReferencePoint | null;
}
