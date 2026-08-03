import { StructuralApplication } from "../../core/applications/StructuralApplication.js";
import { CalculationResult } from "../../core/results/CalculationResult.js";
import {
  ShallowFoundationServiceabilityAnalysis,
  type ShallowFoundationServiceabilityAnalysisInput,
  type ShallowFoundationServiceabilityCriteriaInput,
} from "../../domain/geotechnics/ShallowFoundationServiceabilityAnalysis.js";
import {
  ShallowFoundationUltimateLimitStateAnalysis,
  type ShallowFoundationUltimateLimitStateAnalysisInput,
  type ShallowFoundationUlsCriteriaInput,
} from "../../domain/geotechnics/ShallowFoundationUltimateLimitStateAnalysis.js";

export type GeotechnicalShallowFoundationApplicationInput =
  | (ShallowFoundationUltimateLimitStateAnalysisInput & { analysisType?: string | null })
  | (ShallowFoundationServiceabilityAnalysisInput & { analysisType?: string | null });

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isUlsCriteria(value: unknown): value is ShallowFoundationUlsCriteriaInput {
  return (
    isRecord(value) &&
    ("minimumBearingFactorOfSafety" in value || "minimumSlidingFactorOfSafety" in value)
  );
}

function isServiceabilityCriteria(
  value: unknown,
): value is ShallowFoundationServiceabilityCriteriaInput {
  return isRecord(value) && ("maximumSettlement" in value || "maximumRotation" in value);
}

function toUlsInput(
  input: GeotechnicalShallowFoundationApplicationInput,
): ShallowFoundationUltimateLimitStateAnalysisInput {
  const result: ShallowFoundationUltimateLimitStateAnalysisInput = {};
  if (input.groundModel !== undefined) result.groundModel = input.groundModel;
  if (input.designSituation !== undefined) result.designSituation = input.designSituation;
  if (input.foundation !== undefined) result.foundation = input.foundation;
  if (input.actionState !== undefined) result.actionState = input.actionState;
  if ("profileId" in input && input.profileId !== undefined) result.profileId = input.profileId;
  if ("porePressureFieldId" in input && input.porePressureFieldId !== undefined) {
    result.porePressureFieldId = input.porePressureFieldId;
  }
  if ("surfaceSurcharge" in input && input.surfaceSurcharge !== undefined) {
    result.surfaceSurcharge = input.surfaceSurcharge;
  }
  if ("bearingSelection" in input && input.bearingSelection !== undefined) {
    result.bearingSelection = input.bearingSelection;
  }
  if ("baseUpliftTreatment" in input && input.baseUpliftTreatment !== undefined) {
    result.baseUpliftTreatment = input.baseUpliftTreatment;
  }
  if ("sliding" in input && input.sliding !== undefined) result.sliding = input.sliding;
  if (isUlsCriteria(input.criteria)) result.criteria = input.criteria;
  if (input.units !== undefined) result.units = input.units;
  return result;
}

function toServiceabilityInput(
  input: GeotechnicalShallowFoundationApplicationInput,
): ShallowFoundationServiceabilityAnalysisInput {
  const result: ShallowFoundationServiceabilityAnalysisInput = {};
  if (input.groundModel !== undefined) result.groundModel = input.groundModel;
  if (input.designSituation !== undefined) result.designSituation = input.designSituation;
  if (input.foundation !== undefined) result.foundation = input.foundation;
  if (input.actionState !== undefined) result.actionState = input.actionState;
  if ("method" in input && input.method !== undefined) result.method = input.method;
  if ("preexistingSurfaceSurcharge" in input && input.preexistingSurfaceSurcharge !== undefined) {
    result.preexistingSurfaceSurcharge = input.preexistingSurfaceSurcharge;
  }
  if (isServiceabilityCriteria(input.criteria)) result.criteria = input.criteria;
  if ("analysisSettings" in input && input.analysisSettings !== undefined) {
    result.analysisSettings = input.analysisSettings;
  }
  if (input.units !== undefined) result.units = input.units;
  return result;
}

export class GeotechnicalShallowFoundationApplication extends StructuralApplication {
  constructor() {
    super({
      id: "geotechnical-shallow-foundations",
      name: "Geotechnical Shallow Foundations",
      description:
        "Static ULS resistance and SLS immediate-movement analysis for shallow foundations connected to a GroundModel.",
      domain: "geotechnics",
      supportedCodes: ["method-neutral"],
      tags: [
        "ground-model",
        "shallow-foundation",
        "bearing-capacity",
        "sliding",
        "meyerhof",
        "vesic",
        "effective-area",
        "punch-through",
        "settlement",
        "rotation",
        "soil-stiffness",
      ],
      metadata: {
        maturity: "implemented-local",
        limitations: [
          "static ULS and immediate SLS only; no normative partial factors or serviceability limits are implicit",
          "horizontal foundation base and level adjacent ground",
          "hydrostatic-horizontal or phreatic-line groundwater only",
          "layered punch-through is limited to a strong layer over an undrained weak layer using the cited 2V:1H model",
          "SLS methods retain their distinct parameter types and fields of validity; time-dependent consolidation and creep are not implemented",
          "embedded-footing passive resistance, uplift and seismic effects are not implemented",
          "the RC footing application consumes assigned geotechnical resistances through a separate orchestrator",
        ],
      },
    });
  }

  override run(input: GeotechnicalShallowFoundationApplicationInput = {}): CalculationResult {
    const limitState = input.analysisType ?? input.designSituation?.limitState ?? "ULS";
    const analysis =
      limitState === "SLS"
        ? new ShallowFoundationServiceabilityAnalysis().analyze(toServiceabilityInput(input))
        : new ShallowFoundationUltimateLimitStateAnalysis().analyze(toUlsInput(input));
    return new CalculationResult({
      applicationId: this.id,
      status: analysis.status,
      summary: analysis.summary,
      outputs: analysis.outputs,
      warnings: analysis.warnings,
      assumptions: analysis.assumptions,
      metadata: {
        domain: this.domain,
        ...analysis.metadata,
      },
    });
  }
}
