import {
  governingCheck,
  isFinitePositive,
  round,
  utilizationCheck,
} from "../../../core/results/checkUtils.js";
import type {
  ReferencePoint,
  ReinforcedConcreteSection,
} from "../../../domain/geometry/ReinforcedConcreteSection.js";
import type { ConcreteStrainPoint } from "../analysis/RCSectionStrainExtremes.js";
import type { ReinforcedConcreteSectionReferencePointInput } from "../models/ReinforcedConcreteSectionModel.js";

export const DEFAULT_RC_SECTION_UNITS = Object.freeze({
  force: "N",
  length: "mm",
});

export { governingCheck, isFinitePositive, round, utilizationCheck };

export function roundNullable(value: number | null | undefined, decimals = 6): number | null {
  return Number.isFinite(value) ? round(value as number, decimals) : null;
}

export function hasSignificantAction(
  value: number | null | undefined,
  reference = 0,
  tolerance = 1e-9,
): boolean {
  return (
    Number.isFinite(value) &&
    Math.abs(value as number) > Math.max(tolerance, Math.abs(reference) * tolerance)
  );
}

export function normalizeCombinationType(value: string | null | undefined): string {
  return String(value ?? "")
    .trim()
    .toUpperCase()
    .replaceAll("-", "_");
}

export function resolveReferencePoint(
  section: ReinforcedConcreteSection,
  referencePoint: ReinforcedConcreteSectionReferencePointInput | null = null,
): ReferencePoint {
  const type = referencePoint?.type ?? "concrete-centroid";
  const coordinates = referencePoint?.coordinates ?? null;

  return section.getReferencePoint(
    type,
    coordinates == null
      ? null
      : {
          y: coordinates.y as number,
          z: coordinates.z as number,
        },
  );
}

export function summarizeConcreteCompressionEdge(
  edge: (ConcreteStrainPoint & { demand: number }) | null | undefined,
): Record<string, number> | null {
  if (edge == null) {
    return null;
  }

  return {
    strain: round(edge.strain, 12),
    demand: round(edge.demand, 12),
    y: round(edge.y, 6),
    z: round(edge.z, 6),
  };
}

export function resolveServiceStressSolverActions(
  actions: {
    nEd?: number;
    axialForce?: number;
    mEd?: number;
    mxEd?: number;
    myEd?: number;
  } = {},
): {
  nEd: number | undefined;
  mxEd: number;
  myEd: number;
} {
  const userMxEd = actions.mxEd ?? actions.mEd ?? 0;
  const userMyEd = actions.myEd ?? 0;

  return {
    nEd: actions.nEd ?? actions.axialForce,
    mxEd: userMxEd,
    myEd: userMyEd,
  };
}
