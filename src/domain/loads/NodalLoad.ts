import type { Node } from "../geometry/Node.js";
import { PointLoad, type PointLoadInput, type PointLoadJson } from "./PointLoad.js";

export interface NodalLoadInput extends Omit<PointLoadInput, "target" | "type"> {
  node?: Pick<Node, "id"> | null;
  target?: Pick<Node, "id"> | null;
}

export interface NodalLoadJson extends PointLoadJson {
  nodeId: string | null;
}

export class NodalLoad extends PointLoad {
  readonly node: Pick<Node, "id"> | null;

  constructor({ node = null, target = node, ...baseProps }: NodalLoadInput) {
    super({
      ...baseProps,
      type: "nodal",
      target,
    });

    this.node = target;
  }

  override toJSON(): NodalLoadJson {
    return {
      ...super.toJSON(),
      nodeId: this.node?.id ?? null,
    };
  }
}
