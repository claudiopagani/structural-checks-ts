import type { SingleBeamResult } from "./SingleBeamResults.js";

interface EnvelopeSample extends Record<string, unknown> {
  resultId: string;
  resultType: string | undefined;
  limitState: string | null;
  combinationType: string | null;
  quantity: string;
  value: number | undefined;
  sample: Record<string, unknown>;
}

type ResultMap = Record<string, SingleBeamResult>;

function selectExtreme(
  current: EnvelopeSample | null,
  candidate: EnvelopeSample | null,
  valueSelector: (item: EnvelopeSample) => number | undefined,
  compare: (a: number, b: number) => boolean,
): EnvelopeSample | null {
  if (!candidate) {
    return current;
  }

  const candidateValue = valueSelector(candidate);
  const currentValue = current ? valueSelector(current) : undefined;

  if (
    !current ||
    (typeof candidateValue === "number" &&
      typeof currentValue === "number" &&
      compare(candidateValue, currentValue))
  ) {
    return candidate;
  }

  return current;
}

function annotateEnvelopeSample(
  result: SingleBeamResult,
  sample: Record<string, unknown> | null | undefined,
  quantity: string,
  value: number | undefined,
): EnvelopeSample | null {
  if (!sample) {
    return null;
  }

  const context = result.context;

  return {
    resultId: result.id,
    resultType: result.resultType,
    limitState: typeof context?.limitState === "string" ? context.limitState : null,
    combinationType: typeof context?.combinationType === "string" ? context.combinationType : null,
    quantity,
    value,
    sample: { ...sample },
  };
}

function forceResult(result: SingleBeamResult): Record<string, unknown> {
  return result.internalForces;
}

function resultSample(result: SingleBeamResult, key: string): Record<string, unknown> | null {
  const forces = forceResult(result);
  const sample = forces[key];
  return sample && typeof sample === "object" ? (sample as Record<string, unknown>) : null;
}

function sampleNumber(sample: Record<string, unknown> | null, key: string): number | undefined {
  const value = sample?.[key];
  return typeof value === "number" ? value : undefined;
}

function createEnvelope(resultsById: ResultMap): Record<string, EnvelopeSample | null> {
  const results = Object.values(resultsById ?? {});
  const state: Record<string, EnvelopeSample | null> = {
    maxAxialForce: null,
    minAxialForce: null,
    maxShearForce: null,
    minShearForce: null,
    maxShearForceY: null,
    minShearForceY: null,
    maxShearForceZ: null,
    minShearForceZ: null,
    maxAbsShearForceY: null,
    maxAbsShearForceZ: null,
    maxBendingMoment: null,
    minBendingMoment: null,
    maxAbsBendingMoment: null,
    maxBendingMomentY: null,
    minBendingMomentY: null,
    maxBendingMomentZ: null,
    minBendingMomentZ: null,
    maxAbsBendingMomentY: null,
    maxAbsBendingMomentZ: null,
    maxAbsVerticalDisplacement: null,
    maxHorizontalReaction: null,
    minHorizontalReaction: null,
    maxVerticalReaction: null,
    minVerticalReaction: null,
    maxSupportMomentReaction: null,
    minSupportMomentReaction: null,
    maxAbsHorizontalReaction: null,
    maxAbsVerticalReaction: null,
    maxAbsSupportMomentReaction: null,
  };

  const update = (
    key: string,
    result: SingleBeamResult,
    sourceKey: string,
    quantity: string,
    value: number | undefined,
    compare: (a: number, b: number) => boolean,
  ): void => {
    updateSample(key, result, resultSample(result, sourceKey), quantity, value, compare);
  };

  const updateSample = (
    key: string,
    result: SingleBeamResult,
    source: Record<string, unknown> | null,
    quantity: string,
    value: number | undefined,
    compare: (a: number, b: number) => boolean,
  ): void => {
    state[key] = selectExtreme(
      state[key] ?? null,
      annotateEnvelopeSample(result, source, quantity, value),
      (item) => item.value,
      compare,
    );
  };

  for (const result of results) {
    const displacements = result.displacements;
    const reactions = result.reactions;

    const forceKeys: Array<[string, string, string, (a: number, b: number) => boolean]> = [
      ["maxAxialForce", "maxAxialForce", "n", (a, b) => a > b],
      ["minAxialForce", "minAxialForce", "n", (a, b) => a < b],
      ["maxShearForce", "maxShearForce", "v", (a, b) => a > b],
      ["minShearForce", "minShearForce", "v", (a, b) => a < b],
      ["maxShearForceY", "maxShearForceY", "vY", (a, b) => a > b],
      ["minShearForceY", "minShearForceY", "vY", (a, b) => a < b],
      ["maxShearForceZ", "maxShearForceZ", "vZ", (a, b) => a > b],
      ["minShearForceZ", "minShearForceZ", "vZ", (a, b) => a < b],
      ["maxBendingMoment", "maxBendingMoment", "m", (a, b) => a > b],
      ["minBendingMoment", "minBendingMoment", "m", (a, b) => a < b],
      ["maxBendingMomentY", "maxBendingMomentY", "mY", (a, b) => a > b],
      ["minBendingMomentY", "minBendingMomentY", "mY", (a, b) => a < b],
      ["maxBendingMomentZ", "maxBendingMomentZ", "mZ", (a, b) => a > b],
      ["minBendingMomentZ", "minBendingMomentZ", "mZ", (a, b) => a < b],
    ];
    for (const [key, sourceKey, field, compare] of forceKeys) {
      const source = resultSample(result, sourceKey);
      update(key, result, sourceKey, field, sampleNumber(source, field), compare);
    }

    const absoluteForceKeys: Array<[string, string, string, string]> = [
      ["maxAbsBendingMoment", "maxAbsBendingMoment", "absM", "m"],
      ["maxAbsBendingMomentY", "maxAbsBendingMomentY", "absMY", "mY"],
      ["maxAbsBendingMomentZ", "maxAbsBendingMomentZ", "absMZ", "mZ"],
      ["maxAbsShearForceY", "maxAbsShearForceY", "absVY", "vY"],
      ["maxAbsShearForceZ", "maxAbsShearForceZ", "absVZ", "vZ"],
    ];
    for (const [key, sourceKey, quantity, field] of absoluteForceKeys) {
      const source = resultSample(result, sourceKey);
      const value = sampleNumber(source, field);
      updateSample(key, result, source, quantity, Math.abs(value ?? 0), (a, b) => a > b);
    }

    const maxDisplacement = displacements.maxAbsVerticalDisplacement;
    const displacementSample =
      maxDisplacement && typeof maxDisplacement === "object"
        ? (maxDisplacement as Record<string, unknown>)
        : null;
    state.maxAbsVerticalDisplacement = selectExtreme(
      state.maxAbsVerticalDisplacement ?? null,
      annotateEnvelopeSample(
        result,
        displacementSample,
        "absUy",
        Math.abs(sampleNumber(displacementSample, "uy") ?? 0),
      ),
      (item) => item.value,
      (a, b) => a > b,
    );

    const reactionKeys: Array<[string, string, string, (a: number, b: number) => boolean]> = [
      ["maxHorizontalReaction", "maxHorizontalReaction", "rx", (a, b) => a > b],
      ["minHorizontalReaction", "minHorizontalReaction", "rx", (a, b) => a < b],
      ["maxVerticalReaction", "maxVerticalReaction", "ry", (a, b) => a > b],
      ["minVerticalReaction", "minVerticalReaction", "ry", (a, b) => a < b],
      ["maxSupportMomentReaction", "maxSupportMomentReaction", "mrz", (a, b) => a > b],
      ["minSupportMomentReaction", "minSupportMomentReaction", "mrz", (a, b) => a < b],
    ];
    for (const [key, sourceKey, quantity, compare] of reactionKeys) {
      const source = reactions[sourceKey];
      const sample =
        source && typeof source === "object" ? (source as Record<string, unknown>) : null;
      const field = quantity === "rx" ? "ux" : quantity === "ry" ? "uy" : "rz";
      updateSample(key, result, sample, quantity, sampleNumber(sample, field), compare);
    }
    const absoluteReactionKeys: Array<[string, string, string, string]> = [
      ["maxAbsHorizontalReaction", "maxAbsHorizontalReaction", "absRx", "ux"],
      ["maxAbsVerticalReaction", "maxAbsVerticalReaction", "absRy", "uy"],
      ["maxAbsSupportMomentReaction", "maxAbsSupportMomentReaction", "absMrz", "rz"],
    ];
    for (const [key, sourceKey, quantity, field] of absoluteReactionKeys) {
      const raw = reactions[sourceKey];
      const source = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null;
      const value = sampleNumber(source, field);
      updateSample(key, result, source, quantity, Math.abs(value ?? 0), (a, b) => a > b);
    }
  }

  return state;
}

export function createEnvelopes(
  loadCases: ResultMap,
  combinations: ResultMap,
): {
  loadCases: Record<string, EnvelopeSample | null>;
  combinations: Record<string, EnvelopeSample | null>;
  uls: Record<string, EnvelopeSample | null>;
  sle: Record<string, EnvelopeSample | null>;
  all: Record<string, EnvelopeSample | null>;
} {
  const allResults: ResultMap = {
    ...loadCases,
    ...combinations,
  };
  const ulsCombinations = Object.fromEntries(
    Object.entries(combinations).filter(
      ([, result]) => (result.context as Record<string, unknown> | undefined)?.limitState === "ULS",
    ),
  );
  const sleCombinations = Object.fromEntries(
    Object.entries(combinations).filter(
      ([, result]) => (result.context as Record<string, unknown> | undefined)?.limitState === "SLE",
    ),
  );

  return {
    loadCases: createEnvelope(loadCases),
    combinations: createEnvelope(combinations),
    uls: createEnvelope(ulsCombinations),
    sle: createEnvelope(sleCombinations),
    all: createEnvelope(allResults),
  };
}
