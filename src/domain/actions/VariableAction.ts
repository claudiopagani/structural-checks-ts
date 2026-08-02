// Mechanical TypeScript migration from strutture-js 6f33baead8b88166c4b2cf94af41763412e3c751; source path: src/domain/actions/VariableAction.js.

import { Action } from "./Action.js";
import type { ActionJson, ActionOptions } from "./Action.js";

export interface VariableActionOptions extends Omit<ActionOptions, "nature"> {
  category?: string | null;
  leadingEligible?: boolean;
}

export interface VariableActionJson extends ActionJson {
  category: string | null;
  leadingEligible: boolean;
}

export class VariableAction extends Action {
  public category: string | null;
  public leadingEligible: boolean;

  public constructor({
    category = null,
    leadingEligible = true,
    ...baseProps
  }: VariableActionOptions) {
    super({
      ...baseProps,
      nature: "variable",
    });

    this.category = category;
    this.leadingEligible = leadingEligible;
  }

  public override toJSON(): VariableActionJson {
    return {
      ...super.toJSON(),
      category: this.category,
      leadingEligible: this.leadingEligible,
    };
  }
}
