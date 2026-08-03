// Mechanical TypeScript migration from strutture-js 6f33baead8b88166c4b2cf94af41763412e3c751; source path: src/applications/timber-xlam-composite-beams/TimberXlamCompositeBeamApplication.js.
/* eslint-disable @typescript-eslint/ban-ts-comment, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unused-vars */
// @ts-nocheck

import { StructuralApplication } from "../../core/applications/StructuralApplication.js";
import { TimberXlamCompositeBeamVerification } from "./checks/TimberXlamCompositeBeamVerification.js";

export class TimberXlamCompositeBeamApplication extends StructuralApplication {
  constructor() {
    super({
      id: "timber-xlam-composite-beams",
      name: "Timber XLAM Composite Beams",
      description:
        "Verification of timber beams collaborating with XLAM panels through discrete timber-timber connectors.",
      domain: "timber",
      supportedCodes: ["NTC2018", "Eurocode 5"],
      tags: ["timber", "xlam", "composite", "gamma-method", "connectors"],
      metadata: {
        maturity: "implemented",
        plannedCapabilities: [
          "fire verification workflow",
          "additional XLAM layups",
          "alternative connector families",
        ],
      },
    });
  }

  run({ model }: any = {}) {
    if (!model) {
      throw new Error("TimberXlamCompositeBeamApplication requires a model.");
    }

    return new TimberXlamCompositeBeamVerification().verify(model);
  }
}
