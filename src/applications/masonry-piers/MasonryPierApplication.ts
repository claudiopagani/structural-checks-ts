import { StructuralApplication } from "../../core/applications/StructuralApplication.js";
import { uniqueStrings } from "../../core/results/checkUtils.js";
import { MasonryPierEquivalentFrameBuilder } from "./analysis/MasonryPierEquivalentFrameBuilder.js";
import { NTC2018MasonryPierAnalysis } from "./analysis/NTC2018MasonryPierAnalysis.js";
import { MasonryPierVerticalVerification } from "./checks/MasonryPierVerticalVerification.js";
import { MasonryPierModel, type MasonryPierModelOptions } from "./models/MasonryPierModel.js";
import {
  NTC2018MasonryPierModel,
  type NTC2018MasonryPierModelOptions,
} from "./models/NTC2018MasonryPierModel.js";
import type { CalculationResult } from "../../core/results/CalculationResult.js";

export interface MasonryPierApplicationInput extends MasonryPierModelOptions {
  analysisType?: string;
  analysis?: string;
  code?: string;
  model?:
    | MasonryPierModel
    | NTC2018MasonryPierModel
    | MasonryPierModelOptions
    | NTC2018MasonryPierModelOptions
    | null;
}

export class MasonryPierApplication extends StructuralApplication {
  constructor() {
    super({
      id: "masonry-piers",
      name: "Masonry Piers",
      description:
        "Vertical verification and autonomous NTC 2018 bilinear in-plane capacity envelope for masonry piers, with a separate equivalent-frame idealization.",
      domain: "masonry",
      supportedCodes: ["NTC2018", "Circolare 2019"],
      tags: [
        "existing-buildings",
        "masonry",
        "equivalent-frame",
        "vertical-loads",
        "compression",
        "nonlinear-static",
      ],
      metadata: {
        maturity: "partial",
        plannedCapabilities: [
          "integration into equivalent-frame wall assemblies",
          "member extraction from wall-level FEM results",
        ],
      },
    });
  }

  override run(input: MasonryPierApplicationInput = {}): CalculationResult {
    const requestedAnalysis = String(
      input.analysisType ?? input.analysis ?? "vertical-verification",
    )
      .trim()
      .toLowerCase();

    if (
      requestedAnalysis === "ntc2018-bilinear" ||
      requestedAnalysis === "in-plane-nonlinear-static" ||
      input.model instanceof NTC2018MasonryPierModel
    ) {
      const model =
        input.model instanceof NTC2018MasonryPierModel
          ? input.model
          : new NTC2018MasonryPierModel(input.model ?? input);
      return new NTC2018MasonryPierAnalysis().analyze({ model });
    }

    const model =
      input.model instanceof MasonryPierModel
        ? input.model
        : new MasonryPierModel(input.model ?? input);
    const verification = new MasonryPierVerticalVerification({
      code: input.code ?? "NTC2018",
    }).verify({ model });

    try {
      const idealization = new MasonryPierEquivalentFrameBuilder().build({ model });
      verification.outputs.equivalentFrameIdealization = idealization.snapshot;
      verification.assumptions.push(...idealization.assumptions);
      verification.warnings.push(...idealization.warnings);
    } catch (error: unknown) {
      verification.warnings.push(
        `Equivalent-frame idealization was not generated: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    verification.metadata = {
      ...verification.metadata,
      modelId: model.id,
    };
    verification.warnings = uniqueStrings(verification.warnings);
    verification.assumptions = uniqueStrings(verification.assumptions);

    return verification;
  }
}
