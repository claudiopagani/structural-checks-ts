import type { VerificationCheck } from "../../../core/results/VerificationResult.js";
import { isFinitePositive, round } from "../../reinforced-concrete-sections/shared/rcCommon.js";
import { withNormativeReferences } from "../../../norms/normativeReference.js";
import { EN1992_RC_EXTERNAL_REFERENCES } from "../../../norms/en1992/normativeReferences.js";
import {
  CIRC2019_RC_REFERENCES,
  NTC2018_RC_CHAPTER_4_REFERENCES,
} from "../../../norms/ntc2018/normativeReferences.js";

export type SlendernessSystem =
  | "simple_span"
  | "continuous_end_span"
  | "continuous_internal_span"
  | "flat_slab"
  | "cantilever";
export type SlendernessStressLevel = "high" | "low" | "interpolated-from-rho-l";

interface SlendernessLimits {
  k: number;
  high: number;
  low: number;
}

export interface DeflectionServiceabilityInput extends Record<string, unknown> {
  deflection?: {
    slendernessSystem?: SlendernessSystem;
    slendernessStressLevel?: "high" | "low";
    reinforcementRatio?: number | null;
  };
  slendernessSystem?: SlendernessSystem;
  slendernessStressLevel?: "high" | "low";
  reinforcementRatio?: number | null;
}

export interface SlendernessSectionInput {
  height?: number;
  concreteSection?: {
    height?: number;
  };
}

export interface SlendernessCheckInput {
  span?: number | null;
  section?: SlendernessSectionInput;
  serviceability?: DeflectionServiceabilityInput;
}

const SLENDERNESS_LIMITS: Readonly<Record<SlendernessSystem, SlendernessLimits>> = Object.freeze({
  simple_span: { k: 1, high: 14, low: 20 },
  continuous_end_span: { k: 1.3, high: 18, low: 26 },
  continuous_internal_span: { k: 1.5, high: 20, low: 30 },
  flat_slab: { k: 1.2, high: 17, low: 24 },
  cantilever: { k: 0.4, high: 6, low: 8 },
});

export const FLAT_SLAB_REINFORCEMENT_RATIO_LIMITS = Object.freeze({
  low: 0.005,
  high: 0.015,
});

function flatSlabLimitFromReinforcementRatio({
  ratio,
  limits,
}: {
  ratio: number;
  limits: SlendernessLimits;
}): {
  limit: number;
  stressLevel: SlendernessStressLevel;
  interpolationFactor: number;
} {
  const lowRatio = FLAT_SLAB_REINFORCEMENT_RATIO_LIMITS.low;
  const highRatio = FLAT_SLAB_REINFORCEMENT_RATIO_LIMITS.high;

  if (ratio <= lowRatio) {
    return { limit: limits.low, stressLevel: "low", interpolationFactor: 0 };
  }

  if (ratio >= highRatio) {
    return { limit: limits.high, stressLevel: "high", interpolationFactor: 1 };
  }

  const interpolationFactor = (ratio - lowRatio) / (highRatio - lowRatio);

  return {
    limit: limits.low + interpolationFactor * (limits.high - limits.low),
    stressLevel: "interpolated-from-rho-l",
    interpolationFactor,
  };
}

export function deflectionUtilizationCheck({
  demand,
  capacity,
  metadata,
}: {
  demand: number;
  capacity: number;
  metadata?: Record<string, unknown>;
}): VerificationCheck {
  const utilizationRatio = isFinitePositive(capacity) ? demand / capacity : null;

  return {
    id: "rc-sle-deflection-curvature",
    description: "RC deflection from curvature integration",
    demand: round(demand),
    capacity: round(capacity),
    utilizationRatio: round(utilizationRatio),
    ok: Number.isFinite(utilizationRatio) && (utilizationRatio as number) <= 1,
    metadata: withNormativeReferences(metadata, [
      NTC2018_RC_CHAPTER_4_REFERENCES.deflection,
      EN1992_RC_EXTERNAL_REFERENCES.deflection,
    ]),
  };
}

export function slendernessCheck({
  span,
  section = {},
  serviceability = {},
}: SlendernessCheckInput = {}): VerificationCheck | null {
  const system =
    serviceability.deflection?.slendernessSystem ??
    serviceability.slendernessSystem ??
    "simple_span";
  let stressLevel: SlendernessStressLevel =
    serviceability.deflection?.slendernessStressLevel ??
    serviceability.slendernessStressLevel ??
    "low";
  const limits = SLENDERNESS_LIMITS[system] ?? SLENDERNESS_LIMITS.simple_span;
  const reinforcementRatio =
    serviceability.deflection?.reinforcementRatio ?? serviceability.reinforcementRatio ?? null;
  let limit = limits[stressLevel === "high" ? "high" : "low"];
  let interpolationFactor: number | null = null;

  if (
    system === "flat_slab" &&
    Number.isFinite(reinforcementRatio) &&
    (reinforcementRatio as number) >= 0
  ) {
    const resolved = flatSlabLimitFromReinforcementRatio({
      ratio: reinforcementRatio as number,
      limits,
    });
    limit = resolved.limit;
    stressLevel = resolved.stressLevel;
    interpolationFactor = resolved.interpolationFactor;
  }
  const height = section.concreteSection?.height ?? section.height;

  if (!isFinitePositive(span) || !isFinitePositive(height)) {
    return null;
  }

  const demand = span / height;
  const utilizationRatio = demand / limit;

  return {
    id: "rc-sle-deflection-slenderness",
    description: "Simplified RC span-depth deflection screening",
    demand: round(demand),
    capacity: round(limit),
    utilizationRatio: round(utilizationRatio),
    ok: utilizationRatio <= 1,
    metadata: withNormativeReferences(
      {
        method: "circolare-ntc2018-c4.1.i-screening",
        system,
        stressLevel,
        k: limits.k,
        span: round(span),
        sectionHeight: round(height),
        slendernessLimit: limit,
        reinforcementRatio,
        reinforcementRatioPercent: Number.isFinite(reinforcementRatio)
          ? round(100 * (reinforcementRatio as number))
          : null,
        reinforcementRatioLow: FLAT_SLAB_REINFORCEMENT_RATIO_LIMITS.low,
        reinforcementRatioHigh: FLAT_SLAB_REINFORCEMENT_RATIO_LIMITS.high,
        interpolationFactor: round(interpolationFactor),
      },
      [
        NTC2018_RC_CHAPTER_4_REFERENCES.deflection,
        CIRC2019_RC_REFERENCES.simplifiedDeflectionSlenderness,
      ],
    ),
  };
}

export { deflectionUtilizationCheck as utilizationCheck };
