const NTC2018_RETAINING_WALL_REFERENCE = "D.M. 17/01/2018, NTC 2018, section 7.11.6.2.1";

export interface NTC2018RetainingWallSeismicCoefficients {
  kh: number;
  verticalMagnitude: number;
  verticalCases: NTC2018RetainingWallSeismicVerticalCase[];
  input: {
    maximumSiteAccelerationRatio: number;
    betaM: number;
  };
  metadata: NTC2018RetainingWallSeismicMetadata;
}

export interface NTC2018RetainingWallSeismicVerticalCase {
  id: string;
  kv: number;
  convention: string;
}

export interface NTC2018RetainingWallSeismicMetadata {
  code: "NTC2018";
  reference: string;
  betaMSource: "explicit-input";
  accelerationRatioSource: "explicit-input";
}

export interface CalculateNTC2018RetainingWallSeismicCoefficientsOptions {
  maximumSiteAccelerationRatio?: unknown;
  betaM?: unknown;
}

export interface CreateNTC2018MononobeOkabeSeismicInputOptions
  extends CalculateNTC2018RetainingWallSeismicCoefficientsOptions {
  verticalCase?: string;
  distributionModel?: string;
}

export interface NTC2018MononobeOkabeSeismicInput {
  kh: number;
  kv: number;
  distributionModel: string;
  metadata: NTC2018RetainingWallSeismicMetadata & {
    verticalCase: string;
    verticalConvention: string;
  };
}

function finiteNonNegative(value: number, label: string): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be non-negative.`);
  }
  return value;
}

export const NTC2018_RETAINING_WALL_SEISMIC_REFERENCE = NTC2018_RETAINING_WALL_REFERENCE;

export function calculateNTC2018RetainingWallSeismicCoefficients({
  maximumSiteAccelerationRatio,
  betaM,
}: CalculateNTC2018RetainingWallSeismicCoefficientsOptions = {}): NTC2018RetainingWallSeismicCoefficients {
  const accelerationRatio = finiteNonNegative(
    Number(maximumSiteAccelerationRatio),
    "maximumSiteAccelerationRatio",
  );
  const reduction = finiteNonNegative(Number(betaM), "betaM");
  if (reduction > 1) {
    throw new Error("betaM must not exceed 1.");
  }

  const kh = reduction * accelerationRatio;
  const verticalMagnitude = 0.5 * kh;

  return {
    kh,
    verticalMagnitude,
    verticalCases: [
      {
        id: "reduced-effective-gravity",
        kv: verticalMagnitude,
        convention: "positive-kv-reduces-effective-gravity-through-factor-1-minus-kv",
      },
      {
        id: "increased-effective-gravity",
        kv: -verticalMagnitude,
        convention: "negative-kv-increases-effective-gravity-through-factor-1-minus-kv",
      },
    ],
    input: {
      maximumSiteAccelerationRatio: accelerationRatio,
      betaM: reduction,
    },
    metadata: {
      code: "NTC2018",
      reference: NTC2018_RETAINING_WALL_REFERENCE,
      betaMSource: "explicit-input",
      accelerationRatioSource: "explicit-input",
    },
  };
}

export function createNTC2018MononobeOkabeSeismicInput({
  verticalCase,
  distributionModel = "resultant-only",
  ...input
}: CreateNTC2018MononobeOkabeSeismicInputOptions = {}): NTC2018MononobeOkabeSeismicInput {
  const coefficients = calculateNTC2018RetainingWallSeismicCoefficients(input);
  const selected = coefficients.verticalCases.find(({ id }) => id === verticalCase);
  if (!selected) {
    throw new Error(
      `verticalCase must be one of: ${coefficients.verticalCases.map(({ id }) => id).join(", ")}.`,
    );
  }

  return {
    kh: coefficients.kh,
    kv: selected.kv,
    distributionModel,
    metadata: {
      ...coefficients.metadata,
      verticalCase: selected.id,
      verticalConvention: selected.convention,
    },
  };
}
