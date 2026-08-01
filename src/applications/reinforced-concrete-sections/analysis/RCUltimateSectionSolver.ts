import type {
  ConcreteUltimateConstitutiveLaw,
  SteelUltimateConstitutiveLaw,
} from "../../../domain/constitutive-laws/types.js";
import type {
  ReinforcedConcreteSection,
  ReferencePoint,
} from "../../../domain/geometry/ReinforcedConcreteSection.js";
import type { ReinforcementBar } from "../../../domain/reinforcement/ReinforcementBar.js";
import {
  IllinoisRootSolver,
  type IllinoisRootResult,
} from "../../../domain/solvers/IllinoisRootSolver.js";
import { StrainField, createAffineStrainField } from "./StrainField.js";
import { RCSectionStateIntegrator } from "./RCSectionStateIntegrator.js";
import {
  getConcreteProjectedBounds,
  neutralAxisDirection,
  projectionAt,
  resolveConcreteStrainExtremes,
  type ConcreteProjectedBounds,
  type ConcreteStrainExtremes,
  type NeutralAxisDirection,
} from "./RCSectionStrainExtremes.js";
import type { AffineStrainField, SectionFiber, SectionState, StrainFieldLike } from "./types.js";

type CompressedSide = "positive" | "negative";
type CompressedEdge = "top" | "bottom";
type FailureMode = "concrete-compression" | "steel-tension";

interface OrientedFailureOptions {
  section: ReinforcedConcreteSection;
  theta: number;
  projectedBounds?: ConcreteProjectedBounds | null;
  direction?: NeutralAxisDirection | null;
  neutralAxisDepth: number;
  ultimateCompressionStrain: number;
  compressedSide: CompressedSide;
  includeResponseDetails?: boolean;
}

interface OrientedSteelFailureOptions
  extends Omit<OrientedFailureOptions, "ultimateCompressionStrain"> {
  ultimateTensionStrain: number;
  reinforcementBars: ReinforcementBar[];
  reinforcementProjections?: number[] | null;
}

interface DepthSampleOptions {
  minDepthFactor?: number;
  maxDepthFactor?: number;
  steps?: number;
}

interface DepthEvaluation {
  neutralAxisDepth: number;
  strainField: StrainFieldLike;
  state: Pick<SectionState, "N"> | SectionState;
  concreteStrainExtremes: ConcreteStrainExtremes | null;
  residual: number;
}

interface SolverReport {
  method: "direct-hit" | "illinois" | "uniform-steel-tension";
  iterations: number;
  residual?: number;
  bracket?: {
    min: number;
    max: number;
  };
  failureMode: FailureMode;
  sampledStates?: {
    neutralAxisDepth: number;
    residual: number;
  }[];
}

export interface RCUltimateSectionResult {
  converged: boolean;
  theta: number;
  compressedSide: CompressedSide;
  compressedEdge?: CompressedEdge;
  failureMode: FailureMode;
  neutralAxisDepth: number;
  strainField: StrainFieldLike;
  axialResidual: number;
  N: number;
  MxRd: number;
  MyRd: number;
  state: SectionState;
  concreteStrainExtremes: ConcreteStrainExtremes;
  solverReport: SolverReport;
}

export interface RCUltimateSectionSolverOptions {
  rootSolver?: IllinoisRootSolver;
  sectionIntegrator?: RCSectionStateIntegrator;
}

export interface SolveAtAxialLoadOptions {
  section: ReinforcedConcreteSection;
  concreteFibers: SectionFiber[];
  concreteLaw: ConcreteUltimateConstitutiveLaw;
  steelLaw: SteelUltimateConstitutiveLaw;
  nEd: number;
  theta: number;
  compressedSide?: CompressedSide;
  referencePoint?: ReferencePoint | null;
}

export interface SolveUniaxialAtAxialLoadOptions
  extends Omit<SolveAtAxialLoadOptions, "theta" | "compressedSide"> {
  compressedEdge?: CompressedEdge;
}

function resolveConcreteUltimateCompressionStrain(
  concreteLaw: ConcreteUltimateConstitutiveLaw,
): number {
  const compressionLimit = concreteLaw.strainLimits().compression;

  if (!Number.isFinite(compressionLimit) || compressionLimit === 0) {
    throw new Error(
      "RCUltimateSectionSolver requires a concrete law with a finite compression strain limit.",
    );
  }

  return Math.abs(compressionLimit as number);
}

function resolveSteelUltimateTensionStrain(steelLaw: SteelUltimateConstitutiveLaw): number | null {
  const tensionLimit = steelLaw.strainLimits().tension;

  return Number.isFinite(tensionLimit) && (tensionLimit as number) > 0
    ? Math.abs(tensionLimit as number)
    : null;
}

function buildStrainFieldForOrientedFailure({
  section,
  theta,
  projectedBounds = null,
  direction = null,
  neutralAxisDepth,
  ultimateCompressionStrain,
  compressedSide,
  includeResponseDetails = false,
}: OrientedFailureOptions): AffineStrainField | StrainField {
  if (!Number.isFinite(theta)) {
    throw new Error("Theta must be finite.");
  }

  if (!Number.isFinite(neutralAxisDepth) || neutralAxisDepth <= 0) {
    throw new Error("Neutral axis depth must be positive.");
  }

  const resolvedProjectedBounds = projectedBounds ?? getConcreteProjectedBounds(section, theta);
  const resolvedDirection = direction ?? neutralAxisDirection(theta);
  const minProjection = resolvedProjectedBounds.minimum.projection;
  const maxProjection = resolvedProjectedBounds.maximum.projection;
  const sideSign = compressedSide === "positive" ? 1 : -1;
  const compressedEdgeProjection = compressedSide === "positive" ? maxProjection : minProjection;
  const neutralAxisProjection = compressedEdgeProjection - sideSign * neutralAxisDepth;
  const curvature = ultimateCompressionStrain / neutralAxisDepth;
  const coefficients = {
    eps0: sideSign * curvature * neutralAxisProjection,
    kappaY: sideSign * curvature * resolvedDirection.sin,
    kappaZ: sideSign * curvature * resolvedDirection.cos,
  };

  return includeResponseDetails
    ? new StrainField(coefficients)
    : createAffineStrainField(coefficients);
}

function buildStrainFieldForOrientedSteelTensionFailure({
  section,
  theta,
  projectedBounds = null,
  direction = null,
  neutralAxisDepth,
  ultimateTensionStrain,
  compressedSide,
  reinforcementBars,
  reinforcementProjections = null,
  includeResponseDetails = false,
}: OrientedSteelFailureOptions): AffineStrainField | StrainField {
  if (!Number.isFinite(theta)) {
    throw new Error("Theta must be finite.");
  }

  if (!Number.isFinite(neutralAxisDepth) || neutralAxisDepth <= 0) {
    throw new Error("Neutral axis depth must be positive.");
  }

  if (!Number.isFinite(ultimateTensionStrain) || ultimateTensionStrain <= 0) {
    throw new Error("Steel ultimate tension strain must be positive.");
  }

  if (reinforcementBars.length === 0) {
    throw new Error("Steel tension failure requires reinforcement bars.");
  }

  const resolvedProjectedBounds = projectedBounds ?? getConcreteProjectedBounds(section, theta);
  const resolvedDirection = direction ?? neutralAxisDirection(theta);
  const minProjection = resolvedProjectedBounds.minimum.projection;
  const maxProjection = resolvedProjectedBounds.maximum.projection;
  const steelProjections =
    reinforcementProjections ??
    reinforcementBars.map((bar) => {
      if (bar.y == null || bar.z == null) {
        throw new Error("Steel tension failure requires finite reinforcement coordinates.");
      }

      return projectionAt(theta, { y: bar.y, z: bar.z });
    });
  const sideSign = compressedSide === "positive" ? 1 : -1;
  const compressedEdgeProjection = compressedSide === "positive" ? maxProjection : minProjection;
  const tensionBarProjection =
    compressedSide === "positive" ? Math.min(...steelProjections) : Math.max(...steelProjections);
  const neutralAxisProjection = compressedEdgeProjection - sideSign * neutralAxisDepth;
  const tensionDistance = sideSign * (neutralAxisProjection - tensionBarProjection);

  if (!Number.isFinite(tensionDistance) || tensionDistance <= 0) {
    throw new Error(
      "Steel tension failure requires the neutral axis before the tension reinforcement.",
    );
  }

  const curvature = ultimateTensionStrain / tensionDistance;
  const coefficients = {
    eps0: sideSign * curvature * neutralAxisProjection,
    kappaY: sideSign * curvature * resolvedDirection.sin,
    kappaZ: sideSign * curvature * resolvedDirection.cos,
  };

  return includeResponseDetails
    ? new StrainField(coefficients)
    : createAffineStrainField(coefficients);
}

function createDepthSamples(
  height: number,
  { minDepthFactor = 1e-4, maxDepthFactor = 5, steps = 80 }: DepthSampleOptions = {},
): number[] {
  const minDepth = Math.max(height * minDepthFactor, 1e-6);
  const maxDepth = Math.max(height * maxDepthFactor, minDepth * 10);
  const ratio = (maxDepth / minDepth) ** (1 / (steps - 1));
  const samples: number[] = [];
  let current = minDepth;

  for (let index = 0; index < steps; index += 1) {
    samples.push(current);
    current *= ratio;
  }

  return samples;
}

function createDepthSamplesInRange({
  minimum,
  maximum,
  steps = 80,
}: {
  minimum: number;
  maximum: number;
  steps?: number;
}): number[] {
  if (!Number.isFinite(minimum) || !Number.isFinite(maximum) || minimum >= maximum) {
    throw new Error("A valid neutral-axis depth range is required.");
  }

  const ratio = (maximum / minimum) ** (1 / (steps - 1));
  const samples: number[] = [];
  let current = minimum;

  for (let index = 0; index < steps; index += 1) {
    samples.push(index === steps - 1 ? maximum : current);
    current *= ratio;
  }

  return samples;
}

function maxSteelTensionStrain(state: SectionState): number {
  return Math.max(
    0,
    state.extremes.maxSteelTensionStrain?.strain ?? state.extremes.maxSteelTension?.strain ?? 0,
  );
}

function steelTensionExceeded(
  state: SectionState,
  ultimateTensionStrain: number | null,
  tolerance = 1e-9,
): boolean {
  return (
    Number.isFinite(ultimateTensionStrain) &&
    (ultimateTensionStrain as number) > 0 &&
    maxSteelTensionStrain(state) > (ultimateTensionStrain as number) * (1 + tolerance)
  );
}

export class RCUltimateSectionSolver {
  rootSolver: IllinoisRootSolver;
  sectionIntegrator: RCSectionStateIntegrator;

  constructor({
    rootSolver = new IllinoisRootSolver(),
    sectionIntegrator = new RCSectionStateIntegrator(),
  }: RCUltimateSectionSolverOptions = {}) {
    this.rootSolver = rootSolver;
    this.sectionIntegrator = sectionIntegrator;
  }

  solveAtAxialLoad({
    section,
    concreteFibers,
    concreteLaw,
    steelLaw,
    nEd,
    theta,
    compressedSide = "positive",
    referencePoint = null,
  }: SolveAtAxialLoadOptions): RCUltimateSectionResult {
    if (!section?.concreteSection) {
      throw new Error("RCUltimateSectionSolver requires a reinforced concrete section.");
    }

    if (!Number.isFinite(theta)) {
      throw new Error("RCUltimateSectionSolver requires a finite theta.");
    }

    const normalizedTheta = neutralAxisDirection(theta).theta;
    const bounds = section.getBoundingBox();
    const height = bounds.maxY - bounds.minY;
    const width = bounds.maxZ - bounds.minZ;
    const characteristicLength = Math.max(height, width);
    const ultimateCompressionStrain = resolveConcreteUltimateCompressionStrain(concreteLaw);
    const ultimateSteelTensionStrain = resolveSteelUltimateTensionStrain(steelLaw);
    const resolvedReferencePoint = referencePoint ?? section.getReferencePoint("concrete-centroid");
    const reinforcementBars = section.getReinforcementBars();
    const direction = neutralAxisDirection(normalizedTheta);
    const projectedBounds = getConcreteProjectedBounds(section, normalizedTheta);
    const reinforcementProjections = reinforcementBars.map((bar) => {
      if (bar.y == null || bar.z == null) {
        throw new Error(
          "RCUltimateSectionSolver reinforcement bars require finite y and z coordinates.",
        );
      }

      return projectionAt(normalizedTheta, { y: bar.y, z: bar.z });
    });
    const evaluateAxialForce = this.sectionIntegrator.createAxialForceEvaluator({
      section,
      concreteFibers,
      concreteLaw,
      steelLaw,
      includeConcreteTension: false,
      postUltimateResponse: "retain",
    });

    const evaluateConcreteFailureAtDepth = (
      neutralAxisDepth: number,
      { includeResponseDetails = false }: { includeResponseDetails?: boolean } = {},
    ): DepthEvaluation => {
      const strainField = buildStrainFieldForOrientedFailure({
        section,
        theta: normalizedTheta,
        projectedBounds,
        direction,
        neutralAxisDepth,
        ultimateCompressionStrain,
        compressedSide,
        includeResponseDetails,
      });
      const state = includeResponseDetails
        ? this.sectionIntegrator.evaluate({
            section,
            concreteFibers,
            concreteLaw,
            steelLaw,
            strainField,
            referencePoint: resolvedReferencePoint,
            includeConcreteTension: false,
            includeResponseDetails,
            postUltimateResponse: "retain",
          })
        : { N: evaluateAxialForce(strainField) };

      return {
        neutralAxisDepth,
        strainField,
        state,
        concreteStrainExtremes: includeResponseDetails
          ? resolveConcreteStrainExtremes({ section, strainField })
          : null,
        residual: state.N - nEd,
      };
    };

    const solveCandidate = ({
      samples,
      evaluateAtDepth,
      failureMode,
    }: {
      samples: number[];
      evaluateAtDepth: (
        depth: number,
        options?: { includeResponseDetails?: boolean },
      ) => DepthEvaluation;
      failureMode: FailureMode;
    }): RCUltimateSectionResult => {
      const sampledStates = samples.map((depth) => evaluateAtDepth(depth));
      let bracket: { min: number; max: number } | null = null;

      for (let index = 1; index < sampledStates.length; index += 1) {
        const previous = sampledStates[index - 1];
        const current = sampledStates[index];

        if (previous === undefined || current === undefined) {
          continue;
        }

        if (previous.residual === 0) {
          bracket = {
            min: previous.neutralAxisDepth,
            max: previous.neutralAxisDepth,
          };
          break;
        }

        if (previous.residual * current.residual <= 0) {
          bracket = {
            min: previous.neutralAxisDepth,
            max: current.neutralAxisDepth,
          };
          break;
        }
      }

      if (!bracket) {
        throw new Error(
          `RCUltimateSectionSolver could not bracket the axial equilibrium root for ${failureMode}.`,
        );
      }

      const sampledStateReport = sampledStates.map((sample) => ({
        neutralAxisDepth: sample.neutralAxisDepth,
        residual: sample.residual,
      }));

      if (bracket.min === bracket.max) {
        const direct = evaluateAtDepth(bracket.min, {
          includeResponseDetails: true,
        });
        const directState = direct.state as SectionState;

        return {
          converged: true,
          theta: normalizedTheta,
          compressedSide,
          failureMode,
          neutralAxisDepth: direct.neutralAxisDepth,
          strainField: direct.strainField,
          axialResidual: direct.residual,
          N: directState.N,
          MxRd: directState.Mx,
          MyRd: directState.My,
          state: directState,
          concreteStrainExtremes: direct.concreteStrainExtremes as ConcreteStrainExtremes,
          solverReport: {
            method: "direct-hit",
            iterations: 0,
            bracket,
            failureMode,
            sampledStates: sampledStateReport,
          },
        };
      }

      const root: IllinoisRootResult = this.rootSolver.solve({
        fn: (neutralAxisDepth) => evaluateAtDepth(neutralAxisDepth).state.N,
        min: bracket.min,
        max: bracket.max,
        target: nEd,
        includeHistory: false,
      });
      const solved = evaluateAtDepth(root.root, {
        includeResponseDetails: true,
      });
      const solvedState = solved.state as SectionState;

      return {
        converged: root.converged,
        theta: normalizedTheta,
        compressedSide,
        failureMode,
        neutralAxisDepth: solved.neutralAxisDepth,
        strainField: solved.strainField,
        axialResidual: solved.residual,
        N: solvedState.N,
        MxRd: solvedState.Mx,
        MyRd: solvedState.My,
        state: solvedState,
        concreteStrainExtremes: solved.concreteStrainExtremes as ConcreteStrainExtremes,
        solverReport: {
          method: "illinois",
          iterations: root.iterations,
          bracket: root.bracket,
          residual: root.residual,
          failureMode,
          sampledStates: sampledStateReport,
        },
      };
    };

    const solveSteelTensionCandidate = (): RCUltimateSectionResult => {
      if (!Number.isFinite(ultimateSteelTensionStrain)) {
        throw new Error(
          "RCUltimateSectionSolver requires a finite steel ultimate strain for steel tension failure.",
        );
      }

      const resolvedSteelStrain = ultimateSteelTensionStrain as number;
      const minProjection = projectedBounds.minimum.projection;
      const maxProjection = projectedBounds.maximum.projection;
      const sideSign = compressedSide === "positive" ? 1 : -1;
      const compressedEdgeProjection =
        compressedSide === "positive" ? maxProjection : minProjection;
      const tensionBarProjection =
        compressedSide === "positive"
          ? Math.min(...reinforcementProjections)
          : Math.max(...reinforcementProjections);
      const maximumTensionDistance = sideSign * (compressedEdgeProjection - tensionBarProjection);
      const minimumDepth = Math.max(characteristicLength * 1e-4, 1e-6);
      const maximumDepth = maximumTensionDistance * (1 - 1e-6);

      const evaluateSteelFailureAtDepth = (
        neutralAxisDepth: number,
        { includeResponseDetails = false }: { includeResponseDetails?: boolean } = {},
      ): DepthEvaluation => {
        const strainField = buildStrainFieldForOrientedSteelTensionFailure({
          section,
          theta: normalizedTheta,
          projectedBounds,
          direction,
          neutralAxisDepth,
          ultimateTensionStrain: resolvedSteelStrain,
          compressedSide,
          reinforcementBars,
          reinforcementProjections,
          includeResponseDetails,
        });
        const state = includeResponseDetails
          ? this.sectionIntegrator.evaluate({
              section,
              concreteFibers,
              concreteLaw,
              steelLaw,
              strainField,
              referencePoint: resolvedReferencePoint,
              includeConcreteTension: false,
              includeResponseDetails,
              postUltimateResponse: "retain",
            })
          : { N: evaluateAxialForce(strainField) };

        return {
          neutralAxisDepth,
          strainField,
          state,
          concreteStrainExtremes: includeResponseDetails
            ? resolveConcreteStrainExtremes({ section, strainField })
            : null,
          residual: state.N - nEd,
        };
      };

      return solveCandidate({
        samples: createDepthSamplesInRange({
          minimum: minimumDepth,
          maximum: maximumDepth,
        }),
        evaluateAtDepth: evaluateSteelFailureAtDepth,
        failureMode: "steel-tension",
      });
    };

    const solveUniformSteelTensionCandidate = (): RCUltimateSectionResult => {
      if (!Number.isFinite(ultimateSteelTensionStrain)) {
        throw new Error(
          "RCUltimateSectionSolver requires a finite steel ultimate strain for pure steel tension failure.",
        );
      }

      const strainField = new StrainField({
        eps0: ultimateSteelTensionStrain as number,
        kappaY: 0,
        kappaZ: 0,
      });
      const state = this.sectionIntegrator.evaluate({
        section,
        concreteFibers,
        concreteLaw,
        steelLaw,
        strainField,
        referencePoint: resolvedReferencePoint,
        includeConcreteTension: false,
        postUltimateResponse: "retain",
      });
      const residual = state.N - nEd;
      const concreteStrainExtremes = resolveConcreteStrainExtremes({
        section,
        strainField,
      });
      const axialTolerance = Math.max(10, Math.abs(nEd) * 1e-6);

      if (Math.abs(residual) > axialTolerance) {
        throw new Error(
          "RCUltimateSectionSolver pure steel tension state does not match the axial load.",
        );
      }

      return {
        converged: true,
        theta: normalizedTheta,
        compressedSide,
        failureMode: "steel-tension",
        neutralAxisDepth: Number.POSITIVE_INFINITY,
        strainField,
        axialResidual: residual,
        N: state.N,
        MxRd: state.Mx,
        MyRd: state.My,
        state,
        concreteStrainExtremes,
        solverReport: {
          method: "uniform-steel-tension",
          iterations: 0,
          residual,
          failureMode: "steel-tension",
        },
      };
    };

    let concreteCandidate: RCUltimateSectionResult | null = null;
    let concreteError: unknown = null;

    try {
      concreteCandidate = solveCandidate({
        samples: createDepthSamples(characteristicLength),
        evaluateAtDepth: evaluateConcreteFailureAtDepth,
        failureMode: "concrete-compression",
      });
    } catch (error) {
      concreteError = error;
    }

    if (
      concreteCandidate &&
      !steelTensionExceeded(concreteCandidate.state, ultimateSteelTensionStrain)
    ) {
      return concreteCandidate;
    }

    try {
      return solveSteelTensionCandidate();
    } catch (steelError) {
      try {
        return solveUniformSteelTensionCandidate();
      } catch {
        // Preserve the source bracketing error when pure tension is not applicable.
      }

      if (concreteCandidate) {
        throw steelError;
      }

      throw concreteError ?? steelError;
    }
  }

  solveUniaxialAtAxialLoad({
    section,
    concreteFibers,
    concreteLaw,
    steelLaw,
    nEd,
    compressedEdge = "top",
    referencePoint = null,
  }: SolveUniaxialAtAxialLoadOptions): RCUltimateSectionResult {
    const orientedResult = this.solveAtAxialLoad({
      section,
      concreteFibers,
      concreteLaw,
      steelLaw,
      nEd,
      theta: 0,
      compressedSide: compressedEdge === "top" ? "positive" : "negative",
      referencePoint,
    });

    return {
      ...orientedResult,
      compressedEdge,
    };
  }
}
