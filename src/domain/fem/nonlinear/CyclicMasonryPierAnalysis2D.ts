import { DenseLinearSolver } from "../../math/DenseLinearSolver.js";
import type { NumericMatrix, NumericVector } from "../../math/arrayLinearAlgebra.js";
import type { UnitSystem } from "../../units/UnitSystem.js";
import type {
  CyclicMasonryPierState,
  CyclicMasonryPierStateExport,
} from "../elements/masonry/CyclicMasonryPier2D.js";
import type { MasonryFiberResponse } from "../../sections/masonry/MasonryFiberInterface2D.js";
import type { CyclicMasonryShearState } from "../../materials/masonry/CyclicMasonryShearMaterial.js";

export interface CyclicMasonryPierAnalysisLinearSolver {
  solve(matrix: NumericMatrix, vector: NumericVector): NumericVector;
}

export interface CyclicMasonryPierAnalysisElement {
  readonly width: number;
  readonly thickness: number;
  readonly height: number;
  readonly elasticCoreHeight: number;
  readonly hingeLength: number;
  readonly elasticModulus: number;
  readonly units: UnitSystem;
  setTrialLocalDisplacements(displacements: NumericVector): CyclicMasonryPierState;
  getCommittedResponse(): CyclicMasonryPierState;
  exportState(options?: { committed?: boolean }): CyclicMasonryPierStateExport;
  commitState(): number;
  revertToLastCommit(): number;
  importState(state: CyclicMasonryPierStateExport, options?: { committed?: boolean }): this;
}

export interface CyclicMasonryPierAnalysis2DOptions {
  linearSolver?: CyclicMasonryPierAnalysisLinearSolver;
}

export interface CyclicMasonryPierAnalysisSolveOptions {
  element?: CyclicMasonryPierAnalysisElement | null;
  axialCompression?: number | null;
  lateralDisplacements?: NumericVector | null;
  boundaryCondition?: string | null;
  tolerance?: number | null;
  maxIterations?: number | null;
  throwOnFailure?: boolean;
}

export interface CyclicMasonryPierAnalysisTermination {
  reason: string;
  step: number;
  iteration: number;
}

export interface CyclicMasonryPierHistoryPoint {
  step: number;
  iterationCount: number;
  lateralDisplacement: number;
  axialDisplacement: number;
  topRotation: number;
  lateralForce: number;
  drift: number;
  baseMoment: number;
  topMoment: number;
  shear: number;
  axialForce: number;
  compressedLength: number;
  compressedLengthBottom: number;
  compressedLengthTop: number;
  compressionDamage: number;
  compressionDamageBottom: number;
  compressionDamageTop: number;
  shearDamage: number;
  shearPlasticDeformation: number;
  pinchingFactor: number;
  diagonalTensionCapacity: number;
  slidingCapacity: number;
  energyDissipated: number;
  predominantMechanism: string;
  mechanismsActivated: string[];
  rockingIndex: number;
  crushingIndex: number;
  diagonalCrackingIndex: number;
  slidingIndex: number;
  shearDeformation: number;
  interfaceRotations: NumericVector;
  localIterations: number;
  localResidualNorm: number;
}

export interface CyclicMasonryPierAnalysisResult {
  status: "ok" | "failed";
  points: CyclicMasonryPierHistoryPoint[];
  warnings: string[];
  assumptions: string[];
  termination: CyclicMasonryPierAnalysisTermination;
  finalState: CyclicMasonryPierStateExport;
  units: {
    force: string;
    length: string;
    moment: string;
  };
}

interface CyclicMasonryPierAnalysisResponse extends CyclicMasonryPierState {
  localDisplacements: NumericVector;
  localForces: NumericVector;
  localTangent: NumericMatrix;
  compressedLengths: NumericVector;
  bottomInterface: MasonryFiberResponse;
  topInterface: MasonryFiberResponse;
  shear: CyclicMasonryShearState;
  analysisHeight?: number;
}

function assertPositive(value: number | null | undefined, label: string): asserts value is number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new Error(`CyclicMasonryPierAnalysis2D requires a positive ${label}.`);
  }
}

function vectorValue(vector: NumericVector, index: number): number {
  const value = vector[index];
  if (value === undefined) {
    throw new Error("CyclicMasonryPierAnalysis2D response vector entry is unavailable.");
  }
  return value;
}

function matrixValue(matrix: NumericMatrix, row: number, column: number): number {
  const matrixRow = matrix[row];
  if (matrixRow === undefined) {
    throw new Error("CyclicMasonryPierAnalysis2D response matrix row is unavailable.");
  }
  return vectorValue(matrixRow, column);
}

function recordValue(record: Record<string, number>, key: string): number {
  const value = record[key];
  if (value === undefined) {
    throw new Error("CyclicMasonryPierAnalysis2D response index is unavailable.");
  }
  return value;
}

function errorMessage(error: unknown): string {
  if (error !== null && typeof error === "object" && "message" in error) {
    return String(Reflect.get(error, "message"));
  }
  return "undefined";
}

function normalizedResidual(
  residual: NumericVector,
  axialCompression: number,
  momentScale: number,
): number {
  const forceScale = Math.max(Math.abs(axialCompression), 1);
  return Math.sqrt(
    (vectorValue(residual, 0) / forceScale) ** 2 +
      (vectorValue(residual, 1) / Math.max(momentScale, 1)) ** 2,
  );
}

function responseWithRequiredFields(
  response: CyclicMasonryPierState,
): CyclicMasonryPierAnalysisResponse {
  if (
    !response.localDisplacements ||
    !response.localForces ||
    !response.localTangent ||
    !response.compressedLengths ||
    !response.bottomInterface ||
    !response.topInterface ||
    !response.shear
  ) {
    throw new Error("CyclicMasonryPierAnalysis2D requires a complete pier response.");
  }

  return {
    ...response,
    localDisplacements: response.localDisplacements,
    localForces: response.localForces,
    localTangent: response.localTangent,
    compressedLengths: response.compressedLengths,
    bottomInterface: response.bottomInterface,
    topInterface: response.topInterface,
    shear: response.shear,
  };
}

function benchmarkPoint(
  step: number,
  targetDisplacement: number,
  response: CyclicMasonryPierAnalysisResponse,
  iterationCount: number,
): CyclicMasonryPierHistoryPoint {
  const compressedLength = Math.min(...response.compressedLengths);

  return {
    step,
    iterationCount,
    lateralDisplacement: targetDisplacement,
    axialDisplacement: vectorValue(response.localDisplacements, 3),
    topRotation: vectorValue(response.localDisplacements, 5),
    lateralForce: vectorValue(response.localForces, 4),
    drift: targetDisplacement / response.analysisHeight!,
    baseMoment: vectorValue(response.localForces, 2),
    topMoment: vectorValue(response.localForces, 5),
    shear: response.shearForce,
    axialForce: -response.axialForce,
    compressedLength,
    compressedLengthBottom: vectorValue(response.compressedLengths, 0),
    compressedLengthTop: vectorValue(response.compressedLengths, 1),
    compressionDamage: response.compressionDamage,
    compressionDamageBottom: response.bottomInterface.maxCompressionDamage,
    compressionDamageTop: response.topInterface.maxCompressionDamage,
    shearDamage: response.shearDamage,
    shearPlasticDeformation: response.shear.plasticDeformation,
    pinchingFactor: response.shear.pinchingFactor,
    diagonalTensionCapacity: response.shear.capacities.diagonalTension,
    slidingCapacity: response.shear.capacities.sliding,
    energyDissipated: response.energyDissipated,
    predominantMechanism: response.predominantMechanism,
    mechanismsActivated: [...response.mechanismsActivated],
    rockingIndex: recordValue(response.mechanismIndices, "rocking"),
    crushingIndex: recordValue(response.mechanismIndices, "crushing"),
    diagonalCrackingIndex: recordValue(response.mechanismIndices, "diagonalTension"),
    slidingIndex: recordValue(response.mechanismIndices, "sliding"),
    shearDeformation: response.shearDeformation,
    interfaceRotations: [...response.interfaceRotations],
    localIterations: response.localIterations,
    localResidualNorm: response.localResidualNorm,
  };
}

function historyPointCsvValue(point: CyclicMasonryPierHistoryPoint, column: string): string {
  switch (column) {
    case "step":
      return String(point.step);
    case "lateralDisplacement":
      return String(point.lateralDisplacement);
    case "lateralForce":
      return String(point.lateralForce);
    case "drift":
      return String(point.drift);
    case "baseMoment":
      return String(point.baseMoment);
    case "shear":
      return String(point.shear);
    case "axialForce":
      return String(point.axialForce);
    case "compressedLength":
      return String(point.compressedLength);
    case "compressionDamage":
      return String(point.compressionDamage);
    case "shearDamage":
      return String(point.shearDamage);
    case "energyDissipated":
      return String(point.energyDissipated);
    case "predominantMechanism":
      return String(point.predominantMechanism);
    default:
      return "undefined";
  }
}

function isHistoryPointArray(value: unknown): value is readonly CyclicMasonryPierHistoryPoint[] {
  return Array.isArray(value);
}

export function cyclicMasonryPierHistoryToCsv(
  points: readonly CyclicMasonryPierHistoryPoint[] | null | undefined,
): string {
  if (!isHistoryPointArray(points)) {
    throw new Error("cyclicMasonryPierHistoryToCsv requires an array of analysis points.");
  }

  const columns = [
    "step",
    "lateralDisplacement",
    "lateralForce",
    "drift",
    "baseMoment",
    "shear",
    "axialForce",
    "compressedLength",
    "compressionDamage",
    "shearDamage",
    "energyDissipated",
    "predominantMechanism",
  ];
  const rows = points.map((point) =>
    columns.map((column) => historyPointCsvValue(point, column)).join(","),
  );

  return [columns.join(","), ...rows].join("\n");
}

/**
 * Standalone cyclic displacement protocol for one cantilever or fixed-fixed
 * masonry pier. Lateral displacement is prescribed while a two-variable
 * Newton solve enforces current axial compression and, for a cantilever, zero
 * top moment. State is committed only after convergence of each target.
 */
export class CyclicMasonryPierAnalysis2D {
  readonly linearSolver: CyclicMasonryPierAnalysisLinearSolver;

  constructor({ linearSolver = new DenseLinearSolver() }: CyclicMasonryPierAnalysis2DOptions = {}) {
    this.linearSolver = linearSolver;
  }

  solve({
    element,
    axialCompression,
    lateralDisplacements,
    boundaryCondition = "cantilever",
    tolerance = 1e-6,
    maxIterations = 30,
    throwOnFailure = false,
  }: CyclicMasonryPierAnalysisSolveOptions = {}): CyclicMasonryPierAnalysisResult {
    if (!element || typeof element.setTrialLocalDisplacements !== "function") {
      throw new Error("CyclicMasonryPierAnalysis2D requires a cyclic masonry pier element.");
    }

    if (
      typeof axialCompression !== "number" ||
      !Number.isFinite(axialCompression) ||
      axialCompression < 0
    ) {
      throw new Error("CyclicMasonryPierAnalysis2D requires a non-negative axialCompression.");
    }

    if (
      !Array.isArray(lateralDisplacements) ||
      lateralDisplacements.length === 0 ||
      lateralDisplacements.some((value) => !Number.isFinite(value))
    ) {
      throw new Error(
        "CyclicMasonryPierAnalysis2D requires a non-empty finite lateralDisplacements array.",
      );
    }

    const normalizedBoundary = String(boundaryCondition).trim().toLowerCase();

    if (!new Set(["cantilever", "fixed-fixed"]).has(normalizedBoundary)) {
      throw new Error(
        'CyclicMasonryPierAnalysis2D boundaryCondition must be "cantilever" or "fixed-fixed".',
      );
    }

    assertPositive(tolerance, "tolerance");
    assertPositive(maxIterations, "maxIterations");

    const committedAtStart = element.exportState({ committed: true });
    const warnings: string[] = [];
    const points: CyclicMasonryPierHistoryPoint[] = [];
    const committedResponse = element.getCommittedResponse();
    let axialDisplacement = committedResponse.localDisplacements?.[3] ?? 0;
    let topRotation = committedResponse.localDisplacements?.[5] ?? 0;
    let termination: CyclicMasonryPierAnalysisTermination = {
      reason: "protocol-completed",
      step: lateralDisplacements.length,
      iteration: 0,
    };

    if (
      axialCompression > 0 &&
      Math.abs(committedResponse.axialForce ?? 0) < 1e-12 &&
      Math.abs(axialDisplacement) < 1e-12
    ) {
      const area = element.width * element.thickness;
      axialDisplacement =
        (-axialCompression * (element.elasticCoreHeight + 2 * element.hingeLength)) /
        (element.elasticModulus * area);
    }

    const targets =
      vectorValue(lateralDisplacements, 0) === 0
        ? [...lateralDisplacements]
        : [0, ...lateralDisplacements];

    for (let step = 0; step < targets.length; step += 1) {
      const targetDisplacement = vectorValue(targets, step);
      let converged = false;
      let response: CyclicMasonryPierAnalysisResponse | null = null;
      let residualNorm = Infinity;
      let iteration = 1;

      for (; iteration <= maxIterations; iteration += 1) {
        const localDisplacements = [
          0,
          0,
          0,
          axialDisplacement,
          targetDisplacement,
          normalizedBoundary === "fixed-fixed" ? 0 : topRotation,
        ];

        try {
          response = responseWithRequiredFields(
            element.setTrialLocalDisplacements(localDisplacements),
          );
        } catch (error) {
          warnings.push(
            `Cyclic masonry protocol stopped at step ${step}, iteration ${iteration}: ${errorMessage(error)}`,
          );
          termination = {
            reason: "local-element-nonconvergence",
            step,
            iteration,
          };
          break;
        }

        response.analysisHeight = element.height;
        const axialResidual = vectorValue(response.localForces, 3) + axialCompression;
        const momentResidual =
          normalizedBoundary === "cantilever" ? vectorValue(response.localForces, 5) : 0;
        const residual = [axialResidual, momentResidual];
        residualNorm = normalizedResidual(
          residual,
          axialCompression,
          Math.max(axialCompression * element.width, 1),
        );

        if (residualNorm <= tolerance) {
          converged = true;
          break;
        }

        try {
          if (normalizedBoundary === "fixed-fixed") {
            const stiffness = matrixValue(response.localTangent, 3, 3);

            if (!Number.isFinite(stiffness) || Math.abs(stiffness) < 1e-14) {
              throw new Error("zero axial tangent");
            }

            axialDisplacement -= axialResidual / stiffness;
          } else {
            const tangent = [
              [matrixValue(response.localTangent, 3, 3), matrixValue(response.localTangent, 3, 5)],
              [matrixValue(response.localTangent, 5, 3), matrixValue(response.localTangent, 5, 5)],
            ];
            const correction = this.linearSolver.solve(tangent, [-axialResidual, -momentResidual]);
            axialDisplacement += vectorValue(correction, 0);
            topRotation += vectorValue(correction, 1);
          }
        } catch (error) {
          warnings.push(
            `Cyclic masonry protocol stopped at step ${step}, iteration ${iteration} because the external equilibrium tangent is singular: ${errorMessage(error)}`,
          );
          termination = {
            reason: "singular-external-tangent",
            step,
            iteration,
          };
          break;
        }
      }

      if (!converged) {
        element.revertToLastCommit();

        if (termination.reason === "protocol-completed") {
          warnings.push(
            `Cyclic masonry protocol did not converge at step ${step} within ${maxIterations} iterations (normalized residual ${residualNorm}).`,
          );
          termination = {
            reason: "max-iterations",
            step,
            iteration: maxIterations,
          };
        }

        if (throwOnFailure) {
          element.importState(committedAtStart, { committed: true });
          throw new Error(warnings.at(-1));
        }

        break;
      }

      element.commitState();
      if (response === null) {
        throw new Error("CyclicMasonryPierAnalysis2D completed without a pier response.");
      }
      points.push(benchmarkPoint(step, targetDisplacement, response, iteration));
      termination.iteration = iteration;
    }

    return {
      status: termination.reason === "protocol-completed" ? "ok" : "failed",
      points,
      warnings,
      assumptions: [
        "The protocol prescribes local transverse displacement and maintains the assigned current compressive axial force by Newton iteration.",
        normalizedBoundary === "cantilever"
          ? "The top rotation is solved so that the top end moment is zero."
          : "Both end rotations are fixed to zero.",
        "No adaptive subdivision is applied; a failed target is rolled back to the last converged committed state.",
      ],
      termination,
      finalState: element.exportState({ committed: true }),
      units: {
        force: element.units.force,
        length: element.units.length,
        moment: `${element.units.force}*${element.units.length}`,
      },
    };
  }
}
