import type { Node } from "../../geometry/Node.js";
import type { DistributedLoad } from "../../loads/DistributedLoad.js";
import type { NumericMatrix, NumericVector } from "../../math/arrayLinearAlgebra.js";
import type { DofRegistry } from "../DofRegistry.js";

type FrameNode = Pick<Node, "id" | "x" | "y">;

export interface ElasticFrameMaterial {
  elasticModulus?: number | null;
  shearModulus?: number | null;
  toJSON?: () => unknown;
}

export interface ElasticFrameCrossSection {
  area?: number;
  inertiaX?: number;
  inertiaY?: number;
  inertiaZ?: number;
  toJSON?: () => unknown;
}

export interface FrameElement2DEulerBernoulliInput {
  id: string;
  startNode: FrameNode;
  endNode: FrameNode;
  material?: ElasticFrameMaterial | null;
  crossSection?: ElasticFrameCrossSection | null;
  axialRigidity?: number | null;
  flexuralRigidity?: number | null;
  bendingInertiaAxis?: string;
  metadata?: Record<string, unknown>;
}

export interface FrameElement2DGeometry {
  dx: number;
  dy: number;
}

export interface FrameElement2DDirectionCosines {
  length: number;
  c: number;
  s: number;
}

export interface FrameElement2DLocalLoadComponents {
  axial: number;
  transverse: number;
}

export interface FrameElement2DInternalForceSample {
  x: number;
  xi: number;
  axialForce: number;
  shearForce: number;
  bendingMoment: number;
  n: number;
  v: number;
  m: number;
}

export interface FrameElement2DSampleInput {
  globalDisplacements?: NumericVector;
  displacements?: NumericVector;
  dofRegistry?: DofRegistry;
  loads?: readonly DistributedLoad[];
  stations?: readonly number[] | null;
}

function assertNode(node: FrameNode, label: string): void {
  if (!node?.id) {
    throw new Error(`FrameElement2DEulerBernoulli requires a ${label} node.`);
  }
}

function assertPositive(value: number | null | undefined, label: string): asserts value is number {
  if (!Number.isFinite(value) || (value as number) <= 0) {
    throw new Error(`FrameElement2DEulerBernoulli requires a positive ${label}.`);
  }
}

function matrixRow(matrix: NumericMatrix, index: number): NumericVector {
  const row = matrix[index];
  if (row === undefined) {
    throw new Error("FrameElement2DEulerBernoulli matrix row is unavailable.");
  }
  return row;
}

function vectorValue(vector: NumericVector, index: number): number {
  const value = vector[index];
  if (value === undefined) {
    throw new Error("FrameElement2DEulerBernoulli vector value is unavailable.");
  }
  return value;
}

function transpose(matrix: NumericMatrix): NumericMatrix {
  const firstRow = matrixRow(matrix, 0);
  return firstRow.map((_, column) => matrix.map((row) => vectorValue(row, column)));
}

function multiplyMatrices(left: NumericMatrix, right: NumericMatrix): NumericMatrix {
  const rightFirstRow = matrixRow(right, 0);
  return left.map((leftRow) =>
    rightFirstRow.map((_, column) =>
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

function zeroVector(size: number): NumericVector {
  return new Array<number>(size).fill(0);
}

function addVectors(left: NumericVector, right: NumericVector): NumericVector {
  return left.map((value, index) => value + vectorValue(right, index));
}

function resolveRigidity({
  explicitValue,
  material,
  crossSection,
  property,
  label,
}: {
  explicitValue: number | null;
  material: ElasticFrameMaterial | null;
  crossSection: ElasticFrameCrossSection | null;
  property: string;
  label: string;
}): number {
  if (Number.isFinite(explicitValue)) {
    assertPositive(explicitValue, label);
    return explicitValue;
  }

  const elasticModulus = material?.elasticModulus;
  const sectionProperty = crossSection
    ? (crossSection as unknown as Record<string, unknown>)[property]
    : undefined;
  const numericSectionProperty = typeof sectionProperty === "number" ? sectionProperty : undefined;

  assertPositive(elasticModulus, "material elastic modulus");
  assertPositive(numericSectionProperty, `cross-section ${property}`);

  return elasticModulus * numericSectionProperty;
}

function assertUniformFullElementLoad(load: DistributedLoad, elementLength: number): void {
  if (load.distribution !== "uniform") {
    throw new Error(
      "FrameElement2DEulerBernoulli supports only uniform distributed loads on the full element.",
    );
  }

  if (Math.abs(load.startValue - load.endValue) > 1e-12) {
    throw new Error(
      "FrameElement2DEulerBernoulli does not support tapered distributed loads; discretize the beam into uniform subelements.",
    );
  }

  const loadLength = typeof load.resolvedLength === "function" ? load.resolvedLength() : null;

  if (
    Number.isFinite(loadLength) &&
    Math.abs((loadLength as number) - elementLength) > Math.max(1e-9, 1e-9 * elementLength)
  ) {
    throw new Error(
      "FrameElement2DEulerBernoulli distributed loads must cover the full element length.",
    );
  }
}

export class FrameElement2DEulerBernoulli {
  readonly id: string;
  type: string;
  readonly startNode: FrameNode;
  readonly endNode: FrameNode;
  readonly nodes: [FrameNode, FrameNode];
  readonly material: ElasticFrameMaterial | null;
  readonly crossSection: ElasticFrameCrossSection | null;
  readonly axialRigidity: number | null;
  readonly flexuralRigidity: number | null;
  readonly bendingInertiaAxis: string;
  readonly metadata: Record<string, unknown>;

  constructor({
    id,
    startNode,
    endNode,
    material = null,
    crossSection = null,
    axialRigidity = null,
    flexuralRigidity = null,
    bendingInertiaAxis = "inertiaY",
    metadata = {},
  }: FrameElement2DEulerBernoulliInput) {
    if (!id) {
      throw new Error("A FrameElement2DEulerBernoulli id is required.");
    }

    assertNode(startNode, "start");
    assertNode(endNode, "end");

    this.id = id;
    this.type = "frame-2d-euler-bernoulli";
    this.startNode = startNode;
    this.endNode = endNode;
    this.nodes = [startNode, endNode];
    this.material = material;
    this.crossSection = crossSection;
    this.axialRigidity = axialRigidity;
    this.flexuralRigidity = flexuralRigidity;
    this.bendingInertiaAxis = bendingInertiaAxis;
    this.metadata = { ...metadata };
  }

  length(): number {
    const { dx, dy } = this.geometry();
    return Math.sqrt(dx ** 2 + dy ** 2);
  }

  geometry(): FrameElement2DGeometry {
    return {
      dx: this.endNode.x - this.startNode.x,
      dy: this.endNode.y - this.startNode.y,
    };
  }

  directionCosines(): FrameElement2DDirectionCosines {
    const { dx, dy } = this.geometry();
    const length = Math.sqrt(dx ** 2 + dy ** 2);

    assertPositive(length, "element length");

    return {
      length,
      c: dx / length,
      s: dy / length,
    };
  }

  resolvedAxialRigidity(): number {
    return resolveRigidity({
      explicitValue: this.axialRigidity,
      material: this.material,
      crossSection: this.crossSection,
      property: "area",
      label: "axialRigidity",
    });
  }

  resolvedFlexuralRigidity(): number {
    return resolveRigidity({
      explicitValue: this.flexuralRigidity,
      material: this.material,
      crossSection: this.crossSection,
      property: this.bendingInertiaAxis,
      label: "flexuralRigidity",
    });
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
    const { length } = this.directionCosines();
    const ea = this.resolvedAxialRigidity();
    const ei = this.resolvedFlexuralRigidity();
    const l = length;
    const axial = ea / l;
    const bending = ei / l ** 3;

    return [
      [axial, 0, 0, -axial, 0, 0],
      [0, 12 * bending, 6 * l * bending, 0, -12 * bending, 6 * l * bending],
      [0, 6 * l * bending, 4 * l ** 2 * bending, 0, -6 * l * bending, 2 * l ** 2 * bending],
      [-axial, 0, 0, axial, 0, 0],
      [0, -12 * bending, -6 * l * bending, 0, 12 * bending, -6 * l * bending],
      [0, 6 * l * bending, 2 * l ** 2 * bending, 0, -6 * l * bending, 4 * l ** 2 * bending],
    ];
  }

  transformationMatrix(): NumericMatrix {
    const { c, s } = this.directionCosines();

    return [
      [c, s, 0, 0, 0, 0],
      [-s, c, 0, 0, 0, 0],
      [0, 0, 1, 0, 0, 0],
      [0, 0, 0, c, s, 0],
      [0, 0, 0, -s, c, 0],
      [0, 0, 0, 0, 0, 1],
    ];
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

  localUniformLoadComponents(load: DistributedLoad): FrameElement2DLocalLoadComponents {
    const { length, c, s } = this.directionCosines();
    assertUniformFullElementLoad(load, length);

    const value = load.startValue;
    const referenceSystem = load.referenceSystem ?? "local";
    const direction = load.direction ?? "y";

    if (referenceSystem === "local") {
      if (["x", "u", "local-x", "local-u", "axial"].includes(direction)) {
        return { axial: value, transverse: 0 };
      }

      if (["y", "v", "local-y", "local-v", "transverse", "vertical"].includes(direction)) {
        return { axial: 0, transverse: value };
      }

      throw new Error(`Unsupported local distributed load direction: ${direction}.`);
    }

    if (referenceSystem === "global") {
      let qx = 0;
      let qy = 0;

      if (["x", "global-x", "fx"].includes(direction)) {
        qx = value;
      } else if (["y", "global-y", "fy", "vertical"].includes(direction)) {
        qy = value;
      } else {
        throw new Error(`Unsupported global distributed load direction: ${direction}.`);
      }

      return {
        axial: c * qx + s * qy,
        transverse: -s * qx + c * qy,
      };
    }

    throw new Error(`Unsupported distributed load reference system: ${referenceSystem}.`);
  }

  localEquivalentNodalLoadVector(loads: readonly DistributedLoad[] = []): NumericVector {
    const { length } = this.directionCosines();

    return loads.reduce<NumericVector>((sum, load) => {
      if (load.dimension !== "line" && load.type !== "distributed") {
        return sum;
      }

      const { axial, transverse } = this.localUniformLoadComponents(load);
      const l = length;
      const loadVector = [
        (axial * l) / 2,
        (transverse * l) / 2,
        (transverse * l ** 2) / 12,
        (axial * l) / 2,
        (transverse * l) / 2,
        (-transverse * l ** 2) / 12,
      ];

      return addVectors(sum, loadVector);
    }, zeroVector(6));
  }

  equivalentNodalLoadVector({
    loads = [],
  }: {
    loads?: readonly DistributedLoad[];
  } = {}): NumericVector {
    const localLoadVector = this.localEquivalentNodalLoadVector(loads);

    return multiplyMatrixVector(transpose(this.transformationMatrix()), localLoadVector);
  }

  localDisplacements(globalDisplacements: NumericVector, dofRegistry: DofRegistry): NumericVector {
    if (!Array.isArray(globalDisplacements)) {
      throw new Error(
        "FrameElement2DEulerBernoulli localDisplacements requires a displacement vector.",
      );
    }

    const globalElementDisplacements = this.getDofIds(dofRegistry).map((dofId) => {
      const value = globalDisplacements[dofRegistry.getIndex(dofId)];

      if (!Number.isFinite(value)) {
        throw new Error(
          `FrameElement2DEulerBernoulli displacement for DOF ${dofId} must be finite.`,
        );
      }

      return value as number;
    });

    return multiplyMatrixVector(this.transformationMatrix(), globalElementDisplacements);
  }

  localEndForces(
    globalDisplacements: NumericVector,
    dofRegistry: DofRegistry,
    { equivalentNodalLoad = null }: { equivalentNodalLoad?: NumericVector | null } = {},
  ): NumericVector {
    const loadVector = equivalentNodalLoad ?? zeroVector(6);

    if (!Array.isArray(loadVector) || loadVector.length !== 6) {
      throw new Error("FrameElement2DEulerBernoulli equivalentNodalLoad must be a 6-entry vector.");
    }

    const localDisplacements = this.localDisplacements(globalDisplacements, dofRegistry);
    const elasticForces = multiplyMatrixVector(this.localStiffness(), localDisplacements);

    return subtractVectors(elasticForces, loadVector);
  }

  sampleInternalForces({
    globalDisplacements,
    displacements = globalDisplacements,
    dofRegistry,
    loads = [],
    stations = null,
  }: FrameElement2DSampleInput = {}): FrameElement2DInternalForceSample[] {
    if (!dofRegistry) {
      throw new Error("FrameElement2DEulerBernoulli sampleInternalForces requires a dofRegistry.");
    }
    if (!displacements) {
      throw new Error("FrameElement2DEulerBernoulli sampleInternalForces requires displacements.");
    }

    const { length } = this.directionCosines();
    const resolvedStations = stations ?? [0, length];
    const localLoadVector = this.localEquivalentNodalLoadVector(loads);
    const localEndForces = this.localEndForces(displacements, dofRegistry, {
      equivalentNodalLoad: localLoadVector,
    });
    const n1 = vectorValue(localEndForces, 0);
    const v1 = vectorValue(localEndForces, 1);
    const m1 = vectorValue(localEndForces, 2);
    const totalLoad = loads.reduce<FrameElement2DLocalLoadComponents>(
      (sum, load) => {
        if (load.dimension !== "line" && load.type !== "distributed") {
          return sum;
        }

        const components = this.localUniformLoadComponents(load);

        return {
          axial: sum.axial + components.axial,
          transverse: sum.transverse + components.transverse,
        };
      },
      { axial: 0, transverse: 0 },
    );

    return resolvedStations.map((station) => {
      if (!Number.isFinite(station) || station < -1e-12 || station > length + 1e-12) {
        throw new Error(
          "FrameElement2DEulerBernoulli sample stations must lie within the element length.",
        );
      }

      const x = Math.min(length, Math.max(0, station));
      const axialForce = -n1 - totalLoad.axial * x;
      const shearForce = v1 + totalLoad.transverse * x;
      const bendingMoment = -m1 + v1 * x + (totalLoad.transverse * x ** 2) / 2;

      return {
        x,
        xi: length === 0 ? 0 : x / length,
        axialForce,
        shearForce,
        bendingMoment,
        n: axialForce,
        v: shearForce,
        m: bendingMoment,
      };
    });
  }

  toJSON(): Record<string, unknown> {
    return {
      id: this.id,
      type: this.type,
      startNodeId: this.startNode.id,
      endNodeId: this.endNode.id,
      length: this.length(),
      axialRigidity: this.axialRigidity,
      flexuralRigidity: this.flexuralRigidity,
      bendingInertiaAxis: this.bendingInertiaAxis,
      material: this.material?.toJSON?.() ?? this.material,
      crossSection: this.crossSection?.toJSON?.() ?? this.crossSection,
      metadata: { ...this.metadata },
    };
  }
}
