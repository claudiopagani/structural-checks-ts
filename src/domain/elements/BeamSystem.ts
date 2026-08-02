// Mechanical TypeScript migration from strutture-js 6f33baead8b88166c4b2cf94af41763412e3c751;
// source path: src/domain/elements/BeamSystem.js.

import type { StructuralElementNode } from "./StructuralElement.js";

export interface BeamSystemBeam {
  id: string;
  startNode: StructuralElementNode;
  endNode: StructuralElementNode;
  length(): number;
}

export interface BeamSystemInput {
  id: string;
  name?: string | null | undefined;
  beams?: readonly BeamSystemBeam[] | undefined;
  nodes?: readonly StructuralElementNode[] | undefined;
  metadata?: Record<string, unknown> | null | undefined;
}

export interface BeamSystemJson {
  id: string;
  name: string;
  beamIds: string[];
  nodeIds: string[];
  totalLength: number;
  metadata: Record<string, unknown>;
}

export class BeamSystem {
  id: string;
  name: string;
  beams: BeamSystemBeam[];
  nodes: StructuralElementNode[];
  metadata: Record<string, unknown>;

  constructor({ id, name, beams = [], nodes = [], metadata = {} }: BeamSystemInput) {
    if (!id) {
      throw new Error("A beam system id is required.");
    }

    this.id = id;
    this.name = name ?? id;
    this.beams = [...beams];
    this.nodes = [...nodes];
    this.metadata = { ...metadata };
  }

  addBeam(beam: BeamSystemBeam): this {
    this.beams.push(beam);
    this.#addDistinctNodes([beam.startNode, beam.endNode]);
    return this;
  }

  addNode(node: StructuralElementNode): this {
    this.#addDistinctNodes([node]);
    return this;
  }

  totalLength(): number {
    return this.beams.reduce((acc, beam) => acc + beam.length(), 0);
  }

  #addDistinctNodes(nodes: readonly StructuralElementNode[]): void {
    for (const node of nodes) {
      if (!this.nodes.some((item) => item.id === node.id)) {
        this.nodes.push(node);
      }
    }
  }

  toJSON(): BeamSystemJson {
    return {
      id: this.id,
      name: this.name,
      beamIds: this.beams.map((beam) => beam.id),
      nodeIds: this.nodes.map((node) => node.id),
      totalLength: this.totalLength(),
      metadata: { ...this.metadata },
    };
  }
}
