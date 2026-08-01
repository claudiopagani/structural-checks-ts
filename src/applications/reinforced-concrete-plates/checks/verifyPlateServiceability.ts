import type { VerificationCheck } from "../../../core/results/VerificationResult.js";
import type { ResultStatus } from "../../../core/results/resultStatus.js";
import { ReinforcedConcreteServiceabilityVerification } from "../../reinforced-concrete-sections/checks/ReinforcedConcreteServiceabilityVerification.js";
import type { ReinforcedConcretePlateModel } from "../ReinforcedConcretePlateModel.js";
import type { TransformedRcPlateState } from "../types.js";
import { createPlateStripSection } from "../sections/createPlateStripSection.js";
import { enrichPlateCheck } from "./plateCheckUtils.js";

const METHOD = "wood-armer-equivalent-strip-ntc2018-sle-serviceability";

export interface PlateServiceabilityVerification {
  id: string;
  stateId: string;
  direction: "x" | "y";
  face: "bottom" | "top";
  analysisType: string;
  combinationType: string | null;
  method: string;
  terminology: string;
  mEd: number;
  status: ResultStatus;
  utilizationRatio: number | null;
  concreteCompression: unknown;
  steelStress: unknown;
  crackWidthClass: unknown;
  crackControlGroupId: unknown;
  tensileBars: unknown;
  strainField: unknown;
  concreteStripCount: unknown;
  concreteDiscretization: string;
  checks: VerificationCheck[];
  serviceStressChecks: VerificationCheck[];
  crackingChecks: VerificationCheck[];
  warnings: string[];
  assumptions: string[];
}

function plateStripMesh(model: ReinforcedConcretePlateModel) {
  return {
    targetFiberCount: model.analysis.mesh.targetFiberCount ?? 40,
    ...model.analysis.mesh,
    method: "uniaxial-strips" as const,
  };
}

export function verifyPlateServiceability({
  model,
  transformedState,
}: {
  model?: ReinforcedConcretePlateModel;
  transformedState?: TransformedRcPlateState;
} = {}): PlateServiceabilityVerification[] {
  if (!model || !transformedState) {
    throw new Error("verifyPlateServiceability requires a plate model and transformed state.");
  }

  const results: PlateServiceabilityVerification[] = [];

  for (const woodArmerMoment of transformedState.woodArmer.moments) {
    const { direction, face, value } = woodArmerMoment;
    const strip = createPlateStripSection({ model, direction });
    const mEd = value * model.geometry.unitWidth;
    const mesh = plateStripMesh(model);
    const serviceResult = new ReinforcedConcreteServiceabilityVerification({
      serviceability: model.analysis.serviceability,
      mesh,
      solver: model.analysis.solver,
    }).verify({
      section: strip.section,
      concreteMaterial: model.materials.concreteMaterial,
      reinforcementMaterial: model.materials.reinforcementMaterial,
      actions: { nEd: 0, mEd },
      combinationType: transformedState.combinationType ?? "SLE_RARE",
      serviceability: model.analysis.serviceability,
      mesh,
      solver: model.analysis.solver,
    });
    const checks = serviceResult.checks.map((check, index) =>
      enrichPlateCheck(check, {
        id: `rc-plate-sle-${transformedState.id}-${face}-${direction}-${String(check.id)}-${index + 1}`,
        direction,
        face,
        analysisType: model.analysis.type,
        combinationType: transformedState.combinationType,
        stateId: transformedState.id,
        method: METHOD,
      }),
    );
    const outputs = serviceResult.outputs;
    results.push({
      id: woodArmerMoment.id,
      stateId: transformedState.id,
      direction,
      face,
      analysisType: model.analysis.type,
      combinationType: transformedState.combinationType,
      method: METHOD,
      terminology: "Tensione nella striscia equivalente Wood-Armer",
      mEd,
      status: serviceResult.status,
      utilizationRatio: serviceResult.utilizationRatio,
      concreteCompression: outputs.concreteCompression,
      steelStress: outputs.steelStress,
      crackWidthClass: outputs.crackWidthClass,
      crackControlGroupId: outputs.crackControlGroupId,
      tensileBars: outputs.tensileBars,
      strainField: outputs.strainField,
      concreteStripCount: outputs.fiberCount,
      concreteDiscretization: "uniaxial-strips",
      checks,
      serviceStressChecks: checks.filter((check) => !String(check.id).includes("rc-sle-crack")),
      crackingChecks: checks.filter((check) => String(check.id).includes("rc-sle-crack")),
      warnings: serviceResult.warnings.map(String),
      assumptions: serviceResult.assumptions.map(String),
    });
  }

  return results;
}
