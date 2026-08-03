// Mechanical TypeScript migration from strutture-js 6f33baead8b88166c4b2cf94af41763412e3c751.
// Source path: src/norms/ntc2018/masonry/ntc2018MasonryPierCapacity.js.

const EPS = 1e-12;

export const NTC2018_MASONRY_PIER_CAPACITY_REFERENCES = Object.freeze({
  flexural: "NTC 2018, §7.8.2.2.1, eq. [7.8.2]",
  sliding: "NTC 2018, §7.8.2.2.2, eq. [7.8.3]; Circolare 2019, §C8.7.1.3.1.1, eq. [C8.7.1.14]",
  irregularDiagonal: "Circolare 2019, §C8.7.1.3.1.1, eq. [C8.7.1.16]",
  regularDiagonal: "Circolare 2019, §C8.7.1.3.1.1, eqs. [C8.7.1.17]-[C8.7.1.18]",
});

export type MasonryPierCapacityMechanism = string;

export interface NTC2018MasonryPierCapacityInput {
  axialCompression?: number;
  length: number;
  thickness: number;
  shearSpan?: number;
  height?: number;
}

export interface NTC2018MasonryPierFlexuralCapacityOptions extends NTC2018MasonryPierCapacityInput {
  compressiveStrength?: number | undefined;
  shearSpan: number;
}

export interface NTC2018MasonryPierSlidingCapacityOptions extends NTC2018MasonryPierCapacityInput {
  cohesion?: number | undefined;
  shearStrengthLimit?: number | undefined;
  shearSpan: number;
}

export interface NTC2018MasonryPierIrregularDiagonalCapacityOptions
  extends NTC2018MasonryPierCapacityInput {
  referenceShearStrength?: number | undefined;
  diagonalTensileStrength?: number | null | undefined;
  height: number;
}

export interface NTC2018MasonryPierRegularDiagonalCapacityOptions
  extends NTC2018MasonryPierCapacityInput {
  cohesion?: number | undefined;
  interlockingCoefficient?: number | undefined;
  localFrictionCoefficient?: number | undefined;
  blockTensileStrength?: number | undefined;
  height: number;
}

export interface NTC2018MasonryPierUnavailableCapacity {
  mechanism: MasonryPierCapacityMechanism;
  available: false;
  capacity: null;
  missing: string[];
  reference: string;
}

export interface NTC2018MasonryPierFlexuralCapacity {
  mechanism: "flexural";
  available: true;
  capacity: number;
  momentCapacity: number;
  axialCompression: number;
  normalStress: number;
  compressionRatio: number;
  reductionFactor: number;
  shearSpan: number;
  reference: string;
}

export interface NTC2018MasonryPierSlidingCapacity {
  mechanism: "bed-joint-sliding";
  available: true;
  capacity: number;
  axialCompression: number;
  cohesion: number;
  frictionCoefficient: number;
  shearStrengthLimit: number;
  cohesionCandidate: number;
  blockLimitCandidate: number;
  governingLimit: "block-shear-limit" | "cohesion-friction";
  eccentricity: number;
  compressedLength: number;
  normalStress: number;
  effectiveShearStrength: number;
  shearSpan: number;
  reference: string;
}

export interface NTC2018MasonryPierIrregularDiagonalCapacity {
  mechanism: "diagonal-cracking-irregular";
  available: true;
  capacity: number;
  axialCompression: number;
  normalStress: number;
  diagonalTensileStrength: number;
  aspectFactor: number;
  reference: string;
}

export interface NTC2018MasonryPierRegularDiagonalCapacity {
  mechanism: "diagonal-cracking-regular";
  available: true;
  capacity: number;
  axialCompression: number;
  normalStress: number;
  aspectFactor: number;
  localFrictionCoefficient: number;
  interlockingCoefficient: number;
  equivalentCohesion: number;
  equivalentFrictionCoefficient: number;
  jointCandidate: number;
  blockCandidate: number;
  governingLimit: "block-tension" | "stepped-joints";
  reference: string;
}

export type NTC2018MasonryPierCapacity =
  | NTC2018MasonryPierUnavailableCapacity
  | NTC2018MasonryPierFlexuralCapacity
  | NTC2018MasonryPierSlidingCapacity
  | NTC2018MasonryPierIrregularDiagonalCapacity
  | NTC2018MasonryPierRegularDiagonalCapacity;

export type NTC2018MasonryPierAvailableCapacity = Exclude<
  NTC2018MasonryPierCapacity,
  NTC2018MasonryPierUnavailableCapacity
>;

function isFiniteNumber(value: number | null | undefined): value is number {
  return Number.isFinite(value);
}

function assertPositive(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be a finite positive value.`);
  }
}

function compression(value: number | undefined): number {
  return isFiniteNumber(value) ? Math.max(0, value) : 0;
}

function unavailable(
  mechanism: MasonryPierCapacityMechanism,
  missing: readonly string[],
  reference: string,
): NTC2018MasonryPierUnavailableCapacity {
  return {
    mechanism,
    available: false,
    capacity: null,
    missing: [...missing],
    reference,
  };
}

function aspectFactor(height: number, length: number): number {
  return Math.min(1.5, Math.max(1, height / length));
}

/**
 * In-plane flexural resistance of an unreinforced rectangular masonry pier.
 * Compression is positive; tension gives zero flexural resistance, as required
 * by NTC 2018 §7.8.2.2.1. Inputs must use one coherent force-length system.
 */
export function calculateNTC2018MasonryPierFlexuralCapacity({
  axialCompression,
  compressiveStrength,
  length,
  thickness,
  shearSpan,
}: NTC2018MasonryPierFlexuralCapacityOptions):
  | NTC2018MasonryPierUnavailableCapacity
  | NTC2018MasonryPierFlexuralCapacity {
  assertPositive(length, "length");
  assertPositive(thickness, "thickness");
  assertPositive(shearSpan, "shearSpan");

  if (!isFiniteNumber(compressiveStrength) || compressiveStrength <= 0) {
    return unavailable(
      "flexural",
      ["compressiveStrength"],
      NTC2018_MASONRY_PIER_CAPACITY_REFERENCES.flexural,
    );
  }

  const N = compression(axialCompression);
  const area = length * thickness;
  const normalStress = N / area;
  const compressionRatio = normalStress / compressiveStrength;
  const reductionFactor = Math.max(0, 1 - normalStress / (0.85 * compressiveStrength));
  const momentCapacity =
    N <= EPS ? 0 : (length ** 2 * thickness * normalStress * reductionFactor) / 2;

  return {
    mechanism: "flexural",
    available: true,
    capacity: momentCapacity / shearSpan,
    momentCapacity,
    axialCompression: N,
    normalStress,
    compressionRatio,
    reductionFactor,
    shearSpan,
    reference: NTC2018_MASONRY_PIER_CAPACITY_REFERENCES.flexural,
  };
}

/**
 * Bed-joint sliding resistance on the compressed section. The compressed
 * length follows the no-tension linear stress block: l' = l for e <= l/6 and
 * l' = 3(l/2-e) otherwise. The implicit relation is solved in closed form.
 * Friction never grows under tensile axial force; 0.4 is prescribed by NTC.
 */
export function calculateNTC2018MasonryPierSlidingCapacity({
  axialCompression,
  cohesion,
  shearStrengthLimit,
  length,
  thickness,
  shearSpan,
}: NTC2018MasonryPierSlidingCapacityOptions):
  | NTC2018MasonryPierUnavailableCapacity
  | NTC2018MasonryPierSlidingCapacity {
  assertPositive(length, "length");
  assertPositive(thickness, "thickness");
  assertPositive(shearSpan, "shearSpan");

  const missing: string[] = [];

  if (!isFiniteNumber(cohesion) || cohesion < 0) {
    missing.push("cohesion");
  }

  if (!isFiniteNumber(shearStrengthLimit) || shearStrengthLimit <= 0) {
    missing.push("shearStrengthLimit");
  }

  if (missing.length > 0) {
    return unavailable(
      "bed-joint-sliding",
      missing,
      NTC2018_MASONRY_PIER_CAPACITY_REFERENCES.sliding,
    );
  }

  const resolvedCohesion = cohesion ?? 0;
  const resolvedShearStrengthLimit = shearStrengthLimit ?? 0;

  const N = compression(axialCompression);
  const fullArea = length * thickness;
  let cohesionCandidate: number;
  let blockLimitCandidate: number;

  const compressedLengthFromCapacity = (capacity: number): number => {
    if (N <= EPS) return length;

    const eccentricity = (capacity * shearSpan) / N;

    if (eccentricity <= length / 6) return length;

    return Math.max(0, Math.min(length, 3 * (length / 2 - eccentricity)));
  };

  const resolveCohesionCandidate = (): number => {
    const fullSectionCapacity = resolvedCohesion * fullArea + 0.4 * N;

    if (N <= EPS || (fullSectionCapacity * shearSpan) / N <= length / 6) {
      return fullSectionCapacity;
    }

    return (
      (1.5 * resolvedCohesion * fullArea + 0.4 * N) /
      (1 + (3 * resolvedCohesion * thickness * shearSpan) / N)
    );
  };

  const resolveBlockLimitCandidate = (): number => {
    const fullSectionCapacity = resolvedShearStrengthLimit * fullArea;

    if (N <= EPS || (fullSectionCapacity * shearSpan) / N <= length / 6) {
      return fullSectionCapacity;
    }

    return (
      (1.5 * resolvedShearStrengthLimit * fullArea) /
      (1 + (3 * resolvedShearStrengthLimit * thickness * shearSpan) / N)
    );
  };

  if (N <= EPS) {
    cohesionCandidate = resolvedCohesion * fullArea;
    blockLimitCandidate = resolvedShearStrengthLimit * fullArea;
  } else {
    cohesionCandidate = resolveCohesionCandidate();
    blockLimitCandidate = resolveBlockLimitCandidate();
  }

  const capacity = Math.max(0, Math.min(cohesionCandidate, blockLimitCandidate));
  const eccentricity = N > EPS ? (capacity * shearSpan) / N : 0;
  const compressedLength = compressedLengthFromCapacity(capacity);
  const compressedArea = compressedLength * thickness;
  const normalStress = compressedArea > EPS ? N / compressedArea : 0;
  const uncappedStrength = resolvedCohesion + 0.4 * normalStress;

  return {
    mechanism: "bed-joint-sliding",
    available: true,
    capacity,
    axialCompression: N,
    cohesion: resolvedCohesion,
    frictionCoefficient: 0.4,
    shearStrengthLimit: resolvedShearStrengthLimit,
    cohesionCandidate,
    blockLimitCandidate,
    governingLimit:
      blockLimitCandidate < cohesionCandidate ? "block-shear-limit" : "cohesion-friction",
    eccentricity,
    compressedLength,
    normalStress,
    effectiveShearStrength: Math.min(uncappedStrength, resolvedShearStrengthLimit),
    shearSpan,
    reference: NTC2018_MASONRY_PIER_CAPACITY_REFERENCES.sliding,
  };
}

export function calculateNTC2018MasonryPierIrregularDiagonalCapacity({
  axialCompression,
  referenceShearStrength,
  diagonalTensileStrength = null,
  length,
  thickness,
  height,
}: NTC2018MasonryPierIrregularDiagonalCapacityOptions):
  | NTC2018MasonryPierUnavailableCapacity
  | NTC2018MasonryPierIrregularDiagonalCapacity {
  assertPositive(length, "length");
  assertPositive(thickness, "thickness");
  assertPositive(height, "height");

  const tensileStrength = isFiniteNumber(diagonalTensileStrength)
    ? diagonalTensileStrength
    : isFiniteNumber(referenceShearStrength)
      ? 1.5 * referenceShearStrength
      : null;

  if (!isFiniteNumber(tensileStrength) || tensileStrength <= 0) {
    return unavailable(
      "diagonal-cracking-irregular",
      ["referenceShearStrength or diagonalTensileStrength"],
      NTC2018_MASONRY_PIER_CAPACITY_REFERENCES.irregularDiagonal,
    );
  }

  const N = compression(axialCompression);
  const area = length * thickness;
  const normalStress = N / area;
  const b = aspectFactor(height, length);
  const capacity = (area * tensileStrength * Math.sqrt(1 + normalStress / tensileStrength)) / b;

  return {
    mechanism: "diagonal-cracking-irregular",
    available: true,
    capacity,
    axialCompression: N,
    normalStress,
    diagonalTensileStrength: tensileStrength,
    aspectFactor: b,
    reference: NTC2018_MASONRY_PIER_CAPACITY_REFERENCES.irregularDiagonal,
  };
}

export function calculateNTC2018MasonryPierRegularDiagonalCapacity({
  axialCompression,
  cohesion,
  interlockingCoefficient,
  localFrictionCoefficient = 0.577,
  blockTensileStrength,
  length,
  thickness,
  height,
}: NTC2018MasonryPierRegularDiagonalCapacityOptions):
  | NTC2018MasonryPierUnavailableCapacity
  | NTC2018MasonryPierRegularDiagonalCapacity {
  assertPositive(length, "length");
  assertPositive(thickness, "thickness");
  assertPositive(height, "height");

  const missing: string[] = [];

  if (!isFiniteNumber(cohesion) || cohesion < 0) missing.push("cohesion");
  if (!isFiniteNumber(interlockingCoefficient) || interlockingCoefficient <= 0) {
    missing.push("interlockingCoefficient");
  }
  if (!isFiniteNumber(localFrictionCoefficient) || localFrictionCoefficient <= 0) {
    missing.push("localFrictionCoefficient");
  }
  if (!isFiniteNumber(blockTensileStrength) || blockTensileStrength <= 0) {
    missing.push("blockTensileStrength");
  }

  if (missing.length > 0) {
    return unavailable(
      "diagonal-cracking-regular",
      missing,
      NTC2018_MASONRY_PIER_CAPACITY_REFERENCES.regularDiagonal,
    );
  }

  const resolvedCohesion = cohesion ?? 0;
  const resolvedInterlockingCoefficient = interlockingCoefficient ?? 0;
  const resolvedLocalFrictionCoefficient = localFrictionCoefficient ?? 0;
  const resolvedBlockTensileStrength = blockTensileStrength ?? 0;

  const N = compression(axialCompression);
  const area = length * thickness;
  const normalStress = N / area;
  const b = aspectFactor(height, length);
  const denominator = 1 + resolvedLocalFrictionCoefficient * resolvedInterlockingCoefficient;
  const equivalentCohesion = resolvedCohesion / denominator;
  const equivalentFrictionCoefficient = resolvedLocalFrictionCoefficient / denominator;
  const jointCandidate =
    (area / b) * (equivalentCohesion + equivalentFrictionCoefficient * normalStress);
  const blockCandidate =
    (area / b) *
    (resolvedBlockTensileStrength / 2.3) *
    Math.sqrt(1 + normalStress / resolvedBlockTensileStrength);

  return {
    mechanism: "diagonal-cracking-regular",
    available: true,
    capacity: Math.min(jointCandidate, blockCandidate),
    axialCompression: N,
    normalStress,
    aspectFactor: b,
    localFrictionCoefficient: resolvedLocalFrictionCoefficient,
    interlockingCoefficient: resolvedInterlockingCoefficient,
    equivalentCohesion,
    equivalentFrictionCoefficient,
    jointCandidate,
    blockCandidate,
    governingLimit: blockCandidate < jointCandidate ? "block-tension" : "stepped-joints",
    reference: NTC2018_MASONRY_PIER_CAPACITY_REFERENCES.regularDiagonal,
  };
}

/** Exact minimum, including a valid zero resistance. */
export function selectNTC2018MasonryPierGoverningCapacity(
  capacities: readonly NTC2018MasonryPierCapacity[] = [],
): NTC2018MasonryPierAvailableCapacity | null {
  const available = capacities.filter(
    (item): item is NTC2018MasonryPierAvailableCapacity =>
      item?.available === true && Number.isFinite(item.capacity) && item.capacity >= 0,
  );

  if (available.length === 0) {
    return null;
  }

  return available.reduce((governing, candidate) =>
    candidate.capacity < governing.capacity ? candidate : governing,
  );
}
