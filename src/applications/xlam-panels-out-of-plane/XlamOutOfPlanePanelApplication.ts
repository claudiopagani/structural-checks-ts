// Mechanical TypeScript migration from strutture-js 6f33baead8b88166c4b2cf94af41763412e3c751; source path: src/applications/xlam-panels-out-of-plane/XlamOutOfPlanePanelApplication.js.
/* eslint-disable @typescript-eslint/ban-ts-comment, @typescript-eslint/no-explicit-any */
// @ts-nocheck

import { StructuralApplication } from "../../core/applications/StructuralApplication.js";
import { XlamOutOfPlanePanelVerification } from "./checks/XlamOutOfPlanePanelVerification.js";

export class XlamOutOfPlanePanelApplication extends StructuralApplication {
  constructor() {
    super({
      id: "xlam-panels-out-of-plane",
      name: "XLAM Panels Out Of Plane",
      description:
        "Out-of-plane verification of standalone XLAM/CLT floor panels using the CLTdesigner-style 1D plate method.",
      domain: "timber",
      supportedCodes: ["EN1995", "WCTE2010"],
      tags: ["xlam", "clt", "floor", "out-of-plane", "timoshenko"],
      metadata: {
        maturity: "implemented",
        plannedCapabilities: [
          "continuous beam module",
          "vibration checks",
          "fire verification with reduced section",
          "producer panel catalogs",
        ],
      },
    });
  }

  run({ model }: any = {}) {
    if (!model) {
      throw new Error("XlamOutOfPlanePanelApplication requires a model.");
    }

    return new XlamOutOfPlanePanelVerification().verify(model);
  }
}
