// Mechanical TypeScript migration from strutture-js 6f33baead8b88166c4b2cf94af41763412e3c751.
// Source path: src/norms/ntc2018/masonry/ntc2018MasonryPierStiffness.js.

export const NTC2018_MASONRY_PIER_STIFFNESS_REFERENCE =
  "NTC 2018, §7.8.1.5.2: deformabilità flessionale e a taglio; rigidezze fessurate, assumibili pari a metà delle non fessurate in assenza di valutazioni accurate";

export type NTC2018MasonryPierBoundaryCondition = "cantilever" | "fixed-fixed";

export interface CalculateNTC2018MasonryPierElasticStiffnessOptions {
  elasticModulus: number;
  shearModulus: number;
  length: number;
  thickness: number;
  deformableHeight: number;
  boundaryCondition?: NTC2018MasonryPierBoundaryCondition | undefined;
  shearCorrectionFactor?: number | undefined;
  crackedStiffnessFactor?: number | undefined;
}

export interface NTC2018MasonryPierElasticStiffness {
  totalStiffness: number;
  bendingStiffness: number;
  shearStiffness: number;
  bendingCompliance: number;
  shearCompliance: number;
  area: number;
  inertia: number;
  deformableHeight: number;
  boundaryCondition: NTC2018MasonryPierBoundaryCondition;
  bendingCoefficient: number;
  shearCorrectionFactor: number;
  crackedStiffnessFactor: number;
  reference: string;
}

function assertPositive(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be a finite positive value.`);
  }
}

export function calculateNTC2018MasonryPierElasticStiffness({
  elasticModulus,
  shearModulus,
  length,
  thickness,
  deformableHeight,
  boundaryCondition = "cantilever",
  shearCorrectionFactor = 5 / 6,
  crackedStiffnessFactor = 0.5,
}: CalculateNTC2018MasonryPierElasticStiffnessOptions): NTC2018MasonryPierElasticStiffness {
  assertPositive(elasticModulus, "elasticModulus");
  assertPositive(shearModulus, "shearModulus");
  assertPositive(length, "length");
  assertPositive(thickness, "thickness");
  assertPositive(deformableHeight, "deformableHeight");
  assertPositive(shearCorrectionFactor, "shearCorrectionFactor");
  assertPositive(crackedStiffnessFactor, "crackedStiffnessFactor");

  if (crackedStiffnessFactor > 1) {
    throw new Error("crackedStiffnessFactor cannot exceed 1.");
  }

  if (boundaryCondition !== "cantilever" && boundaryCondition !== "fixed-fixed") {
    throw new Error(`Unsupported boundaryCondition: ${String(boundaryCondition)}.`);
  }

  const area = length * thickness;
  const inertia = (thickness * length ** 3) / 12;
  const bendingCoefficient = boundaryCondition === "fixed-fixed" ? 12 : 3;
  const bendingStiffness =
    (crackedStiffnessFactor * bendingCoefficient * elasticModulus * inertia) /
    deformableHeight ** 3;
  const shearStiffness =
    (crackedStiffnessFactor * shearCorrectionFactor * shearModulus * area) / deformableHeight;
  const totalStiffness = 1 / (1 / bendingStiffness + 1 / shearStiffness);

  return {
    totalStiffness,
    bendingStiffness,
    shearStiffness,
    bendingCompliance: 1 / bendingStiffness,
    shearCompliance: 1 / shearStiffness,
    area,
    inertia,
    deformableHeight,
    boundaryCondition,
    bendingCoefficient,
    shearCorrectionFactor,
    crackedStiffnessFactor,
    reference: NTC2018_MASONRY_PIER_STIFFNESS_REFERENCE,
  };
}
