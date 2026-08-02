// Mechanical TypeScript migration from strutture-js 6f33baead8b88166c4b2cf94af41763412e3c751;
// source path: src/domain/fem/elements/FrameElement2DTimoshenkoRigidOffsets.js.

import type { Node } from "../../geometry/Node.js";
import type { DistributedLoad } from "../../loads/DistributedLoad.js";
import {
  createZeroVector,
  type NumericMatrix,
  type NumericVector,
} from "../../math/arrayLinearAlgebra.js";
import type { DofRegistry } from "../DofRegistry.js";
import {
  FrameElement2DTimoshenko,
  type FrameElement2DTimoshenkoInput,
} from "./FrameElement2DTimoshenko.js";
import type {
  ElasticFrameCrossSection,
  ElasticFrameMaterial,
} from "./FrameElement2DEulerBernoulli.js";

type FrameNode = Pick<Node, "id" | "x" | "y">;

export interface FrameElement2DTimoshenkoRigidOffsetsInput
  extends Omit<FrameElement2DTimoshenkoInput, "metadata"> {
  rigidStartOffset?: number;
  rigidEndOffset?: number;
  referenceStartNode?: FrameNode | null;
  referenceEndNode?: FrameNode | null;
  metadata?: Record<string, unknown> | null | undefined;
}

export interface FrameElement2DTimoshenkoRigidOffsetsJson {
  id: string;
  type: string;
  startNodeId: string;
  endNodeId: string;
  length: number;
  deformableLength: number;
  rigidStartOffset: number;
  rigidEndOffset: number;
  referenceStartNode: FrameNode;
  referenceEndNode: FrameNode;
  rigidStartOffsetVector: { x: number; y: number };
  rigidEndOffsetVector: { x: number; y: number };
  axialRigidity: number | null;
  flexuralRigidity: number | null;
  bendingInertiaAxis: string;
  material: unknown;
  crossSection: unknown;
  metadata: Record<string, unknown>;
  shearRigidity: number | null;
  shearAreaAxis: string;
  shearCorrectionFactor: number | null;
}

interface FrameElement2DReferenceNodes {
  start: FrameNode;
  end: FrameNode;
}

function assertNode(node: FrameNode | null | undefined, label: string): void {
  if (!node?.id) {
    throw new Error(`FrameElement2DTimoshenkoRigidOffsets requires a ${label} node.`);
  }
}

function assertNonNegative(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`FrameElement2DTimoshenkoRigidOffsets requires a non-negative ${label}.`);
  }
}

function assertPositive(value: number, label: string): asserts value is number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`FrameElement2DTimoshenkoRigidOffsets requires a positive ${label}.`);
  }
}

function cloneReferenceNode(node: FrameNode | null | undefined, label: string): FrameNode | null {
  if (node == null) {
    return null;
  }

  assertNode(node, label);

  if (!Number.isFinite(node.x) || !Number.isFinite(node.y)) {
    throw new Error(
      `FrameElement2DTimoshenkoRigidOffsets requires finite ${label} reference-node coordinates.`,
    );
  }

  return {
    id: node.id,
    x: node.x,
    y: node.y,
  };
}

function matrixRow(matrix: NumericMatrix, index: number): NumericVector {
  const row = matrix[index];
  if (row === undefined) {
    throw new Error("FrameElement2DTimoshenkoRigidOffsets matrix row is unavailable.");
  }
  return row;
}

function vectorValue(vector: NumericVector, index: number): number {
  const value = vector[index];
  if (value === undefined) {
    throw new Error("FrameElement2DTimoshenkoRigidOffsets vector value is unavailable.");
  }
  return value;
}

function transpose(matrix: NumericMatrix): NumericMatrix {
  const firstRow = matrixRow(matrix, 0);
  return firstRow.map((_, column) => matrix.map((row) => vectorValue(row, column)));
}

function multiplyMatrices(left: NumericMatrix, right: NumericMatrix): NumericMatrix {
  const firstRightRow = matrixRow(right, 0);
  return left.map((leftRow) =>
    firstRightRow.map((_, column) =>
      leftRow.reduce(
        (sum, value, index) => sum + value * vectorValue(matrixRow(right, index), column),
        0,
      ),
    ),
  );
}

function multiplyMatrixVector(matrix: NumericMatrix, vector: NumericVector): NumericVector {
  return matrix.map((row) =>
    row.reduce((sum, value, index) => sum + value * vectorValue(vector, index), 0),
  );
}

function subtractVectors(left: NumericVector, right: NumericVector): NumericVector {
  return left.map((value, index) => value - vectorValue(right, index));
}

function resolveGlobalElementDisplacements(
  element: FrameElement2DTimoshenkoRigidOffsets,
  globalDisplacements: NumericVector,
  dofRegistry: DofRegistry,
): NumericVector {
  if (!Array.isArray(globalDisplacements)) {
    throw new Error(
      "FrameElement2DTimoshenkoRigidOffsets localDisplacements requires a displacement vector.",
    );
  }

  return element.getDofIds(dofRegistry).map((dofId) => {
    const value = globalDisplacements[dofRegistry.getIndex(dofId)];

    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new Error(
        `FrameElement2DTimoshenkoRigidOffsets displacement for DOF ${dofId} must be finite.`,
      );
    }

    return value;
  });
}

export class FrameElement2DTimoshenkoRigidOffsets {
  declare readonly id: string;
  declare type: string;
  declare readonly startNode: FrameNode;
  declare readonly endNode: FrameNode;
  declare readonly nodes: [FrameNode, FrameNode];
  declare readonly material: ElasticFrameMaterial | null;
  declare readonly crossSection: ElasticFrameCrossSection | null;
  declare readonly axialRigidity: number | null;
  declare readonly flexuralRigidity: number | null;
  declare readonly shearRigidity: number | null;
  declare readonly bendingInertiaAxis: string;
  declare readonly shearAreaAxis: string;
  declare readonly shearCorrectionFactor: number | null;
  declare readonly rigidStartOffset: number;
  declare readonly rigidEndOffset: number;
  declare readonly metadata: Record<string, unknown>;
  declare _explicitReferenceStartNode: FrameNode | null;
  declare _explicitReferenceEndNode: FrameNode | null;
  declare _referenceElement: FrameElement2DTimoshenko | undefined;

  constructor({
    id,
    startNode,
    endNode,
    material = null,
    crossSection = null,
    axialRigidity = null,
    flexuralRigidity = null,
    shearRigidity = null,
    bendingInertiaAxis = "inertiaY",
    shearAreaAxis = "shearAreaY",
    shearCorrectionFactor = null,
    rigidStartOffset = 0,
    rigidEndOffset = 0,
    referenceStartNode = null,
    referenceEndNode = null,
    metadata = {},
  }: FrameElement2DTimoshenkoRigidOffsetsInput) {
    if (!id) {
      throw new Error("A FrameElement2DTimoshenkoRigidOffsets id is required.");
    }

    assertNode(startNode, "start");
    assertNode(endNode, "end");
    assertNonNegative(rigidStartOffset, "rigidStartOffset");
    assertNonNegative(rigidEndOffset, "rigidEndOffset");

    this.id = id;
    this.type = "frame-2d-timoshenko-rigid-offsets";
    this.startNode = startNode;
    this.endNode = endNode;
    this.nodes = [startNode, endNode];
    this.material = material;
    this.crossSection = crossSection;
    this.axialRigidity = axialRigidity;
    this.flexuralRigidity = flexuralRigidity;
    this.shearRigidity = shearRigidity;
    this.bendingInertiaAxis = bendingInertiaAxis;
    this.shearAreaAxis = shearAreaAxis;
    this.shearCorrectionFactor = shearCorrectionFactor;
    this.rigidStartOffset = rigidStartOffset;
    this.rigidEndOffset = rigidEndOffset;
    this._explicitReferenceStartNode = cloneReferenceNode(referenceStartNode, "start");
    this._explicitReferenceEndNode = cloneReferenceNode(referenceEndNode, "end");
    this.metadata = { ...metadata };

    if ((this._explicitReferenceStartNode == null) !== (this._explicitReferenceEndNode == null)) {
      throw new Error(
        "FrameElement2DTimoshenkoRigidOffsets requires both referenceStartNode and referenceEndNode when using explicit reference nodes.",
      );
    }
  }

  geometry(): { dx: number; dy: number } {
    return {
      dx: this.endNode.x - this.startNode.x,
      dy: this.endNode.y - this.startNode.y,
    };
  }

  directionCosines(): { length: number; c: number; s: number } {
    const { dx, dy } = this.geometry();
    const length = Math.sqrt(dx ** 2 + dy ** 2);

    assertPositive(length, "physical element length");

    return {
      length,
      c: dx / length,
      s: dy / length,
    };
  }

  physicalLength(): number {
    return this.directionCosines().length;
  }

  deformableLength(): number {
    return this.referenceDirectionCosines().length;
  }

  referenceNodes(): FrameElement2DReferenceNodes {
    if (this._explicitReferenceStartNode && this._explicitReferenceEndNode) {
      return {
        start: { ...this._explicitReferenceStartNode },
        end: { ...this._explicitReferenceEndNode },
      };
    }

    const { c, s } = this.directionCosines();

    return {
      start: {
        id: `${this.id}__deformable_start`,
        x: this.startNode.x + this.rigidStartOffset * c,
        y: this.startNode.y + this.rigidStartOffset * s,
      },
      end: {
        id: `${this.id}__deformable_end`,
        x: this.endNode.x - this.rigidEndOffset * c,
        y: this.endNode.y - this.rigidEndOffset * s,
      },
    };
  }

  referenceDirectionCosines(): { length: number; c: number; s: number } {
    const nodes = this.referenceNodes();
    const dx = nodes.end.x - nodes.start.x;
    const dy = nodes.end.y - nodes.start.y;
    const length = Math.sqrt(dx ** 2 + dy ** 2);

    assertPositive(length, "deformable element length after rigid end offsets");

    return {
      length,
      c: dx / length,
      s: dy / length,
    };
  }

  rigidOffsetVector(node: FrameNode, referenceNode: FrameNode): { x: number; y: number } {
    const { c, s } = this.referenceDirectionCosines();
    const dx = referenceNode.x - node.x;
    const dy = referenceNode.y - node.y;

    return {
      x: c * dx + s * dy,
      y: -s * dx + c * dy,
    };
  }

  referenceElement(): FrameElement2DTimoshenko {
    if (!this._referenceElement) {
      const nodes = this.referenceNodes();

      this._referenceElement = new FrameElement2DTimoshenko({
        id: `${this.id}__deformable`,
        startNode: nodes.start,
        endNode: nodes.end,
        material: this.material,
        crossSection: this.crossSection,
        axialRigidity: this.axialRigidity,
        flexuralRigidity: this.flexuralRigidity,
        shearRigidity: this.shearRigidity,
        bendingInertiaAxis: this.bendingInertiaAxis,
        shearAreaAxis: this.shearAreaAxis,
        shearCorrectionFactor: this.shearCorrectionFactor,
        metadata: {
          ...this.metadata,
          parentElementId: this.id,
        },
      });
    }

    return this._referenceElement;
  }

  kinematicTransformationMatrix(): NumericMatrix {
    const nodes = this.referenceNodes();
    const startOffset = this.rigidOffsetVector(this.startNode, nodes.start);
    const endOffset = this.rigidOffsetVector(this.endNode, nodes.end);

    return [
      [1, 0, -startOffset.y, 0, 0, 0],
      [0, 1, startOffset.x, 0, 0, 0],
      [0, 0, 1, 0, 0, 0],
      [0, 0, 0, 1, 0, -endOffset.y],
      [0, 0, 0, 0, 1, endOffset.x],
      [0, 0, 0, 0, 0, 1],
    ];
  }

  getDofIds(dofRegistry: DofRegistry): string[] {
    return [
      dofRegistry.getDofId(this.startNode, "ux"),
      dofRegistry.getDofId(this.startNode, "uy"),
      dofRegistry.getDofId(this.startNode, "rz"),
      dofRegistry.getDofId(this.endNode, "ux"),
      dofRegistry.getDofId(this.endNode, "uy"),
      dofRegistry.getDofId(this.endNode, "rz"),
    ];
  }

  localStiffness(): NumericMatrix {
    const q = this.kinematicTransformationMatrix();
    const k = this.referenceElement().localStiffness();

    return multiplyMatrices(transpose(q), multiplyMatrices(k, q));
  }

  transformationMatrix(): NumericMatrix {
    return this.referenceElement().transformationMatrix();
  }

  globalStiffness(): NumericMatrix {
    const transformation = this.transformationMatrix();
    const localStiffness = this.localStiffness();

    return multiplyMatrices(
      transpose(transformation),
      multiplyMatrices(localStiffness, transformation),
    );
  }

  getGlobalStiffness(): NumericMatrix {
    return this.globalStiffness();
  }

  localPhysicalDisplacements(
    globalDisplacements: NumericVector,
    dofRegistry: DofRegistry,
  ): NumericVector {
    const globalElementDisplacements = resolveGlobalElementDisplacements(
      this,
      globalDisplacements,
      dofRegistry,
    );

    return multiplyMatrixVector(this.transformationMatrix(), globalElementDisplacements);
  }

  localDeformableDisplacements(
    globalDisplacements: NumericVector,
    dofRegistry: DofRegistry,
  ): NumericVector {
    const localPhysicalDisplacements = this.localPhysicalDisplacements(
      globalDisplacements,
      dofRegistry,
    );

    return multiplyMatrixVector(this.kinematicTransformationMatrix(), localPhysicalDisplacements);
  }

  localDisplacements(globalDisplacements: NumericVector, dofRegistry: DofRegistry): NumericVector {
    return this.localPhysicalDisplacements(globalDisplacements, dofRegistry);
  }

  equivalentNodalLoadVector({
    loads = [],
  }: {
    loads?: readonly DistributedLoad[];
  } = {}): NumericVector {
    if (!Array.isArray(loads) || loads.length === 0) {
      return createZeroVector(6);
    }

    if (this.rigidStartOffset !== 0 || this.rigidEndOffset !== 0) {
      throw new Error(
        "FrameElement2DTimoshenkoRigidOffsets does not yet support element loads together with non-zero rigid end offsets.",
      );
    }

    return this.referenceElement().equivalentNodalLoadVector({ loads });
  }

  localEndForces(
    globalDisplacements: NumericVector,
    dofRegistry: DofRegistry,
    { equivalentNodalLoad = null }: { equivalentNodalLoad?: NumericVector | null } = {},
  ): NumericVector {
    const loadVector = equivalentNodalLoad ?? createZeroVector(6);

    if (!Array.isArray(loadVector) || loadVector.length !== 6) {
      throw new Error(
        "FrameElement2DTimoshenkoRigidOffsets equivalentNodalLoad must be a 6-entry vector.",
      );
    }

    const localPhysicalDisplacements = this.localPhysicalDisplacements(
      globalDisplacements,
      dofRegistry,
    );
    const elasticForces = multiplyMatrixVector(this.localStiffness(), localPhysicalDisplacements);

    return subtractVectors(elasticForces, loadVector);
  }

  toJSON(): FrameElement2DTimoshenkoRigidOffsetsJson {
    const nodes = this.referenceNodes();
    const startOffset = this.rigidOffsetVector(this.startNode, nodes.start);
    const endOffset = this.rigidOffsetVector(this.endNode, nodes.end);

    return {
      id: this.id,
      type: this.type,
      startNodeId: this.startNode.id,
      endNodeId: this.endNode.id,
      length: this.physicalLength(),
      deformableLength: this.deformableLength(),
      rigidStartOffset: this.rigidStartOffset,
      rigidEndOffset: this.rigidEndOffset,
      referenceStartNode: { ...nodes.start },
      referenceEndNode: { ...nodes.end },
      rigidStartOffsetVector: { ...startOffset },
      rigidEndOffsetVector: { ...endOffset },
      axialRigidity: this.axialRigidity,
      flexuralRigidity: this.flexuralRigidity,
      bendingInertiaAxis: this.bendingInertiaAxis,
      material: this.material?.toJSON?.() ?? this.material,
      crossSection: this.crossSection?.toJSON?.() ?? this.crossSection,
      metadata: { ...this.metadata },
      shearRigidity: this.shearRigidity,
      shearAreaAxis: this.shearAreaAxis,
      shearCorrectionFactor: this.shearCorrectionFactor,
    };
  }
}
