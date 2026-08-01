import type { VerificationCheck } from "../../../core/results/VerificationResult.js";
import { slendernessCheck } from "../../rc-cracked-deflection/analysis/DeflectionChecks.js";
import type { ReinforcedConcretePlateModel } from "../ReinforcedConcretePlateModel.js";
import type { RcPlateDirection, RcPlateFace, TransformedRcPlateState } from "../types.js";
import { enrichPlateCheck } from "./plateCheckUtils.js";

const METHOD = "circolare-ntc2018-c4.1.i-flat-slab-face-rho-l-interpolation";

interface ReinforcementRatio {
  area: number;
  effectiveDepth: number;
  value: number;
}

export interface PlateFaceSlendernessVerification {
  direction: RcPlateDirection;
  face: RcPlateFace;
  stateId: string;
  combinationType: string | null;
  woodArmerMoment: number;
  stripMoment: number;
  reinforcementArea: number;
  effectiveDepth: number;
  reinforcementRatio: number;
  reinforcementRatioPercent: number;
  stressLevel: unknown;
  demand: number;
  capacity: number;
  utilizationRatio: number;
  status: "ok" | "not-verified";
  check: VerificationCheck;
}

export interface PlateSlendernessVerification {
  direction: RcPlateDirection;
  face: RcPlateFace;
  governingFace: RcPlateFace;
  stateId: string;
  analysisType: string;
  combinationType: string | null;
  method: string;
  name: string;
  span: number;
  referenceHeight: number;
  structuralSystem: "flat_slab";
  stressLevel: unknown;
  reinforcementRatio: number;
  reinforcementRatioPercent: number;
  demand: number;
  capacity: number;
  utilizationRatio: number;
  status: "ok" | "not-verified";
  faceChecks: PlateFaceSlendernessVerification[];
}

function reinforcementRatio(
  model: ReinforcedConcretePlateModel,
  direction: RcPlateDirection,
  face: RcPlateFace,
): ReinforcementRatio {
  const layer = model.reinforcement[face][direction];
  const effectiveDepth = face === "bottom" ? model.geometry.thickness - layer.axis : layer.axis;

  return {
    area: layer.area,
    effectiveDepth,
    value: layer.area / (model.geometry.unitWidth * effectiveDepth),
  };
}

function numericCheckValue(check: VerificationCheck, key: string): number {
  const value = check[key];
  if (!Number.isFinite(value)) {
    throw new Error(`Plate slenderness check did not produce a finite ${key}.`);
  }
  return value as number;
}

function faceSlendernessCheck({
  model,
  transformedState,
  direction,
  face,
}: {
  model: ReinforcedConcretePlateModel;
  transformedState: TransformedRcPlateState;
  direction: RcPlateDirection;
  face: RcPlateFace;
}): PlateFaceSlendernessVerification {
  const span = model.analysis.deflection[`span${direction.toUpperCase() as "X" | "Y"}`];
  const ratio = reinforcementRatio(model, direction, face);
  const woodArmerMoment = transformedState.woodArmer.moments.find(
    (moment) => moment.direction === direction && moment.face === face,
  );
  const base = slendernessCheck({
    span,
    section: { height: model.geometry.thickness },
    serviceability: {
      deflection: {
        slendernessSystem: "flat_slab",
        reinforcementRatio: ratio.value,
      },
    },
  });
  if (base == null) {
    throw new Error("Plate slenderness check requires positive span and thickness values.");
  }
  const check = enrichPlateCheck(
    {
      ...base,
      description: "Controllo semplificato di deformabilità mediante snellezza",
    },
    {
      id: `rc-plate-sle-slenderness-${transformedState.id}-${face}-${direction}`,
      direction,
      face,
      analysisType: model.analysis.type,
      combinationType: transformedState.combinationType,
      stateId: transformedState.id,
      method: METHOD,
    },
  );
  const metadata = check.metadata ?? {};

  return {
    direction,
    face,
    stateId: transformedState.id,
    combinationType: transformedState.combinationType,
    woodArmerMoment: woodArmerMoment?.value ?? 0,
    stripMoment: (woodArmerMoment?.value ?? 0) * model.geometry.unitWidth,
    reinforcementArea: ratio.area,
    effectiveDepth: ratio.effectiveDepth,
    reinforcementRatio: ratio.value,
    reinforcementRatioPercent: 100 * ratio.value,
    stressLevel: metadata.stressLevel,
    demand: numericCheckValue(check, "demand"),
    capacity: numericCheckValue(check, "capacity"),
    utilizationRatio: numericCheckValue(check, "utilizationRatio"),
    status: check.ok ? "ok" : "not-verified",
    check,
  };
}

function selectGoverningFace(
  faceChecks: PlateFaceSlendernessVerification[],
): PlateFaceSlendernessVerification {
  const first = faceChecks[0];
  if (!first) {
    throw new Error("At least one plate face check is required.");
  }

  return faceChecks.slice(1).reduce((selected, candidate) => {
    if (candidate.capacity < selected.capacity) {
      return candidate;
    }

    if (
      candidate.capacity === selected.capacity &&
      Math.abs(candidate.woodArmerMoment) > Math.abs(selected.woodArmerMoment)
    ) {
      return candidate;
    }

    return selected;
  }, first);
}

export function verifyPlateSlenderness({
  model,
  transformedState,
}: {
  model?: ReinforcedConcretePlateModel;
  transformedState?: TransformedRcPlateState;
} = {}): PlateSlendernessVerification[] {
  if (!model || !transformedState) {
    throw new Error("verifyPlateSlenderness requires a plate model and transformed state.");
  }

  return (["x", "y"] as const).map((direction) => {
    const faceChecks = (["bottom", "top"] as const).map((face) =>
      faceSlendernessCheck({ model, transformedState, direction, face }),
    );
    const governing = selectGoverningFace(faceChecks);
    const span = model.analysis.deflection[`span${direction.toUpperCase() as "X" | "Y"}`];
    if (span == null) {
      throw new Error(`Plate slenderness direction ${direction} requires a span.`);
    }

    return {
      direction,
      face: governing.face,
      governingFace: governing.face,
      stateId: transformedState.id,
      analysisType: model.analysis.type,
      combinationType: transformedState.combinationType,
      method: METHOD,
      name: "Controllo semplificato di deformabilità mediante snellezza",
      span,
      referenceHeight: model.geometry.thickness,
      structuralSystem: "flat_slab",
      stressLevel: governing.stressLevel,
      reinforcementRatio: governing.reinforcementRatio,
      reinforcementRatioPercent: governing.reinforcementRatioPercent,
      demand: governing.demand,
      capacity: governing.capacity,
      utilizationRatio: governing.utilizationRatio,
      status: governing.status,
      faceChecks,
    };
  });
}
