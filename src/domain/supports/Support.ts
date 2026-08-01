import type { Node } from "../geometry/Node.js";

export type StructuralDof = "ux" | "uy" | "uz" | "rx" | "ry" | "rz";
export type DofRestraints = Record<StructuralDof, boolean> & Record<string, boolean>;
export type DofSpringStiffness = Record<StructuralDof, number> & Record<string, number>;

export interface SupportInput {
  id: string;
  node?: Pick<Node, "id"> | null;
  restraints?: Partial<Record<string, boolean>>;
  springStiffness?: Partial<Record<string, number>>;
  metadata?: Record<string, unknown>;
}

export interface SupportJson {
  id: string;
  nodeId: string | null;
  restraints: DofRestraints;
  springStiffness: DofSpringStiffness;
  metadata: Record<string, unknown>;
}

export class Support {
  readonly id: string;
  readonly node: Pick<Node, "id"> | null;
  readonly restraints: DofRestraints;
  readonly springStiffness: DofSpringStiffness;
  readonly metadata: Record<string, unknown>;

  constructor({
    id,
    node = null,
    restraints = {},
    springStiffness = {},
    metadata = {},
  }: SupportInput) {
    if (!id) {
      throw new Error("A support id is required.");
    }

    this.id = id;
    this.node = node;
    this.restraints = {
      ux: false,
      uy: false,
      uz: false,
      rx: false,
      ry: false,
      rz: false,
      ...restraints,
    };
    this.springStiffness = {
      ux: 0,
      uy: 0,
      uz: 0,
      rx: 0,
      ry: 0,
      rz: 0,
      ...springStiffness,
    };
    this.metadata = { ...metadata };
  }

  isRestrained(dof: string): boolean {
    return Boolean(this.restraints[dof]);
  }

  toJSON(): SupportJson {
    return {
      id: this.id,
      nodeId: this.node?.id ?? null,
      restraints: { ...this.restraints },
      springStiffness: { ...this.springStiffness },
      metadata: { ...this.metadata },
    };
  }
}
