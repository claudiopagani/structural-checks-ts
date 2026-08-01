import type { FrameElement2DEulerBernoulli } from "../fem/elements/FrameElement2DEulerBernoulli.js";
import { LineLoad, type LineLoadInput, type LineLoadJson } from "./LineLoad.js";

export interface DistributedLoadInput extends Omit<LineLoadInput, "target" | "type"> {
  element?: FrameElement2DEulerBernoulli | null;
  target?: FrameElement2DEulerBernoulli | null;
}

export interface DistributedLoadJson extends LineLoadJson {
  elementId: string | null;
}

export class DistributedLoad extends LineLoad {
  readonly element: FrameElement2DEulerBernoulli | null;

  constructor({ element = null, target = element, ...baseProps }: DistributedLoadInput) {
    super({
      ...baseProps,
      type: "distributed",
      target,
    });

    this.element = target;
  }

  override toJSON(): DistributedLoadJson {
    return {
      ...super.toJSON(),
      elementId: this.element?.id ?? null,
    };
  }
}
