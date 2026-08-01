import { VerificationResult } from "../../../core/results/VerificationResult.js";
import { RESULT_STATUS } from "../../../core/results/resultStatus.js";
import {
  ReinforcedConcreteSectionModel,
  type ReinforcedConcreteSectionModelInput,
} from "../models/ReinforcedConcreteSectionModel.js";
import { runUlsBiaxialDomainWorkflow } from "../workflows/ulsBiaxialDomainWorkflow.js";
import { runMomentCurvatureWorkflow } from "../workflows/momentCurvatureWorkflow.js";
import { runServiceStressWorkflow } from "../workflows/serviceStressWorkflow.js";
import { runUlsUniaxialDomainWorkflow } from "../workflows/ulsUniaxialDomainWorkflow.js";
import { runUlsUniaxialResistanceWorkflow } from "../workflows/ulsUniaxialResistanceWorkflow.js";

export interface ReinforcedConcreteSectionVerificationOptions {
  code?: string;
  metadata?: Record<string, unknown>;
}

type MissingSectionInput = Partial<ReinforcedConcreteSectionModelInput> & {
  sectionId?: string | null;
  loadCase?: string | null;
};

function missingSectionResult(
  input: MissingSectionInput,
  {
    code,
    metadata,
  }: {
    code: string;
    metadata: Record<string, unknown>;
  },
): VerificationResult {
  const { sectionId = null, loadCase = null } = input;

  return new VerificationResult({
    applicationId: "reinforced-concrete-sections",
    status: RESULT_STATUS.NOT_ANALYZED,
    summary: "RC section verification requires a section.",
    warnings: ["RC section verification was not run because the section input is missing."],
    metadata: {
      code,
      sectionId,
      loadCase,
      ...metadata,
    },
  });
}

function unsupportedAnalysisTypeResult(
  model: ReinforcedConcreteSectionModel,
  {
    code,
    metadata,
  }: {
    code: string;
    metadata: Record<string, unknown>;
  },
): VerificationResult {
  return new VerificationResult({
    applicationId: "reinforced-concrete-sections",
    status: RESULT_STATUS.NOT_IMPLEMENTED,
    summary: `RC section analysis type ${model.analysisType} is not implemented yet.`,
    warnings: [
      "Only uls-uniaxial-resistance, uls-uniaxial-domain, uls-biaxial-domain, service-stress, and moment-curvature are implemented in the current TypeScript migration slices.",
    ],
    metadata: {
      code,
      sectionId: model.id,
      analysisType: model.analysisType,
      ...metadata,
    },
  });
}

export class ReinforcedConcreteSectionVerification {
  code: string;
  metadata: Record<string, unknown>;

  constructor({
    code = "NTC2018",
    metadata = {},
  }: ReinforcedConcreteSectionVerificationOptions = {}) {
    this.code = code;
    this.metadata = { ...metadata };
  }

  verify(
    modelOrOptions: ReinforcedConcreteSectionModel | MissingSectionInput = {},
  ): VerificationResult {
    if (!modelOrOptions.section) {
      return missingSectionResult(modelOrOptions, {
        code: this.code,
        metadata: this.metadata,
      });
    }

    const model =
      modelOrOptions instanceof ReinforcedConcreteSectionModel
        ? modelOrOptions
        : new ReinforcedConcreteSectionModel(modelOrOptions as ReinforcedConcreteSectionModelInput);

    if (model.analysisType === "uls-uniaxial-resistance") {
      return runUlsUniaxialResistanceWorkflow(model, {
        code: this.code,
        metadata: this.metadata,
      });
    }

    if (model.analysisType === "uls-uniaxial-domain") {
      return runUlsUniaxialDomainWorkflow(model, {
        code: this.code,
        metadata: this.metadata,
      });
    }

    if (model.analysisType === "uls-biaxial-domain") {
      return runUlsBiaxialDomainWorkflow(model, {
        code: this.code,
        metadata: this.metadata,
      });
    }

    if (model.analysisType === "service-stress") {
      return runServiceStressWorkflow(model, {
        code: this.code,
        metadata: this.metadata,
      });
    }

    if (model.analysisType === "moment-curvature") {
      return runMomentCurvatureWorkflow(model, {
        code: this.code,
        metadata: this.metadata,
      });
    }

    return unsupportedAnalysisTypeResult(model, {
      code: this.code,
      metadata: this.metadata,
    });
  }
}
