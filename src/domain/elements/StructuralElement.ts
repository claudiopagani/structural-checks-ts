// Mechanical TypeScript migration from strutture-js 6f33baead8b88166c4b2cf94af41763412e3c751;
// source path: src/domain/elements/StructuralElement.js.

export interface StructuralElementNode {
  id: string;
}

export interface StructuralElementInput {
  id: string;
  type: string;
  nodes?: readonly StructuralElementNode[] | undefined;
  material?: unknown;
  crossSection?: unknown;
  metadata?: Record<string, unknown> | null | undefined;
}

export interface StructuralElementJson {
  id: string;
  type: string;
  nodeIds: string[];
  material: unknown;
  crossSection: unknown;
  metadata: Record<string, unknown>;
}

function isObjectLike(value: unknown): value is Record<string, unknown> {
  return value !== null && (typeof value === "object" || typeof value === "function");
}

function serializeValue(value: unknown, label: string): unknown {
  if (value === null || value === undefined || !isObjectLike(value)) {
    return value;
  }

  const toJSON = Reflect.get(value, "toJSON");
  if (toJSON === null || toJSON === undefined) {
    return value;
  }

  if (typeof toJSON !== "function") {
    throw new TypeError(`${label}?.toJSON is not a function`);
  }

  return Reflect.apply(toJSON, value, []) ?? value;
}

export class StructuralElement {
  id: string;
  type: string;
  nodes: StructuralElementNode[];
  material: unknown;
  crossSection: unknown;
  metadata: Record<string, unknown>;

  constructor({
    id,
    type,
    nodes = [],
    material = null,
    crossSection = null,
    metadata = {},
  }: StructuralElementInput) {
    if (!id) {
      throw new Error("An element id is required.");
    }

    if (!type) {
      throw new Error("An element type is required.");
    }

    this.id = id;
    this.type = type;
    this.nodes = [...nodes];
    this.material = material;
    this.crossSection = crossSection;
    this.metadata = { ...metadata };
  }

  addNode(node: StructuralElementNode): this {
    this.nodes.push(node);
    return this;
  }

  nodeIds(): string[] {
    return this.nodes.map((node) => node.id);
  }

  toJSON(): StructuralElementJson {
    return {
      id: this.id,
      type: this.type,
      nodeIds: this.nodeIds(),
      material: serializeValue(this.material, "this.material"),
      crossSection: serializeValue(this.crossSection, "this.crossSection"),
      metadata: { ...this.metadata },
    };
  }
}
