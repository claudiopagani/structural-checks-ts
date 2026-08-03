import { VerificationResult } from "../../../core/results/VerificationResult.js";
import { round } from "../../../core/results/checkUtils.js";
import { RESULT_STATUS } from "../../../core/results/resultStatus.js";
import type { VerificationCheck } from "../../../core/results/VerificationResult.js";
import type {
  NTC2018MasonryPierCompleteEvaluation,
  NTC2018MasonryPierCurvePoint,
  NTC2018MasonryPierEvaluation,
} from "../../../norms/ntc2018/masonry/evaluateNTC2018MasonryPier.js";
import { NTC2018MasonryPierModel } from "../models/NTC2018MasonryPierModel.js";

interface NTC2018MasonryPierAnalysisInput {
  model?: NTC2018MasonryPierModel | ConstructorParameters<typeof NTC2018MasonryPierModel>[0] | null;
  lateralDisplacement?: number | null;
}

function resolveModel(
  input: NTC2018MasonryPierModel | ConstructorParameters<typeof NTC2018MasonryPierModel>[0],
): NTC2018MasonryPierModel {
  return input instanceof NTC2018MasonryPierModel ? input : new NTC2018MasonryPierModel(input);
}

function roundCurve(
  curve: readonly NTC2018MasonryPierCurvePoint[],
): NTC2018MasonryPierCurvePoint[] {
  return curve.map((point) => ({
    ...point,
    displacement: round(point.displacement),
    force: round(point.force),
  }));
}

function isCompleteEvaluation(
  evaluation: NTC2018MasonryPierEvaluation,
): evaluation is NTC2018MasonryPierCompleteEvaluation {
  return evaluation.complete;
}

export class NTC2018MasonryPierAnalysis {
  public analyze({
    model,
    lateralDisplacement = null,
  }: NTC2018MasonryPierAnalysisInput = {}): VerificationResult {
    const resolvedModel = resolveModel(model ?? {});
    const evaluationInput =
      typeof lateralDisplacement === "number" && Number.isFinite(lateralDisplacement)
        ? { lateralDisplacement }
        : {};
    const evaluation = resolvedModel.evaluate(evaluationInput);
    const warnings: string[] = [];
    const assumptions = [
      "Compression is positive; tensile axial force does not increase friction and gives zero flexural resistance.",
      "The resistance is the exact minimum of flexure, bed-joint sliding and diagonal cracking; no compression-ratio switch selects the mechanism.",
      "The normative model is an elastic-perfectly-plastic monotonic envelope and does not reproduce cyclic degradation, pinching or residual deformation.",
      "For existing masonry, mean strength parameters are divided by the confidence factor; elastic moduli are not divided by it.",
    ];

    if (!isCompleteEvaluation(evaluation)) {
      const missingDescription = evaluation.missing
        .map((item) => `${item.mechanism}: ${item.parameters.join(", ")}`)
        .join("; ");
      warnings.push(
        `The strict normative envelope is incomplete because required inputs are missing (${missingDescription}).`,
      );

      return new VerificationResult({
        applicationId: "masonry-piers",
        status: RESULT_STATUS.NOT_IMPLEMENTED,
        summary:
          "The autonomous NTC 2018 masonry-pier model could not evaluate all three required resistance mechanisms.",
        checks: [
          {
            id: "ntc2018-masonry-pier-input-completeness",
            description: "All normative capacity and stiffness inputs are available",
            demand: null,
            capacity: null,
            utilizationRatio: null,
            ok: false,
            metadata: { missing: evaluation.missing },
          },
        ],
        outputs: { ...evaluation },
        warnings,
        assumptions,
        metadata: {
          code: "NTC2018-Circolare2019",
          modelId: resolvedModel.id,
          modelType: "normative-bilinear",
        },
      });
    }

    const displacementDemand =
      typeof lateralDisplacement === "number" && Number.isFinite(lateralDisplacement)
        ? Math.abs(lateralDisplacement)
        : typeof resolvedModel.normative.lateralDisplacement === "number" &&
            Number.isFinite(resolvedModel.normative.lateralDisplacement)
          ? Math.abs(resolvedModel.normative.lateralDisplacement)
          : null;
    const displacementCapacity = evaluation.deformation.ultimateDisplacement;
    const displacementRatio =
      typeof displacementDemand === "number" ? displacementDemand / displacementCapacity : null;
    const checks: VerificationCheck[] = [
      {
        id: "ntc2018-masonry-pier-bilinear-consistency",
        description: "Elastic yield displacement is below the normative ultimate displacement",
        demand: round(evaluation.yieldDisplacement),
        capacity: round(displacementCapacity),
        utilizationRatio: round(evaluation.yieldDisplacement / displacementCapacity),
        ok: evaluation.consistentBilinear,
      },
    ];

    if (typeof displacementDemand === "number") {
      checks.push({
        id: "ntc2018-masonry-pier-displacement-capacity",
        description: "SLC lateral displacement demand does not exceed capacity",
        demand: round(displacementDemand),
        capacity: round(displacementCapacity),
        utilizationRatio: round(displacementRatio),
        ok: typeof displacementRatio === "number" && displacementRatio <= 1,
      });
    }

    if (!evaluation.consistentBilinear) {
      warnings.push(
        "The elastic yield displacement is not below the normative ultimate displacement. No artificial stiffness or displacement cap was introduced.",
      );
    }

    const status = checks.every((check) => check.ok)
      ? RESULT_STATUS.OK
      : RESULT_STATUS.NOT_VERIFIED;

    return new VerificationResult({
      applicationId: "masonry-piers",
      status,
      summary:
        "Autonomous NTC 2018 / Circular 2019 bilinear capacity envelope for an in-plane masonry pier.",
      utilizationRatio: round(displacementRatio),
      demand: round(displacementDemand),
      capacity: round(displacementCapacity),
      checks,
      outputs: {
        ...evaluation,
        curve: roundCurve(evaluation.curve),
      },
      warnings,
      assumptions,
      metadata: {
        code: "NTC2018-Circolare2019",
        modelId: resolvedModel.id,
        modelType: "normative-bilinear",
        units: { ...resolvedModel.units },
      },
    });
  }
}
