import { StructuralApplication } from "../../core/applications/StructuralApplication.js";
import type { VerificationResult } from "../../core/results/VerificationResult.js";
import {
  ReinforcedConcreteIsolatedFootingModel,
  type ReinforcedConcreteIsolatedFootingModelInput,
} from "./ReinforcedConcreteIsolatedFootingModel.js";
import { ReinforcedConcreteIsolatedFootingVerification } from "./ReinforcedConcreteIsolatedFootingVerification.js";

export interface ReinforcedConcreteIsolatedFootingApplicationInput {
  model?: ReinforcedConcreteIsolatedFootingModel | ReinforcedConcreteIsolatedFootingModelInput;
  code?: string;
  metadata?: Record<string, unknown>;
}

export class ReinforcedConcreteIsolatedFootingApplication extends StructuralApplication {
  constructor() {
    super({
      id: "reinforced-concrete-isolated-footings",
      name: "RC Isolated Footings",
      description:
        "Local verification of centered rectangular reinforced-concrete isolated footings.",
      domain: "reinforced-concrete",
      supportedCodes: ["NTC2018", "EN1992_1_1_2004_A1_2014"],
      tags: ["rc", "foundations", "footings", "bearing", "shear", "punching"],
      metadata: {
        maturity: "implemented-local",
        geotechnicalResistanceCalculated: false,
        limitations: [
          "centered unrotated rectangular column only",
          "rigid compression-only base with linear pressure plane on the active polygon",
          "bearing and sliding resistances are assigned inputs",
          "bearing capacity, settlements and soil-structure interaction are not calculated",
        ],
      },
    });
  }

  override run(input: ReinforcedConcreteIsolatedFootingApplicationInput = {}): VerificationResult {
    if (!input.model) {
      throw new Error("ReinforcedConcreteIsolatedFootingApplication requires a model.");
    }

    const model =
      input.model instanceof ReinforcedConcreteIsolatedFootingModel
        ? input.model
        : new ReinforcedConcreteIsolatedFootingModel(input.model);

    return new ReinforcedConcreteIsolatedFootingVerification({
      code: input.code ?? "NTC2018",
      metadata: input.metadata ?? {},
    }).verify(model);
  }
}
