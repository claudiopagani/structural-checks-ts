import { CalculationResult } from "../../../core/results/CalculationResult.js";
import { RESULT_STATUS } from "../../../core/results/resultStatus.js";
import {
  LateralPileCapacityAnalysis,
  type LateralPileCapacityAnalysisInput,
} from "../../../domain/geotechnics/index.js";

const REPLACEMENT_APPLICATION_ID = "geotechnical-lateral-piles";

export type MicropileBromsAnalysisInput = LateralPileCapacityAnalysisInput & {
  model?: { id?: unknown } | null;
  pileId?: unknown;
  [key: string]: unknown;
};

export interface MicropileBromsAnalysisOptions {
  metadata?: Record<string, unknown> | null;
}

function isGeneralLateralPileInput(input: MicropileBromsAnalysisInput): boolean {
  return (
    input?.groundModel != null &&
    input?.designSituation != null &&
    input?.pile != null &&
    input?.scenario != null &&
    input?.units != null
  );
}

export class MicropileBromsAnalysis {
  metadata: Record<string, unknown>;

  constructor({ metadata = {} }: MicropileBromsAnalysisOptions = {}) {
    this.metadata = { ...metadata };
  }

  analyze(input: MicropileBromsAnalysisInput = {}): CalculationResult {
    if (isGeneralLateralPileInput(input)) {
      const analysis = new LateralPileCapacityAnalysis().analyze(input);
      return new CalculationResult({
        applicationId: "micropiles-broms",
        status: analysis.status,
        summary: analysis.summary,
        outputs: analysis.outputs,
        warnings: [
          `micropiles-broms is deprecated; use ${REPLACEMENT_APPLICATION_ID}.`,
          ...analysis.warnings,
        ],
        assumptions: analysis.assumptions,
        metadata: {
          ...analysis.metadata,
          ...this.metadata,
          deprecated: true,
          replacementApplicationId: REPLACEMENT_APPLICATION_ID,
        },
      });
    }

    const pileId = input.pileId ?? input.model?.id ?? null;
    return new CalculationResult({
      applicationId: "micropiles-broms",
      status: RESULT_STATUS.NOT_IMPLEMENTED,
      summary:
        "Legacy MicropileBromsModel input is not implemented; migrate to the general lateral-pile contracts.",
      warnings: [
        `Use ${REPLACEMENT_APPLICATION_ID} with GroundModel, GeotechnicalDesignSituation, DeepFoundationModel and LateralPileLoadScenario.`,
      ],
      metadata: {
        pileId,
        deprecated: true,
        replacementApplicationId: REPLACEMENT_APPLICATION_ID,
        ...this.metadata,
      },
    });
  }
}
