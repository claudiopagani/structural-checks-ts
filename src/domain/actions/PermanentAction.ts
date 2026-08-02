// Mechanical TypeScript migration from strutture-js 6f33baead8b88166c4b2cf94af41763412e3c751; source path: src/domain/actions/PermanentAction.js.

import { Action } from "./Action.js";
import type { ActionJson, ActionOptions } from "./Action.js";

export interface PermanentActionOptions
  extends Omit<ActionOptions, "nature" | "family" | "loadDurationClass"> {
  permanentClass?: string;
}

export interface PermanentActionJson extends ActionJson {
  permanentClass: string;
}

export class PermanentAction extends Action {
  public permanentClass: string;

  public constructor({ permanentClass = "G1", ...baseProps }: PermanentActionOptions) {
    super({
      ...baseProps,
      nature: "permanent",
      family: "permanent",
      loadDurationClass: "permanent",
    });

    this.permanentClass = permanentClass;
  }

  public override toJSON(): PermanentActionJson {
    return {
      ...super.toJSON(),
      permanentClass: this.permanentClass,
    };
  }
}
