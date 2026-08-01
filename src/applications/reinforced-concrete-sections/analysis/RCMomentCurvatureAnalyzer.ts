import {
  IllinoisRootSolver,
  type IllinoisRootResult,
} from "../../../domain/solvers/IllinoisRootSolver.js";
import { RCSectionStateIntegrator } from "./RCSectionStateIntegrator.js";
import {
  DEFAULT_MAX_POST_PEAK_POINTS,
  DEFAULT_MAX_POST_ULTIMATE_CURVATURE_RATIO,
  DEFAULT_POST_PEAK_CURVATURE_GROWTH_FACTOR,
  resolvePostUltimateOptions,
} from "./moment-curvature/MomentCurvaturePostUltimateOptions.js";
import {
  EVENT_CURVATURE_TOLERANCE,
  appendUniquePoint,
  bracketDistanceFromHint,
  createCurvatureValues,
  createLinearSamples,
  findBrackets,
  type AxialBracket,
  type AxialSample,
} from "./moment-curvature/MomentCurvatureSampling.js";
import { getConcreteProjectedBounds, neutralAxisDirection } from "./RCSectionStrainExtremes.js";
import { StrainField } from "./StrainField.js";
import {
  DEFAULT_EPS0_MAX,
  DEFAULT_EPS0_MIN,
  LIMIT_TOLERANCE,
  POST_ULTIMATE_MOMENT_TOLERANCE,
  absoluteMoment,
  annotateEventPoint,
  annotateMomentDropPoint,
  buildOrientedStrainField,
  defaultCurvatureMax,
  findMaximumMomentPoint,
  getStateCheck,
  neutralAxisProjection,
  neutralAxisY,
  resolveBalancedFailureGeometry,
  resolveCompressedSide,
  resolveConcreteCompressionEdge,
  resolveFirstYieldState,
  resolveLimitState,
  resolveNtc2018Ductility,
  resolveUniaxialCompressedEdge,
  signedEngineeringCurvature,
} from "./moment-curvature/RCMomentCurvaturePolicies.js";
import {
  summarizeMomentCurvatureDuctility,
  summarizeMomentCurvaturePoint,
} from "./moment-curvature/RCMomentCurvatureSummary.js";
import {
  RCMomentCurvatureEventLocator,
  type EventLocatorOptions,
  type GenericEventLocatorOptions,
  type MomentDropLocatorOptions,
} from "./moment-curvature/RCMomentCurvatureEventLocator.js";
import type {
  MomentCurvatureAnalyzeOptions,
  MomentCurvatureAnalyzerLike,
  MomentCurvatureAnalyzerOptions,
  MomentCurvatureCommonOptions,
  MomentCurvatureCurve,
  MomentCurvatureDuctility,
  MomentCurvaturePoint,
  MomentCurvatureSolveOptions,
} from "./moment-curvature/types.js";
import type { AffineStrainField, SectionState } from "./types.js";

interface Eps0Evaluation {
  eps0: number;
  strainField: AffineStrainField;
  state: Pick<SectionState, "N"> | SectionState;
  residual: number;
}

interface DetailedEps0Evaluation extends Eps0Evaluation {
  state: SectionState;
}

type CandidateSolved = Pick<
  IllinoisRootResult,
  "converged" | "iterations" | "root" | "residual" | "bracket"
>;

interface SolvedCandidate {
  bracket: AxialBracket;
  solved: CandidateSolved;
  stateAtRoot: DetailedEps0Evaluation;
  absoluteResidual: number;
  hintDistance: number;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export class RCMomentCurvatureAnalyzer implements MomentCurvatureAnalyzerLike {
  readonly axialRootSolver: IllinoisRootSolver;
  readonly limitRootSolver: IllinoisRootSolver;
  readonly sectionIntegrator: RCSectionStateIntegrator;
  readonly eventLocator: RCMomentCurvatureEventLocator;
  readonly eps0Samples: number;
  readonly eps0Min: number;
  readonly eps0Max: number;

  constructor({
    axialRootSolver = new IllinoisRootSolver(),
    limitRootSolver = new IllinoisRootSolver({
      tolerance: 1e-8,
      maxIterations: 60,
    }),
    sectionIntegrator = new RCSectionStateIntegrator(),
    eps0Samples = 161,
    eps0Min = DEFAULT_EPS0_MIN,
    eps0Max = DEFAULT_EPS0_MAX,
  }: MomentCurvatureAnalyzerOptions = {}) {
    if (!Number.isInteger(eps0Samples) || eps0Samples < 3) {
      throw new Error("RCMomentCurvatureAnalyzer eps0Samples must be at least 3.");
    }

    this.axialRootSolver = axialRootSolver;
    this.limitRootSolver = limitRootSolver;
    this.sectionIntegrator = sectionIntegrator;
    this.eventLocator = new RCMomentCurvatureEventLocator(this);
    this.eps0Samples = eps0Samples;
    this.eps0Min = eps0Min;
    this.eps0Max = eps0Max;
  }

  solveAtCurvature({
    section,
    concreteFibers,
    concreteLaw,
    steelLaw,
    curvature,
    nEd = 0,
    theta = 0,
    compressedSide = null,
    compressedEdge = "top",
    referencePoint = null,
    includeConcreteTension = false,
    eps0Hint = null,
    postUltimateResponse = "zero-stress",
    postUltimateFractureEnergyDensity = null,
  }: MomentCurvatureSolveOptions): MomentCurvaturePoint {
    if (!section?.concreteSection) {
      throw new Error("RCMomentCurvatureAnalyzer requires a reinforced concrete section.");
    }

    if (!Array.isArray(concreteFibers)) {
      throw new Error("RCMomentCurvatureAnalyzer requires concrete fibers.");
    }

    if (!Number.isFinite(curvature) || curvature < 0) {
      throw new Error("RCMomentCurvatureAnalyzer requires a non-negative curvature.");
    }

    if (!Number.isFinite(nEd)) {
      throw new Error("RCMomentCurvatureAnalyzer requires a finite axial force.");
    }

    const direction = neutralAxisDirection(theta);
    const resolvedCompressedSide = resolveCompressedSide({
      compressedSide,
      compressedEdge,
    });
    const resolvedCompressedEdge = resolveUniaxialCompressedEdge({
      theta: direction.theta,
      compressedSide: resolvedCompressedSide,
    });
    const resolvedReferencePoint = referencePoint ?? section.getReferencePoint("concrete-centroid");
    const evaluateAxialForce =
      typeof this.sectionIntegrator.createAxialForceEvaluator === "function"
        ? this.sectionIntegrator.createAxialForceEvaluator({
            section,
            concreteFibers,
            concreteLaw,
            steelLaw,
            includeConcreteTension,
            postUltimateResponse,
            postUltimateFractureEnergyDensity,
          })
        : null;
    const evaluateAtEps0 = (
      eps0: number,
      { includeResponseDetails = false } = {},
    ): Eps0Evaluation => {
      const strainField = buildOrientedStrainField({
        eps0,
        curvature,
        theta: direction.theta,
        direction,
        compressedSide: resolvedCompressedSide,
        includeResponseDetails,
      }) as AffineStrainField;
      const state =
        !includeResponseDetails && evaluateAxialForce
          ? { N: evaluateAxialForce(strainField) }
          : this.sectionIntegrator.evaluate({
              section,
              concreteFibers,
              concreteLaw,
              steelLaw,
              strainField,
              referencePoint: resolvedReferencePoint,
              includeConcreteTension,
              includeResponseDetails,
              postUltimateResponse,
              postUltimateFractureEnergyDensity,
            });

      return {
        eps0,
        strainField,
        state,
        residual: state.N - nEd,
      };
    };
    const fastEvaluations = new Map<string, Eps0Evaluation>();
    const evaluateFastAtEps0 = (eps0: number): Eps0Evaluation => {
      const key = eps0.toPrecision(17);

      if (!fastEvaluations.has(key)) {
        fastEvaluations.set(key, evaluateAtEps0(eps0));
      }

      return fastEvaluations.get(key) as Eps0Evaluation;
    };
    const projectedBounds = getConcreteProjectedBounds(section, direction.theta);
    const coordinateShift =
      Math.abs(curvature) *
      Math.max(
        Math.abs(projectedBounds.minimum.projection),
        Math.abs(projectedBounds.maximum.projection),
      );
    const sampleMinimum = Math.min(
      this.eps0Min - coordinateShift,
      Number.isFinite(eps0Hint) ? (eps0Hint as number) - 0.02 : Number.POSITIVE_INFINITY,
    );
    const sampleMaximum = Math.max(
      this.eps0Max + coordinateShift,
      Number.isFinite(eps0Hint) ? (eps0Hint as number) + 0.02 : Number.NEGATIVE_INFINITY,
    );
    const axialSampleCount =
      postUltimateResponse === "retain" ? this.eps0Samples : Math.max(this.eps0Samples, 401);
    const sampleFromEps0 = (eps0: number): AxialSample => ({
      eps0,
      value: evaluateFastAtEps0(eps0).state.N,
    });
    const samplesFromValues = (values: number[]): AxialSample[] => {
      const uniqueValues = new Map<string, number>();

      for (const value of values) {
        if (value >= sampleMinimum && value <= sampleMaximum) {
          uniqueValues.set(value.toPrecision(17), value);
        }
      }

      return [...uniqueValues.values()].sort((first, second) => first - second).map(sampleFromEps0);
    };
    const findHintBrackets = (): AxialBracket[] => {
      if (!Number.isFinite(eps0Hint)) {
        return [];
      }

      const sampleSpan = sampleMaximum - sampleMinimum;

      if (!Number.isFinite(sampleSpan) || sampleSpan <= 0) {
        return [];
      }

      const center = Math.max(sampleMinimum, Math.min(sampleMaximum, eps0Hint as number));
      const values = [center];
      let searchRadius = Math.max(sampleSpan / Math.max(axialSampleCount - 1, 1), 1e-10);
      let reachedMinimum = center === sampleMinimum;
      let reachedMaximum = center === sampleMaximum;

      for (let iteration = 0; iteration < 32; iteration += 1) {
        if (!reachedMinimum) {
          const lower = Math.max(sampleMinimum, center - searchRadius);
          values.push(lower);
          reachedMinimum = lower === sampleMinimum;
        }

        if (!reachedMaximum) {
          const upper = Math.min(sampleMaximum, center + searchRadius);
          values.push(upper);
          reachedMaximum = upper === sampleMaximum;
        }

        const brackets = findBrackets(samplesFromValues(values), nEd);

        if (brackets.length > 0) {
          return brackets;
        }

        if (reachedMinimum && reachedMaximum) {
          break;
        }

        searchRadius *= 2;
      }

      return [];
    };
    const findFullScanBrackets = (): AxialBracket[] =>
      findBrackets(
        createLinearSamples({
          minimum: sampleMinimum,
          maximum: sampleMaximum,
          count: axialSampleCount,
        }).map(sampleFromEps0),
        nEd,
      );
    const hintBrackets = findHintBrackets();
    let brackets = hintBrackets.length > 0 ? hintBrackets : findFullScanBrackets();
    const bracketSearch = hintBrackets.length > 0 ? "hint" : "full-scan";

    if (brackets.length === 0) {
      throw new Error(
        "RCMomentCurvatureAnalyzer could not bracket the axial-equilibrium root for the requested curvature.",
      );
    }

    const axialTolerance = Math.max(100, Math.abs(nEd) * 1e-6);
    const solveCandidateBrackets = (candidateBrackets: AxialBracket[]): SolvedCandidate[] => {
      const orderedBrackets = [...candidateBrackets].sort(
        (first, second) =>
          bracketDistanceFromHint(first, eps0Hint) - bracketDistanceFromHint(second, eps0Hint),
      );
      const solvedCandidates: SolvedCandidate[] = [];

      for (let index = 0; index < Math.min(orderedBrackets.length, 24); index += 1) {
        const candidateBracket = orderedBrackets[index];

        if (candidateBracket === undefined) {
          continue;
        }

        const solved: CandidateSolved =
          candidateBracket.min === candidateBracket.max
            ? {
                converged: true,
                iterations: 0,
                root: candidateBracket.min,
                residual: evaluateFastAtEps0(candidateBracket.min).residual,
                bracket: candidateBracket,
              }
            : this.axialRootSolver.solve({
                fn: (eps0) => evaluateFastAtEps0(eps0).state.N,
                min: candidateBracket.min,
                max: candidateBracket.max,
                target: nEd,
                includeHistory: false,
              });
        const stateAtRoot = evaluateAtEps0(solved.root, {
          includeResponseDetails: true,
        }) as DetailedEps0Evaluation;
        const candidate = {
          bracket: candidateBracket,
          solved,
          stateAtRoot,
          absoluteResidual: Math.abs(stateAtRoot.residual),
          hintDistance: Number.isFinite(eps0Hint)
            ? Math.abs(stateAtRoot.eps0 - (eps0Hint as number))
            : 0,
        };

        solvedCandidates.push(candidate);

        if (candidate.absoluteResidual <= axialTolerance) {
          break;
        }
      }

      return solvedCandidates;
    };
    let solvedCandidates = solveCandidateBrackets(brackets);
    let equilibratedCandidates = solvedCandidates.filter(
      (candidate) => candidate.absoluteResidual <= axialTolerance,
    );

    if (equilibratedCandidates.length === 0 && bracketSearch === "hint") {
      const fullScanBrackets = findFullScanBrackets();

      if (fullScanBrackets.length > 0) {
        brackets = fullScanBrackets;
        solvedCandidates = solveCandidateBrackets(brackets);
        equilibratedCandidates = solvedCandidates.filter(
          (candidate) => candidate.absoluteResidual <= axialTolerance,
        );
      }
    }

    const candidatesToRank =
      equilibratedCandidates.length > 0 ? equilibratedCandidates : solvedCandidates;
    const selectedCandidate = candidatesToRank.reduce<SolvedCandidate | null>(
      (selected, candidate) => {
        if (selected == null) {
          return candidate;
        }

        if (equilibratedCandidates.length > 0) {
          return candidate.hintDistance < selected.hintDistance ? candidate : selected;
        }

        return candidate.absoluteResidual < selected.absoluteResidual ? candidate : selected;
      },
      null,
    );

    if (selectedCandidate == null) {
      throw new Error(
        "RCMomentCurvatureAnalyzer could not solve the axial-equilibrium root for the requested curvature.",
      );
    }

    const { bracket, solved, stateAtRoot } = selectedCandidate;
    const converged = solved.converged && selectedCandidate.absoluteResidual <= axialTolerance;
    const concreteCompressionEdge = {
      ...resolveConcreteCompressionEdge({
        section,
        strainField: stateAtRoot.strainField,
      }),
      edge: resolvedCompressedEdge,
      side: resolvedCompressedSide,
    };
    const limitState = resolveLimitState({
      state: stateAtRoot.state,
      concreteLaw,
      steelLaw,
      concreteCompressionEdge,
    });
    const firstYieldState = resolveFirstYieldState({
      state: stateAtRoot.state,
      concreteLaw,
      steelLaw,
      concreteCompressionEdge,
    });

    return {
      converged,
      theta: direction.theta,
      compressedSide: resolvedCompressedSide,
      curvature: signedEngineeringCurvature({
        curvature,
        compressedSide: resolvedCompressedSide,
        compressedEdge,
      }),
      absoluteCurvature: Math.abs(curvature),
      compressedEdge: resolvedCompressedEdge,
      eps0: stateAtRoot.strainField.eps0,
      kappaY: stateAtRoot.strainField.kappaY,
      kappaZ: stateAtRoot.strainField.kappaZ,
      neutralAxisY: neutralAxisY(stateAtRoot.strainField),
      neutralAxisProjection: neutralAxisProjection({
        strainField: stateAtRoot.strainField,
        compressedSide: resolvedCompressedSide,
      }),
      N: stateAtRoot.state.N,
      Mx: stateAtRoot.state.Mx,
      My: stateAtRoot.state.My,
      projectedMoment: stateAtRoot.state.Mx * direction.cos + stateAtRoot.state.My * direction.sin,
      axialResidual: stateAtRoot.residual,
      state: stateAtRoot.state,
      postUltimate: stateAtRoot.state.postUltimate,
      concreteCompressionEdge,
      firstYieldState,
      limitState,
      solverReport: {
        method: bracket.min === bracket.max ? "direct-hit" : "illinois",
        iterations: solved.iterations,
        bracket: solved.bracket,
        candidateBracketCount: brackets.length,
        evaluatedBracketCount: solvedCandidates.length,
        residual: stateAtRoot.residual,
        axialTolerance,
      },
    };
  }

  solveBalancedFailurePoint({
    section,
    concreteFibers,
    concreteLaw,
    steelLaw,
    nEd = 0,
    theta = 0,
    compressedSide = null,
    compressedEdge = "top",
    referencePoint = null,
    includeConcreteTension = false,
  }: MomentCurvatureCommonOptions): MomentCurvaturePoint | null {
    const geometry = resolveBalancedFailureGeometry({
      section,
      concreteLaw,
      steelLaw,
      theta,
      compressedSide,
      compressedEdge,
    });

    if (!geometry) {
      return null;
    }

    const resolvedCompressedEdge = resolveUniaxialCompressedEdge({
      theta: geometry.theta,
      compressedSide: geometry.compressedSide,
    });
    const resolvedReferencePoint = referencePoint ?? section.getReferencePoint("concrete-centroid");
    const strainField = new StrainField({
      eps0: geometry.eps0,
      kappaY: geometry.kappaY,
      kappaZ: geometry.kappaZ,
    });
    const state = this.sectionIntegrator.evaluate({
      section,
      concreteFibers,
      concreteLaw,
      steelLaw,
      strainField,
      referencePoint: resolvedReferencePoint,
      includeConcreteTension,
      postUltimateResponse: "retain",
    });
    const concreteCompressionEdge = {
      ...resolveConcreteCompressionEdge({
        section,
        strainField,
      }),
      edge: resolvedCompressedEdge,
      side: geometry.compressedSide,
    };
    const firstYieldState = resolveFirstYieldState({
      state,
      concreteLaw,
      steelLaw,
      concreteCompressionEdge,
    });
    const limitState = resolveLimitState({
      state,
      concreteLaw,
      steelLaw,
      concreteCompressionEdge,
    });
    const concreteCheck = getStateCheck(
      { limitState },
      "limitState",
      "concrete-compression-strain",
    );
    const steelCheck = getStateCheck({ limitState }, "limitState", "steel-tension-strain");
    const axialResidual = state.N - nEd;
    const axialTolerance = Math.max(10, Math.abs(nEd) * 1e-6);

    return {
      converged: true,
      theta: geometry.theta,
      compressedSide: geometry.compressedSide,
      curvature: signedEngineeringCurvature({
        curvature: geometry.absoluteCurvature,
        compressedSide: geometry.compressedSide,
        compressedEdge,
      }),
      absoluteCurvature: geometry.absoluteCurvature,
      compressedEdge: resolvedCompressedEdge,
      eps0: strainField.eps0,
      kappaY: strainField.kappaY,
      kappaZ: strainField.kappaZ,
      neutralAxisY: neutralAxisY(strainField),
      neutralAxisProjection: neutralAxisProjection({
        strainField,
        compressedSide: geometry.compressedSide,
      }),
      N: state.N,
      Mx: state.Mx,
      My: state.My,
      projectedMoment: state.Mx * Math.cos(geometry.theta) + state.My * Math.sin(geometry.theta),
      axialResidual,
      state,
      concreteCompressionEdge,
      firstYieldState,
      limitState,
      failureMode: "balanced-concrete-steel",
      balancedFailureState: {
        reached:
          concreteCheck != null &&
          steelCheck != null &&
          Math.abs(concreteCheck.utilizationRatio - 1) <= LIMIT_TOLERANCE &&
          Math.abs(steelCheck.utilizationRatio - 1) <= LIMIT_TOLERANCE,
        concrete: concreteCheck,
        steel: steelCheck,
        effectiveDepth: geometry.effectiveDepth,
        neutralAxisDepth: geometry.neutralAxisDepth,
        compressedEdgeProjection: geometry.compressedEdgeProjection,
        tensionReinforcementProjection: geometry.tensionReinforcementProjection,
        compressedEdgeY: geometry.compressedEdgeY,
        tensionReinforcementY: geometry.tensionReinforcementY,
        assignedAxialForce: nEd,
        balancedAxialForce: state.N,
        axialResidual,
        compatibleWithAssignedAxialForce: Math.abs(axialResidual) <= axialTolerance,
      },
      solverReport: {
        method: "closed-form-balanced-strain-compatibility",
        iterations: 0,
        residual: axialResidual,
      },
    };
  }

  analyze({
    section,
    concreteFibers,
    concreteLaw,
    steelLaw,
    nEd = 0,
    theta = 0,
    compressedSide = null,
    compressedEdge = "top",
    curvatureMax = null,
    curvatureValues = null,
    pointCount = 41,
    referencePoint = null,
    includeConcreteTension = false,
    stopAtFailure = false,
    includeFailurePoint = true,
    postUltimateMomentDrop = null,
    maxPostUltimateCurvatureRatio = DEFAULT_MAX_POST_ULTIMATE_CURVATURE_RATIO,
    postPeakMomentDrop = null,
    postUltimateResponse = "zero-stress",
    postUltimateFractureEnergyDensity = null,
    postPeakCurvatureGrowthFactor = DEFAULT_POST_PEAK_CURVATURE_GROWTH_FACTOR,
    maxPostPeakPoints = DEFAULT_MAX_POST_PEAK_POINTS,
  }: MomentCurvatureAnalyzeOptions): MomentCurvatureCurve {
    const direction = neutralAxisDirection(theta);
    const resolvedCompressedSide = resolveCompressedSide({
      compressedSide,
      compressedEdge,
    });
    const resolvedCompressedEdge = resolveUniaxialCompressedEdge({
      theta: direction.theta,
      compressedSide: resolvedCompressedSide,
    });
    const {
      postUltimateMomentDrop: resolvedPostUltimateMomentDrop,
      maxPostUltimateCurvatureRatio: resolvedMaxPostUltimateCurvatureRatio,
      postUltimateResponse: resolvedPostUltimateResponse,
      fractureEnergyDensity: normalizedFractureEnergyDensity,
      postPeakCurvatureGrowthFactor: resolvedPostPeakCurvatureGrowthFactor,
      maxPostPeakPoints: resolvedMaxPostPeakPoints,
    } = resolvePostUltimateOptions({
      postUltimateMomentDrop,
      postPeakMomentDrop,
      maxPostUltimateCurvatureRatio,
      postUltimateResponse,
      postUltimateFractureEnergyDensity,
      postPeakCurvatureGrowthFactor,
      maxPostPeakPoints,
    });

    const warnings: string[] = [];
    let balancedFailurePoint: MomentCurvaturePoint | null = null;

    try {
      balancedFailurePoint = this.solveBalancedFailurePoint({
        section,
        concreteFibers,
        concreteLaw,
        steelLaw,
        nEd,
        theta: direction.theta,
        compressedSide: resolvedCompressedSide,
        compressedEdge,
        referencePoint,
        includeConcreteTension,
      });
    } catch (error) {
      warnings.push(errorMessage(error));
    }

    const initialCurvatureMax =
      curvatureMax ??
      defaultCurvatureMax({
        section,
        concreteLaw,
        steelLaw,
        theta: direction.theta,
        compressedSide: resolvedCompressedSide,
        compressedEdge,
      });
    const usesExplicitCurvatureValues =
      Array.isArray(curvatureValues) && curvatureValues.length >= 2;
    const values = usesExplicitCurvatureValues
      ? [...curvatureValues]
      : createCurvatureValues({
          curvatureMax: initialCurvatureMax,
          pointCount,
        });
    const requestedPointCount = values.length;
    const automaticPostPeakExtension =
      curvatureMax == null && !usesExplicitCurvatureValues && !stopAtFailure;
    const balancedCurvature = balancedFailurePoint?.absoluteCurvature ?? initialCurvatureMax;
    const maximumAutomaticCurvature =
      Math.max(initialCurvatureMax, balancedCurvature) *
      resolvedPostPeakCurvatureGrowthFactor ** resolvedMaxPostPeakPoints;
    const points: MomentCurvaturePoint[] = [];

    let previousPoint: MomentCurvaturePoint | null = null;
    let failurePoint: MomentCurvaturePoint | null = null;
    let firstYieldPoint: MomentCurvaturePoint | null = null;
    let balancedCurvaturePoint: MomentCurvaturePoint | null = null;
    let postUltimateTerminationPoint: MomentCurvaturePoint | null = null;
    let postPeakDropPoint: MomentCurvaturePoint | null = null;
    let postPeakPointCount = 0;
    let phiMaterialUltimate: number | null = null;
    let materialUltimateMoment: number | null = null;
    let postUltimateCurvatureLimit: number | null = null;
    let terminationReason = "curvature-range-completed";

    for (let valueIndex = 0; valueIndex < values.length; valueIndex += 1) {
      const curvature = values[valueIndex];

      if (curvature === undefined) {
        continue;
      }

      let point: MomentCurvaturePoint;
      const usePostUltimateResponse = failurePoint != null && !stopAtFailure;

      try {
        point = this.solveAtCurvature({
          section,
          concreteFibers,
          concreteLaw,
          steelLaw,
          curvature: Math.abs(curvature),
          nEd,
          theta: direction.theta,
          compressedSide: resolvedCompressedSide,
          compressedEdge,
          referencePoint,
          includeConcreteTension,
          eps0Hint: previousPoint?.eps0 ?? null,
          postUltimateResponse: usePostUltimateResponse ? resolvedPostUltimateResponse : "retain",
          postUltimateFractureEnergyDensity: normalizedFractureEnergyDensity,
        });
      } catch (error) {
        warnings.push(errorMessage(error));
        terminationReason = "axial-equilibrium-not-found";
        break;
      }

      let intervalFirstYieldPoint: MomentCurvaturePoint | null = null;
      let intervalFailurePoint: MomentCurvaturePoint | null = null;

      if (!firstYieldPoint && point.firstYieldState.reached) {
        if (previousPoint) {
          try {
            intervalFirstYieldPoint = this.findFirstYieldPoint({
              section,
              concreteFibers,
              concreteLaw,
              steelLaw,
              nEd,
              theta: direction.theta,
              compressedSide: resolvedCompressedSide,
              compressedEdge,
              referencePoint,
              includeConcreteTension,
              minCurvature: previousPoint.absoluteCurvature,
              maxCurvature: point.absoluteCurvature,
              lowerPoint: previousPoint,
              upperPoint: point,
              postUltimateResponse: "retain",
            });
          } catch (error) {
            warnings.push(errorMessage(error));
            const fallbackCheck = point.firstYieldState.reachedChecks[0];
            intervalFirstYieldPoint = fallbackCheck
              ? annotateEventPoint(point, "firstYieldState", fallbackCheck.id)
              : point;
          }
        } else {
          const firstCheck = point.firstYieldState.reachedChecks[0];
          intervalFirstYieldPoint = firstCheck
            ? annotateEventPoint(point, "firstYieldState", firstCheck.id)
            : point;
        }

        firstYieldPoint = intervalFirstYieldPoint;
      }

      if (!failurePoint && point.limitState.reached && previousPoint) {
        try {
          intervalFailurePoint = this.findFailurePoint({
            section,
            concreteFibers,
            concreteLaw,
            steelLaw,
            nEd,
            theta: direction.theta,
            compressedSide: resolvedCompressedSide,
            compressedEdge,
            referencePoint,
            includeConcreteTension,
            minCurvature: previousPoint.absoluteCurvature,
            maxCurvature: point.absoluteCurvature,
            lowerPoint: previousPoint,
            upperPoint: point,
            postUltimateResponse: "retain",
          });
        } catch (error) {
          warnings.push(errorMessage(error));
          const fallbackCheck = point.limitState.reachedChecks[0];
          intervalFailurePoint = fallbackCheck
            ? annotateEventPoint(point, "limitState", fallbackCheck.id)
            : point;
        }
      } else if (!failurePoint && point.limitState.reached) {
        const firstCheck = point.limitState.reachedChecks[0];
        intervalFailurePoint = firstCheck
          ? annotateEventPoint(point, "limitState", firstCheck.id)
          : point;
      }

      if (
        intervalFirstYieldPoint &&
        (!intervalFailurePoint ||
          intervalFirstYieldPoint.absoluteCurvature <= intervalFailurePoint.absoluteCurvature)
      ) {
        appendUniquePoint(points, intervalFirstYieldPoint);
      }

      if (intervalFailurePoint) {
        failurePoint = intervalFailurePoint;
        phiMaterialUltimate = Number.isFinite(intervalFailurePoint.absoluteCurvature)
          ? intervalFailurePoint.absoluteCurvature
          : null;
        materialUltimateMoment = Number.isFinite(absoluteMoment(intervalFailurePoint))
          ? absoluteMoment(intervalFailurePoint)
          : null;
        postUltimateCurvatureLimit =
          phiMaterialUltimate != null && phiMaterialUltimate > EVENT_CURVATURE_TOLERANCE
            ? resolvedMaxPostUltimateCurvatureRatio * phiMaterialUltimate
            : null;

        if (includeFailurePoint) {
          appendUniquePoint(points, intervalFailurePoint);
        }
      }

      if (intervalFailurePoint && stopAtFailure) {
        if (!includeFailurePoint) {
          appendUniquePoint(points, intervalFailurePoint);
        }
        terminationReason = "first-material-ultimate-strain";
        break;
      }

      if (
        intervalFailurePoint &&
        postUltimateCurvatureLimit == null &&
        (materialUltimateMoment == null || materialUltimateMoment <= POST_ULTIMATE_MOMENT_TOLERANCE)
      ) {
        if (!includeFailurePoint) {
          appendUniquePoint(points, intervalFailurePoint);
        }
        warnings.push(
          "Post-ultimate continuation cannot be evaluated because both Mu and phiMaterialUltimate are null or too close to zero.",
        );
        terminationReason = "post-ultimate-reference-unavailable";
        break;
      }

      if (
        intervalFailurePoint &&
        point.absoluteCurvature > intervalFailurePoint.absoluteCurvature + EVENT_CURVATURE_TOLERANCE
      ) {
        try {
          point = this.solveAtCurvature({
            section,
            concreteFibers,
            concreteLaw,
            steelLaw,
            curvature: point.absoluteCurvature,
            nEd,
            theta: direction.theta,
            compressedSide: resolvedCompressedSide,
            compressedEdge,
            referencePoint,
            includeConcreteTension,
            eps0Hint: intervalFailurePoint.eps0,
            postUltimateResponse: resolvedPostUltimateResponse,
            postUltimateFractureEnergyDensity: normalizedFractureEnergyDensity,
          });
        } catch (error) {
          warnings.push(errorMessage(error));
          terminationReason = "axial-equilibrium-not-found";
          break;
        }
      }

      let resolvedPointThisStep = point;
      const postUltimateLowerPoint =
        intervalFailurePoint ?? (failurePoint == null ? null : previousPoint);
      const momentCriterionAvailable =
        materialUltimateMoment != null && materialUltimateMoment > POST_ULTIMATE_MOMENT_TOLERANCE;
      const targetMoment = momentCriterionAvailable
        ? (1 - resolvedPostUltimateMomentDrop) * (materialUltimateMoment as number)
        : null;
      const reachesPostUltimateCurvatureLimit =
        failurePoint != null &&
        postUltimateCurvatureLimit != null &&
        point.absoluteCurvature >= postUltimateCurvatureLimit - EVENT_CURVATURE_TOLERANCE;

      if (
        reachesPostUltimateCurvatureLimit &&
        Math.abs(point.absoluteCurvature - (postUltimateCurvatureLimit as number)) >
          EVENT_CURVATURE_TOLERANCE
      ) {
        try {
          resolvedPointThisStep = this.solveAtCurvature({
            section,
            concreteFibers,
            concreteLaw,
            steelLaw,
            curvature: postUltimateCurvatureLimit as number,
            nEd,
            theta: direction.theta,
            compressedSide: resolvedCompressedSide,
            compressedEdge,
            referencePoint,
            includeConcreteTension,
            eps0Hint: postUltimateLowerPoint?.eps0 ?? failurePoint?.eps0 ?? null,
            postUltimateResponse: resolvedPostUltimateResponse,
            postUltimateFractureEnergyDensity: normalizedFractureEnergyDensity,
          });
        } catch (error) {
          warnings.push(errorMessage(error));
          terminationReason = "axial-equilibrium-not-found";
          break;
        }
      }

      const crossesPostUltimateMomentTarget =
        failurePoint != null &&
        postUltimateLowerPoint != null &&
        targetMoment != null &&
        absoluteMoment(resolvedPointThisStep) < absoluteMoment(postUltimateLowerPoint) &&
        absoluteMoment(postUltimateLowerPoint) >= targetMoment &&
        absoluteMoment(resolvedPointThisStep) <= targetMoment;

      if (crossesPostUltimateMomentTarget) {
        try {
          postPeakDropPoint = this.findMomentDropPoint({
            section,
            concreteFibers,
            concreteLaw,
            steelLaw,
            nEd,
            theta: direction.theta,
            compressedSide: resolvedCompressedSide,
            compressedEdge,
            referencePoint,
            includeConcreteTension,
            postUltimateResponse: resolvedPostUltimateResponse,
            postUltimateFractureEnergyDensity: normalizedFractureEnergyDensity,
            lowerPoint: postUltimateLowerPoint,
            upperPoint: resolvedPointThisStep,
            referenceMoment: materialUltimateMoment,
            dropRatio: resolvedPostUltimateMomentDrop,
          });
        } catch (error) {
          warnings.push(errorMessage(error));
          postPeakDropPoint = annotateMomentDropPoint(resolvedPointThisStep, {
            referenceMoment: materialUltimateMoment as number,
            dropRatio: resolvedPostUltimateMomentDrop,
          });
        }

        resolvedPointThisStep = postPeakDropPoint;
        postUltimateTerminationPoint = postPeakDropPoint;
        terminationReason = "post-ultimate-moment-drop";
      }

      appendUniquePoint(points, resolvedPointThisStep);

      if (
        balancedCurvaturePoint == null &&
        resolvedPointThisStep.absoluteCurvature >= balancedCurvature - EVENT_CURVATURE_TOLERANCE
      ) {
        if (
          Math.abs(resolvedPointThisStep.absoluteCurvature - balancedCurvature) <=
          EVENT_CURVATURE_TOLERANCE
        ) {
          balancedCurvaturePoint = resolvedPointThisStep;
        } else if (previousPoint && previousPoint.absoluteCurvature < balancedCurvature) {
          try {
            balancedCurvaturePoint = this.solveAtCurvature({
              section,
              concreteFibers,
              concreteLaw,
              steelLaw,
              curvature: balancedCurvature,
              nEd,
              theta: direction.theta,
              compressedSide: resolvedCompressedSide,
              compressedEdge,
              referencePoint,
              includeConcreteTension,
              eps0Hint: previousPoint.eps0,
              postUltimateResponse: resolvedPostUltimateResponse,
              postUltimateFractureEnergyDensity: normalizedFractureEnergyDensity,
            });
          } catch (error) {
            warnings.push(errorMessage(error));
          }
        }
      }

      if (postUltimateTerminationPoint) {
        break;
      }

      if (reachesPostUltimateCurvatureLimit) {
        postUltimateTerminationPoint = resolvedPointThisStep;
        terminationReason = "post-ultimate-curvature-limit";
        break;
      }

      previousPoint = resolvedPointThisStep;

      if (valueIndex === values.length - 1 && automaticPostPeakExtension) {
        if (postPeakPointCount >= resolvedMaxPostPeakPoints) {
          warnings.push(
            "Post-ultimate continuation reached maxPostPeakPoints before a termination criterion.",
          );
          terminationReason = "maximum-post-peak-point-count";
          break;
        }

        const nextCurvature = Math.max(
          point.absoluteCurvature * resolvedPostPeakCurvatureGrowthFactor,
          point.absoluteCurvature + initialCurvatureMax / Math.max(pointCount - 1, 1),
        );

        if (nextCurvature > maximumAutomaticCurvature) {
          warnings.push(
            "Post-ultimate continuation reached the automatic curvature guard before a termination criterion.",
          );
          terminationReason = "maximum-automatic-curvature";
          break;
        }

        values.push(nextCurvature);
        postPeakPointCount += 1;
      }
    }

    const maximum = findMaximumMomentPoint(points);
    const finalCurvature = points.at(-1)?.absoluteCurvature ?? initialCurvatureMax;

    return {
      nEd,
      theta: direction.theta,
      compressedSide: resolvedCompressedSide,
      compressedEdge: resolvedCompressedEdge,
      curvatureMax: finalCurvature,
      initialCurvatureMax,
      balancedCurvature,
      pointCount: requestedPointCount,
      analyzedPointCount: values.length,
      generatedPointCount: points.length,
      failureReached: failurePoint != null,
      failurePoint,
      failureMode: failurePoint?.limitState?.eventType ?? null,
      materialUltimateReached: failurePoint != null,
      materialUltimatePoint: failurePoint,
      materialUltimateType: failurePoint?.limitState?.eventType ?? null,
      phiMaterialUltimate,
      Mu: materialUltimateMoment,
      balancedFailureReached: balancedFailurePoint != null,
      balancedFailurePoint,
      balancedCurvaturePoint,
      firstYieldReached: firstYieldPoint != null,
      firstYieldPoint,
      firstYieldType: firstYieldPoint?.firstYieldState?.eventType ?? null,
      maximumMomentPoint: maximum?.point ?? null,
      postUltimateMomentDrop: resolvedPostUltimateMomentDrop,
      maxPostUltimateCurvatureRatio: resolvedMaxPostUltimateCurvatureRatio,
      postUltimateCurvatureLimit,
      postUltimateTerminationReached: postUltimateTerminationPoint != null,
      postUltimateTerminationPoint,
      postUltimateMomentDropReached: terminationReason === "post-ultimate-moment-drop",
      postUltimateCurvatureLimitReached: terminationReason === "post-ultimate-curvature-limit",
      postPeakMomentDrop: resolvedPostUltimateMomentDrop,
      postPeakDropReached: postPeakDropPoint != null,
      postPeakDropPoint,
      postUltimateModel: {
        response: resolvedPostUltimateResponse,
        fractureEnergyDensity:
          resolvedPostUltimateResponse === "linear-softening"
            ? normalizedFractureEnergyDensity
            : {
                concrete: 0,
                steel: 0,
              },
        fractureEnergyDensityUnits: "N/mm2",
        fractureEnergyInterpretation: "energy-per-unit-volume",
      },
      terminationReason,
      ntc2018Ductility: resolveNtc2018Ductility({
        points,
        firstYieldPoint,
        failurePoint,
        compressedEdge,
      }),
      warnings,
      points,
    };
  }

  findMomentDropPoint(options: MomentDropLocatorOptions): MomentCurvaturePoint {
    return this.eventLocator.findMomentDropPoint(options);
  }

  findFirstYieldPoint(options: EventLocatorOptions): MomentCurvaturePoint {
    return this.eventLocator.findFirstYieldPoint(options);
  }

  findFailurePoint(options: EventLocatorOptions): MomentCurvaturePoint {
    return this.eventLocator.findFailurePoint(options);
  }

  findEventPoint(options: GenericEventLocatorOptions): MomentCurvaturePoint {
    return this.eventLocator.findEventPoint(options);
  }

  static summarizePoint(point: MomentCurvaturePoint): Record<string, unknown> {
    return summarizeMomentCurvaturePoint(point);
  }

  static summarizeDuctility(
    ductility: MomentCurvatureDuctility | null,
  ): Record<string, unknown> | null {
    return summarizeMomentCurvatureDuctility(ductility);
  }
}
