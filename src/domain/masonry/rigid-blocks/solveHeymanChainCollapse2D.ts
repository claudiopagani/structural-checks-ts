import { maximizeNonnegativeLinearProgram } from "./nonnegativeSimplex.js";
import {
  buildAffineInterfaceStates,
  buildInterfaceLimitHalfSpaces,
  characteristicLength,
  IDEAL_HEYMAN_INTERFACE_LAW_2D,
  interfaceResultant,
  solveRigidBlockChainEquilibrium2D,
  sumMomentAboutOrigin,
} from "./solveHeymanChainEquilibrium2D.js";
import type {
  RigidBlock2D,
  RigidBlockAppliedWrench2D,
  RigidBlockCollapseOptions,
  RigidBlockCollapse2D,
  RigidBlockEquilibriumResidual2D,
  RigidBlockInterface2D,
  RigidBlockInterfaceLimitLaw2D,
  RigidBlockSupportReaction2D,
  RigidBlockVector2D,
} from "./types.js";
import { cross2d, norm2d, scale2d } from "./vector2d.js";

type ReactionVector = readonly [number, number, number];

function finitePositive(value: number, label: string): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be finite and positive.`);
  }
  return value;
}

function validateChain(
  blocks: readonly RigidBlock2D[],
  interfaces: readonly RigidBlockInterface2D[],
  fixedWrenches: readonly RigidBlockAppliedWrench2D[],
  scalableWrenches: readonly RigidBlockAppliedWrench2D[],
): void {
  if (blocks.length === 0) {
    throw new Error("Rigid-block collapse analysis requires at least one block.");
  }
  if (interfaces.length !== blocks.length + 1) {
    throw new Error(
      "An ordered rigid-block chain requires exactly one more interface than blocks.",
    );
  }
  if (fixedWrenches.length !== blocks.length || scalableWrenches.length !== blocks.length) {
    throw new Error("Collapse analysis requires fixed and scalable wrenches for every block.");
  }
  for (let index = 0; index < blocks.length; index += 1) {
    const blockId = blocks[index]!.id;
    if (fixedWrenches[index]!.blockId !== blockId) {
      throw new Error(`Fixed wrench ${index} targets the wrong block.`);
    }
    if (scalableWrenches[index]!.blockId !== blockId) {
      throw new Error(`Scalable wrench ${index} targets the wrong block.`);
    }
  }
}

function wrenchMagnitude(
  wrenches: readonly RigidBlockAppliedWrench2D[],
  lengthScale: number,
): number {
  return wrenches.reduce(
    (sum, wrench) =>
      sum + norm2d(wrench.force) + Math.abs(sumMomentAboutOrigin(wrench)) / lengthScale,
    0,
  );
}

function addScaledWrenches(
  fixedWrenches: readonly RigidBlockAppliedWrench2D[],
  scalableWrenches: readonly RigidBlockAppliedWrench2D[],
  lambda: number,
): RigidBlockAppliedWrench2D[] {
  return fixedWrenches.map((fixed, index) => {
    const scalable = scalableWrenches[index]!;
    return {
      blockId: fixed.blockId,
      force: {
        x: fixed.force.x + lambda * scalable.force.x,
        y: fixed.force.y + lambda * scalable.force.y,
      },
      moment: fixed.moment + lambda * scalable.moment,
      applicationPoint: fixed.applicationPoint,
    };
  });
}

function reactionState(
  interfaces: readonly RigidBlockInterface2D[],
  wrenches: readonly RigidBlockAppliedWrench2D[],
  reaction: ReactionVector,
  forceScale: number,
  momentScale: number,
): {
  readonly leftReaction: RigidBlockSupportReaction2D;
  readonly rightReaction: RigidBlockSupportReaction2D;
  readonly residual: RigidBlockEquilibriumResidual2D;
} {
  const leftPoint = interfaces[0]!.midpoint;
  const rightPoint = interfaces.at(-1)!.midpoint;
  const totalForce = wrenches.reduce<RigidBlockVector2D>(
    (sum, wrench) => ({ x: sum.x + wrench.force.x, y: sum.y + wrench.force.y }),
    { x: 0, y: 0 },
  );
  const totalMomentOrigin = wrenches.reduce((sum, wrench) => sum + sumMomentAboutOrigin(wrench), 0);
  const leftReaction = {
    force: { x: reaction[0], y: reaction[1] },
    moment: reaction[2],
    applicationPoint: leftPoint,
  };
  const sectionForceAtRight = {
    x: reaction[0] + totalForce.x,
    y: reaction[1] + totalForce.y,
  };
  const sectionMomentAtRight =
    reaction[2] +
    cross2d({ x: leftPoint.x - rightPoint.x, y: leftPoint.y - rightPoint.y }, leftReaction.force) +
    totalMomentOrigin -
    cross2d(rightPoint, totalForce);
  const rightReaction = {
    force: scale2d(sectionForceAtRight, -1),
    moment: -sectionMomentAtRight,
    applicationPoint: rightPoint,
  };
  const forceResidual = {
    x: leftReaction.force.x + rightReaction.force.x + totalForce.x,
    y: leftReaction.force.y + rightReaction.force.y + totalForce.y,
  };
  const momentResidual =
    cross2d(leftPoint, leftReaction.force) +
    leftReaction.moment +
    totalMomentOrigin +
    cross2d(rightPoint, rightReaction.force) +
    rightReaction.moment;
  return {
    leftReaction,
    rightReaction,
    residual: {
      forceX: forceResidual.x,
      forceY: forceResidual.y,
      moment: momentResidual,
      normalizedForceX: forceResidual.x / forceScale,
      normalizedForceY: forceResidual.y / forceScale,
      normalizedMoment: momentResidual / momentScale,
    },
  };
}

/**
 * Maximizes the multiplier of a selected scalable wrench field under assigned interface laws.
 * Combination and partial factors must already be included in the two wrench fields.
 */
export function solveRigidBlockChainCollapse2D(
  {
    blocks,
    interfaces,
    fixedWrenches,
    scalableWrenches,
    interfaceLaws,
  }: {
    readonly blocks: readonly RigidBlock2D[];
    readonly interfaces: readonly RigidBlockInterface2D[];
    readonly fixedWrenches: readonly RigidBlockAppliedWrench2D[];
    readonly scalableWrenches: readonly RigidBlockAppliedWrench2D[];
    readonly interfaceLaws?: readonly RigidBlockInterfaceLimitLaw2D[];
  },
  {
    feasibilityTolerance = 1e-9,
    simplexTolerance = 1e-11,
    maxSimplexIterations = 20_000,
    activeConstraintTolerance = 1e-7,
  }: RigidBlockCollapseOptions = {},
): RigidBlockCollapse2D {
  validateChain(blocks, interfaces, fixedWrenches, scalableWrenches);
  finitePositive(feasibilityTolerance, "Collapse feasibility tolerance");
  finitePositive(simplexTolerance, "Collapse simplex tolerance");
  finitePositive(activeConstraintTolerance, "Collapse active-constraint tolerance");
  const resolvedLaws = interfaceLaws ?? interfaces.map(() => IDEAL_HEYMAN_INTERFACE_LAW_2D);
  if (resolvedLaws.length !== interfaces.length) {
    throw new Error("Every rigid-block interface requires exactly one limit law.");
  }

  const lengthScale = characteristicLength(interfaces);
  const fixedMagnitude = wrenchMagnitude(fixedWrenches, lengthScale);
  const scalableMagnitude = wrenchMagnitude(scalableWrenches, lengthScale);
  if (scalableMagnitude <= feasibilityTolerance) {
    throw new Error("Selected scalable load cases produce no nonzero combined wrench field.");
  }
  const forceScale = Math.max(1, fixedMagnitude, scalableMagnitude);
  const momentScale = forceScale * lengthScale;
  const zeroReaction: ReactionVector = [0, 0, 0];
  const fixedEquilibrium =
    fixedMagnitude <= feasibilityTolerance
      ? null
      : solveRigidBlockChainEquilibrium2D(
          { blocks, interfaces, wrenches: fixedWrenches, interfaceLaws: resolvedLaws },
          { feasibilityTolerance, simplexTolerance, maxSimplexIterations },
        );
  const initialReaction: ReactionVector =
    fixedEquilibrium === null
      ? zeroReaction
      : [
          fixedEquilibrium.leftReaction.force.x,
          fixedEquilibrium.leftReaction.force.y,
          fixedEquilibrium.leftReaction.moment,
        ];
  const fixedStates = buildAffineInterfaceStates(blocks, interfaces, fixedWrenches);
  const scalableStates = buildAffineInterfaceStates(blocks, interfaces, scalableWrenches);
  const fixedHalfSpaces = buildInterfaceLimitHalfSpaces(fixedStates, resolvedLaws);
  const scalableHalfSpaces = buildInterfaceLimitHalfSpaces(scalableStates, resolvedLaws, false);

  if (fixedEquilibrium !== null && !fixedEquilibrium.feasible) {
    return {
      status: "fixed-load-infeasible",
      reason: "The fixed factored load state is not interface-admissible at lambda = 0.",
      lambdaLimit: 0,
      scales: { force: forceScale, moment: momentScale },
      leftReaction: fixedEquilibrium.leftReaction,
      rightReaction: fixedEquilibrium.rightReaction,
      interfaces: fixedEquilibrium.interfaces,
      activeConstraints: [],
      residual: fixedEquilibrium.residual,
      simplex: fixedEquilibrium.simplex,
    };
  }

  const rowScales: number[] = [];
  const matrix = fixedHalfSpaces.map((fixed, index) => {
    const scalable = scalableHalfSpaces[index]!;
    const scaledReactionCoefficients = [
      fixed.coefficients[0] * forceScale,
      fixed.coefficients[1] * forceScale,
      fixed.coefficients[2] * momentScale,
    ] as const;
    const rowScale = Math.max(
      Math.hypot(...scaledReactionCoefficients),
      Math.abs(scalable.rightHandSide),
      Number.EPSILON,
    );
    rowScales.push(rowScale);
    return [
      scaledReactionCoefficients[0] / rowScale,
      scaledReactionCoefficients[1] / rowScale,
      scaledReactionCoefficients[2] / rowScale,
      -scaledReactionCoefficients[0] / rowScale,
      -scaledReactionCoefficients[1] / rowScale,
      -scaledReactionCoefficients[2] / rowScale,
      -scalable.rightHandSide / rowScale,
    ];
  });
  const rightHandSide = fixedHalfSpaces.map((fixed, index) => {
    const reactionTerm =
      fixed.coefficients[0] * initialReaction[0] +
      fixed.coefficients[1] * initialReaction[1] +
      fixed.coefficients[2] * initialReaction[2];
    const normalizedSlack = (fixed.rightHandSide - reactionTerm) / rowScales[index]!;
    if (normalizedSlack < -feasibilityTolerance) {
      throw new Error("Initial fixed-load reaction violates a Heyman constraint beyond tolerance.");
    }
    return Math.max(0, normalizedSlack);
  });
  const simplex = maximizeNonnegativeLinearProgram(
    {
      matrix,
      rightHandSide,
      objective: [0, 0, 0, 0, 0, 0, 1],
    },
    { tolerance: simplexTolerance, maxIterations: maxSimplexIterations },
  );
  const lambda = simplex.status === "optimal" ? Math.max(0, simplex.solution[6] ?? 0) : null;
  const deltaReaction: ReactionVector = [
    ((simplex.solution[0] ?? 0) - (simplex.solution[3] ?? 0)) * forceScale,
    ((simplex.solution[1] ?? 0) - (simplex.solution[4] ?? 0)) * forceScale,
    ((simplex.solution[2] ?? 0) - (simplex.solution[5] ?? 0)) * momentScale,
  ];
  const reaction: ReactionVector = [
    initialReaction[0] + deltaReaction[0],
    initialReaction[1] + deltaReaction[1],
    initialReaction[2] + deltaReaction[2],
  ];
  const evaluationLambda = lambda ?? 0;
  const totalWrenches = addScaledWrenches(fixedWrenches, scalableWrenches, evaluationLambda);
  const totalStates = buildAffineInterfaceStates(blocks, interfaces, totalWrenches);
  const interfaceResults = totalStates.map((state) =>
    interfaceResultant(
      state,
      reaction,
      feasibilityTolerance * forceScale,
      resolvedLaws[state.interface.index],
    ),
  );
  const reactions = reactionState(interfaces, totalWrenches, reaction, forceScale, momentScale);
  const activeConstraints =
    lambda === null
      ? []
      : fixedHalfSpaces.flatMap((fixed, index) => {
          const scalable = scalableHalfSpaces[index]!;
          const slack =
            fixed.rightHandSide +
            lambda * scalable.rightHandSide -
            fixed.coefficients[0] * reaction[0] -
            fixed.coefficients[1] * reaction[1] -
            fixed.coefficients[2] * reaction[2];
          const normalizedSlack = slack / rowScales[index]!;
          return normalizedSlack <= activeConstraintTolerance
            ? [
                {
                  interfaceId: fixed.interfaceId,
                  interfaceIndex: fixed.interfaceIndex,
                  kind: fixed.kind,
                  normalizedSlack,
                },
              ]
            : [];
        });

  return {
    status: simplex.status,
    reason:
      simplex.status === "optimal"
        ? null
        : simplex.status === "unbounded"
          ? "No finite collapse multiplier exists for the selected scalable load field within the assigned interface model."
          : "Collapse optimization reached its iteration limit.",
    lambdaLimit: lambda,
    scales: { force: forceScale, moment: momentScale },
    leftReaction: reactions.leftReaction,
    rightReaction: reactions.rightReaction,
    interfaces: interfaceResults,
    activeConstraints,
    residual: reactions.residual,
    simplex: { status: simplex.status, iterations: simplex.iterations },
  };
}

/** Compatibility name for callers that explicitly request the default ideal law. */
export const solveHeymanChainCollapse2D = solveRigidBlockChainCollapse2D;
