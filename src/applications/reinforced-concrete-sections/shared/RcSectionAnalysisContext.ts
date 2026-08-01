import { IllinoisRootSolver } from "../../../domain/solvers/IllinoisRootSolver.js";
import type {
  ConstitutiveLaw,
  ConcreteUltimateConstitutiveLaw,
  SteelUltimateConstitutiveLaw,
} from "../../../domain/constitutive-laws/types.js";
import { RCMomentCurvatureAnalyzer } from "../analysis/RCMomentCurvatureAnalyzer.js";
import { RCUltimateSectionSolver } from "../analysis/RCUltimateSectionSolver.js";
import {
  SectionFiberDiscretizer,
  type SectionFiberMesh,
} from "../analysis/SectionFiberDiscretizer.js";
import type { ReinforcedConcreteSectionModel } from "../models/ReinforcedConcreteSectionModel.js";
import {
  resolveConcreteLaw,
  resolveServiceConcreteLaw,
  resolveServiceSteelLaw,
  resolveSteelLaw,
} from "./rcConstitutiveLaws.js";
import { resolveReferencePoint } from "./rcCommon.js";

interface RcSectionAnalysisContextBase {
  model: ReinforcedConcreteSectionModel;
  section: NonNullable<ReinforcedConcreteSectionModel["section"]>;
  targetFiberCount: number;
  referencePoint: { y: number; z: number };
  mesh: SectionFiberMesh;
}

export interface RcUltimateSectionAnalysisContext extends RcSectionAnalysisContextBase {
  concreteLaw: ConcreteUltimateConstitutiveLaw;
  steelLaw: SteelUltimateConstitutiveLaw;
}

export interface RcServiceSectionAnalysisContext extends RcSectionAnalysisContextBase {
  concreteLaw: ConstitutiveLaw;
  steelLaw: ConstitutiveLaw;
}

export function createRcSectionAnalysisContext(
  model: ReinforcedConcreteSectionModel,
  options: { service: true },
): RcServiceSectionAnalysisContext;
export function createRcSectionAnalysisContext(
  model: ReinforcedConcreteSectionModel,
  options?: { service?: false },
): RcUltimateSectionAnalysisContext;
export function createRcSectionAnalysisContext(
  model: ReinforcedConcreteSectionModel,
  { service = false }: { service?: boolean } = {},
): RcUltimateSectionAnalysisContext | RcServiceSectionAnalysisContext {
  const section = model.section;

  if (section == null) {
    throw new Error("ReinforcedConcreteSectionVerification requires a section.");
  }

  const targetFiberCount = model.mesh.targetFiberCount ?? 100;
  const rawReferencePoint = resolveReferencePoint(section, model.referencePoint);

  if (!Number.isFinite(rawReferencePoint.y) || !Number.isFinite(rawReferencePoint.z)) {
    throw new Error("ReinforcedConcreteSectionVerification requires a finite reference point.");
  }

  const referencePoint = {
    y: rawReferencePoint.y as number,
    z: rawReferencePoint.z as number,
  };
  const concreteLaw = service
    ? resolveServiceConcreteLaw(model, section)
    : resolveConcreteLaw(model, section);
  const steelLaw = service
    ? resolveServiceSteelLaw(model, section)
    : resolveSteelLaw(model, section);
  const mesh = new SectionFiberDiscretizer().discretize(section, {
    targetCount: targetFiberCount,
    method: model.mesh.method ?? "grid",
  });

  return {
    model,
    section,
    targetFiberCount,
    referencePoint,
    concreteLaw,
    steelLaw,
    mesh,
  };
}

export function createUltimateSectionSolver(
  model: ReinforcedConcreteSectionModel,
): RCUltimateSectionSolver {
  return new RCUltimateSectionSolver({
    rootSolver: new IllinoisRootSolver({
      tolerance: model.solver.tolerance ?? 1e-6,
      maxIterations: model.solver.maxIterations ?? 100,
    }),
  });
}

export function createMomentCurvatureAnalyzer(
  model: ReinforcedConcreteSectionModel,
): RCMomentCurvatureAnalyzer {
  return new RCMomentCurvatureAnalyzer({
    axialRootSolver: new IllinoisRootSolver({
      tolerance: model.solver.tolerance ?? 1e-6,
      maxIterations: model.solver.maxIterations ?? 100,
    }),
    limitRootSolver: new IllinoisRootSolver({
      tolerance: model.solver.limitTolerance ?? model.solver.tolerance ?? 1e-8,
      maxIterations: model.solver.limitMaxIterations ?? 60,
    }),
    eps0Samples: model.solver.eps0Samples ?? 161,
    eps0Min: model.solver.eps0Min ?? -0.08,
    eps0Max: model.solver.eps0Max ?? 0.08,
  });
}
