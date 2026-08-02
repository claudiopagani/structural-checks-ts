// Mechanical TypeScript migration from strutture-js 6f33baead8b88166c4b2cf94af41763412e3c751; source path: src/domain/actions/ClimaticAction.js.

import { VariableAction } from "./VariableAction.js";
import type { VariableActionOptions } from "./VariableAction.js";

export interface ClimaticActionOptions extends Omit<VariableActionOptions, "family"> {
  family?: string;
}

export class ClimaticAction extends VariableAction {
  public constructor({ family = "climatic", ...baseProps }: ClimaticActionOptions = {}) {
    super({
      ...baseProps,
      family,
    });
  }
}
