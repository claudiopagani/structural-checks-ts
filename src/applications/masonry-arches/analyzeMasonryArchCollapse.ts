import { CalculationResult } from "../../core/results/CalculationResult.js";
import { RESULT_STATUS } from "../../core/results/resultStatus.js";
import { extractRigidBlockMechanism2D } from "../../domain/masonry/rigid-blocks/extractRigidBlockMechanism2D.js";
import { extractNonAssociatedMechanism2D } from "../../domain/masonry/rigid-blocks/extractNonAssociatedMechanism2D.js";
import { solveRigidBlockChainCollapse2D } from "../../domain/masonry/rigid-blocks/solveHeymanChainCollapse2D.js";
import { solveRigidBlockChainEquilibrium2D } from "../../domain/masonry/rigid-blocks/solveHeymanChainEquilibrium2D.js";
import type {
  RigidBlockAppliedWrench2D,
  RigidBlockCollapse2D,
  RigidBlockInterfaceConstraintKind,
  RigidBlockInterfaceLimitLaw2D,
  RigidBlockKinematicMechanism2D,
  RigidBlockMotion2D,
} from "../../domain/masonry/rigid-blocks/types.js";
import { asMasonryArchModel, recoverMasonryArchInterfaceState } from "./analyzeMasonryArchState.js";
import {
  analyzeMasonryArchNonlinear,
  type AnalyzeMasonryArchNonlinearOptions,
  type MasonryArchNonlinearResult,
} from "./analyzeMasonryArchNonlinear.js";
import {
  resolveBaseMasonryArchInterfaceLaws,
  resolveMasonryArchInterfaceLaws,
} from "./interfaceLaws.js";
import { recoverBondedLayerStaticState } from "./bondedLayers.js";
import type { MasonryArchModel } from "./MasonryArchModel.js";
import { resolveMasonryArchLoads } from "./resolveMasonryArchLoads.js";
import {
  combineMasonryArchBlockWrenches,
  resolveArchReinforcements,
} from "./resolveArchReinforcements.js";
import {
  MASONRY_ARCH_COLLAPSE_RESULT_SCHEMA_VERSION,
  type AnalyzeMasonryArchCollapseOptions,
  type MasonryArchAppliedLoadResult,
  type MasonryArchCollapseHingeResult,
  type MasonryArchCollapseOutputs,
  type MasonryArchCollapseResult,
  type MasonryArchFailureMode,
  type MasonryArchInterfaceStateResult,
  type MasonryArchModelInput,
  type NormalizedMasonryArchModel,
} from "./types.js";

function finitePositive(value: number, label: string): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be finite and positive.`);
  }
  return value;
}

function positiveInteger(value: number, label: string): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive integer.`);
  }
  return value;
}

function selectedScalableCases(
  model: NormalizedMasonryArchModel,
  ids: readonly string[],
): ReadonlySet<string> {
  if (ids.length === 0) {
    throw new Error("Collapse analysis requires at least one scalable load case id.");
  }
  const known = new Set(model.loads.map((load) => load.loadCaseId));
  const selected = new Set<string>();
  for (const id of ids) {
    if (typeof id !== "string" || id.trim().length === 0) {
      throw new Error("Every scalable load case id must be a non-empty string.");
    }
    if (!known.has(id)) throw new Error(`Unknown scalable masonry-arch load case: ${id}.`);
    if (selected.has(id)) throw new Error(`Duplicate scalable masonry-arch load case: ${id}.`);
    selected.add(id);
  }
  return selected;
}

function loadFactorPartitions(
  factors: Readonly<Record<string, number>>,
  scalable: ReadonlySet<string>,
): {
  readonly fixed: Readonly<Record<string, number>>;
  readonly scalable: Readonly<Record<string, number>>;
  readonly roles: Readonly<Record<string, "fixed" | "scalable">>;
} {
  const fixed: Record<string, number> = {};
  const scalableFactors: Record<string, number> = {};
  const roles: Record<string, "fixed" | "scalable"> = {};
  for (const [id, factor] of Object.entries(factors)) {
    const isScalable = scalable.has(id);
    fixed[id] = isScalable ? 0 : factor;
    scalableFactors[id] = isScalable ? factor : 0;
    roles[id] = isScalable ? "scalable" : "fixed";
  }
  return { fixed, scalable: scalableFactors, roles };
}

function collapseHinges(
  model: NormalizedMasonryArchModel,
  activeConstraints: readonly {
    readonly interfaceId: string;
    readonly interfaceIndex: number;
    readonly kind: RigidBlockInterfaceConstraintKind;
  }[],
  normalForcesByInterface: ReadonlyMap<string, number>,
  compressionTolerance: number,
): MasonryArchCollapseHingeResult[] {
  const hinges: MasonryArchCollapseHingeResult[] = [];
  const seen = new Set<string>();
  for (const active of activeConstraints) {
    if (
      (active.kind !== "intrados" && active.kind !== "extrados") ||
      seen.has(active.interfaceId)
    ) {
      continue;
    }
    if ((normalForcesByInterface.get(active.interfaceId) ?? 0) <= compressionTolerance) continue;
    const geometry = model.geometry.interfaces[active.interfaceIndex];
    if (geometry === undefined || geometry.id !== active.interfaceId) {
      throw new Error(`Collapse constraint references unknown interface ${active.interfaceId}.`);
    }
    hinges.push({
      interfaceId: active.interfaceId,
      index: active.interfaceIndex,
      side: active.kind,
      point: active.kind === "intrados" ? geometry.intradosPoint : geometry.extradosPoint,
    });
    seen.add(active.interfaceId);
  }
  return hinges;
}

function virtualWork(
  wrenches: readonly RigidBlockAppliedWrench2D[],
  motions: readonly RigidBlockMotion2D[],
): number {
  return wrenches.reduce((work, wrench, index) => {
    const motion = motions[index];
    if (motion === undefined || motion.blockId !== wrench.blockId) {
      throw new Error("Mechanism motions and block wrenches are not consistently ordered.");
    }
    return (
      work +
      wrench.force.x * motion.translation.x +
      wrench.force.y * motion.translation.y +
      wrench.moment * motion.rotation
    );
  }, 0);
}

function scaledMotions(
  motions: readonly RigidBlockMotion2D[],
  factor: number,
): RigidBlockMotion2D[] {
  return motions.map((motion) => ({
    blockId: motion.blockId,
    translation: {
      x: factor * motion.translation.x,
      y: factor * motion.translation.y,
    },
    rotation: factor * motion.rotation,
  }));
}

function effectiveFactors(
  base: Readonly<Record<string, number>>,
  roles: Readonly<Record<string, "fixed" | "scalable">>,
  lambda: number | null,
): Readonly<Record<string, number | null>> {
  return Object.fromEntries(
    Object.entries(base).map(([id, factor]) => [
      id,
      roles[id] === "scalable" ? (lambda === null ? null : lambda * factor) : factor,
    ]),
  );
}

function filterAppliedLoads(
  loads: readonly MasonryArchAppliedLoadResult[],
  roleByCaseId: Readonly<Record<string, "fixed" | "scalable">>,
  role: "fixed" | "scalable",
): MasonryArchAppliedLoadResult[] {
  return loads.filter((load) => roleByCaseId[load.loadCaseId] === role);
}

interface CollapseSolverConvergence {
  readonly required: boolean;
  readonly converged: boolean;
  readonly iterations: number;
  readonly totalSimplexIterations: number;
  readonly relativeLambdaChange: number | null;
  readonly frictionReductionFactor: number | null;
}

/**
 * Sequential LP reduction of friction slope toward the requested dilation slope.
 * Mechanical formulation: Gilbert et al. (2006), DOI 10.1016/j.compstruc.2006.02.005,
 * as restated for masonry arches by Hua and Milani (2023), DOI 10.1016/j.compstruc.2023.106987.
 */
function solveCollapseWithInterfaceFlow(
  model: NormalizedMasonryArchModel,
  interfaceLaws: readonly RigidBlockInterfaceLimitLaw2D[],
  fixedWrenches: readonly RigidBlockAppliedWrench2D[],
  scalableWrenches: readonly RigidBlockAppliedWrench2D[],
  options: {
    readonly feasibilityTolerance: number;
    readonly simplexTolerance: number;
    readonly maxSimplexIterations: number;
    readonly activeConstraintTolerance: number;
    readonly nonAssociatedTolerance: number;
    readonly maxNonAssociatedIterations: number;
  },
): { readonly collapse: RigidBlockCollapse2D; readonly convergence: CollapseSolverConvergence } {
  const solve = (laws: readonly RigidBlockInterfaceLimitLaw2D[]): RigidBlockCollapse2D =>
    solveRigidBlockChainCollapse2D(
      {
        blocks: model.geometry.voussoirs,
        interfaces: model.geometry.interfaces,
        fixedWrenches,
        scalableWrenches,
        interfaceLaws: laws,
      },
      options,
    );
  let collapse = solve(interfaceLaws);
  let totalSimplexIterations = collapse.simplex.iterations;
  const hasActiveSliding = collapse.activeConstraints.some(
    (item) => item.kind === "sliding-positive" || item.kind === "sliding-negative",
  );
  const required =
    hasActiveSliding &&
    interfaceLaws.some((law) => {
      if (law.friction === null || law.friction.flowRule.type !== "non-associated") return false;
      return (
        law.friction.frictionCoefficient - Math.tan(law.friction.flowRule.dilationAngle) > 1e-12
      );
    });
  if (!required || collapse.status !== "optimal" || collapse.lambdaCritical === null) {
    return {
      collapse,
      convergence: {
        required,
        converged: !required && collapse.status === "optimal",
        iterations: 0,
        totalSimplexIterations,
        relativeLambdaChange: null,
        frictionReductionFactor: null,
      },
    };
  }

  const minimumReductionFactor = 0.001;
  let reductionFactor = 0.3;
  let relativeLambdaChange: number | null = null;
  let iterations = 0;
  let converged = false;
  while (iterations < options.maxNonAssociatedIterations) {
    reductionFactor = Math.max(reductionFactor / 2, minimumReductionFactor);
    const previous = collapse;
    const adjustedLaws = interfaceLaws.map((law, index): RigidBlockInterfaceLimitLaw2D => {
      if (law.friction === null || law.friction.flowRule.type !== "non-associated") return law;
      const targetSlope = Math.tan(law.friction.flowRule.dilationAngle);
      const originalSlope = law.friction.frictionCoefficient;
      const adjustedSlope = targetSlope + reductionFactor * (originalSlope - targetSlope);
      const currentNormal = Math.max(0, previous.interfaces[index]?.normalForce ?? 0);
      const area =
        model.geometry.interfaces[index]!.length *
        model.geometry.interfaces[index]!.outOfPlaneWidth;
      const adjustedCohesion =
        law.friction.cohesion + ((originalSlope - adjustedSlope) * currentNormal) / area;
      return {
        ...law,
        friction: {
          frictionCoefficient: adjustedSlope,
          cohesion: adjustedCohesion,
          flowRule: {
            type: "associated",
            dilationAngle: Math.atan(adjustedSlope),
          },
        },
      };
    });
    collapse = solve(adjustedLaws);
    totalSimplexIterations += collapse.simplex.iterations;
    iterations += 1;
    if (collapse.status !== "optimal" || collapse.lambdaCritical === null) break;
    relativeLambdaChange =
      Math.abs(collapse.lambdaCritical - previous.lambdaCritical!) /
      Math.max(options.nonAssociatedTolerance, Math.abs(previous.lambdaCritical!));
    if (
      reductionFactor <= minimumReductionFactor &&
      relativeLambdaChange <= options.nonAssociatedTolerance
    ) {
      converged = true;
      break;
    }
  }
  return {
    collapse,
    convergence: {
      required,
      converged,
      iterations,
      totalSimplexIterations,
      relativeLambdaChange,
      frictionReductionFactor: reductionFactor,
    },
  };
}

type MasonryArchModelLike = MasonryArchModel | NormalizedMasonryArchModel | MasonryArchModelInput;

export function analyzeMasonryArchCollapse(
  modelInput: MasonryArchModelLike,
  options: AnalyzeMasonryArchNonlinearOptions,
): MasonryArchNonlinearResult;
export function analyzeMasonryArchCollapse(
  modelInput: MasonryArchModelLike,
  options: AnalyzeMasonryArchCollapseOptions,
): MasonryArchCollapseResult;
export function analyzeMasonryArchCollapse(
  modelInput: MasonryArchModelLike,
  options: AnalyzeMasonryArchCollapseOptions | AnalyzeMasonryArchNonlinearOptions,
): MasonryArchCollapseResult | MasonryArchNonlinearResult {
  if (options.geometricNonlinearity === true) {
    return analyzeMasonryArchNonlinear(modelInput, options);
  }
  const equilibriumTolerance = finitePositive(
    options.equilibriumTolerance ?? 1e-9,
    "Masonry arch collapse equilibriumTolerance",
  );
  const hingeTolerance = finitePositive(
    options.hingeTolerance ?? 1e-6,
    "Masonry arch collapse hingeTolerance",
  );
  const activeConstraintTolerance = finitePositive(
    options.activeConstraintTolerance ?? 1e-7,
    "Masonry arch collapse activeConstraintTolerance",
  );
  const simplexTolerance = finitePositive(
    options.simplexTolerance ?? 1e-11,
    "Masonry arch collapse simplexTolerance",
  );
  const maxSimplexIterations = positiveInteger(
    options.maxSimplexIterations ?? 20_000,
    "Masonry arch collapse maxSimplexIterations",
  );
  const nonAssociatedTolerance = finitePositive(
    options.nonAssociatedTolerance ?? 1e-6,
    "Masonry arch collapse nonAssociatedTolerance",
  );
  const maxNonAssociatedIterations = positiveInteger(
    options.maxNonAssociatedIterations ?? 50,
    "Masonry arch collapse maxNonAssociatedIterations",
  );
  if (hingeTolerance >= 1) throw new Error("Masonry arch hingeTolerance must be smaller than one.");

  const model = asMasonryArchModel(modelInput);
  const scalableCases = selectedScalableCases(model, options.scalableLoadCaseIds);
  const baseLoads = resolveMasonryArchLoads(model, {
    ...(options.loadCombination === undefined ? {} : { loadCombination: options.loadCombination }),
  });
  const partitions = loadFactorPartitions(baseLoads.loadFactorsByCaseId, scalableCases);
  const fixedLoads = resolveMasonryArchLoads(model, { loadFactorsByCaseId: partitions.fixed });
  const scalableLoads = resolveMasonryArchLoads(model, {
    loadFactorsByCaseId: partitions.scalable,
  });
  const resolvedReinforcements = resolveArchReinforcements(model);
  const fixedReinforcementFailureMode: MasonryArchFailureMode | null =
    resolvedReinforcements.hasReinforcementFailure
      ? "reinforcement-failure"
      : resolvedReinforcements.hasReinforcementYield
        ? "reinforcement-yield"
        : resolvedReinforcements.hasAnchorFailure
          ? "anchor-capacity"
          : resolvedReinforcements.hasInvalidContact
            ? "instability"
            : null;
  const fixedBlockWrenches = combineMasonryArchBlockWrenches(
    model.geometry,
    fixedLoads.blockWrenches,
    resolvedReinforcements.blockWrenches,
  );
  const interfaceLaws = resolveMasonryArchInterfaceLaws(model);
  const baseInterfaceLaws = resolveBaseMasonryArchInterfaceLaws(model);
  const solved = solveCollapseWithInterfaceFlow(
    model,
    interfaceLaws,
    fixedBlockWrenches,
    scalableLoads.blockWrenches,
    {
      feasibilityTolerance: equilibriumTolerance,
      simplexTolerance,
      maxSimplexIterations,
      activeConstraintTolerance,
      nonAssociatedTolerance,
      maxNonAssociatedIterations,
    },
  );
  const collapse = solved.collapse;
  const fixedEquilibrium =
    fixedReinforcementFailureMode === null
      ? null
      : solveRigidBlockChainEquilibrium2D(
          {
            blocks: model.geometry.voussoirs,
            interfaces: model.geometry.interfaces,
            wrenches: fixedBlockWrenches,
            interfaceLaws,
          },
          { feasibilityTolerance: equilibriumTolerance },
        );
  const lambda = fixedReinforcementFailureMode === null ? collapse.lambdaCritical : 0;
  const governingInterfaceResultants = fixedEquilibrium?.interfaces ?? collapse.interfaces;
  const governingLeftReaction = fixedEquilibrium?.leftReaction ?? collapse.leftReaction;
  const governingRightReaction = fixedEquilibrium?.rightReaction ?? collapse.rightReaction;
  const governingResidual = fixedEquilibrium?.residual ?? collapse.residual;
  const atCollapseFactors = effectiveFactors(
    baseLoads.loadFactorsByCaseId,
    partitions.roles,
    lambda,
  );
  const totalLoads =
    lambda === null
      ? null
      : resolveMasonryArchLoads(model, {
          loadFactorsByCaseId: Object.fromEntries(
            Object.entries(atCollapseFactors).map(([id, factor]) => [id, factor ?? 0]),
          ),
        });
  const totalBlockWrenches =
    totalLoads === null
      ? []
      : combineMasonryArchBlockWrenches(
          model.geometry,
          totalLoads.blockWrenches,
          resolvedReinforcements.blockWrenches,
        );
  const compressionTolerance = equilibriumTolerance * collapse.scales.force;
  const normalForcesByInterface = new Map(
    governingInterfaceResultants.map((item) => [item.interfaceId, item.normalForce]),
  );
  const governingActiveConstraints =
    fixedReinforcementFailureMode === null ? collapse.activeConstraints : [];
  const hinges = collapseHinges(
    model,
    governingActiveConstraints,
    normalForcesByInterface,
    compressionTolerance,
  );
  const slidingReleases = governingActiveConstraints.flatMap((item) =>
    item.kind === "sliding-positive" || item.kind === "sliding-negative"
      ? [
          {
            interfaceId: item.interfaceId,
            interfaceIndex: item.interfaceIndex,
            direction:
              item.kind === "sliding-positive" ? ("positive" as const) : ("negative" as const),
          },
        ]
      : [],
  );
  const uniqueSlidingReleases = [
    ...new Map(slidingReleases.map((item) => [item.interfaceId, item])).values(),
  ];
  const zeroDilationNonAssociated = uniqueSlidingReleases.every((release) => {
    const flowRule = interfaceLaws[release.interfaceIndex]?.friction?.flowRule;
    return flowRule?.type === "non-associated" && Math.abs(flowRule.dilationAngle) <= 1e-12;
  });
  const hingeMechanism: RigidBlockKinematicMechanism2D =
    fixedReinforcementFailureMode === null
      ? extractRigidBlockMechanism2D({
          blocks: model.geometry.voussoirs,
          interfaces: model.geometry.interfaces,
          hinges: hinges.map((hinge) => ({
            interfaceId: hinge.interfaceId,
            interfaceIndex: hinge.index,
            side: hinge.side,
            point: hinge.point,
          })),
        })
      : {
          verified: false,
          degreesOfFreedom: 0,
          rank: 0,
          maximumConstraintResidual: 0,
          motions: [],
        };
  const nonAssociatedMechanism =
    uniqueSlidingReleases.length > 0 && zeroDilationNonAssociated
      ? extractNonAssociatedMechanism2D({
          blocks: model.geometry.voussoirs,
          interfaces: model.geometry.interfaces,
          hinges: hinges.map((hinge) => ({
            interfaceId: hinge.interfaceId,
            interfaceIndex: hinge.index,
            side: hinge.side,
            point: hinge.point,
          })),
          slidingInterfaces: uniqueSlidingReleases,
        })
      : null;
  const mechanism = nonAssociatedMechanism ?? hingeMechanism;
  let motions = mechanism.motions;
  let fixedWork: number | null = null;
  let scalableWork: number | null = null;
  let totalWork: number | null = null;
  let internalDissipation: number | null = null;
  let normalizedWorkResidual: number | null = null;
  if (lambda !== null && mechanism.verified && motions.length > 0) {
    scalableWork = virtualWork(scalableLoads.blockWrenches, motions);
    if (nonAssociatedMechanism === null && scalableWork < 0) {
      motions = scaledMotions(motions, -1);
      scalableWork = -scalableWork;
    }
    fixedWork = virtualWork(fixedBlockWrenches, motions);
    totalWork = fixedWork + lambda * scalableWork;
    internalDissipation =
      nonAssociatedMechanism === null
        ? 0
        : nonAssociatedMechanism.slidingRates.reduce((total, rate) => {
            const shearForce =
              collapse.interfaces.find((item) => item.interfaceId === rate.interfaceId)
                ?.shearForce ?? 0;
            return total + Math.abs(shearForce * rate.tangentialRate);
          }, 0);
    normalizedWorkResidual =
      Math.abs(totalWork - internalDissipation) /
      Math.max(
        Number.EPSILON,
        Math.abs(fixedWork) + Math.abs(lambda * scalableWork) + internalDissipation,
      );
  }
  const workVerified =
    normalizedWorkResidual !== null && normalizedWorkResidual <= 100 * equilibriumTolerance;
  const openingInterfaces = governingActiveConstraints
    .filter((item) => item.kind === "compression")
    .map((item) => item.interfaceId);
  const slidingInterfaces = uniqueSlidingReleases.map((item) => item.interfaceId);
  const crushingInterfaces = [
    ...new Set(
      governingActiveConstraints
        .filter((item) => item.kind === "crushing-intrados" || item.kind === "crushing-extrados")
        .map((item) => item.interfaceId),
    ),
  ];
  const bondedRecovery = recoverBondedLayerStaticState(
    model,
    baseInterfaceLaws,
    governingInterfaceResultants,
    hingeTolerance,
  );
  const bondedLayerAtCapacity = bondedRecovery.bondedLayerState.some((layer) =>
    layer.interfaces.some((item) => item.state === "at-capacity"),
  );
  let failureMode: MasonryArchFailureMode;
  if (fixedReinforcementFailureMode !== null) failureMode = fixedReinforcementFailureMode;
  else if (collapse.status === "fixed-load-infeasible") failureMode = "fixed-load-infeasible";
  else if (collapse.status === "unbounded") failureMode = "no-collapse-within-model";
  else if (collapse.status !== "optimal") failureMode = "undetermined";
  else if (openingInterfaces.length > 0) failureMode = "instability";
  else if (
    bondedLayerAtCapacity &&
    (slidingInterfaces.length > 0 || crushingInterfaces.length > 0 || hinges.length > 0)
  ) {
    failureMode = "mixed";
  } else if (bondedLayerAtCapacity) failureMode = "reinforcement-failure";
  else if (slidingInterfaces.length > 0 && (crushingInterfaces.length > 0 || hinges.length > 0)) {
    failureMode = "mixed";
  } else if (slidingInterfaces.length > 0) failureMode = "sliding";
  else if (crushingInterfaces.length > 0 && hinges.length > 0) failureMode = "mixed";
  else if (crushingInterfaces.length > 0) failureMode = "masonry-crushing";
  else if (mechanism.verified && workVerified) failureMode = "mechanism";
  else failureMode = "undetermined";

  const interfaces: MasonryArchInterfaceStateResult[] = bondedRecovery.masonryResultants.map(
    (item) => {
      const recovered = recoverMasonryArchInterfaceState(
        item,
        model.geometry.interfaces[item.index]!,
        baseInterfaceLaws[item.index]!,
        item.index === 0
          ? model.supports.left.interface.approachingHingeRatio
          : item.index === model.geometry.interfaces.length - 1
            ? model.supports.right.interface.approachingHingeRatio
            : model.interfaces.approachingHingeRatio,
        hingeTolerance,
        governingInterfaceResultants[item.index]!.normalForce,
      );
      const sliding = slidingInterfaces.includes(item.interfaceId);
      const crushing = crushingInterfaces.includes(item.interfaceId);
      if (!crushing) return recovered;
      return {
        ...recovered,
        state: sliding ? "sliding-and-crushing" : "crushing",
        hingeSide: null,
      };
    },
  );
  const maximumEquilibriumResidual = Math.max(
    Math.abs(governingResidual.normalizedForceX),
    Math.abs(governingResidual.normalizedForceY),
    Math.abs(governingResidual.normalizedMoment),
  );
  const equilibriumVerified = maximumEquilibriumResidual <= equilibriumTolerance;
  const kinematicFailureVerified =
    fixedReinforcementFailureMode === null &&
    mechanism.verified &&
    workVerified &&
    (!solved.convergence.required || solved.convergence.converged) &&
    crushingInterfaces.length === 0 &&
    openingInterfaces.length === 0 &&
    !bondedLayerAtCapacity;
  const successful =
    collapse.status === "optimal" &&
    lambda !== null &&
    kinematicFailureVerified &&
    equilibriumVerified;
  const criticalInterfaces = [
    ...new Set(governingActiveConstraints.map((item) => item.interfaceId)),
  ];
  const loadFactorCheck = {
    criterion: "lambda-critical-greater-than-or-equal-to-one" as const,
    demand: 1 as const,
    capacity: lambda,
    utilizationRatio: lambda !== null && lambda > 0 ? 1 / lambda : null,
    status:
      lambda === null || lambda <= 0
        ? ("not-verifiable" as const)
        : lambda >= 1 - equilibriumTolerance
          ? ("pass" as const)
          : ("fail" as const),
  };
  const warnings: string[] = [...resolvedReinforcements.warnings];
  if (collapse.reason !== null) warnings.push(collapse.reason);
  if (
    collapse.status === "optimal" &&
    solved.convergence.required &&
    !solved.convergence.converged
  ) {
    warnings.push(
      `Non-associated sequential linear programming did not converge in ${solved.convergence.iterations} iteration(s).`,
    );
  }
  if (!equilibriumVerified) {
    warnings.push(
      `Global equilibrium residual ${maximumEquilibriumResidual} exceeds tolerance ${equilibriumTolerance}.`,
    );
  }
  if (collapse.status === "optimal" && !mechanism.verified) {
    warnings.push("The active interface set does not define a verified rigid-block mechanism.");
  }
  if (mechanism.verified && !workVerified) {
    warnings.push(
      "The extracted mechanism does not satisfy virtual-work equilibrium within tolerance.",
    );
  }
  if (openingInterfaces.length > 0) {
    warnings.push(
      "One or more interfaces reach zero compression; hinge-only kinematics is insufficient.",
    );
  }
  if (slidingInterfaces.length > 0 && !kinematicFailureVerified) {
    warnings.push(
      "The reported multiplier is a maximum static-admissibility value until the non-associated sliding kinematics are verified.",
    );
  }
  if (crushingInterfaces.length > 0) {
    warnings.push(
      "Finite-compression activation is identified from the safe faceted resultant domain; a crushing velocity mechanism is not recovered.",
    );
  }
  if (bondedLayerAtCapacity) {
    warnings.push(
      "One or more bonded layers reach their assigned tensile or debonding capacity; no rupture kinematics is inferred.",
    );
  }

  const limitMeaning = kinematicFailureVerified
    ? ("kinematically-verified-collapse" as const)
    : fixedReinforcementFailureMode !== null
      ? ("not-determined" as const)
      : collapse.status === "optimal"
        ? ("maximum-static-admissibility" as const)
        : ("not-determined" as const);

  const outputs: MasonryArchCollapseOutputs = {
    modelId: model.id,
    geometry: model.geometry,
    lambdaCritical: lambda,
    limitMeaning,
    failureMode,
    criticalInterfaces,
    hinges,
    slidingInterfaces,
    crushingInterfaces,
    reinforcementState: resolvedReinforcements.reinforcementState,
    anchorForces: resolvedReinforcements.anchorForces,
    contactForces: resolvedReinforcements.contactForces,
    reinforcementBoundaryForces: resolvedReinforcements.boundaryForces,
    bondedLayerState: bondedRecovery.bondedLayerState,
    loadCases: {
      baseCombinationFactorsByCaseId: baseLoads.loadFactorsByCaseId,
      effectiveFactorsAtCollapseByCaseId: atCollapseFactors,
      roleByCaseId: partitions.roles,
    },
    loadFactorCheck,
    loads: {
      fixed: filterAppliedLoads(fixedLoads.appliedLoads, partitions.roles, "fixed"),
      scalableAtUnitLambda: filterAppliedLoads(
        scalableLoads.appliedLoads,
        partitions.roles,
        "scalable",
      ),
      totalAtCollapse: totalLoads?.appliedLoads ?? [],
      fixedBlockWrenches,
      scalableBlockWrenchesAtUnitLambda: scalableLoads.blockWrenches,
      totalBlockWrenchesAtCollapse: totalBlockWrenches,
    },
    reactions: {
      left: governingLeftReaction,
      right: governingRightReaction,
    },
    interfaces,
    thrustLine: interfaces.map((item) => item.thrustPoint),
    mechanism: {
      kinematicallyVerified: kinematicFailureVerified,
      degreesOfFreedom: mechanism.degreesOfFreedom,
      rank: mechanism.rank,
      maximumConstraintResidual: mechanism.maximumConstraintResidual,
      blockMotions: motions,
      nonAssociatedFlow:
        nonAssociatedMechanism === null
          ? null
          : {
              verified: nonAssociatedMechanism.flowRuleVerified,
              maximumViolation: nonAssociatedMechanism.maximumFlowViolation,
              slidingRates: nonAssociatedMechanism.slidingRates,
            },
      virtualWork: {
        fixed: fixedWork,
        scalableAtUnitLambda: scalableWork,
        totalAtCollapse: totalWork,
        internalDissipation,
        normalizedResidual: normalizedWorkResidual,
      },
    },
    equilibrium: {
      forceResidual: { x: governingResidual.forceX, y: governingResidual.forceY },
      momentResidual: governingResidual.moment,
      normalizedResidual: {
        forceX: governingResidual.normalizedForceX,
        forceY: governingResidual.normalizedForceY,
        moment: governingResidual.normalizedMoment,
      },
      tolerance: equilibriumTolerance,
    },
    convergenceInfo: {
      converged:
        collapse.status === "optimal" &&
        (!solved.convergence.required || solved.convergence.converged),
      optimizer: solved.convergence.required
        ? "sequential-linear-programming"
        : "fixed-dimension-simplex",
      status:
        collapse.status === "optimal" &&
        solved.convergence.required &&
        !solved.convergence.converged
          ? "non-associated-iteration-limit"
          : collapse.status,
      iterations: solved.convergence.totalSimplexIterations,
      nonAssociated: {
        required: solved.convergence.required,
        converged: solved.convergence.converged,
        iterations: solved.convergence.iterations,
        relativeLambdaChange: solved.convergence.relativeLambdaChange,
        frictionReductionFactor: solved.convergence.frictionReductionFactor,
      },
    },
  };

  return new CalculationResult<MasonryArchCollapseOutputs>({
    applicationId: "masonry-arch-collapse",
    status: successful
      ? RESULT_STATUS.OK
      : collapse.status === "optimal" &&
          (slidingInterfaces.length > 0 || crushingInterfaces.length > 0)
        ? RESULT_STATUS.NOT_VERIFIED
        : RESULT_STATUS.FAILED,
    summary: successful
      ? "A finite collapse multiplier and compatible rigid-block mechanism were found."
      : fixedReinforcementFailureMode !== null
        ? "An assigned reinforcement, contact, or anchor limit is already exceeded before scalable loading."
        : "No fully verified finite rigid-block collapse mechanism was found.",
    outputs,
    warnings,
    assumptions: [
      "Two-dimensional in-plane rigid-voussoir limit analysis.",
      "No-tension masonry with the explicitly selected interface friction and compression domains.",
      "Rigid springing boundaries with explicit unilateral contact interfaces.",
      "Small-displacement equilibrium and kinematics in the reference geometry.",
      "Combination factors are applied before lambda; lambda multiplies only selected load cases.",
      "Active positive-compression eccentricity bounds are treated as rigid-block hinges.",
      "Non-associated Coulomb flow has zero dilation by default and is distinct from the static friction cone.",
      "Finite compression uses a safe faceted approximation of the rigid-plastic rectangular stress-block domain.",
      "Assigned post-tensioning is a fixed action in the reference geometry and is not multiplied by lambda.",
      "Intrados deviators and terminal connectors are rigid; convex extrados interaction is unilateral contact.",
      "Bonded layers are zero-thickness tension-only membranes; the reported thrust line contains masonry compression only.",
      "Static Coulomb capacity with bonded layers conservatively uses the total section normal resultant in the eliminated domain.",
    ],
    metadata: {
      schemaVersion: MASONRY_ARCH_COLLAPSE_RESULT_SCHEMA_VERSION,
      modelSchemaVersion: model.schemaVersion,
      sourceUnits: model.sourceUnits,
      units: model.units,
      axes: { x: "right", y: "up", moment: "counter-clockwise" },
      interfaceOrdering: "left-springing-to-right-springing",
      solutionMeaning: limitMeaning,
      geometricNonlinearity: false,
      loadCombinationId: options.loadCombination?.id ?? null,
      loadCombinationType: options.loadCombination?.combinationType ?? null,
      normativeConformityClaimed: false,
    },
  });
}

export const calculateCollapseMultiplier = analyzeMasonryArchCollapse;
