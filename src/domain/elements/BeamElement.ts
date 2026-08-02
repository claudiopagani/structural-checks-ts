// Mechanical TypeScript migration from strutture-js 6f33baead8b88166c4b2cf94af41763412e3c751;
// source path: src/domain/elements/BeamElement.js.

import {
  StructuralElement,
  type StructuralElementInput,
  type StructuralElementJson,
  type StructuralElementNode,
} from "./StructuralElement.js";

export interface BeamElementNode extends StructuralElementNode {
  coordinates(): [number, number, number];
  distanceTo(node: Pick<BeamElementNode, "coordinates">): number;
  toJSON(): unknown;
}

export interface BeamElementInput extends Omit<StructuralElementInput, "type" | "nodes"> {
  startNode: BeamElementNode;
  endNode: BeamElementNode;
  releases?: Record<string, unknown> | null | undefined;
  localAxis?: unknown;
}

export interface BeamElementJson extends StructuralElementJson {
  startNode: unknown;
  endNode: unknown;
  releases: Record<string, unknown>;
  localAxis: unknown;
  length: number;
}

export class BeamElement extends StructuralElement {
  startNode: BeamElementNode;
  endNode: BeamElementNode;
  releases: Record<string, unknown>;
  localAxis: unknown;

  constructor({
    startNode,
    endNode,
    releases = {},
    localAxis = null,
    ...baseProps
  }: BeamElementInput) {
    super({
      type: "beam",
      nodes: [startNode, endNode],
      ...baseProps,
    });

    this.startNode = startNode;
    this.endNode = endNode;
    this.releases = { ...releases };
    this.localAxis = localAxis;
  }

  length(): number {
    return this.startNode.distanceTo(this.endNode);
  }

  override toJSON(): BeamElementJson {
    return {
      ...super.toJSON(),
      startNode: this.startNode.toJSON(),
      endNode: this.endNode.toJSON(),
      releases: { ...this.releases },
      localAxis: this.localAxis,
      length: this.length(),
    };
  }
}
