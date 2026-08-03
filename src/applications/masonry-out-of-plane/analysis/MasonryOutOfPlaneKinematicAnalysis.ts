import { CalculationResult } from "../../../core/results/CalculationResult.js";
import { RESULT_STATUS } from "../../../core/results/resultStatus.js";

export interface MasonryOutOfPlaneKinematicAnalysisOptions {
  code?: string;
  metadata?: Record<string, unknown>;
}

export interface MasonryOutOfPlaneKinematicAnalysisInput {
  wallId?: string | null;
}

export class MasonryOutOfPlaneKinematicAnalysis {
  public code: string;
  public metadata: Record<string, unknown>;

  public constructor({
    code = "NTC2018",
    metadata = {},
  }: MasonryOutOfPlaneKinematicAnalysisOptions = {}) {
    this.code = code;
    this.metadata = { ...metadata };
  }

  public analyze({
    wallId = null,
  }: MasonryOutOfPlaneKinematicAnalysisInput = {}): CalculationResult {
    return new CalculationResult({
      applicationId: "masonry-out-of-plane",
      status: RESULT_STATUS.NOT_IMPLEMENTED,
      summary: "Out-of-plane kinematic analysis scaffolded.",
      warnings: ["Activation multiplier, stabilizing masses and hinge patterns are placeholders."],
      metadata: {
        code: this.code,
        wallId,
        ...this.metadata,
      },
    });
  }
}
