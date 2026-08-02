// Mechanical TypeScript migration from strutture-js 6f33baead8b88166c4b2cf94af41763412e3c751;
// source path: src/domain/loads/ElementPointLoad.js.

import { PointLoad, type PointLoadInput, type PointLoadJson } from "./PointLoad.js";
import type { LoadTarget } from "./Load.js";

export interface ElementPointLoadInput extends Omit<PointLoadInput, "target" | "type"> {
  element?: LoadTarget | null | undefined;
  target?: LoadTarget | null | undefined;
  position?: number;
  referenceSystem?: string;
}

export interface ElementPointLoadJson extends PointLoadJson {
  elementId: string | null;
  position: number;
  referenceSystem: string;
}

export class ElementPointLoad extends PointLoad {
  declare readonly element: LoadTarget | null;
  declare readonly position: number;
  declare readonly referenceSystem: string;

  constructor({
    element,
    target = element ?? null,
    position = 0,
    referenceSystem = "local",
    ...baseProps
  }: ElementPointLoadInput) {
    super({
      ...baseProps,
      type: "element_point",
      target,
    });

    this.element = target;
    this.position = position;
    this.referenceSystem = referenceSystem;
  }

  override toJSON(): ElementPointLoadJson {
    return {
      ...super.toJSON(),
      elementId: this.element?.id ?? null,
      position: this.position,
      referenceSystem: this.referenceSystem,
    };
  }
}
