import type { ConstitutiveLaw } from "../../../../domain/constitutive-laws/types.js";
import type { ReinforcedConcreteSection } from "../../../../domain/geometry/ReinforcedConcreteSection.js";
import {
  getConcreteProjectedBounds,
  neutralAxisDirection,
  projectionAt,
  resolveConcreteStrainExtremes,
  type NeutralAxisDirection,
} from "../RCSectionStrainExtremes.js";
import { StrainField, createAffineStrainField } from "../StrainField.js";
import type { AffineStrainField, SectionState, StrainFieldLike } from "../types.js";
import type {
  MomentCurvatureCompressedEdge,
  MomentCurvatureCompressedSide,
  MomentCurvatureCompressionEdge,
  MomentCurvatureDuctility,
  MomentCurvatureInterpolatedPoint,
  MomentCurvatureMaximum,
  MomentCurvaturePoint,
  MomentCurvatureState,
  MomentCurvatureStateCheck,
  MomentCurvatureStateKey,
} from "./types.js";

export const DEFAULT_EPS0_MIN = -0.08;
export const DEFAULT_EPS0_MAX = 0.08;
export const LIMIT_TOLERANCE = 1e-9;
export const EVENT_UTILIZATION_TOLERANCE = 1e-10;
export const EVENT_MAX_ITERATIONS = 80;
export const NTC2018_ULTIMATE_MOMENT_DROP = 0.15;
export const POST_ULTIMATE_MOMENT_TOLERANCE = 1e-9;

interface ExtendedConstitutiveLaw extends ConstitutiveLaw {
  peakCompressionStrain?: () => number;
  yieldStrain?: () => number;
  ec2?: number;
  ec3?: number;
  ec4?: number;
  fyd?: number;
  Es?: number;
}

export function round(value: number | null | undefined, decimals = 12): number | null | undefined {
  return Number.isFinite(value) ? Number((value as number).toFixed(decimals)) : value;
}

export function resolveConcreteUltimateCompressionStrain(concreteLaw: ConstitutiveLaw): number {
  const compressionLimit = concreteLaw?.strainLimits?.().compression;

  if (!Number.isFinite(compressionLimit) || compressionLimit === 0) {
    return 0.0035;
  }

  return Math.abs(compressionLimit as number);
}

export function resolveConcretePeakCompressionStrain(concreteLaw: ConstitutiveLaw): number | null {
  const law = concreteLaw as ExtendedConstitutiveLaw;
  const peak = law.peakCompressionStrain?.();

  if (Number.isFinite(peak) && (peak as number) >= 0) {
    return peak as number;
  }

  for (const key of ["ec2", "ec3", "ec4"] as const) {
    const value = law[key];
    if (Number.isFinite(value) && (value as number) >= 0) {
      return value as number;
    }
  }

  return null;
}

export function resolveSteelYieldStrain(steelLaw: ConstitutiveLaw): number | null {
  const law = steelLaw as ExtendedConstitutiveLaw;
  const yieldStrain = law.yieldStrain?.();

  if (Number.isFinite(yieldStrain) && (yieldStrain as number) > 0) {
    return Math.abs(yieldStrain as number);
  }

  if (Number.isFinite(law.fyd) && Number.isFinite(law.Es)) {
    return Math.abs((law.fyd as number) / (law.Es as number));
  }

  return null;
}

export function resolveSteelUltimateTensionStrain(steelLaw: ConstitutiveLaw): number | null {
  const tensionLimit = steelLaw?.strainLimits?.().tension;

  return Number.isFinite(tensionLimit) && (tensionLimit as number) > 0
    ? Math.abs(tensionLimit as number)
    : null;
}

export function resolveCompressedSide({
  compressedSide = null,
  compressedEdge = "top",
}: {
  compressedSide?: MomentCurvatureCompressedSide | null;
  compressedEdge?: MomentCurvatureCompressedEdge;
}): MomentCurvatureCompressedSide {
  if (compressedSide != null) {
    if (!["positive", "negative"].includes(compressedSide)) {
      throw new Error(`Unsupported compressed side: ${compressedSide}.`);
    }

    return compressedSide;
  }

  if (compressedEdge === "top") {
    return "positive";
  }

  if (compressedEdge === "bottom") {
    return "negative";
  }

  throw new Error(`Unsupported compressed edge: ${String(compressedEdge)}.`);
}

export function resolveUniaxialCompressedEdge({
  theta,
  compressedSide,
}: {
  theta: number;
  compressedSide: MomentCurvatureCompressedSide;
}): MomentCurvatureCompressedEdge | null {
  if (neutralAxisDirection(theta).theta !== 0) {
    return null;
  }

  return compressedSide === "positive" ? "top" : "bottom";
}

export function buildOrientedStrainField({
  eps0,
  curvature,
  theta,
  direction = null,
  compressedSide,
  includeResponseDetails = false,
}: {
  eps0: number;
  curvature: number;
  theta: number;
  direction?: NeutralAxisDirection | null;
  compressedSide: MomentCurvatureCompressedSide;
  includeResponseDetails?: boolean;
}): StrainFieldLike {
  const absoluteCurvature = Math.abs(curvature);
  const resolvedDirection = direction ?? neutralAxisDirection(theta);
  const sideSign = compressedSide === "positive" ? 1 : -1;
  const coefficients: AffineStrainField = {
    eps0,
    kappaY: sideSign * absoluteCurvature * resolvedDirection.sin,
    kappaZ: sideSign * absoluteCurvature * resolvedDirection.cos,
  };

  return includeResponseDetails
    ? new StrainField(coefficients)
    : createAffineStrainField(coefficients);
}

export function signedEngineeringCurvature({
  curvature,
  compressedSide = null,
  compressedEdge = "top",
}: {
  curvature: number;
  compressedSide?: MomentCurvatureCompressedSide | null;
  compressedEdge?: MomentCurvatureCompressedEdge;
}): number {
  const absoluteCurvature = Math.abs(curvature);
  const side = resolveCompressedSide({
    compressedSide,
    compressedEdge,
  });
  return side === "positive" ? absoluteCurvature : -absoluteCurvature;
}

export function resolveConcreteCompressionEdge({
  section,
  strainField,
}: {
  section: ReinforcedConcreteSection;
  strainField: StrainFieldLike;
}): Omit<MomentCurvatureCompressionEdge, "edge" | "side"> {
  return resolveConcreteStrainExtremes({
    section,
    strainField,
  }).compression;
}

export function createStateCheck({
  id,
  material,
  mode,
  demand,
  limit,
}: Omit<MomentCurvatureStateCheck, "utilizationRatio" | "reached">): MomentCurvatureStateCheck {
  const utilizationRatio = limit > 0 ? demand / limit : Number.POSITIVE_INFINITY;

  return {
    id,
    material,
    mode,
    demand,
    limit,
    utilizationRatio,
    reached: utilizationRatio >= 1,
  };
}

export function resolveLimitState({
  state,
  concreteLaw,
  steelLaw,
  concreteCompressionEdge,
}: {
  state: SectionState;
  concreteLaw: ConstitutiveLaw;
  steelLaw: ConstitutiveLaw;
  concreteCompressionEdge: MomentCurvatureCompressionEdge;
}): MomentCurvatureState {
  const concreteLimits = concreteLaw?.strainLimits?.() ?? {};
  const steelLimits = steelLaw?.strainLimits?.() ?? {};
  const checks: MomentCurvatureStateCheck[] = [];

  if (Number.isFinite(concreteLimits.compression)) {
    const limit = Math.abs(concreteLimits.compression as number);
    checks.push(
      createStateCheck({
        id: "concrete-compression-strain",
        material: "concrete",
        mode: "ultimate-compression",
        demand: concreteCompressionEdge.demand,
        limit,
      }),
    );
  }

  if (Number.isFinite(steelLimits.tension)) {
    const limit = Math.abs(steelLimits.tension as number);
    const demand = Math.max(
      0,
      state.extremes.maxSteelTensionStrain?.strain ?? state.extremes.maxSteelTension?.strain ?? 0,
    );
    checks.push(
      createStateCheck({
        id: "steel-tension-strain",
        material: "steel",
        mode: "ultimate-tension",
        demand,
        limit,
      }),
    );
  }

  if (Number.isFinite(steelLimits.compression)) {
    const limit = Math.abs(steelLimits.compression as number);
    const demand = Math.max(
      0,
      -(
        state.extremes.maxSteelCompressionStrain?.strain ??
        state.extremes.maxSteelCompression?.strain ??
        0
      ),
    );
    checks.push(
      createStateCheck({
        id: "steel-compression-strain",
        material: "steel",
        mode: "ultimate-compression",
        demand,
        limit,
      }),
    );
  }

  return buildState(checks);
}

function buildState(checks: MomentCurvatureStateCheck[]): MomentCurvatureState {
  const governing = checks.reduce<MomentCurvatureStateCheck | null>(
    (current, check) =>
      current == null || check.utilizationRatio > current.utilizationRatio ? check : current,
    null,
  );
  const reachedChecks = checks.filter((check) => check.reached);

  return {
    reached: reachedChecks.length > 0,
    governing,
    reachedChecks,
    checks,
  };
}

export function resolveFirstYieldState({
  state,
  concreteLaw,
  steelLaw,
  concreteCompressionEdge,
}: {
  state: SectionState;
  concreteLaw: ConstitutiveLaw;
  steelLaw: ConstitutiveLaw;
  concreteCompressionEdge: MomentCurvatureCompressionEdge;
}): MomentCurvatureState {
  const checks: MomentCurvatureStateCheck[] = [];
  const steelYieldStrain = resolveSteelYieldStrain(steelLaw);
  const concretePeakStrain = resolveConcretePeakCompressionStrain(concreteLaw);

  if (Number.isFinite(steelYieldStrain) && (steelYieldStrain as number) > 0) {
    const tensionDemand = Math.max(
      0,
      state.extremes.maxSteelTensionStrain?.strain ?? state.extremes.maxSteelTension?.strain ?? 0,
    );
    checks.push(
      createStateCheck({
        id: "steel-tension-yield",
        material: "steel",
        mode: "yield-tension",
        demand: tensionDemand,
        limit: steelYieldStrain as number,
      }),
    );

    const compressionDemand = Math.max(
      0,
      -(
        state.extremes.maxSteelCompressionStrain?.strain ??
        state.extremes.maxSteelCompression?.strain ??
        0
      ),
    );
    checks.push(
      createStateCheck({
        id: "steel-compression-yield",
        material: "steel",
        mode: "yield-compression",
        demand: compressionDemand,
        limit: steelYieldStrain as number,
      }),
    );
  }

  if (Number.isFinite(concretePeakStrain) && (concretePeakStrain as number) > 0) {
    checks.push(
      createStateCheck({
        id: "concrete-compression-peak",
        material: "concrete",
        mode: "peak-compression",
        demand: concreteCompressionEdge.demand,
        limit: concretePeakStrain as number,
      }),
    );
  }

  return buildState(checks);
}

export function getStateCheck(
  point: Partial<Record<MomentCurvatureStateKey, MomentCurvatureState>>,
  stateKey: MomentCurvatureStateKey,
  checkId: string,
): MomentCurvatureStateCheck | null {
  return point[stateKey]?.checks.find((check) => check.id === checkId) ?? null;
}

export function annotateEventPoint(
  point: MomentCurvaturePoint,
  stateKey: MomentCurvatureStateKey,
  checkId: string,
): MomentCurvaturePoint {
  const event = getStateCheck(point, stateKey, checkId);

  if (!event) {
    return point;
  }

  return {
    ...point,
    [stateKey]: {
      ...point[stateKey],
      reached: true,
      governing: event,
      event,
      eventType: event.id,
      eventMaterial: event.material,
      eventMode: event.mode,
    },
  };
}

export function annotateMomentDropPoint(
  point: MomentCurvaturePoint,
  {
    referenceMoment,
    dropRatio,
  }: {
    referenceMoment: number;
    dropRatio: number;
  },
): MomentCurvaturePoint {
  const moment = absoluteMoment(point);
  const targetMoment = (1 - dropRatio) * referenceMoment;
  const actualDropRatio = referenceMoment > 0 ? 1 - moment / referenceMoment : null;

  return {
    ...point,
    postUltimateState: {
      referenceMoment,
      reference: "material-ultimate-moment",
      targetMoment,
      moment,
      targetDropRatio: dropRatio,
      actualDropRatio,
      reached: moment <= targetMoment,
    },
    postPeakState: {
      maximumMoment: referenceMoment,
      targetMoment,
      moment,
      targetDropRatio: dropRatio,
      actualDropRatio,
      reached: moment <= targetMoment,
    },
  };
}

export interface BalancedFailureGeometry {
  theta: number;
  compressedSide: MomentCurvatureCompressedSide;
  absoluteCurvature: number;
  eps0: number;
  kappaY: number;
  kappaZ: number;
  compressedEdgeProjection: number;
  tensionReinforcementProjection: number;
  compressedEdgeY: number | null;
  tensionReinforcementY: number | null;
  effectiveDepth: number;
  neutralAxisDepth: number;
  ultimateCompressionStrain: number;
  ultimateSteelTensionStrain: number;
}

export function resolveBalancedFailureGeometry({
  section,
  concreteLaw,
  steelLaw,
  theta = 0,
  compressedSide = null,
  compressedEdge = "top",
}: {
  section: ReinforcedConcreteSection;
  concreteLaw: ConstitutiveLaw;
  steelLaw: ConstitutiveLaw;
  theta?: number;
  compressedSide?: MomentCurvatureCompressedSide | null;
  compressedEdge?: MomentCurvatureCompressedEdge;
}): BalancedFailureGeometry | null {
  const ultimateCompressionStrain = resolveConcreteUltimateCompressionStrain(concreteLaw);
  const ultimateSteelTensionStrain = resolveSteelUltimateTensionStrain(steelLaw);
  const reinforcementBars = section.getReinforcementBars();

  if (
    !Number.isFinite(ultimateSteelTensionStrain) ||
    (ultimateSteelTensionStrain as number) <= 0 ||
    reinforcementBars.length === 0
  ) {
    return null;
  }

  const direction = neutralAxisDirection(theta);
  const side = resolveCompressedSide({
    compressedSide,
    compressedEdge,
  });
  const sideSign = side === "positive" ? 1 : -1;
  const projectedBounds = getConcreteProjectedBounds(section, direction.theta);
  const reinforcementProjections = reinforcementBars.map((bar) =>
    projectionAt(direction.theta, bar as { y: number; z: number }),
  );
  const compressedEdgeProjection =
    side === "positive" ? projectedBounds.maximum.projection : projectedBounds.minimum.projection;
  const tensionReinforcementProjection =
    side === "positive"
      ? Math.min(...reinforcementProjections)
      : Math.max(...reinforcementProjections);
  const effectiveDepth = sideSign * (compressedEdgeProjection - tensionReinforcementProjection);

  if (!Number.isFinite(effectiveDepth) || effectiveDepth <= 0) {
    return null;
  }

  const absoluteCurvature =
    (ultimateCompressionStrain + (ultimateSteelTensionStrain as number)) / effectiveDepth;
  const kappaY = sideSign * absoluteCurvature * direction.sin;
  const kappaZ = sideSign * absoluteCurvature * direction.cos;
  const eps0 = -ultimateCompressionStrain + sideSign * absoluteCurvature * compressedEdgeProjection;

  return {
    theta: direction.theta,
    compressedSide: side,
    absoluteCurvature,
    eps0,
    kappaY,
    kappaZ,
    compressedEdgeProjection,
    tensionReinforcementProjection,
    compressedEdgeY: direction.theta === 0 ? compressedEdgeProjection : null,
    tensionReinforcementY: direction.theta === 0 ? tensionReinforcementProjection : null,
    effectiveDepth,
    neutralAxisDepth: ultimateCompressionStrain / absoluteCurvature,
    ultimateCompressionStrain,
    ultimateSteelTensionStrain: ultimateSteelTensionStrain as number,
  };
}

export function neutralAxisY(strainField: StrainFieldLike): number | null {
  if (!Number.isFinite(strainField.kappaZ) || Math.abs(strainField.kappaZ as number) < 1e-18) {
    return null;
  }

  return (strainField.eps0 as number) / (strainField.kappaZ as number);
}

export function neutralAxisProjection({
  strainField,
  compressedSide,
}: {
  strainField: StrainFieldLike;
  compressedSide: MomentCurvatureCompressedSide;
}): number | null {
  const curvature = Math.hypot(strainField.kappaY as number, strainField.kappaZ as number);

  if (!Number.isFinite(curvature) || curvature < 1e-18) {
    return null;
  }

  const sideSign = compressedSide === "positive" ? 1 : -1;
  return (strainField.eps0 as number) / (sideSign * curvature);
}

export function projectedMoment(
  point: Pick<MomentCurvaturePoint, "theta" | "Mx" | "My"> | null | undefined,
): number {
  const direction = neutralAxisDirection(point?.theta ?? 0);
  return (point?.Mx ?? 0) * direction.cos + (point?.My ?? 0) * direction.sin;
}

export function absoluteMoment(
  point: Pick<MomentCurvaturePoint, "theta" | "Mx" | "My"> | null | undefined,
): number {
  return Math.abs(projectedMoment(point));
}

export function findMaximumMomentPoint(
  points: MomentCurvaturePoint[],
): MomentCurvatureMaximum | null {
  return points.reduce<MomentCurvatureMaximum | null>((current, point, index) => {
    const moment = absoluteMoment(point);

    if (current == null || moment > current.moment) {
      return { point, index, moment };
    }

    return current;
  }, null);
}

export function interpolateCurvatureAtMomentDrop({
  points,
  maximumIndex,
  targetMoment,
  compressedEdge,
}: {
  points: MomentCurvaturePoint[];
  maximumIndex: number;
  targetMoment: number;
  compressedEdge: MomentCurvatureCompressedEdge;
}): MomentCurvatureInterpolatedPoint | null {
  for (let index = maximumIndex + 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];

    if (previous === undefined || current === undefined) {
      continue;
    }

    const previousMoment = absoluteMoment(previous);
    const currentMoment = absoluteMoment(current);

    if (previousMoment >= targetMoment && currentMoment <= targetMoment) {
      if (Math.abs(previousMoment - currentMoment) < 1e-12) {
        const compressedSide = current.compressedSide ?? previous.compressedSide ?? null;

        return {
          theta: current.theta ?? previous.theta ?? 0,
          compressedSide,
          absoluteCurvature: current.absoluteCurvature,
          curvature: signedEngineeringCurvature({
            curvature: current.absoluteCurvature,
            compressedSide,
            compressedEdge,
          }),
          Mx: current.Mx,
          My: current.My,
          source: "15-percent-post-peak-drop",
          interpolation: "flat-segment",
        };
      }

      const ratio = (previousMoment - targetMoment) / (previousMoment - currentMoment);
      const absoluteCurvature =
        previous.absoluteCurvature +
        ratio * (current.absoluteCurvature - previous.absoluteCurvature);
      const mx = previous.Mx + ratio * (current.Mx - previous.Mx);
      const my = previous.My + ratio * (current.My - previous.My);
      const compressedSide = current.compressedSide ?? previous.compressedSide ?? null;

      return {
        theta: current.theta ?? previous.theta ?? 0,
        compressedSide,
        absoluteCurvature,
        curvature: signedEngineeringCurvature({
          curvature: absoluteCurvature,
          compressedSide,
          compressedEdge,
        }),
        Mx: mx,
        My: my,
        source: "15-percent-post-peak-drop",
        interpolation: "linear-moment-curvature",
      };
    }
  }

  return null;
}

export function resolveUltimateDuctilityPoint({
  points,
  maximum,
  failurePoint,
  compressedEdge,
}: {
  points: MomentCurvaturePoint[];
  maximum: MomentCurvatureMaximum | null;
  failurePoint: MomentCurvaturePoint | null;
  compressedEdge: MomentCurvatureCompressedEdge;
}): MomentCurvatureInterpolatedPoint | null {
  if (!maximum) {
    return null;
  }

  const dropPoint = interpolateCurvatureAtMomentDrop({
    points,
    maximumIndex: maximum.index,
    targetMoment: (1 - NTC2018_ULTIMATE_MOMENT_DROP) * maximum.moment,
    compressedEdge,
  });
  const materialPoint =
    failurePoint == null
      ? null
      : {
          absoluteCurvature: failurePoint.absoluteCurvature,
          curvature: failurePoint.curvature,
          Mx: failurePoint.Mx,
          My: failurePoint.My,
          source: "material-ultimate-strain",
          interpolation: "solved-point",
        };

  if (dropPoint && materialPoint) {
    return dropPoint.absoluteCurvature <= materialPoint.absoluteCurvature
      ? dropPoint
      : materialPoint;
  }

  if (dropPoint) {
    return dropPoint;
  }

  if (materialPoint) {
    return materialPoint;
  }

  const lastPoint = points.at(-1);

  if (!lastPoint) {
    return null;
  }

  return {
    absoluteCurvature: lastPoint.absoluteCurvature,
    curvature: lastPoint.curvature,
    Mx: lastPoint.Mx,
    My: lastPoint.My,
    source: "last-analysis-point",
    interpolation: "solved-point",
  };
}

export function resolveNtc2018Ductility({
  points,
  firstYieldPoint,
  failurePoint,
  compressedEdge,
}: {
  points: MomentCurvaturePoint[];
  firstYieldPoint: MomentCurvaturePoint | null;
  failurePoint: MomentCurvaturePoint | null;
  compressedEdge: MomentCurvatureCompressedEdge;
}): MomentCurvatureDuctility | null {
  if (!Array.isArray(points) || points.length === 0 || !firstYieldPoint) {
    return null;
  }

  const maximum = findMaximumMomentPoint(points);
  const momentDropPoint =
    maximum == null
      ? null
      : interpolateCurvatureAtMomentDrop({
          points,
          maximumIndex: maximum.index,
          targetMoment: (1 - NTC2018_ULTIMATE_MOMENT_DROP) * maximum.moment,
          compressedEdge,
        });
  const materialUltimatePoint =
    failurePoint == null
      ? null
      : {
          absoluteCurvature: failurePoint.absoluteCurvature,
          curvature: failurePoint.curvature,
          Mx: failurePoint.Mx,
          My: failurePoint.My,
          source: "material-ultimate-strain",
          interpolation: "solved-point",
        };
  const ultimatePoint = resolveUltimateDuctilityPoint({
    points,
    maximum,
    failurePoint,
    compressedEdge,
  });
  const phiPrimeYd = firstYieldPoint.absoluteCurvature;
  const mPrimeYd = absoluteMoment(firstYieldPoint);
  const mRd = maximum?.moment ?? null;
  const phiYd =
    Number.isFinite(phiPrimeYd) && Number.isFinite(mPrimeYd) && Number.isFinite(mRd) && mPrimeYd > 0
      ? phiPrimeYd * ((mRd as number) / mPrimeYd)
      : null;
  const phiU = ultimatePoint?.absoluteCurvature ?? null;

  return {
    reference: "NTC2018 4.1.2.3.4.2",
    phiPrimeYd,
    mPrimeYd,
    mRd,
    phiYd,
    phiU,
    curvatureDuctilityRatio:
      Number.isFinite(phiU) && Number.isFinite(phiYd) && (phiYd as number) > 0
        ? (phiU as number) / (phiYd as number)
        : null,
    firstYieldPoint,
    maximumMomentPoint: maximum?.point ?? null,
    momentDropPoint,
    materialUltimatePoint,
    ultimatePoint,
    ultimateMomentDropRatio: NTC2018_ULTIMATE_MOMENT_DROP,
    firstYieldGoverning: firstYieldPoint.firstYieldState?.governing?.id ?? null,
    ultimateCurvatureSource: ultimatePoint?.source ?? null,
  };
}

export function defaultCurvatureMax({
  section,
  concreteLaw,
  steelLaw,
  theta = 0,
  compressedSide = null,
  compressedEdge = "top",
}: {
  section: ReinforcedConcreteSection;
  concreteLaw: ConstitutiveLaw;
  steelLaw: ConstitutiveLaw;
  theta?: number;
  compressedSide?: MomentCurvatureCompressedSide | null;
  compressedEdge?: MomentCurvatureCompressedEdge;
}): number {
  const balancedGeometry = resolveBalancedFailureGeometry({
    section,
    concreteLaw,
    steelLaw,
    theta,
    compressedSide,
    compressedEdge,
  });

  if (balancedGeometry) {
    return balancedGeometry.absoluteCurvature;
  }

  const projectedBounds = getConcreteProjectedBounds(section, theta);
  const height = projectedBounds.maximum.projection - projectedBounds.minimum.projection;

  if (!Number.isFinite(height) || height <= 0) {
    throw new Error("RCMomentCurvatureAnalyzer requires a positive section height.");
  }

  return (2.5 * resolveConcreteUltimateCompressionStrain(concreteLaw)) / height;
}

export function summarizeStateCheck(
  check: MomentCurvatureStateCheck | null | undefined,
): Record<string, unknown> | null {
  if (check == null) {
    return null;
  }

  return {
    id: check.id,
    material: check.material,
    mode: check.mode,
    demand: round(check.demand),
    limit: round(check.limit),
    utilizationRatio: round(check.utilizationRatio, 9),
    reached: check.reached,
  };
}
