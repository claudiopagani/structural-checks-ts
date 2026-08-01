import { EVENT_CURVATURE_TOLERANCE } from "./MomentCurvatureSampling.js";
import {
  EVENT_MAX_ITERATIONS,
  EVENT_UTILIZATION_TOLERANCE,
  POST_ULTIMATE_MOMENT_TOLERANCE,
  absoluteMoment,
  annotateEventPoint,
  annotateMomentDropPoint,
  getStateCheck,
} from "./RCMomentCurvaturePolicies.js";
import type {
  MomentCurvatureAnalyzerLike,
  MomentCurvaturePoint,
  MomentCurvatureSolveOptions,
  MomentCurvatureStateKey,
} from "./types.js";

type EventSolveOptions = Omit<MomentCurvatureSolveOptions, "curvature" | "eps0Hint">;

export interface MomentDropLocatorOptions extends EventSolveOptions {
  lowerPoint: MomentCurvaturePoint;
  upperPoint: MomentCurvaturePoint;
  referenceMoment?: number | null;
  maximumMoment?: number;
  dropRatio: number;
}

export interface EventLocatorOptions extends EventSolveOptions {
  minCurvature: number;
  maxCurvature: number;
  lowerPoint?: MomentCurvaturePoint | null;
  upperPoint?: MomentCurvaturePoint | null;
}

export interface GenericEventLocatorOptions extends EventLocatorOptions {
  stateKey: MomentCurvatureStateKey;
}

export class RCMomentCurvatureEventLocator {
  readonly analyzer: MomentCurvatureAnalyzerLike;

  constructor(analyzer: MomentCurvatureAnalyzerLike) {
    this.analyzer = analyzer;
  }

  findMomentDropPoint({
    lowerPoint,
    upperPoint,
    referenceMoment = null,
    maximumMoment,
    dropRatio,
    ...options
  }: MomentDropLocatorOptions): MomentCurvaturePoint {
    const resolvedReferenceMoment = referenceMoment ?? maximumMoment;
    const targetMoment = (1 - dropRatio) * (resolvedReferenceMoment as number);

    if (
      !Number.isFinite(resolvedReferenceMoment) ||
      (resolvedReferenceMoment as number) <= POST_ULTIMATE_MOMENT_TOLERANCE ||
      !lowerPoint ||
      !upperPoint ||
      lowerPoint.absoluteCurvature >= upperPoint.absoluteCurvature ||
      absoluteMoment(lowerPoint) < targetMoment ||
      absoluteMoment(upperPoint) > targetMoment
    ) {
      throw new Error(
        "RCMomentCurvatureAnalyzer requires a valid post-ultimate moment-drop bracket.",
      );
    }

    let lower = lowerPoint;
    let upper = upperPoint;

    for (let iteration = 0; iteration < EVENT_MAX_ITERATIONS; iteration += 1) {
      const lowerMoment = absoluteMoment(lower);
      const upperMoment = absoluteMoment(upper);
      const denominator = lowerMoment - upperMoment;
      const linearRatio = denominator > 0 ? (lowerMoment - targetMoment) / denominator : 0.5;
      const boundedRatio = Math.max(0.1, Math.min(0.9, linearRatio));
      const curvature =
        lower.absoluteCurvature +
        boundedRatio * (upper.absoluteCurvature - lower.absoluteCurvature);
      const eps0Hint = lower.eps0 + boundedRatio * (upper.eps0 - lower.eps0);
      const point = this.analyzer.solveAtCurvature({
        ...options,
        curvature,
        eps0Hint,
      });
      const moment = absoluteMoment(point);

      if (moment > targetMoment) {
        lower = point;
      } else {
        upper = point;
      }

      if (
        Math.abs(moment - targetMoment) <=
          Math.max(1, (resolvedReferenceMoment as number) * 1e-8) ||
        upper.absoluteCurvature - lower.absoluteCurvature <= EVENT_CURVATURE_TOLERANCE
      ) {
        break;
      }
    }

    return annotateMomentDropPoint(upper, {
      referenceMoment: resolvedReferenceMoment as number,
      dropRatio,
    });
  }

  findFirstYieldPoint(options: EventLocatorOptions): MomentCurvaturePoint {
    return this.findEventPoint({
      ...options,
      stateKey: "firstYieldState",
    });
  }

  findFailurePoint(options: EventLocatorOptions): MomentCurvaturePoint {
    return this.findEventPoint({
      ...options,
      stateKey: "limitState",
    });
  }

  findEventPoint({
    minCurvature,
    maxCurvature,
    stateKey,
    lowerPoint: suppliedLowerPoint = null,
    upperPoint: suppliedUpperPoint = null,
    ...options
  }: GenericEventLocatorOptions): MomentCurvaturePoint {
    if (
      !Number.isFinite(minCurvature) ||
      !Number.isFinite(maxCurvature) ||
      minCurvature < 0 ||
      minCurvature >= maxCurvature
    ) {
      throw new Error("RCMomentCurvatureAnalyzer requires a valid event-curvature bracket.");
    }

    const cache = new Map<string, MomentCurvaturePoint>();
    const solve = (curvature: number, eps0Hint: number | null = null): MomentCurvaturePoint => {
      const key = curvature.toPrecision(17);

      if (!cache.has(key)) {
        cache.set(
          key,
          this.analyzer.solveAtCurvature({
            ...options,
            curvature,
            eps0Hint,
          }),
        );
      }

      return cache.get(key) as MomentCurvaturePoint;
    };
    const hasMatchingCurvature = (point: MomentCurvaturePoint | null, curvature: number): boolean =>
      point != null &&
      Number.isFinite(point.absoluteCurvature) &&
      Math.abs(point.absoluteCurvature - curvature) <= EVENT_CURVATURE_TOLERANCE;
    const lowerPoint = hasMatchingCurvature(suppliedLowerPoint, minCurvature)
      ? (suppliedLowerPoint as MomentCurvaturePoint)
      : solve(minCurvature, suppliedLowerPoint?.eps0 ?? null);
    const upperPoint = hasMatchingCurvature(suppliedUpperPoint, maxCurvature)
      ? (suppliedUpperPoint as MomentCurvaturePoint)
      : solve(maxCurvature, suppliedUpperPoint?.eps0 ?? lowerPoint.eps0);

    cache.set(minCurvature.toPrecision(17), lowerPoint);
    cache.set(maxCurvature.toPrecision(17), upperPoint);
    const utilizationTolerance = Math.min(
      EVENT_UTILIZATION_TOLERANCE,
      this.analyzer.limitRootSolver.tolerance,
    );
    const maxIterations = Math.max(
      EVENT_MAX_ITERATIONS,
      this.analyzer.limitRootSolver.maxIterations,
    );
    const candidateIds = upperPoint[stateKey].checks
      .filter((upperCheck) => {
        const lowerCheck = getStateCheck(lowerPoint, stateKey, upperCheck.id);
        return upperCheck.utilizationRatio >= 1 && (lowerCheck?.utilizationRatio ?? 0) < 1;
      })
      .map((check) => check.id);

    if (candidateIds.length === 0) {
      const alreadyReached = lowerPoint[stateKey].checks.find(
        (check) => check.utilizationRatio >= 1,
      );

      if (alreadyReached) {
        return annotateEventPoint(lowerPoint, stateKey, alreadyReached.id);
      }

      throw new Error(`RCMomentCurvatureAnalyzer could not bracket a ${stateKey} event.`);
    }

    const candidates = candidateIds.map((checkId) => {
      let lowerCurvature = minCurvature;
      let upperCurvature = maxCurvature;
      let lower = lowerPoint;
      let upper = upperPoint;

      for (let iteration = 0; iteration < maxIterations; iteration += 1) {
        const middleCurvature = 0.5 * (lowerCurvature + upperCurvature);
        const curvatureRatio =
          (middleCurvature - lowerCurvature) / (upperCurvature - lowerCurvature);
        const eps0Hint = lower.eps0 + curvatureRatio * (upper.eps0 - lower.eps0);
        const middle = solve(middleCurvature, eps0Hint);
        const middleCheck = getStateCheck(middle, stateKey, checkId);

        if (!middleCheck) {
          throw new Error(`RCMomentCurvatureAnalyzer could not evaluate event ${checkId}.`);
        }

        if (middleCheck.utilizationRatio >= 1) {
          upperCurvature = middleCurvature;
          upper = middle;
        } else {
          lowerCurvature = middleCurvature;
          lower = middle;
        }

        const upperCheck = getStateCheck(upper, stateKey, checkId);
        const interval = upperCurvature - lowerCurvature;

        if (
          interval <= EVENT_CURVATURE_TOLERANCE ||
          Math.abs((upperCheck?.utilizationRatio ?? 0) - 1) <= utilizationTolerance
        ) {
          break;
        }
      }

      return annotateEventPoint(upper, stateKey, checkId);
    });

    const earliest = candidates.reduce<MomentCurvaturePoint | null>(
      (selected, candidate) =>
        selected == null || candidate.absoluteCurvature < selected.absoluteCurvature
          ? candidate
          : selected,
      null,
    );

    if (earliest == null) {
      throw new Error(`RCMomentCurvatureAnalyzer could not locate a ${stateKey} event.`);
    }

    return earliest;
  }
}
