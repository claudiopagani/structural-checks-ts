import { maximizeNonnegativeLinearProgram } from "./nonnegativeSimplex.js";
import { rectangularNoTensionCompressionDomain2D } from "./rectangularNoTensionCompressionDomain2D.js";
import type {
  RigidBlock2D,
  RigidBlockAppliedWrench2D,
  RigidBlockEquilibriumOptions,
  RigidBlockEquilibrium2D,
  RigidBlockInterfaceConstraintKind,
  RigidBlockInterfaceLimitLaw2D,
  RigidBlockInterface2D,
  RigidBlockInterfaceResultant2D,
  RigidBlockVector2D,
} from "./types.js";
import { cross2d, dot2d, norm2d, scale2d } from "./vector2d.js";

export interface AffineInterfaceState {
  readonly interface: RigidBlockInterface2D;
  readonly forceConstant: RigidBlockVector2D;
  readonly globalMomentConstant: number;
  readonly normalCoefficients: readonly [number, number, number];
  readonly normalConstant: number;
  readonly shearCoefficients: readonly [number, number, number];
  readonly shearConstant: number;
  readonly reportedMomentCoefficients: readonly [number, number, number];
  readonly reportedMomentConstant: number;
}

export interface HalfSpace {
  readonly coefficients: readonly [number, number, number];
  readonly rightHandSide: number;
  readonly interfaceId: string;
  readonly interfaceIndex: number;
  readonly kind: RigidBlockInterfaceConstraintKind;
}

function finitePositive(value: number, label: string): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be finite and positive.`);
  }
  return value;
}

export const IDEAL_HEYMAN_INTERFACE_LAW_2D: RigidBlockInterfaceLimitLaw2D = Object.freeze({
  friction: null,
  compressiveStrength: null,
  compressionFacetCount: 1,
});

function resolveInterfaceLaws(
  interfaces: readonly RigidBlockInterface2D[],
  laws: readonly RigidBlockInterfaceLimitLaw2D[] | undefined,
): readonly RigidBlockInterfaceLimitLaw2D[] {
  const resolved = laws ?? interfaces.map(() => IDEAL_HEYMAN_INTERFACE_LAW_2D);
  if (resolved.length !== interfaces.length) {
    throw new Error("Every rigid-block interface requires exactly one limit law.");
  }
  for (let index = 0; index < resolved.length; index += 1) {
    const law = resolved[index]!;
    if (!Number.isInteger(law.compressionFacetCount) || law.compressionFacetCount <= 0) {
      throw new Error(`Interface ${interfaces[index]!.id} compressionFacetCount must be positive.`);
    }
    if (
      law.compressiveStrength !== null &&
      (!Number.isFinite(law.compressiveStrength) || law.compressiveStrength <= 0)
    ) {
      throw new Error(`Interface ${interfaces[index]!.id} compressiveStrength must be positive.`);
    }
    for (const [facetIndex, facet] of (law.resultantFacets ?? []).entries()) {
      if (
        !Number.isFinite(facet.normalCoefficient) ||
        !Number.isFinite(facet.momentCoefficient) ||
        !Number.isFinite(facet.capacity) ||
        Math.hypot(facet.normalCoefficient, facet.momentCoefficient) === 0
      ) {
        throw new Error(
          `Interface ${interfaces[index]!.id} resultant facet ${facetIndex} must be finite and non-degenerate.`,
        );
      }
    }
    if (law.friction !== null) {
      const { frictionCoefficient, cohesion, flowRule } = law.friction;
      if (!Number.isFinite(frictionCoefficient) || frictionCoefficient < 0) {
        throw new Error(
          `Interface ${interfaces[index]!.id} frictionCoefficient must be non-negative.`,
        );
      }
      if (!Number.isFinite(cohesion) || cohesion < 0) {
        throw new Error(`Interface ${interfaces[index]!.id} cohesion must be non-negative.`);
      }
      const frictionAngle = Math.atan(frictionCoefficient);
      if (
        !Number.isFinite(flowRule.dilationAngle) ||
        flowRule.dilationAngle < 0 ||
        flowRule.dilationAngle > frictionAngle + 1e-12
      ) {
        throw new Error(
          `Interface ${interfaces[index]!.id} dilationAngle must satisfy 0 <= psi <= atan(mu).`,
        );
      }
      if (
        flowRule.type === "associated" &&
        Math.abs(flowRule.dilationAngle - frictionAngle) > 1e-12
      ) {
        throw new Error(
          `Interface ${interfaces[index]!.id} associated flow requires dilationAngle = atan(mu).`,
        );
      }
    }
  }
  return resolved;
}

export function sumMomentAboutOrigin(wrench: RigidBlockAppliedWrench2D): number {
  return cross2d(wrench.applicationPoint, wrench.force) + wrench.moment;
}

function affineValue(
  coefficients: readonly [number, number, number],
  variables: readonly [number, number, number],
  constant: number,
): number {
  return (
    coefficients[0] * variables[0] +
    coefficients[1] * variables[1] +
    coefficients[2] * variables[2] +
    constant
  );
}

export function buildAffineInterfaceStates(
  blocks: readonly RigidBlock2D[],
  interfaces: readonly RigidBlockInterface2D[],
  wrenches: readonly RigidBlockAppliedWrench2D[],
): AffineInterfaceState[] {
  const leftPoint = interfaces[0]!.midpoint;
  let cumulativeForceX = 0;
  let cumulativeForceY = 0;
  let cumulativeMomentOrigin = 0;
  const states: AffineInterfaceState[] = [];

  for (let index = 0; index < interfaces.length; index += 1) {
    if (index > 0) {
      const block = blocks[index - 1]!;
      const wrench = wrenches[index - 1]!;
      if (wrench.blockId !== block.id) {
        throw new Error(
          `Applied wrench ${index - 1} targets ${wrench.blockId}, expected ${block.id}.`,
        );
      }
      cumulativeForceX += wrench.force.x;
      cumulativeForceY += wrench.force.y;
      cumulativeMomentOrigin += sumMomentAboutOrigin(wrench);
    }

    const currentInterface = interfaces[index]!;
    const point = currentInterface.midpoint;
    const forceConstant = { x: cumulativeForceX, y: cumulativeForceY };
    const globalMomentConstant = cumulativeMomentOrigin - cross2d(point, forceConstant);
    const globalMomentCoefficients = [point.y - leftPoint.y, leftPoint.x - point.x, 1] as const;
    const normalCoefficients = [
      currentInterface.chainTangent.x,
      currentInterface.chainTangent.y,
      0,
    ] as const;
    const shearCoefficients = [
      currentInterface.jointAxis.x,
      currentInterface.jointAxis.y,
      0,
    ] as const;

    states.push({
      interface: currentInterface,
      forceConstant,
      globalMomentConstant,
      normalCoefficients,
      normalConstant: dot2d(forceConstant, currentInterface.chainTangent),
      shearCoefficients,
      shearConstant: dot2d(forceConstant, currentInterface.jointAxis),
      reportedMomentCoefficients: [
        -globalMomentCoefficients[0],
        -globalMomentCoefficients[1],
        -globalMomentCoefficients[2],
      ],
      reportedMomentConstant: -globalMomentConstant,
    });
  }

  return states;
}

export function buildHeymanHalfSpaces(states: readonly AffineInterfaceState[]): HalfSpace[] {
  return buildInterfaceLimitHalfSpaces(
    states,
    states.map(() => ({
      friction: null,
      compressiveStrength: null,
      compressionFacetCount: 1,
    })),
  );
}

function appendAffineConstraint(
  target: HalfSpace[],
  state: AffineInterfaceState,
  coefficients: readonly [number, number, number],
  rightHandSide: number,
  kind: RigidBlockInterfaceConstraintKind,
): void {
  target.push({
    coefficients,
    rightHandSide,
    interfaceId: state.interface.id,
    interfaceIndex: state.interface.index,
    kind,
  });
}

/** Builds a safe polyhedral resultant domain for each no-tension interface. */
export function buildInterfaceLimitHalfSpaces(
  states: readonly AffineInterfaceState[],
  laws: readonly RigidBlockInterfaceLimitLaw2D[],
  includeCapacityConstants = true,
): HalfSpace[] {
  if (states.length !== laws.length) {
    throw new Error("Every rigid-block interface requires exactly one limit law.");
  }
  const halfSpaces: HalfSpace[] = [];

  for (let index = 0; index < states.length; index += 1) {
    const state = states[index]!;
    const law = laws[index]!;
    const halfLength = state.interface.length / 2;
    const n = state.normalCoefficients;
    const m = state.reportedMomentCoefficients;

    appendAffineConstraint(
      halfSpaces,
      state,
      [-n[0], -n[1], -n[2]],
      state.normalConstant,
      "compression",
    );

    if (law.resultantFacets !== undefined && law.resultantFacets !== null) {
      for (const facet of law.resultantFacets) {
        appendAffineConstraint(
          halfSpaces,
          state,
          [
            facet.normalCoefficient * n[0] + facet.momentCoefficient * m[0],
            facet.normalCoefficient * n[1] + facet.momentCoefficient * m[1],
            facet.normalCoefficient * n[2] + facet.momentCoefficient * m[2],
          ],
          (includeCapacityConstants ? facet.capacity : 0) -
            facet.normalCoefficient * state.normalConstant -
            facet.momentCoefficient * state.reportedMomentConstant,
          facet.kind,
        );
      }
    } else if (law.compressiveStrength === null) {
      appendAffineConstraint(
        halfSpaces,
        state,
        [m[0] - halfLength * n[0], m[1] - halfLength * n[1], m[2]],
        halfLength * state.normalConstant - state.reportedMomentConstant,
        "extrados",
      );
      appendAffineConstraint(
        halfSpaces,
        state,
        [-m[0] - halfLength * n[0], -m[1] - halfLength * n[1], -m[2]],
        halfLength * state.normalConstant + state.reportedMomentConstant,
        "intrados",
      );
    } else {
      const compressionCapacity =
        law.compressiveStrength * state.interface.length * state.interface.outOfPlaneWidth;
      const facetCount = law.compressionFacetCount;
      const compressionFraction = (facetIndex: number): number => {
        const ratio = facetIndex / facetCount;
        if (ratio <= 0 || ratio >= 1) return ratio;
        const forward = ratio * ratio;
        const backward = (1 - ratio) * (1 - ratio);
        return forward / (forward + backward);
      };
      for (let facet = 0; facet < facetCount; facet += 1) {
        const n0 = compressionCapacity * compressionFraction(facet);
        const n1 = compressionCapacity * compressionFraction(facet + 1);
        const capacityMoment = (normalForce: number): number =>
          rectangularNoTensionCompressionDomain2D({
            normalForce,
            interfaceLength: state.interface.length,
            outOfPlaneWidth: state.interface.outOfPlaneWidth,
            compressiveStrength: law.compressiveStrength!,
          }).momentCapacity;
        const q0 = capacityMoment(n0);
        const q1 = capacityMoment(n1);
        const slope = (q1 - q0) / (n1 - n0);
        const intercept = q0 - slope * n0;
        const capacityConstant = includeCapacityConstants ? intercept : 0;
        appendAffineConstraint(
          halfSpaces,
          state,
          [m[0] - slope * n[0], m[1] - slope * n[1], m[2] - slope * n[2]],
          capacityConstant + slope * state.normalConstant - state.reportedMomentConstant,
          "crushing-extrados",
        );
        appendAffineConstraint(
          halfSpaces,
          state,
          [-m[0] - slope * n[0], -m[1] - slope * n[1], -m[2] - slope * n[2]],
          capacityConstant + slope * state.normalConstant + state.reportedMomentConstant,
          "crushing-intrados",
        );
      }
    }

    if (law.friction !== null) {
      const shear = state.shearCoefficients;
      const mu = law.friction.frictionCoefficient;
      const cohesionCapacity = includeCapacityConstants
        ? law.friction.cohesion * state.interface.length * state.interface.outOfPlaneWidth
        : 0;
      appendAffineConstraint(
        halfSpaces,
        state,
        [shear[0] - mu * n[0], shear[1] - mu * n[1], shear[2] - mu * n[2]],
        cohesionCapacity + mu * state.normalConstant - state.shearConstant,
        "sliding-positive",
      );
      appendAffineConstraint(
        halfSpaces,
        state,
        [-shear[0] - mu * n[0], -shear[1] - mu * n[1], -shear[2] - mu * n[2]],
        cohesionCapacity + mu * state.normalConstant + state.shearConstant,
        "sliding-negative",
      );
    }
  }

  return halfSpaces;
}

export function characteristicLength(interfaces: readonly RigidBlockInterface2D[]): number {
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let maxInterfaceLength = 0;
  for (const item of interfaces) {
    minX = Math.min(minX, item.midpoint.x);
    maxX = Math.max(maxX, item.midpoint.x);
    minY = Math.min(minY, item.midpoint.y);
    maxY = Math.max(maxY, item.midpoint.y);
    maxInterfaceLength = Math.max(maxInterfaceLength, item.length);
  }
  return finitePositive(
    Math.max(maxX - minX, maxY - minY, maxInterfaceLength),
    "Rigid-block characteristic length",
  );
}

function solveRepresentativeReaction(
  halfSpaces: readonly HalfSpace[],
  forceScale: number,
  momentScale: number,
  tolerance: number,
  maxIterations: number,
): {
  readonly variables: readonly [number, number, number];
  readonly margin: number;
  readonly status: "optimal" | "unbounded" | "iteration-limit";
  readonly iterations: number;
} {
  const normalized = halfSpaces.map((halfSpace, index) => {
    const scaled = [
      halfSpace.coefficients[0] * forceScale,
      halfSpace.coefficients[1] * forceScale,
      halfSpace.coefficients[2] * momentScale,
    ] as const;
    const norm = Math.hypot(scaled[0], scaled[1], scaled[2]);
    if (!Number.isFinite(norm) || norm <= tolerance) {
      throw new Error(`Degenerate Heyman half-space ${index}.`);
    }
    return {
      coefficients: [scaled[0] / norm, scaled[1] / norm, scaled[2] / norm] as const,
      rightHandSide: halfSpace.rightHandSide / norm,
    };
  });

  const relaxationOffset = normalized.reduce(
    (maximum, item) => Math.max(maximum, -item.rightHandSide),
    0,
  );
  const matrix = normalized.map((item) => [
    item.coefficients[0],
    item.coefficients[1],
    item.coefficients[2],
    -item.coefficients[0],
    -item.coefficients[1],
    -item.coefficients[2],
    1,
  ]);
  const rightHandSide = normalized.map((item) => item.rightHandSide + relaxationOffset);
  const simplex = maximizeNonnegativeLinearProgram(
    {
      matrix,
      rightHandSide,
      objective: [0, 0, 0, 0, 0, 0, 1],
    },
    { tolerance, maxIterations },
  );
  const solution = simplex.solution;
  const normalizedVariables = [
    (solution[0] ?? 0) - (solution[3] ?? 0),
    (solution[1] ?? 0) - (solution[4] ?? 0),
    (solution[2] ?? 0) - (solution[5] ?? 0),
  ] as const;

  return {
    variables: [
      normalizedVariables[0] * forceScale,
      normalizedVariables[1] * forceScale,
      normalizedVariables[2] * momentScale,
    ],
    margin: (solution[6] ?? 0) - relaxationOffset,
    status: simplex.status,
    iterations: simplex.iterations,
  };
}

export function interfaceResultant(
  state: AffineInterfaceState,
  variables: readonly [number, number, number],
  compressionTolerance: number,
  law?: RigidBlockInterfaceLimitLaw2D,
): RigidBlockInterfaceResultant2D {
  const force = {
    x: variables[0] + state.forceConstant.x,
    y: variables[1] + state.forceConstant.y,
  };
  const normalForce = dot2d(force, state.interface.chainTangent);
  const shearForce = dot2d(force, state.interface.jointAxis);
  const moment = affineValue(
    state.reportedMomentCoefficients,
    variables,
    state.reportedMomentConstant,
  );
  const halfLength = state.interface.length / 2;
  const eccentricity = normalForce > compressionTolerance ? moment / normalForce : null;
  const normalizedEccentricity = eccentricity === null ? null : eccentricity / halfLength;
  const thrustPoint =
    eccentricity === null
      ? null
      : {
          x: state.interface.midpoint.x + eccentricity * state.interface.jointAxis.x,
          y: state.interface.midpoint.y + eccentricity * state.interface.jointAxis.y,
        };
  const frictionCapacity =
    law?.friction === null || law?.friction === undefined
      ? null
      : law.friction.cohesion * state.interface.length * state.interface.outOfPlaneWidth +
        law.friction.frictionCoefficient * normalForce;
  const compressionStrengthMargin =
    law?.compressiveStrength === null || law?.compressiveStrength === undefined
      ? null
      : (() => {
          const compressionCapacity =
            law.compressiveStrength * state.interface.length * state.interface.outOfPlaneWidth;
          const momentCapacity = rectangularNoTensionCompressionDomain2D({
            normalForce: Math.min(compressionCapacity, Math.max(0, normalForce)),
            interfaceLength: state.interface.length,
            outOfPlaneWidth: state.interface.outOfPlaneWidth,
            compressiveStrength: law.compressiveStrength,
          }).momentCapacity;
          return momentCapacity - Math.abs(moment);
        })();
  const resultantDomainMargin =
    law?.resultantFacets === undefined || law.resultantFacets === null
      ? null
      : law.resultantFacets.reduce(
          (minimum, facet) =>
            Math.min(
              minimum,
              facet.capacity -
                facet.normalCoefficient * normalForce -
                facet.momentCoefficient * moment,
            ),
          Number.POSITIVE_INFINITY,
        );

  return {
    interfaceId: state.interface.id,
    index: state.interface.index,
    normalForce,
    shearForce,
    moment,
    eccentricity,
    normalizedEccentricity,
    thrustPoint,
    admissibilityMargins: {
      compression: normalForce,
      intrados: halfLength * normalForce + moment,
      extrados: halfLength * normalForce - moment,
      friction: frictionCapacity === null ? null : frictionCapacity - Math.abs(shearForce),
      compressionStrength: compressionStrengthMargin,
      resultantDomain: resultantDomainMargin,
    },
  };
}

function isMirrorSymmetric(
  blocks: readonly RigidBlock2D[],
  interfaces: readonly RigidBlockInterface2D[],
  wrenches: readonly RigidBlockAppliedWrench2D[],
  laws: readonly RigidBlockInterfaceLimitLaw2D[],
  forceScale: number,
  lengthScale: number,
): boolean {
  const centerX = (interfaces[0]!.midpoint.x + interfaces.at(-1)!.midpoint.x) / 2;
  const lengthTolerance = 1e-9 * Math.max(1, lengthScale);
  const forceTolerance = 1e-9 * Math.max(1, forceScale);
  const momentTolerance = forceTolerance * Math.max(1, lengthScale);
  const close = (a: number, b: number, tolerance: number) => Math.abs(a - b) <= tolerance;

  for (let index = 0; index < interfaces.length; index += 1) {
    const left = interfaces[index]!;
    const right = interfaces[interfaces.length - 1 - index]!;
    const leftLaw = laws[index]!;
    const rightLaw = laws[interfaces.length - 1 - index]!;
    if (
      !close(left.midpoint.x + right.midpoint.x, 2 * centerX, lengthTolerance) ||
      !close(left.midpoint.y, right.midpoint.y, lengthTolerance) ||
      !close(left.length, right.length, lengthTolerance) ||
      !close(left.chainTangent.x, right.chainTangent.x, 1e-9) ||
      !close(left.chainTangent.y, -right.chainTangent.y, 1e-9) ||
      !close(left.jointAxis.x, -right.jointAxis.x, 1e-9) ||
      !close(left.jointAxis.y, right.jointAxis.y, 1e-9) ||
      leftLaw.compressiveStrength !== rightLaw.compressiveStrength ||
      leftLaw.compressionFacetCount !== rightLaw.compressionFacetCount ||
      leftLaw.friction?.frictionCoefficient !== rightLaw.friction?.frictionCoefficient ||
      leftLaw.friction?.cohesion !== rightLaw.friction?.cohesion ||
      leftLaw.friction?.flowRule.type !== rightLaw.friction?.flowRule.type ||
      leftLaw.friction?.flowRule.dilationAngle !== rightLaw.friction?.flowRule.dilationAngle ||
      JSON.stringify(leftLaw.resultantFacets ?? null) !==
        JSON.stringify(rightLaw.resultantFacets ?? null)
    ) {
      return false;
    }
  }

  for (let index = 0; index < blocks.length; index += 1) {
    const leftBlock = blocks[index]!;
    const rightBlock = blocks[blocks.length - 1 - index]!;
    const leftWrench = wrenches[index]!;
    const rightWrench = wrenches[wrenches.length - 1 - index]!;
    if (
      !close(leftBlock.centroid.x + rightBlock.centroid.x, 2 * centerX, lengthTolerance) ||
      !close(leftBlock.centroid.y, rightBlock.centroid.y, lengthTolerance) ||
      !close(leftWrench.force.x, -rightWrench.force.x, forceTolerance) ||
      !close(leftWrench.force.y, rightWrench.force.y, forceTolerance) ||
      !close(leftWrench.moment, -rightWrench.moment, momentTolerance)
    ) {
      return false;
    }
  }
  return true;
}

/**
 * Selects the center of the normalized interface-admissible reaction polytope for an ordered chain.
 * The returned thrust line is representative and statically admissible, not an elastic solution.
 */
export function solveRigidBlockChainEquilibrium2D(
  {
    blocks,
    interfaces,
    wrenches,
    interfaceLaws,
  }: {
    readonly blocks: readonly RigidBlock2D[];
    readonly interfaces: readonly RigidBlockInterface2D[];
    readonly wrenches: readonly RigidBlockAppliedWrench2D[];
    readonly interfaceLaws?: readonly RigidBlockInterfaceLimitLaw2D[];
  },
  {
    feasibilityTolerance = 1e-9,
    simplexTolerance = 1e-11,
    maxSimplexIterations = 20_000,
  }: RigidBlockEquilibriumOptions = {},
): RigidBlockEquilibrium2D {
  if (blocks.length === 0) {
    throw new Error("Rigid-block equilibrium requires at least one block.");
  }
  if (interfaces.length !== blocks.length + 1) {
    throw new Error(
      "An ordered rigid-block chain requires exactly one more interface than blocks.",
    );
  }
  if (wrenches.length !== blocks.length) {
    throw new Error("Rigid-block equilibrium requires one resultant applied wrench per block.");
  }
  finitePositive(feasibilityTolerance, "Equilibrium feasibility tolerance");
  finitePositive(simplexTolerance, "Equilibrium simplex tolerance");
  const resolvedLaws = resolveInterfaceLaws(interfaces, interfaceLaws);

  const lengthScale = characteristicLength(interfaces);
  const totalForceMagnitude = wrenches.reduce((total, wrench) => total + norm2d(wrench.force), 0);
  const totalMomentMagnitude = wrenches.reduce(
    (total, wrench) => total + Math.abs(sumMomentAboutOrigin(wrench)),
    0,
  );
  const forceScale = Math.max(1, totalForceMagnitude, totalMomentMagnitude / lengthScale);
  const momentScale = forceScale * lengthScale;
  const states = buildAffineInterfaceStates(blocks, interfaces, wrenches);
  const halfSpaces = buildInterfaceLimitHalfSpaces(states, resolvedLaws);
  const representative = solveRepresentativeReaction(
    halfSpaces,
    forceScale,
    momentScale,
    simplexTolerance,
    maxSimplexIterations,
  );
  let variables: [number, number, number] = [...representative.variables];
  const leftPoint = interfaces[0]!.midpoint;
  const rightPoint = interfaces.at(-1)!.midpoint;
  const totalForce = wrenches.reduce<RigidBlockVector2D>(
    (sum, wrench) => ({ x: sum.x + wrench.force.x, y: sum.y + wrench.force.y }),
    { x: 0, y: 0 },
  );
  const totalMomentOrigin = wrenches.reduce((sum, wrench) => sum + sumMomentAboutOrigin(wrench), 0);

  if (isMirrorSymmetric(blocks, interfaces, wrenches, resolvedLaws, forceScale, lengthScale)) {
    const rightSectionForce = {
      x: variables[0] + totalForce.x,
      y: variables[1] + totalForce.y,
    };
    const rightSectionMoment =
      variables[2] +
      cross2d(
        { x: leftPoint.x - rightPoint.x, y: leftPoint.y - rightPoint.y },
        { x: variables[0], y: variables[1] },
      ) +
      totalMomentOrigin -
      cross2d(rightPoint, totalForce);
    const mirroredLeftReaction: [number, number, number] = [
      rightSectionForce.x,
      -rightSectionForce.y,
      rightSectionMoment,
    ];
    variables = [
      (variables[0] + mirroredLeftReaction[0]) / 2,
      (variables[1] + mirroredLeftReaction[1]) / 2,
      (variables[2] + mirroredLeftReaction[2]) / 2,
    ];
  }

  const interfaceResults = states.map((state) =>
    interfaceResultant(
      state,
      variables,
      feasibilityTolerance * forceScale,
      resolvedLaws[state.interface.index],
    ),
  );
  const maximumViolation = halfSpaces.reduce((maximum, halfSpace) => {
    const violation =
      halfSpace.coefficients[0] * variables[0] +
      halfSpace.coefficients[1] * variables[1] +
      halfSpace.coefficients[2] * variables[2] -
      halfSpace.rightHandSide;
    const rowScale = Math.hypot(
      halfSpace.coefficients[0] * forceScale,
      halfSpace.coefficients[1] * forceScale,
      halfSpace.coefficients[2] * momentScale,
    );
    return Math.max(maximum, violation / rowScale);
  }, 0);
  const feasible =
    representative.status === "optimal" &&
    representative.margin >= -feasibilityTolerance &&
    maximumViolation <= feasibilityTolerance;
  const leftReaction = {
    force: { x: variables[0], y: variables[1] },
    moment: variables[2],
    applicationPoint: leftPoint,
  };
  const sectionForceAtRight = {
    x: variables[0] + totalForce.x,
    y: variables[1] + totalForce.y,
  };
  const sectionMomentAtRight =
    variables[2] +
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
    feasible,
    reason: feasible
      ? null
      : representative.status !== "optimal"
        ? `Representative equilibrium optimization terminated with ${representative.status}.`
        : `No interface-admissible reaction was found; normalized margin ${representative.margin}.`,
    representativeMargin: representative.margin,
    scales: { force: forceScale, moment: momentScale },
    leftReaction,
    rightReaction,
    interfaces: interfaceResults,
    residual: {
      forceX: forceResidual.x,
      forceY: forceResidual.y,
      moment: momentResidual,
      normalizedForceX: forceResidual.x / forceScale,
      normalizedForceY: forceResidual.y / forceScale,
      normalizedMoment: momentResidual / momentScale,
    },
    simplex: {
      status: representative.status,
      iterations: representative.iterations,
    },
  };
}

/** Compatibility name for callers that explicitly request the default ideal law. */
export const solveHeymanChainEquilibrium2D = solveRigidBlockChainEquilibrium2D;
