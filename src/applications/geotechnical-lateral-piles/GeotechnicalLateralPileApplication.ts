import { StructuralApplication } from "../../core/applications/StructuralApplication.js";
import { CalculationResult } from "../../core/results/CalculationResult.js";
import {
  LateralPileBeamOnSpringsAnalysis,
  type LateralPileBeamOnSpringsAnalysisInput,
} from "../../domain/geotechnics/LateralPileBeamOnSpringsAnalysis.js";
import {
  LateralPileCapacityAnalysis,
  type LateralPileCapacityAnalysisInput,
} from "../../domain/geotechnics/LateralPileCapacityAnalysis.js";
import type {
  DeepFoundationModel,
  DeepFoundationModelInput,
} from "../../domain/geotechnics/DeepFoundationModel.js";
import type {
  GeotechnicalDesignSituation,
  GeotechnicalDesignSituationInput,
} from "../../domain/geotechnics/GeotechnicalDesignSituation.js";
import type { GroundModel, GroundModelInput } from "../../domain/geotechnics/GroundModel.js";
import type {
  LateralPileLoadScenario,
  LateralPileLoadScenarioOptions,
} from "../../domain/geotechnics/LateralPileLoadScenario.js";
import type {
  LateralPileResponseScenario,
  LateralPileResponseScenarioOptions,
} from "../../domain/geotechnics/LateralPileResponseScenario.js";
import type { UnitSystemInput } from "../../domain/units/UnitSystem.js";

type ApplicationScenario =
  | LateralPileLoadScenario
  | LateralPileLoadScenarioOptions
  | LateralPileResponseScenario
  | LateralPileResponseScenarioOptions;

export interface GeotechnicalLateralPileApplicationInput {
  groundModel?: GroundModel | GroundModelInput | null;
  designSituation?: GeotechnicalDesignSituation | GeotechnicalDesignSituationInput | null;
  pile?: DeepFoundationModel | DeepFoundationModelInput | null;
  scenario?: ApplicationScenario | null;
  profileId?: string | null;
  units?: UnitSystemInput | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function usesBeamOnSpringsResponse(input: GeotechnicalLateralPileApplicationInput): boolean {
  const scenario = input.scenario;
  if (!isRecord(scenario)) {
    return false;
  }
  return scenario.method === "beam-on-py-springs" || scenario.soilResponse != null;
}

function isBeamOnSpringsScenario(
  value: ApplicationScenario,
): value is LateralPileResponseScenario | LateralPileResponseScenarioOptions {
  if (!isRecord(value)) {
    return false;
  }
  return value.method === "beam-on-py-springs" || value.soilResponse != null;
}

function isCapacityScenario(
  value: ApplicationScenario,
): value is LateralPileLoadScenario | LateralPileLoadScenarioOptions {
  return !isBeamOnSpringsScenario(value);
}

function toBeamOnSpringsInput(
  input: GeotechnicalLateralPileApplicationInput,
): LateralPileBeamOnSpringsAnalysisInput {
  const result: LateralPileBeamOnSpringsAnalysisInput = {};
  if (input.groundModel !== undefined) result.groundModel = input.groundModel;
  if (input.designSituation !== undefined) result.designSituation = input.designSituation;
  if (input.pile !== undefined) result.pile = input.pile;
  if (input.profileId !== undefined) result.profileId = input.profileId;
  if (input.units !== undefined) result.units = input.units;
  if (input.scenario === null) {
    result.scenario = null;
  } else if (input.scenario !== undefined && isBeamOnSpringsScenario(input.scenario)) {
    result.scenario = input.scenario;
  }
  return result;
}

function toCapacityInput(
  input: GeotechnicalLateralPileApplicationInput,
): LateralPileCapacityAnalysisInput {
  const result: LateralPileCapacityAnalysisInput = {};
  if (input.groundModel !== undefined && input.groundModel !== null) {
    result.groundModel = input.groundModel;
  }
  if (input.designSituation !== undefined && input.designSituation !== null) {
    result.designSituation = input.designSituation;
  }
  if (input.pile !== undefined && input.pile !== null) {
    result.pile = input.pile;
  }
  if (
    input.scenario !== undefined &&
    input.scenario !== null &&
    isCapacityScenario(input.scenario)
  ) {
    result.scenario = input.scenario;
  }
  if (input.profileId !== undefined) result.profileId = input.profileId;
  if (input.units !== undefined) result.units = input.units;
  return result;
}

export class GeotechnicalLateralPileApplication extends StructuralApplication {
  constructor() {
    super({
      id: "geotechnical-lateral-piles",
      name: "Geotechnical Lateral Piles",
      description:
        "Lateral capacity and static nonlinear beam-on-p-y-springs response of single deep-foundation elements.",
      domain: "geotechnics",
      supportedCodes: ["method-neutral", "broms-short-free-head", "beam-on-py-springs"],
      tags: [
        "ground-model",
        "deep-foundation",
        "pile",
        "micropile",
        "lateral-capacity",
        "broms",
        "p-y",
        "nonlinear-springs",
        "soil-structure-interaction",
      ],
      metadata: {
        maturity: "implemented-local",
        limitations: [
          "the implemented Broms branch is restricted to static ULS of a single short rigid uniform pile, free to rotate at groundline",
          "the complete embedment must lie in one homogeneous cohesive-undrained or cohesionless-drained layer",
          "the cohesionless branch requires either dry embedment or groundwater at/above ground or at/below the toe",
          "Broms is not used for displacement, stiffness, long/flexible piles or fixed-head piles",
          "the p-y solver uses assigned static-monotonic curves and constant Euler-Bernoulli flexural rigidity",
          "cyclic/seismic response, pile groups, lateral ground movement, axial geometric stiffness and structural pile verification are not implemented",
        ],
      },
    });
  }

  override run(input: GeotechnicalLateralPileApplicationInput = {}): CalculationResult {
    const analysis = usesBeamOnSpringsResponse(input)
      ? new LateralPileBeamOnSpringsAnalysis().analyze(toBeamOnSpringsInput(input))
      : new LateralPileCapacityAnalysis().analyze(toCapacityInput(input));
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
