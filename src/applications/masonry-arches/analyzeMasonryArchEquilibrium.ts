import { CalculationResult } from "../../core/results/CalculationResult.js";
import { RESULT_STATUS } from "../../core/results/resultStatus.js";
import { solveRigidBlockChainEquilibrium2D } from "../../domain/masonry/rigid-blocks/solveHeymanChainEquilibrium2D.js";
import type {
  RigidBlockInterfaceLimitLaw2D,
  RigidBlockInterfaceResultant2D,
} from "../../domain/masonry/rigid-blocks/types.js";
import { resolveMasonryArchInterfaceLaws } from "./interfaceLaws.js";
import { resolveBaseMasonryArchInterfaceLaws } from "./interfaceLaws.js";
import { recoverBondedLayerStaticState } from "./bondedLayers.js";
import {
  createMasonryArchAnalysisDescriptor,
  createMasonryArchAssignedStateLambdaDefinition,
} from "./analysisSemantics.js";
import { asMasonryArchModel, type MasonryArchModel } from "./MasonryArchModel.js";
import { resolveMasonryArchLoads } from "./resolveMasonryArchLoads.js";
import {
  combineMasonryArchBlockWrenches,
  resolveArchReinforcements,
} from "./resolveArchReinforcements.js";
import {
  MASONRY_ARCH_EQUILIBRIUM_RESULT_SCHEMA_VERSION,
  type AnalyzeMasonryArchEquilibriumOptions,
  type MasonryArchInterfaceStateResult,
  type MasonryArchInterfaceGeometry,
  type MasonryArchModelInput,
  type MasonryArchEquilibriumOutputs,
  type MasonryArchEquilibriumResult,
  type NormalizedMasonryArchModel,
} from "./types.js";

function finitePositive(value: number, label: string): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be finite and positive.`);
  }
  return value;
}

export function classifyInterface(
  normalizedEccentricity: number | null,
  approachingRatio: number,
  hingeTolerance: number,
  frictionUtilization: number | null = null,
  compressionUtilization: number | null = null,
): Pick<MasonryArchInterfaceStateResult, "state" | "hingeSide"> {
  if (normalizedEccentricity === null) {
    return { state: "no-compression", hingeSide: null };
  }
  const absolute = Math.abs(normalizedEccentricity);
  const side = normalizedEccentricity >= 0 ? "extrados" : "intrados";
  if (absolute > 1 + hingeTolerance) {
    return { state: "outside-admissible-thickness", hingeSide: null };
  }
  const sliding = frictionUtilization !== null && frictionUtilization >= 1 - hingeTolerance;
  const crushing = compressionUtilization !== null && compressionUtilization >= 1 - hingeTolerance;
  if (sliding && crushing) return { state: "sliding-and-crushing", hingeSide: null };
  if (sliding) return { state: "sliding", hingeSide: null };
  if (crushing) return { state: "crushing", hingeSide: null };
  if (absolute >= 1 - hingeTolerance) {
    return { state: "hinge", hingeSide: side };
  }
  if (absolute >= approachingRatio) {
    return {
      state: side === "extrados" ? "approaching-extrados-hinge" : "approaching-intrados-hinge",
      hingeSide: null,
    };
  }
  return { state: "compressed", hingeSide: null };
}

export function recoverMasonryArchInterfaceState(
  item: RigidBlockInterfaceResultant2D,
  geometry: MasonryArchInterfaceGeometry,
  law: RigidBlockInterfaceLimitLaw2D,
  approachingRatio: number,
  limitTolerance: number,
  frictionNormalForce: number = item.normalForce,
): MasonryArchInterfaceStateResult {
  const normalForce = item.normalForce;
  const frictionCapacity =
    law.friction === null
      ? null
      : law.friction.cohesion * geometry.length * geometry.outOfPlaneWidth +
        law.friction.frictionCoefficient * Math.max(0, frictionNormalForce);
  const frictionUtilization =
    frictionCapacity === null || frictionCapacity <= 0
      ? null
      : Math.abs(item.shearForce) / frictionCapacity;
  const compressedLength =
    law.compressiveStrength === null || item.eccentricity === null
      ? null
      : Math.max(0, geometry.length - 2 * Math.abs(item.eccentricity));
  const maxCompression =
    compressedLength === null ||
    compressedLength <= limitTolerance * geometry.length ||
    normalForce <= 0
      ? null
      : normalForce / (geometry.outOfPlaneWidth * compressedLength);
  const compressionUtilization =
    maxCompression === null || law.compressiveStrength === null
      ? null
      : maxCompression / law.compressiveStrength;
  const classification = classifyInterface(
    item.normalizedEccentricity,
    approachingRatio,
    limitTolerance,
    frictionUtilization,
    compressionUtilization,
  );
  const status = (utilization: number | null): "pass" | "fail" | "not-verifiable" =>
    utilization === null ? "not-verifiable" : utilization <= 1 + limitTolerance ? "pass" : "fail";
  return {
    interfaceId: item.interfaceId,
    index: item.index,
    normalForce,
    shearForce: item.shearForce,
    moment: item.moment,
    eccentricity: item.eccentricity,
    normalizedEccentricity: item.normalizedEccentricity,
    compressedLength,
    maxCompression,
    frictionUtilization,
    compressionUtilization,
    ...classification,
    thrustPoint: item.thrustPoint,
    admissibilityMargins: item.admissibilityMargins,
    checks: {
      friction:
        frictionCapacity === null
          ? null
          : {
              criterion: "coulomb-friction",
              demand: Math.abs(item.shearForce),
              capacity: frictionCapacity,
              utilizationRatio: frictionUtilization,
              status: status(frictionUtilization),
            },
      compression:
        law.compressiveStrength === null
          ? null
          : {
              criterion: "finite-compression-uniform-edge-block",
              demand: maxCompression ?? 0,
              capacity: law.compressiveStrength,
              utilizationRatio: compressionUtilization,
              status: status(compressionUtilization),
            },
    },
  };
}

export function analyzeMasonryArchEquilibrium(
  modelInput: MasonryArchModel | NormalizedMasonryArchModel | MasonryArchModelInput,
  options: AnalyzeMasonryArchEquilibriumOptions = {},
): MasonryArchEquilibriumResult {
  const equilibriumTolerance = finitePositive(
    options.equilibriumTolerance ?? 1e-9,
    "Masonry arch equilibriumTolerance",
  );
  const hingeTolerance = finitePositive(
    options.hingeTolerance ?? 1e-6,
    "Masonry arch hingeTolerance",
  );
  if (hingeTolerance >= 1) {
    throw new Error("Masonry arch hingeTolerance must be smaller than one.");
  }

  const model = asMasonryArchModel(modelInput);
  const resolvedLoads = resolveMasonryArchLoads(model, {
    ...(options.loadCombination === undefined ? {} : { loadCombination: options.loadCombination }),
    ...(options.loadFactorsByCaseId === undefined
      ? {}
      : { loadFactorsByCaseId: options.loadFactorsByCaseId }),
  });
  const resolvedReinforcements = resolveArchReinforcements(model);
  const blockWrenches = combineMasonryArchBlockWrenches(
    model.geometry,
    resolvedLoads.blockWrenches,
    resolvedReinforcements.blockWrenches,
  );
  const interfaceLaws = resolveMasonryArchInterfaceLaws(model);
  const baseInterfaceLaws = resolveBaseMasonryArchInterfaceLaws(model);
  const equilibrium = solveRigidBlockChainEquilibrium2D(
    {
      blocks: model.geometry.voussoirs,
      interfaces: model.geometry.interfaces,
      wrenches: blockWrenches,
      interfaceLaws,
    },
    { feasibilityTolerance: equilibriumTolerance },
  );
  const bondedRecovery = recoverBondedLayerStaticState(
    model,
    baseInterfaceLaws,
    equilibrium.interfaces,
    hingeTolerance,
  );
  const interfaces: MasonryArchInterfaceStateResult[] = bondedRecovery.masonryResultants.map(
    (item) =>
      recoverMasonryArchInterfaceState(
        item,
        model.geometry.interfaces[item.index]!,
        baseInterfaceLaws[item.index]!,
        model.geometry.interfaces[item.index]!.index === 0
          ? model.supports.left.interfaceLaw.approachingLimitRatio
          : item.index === model.geometry.interfaces.length - 1
            ? model.supports.right.interfaceLaw.approachingLimitRatio
            : model.interfaceLaw.approachingLimitRatio,
        hingeTolerance,
        equilibrium.interfaces[item.index]!.normalForce,
      ),
  );
  const hinges = interfaces.flatMap((item) =>
    item.state === "hinge" && item.hingeSide !== null
      ? [{ interfaceId: item.interfaceId, side: item.hingeSide }]
      : [],
  );
  const maximumNormalizedResidual = Math.max(
    Math.abs(equilibrium.residual.normalizedForceX),
    Math.abs(equilibrium.residual.normalizedForceY),
    Math.abs(equilibrium.residual.normalizedMoment),
  );
  const residualSatisfied = maximumNormalizedResidual <= equilibriumTolerance;
  const reinforcementChecksSatisfied =
    !resolvedReinforcements.hasAnchorFailure &&
    !resolvedReinforcements.hasReinforcementYield &&
    !resolvedReinforcements.hasReinforcementFailure &&
    !resolvedReinforcements.hasInvalidContact;
  const successful = equilibrium.feasible && residualSatisfied && reinforcementChecksSatisfied;
  const warnings: string[] = [...resolvedReinforcements.warnings];
  if (!equilibrium.feasible && equilibrium.reason !== null) warnings.push(equilibrium.reason);
  if (!residualSatisfied) {
    warnings.push(
      `Global equilibrium residual ${maximumNormalizedResidual} exceeds tolerance ${equilibriumTolerance}.`,
    );
  }
  if (hinges.length > 0) {
    warnings.push(`${hinges.length} interface(s) are at a Heyman eccentricity boundary.`);
  }
  if (interfaces.some((item) => item.state === "no-compression")) {
    warnings.push("One or more interfaces have non-positive compression and no thrust-line point.");
  }
  const slidingCount = interfaces.filter(
    (item) => item.state === "sliding" || item.state === "sliding-and-crushing",
  ).length;
  if (slidingCount > 0) {
    warnings.push(`${slidingCount} interface(s) are at the Coulomb friction boundary.`);
  }
  const crushingCount = interfaces.filter(
    (item) => item.state === "crushing" || item.state === "sliding-and-crushing",
  ).length;
  if (crushingCount > 0) {
    warnings.push(`${crushingCount} interface(s) are at the finite-compression boundary.`);
  }
  const outsideCount = interfaces.filter(
    (item) => item.state === "outside-admissible-thickness",
  ).length;
  if (outsideCount > 0) {
    warnings.push(
      `${outsideCount} interface(s) place the relaxed representative resultant outside the available thickness.`,
    );
  }

  const outputs: MasonryArchEquilibriumOutputs = {
    modelId: model.id,
    analysis: createMasonryArchAnalysisDescriptor(model, {
      analysisObjective: "design-state-check",
      interfaceResponse: "rigid-plastic-resultant-domain",
      kinematics: "reference-geometry",
      numericalStrategy: { type: "representative-static-equilibrium", control: null },
      lambda: createMasonryArchAssignedStateLambdaDefinition(resolvedLoads),
    }),
    geometry: model.geometry,
    loadFactorsByCaseId: resolvedLoads.loadFactorsByCaseId,
    appliedLoads: resolvedLoads.appliedLoads,
    blockWrenches,
    reinforcementState: resolvedReinforcements.reinforcementState,
    anchorForces: resolvedReinforcements.anchorForces,
    contactForces: resolvedReinforcements.contactForces,
    reinforcementBoundaryForces: resolvedReinforcements.boundaryForces,
    bondedLayerState: bondedRecovery.bondedLayerState,
    reactions: {
      left: equilibrium.leftReaction,
      right: equilibrium.rightReaction,
    },
    interfaces,
    thrustLine: interfaces.map((item) => item.thrustPoint),
    hinges,
    equilibrium: {
      feasible: equilibrium.feasible,
      representativeMargin: equilibrium.representativeMargin,
      forceResidual: {
        x: equilibrium.residual.forceX,
        y: equilibrium.residual.forceY,
      },
      momentResidual: equilibrium.residual.moment,
      normalizedResidual: {
        forceX: equilibrium.residual.normalizedForceX,
        forceY: equilibrium.residual.normalizedForceY,
        moment: equilibrium.residual.normalizedMoment,
      },
      tolerance: equilibriumTolerance,
    },
    convergence: {
      converged: equilibrium.simplex.status === "optimal",
      optimizer: "fixed-dimension-simplex",
      status: equilibrium.simplex.status,
      iterations: equilibrium.simplex.iterations,
    },
  };

  return new CalculationResult<MasonryArchEquilibriumOutputs>({
    applicationId: "masonry-arch-equilibrium",
    status: successful ? RESULT_STATUS.OK : RESULT_STATUS.FAILED,
    summary: successful
      ? "A representative statically admissible rigid-block equilibrium was found."
      : "No verified rigid-block equilibrium was found for the assigned load state.",
    outputs,
    warnings,
    assumptions: [
      "Two-dimensional in-plane rigid-voussoir model.",
      "No-tension masonry with the explicitly selected interface friction and compression domains.",
      "Rigid springing boundaries with explicit contact interfaces.",
      "Small-displacement equilibrium in the reference geometry.",
      "The thrust line is the center of a normalized admissible reaction polytope, not an elastic stress solution.",
      "Finite-compression stress recovery uses a uniform edge compression block and is not an elastic stress solution.",
      "The Coulomb flow rule affects collapse kinematics, not static admissibility under assigned loads.",
      "Assigned post-tensioning is a fixed action in the reference geometry; zero initial force remains slack.",
      "Intrados deviators and terminal connectors are rigid; convex extrados interaction is unilateral contact.",
      "Bonded layers are zero-thickness tension-only membranes; the reported thrust line contains masonry compression only.",
      "Static Coulomb capacity with bonded layers conservatively uses the total section normal resultant in the eliminated domain.",
    ],
    metadata: {
      schemaVersion: MASONRY_ARCH_EQUILIBRIUM_RESULT_SCHEMA_VERSION,
      modelSchemaVersion: model.schemaVersion,
      sourceUnits: model.sourceUnits,
      units: model.units,
      axes: { x: "right", y: "up", moment: "counter-clockwise" },
      interfaceOrdering: "left-springing-to-right-springing",
      signs: {
        normalForce: "positive-compression",
        eccentricity: "positive-toward-extrados",
        reinforcementForce: "positive-tension; kept separate from masonry compression",
      },
      solutionMeaning: "representative-statically-admissible",
      analysisObjective: "design-state-check",
      mechanicalModel: "rigid-plastic-resultant-domain",
      numericalMethod: "representative-static-equilibrium",
      control: null,
      lambdaDefinition: outputs.analysis.lambda,
      loadCombinationId: options.loadCombination?.id ?? null,
      loadCombinationType: options.loadCombination?.combinationType ?? null,
      normativeConformityClaimed: false,
    },
  });
}
