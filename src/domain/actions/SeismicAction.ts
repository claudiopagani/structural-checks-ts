// Mechanical TypeScript migration from strutture-js 6f33baead8b88166c4b2cf94af41763412e3c751; source path: src/domain/actions/SeismicAction.js.

import { Action } from "./Action.js";
import type { ActionOptions } from "./Action.js";

export type SeismicActionOptions = Omit<ActionOptions, "nature" | "family" | "loadDurationClass">;

export class SeismicAction extends Action {
  public constructor(baseProps: SeismicActionOptions) {
    super({
      ...baseProps,
      nature: "seismic",
      family: "seismic",
      loadDurationClass: "instantaneous",
    });
  }
}
