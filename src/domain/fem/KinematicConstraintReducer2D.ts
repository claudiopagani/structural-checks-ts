import {
  createZeroMatrix,
  type NumericMatrix,
  type NumericVector,
} from "../math/arrayLinearAlgebra.js";
import type { DofNodeLike, DofRegistry } from "./DofRegistry.js";

export interface FemSupportConstraintLike {
  id?: string | null;
  node?: DofNodeLike | null;
  restraints?: Record<string, boolean | undefined>;
  prescribedDisplacements?: Record<string, number | undefined>;
  imposedDisplacements?: Record<string, number | undefined>;
  settlements?: Record<string, number | undefined>;
  isRestrained?: (dof: string) => boolean;
}

export interface KinematicConstraintLike {
  type?: string | null;
  dofId?: string | null;
  node?: DofNodeLike | null;
  nodeId?: string | null;
  dof?: string | null;
  value?: number;
  displacement?: number;
  prescribedValue?: number;
  masterDofId?: string | null;
  masterNode?: DofNodeLike | null;
  masterNodeId?: string | null;
  masterDof?: string | null;
  masterComponent?: string | null;
  slaveDofId?: string | null;
  slaveNode?: DofNodeLike | null;
  slaveNodeId?: string | null;
  slaveDof?: string | null;
  slaveComponent?: string | null;
  scale?: number;
  ratio?: number;
  offset?: number;
  constant?: number;
}

interface EqualDofDependency {
  masterIndex: number;
  scale: number;
  offset: number;
}

interface DofExpression {
  rootIndex: number | null;
  scale: number;
  offset: number;
}

interface ActiveDofMapping {
  fullIndex: number;
  reducedIndex: number;
  scale: number;
}

export interface KinematicReductionJson {
  fullSize: number;
  reducedSize: number;
  reducedDofIds: string[];
  prescribedDofIds: string[];
  dependentDofIds: string[];
  constrainedDofIds: string[];
  transformationMatrix: NumericMatrix;
  offsetVector: NumericVector;
}

export interface KinematicReduction2D {
  fullSize: number;
  transformationMatrix: NumericMatrix;
  offsetVector: NumericVector;
  reducedDofIds: string[];
  prescribedDofIds: string[];
  dependentDofIds: string[];
  constrainedDofIds: string[];
  reduceVector: (vector?: NumericVector) => NumericVector;
  expandReducedVector: (reducedVector?: NumericVector) => NumericVector;
  reduceStiffnessMatrix: (stiffnessMatrix?: NumericMatrix) => NumericMatrix;
  reduceLinearSystem: (
    stiffnessMatrix?: NumericMatrix,
    loadVector?: NumericVector,
  ) => {
    stiffnessMatrix: NumericMatrix;
    loadVector: NumericVector;
  };
  reducedSize: () => number;
  toJSON: () => KinematicReductionJson;
}

function matrixRow(matrix: NumericMatrix, index: number): NumericVector {
  const row = matrix[index];
  if (row === undefined) {
    throw new Error("KinematicConstraintReducer2D matrix row is unavailable.");
  }
  return row;
}

function vectorValue(vector: NumericVector, index: number): number {
  const value = vector[index];
  if (value === undefined) {
    throw new Error("KinematicConstraintReducer2D vector value is unavailable.");
  }
  return value;
}

function validateDenseSquareMatrix(matrix: NumericMatrix, size: number, context: string): void {
  if (!Array.isArray(matrix) || matrix.length !== size) {
    throw new Error(`${context} requires a ${size}x${size} matrix.`);
  }

  for (const row of matrix) {
    if (!Array.isArray(row) || row.length !== size) {
      throw new Error(`${context} requires a ${size}x${size} matrix.`);
    }
  }
}

function resolveConstraintDofId(
  constraint: KinematicConstraintLike,
  dofRegistry: DofRegistry,
): string {
  if (constraint.dofId) {
    return constraint.dofId;
  }

  if (constraint.node && constraint.dof) {
    return dofRegistry.getDofId(constraint.node, constraint.dof);
  }

  if (constraint.nodeId && constraint.dof) {
    return dofRegistry.getDofId(constraint.nodeId, constraint.dof);
  }

  throw new Error(
    "KinematicConstraintReducer2D displacement constraint requires dofId or node/nodeId plus dof.",
  );
}

function resolveConstraintValue(constraint: KinematicConstraintLike): number {
  const value = constraint.value ?? constraint.displacement ?? constraint.prescribedValue ?? 0;

  if (!Number.isFinite(value)) {
    throw new Error("KinematicConstraintReducer2D constraint value must be finite.");
  }

  return value;
}

function supportConstraintValue(support: FemSupportConstraintLike, dof: string): number {
  return (
    support.prescribedDisplacements?.[dof] ??
    support.imposedDisplacements?.[dof] ??
    support.settlements?.[dof] ??
    0
  );
}

function isEqualDofConstraint(constraint: KinematicConstraintLike): boolean {
  const type = String(constraint.type ?? "")
    .trim()
    .toLowerCase();

  if (
    type === "equal-dof" ||
    type === "equal dof" ||
    type === "kinematic-link" ||
    type === "diaphragm-link"
  ) {
    return true;
  }

  return Boolean(
    (constraint.masterDofId || constraint.masterNode || constraint.masterNodeId) &&
      (constraint.slaveDofId || constraint.slaveNode || constraint.slaveNodeId),
  );
}

function resolveEqualDofEndpoint(
  constraint: KinematicConstraintLike,
  role: "master" | "slave",
  dofRegistry: DofRegistry,
): string {
  const explicitDofId = role === "master" ? constraint.masterDofId : constraint.slaveDofId;

  if (explicitDofId) {
    return explicitDofId;
  }

  const node = role === "master" ? constraint.masterNode : constraint.slaveNode;
  const nodeId = role === "master" ? constraint.masterNodeId : constraint.slaveNodeId;
  const roleDof = role === "master" ? constraint.masterDof : constraint.slaveDof;
  const component = role === "master" ? constraint.masterComponent : constraint.slaveComponent;
  const dof = roleDof ?? constraint.dof ?? component ?? null;

  if (node && dof) {
    return dofRegistry.getDofId(node, dof);
  }

  if (nodeId && dof) {
    return dofRegistry.getDofId(nodeId, dof);
  }

  throw new Error(
    `KinematicConstraintReducer2D equal-DOF constraint requires ${role}DofId or ${role}Node/${role}NodeId plus a DOF.`,
  );
}

function resolveEqualDofScale(constraint: KinematicConstraintLike): number {
  const scale = constraint.scale ?? constraint.ratio ?? 1;

  if (!Number.isFinite(scale) || Math.abs(scale) <= 0) {
    throw new Error("KinematicConstraintReducer2D equal-DOF scale must be finite and non-zero.");
  }

  return scale;
}

function resolveEqualDofOffset(constraint: KinematicConstraintLike): number {
  const offset = constraint.offset ?? constraint.constant ?? 0;

  if (!Number.isFinite(offset)) {
    throw new Error("KinematicConstraintReducer2D equal-DOF offset must be finite.");
  }

  return offset;
}

function compareEqualDependencies(left: EqualDofDependency, right: EqualDofDependency): boolean {
  return (
    left.masterIndex === right.masterIndex &&
    Math.abs(left.scale - right.scale) <= 1e-12 &&
    Math.abs(left.offset - right.offset) <= 1e-12
  );
}

function addPrescribedConstraint(
  prescribedByIndex: Map<number, number>,
  dependentByIndex: Map<number, EqualDofDependency>,
  index: number,
  value: number,
  dofId: string,
): void {
  if (dependentByIndex.has(index)) {
    throw new Error(
      `KinematicConstraintReducer2D received both a prescribed displacement and an equal-DOF dependency for DOF ${dofId}.`,
    );
  }

  const existing = prescribedByIndex.get(index);
  if (existing !== undefined) {
    if (Math.abs(existing - value) > 1e-12) {
      throw new Error(
        `KinematicConstraintReducer2D received conflicting constraints for DOF ${dofId}.`,
      );
    }

    return;
  }

  prescribedByIndex.set(index, value);
}

function addEqualDependency(
  dependentByIndex: Map<number, EqualDofDependency>,
  prescribedByIndex: Map<number, number>,
  index: number,
  dependency: EqualDofDependency,
  dofId: string,
): void {
  if (prescribedByIndex.has(index)) {
    throw new Error(
      `KinematicConstraintReducer2D received both a prescribed displacement and an equal-DOF dependency for DOF ${dofId}.`,
    );
  }

  const existing = dependentByIndex.get(index);
  if (existing) {
    if (!compareEqualDependencies(existing, dependency)) {
      throw new Error(
        `KinematicConstraintReducer2D received conflicting constraints for DOF ${dofId}.`,
      );
    }

    return;
  }

  dependentByIndex.set(index, dependency);
}

export class KinematicConstraintReducer2D {
  build({
    dofRegistry,
    supports = [],
    constraints = [],
  }: {
    dofRegistry?: DofRegistry;
    supports?: readonly FemSupportConstraintLike[];
    constraints?: readonly KinematicConstraintLike[];
  } = {}): KinematicReduction2D {
    const size = dofRegistry?.size();

    if (!Number.isFinite(size) || (size as number) < 0 || !dofRegistry) {
      throw new Error(
        "KinematicConstraintReducer2D requires a valid dofRegistry with a finite size.",
      );
    }

    const fullSize = size as number;
    const dofIds = dofRegistry.getDofIds();
    const prescribedByIndex = new Map<number, number>();
    const dependentByIndex = new Map<number, EqualDofDependency>();

    for (const support of supports) {
      if (!support.node) {
        continue;
      }

      for (const dof of dofRegistry.dofsPerNode) {
        const isRestrained =
          typeof support.isRestrained === "function"
            ? support.isRestrained(dof)
            : Boolean(support.restraints?.[dof]);

        if (!isRestrained) {
          continue;
        }

        const value = supportConstraintValue(support, dof);

        if (!Number.isFinite(value)) {
          throw new Error(
            `KinematicConstraintReducer2D support ${support.id ?? "<unknown>"} prescribed displacement for DOF ${dof} must be finite.`,
          );
        }

        const dofId = dofRegistry.getDofId(support.node, dof);
        addPrescribedConstraint(
          prescribedByIndex,
          dependentByIndex,
          dofRegistry.getIndex(dofId),
          value,
          dofId,
        );
      }
    }

    for (const constraint of constraints) {
      if (isEqualDofConstraint(constraint)) {
        const slaveDofId = resolveEqualDofEndpoint(constraint, "slave", dofRegistry);
        const masterDofId = resolveEqualDofEndpoint(constraint, "master", dofRegistry);

        if (slaveDofId === masterDofId) {
          throw new Error(
            `KinematicConstraintReducer2D equal-DOF constraint cannot tie DOF ${slaveDofId} to itself.`,
          );
        }

        addEqualDependency(
          dependentByIndex,
          prescribedByIndex,
          dofRegistry.getIndex(slaveDofId),
          {
            masterIndex: dofRegistry.getIndex(masterDofId),
            scale: resolveEqualDofScale(constraint),
            offset: resolveEqualDofOffset(constraint),
          },
          slaveDofId,
        );
        continue;
      }

      const dofId = resolveConstraintDofId(constraint, dofRegistry);

      addPrescribedConstraint(
        prescribedByIndex,
        dependentByIndex,
        dofRegistry.getIndex(dofId),
        resolveConstraintValue(constraint),
        dofId,
      );
    }

    const expressionByIndex = new Map<number, DofExpression>();

    const resolveExpression = (index: number, trail: number[] = []): DofExpression => {
      const existingExpression = expressionByIndex.get(index);
      if (existingExpression) {
        return existingExpression;
      }

      if (trail.includes(index)) {
        const cycle = [...trail, index].map((cycleIndex) => dofIds[cycleIndex]).join(" -> ");

        throw new Error(
          `KinematicConstraintReducer2D detected a cyclic equal-DOF dependency: ${cycle}.`,
        );
      }

      let expression: DofExpression;
      const prescribedValue = prescribedByIndex.get(index);
      const dependency = dependentByIndex.get(index);

      if (prescribedValue !== undefined) {
        expression = {
          rootIndex: null,
          scale: 0,
          offset: prescribedValue,
        };
      } else if (dependency) {
        const masterExpression = resolveExpression(dependency.masterIndex, [...trail, index]);

        if (masterExpression.rootIndex == null) {
          expression = {
            rootIndex: null,
            scale: 0,
            offset: dependency.scale * masterExpression.offset + dependency.offset,
          };
        } else {
          expression = {
            rootIndex: masterExpression.rootIndex,
            scale: dependency.scale * masterExpression.scale,
            offset: dependency.scale * masterExpression.offset + dependency.offset,
          };
        }
      } else {
        expression = {
          rootIndex: index,
          scale: 1,
          offset: 0,
        };
      }

      expressionByIndex.set(index, expression);

      return expression;
    };

    const rootIndices: number[] = [];
    const rootIndexSet = new Set<number>();

    for (let index = 0; index < fullSize; index += 1) {
      const expression = resolveExpression(index);

      if (expression.rootIndex == null || rootIndexSet.has(expression.rootIndex)) {
        continue;
      }

      rootIndices.push(expression.rootIndex);
      rootIndexSet.add(expression.rootIndex);
    }

    rootIndices.sort((left, right) => left - right);

    const reducedIndexByRoot = new Map<number, number>(
      rootIndices.map((rootIndex, reducedIndex) => [rootIndex, reducedIndex]),
    );
    const transformationMatrix = createZeroMatrix(fullSize, rootIndices.length);
    const offsetVector = new Array<number>(fullSize).fill(0);
    const reducedIndexByFullIndex = new Array<number>(fullSize).fill(-1);
    const scaleByFullIndex = new Array<number>(fullSize).fill(0);
    const activeMappings: ActiveDofMapping[] = [];

    for (let index = 0; index < fullSize; index += 1) {
      const expression = resolveExpression(index);

      offsetVector[index] = expression.offset;

      if (expression.rootIndex == null) {
        continue;
      }

      const reducedIndex = reducedIndexByRoot.get(expression.rootIndex);
      if (reducedIndex === undefined) {
        throw new Error(
          "KinematicConstraintReducer2D internal reduced DOF mapping is unavailable.",
        );
      }

      matrixRow(transformationMatrix, index)[reducedIndex] = expression.scale;
      reducedIndexByFullIndex[index] = reducedIndex;
      scaleByFullIndex[index] = expression.scale;
      activeMappings.push({
        fullIndex: index,
        reducedIndex,
        scale: expression.scale,
      });
    }

    const reducedDofIds = rootIndices.map((rootIndex) => {
      const dofId = dofIds[rootIndex];
      if (dofId === undefined) {
        throw new Error("KinematicConstraintReducer2D internal reduced DOF id is unavailable.");
      }
      return dofId;
    });
    const prescribedDofIds = [...prescribedByIndex.keys()]
      .sort((left, right) => left - right)
      .map((index) => {
        const dofId = dofIds[index];
        if (dofId === undefined) {
          throw new Error(
            "KinematicConstraintReducer2D internal prescribed DOF id is unavailable.",
          );
        }
        return dofId;
      });
    const dependentDofIds = [...dependentByIndex.keys()]
      .sort((left, right) => left - right)
      .map((index) => {
        const dofId = dofIds[index];
        if (dofId === undefined) {
          throw new Error("KinematicConstraintReducer2D internal dependent DOF id is unavailable.");
        }
        return dofId;
      });
    const constrainedDofIds = [...new Set([...prescribedDofIds, ...dependentDofIds])];
    const hasNonZeroOffset = offsetVector.some((value) => value !== 0);
    const identityTransformation =
      activeMappings.length === fullSize &&
      activeMappings.every(
        (mapping) => mapping.fullIndex === mapping.reducedIndex && mapping.scale === 1,
      ) &&
      !hasNonZeroOffset;

    const reduceVectorWithMappings = (vector: NumericVector): NumericVector => {
      const reduced = new Array<number>(rootIndices.length).fill(0);

      for (const mapping of activeMappings) {
        reduced[mapping.reducedIndex] =
          vectorValue(reduced, mapping.reducedIndex) +
          mapping.scale * (vector[mapping.fullIndex] ?? 0);
      }

      return reduced;
    };

    const reduction: KinematicReduction2D = {
      fullSize,
      transformationMatrix,
      offsetVector,
      reducedDofIds,
      prescribedDofIds,
      dependentDofIds,
      constrainedDofIds,
      reduceVector(vector = []): NumericVector {
        if (!Array.isArray(vector) || vector.length !== fullSize) {
          throw new Error(
            `KinematicConstraintReducer2D reduceVector requires a vector with ${fullSize} entries.`,
          );
        }

        return reduceVectorWithMappings(vector);
      },
      expandReducedVector(reducedVector = []): NumericVector {
        if (!Array.isArray(reducedVector) || reducedVector.length !== rootIndices.length) {
          throw new Error(
            `KinematicConstraintReducer2D expandReducedVector requires a vector with ${rootIndices.length} entries.`,
          );
        }

        return offsetVector.map((offset, fullIndex) => {
          const reducedIndex = vectorValue(reducedIndexByFullIndex, fullIndex);

          return reducedIndex < 0
            ? offset
            : offset +
                vectorValue(scaleByFullIndex, fullIndex) * vectorValue(reducedVector, reducedIndex);
        });
      },
      reduceStiffnessMatrix(stiffnessMatrix = []): NumericMatrix {
        validateDenseSquareMatrix(
          stiffnessMatrix,
          fullSize,
          "KinematicConstraintReducer2D reduceStiffnessMatrix",
        );

        if (identityTransformation) {
          return stiffnessMatrix.map((row) => [...row]);
        }

        const reduced = createZeroMatrix(rootIndices.length);

        for (const rowMapping of activeMappings) {
          const sourceRow = matrixRow(stiffnessMatrix, rowMapping.fullIndex);
          const reducedRow = matrixRow(reduced, rowMapping.reducedIndex);

          for (const columnMapping of activeMappings) {
            reducedRow[columnMapping.reducedIndex] =
              vectorValue(reducedRow, columnMapping.reducedIndex) +
              rowMapping.scale *
                vectorValue(sourceRow, columnMapping.fullIndex) *
                columnMapping.scale;
          }
        }

        return reduced;
      },
      reduceLinearSystem(
        stiffnessMatrix = [],
        loadVector = [],
      ): { stiffnessMatrix: NumericMatrix; loadVector: NumericVector } {
        validateDenseSquareMatrix(
          stiffnessMatrix,
          fullSize,
          "KinematicConstraintReducer2D reduceLinearSystem",
        );

        if (!Array.isArray(loadVector) || loadVector.length !== fullSize) {
          throw new Error(
            `KinematicConstraintReducer2D reduceLinearSystem requires a vector with ${fullSize} entries.`,
          );
        }

        let effectiveLoadVector = loadVector;

        if (hasNonZeroOffset) {
          effectiveLoadVector = new Array<number>(fullSize).fill(0);

          for (let row = 0; row < fullSize; row += 1) {
            let stiffnessOffset = 0;

            for (let column = 0; column < fullSize; column += 1) {
              stiffnessOffset +=
                vectorValue(matrixRow(stiffnessMatrix, row), column) *
                vectorValue(offsetVector, column);
            }

            effectiveLoadVector[row] = vectorValue(loadVector, row) - stiffnessOffset;
          }
        }

        return {
          stiffnessMatrix: reduction.reduceStiffnessMatrix(stiffnessMatrix),
          loadVector: reduceVectorWithMappings(effectiveLoadVector),
        };
      },
      reducedSize(): number {
        return rootIndices.length;
      },
      toJSON(): KinematicReductionJson {
        return {
          fullSize,
          reducedSize: rootIndices.length,
          reducedDofIds: [...reducedDofIds],
          prescribedDofIds: [...prescribedDofIds],
          dependentDofIds: [...dependentDofIds],
          constrainedDofIds: [...constrainedDofIds],
          transformationMatrix: transformationMatrix.map((row) => [...row]),
          offsetVector: [...offsetVector],
        };
      },
    };

    return reduction;
  }
}
