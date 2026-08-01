import { StructuralApplication } from "../../core/applications/StructuralApplication.js";
import type { VerificationResult } from "../../core/results/VerificationResult.js";
import { PunchingVerification } from "./PunchingVerification.js";
import type {
  PunchingVerificationRequest,
  PunchingVerificationRequestOptions,
} from "./PunchingVerificationRequest.js";
import { RC_PUNCHING_DESIGN_CODE_ID_VALUES } from "./punchingDesignCodes.js";

export interface ReinforcedConcretePunchingApplicationInput {
  request?: PunchingVerificationRequest | PunchingVerificationRequestOptions;
  model?: PunchingVerificationRequest | PunchingVerificationRequestOptions;
}

export class ReinforcedConcretePunchingApplication extends StructuralApplication {
  constructor() {
    super({
      id: "reinforced-concrete-punching",
      name: "RC Punching",
      description:
        "Local punching verification of reinforced-concrete slabs at columns and concentrated supports.",
      domain: "reinforced-concrete",
      supportedCodes: [...RC_PUNCHING_DESIGN_CODE_ID_VALUES],
      tags: ["rc", "slabs", "punching", "uls"],
      metadata: {
        maturity: "implemented",
        inputContract: "rc-punching-verification-request/v0",
      },
    });
  }

  override run(input: ReinforcedConcretePunchingApplicationInput = {}): VerificationResult {
    const request = input.request ?? input.model;
    if (!request) {
      throw new Error("ReinforcedConcretePunchingApplication requires a request or model.");
    }
    return new PunchingVerification().verify(request);
  }
}
