import { DenseLinearSolver } from "../../../math/DenseLinearSolver.js";
import type { NumericMatrix, NumericVector } from "../../../math/arrayLinearAlgebra.js";
import { assertExplicitUnitSystem, createUnitResolver } from "../../../units/UnitSystem.js";
import type { UnitSystem, UnitSystemInput } from "../../../units/UnitSystem.js";
import {
  MasonryFiberInterface2D,
  type MasonryFiberCompressionMaterial,
  type MasonryFiberInterface2DState,
  type MasonryFiberResponse,
} from "../../../sections/masonry/MasonryFiberInterface2D.js";
import type { CyclicMasonryShearState } from "../../../materials/masonry/CyclicMasonryShearMaterial.js";
import {
  addVectors,
  frameTransformationMatrix,
  identityMatrix,
  masonryPierBasicKinematicMatrix,
  masonryPierComponentCompatibilityMatrix,
  multiplyMatrices,
  multiplyMatrixVector,
  subtractMatrices,
  subtractVectors,
  transpose,
} from "./MasonryPierKinematics.js";

const INTERNAL_UNITS = Object.freeze({ force: "kN", length: "m" });
const STATE_VERSION = 1;

export interface CyclicMasonryPierNode {
  id: string;
  x: number;
  y: number;
}

export interface CyclicMasonryPierShearMaterial {
  readonly peakShearStrain: number;
  clone(): CyclicMasonryPierShearMaterial;
  setTrialDeformation(deformation: number, context?: Record<string, number>): number;
  getState(): CyclicMasonryShearState;
  getCommittedState(): CyclicMasonryShearState;
  commitState(): number;
  revertToLastCommit(): number;
  revertToStart(): number;
  importState(
    state: CyclicMasonryShearState,
    options?: { committed?: boolean },
  ): CyclicMasonryPierShearMaterial;
}

export interface CyclicMasonryPierCoupling {
  useCurrentAxialForce: boolean;
  useCompressedLength: boolean;
  compressedLengthStrategy: string;
  crushingShearReduction: boolean;
  shearToInterfaceDamage: boolean;
}

export interface CyclicMasonryPierCouplingInput {
  useCurrentAxialForce?: boolean;
  useCompressedLength?: boolean;
  compressedLengthStrategy?: string;
  crushingShearReduction?: boolean;
  shearToInterfaceDamage?: boolean;
}

export interface CyclicMasonryPier2DOptions {
  id?: string;
  startNode?: CyclicMasonryPierNode | null;
  endNode?: CyclicMasonryPierNode | null;
  nodeI?: CyclicMasonryPierNode | null;
  nodeJ?: CyclicMasonryPierNode | null;
  units?: UnitSystemInput | null;
  height?: number | null;
  width?: number | null;
  thickness?: number | null;
  deformableHeight?: number | null;
  elasticCoreHeight?: number | null;
  elasticModulus?: number | null;
  shearModulus?: number | null;
  effectiveShearAreaFactor?: number;
  fiberCount?: number;
  hingeLength?: number | null;
  compressionMaterial?: MasonryFiberCompressionMaterial | null;
  bottomInterface?: MasonryFiberInterface2D | null;
  topInterface?: MasonryFiberInterface2D | null;
  shearMaterial?: CyclicMasonryPierShearMaterial;
  coupling?: CyclicMasonryPierCouplingInput;
  localTolerance?: number;
  maxLocalIterations?: number;
  numericalJacobianRelativeStep?: number;
  numericalTranslationStep?: number;
  numericalRotationStep?: number;
  maxLineSearchIterations?: number;
  linearSolver?: DenseLinearSolver;
  metadata?: Record<string, unknown>;
}

export interface CyclicMasonryPierState {
  version: number;
  internalDeformations?: NumericVector;
  localDisplacements?: NumericVector;
  basicDeformations?: NumericVector;
  bodyDeformations?: NumericVector;
  basicForces?: NumericVector;
  localForces?: NumericVector;
  localTangent?: NumericMatrix;
  basicTangent?: NumericMatrix;
  axialForce: number;
  shearForce: number;
  endMoments: NumericVector;
  shearDeformation: number;
  interfaceRotations: NumericVector;
  compressedLengths: NumericVector;
  compressionResultants?: NumericVector;
  fiberStrainExtremes?: {
    bottom: { minimum: number; maximum: number };
    top: { minimum: number; maximum: number };
  };
  compressionDamage: number;
  shearDamage: number;
  energyDissipated: number;
  mechanismIndices: Record<string, number>;
  predominantMechanism: string;
  mechanismsActivated: string[];
  bottomInterface?: MasonryFiberResponse;
  topInterface?: MasonryFiberResponse;
  shear?: CyclicMasonryShearState;
  shearContext?: Record<string, number>;
  localIterations: number;
  localResidualNorm: number;
  localConverged: boolean;
  warnings: string[];
}

export interface CyclicMasonryPierStateExport {
  version: number;
  response: CyclicMasonryPierState;
  bottomInterface: MasonryFiberInterface2DState;
  topInterface: MasonryFiberInterface2DState;
  shearMaterial: CyclicMasonryShearState;
}

export interface CyclicMasonryPierComponentEvaluation {
  internalDeformations: NumericVector;
  basicDeformations: NumericVector;
  bodyDeformations: NumericVector;
  basicForces: NumericVector;
  componentForces: NumericVector;
  equilibriumForces: NumericVector;
  residual: NumericVector;
  bottom: MasonryFiberResponse;
  top: MasonryFiberResponse;
  shear: CyclicMasonryShearState;
  shearContext: Record<string, number>;
}

export interface CyclicMasonryPierLocalState extends CyclicMasonryPierComponentEvaluation {
  jacobian: NumericMatrix;
  basicTangent: NumericMatrix;
  localIterations: number;
  localResidualNorm: number;
  localConverged: boolean;
}

export interface CyclicMasonryPierEvaluation extends CyclicMasonryPierState {
  globalForces?: NumericVector;
  globalEndForces?: NumericVector;
  tangentLocalStiffness?: NumericMatrix;
  tangentGlobalStiffness?: NumericMatrix;
  globalTangent?: NumericMatrix;
  state?: CyclicMasonryPierStateExport;
}

export interface CyclicMasonryPierEvaluateInput {
  globalDisplacements?: NumericVector | null | undefined;
  localDisplacements?: NumericVector | null | undefined;
  dofRegistry?: DofRegistryLike | null | undefined;
  state?: CyclicMasonryPierStateExport | null | undefined;
}

export interface CyclicMasonryPierJson {
  id: string;
  type: string;
  startNodeId: string;
  endNodeId: string;
  units: UnitSystem;
  height: number;
  width: number;
  thickness: number;
  deformableHeight: number;
  elasticCoreHeight: number;
  elasticModulus: number;
  shearModulus: number;
  effectiveShearAreaFactor: number;
  fiberCount: number;
  hingeLength: number;
  coupling: CyclicMasonryPierCoupling;
  state: CyclicMasonryPierStateExport;
  metadata: Record<string, unknown>;
}

interface ColumnSolverLike {
  solve(vector: NumericVector): NumericVector;
}

interface MatrixSolverLike {
  solve(matrix: NumericMatrix, rhs: NumericVector): NumericVector;
}

interface DofRegistryLike {
  getDofId(node: CyclicMasonryPierNode, dof: string): string;
  getIndex(dofId: string): number;
}

function vectorValue(vector: NumericVector, index: number): number {
  const value = vector[index];
  if (value === undefined) {
    throw new Error("CyclicMasonryPier2D vector entry is unavailable.");
  }
  return value;
}

function matrixValue(matrix: NumericMatrix, row: number, column: number): number {
  const matrixRow = matrix[row];
  if (matrixRow === undefined) {
    throw new Error("CyclicMasonryPier2D matrix row is unavailable.");
  }
  return vectorValue(matrixRow, column);
}

function addMatrixEntry(matrix: NumericMatrix, row: number, column: number, value: number): void {
  const matrixRow = matrix[row];
  if (matrixRow === undefined) {
    throw new Error("CyclicMasonryPier2D matrix row is unavailable.");
  }
  matrixRow[column] = vectorValue(matrixRow, column) + value;
}

function assertPositive(value: number | null | undefined, label: string): asserts value is number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new Error(`CyclicMasonryPier2D requires a positive ${label}.`);
  }
}

function assertNode(
  node: CyclicMasonryPierNode | null | undefined,
  label: string,
): asserts node is CyclicMasonryPierNode {
  if (!node?.id || !Number.isFinite(node.x) || !Number.isFinite(node.y)) {
    throw new Error(`CyclicMasonryPier2D requires a finite ${label} node.`);
  }
}

function cloneMatrix(matrix: NumericMatrix): NumericMatrix {
  return matrix.map((row) => [...row]);
}

function cloneResponse<T extends object>(response: T): T;
function cloneResponse(response: null): null;
function cloneResponse<T extends object>(response: T | null): T | null {
  if (!response) {
    return null;
  }

  return structuredClone(response);
}

function norm(vector: NumericVector, scales: NumericVector): number {
  return Math.sqrt(vector.reduce((sum, value, index) => sum + (value / scales[index]!) ** 2, 0));
}

function matrixColumns(matrix: NumericMatrix, solver: ColumnSolverLike): NumericMatrix {
  const columns = transpose(matrix).map((column) => solver.solve(column));
  return transpose(columns);
}

function solveScaledSystem(
  solver: MatrixSolverLike,
  matrix: NumericMatrix,
  rhs: NumericVector,
  rowScales: NumericVector,
  columnScales: NumericVector,
): NumericVector {
  const scaledMatrix = matrix.map((row, rowIndex) =>
    row.map((value, columnIndex) => (value * columnScales[columnIndex]!) / rowScales[rowIndex]!),
  );
  const scaledRhs = rhs.map((value, index) => value / rowScales[index]!);
  const scaledSolution = solver.solve(scaledMatrix, scaledRhs);
  return scaledSolution.map((value, index) => value * columnScales[index]!);
}

function scaledLeastSquaresCorrection(
  solver: MatrixSolverLike,
  matrix: NumericMatrix,
  rhs: NumericVector,
  rowScales: NumericVector,
  columnScales: NumericVector,
  damping: number,
): NumericVector {
  const scaledMatrix = matrix.map((row, rowIndex) =>
    row.map((value, columnIndex) => (value * columnScales[columnIndex]!) / rowScales[rowIndex]!),
  );
  const scaledRhs = rhs.map((value, index) => value / rowScales[index]!);
  const transposed = transpose(scaledMatrix);
  const normalMatrix = multiplyMatrices(transposed, scaledMatrix);
  const scale = Math.max(...normalMatrix.flat().map((value) => Math.abs(value)), 1);

  for (let index = 0; index < normalMatrix.length; index += 1) {
    addMatrixEntry(normalMatrix, index, index, damping * scale);
  }

  const normalRhs = multiplyMatrixVector(transposed, scaledRhs);
  const scaledSolution = solver.solve(normalMatrix, normalRhs);
  return scaledSolution.map((value, index) => value * columnScales[index]!);
}

/**
 * Two-node, six-DOF masonry pier macroelement.
 *
 * The elastic axial/flexural core is in series with two fiber N-M interfaces
 * and one central nonlinear shear spring. Five internal deformations are
 * eliminated by a local Newton iteration and static condensation.
 */
export class CyclicMasonryPier2D {
  readonly id: string;
  readonly type: string;
  readonly startNode: CyclicMasonryPierNode;
  readonly endNode: CyclicMasonryPierNode;
  readonly nodeI: CyclicMasonryPierNode;
  readonly nodeJ: CyclicMasonryPierNode;
  readonly nodes: CyclicMasonryPierNode[];
  readonly units: UnitSystem;
  readonly height: number;
  readonly width: number;
  readonly thickness: number;
  readonly deformableHeight: number;
  readonly elasticCoreHeight: number;
  readonly elasticModulus: number;
  readonly shearModulus: number;
  readonly effectiveShearAreaFactor: number;
  readonly fiberCount: number;
  readonly hingeLength: number;
  readonly localTolerance: number;
  readonly maxLocalIterations: number;
  readonly numericalJacobianRelativeStep: number;
  readonly numericalTranslationStep: number;
  readonly numericalRotationStep: number;
  readonly maxLineSearchIterations: number;
  readonly linearSolver: DenseLinearSolver;
  readonly metadata: Record<string, unknown>;
  readonly coupling: CyclicMasonryPierCoupling;
  readonly bottomInterface: MasonryFiberInterface2D;
  readonly topInterface: MasonryFiberInterface2D;
  readonly shearMaterial: CyclicMasonryPierShearMaterial;
  private _compressionMaterialPrototype: MasonryFiberCompressionMaterial | null;
  private _shearMaterialPrototype: CyclicMasonryPierShearMaterial;
  private _committedState!: CyclicMasonryPierState;
  private _trialState!: CyclicMasonryPierState;

  constructor({
    id,
    startNode = null,
    endNode = null,
    nodeI = startNode,
    nodeJ = endNode,
    units = null,
    height = null,
    width,
    thickness,
    deformableHeight = null,
    elasticCoreHeight = null,
    elasticModulus,
    shearModulus,
    effectiveShearAreaFactor = 1,
    fiberCount = 20,
    hingeLength,
    compressionMaterial,
    bottomInterface = null,
    topInterface = null,
    shearMaterial,
    coupling = {},
    localTolerance = 1e-7,
    maxLocalIterations = 40,
    numericalJacobianRelativeStep = 1e-6,
    numericalTranslationStep = 1e-8,
    numericalRotationStep = 1e-8,
    maxLineSearchIterations = 8,
    linearSolver = new DenseLinearSolver({ singularityTolerance: 1e-14 }),
    metadata = {},
  }: CyclicMasonryPier2DOptions = {}) {
    if (!id) {
      throw new Error("A CyclicMasonryPier2D id is required.");
    }

    assertNode(nodeI, "start");
    assertNode(nodeJ, "end");
    assertExplicitUnitSystem(units, "CyclicMasonryPier2D");
    const resolver = createUnitResolver(units, INTERNAL_UNITS);
    const nodeLength = Math.hypot(nodeJ.x - nodeI.x, nodeJ.y - nodeI.y);

    this.id = id;
    this.type = "cyclic-masonry-pier-2d";
    this.startNode = nodeI;
    this.endNode = nodeJ;
    this.nodeI = nodeI;
    this.nodeJ = nodeJ;
    this.nodes = [nodeI, nodeJ];
    this.units = resolver.targetUnitSystem;
    this.height = height == null ? nodeLength : resolver.length(height);
    this.width = resolver.length(width)!;
    this.thickness = resolver.length(thickness)!;
    this.deformableHeight =
      deformableHeight == null ? this.height : resolver.length(deformableHeight);
    this.elasticCoreHeight =
      elasticCoreHeight == null ? this.deformableHeight : resolver.length(elasticCoreHeight);
    this.elasticModulus = resolver.stress(elasticModulus)!;
    this.shearModulus = resolver.stress(shearModulus)!;
    this.effectiveShearAreaFactor = effectiveShearAreaFactor!;
    this.fiberCount = fiberCount!;
    this.hingeLength = resolver.length(hingeLength)!;
    this.localTolerance = localTolerance!;
    this.maxLocalIterations = maxLocalIterations!;
    this.numericalJacobianRelativeStep = numericalJacobianRelativeStep!;
    this.numericalTranslationStep = numericalTranslationStep!;
    this.numericalRotationStep = numericalRotationStep!;
    this.maxLineSearchIterations = maxLineSearchIterations!;
    this.linearSolver = linearSolver;
    this.metadata = {
      ...metadata,
      unitSystem: resolver.targetUnitSystem,
      sourceUnitSystem: metadata.sourceUnitSystem ?? resolver.sourceUnitSystem,
    };
    this.coupling = {
      useCurrentAxialForce: coupling.useCurrentAxialForce ?? true,
      useCompressedLength: coupling.useCompressedLength ?? true,
      compressedLengthStrategy: coupling.compressedLengthStrategy ?? "minimum",
      crushingShearReduction: coupling.crushingShearReduction ?? true,
      shearToInterfaceDamage: coupling.shearToInterfaceDamage ?? false,
    };

    const validationValues: Array<readonly [number, string]> = [
      [nodeLength, "node-to-node length"],
      [this.height, "height"],
      [this.width, "width"],
      [this.thickness, "thickness"],
      [this.deformableHeight, "deformableHeight"],
      [this.elasticCoreHeight, "elasticCoreHeight"],
      [this.elasticModulus, "elasticModulus"],
      [this.shearModulus, "shearModulus"],
      [this.effectiveShearAreaFactor, "effectiveShearAreaFactor"],
      [this.hingeLength, "hingeLength"],
      [this.localTolerance, "localTolerance"],
      [this.maxLocalIterations, "maxLocalIterations"],
      [this.numericalJacobianRelativeStep, "numericalJacobianRelativeStep"],
      [this.numericalTranslationStep, "numericalTranslationStep"],
      [this.numericalRotationStep, "numericalRotationStep"],
    ];
    for (const [value, label] of validationValues) {
      assertPositive(value, label);
    }

    if (Math.abs(this.height - nodeLength) > Math.max(1e-9, 1e-6 * nodeLength)) {
      throw new Error(
        "CyclicMasonryPier2D height must match the distance between its nodes; use deformableHeight for an effective deformable length.",
      );
    }

    if (!new Set(["minimum", "average"]).has(this.coupling.compressedLengthStrategy)) {
      throw new Error(
        'CyclicMasonryPier2D compressedLengthStrategy must be "minimum" or "average".',
      );
    }

    if (!shearMaterial || typeof shearMaterial.clone !== "function") {
      throw new Error("CyclicMasonryPier2D requires a cloneable shearMaterial.");
    }

    const interfaceOptions = {
      units: this.units,
      width: this.width,
      thickness: this.thickness,
      hingeLength: this.hingeLength,
      fiberCount: this.fiberCount,
      localTolerance,
      maxLocalIterations,
      ...(compressionMaterial ? { compressionMaterial } : {}),
    };

    this.bottomInterface =
      bottomInterface?.clone?.() ??
      new MasonryFiberInterface2D({
        id: `${id}-bottom-interface`,
        ...interfaceOptions,
      });
    this.topInterface =
      topInterface?.clone?.() ??
      new MasonryFiberInterface2D({
        id: `${id}-top-interface`,
        ...interfaceOptions,
      });
    this.shearMaterial = shearMaterial.clone();
    this._compressionMaterialPrototype = compressionMaterial?.clone?.() ?? null;
    this._shearMaterialPrototype = shearMaterial.clone();
    this.revertToStart();
  }

  geometry(): { dx: number; dy: number } {
    return {
      dx: this.endNode.x - this.startNode.x,
      dy: this.endNode.y - this.startNode.y,
    };
  }

  directionCosines(): { length: number; c: number; s: number } {
    const { dx, dy } = this.geometry();
    const length = Math.hypot(dx, dy);
    return { length, c: dx / length, s: dy / length };
  }

  transformationMatrix(): NumericMatrix {
    const { c, s } = this.directionCosines();
    return frameTransformationMatrix(c, s);
  }

  getDofIds(dofRegistry: DofRegistryLike): string[] {
    return [
      dofRegistry.getDofId(this.startNode, "ux"),
      dofRegistry.getDofId(this.startNode, "uy"),
      dofRegistry.getDofId(this.startNode, "rz"),
      dofRegistry.getDofId(this.endNode, "ux"),
      dofRegistry.getDofId(this.endNode, "uy"),
      dofRegistry.getDofId(this.endNode, "rz"),
    ];
  }

  localDisplacements(
    globalDisplacements: NumericVector,
    dofRegistry: DofRegistryLike,
  ): NumericVector {
    if (!Array.isArray(globalDisplacements)) {
      throw new Error("CyclicMasonryPier2D localDisplacements requires a displacement vector.");
    }

    const elementDisplacements = this.getDofIds(dofRegistry).map((dofId) => {
      const value = vectorValue(globalDisplacements, dofRegistry.getIndex(dofId));

      if (!Number.isFinite(value)) {
        throw new Error(`CyclicMasonryPier2D displacement for DOF ${dofId} must be finite.`);
      }

      return value;
    });

    return multiplyMatrixVector(this.transformationMatrix(), elementDisplacements);
  }

  bodyBasicStiffness(): NumericMatrix {
    const area = this.width * this.thickness;
    const inertia = (this.thickness * this.width ** 3) / 12;
    const axial = (this.elasticModulus * area) / this.elasticCoreHeight;
    const bending = (this.elasticModulus * inertia) / this.elasticCoreHeight;

    return [
      [axial, 0, 0],
      [0, 4 * bending, 2 * bending],
      [0, 2 * bending, 4 * bending],
    ];
  }

  effectiveShearArea(): number {
    return this.effectiveShearAreaFactor * this.width * this.thickness;
  }

  compressedLength(bottom: MasonryFiberResponse, top: MasonryFiberResponse): number {
    if (!this.coupling.useCompressedLength) {
      return this.width;
    }

    if (this.coupling.compressedLengthStrategy === "average") {
      return 0.5 * (bottom.compressedLength + top.compressedLength);
    }

    return Math.min(bottom.compressedLength, top.compressedLength);
  }

  componentEvaluation(
    internalDeformations: NumericVector,
    basicDeformations: NumericVector,
  ): CyclicMasonryPierComponentEvaluation {
    const compatibility = masonryPierComponentCompatibilityMatrix(this.height);
    const bodyStiffness = this.bodyBasicStiffness();
    const componentContribution = multiplyMatrixVector(compatibility, internalDeformations);
    const bodyDeformations = subtractVectors(basicDeformations, componentContribution);
    const basicForces = multiplyMatrixVector(bodyStiffness, bodyDeformations);
    const bottomForces = this.bottomInterface.setTrialDeformation(
      vectorValue(internalDeformations, 0),
      vectorValue(internalDeformations, 1),
    );
    const topForces = this.topInterface.setTrialDeformation(
      vectorValue(internalDeformations, 2),
      vectorValue(internalDeformations, 3),
    );
    const bottom = this.bottomInterface.getResponse();
    const top = this.topInterface.getResponse();
    const currentAxialCompression = this.coupling.useCurrentAxialForce
      ? Math.min(bottom.compressionResultant, top.compressionResultant)
      : 0;
    const compressedLength = this.compressedLength(bottom, top);
    const compressionDamage = this.coupling.crushingShearReduction
      ? Math.max(bottom.maxCompressionDamage, top.maxCompressionDamage)
      : 0;
    const committedBasicDeformations = this._committedState.basicDeformations ?? [0, 0, 0];
    const shearIncrementHint =
      -0.5 *
      this.height *
      (vectorValue(basicDeformations, 1) -
        vectorValue(committedBasicDeformations, 1) +
        (vectorValue(basicDeformations, 2) - vectorValue(committedBasicDeformations, 2)));
    const shearForce = this.shearMaterial.setTrialDeformation(
      vectorValue(internalDeformations, 4),
      {
        currentAxialCompression,
        compressedLength,
        compressionDamage,
        thickness: this.thickness,
        effectiveShearArea: this.effectiveShearArea(),
        deformableHeight: this.deformableHeight,
        loadingDirectionHint: shearIncrementHint,
      },
    );
    const componentForces = [
      vectorValue(bottomForces, 0),
      vectorValue(bottomForces, 1),
      vectorValue(topForces, 0),
      vectorValue(topForces, 1),
      shearForce,
    ];
    const equilibriumForces = multiplyMatrixVector(transpose(compatibility), basicForces);
    const residual = subtractVectors(componentForces, equilibriumForces);

    return {
      internalDeformations: [...internalDeformations],
      basicDeformations: [...basicDeformations],
      bodyDeformations,
      basicForces,
      componentForces,
      equilibriumForces,
      residual,
      bottom,
      top,
      shear: this.shearMaterial.getState(),
      shearContext: {
        currentAxialCompression,
        compressedLength,
        compressionDamage,
      },
    };
  }

  residualScales(evaluation: CyclicMasonryPierComponentEvaluation): NumericVector {
    const forceScale = Math.max(
      Math.abs(vectorValue(evaluation.basicForces, 0)),
      Math.abs(vectorValue(evaluation.componentForces, 0)),
      Math.abs(vectorValue(evaluation.componentForces, 2)),
      Math.abs(vectorValue(evaluation.componentForces, 4)),
      1,
    );
    const momentScale = Math.max(
      Math.abs(vectorValue(evaluation.basicForces, 1)),
      Math.abs(vectorValue(evaluation.basicForces, 2)),
      forceScale * this.width,
      1,
    );
    return [forceScale, momentScale, forceScale, momentScale, forceScale];
  }

  internalDeformationScales(): NumericVector {
    const compressionPeakStrain = this._compressionMaterialPrototype?.peakStrain ?? 0.002;
    const interfaceTranslation = Math.max(
      this.hingeLength * compressionPeakStrain,
      this.numericalTranslationStep,
    );
    const interfaceRotation = Math.max(
      (2 * interfaceTranslation) / this.width,
      this.numericalRotationStep,
    );
    const shearTranslation = Math.max(
      (this._shearMaterialPrototype?.peakShearStrain ?? 0.004) * this.deformableHeight,
      this.numericalTranslationStep,
    );

    return [
      interfaceTranslation,
      interfaceRotation,
      interfaceTranslation,
      interfaceRotation,
      shearTranslation,
    ];
  }

  numericalLocalJacobian(
    internalDeformations: NumericVector,
    basicDeformations: NumericVector,
  ): NumericMatrix {
    const jacobian: NumericMatrix = Array.from(
      { length: 5 },
      (): NumericVector => new Array<number>(5).fill(0),
    );

    for (let column = 0; column < 5; column += 1) {
      const baseStep =
        column === 1 || column === 3 ? this.numericalRotationStep : this.numericalTranslationStep;
      const step = Math.max(
        baseStep,
        Math.abs(vectorValue(internalDeformations, column)) * this.numericalJacobianRelativeStep,
      );
      const plus = [...internalDeformations];
      const minus = [...internalDeformations];
      plus[column] = vectorValue(plus, column) + step;
      minus[column] = vectorValue(minus, column) - step;
      const residualPlus = this.componentEvaluation(plus, basicDeformations).residual;
      const residualMinus = this.componentEvaluation(minus, basicDeformations).residual;

      for (let row = 0; row < 5; row += 1) {
        jacobian[row]![column] =
          (vectorValue(residualPlus, row) - vectorValue(residualMinus, row)) / (2 * step);
      }
    }

    this.componentEvaluation(internalDeformations, basicDeformations);
    return jacobian;
  }

  consistentLocalJacobian(
    internalDeformations: NumericVector,
    basicDeformations: NumericVector,
    evaluation: CyclicMasonryPierComponentEvaluation = this.componentEvaluation(
      internalDeformations,
      basicDeformations,
    ),
  ): NumericMatrix {
    const compatibility = masonryPierComponentCompatibilityMatrix(this.height);
    const bodyContribution = multiplyMatrices(
      transpose(compatibility),
      multiplyMatrices(this.bodyBasicStiffness(), compatibility),
    );
    const jacobian = cloneMatrix(bodyContribution);
    const bottomTangent = evaluation.bottom.tangent;
    const topTangent = evaluation.top.tangent;

    addMatrixEntry(jacobian, 0, 0, matrixValue(bottomTangent, 0, 0));
    addMatrixEntry(jacobian, 0, 1, matrixValue(bottomTangent, 0, 1));
    addMatrixEntry(jacobian, 1, 0, matrixValue(bottomTangent, 1, 0));
    addMatrixEntry(jacobian, 1, 1, matrixValue(bottomTangent, 1, 1));
    addMatrixEntry(jacobian, 2, 2, matrixValue(topTangent, 0, 0));
    addMatrixEntry(jacobian, 2, 3, matrixValue(topTangent, 0, 1));
    addMatrixEntry(jacobian, 3, 2, matrixValue(topTangent, 1, 0));
    addMatrixEntry(jacobian, 3, 3, matrixValue(topTangent, 1, 1));
    addMatrixEntry(jacobian, 4, 4, evaluation.shear.tangent);

    // Only the shear row needs numerical coupling terms: the fiber tangents
    // above already provide exact N-M derivatives. A one-sided perturbation in
    // the current trial direction avoids averaging loading and unloading
    // branches at reversals.
    for (let column = 0; column < 4; column += 1) {
      const baseStep =
        column === 1 || column === 3 ? this.numericalRotationStep : this.numericalTranslationStep;
      const step = Math.max(
        baseStep,
        Math.abs(vectorValue(internalDeformations, column)) * this.numericalJacobianRelativeStep,
      );
      const committedValue =
        vectorValue(this._committedState.internalDeformations ?? [], column) || 0;
      const trialDirection =
        Math.sign(vectorValue(internalDeformations, column) - committedValue) || 1;
      const perturbed = [...internalDeformations];
      perturbed[column] = vectorValue(perturbed, column) + trialDirection * step;
      const perturbedEvaluation = this.componentEvaluation(perturbed, basicDeformations);
      const shearCouplingDerivative =
        (perturbedEvaluation.shear.force - evaluation.shear.force) / (trialDirection * step);

      addMatrixEntry(jacobian, 4, column, shearCouplingDerivative);
    }

    this.componentEvaluation(internalDeformations, basicDeformations);
    return jacobian;
  }

  solveLocalState(basicDeformations: NumericVector): CyclicMasonryPierLocalState {
    const committedInternalDeformations = this._committedState.internalDeformations ?? [
      0, 0, 0, 0, 0,
    ];
    let internalDeformations = [...committedInternalDeformations];

    if (
      internalDeformations.every((value) => Math.abs(value) <= 1e-16) &&
      basicDeformations.some((value) => Math.abs(value) > 1e-16)
    ) {
      const interfaceShare = 0.05;
      internalDeformations = [
        interfaceShare * Math.min(0, vectorValue(basicDeformations, 0)),
        interfaceShare * vectorValue(basicDeformations, 1),
        interfaceShare * Math.min(0, vectorValue(basicDeformations, 0)),
        interfaceShare * vectorValue(basicDeformations, 2),
        -0.25 *
          this.height *
          (vectorValue(basicDeformations, 1) + vectorValue(basicDeformations, 2)),
      ];
    }
    let evaluation = this.componentEvaluation(internalDeformations, basicDeformations);
    let residualNorm = norm(evaluation.residual, this.residualScales(evaluation));
    let iteration = 1;

    for (; iteration <= this.maxLocalIterations; iteration += 1) {
      if (residualNorm <= this.localTolerance) {
        break;
      }

      const jacobian = this.consistentLocalJacobian(
        internalDeformations,
        basicDeformations,
        evaluation,
      );
      const correctionCandidates = [];

      try {
        correctionCandidates.push(
          solveScaledSystem(
            this.linearSolver,
            jacobian,
            evaluation.residual.map((value) => -value),
            this.residualScales(evaluation),
            this.internalDeformationScales(),
          ),
        );
      } catch {
        // A damped least-squares correction below handles rank loss.
      }

      for (const damping of [1e-8, 1e-6, 1e-4, 1e-2, 1, 100]) {
        try {
          correctionCandidates.push(
            scaledLeastSquaresCorrection(
              this.linearSolver,
              jacobian,
              evaluation.residual.map((value) => -value),
              this.residualScales(evaluation),
              this.internalDeformationScales(),
              damping,
            ),
          );
        } catch {
          // Try the next damping level.
        }
      }

      if (correctionCandidates.length === 0) {
        throw new Error(
          `CyclicMasonryPier2D ${this.id} local iteration ${iteration} could not compute either a Newton or a damped least-squares correction.`,
        );
      }

      let accepted = false;
      let bestEvaluation = evaluation;
      let bestDeformations = internalDeformations;
      let bestNorm = Infinity;

      for (const correction of correctionCandidates) {
        for (let lineSearch = 0; lineSearch <= this.maxLineSearchIterations; lineSearch += 1) {
          const factor = 0.5 ** lineSearch;
          const candidate = addVectors(
            internalDeformations,
            correction.map((value) => factor * value),
          );
          const candidateEvaluation = this.componentEvaluation(candidate, basicDeformations);
          const candidateNorm = norm(
            candidateEvaluation.residual,
            this.residualScales(candidateEvaluation),
          );

          if (candidateNorm < bestNorm) {
            bestNorm = candidateNorm;
            bestEvaluation = candidateEvaluation;
            bestDeformations = candidate;
          }

          if (candidateNorm < residualNorm) {
            accepted = true;
          }
        }
      }

      if (!accepted && !Number.isFinite(bestNorm)) {
        throw new Error(
          `CyclicMasonryPier2D ${this.id} local Newton line search stalled at iteration ${iteration} (normalized residual ${residualNorm}).`,
        );
      }

      internalDeformations = bestDeformations;
      evaluation = bestEvaluation;
      residualNorm = bestNorm;
    }

    if (residualNorm > this.localTolerance) {
      throw new Error(
        `CyclicMasonryPier2D ${this.id} local Newton iteration did not converge in ${this.maxLocalIterations} iterations (normalized residual ${residualNorm}; residual [${evaluation.residual.join(", ")}]; internal deformations [${internalDeformations.join(", ")}]; shear force ${evaluation.shear.force}; compatible shear force ${evaluation.equilibriumForces[4]}).`,
      );
    }

    evaluation = this.componentEvaluation(internalDeformations, basicDeformations);
    const jacobian = this.consistentLocalJacobian(
      internalDeformations,
      basicDeformations,
      evaluation,
    );
    const compatibility = masonryPierComponentCompatibilityMatrix(this.height);
    const bodyStiffness = this.bodyBasicStiffness();
    const rightHandSide = multiplyMatrices(transpose(compatibility), bodyStiffness);
    const rowScales = this.residualScales(evaluation);
    const columnScales = this.internalDeformationScales();
    const dzDv = matrixColumns(rightHandSide, {
      solve: (column) =>
        solveScaledSystem(this.linearSolver, jacobian, column, rowScales, columnScales),
    });
    const basicTangent = multiplyMatrices(
      bodyStiffness,
      subtractMatrices(identityMatrix(3), multiplyMatrices(compatibility, dzDv)),
    );

    return {
      ...evaluation,
      internalDeformations,
      jacobian,
      basicTangent,
      localIterations: iteration,
      localResidualNorm: residualNorm,
      localConverged: true,
    };
  }

  setTrialLocalDisplacements(localDisplacements: NumericVector): CyclicMasonryPierState {
    if (
      !Array.isArray(localDisplacements) ||
      localDisplacements.length !== 6 ||
      localDisplacements.some((value) => !Number.isFinite(value))
    ) {
      throw new Error(
        "CyclicMasonryPier2D setTrialLocalDisplacements requires six finite entries.",
      );
    }

    const basicKinematics = masonryPierBasicKinematicMatrix(this.height);
    const basicDeformations = multiplyMatrixVector(basicKinematics, localDisplacements);
    const localState = this.solveLocalState(basicDeformations);
    const localForces = multiplyMatrixVector(transpose(basicKinematics), localState.basicForces);
    const localTangent = multiplyMatrices(
      transpose(basicKinematics),
      multiplyMatrices(localState.basicTangent, basicKinematics),
    );
    const shear = localState.shear;
    const bottom = localState.bottom;
    const top = localState.top;
    const flexuralUtilization = Math.max(
      bottom.crushingIndex,
      top.crushingIndex,
      bottom.rockingIndex,
      top.rockingIndex,
    );
    const mechanismIndices = {
      rocking: Math.max(bottom.rockingIndex, top.rockingIndex),
      crushing: Math.max(bottom.crushingIndex, top.crushingIndex),
      diagonalTension: shear.diagonalCrackingIndex,
      sliding: shear.slidingIndex,
    };
    const predominantEntry = Object.entries(mechanismIndices).reduce(
      (governing, entry) => (entry[1] > governing[1] ? entry : governing),
      ["elastic", 0],
    );
    const predominantMechanism =
      predominantEntry[0] === "diagonalTension" ? "diagonal-tension" : predominantEntry[0];
    const mechanismsActivated = new Set([
      ...bottom.mechanismsActivated,
      ...top.mechanismsActivated,
      ...shear.mechanismsActivated,
    ]);

    this._trialState = {
      version: STATE_VERSION,
      internalDeformations: [...localState.internalDeformations],
      localDisplacements: [...localDisplacements],
      basicDeformations: [...basicDeformations],
      bodyDeformations: [...localState.bodyDeformations],
      basicForces: [...localState.basicForces],
      localForces,
      localTangent,
      basicTangent: cloneMatrix(localState.basicTangent),
      axialForce: vectorValue(localState.basicForces, 0),
      shearForce: shear.force,
      endMoments: [vectorValue(localState.basicForces, 1), vectorValue(localState.basicForces, 2)],
      shearDeformation: vectorValue(localState.internalDeformations, 4),
      interfaceRotations: [
        vectorValue(localState.internalDeformations, 1),
        vectorValue(localState.internalDeformations, 3),
      ],
      compressedLengths: [bottom.compressedLength, top.compressedLength],
      compressionResultants: [bottom.compressionResultant, top.compressionResultant],
      fiberStrainExtremes: {
        bottom: {
          minimum: bottom.minFiberStrain,
          maximum: bottom.maxFiberStrain,
        },
        top: {
          minimum: top.minFiberStrain,
          maximum: top.maxFiberStrain,
        },
      },
      compressionDamage: Math.max(bottom.maxCompressionDamage, top.maxCompressionDamage),
      shearDamage: shear.damage,
      energyDissipated: bottom.energyDissipated + top.energyDissipated + shear.dissipatedEnergy,
      mechanismIndices,
      predominantMechanism:
        flexuralUtilization === 0 && Math.abs(shear.force) === 0 ? "elastic" : predominantMechanism,
      mechanismsActivated: [...mechanismsActivated],
      bottomInterface: bottom,
      topInterface: top,
      shear,
      shearContext: { ...localState.shearContext },
      localIterations: localState.localIterations,
      localResidualNorm: localState.localResidualNorm,
      localConverged: true,
      warnings: this.coupling.shearToInterfaceDamage
        ? [
            "shearToInterfaceDamage is requested but not implemented in version 1; the software coupling slot is reserved and no interface degradation has been applied.",
          ]
        : [],
    };

    return this.getResponse();
  }

  evaluate({
    globalDisplacements,
    localDisplacements = null,
    dofRegistry = null,
    state = null,
  }: CyclicMasonryPierEvaluateInput = {}): CyclicMasonryPierEvaluation {
    if (state) {
      const working = this.clone({ preserveState: false });
      working.importState(state, { committed: true });
      const response = working.evaluate({
        globalDisplacements,
        localDisplacements,
        dofRegistry,
      });
      working.commitState();
      return {
        ...response,
        state: working.exportState({ committed: true }),
      };
    }

    const resolvedLocalDisplacements =
      localDisplacements ?? this.localDisplacements(globalDisplacements!, dofRegistry!);
    const response = this.setTrialLocalDisplacements(resolvedLocalDisplacements);
    const transformation = this.transformationMatrix();
    const globalForces = multiplyMatrixVector(transpose(transformation), response.localForces!);
    const globalTangent = multiplyMatrices(
      transpose(transformation),
      multiplyMatrices(response.localTangent!, transformation),
    );

    return {
      ...response,
      globalForces,
      globalEndForces: globalForces,
      tangentLocalStiffness: cloneMatrix(response.localTangent!),
      tangentGlobalStiffness: globalTangent,
      globalTangent,
      state: this.exportState({ committed: false }),
    };
  }

  globalStiffness(): NumericMatrix {
    const response = this.evaluate({ localDisplacements: new Array(6).fill(0) });
    return response.globalTangent!;
  }

  getGlobalStiffness(): NumericMatrix {
    return this.globalStiffness();
  }

  getResponse(): CyclicMasonryPierState {
    return cloneResponse(this._trialState);
  }

  getCommittedResponse(): CyclicMasonryPierState {
    return cloneResponse(this._committedState);
  }

  commitState(): number {
    this.bottomInterface.commitState();
    this.topInterface.commitState();
    this.shearMaterial.commitState();
    this._committedState = cloneResponse(this._trialState);
    return 0;
  }

  revertToLastCommit(): number {
    this.bottomInterface.revertToLastCommit();
    this.topInterface.revertToLastCommit();
    this.shearMaterial.revertToLastCommit();
    this._trialState = cloneResponse(this._committedState);
    return 0;
  }

  revertToStart(): number {
    this.bottomInterface.revertToStart();
    this.topInterface.revertToStart();
    this.shearMaterial.revertToStart();
    this._committedState = {
      version: STATE_VERSION,
      internalDeformations: [0, 0, 0, 0, 0],
      localDisplacements: [0, 0, 0, 0, 0, 0],
      localForces: [0, 0, 0, 0, 0, 0],
      localTangent: Array.from({ length: 6 }, (): NumericVector => new Array<number>(6).fill(0)),
      basicTangent: Array.from({ length: 3 }, (): NumericVector => new Array<number>(3).fill(0)),
      axialForce: 0,
      shearForce: 0,
      endMoments: [0, 0],
      shearDeformation: 0,
      interfaceRotations: [0, 0],
      compressedLengths: [0, 0],
      compressionDamage: 0,
      shearDamage: 0,
      energyDissipated: 0,
      mechanismIndices: {
        rocking: 0,
        crushing: 0,
        diagonalTension: 0,
        sliding: 0,
      },
      predominantMechanism: "elastic",
      mechanismsActivated: [],
      localIterations: 0,
      localResidualNorm: 0,
      localConverged: true,
      warnings: [],
    };
    this._trialState = cloneResponse(this._committedState);
    return 0;
  }

  exportState({ committed = true }: { committed?: boolean } = {}): CyclicMasonryPierStateExport {
    return {
      version: STATE_VERSION,
      response: committed ? this.getCommittedResponse() : this.getResponse(),
      bottomInterface: this.bottomInterface.exportState({ committed }),
      topInterface: this.topInterface.exportState({ committed }),
      shearMaterial: committed
        ? this.shearMaterial.getCommittedState()
        : this.shearMaterial.getState(),
    };
  }

  importState(
    state: CyclicMasonryPierStateExport,
    { committed = true }: { committed?: boolean } = {},
  ): this {
    if (!state || state.version !== STATE_VERSION) {
      throw new Error(`CyclicMasonryPier2D requires state version ${STATE_VERSION}.`);
    }

    this.bottomInterface.importState(state.bottomInterface, { committed });
    this.topInterface.importState(state.topInterface, { committed });
    this.shearMaterial.importState(state.shearMaterial, { committed });
    this._trialState = cloneResponse(state.response);

    if (committed) {
      this._committedState = cloneResponse(state.response);
    }

    return this;
  }

  clone({ preserveState = true }: { preserveState?: boolean } = {}): CyclicMasonryPier2D {
    const cloned = new CyclicMasonryPier2D({
      id: this.id,
      startNode: this.startNode,
      endNode: this.endNode,
      units: this.units,
      height: this.height,
      width: this.width,
      thickness: this.thickness,
      deformableHeight: this.deformableHeight,
      elasticCoreHeight: this.elasticCoreHeight,
      elasticModulus: this.elasticModulus,
      shearModulus: this.shearModulus,
      effectiveShearAreaFactor: this.effectiveShearAreaFactor,
      fiberCount: this.fiberCount,
      hingeLength: this.hingeLength,
      compressionMaterial: this._compressionMaterialPrototype!,
      bottomInterface: this.bottomInterface,
      topInterface: this.topInterface,
      shearMaterial: this._shearMaterialPrototype,
      coupling: { ...this.coupling },
      localTolerance: this.localTolerance,
      maxLocalIterations: this.maxLocalIterations,
      numericalJacobianRelativeStep: this.numericalJacobianRelativeStep,
      numericalTranslationStep: this.numericalTranslationStep,
      numericalRotationStep: this.numericalRotationStep,
      maxLineSearchIterations: this.maxLineSearchIterations,
      linearSolver: this.linearSolver,
      metadata: { ...this.metadata },
    });

    if (preserveState) {
      cloned.importState(this.exportState(), { committed: true });
    }

    return cloned;
  }

  toJSON(): CyclicMasonryPierJson {
    return {
      id: this.id,
      type: this.type,
      startNodeId: this.startNode.id,
      endNodeId: this.endNode.id,
      units: { ...this.units },
      height: this.height,
      width: this.width,
      thickness: this.thickness,
      deformableHeight: this.deformableHeight,
      elasticCoreHeight: this.elasticCoreHeight,
      elasticModulus: this.elasticModulus,
      shearModulus: this.shearModulus,
      effectiveShearAreaFactor: this.effectiveShearAreaFactor,
      fiberCount: this.fiberCount,
      hingeLength: this.hingeLength,
      coupling: { ...this.coupling },
      state: this.exportState(),
      metadata: { ...this.metadata },
    };
  }
}
