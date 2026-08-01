import type { ConstitutiveLaw } from "../../../../domain/constitutive-laws/types.js";
import type {
  ReferencePoint,
  ReinforcedConcreteSection,
} from "../../../../domain/geometry/ReinforcedConcreteSection.js";
import type { IllinoisRootSolver } from "../../../../domain/solvers/IllinoisRootSolver.js";
import type { RCSectionStateIntegrator } from "../RCSectionStateIntegrator.js";
import type { SectionFiber, SectionState, StrainFieldLike } from "../types.js";

export type MomentCurvatureCompressedSide = "positive" | "negative";
export type MomentCurvatureCompressedEdge = "top" | "bottom";
export type MomentCurvaturePostUltimateResponse = "retain" | "linear-softening" | "zero-stress";
export type MomentCurvatureStateKey = "firstYieldState" | "limitState";

export interface MomentCurvatureStateCheck {
  id: string;
  material: "concrete" | "steel";
  mode: string;
  demand: number;
  limit: number;
  utilizationRatio: number;
  reached: boolean;
}

export interface MomentCurvatureState {
  reached: boolean;
  governing: MomentCurvatureStateCheck | null;
  reachedChecks: MomentCurvatureStateCheck[];
  checks: MomentCurvatureStateCheck[];
  event?: MomentCurvatureStateCheck;
  eventType?: string;
  eventMaterial?: string;
  eventMode?: string;
}

export interface MomentCurvatureCompressionEdge {
  strain: number;
  demand: number;
  y: number;
  z: number;
  edge: MomentCurvatureCompressedEdge | null;
  side: MomentCurvatureCompressedSide;
}

export interface MomentCurvaturePostUltimateState {
  referenceMoment: number;
  reference: "material-ultimate-moment";
  targetMoment: number;
  moment: number;
  targetDropRatio: number;
  actualDropRatio: number | null;
  reached: boolean;
}

export interface MomentCurvaturePostPeakState {
  maximumMoment: number;
  targetMoment: number;
  moment: number;
  targetDropRatio: number;
  actualDropRatio: number | null;
  reached: boolean;
}

export interface MomentCurvatureBalancedFailureState {
  reached: boolean;
  concrete: MomentCurvatureStateCheck | null;
  steel: MomentCurvatureStateCheck | null;
  effectiveDepth: number;
  neutralAxisDepth: number;
  compressedEdgeProjection: number;
  tensionReinforcementProjection: number;
  compressedEdgeY: number | null;
  tensionReinforcementY: number | null;
  assignedAxialForce: number;
  balancedAxialForce: number;
  axialResidual: number;
  compatibleWithAssignedAxialForce: boolean;
}

export interface MomentCurvatureSolverReport {
  method: "direct-hit" | "illinois" | "closed-form-balanced-strain-compatibility";
  iterations: number;
  bracket?: {
    min: number;
    max: number;
  };
  candidateBracketCount?: number;
  evaluatedBracketCount?: number;
  residual: number;
  axialTolerance?: number;
}

export interface MomentCurvaturePoint {
  converged: boolean;
  theta: number;
  compressedSide: MomentCurvatureCompressedSide;
  curvature: number;
  absoluteCurvature: number;
  compressedEdge: MomentCurvatureCompressedEdge | null;
  eps0: number;
  kappaY: number;
  kappaZ: number;
  neutralAxisY: number | null;
  neutralAxisProjection: number | null;
  N: number;
  Mx: number;
  My: number;
  projectedMoment: number;
  axialResidual: number;
  state: SectionState;
  postUltimate?: SectionState["postUltimate"];
  concreteCompressionEdge: MomentCurvatureCompressionEdge;
  firstYieldState: MomentCurvatureState;
  limitState: MomentCurvatureState;
  solverReport: MomentCurvatureSolverReport;
  failureMode?: string;
  balancedFailureState?: MomentCurvatureBalancedFailureState;
  postUltimateState?: MomentCurvaturePostUltimateState;
  postPeakState?: MomentCurvaturePostPeakState;
}

export interface MomentCurvatureInterpolatedPoint {
  theta?: number;
  compressedSide?: MomentCurvatureCompressedSide | null;
  absoluteCurvature: number;
  curvature: number;
  Mx: number;
  My: number;
  source: string;
  interpolation: string;
}

export interface MomentCurvatureMaximum {
  point: MomentCurvaturePoint;
  index: number;
  moment: number;
}

export interface MomentCurvatureDuctility {
  reference: string;
  phiPrimeYd: number;
  mPrimeYd: number;
  mRd: number | null;
  phiYd: number | null;
  phiU: number | null;
  curvatureDuctilityRatio: number | null;
  firstYieldPoint: MomentCurvaturePoint;
  maximumMomentPoint: MomentCurvaturePoint | null;
  momentDropPoint: MomentCurvatureInterpolatedPoint | null;
  materialUltimatePoint: MomentCurvatureInterpolatedPoint | null;
  ultimatePoint: MomentCurvatureInterpolatedPoint | null;
  ultimateMomentDropRatio: number;
  firstYieldGoverning: string | null;
  ultimateCurvatureSource: string | null;
}

export interface MomentCurvatureCommonOptions {
  section: ReinforcedConcreteSection;
  concreteFibers: SectionFiber[];
  concreteLaw: ConstitutiveLaw;
  steelLaw: ConstitutiveLaw;
  nEd?: number;
  theta?: number;
  compressedSide?: MomentCurvatureCompressedSide | null;
  compressedEdge?: MomentCurvatureCompressedEdge;
  referencePoint?: ReferencePoint | null;
  includeConcreteTension?: boolean;
}

export interface MomentCurvatureSolveOptions extends MomentCurvatureCommonOptions {
  curvature: number;
  eps0Hint?: number | null;
  postUltimateResponse?: MomentCurvaturePostUltimateResponse;
  postUltimateFractureEnergyDensity?:
    | number
    | {
        concrete?: number;
        steel?: number;
      }
    | null;
}

export interface MomentCurvatureAnalyzeOptions extends MomentCurvatureCommonOptions {
  curvatureMax?: number | null;
  curvatureValues?: number[] | null;
  pointCount?: number;
  stopAtFailure?: boolean;
  includeFailurePoint?: boolean;
  postUltimateMomentDrop?: number | null;
  maxPostUltimateCurvatureRatio?: number;
  postPeakMomentDrop?: number | null;
  postUltimateResponse?: MomentCurvaturePostUltimateResponse;
  postUltimateFractureEnergyDensity?:
    | number
    | {
        concrete?: number;
        steel?: number;
      }
    | null;
  postPeakCurvatureGrowthFactor?: number;
  maxPostPeakPoints?: number;
}

export interface MomentCurvatureAnalyzerOptions {
  axialRootSolver?: IllinoisRootSolver;
  limitRootSolver?: IllinoisRootSolver;
  sectionIntegrator?: RCSectionStateIntegrator;
  eps0Samples?: number;
  eps0Min?: number;
  eps0Max?: number;
}

export interface MomentCurvatureCurve {
  nEd: number;
  theta: number;
  compressedSide: MomentCurvatureCompressedSide;
  compressedEdge: MomentCurvatureCompressedEdge | null;
  curvatureMax: number;
  initialCurvatureMax: number;
  balancedCurvature: number | null;
  pointCount: number;
  analyzedPointCount: number;
  generatedPointCount: number;
  failureReached: boolean;
  failurePoint: MomentCurvaturePoint | null;
  failureMode: string | null;
  materialUltimateReached: boolean;
  materialUltimatePoint: MomentCurvaturePoint | null;
  materialUltimateType: string | null;
  phiMaterialUltimate: number | null;
  Mu: number | null;
  balancedFailureReached: boolean;
  balancedFailurePoint: MomentCurvaturePoint | null;
  balancedCurvaturePoint: MomentCurvaturePoint | null;
  firstYieldReached: boolean;
  firstYieldPoint: MomentCurvaturePoint | null;
  firstYieldType: string | null;
  maximumMomentPoint: MomentCurvaturePoint | null;
  postUltimateMomentDrop: number;
  maxPostUltimateCurvatureRatio: number;
  postUltimateCurvatureLimit: number | null;
  postUltimateTerminationReached: boolean;
  postUltimateTerminationPoint: MomentCurvaturePoint | null;
  postUltimateMomentDropReached: boolean;
  postUltimateCurvatureLimitReached: boolean;
  postPeakMomentDrop: number;
  postPeakDropReached: boolean;
  postPeakDropPoint: MomentCurvaturePoint | null;
  postUltimateModel: {
    response: MomentCurvaturePostUltimateResponse;
    fractureEnergyDensity: {
      concrete: number;
      steel: number;
    };
    fractureEnergyDensityUnits: "N/mm2";
    fractureEnergyInterpretation: "energy-per-unit-volume";
  };
  terminationReason: string;
  ntc2018Ductility: MomentCurvatureDuctility | null;
  warnings: string[];
  points: MomentCurvaturePoint[];
}

export interface MomentCurvatureAnalyzerLike {
  limitRootSolver: IllinoisRootSolver;
  solveAtCurvature(options: MomentCurvatureSolveOptions): MomentCurvaturePoint;
}

export interface MomentCurvatureStrainFieldResult {
  strainField: StrainFieldLike;
  state: SectionState | Pick<SectionState, "N">;
  residual: number;
}
