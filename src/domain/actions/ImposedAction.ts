// Mechanical TypeScript migration from strutture-js 6f33baead8b88166c4b2cf94af41763412e3c751; source path: src/domain/actions/ImposedAction.js.

import { VariableAction } from "./VariableAction.js";
import type { VariableActionOptions } from "./VariableAction.js";

export type ImposedActionOptions = VariableActionOptions;

export class ImposedAction extends VariableAction {
  public constructor(baseProps: ImposedActionOptions) {
    super({
      ...baseProps,
      family: "imposed",
    });
  }
}
