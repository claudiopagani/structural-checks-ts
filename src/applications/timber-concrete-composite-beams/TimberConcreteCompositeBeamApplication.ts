// Mechanical TypeScript migration from strutture-js 6f33baead8b88166c4b2cf94af41763412e3c751; source path: src/applications/timber-concrete-composite-beams/TimberConcreteCompositeBeamApplication.js.
/* eslint-disable @typescript-eslint/ban-ts-comment, @typescript-eslint/no-explicit-any */
// @ts-nocheck

import { StructuralApplication } from "../../core/applications/StructuralApplication.js";
import { TimberConcreteCompositeBeamVerification } from "./checks/TimberConcreteCompositeBeamVerification.js";

export class TimberConcreteCompositeBeamApplication extends StructuralApplication {
  constructor() {
    super({
      id: "timber-concrete-composite-beams",
      name: "Timber Concrete Composite Beams",
      description:
        "Verification of timber beams with collaborating concrete slab and discrete shear connectors.",
      domain: "timber",
      supportedCodes: ["NTC2018", "Gelfi"],
      tags: ["timber", "concrete", "composite", "connectors", "serviceability"],
      metadata: {
        maturity: "implemented",
        plannedCapabilities: [
          "support for different slab shapes",
          "multiple connector layouts",
          "additional load combinations",
        ],
      },
    });
  }

  run({ model }: any = {}) {
    if (!model) {
      throw new Error("TimberConcreteCompositeBeamApplication requires a model.");
    }

    return new TimberConcreteCompositeBeamVerification().verify(model);
  }
}
