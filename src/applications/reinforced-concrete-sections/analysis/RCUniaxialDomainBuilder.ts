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

export type UniaxialCompressedEdge = "top" | "bottom";
export type UniaxialCurvatureSign = "positive" | "negative";

type ConcreteLawWithStrength = ConcreteUltimateConstitutiveLaw & {
  fcd?: number;
};

type SteelLawWithStrength = SteelUltimateConstitutiveLaw & {
  fyd?: number;
};

interface MaterialWithDesignStrength {
  fcd?: number;
  fyd?: number;
}

export interface RCUniaxialAxialCapacity {
  concreteArea: number;
  reinforcementArea: number;
  fcd: number;
  fyd: number;
  maximumTension: number;
  maximumCompression: number;
}

export interface RCUniaxialDomainPoint {
  nEd: number;
  compressedEdge: UniaxialCompressedEdge;
  curvatureSign: UniaxialCurvatureSign;
  MxRd: number;
  MyRd: number;
  neutralAxisDepth: number;
  axialResidual: number;
  failureMode: RCUltimateSectionResult["failureMode"];
  concreteCompressionEdge: ConcreteStrainExtremes["compression"] | null;
  converged: boolean;
}

export interface RCUniaxialDomain {
  compressedEdge: UniaxialCompressedEdge;
  compressedEdges: UniaxialCompressedEdge[];
  nValues: number[];
  axialCapacity: RCUniaxialAxialCapacity;
  points: RCUniaxialDomainPoint[];
}

export interface RCUniaxialDomainBuilderOptions {
  ultimateSolver?: RCUltimateSectionSolver;
}

export interface RCUniaxialDomainBuildOptions {
  section: ReinforcedConcreteSection;
  concreteFibers: SectionFiber[];
  concreteLaw: ConcreteLawWithStrength;
  steelLaw: SteelLawWithStrength;
  nValues?: number[] | undefined;
  compressedEdge?: UniaxialCompressedEdge;
  includeOppositeCurvature?: boolean;
  pointCount?: number;
  referencePoint?: ReferencePoint | null;
}

function estimateAxialCapacity({
  section,
  concreteLaw,
  steelLaw,
}: Pick<
  RCUniaxialDomainBuildOptions,
  "section" | "concreteLaw" | "steelLaw"
>): RCUniaxialAxialCapacity {
  if (!section?.concreteSection) {
    throw new Error("RCUniaxialDomainBuilder requires a reinforced concrete section.");
  }

  const concreteArea = section.concreteSection.area;
  const reinforcementArea = section.totalReinforcementArea();
  const concreteMaterial = section.concreteMaterial as MaterialWithDesignStrength | null;
  const reinforcementMaterial = section.reinforcementMaterial as MaterialWithDesignStrength | null;
  const fcd = concreteLaw.fcd ?? concreteMaterial?.fcd;
  const fyd = steelLaw.fyd ?? reinforcementMaterial?.fyd;

  if (!Number.isFinite(concreteArea) || concreteArea <= 0) {
    throw new Error("RCUniaxialDomainBuilder requires a positive concrete area.");
  }

  if (!Number.isFinite(reinforcementArea) || reinforcementArea <= 0) {
    throw new Error("RCUniaxialDomainBuilder requires a positive reinforcement area.");
  }

  if (!Number.isFinite(fcd) || (fcd as number) <= 0) {
    throw new Error("RCUniaxialDomainBuilder requires a positive concrete fcd.");
  }

  if (!Number.isFinite(fyd) || (fyd as number) <= 0) {
    throw new Error("RCUniaxialDomainBuilder requires a positive reinforcement fyd.");
  }

  const resolvedFcd = fcd as number;
  const resolvedFyd = fyd as number;
  const steelCapacity = reinforcementArea * resolvedFyd;
  const compressionCapacity = 0.8 * concreteArea * resolvedFcd + steelCapacity;

  return {
    concreteArea,
    reinforcementArea,
    fcd: resolvedFcd,
    fyd: resolvedFyd,
    maximumTension: steelCapacity,
    maximumCompression: -compressionCapacity,
  };
}

function createAxialForceValues({
  minimum,
  maximum,
  pointCount,
}: {
  minimum: number;
  maximum: number;
  pointCount: number;
}): number[] {
  if (!Number.isFinite(minimum) || !Number.isFinite(maximum) || minimum >= maximum) {
    throw new Error("RCUniaxialDomainBuilder requires a valid axial-force interval.");
  }

  if (!Number.isInteger(pointCount) || pointCount < 2) {
    throw new Error("RCUniaxialDomainBuilder requires at least two axial-force points.");
  }

  const step = (maximum - minimum) / (pointCount - 1);

  return Array.from({ length: pointCount }, (_, index) => minimum + step * index);
}

function uniqueSorted(values: number[]): number[] {
  return [...new Set(values)]
    .filter((value) => Number.isFinite(value))
    .sort((first, second) => first - second);
}

function uniqueValues<TValue>(values: TValue[]): TValue[] {
  return [...new Set(values)];
}

export class RCUniaxialDomainBuilder {
  ultimateSolver: RCUltimateSectionSolver;

  constructor({
    ultimateSolver = new RCUltimateSectionSolver(),
  }: RCUniaxialDomainBuilderOptions = {}) {
    this.ultimateSolver = ultimateSolver;
  }

  build({
    section,
    concreteFibers,
    concreteLaw,
    steelLaw,
    nValues,
    compressedEdge = "top",
    includeOppositeCurvature = true,
    pointCount = 15,
    referencePoint = null,
  }: RCUniaxialDomainBuildOptions): RCUniaxialDomain {
    const axialCapacity = estimateAxialCapacity({
      section,
      concreteLaw,
      steelLaw,
    });
    const resolvedNValues =
      Array.isArray(nValues) && nValues.length >= 2
        ? uniqueSorted(nValues)
        : createAxialForceValues({
            minimum: axialCapacity.maximumCompression,
            maximum: axialCapacity.maximumTension,
            pointCount,
          });

    if (resolvedNValues.length < 2) {
      throw new Error("RCUniaxialDomainBuilder requires at least two axial-force values.");
    }

    const oppositeEdge: UniaxialCompressedEdge = compressedEdge === "top" ? "bottom" : "top";
    const compressedEdges: UniaxialCompressedEdge[] = includeOppositeCurvature
      ? uniqueValues<UniaxialCompressedEdge>([compressedEdge, oppositeEdge])
      : [compressedEdge];

    const points = compressedEdges.flatMap((edge) =>
      resolvedNValues.map((nEd) => {
        const solved = this.ultimateSolver.solveUniaxialAtAxialLoad({
          section,
          concreteFibers,
          concreteLaw,
          steelLaw,
          nEd,
          compressedEdge: edge,
          referencePoint,
        });

        return {
          nEd,
          compressedEdge: edge,
          curvatureSign: edge === "top" ? ("positive" as const) : ("negative" as const),
          MxRd: solved.MxRd,
          MyRd: solved.MyRd,
          neutralAxisDepth: solved.neutralAxisDepth,
          axialResidual: solved.axialResidual,
          failureMode: solved.failureMode,
          concreteCompressionEdge: solved.concreteStrainExtremes?.compression ?? null,
          converged: solved.converged,
        };
      }),
    );

    return {
      compressedEdge,
      compressedEdges,
      nValues: resolvedNValues,
      axialCapacity,
      points,
    };
  }
}
