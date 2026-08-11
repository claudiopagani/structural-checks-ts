export interface RectangularNoTensionCompressionDomain2DInput {
  /** Compressive normal force; compression is positive. */
  readonly normalForce: number;
  /** In-plane joint depth. */
  readonly interfaceLength: number;
  readonly outOfPlaneWidth: number;
  readonly compressiveStrength: number;
}

export interface RectangularNoTensionCompressionDomain2DResult {
  readonly normalCapacity: number;
  readonly momentCapacity: number;
  readonly eccentricityLimit: number | null;
}

function positive(value: number, label: string): number {
  if (!Number.isFinite(value) || value <= 0)
    throw new Error(`${label} must be finite and positive.`);
  return value;
}

/**
 * Exact rigid-plastic rectangular no-tension compression domain.
 *
 * Mechanical source: D'Ambrisi et al., Composites Part B 75 (2015), Eq. (6),
 * https://doi.org/10.1016/j.compositesb.2015.01.024. This is a mechanics reference, not a
 * normative-conformity claim.
 */
export function rectangularNoTensionCompressionDomain2D({
  normalForce,
  interfaceLength,
  outOfPlaneWidth,
  compressiveStrength,
}: RectangularNoTensionCompressionDomain2DInput): RectangularNoTensionCompressionDomain2DResult {
  if (!Number.isFinite(normalForce) || normalForce < 0) {
    throw new Error("Rectangular no-tension normalForce must be finite and non-negative.");
  }
  const length = positive(interfaceLength, "Rectangular no-tension interfaceLength");
  const width = positive(outOfPlaneWidth, "Rectangular no-tension outOfPlaneWidth");
  const strength = positive(compressiveStrength, "Rectangular no-tension compressiveStrength");
  const normalCapacity = width * length * strength;
  if (normalForce > normalCapacity * (1 + 1e-12)) {
    throw new Error("Rectangular no-tension normalForce exceeds the compression-only capacity.");
  }
  const boundedNormalForce = Math.min(normalForce, normalCapacity);
  const momentCapacity =
    boundedNormalForce * (length / 2) * (1 - boundedNormalForce / normalCapacity);
  return {
    normalCapacity,
    momentCapacity,
    eccentricityLimit: boundedNormalForce === 0 ? null : momentCapacity / boundedNormalForce,
  };
}
