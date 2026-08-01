import {
  createZeroMatrix,
  createZeroVector,
  type NumericMatrix,
  type NumericVector,
} from "../math/arrayLinearAlgebra.js";
import { DofRegistry, type DofElementLike, type DofNodeLike } from "./DofRegistry.js";
import { createElementLoadIndex, type ElementLoadTarget } from "./ElementLoadIndex.js";
import type {
  FemSupportConstraintLike,
  KinematicConstraintLike,
} from "./KinematicConstraintReducer2D.js";

const NODAL_LOAD_COMPONENT_BY_DOF: Readonly<Record<string, string>> = {
  ux: "fx",
  uy: "fy",
  rz: "mz",
};

export interface FemElementLike extends DofElementLike, ElementLoadTarget {
  id?: string | null;
}

export interface FemLoadLike {
  id?: string | null;
  node?: DofNodeLike | null;
  target?: DofNodeLike | FemElementLike | null;
  element?: FemElementLike | null;
  components?: {
    fx?: number;
    fy?: number;
    mz?: number;
  };
  getGlobalLoadContributions?: (
    dofRegistry: DofRegistry,
  ) => NumericVector | Record<string, number> | null | undefined;
}

export interface FemModel2D {
  nodes?: readonly DofNodeLike[];
  elements?: readonly FemElementLike[];
  supports?: readonly FemSupportConstraintLike[];
  loads?: readonly FemLoadLike[];
  nodalLoads?: readonly FemLoadLike[];
  constraints?: readonly KinematicConstraintLike[];
}

export interface FemElementAssembly {
  elementId: string | null;
  dofIds: string[];
  indices: number[];
  loadIds: (string | null)[];
}

export interface FemAssembly2D {
  dofRegistry: DofRegistry;
  stiffnessMatrix: NumericMatrix;
  loadVector: NumericVector;
  supports: FemSupportConstraintLike[];
  constraints: KinematicConstraintLike[];
  elementAssemblies: FemElementAssembly[];
}

interface FemElementContext {
  dofRegistry: DofRegistry;
  element: FemElementLike;
  loads: readonly FemLoadLike[];
}

type DynamicFemElement = FemElementLike & {
  getDofIds?: (dofRegistry: DofRegistry) => string[];
  dofIds?: string[] | ((dofRegistry: DofRegistry) => string[]);
  globalStiffness?: (context: FemElementContext) => NumericMatrix;
  getGlobalStiffness?: (context: FemElementContext) => NumericMatrix;
  globalStiffnessMatrix?: NumericMatrix;
  stiffnessMatrix?: NumericMatrix;
  equivalentNodalLoadVector?: (context: FemElementContext) => NumericVector;
  getEquivalentNodalLoadVector?: (context: FemElementContext) => NumericVector;
  equivalentNodalLoads?: NumericVector;
};

function isNodeLike(value: unknown): value is DofNodeLike {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as { id?: unknown; nodes?: unknown };
  return Boolean(candidate.id) && !Array.isArray(candidate.nodes);
}

function matrixRow(matrix: NumericMatrix, index: number): NumericVector {
  const row = matrix[index];
  if (row === undefined) {
    throw new Error("FemAssembler2D matrix row is unavailable.");
  }
  return row;
}

function vectorValue(vector: NumericVector, index: number): number {
  const value = vector[index];
  if (value === undefined) {
    throw new Error("FemAssembler2D vector value is unavailable.");
  }
  return value;
}

function validateDenseMatrix(matrix: NumericMatrix, size: number, context: string): void {
  if (!Array.isArray(matrix) || matrix.length !== size) {
    throw new Error(`${context} must be a ${size}x${size} dense matrix.`);
  }

  for (let row = 0; row < size; row += 1) {
    const matrixValues = matrix[row];
    if (!Array.isArray(matrixValues) || matrixValues.length !== size) {
      throw new Error(`${context} must be a ${size}x${size} dense matrix.`);
    }

    for (let column = 0; column < size; column += 1) {
      if (!Number.isFinite(matrixValues[column])) {
        throw new Error(
          `${context} contains a non-finite value at row ${row + 1}, column ${column + 1}.`,
        );
      }
    }
  }
}

function validateVector(vector: NumericVector, size: number, context: string): void {
  if (!Array.isArray(vector) || vector.length !== size) {
    throw new Error(`${context} must be a vector with ${size} entries.`);
  }

  for (let index = 0; index < size; index += 1) {
    if (!Number.isFinite(vector[index])) {
      throw new Error(`${context} contains a non-finite value at index ${index + 1}.`);
    }
  }
}

function resolveElementDofIds(element: FemElementLike, dofRegistry: DofRegistry): string[] {
  const dynamicElement = element as DynamicFemElement;
  if (typeof dynamicElement.getDofIds === "function") {
    return dynamicElement.getDofIds(dofRegistry);
  }

  if (typeof dynamicElement.dofIds === "function") {
    return dynamicElement.dofIds(dofRegistry);
  }

  if (Array.isArray(dynamicElement.dofIds)) {
    return [...dynamicElement.dofIds];
  }

  if (Array.isArray(element.nodes)) {
    return element.nodes.flatMap((node) =>
      dofRegistry.dofsPerNode.map((dof) => dofRegistry.getDofId(node, dof)),
    );
  }

  throw new Error(`FEM element ${element.id ?? "<unknown>"} cannot provide its DOF ids.`);
}

function resolveElementStiffness(
  element: FemElementLike,
  context: FemElementContext,
): NumericMatrix {
  const dynamicElement = element as DynamicFemElement;
  if (typeof dynamicElement.globalStiffness === "function") {
    return dynamicElement.globalStiffness(context);
  }

  if (typeof dynamicElement.getGlobalStiffness === "function") {
    return dynamicElement.getGlobalStiffness(context);
  }

  if (Array.isArray(dynamicElement.globalStiffnessMatrix)) {
    return dynamicElement.globalStiffnessMatrix;
  }

  if (Array.isArray(dynamicElement.stiffnessMatrix)) {
    return dynamicElement.stiffnessMatrix;
  }

  throw new Error(
    `FEM element ${element.id ?? "<unknown>"} cannot provide a global stiffness matrix.`,
  );
}

function resolveElementEquivalentLoad(
  element: FemElementLike,
  context: FemElementContext,
  size: number,
): NumericVector | null {
  const dynamicElement = element as DynamicFemElement;
  let loadVector: NumericVector | null | undefined = null;

  if (typeof dynamicElement.equivalentNodalLoadVector === "function") {
    loadVector = dynamicElement.equivalentNodalLoadVector(context);
  } else if (typeof dynamicElement.getEquivalentNodalLoadVector === "function") {
    loadVector = dynamicElement.getEquivalentNodalLoadVector(context);
  } else if (Array.isArray(dynamicElement.equivalentNodalLoads)) {
    loadVector = dynamicElement.equivalentNodalLoads;
  }

  if (loadVector === null || loadVector === undefined) {
    return null;
  }

  validateVector(
    loadVector,
    size,
    `Equivalent nodal load vector for FEM element ${element.id ?? "<unknown>"}`,
  );

  return loadVector;
}

function registerReferencedNodes(
  dofRegistry: DofRegistry,
  {
    nodes,
    elements,
    supports,
    loads,
    constraints,
  }: {
    nodes: readonly DofNodeLike[];
    elements: readonly FemElementLike[];
    supports: readonly FemSupportConstraintLike[];
    loads: readonly FemLoadLike[];
    constraints: readonly KinematicConstraintLike[];
  },
): void {
  dofRegistry.registerNodes(nodes);
  dofRegistry.registerElements(elements);

  for (const support of supports) {
    if (support.node) {
      dofRegistry.registerNode(support.node);
    }
  }

  for (const load of loads) {
    const target = load.node ?? load.target;

    if (isNodeLike(target)) {
      dofRegistry.registerNode(target);
    }
  }

  for (const constraint of constraints) {
    if (constraint.node) {
      dofRegistry.registerNode(constraint.node);
    }

    if (constraint.masterNode) {
      dofRegistry.registerNode(constraint.masterNode);
    }

    if (constraint.slaveNode) {
      dofRegistry.registerNode(constraint.slaveNode);
    }
  }
}

export class FemAssembler2D {
  dofRegistry: DofRegistry;

  constructor({ dofRegistry = new DofRegistry() }: { dofRegistry?: DofRegistry } = {}) {
    this.dofRegistry = dofRegistry;
  }

  assemble({
    nodes = [],
    elements = [],
    supports = [],
    loads = [],
    nodalLoads = [],
    constraints = [],
  }: FemModel2D = {}): FemAssembly2D {
    this.dofRegistry = this.dofRegistry.createEmpty();
    const allLoads = [...loads, ...nodalLoads];

    registerReferencedNodes(this.dofRegistry, {
      nodes,
      elements,
      supports,
      loads: allLoads,
      constraints,
    });

    const size = this.dofRegistry.size();
    const stiffnessMatrix = createZeroMatrix(size);
    const loadVector = createZeroVector(size);
    const elementAssemblies: FemElementAssembly[] = [];
    const elementLoadIndex = createElementLoadIndex<
      FemElementLike,
      FemLoadLike & { element?: FemElementLike | null; target?: FemElementLike | null }
    >(allLoads);

    for (const element of elements) {
      const dofIds = resolveElementDofIds(element, this.dofRegistry);
      const elementLoads = elementLoadIndex.get(element);
      const context = {
        dofRegistry: this.dofRegistry,
        element,
        loads: elementLoads,
      };
      const stiffness = resolveElementStiffness(element, context);

      validateDenseMatrix(
        stiffness,
        dofIds.length,
        `Global stiffness matrix for FEM element ${element.id ?? "<unknown>"}`,
      );

      const indices = dofIds.map((dofId) => this.dofRegistry.getIndex(dofId));

      for (let localRow = 0; localRow < dofIds.length; localRow += 1) {
        const globalRow = vectorValue(indices, localRow);

        for (let localColumn = 0; localColumn < dofIds.length; localColumn += 1) {
          const globalColumn = vectorValue(indices, localColumn);
          const targetRow = matrixRow(stiffnessMatrix, globalRow);
          targetRow[globalColumn] =
            vectorValue(targetRow, globalColumn) +
            vectorValue(matrixRow(stiffness, localRow), localColumn);
        }
      }

      const equivalentLoad = resolveElementEquivalentLoad(element, context, dofIds.length);

      if (equivalentLoad) {
        for (let localIndex = 0; localIndex < dofIds.length; localIndex += 1) {
          const globalIndex = vectorValue(indices, localIndex);
          loadVector[globalIndex] =
            vectorValue(loadVector, globalIndex) + vectorValue(equivalentLoad, localIndex);
        }
      }

      elementAssemblies.push({
        elementId: element.id ?? null,
        dofIds,
        indices,
        loadIds: elementLoads.map((load) => load.id ?? null),
      });
    }

    this.addNodalLoads(loadVector, allLoads);
    this.addSupportSprings(stiffnessMatrix, supports);

    return {
      dofRegistry: this.dofRegistry,
      stiffnessMatrix,
      loadVector,
      supports: [...supports],
      constraints: [...constraints],
      elementAssemblies,
    };
  }

  addNodalLoads(loadVector: NumericVector, loads: readonly FemLoadLike[] = []): void {
    for (const load of loads) {
      if (typeof load.getGlobalLoadContributions === "function") {
        const contributions = load.getGlobalLoadContributions(this.dofRegistry);
        this.addLoadContributions(loadVector, contributions);
        continue;
      }

      const node = load.node ?? load.target;

      if (!isNodeLike(node) || !load.components) {
        continue;
      }

      for (const dof of this.dofRegistry.dofsPerNode) {
        const component = NODAL_LOAD_COMPONENT_BY_DOF[dof];
        const value =
          component === "fx"
            ? (load.components.fx ?? 0)
            : component === "fy"
              ? (load.components.fy ?? 0)
              : component === "mz"
                ? (load.components.mz ?? 0)
                : 0;

        if (value === 0) {
          continue;
        }

        const index = this.dofRegistry.getIndex(node, dof);
        loadVector[index] = vectorValue(loadVector, index) + value;
      }
    }
  }

  addLoadContributions(
    loadVector: NumericVector,
    contributions: NumericVector | Record<string, number> | null | undefined,
  ): void {
    if (Array.isArray(contributions)) {
      validateVector(contributions, this.dofRegistry.size(), "Global load contribution");

      for (let index = 0; index < contributions.length; index += 1) {
        loadVector[index] = vectorValue(loadVector, index) + vectorValue(contributions, index);
      }

      return;
    }

    if (contributions && typeof contributions === "object") {
      for (const [dofId, value] of Object.entries(contributions)) {
        if (!Number.isFinite(value)) {
          throw new Error(`Global load contribution for DOF ${dofId} must be finite.`);
        }

        const index = this.dofRegistry.getIndex(dofId);
        loadVector[index] = vectorValue(loadVector, index) + value;
      }
    }
  }

  addSupportSprings(
    stiffnessMatrix: NumericMatrix,
    supports: readonly (
      | FemSupportConstraintLike
      | (FemSupportConstraintLike & {
          springStiffness?: Record<string, number | undefined>;
        })
    )[] = [],
  ): void {
    for (const support of supports) {
      const supportWithSpring = support as FemSupportConstraintLike & {
        springStiffness?: Record<string, number | undefined>;
      };
      if (!support.node || !supportWithSpring.springStiffness) {
        continue;
      }

      for (const dof of this.dofRegistry.dofsPerNode) {
        const stiffness = supportWithSpring.springStiffness[dof] ?? 0;

        if (stiffness === 0) {
          continue;
        }

        if (!Number.isFinite(stiffness)) {
          throw new Error(
            `Spring stiffness for support ${support.id ?? "<unknown>"} DOF ${dof} must be finite.`,
          );
        }

        const index = this.dofRegistry.getIndex(support.node, dof);
        const row = matrixRow(stiffnessMatrix, index);
        row[index] = vectorValue(row, index) + stiffness;
      }
    }
  }
}
