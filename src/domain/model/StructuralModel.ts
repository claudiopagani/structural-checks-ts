export interface StructuralModelOptions {
  id: string;
  name?: string | null;
  materials?: readonly unknown[];
  nodes?: readonly unknown[];
  elements?: readonly unknown[];
  supports?: readonly unknown[];
  loadCases?: readonly unknown[];
  loadCombinations?: readonly unknown[];
  metadata?: Record<string, unknown>;
}

export interface StructuralModelSummary {
  id: string;
  name: string;
  materials: number;
  nodes: number;
  elements: number;
  supports: number;
  loadCases: number;
  loadCombinations: number;
}

export class StructuralModel {
  id: string;
  name: string;
  materials: unknown[];
  nodes: unknown[];
  elements: unknown[];
  supports: unknown[];
  loadCases: unknown[];
  loadCombinations: unknown[];
  metadata: Record<string, unknown>;

  constructor({
    id,
    name,
    materials = [],
    nodes = [],
    elements = [],
    supports = [],
    loadCases = [],
    loadCombinations = [],
    metadata = {},
  }: StructuralModelOptions) {
    if (!id) throw new Error("A model id is required.");

    this.id = id;
    this.name = name ?? id;
    this.materials = [...materials];
    this.nodes = [...nodes];
    this.elements = [...elements];
    this.supports = [...supports];
    this.loadCases = [...loadCases];
    this.loadCombinations = [...loadCombinations];
    this.metadata = { ...metadata };
  }

  addMaterial(material: unknown): this {
    this.materials.push(material);
    return this;
  }

  addNode(node: unknown): this {
    this.nodes.push(node);
    return this;
  }

  addElement(element: unknown): this {
    this.elements.push(element);
    return this;
  }

  addSupport(support: unknown): this {
    this.supports.push(support);
    return this;
  }

  addLoadCase(loadCase: unknown): this {
    this.loadCases.push(loadCase);
    return this;
  }

  addLoadCombination(loadCombination: unknown): this {
    this.loadCombinations.push(loadCombination);
    return this;
  }

  summary(): StructuralModelSummary {
    return {
      id: this.id,
      name: this.name,
      materials: this.materials.length,
      nodes: this.nodes.length,
      elements: this.elements.length,
      supports: this.supports.length,
      loadCases: this.loadCases.length,
      loadCombinations: this.loadCombinations.length,
    };
  }
}
