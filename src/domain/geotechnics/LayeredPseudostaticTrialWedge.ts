import type { GroundLayer, GroundProfile } from "./GroundProfile.js";

const USACE_LAYERED_WEDGE_REFERENCE =
  "USACE EM 1110-2-2502 (1989), section 3-13c(4)(b), constant-inclination layered wedge approximation";
const FHWA_PSEUDOSTATIC_WEDGE_REFERENCE =
  "FHWA-HRT-05-067 (2006), Part 2, section 6.4.2.1, pseudostatic trial-wedge force polygon";
const CALTRANS_GENERAL_WEDGE_REFERENCE =
  "Caltrans Trenching and Shoring Manual (2025), chapter 4, section 4-5.01, general active trial-wedge equilibrium";

export interface TrialWedgeLayerState {
  parameterSetId: string;
  stressBasis: string;
  frictionAngle: number;
  cohesion: number;
}

export interface TrialWedgePoint {
  x: number;
  z: number;
}

export interface TrialWedgeWeightContribution {
  layerId: string;
  materialId: string;
  area: number;
  unitWeight: number;
  weight: number;
}

export interface LayeredPseudostaticTrialWedgeOptions {
  profile?: GroundProfile | undefined;
  layerStates?: ReadonlyMap<string, TrialWedgeLayerState> | undefined;
  topElevation?: number | undefined;
  bottomElevation?: number | undefined;
  backfillInclination?: number | undefined;
  wallInclinationFromVertical?: number | undefined;
  interfaceFrictionAngle?: number | undefined;
  surcharge?: number | undefined;
  horizontalSeismicCoefficient?: number | undefined;
  verticalSeismicCoefficient?: number | undefined;
  slipPlaneAngle?: number | undefined;
}

export interface TrialWedgeSegment {
  id: string;
  baseLayerId: string;
  baseMaterialId: string;
  parameterSetId: string;
  stressBasis: string;
  leftWallNormalCoordinate: number;
  rightWallNormalCoordinate: number;
  baseLength: number;
  area: number;
  weight: number;
  weightContributions: TrialWedgeWeightContribution[];
  surfaceHorizontalWidth: number;
  surchargeForce: number;
  frictionAngle: number;
  cohesion: number;
  globalVerticalGravityForce: number;
  globalHorizontalInertiaForce: number;
  downwardWallTangentForce: number;
  adverseWallNormalForce: number;
  cohesionResistance: number;
  thrustContribution: number;
}

export interface TrialWedgeCandidate {
  slipPlaneAngle: number;
  wallInclinationFromVertical: number;
  interfaceFrictionAngle: number;
  wallForceAngleFromHorizontal: number;
  intersectionPoint: { x: number; elevation: number };
  area: number;
  weight: number;
  horizontalBoundaryForce: number;
  wallForceTransformationFactor: number;
  rawThrust: number;
  thrust: number;
  segments: TrialWedgeSegment[];
}

export interface TrialWedgeSearchOptions {
  sampleCount?: number;
  angleTolerance?: number;
  maxRefinementIterations?: number;
}

export interface OptimizeLayeredPseudostaticTrialWedgeOptions
  extends Omit<LayeredPseudostaticTrialWedgeOptions, "slipPlaneAngle"> {
  search?: TrialWedgeSearchOptions;
}

export interface LayeredPseudostaticTrialWedgeResult {
  critical: TrialWedgeCandidate | null;
  search: {
    sampleCount: number;
    validCandidateCount: number;
    minimumAngle: number;
    maximumAngle: number;
    angleTolerance: number;
    refinementIterations: number;
    refinedBracket: { minimum: number; maximum: number };
    envelope: Array<{ slipPlaneAngle: number; rawThrust: number; thrust: number }>;
  };
  metadata: {
    method: string;
    references: readonly string[];
  };
}

function finite(value: number, label: string): number {
  if (!Number.isFinite(value)) throw new Error(`${label} must be finite.`);
  return value;
}

function item<T>(values: readonly T[], index: number, message: string): T {
  const value = values[index];
  if (value === undefined) throw new Error(message);
  return value;
}

function clipAtElevation(
  polygon: readonly TrialWedgePoint[],
  elevation: number,
  keepAbove: boolean,
): TrialWedgePoint[] {
  if (polygon.length === 0) return [];
  const output: TrialWedgePoint[] = [];

  for (let index = 0; index < polygon.length; index += 1) {
    const current = item(polygon, index, "Missing polygon point.");
    const previous = item(
      polygon,
      (index + polygon.length - 1) % polygon.length,
      "Missing polygon point.",
    );
    const currentInside = keepAbove ? current.z >= elevation : current.z <= elevation;
    const previousInside = keepAbove ? previous.z >= elevation : previous.z <= elevation;

    if (currentInside !== previousInside) {
      const ratio = (elevation - previous.z) / (current.z - previous.z);
      output.push({
        x: previous.x + ratio * (current.x - previous.x),
        z: elevation,
      });
    }
    if (currentInside) output.push(current);
  }

  return output;
}

function clipAtWallNormalCoordinate(
  polygon: readonly TrialWedgePoint[],
  coordinate: number,
  keepGreater: boolean,
  wallInclination: number,
  bottomElevation: number,
): TrialWedgePoint[] {
  if (polygon.length === 0) return [];
  const output: TrialWedgePoint[] = [];
  const valueAt = ({ x, z }: TrialWedgePoint): number =>
    x * Math.cos(wallInclination) - (z - bottomElevation) * Math.sin(wallInclination);

  for (let index = 0; index < polygon.length; index += 1) {
    const current = item(polygon, index, "Missing polygon point.");
    const previous = item(
      polygon,
      (index + polygon.length - 1) % polygon.length,
      "Missing polygon point.",
    );
    const currentValue = valueAt(current);
    const previousValue = valueAt(previous);
    const currentInside = keepGreater ? currentValue >= coordinate : currentValue <= coordinate;
    const previousInside = keepGreater ? previousValue >= coordinate : previousValue <= coordinate;

    if (currentInside !== previousInside) {
      const ratio = (coordinate - previousValue) / (currentValue - previousValue);
      output.push({
        x: previous.x + ratio * (current.x - previous.x),
        z: previous.z + ratio * (current.z - previous.z),
      });
    }
    if (currentInside) output.push(current);
  }

  return output;
}

function polygonArea(polygon: readonly TrialWedgePoint[]): number {
  if (polygon.length < 3) return 0;
  let doubledArea = 0;

  for (let index = 0; index < polygon.length; index += 1) {
    const current = item(polygon, index, "Missing polygon point.");
    const next = item(polygon, (index + 1) % polygon.length, "Missing polygon point.");
    doubledArea += current.x * next.z - next.x * current.z;
  }

  return Math.abs(doubledArea) / 2;
}

function areaInsideHorizontalBand(
  polygon: readonly TrialWedgePoint[],
  bottomElevation: number,
  topElevation: number,
): number {
  let clipped = clipAtElevation(polygon, bottomElevation, true);
  if (Number.isFinite(topElevation)) {
    clipped = clipAtElevation(clipped, topElevation, false);
  }
  return polygonArea(clipped);
}

function layerAtExtendedElevation(profile: GroundProfile, elevation: number): GroundLayer {
  if (elevation >= profile.groundSurfaceElevation) {
    return item(profile.layers, 0, "Ground profile has no layers.");
  }
  return profile.getLayerAtElevation(elevation);
}

function layerWeightContributions(
  profile: GroundProfile,
  polygon: readonly TrialWedgePoint[],
): TrialWedgeWeightContribution[] {
  return profile.layers
    .map((layer, index) => {
      const material = profile.getMaterial(layer.materialId);
      const topElevation = index === 0 ? Number.POSITIVE_INFINITY : layer.topElevation;
      const area = areaInsideHorizontalBand(polygon, layer.bottomElevation, topElevation);

      return {
        layerId: layer.id,
        materialId: material.id,
        area,
        unitWeight: material.unitWeight.bulk,
        weight: area * material.unitWeight.bulk,
      };
    })
    .filter(({ area }) => area > 1e-14);
}

function uniqueSorted(values: readonly number[], tolerance = 1e-12): number[] {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted.filter(
    (value, index) =>
      index === 0 || Math.abs(value - item(sorted, index - 1, "Missing value.")) > tolerance,
  );
}

export function evaluateLayeredPseudostaticTrialWedge(
  options?: LayeredPseudostaticTrialWedgeOptions,
): TrialWedgeCandidate | null {
  const {
    profile,
    layerStates,
    topElevation,
    bottomElevation,
    backfillInclination,
    wallInclinationFromVertical = 0,
    interfaceFrictionAngle = 0,
    surcharge,
    horizontalSeismicCoefficient,
    verticalSeismicCoefficient,
    slipPlaneAngle,
  } = options ?? {};
  const alpha = finite(Number(slipPlaneAngle), "slipPlaneAngle");
  const beta = finite(Number(backfillInclination), "backfillInclination");
  const wallInclination = finite(
    Number(wallInclinationFromVertical),
    "wallInclinationFromVertical",
  );
  const delta = finite(Number(interfaceFrictionAngle), "interfaceFrictionAngle");
  const kh = finite(Number(horizontalSeismicCoefficient), "horizontalSeismicCoefficient");
  const kv = finite(Number(verticalSeismicCoefficient), "verticalSeismicCoefficient");
  const normalizedTopElevation = Number(topElevation);
  const normalizedBottomElevation = Number(bottomElevation);
  const height = normalizedTopElevation - normalizedBottomElevation;
  const denominator = Math.tan(alpha) - Math.tan(beta);
  const wallTopX = height * Math.tan(wallInclination);
  const surfaceNormalProjection =
    Math.cos(wallInclination) - Math.sin(wallInclination) * Math.tan(beta);

  if (
    height <= 0 ||
    denominator <= 0 ||
    alpha <= 0 ||
    alpha >= Math.PI / 2 ||
    alpha + wallInclination >= Math.PI / 2 ||
    surfaceNormalProjection <= 1e-12 ||
    delta < 0 ||
    delta >= Math.PI / 2
  ) {
    return null;
  }
  if (profile === undefined) {
    throw new TypeError("Cannot read properties of undefined (reading 'layers')");
  }

  const intersectionX = (height - wallTopX * Math.tan(beta)) / denominator;
  const intersectionElevation = normalizedBottomElevation + intersectionX * Math.tan(alpha);
  const baseNormalProjection = Math.cos(alpha + wallInclination);
  const intersectionNormalCoordinate = (intersectionX * baseNormalProjection) / Math.cos(alpha);
  if (
    intersectionX <= wallTopX + 1e-12 ||
    intersectionNormalCoordinate <= 1e-12 ||
    baseNormalProjection <= 1e-12
  ) {
    return null;
  }

  const boundaryCoordinates = [0, intersectionNormalCoordinate];
  for (const layer of profile.layers) {
    for (const elevation of [layer.topElevation, layer.bottomElevation]) {
      const x = (elevation - normalizedBottomElevation) / Math.tan(alpha);
      const coordinate = (x * baseNormalProjection) / Math.cos(alpha);
      if (coordinate > 1e-12 && coordinate < intersectionNormalCoordinate - 1e-12) {
        boundaryCoordinates.push(coordinate);
      }
    }
  }

  const partitions = uniqueSorted(boundaryCoordinates);
  const wedgePolygon: TrialWedgePoint[] = [
    { x: 0, z: normalizedBottomElevation },
    { x: wallTopX, z: normalizedTopElevation },
    { x: intersectionX, z: intersectionElevation },
  ];
  const contributions: TrialWedgeSegment[] = [];
  let totalArea = 0;
  let totalWeight = 0;
  let horizontalBoundaryForce = 0;

  for (let index = 0; index < partitions.length - 1; index += 1) {
    const left = item(partitions, index, "Missing trial-wedge partition.");
    const right = item(partitions, index + 1, "Missing trial-wedge partition.");
    const midpointCoordinate = (left + right) / 2;
    const midpointX = (midpointCoordinate * Math.cos(alpha)) / baseNormalProjection;
    const baseElevation = normalizedBottomElevation + midpointX * Math.tan(alpha);
    const baseLayer = layerAtExtendedElevation(profile, baseElevation);
    if (layerStates === undefined) {
      throw new TypeError("Cannot read properties of undefined (reading 'get')");
    }
    const state = layerStates.get(baseLayer.id);
    if (!state) throw new Error(`Missing trial-wedge state for layer ${baseLayer.id}.`);
    const relativeAngle = alpha + wallInclination - state.frictionAngle;
    if (relativeAngle <= 1e-12) return null;

    let polygon: TrialWedgePoint[] =
      index === 0
        ? wedgePolygon
        : clipAtWallNormalCoordinate(
            wedgePolygon,
            left,
            true,
            wallInclination,
            normalizedBottomElevation,
          );
    polygon = clipAtWallNormalCoordinate(
      polygon,
      right,
      false,
      wallInclination,
      normalizedBottomElevation,
    );
    const weightContributions = layerWeightContributions(profile, polygon);
    const area = weightContributions.reduce((sum, contribution) => sum + contribution.area, 0);
    const weight = weightContributions.reduce((sum, contribution) => sum + contribution.weight, 0);
    const surfaceHorizontalWidth = (right - left) / surfaceNormalProjection;
    const surchargeForce = Number(surcharge) * surfaceHorizontalWidth;
    const baseLength = (right - left) / baseNormalProjection;
    const relativeCosine = Math.cos(relativeAngle);
    if (relativeCosine <= 1e-12) return null;

    const globalVerticalGravityForce = (1 - kv) * weight + surchargeForce;
    const globalHorizontalInertiaForce = kh * weight;
    const downwardWallTangentForce =
      globalVerticalGravityForce * Math.cos(wallInclination) +
      globalHorizontalInertiaForce * Math.sin(wallInclination);
    const adverseWallNormalForce =
      globalHorizontalInertiaForce * Math.cos(wallInclination) -
      globalVerticalGravityForce * Math.sin(wallInclination);
    const cohesionResistance =
      (state.cohesion * baseLength * Math.cos(state.frictionAngle)) / relativeCosine;
    const thrustContribution =
      downwardWallTangentForce * Math.tan(relativeAngle) +
      adverseWallNormalForce -
      cohesionResistance;

    totalArea += area;
    totalWeight += weight;
    horizontalBoundaryForce += thrustContribution;
    contributions.push({
      id: `wedge-segment-${index + 1}`,
      baseLayerId: baseLayer.id,
      baseMaterialId: baseLayer.materialId,
      parameterSetId: state.parameterSetId,
      stressBasis: state.stressBasis,
      leftWallNormalCoordinate: left,
      rightWallNormalCoordinate: right,
      baseLength,
      area,
      weight,
      weightContributions,
      surfaceHorizontalWidth,
      surchargeForce,
      frictionAngle: state.frictionAngle,
      cohesion: state.cohesion,
      globalVerticalGravityForce,
      globalHorizontalInertiaForce,
      downwardWallTangentForce,
      adverseWallNormalForce,
      cohesionResistance,
      thrustContribution,
    });
  }

  const firstContribution = item(contributions, 0, "No trial-wedge segment was generated.");
  const firstRelativeAngle = alpha + wallInclination - firstContribution.frictionAngle;
  const wallForceDenominator = Math.cos(firstRelativeAngle - delta);
  if (wallForceDenominator <= 1e-12) return null;
  const wallForceTransformationFactor = Math.cos(firstRelativeAngle) / wallForceDenominator;
  const rawThrust = horizontalBoundaryForce * wallForceTransformationFactor;

  return {
    slipPlaneAngle: alpha,
    wallInclinationFromVertical: wallInclination,
    interfaceFrictionAngle: delta,
    wallForceAngleFromHorizontal: delta - wallInclination,
    intersectionPoint: { x: intersectionX, elevation: intersectionElevation },
    area: totalArea,
    weight: totalWeight,
    horizontalBoundaryForce,
    wallForceTransformationFactor,
    rawThrust,
    thrust: Math.max(0, rawThrust),
    segments: contributions,
  };
}

function maximizeGoldenSection(
  evaluate: (angle: number) => TrialWedgeCandidate | null,
  left: number,
  right: number,
  tolerance: number,
  maxIterations: number,
): {
  candidate: TrialWedgeCandidate | null;
  iterations: number;
  bracket: { minimum: number; maximum: number };
} {
  const ratio = (Math.sqrt(5) - 1) / 2;
  let a = left;
  let b = right;
  let c = b - ratio * (b - a);
  let d = a + ratio * (b - a);
  let fc = evaluate(c);
  let fd = evaluate(d);
  let iterations = 0;

  const value = (candidate: TrialWedgeCandidate | null): number =>
    candidate?.rawThrust ?? Number.NEGATIVE_INFINITY;
  while (b - a > tolerance && iterations < maxIterations) {
    if (value(fc) > value(fd)) {
      b = d;
      d = c;
      fd = fc;
      c = b - ratio * (b - a);
      fc = evaluate(c);
    } else {
      a = c;
      c = d;
      fc = fd;
      d = a + ratio * (b - a);
      fd = evaluate(d);
    }
    iterations += 1;
  }

  const candidates = [fc, fd, evaluate((a + b) / 2)].filter(
    (candidate): candidate is TrialWedgeCandidate => candidate !== null,
  );
  return {
    candidate: candidates.reduce<TrialWedgeCandidate | null>(
      (best, candidate) =>
        best === null || candidate.rawThrust > best.rawThrust ? candidate : best,
      null,
    ),
    iterations,
    bracket: { minimum: a, maximum: b },
  };
}

export function optimizeLayeredPseudostaticTrialWedge(
  options?: OptimizeLayeredPseudostaticTrialWedgeOptions,
): LayeredPseudostaticTrialWedgeResult {
  const {
    profile,
    layerStates,
    topElevation,
    bottomElevation,
    backfillInclination = 0,
    wallInclinationFromVertical = 0,
    interfaceFrictionAngle = 0,
    surcharge = 0,
    horizontalSeismicCoefficient = 0,
    verticalSeismicCoefficient = 0,
    search,
  } = options ?? {};
  const searchOptions = search === undefined ? {} : search;
  const kh = finite(Number(horizontalSeismicCoefficient), "horizontalSeismicCoefficient");
  const kv = finite(Number(verticalSeismicCoefficient), "verticalSeismicCoefficient");
  const wallInclination = finite(
    Number(wallInclinationFromVertical),
    "wallInclinationFromVertical",
  );
  const delta = finite(Number(interfaceFrictionAngle), "interfaceFrictionAngle");
  const beta = finite(Number(backfillInclination), "backfillInclination");
  if (kh < 0) throw new Error("horizontalSeismicCoefficient must be non-negative.");
  if (kv <= -1 || kv >= 1) {
    throw new Error("verticalSeismicCoefficient must satisfy -1 < kv < 1.");
  }
  if (Math.abs(wallInclination) >= Math.PI / 2) {
    throw new Error("wallInclinationFromVertical must satisfy |i| < pi/2.");
  }
  if (delta < 0 || delta >= Math.PI / 2) {
    throw new Error("interfaceFrictionAngle must satisfy 0 <= delta < pi/2.");
  }
  if (Math.abs(beta) >= Math.PI / 2) {
    throw new Error("backfillInclination must satisfy |beta| < pi/2.");
  }

  const sampleCount = Number(searchOptions.sampleCount ?? 721);
  const tolerance = Number(searchOptions.angleTolerance ?? 1e-10);
  const maxRefinementIterations = Number(searchOptions.maxRefinementIterations ?? 100);
  if (!Number.isInteger(sampleCount) || sampleCount < 41 || sampleCount > 5001) {
    throw new Error("trial-wedge search.sampleCount must be an integer from 41 to 5001.");
  }
  if (!Number.isFinite(tolerance) || tolerance <= 0) {
    throw new Error("trial-wedge search.angleTolerance must be positive.");
  }

  if (layerStates === undefined) {
    throw new TypeError("Cannot read properties of undefined (reading 'values')");
  }
  const maximumFrictionAngle = Math.max(
    0,
    ...[...layerStates.values()].map(({ frictionAngle }) => frictionAngle),
  );
  const minimumAngle = Math.max(0, beta, maximumFrictionAngle - wallInclination) + 1e-7;
  const maximumAngle = Math.min(Math.PI / 2, Math.PI / 2 - wallInclination) - 1e-7;
  if (minimumAngle >= maximumAngle) {
    throw new Error("No admissible trial-wedge slip-plane angle exists.");
  }

  const evaluate = (slipPlaneAngle: number): TrialWedgeCandidate | null =>
    evaluateLayeredPseudostaticTrialWedge({
      profile,
      layerStates,
      topElevation,
      bottomElevation,
      backfillInclination: beta,
      wallInclinationFromVertical: wallInclination,
      interfaceFrictionAngle: delta,
      surcharge,
      horizontalSeismicCoefficient: kh,
      verticalSeismicCoefficient: kv,
      slipPlaneAngle,
    });
  const sampled: Array<TrialWedgeCandidate | null> = [];
  let bestIndex = -1;

  for (let index = 0; index < sampleCount; index += 1) {
    const angle = minimumAngle + ((maximumAngle - minimumAngle) * index) / (sampleCount - 1);
    const candidate = evaluate(angle);
    sampled.push(candidate);
    const bestCandidate =
      bestIndex >= 0 ? item(sampled, bestIndex, "Missing sampled candidate.") : null;
    if (
      candidate !== null &&
      (bestIndex < 0 || (bestCandidate !== null && candidate.rawThrust > bestCandidate.rawThrust))
    ) {
      bestIndex = index;
    }
  }

  if (bestIndex < 0) throw new Error("Trial-wedge search found no valid candidate.");
  const leftIndex = Math.max(0, bestIndex - 1);
  const rightIndex = Math.min(sampleCount - 1, bestIndex + 1);
  const leftAngle = minimumAngle + ((maximumAngle - minimumAngle) * leftIndex) / (sampleCount - 1);
  const rightAngle =
    minimumAngle + ((maximumAngle - minimumAngle) * rightIndex) / (sampleCount - 1);
  const refined = maximizeGoldenSection(
    evaluate,
    leftAngle,
    rightAngle,
    tolerance,
    maxRefinementIterations,
  );
  const sampledBest = item(sampled, bestIndex, "Missing sampled candidate.");
  if (sampledBest === null) throw new Error("Trial-wedge search found no valid candidate.");
  const critical =
    refined.candidate !== null && refined.candidate.rawThrust > sampledBest.rawThrust
      ? refined.candidate
      : sampledBest;
  const envelopeStride = Math.max(1, Math.floor(sampleCount / 72));

  return {
    critical,
    search: {
      sampleCount,
      validCandidateCount: sampled.filter((candidate) => candidate !== null).length,
      minimumAngle,
      maximumAngle,
      angleTolerance: tolerance,
      refinementIterations: refined.iterations,
      refinedBracket: refined.bracket,
      envelope: sampled.flatMap((candidate, index) =>
        candidate !== null && (index % envelopeStride === 0 || index === bestIndex)
          ? [
              {
                slipPlaneAngle: candidate.slipPlaneAngle,
                rawThrust: candidate.rawThrust,
                thrust: candidate.thrust,
              },
            ]
          : [],
      ),
    },
    metadata: {
      method: "constant-inclination-layered-trial-wedge",
      references: [
        USACE_LAYERED_WEDGE_REFERENCE,
        FHWA_PSEUDOSTATIC_WEDGE_REFERENCE,
        CALTRANS_GENERAL_WEDGE_REFERENCE,
      ],
    },
  };
}

export const LAYERED_PSEUDOSTATIC_TRIAL_WEDGE_REFERENCES = Object.freeze([
  USACE_LAYERED_WEDGE_REFERENCE,
  FHWA_PSEUDOSTATIC_WEDGE_REFERENCE,
  CALTRANS_GENERAL_WEDGE_REFERENCE,
]);
