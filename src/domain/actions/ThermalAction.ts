// Mechanical TypeScript migration from strutture-js 6f33baead8b88166c4b2cf94af41763412e3c751; source path: src/domain/actions/ThermalAction.js.

import { ClimaticAction } from "./ClimaticAction.js";
import type { ClimaticActionOptions } from "./ClimaticAction.js";

export type ThermalActionOptions = ClimaticActionOptions;

export class ThermalAction extends ClimaticAction {
  public constructor(baseProps: ThermalActionOptions) {
    super({
      ...baseProps,
      family: "thermal",
    });
  }
}
