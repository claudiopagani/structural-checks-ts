// Mechanical TypeScript migration from strutture-js 6f33baead8b88166c4b2cf94af41763412e3c751.

import type { FemDirection } from "../../domain/fem/contracts/FemContractTypes.js";

type JsonRecord = Record<string, unknown>;

interface ModalMassInput {
  readonly procedureId?: string;
  readonly modeNumber: number;
  readonly participatingMassRatios?: Readonly<Record<string, number>>;
}

interface AccidentalEccentricityInput {
  readonly direction: string;
  readonly storeyId?: string;
  readonly offset: number;
}

function isModalMassArray(value: unknown): value is readonly ModalMassInput[] {
  return Array.isArray(value);
}

function isEccentricityArray(value: unknown): value is readonly AccidentalEccentricityInput[] {
  return Array.isArray(value);
}

function isStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value);
}

export interface Ntc2018ModalMassParticipationInput {
  readonly modes?: readonly ModalMassInput[] | null;
  readonly directions?: readonly string[];
}

export interface Ntc2018AccidentalEccentricityInput {
  readonly eccentricities?: readonly AccidentalEccentricityInput[] | null | undefined;
  readonly storeyIds?: readonly string[] | null | undefined;
  readonly meanPlanDimensions?: Readonly<Partial<Record<"X" | "Y", number>>> | null | undefined;
  readonly directions?: readonly string[] | undefined;
}

export interface Ntc2018LinearDynamicProcedureInput {
  readonly id: string;
  readonly type: string;
  readonly requestedModes?: number;
  readonly spectrumIds?: readonly string[];
  readonly modalCombinationMethod?: string;
  readonly componentCombinationRule?: string;
  readonly accidentalEccentricities?: readonly AccidentalEccentricityInput[];
}

export interface Ntc2018LinearDynamicAnalysisInput {
  readonly procedures?: readonly Ntc2018LinearDynamicProcedureInput[];
  readonly spectra?: readonly { readonly id: string; readonly direction: FemDirection }[];
}

export interface Ntc2018LinearDynamicResultInput {
  readonly results?: { readonly modes?: readonly ModalMassInput[] };
}

export interface Ntc2018LinearDynamicAssessmentInput {
  readonly analysis?: Ntc2018LinearDynamicAnalysisInput | null | undefined;
  readonly result?: Ntc2018LinearDynamicResultInput | null | undefined;
  readonly modalProcedureId?: string;
  readonly responseSpectrumProcedureId?: string;
  readonly storeyIds?: readonly string[] | null;
  readonly meanPlanDimensions?: Readonly<Partial<Record<"X" | "Y", number>>> | null;
  readonly horizontalDirections?: readonly string[];
  readonly verticalComponentRequired?: boolean;
}

const HORIZONTAL_DIRECTIONS: readonly FemDirection[] = Object.freeze(["X", "Y"]);
const MASS_SIGNIFICANCE_THRESHOLD = 0.05;
const MASS_TOTAL_THRESHOLD = 0.85;
const RATIO_COMPARISON_TOLERANCE = 1e-12;
const ACCIDENTAL_ECCENTRICITY_FACTOR = 0.05;

export const NTC2018_LINEAR_DYNAMIC_REFERENCES = Object.freeze([
  Object.freeze({
    source: "NTC 2018",
    citation: "§§ 7.2.6, 7.3.3, 7.3.3.1 e 7.3.5",
  }),
]);

function finitePositive(value: unknown, label: string): number {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) {
    throw new Error(`${label} must be a positive finite number.`);
  }
  return number;
}

function normalizedDirections(directions: readonly string[] | undefined): FemDirection[] {
  if (!Array.isArray(directions) || directions.length === 0) {
    throw new Error("At least one seismic direction is required.");
  }
  const values: FemDirection[] = directions.map((direction) => {
    const value = String(direction).toUpperCase();
    if (value !== "X" && value !== "Y" && value !== "Z") {
      throw new Error("Seismic directions must be unique X, Y or Z values.");
    }
    return value;
  });
  if (
    new Set(values).size !== values.length ||
    values.some((direction) => !["X", "Y", "Z"].includes(direction))
  ) {
    throw new Error("Seismic directions must be unique X, Y or Z values.");
  }
  return values;
}

function check(
  id: string,
  ok: boolean,
  details: JsonRecord = {},
): JsonRecord & { readonly ok: boolean } {
  return {
    id,
    status: ok ? "ok" : "not-verified",
    ok,
    ...details,
  };
}

export function verifyNTC2018ModalMassParticipation({
  modes,
  directions = HORIZONTAL_DIRECTIONS,
}: Ntc2018ModalMassParticipationInput = {}) {
  if (!isModalMassArray(modes) || modes.length === 0) {
    return {
      status: "not-implemented",
      ok: false,
      directions: [],
      reason: "Modal results are required.",
      reference: "NTC 2018 § 7.3.3.1",
    };
  }
  const seismicDirections = normalizedDirections(directions);
  const assessments = seismicDirections.map((direction) => {
    const ratios = modes.map((mode, modeIndex) => {
      const ratio = mode.participatingMassRatios?.[direction];
      if (typeof ratio !== "number" || !Number.isFinite(ratio) || ratio < 0 || ratio > 1) {
        throw new Error(
          `modes[${modeIndex}].participatingMassRatios.${direction} ` + "must lie in [0, 1].",
        );
      }
      return {
        modeNumber: mode.modeNumber,
        ratio,
      };
    });
    const significantModes = ratios.filter((item) => item.ratio > MASS_SIGNIFICANCE_THRESHOLD);
    const totalParticipatingMassRatio = ratios.reduce((sum, item) => sum + item.ratio, 0);
    const totalOk = totalParticipatingMassRatio > MASS_TOTAL_THRESHOLD + RATIO_COMPARISON_TOLERANCE;

    return {
      direction,
      significantThreshold: MASS_SIGNIFICANCE_THRESHOLD,
      totalThreshold: MASS_TOTAL_THRESHOLD,
      significantModeNumbers: significantModes.map((item) => item.modeNumber),
      totalParticipatingMassRatio,
      totalOk,
      ok: totalOk,
    };
  });

  return {
    status: assessments.every((item) => item.ok) ? "ok" : "not-verified",
    ok: assessments.every((item) => item.ok),
    directions: assessments,
    reference: "NTC 2018 § 7.3.3.1",
  };
}

export function verifyNTC2018AccidentalEccentricities({
  eccentricities,
  storeyIds,
  meanPlanDimensions,
  directions = HORIZONTAL_DIRECTIONS,
}: Ntc2018AccidentalEccentricityInput = {}) {
  if (
    !isEccentricityArray(eccentricities) ||
    !isStringArray(storeyIds) ||
    storeyIds.length === 0 ||
    meanPlanDimensions == null
  ) {
    return {
      status: "not-implemented",
      ok: false,
      checks: [],
      reason: "Accidental eccentricities, storeys and mean plan dimensions are required.",
      reference: "NTC 2018 §§ 7.2.6 e 7.3.3",
    };
  }
  const seismicDirections = normalizedDirections(directions);
  const dimensionX = finitePositive(meanPlanDimensions.X, "meanPlanDimensions.X");
  const dimensionY = finitePositive(meanPlanDimensions.Y, "meanPlanDimensions.Y");
  const checks: JsonRecord[] = [];

  for (const direction of seismicDirections) {
    if (!HORIZONTAL_DIRECTIONS.includes(direction)) {
      continue;
    }
    const perpendicularDimension = direction === "X" ? dimensionY : dimensionX;
    const minimumAbsoluteOffset = ACCIDENTAL_ECCENTRICITY_FACTOR * perpendicularDimension;
    const directionEntries = eccentricities.filter((item) => item.direction === direction);
    const absoluteOffsets: number[] = [];

    for (const storeyId of storeyIds) {
      const entries = directionEntries.filter((item) => item.storeyId === storeyId);
      const positive = entries.find(
        (item) => Number.isFinite(item.offset) && item.offset >= minimumAbsoluteOffset,
      );
      const negative = entries.find(
        (item) => Number.isFinite(item.offset) && item.offset <= -minimumAbsoluteOffset,
      );
      if (positive) absoluteOffsets.push(Math.abs(positive.offset));
      if (negative) absoluteOffsets.push(Math.abs(negative.offset));
      checks.push(
        check(`accidental-eccentricity-${direction}-${storeyId}`, Boolean(positive && negative), {
          direction,
          storeyId,
          minimumAbsoluteOffset,
          positiveOffset: positive?.offset ?? null,
          negativeOffset: negative?.offset ?? null,
        }),
      );
    }
    const firstOffset = absoluteOffsets[0] ?? null;
    const constant =
      firstOffset != null &&
      absoluteOffsets.length === 2 * storeyIds.length &&
      absoluteOffsets.every((offset) => Math.abs(offset - firstOffset) <= 1e-9);
    checks.push(
      check(`accidental-eccentricity-${direction}-constant-over-height`, constant, {
        direction,
        absoluteOffset: constant ? firstOffset : null,
      }),
    );
  }

  return {
    status: checks.length > 0 && checks.every((item) => item.ok) ? "ok" : "not-verified",
    ok: checks.length > 0 && checks.every((item) => item.ok),
    factor: ACCIDENTAL_ECCENTRICITY_FACTOR,
    checks,
    reference: "NTC 2018 §§ 7.2.6 e 7.3.3",
  };
}

export function createNTC2018LinearDynamicAssessment({
  analysis,
  result,
  modalProcedureId,
  responseSpectrumProcedureId,
  storeyIds,
  meanPlanDimensions,
  horizontalDirections = HORIZONTAL_DIRECTIONS,
  verticalComponentRequired = false,
}: Ntc2018LinearDynamicAssessmentInput = {}) {
  const modalProcedure = analysis?.procedures?.find(
    (procedure) => procedure.id === modalProcedureId && procedure.type === "modal",
  );
  const responseSpectrumProcedure = analysis?.procedures?.find(
    (procedure) =>
      procedure.id === responseSpectrumProcedureId && procedure.type === "response-spectrum",
  );
  const missing = [
    ...(!modalProcedure ? ["modalProcedure"] : []),
    ...(!responseSpectrumProcedure ? ["responseSpectrumProcedure"] : []),
    ...(!Array.isArray(result?.results?.modes) || result.results.modes.length === 0
      ? ["modalResults"]
      : []),
    ...(!Array.isArray(storeyIds) || storeyIds.length === 0 ? ["storeyIds"] : []),
    ...(meanPlanDimensions == null ? ["meanPlanDimensions"] : []),
  ];
  if (missing.length > 0) {
    return {
      status: "not-implemented",
      complete: false,
      ok: false,
      missing,
      checks: [],
      reference: "NTC 2018 §§ 7.2.6, 7.3.3, 7.3.3.1 e 7.3.5",
    };
  }

  if (!analysis || !result || !modalProcedure || !responseSpectrumProcedure) {
    throw new Error("Linear dynamic assessment contracts are incomplete.");
  }

  const modalDirections = normalizedDirections(horizontalDirections);
  const resultModes = result.results?.modes;
  if (!resultModes) {
    throw new Error("Linear dynamic assessment modal results are incomplete.");
  }
  const modes = resultModes.filter((mode) => mode.procedureId === modalProcedure.id);
  const massParticipation = verifyNTC2018ModalMassParticipation({
    modes,
    directions: modalDirections,
  });
  const requiredSpectrumDirections: FemDirection[] = [
    ...modalDirections,
    ...(verticalComponentRequired ? ["Z" as FemDirection] : []),
  ];
  const spectraById = new Map((analysis.spectra ?? []).map((spectrum) => [spectrum.id, spectrum]));
  const suppliedSpectrumDirections = (responseSpectrumProcedure.spectrumIds ?? [])
    .map((id) => spectraById.get(id)?.direction)
    .filter(Boolean);
  const eccentricity = verifyNTC2018AccidentalEccentricities({
    eccentricities: responseSpectrumProcedure.accidentalEccentricities,
    storeyIds,
    meanPlanDimensions,
    directions: modalDirections,
  });
  const checks = [
    check(
      "modal-result-count",
      typeof modalProcedure.requestedModes === "number" &&
        modes.length >= modalProcedure.requestedModes,
      {
        provided: modes.length,
        requested: modalProcedure.requestedModes,
      },
    ),
    check("modal-mass-participation", massParticipation.ok, {
      directions: massParticipation.directions,
    }),
    check("modal-combination-cqc", responseSpectrumProcedure.modalCombinationMethod === "cqc", {
      provided: responseSpectrumProcedure.modalCombinationMethod ?? null,
      required: "cqc",
    }),
    check(
      "seismic-component-combination",
      responseSpectrumProcedure.componentCombinationRule === "100-30-30",
      {
        provided: responseSpectrumProcedure.componentCombinationRule ?? null,
        required: "100-30-30",
      },
    ),
    check(
      "response-spectrum-direction-coverage",
      requiredSpectrumDirections.every((direction) =>
        suppliedSpectrumDirections.includes(direction),
      ),
      {
        requiredDirections: requiredSpectrumDirections,
        suppliedDirections: suppliedSpectrumDirections,
      },
    ),
    check("accidental-eccentricity", eccentricity.ok, { eccentricityChecks: eccentricity.checks }),
  ];

  return {
    status: checks.every((item) => item.ok) ? "ok" : "not-verified",
    complete: true,
    ok: checks.every((item) => item.ok),
    modalProcedureId,
    responseSpectrumProcedureId,
    massParticipation,
    accidentalEccentricity: eccentricity,
    checks,
    reference: "NTC 2018 §§ 7.2.6, 7.3.3, 7.3.3.1 e 7.3.5",
  };
}
