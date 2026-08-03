// Mechanical TypeScript migration from strutture-js 6f33baead8b88166c4b2cf94af41763412e3c751.
// Source path: src/norms/ntc2018/masonry/ntc2018MasonryPierDeformation.js.

export const NTC2018_MASONRY_PIER_DEFORMATION_REFERENCES = Object.freeze({
  newOrdinaryFlexural: "NTC 2018, §7.8.2.2.1",
  newOrdinaryShear: "NTC 2018, §7.8.2.2.2",
  existingFlexural: "Circolare 2019, §C8.7.1.3.1.1",
  existingSliding: "Circolare 2019, §C8.7.1.3.1.1",
  existingDiagonal: "Circolare 2019, §C8.7.1.3.1.1",
});

export type NTC2018MasonryPierNormativeScope = "existing" | "new-ordinary";

export interface CalculateNTC2018MasonryPierUltimateDisplacementOptions {
  height: number;
  mechanism: string;
  scope?: NTC2018MasonryPierNormativeScope | undefined;
  modernPerforatedBlocks?: boolean | undefined;
}

export interface NTC2018MasonryPierUltimateDisplacement {
  mechanism: string;
  scope: NTC2018MasonryPierNormativeScope;
  driftCapacity: number;
  ultimateDisplacement: number;
  height: number;
  modernPerforatedBlocks: boolean;
  reference: string;
}

function assertPositive(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be a finite positive value.`);
  }
}

export function calculateNTC2018MasonryPierUltimateDisplacement({
  height,
  mechanism,
  scope = "existing",
  modernPerforatedBlocks = false,
}: CalculateNTC2018MasonryPierUltimateDisplacementOptions): NTC2018MasonryPierUltimateDisplacement {
  assertPositive(height, "height");

  if (scope !== "existing" && scope !== "new-ordinary") {
    throw new Error(`Unsupported masonry pier normative scope: ${String(scope)}.`);
  }

  const isFlexural = mechanism === "flexural";
  const isSliding = mechanism === "bed-joint-sliding";
  const isDiagonal = String(mechanism).startsWith("diagonal-cracking");

  if (!isFlexural && !isSliding && !isDiagonal) {
    throw new Error(`Unsupported masonry pier failure mechanism: ${mechanism}.`);
  }

  let driftCapacity: number;
  let reference: string;

  if (scope === "new-ordinary") {
    driftCapacity = isFlexural ? 0.01 : 0.005;
    reference = isFlexural
      ? NTC2018_MASONRY_PIER_DEFORMATION_REFERENCES.newOrdinaryFlexural
      : NTC2018_MASONRY_PIER_DEFORMATION_REFERENCES.newOrdinaryShear;
  } else if (isFlexural) {
    driftCapacity = 0.01;
    reference = NTC2018_MASONRY_PIER_DEFORMATION_REFERENCES.existingFlexural;
  } else if (isSliding) {
    driftCapacity = 0.005;
    reference = NTC2018_MASONRY_PIER_DEFORMATION_REFERENCES.existingSliding;
  } else {
    driftCapacity = modernPerforatedBlocks ? 0.004 : 0.005;
    reference = NTC2018_MASONRY_PIER_DEFORMATION_REFERENCES.existingDiagonal;
  }

  return {
    mechanism,
    scope,
    driftCapacity,
    ultimateDisplacement: driftCapacity * height,
    height,
    modernPerforatedBlocks: Boolean(modernPerforatedBlocks),
    reference,
  };
}
