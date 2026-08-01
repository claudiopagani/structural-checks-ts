import type { ConstitutiveLaw } from "../../../domain/constitutive-laws/types.js";
import { ConcreteNoTensionLaw } from "../../../domain/constitutive-laws/ConcreteNoTensionLaw.js";
import type {
  ReferencePoint,
  ReinforcedConcreteSection,
} from "../../../domain/geometry/ReinforcedConcreteSection.js";
import type { SteelMaterial } from "../../../domain/materials/SteelMaterial.js";
import { SteelElasticLaw } from "../../../domain/constitutive-laws/SteelElasticLaw.js";
import {
  RCServiceStressSolver,
  type RCServiceStressActions,
  type RCServiceStressInitialGuess,
  type RCServiceStressResult,
  type RCServiceStressSolverOptions,
} from "../analysis/RCServiceStressSolver.js";
import {
  SectionFiberDiscretizer,
  type FiberDiscretizationOptions,
  type SectionFiberMesh,
} from "../analysis/SectionFiberDiscretizer.js";
import {
  solveServiceStressWithFallbacks,
  type RCServiceStressFallbackResult,
} from "../analysis/solveServiceStressWithFallbacks.js";
import { isFinitePositive } from "./rcCommon.js";

export interface RcServiceSectionContextOptions {
  section: ReinforcedConcreteSection;
  reinforcementMaterial: SteelMaterial;
  mesh?: {
    targetFiberCount?: number;
    method?: FiberDiscretizationOptions["method"];
  };
  solver?: RcServiceStressSolverConfiguration;
  modularRatio: number;
  concreteLaw?: ConstitutiveLaw | null;
  steelLaw?: ConstitutiveLaw | null;
}

export interface RcServiceStressSolverConfiguration extends RCServiceStressSolverOptions {
  initialGuess?: RCServiceStressInitialGuess;
}

export interface RcServiceSectionSolverContext {
  mesh: SectionFiberMesh;
  serviceSolver: RCServiceStressSolver;
  concreteLaw: ConstitutiveLaw;
  steelLaw: ConstitutiveLaw;
}

export interface SolveRcServiceSectionStateOptions extends RcServiceSectionContextOptions {
  actions: RCServiceStressActions;
  concreteMesh?: SectionFiberMesh | null;
  serviceSolver?: RCServiceStressSolver | null;
  initialGuess?: RCServiceStressInitialGuess;
  referencePoint?: ReferencePoint | null;
  useFallbacks?: boolean;
}

export interface RcServiceSectionStateResult extends RcServiceSectionSolverContext {
  solved: RCServiceStressResult | RCServiceStressFallbackResult;
}

export function createRcServiceSectionSolverContext({
  section,
  reinforcementMaterial,
  mesh = {},
  solver = {},
  modularRatio,
  concreteLaw = null,
  steelLaw = null,
}: RcServiceSectionContextOptions): RcServiceSectionSolverContext {
  const es = reinforcementMaterial?.elasticModulus;

  if (!section?.concreteSection) {
    throw new Error("RC SLE verification requires a reinforced concrete section.");
  }

  if (!isFinitePositive(es)) {
    throw new Error("RC SLE verification requires reinforcement elastic modulus.");
  }

  if (!isFinitePositive(modularRatio) && (!concreteLaw || !steelLaw)) {
    throw new Error("RC SLE verification requires a positive modular ratio n.");
  }

  const concreteMesh = new SectionFiberDiscretizer().discretize(section, {
    targetCount: mesh.targetFiberCount ?? 100,
    method: mesh.method ?? "grid",
  });
  const serviceSolver = new RCServiceStressSolver({
    tolerance: solver.tolerance ?? 1e-2,
    maxIterations: solver.maxIterations ?? 50,
    finiteDifferenceStep: solver.finiteDifferenceStep ?? 1e-8,
  });
  const elasticModulus = es;

  return {
    mesh: concreteMesh,
    serviceSolver,
    concreteLaw:
      concreteLaw ??
      new ConcreteNoTensionLaw({
        ecm: elasticModulus / modularRatio,
      }),
    steelLaw:
      steelLaw ??
      new SteelElasticLaw({
        Es: elasticModulus,
      }),
  };
}

export function solveRcServiceSectionState({
  section,
  reinforcementMaterial,
  actions,
  mesh,
  solver = {},
  modularRatio,
  concreteMesh = null,
  serviceSolver = null,
  concreteLaw = null,
  steelLaw = null,
  initialGuess = solver.initialGuess ?? {},
  referencePoint = null,
  useFallbacks = true,
}: SolveRcServiceSectionStateOptions): RcServiceSectionStateResult {
  const context =
    concreteMesh && serviceSolver && concreteLaw && steelLaw
      ? {
          mesh: concreteMesh,
          serviceSolver,
          concreteLaw,
          steelLaw,
        }
      : createRcServiceSectionSolverContext({
          section,
          reinforcementMaterial,
          mesh: mesh ?? {},
          solver,
          modularRatio,
          concreteLaw,
          steelLaw,
        });
  const analysisMode = context.mesh.method === "uniaxial-strips" ? "uniaxial" : "biaxial";
  const solveOptions = {
    section,
    concreteFibers: context.mesh.fibers,
    concreteLaw: context.concreteLaw,
    steelLaw: context.steelLaw,
    actions,
    referencePoint,
    initialGuess,
  };

  return {
    mesh: context.mesh,
    concreteLaw: context.concreteLaw,
    steelLaw: context.steelLaw,
    serviceSolver: context.serviceSolver,
    solved: useFallbacks
      ? solveServiceStressWithFallbacks({
          serviceSolver: context.serviceSolver,
          ...solveOptions,
          analysisMode,
        })
      : analysisMode === "uniaxial"
        ? context.serviceSolver.solveUniaxial(solveOptions)
        : context.serviceSolver.solve(solveOptions),
  };
}
