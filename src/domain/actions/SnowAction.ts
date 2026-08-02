// Mechanical TypeScript migration from strutture-js 6f33baead8b88166c4b2cf94af41763412e3c751; source path: src/domain/actions/SnowAction.js.

import { ClimaticAction } from "./ClimaticAction.js";
import type { ClimaticActionOptions } from "./ClimaticAction.js";

export type SnowActionOptions = ClimaticActionOptions;

export class SnowAction extends ClimaticAction {
  public constructor(baseProps: SnowActionOptions) {
    super({
      ...baseProps,
      family: "snow",
    });
  }
}
