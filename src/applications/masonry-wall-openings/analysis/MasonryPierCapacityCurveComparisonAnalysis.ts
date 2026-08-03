import { CalculationResult } from "../../../core/results/CalculationResult.js";
import { round, uniqueStrings } from "../../../core/results/checkUtils.js";
import { DofRegistry } from "../../../domain/fem/DofRegistry.js";
import { DisplacementControlNonlinearStaticSolver2D } from "../../../domain/fem/nonlinear/DisplacementControlNonlinearStaticSolver2D.js";
import {
  createZeroMatrix,
  createZeroVector,
  type NumericMatrix,
  type NumericVector,
} from "../../../domain/math/arrayLinearAlgebra.js";
import { createUnitResolver } from "../../../domain/units/UnitSystem.js";
import { bilinearizeCapacityCurve } from "./AlignmentCapacityBilinearization.js";
import { AlignmentSeismicAggregatedAnalysis } from "./AlignmentSeismicAggregatedAnalysis.js";
import { MasonryEquivalentFrameBuilder } from "./MasonryEquivalentFrameBuilder.js";
import { createMasonryEquivalentFrameContributorDefinition } from "./MasonryEquivalentFramePushoverInternalForces.js";
import { MasonryEquivalentFramePushoverSolver2D } from "./MasonryEquivalentFramePushoverSolver2D.js";
import { RESULT_STATUS } from "../../../core/results/resultStatus.js";
import type { DofNodeLike } from "../../../domain/fem/DofRegistry.js";
import type {
  DisplacementControlEvaluation,
  DisplacementControlModel2D,
  DisplacementControlSolveResult,
} from "../../../domain/fem/nonlinear/DisplacementControlNonlinearStaticSolver2D.js";
import type { MasonryWallOpeningsModel } from "../models/MasonryWallOpeningsModel.js";
import type { MasonryEquivalentFrameBuilderResult } from "./MasonryEquivalentFrameBuilder.js";
import type { Support } from "../../../domain/supports/Support.js";
import type { AlignmentSeismicAggregatedAnalysisResult } from "./AlignmentSeismicAggregatedAnalysis.js";

type JsonRecord = Record<string, unknown>;
type HingePosition = "start" | "end" | "shear";
type RotationPosition = "start" | "end";
type HingeSign = "positive" | "negative";
type CurvePoint = JsonRecord & {
  id: string;
  displacement: number;
  baseShear: number;
};
type HingeState = JsonRecord & {
  start: HingeSign | null;
  end: HingeSign | null;
  shear: HingeSign | null;
  history: JsonRecord[];
};
type PlasticMomentsByPosition = Record<RotationPosition, number | null>;
type BuiltFrameElement = MasonryEquivalentFrameBuilderResult["model"]["elements"][number];
type FrameElement = Extract<
  BuiltFrameElement,
  {
    localStiffness: () => NumericMatrix;
    localDisplacements: (
      displacements: NumericVector,
      dofRegistry: MasonryEquivalentFrameBuilderResult["dofRegistry"],
    ) => NumericVector;
    transformationMatrix: () => NumericMatrix;
    getDofIds: (dofRegistry: MasonryEquivalentFrameBuilderResult["dofRegistry"]) => string[];
  }
>;
type PierFrame = DisplacementControlModel2D & {
  id: string;
  nodes: readonly DofNodeLike[];
  elements: readonly FrameElement[];
  supports: readonly Support[];
  controlNode: DofNodeLike | undefined;
  sourceFrame: MasonryEquivalentFrameBuilderResult;
  selectedPier: { id: string; elementId: string; baseNodeId: string; topNodeId: string };
};
interface PierResult extends JsonRecord {
  id: string;
  wallId?: string;
  topRotation: string;
  governingFamily?: unknown;
  governingMode?: unknown;
  mechanics?: JsonRecord;
  stiffness: number;
  peakBaseShear: number;
  ultimateDisplacement: number;
  yieldDisplacement: number;
  curvePoints: CurvePoint[];
}
interface AggregatedOutputs extends JsonRecord {
  piers?: PierResult[];
}
interface AggregatedResultLike {
  outputs: AggregatedOutputs;
  warnings: unknown[];
  assumptions: unknown[];
}
interface AnalysisOptions extends JsonRecord {
  topRotation?: unknown;
  pierId?: string;
  controlPointCount?: number;
  tolerance?: number;
  maxIterations?: number;
  sampleCount?: number;
  yieldTolerance?: number;
}
export type MasonryPierCapacityCurveComparisonAnalysisOptions = AnalysisOptions;

export interface MasonryPierCapacityCurveComparisonAnalysisInput {
  alignment?: MasonryWallOpeningsModel | null;
  stage?: string;
  options?: AnalysisOptions;
  aggregatedResult?: AlignmentSeismicAggregatedAnalysisResult | null;
}
interface HingeEvaluation extends DisplacementControlEvaluation {
  state: HingeState;
  events: JsonRecord[];
  responses: JsonRecord[];
}
interface ComparisonOutputs extends JsonRecord {
  stage: string;
  topRotation: string;
  pier?: JsonRecord;
  aggregated?: JsonRecord;
  fem?: JsonRecord;
  reading?: JsonRecord;
}
export type MasonryPierCapacityCurveComparisonAnalysisResult = CalculationResult<ComparisonOutputs>;
type ComparisonResult = MasonryPierCapacityCurveComparisonAnalysisResult;

const FEM_UNITS = Object.freeze({ force: "kN", length: "m" });
const DEFAULT_TOP_ROTATION = "free";
const DEFAULT_CONTROL_POINT_COUNT = 120;
const DEFAULT_SAMPLE_COUNT = 6;
const DEFAULT_TOLERANCE = 1e-6;
const DEFAULT_MAX_ITERATIONS = 60;
const DEFAULT_YIELD_TOLERANCE = 1e-9;
const EPS = 1e-9;

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function sourceString(value: unknown): string {
  if (value == null) return "";
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "bigint" ||
    typeof value === "symbol" ||
    typeof value === "function"
  ) {
    return value.toString();
  }
  return Object.prototype.toString.call(value);
}

function normalizeCurvePoints(value: unknown): CurvePoint[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((point, index) => {
    if (!isRecord(point)) {
      return [];
    }
    const displacement = point.displacement;
    const baseShear = point.baseShear;
    if (!isFiniteNumber(displacement) || !isFiniteNumber(baseShear)) {
      return [];
    }
    return [
      {
        ...point,
        id: typeof point.id === "string" ? point.id : `point-${index + 1}`,
        displacement,
        baseShear,
      },
    ];
  });
}

function normalizePierResult(value: unknown): PierResult {
  const record = isRecord(value) ? value : {};
  const normalized: PierResult = {
    ...record,
    id: typeof record.id === "string" ? record.id : "",
    topRotation: typeof record.topRotation === "string" ? record.topRotation : "",
    stiffness: isFiniteNumber(record.stiffness) ? record.stiffness : Number.NaN,
    peakBaseShear: isFiniteNumber(record.peakBaseShear) ? record.peakBaseShear : Number.NaN,
    ultimateDisplacement: isFiniteNumber(record.ultimateDisplacement)
      ? record.ultimateDisplacement
      : Number.NaN,
    yieldDisplacement: isFiniteNumber(record.yieldDisplacement)
      ? record.yieldDisplacement
      : Number.NaN,
    curvePoints: normalizeCurvePoints(record.curvePoints),
  };
  if (typeof record.wallId === "string") {
    normalized.wallId = record.wallId;
  }
  return normalized;
}

function normalizeAggregatedResult(
  result: AlignmentSeismicAggregatedAnalysisResult,
): AggregatedResultLike {
  return {
    outputs: {
      ...result.outputs,
      piers: (result.outputs.piers ?? []).map((pier) => normalizePierResult(pier)),
    },
    warnings: [...result.warnings],
    assumptions: [...result.assumptions],
  };
}

function normalizeHingeSign(value: unknown): HingeSign | null {
  return value === "positive" || value === "negative" ? value : null;
}

function normalizeHingeState(value: unknown): HingeState {
  const record = isRecord(value) ? value : {};
  return {
    start: normalizeHingeSign(record.start),
    end: normalizeHingeSign(record.end),
    shear: normalizeHingeSign(record.shear),
    history: Array.isArray(record.history)
      ? record.history.filter((entry): entry is JsonRecord => isRecord(entry))
      : [],
  };
}

function normalizeTopRotation(value: unknown = DEFAULT_TOP_ROTATION): "free" | "fixed" {
  const normalized = sourceString(value ?? "")
    .trim()
    .toLowerCase();

  const aliases = new Map<string, "free" | "fixed">([
    ["free", "free"],
    ["libera", "free"],
    ["hinged", "free"],
    ["fixed", "fixed"],
    ["fissa", "fixed"],
    ["incastrata", "fixed"],
    ["clamped", "fixed"],
  ]);

  const resolved = aliases.get(normalized);

  if (!resolved) {
    throw new Error(`Unsupported masonry pier topRotation option: ${sourceString(value)}.`);
  }

  return resolved;
}

function transpose(matrix: NumericMatrix): NumericMatrix {
  const firstRow = matrix[0];
  if (firstRow === undefined) {
    return [];
  }
  return firstRow.map((_, column) => matrix.map((row) => row[column] ?? 0));
}

function multiplyMatrices(left: NumericMatrix, right: NumericMatrix): NumericMatrix {
  if (left.length === 0 || right.length === 0) {
    return createZeroMatrix(left.length);
  }

  const firstRightRow = right[0];
  if (!firstRightRow) {
    return createZeroMatrix(left.length);
  }

  return left.map((leftRow) =>
    firstRightRow.map((_, column) =>
      leftRow.reduce((sum, value, index) => sum + value * (right[index]?.[column] ?? 0), 0),
    ),
  );
}

function multiplyMatrixVector(matrix: NumericMatrix, vector: NumericVector): NumericVector {
  return matrix.map((row) =>
    row.reduce((sum, value, index) => sum + value * (vector[index] ?? 0), 0),
  );
}

function subtractMatrices(left: NumericMatrix, right: NumericMatrix): NumericMatrix {
  return left.map((row, rowIndex) =>
    row.map((value, columnIndex) => value - (right[rowIndex]?.[columnIndex] ?? 0)),
  );
}

function addVectors(left: NumericVector, right: NumericVector): NumericVector {
  return left.map((value, index) => value + (right[index] ?? 0));
}

function invertSmallDenseMatrix(matrix: NumericMatrix): NumericMatrix {
  if (matrix.length === 1 && matrix[0]?.length === 1) {
    const pivot = matrix[0]?.[0];

    if (!isFiniteNumber(pivot) || Math.abs(pivot) <= EPS) {
      throw new Error("Plastic hinge condensation pivot must be finite and non-zero.");
    }

    return [[1 / pivot]];
  }

  if (matrix.length !== 2 || matrix[0]?.length !== 2 || matrix[1]?.length !== 2) {
    throw new Error(
      "Masonry pier pushover supports condensation of at most two rotational hinges.",
    );
  }

  const firstRow = matrix[0];
  const secondRow = matrix[1];
  if (!firstRow || !secondRow) {
    throw new Error(
      "Masonry pier pushover supports condensation of at most two rotational hinges.",
    );
  }
  const [a, b] = firstRow;
  const [c, d] = secondRow;
  if (a === undefined || b === undefined || c === undefined || d === undefined) {
    throw new Error(
      "Masonry pier pushover supports condensation of at most two rotational hinges.",
    );
  }
  const determinant = a * d - b * c;

  if (!Number.isFinite(determinant) || Math.abs(determinant) <= EPS) {
    throw new Error("Plastic hinge condensation determinant must be finite and non-zero.");
  }

  return [
    [d / determinant, -b / determinant],
    [-c / determinant, a / determinant],
  ];
}

function signLabel(value: number): HingeSign {
  if (!Number.isFinite(value) || value >= 0) {
    return "positive";
  }

  return "negative";
}

function plasticGeneralizedForce(sign: HingeSign | null, plasticMoment: number | null): number {
  return sign === "negative" ? (plasticMoment ?? 0) : -(plasticMoment ?? 0);
}

function cloneHingeState(state: HingeState | null = null): HingeState {
  return {
    start: state?.start ?? null,
    end: state?.end ?? null,
    shear: state?.shear ?? null,
    history: [...(state?.history ?? [])],
  };
}

function activeHingeCount(state: HingeState | null = null): number {
  return Number(state?.start != null) + Number(state?.end != null) + Number(state?.shear != null);
}

function withActivation(
  state: HingeState | null,
  position: HingePosition,
  sign: HingeSign,
  metadata: JsonRecord = {},
): HingeState {
  if (state?.[position] != null) {
    return cloneHingeState(state);
  }

  return {
    ...cloneHingeState(state),
    [position]: sign,
    history: [
      ...(state?.history ?? []),
      {
        type: "plastic-hinge-activation",
        position,
        sign,
        ...metadata,
      },
    ],
  };
}

function activationDelta(
  previousState: HingeState | null,
  nextState: HingeState,
): Array<{ position: RotationPosition; sign: HingeSign }> {
  const events: Array<{ position: RotationPosition; sign: HingeSign }> = [];

  if (previousState?.start == null && nextState?.start != null) {
    events.push({ position: "start", sign: nextState.start });
  }

  if (previousState?.end == null && nextState?.end != null) {
    events.push({ position: "end", sign: nextState.end });
  }

  return events;
}

function rotationIndex(position: RotationPosition): number {
  return position === "end" ? 5 : 2;
}

function releasedPositions(state: HingeState | null = null): RotationPosition[] {
  return (["start", "end"] as const).filter((position) => state?.[position] != null);
}

function responseForState(
  element: FrameElement,
  localDisplacements: NumericVector,
  state: HingeState,
  plasticMomentsByPosition: PlasticMomentsByPosition,
): {
  localEndForces: NumericVector;
  tangentLocalStiffness: NumericMatrix;
  plasticRotations: NumericVector;
} {
  const localElasticStiffness = element.localStiffness();
  const positions = releasedPositions(state);

  if (positions.length === 0) {
    return {
      localEndForces: multiplyMatrixVector(localElasticStiffness, localDisplacements),
      tangentLocalStiffness: localElasticStiffness,
      plasticRotations: [],
    };
  }

  const h: NumericMatrix = Array.from({ length: 6 }, () =>
    new Array<number>(positions.length).fill(0),
  );

  positions.forEach((position, columnIndex) => {
    const row = h[rotationIndex(position)];
    if (row) {
      row[columnIndex] = -1;
    }
  });

  const ht = transpose(h);
  const kaa = multiplyMatrices(ht, multiplyMatrices(localElasticStiffness, h));
  const htkd = multiplyMatrixVector(
    ht,
    multiplyMatrixVector(localElasticStiffness, localDisplacements),
  );
  const prescribedGeneralizedForce = positions.map((position) =>
    plasticGeneralizedForce(state[position], plasticMomentsByPosition[position]),
  );
  const inverseKaa = invertSmallDenseMatrix(kaa);
  const plasticRotations = multiplyMatrixVector(
    inverseKaa,
    prescribedGeneralizedForce.map((value, index) => value - (htkd[index] ?? 0)),
  );
  const localElasticDisplacements = addVectors(
    localDisplacements,
    multiplyMatrixVector(h, plasticRotations),
  );
  const localEndForces = multiplyMatrixVector(localElasticStiffness, localElasticDisplacements);
  const tangentLocalStiffness = subtractMatrices(
    localElasticStiffness,
    multiplyMatrices(
      multiplyMatrices(localElasticStiffness, h),
      multiplyMatrices(inverseKaa, multiplyMatrices(ht, localElasticStiffness)),
    ),
  );

  return {
    localEndForces,
    tangentLocalStiffness,
    plasticRotations,
  };
}

function activateMissingHinges(
  localEndForces: NumericVector,
  state: HingeState,
  plasticMomentsByPosition: PlasticMomentsByPosition,
  yieldTolerance: number | undefined,
  elementId: string,
): HingeState {
  let updatedState = cloneHingeState(state);

  for (const position of ["start", "end"] as const) {
    if (updatedState[position] != null) {
      continue;
    }

    const plasticMoment = plasticMomentsByPosition[position];

    if (!isFiniteNumber(plasticMoment) || plasticMoment <= 0) {
      continue;
    }

    const localMoment = localEndForces[rotationIndex(position)];
    const activationThreshold =
      plasticMoment * (1 - Math.max(0, yieldTolerance ?? DEFAULT_YIELD_TOLERANCE));

    if (localMoment !== undefined && Math.abs(localMoment) >= activationThreshold) {
      updatedState = withActivation(updatedState, position, signLabel(localMoment), {
        elementId,
        plasticMoment,
        trialMoment: localMoment,
      });
    }
  }

  return updatedState;
}

function baseShearFromEvaluation(
  frame: DisplacementControlModel2D,
  evaluation: DisplacementControlEvaluation | null,
): number {
  const constrainedUxIndices = (frame.supports ?? [])
    .filter(
      (support): support is typeof support & { node: DofNodeLike } =>
        support.node != null && (support.isRestrained?.("ux") ?? support.restraints?.ux ?? false),
    )
    .map((support) => frame.dofRegistry.getIndex(support.node, "ux"));

  return Math.abs(
    constrainedUxIndices.reduce(
      (sum, index) => sum + (evaluation?.internalForceVector?.[index] ?? 0),
      0,
    ),
  );
}

void baseShearFromEvaluation;

function maxFinite(values: number[] = []): number | null {
  const finiteValues = values.filter(Number.isFinite);

  return finiteValues.length > 0 ? Math.max(...finiteValues) : null;
}

function interpolateCurve(points: CurvePoint[] = [], displacement: number): number {
  if (!Number.isFinite(displacement) || points.length === 0) {
    return 0;
  }

  const firstPoint = points[0];
  if (firstPoint && displacement <= firstPoint.displacement + EPS) {
    return firstPoint.baseShear;
  }

  for (let index = 0; index < points.length - 1; index += 1) {
    const startPoint = points[index];
    const endPoint = points[index + 1];
    if (!startPoint || !endPoint) {
      continue;
    }

    if (displacement > endPoint.displacement + EPS) {
      continue;
    }

    const deltaDisplacement = endPoint.displacement - startPoint.displacement;

    if (deltaDisplacement <= EPS) {
      return endPoint.baseShear;
    }

    const ratio = (displacement - startPoint.displacement) / deltaDisplacement;

    return startPoint.baseShear + ratio * (endPoint.baseShear - startPoint.baseShear);
  }

  return points.at(-1)?.baseShear ?? 0;
}

function metricDelta(
  id: string,
  label: string,
  aggregatedValue: number | null | undefined,
  femValue: number | null | undefined,
): JsonRecord {
  const delta =
    isFiniteNumber(aggregatedValue) && isFiniteNumber(femValue) ? femValue - aggregatedValue : null;
  const variationPercent =
    isFiniteNumber(delta) && isFiniteNumber(aggregatedValue) && Math.abs(aggregatedValue) > EPS
      ? (delta / aggregatedValue) * 100
      : null;

  return {
    id,
    label,
    aggregatedValue: round(aggregatedValue),
    femValue: round(femValue),
    delta: round(delta),
    variationPercent: round(variationPercent),
  };
}

function sampleCurveComparison({
  aggregatedCurve,
  femCurve,
  yieldDisplacement,
  ultimateDisplacement,
  sampleCount = DEFAULT_SAMPLE_COUNT,
}: {
  aggregatedCurve: CurvePoint[];
  femCurve: CurvePoint[];
  yieldDisplacement: number;
  ultimateDisplacement: number;
  sampleCount?: number;
}): JsonRecord[] {
  const intermediateFractions = Array.from(
    { length: Math.max(1, sampleCount) },
    (_, index) => (index + 1) / (sampleCount + 1),
  );
  const sampleDisplacements = [
    0,
    yieldDisplacement,
    ...intermediateFractions.map((ratio) => ratio * ultimateDisplacement),
    ultimateDisplacement,
  ]
    .filter(Number.isFinite)
    .sort((left, right) => left - right)
    .filter(
      (value, index, values) =>
        index === 0 || Math.abs(value - (values[index - 1] ?? value)) > 1e-8,
    );

  return sampleDisplacements.map((displacement, index) => {
    const aggregatedBaseShear = interpolateCurve(aggregatedCurve, displacement);
    const femBaseShear = interpolateCurve(femCurve, displacement);
    const delta = femBaseShear - aggregatedBaseShear;
    const variationPercent =
      Math.abs(aggregatedBaseShear) > EPS ? (delta / aggregatedBaseShear) * 100 : null;

    return {
      id: `sample-${index + 1}`,
      displacement: round(displacement),
      aggregatedBaseShear: round(aggregatedBaseShear),
      femBaseShear: round(femBaseShear),
      delta: round(delta),
      variationPercent: round(variationPercent),
    };
  });
}

function buildReading(metricDeltas: JsonRecord[] = []): JsonRecord {
  const metricById: Record<string, JsonRecord> = Object.fromEntries(
    metricDeltas.map((metric) => [String(metric.id), metric]),
  );
  const thresholds: Record<string, number> = {
    ks: 10,
    Vy: 10,
    du: 5,
  };
  const failedMetric = ["ks", "Vy", "du"].find((metricId) => {
    const variationPercent = metricById[metricId]?.variationPercent;

    return isFiniteNumber(variationPercent)
      ? Math.abs(variationPercent) > (thresholds[metricId] ?? 0)
      : false;
  });
  const outcome = failedMetric ? "attention" : "consistent";

  return {
    outcome,
    headline:
      outcome === "consistent"
        ? "Il pushover FEM del maschio riproduce la curva aggregata con scarti contenuti su rigidezza, resistenza e deformabilita."
        : "Il pushover FEM del maschio mostra scarti non trascurabili rispetto alla curva aggregata e richiede una lettura cauta.",
    governingMetricId: failedMetric ?? "aligned-response",
    messages: [
      `Scarto rigidezza ks: ${sourceString(round(metricById.ks?.variationPercent))}%.`,
      `Scarto resistenza Vy: ${sourceString(round(metricById.Vy?.variationPercent))}%.`,
      `Scarto deformabilita du: ${sourceString(round(metricById.du?.variationPercent))}%.`,
    ],
  };
}

interface ShearState {
  yielded?: boolean;
  sign?: number | null;
}

function isShearState(value: unknown): value is ShearState {
  return isRecord(value);
}

function createSingleDofPushoverModel({
  referenceHorizontalForce,
  dofId = "masonry-pier-shear.ux",
}: {
  referenceHorizontalForce: number;
  dofId?: string;
}): DisplacementControlModel2D {
  const dofRegistry = new DofRegistry({ dofsPerNode: ["ux"] });
  const nodeId = dofId.endsWith(".ux") ? dofId.slice(0, -3) : "masonry-pier-shear";
  dofRegistry.registerNode({ id: nodeId });

  return {
    supports: [],
    referenceLoadVector: [referenceHorizontalForce],
    controlVector: [1],
    dofRegistry,
  };
}

function solveShearControlledPushover({
  solver,
  stiffness,
  peakBaseShear,
  ultimateDisplacement,
  controlPointCount,
  tolerance = DEFAULT_TOLERANCE,
  maxIterations = DEFAULT_MAX_ITERATIONS,
}: {
  solver: DisplacementControlNonlinearStaticSolver2D;
  stiffness: number;
  peakBaseShear: number;
  ultimateDisplacement: number;
  controlPointCount: number;
  tolerance?: number;
  maxIterations?: number;
}): { result: DisplacementControlSolveResult; yieldDisplacement: number } {
  const yieldDisplacement = peakBaseShear / stiffness;
  const model = createSingleDofPushoverModel({
    referenceHorizontalForce: peakBaseShear,
  });
  const result = solver.solve({
    model,
    initialState: { yielded: false, sign: null },
    cloneState: (state) => (isShearState(state) ? { ...state } : state),
    controlDisplacementIncrement: ultimateDisplacement / controlPointCount,
    maxControlDisplacement: ultimateDisplacement,
    tolerance,
    maxIterations,
    maxSteps: controlPointCount + 2,
    evaluator: ({ displacements, state }) => {
      const displacement = displacements[0] ?? 0;
      const trialForce = stiffness * displacement;
      const shouldYield = Math.abs(trialForce) >= peakBaseShear - EPS;
      const shearState = isShearState(state) ? state : null;
      const nextState: ShearState =
        shearState?.yielded || shouldYield
          ? {
              yielded: true,
              sign: Math.sign(trialForce) || shearState?.sign || 1,
            }
          : {
              yielded: false,
              sign: null,
            };
      const internalForce = nextState.yielded ? (nextState.sign ?? 1) * peakBaseShear : trialForce;
      const tangentStiffness = nextState.yielded ? [[0]] : [[stiffness]];

      return {
        internalForceVector: [internalForce],
        tangentStiffnessMatrix: tangentStiffness,
        state: nextState,
        events:
          !shearState?.yielded && nextState.yielded
            ? [
                {
                  type: "shear-yield",
                  sign: nextState.sign,
                },
              ]
            : [],
      };
    },
    pointBuilder: ({ evaluation, state }) => ({
      baseShear: evaluation ? Math.abs(evaluation.internalForceVector[0] ?? 0) : 0,
      hingeCount: Number(isShearState(state) && state.yielded),
    }),
  });

  return {
    result,
    yieldDisplacement,
  };
}

function evaluatePierFrame({
  frame,
  displacements,
  state = null,
  plasticMomentsByPosition,
  yieldTolerance = DEFAULT_YIELD_TOLERANCE,
}: {
  frame: PierFrame;
  displacements: NumericVector;
  state?: HingeState | null;
  plasticMomentsByPosition: PlasticMomentsByPosition;
  yieldTolerance?: number;
}): HingeEvaluation {
  const element = frame.elements?.[0];

  if (!element) {
    throw new Error("Masonry pier pushover requires a single frame element.");
  }

  const previousState = cloneHingeState(state);
  const localDisplacements = element.localDisplacements(displacements, frame.dofRegistry);
  let trialState = cloneHingeState(previousState);
  let response: ReturnType<typeof responseForState> | null = null;

  for (let iteration = 0; iteration < 3; iteration += 1) {
    response = responseForState(element, localDisplacements, trialState, plasticMomentsByPosition);
    const updatedState = activateMissingHinges(
      response.localEndForces,
      trialState,
      plasticMomentsByPosition,
      yieldTolerance,
      element.id,
    );

    if (updatedState.start === trialState.start && updatedState.end === trialState.end) {
      break;
    }

    trialState = updatedState;
  }

  const transformation = element.transformationMatrix();
  if (!response) {
    throw new Error("Masonry pier pushover did not produce an element response.");
  }
  const tangentGlobalStiffness = multiplyMatrices(
    transpose(transformation),
    multiplyMatrices(response.tangentLocalStiffness, transformation),
  );
  const globalEndForces = multiplyMatrixVector(transpose(transformation), response.localEndForces);
  const dofIds = element.getDofIds(frame.dofRegistry);
  const indices = dofIds.map((dofId) => frame.dofRegistry.getIndex(dofId));
  const internalForceVector = createZeroVector(frame.dofRegistry.size());
  const tangentStiffnessMatrix = createZeroMatrix(frame.dofRegistry.size());

  for (let localRow = 0; localRow < indices.length; localRow += 1) {
    const globalRow = indices[localRow];

    const localForce = globalEndForces[localRow];
    if (globalRow === undefined || localForce === undefined) {
      continue;
    }
    internalForceVector[globalRow] = (internalForceVector[globalRow] ?? 0) + localForce;

    for (let localColumn = 0; localColumn < indices.length; localColumn += 1) {
      const globalColumn = indices[localColumn];
      if (globalColumn === undefined) {
        continue;
      }

      const tangentRow = tangentStiffnessMatrix[globalRow];
      if (tangentRow) {
        tangentRow[globalColumn] =
          (tangentRow[globalColumn] ?? 0) + (tangentGlobalStiffness[localRow]?.[localColumn] ?? 0);
      }
    }
  }

  return {
    internalForceVector,
    tangentStiffnessMatrix,
    state: trialState,
    events: activationDelta(previousState, trialState).map((event) => ({
      ...event,
      type: "plastic-hinge-activation",
      elementId: element.id,
      plasticMoment: plasticMomentsByPosition[event.position],
    })),
    responses: [
      {
        elementId: element.id,
        localEndForces: [...response.localEndForces],
        globalEndForces: [...globalEndForces],
        plasticRotations: [...response.plasticRotations],
        hingeState: cloneHingeState(trialState),
      },
    ],
  };
}

void solveShearControlledPushover;
void evaluatePierFrame;

function buildSinglePierFrame({
  frameBuilder = new MasonryEquivalentFrameBuilder(),
  alignment,
  stage,
  topRotation,
  pierId,
  referenceHorizontalForce = 1,
}: {
  frameBuilder?: MasonryEquivalentFrameBuilder;
  alignment: MasonryWallOpeningsModel;
  stage: string;
  topRotation: "free" | "fixed";
  pierId?: string;
  referenceHorizontalForce?: number;
}): PierFrame {
  const frame = frameBuilder.build({
    alignment,
    stage,
    options: { topRotation },
  });
  const selectedPier =
    pierId == null
      ? frame.pierFrames.length === 1
        ? frame.pierFrames[0]
        : null
      : (frame.pierFrames.find((pier) => pier.id === pierId) ?? null);

  if (!selectedPier) {
    throw new Error(
      pierId == null
        ? "Masonry pier pushover comparison requires a single extracted pier or an explicit pierId."
        : `Pier ${pierId} was not found in the equivalent-frame model.`,
    );
  }

  const nodes = frame.model.nodes.filter(
    (node) => node.id === selectedPier.baseNodeId || node.id === selectedPier.topNodeId,
  );
  const elements = frame.model.elements.filter(
    (element): element is FrameElement =>
      element.id === selectedPier.elementId &&
      "localStiffness" in element &&
      typeof element.localStiffness === "function" &&
      typeof element.localDisplacements === "function" &&
      typeof element.transformationMatrix === "function" &&
      typeof element.getDofIds === "function",
  );
  const supports = frame.model.supports.filter(
    (support) =>
      support.metadata?.sourcePierId === selectedPier.id ||
      support.node?.id === selectedPier.baseNodeId ||
      support.node?.id === selectedPier.topNodeId,
  );
  const dofRegistry = new DofRegistry();

  dofRegistry.registerNodes(nodes);
  dofRegistry.registerElements(elements);
  dofRegistry.registerNodes(supports.flatMap((support) => (support.node ? [support.node] : [])));

  const topNode = nodes.find((node) => node.id === selectedPier.topNodeId);
  if (!topNode) {
    throw new Error(`Pier ${selectedPier.id} has no top node in the equivalent-frame model.`);
  }
  const referenceLoadVector = createZeroVector(dofRegistry.size());
  const controlVector = createZeroVector(dofRegistry.size());

  referenceLoadVector[dofRegistry.getIndex(topNode, "ux")] = referenceHorizontalForce;
  controlVector[dofRegistry.getIndex(topNode, "ux")] = 1;

  return {
    id: `${alignment.id}-${selectedPier.id}-pushover-frame`,
    nodes,
    elements,
    supports,
    dofRegistry,
    referenceLoadVector,
    controlVector,
    controlNode: topNode,
    sourceFrame: frame,
    selectedPier,
  };
}

export class MasonryPierCapacityCurveComparisonAnalysis {
  readonly aggregatedAnalysis: AlignmentSeismicAggregatedAnalysis;
  readonly frameBuilder: MasonryEquivalentFrameBuilder;
  readonly frameSolver: MasonryEquivalentFramePushoverSolver2D;
  readonly nonlinearSolver: DisplacementControlNonlinearStaticSolver2D;

  constructor({
    aggregatedAnalysis = new AlignmentSeismicAggregatedAnalysis(),
    frameBuilder = new MasonryEquivalentFrameBuilder(),
    frameSolver = new MasonryEquivalentFramePushoverSolver2D(),
    nonlinearSolver = new DisplacementControlNonlinearStaticSolver2D(),
  }: {
    aggregatedAnalysis?: AlignmentSeismicAggregatedAnalysis;
    frameBuilder?: MasonryEquivalentFrameBuilder;
    frameSolver?: MasonryEquivalentFramePushoverSolver2D;
    nonlinearSolver?: DisplacementControlNonlinearStaticSolver2D;
  } = {}) {
    this.aggregatedAnalysis = aggregatedAnalysis;
    this.frameBuilder = frameBuilder;
    this.frameSolver = frameSolver;
    this.nonlinearSolver = nonlinearSolver;
  }

  analyze({
    alignment,
    stage = "design",
    options = {},
    aggregatedResult: precomputedAggregatedResult = null,
  }: {
    alignment?: MasonryWallOpeningsModel | null;
    stage?: string;
    options?: AnalysisOptions;
    aggregatedResult?: AlignmentSeismicAggregatedAnalysisResult | null;
  } = {}): ComparisonResult {
    if (!alignment) {
      throw new Error("MasonryPierCapacityCurveComparisonAnalysis requires an alignment model.");
    }

    const topRotation = normalizeTopRotation(options.topRotation ?? DEFAULT_TOP_ROTATION);
    const aggregatedResult = normalizeAggregatedResult(
      precomputedAggregatedResult ??
        this.aggregatedAnalysis.analyze({
          alignment,
          stage,
          options: {
            ...options,
            topRotation,
          },
        }),
    );
    const aggregatedPiers = aggregatedResult.outputs?.piers ?? [];
    const selectedPier =
      options.pierId == null
        ? aggregatedPiers.length === 1
          ? aggregatedPiers[0]
          : null
        : (aggregatedPiers.find((pier) => pier.id === options.pierId) ?? null);

    if (!selectedPier) {
      return new CalculationResult({
        applicationId: "masonry-wall-openings",
        status: RESULT_STATUS.NOT_VERIFIED,
        summary:
          "Pier capacity-curve comparison could not select a unique masonry pier from the aggregated analysis output.",
        outputs: {
          stage,
          topRotation,
          availablePierIds: aggregatedPiers.map((pier) => pier.id),
        },
        warnings: uniqueStrings([
          ...(aggregatedResult.warnings ?? []),
          "Select an explicit pierId when the alignment contains more than one pier.",
        ]),
        assumptions: uniqueStrings([
          ...(aggregatedResult.assumptions ?? []),
          "The first FEM/non-linear comparison is scoped to a single masonry pier so the equivalent-frame pushover can be interpreted directly against the aggregated contribution curve.",
        ]),
        metadata: {
          comparisonType: "masonry-pier-capacity-curve",
          stage,
          topRotation,
        },
      });
    }

    const toFem = createUnitResolver(alignment.units, FEM_UNITS);
    const fromFem = createUnitResolver(FEM_UNITS, alignment.units);
    const singlePierFrame = buildSinglePierFrame({
      frameBuilder: this.frameBuilder,
      alignment,
      stage,
      topRotation,
      pierId: selectedPier.id,
      referenceHorizontalForce: Math.max(1, toFem.force(selectedPier.peakBaseShear)),
    });
    const controlPointCount = Math.max(
      20,
      Math.round(options.controlPointCount ?? DEFAULT_CONTROL_POINT_COUNT),
    );
    const contributorDefinition = createMasonryEquivalentFrameContributorDefinition({
      alignment,
      pier: selectedPier,
      topRotation,
    });
    const solverResult = this.frameSolver.solve({
      frame: singlePierFrame,
      contributorsByElementId: {
        [singlePierFrame.selectedPier.elementId]: contributorDefinition,
      },
      controlDisplacementIncrement: contributorDefinition.failureDisplacement / controlPointCount,
      maxControlDisplacement: contributorDefinition.failureDisplacement,
      tolerance: options.tolerance ?? DEFAULT_TOLERANCE,
      maxIterations: options.maxIterations ?? DEFAULT_MAX_ITERATIONS,
      maxSteps: controlPointCount + 2,
      yieldTolerance: options.yieldTolerance ?? DEFAULT_YIELD_TOLERANCE,
    });
    const hingeStatesByElementId = isRecord(solverResult.hingeStatesByElementId)
      ? solverResult.hingeStatesByElementId
      : null;
    const contributorStateValue =
      hingeStatesByElementId?.[singlePierFrame.selectedPier.elementId] ?? null;
    const contributorState = isRecord(contributorStateValue) ? contributorStateValue : null;
    const contributorHingeState = normalizeHingeState(contributorState?.hingeState);
    const femCurvePoints: Array<CurvePoint & { hingeCount: unknown }> = solverResult.points.map(
      (point, index) => ({
        id: `${selectedPier.id}-fem-point-${index + 1}`,
        displacement: round(fromFem.length(point.controlDisplacement)),
        baseShear: round(
          isFiniteNumber(point.baseShear) ? fromFem.force(point.baseShear) : Number.NaN,
        ),
        hingeCount: point.hingeCount,
      }),
    );
    const failureDisplacement = round(fromFem.length(contributorDefinition.failureDisplacement));
    const comparisonCurvePoints: CurvePoint[] = femCurvePoints.map((point) => ({
      id: point.id,
      displacement: point.displacement,
      baseShear: point.baseShear,
    }));
    const lastComparisonPoint = comparisonCurvePoints.at(-1);

    if (
      !lastComparisonPoint ||
      Math.abs(lastComparisonPoint.displacement - failureDisplacement) > 1e-8 ||
      Math.abs(lastComparisonPoint.baseShear) > 1e-8
    ) {
      comparisonCurvePoints.push({
        id: `${selectedPier.id}-fem-failure`,
        displacement: failureDisplacement,
        baseShear: 0,
      });
    }

    const femBilinearization = bilinearizeCapacityCurve({
      points: comparisonCurvePoints,
    });
    const metricDeltas = [
      metricDelta("ks", "Rigidezza iniziale ks", selectedPier.stiffness, femBilinearization.ks),
      metricDelta("Vy", "Taglio equivalente Vy", selectedPier.peakBaseShear, femBilinearization.Vy),
      metricDelta(
        "peakBaseShear",
        "Taglio massimo Vmax",
        selectedPier.peakBaseShear,
        maxFinite(comparisonCurvePoints.map((point) => point.baseShear)),
      ),
      metricDelta(
        "du",
        "Spostamento ultimo du",
        selectedPier.ultimateDisplacement,
        femBilinearization.du,
      ),
    ];
    const sampledCurvePoints = sampleCurveComparison({
      aggregatedCurve: selectedPier.curvePoints,
      femCurve: comparisonCurvePoints,
      yieldDisplacement: selectedPier.yieldDisplacement,
      ultimateDisplacement: selectedPier.ultimateDisplacement,
      sampleCount: options.sampleCount ?? DEFAULT_SAMPLE_COUNT,
    });
    const reading = buildReading(metricDeltas);

    return new CalculationResult({
      applicationId: "masonry-wall-openings",
      status: solverResult.points.length > 1 ? RESULT_STATUS.OK : RESULT_STATUS.NOT_VERIFIED,
      summary:
        "Single-pier capacity-curve comparison completed by confronting the aggregated masonry contribution with the corresponding non-linear equivalent-frame response.",
      outputs: {
        stage,
        topRotation,
        pier: {
          id: selectedPier.id,
          wallId: selectedPier.wallId,
          topRotation: selectedPier.topRotation,
          governingFamily: selectedPier.governingFamily,
          governingMode: selectedPier.governingMode,
          mechanics: selectedPier.mechanics,
        },
        aggregated: {
          performanceSummary: {
            ks: round(selectedPier.stiffness),
            Vy: round(selectedPier.peakBaseShear),
            du: round(selectedPier.ultimateDisplacement),
            yieldDisplacement: round(selectedPier.yieldDisplacement),
            peakBaseShear: round(selectedPier.peakBaseShear),
            governingFamily: selectedPier.governingFamily,
            governingMode: selectedPier.governingMode,
          },
          capacityCurve: {
            units: {
              displacement: alignment.units.length,
              baseShear: alignment.units.force,
            },
            points: selectedPier.curvePoints,
          },
        },
        fem: {
          performanceSummary: {
            ks: round(femBilinearization.ks),
            Vy: round(femBilinearization.Vy),
            du: round(femBilinearization.du),
            yieldDisplacement: round(femBilinearization.yieldDisplacement),
            peakBaseShear: round(maxFinite(comparisonCurvePoints.map((point) => point.baseShear))),
            hingeCount: activeHingeCount(contributorHingeState),
            mechanismModel: "equivalent-frame-hinges-and-shear-plateau",
          },
          capacityCurve: {
            units: {
              displacement: alignment.units.length,
              baseShear: alignment.units.force,
            },
            points: comparisonCurvePoints,
          },
          hingeEvents: solverResult.events.map((event, index) => ({
            id: `hinge-event-${index + 1}`,
            type: event.type,
            position: event.position,
            sign: event.sign,
            elementId: event.elementId ?? null,
            capacityKind: event.capacityKind ?? null,
            plasticCapacity:
              isFiniteNumber(event.plasticCapacity) && event.capacityKind === "moment"
                ? round(fromFem.moment(event.plasticCapacity))
                : isFiniteNumber(event.plasticCapacity) && event.capacityKind === "force"
                  ? round(fromFem.force(event.plasticCapacity))
                  : null,
            plasticMoment:
              isFiniteNumber(event.plasticCapacity) && event.capacityKind === "moment"
                ? round(fromFem.moment(event.plasticCapacity))
                : null,
          })),
          finalState: {
            loadFactor: round(solverResult.finalLoadFactor),
            termination: solverResult.termination,
            failed: Boolean(contributorState?.failed),
            hingeState: contributorHingeState,
          },
        },
        comparison: {
          metrics: metricDeltas,
          sampledCurvePoints,
        },
        reading,
      },
      warnings: uniqueStrings([...(aggregatedResult.warnings ?? []), ...solverResult.warnings]),
      assumptions: uniqueStrings([
        ...(aggregatedResult.assumptions ?? []),
        ...solverResult.assumptions,
        "The single-pier comparison uses the same unified equivalent-frame masonry macroelement adopted by the wall-level pushover, with concentrated end plastic hinges and an internal perfectly plastic shear mechanism.",
        "The single-pier pushover uses the same MRd and du reference already adopted by the aggregated method, so the comparison isolates the consistency of the FEM force-displacement evolution.",
      ]),
      metadata: {
        comparisonType: "masonry-pier-capacity-curve",
        stage,
        topRotation,
        pierId: selectedPier.id,
        controlPointCount,
        generatedCurvePointCount: comparisonCurvePoints.length,
      },
    });
  }
}
