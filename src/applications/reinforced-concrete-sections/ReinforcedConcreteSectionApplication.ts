import { StructuralApplication } from "../../core/applications/StructuralApplication.js";
import type { VerificationResult } from "../../core/results/VerificationResult.js";
import { ReinforcedConcreteSectionVerification } from "./checks/ReinforcedConcreteSectionVerification.js";
import {
  ReinforcedConcreteSectionModel,
  type ReinforcedConcreteSectionModelInput,
} from "./models/ReinforcedConcreteSectionModel.js";

export interface ReinforcedConcreteSectionApplicationInput {
  model: ReinforcedConcreteSectionModel | ReinforcedConcreteSectionModelInput;
  code?: string;
  metadata?: Record<string, unknown>;
}

export class ReinforcedConcreteSectionApplication extends StructuralApplication {
  constructor() {
    super({
      id: "reinforced-concrete-sections",
      name: "RC Sections",
      description:
        "Analysis and verification of reinforced concrete sections under axial load and bending.",
      domain: "reinforced-concrete",
      supportedCodes: ["NTC2018"],
      tags: ["rc", "interaction-domain", "section-analysis", "uls", "uniaxial-resistance"],
      metadata: {
        maturity: "partial",
        implementedAnalysisTypes: [
          "uls-uniaxial-resistance",
          "uls-uniaxial-domain",
          "uls-biaxial-domain",
          "service-stress",
          "moment-curvature",
        ],
        limitations: [
          "domain sampling and mesh refinement are explicit solver settings",
          "shear, torsion and member detailing are not implemented in the current TypeScript slices",
        ],
      },
    });
  }

  override run(input?: ReinforcedConcreteSectionApplicationInput): VerificationResult {
    if (!input?.model) {
      throw new Error("ReinforcedConcreteSectionApplication requires a model.");
    }

    const model =
      input.model instanceof ReinforcedConcreteSectionModel
        ? input.model
        : new ReinforcedConcreteSectionModel(input.model);

    return new ReinforcedConcreteSectionVerification({
      code: input.code ?? "NTC2018",
      metadata: input.metadata ?? {},
    }).verify(model);
  }
}
