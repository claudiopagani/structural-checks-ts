// Mechanical TypeScript migration from strutture-js 6f33baead8b88166c4b2cf94af41763412e3c751; source path: src/applications/steel-frames/checks/SteelBeamColumnInteraction.js.

import { RESULT_STATUS, type ResultStatus } from "../../../core/results/resultStatus.js";
import { roundTo } from "../../../domain/math/arrayLinearAlgebra.js";

const I_H_FAMILIES = new Set(["IPE", "HEA", "HEB", "HEM"]);
const DOUBLY_SYMMETRIC_METHOD_B_FAMILIES = new Set([
  ...I_H_FAMILIES,
  "CHS",
  "SHS",
  "RHS",
  "ROUND",
  "FLAT",
]);
const FORCE_TOLERANCE = 1e-9;

export interface SteelBeamColumnCatalogPropertiesLike {
  family?: string | null;
}

export interface SteelBeamColumnSectionLike {
  family?: string | null;
  catalogProperties?: SteelBeamColumnCatalogPropertiesLike | null;
  area?: number | null;
}

export interface SteelBeamColumnMaterialLike {
  fyk?: number | null;
  metadata?: Record<string, unknown> | null;
}

export interface SteelCompressionBucklingAxisResultLike {
  reductionFactor?: number | null;
  relativeSlenderness?: number | null;
}

export interface SteelCompressionBucklingResultLike {
  axisResults?: {
    y?: SteelCompressionBucklingAxisResultLike | null;
    z?: SteelCompressionBucklingAxisResultLike | null;
  } | null;
}

export interface SteelMethodBInteractionCoefficients {
  kyy: number;
  kzy: number;
  alphaMy: number;
  alphaMLT: number;
}

export interface SteelMethodBBiaxialInteractionCoefficients
  extends SteelMethodBInteractionCoefficients {
  kyz: number;
  kzz: number;
  alphaMz: number;
  source: "method-b-biaxial-mvp";
}

export interface SteelBeamColumnInteractionCheck {
  id: string;
  description: string;
  demand: number;
  capacity: number;
  utilizationRatio: number;
  ok: boolean;
  metadata: Record<string, unknown>;
}

export interface SteelBeamColumnInteractionResult {
  status: ResultStatus;
  check: SteelBeamColumnInteractionCheck | null;
  warnings: string[];
  metadata?: Record<string, unknown>;
}

export interface CalculateSteelMethodBInteractionCoefficientsOptions {
  sectionClass?: number;
  relativeSlendernessY?: number;
  relativeSlendernessZ?: number;
  axialRatioY?: number;
  axialRatioZ?: number;
  alphaMy?: number;
  alphaMLT?: number;
}

export interface CalculateSteelMethodBInteractionCoefficientsMyMzOptions {
  sectionClass?: number;
  relativeSlendernessY?: number;
  relativeSlendernessZ?: number;
  axialRatioY?: number;
  axialRatioZ?: number;
  alphaMy?: number;
  alphaMz?: number;
  alphaMLT?: number;
}

export interface VerifySteelBeamColumnInteractionMyOptions {
  section?: SteelBeamColumnSectionLike | null;
  material?: SteelBeamColumnMaterialLike | null;
  nEd?: number;
  myEd?: number;
  sectionClass?: number;
  bendingSectionModulus?: number | null;
  compressionBucklingResult?: SteelCompressionBucklingResultLike | null;
  chiLT?: number;
  alphaMy?: number;
  alphaMLT?: number;
  gammaM1?: number | null;
  axialForceConvention?: string;
  allowSinglySymmetric?: boolean;
}

export interface VerifySteelBeamColumnInteractionMyMzOptions {
  section?: SteelBeamColumnSectionLike | null;
  material?: SteelBeamColumnMaterialLike | null;
  nEd?: number;
  myEd?: number;
  mzEd?: number;
  sectionClass?: number;
  bendingSectionModulusY?: number | null;
  bendingSectionModulusZ?: number | null;
  compressionBucklingResult?: SteelCompressionBucklingResultLike | null;
  chiLT?: number;
  alphaMy?: number;
  alphaMz?: number;
  alphaMLT?: number;
  gammaM1?: number | null;
  axialForceConvention?: string;
  allowSinglySymmetric?: boolean;
}

function round(value: number): number;
function round(value: unknown): unknown;
function round(value: unknown): unknown {
  return typeof value === "number" && Number.isFinite(value) ? roundTo(value) : value;
}

function isFinitePositive(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function normalizedFamily(section: SteelBeamColumnSectionLike | null | undefined): string {
  return String(section?.family ?? section?.catalogProperties?.family ?? "")
    .trim()
    .toUpperCase();
}

function compressionAxialForce(nEd: number, convention = "absolute"): number {
  if (!Number.isFinite(nEd)) {
    return 0;
  }

  if (Math.abs(nEd) <= FORCE_TOLERANCE) {
    return 0;
  }

  if (convention === "compression-positive") {
    return Math.max(nEd, 0);
  }

  if (convention === "compression-negative") {
    return Math.max(-nEd, 0);
  }

  return Math.abs(nEd);
}

function gammaM1FromMaterial(
  material: SteelBeamColumnMaterialLike | null | undefined,
  gammaM1: number | null,
): unknown {
  return gammaM1 ?? material?.metadata?.gammaM1 ?? material?.metadata?.gammaM0 ?? 1.05;
}

function methodBCoefficientKyy({
  sectionClass,
  lambdaY,
  axialRatioY,
  alphaMy,
}: {
  sectionClass: number;
  lambdaY: number;
  axialRatioY: number;
  alphaMy: number;
}): number {
  if (sectionClass <= 2) {
    return Math.min(
      alphaMy * (1 + (lambdaY - 0.2) * axialRatioY),
      alphaMy * (1 + 0.8 * axialRatioY),
    );
  }

  return Math.min(alphaMy * (1 + 0.6 * lambdaY * axialRatioY), alphaMy * (1 + 0.6 * axialRatioY));
}

function methodBCoefficientKzy({
  sectionClass,
  lambdaZ,
  axialRatioZ,
  alphaMLT,
}: {
  sectionClass: number;
  lambdaZ: number;
  axialRatioZ: number;
  alphaMLT: number;
}): number | null {
  const denominator = alphaMLT - 0.25;

  if (!isFinitePositive(denominator)) {
    return null;
  }

  if (sectionClass <= 2) {
    const interaction = 1 - (0.1 * lambdaZ * axialRatioZ) / denominator;

    if (lambdaZ >= 0.4) {
      return Math.max(interaction, 1 - (0.1 * axialRatioZ) / denominator);
    }

    return Math.min(0.6 + lambdaZ, interaction);
  }

  return Math.max(
    1 - (0.05 * lambdaZ * axialRatioZ) / denominator,
    1 - (0.05 * axialRatioZ) / denominator,
  );
}

export function calculateSteelMethodBInteractionCoefficients(
  options: CalculateSteelMethodBInteractionCoefficientsOptions = {},
): SteelMethodBInteractionCoefficients | null {
  if (options === null) {
    throw new TypeError(
      "Cannot destructure property 'sectionClass' of '(intermediate value)(intermediate value)(intermediate value)' as it is null.",
    );
  }
  const {
    sectionClass,
    relativeSlendernessY,
    relativeSlendernessZ,
    axialRatioY,
    axialRatioZ,
    alphaMy = 1,
    alphaMLT = 1,
  } = options;
  if (
    !isFiniteNumber(sectionClass) ||
    !isFiniteNumber(relativeSlendernessY) ||
    !isFiniteNumber(relativeSlendernessZ) ||
    !isFiniteNumber(axialRatioY) ||
    !isFiniteNumber(axialRatioZ) ||
    !isFinitePositive(alphaMy) ||
    !isFinitePositive(alphaMLT)
  ) {
    return null;
  }

  const kyy = methodBCoefficientKyy({
    sectionClass,
    lambdaY: relativeSlendernessY,
    axialRatioY,
    alphaMy,
  });
  const kzy = methodBCoefficientKzy({
    sectionClass,
    lambdaZ: relativeSlendernessZ,
    axialRatioZ,
    alphaMLT,
  });

  if (!isFiniteNumber(kyy) || !isFiniteNumber(kzy)) {
    return null;
  }

  return {
    kyy: round(kyy),
    kzy: round(kzy),
    alphaMy: round(alphaMy),
    alphaMLT: round(alphaMLT),
  };
}

export function calculateSteelMethodBInteractionCoefficientsMyMz(
  options: CalculateSteelMethodBInteractionCoefficientsMyMzOptions = {},
): SteelMethodBBiaxialInteractionCoefficients | null {
  if (options === null) {
    throw new TypeError(
      "Cannot destructure property 'sectionClass' of '(intermediate value)(intermediate value)(intermediate value)' as it is null.",
    );
  }
  const {
    sectionClass,
    relativeSlendernessY,
    relativeSlendernessZ,
    axialRatioY,
    axialRatioZ,
    alphaMy = 1,
    alphaMz = 1,
    alphaMLT = 1,
  } = options;
  if (
    !isFiniteNumber(sectionClass) ||
    !isFiniteNumber(relativeSlendernessY) ||
    !isFiniteNumber(relativeSlendernessZ) ||
    !isFiniteNumber(axialRatioY) ||
    !isFiniteNumber(axialRatioZ) ||
    !isFinitePositive(alphaMy) ||
    !isFinitePositive(alphaMz) ||
    !isFinitePositive(alphaMLT)
  ) {
    return null;
  }

  const kyy = methodBCoefficientKyy({
    sectionClass,
    lambdaY: relativeSlendernessY,
    axialRatioY,
    alphaMy,
  });
  const kyz = methodBCoefficientKzy({
    sectionClass,
    lambdaZ: relativeSlendernessY,
    axialRatioZ: axialRatioY,
    alphaMLT: alphaMz,
  });
  const kzy = methodBCoefficientKzy({
    sectionClass,
    lambdaZ: relativeSlendernessZ,
    axialRatioZ,
    alphaMLT,
  });
  const kzz = methodBCoefficientKyy({
    sectionClass,
    lambdaY: relativeSlendernessZ,
    axialRatioY: axialRatioZ,
    alphaMy: alphaMz,
  });

  if (
    !isFiniteNumber(kyy) ||
    !isFiniteNumber(kyz) ||
    !isFiniteNumber(kzy) ||
    !isFiniteNumber(kzz)
  ) {
    return null;
  }

  return {
    kyy: round(kyy),
    kyz: round(kyz),
    kzy: round(kzy),
    kzz: round(kzz),
    alphaMy: round(alphaMy),
    alphaMz: round(alphaMz),
    alphaMLT: round(alphaMLT),
    source: "method-b-biaxial-mvp",
  };
}

export function verifySteelBeamColumnInteractionMy(
  options: VerifySteelBeamColumnInteractionMyOptions = {},
): SteelBeamColumnInteractionResult {
  if (options === null) {
    throw new TypeError(
      "Cannot destructure property 'section' of '(intermediate value)(intermediate value)(intermediate value)' as it is null.",
    );
  }
  const {
    section,
    material,
    nEd = 0,
    myEd = 0,
    sectionClass = 1,
    bendingSectionModulus,
    compressionBucklingResult,
    chiLT = 1,
    alphaMy = 1,
    alphaMLT = 1,
    gammaM1 = null,
    axialForceConvention = "absolute",
    allowSinglySymmetric = false,
  } = options;
  const warnings: string[] = [];
  const family = normalizedFamily(section);
  const resolvedGammaM1 = gammaM1FromMaterial(material, gammaM1);
  const fyk = material?.fyk;
  const area = section?.area;
  const demandN = compressionAxialForce(nEd, axialForceConvention);
  const demandMy = Math.abs(myEd ?? 0);

  if (!DOUBLY_SYMMETRIC_METHOD_B_FAMILIES.has(family) && !allowSinglySymmetric) {
    return {
      status: RESULT_STATUS.NOT_SUPPORTED,
      check: null,
      warnings: [
        `N+My Method B stability interaction is enabled for supported doubly symmetric profiles; profile family ${family || "unknown"} requires a dedicated extension or explicit override.`,
      ],
      metadata: {
        method: "circolare-ntc2018-c4.2.4.1.3.3.2-method-b-n-my",
        family,
        domain: "N+My",
      },
    };
  }

  if (sectionClass > 3) {
    return {
      status: RESULT_STATUS.NOT_SUPPORTED,
      check: null,
      warnings: [
        "N+My Method B stability interaction is blocked for class 4 sections until effective properties are implemented.",
      ],
      metadata: {
        method: "circolare-ntc2018-c4.2.4.1.3.3.2-method-b-n-my",
        family,
        sectionClass,
      },
    };
  }

  const axisY = compressionBucklingResult?.axisResults?.y;
  const axisZ = compressionBucklingResult?.axisResults?.z;
  const reductionFactorY = axisY?.reductionFactor;
  const reductionFactorZ = axisZ?.reductionFactor;
  const relativeSlendernessY = axisY?.relativeSlenderness;
  const relativeSlendernessZ = axisZ?.relativeSlenderness;

  if (
    !axisY ||
    !axisZ ||
    !isFinitePositive(reductionFactorY) ||
    !isFinitePositive(reductionFactorZ) ||
    !isFiniteNumber(relativeSlendernessY) ||
    !isFiniteNumber(relativeSlendernessZ) ||
    !isFinitePositive(chiLT) ||
    !isFinitePositive(area) ||
    !isFinitePositive(fyk) ||
    !isFinitePositive(resolvedGammaM1) ||
    !isFinitePositive(bendingSectionModulus)
  ) {
    return {
      status: RESULT_STATUS.NOT_SUPPORTED,
      check: null,
      warnings: [
        "N+My Method B interaction requires compression buckling reductions, chiLT, A, fyk, gammaM1 and Wy.",
      ],
      metadata: {
        method: "circolare-ntc2018-c4.2.4.1.3.3.2-method-b-n-my",
        family,
        sectionClass,
      },
    };
  }

  const axialRatioY = (demandN * resolvedGammaM1) / (reductionFactorY * area * fyk);
  const axialRatioZ = (demandN * resolvedGammaM1) / (reductionFactorZ * area * fyk);
  const bendingRatio = (demandMy * resolvedGammaM1) / (chiLT * bendingSectionModulus * fyk);
  const coefficients = calculateSteelMethodBInteractionCoefficients({
    sectionClass,
    relativeSlendernessY,
    relativeSlendernessZ,
    axialRatioY,
    axialRatioZ,
    alphaMy,
    alphaMLT,
  });

  if (!coefficients) {
    return {
      status: RESULT_STATUS.NOT_SUPPORTED,
      check: null,
      warnings: [
        "N+My Method B interaction coefficients could not be computed; check alphaMy/alphaMLT and slenderness inputs.",
      ],
      metadata: {
        method: "circolare-ntc2018-c4.2.4.1.3.3.2-method-b-n-my",
        family,
        sectionClass,
      },
    };
  }

  const equationY = axialRatioY + coefficients.kyy * bendingRatio;
  const equationZ = axialRatioZ + coefficients.kzy * bendingRatio;
  const utilizationRatio = Math.max(equationY, equationZ);
  const governingEquation = equationY >= equationZ ? "y" : "z";

  return {
    status: utilizationRatio <= 1 ? RESULT_STATUS.OK : RESULT_STATUS.NOT_VERIFIED,
    check: {
      id: "steel-beam-column-interaction-n-my",
      description: "N+My member stability interaction by Method B",
      demand: round(utilizationRatio),
      capacity: 1,
      utilizationRatio: round(utilizationRatio),
      ok: utilizationRatio <= 1,
      metadata: {
        method: "circolare-ntc2018-c4.2.4.1.3.3.2-method-b-n-my",
        interactionTable: "C4.2.V-method-b-supported-family",
        domain: "N+My",
        excludedActions: "Mz, torsion, torsional-interactions",
        family,
        sectionClass,
        axialForceConvention,
        gammaM1: round(resolvedGammaM1),
        fyk: round(fyk),
        area: round(area),
        bendingSectionModulus: round(bendingSectionModulus),
        chiY: reductionFactorY,
        chiZ: reductionFactorZ,
        chiLT: round(chiLT),
        relativeSlendernessY,
        relativeSlendernessZ,
        axialRatioY: round(axialRatioY),
        axialRatioZ: round(axialRatioZ),
        bendingRatio: round(bendingRatio),
        equationY: round(equationY),
        equationZ: round(equationZ),
        governingEquation,
        ...coefficients,
      },
    },
    warnings,
  };
}

export function verifySteelBeamColumnInteractionMyMz(
  options: VerifySteelBeamColumnInteractionMyMzOptions = {},
): SteelBeamColumnInteractionResult {
  if (options === null) {
    throw new TypeError(
      "Cannot destructure property 'section' of '(intermediate value)(intermediate value)(intermediate value)' as it is null.",
    );
  }
  const {
    section,
    material,
    nEd = 0,
    myEd = 0,
    mzEd = 0,
    sectionClass = 1,
    bendingSectionModulusY,
    bendingSectionModulusZ,
    compressionBucklingResult,
    chiLT = 1,
    alphaMy = 1,
    alphaMz = 1,
    alphaMLT = 1,
    gammaM1 = null,
    axialForceConvention = "absolute",
    allowSinglySymmetric = false,
  } = options;
  const warnings: string[] = [];
  const family = normalizedFamily(section);
  const resolvedGammaM1 = gammaM1FromMaterial(material, gammaM1);
  const fyk = material?.fyk;
  const area = section?.area;
  const demandN = compressionAxialForce(nEd, axialForceConvention);
  const demandMy = Math.abs(myEd ?? 0);
  const demandMz = Math.abs(mzEd ?? 0);

  if (!DOUBLY_SYMMETRIC_METHOD_B_FAMILIES.has(family) && !allowSinglySymmetric) {
    return {
      status: RESULT_STATUS.NOT_SUPPORTED,
      check: null,
      warnings: [
        `N+My+Mz Method B stability interaction is enabled for supported doubly symmetric profiles; profile family ${family || "unknown"} requires a dedicated extension or explicit override.`,
      ],
      metadata: {
        method: "circolare-ntc2018-c4.2.4.1.3.3.2-method-b-n-my-mz",
        family,
        domain: "N+My+Mz",
      },
    };
  }

  if (sectionClass > 3) {
    return {
      status: RESULT_STATUS.NOT_SUPPORTED,
      check: null,
      warnings: [
        "N+My+Mz Method B stability interaction is blocked for class 4 sections until effective properties are implemented.",
      ],
      metadata: {
        method: "circolare-ntc2018-c4.2.4.1.3.3.2-method-b-n-my-mz",
        family,
        sectionClass,
      },
    };
  }

  const axisY = compressionBucklingResult?.axisResults?.y;
  const axisZ = compressionBucklingResult?.axisResults?.z;
  const reductionFactorY = axisY?.reductionFactor;
  const reductionFactorZ = axisZ?.reductionFactor;
  const relativeSlendernessY = axisY?.relativeSlenderness;
  const relativeSlendernessZ = axisZ?.relativeSlenderness;

  if (
    !axisY ||
    !axisZ ||
    !isFinitePositive(reductionFactorY) ||
    !isFinitePositive(reductionFactorZ) ||
    !isFiniteNumber(relativeSlendernessY) ||
    !isFiniteNumber(relativeSlendernessZ) ||
    !isFinitePositive(chiLT) ||
    !isFinitePositive(area) ||
    !isFinitePositive(fyk) ||
    !isFinitePositive(resolvedGammaM1) ||
    !isFinitePositive(bendingSectionModulusY) ||
    !isFinitePositive(bendingSectionModulusZ)
  ) {
    return {
      status: RESULT_STATUS.NOT_SUPPORTED,
      check: null,
      warnings: [
        "N+My+Mz Method B interaction requires compression buckling reductions, chiLT, A, fyk, gammaM1, Wy and Wz.",
      ],
      metadata: {
        method: "circolare-ntc2018-c4.2.4.1.3.3.2-method-b-n-my-mz",
        family,
        sectionClass,
      },
    };
  }

  const axialRatioY = (demandN * resolvedGammaM1) / (reductionFactorY * area * fyk);
  const axialRatioZ = (demandN * resolvedGammaM1) / (reductionFactorZ * area * fyk);
  const bendingRatioYLT = (demandMy * resolvedGammaM1) / (chiLT * bendingSectionModulusY * fyk);
  const bendingRatioZ = (demandMz * resolvedGammaM1) / (bendingSectionModulusZ * fyk);
  const coefficients = calculateSteelMethodBInteractionCoefficientsMyMz({
    sectionClass,
    relativeSlendernessY,
    relativeSlendernessZ,
    axialRatioY,
    axialRatioZ,
    alphaMy,
    alphaMz,
    alphaMLT,
  });

  if (!coefficients) {
    return {
      status: RESULT_STATUS.NOT_SUPPORTED,
      check: null,
      warnings: [
        "N+My+Mz Method B interaction coefficients could not be computed; check alphaMy/alphaMz/alphaMLT and slenderness inputs.",
      ],
      metadata: {
        method: "circolare-ntc2018-c4.2.4.1.3.3.2-method-b-n-my-mz",
        family,
        sectionClass,
      },
    };
  }

  const equationY =
    axialRatioY + coefficients.kyy * bendingRatioYLT + coefficients.kyz * bendingRatioZ;
  const equationZ =
    axialRatioZ + coefficients.kzy * bendingRatioYLT + coefficients.kzz * bendingRatioZ;
  const utilizationRatio = Math.max(equationY, equationZ);
  const governingEquation = equationY >= equationZ ? "y" : "z";

  return {
    status: utilizationRatio <= 1 ? RESULT_STATUS.OK : RESULT_STATUS.NOT_VERIFIED,
    check: {
      id: "steel-beam-column-interaction-n-my-mz",
      description: "N+My+Mz member stability interaction by Method B",
      demand: round(utilizationRatio),
      capacity: 1,
      utilizationRatio: round(utilizationRatio),
      ok: utilizationRatio <= 1,
      metadata: {
        method: "circolare-ntc2018-c4.2.4.1.3.3.2-method-b-n-my-mz",
        interactionTable: "C4.2.V-method-b-supported-family",
        domain: "N+My+Mz",
        excludedActions: "torsion, torsional-interactions",
        coefficientModel: "biaxial-method-b-mvp",
        family,
        sectionClass,
        axialForceConvention,
        gammaM1: round(resolvedGammaM1),
        fyk: round(fyk),
        area: round(area),
        bendingSectionModulusY: round(bendingSectionModulusY),
        bendingSectionModulusZ: round(bendingSectionModulusZ),
        chiY: reductionFactorY,
        chiZ: reductionFactorZ,
        chiLT: round(chiLT),
        relativeSlendernessY,
        relativeSlendernessZ,
        axialRatioY: round(axialRatioY),
        axialRatioZ: round(axialRatioZ),
        bendingRatioYLT: round(bendingRatioYLT),
        bendingRatioZ: round(bendingRatioZ),
        equationY: round(equationY),
        equationZ: round(equationZ),
        governingEquation,
        ...coefficients,
      },
    },
    warnings,
  };
}
