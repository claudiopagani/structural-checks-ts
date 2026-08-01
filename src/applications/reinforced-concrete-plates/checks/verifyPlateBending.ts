import type { VerificationCheck } from "../../../core/results/VerificationResult.js";
import type { ResultStatus } from "../../../core/results/resultStatus.js";
import type { UnitSystemInput } from "../../../domain/units/UnitSystem.js";
import { ReinforcedConcreteSectionModel } from "../../reinforced-concrete-sections/models/ReinforcedConcreteSectionModel.js";
import { ReinforcedConcreteSectionVerification } from "../../reinforced-concrete-sections/checks/ReinforcedConcreteSectionVerification.js";
import type { ReinforcedConcretePlateModel } from "../ReinforcedConcretePlateModel.js";
import type { TransformedRcPlateState } from "../types.js";
import { createPlateStripSection } from "../sections/createPlateStripSection.js";
import { enrichPlateCheck } from "./plateCheckUtils.js";

const INTERNAL_UNITS = Object.freeze({
  force: "N",
  length: "mm",
}) satisfies UnitSystemInput;
const METHOD = "wood-armer-equivalent-strip-rc-uls-uniaxial-fiber-solver";

export interface PlateBendingVerification {
  id: string;
  stateId: string;
  direction: "x" | "y";
  face: "bottom" | "top";
  analysisType: string;
  combinationType: string | null;
  method: string;
  mEd: number;
  mRd: unknown;
  demand: unknown;
  capacity: unknown;
  utilizationRatio: number | null | undefined;
  governingReinforcement: string;
  neutralAxisDepth: unknown;
  failureMode: unknown;
  concreteStripCount: unknown;
  concreteDiscretization: string;
  ultimateStrains: unknown;
  strainField: unknown;
  status: ResultStatus;
  check: VerificationCheck;
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

export function verifyPlateBending({
  model,
  transformedState,
}: {
  model?: ReinforcedConcretePlateModel;
  transformedState?: TransformedRcPlateState;
} = {}): PlateBendingVerification[] {
  if (!model || !transformedState) {
    throw new Error("verifyPlateBending requires a plate model and transformed state.");
  }

  const results: PlateBendingVerification[] = [];

  for (const woodArmerMoment of transformedState.woodArmer.moments) {
    const { direction, face, value } = woodArmerMoment;
    const strip = createPlateStripSection({ model, direction });
    const mEd = value * model.geometry.unitWidth;
    const sectionModel = new ReinforcedConcreteSectionModel({
      id: `${model.id}-${transformedState.id}-${face}-${direction}-uls`,
      section: strip.section,
      materials: model.materials,
      analysisType: "uls-uniaxial-resistance",
      analysisSettings: {
        compressedEdge: face === "bottom" ? "top" : "bottom",
      },
      mesh: plateStripMesh(model),
      solver: model.analysis.solver,
      actions: { nEd: 0, mEd },
      units: INTERNAL_UNITS,
    });
    const sectionResult = new ReinforcedConcreteSectionVerification().verify(sectionModel);
    const outputs = sectionResult.outputs;
    const baseCheck = sectionResult.checks[0] ?? {
      id: "uls-uniaxial-bending",
      description: "Uniaxial plate-strip bending resistance at NEd = 0",
      demand: Math.abs(mEd),
      capacity: sectionResult.capacity,
      utilizationRatio: sectionResult.utilizationRatio,
      ok: sectionResult.status === "ok",
    };
    const check = enrichPlateCheck(baseCheck, {
      id: `rc-plate-uls-bending-${transformedState.id}-${face}-${direction}`,
      direction,
      face,
      analysisType: model.analysis.type,
      combinationType: transformedState.combinationType,
      stateId: transformedState.id,
      method: METHOD,
    });

    results.push({
      id: woodArmerMoment.id,
      stateId: transformedState.id,
      direction,
      face,
      analysisType: model.analysis.type,
      combinationType: transformedState.combinationType,
      method: METHOD,
      mEd,
      mRd: outputs.MxRd,
      demand: check.demand,
      capacity: check.capacity,
      utilizationRatio: check.utilizationRatio,
      governingReinforcement: `${face}-${direction}`,
      neutralAxisDepth: outputs.neutralAxisDepth,
      failureMode: outputs.failureMode,
      concreteStripCount: outputs.fiberCount,
      concreteDiscretization: "uniaxial-strips",
      ultimateStrains: outputs.extremes,
      strainField: outputs.strainField,
      status: sectionResult.status,
      check,
      warnings: sectionResult.warnings.map(String),
      assumptions: sectionResult.assumptions.map(String),
    });
  }

  return results;
}
