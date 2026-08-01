import { DenseLinearSolver, type DenseLinearSolverDiagnostics } from "../math/DenseLinearSolver.js";
import type { NumericMatrix, NumericVector } from "../math/arrayLinearAlgebra.js";
import { DofRegistry } from "./DofRegistry.js";
import { FemAssembler2D, type FemAssembly2D, type FemModel2D } from "./FemAssembler2D.js";
import {
  KinematicConstraintReducer2D,
  type KinematicReduction2D,
} from "./KinematicConstraintReducer2D.js";

export interface LinearSolverLike {
  solve: (matrix: NumericMatrix, rhs: NumericVector) => NumericVector;
  solveWithDiagnostics?: (
    matrix: NumericMatrix,
    rhs: NumericVector,
  ) => {
    solution: NumericVector;
    warnings: string[];
  };
}

export interface FemAssembler2DLike {
  assemble: (model?: FemModel2D) => FemAssembly2D;
}

export interface KinematicConstraintReducer2DLike {
  build: (input: {
    dofRegistry: DofRegistry;
    supports: FemAssembly2D["supports"];
    constraints: FemAssembly2D["constraints"];
  }) => KinematicReduction2D;
}

export interface LinearStaticSolver2DInput {
  linearSolver?: LinearSolverLike;
  dofRegistry?: DofRegistry;
  assembler?: FemAssembler2DLike | null;
  constraintReducer?: KinematicConstraintReducer2DLike;
}

export interface LinearStaticSolveOptions {
  includeDiagnostics?: boolean;
}

export interface LinearStaticReducedSystem {
  stiffnessMatrix: NumericMatrix;
  loadVector: NumericVector;
  solution: NumericVector;
  diagnostics:
    | DenseLinearSolverDiagnostics
    | {
        solution: NumericVector;
        warnings: string[];
      }
    | null;
}

export interface LinearStaticResult2D {
  dofRegistry: DofRegistry;
  dofIds: string[];
  freeDofIds: string[];
  constrainedDofIds: string[];
  displacements: NumericVector;
  displacementByDof: Record<string, number>;
  displacementByNode: Record<string, Record<string, number>>;
  reactions: NumericVector;
  reactionByDof: Record<string, number>;
  reactionByNode: Record<string, Record<string, number>>;
  internalForceVector: NumericVector;
  stiffnessMatrix: NumericMatrix;
  loadVector: NumericVector;
  reducedSystem: LinearStaticReducedSystem;
  kinematicReduction: ReturnType<KinematicReduction2D["toJSON"]>;
  assembly: FemAssembly2D;
}

function vectorValue(vector: NumericVector, index: number): number {
  const value = vector[index];
  if (value === undefined) {
    throw new Error("LinearStaticSolver2D vector value is unavailable.");
  }
  return value;
}

function multiplyMatrixVector(matrix: NumericMatrix, vector: NumericVector): NumericVector {
  return matrix.map((row) =>
    row.reduce((sum, value, index) => sum + value * vectorValue(vector, index), 0),
  );
}

function subtractVectors(left: NumericVector, right: NumericVector): NumericVector {
  return left.map((value, index) => value - vectorValue(right, index));
}

function vectorToDofMap(vector: NumericVector, dofRegistry: DofRegistry): Record<string, number> {
  const result: Record<string, number> = {};
  const dofIds = dofRegistry.getDofIds();

  for (let index = 0; index < dofIds.length; index += 1) {
    const dofId = dofIds[index];
    if (dofId === undefined) {
      throw new Error("LinearStaticSolver2D DOF id is unavailable.");
    }
    result[dofId] = vectorValue(vector, index);
  }

  return result;
}

function vectorToNodeMap(
  vector: NumericVector,
  dofRegistry: DofRegistry,
): Record<string, Record<string, number>> {
  const result: Record<string, Record<string, number>> = {};

  for (const descriptor of dofRegistry.getDescriptors()) {
    result[descriptor.nodeId] ??= {};
    const nodeResult = result[descriptor.nodeId];
    if (nodeResult === undefined) {
      throw new Error("LinearStaticSolver2D node result map is unavailable.");
    }
    nodeResult[descriptor.dof] = vectorValue(vector, descriptor.index);
  }

  return result;
}

export class LinearStaticSolver2D {
  readonly linearSolver: LinearSolverLike;
  readonly dofRegistry: DofRegistry;
  readonly assembler: FemAssembler2DLike;
  readonly constraintReducer: KinematicConstraintReducer2DLike;

  constructor({
    linearSolver = new DenseLinearSolver(),
    dofRegistry = new DofRegistry(),
    assembler = null,
    constraintReducer = new KinematicConstraintReducer2D(),
  }: LinearStaticSolver2DInput = {}) {
    if (!linearSolver || typeof linearSolver.solve !== "function") {
      throw new Error("LinearStaticSolver2D requires a linearSolver with a solve method.");
    }

    this.linearSolver = linearSolver;
    this.dofRegistry = dofRegistry;
    this.assembler = assembler ?? new FemAssembler2D({ dofRegistry });
    this.constraintReducer = constraintReducer;
  }

  solve(
    model: FemModel2D = {},
    { includeDiagnostics = true }: LinearStaticSolveOptions = {},
  ): LinearStaticResult2D {
    const assembly = this.assembler.assemble(model);
    const { dofRegistry, stiffnessMatrix, loadVector, supports = [], constraints = [] } = assembly;
    const reduction = this.constraintReducer.build({
      dofRegistry,
      supports,
      constraints,
    });
    const reducedAssembly = reduction.reduceLinearSystem(stiffnessMatrix, loadVector);
    let displacements = reduction.expandReducedVector(
      new Array<number>(reduction.reducedSize()).fill(0),
    );

    let reducedSystem: LinearStaticReducedSystem = {
      stiffnessMatrix: [],
      loadVector: [],
      solution: [],
      diagnostics: null,
    };

    if (reduction.reducedSize() > 0) {
      const solved =
        includeDiagnostics && typeof this.linearSolver.solveWithDiagnostics === "function"
          ? this.linearSolver.solveWithDiagnostics(
              reducedAssembly.stiffnessMatrix,
              reducedAssembly.loadVector,
            )
          : {
              solution: this.linearSolver.solve(
                reducedAssembly.stiffnessMatrix,
                reducedAssembly.loadVector,
              ),
              warnings: [],
            };

      displacements = reduction.expandReducedVector(solved.solution);

      reducedSystem = {
        stiffnessMatrix: reducedAssembly.stiffnessMatrix,
        loadVector: reducedAssembly.loadVector,
        solution: [...solved.solution],
        diagnostics: includeDiagnostics ? solved : null,
      };
    }

    const internalForceVector = multiplyMatrixVector(stiffnessMatrix, displacements);
    const reactionVector = subtractVectors(internalForceVector, loadVector);

    return {
      dofRegistry,
      dofIds: dofRegistry.getDofIds(),
      freeDofIds: [...reduction.reducedDofIds],
      constrainedDofIds: [...reduction.constrainedDofIds],
      displacements,
      displacementByDof: vectorToDofMap(displacements, dofRegistry),
      displacementByNode: vectorToNodeMap(displacements, dofRegistry),
      reactions: reactionVector,
      reactionByDof: vectorToDofMap(reactionVector, dofRegistry),
      reactionByNode: vectorToNodeMap(reactionVector, dofRegistry),
      internalForceVector,
      stiffnessMatrix,
      loadVector,
      reducedSystem,
      kinematicReduction: reduction.toJSON(),
      assembly,
    };
  }
}
