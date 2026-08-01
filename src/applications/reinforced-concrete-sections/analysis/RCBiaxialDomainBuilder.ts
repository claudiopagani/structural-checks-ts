import type {
  ConcreteUltimateConstitutiveLaw,
  SteelUltimateConstitutiveLaw,
} from "../../../domain/constitutive-laws/types.js";
import type {
  ReferencePoint,
  ReinforcedConcreteSection,
} from "../../../domain/geometry/ReinforcedConcreteSection.js";
import {
  RCUltimateSectionSolver,
  type RCUltimateSectionResult,
} from "./RCUltimateSectionSolver.js";
import type { ConcreteStrainExtremes } from "./RCSectionStrainExtremes.js";
import type { SectionFiber } from "./types.js";

export type BiaxialCompressedSide = "positive" | "negative";

export interface RCBiaxialDomainPoint {
  theta: number;
  MxRd: number;
  MyRd: number;
  neutralAxisDepth: number;
  axialResidual: number;
  failureMode: RCUltimateSectionResult["failureMode"];
  concreteCompressionEdge: ConcreteStrainExtremes["compression"] | null;
  converged: boolean;
}

export interface RCBiaxialDomain {
  nEd: number;
  angleCount: number;
  compressedSide: BiaxialCompressedSide;
  points: RCBiaxialDomainPoint[];
}

export interface RCBiaxialDomainBuilderOptions {
  ultimateSolver?: RCUltimateSectionSolver;
}

export interface RCBiaxialDomainBuildOptions {
  section: ReinforcedConcreteSection;
  concreteFibers: SectionFiber[];
  concreteLaw: ConcreteUltimateConstitutiveLaw;
  steelLaw: SteelUltimateConstitutiveLaw;
  nEd: number;
  angleCount?: number;
  referencePoint?: ReferencePoint | null;
  compressedSide?: BiaxialCompressedSide;
}

export class RCBiaxialDomainBuilder {
  ultimateSolver: RCUltimateSectionSolver;

  constructor({
    ultimateSolver = new RCUltimateSectionSolver(),
  }: RCBiaxialDomainBuilderOptions = {}) {
    this.ultimateSolver = ultimateSolver;
  }

  buildAtAxialLoad({
    section,
    concreteFibers,
    concreteLaw,
    steelLaw,
    nEd,
    angleCount = 32,
    referencePoint = null,
    compressedSide = "positive",
  }: RCBiaxialDomainBuildOptions): RCBiaxialDomain {
    if (!Number.isInteger(angleCount) || angleCount < 4) {
      throw new Error("RCBiaxialDomainBuilder angleCount must be an integer >= 4.");
    }

    const points: RCBiaxialDomainPoint[] = [];

    for (let index = 0; index < angleCount; index += 1) {
      const theta = (2 * Math.PI * index) / angleCount;
      const solved = this.ultimateSolver.solveAtAxialLoad({
        section,
        concreteFibers,
        concreteLaw,
        steelLaw,
        nEd,
        theta,
        compressedSide,
        referencePoint,
      });

      points.push({
        theta,
        MxRd: solved.MxRd,
        MyRd: solved.MyRd,
        neutralAxisDepth: solved.neutralAxisDepth,
        axialResidual: solved.axialResidual,
        failureMode: solved.failureMode,
        concreteCompressionEdge: solved.concreteStrainExtremes?.compression ?? null,
        converged: solved.converged,
      });
    }

    return {
      nEd,
      angleCount,
      compressedSide,
      points,
    };
  }
}
