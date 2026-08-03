// Mechanical TypeScript migration from strutture-js 6f33baead8b88166c4b2cf94af41763412e3c751; source path: src/applications/timber-beams/checks/TimberLateralTorsionalStability.js.

import { RESULT_STATUS } from "../../../core/results/resultStatus.js";
import { clamp, roundTo as round } from "../../../domain/math/arrayLinearAlgebra.js";
import type {
  TimberBeamMaterialLike,
  TimberBeamSectionLike,
} from "../../../domain/beams/TimberBeamSectionProvider.js";

type JsonRecord = Record<string, unknown>;
const DEFAULT_E005_RATIO = 2 / 3;
const FORCE_TOLERANCE = 1e-9;

export interface TimberLateralTorsionalStabilityInput {
  section?: TimberBeamSectionLike | null;
  material?: TimberBeamMaterialLike | null;
  myEd?: number;
  mzEd?: number;
  unbracedLength?: number | null;
  fmD?: number | null;
  fmK?: number | null;
  kcrit?: number | null;
  sigmaMcrit?: number | null;
  e0_05?: number | null;
  metadata?: JsonRecord;
}

export interface TimberLateralTorsionalCheck extends JsonRecord {
  id: string;
  description: string;
  demand: unknown;
  capacity: number;
  utilizationRatio: unknown;
  ok: boolean;
  metadata: JsonRecord;
}

export interface TimberLateralTorsionalStabilityResult {
  status: string;
  check: TimberLateralTorsionalCheck | null;
  warnings: string[];
  metadata?: JsonRecord;
}

function isFinitePositive(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function hasSignificantAction(value: unknown, tolerance = FORCE_TOLERANCE): value is number {
  return typeof value === "number" && Number.isFinite(value) && Math.abs(value) > tolerance;
}

function recordProperty(value: unknown, key: string): unknown {
  return value !== null && (typeof value === "object" || typeof value === "function")
    ? Reflect.get(value, key)
    : undefined;
}

function metadataProperty(value: unknown, key: string): unknown {
  return recordProperty(recordProperty(value, "metadata"), key);
}

function roundValue(value: unknown): unknown {
  return typeof value === "number" ? round(value) : value;
}

function numberOrNullish(value: unknown): number | null | undefined {
  if (value === null || value === undefined) {
    return value;
  }

  return typeof value === "number" ? value : undefined;
}

function sourceString(value: unknown): string {
  return Reflect.apply(String, undefined, [value]);
}

function sectionShape(section: TimberBeamSectionLike | null | undefined): string {
  return sourceString(
    recordProperty(section, "metadata")
      ? (recordProperty(recordProperty(section, "metadata"), "shape") ??
          recordProperty(section, "shape") ??
          "")
      : (recordProperty(section, "shape") ?? ""),
  )
    .trim()
    .toLowerCase();
}

function resolveE005(
  material: TimberBeamMaterialLike | null | undefined,
  override: number | null | undefined,
): { value: number | null; source: unknown } {
  if (isFinitePositive(override)) {
    return { value: override, source: "user-provided" };
  }

  const materialValue =
    recordProperty(material, "e0_05") ??
    recordProperty(material, "e005") ??
    recordProperty(material, "E0_05") ??
    metadataProperty(material, "e0_05") ??
    metadataProperty(material, "e005") ??
    null;

  if (isFinitePositive(materialValue)) {
    return {
      value: materialValue,
      source: metadataProperty(material, "e0_05Source") ?? "material",
    };
  }

  const elasticModulus = recordProperty(material, "elasticModulus");
  if (isFinitePositive(elasticModulus)) {
    return {
      value: elasticModulus * DEFAULT_E005_RATIO,
      source: "mean-elastic-modulus-ratio-2/3",
    };
  }

  return { value: null, source: "unavailable" };
}

export function calculateTimberRectangularCriticalBendingStress({
  width,
  height,
  effectiveLength,
  e0_05,
}: {
  width?: number | null | undefined;
  height?: number | null | undefined;
  effectiveLength?: number | null | undefined;
  e0_05?: number | null | undefined;
} = {}): number | null {
  if (
    !isFinitePositive(width) ||
    !isFinitePositive(height) ||
    !isFinitePositive(effectiveLength) ||
    !isFinitePositive(e0_05)
  ) {
    return null;
  }

  return (0.78 * width ** 2 * e0_05) / (height * effectiveLength);
}

export function calculateTimberLateralBucklingReduction(
  relativeSlenderness?: number | null,
): number | null {
  if (!isFinitePositive(relativeSlenderness)) {
    return null;
  }

  if (relativeSlenderness <= 0.75) {
    return 1;
  }

  if (relativeSlenderness <= 1.4) {
    return 1.56 - 0.75 * relativeSlenderness;
  }

  return 1 / relativeSlenderness ** 2;
}

export function verifyTimberLateralTorsionalStability({
  section,
  material,
  myEd = 0,
  mzEd = 0,
  unbracedLength,
  fmD,
  fmK = numberOrNullish(recordProperty(material, "fmK")),
  kcrit = null,
  sigmaMcrit = null,
  e0_05 = null,
  metadata = {},
}: TimberLateralTorsionalStabilityInput = {}): TimberLateralTorsionalStabilityResult {
  const warnings: string[] = [];
  const wy = recordProperty(section, "elasticSectionModulusY");
  const wz = recordProperty(section, "elasticSectionModulusZ");

  if (!isFinitePositive(fmD) || !isFinitePositive(fmK)) {
    return {
      status: RESULT_STATUS.NOT_SUPPORTED,
      check: null,
      warnings: [
        "Timber lateral-torsional stability requires design and characteristic bending strengths fmD/fmK.",
      ],
    };
  }

  if (!isFinitePositive(wy) || !isFinitePositive(wz)) {
    return {
      status: RESULT_STATUS.NOT_SUPPORTED,
      check: null,
      warnings: ["Timber lateral-torsional stability requires elastic section moduli Wy and Wz."],
    };
  }

  let resolvedKcrit: number | null;
  let resolvedSigmaMcrit: number | null = null;
  let relativeSlenderness: number | null = null;
  let criticalStressSource: unknown = null;
  let e005: number | null = null;
  let e005Source: unknown = null;

  if (isFinitePositive(kcrit)) {
    resolvedKcrit = clamp(kcrit, 0, 1);
    criticalStressSource = "user-provided-kcrit";

    if (kcrit > 1) {
      warnings.push("User-provided timber kcrit was greater than 1 and has been capped to 1.");
    }
  } else {
    if (isFinitePositive(sigmaMcrit)) {
      resolvedSigmaMcrit = sigmaMcrit;
      criticalStressSource = "user-provided-sigma-m-crit";
    } else if (sectionShape(section) === "rectangular") {
      const resolvedE005 = resolveE005(material, e0_05);
      e005 = resolvedE005.value;
      e005Source = resolvedE005.source;
      resolvedSigmaMcrit = calculateTimberRectangularCriticalBendingStress({
        width: numberOrNullish(recordProperty(section, "width")),
        height: numberOrNullish(recordProperty(section, "height")),
        effectiveLength: unbracedLength,
        e0_05: e005,
      });
      criticalStressSource = "ec5-rectangular-simplified";
    }

    if (!isFinitePositive(resolvedSigmaMcrit)) {
      return {
        status: RESULT_STATUS.NOT_SUPPORTED,
        check: null,
        warnings: [
          "Timber lateral-torsional stability requires kcrit, sigmaMcrit, or a rectangular section with width, height, effective unbraced length and E0,05.",
        ],
        metadata: {
          shape: sectionShape(section),
          unbracedLength: roundValue(unbracedLength),
          e0_05: roundValue(e005),
          e0_05Source: e005Source,
        },
      };
    }

    relativeSlenderness = Math.sqrt(fmK / resolvedSigmaMcrit);
    resolvedKcrit = calculateTimberLateralBucklingReduction(relativeSlenderness);
  }

  if (!isFinitePositive(resolvedKcrit)) {
    return {
      status: RESULT_STATUS.NOT_SUPPORTED,
      check: null,
      warnings: ["Timber lateral-torsional stability could not compute a positive kcrit."],
    };
  }

  const capacityY = resolvedKcrit * fmD * wy;
  const capacityZ = fmD * wz;
  const utilizationRatioY = hasSignificantAction(myEd) ? Math.abs(myEd) / capacityY : 0;
  const utilizationRatioZ = hasSignificantAction(mzEd) ? Math.abs(mzEd) / capacityZ : 0;
  const utilizationRatio = utilizationRatioY + utilizationRatioZ;

  return {
    status: utilizationRatio <= 1 ? RESULT_STATUS.OK : RESULT_STATUS.NOT_VERIFIED,
    check: {
      id: "timber-lateral-torsional-stability",
      description: "Timber lateral-torsional stability with weak-axis moment interaction",
      demand: round(utilizationRatio),
      capacity: 1,
      utilizationRatio: round(utilizationRatio),
      ok: utilizationRatio <= 1,
      metadata: {
        method: "ntc2018-ec5-timber-lateral-torsional-stability-mvp",
        criticalStressSource,
        e0_05: roundValue(e005),
        e0_05Source: e005Source,
        fmK: roundValue(fmK),
        fmD: roundValue(fmD),
        width: roundValue(recordProperty(section, "width")),
        height: roundValue(recordProperty(section, "height")),
        unbracedLength: roundValue(unbracedLength),
        sigmaMcrit: roundValue(resolvedSigmaMcrit),
        relativeSlenderness: roundValue(relativeSlenderness),
        kcrit: roundValue(resolvedKcrit),
        myEd: roundValue(myEd),
        mzEd: roundValue(mzEd),
        bendingCapacityY: roundValue(capacityY),
        bendingCapacityZ: roundValue(capacityZ),
        utilizationRatioY: roundValue(utilizationRatioY),
        utilizationRatioZ: roundValue(utilizationRatioZ),
        weakAxisMomentIncluded: hasSignificantAction(mzEd),
        ...metadata,
      },
    },
    warnings,
  };
}
