// Mechanical TypeScript migration from strutture-js 6f33baead8b88166c4b2cf94af41763412e3c751; source path: src/domain/actions/AccidentalAction.js.

import { Action } from "./Action.js";
import type { ActionOptions } from "./Action.js";

export type AccidentalActionOptions = Omit<
  ActionOptions,
  "nature" | "family" | "loadDurationClass"
>;

export class AccidentalAction extends Action {
  public constructor(baseProps: AccidentalActionOptions) {
    super({
      ...baseProps,
      nature: "accidental",
      family: "accidental",
      loadDurationClass: "instantaneous",
    });
  }
}
