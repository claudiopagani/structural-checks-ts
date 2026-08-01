import { withNormativeReferences } from "../../normativeReference.js";
import { EN1992_RC_EXTERNAL_REFERENCES } from "../normativeReferences.js";

export interface En1992DesignBondStrengthOptions {
  fctd: number;
  barDiameter: number;
  bondConditionFactor?: number;
}

export interface En1992DesignBondStrength {
  fbd: number;
  eta1: number;
  eta2: number;
  reference: string;
  metadata: Record<string, unknown>;
}

export interface En1992AnchorageLengthOptions {
  barDiameter: number;
  designSteelStress: number;
  fbd: number;
  tension?: boolean;
  alpha1?: number;
  alpha2?: number;
  alpha3?: number;
  alpha4?: number;
  alpha5?: number;
  nationalMinimumDiameterMultiple?: number | null;
  nationalMinimumLength?: number | null;
}

export interface En1992AnchorageLength {
  basicRequiredLength: number;
  minimumLength: number;
  nationalMinimum: number;
  designLength: number;
  tension: boolean;
  alphaFactors: {
    alpha1: number;
    alpha2: number;
    alpha3: number;
    alpha4: number;
    alpha5: number;
  };
  reference: string;
  metadata: Record<string, unknown>;
}

export interface En1992LocalBearingResistanceOptions {
  loadedArea: number;
  distributionArea: number;
  fcd: number;
  resistanceReductionFactor?: number;
}

export interface En1992LocalBearingResistance {
  enhancement: number;
  resistance: number;
  resistanceReductionFactor: number;
  reference: string;
  metadata: Record<string, unknown>;
}

export interface En1992ShrinkageCurvatureOptions {
  freeShrinkageStrain: number;
  reinforcementElasticModulus: number;
  effectiveConcreteModulus: number;
  reinforcementFirstMoment: number;
  sectionSecondMoment: number;
}

export interface En1992ShrinkageCurvature {
  curvature: number;
  effectiveModularRatio: number;
  reference: string;
  metadata: Record<string, unknown>;
}

function positive(value: number, label: string): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be positive.`);
  }

  return value;
}

function factor(value: number, label: string): number {
  if (!Number.isFinite(value) || value <= 0 || value > 1) {
    throw new Error(`${label} must be in (0, 1].`);
  }

  return value;
}

/** EN 1992-1-1:2004, 8.4.2, Expression (8.2). */
export function calculateEn1992DesignBondStrength({
  fctd,
  barDiameter,
  bondConditionFactor = 1,
}: En1992DesignBondStrengthOptions): En1992DesignBondStrength {
  positive(fctd, "fctd");
  positive(barDiameter, "barDiameter");
  factor(bondConditionFactor, "bondConditionFactor");
  const diameterFactor = barDiameter <= 32 ? 1 : (132 - barDiameter) / 100;

  if (diameterFactor <= 0) {
    throw new Error("EN 1992 bond strength requires barDiameter < 132 mm.");
  }

  return {
    fbd: 2.25 * bondConditionFactor * diameterFactor * fctd,
    eta1: bondConditionFactor,
    eta2: diameterFactor,
    reference: "EN1992-1-1:2004-8.4.2-(8.2)",
    metadata: withNormativeReferences({}, [EN1992_RC_EXTERNAL_REFERENCES.bondAndAnchorage]),
  };
}

/** EN 1992-1-1:2004, 8.4.3-8.4.4, Expressions (8.3), (8.4), (8.6). */
export function calculateEn1992AnchorageLength({
  barDiameter,
  designSteelStress,
  fbd,
  tension = true,
  alpha1 = 1,
  alpha2 = 1,
  alpha3 = 1,
  alpha4 = 1,
  alpha5 = 1,
  nationalMinimumDiameterMultiple = null,
  nationalMinimumLength = null,
}: En1992AnchorageLengthOptions): En1992AnchorageLength {
  positive(barDiameter, "barDiameter");
  positive(designSteelStress, "designSteelStress");
  positive(fbd, "fbd");
  const alphas = [alpha1, alpha2, alpha3, alpha4, alpha5].map((value, index) =>
    factor(value, `alpha${index + 1}`),
  );
  const basicRequiredLength = (barDiameter / 4) * (designSteelStress / fbd);
  const minimumLength = tension
    ? Math.max(0.3 * basicRequiredLength, 10 * barDiameter, 100)
    : Math.max(0.6 * basicRequiredLength, 10 * barDiameter, 100);
  const codeDesignLength = Math.max(
    minimumLength,
    alphas.reduce((value, alpha) => value * alpha, basicRequiredLength),
  );
  const nationalMinimum = Math.max(
    nationalMinimumDiameterMultiple == null
      ? 0
      : positive(nationalMinimumDiameterMultiple, "nationalMinimumDiameterMultiple") * barDiameter,
    nationalMinimumLength == null ? 0 : positive(nationalMinimumLength, "nationalMinimumLength"),
  );

  return {
    basicRequiredLength,
    minimumLength,
    nationalMinimum,
    designLength: Math.max(codeDesignLength, nationalMinimum),
    tension,
    alphaFactors: {
      alpha1,
      alpha2,
      alpha3,
      alpha4,
      alpha5,
    },
    reference: "EN1992-1-1:2004-8.4.3-8.4.4",
    metadata: withNormativeReferences({}, [EN1992_RC_EXTERNAL_REFERENCES.bondAndAnchorage]),
  };
}

/** EN 1992-1-1:2004, 6.7, Expression (6.63). */
export function calculateEn1992LocalBearingResistance({
  loadedArea,
  distributionArea,
  fcd,
  resistanceReductionFactor = 1,
}: En1992LocalBearingResistanceOptions): En1992LocalBearingResistance {
  positive(loadedArea, "loadedArea");
  positive(distributionArea, "distributionArea");
  positive(fcd, "fcd");
  factor(resistanceReductionFactor, "resistanceReductionFactor");

  if (distributionArea < loadedArea) {
    throw new Error("distributionArea must not be smaller than loadedArea.");
  }

  const enhancement = Math.min(3, Math.sqrt(distributionArea / loadedArea));

  return {
    enhancement,
    resistance: resistanceReductionFactor * loadedArea * fcd * enhancement,
    resistanceReductionFactor,
    reference: "EN1992-1-1:2004-6.7-(6.63)",
    metadata: withNormativeReferences({}, [EN1992_RC_EXTERNAL_REFERENCES.localBearing]),
  };
}

/** EN 1992-1-1:2004, 7.4.3(6), Expression (7.21). */
export function calculateEn1992ShrinkageCurvature({
  freeShrinkageStrain,
  reinforcementElasticModulus,
  effectiveConcreteModulus,
  reinforcementFirstMoment,
  sectionSecondMoment,
}: En1992ShrinkageCurvatureOptions): En1992ShrinkageCurvature {
  if (!Number.isFinite(freeShrinkageStrain)) {
    throw new Error("freeShrinkageStrain must be finite.");
  }

  positive(reinforcementElasticModulus, "reinforcementElasticModulus");
  positive(effectiveConcreteModulus, "effectiveConcreteModulus");

  if (!Number.isFinite(reinforcementFirstMoment)) {
    throw new Error("reinforcementFirstMoment must be finite.");
  }

  positive(sectionSecondMoment, "sectionSecondMoment");
  const effectiveModularRatio = reinforcementElasticModulus / effectiveConcreteModulus;

  return {
    curvature:
      (freeShrinkageStrain * effectiveModularRatio * reinforcementFirstMoment) /
      sectionSecondMoment,
    effectiveModularRatio,
    reference: "EN1992-1-1:2004-7.4.3-(7.21)",
    metadata: withNormativeReferences({}, [EN1992_RC_EXTERNAL_REFERENCES.shrinkageCurvature]),
  };
}
