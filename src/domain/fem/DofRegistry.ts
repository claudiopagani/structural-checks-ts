export const DEFAULT_NODE_DOFS_2D = ["ux", "uy", "rz"] as const;

export interface DofNodeLike {
  id: string;
}

export interface DofElementLike {
  nodes?: DofNodeLike[];
}

export interface DofDescriptor {
  id: string;
  nodeId: string;
  dof: string;
  index: number;
}

export interface DofRegistryInput {
  dofsPerNode?: readonly string[];
}

function resolveNodeId(nodeOrId: string | DofNodeLike): string {
  if (typeof nodeOrId === "string") {
    return nodeOrId;
  }

  if (nodeOrId?.id) {
    return nodeOrId.id;
  }

  throw new Error("DofRegistry requires a node id or a node-like object with an id.");
}

function validateDofName(dof: string): void {
  if (typeof dof !== "string" || dof.length === 0) {
    throw new Error("DofRegistry requires non-empty string DOF names.");
  }
}

function isRuntimeArray(value: unknown): boolean {
  return Array.isArray(value);
}

export class DofRegistry {
  readonly dofsPerNode: string[];
  private readonly dofIds: string[];
  private readonly dofIndexById: Map<string, number>;
  private readonly descriptorById: Map<string, DofDescriptor>;
  private readonly nodeIds: string[];
  private readonly nodeIdSet: Set<string>;

  constructor({ dofsPerNode = DEFAULT_NODE_DOFS_2D }: DofRegistryInput = {}) {
    if (!isRuntimeArray(dofsPerNode) || dofsPerNode.length === 0) {
      throw new Error("DofRegistry requires a non-empty dofsPerNode array.");
    }

    const uniqueDofs = new Set<string>();

    for (const dof of dofsPerNode) {
      validateDofName(dof);

      if (uniqueDofs.has(dof)) {
        throw new Error(`DofRegistry received a duplicate DOF name: ${dof}.`);
      }

      uniqueDofs.add(dof);
    }

    this.dofsPerNode = [...dofsPerNode];
    this.dofIds = [];
    this.dofIndexById = new Map();
    this.descriptorById = new Map();
    this.nodeIds = [];
    this.nodeIdSet = new Set();
  }

  reset(): this {
    this.dofIds.length = 0;
    this.dofIndexById.clear();
    this.descriptorById.clear();
    this.nodeIds.length = 0;
    this.nodeIdSet.clear();

    return this;
  }

  createEmpty(): DofRegistry {
    return new DofRegistry({ dofsPerNode: this.dofsPerNode });
  }

  registerNode(nodeOrId: string | DofNodeLike, dofs = this.dofsPerNode): this {
    const nodeId = resolveNodeId(nodeOrId);

    if (!this.nodeIdSet.has(nodeId)) {
      this.nodeIds.push(nodeId);
      this.nodeIdSet.add(nodeId);
    }

    for (const dof of dofs) {
      this.registerDof(nodeId, dof);
    }

    return this;
  }

  registerNodes(nodes: readonly DofNodeLike[] = []): this {
    if (!isRuntimeArray(nodes)) {
      throw new Error("DofRegistry registerNodes requires an array.");
    }

    for (const node of nodes) {
      this.registerNode(node);
    }

    return this;
  }

  registerElement(element: DofElementLike): this {
    if (!element) {
      throw new Error("DofRegistry registerElement requires an element.");
    }

    if (Array.isArray(element.nodes)) {
      this.registerNodes(element.nodes);
    }

    return this;
  }

  registerElements(elements: readonly DofElementLike[] = []): this {
    if (!isRuntimeArray(elements)) {
      throw new Error("DofRegistry registerElements requires an array.");
    }

    for (const element of elements) {
      this.registerElement(element);
    }

    return this;
  }

  registerDof(nodeOrId: string | DofNodeLike, dof: string): number {
    const nodeId = resolveNodeId(nodeOrId);
    validateDofName(dof);

    const dofId = this.getDofId(nodeId, dof);
    const existingIndex = this.dofIndexById.get(dofId);

    if (existingIndex !== undefined) {
      return existingIndex;
    }

    const index = this.dofIds.length;
    this.dofIds.push(dofId);
    this.dofIndexById.set(dofId, index);
    this.descriptorById.set(dofId, { id: dofId, nodeId, dof, index });

    return index;
  }

  getDofId(nodeOrId: string | DofNodeLike, dof: string): string {
    const nodeId = resolveNodeId(nodeOrId);
    validateDofName(dof);

    return `${nodeId}.${dof}`;
  }

  hasDof(dofId: string): boolean {
    return this.dofIndexById.has(dofId);
  }

  getIndex(dofIdOrNode: string | DofNodeLike, dof: string | null = null): number {
    const dofId = dof === null ? resolveNodeId(dofIdOrNode) : this.getDofId(dofIdOrNode, dof);
    const index = this.dofIndexById.get(dofId);

    if (index === undefined) {
      throw new Error(`DofRegistry does not contain DOF ${dofId}.`);
    }

    return index;
  }

  getDescriptor(dofIdOrNode: string | DofNodeLike, dof: string | null = null): DofDescriptor {
    const dofId = dof === null ? resolveNodeId(dofIdOrNode) : this.getDofId(dofIdOrNode, dof);
    const descriptor = this.descriptorById.get(dofId);

    if (!descriptor) {
      throw new Error(`DofRegistry does not contain DOF ${dofId}.`);
    }

    return { ...descriptor };
  }

  getDofIds(): string[] {
    return [...this.dofIds];
  }

  getDescriptors(): DofDescriptor[] {
    return this.dofIds.map((dofId) => this.getDescriptor(dofId));
  }

  size(): number {
    return this.dofIds.length;
  }

  toJSON(): {
    dofsPerNode: string[];
    nodeIds: string[];
    dofs: DofDescriptor[];
  } {
    return {
      dofsPerNode: [...this.dofsPerNode],
      nodeIds: [...this.nodeIds],
      dofs: this.getDescriptors(),
    };
  }
}
