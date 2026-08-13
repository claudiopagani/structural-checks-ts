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
import { DenseLinearSolver } from "../../domain/math/DenseLinearSolver.js";
import {
  GeneralBandedLinearSolver,
  addCompactBandedValue,
  compactBandedMatrixToDense,
  compactBandedValue,
  createCompactBandedMatrix,
  setCompactBandedValue,
  type CompactBandedMatrix,
} from "../../domain/math/GeneralBandedLinearSolver.js";
import {
  assertExplicitUnitSystem,
  createUnitResolver,
  type UnitSystemInput,
} from "../../domain/units/UnitSystem.js";
import { asMasonryArchModel } from "./analyzeMasonryArchState.js";
import { evaluateMasonryArchInterfaceConfigurationForSolver } from "./evaluateArchInterfaceConfiguration.js";
import type { MasonryArchModel } from "./MasonryArchModel.js";
import type {
  MasonryArchResolvedLoadAction,
  ResolvedMasonryArchLoads,
} from "./resolveMasonryArchLoads.js";
import { evaluateArchReinforcementConfiguration } from "./resolveArchReinforcements.js";
import { resolveBondedLayerInterfaceSections } from "./bondedLayers.js";
import type {
  ArchAnchorForceResult,
  ArchContactForceResult,
  ArchReinforcementStateResult,
  MasonryArchAnalysisDescriptor,
  MasonryArchAnalysisObjective,
  MasonryArchAnalysisOutcome,
  BondedLayerStateResult,
  MasonryArchBlockDisplacementInput,
  MasonryArchFailureMode,
  MasonryArchLoadCombinationLike,
  MasonryArchModelInput,
  NormalizedMasonryArchBlockDisplacement,
  NormalizedMasonryArchModel,
} from "./types.js";
import {
  createMasonryArchAnalysisDescriptor,
  createMasonryArchLambdaDefinition,
  effectiveMasonryArchLoadFactors,
  resolveMasonryArchAnalysisLoads,
  type ResolvedMasonryArchAnalysisLoads,
} from "./analysisSemantics.js";

export const MASONRY_ARCH_NONLINEAR_RESULT_SCHEMA_VERSION = "2.0.0";

export interface MasonryArchNonlinearLoadControl {
  readonly type: "load";
  readonly targetLambda: number;
  readonly monitor: {
    readonly blockId: string;
    readonly component: "x" | "y" | "rotation";
  };
  readonly initialStep?: number;
  readonly minimumStep?: number;
  readonly maximumStep?: number;
}

export interface MasonryArchNonlinearDisplacementControl {
  readonly type: "displacement";
  readonly blockId: string;
  readonly component: "x" | "y" | "rotation";
  /** Signed increment in model length units, or radians for rotation. */
  readonly increment: number;
  /** Signed target relative to the fixed-load equilibrium configuration. */
  readonly targetDisplacement: number;
}

export interface MasonryArchNonlinearArcLengthControl {
  readonly type: "arc-length";
  readonly monitor: {
    readonly blockId: string;
    readonly component: "x" | "y" | "rotation";
  };
  /** Requested cumulative dimensionless spherical path length. */
  readonly targetPathLength: number;
  readonly initialRadius?: number;
  readonly minimumRadius?: number;
  readonly maximumRadius?: number;
  /** Weight of the load-multiplier increment in the sphere; defaults to one. */
  readonly loadScale?: number;
}

export type MasonryArchNonlinearControl =
  | MasonryArchNonlinearLoadControl
  | MasonryArchNonlinearDisplacementControl
  | MasonryArchNonlinearArcLengthControl;

export interface AnalyzeMasonryArchNonlinearOptions {
  readonly units: UnitSystemInput;
  readonly geometricNonlinearity: true;
  /** Defaults to `advanced-path`; legacy calls routed through collapse default to `capacity`. */
  readonly analysisObjective?: MasonryArchAnalysisObjective;
  readonly loadCombination?: MasonryArchLoadCombinationLike | null;
  readonly scalableLoadCaseIds: readonly string[];
  readonly control: MasonryArchNonlinearControl;
  readonly equilibriumTolerance?: number;
  readonly maxIterations?: number;
  readonly maxSteps?: number;
  readonly maximumLineSearchIterations?: number;
  readonly minimumLineSearchFactor?: number;
  readonly stopAtFirstMaterialLimit?: boolean;
  /** Defaults to a reported auxiliary-cohesion continuation; `none` disables it. */
  readonly contactInitialization?: "cohesion-homotopy" | "none";
  /** `automatic` uses compact band storage unless global reinforcement coupling requires dense LU. */
  readonly linearSolver?: "automatic" | "dense";
}

export interface MasonryArchNonlinearInterfaceSummary {
  readonly interfaceId: string;
  readonly normalForce: number;
  readonly shearForce: number;
  readonly moment: number;
  readonly eccentricity: number | null;
  readonly compressedLength: number;
  readonly maxCompression: number;
  readonly frictionUtilization: number | null;
  readonly maximumOpening: number;
  readonly maximumClosure: number;
  readonly maximumAbsoluteSlip: number;
  readonly state: "open" | "compressed" | "sliding" | "crushing" | "sliding-and-crushing";
}

export interface MasonryArchNonlinearHistoryPoint {
  readonly step: number;
  readonly stage: "fixed-preload" | "scalable-loading";
  readonly fixedLoadFactor: number;
  readonly lambda: number;
  /** Effective case factors at this converged step, including fixed-load initialization. */
  readonly effectiveLoadFactorsByCaseId: Readonly<Record<string, number>>;
  readonly controlDisplacement: number;
  readonly iterations: number;
  readonly blockDisplacements: readonly NormalizedMasonryArchBlockDisplacement[];
  readonly interfaces: readonly MasonryArchNonlinearInterfaceSummary[];
  readonly reinforcementForces: Readonly<Record<string, number>>;
  readonly bondedLayerForces: Readonly<Record<string, number>>;
  readonly equilibrium: MasonryArchNonlinearEquilibriumResult;
}

export interface MasonryArchNonlinearEquilibriumResult {
  readonly forceResidual: RigidBlockVector2D;
  readonly momentResidual: number;
  readonly maximumNormalizedBlockResidual: number;
  readonly normalizedGlobalResidual: {
    readonly forceX: number;
    readonly forceY: number;
    readonly moment: number;
  };
  readonly tolerance: number;
}

export interface MasonryArchNonlinearOutputs extends Record<string, unknown> {
  readonly modelId: string;
  readonly analysis: MasonryArchAnalysisDescriptor;
  readonly analysisOutcome: MasonryArchAnalysisOutcome;
  readonly lambdaCritical: number | null;
  readonly limitState: {
    readonly lambda: number;
    readonly failureMode: MasonryArchFailureMode;
  } | null;
  readonly designStateCheck: {
    readonly criterion: "factored-load-state-at-lambda-one";
    readonly demand: 1;
    readonly reachedLambda: number;
    readonly status: "pass" | "fail" | "not-verifiable";
  } | null;
  readonly failureMode: MasonryArchFailureMode;
  readonly control: MasonryArchNonlinearControl;
  readonly history: readonly MasonryArchNonlinearHistoryPoint[];
  readonly curves: {
    readonly lambdaDisplacement: readonly {
      readonly displacement: number;
      readonly lambda: number;
    }[];
    readonly reinforcementForceDisplacement: Readonly<
      Record<string, readonly { readonly displacement: number; readonly force: number }[]>
    >;
  };
  readonly finalConfiguration: readonly NormalizedMasonryArchBlockDisplacement[];
  readonly interfaces: readonly RigidBlockDeformableInterfaceEvaluation2D[];
  readonly reinforcementState: readonly ArchReinforcementStateResult[];
  readonly anchorForces: readonly ArchAnchorForceResult[];
  readonly contactForces: readonly ArchContactForceResult[];
  readonly bondedLayerState: readonly BondedLayerStateResult[];
  readonly reactions: {
    readonly left: {
      readonly force: RigidBlockVector2D;
      readonly moment: number;
      readonly applicationPoint: RigidBlockPoint2D;
    };
    readonly right: {
      readonly force: RigidBlockVector2D;
      readonly moment: number;
      readonly applicationPoint: RigidBlockPoint2D;
    };
  };
  readonly equilibrium: MasonryArchNonlinearEquilibriumResult;
  readonly convergenceInfo: {
    readonly converged: boolean;
    readonly termination:
      | "target-reached"
      | "material-limit"
      | "minimum-step"
      | "maximum-steps"
      | "fixed-preload-failed";
    readonly completedSteps: number;
    readonly totalIterations: number;
    readonly cutbacks: number;
    readonly nonMonotoneLineSearchAcceptances: number;
    readonly numericalCohesionHomotopy: {
      readonly used: boolean;
      /** Auxiliary initial offset in model force/length^2 units; zero in the physical solution. */
      readonly initialOffset: number;
      readonly completedStages: number;
    };
    readonly lambdaBracket: {
      readonly lower: number;
      readonly upper: number;
    } | null;
    readonly tangent: "corotational-interface-plus-numerical-reinforcement";
    readonly linearSolver:
      | "compact-banded-gaussian-elimination-partial-pivoting"
      | "dense-gaussian-elimination-partial-pivoting"
      | "hybrid-compact-banded-and-dense-gaussian-elimination";
  };
}

export type MasonryArchNonlinearResult = CalculationResult<MasonryArchNonlinearOutputs>;

type Matrix = number[][];
type Vector = number[];
type TangentMatrix = Matrix | CompactBandedMatrix;

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
  readonly denseLinearSolver: DenseLinearSolver;
  readonly bandedLinearSolver: GeneralBandedLinearSolver;
  readonly linearSolverMethods: Set<"banded" | "dense">;
  readonly linearSolverPreference: "automatic" | "dense";
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

function tangentValue(matrix: TangentMatrix, row: number, column: number): number {
  return isCompactBandedMatrix(matrix)
    ? compactBandedValue(matrix, row, column)
    : matrix[row]![column]!;
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

function dofRowScale(index: number, forceScale: number, lengthScale: number): number {
  return index % 3 === 2 ? 1 / (forceScale * lengthScale) : 1 / forceScale;
}

function dofColumnScale(index: number, lengthScale: number): number {
  return index % 3 === 2 ? 1 : lengthScale;
}

function residualMeasure(context: SolverContext, residual: readonly number[]): number {
  return residual.reduce(
    (maximum, value, index) =>
      Math.max(
        maximum,
        Math.abs(value) * dofRowScale(index, context.forceScale, context.lengthScale),
      ),
    0,
  );
}

function tangentColumnScales(context: SolverContext, tangent: TangentMatrix): Vector {
  const size = isCompactBandedMatrix(tangent) ? tangent.size : tangent.length;
  return Array.from({ length: size }, (_, column) => {
    let maximum = 0;
    const firstRow = isCompactBandedMatrix(tangent)
      ? Math.max(0, column - tangent.upperBandwidth)
      : 0;
    const lastRow = isCompactBandedMatrix(tangent)
      ? Math.min(size - 1, column + tangent.lowerBandwidth)
      : size - 1;
    for (let row = firstRow; row <= lastRow; row += 1) {
      maximum = Math.max(
        maximum,
        Math.abs(
          dofRowScale(row, context.forceScale, context.lengthScale) *
            tangentValue(tangent, row, column),
        ),
      );
    }
    return maximum > 0 ? 1 / maximum : 1;
  });
}

function scaledTangent(
  context: SolverContext,
  tangent: TangentMatrix,
  columnScales: readonly number[],
): TangentMatrix {
  const size = isCompactBandedMatrix(tangent) ? tangent.size : tangent.length;
  if (isCompactBandedMatrix(tangent)) {
    const scaled = createCompactBandedMatrix(size, tangent.lowerBandwidth, tangent.upperBandwidth);
    for (let row = 0; row < size; row += 1) {
      const firstColumn = Math.max(0, row - tangent.lowerBandwidth);
      const lastColumn = Math.min(size - 1, row + tangent.upperBandwidth);
      const rowScale = dofRowScale(row, context.forceScale, context.lengthScale);
      for (let column = firstColumn; column <= lastColumn; column += 1) {
        setCompactBandedValue(
          scaled,
          row,
          column,
          rowScale * compactBandedValue(tangent, row, column) * columnScales[column]!,
        );
      }
    }
    return scaled;
  }
  const scaled = zeroMatrix(size);
  for (let row = 0; row < size; row += 1) {
    const rowScale = dofRowScale(row, context.forceScale, context.lengthScale);
    for (let column = 0; column < size; column += 1) {
      scaled[row]![column] = rowScale * tangent[row]![column]! * columnScales[column]!;
    }
  }
  return scaled;
}

function solveLoadCorrection(context: SolverContext, evaluation: SystemEvaluation): Vector {
  const size = evaluation.residual.length;
  const tangent =
    context.linearSolverPreference === "dense" && isCompactBandedMatrix(evaluation.tangent)
      ? compactBandedMatrixToDense(evaluation.tangent)
      : evaluation.tangent;
  const columnScales = tangentColumnScales(context, tangent);
  const matrix = scaledTangent(context, tangent, columnScales);
  const rhs = zeroVector(size);
  for (let row = 0; row < size; row += 1) {
    const rowScale = dofRowScale(row, context.forceScale, context.lengthScale);
    rhs[row] = -rowScale * evaluation.residual[row]!;
  }
  const scaledCorrection = isCompactBandedMatrix(matrix)
    ? (() => {
        context.linearSolverMethods.add("banded");
        return context.bandedLinearSolver.solve(matrix, rhs);
      })()
    : (() => {
        context.linearSolverMethods.add("dense");
        return context.denseLinearSolver.solve(matrix, rhs);
      })();
  return scaledCorrection.map((value, index) => value * columnScales[index]!);
}

function solveDisplacementCorrection(
  context: SolverContext,
  evaluation: SystemEvaluation,
  controlDof: number,
  controlGap: number,
): { readonly q: Vector; readonly lambda: number } {
  const size = evaluation.residual.length;
  const tangent =
    context.linearSolverPreference === "dense" && isCompactBandedMatrix(evaluation.tangent)
      ? compactBandedMatrixToDense(evaluation.tangent)
      : evaluation.tangent;
  const columnScales = tangentColumnScales(context, tangent);
  let lambdaColumnMaximum = 0;
  for (let row = 0; row < size; row += 1) {
    lambdaColumnMaximum = Math.max(
      lambdaColumnMaximum,
      Math.abs(
        dofRowScale(row, context.forceScale, context.lengthScale) *
          evaluation.scalableDerivative[row]!,
      ),
    );
  }
  if (lambdaColumnMaximum === 0) {
    throw new Error("The selected scalable load cases produce a zero nonlinear load vector.");
  }
  const lambdaColumnScale = 1 / lambdaColumnMaximum;
  if (isCompactBandedMatrix(tangent)) {
    const scaled = scaledTangent(context, tangent, columnScales);
    if (!isCompactBandedMatrix(scaled))
      throw new Error("Internal compact tangent scaling changed the storage type.");
    const residualRightHandSide = zeroVector(size);
    const lambdaRightHandSide = zeroVector(size);
    for (let row = 0; row < size; row += 1) {
      const rowScale = dofRowScale(row, context.forceScale, context.lengthScale);
      residualRightHandSide[row] = -rowScale * evaluation.residual[row]!;
      lambdaRightHandSide[row] = rowScale * evaluation.scalableDerivative[row]! * lambdaColumnScale;
    }
    context.linearSolverMethods.add("banded");
    const factorization = context.bandedLinearSolver.factorize(scaled);
    const [residualResponse, lambdaResponse] = factorization.solveMany([
      residualRightHandSide,
      lambdaRightHandSide,
    ]);
    const physicalResidualResponse = residualResponse!.map(
      (value, index) => value * columnScales[index]!,
    );
    const physicalLambdaResponse = lambdaResponse!.map(
      (value, index) => value * columnScales[index]!,
    );
    const controlDenominator = physicalLambdaResponse[controlDof]!;
    if (Math.abs(controlDenominator) <= 1e-14 * context.lengthScale) {
      throw new Error(
        "The selected displacement-control coordinate has zero incremental load response.",
      );
    }
    const scaledLambdaCorrection =
      (controlGap + physicalResidualResponse[controlDof]!) / controlDenominator;
    return {
      q: physicalResidualResponse.map(
        (value, index) => value - physicalLambdaResponse[index]! * scaledLambdaCorrection,
      ),
      lambda: scaledLambdaCorrection * lambdaColumnScale,
    };
  }

  const augmented = Array.from({ length: size + 1 }, () => new Array<number>(size + 1).fill(0));
  const rhs = new Array<number>(size + 1).fill(0);
  const controlRowScale = 1 / Math.abs(columnScales[controlDof]!);
  for (let row = 0; row < size; row += 1) {
    const rowScale = dofRowScale(row, context.forceScale, context.lengthScale);
    rhs[row] = -rowScale * evaluation.residual[row]!;
    for (let column = 0; column < size; column += 1) {
      augmented[row]![column] = rowScale * tangent[row]![column]! * columnScales[column]!;
    }
    augmented[row]![size] = rowScale * evaluation.scalableDerivative[row]! * lambdaColumnScale;
  }
  augmented[size]![controlDof] = columnScales[controlDof]! * controlRowScale;
  rhs[size] = -controlGap * controlRowScale;
  context.linearSolverMethods.add("dense");
  const correction = context.denseLinearSolver.solve(augmented, rhs);
  return {
    q: correction.slice(0, size).map((value, index) => value * columnScales[index]!),
    lambda: correction[size]! * lambdaColumnScale,
  };
}

interface ArcLengthConstraint {
  readonly type: "arc-length";
  readonly referenceQ: readonly number[];
  readonly referenceLambda: number;
  readonly radius: number;
  readonly loadScale: number;
}

interface DisplacementConstraint {
  readonly type: "displacement";
  readonly dof: number;
  readonly target: number;
  readonly reference: number;
}

type NewtonConstraint = DisplacementConstraint | ArcLengthConstraint;

function arcLengthConstraintValues(
  context: SolverContext,
  q: readonly number[],
  lambda: number,
  constraint: ArcLengthConstraint,
): {
  readonly gap: number;
  readonly qGradient: readonly number[];
  readonly lambdaGradient: number;
} {
  const size = q.length;
  const qGradient = q.map((value, index) => {
    const scale = dofColumnScale(index, context.lengthScale);
    return (2 * (value - constraint.referenceQ[index]!)) / (size * scale * scale);
  });
  const displacementNormSquared = q.reduce((sum, value, index) => {
    const scale = dofColumnScale(index, context.lengthScale);
    const increment = (value - constraint.referenceQ[index]!) / scale;
    return sum + (increment * increment) / size;
  }, 0);
  const lambdaIncrement = lambda - constraint.referenceLambda;
  return {
    gap:
      displacementNormSquared +
      (constraint.loadScale * lambdaIncrement) ** 2 -
      constraint.radius ** 2,
    qGradient,
    lambdaGradient: 2 * constraint.loadScale * constraint.loadScale * lambdaIncrement,
  };
}

function solveArcLengthCorrection(
  context: SolverContext,
  evaluation: SystemEvaluation,
  values: ReturnType<typeof arcLengthConstraintValues>,
): { readonly q: Vector; readonly lambda: number } {
  const size = evaluation.residual.length;
  const tangent = isCompactBandedMatrix(evaluation.tangent)
    ? compactBandedMatrixToDense(evaluation.tangent)
    : evaluation.tangent;
  const columnScales = tangentColumnScales(context, tangent);
  let lambdaColumnMaximum = 0;
  for (let row = 0; row < size; row += 1) {
    lambdaColumnMaximum = Math.max(
      lambdaColumnMaximum,
      Math.abs(
        dofRowScale(row, context.forceScale, context.lengthScale) *
          evaluation.scalableDerivative[row]!,
      ),
    );
  }
  if (lambdaColumnMaximum === 0) {
    throw new Error("The selected scalable load cases produce a zero nonlinear load vector.");
  }
  const lambdaColumnScale = 1 / lambdaColumnMaximum;
  const augmented = Array.from({ length: size + 1 }, () => new Array<number>(size + 1).fill(0));
  const rhs = new Array<number>(size + 1).fill(0);
  for (let row = 0; row < size; row += 1) {
    const rowScale = dofRowScale(row, context.forceScale, context.lengthScale);
    rhs[row] = -rowScale * evaluation.residual[row]!;
    for (let column = 0; column < size; column += 1) {
      augmented[row]![column] = rowScale * tangent[row]![column]! * columnScales[column]!;
    }
    augmented[row]![size] = rowScale * evaluation.scalableDerivative[row]! * lambdaColumnScale;
  }
  const maximumConstraintCoefficient = Math.max(
    ...values.qGradient.map((value, index) => Math.abs(value * columnScales[index]!)),
    Math.abs(values.lambdaGradient * lambdaColumnScale),
  );
  if (maximumConstraintCoefficient <= Number.EPSILON) {
    throw new Error("The arc-length correction was requested at a zero-increment predictor.");
  }
  const constraintRowScale = 1 / maximumConstraintCoefficient;
  for (let column = 0; column < size; column += 1) {
    augmented[size]![column] =
      constraintRowScale * values.qGradient[column]! * columnScales[column]!;
  }
  augmented[size]![size] = constraintRowScale * values.lambdaGradient * lambdaColumnScale;
  rhs[size] = -constraintRowScale * values.gap;
  context.linearSolverMethods.add("dense");
  const correction = context.denseLinearSolver.solve(augmented, rhs);
  return {
    q: correction.slice(0, size).map((value, index) => value * columnScales[index]!),
    lambda: correction[size]! * lambdaColumnScale,
  };
}

function addScaled(base: readonly number[], correction: readonly number[], factor: number): Vector {
  return base.map((value, index) => value + factor * correction[index]!);
}

function solveNewton(
  context: SolverContext,
  initialQ: readonly number[],
  initialLambda: number,
  fixedLoadFactor: number,
  committedStates: Readonly<Record<string, RigidBlockDeformableInterfaceState2D>>,
  constraint: NewtonConstraint | null,
  numericalCohesionOffset = 0,
): NewtonResult {
  let q = [...initialQ];
  let lambda = initialLambda;
  let evaluation = evaluateSystem(
    context,
    q,
    lambda,
    fixedLoadFactor,
    committedStates,
    true,
    numericalCohesionOffset,
  );
  let nonMonotoneAcceptances = 0;
  for (let iteration = 1; iteration <= context.maxIterations; iteration += 1) {
    const arcValues =
      constraint?.type === "arc-length"
        ? arcLengthConstraintValues(context, q, lambda, constraint)
        : null;
    const controlGap =
      constraint === null
        ? 0
        : constraint.type === "displacement"
          ? q[constraint.dof]! - constraint.reference - constraint.target
          : arcValues!.gap;
    const normalizedControlGap =
      constraint === null
        ? 0
        : constraint.type === "displacement"
          ? Math.abs(controlGap) / dofColumnScale(constraint.dof, context.lengthScale)
          : Math.abs(controlGap) / (constraint.radius * constraint.radius);
    const measure = Math.max(residualMeasure(context, evaluation.residual), normalizedControlGap);
    if (measure <= context.tolerance) {
      return {
        converged: true,
        q,
        lambda,
        iterations: iteration - 1,
        evaluation,
        warning: null,
        nonMonotoneAcceptances,
      };
    }

    let correctionQ: Vector;
    let correctionLambda = 0;
    try {
      if (constraint === null) {
        correctionQ = solveLoadCorrection(context, evaluation);
      } else if (constraint.type === "arc-length") {
        const correction = solveArcLengthCorrection(context, evaluation, arcValues!);
        correctionQ = correction.q;
        correctionLambda = correction.lambda;
      } else {
        const correction = solveDisplacementCorrection(
          context,
          evaluation,
          constraint.dof,
          controlGap,
        );
        correctionQ = correction.q;
        correctionLambda = correction.lambda;
      }
    } catch (error) {
      return {
        converged: false,
        q,
        lambda,
        iterations: iteration,
        evaluation,
        warning: `The nonlinear tangent is singular or ill-conditioned: ${String(error)}`,
        nonMonotoneAcceptances,
      };
    }

    let accepted = false;
    let lineFactor = 1;
    let bestTrialMeasure = Number.POSITIVE_INFINITY;
    let bestTrialQ: Vector | null = null;
    let bestTrialLambda = lambda;
    for (
      let lineIteration = 0;
      lineIteration < context.maximumLineSearchIterations;
      lineIteration += 1
    ) {
      const trialQ = addScaled(q, correctionQ, lineFactor);
      const trialLambda = lambda + lineFactor * correctionLambda;
      const trial = evaluateSystem(
        context,
        trialQ,
        trialLambda,
        fixedLoadFactor,
        committedStates,
        false,
        numericalCohesionOffset,
      );
      const trialControlGap =
        constraint === null
          ? 0
          : constraint.type === "displacement"
            ? trialQ[constraint.dof]! - constraint.reference - constraint.target
            : arcLengthConstraintValues(context, trialQ, trialLambda, constraint).gap;
      const trialMeasure = Math.max(
        residualMeasure(context, trial.residual),
        constraint === null
          ? 0
          : constraint.type === "displacement"
            ? Math.abs(trialControlGap) / dofColumnScale(constraint.dof, context.lengthScale)
            : Math.abs(trialControlGap) / (constraint.radius * constraint.radius),
      );
      bestTrialMeasure = Math.min(bestTrialMeasure, trialMeasure);
      if (trialMeasure <= bestTrialMeasure) {
        bestTrialQ = trialQ;
        bestTrialLambda = trialLambda;
      }
      if (trialMeasure < measure || trialMeasure <= context.tolerance) {
        q = trialQ;
        lambda = trialLambda;
        evaluation = evaluateSystem(
          context,
          q,
          lambda,
          fixedLoadFactor,
          committedStates,
          true,
          numericalCohesionOffset,
        );
        accepted = true;
        break;
      }
      lineFactor /= 2;
      if (lineFactor < context.minimumLineSearchFactor) break;
    }
    if (!accepted && bestTrialQ !== null && bestTrialMeasure <= 5 * measure) {
      q = bestTrialQ;
      lambda = bestTrialLambda;
      evaluation = evaluateSystem(
        context,
        q,
        lambda,
        fixedLoadFactor,
        committedStates,
        true,
        numericalCohesionOffset,
      );
      nonMonotoneAcceptances += 1;
      accepted = true;
    }
    if (!accepted) {
      return {
        converged: false,
        q,
        lambda,
        iterations: iteration,
        evaluation,
        warning:
          `The nonlinear backtracking line search could not reduce the normalized residual ` +
          `(current ${measure}, best trial ${bestTrialMeasure}).`,
        nonMonotoneAcceptances,
      };
    }
  }
  return {
    converged: false,
    q,
    lambda,
    iterations: context.maxIterations,
    evaluation,
    warning:
      `The nonlinear iteration did not converge in ${context.maxIterations} iterations; ` +
      `the final normalized residual was ${residualMeasure(context, evaluation.residual)}.`,
    nonMonotoneAcceptances,
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

function interfaceSummary(
  item: RigidBlockDeformableInterfaceEvaluation2D,
): MasonryArchNonlinearInterfaceSummary {
  const state =
    item.sliding && item.crushing
      ? "sliding-and-crushing"
      : item.crushing
        ? "crushing"
        : item.sliding
          ? "sliding"
          : item.contactActive
            ? "compressed"
            : "open";
  return {
    interfaceId: item.interfaceId,
    normalForce: item.normalForce,
    shearForce: item.shearForce,
    moment: item.moment,
    eccentricity: item.eccentricity,
    compressedLength: item.compressedLength,
    maxCompression: item.maxCompression,
    frictionUtilization: item.frictionUtilization,
    maximumOpening: item.maximumOpening,
    maximumClosure: item.maximumClosure,
    maximumAbsoluteSlip: item.maximumAbsoluteSlip,
    state,
  };
}

function equilibriumResult(
  context: SolverContext,
  evaluation: SystemEvaluation,
): MasonryArchNonlinearEquilibriumResult {
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

function classifyMaterialLimit(evaluation: SystemEvaluation): MasonryArchFailureMode | null {
  const crushing = evaluation.interfaces.some((item) => item.crushing);
  const reinforcementFailure = evaluation.reinforcement.hasReinforcementFailure;
  const reinforcementYield = evaluation.reinforcement.hasReinforcementYield;
  const anchor = evaluation.reinforcement.hasAnchorFailure;
  const bondedLayerFailure = evaluation.bondedLayerState.some((layer) =>
    layer.interfaces.some((item) => item.state === "at-capacity"),
  );
  const count = [
    crushing,
    reinforcementFailure || bondedLayerFailure,
    reinforcementYield,
    anchor,
  ].filter(Boolean).length;
  if (count > 1) return "mixed";
  if (crushing) return "masonry-crushing";
  if (reinforcementFailure || bondedLayerFailure) return "reinforcement-failure";
  if (reinforcementYield) return "reinforcement-yield";
  if (anchor) return "anchor-capacity";
  return null;
}

function classifyNonconvergence(evaluation: SystemEvaluation): MasonryArchFailureMode {
  const sliding = evaluation.interfaces.some((item) => item.sliding);
  const openInternal = evaluation.interfaces
    .slice(1, -1)
    .filter((item) => !item.contactActive).length;
  if (sliding && openInternal > 0) return "mixed";
  if (sliding) return "sliding";
  if (openInternal >= 4) return "mechanism";
  return "instability";
}

function supportReaction(item: RigidBlockDeformableInterfaceEvaluation2D | undefined): {
  readonly force: RigidBlockVector2D;
  readonly moment: number;
  readonly applicationPoint: RigidBlockPoint2D;
} {
  const action = item?.actions[0];
  return action === undefined
    ? { force: { x: 0, y: 0 }, moment: 0, applicationPoint: { x: 0, y: 0 } }
    : {
        force: action.force,
        moment: action.moment,
        applicationPoint: item?.currentMidpoint ?? { x: 0, y: 0 },
      };
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
  return [model.supports.left.interface, model.interfaces, model.supports.right.interface].some(
    (item) => item.friction?.cohesion === 0,
  );
}

function arcLengthIncrementNorm(
  context: SolverContext,
  incrementQ: readonly number[],
  incrementLambda: number,
  loadScale: number,
): number {
  const displacement = incrementQ.reduce((sum, value, index) => {
    const normalized = value / dofColumnScale(index, context.lengthScale);
    return sum + (normalized * normalized) / incrementQ.length;
  }, 0);
  return Math.sqrt(displacement + (loadScale * incrementLambda) ** 2);
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
  const norm = arcLengthIncrementNorm(context, directionQ, directionLambda, loadScale);
  if (!Number.isFinite(norm) || norm <= Number.EPSILON) {
    throw new Error("The arc-length predictor has zero scaled norm.");
  }
  const factor = radius / norm;
  return {
    q: directionQ.map((value) => factor * value),
    lambda: factor * directionLambda,
  };
}

function validateNonlinearMechanicalModel(model: NormalizedMasonryArchModel): void {
  const entries = [
    ["supports.left.interface", model.supports.left.interface],
    ["interfaces", model.interfaces],
    ["supports.right.interface", model.supports.right.interface],
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

function resolveAnalysisObjective(
  options: AnalyzeMasonryArchNonlinearOptions,
): MasonryArchAnalysisObjective {
  const objective = options.analysisObjective ?? "advanced-path";
  if (
    objective !== "design-state-check" &&
    objective !== "capacity" &&
    objective !== "advanced-path"
  ) {
    throw new Error(`Unsupported masonry-arch analysisObjective: ${String(objective)}.`);
  }
  if (objective === "design-state-check") {
    if (options.control.type !== "load" || Math.abs(options.control.targetLambda - 1) > 1e-12) {
      throw new Error(
        "analysisObjective: design-state-check currently requires load control with targetLambda: 1.",
      );
    }
  }
  if (objective !== "advanced-path" && options.stopAtFirstMaterialLimit === false) {
    throw new Error(
      `${objective} requires stopAtFirstMaterialLimit to remain enabled so a physical limit is not crossed silently.`,
    );
  }
  return objective;
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
  termination: MasonryArchNonlinearOutputs["convergenceInfo"]["termination"],
  lambda: number,
): MasonryArchAnalysisOutcome {
  if (termination === "target-reached") {
    return {
      objective,
      objectiveStatus: objective === "capacity" ? "not-reached" : "satisfied",
      terminationCategory: "engineering-target",
      lambdaAtTermination: lambda,
    };
  }
  if (termination === "material-limit") {
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

export function analyzeMasonryArchNonlinear(
  modelInput: MasonryArchModel | NormalizedMasonryArchModel | MasonryArchModelInput,
  options: AnalyzeMasonryArchNonlinearOptions,
): MasonryArchNonlinearResult {
  if (options.geometricNonlinearity !== true) {
    throw new Error("Nonlinear masonry-arch analysis requires geometricNonlinearity: true.");
  }
  const analysisObjective = resolveAnalysisObjective(options);
  const model = asMasonryArchModel(modelInput);
  validateNonlinearMechanicalModel(model);
  const analysisSourceUnits = assertExplicitUnitSystem(
    options.units,
    "AnalyzeMasonryArchNonlinearOptions",
  );
  const analysisUnitResolver = createUnitResolver(analysisSourceUnits, model.units);
  const normalizedControl: MasonryArchNonlinearControl =
    options.control.type === "load"
      ? { ...options.control }
      : options.control.type === "arc-length"
        ? { ...options.control }
        : {
            ...options.control,
            increment:
              options.control.component === "rotation"
                ? options.control.increment
                : analysisUnitResolver.length(options.control.increment),
            targetDisplacement:
              options.control.component === "rotation"
                ? options.control.targetDisplacement
                : analysisUnitResolver.length(options.control.targetDisplacement),
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
  const context: SolverContext = {
    model,
    fixedLoads,
    scalableLoads,
    forceScale:
      actionScale(fixedLoads, scalableLoads) +
      model.reinforcements.reduce((sum, item) => sum + item.initialForce, 0),
    lengthScale: Math.max(1, model.geometry.span, model.geometry.rise),
    tolerance,
    maxIterations,
    maximumLineSearchIterations,
    minimumLineSearchFactor,
    denseLinearSolver: new DenseLinearSolver(),
    bandedLinearSolver: new GeneralBandedLinearSolver(),
    linearSolverMethods: new Set(),
    linearSolverPreference: options.linearSolver ?? "automatic",
  };
  const contactInitialization = options.contactInitialization ?? "cohesion-homotopy";
  const minimumInterfaceArea = Math.min(
    ...model.geometry.interfaces.map((item) => item.length * item.outOfPlaneWidth),
  );
  const initialCohesionOffset =
    contactInitialization === "cohesion-homotopy" && hasZeroPhysicalCohesion(model)
      ? (0.01 * context.forceScale) / minimumInterfaceArea
      : 0;

  const size = 3 * model.geometry.voussoirs.length;
  let q = zeroVector(size);
  let lambda = 0;
  let committedStates: Readonly<Record<string, RigidBlockDeformableInterfaceState2D>> = {};
  const history: MasonryArchNonlinearHistoryPoint[] = [];
  const warnings: string[] = [];
  let totalIterations = 0;
  let cutbacks = 0;
  let nonMonotoneLineSearchAcceptances = 0;
  let completedCohesionHomotopyStages = 0;
  let failedLambdaTarget: number | null = null;
  let stepNumber = 0;
  let termination: MasonryArchNonlinearOutputs["convergenceInfo"]["termination"] = "maximum-steps";
  let failureMode: MasonryArchFailureMode = "no-collapse-within-model";
  const stopAtFirstMaterialLimit = options.stopAtFirstMaterialLimit ?? true;
  const selectedControlDof = controlDof(
    model,
    normalizedControl.type === "load" || normalizedControl.type === "arc-length"
      ? normalizedControl.monitor
      : normalizedControl,
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
        failureMode = "fixed-load-infeasible";
        if (solved.warning !== null) warnings.push(solved.warning);
        break;
      }
      continue;
    }
    q = solved.q;
    preloadFactor = target;
    committedStates = solved.evaluation.trialStates;
    finalEvaluation = solved.evaluation;
    stepNumber += 1;
    history.push({
      step: stepNumber,
      stage: "fixed-preload",
      fixedLoadFactor: preloadFactor,
      lambda: 0,
      effectiveLoadFactorsByCaseId: effectiveStepLoadFactors(analysisLoads, 0, preloadFactor),
      controlDisplacement: 0,
      iterations: solved.iterations,
      blockDisplacements: solved.evaluation.displacements,
      interfaces: solved.evaluation.interfaces.map(interfaceSummary),
      reinforcementForces: Object.fromEntries(
        solved.evaluation.reinforcement.reinforcementState.map((item) => [
          item.reinforcementId,
          item.force,
        ]),
      ),
      bondedLayerForces: Object.fromEntries(
        solved.evaluation.bondedLayerState.map((item) => [
          item.reinforcementId,
          item.maximumForce ?? 0,
        ]),
      ),
      equilibrium: equilibriumResult(context, solved.evaluation),
    });
    const preloadMaterialLimit = classifyMaterialLimit(solved.evaluation);
    if (preloadMaterialLimit !== null && stopAtFirstMaterialLimit) {
      failureMode = preloadMaterialLimit;
      termination = "material-limit";
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
            failureMode = classifyNonconvergence(solved.evaluation);
            if (solved.warning !== null) warnings.push(solved.warning);
            failedLambdaTarget = target;
            break;
          }
          continue;
        }
        q = solved.q;
        lambda = target;
        committedStates = solved.evaluation.trialStates;
        finalEvaluation = solved.evaluation;
        stepNumber += 1;
        history.push({
          step: stepNumber,
          stage: "scalable-loading",
          fixedLoadFactor: 1,
          lambda,
          effectiveLoadFactorsByCaseId: effectiveStepLoadFactors(analysisLoads, lambda, 1),
          controlDisplacement: q[selectedControlDof]! - referenceQ[selectedControlDof]!,
          iterations: solved.iterations,
          blockDisplacements: solved.evaluation.displacements,
          interfaces: solved.evaluation.interfaces.map(interfaceSummary),
          reinforcementForces: Object.fromEntries(
            solved.evaluation.reinforcement.reinforcementState.map((item) => [
              item.reinforcementId,
              item.force,
            ]),
          ),
          bondedLayerForces: Object.fromEntries(
            solved.evaluation.bondedLayerState.map((item) => [
              item.reinforcementId,
              item.maximumForce ?? 0,
            ]),
          ),
          equilibrium: equilibriumResult(context, solved.evaluation),
        });
        const materialLimit = classifyMaterialLimit(solved.evaluation);
        if (materialLimit !== null && stopAtFirstMaterialLimit) {
          failureMode = materialLimit;
          termination = "material-limit";
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
      const targetDisplacement = finiteNonZero(
        normalizedControl.targetDisplacement,
        "Nonlinear targetDisplacement",
      );
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
          failureMode = classifyNonconvergence(solved.evaluation);
          if (solved.warning !== null) warnings.push(solved.warning);
          break;
        }
        previousPathQ = [...q];
        previousPathLambda = lambda;
        previousPrescribed = prescribed;
        q = solved.q;
        lambda = solved.lambda;
        prescribed = next;
        committedStates = solved.evaluation.trialStates;
        finalEvaluation = solved.evaluation;
        stepNumber += 1;
        history.push({
          step: stepNumber,
          stage: "scalable-loading",
          fixedLoadFactor: 1,
          lambda,
          effectiveLoadFactorsByCaseId: effectiveStepLoadFactors(analysisLoads, lambda, 1),
          controlDisplacement: controlValue(q, referenceQ, selectedControlDof),
          iterations: solved.iterations,
          blockDisplacements: solved.evaluation.displacements,
          interfaces: solved.evaluation.interfaces.map(interfaceSummary),
          reinforcementForces: Object.fromEntries(
            solved.evaluation.reinforcement.reinforcementState.map((item) => [
              item.reinforcementId,
              item.force,
            ]),
          ),
          bondedLayerForces: Object.fromEntries(
            solved.evaluation.bondedLayerState.map((item) => [
              item.reinforcementId,
              item.maximumForce ?? 0,
            ]),
          ),
          equilibrium: equilibriumResult(context, solved.evaluation),
        });
        const materialLimit = classifyMaterialLimit(solved.evaluation);
        if (materialLimit !== null && stopAtFirstMaterialLimit) {
          failureMode = materialLimit;
          termination = "material-limit";
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
      let accumulatedPathLength = 0;
      let previousIncrementQ: Vector | null = null;
      let previousIncrementLambda: number | null = null;
      while (accumulatedPathLength < targetPathLength - 1e-14 && stepNumber < maxSteps) {
        const stepRadius = Math.min(radius, targetPathLength - accumulatedPathLength);
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
          failureMode = "instability";
          warnings.push(`Arc-length predictor failed: ${String(error)}`);
          break;
        }
        const referenceStepQ = [...q];
        const referenceStepLambda = lambda;
        const seedQ = q.map((value, index) => value + predictor.q[index]!);
        const seedLambda = lambda + predictor.lambda;
        const solved = solveNewton(context, seedQ, seedLambda, 1, committedStates, {
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
            termination = "minimum-step";
            failureMode = classifyNonconvergence(solved.evaluation);
            if (solved.warning !== null) warnings.push(solved.warning);
            break;
          }
          continue;
        }
        previousIncrementQ = solved.q.map((value, index) => value - referenceStepQ[index]!);
        previousIncrementLambda = solved.lambda - referenceStepLambda;
        const completedRadius = arcLengthIncrementNorm(
          context,
          previousIncrementQ,
          previousIncrementLambda,
          loadScale,
        );
        q = solved.q;
        lambda = solved.lambda;
        accumulatedPathLength += completedRadius;
        committedStates = solved.evaluation.trialStates;
        finalEvaluation = solved.evaluation;
        stepNumber += 1;
        history.push({
          step: stepNumber,
          stage: "scalable-loading",
          fixedLoadFactor: 1,
          lambda,
          effectiveLoadFactorsByCaseId: effectiveStepLoadFactors(analysisLoads, lambda, 1),
          controlDisplacement: controlValue(q, referenceQ, selectedControlDof),
          iterations: solved.iterations,
          blockDisplacements: solved.evaluation.displacements,
          interfaces: solved.evaluation.interfaces.map(interfaceSummary),
          reinforcementForces: Object.fromEntries(
            solved.evaluation.reinforcement.reinforcementState.map((item) => [
              item.reinforcementId,
              item.force,
            ]),
          ),
          bondedLayerForces: Object.fromEntries(
            solved.evaluation.bondedLayerState.map((item) => [
              item.reinforcementId,
              item.maximumForce ?? 0,
            ]),
          ),
          equilibrium: equilibriumResult(context, solved.evaluation),
        });
        const materialLimit = classifyMaterialLimit(solved.evaluation);
        if (materialLimit !== null && stopAtFirstMaterialLimit) {
          failureMode = materialLimit;
          termination = "material-limit";
          break;
        }
        if (solved.iterations <= 5) radius = Math.min(maximumRadius, radius * 1.25);
        else if (solved.iterations >= 12) radius = Math.max(minimumRadius, radius / 2);
      }
      if (accumulatedPathLength >= targetPathLength - 1e-14 && termination === "maximum-steps") {
        termination = "target-reached";
      }
    }
  }

  if (stepNumber >= maxSteps && termination === "maximum-steps") {
    warnings.push(`The nonlinear analysis reached maxSteps=${maxSteps}.`);
  }
  const equilibrium = equilibriumResult(context, finalEvaluation);
  const lastHistory = history.at(-1);
  const finalControlDisplacement = lastHistory?.controlDisplacement ?? 0;
  const reinforcementIds = [
    ...model.reinforcements.map((item) => item.id),
    ...model.bondedLayers.map((item) => item.id),
  ];
  const physicalLimitReached = termination === "material-limit";
  const analysisOutcome = nonlinearAnalysisOutcome(analysisObjective, termination, lambda);
  const numericalConvergence =
    (termination === "target-reached" || physicalLimitReached) &&
    equilibrium.maximumNormalizedBlockResidual <= tolerance;
  const successful =
    analysisOutcome.objectiveStatus === "satisfied" &&
    termination === "target-reached" &&
    numericalConvergence;
  const lambdaCritical = analysisObjective === "capacity" && physicalLimitReached ? lambda : null;
  const designStateCheck =
    analysisObjective === "design-state-check"
      ? {
          criterion: "factored-load-state-at-lambda-one" as const,
          demand: 1 as const,
          reachedLambda: lambda,
          status:
            analysisOutcome.objectiveStatus === "satisfied"
              ? ("pass" as const)
              : analysisOutcome.objectiveStatus === "not-satisfied"
                ? ("fail" as const)
                : ("not-verifiable" as const),
        }
      : null;
  const linearSolver =
    context.linearSolverMethods.size > 1
      ? ("hybrid-compact-banded-and-dense-gaussian-elimination" as const)
      : context.linearSolverMethods.has("dense")
        ? ("dense-gaussian-elimination-partial-pivoting" as const)
        : ("compact-banded-gaussian-elimination-partial-pivoting" as const);
  const outputs: MasonryArchNonlinearOutputs = {
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
    analysisOutcome,
    lambdaCritical,
    limitState: physicalLimitReached ? { lambda, failureMode } : null,
    designStateCheck,
    failureMode,
    control: normalizedControl,
    history,
    curves: {
      lambdaDisplacement: history.map((point) => ({
        displacement: point.controlDisplacement,
        lambda: point.lambda,
      })),
      reinforcementForceDisplacement: Object.fromEntries(
        reinforcementIds.map((id) => [
          id,
          history.map((point) => ({
            displacement: point.controlDisplacement,
            force: point.reinforcementForces[id] ?? point.bondedLayerForces[id] ?? 0,
          })),
        ]),
      ),
    },
    finalConfiguration: finalEvaluation.displacements,
    interfaces: finalEvaluation.interfaces,
    reinforcementState: finalEvaluation.reinforcement.reinforcementState,
    anchorForces: finalEvaluation.reinforcement.anchorForces,
    contactForces: finalEvaluation.reinforcement.contactForces,
    bondedLayerState: finalEvaluation.bondedLayerState,
    reactions: {
      left: supportReaction(finalEvaluation.interfaces[0]),
      right: supportReaction(finalEvaluation.interfaces.at(-1)),
    },
    equilibrium,
    convergenceInfo: {
      converged: numericalConvergence,
      termination,
      completedSteps: history.length,
      totalIterations,
      cutbacks,
      nonMonotoneLineSearchAcceptances,
      numericalCohesionHomotopy: {
        used: completedCohesionHomotopyStages > 0,
        initialOffset: initialCohesionOffset,
        completedStages: completedCohesionHomotopyStages,
      },
      lambdaBracket:
        failedLambdaTarget === null ? null : { lower: lambda, upper: failedLambdaTarget },
      tangent: "corotational-interface-plus-numerical-reinforcement",
      linearSolver,
    },
  };
  if (finalEvaluation.reinforcement.hasInvalidContact) {
    warnings.push(
      "The final reinforcement configuration contains contact that cannot enforce the prescribed path.",
    );
  }
  if (context.linearSolverMethods.has("dense") && model.geometry.voussoirCount > 80) {
    warnings.push(
      "Active reinforcement introduced a dense globally coupled tangent; performance beyond 80 voussoirs must be checked explicitly.",
    );
  }
  return new CalculationResult<MasonryArchNonlinearOutputs>({
    applicationId: "masonry-arch-nonlinear",
    status: successful
      ? RESULT_STATUS.OK
      : physicalLimitReached || analysisOutcome.objectiveStatus === "not-reached"
        ? RESULT_STATUS.NOT_VERIFIED
        : RESULT_STATUS.FAILED,
    summary: successful
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
      "Fixed loads and initial reinforcement actions are proportionally initialized before scalable loading.",
      "External dead-load forces retain their global direction while their material application points follow the block motion.",
      "Intrados reinforcement follows rigid deviators; an extrados tendon uses a compression-only taut-cable contact envelope.",
      "Bonded layers are local tension-only membrane springs with explicit transfer length and assigned tensile/debonding capacity.",
      "Load control uses adaptive cutback; displacement control uses an augmented equilibrium equation.",
      "The engineering analysis objective is independent from the selected continuation control.",
      "F(lambda) = F_fixed + lambda * F_scalable after combination factors; initial prestress and deformation-dependent response quantities are not scaled by lambda.",
    ],
    metadata: {
      schemaVersion: MASONRY_ARCH_NONLINEAR_RESULT_SCHEMA_VERSION,
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
      geometricNonlinearity: true,
      loadCombinationId: options.loadCombination?.id ?? null,
      loadCombinationType: options.loadCombination?.combinationType ?? null,
      normativeConformityClaimed: false,
    },
  });
}
