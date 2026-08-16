import { CalculationResult } from "../../core/results/CalculationResult.js";
import { RESULT_STATUS } from "../../core/results/resultStatus.js";
import type {
  RigidBlockDeformableInterfaceEvaluation2D,
  RigidBlockDeformableInterfaceState2D,
} from "../../domain/masonry/rigid-blocks/evaluateDeformableInterface2D.js";
import { cross2d, dot2d } from "../../domain/masonry/rigid-blocks/vector2d.js";
import type {
  RigidBlockPoint2D,
  RigidBlockVector2D,
} from "../../domain/masonry/rigid-blocks/types.js";
import {
  NonlinearEquilibriumContinuationSolver,
  scaleArcLengthDirection,
  sphericalArcLengthNorm,
  type NonlinearTangentMatrix,
} from "../../domain/solvers/continuation/index.js";
import {
  addCompactBandedValue,
  compactBandedMatrixToDense,
  compactBandedValue,
  createCompactBandedMatrix,
  type CompactBandedMatrix,
} from "../../domain/math/GeneralBandedLinearSolver.js";
import { assertExplicitUnitSystem, createUnitResolver } from "../../domain/units/UnitSystem.js";
import { asMasonryArchModel } from "./MasonryArchModel.js";
import { evaluateMasonryArchInterfaceConfigurationForSolver } from "./evaluateArchInterfaceConfiguration.js";
import type { MasonryArchModel } from "./MasonryArchModel.js";
import type {
  MasonryArchResolvedLoadAction,
  ResolvedMasonryArchLoads,
} from "./resolveMasonryArchLoads.js";
import { evaluateArchReinforcementConfiguration } from "./resolveArchReinforcements.js";
import { resolveBondedLayerInterfaceSections } from "./bondedLayers.js";
import type {
  MasonryArchAnalysisObjective,
  MasonryArchAnalysisOutcome,
  MasonryArchCapacityLandmarks,
  MasonryArchDesignFailureEventKind,
  MasonryArchEngineeringAssessmentStatus,
  MasonryArchEngineeringCriterion,
  BondedLayerStateResult,
  MasonryArchBlockDisplacementInput,
  MasonryArchFailureMode,
  MasonryArchModelInput,
  NormalizedMasonryArchBlockDisplacement,
  NormalizedMasonryArchModel,
} from "./types.js";
import { MASONRY_ARCH_PATH_ASSESSMENT_QUESTION } from "./types.js";
import {
  createMasonryArchAnalysisDescriptor,
  createMasonryArchLambdaDefinition,
  effectiveMasonryArchLoadFactors,
  resolveMasonryArchAnalysisLoads,
  type ResolvedMasonryArchAnalysisLoads,
} from "./analysisSemantics.js";
import {
  isMasonryArchPhysicalLimitEventKind,
  masonryArchFailureModeFromKinds,
  masonryArchResultStatusFromAssessmentStatus,
} from "./engineeringAssessment.js";
import { masonryArchEngineeringCriteriaFromPathEvent } from "./pathCriteria.js";

import {
  MASONRY_ARCH_PATH_RESULT_SCHEMA_VERSION,
  type AnalyzeMasonryArchPathOptions,
  type MasonryArchEvent,
  type MasonryArchLambdaBracket,
  type MasonryArchPathControl,
  type MasonryArchPathEngineeringAssessment,
  type MasonryArchPathFixedStateResult,
  type MasonryArchPathOutputs,
  type MasonryArchPathResult,
  type MasonryArchPathStep,
  type MasonryArchEquilibriumResidual,
  type MasonryArchVerifiedLimitPoint,
} from "./pathTypes.js";
import {
  DEFAULT_DESIGN_FAILURE_EVENTS,
  createMasonryArchEvent as event,
  detectMasonryArchStepEvents,
  masonryArchFailureModeFromEvents,
  shouldStopMasonryArchPathForEvents,
} from "./pathEvents.js";
import { createMasonryArchPathState } from "./pathState.js";

type Matrix = number[][];
type Vector = number[];
type TangentMatrix = NonlinearTangentMatrix;

interface ExternalSystem {
  readonly vector: Vector;
  readonly tangentDiagonal: Vector;
}

interface SystemEvaluation {
  readonly residual: Vector;
  readonly tangent: TangentMatrix;
  readonly scalableDerivative: Vector;
  readonly interfaces: readonly RigidBlockDeformableInterfaceEvaluation2D[];
  readonly trialStates: Readonly<Record<string, RigidBlockDeformableInterfaceState2D>>;
  readonly reinforcement: ReturnType<typeof evaluateArchReinforcementConfiguration>;
  readonly bondedLayerState: readonly BondedLayerStateResult[];
  readonly displacements: readonly NormalizedMasonryArchBlockDisplacement[];
}

interface SolverContext {
  readonly model: NormalizedMasonryArchModel;
  readonly fixedLoads: ResolvedMasonryArchLoads;
  readonly scalableLoads: ResolvedMasonryArchLoads;
  readonly forceScale: number;
  readonly lengthScale: number;
  readonly tolerance: number;
  readonly maxIterations: number;
  readonly maximumLineSearchIterations: number;
  readonly minimumLineSearchFactor: number;
  readonly continuationSolver: NonlinearEquilibriumContinuationSolver<SystemEvaluation>;
}

interface NewtonResult {
  readonly converged: boolean;
  readonly q: Vector;
  readonly lambda: number;
  readonly iterations: number;
  readonly evaluation: SystemEvaluation;
  readonly warning: string | null;
  readonly nonMonotoneAcceptances: number;
}

function zeroVector(size: number): Vector {
  return new Array<number>(size).fill(0);
}

function zeroMatrix(size: number): Matrix {
  return Array.from({ length: size }, () => new Array<number>(size).fill(0));
}

function isCompactBandedMatrix(matrix: TangentMatrix): matrix is CompactBandedMatrix {
  return !Array.isArray(matrix);
}

function addTangentDiagonal(
  matrix: TangentMatrix,
  diagonal: readonly number[],
  factor: number,
): void {
  for (let index = 0; index < diagonal.length; index += 1) {
    if (isCompactBandedMatrix(matrix)) {
      addCompactBandedValue(matrix, index, index, factor * diagonal[index]!);
    } else {
      matrix[index]![index] = matrix[index]![index]! + factor * diagonal[index]!;
    }
  }
}

function finitePositive(value: number, label: string): number {
  if (!Number.isFinite(value) || value <= 0)
    throw new Error(`${label} must be finite and positive.`);
  return value;
}

function finiteNonZero(value: number, label: string): number {
  if (!Number.isFinite(value) || value === 0)
    throw new Error(`${label} must be finite and non-zero.`);
  return value;
}

function positiveInteger(value: number, label: string): number {
  if (!Number.isInteger(value) || value <= 0)
    throw new Error(`${label} must be a positive integer.`);
  return value;
}

function rotate(vector: RigidBlockVector2D, angle: number): RigidBlockVector2D {
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  return {
    x: cosine * vector.x - sine * vector.y,
    y: sine * vector.x + cosine * vector.y,
  };
}

function perpendicular(vector: RigidBlockVector2D): RigidBlockVector2D {
  return { x: -vector.y, y: vector.x };
}

function subtract(left: RigidBlockPoint2D, right: RigidBlockPoint2D): RigidBlockVector2D {
  return { x: left.x - right.x, y: left.y - right.y };
}

function qToDisplacements(
  model: NormalizedMasonryArchModel,
  q: readonly number[],
): NormalizedMasonryArchBlockDisplacement[] {
  return model.geometry.voussoirs.map((block) => ({
    blockId: block.id,
    translation: { x: q[3 * block.index]!, y: q[3 * block.index + 1]! },
    rotation: q[3 * block.index + 2]!,
  }));
}

function configurationInput(
  model: NormalizedMasonryArchModel,
  q: readonly number[],
): {
  readonly units: NormalizedMasonryArchModel["units"];
  readonly blockDisplacements: readonly MasonryArchBlockDisplacementInput[];
} {
  return { units: model.units, blockDisplacements: qToDisplacements(model, q) };
}

function addVector(target: Vector, source: readonly number[], factor = 1): void {
  for (let index = 0; index < target.length; index += 1) {
    target[index] = target[index]! + factor * source[index]!;
  }
}

function addMatrix(target: Matrix, source: readonly (readonly number[])[], factor = 1): void {
  for (let row = 0; row < target.length; row += 1) {
    for (let column = 0; column < target.length; column += 1) {
      target[row]![column] = target[row]![column]! + factor * source[row]![column]!;
    }
  }
}

function externalSystem(
  model: NormalizedMasonryArchModel,
  actions: readonly MasonryArchResolvedLoadAction[],
  q: readonly number[],
  includeTangent: boolean,
): ExternalSystem {
  const size = 3 * model.geometry.voussoirs.length;
  const vector = zeroVector(size);
  const tangentDiagonal = zeroVector(size);
  for (const action of actions) {
    const block = model.geometry.voussoirs.find((item) => item.id === action.blockId);
    if (block === undefined)
      throw new Error(`Unknown nonlinear load-action block ${action.blockId}.`);
    const offset = rotate(subtract(action.referencePoint, block.centroid), q[3 * block.index + 2]!);
    const base = 3 * block.index;
    vector[base] = vector[base]! + action.force.x;
    vector[base + 1] = vector[base + 1]! + action.force.y;
    vector[base + 2] = vector[base + 2]! + cross2d(offset, action.force) + action.moment;
    if (includeTangent) {
      tangentDiagonal[base + 2] =
        tangentDiagonal[base + 2]! + cross2d(perpendicular(offset), action.force);
    }
  }
  return { vector, tangentDiagonal };
}

function assembleInterfaces(
  model: NormalizedMasonryArchModel,
  q: readonly number[],
  committedStates: Readonly<Record<string, RigidBlockDeformableInterfaceState2D>>,
  includeTangent: boolean,
  numericalCohesionOffset = 0,
): {
  readonly vector: Vector;
  readonly tangent: CompactBandedMatrix;
  readonly evaluations: readonly RigidBlockDeformableInterfaceEvaluation2D[];
  readonly trialStates: Readonly<Record<string, RigidBlockDeformableInterfaceState2D>>;
} {
  const size = 3 * model.geometry.voussoirs.length;
  const vector = zeroVector(size);
  // A joint connects at most two consecutive three-DOF blocks; the largest scalar index gap is 5.
  const tangent = createCompactBandedMatrix(size, Math.min(5, size - 1));
  const evaluated = evaluateMasonryArchInterfaceConfigurationForSolver(
    model,
    {
      ...configurationInput(model, q),
      committedStatesByInterfaceId: committedStates,
      computeTangent: includeTangent,
    },
    numericalCohesionOffset,
  );
  for (const item of evaluated.interfaces) {
    const globalBases = item.blockIds.map((id) => {
      const block = model.geometry.voussoirs.find((candidate) => candidate.id === id);
      if (block === undefined) throw new Error(`Unknown nonlinear interface block ${id}.`);
      return 3 * block.index;
    });
    for (let localBody = 0; localBody < globalBases.length; localBody += 1) {
      const globalBase = globalBases[localBody]!;
      for (let component = 0; component < 3; component += 1) {
        vector[globalBase + component] =
          vector[globalBase + component]! + item.generalizedForces[3 * localBody + component]!;
      }
    }
    if (includeTangent) {
      for (let localRowBody = 0; localRowBody < globalBases.length; localRowBody += 1) {
        for (let localColumnBody = 0; localColumnBody < globalBases.length; localColumnBody += 1) {
          for (let rowComponent = 0; rowComponent < 3; rowComponent += 1) {
            for (let columnComponent = 0; columnComponent < 3; columnComponent += 1) {
              const globalRow = globalBases[localRowBody]! + rowComponent;
              const globalColumn = globalBases[localColumnBody]! + columnComponent;
              addCompactBandedValue(
                tangent,
                globalRow,
                globalColumn,
                item.tangent[3 * localRowBody + rowComponent]![
                  3 * localColumnBody + columnComponent
                ]!,
              );
            }
          }
        }
      }
    }
  }
  return {
    vector,
    tangent,
    evaluations: evaluated.interfaces,
    trialStates: evaluated.trialStatesByInterfaceId,
  };
}

function transformedBlockPoint(
  model: NormalizedMasonryArchModel,
  blockIndex: number,
  referencePoint: RigidBlockPoint2D,
  q: readonly number[],
): RigidBlockPoint2D {
  const block = model.geometry.voussoirs[blockIndex]!;
  const rotatedRadius = rotate(subtract(referencePoint, block.centroid), q[3 * blockIndex + 2]!);
  return {
    x: block.centroid.x + q[3 * blockIndex]! + rotatedRadius.x,
    y: block.centroid.y + q[3 * blockIndex + 1]! + rotatedRadius.y,
  };
}

function bondedLayerVector(
  model: NormalizedMasonryArchModel,
  q: readonly number[],
): {
  readonly vector: Vector;
  readonly state: readonly BondedLayerStateResult[];
} {
  const vector = zeroVector(3 * model.geometry.voussoirs.length);
  const sections = resolveBondedLayerInterfaceSections(model);
  const perLayer = new Map<
    string,
    {
      readonly layer: NormalizedMasonryArchModel["bondedLayers"][number];
      readonly interfaces: BondedLayerStateResult["interfaces"] extends readonly (infer T)[]
        ? T[]
        : never;
    }
  >(model.bondedLayers.map((layer) => [layer.id, { layer, interfaces: [] }]));

  for (const section of sections) {
    if (section.coordinate === null || section.contributions.length === 0) continue;
    const interfaceIndex = section.interface.index;
    const leftBlockIndex = interfaceIndex === 0 ? null : interfaceIndex - 1;
    const rightBlockIndex =
      interfaceIndex === model.geometry.interfaces.length - 1 ? null : interfaceIndex;
    const referencePoint =
      section.side === "extrados"
        ? section.interface.extradosPoint
        : section.interface.intradosPoint;
    const leftPoint =
      leftBlockIndex === null
        ? referencePoint
        : transformedBlockPoint(model, leftBlockIndex, referencePoint, q);
    const rightPoint =
      rightBlockIndex === null
        ? referencePoint
        : transformedBlockPoint(model, rightBlockIndex, referencePoint, q);
    const frameRotation =
      leftBlockIndex === null || rightBlockIndex === null
        ? 0
        : (q[3 * leftBlockIndex + 2]! + q[3 * rightBlockIndex + 2]!) / 2;
    const tangent = rotate(section.interface.chainTangent, frameRotation);
    const opening = dot2d(subtract(rightPoint, leftPoint), tangent);

    let totalForce = 0;
    for (const contribution of section.contributions) {
      const { layer } = contribution;
      if (layer.transferLength === null) {
        throw new Error(
          `Bonded layer ${layer.id} requires transferLength for deformable-interface analysis.`,
        );
      }
      const stiffness =
        (contribution.developmentFactor * layer.elasticModulus * layer.area) / layer.transferLength;
      const trialForce = stiffness * Math.max(0, opening);
      const force = Math.min(contribution.capacity, trialForce);
      const utilizationRatio = contribution.capacity > 0 ? force / contribution.capacity : null;
      perLayer.get(layer.id)!.interfaces.push({
        reinforcementId: layer.id,
        interfaceId: section.interface.id,
        interfaceIndex,
        side: layer.side,
        developmentFactor: contribution.developmentFactor,
        force,
        capacity: contribution.capacity,
        utilizationRatio,
        state:
          force <= 1e-12 * Math.max(1, contribution.capacity)
            ? "inactive"
            : utilizationRatio! >= 1 - 1e-10
              ? "at-capacity"
              : "active",
      });
      totalForce += force;
    }

    const forceOnRight = { x: -totalForce * tangent.x, y: -totalForce * tangent.y };
    if (leftBlockIndex !== null) {
      const force = { x: -forceOnRight.x, y: -forceOnRight.y };
      const base = 3 * leftBlockIndex;
      const currentCentroid = {
        x: model.geometry.voussoirs[leftBlockIndex]!.centroid.x + q[base]!,
        y: model.geometry.voussoirs[leftBlockIndex]!.centroid.y + q[base + 1]!,
      };
      vector[base] = vector[base]! + force.x;
      vector[base + 1] = vector[base + 1]! + force.y;
      vector[base + 2] = vector[base + 2]! + cross2d(subtract(leftPoint, currentCentroid), force);
    }
    if (rightBlockIndex !== null) {
      const base = 3 * rightBlockIndex;
      const currentCentroid = {
        x: model.geometry.voussoirs[rightBlockIndex]!.centroid.x + q[base]!,
        y: model.geometry.voussoirs[rightBlockIndex]!.centroid.y + q[base + 1]!,
      };
      vector[base] = vector[base]! + forceOnRight.x;
      vector[base + 1] = vector[base + 1]! + forceOnRight.y;
      vector[base + 2] =
        vector[base + 2]! + cross2d(subtract(rightPoint, currentCentroid), forceOnRight);
    }
  }

  const state = [...perLayer.values()].map(({ layer, interfaces }): BondedLayerStateResult => {
    const forces = interfaces
      .map((item) => item.force)
      .filter((value): value is number => value !== null);
    const utilizations = interfaces
      .map((item) => item.utilizationRatio)
      .filter((value): value is number => value !== null);
    return {
      reinforcementId: layer.id,
      family: layer.family,
      side: layer.side,
      tensileCapacity: layer.tensileCapacity,
      governingCapacityLimit: layer.governingCapacityLimit,
      analysisMeaning: "deformable-interface-compatibility",
      maximumForce: forces.length === 0 ? 0 : Math.max(...forces),
      maximumUtilizationRatio: utilizations.length === 0 ? 0 : Math.max(...utilizations),
      interfaces,
    };
  });
  return { vector, state };
}

function assembleBondedLayers(
  model: NormalizedMasonryArchModel,
  q: readonly number[],
  includeTangent: boolean,
): {
  readonly vector: Vector;
  readonly tangent: CompactBandedMatrix;
  readonly state: readonly BondedLayerStateResult[];
} {
  const baseline = bondedLayerVector(model, q);
  const size = baseline.vector.length;
  const tangent = createCompactBandedMatrix(size, Math.min(5, size - 1));
  if (includeTangent && model.bondedLayers.length > 0) {
    const relativeStep = 1e-7;
    for (let column = 0; column < size; column += 1) {
      const component = column % 3;
      const step = component === 2 ? relativeStep : relativeStep * Math.max(1, model.geometry.span);
      const plusQ = [...q];
      const minusQ = [...q];
      plusQ[column] = plusQ[column]! + step;
      minusQ[column] = minusQ[column]! - step;
      const plus = bondedLayerVector(model, plusQ).vector;
      const minus = bondedLayerVector(model, minusQ).vector;
      for (let row = Math.max(0, column - 5); row <= Math.min(size - 1, column + 5); row += 1) {
        const value = (plus[row]! - minus[row]!) / (2 * step);
        if (value !== 0) addCompactBandedValue(tangent, row, column, value);
      }
    }
  }
  return { ...baseline, tangent };
}

function reinforcementVector(
  model: NormalizedMasonryArchModel,
  q: readonly number[],
): {
  readonly vector: Vector;
  readonly resolved: ReturnType<typeof evaluateArchReinforcementConfiguration>;
} {
  const resolved = evaluateArchReinforcementConfiguration(model, configurationInput(model, q));
  const vector = zeroVector(3 * model.geometry.voussoirs.length);
  for (const wrench of resolved.blockWrenches) {
    const block = model.geometry.voussoirs.find((item) => item.id === wrench.blockId);
    if (block === undefined)
      throw new Error(`Unknown nonlinear reinforcement block ${wrench.blockId}.`);
    const base = 3 * block.index;
    vector[base] = vector[base]! + wrench.force.x;
    vector[base + 1] = vector[base + 1]! + wrench.force.y;
    vector[base + 2] = vector[base + 2]! + wrench.moment;
  }
  return { vector, resolved };
}

function assembleReinforcement(
  model: NormalizedMasonryArchModel,
  q: readonly number[],
  includeTangent: boolean,
): {
  readonly vector: Vector;
  readonly tangent: Matrix;
  readonly resolved: ReturnType<typeof evaluateArchReinforcementConfiguration>;
} {
  const baseline = reinforcementVector(model, q);
  const size = baseline.vector.length;
  const tangent = zeroMatrix(size);
  if (includeTangent && model.reinforcements.length > 0) {
    const relativeStep = 1e-7;
    for (let column = 0; column < size; column += 1) {
      const component = column % 3;
      const step = component === 2 ? relativeStep : relativeStep * Math.max(1, model.geometry.span);
      const plusQ = [...q];
      const minusQ = [...q];
      plusQ[column] = plusQ[column]! + step;
      minusQ[column] = minusQ[column]! - step;
      const plus = reinforcementVector(model, plusQ).vector;
      const minus = reinforcementVector(model, minusQ).vector;
      for (let row = 0; row < size; row += 1) {
        tangent[row]![column] = (plus[row]! - minus[row]!) / (2 * step);
      }
    }
  }
  return { ...baseline, tangent };
}

function evaluateSystem(
  context: SolverContext,
  q: readonly number[],
  lambda: number,
  fixedLoadFactor: number,
  committedStates: Readonly<Record<string, RigidBlockDeformableInterfaceState2D>>,
  includeTangent: boolean,
  numericalCohesionOffset = 0,
): SystemEvaluation {
  const interfaces = assembleInterfaces(
    context.model,
    q,
    committedStates,
    includeTangent,
    numericalCohesionOffset,
  );
  const bondedLayers = assembleBondedLayers(context.model, q, includeTangent);
  const reinforcement = assembleReinforcement(context.model, q, includeTangent);
  const fixed = externalSystem(context.model, context.fixedLoads.actions, q, includeTangent);
  const scalable = externalSystem(context.model, context.scalableLoads.actions, q, includeTangent);
  const residual = [...interfaces.vector];
  addVector(residual, bondedLayers.vector);
  addVector(residual, reinforcement.vector, fixedLoadFactor);
  addVector(residual, fixed.vector, fixedLoadFactor);
  addVector(residual, scalable.vector, lambda);
  let tangent: TangentMatrix = interfaces.tangent;
  if (includeTangent) {
    for (let row = 0; row < bondedLayers.tangent.size; row += 1) {
      const firstColumn = Math.max(0, row - bondedLayers.tangent.lowerBandwidth);
      const lastColumn = Math.min(
        bondedLayers.tangent.size - 1,
        row + bondedLayers.tangent.upperBandwidth,
      );
      for (let column = firstColumn; column <= lastColumn; column += 1) {
        addCompactBandedValue(
          interfaces.tangent,
          row,
          column,
          compactBandedValue(bondedLayers.tangent, row, column),
        );
      }
    }
    addTangentDiagonal(tangent, fixed.tangentDiagonal, fixedLoadFactor);
    addTangentDiagonal(tangent, scalable.tangentDiagonal, lambda);
    if (fixedLoadFactor !== 0 && context.model.reinforcements.length > 0) {
      const denseTangent = compactBandedMatrixToDense(tangent);
      addMatrix(denseTangent, reinforcement.tangent, fixedLoadFactor);
      tangent = denseTangent;
    }
  }
  return {
    residual,
    tangent,
    scalableDerivative: scalable.vector,
    interfaces: interfaces.evaluations,
    trialStates: interfaces.trialStates,
    reinforcement: reinforcement.resolved,
    bondedLayerState: bondedLayers.state,
    displacements: qToDisplacements(context.model, q),
  };
}

function residualMeasure(context: SolverContext, residual: readonly number[]): number {
  return context.continuationSolver.residualMeasure(residual);
}

function solveLoadCorrection(context: SolverContext, evaluation: SystemEvaluation): Vector {
  return context.continuationSolver.solveLoadCorrection(evaluation);
}

function solveNewton(
  context: SolverContext,
  initialQ: readonly number[],
  initialLambda: number,
  fixedLoadFactor: number,
  committedStates: Readonly<Record<string, RigidBlockDeformableInterfaceState2D>>,
  constraint:
    | {
        readonly type: "displacement";
        readonly dof: number;
        readonly target: number;
        readonly reference: number;
      }
    | {
        readonly type: "arc-length";
        readonly referenceQ: readonly number[];
        readonly referenceLambda: number;
        readonly radius: number;
        readonly loadScale: number;
      }
    | null,
  numericalCohesionOffset = 0,
): NewtonResult {
  const resolvedConstraint =
    constraint === null
      ? undefined
      : constraint.type === "arc-length"
        ? {
            ...constraint,
            referenceCoordinates: constraint.referenceQ,
          }
        : constraint;
  const solveInput = {
    initialCoordinates: initialQ,
    initialLambda,
    evaluate: (coordinates: readonly number[], lambda: number, includeTangent: boolean) =>
      evaluateSystem(
        context,
        coordinates,
        lambda,
        fixedLoadFactor,
        committedStates,
        includeTangent,
        numericalCohesionOffset,
      ),
  } as const;
  const solved = context.continuationSolver.solve(
    resolvedConstraint === undefined
      ? solveInput
      : { ...solveInput, constraint: resolvedConstraint },
  );
  return {
    ...solved,
    q: [...solved.coordinates],
  };
}

function solveWithCohesionHomotopy(
  context: SolverContext,
  initialQ: readonly number[],
  initialLambda: number,
  fixedLoadFactor: number,
  committedStates: Readonly<Record<string, RigidBlockDeformableInterfaceState2D>>,
  initialCohesionOffset: number,
): {
  readonly result: NewtonResult;
  readonly completedStages: number;
} {
  let seedQ = [...initialQ];
  let aggregateIterations = 0;
  let aggregateNonMonotoneAcceptances = 0;
  let completedStages = 0;
  let last: NewtonResult | null = null;
  for (const offset of [
    initialCohesionOffset,
    initialCohesionOffset * 0.1,
    initialCohesionOffset * 0.01,
    0,
  ]) {
    const stage = solveNewton(
      context,
      seedQ,
      initialLambda,
      fixedLoadFactor,
      committedStates,
      null,
      offset,
    );
    aggregateIterations += stage.iterations;
    aggregateNonMonotoneAcceptances += stage.nonMonotoneAcceptances;
    last = stage;
    if (!stage.converged) break;
    seedQ = stage.q;
    completedStages += 1;
  }
  if (last === null) throw new Error("Numerical cohesion homotopy has no continuation stages.");
  return {
    result: {
      ...last,
      iterations: aggregateIterations,
      nonMonotoneAcceptances: aggregateNonMonotoneAcceptances,
    },
    completedStages,
  };
}

function equilibriumResult(
  context: SolverContext,
  evaluation: SystemEvaluation,
): MasonryArchEquilibriumResidual {
  let forceX = 0;
  let forceY = 0;
  let moment = 0;
  for (const block of context.model.geometry.voussoirs) {
    const base = 3 * block.index;
    const displacement = evaluation.displacements[block.index]!;
    const centroid = {
      x: block.centroid.x + displacement.translation.x,
      y: block.centroid.y + displacement.translation.y,
    };
    const force = { x: evaluation.residual[base]!, y: evaluation.residual[base + 1]! };
    forceX += force.x;
    forceY += force.y;
    moment += cross2d(centroid, force) + evaluation.residual[base + 2]!;
  }
  return {
    forceResidual: { x: forceX, y: forceY },
    momentResidual: moment,
    maximumNormalizedBlockResidual: residualMeasure(context, evaluation.residual),
    normalizedGlobalResidual: {
      forceX: forceX / context.forceScale,
      forceY: forceY / context.forceScale,
      moment: moment / (context.forceScale * context.lengthScale),
    },
    tolerance: context.tolerance,
  };
}

function controlDof(
  model: NormalizedMasonryArchModel,
  control: {
    readonly blockId: string;
    readonly component: "x" | "y" | "rotation";
  },
): number {
  const block = model.geometry.voussoirs.find((item) => item.id === control.blockId);
  if (block === undefined) throw new Error(`Unknown nonlinear control block ${control.blockId}.`);
  return 3 * block.index + (control.component === "x" ? 0 : control.component === "y" ? 1 : 2);
}

function controlValue(q: readonly number[], referenceQ: readonly number[], dof: number): number {
  return q[dof]! - referenceQ[dof]!;
}

function actionScale(...groups: readonly ResolvedMasonryArchLoads[]): number {
  return Math.max(
    1,
    groups.reduce(
      (total, group) =>
        total +
        group.actions.reduce((sum, action) => sum + Math.hypot(action.force.x, action.force.y), 0),
      0,
    ),
  );
}

function appendHistoryPoint(
  steps: MasonryArchPathStep[],
  context: SolverContext,
  loading: ResolvedMasonryArchAnalysisLoads,
  previousEvaluation: SystemEvaluation,
  evaluation: SystemEvaluation,
  input: {
    readonly step: number;
    readonly stage: "fixed-preload" | "scalable-loading";
    readonly fixedLoadFactor: number;
    readonly lambda: number;
    readonly controlDisplacement: number;
    readonly iterations: number;
  },
): readonly MasonryArchEvent[] {
  const events = detectMasonryArchStepEvents(
    context.model,
    previousEvaluation,
    evaluation,
    input.step,
    input.lambda,
  );
  const state = createMasonryArchPathState(evaluation, {
    lambda: input.lambda,
    fixedLoadFactor: input.fixedLoadFactor,
    effectiveLoadFactorsByCaseId: effectiveStepLoadFactors(
      loading,
      input.lambda,
      input.fixedLoadFactor,
    ),
    equilibrium: equilibriumResult(context, evaluation),
  });
  steps.push({
    step: input.step,
    stage: input.stage,
    controlDisplacement: input.controlDisplacement,
    iterations: input.iterations,
    events,
    state,
  });
  return events;
}

function firstDisplacementControlSeed(
  context: SolverContext,
  q: readonly number[],
  lambda: number,
  committedStates: Readonly<Record<string, RigidBlockDeformableInterfaceState2D>>,
  dof: number,
  reference: number,
  target: number,
): NewtonResult {
  const targetIncrement = target - (q[dof]! - reference);
  let selectedProbe: NewtonResult | null = null;
  let selectedProbeLambda = lambda;
  for (const probeIncrement of [0.05, -0.05]) {
    const probeLambda = lambda + probeIncrement;
    const probe = solveNewton(context, q, probeLambda, 1, committedStates, null);
    if (!probe.converged) continue;
    const probeIncrementValue = probe.q[dof]! - q[dof]!;
    if (
      Math.abs(probeIncrementValue) > 1e-14 * context.lengthScale &&
      Math.sign(probeIncrementValue) === Math.sign(targetIncrement)
    ) {
      selectedProbe = probe;
      selectedProbeLambda = probeLambda;
      break;
    }
  }
  if (selectedProbe === null) {
    return solveNewton(context, q, lambda, 1, committedStates, {
      type: "displacement",
      dof,
      target,
      reference,
    });
  }
  const probeDisplacementIncrement = selectedProbe.q[dof]! - q[dof]!;
  const estimatedLambda =
    lambda + ((selectedProbeLambda - lambda) * targetIncrement) / probeDisplacementIncrement;
  const estimated = solveNewton(
    context,
    selectedProbe.q,
    estimatedLambda,
    1,
    committedStates,
    null,
  );
  if (!estimated.converged) return selectedProbe;
  return {
    ...estimated,
    iterations: selectedProbe.iterations + estimated.iterations,
    nonMonotoneAcceptances: selectedProbe.nonMonotoneAcceptances + estimated.nonMonotoneAcceptances,
  };
}

function hasZeroPhysicalCohesion(model: NormalizedMasonryArchModel): boolean {
  return [
    model.supports.left.interfaceLaw,
    model.interfaceLaw,
    model.supports.right.interfaceLaw,
  ].some((item) => item.friction?.cohesion === 0);
}

function arcLengthIncrementNorm(
  context: SolverContext,
  incrementQ: readonly number[],
  incrementLambda: number,
  loadScale: number,
): number {
  return sphericalArcLengthNorm(incrementQ, incrementLambda, {
    displacementScales: context.continuationSolver.coordinateScales,
    loadScale,
  });
}

function arcLengthPredictor(
  context: SolverContext,
  evaluation: SystemEvaluation,
  previousIncrementQ: readonly number[] | null,
  previousIncrementLambda: number | null,
  radius: number,
  loadScale: number,
): { readonly q: Vector; readonly lambda: number } {
  let directionQ: Vector;
  let directionLambda: number;
  if (previousIncrementQ !== null && previousIncrementLambda !== null) {
    directionQ = [...previousIncrementQ];
    directionLambda = previousIncrementLambda;
  } else {
    directionQ = solveLoadCorrection(context, {
      ...evaluation,
      residual: evaluation.scalableDerivative,
    });
    directionLambda = 1;
  }
  const scaled = scaleArcLengthDirection(directionQ, directionLambda, radius, {
    displacementScales: context.continuationSolver.coordinateScales,
    loadScale,
  });
  return {
    q: scaled.displacement,
    lambda: scaled.lambda,
  };
}

function validateNonlinearMechanicalModel(model: NormalizedMasonryArchModel): void {
  const entries = [
    ["supports.left.interface", model.supports.left.interfaceLaw],
    ["interfaces", model.interfaceLaw],
    ["supports.right.interface", model.supports.right.interfaceLaw],
  ] as const;
  const incompatible = entries
    .filter(([, item]) => item.deformability === null)
    .map(([label]) => label);
  if (incompatible.length > 0) {
    throw new Error(
      `The deformable-interface mechanical model requires model "deformable-no-tension" with explicit deformability at: ${incompatible.join(
        ", ",
      )}.`,
    );
  }
}

/**
 * Fixed-lambda corrector that certifies the exact design state at lambda = 1. When two
 * consecutive arc-length states bracket the crossing of lambda = 1, the corrector seeds a Newton
 * solve with the interpolated state and enforces lambda = 1 exactly. Certification requires both
 * Newton convergence and a satisfied equilibrium residual: a step that merely overshoots
 * lambda = 1 is never accepted as the design state. A failed corrector is a numerical
 * diagnostic, never a physical failure.
 */
function certifyDesignStateAtLambdaOne(
  context: SolverContext,
  previousQ: readonly number[],
  previousLambda: number,
  previousEvaluation: SystemEvaluation,
  crossingQ: readonly number[],
  crossingLambda: number,
  committedStates: Readonly<Record<string, RigidBlockDeformableInterfaceState2D>>,
): {
  readonly certified: boolean;
  readonly solved: NewtonResult | null;
  readonly attempts: number;
} {
  const target = 1;
  const attempts: NewtonResult[] = [];
  const denominator = crossingLambda - previousLambda;
  if (Math.abs(denominator) > 1e-14) {
    const ratio = (target - previousLambda) / denominator;
    const seedQ = previousQ.map((value, index) => value + ratio * (crossingQ[index]! - value));
    const interpolated = solveNewton(context, seedQ, target, 1, committedStates, null);
    attempts.push(interpolated);
    if (
      interpolated.converged &&
      equilibriumResult(context, interpolated.evaluation).maximumNormalizedBlockResidual <=
        context.tolerance
    ) {
      return { certified: true, solved: interpolated, attempts: attempts.length };
    }
  }
  const loadDirection = solveLoadCorrection(context, {
    ...previousEvaluation,
    residual: previousEvaluation.scalableDerivative,
  });
  const seedQ = previousQ.map(
    (value, index) => value + loadDirection[index]! * (target - previousLambda),
  );
  const tangentSeeded = solveNewton(context, seedQ, target, 1, committedStates, null);
  attempts.push(tangentSeeded);
  if (
    tangentSeeded.converged &&
    equilibriumResult(context, tangentSeeded.evaluation).maximumNormalizedBlockResidual <=
      context.tolerance
  ) {
    return { certified: true, solved: tangentSeeded, attempts: attempts.length };
  }
  return { certified: false, solved: null, attempts: attempts.length };
}

function resolveAnalysisObjective(
  options: AnalyzeMasonryArchPathOptions,
): MasonryArchAnalysisObjective {
  const objective = options.analysisObjective;
  if (
    objective !== "design-state-check" &&
    objective !== "capacity" &&
    objective !== "advanced-path"
  ) {
    throw new Error(`Unsupported masonry-arch analysisObjective: ${String(objective)}.`);
  }
  return objective;
}

function defaultMonitor(model: NormalizedMasonryArchModel): {
  readonly blockId: string;
  readonly component: "y";
} {
  return {
    blockId: model.geometry.voussoirs[Math.floor(model.geometry.voussoirs.length / 2)]!.id,
    component: "y",
  };
}

function resolveControl(
  model: NormalizedMasonryArchModel,
  options: AnalyzeMasonryArchPathOptions,
  objective: MasonryArchAnalysisObjective,
): MasonryArchPathControl {
  const assigned = options.control;
  let control: MasonryArchPathControl;
  if (assigned === undefined) {
    if (objective === "advanced-path") {
      throw new Error(
        "analysisObjective: advanced-path requires an explicit continuation control.",
      );
    }
    // The standard design-state verification is arc-length governed: the continuation follows
    // the primary branch and the design state is certified by a fixed-lambda corrector at the
    // crossing of lambda = 1. `targetPathLength` is only the safety cap. Adaptive load control
    // remains available as an explicit expert choice.
    control =
      objective === "design-state-check"
        ? {
            type: "arc-length",
            targetLambda: 1,
            targetPathLength: 10,
            monitor: defaultMonitor(model),
            initialRadius: 0.05,
          }
        : {
            type: "arc-length",
            monitor: defaultMonitor(model),
            targetPathLength: 1,
            initialRadius: 0.05,
          };
  } else if (assigned.type === "load" || assigned.type === "arc-length") {
    control = { ...assigned, monitor: assigned.monitor ?? defaultMonitor(model) };
  } else {
    control = assigned;
  }
  if (objective === "design-state-check") {
    if (control.type === "load" && Math.abs(control.targetLambda - 1) > 1e-12) {
      throw new Error(
        "analysisObjective: design-state-check requires adaptive load control with targetLambda: 1.",
      );
    }
    if (control.type === "displacement") {
      throw new Error(
        "analysisObjective: design-state-check cannot be certified with displacement control: the design state is defined at lambda = 1.",
      );
    }
    if (
      control.type === "arc-length" &&
      (control.targetLambda === undefined || Math.abs(control.targetLambda - 1) > 1e-12)
    ) {
      throw new Error(
        "analysisObjective: design-state-check with arc-length control requires targetLambda: 1; the exact design state is certified by a fixed-lambda corrector at the crossing.",
      );
    }
  }
  return control;
}

function effectiveStepLoadFactors(
  loading: ResolvedMasonryArchAnalysisLoads,
  lambda: number,
  fixedLoadFactor: number,
): Readonly<Record<string, number>> {
  const factors = effectiveMasonryArchLoadFactors(
    loading.base.loadFactorsByCaseId,
    loading.roleByCaseId,
    lambda,
    fixedLoadFactor,
  );
  return Object.fromEntries(
    Object.entries(factors).map(([id, factor]) => {
      if (factor === null) throw new Error(`Missing effective load factor for ${id}.`);
      return [id, factor];
    }),
  );
}

function nonlinearAnalysisOutcome(
  objective: MasonryArchAnalysisObjective,
  termination: MasonryArchPathOutputs["convergenceInfo"]["termination"],
  lambda: number,
): MasonryArchAnalysisOutcome {
  if (termination === "target-reached" || termination === "design-state-reached") {
    return {
      objective,
      objectiveStatus: objective === "capacity" ? "not-reached" : "satisfied",
      terminationCategory: "engineering-target",
      lambdaAtTermination: lambda,
    };
  }
  if (
    termination === "engineering-limit" ||
    termination === "terminal-physical-event" ||
    termination === "global-limit-point"
  ) {
    return {
      objective,
      objectiveStatus:
        objective === "capacity"
          ? "satisfied"
          : objective === "design-state-check"
            ? "not-satisfied"
            : "not-reached",
      terminationCategory: "physical-limit",
      lambdaAtTermination: lambda,
    };
  }
  return {
    objective,
    objectiveStatus: "not-verifiable",
    terminationCategory: "numerical-failure",
    lambdaAtTermination: Number.isFinite(lambda) ? lambda : null,
  };
}

export function analyzeMasonryArchPath(
  modelInput: MasonryArchModel | NormalizedMasonryArchModel | MasonryArchModelInput,
  options: AnalyzeMasonryArchPathOptions,
): MasonryArchPathResult {
  const analysisObjective = resolveAnalysisObjective(options);
  const model = asMasonryArchModel(modelInput);
  validateNonlinearMechanicalModel(model);
  const assignedControl = resolveControl(model, options, analysisObjective);
  const analysisSourceUnits = assertExplicitUnitSystem(
    options.units,
    "AnalyzeMasonryArchPathOptions",
  );
  const analysisUnitResolver = createUnitResolver(analysisSourceUnits, model.units);
  const normalizedControl: MasonryArchPathControl =
    assignedControl.type === "load"
      ? { ...assignedControl }
      : assignedControl.type === "arc-length"
        ? { ...assignedControl }
        : {
            ...assignedControl,
            increment:
              assignedControl.dof.component === "rotation"
                ? assignedControl.increment
                : analysisUnitResolver.length(assignedControl.increment),
            target:
              assignedControl.dof.component === "rotation"
                ? assignedControl.target
                : analysisUnitResolver.length(assignedControl.target),
          };
  const tolerance = finitePositive(
    options.equilibriumTolerance ?? 1e-8,
    "Nonlinear equilibriumTolerance",
  );
  const maxIterations = positiveInteger(options.maxIterations ?? 30, "Nonlinear maxIterations");
  const maxSteps = positiveInteger(options.maxSteps ?? 200, "Nonlinear maxSteps");
  const maximumLineSearchIterations = positiveInteger(
    options.maximumLineSearchIterations ?? 12,
    "Nonlinear maximumLineSearchIterations",
  );
  const minimumLineSearchFactor = finitePositive(
    options.minimumLineSearchFactor ?? 2 ** -12,
    "Nonlinear minimumLineSearchFactor",
  );
  if (minimumLineSearchFactor >= 1)
    throw new Error("Nonlinear minimumLineSearchFactor must be smaller than one.");
  const analysisLoads = resolveMasonryArchAnalysisLoads(model, options);
  const fixedLoads = analysisLoads.fixed;
  const scalableLoads = analysisLoads.scalable;
  const forceScale =
    actionScale(fixedLoads, scalableLoads) +
    model.reinforcements.reduce((sum, item) => sum + item.initialForce, 0);
  const lengthScale = Math.max(1, model.geometry.span, model.geometry.rise);
  const solutionSize = 3 * model.geometry.voussoirs.length;
  const continuationSolver = new NonlinearEquilibriumContinuationSolver<SystemEvaluation>({
    scaling: {
      residualScales: Array.from({ length: solutionSize }, (_, index) =>
        index % 3 === 2 ? 1 / (forceScale * lengthScale) : 1 / forceScale,
      ),
      coordinateScales: Array.from({ length: solutionSize }, (_, index) =>
        index % 3 === 2 ? 1 : lengthScale,
      ),
    },
    tolerance,
    maxIterations,
    maximumLineSearchIterations,
    minimumLineSearchFactor,
    ...(options.linearSolver === undefined ? {} : { linearSolver: options.linearSolver }),
  });
  const context: SolverContext = {
    model,
    fixedLoads,
    scalableLoads,
    forceScale,
    lengthScale,
    tolerance,
    maxIterations,
    maximumLineSearchIterations,
    minimumLineSearchFactor,
    continuationSolver,
  };
  const contactInitialization = options.contactInitialization ?? "cohesion-homotopy";
  const minimumInterfaceArea = Math.min(
    ...model.geometry.interfaces.map((item) => item.length * item.outOfPlaneWidth),
  );
  const initialCohesionOffset =
    contactInitialization === "cohesion-homotopy" && hasZeroPhysicalCohesion(model)
      ? (0.01 * context.forceScale) / minimumInterfaceArea
      : 0;

  const size = solutionSize;
  let q = zeroVector(size);
  let lambda = 0;
  let committedStates: Readonly<Record<string, RigidBlockDeformableInterfaceState2D>> = {};
  const steps: MasonryArchPathStep[] = [];
  const warnings: string[] = [];
  let totalIterations = 0;
  let cutbacks = 0;
  let nonMonotoneLineSearchAcceptances = 0;
  let completedCohesionHomotopyStages = 0;
  let failedLambdaTarget: number | null = null;
  let stepNumber = 0;
  let termination: MasonryArchPathOutputs["convergenceInfo"]["termination"] = "maximum-steps";
  let terminationReason: string | null = null;
  let failureMode: MasonryArchFailureMode = "no-collapse-within-model";
  const eventLog: MasonryArchEvent[] = [];
  let designStateCorrectorAttempts = 0;
  let verifiedLimitPoint: MasonryArchVerifiedLimitPoint | null = null;
  let lambdaBracket: MasonryArchLambdaBracket | null = null;
  // Classical limit-point condition: the lambda component of the unit continuation tangent at
  // the last converged state; it vanishes (or the tangent matrix becomes singular) exactly at a
  // turning point of the branch. Recorded as a diagnostic; used for certification only when the
  // forward traversal then fails.
  let tangentLambdaComponent: number | null = null;
  // `designFailureEvents` is additive: the configured kinds extend the always-active default
  // design-failure set. A stricter policy can therefore only add failures (for example
  // `["plastic-sliding"]`) and can never disable a default failure such as
  // `bonded-layer-capacity-reached`.
  const designFailureEvents = new Set<MasonryArchDesignFailureEventKind>([
    ...DEFAULT_DESIGN_FAILURE_EVENTS,
    ...(options.designFailureEvents ?? []),
  ]);
  if (
    options.engineeringLimitPolicy !== undefined &&
    options.engineeringLimitPolicy !== "objective-default" &&
    options.engineeringLimitPolicy !== "stop" &&
    options.engineeringLimitPolicy !== "continue"
  ) {
    throw new Error(
      `Unsupported masonry-arch engineeringLimitPolicy: ${String(options.engineeringLimitPolicy)}.`,
    );
  }
  const engineeringLimitPolicy =
    options.engineeringLimitPolicy === "stop"
      ? ("stop" as const)
      : options.engineeringLimitPolicy === "continue"
        ? ("continue" as const)
        : ("continue" as const);
  const selectedControlDof = controlDof(
    model,
    normalizedControl.type === "load" || normalizedControl.type === "arc-length"
      ? normalizedControl.monitor!
      : normalizedControl.dof,
  );

  let preloadFactor = 0;
  let preloadStep =
    normalizedControl.type === "load" ? Math.min(0.25, normalizedControl.initialStep ?? 0.1) : 0.1;
  let finalEvaluation = evaluateSystem(context, q, 0, 0, committedStates, true);
  while (preloadFactor < 1 - 1e-14 && stepNumber < maxSteps) {
    const target = Math.min(1, preloadFactor + preloadStep);
    const initialized =
      preloadFactor === 0 && initialCohesionOffset > 0
        ? solveWithCohesionHomotopy(context, q, 0, target, committedStates, initialCohesionOffset)
        : {
            result: solveNewton(context, q, 0, target, committedStates, null),
            completedStages: 0,
          };
    const solved = initialized.result;
    completedCohesionHomotopyStages += initialized.completedStages;
    totalIterations += solved.iterations;
    nonMonotoneLineSearchAcceptances += solved.nonMonotoneAcceptances;
    if (!solved.converged) {
      preloadStep /= 2;
      cutbacks += 1;
      if (preloadStep < 1e-5) {
        termination = "fixed-preload-failed";
        terminationReason =
          "The fixed-load initialization could not converge: the fixed state is numerically undeterminable.";
        failureMode = "undetermined";
        if (solved.warning !== null) warnings.push(solved.warning);
        eventLog.push(
          event(
            "numerical-failure",
            "convergence-lost",
            null,
            0,
            [],
            "Fixed-load initialization lost convergence.",
          ),
        );
        break;
      }
      continue;
    }
    const previousEvaluation = finalEvaluation;
    q = solved.q;
    preloadFactor = target;
    committedStates = solved.evaluation.trialStates;
    finalEvaluation = solved.evaluation;
    stepNumber += 1;
    const stepEvents = appendHistoryPoint(
      steps,
      context,
      analysisLoads,
      previousEvaluation,
      solved.evaluation,
      {
        step: stepNumber,
        stage: "fixed-preload",
        fixedLoadFactor: preloadFactor,
        lambda: 0,
        controlDisplacement: 0,
        iterations: solved.iterations,
      },
    );
    eventLog.push(...stepEvents);
    if (
      shouldStopMasonryArchPathForEvents(
        analysisObjective,
        engineeringLimitPolicy,
        stepEvents,
        designFailureEvents,
      )
    ) {
      failureMode = masonryArchFailureModeFromEvents(stepEvents);
      termination = stepEvents.some((item) => item.category === "terminal-physical-event")
        ? "terminal-physical-event"
        : "engineering-limit";
      break;
    }
    if (solved.iterations <= 5) preloadStep = Math.min(0.25, preloadStep * 1.5);
  }

  const preloadCompleted = preloadFactor >= 1 - 1e-14;
  const referenceQ = [...q];
  if (preloadCompleted) {
    if (normalizedControl.type === "load") {
      const targetLambda = finitePositive(normalizedControl.targetLambda, "Nonlinear targetLambda");
      let loadStep = finitePositive(normalizedControl.initialStep ?? 0.1, "Nonlinear initialStep");
      const minimumStep = finitePositive(
        normalizedControl.minimumStep ?? 1e-5,
        "Nonlinear minimumStep",
      );
      const maximumStep = finitePositive(
        normalizedControl.maximumStep ?? 0.25,
        "Nonlinear maximumStep",
      );
      if (minimumStep > maximumStep)
        throw new Error("Nonlinear minimumStep cannot exceed maximumStep.");
      loadStep = Math.min(loadStep, maximumStep);
      while (lambda < targetLambda - 1e-14 && stepNumber < maxSteps) {
        const target = Math.min(targetLambda, lambda + loadStep);
        const solved = solveNewton(context, q, target, 1, committedStates, null);
        totalIterations += solved.iterations;
        nonMonotoneLineSearchAcceptances += solved.nonMonotoneAcceptances;
        if (!solved.converged) {
          loadStep /= 2;
          cutbacks += 1;
          if (loadStep < minimumStep) {
            termination = "minimum-step";
            terminationReason = "Adaptive load control exhausted its minimum step.";
            failureMode = "undetermined";
            if (solved.warning !== null) warnings.push(solved.warning);
            failedLambdaTarget = target;
            eventLog.push(
              event(
                "numerical-failure",
                "convergence-lost",
                null,
                lambda,
                [],
                "Adaptive load control exhausted its minimum step.",
              ),
            );
            break;
          }
          continue;
        }
        const previousEvaluation = finalEvaluation;
        q = solved.q;
        lambda = target;
        committedStates = solved.evaluation.trialStates;
        finalEvaluation = solved.evaluation;
        stepNumber += 1;
        const stepEvents = appendHistoryPoint(
          steps,
          context,
          analysisLoads,
          previousEvaluation,
          solved.evaluation,
          {
            step: stepNumber,
            stage: "scalable-loading",
            fixedLoadFactor: 1,
            lambda,
            controlDisplacement: q[selectedControlDof]! - referenceQ[selectedControlDof]!,
            iterations: solved.iterations,
          },
        );
        eventLog.push(...stepEvents);
        if (
          shouldStopMasonryArchPathForEvents(
            analysisObjective,
            engineeringLimitPolicy,
            stepEvents,
            designFailureEvents,
          )
        ) {
          failureMode = masonryArchFailureModeFromEvents(stepEvents);
          termination = stepEvents.some((item) => item.category === "terminal-physical-event")
            ? "terminal-physical-event"
            : "engineering-limit";
          break;
        }
        if (solved.iterations <= 5) loadStep = Math.min(maximumStep, loadStep * 1.5);
        else if (solved.iterations >= 12) loadStep = Math.max(minimumStep, loadStep / 2);
      }
      if (lambda >= targetLambda - 1e-14 && termination === "maximum-steps")
        termination = "target-reached";
    } else if (normalizedControl.type === "displacement") {
      const increment = finiteNonZero(
        normalizedControl.increment,
        "Nonlinear displacement increment",
      );
      const targetDisplacement = finiteNonZero(normalizedControl.target, "Nonlinear target");
      if (Math.sign(increment) !== Math.sign(targetDisplacement)) {
        throw new Error(
          "Nonlinear displacement increment and targetDisplacement must have the same sign.",
        );
      }
      let prescribed = 0;
      let previousPathQ = [...referenceQ];
      let previousPathLambda = 0;
      let previousPrescribed = 0;
      while (Math.abs(prescribed) < Math.abs(targetDisplacement) - 1e-14 && stepNumber < maxSteps) {
        const next =
          Math.abs(prescribed + increment) > Math.abs(targetDisplacement)
            ? targetDisplacement
            : prescribed + increment;
        let seedQ: readonly number[] = q;
        let seedLambda = lambda;
        if (prescribed === 0) {
          const seed = firstDisplacementControlSeed(
            context,
            q,
            lambda,
            committedStates,
            selectedControlDof,
            referenceQ[selectedControlDof]!,
            next,
          );
          totalIterations += seed.iterations;
          nonMonotoneLineSearchAcceptances += seed.nonMonotoneAcceptances;
          if (seed.converged) {
            seedQ = seed.q;
            seedLambda = seed.lambda;
          }
        } else {
          const denominator = prescribed - previousPrescribed;
          const ratio = denominator === 0 ? 1 : (next - prescribed) / denominator;
          seedQ = q.map((value, index) => value + ratio * (value - previousPathQ[index]!));
          seedLambda = lambda + ratio * (lambda - previousPathLambda);
        }
        const solved = solveNewton(context, seedQ, seedLambda, 1, committedStates, {
          type: "displacement",
          dof: selectedControlDof,
          target: next,
          reference: referenceQ[selectedControlDof]!,
        });
        totalIterations += solved.iterations;
        nonMonotoneLineSearchAcceptances += solved.nonMonotoneAcceptances;
        if (!solved.converged) {
          termination = "minimum-step";
          terminationReason = "Displacement control lost convergence.";
          failureMode = "undetermined";
          if (solved.warning !== null) warnings.push(solved.warning);
          eventLog.push(
            event(
              "numerical-failure",
              "convergence-lost",
              null,
              lambda,
              [],
              "Displacement control lost convergence.",
            ),
          );
          break;
        }
        previousPathQ = [...q];
        previousPathLambda = lambda;
        previousPrescribed = prescribed;
        const previousEvaluation = finalEvaluation;
        q = solved.q;
        lambda = solved.lambda;
        prescribed = next;
        committedStates = solved.evaluation.trialStates;
        finalEvaluation = solved.evaluation;
        stepNumber += 1;
        const stepEvents = appendHistoryPoint(
          steps,
          context,
          analysisLoads,
          previousEvaluation,
          solved.evaluation,
          {
            step: stepNumber,
            stage: "scalable-loading",
            fixedLoadFactor: 1,
            lambda,
            controlDisplacement: controlValue(q, referenceQ, selectedControlDof),
            iterations: solved.iterations,
          },
        );
        eventLog.push(...stepEvents);
        if (
          shouldStopMasonryArchPathForEvents(
            analysisObjective,
            engineeringLimitPolicy,
            stepEvents,
            designFailureEvents,
          )
        ) {
          failureMode = masonryArchFailureModeFromEvents(stepEvents);
          termination = stepEvents.some((item) => item.category === "terminal-physical-event")
            ? "terminal-physical-event"
            : "engineering-limit";
          break;
        }
      }
      if (
        Math.abs(prescribed) >= Math.abs(targetDisplacement) - 1e-14 &&
        termination === "maximum-steps"
      ) {
        termination = "target-reached";
      }
    } else {
      const targetPathLength = finitePositive(
        normalizedControl.targetPathLength,
        "Nonlinear arc-length targetPathLength",
      );
      const arcTarget = normalizedControl.targetLambda ?? null;
      if (arcTarget !== null) {
        finitePositive(arcTarget, "Nonlinear arc-length targetLambda");
      }
      let radius = finitePositive(
        normalizedControl.initialRadius ?? 0.05,
        "Nonlinear arc-length initialRadius",
      );
      const minimumRadius = finitePositive(
        normalizedControl.minimumRadius ?? 1e-4,
        "Nonlinear arc-length minimumRadius",
      );
      const maximumRadius = finitePositive(
        normalizedControl.maximumRadius ?? 0.2,
        "Nonlinear arc-length maximumRadius",
      );
      const loadScale = finitePositive(
        normalizedControl.loadScale ?? 1,
        "Nonlinear arc-length loadScale",
      );
      if (minimumRadius > maximumRadius) {
        throw new Error("Nonlinear arc-length minimumRadius cannot exceed maximumRadius.");
      }
      radius = Math.min(radius, maximumRadius);
      const initialRadiusForLeaps = radius;
      const leapRadiusThreshold = Math.max(minimumRadius, initialRadiusForLeaps / 16);
      let accumulatedPathLength = 0;
      let previousIncrementQ: Vector | null = null;
      let previousIncrementLambda: number | null = null;
      let previousStepLambdaIncrement: number | null = null;
      let leapAttempted = false;
      while (accumulatedPathLength < targetPathLength - 1e-14 && stepNumber < maxSteps) {
        const stepRadius = Math.min(radius, targetPathLength - accumulatedPathLength);
        {
          try {
            const tangentDirection = solveLoadCorrection(context, {
              ...finalEvaluation,
              residual: finalEvaluation.scalableDerivative,
            });
            const tangentNorm = arcLengthIncrementNorm(context, tangentDirection, 1, loadScale);
            tangentLambdaComponent = tangentNorm > 0 ? 1 / tangentNorm : 1;
          } catch {
            tangentLambdaComponent = 0;
          }
        }
        let predictor: { readonly q: Vector; readonly lambda: number };
        try {
          predictor = arcLengthPredictor(
            context,
            finalEvaluation,
            previousIncrementQ,
            previousIncrementLambda,
            stepRadius,
            loadScale,
          );
        } catch (error) {
          termination = "minimum-step";
          terminationReason = `Arc-length predictor failed: ${String(error)}`;
          failureMode = "undetermined";
          warnings.push(`Arc-length predictor failed: ${String(error)}`);
          eventLog.push(
            event(
              "numerical-failure",
              "convergence-lost",
              null,
              lambda,
              [],
              `Arc-length predictor failed: ${String(error)}`,
            ),
          );
          break;
        }
        const referenceStepQ = [...q];
        const referenceStepLambda = lambda;
        const seedQ = q.map((value, index) => value + predictor.q[index]!);
        const seedLambda = lambda + predictor.lambda;
        let solved = solveNewton(context, seedQ, seedLambda, 1, committedStates, {
          type: "arc-length",
          referenceQ: referenceStepQ,
          referenceLambda: referenceStepLambda,
          radius: stepRadius,
          loadScale,
        });
        totalIterations += solved.iterations;
        nonMonotoneLineSearchAcceptances += solved.nonMonotoneAcceptances;
        if (!solved.converged) {
          radius /= 2;
          cutbacks += 1;
          if (radius < minimumRadius) {
            // Tangent-based limit-point certification: the last converged state has a singular
            // or nearly vertical continuation tangent (the classical turning-point condition)
            // and the forward traversal could not proceed beyond it. The limit point is
            // certified at that state; a discrete local plastic event alone never qualifies.
            if (tangentLambdaComponent !== null && tangentLambdaComponent < 1e-4) {
              verifiedLimitPoint = {
                lambda,
                bracket: { lower: lambda, upper: lambda },
                refinementSteps: 0,
                certified: true,
              };
              lambdaBracket = {
                lower: lambda,
                upper: lambda,
                certified: true,
                meaning: "equilibrium-limit-point-bracket",
              };
              termination = "global-limit-point";
              terminationReason =
                `The continuation tangent at the last converged state is singular or nearly ` +
                `vertical (lambda component ${tangentLambdaComponent}), the classical global ` +
                `limit-point condition, and no further arc step could traverse it.`;
              failureMode = "instability";
              eventLog.push(
                event(
                  "engineering-limit",
                  "equilibrium-limit-point",
                  steps.at(-1)?.step ?? stepNumber,
                  lambda,
                  [],
                  terminationReason,
                ),
              );
              break;
            }
            termination = "minimum-step";
            terminationReason = "Arc-length control exhausted its minimum radius.";
            failureMode = "undetermined";
            if (solved.warning !== null) warnings.push(solved.warning);
            eventLog.push(
              event(
                "numerical-failure",
                "convergence-lost",
                null,
                lambda,
                [],
                "Arc-length control exhausted its minimum radius.",
              ),
            );
            break;
          }
          // Turning-point traversal attempt: when repeated cutbacks stall in front of a
          // possible turning point, one maximum-radius arc step in the same tangent direction
          // may traverse it. The two converged sides then certify the limit point with
          // bracketing refinement; a failed leap is an ordinary cutback.
          if (radius <= leapRadiusThreshold && !leapAttempted) {
            leapAttempted = true;
            const leapRadius = maximumRadius;
            let leapPredictor: { readonly q: Vector; readonly lambda: number };
            try {
              leapPredictor = arcLengthPredictor(
                context,
                finalEvaluation,
                previousIncrementQ,
                previousIncrementLambda,
                leapRadius,
                loadScale,
              );
            } catch {
              continue;
            }
            const leapSeedQ = q.map((value, index) => value + leapPredictor.q[index]!);
            const leapSeedLambda = lambda + leapPredictor.lambda;
            const leap = solveNewton(context, leapSeedQ, leapSeedLambda, 1, committedStates, {
              type: "arc-length",
              referenceQ: referenceStepQ,
              referenceLambda: referenceStepLambda,
              radius: leapRadius,
              loadScale,
            });
            totalIterations += leap.iterations;
            nonMonotoneLineSearchAcceptances += leap.nonMonotoneAcceptances;
            if (leap.converged) {
              cutbacks += 1;
              solved = leap;
            } else {
              continue;
            }
          } else {
            continue;
          }
        }

        // The direction the tangent predicted for this step, before it is overwritten below.
        const riseDirectionQ = previousIncrementQ;
        const riseDirectionLambda = previousIncrementLambda;

        // Crossing of the design target: the exact lambda = 1 state is certified by a
        // fixed-lambda corrector. The overshooting arc step is never accepted as the design
        // state, and a failed corrector is retried with a smaller radius, never promoted to a
        // capacity or a failure.
        if (
          arcTarget !== null &&
          referenceStepLambda < arcTarget - 1e-12 &&
          solved.lambda >= arcTarget - 1e-12
        ) {
          const corrector = certifyDesignStateAtLambdaOne(
            context,
            referenceStepQ,
            referenceStepLambda,
            finalEvaluation,
            solved.q,
            solved.lambda,
            committedStates,
          );
          if (corrector.solved !== null) totalIterations += corrector.solved.iterations;
          designStateCorrectorAttempts += corrector.attempts;
          if (corrector.certified) {
            const previousEvaluation = finalEvaluation;
            q = corrector.solved!.q;
            lambda = arcTarget;
            finalEvaluation = corrector.solved!.evaluation;
            stepNumber += 1;
            const stepEvents = appendHistoryPoint(
              steps,
              context,
              analysisLoads,
              previousEvaluation,
              finalEvaluation,
              {
                step: stepNumber,
                stage: "scalable-loading",
                fixedLoadFactor: 1,
                lambda: arcTarget,
                controlDisplacement: controlValue(q, referenceQ, selectedControlDof),
                iterations: corrector.solved!.iterations,
              },
            );
            eventLog.push(...stepEvents);
            if (
              shouldStopMasonryArchPathForEvents(
                analysisObjective,
                engineeringLimitPolicy,
                stepEvents,
                designFailureEvents,
              )
            ) {
              failureMode = masonryArchFailureModeFromEvents(stepEvents);
              termination = stepEvents.some((item) => item.category === "terminal-physical-event")
                ? "terminal-physical-event"
                : "engineering-limit";
              terminationReason =
                "The exact lambda = 1 design state was reached and equilibrated but violates the prescribed criteria.";
            } else {
              termination = "design-state-reached";
              terminationReason =
                "The primary branch crossed lambda = 1 and the fixed-lambda corrector certified the exact design state.";
            }
            break;
          }
          radius = Math.max(minimumRadius, radius / 4);
          if (radius <= minimumRadius * (1 + 1e-12)) {
            termination = "design-state-not-certified";
            terminationReason =
              "The fixed-lambda corrector could not certify the design state at lambda = 1.";
            failureMode = "undetermined";
            eventLog.push(
              event(
                "numerical-failure",
                "convergence-lost",
                null,
                lambda,
                [],
                "The fixed-lambda corrector could not certify the design state at lambda = 1.",
              ),
            );
            break;
          }
          continue;
        }

        previousIncrementQ = solved.q.map((value, index) => value - referenceStepQ[index]!);
        previousIncrementLambda = solved.lambda - referenceStepLambda;
        leapAttempted = false;
        const completedRadius = arcLengthIncrementNorm(
          context,
          previousIncrementQ,
          previousIncrementLambda,
          loadScale,
        );
        const previousEvaluation = finalEvaluation;
        q = solved.q;
        lambda = solved.lambda;
        accumulatedPathLength += completedRadius;
        committedStates = solved.evaluation.trialStates;
        finalEvaluation = solved.evaluation;
        stepNumber += 1;
        const stepEvents = appendHistoryPoint(
          steps,
          context,
          analysisLoads,
          previousEvaluation,
          solved.evaluation,
          {
            step: stepNumber,
            stage: "scalable-loading",
            fixedLoadFactor: 1,
            lambda,
            controlDisplacement: controlValue(q, referenceQ, selectedControlDof),
            iterations: solved.iterations,
          },
        );
        eventLog.push(...stepEvents);
        if (
          shouldStopMasonryArchPathForEvents(
            analysisObjective,
            engineeringLimitPolicy,
            stepEvents,
            designFailureEvents,
          )
        ) {
          failureMode = masonryArchFailureModeFromEvents(stepEvents);
          termination = stepEvents.some((item) => item.category === "terminal-physical-event")
            ? "terminal-physical-event"
            : "engineering-limit";
          terminationReason =
            "A physical or engineering limit terminated the primary branch before the continuation target.";
          break;
        }

        // Global limit-point certification. A turning point of the primary branch is certified
        // only when two consecutive converged states show tangent load components of opposite
        // sign above the numerical noise threshold; a discrete local plastic event is never a
        // certified limit point. The rising side is then refined with halved arc increments so
        // the reported lambda is the maximum lambda verified on the primary branch.
        const deltaLambda = lambda - referenceStepLambda;
        if (
          previousStepLambdaIncrement !== null &&
          Math.abs(previousStepLambdaIncrement) >= 1e-6 &&
          Math.abs(deltaLambda) >= 1e-6 &&
          previousStepLambdaIncrement * deltaLambda < 0
        ) {
          let risingQ = [...referenceStepQ];
          let risingLambda = referenceStepLambda;
          let risingEval = previousEvaluation;
          let directionQ: Vector | null = riseDirectionQ;
          let directionLambda: number | null = riseDirectionLambda;
          let refined = risingLambda;
          let refinementSteps = 0;
          let refinementRadius = Math.max(minimumRadius, completedRadius / 2);
          while (refinementSteps < 6) {
            let refinementPredictor: { readonly q: Vector; readonly lambda: number };
            try {
              refinementPredictor = arcLengthPredictor(
                context,
                risingEval,
                directionQ,
                directionLambda,
                refinementRadius,
                loadScale,
              );
            } catch {
              break;
            }
            const refinementSeedQ = risingQ.map(
              (value, index) => value + refinementPredictor.q[index]!,
            );
            const refinementSeedLambda = risingLambda + refinementPredictor.lambda;
            const bisection = solveNewton(
              context,
              refinementSeedQ,
              refinementSeedLambda,
              1,
              risingEval.trialStates,
              {
                type: "arc-length",
                referenceQ: risingQ,
                referenceLambda: risingLambda,
                radius: refinementRadius,
                loadScale,
              },
            );
            totalIterations += bisection.iterations;
            nonMonotoneLineSearchAcceptances += bisection.nonMonotoneAcceptances;
            if (!bisection.converged) break;
            const bisectionDelta = bisection.lambda - risingLambda;
            if (bisectionDelta < 1e-6) break;
            const priorRefinementEval = risingEval;
            const priorRisingQ = risingQ;
            risingQ = [...bisection.q];
            risingLambda = bisection.lambda;
            risingEval = bisection.evaluation;
            directionQ = bisection.q.map((value, index) => value - priorRisingQ[index]!);
            directionLambda = bisectionDelta;
            refined = risingLambda;
            stepNumber += 1;
            const refinementEvents = appendHistoryPoint(
              steps,
              context,
              analysisLoads,
              priorRefinementEval,
              bisection.evaluation,
              {
                step: stepNumber,
                stage: "scalable-loading",
                fixedLoadFactor: 1,
                lambda: risingLambda,
                controlDisplacement: controlValue(risingQ, referenceQ, selectedControlDof),
                iterations: bisection.iterations,
              },
            );
            eventLog.push(...refinementEvents);
            refinementSteps += 1;
            refinementRadius = Math.max(minimumRadius, refinementRadius / 2);
          }
          lambda = refined;
          finalEvaluation = risingEval;
          const lower = Math.min(lambda, referenceStepLambda);
          verifiedLimitPoint = {
            lambda: refined,
            bracket: { lower, upper: refined },
            refinementSteps,
            certified: true,
          };
          lambdaBracket = {
            lower,
            upper: refined,
            certified: true,
            meaning: "equilibrium-limit-point-bracket",
          };
          termination = "global-limit-point";
          terminationReason =
            `The primary equilibrium branch turns at a certified global limit point: the maximum ` +
            `verified lambda is ${refined}, bracketed along the continuation between two converged ` +
            `states (refinement steps: ${refinementSteps}).`;
          failureMode = "instability";
          eventLog.push(
            event(
              "engineering-limit",
              "equilibrium-limit-point",
              steps.at(-1)?.step ?? stepNumber,
              refined,
              [],
              terminationReason,
            ),
          );
          break;
        }
        previousStepLambdaIncrement = deltaLambda;
        if (solved.iterations <= 5) radius = Math.min(maximumRadius, radius * 1.25);
        else if (solved.iterations >= 12) radius = Math.max(minimumRadius, radius / 2);
      }
      if (
        arcTarget === null &&
        accumulatedPathLength >= targetPathLength - 1e-14 &&
        termination === "maximum-steps"
      ) {
        termination = "target-reached";
        terminationReason = "The requested arc-length continuation target was reached.";
      }
    }
  }

  if (stepNumber >= maxSteps && termination === "maximum-steps") {
    terminationReason = `The analysis exhausted maxSteps=${maxSteps}.`;
    warnings.push(`The nonlinear analysis reached maxSteps=${maxSteps}.`);
    eventLog.push(
      event(
        "numerical-failure",
        "convergence-lost",
        null,
        lambda,
        [],
        `The analysis exhausted maxSteps=${maxSteps}.`,
      ),
    );
  }
  const equilibrium = equilibriumResult(context, finalEvaluation);
  const lastHistory = steps.at(-1);
  const finalControlDisplacement = lastHistory?.controlDisplacement ?? 0;
  const reinforcementIds = [
    ...model.reinforcements.map((item) => item.id),
    ...model.bondedLayers.map((item) => item.id),
  ];
  const physicalLimitReached =
    termination === "engineering-limit" ||
    termination === "terminal-physical-event" ||
    termination === "global-limit-point";
  const analysisOutcome = nonlinearAnalysisOutcome(analysisObjective, termination, lambda);
  const numericalConvergence =
    (termination === "target-reached" ||
      termination === "design-state-reached" ||
      physicalLimitReached) &&
    equilibrium.maximumNormalizedBlockResidual <= tolerance;
  const limitEvents = eventLog.filter(
    (item) => item.category === "engineering-limit" || item.category === "terminal-physical-event",
  );
  const firstLimitEvent = limitEvents.find((item) => item.step !== null) ?? null;
  const scalableHistory = steps.filter((point) => point.stage === "scalable-loading");
  const fixedEquilibriumPoint = preloadCompleted
    ? (steps.findLast((point) => point.stage === "fixed-preload") ?? null)
    : null;
  const equilibriumPathHistory =
    fixedEquilibriumPoint === null ? scalableHistory : [fixedEquilibriumPoint, ...scalableHistory];
  const peakPoint = equilibriumPathHistory.reduce<MasonryArchPathStep | null>(
    (peak, point) => (peak === null || point.state.lambda > peak.state.lambda ? point : peak),
    null,
  );
  const terminalEvent = eventLog.find(
    (item) => item.category === "terminal-physical-event" && item.step === lastHistory?.step,
  );
  const lambdaCollapse = terminalEvent?.kind === "reinforcement-rupture" ? lambda : null;
  const stepByNumber = new Map(steps.map((item) => [item.step, item]));
  // A terminal physical event fails the design check, and so do events of the user-configured
  // design-failure set, and so does a certified global limit point of the primary branch. When a
  // step terminates through a physical event, every physical-limit event identified by that same
  // converged step is reported as a failed criterion too: the terminal step's limits are the
  // certified causes of termination, and a `stop-at-onset` step keeps its
  // `compression-strength-reached` criterion next to the terminal `crushing` one.
  const terminalStepNumbers = new Set(
    eventLog
      .filter((item) => item.category === "terminal-physical-event" && item.step !== null)
      .map((item) => item.step),
  );
  const designFailedEvents = eventLog
    .filter(
      (item) =>
        item.category === "terminal-physical-event" ||
        item.kind === "equilibrium-limit-point" ||
        (isMasonryArchPhysicalLimitEventKind(item.kind) && designFailureEvents.has(item.kind)) ||
        (isMasonryArchPhysicalLimitEventKind(item.kind) &&
          item.step !== null &&
          terminalStepNumbers.has(item.step)),
    )
    .sort(
      (left, right) =>
        (left.step ?? Number.POSITIVE_INFINITY) - (right.step ?? Number.POSITIVE_INFINITY),
    );
  const designAssessmentStatus: MasonryArchEngineeringAssessmentStatus =
    analysisObjective !== "design-state-check"
      ? "INDETERMINATE"
      : designFailedEvents.length > 0
        ? "FAIL"
        : (termination === "target-reached" || termination === "design-state-reached") &&
            numericalConvergence &&
            lambda >= 1 - 1e-12
          ? "PASS"
          : "INDETERMINATE";
  // Every criterion reads its numeric quantities from the event's own converged step. The same
  // violated condition re-identified at a later step does not duplicate the list: the earliest
  // identification wins while simultaneously violated distinct conditions are all preserved.
  const designFailedCriteria: MasonryArchEngineeringCriterion[] = [];
  const seenCriterionKeys = new Set<string>();
  for (const failedEvent of designFailedEvents) {
    const step = failedEvent.step === null ? null : (stepByNumber.get(failedEvent.step) ?? null);
    for (const criterion of masonryArchEngineeringCriteriaFromPathEvent(failedEvent, step)) {
      const key = `${criterion.kind}|${criterion.checkId ?? ""}|${[...criterion.entityIds]
        .sort()
        .join(",")}`;
      if (seenCriterionKeys.has(key)) continue;
      seenCriterionKeys.add(key);
      designFailedCriteria.push(criterion);
    }
  }
  const assessmentFailureMode =
    designAssessmentStatus === "FAIL"
      ? masonryArchFailureModeFromKinds(designFailedCriteria.map((item) => item.kind))
      : null;
  const engineeringAssessment: MasonryArchPathEngineeringAssessment | null =
    analysisObjective === "design-state-check"
      ? {
          question: MASONRY_ARCH_PATH_ASSESSMENT_QUESTION,
          status: designAssessmentStatus,
          requiredLambda: 1,
          lambda:
            designAssessmentStatus === "PASS"
              ? 1
              : designAssessmentStatus === "FAIL"
                ? (designFailedEvents[0]?.lambda ?? lastHistory?.state.lambda ?? null)
                : (lastHistory?.state.lambda ?? null),
          failedCriteria: designFailedCriteria,
          failureMode: assessmentFailureMode,
        }
      : null;
  // Logical phase A: the fixed-load state at lambda = 0. This is the necessary verification of
  // F_fixed before any scalable load is applied, not a construction stage.
  const fixedStateStep = steps.findLast((point) => point.stage === "fixed-preload") ?? null;
  const fixedStateBlockingEvents = designFailedEvents.filter(
    (item) => item.step !== null && stepByNumber.get(item.step)?.stage === "fixed-preload",
  );
  const fixedStateCriteria: MasonryArchEngineeringCriterion[] = [];
  const seenFixedCriterionKeys = new Set<string>();
  for (const failedEvent of fixedStateBlockingEvents) {
    const step = failedEvent.step === null ? null : (stepByNumber.get(failedEvent.step) ?? null);
    for (const criterion of masonryArchEngineeringCriteriaFromPathEvent(failedEvent, step)) {
      const key = `${criterion.kind}|${criterion.checkId ?? ""}|${[...criterion.entityIds]
        .sort()
        .join(",")}`;
      if (seenFixedCriterionKeys.has(key)) continue;
      seenFixedCriterionKeys.add(key);
      fixedStateCriteria.push(criterion);
    }
  }
  const fixedState: MasonryArchPathFixedStateResult = {
    status:
      fixedStateBlockingEvents.length > 0 ? "FAIL" : preloadCompleted ? "PASS" : "INDETERMINATE",
    lambda: 0,
    step: fixedStateStep?.step ?? null,
    failedCriteria: fixedStateCriteria,
    failureMode:
      fixedStateCriteria.length > 0
        ? masonryArchFailureModeFromKinds(fixedStateCriteria.map((item) => item.kind))
        : null,
  };
  // Lambda of the first event that makes satisfying the design verification at lambda = 1
  // impossible on the primary branch. Deliberately distinct from lambdaFirstLimit: a local
  // plastic sliding that redistributes never moves this value. When the fixed state itself
  // failed, no scalable lambda is defined and the verification limit stays null.
  let verificationLimit: number | null = null;
  let verificationStep: number | null = null;
  if (
    analysisObjective === "design-state-check" &&
    designAssessmentStatus === "FAIL" &&
    fixedState.status === "PASS"
  ) {
    const firstBlocking = designFailedEvents[0] ?? null;
    verificationLimit =
      firstBlocking?.kind === "equilibrium-limit-point"
        ? (verifiedLimitPoint?.lambda ?? firstBlocking.lambda)
        : (firstBlocking?.lambda ?? null);
    verificationStep = firstBlocking?.step ?? null;
  }
  const capacity: MasonryArchCapacityLandmarks = {
    lambdaFirstLimit: firstLimitEvent?.lambda ?? null,
    lambdaPeak:
      verifiedLimitPoint !== null ? verifiedLimitPoint.lambda : (peakPoint?.state.lambda ?? null),
    lambdaTermination: lastHistory?.state.lambda ?? null,
    lambdaCollapse,
    lambdaVerificationLimit: verificationLimit,
    steps: {
      firstLimit: firstLimitEvent?.step ?? null,
      peak: verifiedLimitPoint !== null ? (lastHistory?.step ?? null) : (peakPoint?.step ?? null),
      termination: lastHistory?.step ?? null,
      collapse: lambdaCollapse === null ? null : (lastHistory?.step ?? null),
      verificationLimit: verificationStep,
    },
    collapseDefinition:
      lambdaCollapse === null
        ? null
        : "Terminal reinforcement rupture identified by the assigned tensile or ultimate-strain criterion.",
  };
  const resolvedAnalysisOutcome: MasonryArchAnalysisOutcome =
    analysisObjective !== "design-state-check"
      ? analysisOutcome
      : {
          ...analysisOutcome,
          objectiveStatus:
            designAssessmentStatus === "PASS"
              ? "satisfied"
              : designAssessmentStatus === "FAIL"
                ? "not-satisfied"
                : "not-verifiable",
        };
  const successful =
    resolvedAnalysisOutcome.objectiveStatus === "satisfied" &&
    (termination === "target-reached" || termination === "design-state-reached") &&
    numericalConvergence;
  const linearSolver =
    context.continuationSolver.usedLinearSolvers.size > 1
      ? ("hybrid-compact-banded-and-dense-gaussian-elimination" as const)
      : context.continuationSolver.usedLinearSolvers.has("dense")
        ? ("dense-gaussian-elimination-partial-pivoting" as const)
        : ("compact-banded-gaussian-elimination-partial-pivoting" as const);
  const outputs: MasonryArchPathOutputs = {
    modelId: model.id,
    analysis: createMasonryArchAnalysisDescriptor(model, {
      analysisObjective,
      interfaceResponse: "deformable-zero-thickness-interfaces",
      kinematics: "finite-rigid-block",
      numericalStrategy: { type: "incremental-continuation", control: normalizedControl.type },
      lambda: createMasonryArchLambdaDefinition(
        analysisLoads,
        lambda,
        preloadCompleted ? 1 : preloadFactor,
      ),
    }),
    analysisOutcome: resolvedAnalysisOutcome,
    engineeringAssessment,
    capacity,
    events: eventLog,
    limitState: physicalLimitReached ? { lambda, failureMode } : null,
    failureMode,
    control: normalizedControl,
    steps,
    fixedState,
    significantSteps: {
      fixedState: fixedState.step,
      designState:
        analysisObjective === "design-state-check" && designAssessmentStatus === "PASS"
          ? (lastHistory?.step ?? null)
          : null,
      firstLimit: capacity.steps.firstLimit,
      verificationLimit: capacity.steps.verificationLimit,
      peak: capacity.steps.peak,
      lastConverged: capacity.steps.termination,
      termination: capacity.steps.termination,
    },
    curves: {
      lambdaDisplacement: steps.map((point) => ({
        displacement: point.controlDisplacement,
        lambda: point.state.lambda,
      })),
      reinforcementForceDisplacement: Object.fromEntries(
        reinforcementIds.map((id) => [
          id,
          steps.map((point) => ({
            displacement: point.controlDisplacement,
            force:
              point.state.reinforcementState.find((item) => item.reinforcementId === id)?.force ??
              point.state.bondedLayerState.find((item) => item.reinforcementId === id)
                ?.maximumForce ??
              0,
          })),
        ]),
      ),
    },
    convergenceInfo: {
      converged: numericalConvergence,
      termination,
      terminationReason,
      lastConvergedLambda: lastHistory?.state.lambda ?? null,
      maximumObservedLambda:
        equilibriumPathHistory.reduce<number | null>(
          (maximum, point) =>
            maximum === null || point.state.lambda > maximum ? point.state.lambda : maximum,
          null,
        ) ?? null,
      lastConvergedStep: lastHistory?.step ?? null,
      completedSteps: steps.length,
      totalIterations,
      cutbacks,
      nonMonotoneLineSearchAcceptances,
      numericalCohesionHomotopy: {
        used: completedCohesionHomotopyStages > 0,
        initialOffset: initialCohesionOffset,
        completedStages: completedCohesionHomotopyStages,
      },
      lambdaBracket:
        lambdaBracket ??
        (failedLambdaTarget === null
          ? null
          : {
              lower: lambda,
              upper: failedLambdaTarget,
              certified: false,
              meaning: "load-control-failure-bracket",
            }),
      verifiedLimitPoint,
      designStateCorrectorAttempts,
      tangentLambdaComponentAtTermination: tangentLambdaComponent,
      tangent: "corotational-interface-plus-numerical-reinforcement",
      linearSolver,
    },
  };
  if (finalEvaluation.reinforcement.hasInvalidContact) {
    warnings.push(
      "The final reinforcement configuration contains contact that cannot enforce the prescribed path.",
    );
  }
  if (
    context.continuationSolver.usedLinearSolvers.has("dense") &&
    model.geometry.voussoirCount > 80
  ) {
    warnings.push(
      "Active reinforcement introduced a dense globally coupled tangent; performance beyond 80 voussoirs must be checked explicitly.",
    );
  }
  return new CalculationResult<MasonryArchPathOutputs>({
    applicationId: "masonry-arch-path",
    status:
      engineeringAssessment !== null
        ? masonryArchResultStatusFromAssessmentStatus(engineeringAssessment.status)
        : successful
          ? RESULT_STATUS.OK
          : physicalLimitReached || resolvedAnalysisOutcome.objectiveStatus === "not-reached"
            ? RESULT_STATUS.NOT_VERIFIED
            : RESULT_STATUS.FAILED,
    summary:
      engineeringAssessment !== null
        ? engineeringAssessment.status === "PASS"
          ? "The factored design state at lambda = 1 was reached and equilibrated."
          : engineeringAssessment.status === "FAIL"
            ? `The design state failed verification at lambda ${engineeringAssessment.lambda ?? "unknown"} (${engineeringAssessment.failureMode ?? "undetermined"}).`
            : "The numerical process could not determine whether the design state satisfies the prescribed criteria."
        : successful
          ? analysisObjective === "design-state-check"
            ? "The factored design state at lambda = 1 was reached and equilibrated."
            : `The advanced nonlinear path reached the requested target at displacement ${finalControlDisplacement}.`
          : physicalLimitReached
            ? `The nonlinear path reached ${failureMode} at lambda ${lambda}.`
            : analysisObjective === "capacity" && termination === "target-reached"
              ? "The requested continuation target was reached before a physical capacity limit was identified."
              : "The nonlinear path did not satisfy its engineering objective.",
    outputs,
    warnings: [...warnings, ...finalEvaluation.reinforcement.warnings],
    assumptions: [
      "Two-dimensional finite rigid-voussoir kinematics with deformable zero-thickness interfaces.",
      "Normal contact is no-tension and integrated analytically over the global joint; reported fibers are sampling points only, and assigned stiffness uses the explicit characteristic length.",
      "Tangential response uses one joint-resultant elastic-perfectly-plastic Coulomb slip variable with zero dilation.",
      "When used, fixed-load contact initialization applies the reported auxiliary-cohesion homotopy and commits only its zero-offset physical stage.",
      "The fixed-load state F_fixed at lambda = 0 is verified first; no scalable lambda is defined when that state fails or cannot be certified.",
      "Fixed loads and initial reinforcement actions are proportionally initialized before scalable loading; active reinforcement uses its assigned T0 as part of the fixed state and passive reinforcement has T0 = 0.",
      "External dead-load forces retain their global direction while their material application points follow the block motion.",
      "Intrados reinforcement follows rigid deviators; an extrados tendon uses a compression-only taut-cable contact envelope.",
      "Bonded layers are local tension-only membrane springs with explicit transfer length and assigned tensile/debonding capacity.",
      "The design-state verification follows the primary equilibrium branch with adaptive arc length and certifies the exact lambda = 1 state with a fixed-lambda Newton corrector; an overshooting arc step is never accepted as the design state.",
      "A certified global limit point requires two consecutive converged states with tangent load components of opposite sign above the numerical noise threshold, plus bracketing refinement; a discrete local plastic event is never a certified limit point and max(steps.lambda) is never capacity by itself.",
      "Diagnostics such as lastConvergedLambda, maximumObservedLambda, and lambdaBracket are numerical observables, never capacity, never failure, and never the engineering verdict.",
      "Load control uses adaptive cutback; displacement control uses an augmented equilibrium equation.",
      "The engineering analysis objective is independent from the selected continuation control.",
      "F(lambda) = F_fixed + lambda * F_scalable after combination factors; initial prestress and deformation-dependent response quantities are not scaled by lambda.",
    ],
    metadata: {
      schemaVersion: MASONRY_ARCH_PATH_RESULT_SCHEMA_VERSION,
      modelSchemaVersion: model.schemaVersion,
      sourceUnits: model.sourceUnits,
      analysisSourceUnits,
      units: model.units,
      axes: { x: "right", y: "up", moment: "counter-clockwise" },
      solutionMeaning: "incremental-deformable-interface-equilibrium",
      analysisObjective,
      mechanicalModel: "deformable-zero-thickness-interfaces",
      numericalMethod: "incremental-continuation",
      control: normalizedControl.type,
      lambdaDefinition: outputs.analysis.lambda,
      loadCombinationId: options.loadCombination?.id ?? null,
      loadCombinationType: options.loadCombination?.combinationType ?? null,
      normativeConformityClaimed: false,
    },
  });
}
