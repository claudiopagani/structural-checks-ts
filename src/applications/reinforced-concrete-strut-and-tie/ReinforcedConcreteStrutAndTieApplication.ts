// Mechanical TypeScript migration from strutture-js 6f33baead8b88166c4b2cf94af41763412e3c751; source path: ../strutture-js/src/applications/reinforced-concrete-strut-and-tie/ReinforcedConcreteStrutAndTieApplication.js.
/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return */
import { StructuralApplication } from "../../core/applications/StructuralApplication.js";
import { ReinforcedConcreteStrutAndTieModel } from "./ReinforcedConcreteStrutAndTieModel.js";
import {
  RC_STRUT_AND_TIE_SUPPORTED_CODE,
  ReinforcedConcreteStrutAndTieVerification,
} from "./ReinforcedConcreteStrutAndTieVerification.js";

export class ReinforcedConcreteStrutAndTieApplication extends StructuralApplication {
  constructor() {
    super({
      id: "reinforced-concrete-strut-and-tie",
      name: "RC Strut-and-Tie Models",
      description:
        "Analysis and EN 1992 verification of an explicitly assigned two-dimensional reinforced-concrete strut-and-tie model.",
      domain: "reinforced-concrete",
      supportedCodes: [RC_STRUT_AND_TIE_SUPPORTED_CODE],
      tags: ["rc", "strut-and-tie", "d-region", "deep-beam", "corbel"],
      metadata: {
        maturity: "partial",
        limitations: [
          "assigned 2D topology only",
          "linear-elastic force distribution",
          "no automatic topology generation or optimization",
          "anchorage and splitting reinforcement are not verified",
        ],
      },
    });
  }

  override run(input: any = {}): any {
    if (!input.model) {
      throw new Error("ReinforcedConcreteStrutAndTieApplication requires a model.");
    }

    const model =
      input.model instanceof ReinforcedConcreteStrutAndTieModel
        ? input.model
        : new ReinforcedConcreteStrutAndTieModel(input.model);

    return new ReinforcedConcreteStrutAndTieVerification({
      code: input.code ?? RC_STRUT_AND_TIE_SUPPORTED_CODE,
      metadata: input.metadata ?? {},
    }).verify(model);
  }
}
