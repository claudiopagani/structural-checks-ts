import {
  assertExplicitUnitSystem,
  createUnitResolver,
  type UnitSystem,
  type UnitSystemInput,
} from "../units/UnitSystem.js";

export interface NodeMetadata extends Record<string, unknown> {
  sourceUnitSystem?: UnitSystem | null;
}

export interface NodeInput {
  id: string;
  x?: number;
  y?: number;
  z?: number;
  units?: UnitSystemInput | null;
  rotationalDofs?: string[];
  translationalDofs?: string[];
  metadata?: NodeMetadata;
}

export interface NodeJson {
  id: string;
  x: number;
  y: number;
  z: number;
  units: UnitSystem;
  translationalDofs: string[];
  rotationalDofs: string[];
  metadata: NodeMetadata & {
    unitSystem: UnitSystem;
    sourceUnitSystem: UnitSystem | null;
  };
}

export class Node {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly translationalDofs: string[];
  readonly rotationalDofs: string[];
  readonly units: UnitSystem;
  readonly metadata: NodeJson["metadata"];

  constructor({
    id,
    x = 0,
    y = 0,
    z = 0,
    units = null,
    rotationalDofs = ["rx", "ry", "rz"],
    translationalDofs = ["ux", "uy", "uz"],
    metadata = {},
  }: NodeInput) {
    if (!id) {
      throw new Error("A node id is required.");
    }

    assertExplicitUnitSystem(units, "Node");
    const unitResolver = createUnitResolver(units, { force: "kN", length: "m" });

    this.id = id;
    this.x = unitResolver.length(x);
    this.y = unitResolver.length(y);
    this.z = unitResolver.length(z);
    this.translationalDofs = [...translationalDofs];
    this.rotationalDofs = [...rotationalDofs];
    this.units = unitResolver.targetUnitSystem;
    this.metadata = {
      ...metadata,
      unitSystem: unitResolver.targetUnitSystem,
      sourceUnitSystem: metadata.sourceUnitSystem ?? unitResolver.sourceUnitSystem,
    };
  }

  coordinates(): [number, number, number] {
    return [this.x, this.y, this.z];
  }

  distanceTo(node: Pick<Node, "coordinates">): number {
    const [x1, y1, z1] = this.coordinates();
    const [x2, y2, z2] = node.coordinates();

    return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2 + (z2 - z1) ** 2);
  }

  toJSON(): NodeJson {
    return {
      id: this.id,
      x: this.x,
      y: this.y,
      z: this.z,
      units: { ...this.units },
      translationalDofs: [...this.translationalDofs],
      rotationalDofs: [...this.rotationalDofs],
      metadata: { ...this.metadata },
    };
  }
}
