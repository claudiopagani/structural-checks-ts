import { CalculationResult } from "../../../core/results/CalculationResult.js";
import { round, uniqueStrings } from "../../../core/results/checkUtils.js";
import { createUnitResolver } from "../../../domain/units/UnitSystem.js";
import { bilinearizeCapacityCurve } from "./AlignmentCapacityBilinearization.js";
import {
  AlignmentSeismicAggregatedAnalysis,
  type AlignmentSeismicAggregatedAnalysisResult,
} from "./AlignmentSeismicAggregatedAnalysis.js";
import { MasonryEquivalentFrameBuilder } from "./MasonryEquivalentFrameBuilder.js";
import { createMasonryEquivalentFrameContributorDefinition } from "./MasonryEquivalentFramePushoverInternalForces.js";
import { MasonryEquivalentFramePushoverSolver2D } from "./MasonryEquivalentFramePushoverSolver2D.js";
import { MasonryPierCapacityCurveComparisonAnalysis } from "./MasonryPierCapacityCurveComparisonAnalysis.js";
import { RESULT_STATUS } from "../../../core/results/resultStatus.js";
import type { MasonryWallOpeningsModel } from "../models/MasonryWallOpeningsModel.js";
import type { SanitizedAlignmentOpening } from "../geometry/sanitizeAlignmentOpenings.js";
import type { EquivalentFrameMembersResult } from "../geometry/extractEquivalentFrameMembers.js";
import type { AlignmentMechanicalStateResolution } from "../materials/resolveAlignmentMechanicalState.js";
import type { UnitResolver } from "../../../domain/units/UnitSystem.js";
import type { MasonryEquivalentFrameBuilderResult } from "./MasonryEquivalentFrameBuilder.js";
import type {
  MasonryEquivalentFrameContributorDefinition,
  MasonryEquivalentFrameContributorPier,
} from "./MasonryEquivalentFramePushoverInternalForces.js";
import type { DisplacementControlModel2D } from "../../../domain/fem/nonlinear/DisplacementControlNonlinearStaticSolver2D.js";
import type { BilinearizedCapacityCurve } from "./AlignmentCapacityBilinearization.js";
import { createZeroVector } from "../../../domain/math/arrayLinearAlgebra.js";

type JsonRecord = Record<string, unknown>;
type CurvePoint = JsonRecord & {
  id: string;
  displacement: number;
  baseShear: number;
};
type RawCurvePoint = JsonRecord & {
  id?: unknown;
  displacement?: unknown;
  controlDisplacement?: unknown;
  baseShear?: unknown;
  force?: unknown;
};
type TopRotation = "free" | "fixed";
type PushoverSolveResult = ReturnType<MasonryEquivalentFramePushoverSolver2D["solve"]>;

export interface AlignmentEquivalentFramePushoverAnalysisOptions extends JsonRecord {
  topRotation?: unknown;
  includeSpandrels?: unknown;
  controlPointCount?: number;
  sampleCount?: number;
  tolerance?: number;
  maxIterations?: number;
  yieldTolerance?: number;
  capacityDropRatio?: number;
}

export interface AlignmentEquivalentFramePushoverAnalysisInput {
  alignment?: MasonryWallOpeningsModel | null;
  stage?: string;
  options?: AlignmentEquivalentFramePushoverAnalysisOptions;
  sanitizedOpenings?: readonly SanitizedAlignmentOpening[] | null;
  extractedMembers?: EquivalentFrameMembersResult | null;
  resolvedAlignmentState?: AlignmentMechanicalStateResolution | null;
}

interface PierRecord extends JsonRecord, MasonryEquivalentFrameContributorPier {
  id: string;
  wallId?: string | null;
  topRotation?: string;
  peakBaseShear: number;
  stiffness?: number;
  governingFamily?: unknown;
  governingMode?: unknown;
  curvePoints: CurvePoint[];
}

interface RingFrameContribution extends JsonRecord {
  id?: string;
  contributorType: "ring-frame";
  openingId?: string | null;
  status?: string;
  frameCount?: number;
  metadata?: JsonRecord;
  curvePoints: CurvePoint[];
}

interface AggregatedOutputs extends JsonRecord {
  capacityCurve?: JsonRecord & {
    points?: RawCurvePoint[];
    units?: JsonRecord;
  };
  bilinearization?: JsonRecord;
  piers?: PierRecord[];
  ringFrames?: RingFrameContribution[];
}

interface AggregatedResultView {
  outputs: AggregatedOutputs;
  warnings: unknown[];
  assumptions: unknown[];
}

interface PerformanceSummary extends JsonRecord {
  ks?: number;
  Vy?: number;
  du?: number;
  yieldDisplacement?: number;
  peakBaseShear?: number;
  hingeCount?: number;
}

interface DirectPierResult extends JsonRecord {
  id: string;
  wallId?: string | null;
  topRotation?: string;
  governingFamily?: unknown;
  governingMode?: unknown;
  performanceSummary: PerformanceSummary;
  capacityCurve: JsonRecord & { points?: CurvePoint[] };
  hingeEvents: JsonRecord[];
  finalState: JsonRecord;
  reading: JsonRecord | null;
  curvePoints: CurvePoint[];
  sourceModel?: string;
}

interface DirectFrame extends DisplacementControlModel2D {
  id: string;
  nodes: MasonryEquivalentFrameBuilderResult["model"]["nodes"];
  elements: MasonryEquivalentFrameBuilderResult["model"]["elements"];
  supports: MasonryEquivalentFrameBuilderResult["model"]["supports"];
  snapshot: JsonRecord;
  controlNode: MasonryEquivalentFrameBuilderResult["model"]["nodes"][number] | undefined;
}

interface AnalysisOutputs extends JsonRecord {
  stage: string;
  topRotation: TopRotation;
}
export type AlignmentEquivalentFramePushoverAnalysisResult = CalculationResult<AnalysisOutputs>;
type AnalysisResult = AlignmentEquivalentFramePushoverAnalysisResult;

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
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

function recordValue(value: unknown, key: string): JsonRecord | null {
  if (!isRecord(value)) {
    return null;
  }
  return isRecord(value[key]) ? value[key] : null;
}

function finiteOrUndefined(value: unknown): number | undefined {
  return isFiniteNumber(value) ? value : undefined;
}

function roundedOrUndefined(value: unknown): number | undefined {
  return isFiniteNumber(value) ? round(value) : undefined;
}

function requirePushoverResult(result: PushoverSolveResult | null): PushoverSolveResult {
  if (!result) {
    throw new Error("Equivalent-frame pushover did not produce a solver result.");
  }
  return result;
}

function normalizePierRecord(value: unknown): PierRecord {
  const record = isRecord(value) ? value : {};
  const curvePoints = normalizeCurvePoints(record.curvePoints, "pier");
  const normalized: PierRecord = {
    ...record,
    id: typeof record.id === "string" ? record.id : "",
    wallId: typeof record.wallId === "string" ? record.wallId : null,
    peakBaseShear: finiteOrUndefined(record.peakBaseShear) ?? Number.NaN,
    ultimateDisplacement: finiteOrUndefined(record.ultimateDisplacement) ?? Number.NaN,
    curvePoints,
  };
  if (typeof record.topRotation === "string") {
    normalized.topRotation = record.topRotation;
  }
  return normalized;
}

function normalizeAggregatedResultView(
  result: AlignmentSeismicAggregatedAnalysisResult,
): AggregatedResultView {
  const outputs: AggregatedOutputs = {
    ...result.outputs,
    piers: (result.outputs.piers ?? []).map(normalizePierRecord),
    ringFrames: (result.outputs.ringFrames ?? []).map((contributor) => {
      const record = isRecord(contributor) ? contributor : {};
      return {
        ...record,
        contributorType: "ring-frame" as const,
        curvePoints: normalizeCurvePoints(record.curvePoints, "ring-frame"),
      };
    }),
  };
  if (result.outputs.capacityCurve) {
    outputs.capacityCurve = {
      ...result.outputs.capacityCurve,
      points: normalizeCurvePoints(result.outputs.capacityCurve.points, "aggregated"),
    };
  }
  return {
    outputs,
    warnings: [...result.warnings],
    assumptions: [...result.assumptions],
  };
}

const FEM_UNITS = Object.freeze({ force: "kN", length: "m" });
const DEFAULT_TOP_ROTATION = "free";
const DEFAULT_CONTROL_POINT_COUNT = 120;
const DEFAULT_SAMPLE_COUNT = 6;
const DEFAULT_TOLERANCE = 1e-6;
const DEFAULT_MAX_ITERATIONS = 60;
const DEFAULT_YIELD_TOLERANCE = 1e-9;
const DIRECT_MASONRY_MECHANISM_MODEL = "equivalent-frame-hinges-and-shear-plateau";
const EPS = 1e-9;

function normalizeTopRotation(value: unknown = DEFAULT_TOP_ROTATION): TopRotation {
  const normalized = sourceString(value ?? "")
    .trim()
    .toLowerCase();

  const aliases = new Map<string, TopRotation>([
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
    throw new Error(
      `Unsupported equivalent-frame pushover topRotation option: ${sourceString(value)}.`,
    );
  }

  return resolved;
}

function maxFinite(values: number[] = []): number | null {
  const finiteValues = values.filter(Number.isFinite);

  return finiteValues.length > 0 ? Math.max(...finiteValues) : null;
}

function normalizeCurvePoint(point: RawCurvePoint, index: number, prefix = "point"): CurvePoint {
  const displacement = isFiniteNumber(point.displacement)
    ? point.displacement
    : isFiniteNumber(point.controlDisplacement)
      ? point.controlDisplacement
      : Number.NaN;
  const baseShear = isFiniteNumber(point.baseShear)
    ? point.baseShear
    : isFiniteNumber(point.force)
      ? point.force
      : Number.NaN;
  return {
    ...point,
    id: typeof point.id === "string" ? point.id : `${prefix}-${index + 1}`,
    displacement,
    baseShear,
  };
}

function normalizeCurvePoints(value: unknown, prefix = "point"): CurvePoint[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((point, index) =>
    normalizeCurvePoint(isRecord(point) ? point : {}, index, prefix),
  );
}

function roundCurvePoints(points: CurvePoint[] = []): CurvePoint[] {
  return points.map((point) => ({
    id: point.id,
    displacement: round(point.displacement),
    baseShear: round(point.baseShear),
  }));
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

function buildAggregateCapacityCurve(
  contributors: Array<{ curvePoints: CurvePoint[] }> = [],
): CurvePoint[] {
  const displacements = [
    ...new Set(
      contributors.flatMap((contributor) =>
        contributor.curvePoints.map((point) => point.displacement),
      ),
    ),
  ]
    .filter(Number.isFinite)
    .sort((left, right) => left - right);

  return displacements.map((displacement, index) => ({
    id: `global-point-${index + 1}`,
    displacement,
    baseShear: contributors.reduce(
      (sum, contributor) => sum + interpolateCurve(contributor.curvePoints, displacement),
      0,
    ),
  }));
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
  yieldDisplacement: number | undefined;
  ultimateDisplacement: number | undefined;
  sampleCount?: number;
}): JsonRecord[] {
  const referenceYieldDisplacement =
    isFiniteNumber(yieldDisplacement) && yieldDisplacement >= 0 ? yieldDisplacement : 0;
  const referenceUltimateDisplacement =
    isFiniteNumber(ultimateDisplacement) && ultimateDisplacement > EPS
      ? ultimateDisplacement
      : (maxFinite(aggregatedCurve.map((point) => point.displacement)) ?? 0);
  const intermediateFractions = Array.from(
    { length: Math.max(1, sampleCount) },
    (_, index) => (index + 1) / (sampleCount + 1),
  );
  const sampleDisplacements = [
    0,
    referenceYieldDisplacement,
    ...intermediateFractions.map((ratio) => ratio * referenceUltimateDisplacement),
    referenceUltimateDisplacement,
  ]
    .filter(isFiniteNumber)
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
        ? "Il pushover FEM globale dell'allineamento riproduce la curva aggregata con scarti contenuti su rigidezza, resistenza e deformabilita."
        : "Il pushover FEM globale dell'allineamento mostra scarti non trascurabili rispetto alla curva aggregata e richiede una lettura cauta.",
    governingMetricId: failedMetric ?? "aligned-response",
    messages: [
      `Scarto rigidezza ks: ${sourceString(round(metricById.ks?.variationPercent))}%.`,
      `Scarto resistenza Vy: ${sourceString(round(metricById.Vy?.variationPercent))}%.`,
      `Scarto deformabilita du: ${sourceString(round(metricById.du?.variationPercent))}%.`,
    ],
  };
}

function performanceSummaryFromBilinearization(
  bilinearization: JsonRecord | BilinearizedCapacityCurve | null | undefined,
  capacityCurvePoints: CurvePoint[] = [],
): PerformanceSummary {
  const ks = isRecord(bilinearization) ? bilinearization.ks : undefined;
  const vy = isRecord(bilinearization) ? bilinearization.Vy : undefined;
  const du = isRecord(bilinearization) ? bilinearization.du : undefined;
  const yieldDisplacement = isRecord(bilinearization)
    ? bilinearization.yieldDisplacement
    : undefined;
  const summary: PerformanceSummary = {};
  const roundedKs = roundedOrUndefined(ks);
  const roundedVy = roundedOrUndefined(vy);
  const roundedDu = roundedOrUndefined(du);
  const roundedYieldDisplacement = roundedOrUndefined(yieldDisplacement);
  const roundedPeakBaseShear = roundedOrUndefined(
    maxFinite(capacityCurvePoints.map((point) => point.baseShear)),
  );
  if (roundedKs !== undefined) summary.ks = roundedKs;
  if (roundedVy !== undefined) summary.Vy = roundedVy;
  if (roundedDu !== undefined) summary.du = roundedDu;
  if (roundedYieldDisplacement !== undefined) {
    summary.yieldDisplacement = roundedYieldDisplacement;
  }
  if (roundedPeakBaseShear !== undefined) summary.peakBaseShear = roundedPeakBaseShear;
  return summary;
}

function normalizeRingFrameContribution(contributor: JsonRecord = {}): RingFrameContribution {
  const curvePoints = normalizeCurvePoints(
    contributor.curvePoints ?? [],
    typeof contributor.id === "string" ? contributor.id : "ring-frame",
  );

  return {
    id: typeof contributor.id === "string" ? contributor.id : "",
    contributorType: "ring-frame",
    openingId: typeof contributor.openingId === "string" ? contributor.openingId : null,
    status: typeof contributor.status === "string" ? contributor.status : RESULT_STATUS.OK,
    frameCount: isFiniteNumber(contributor.frameCount) ? contributor.frameCount : 1,
    metadata: recordValue(contributor, "metadata") ?? {},
    curvePoints,
    maxBaseShear: round(maxFinite(curvePoints.map((point) => point.baseShear))),
    ultimateDisplacement: round(curvePoints.at(-1)?.displacement),
  };
}

function buildDirectMasonryFrame({
  alignment,
  fullFrame,
  aggregatedPiers = [],
  referenceHorizontalForce = 1,
}: {
  alignment: MasonryWallOpeningsModel;
  fullFrame: MasonryEquivalentFrameBuilderResult;
  aggregatedPiers?: PierRecord[];
  referenceHorizontalForce?: number;
}): DirectFrame | null {
  if ((aggregatedPiers ?? []).length === 0) {
    return null;
  }

  const snapshotMetadata = recordValue(fullFrame.snapshot, "metadata");
  const topNodeIds = Array.isArray(snapshotMetadata?.topNodeIds) ? snapshotMetadata.topNodeIds : [];
  const controlNodeId =
    (typeof snapshotMetadata?.diaphragmControlNodeId === "string"
      ? snapshotMetadata.diaphragmControlNodeId
      : null) ??
    (typeof topNodeIds[0] === "string" ? topNodeIds[0] : null) ??
    null;
  const controlNode = (fullFrame.model.nodes ?? []).find((node) => node.id === controlNodeId);

  if (!controlNode || !fullFrame.dofRegistry) {
    return null;
  }

  const referenceLoadVector = createZeroVector(fullFrame.dofRegistry.size());
  const controlVector = createZeroVector(fullFrame.dofRegistry.size());

  referenceLoadVector[fullFrame.dofRegistry.getIndex(controlNode, "ux")] = referenceHorizontalForce;
  controlVector[fullFrame.dofRegistry.getIndex(controlNode, "ux")] = 1;

  return {
    ...fullFrame.model,
    id: `${alignment.id}-equivalent-frame-pushover-direct`,
    snapshot: fullFrame.snapshot,
    dofRegistry: fullFrame.dofRegistry,
    referenceLoadVector,
    controlVector,
    controlNode,
  };
}

function buildDirectContributorConfigs({
  alignment,
  directFrame,
  aggregatedPiers = [],
  topRotation,
}: {
  alignment: MasonryWallOpeningsModel;
  directFrame: DirectFrame | null;
  aggregatedPiers: PierRecord[];
  topRotation: TopRotation;
}): Record<string, MasonryEquivalentFrameContributorDefinition> {
  const aggregatedById = Object.fromEntries(aggregatedPiers.map((pier) => [pier.id, pier]));

  const entries: Array<[string, MasonryEquivalentFrameContributorDefinition]> = [];
  for (const element of directFrame?.elements ?? []) {
    const metadata = recordValue(element, "metadata");
    const sourcePierId = typeof metadata?.sourcePierId === "string" ? metadata.sourcePierId : null;
    const pier = sourcePierId ? aggregatedById[sourcePierId] : undefined;

    if (!pier) {
      continue;
    }

    if (typeof element.id !== "string") {
      continue;
    }
    entries.push([
      element.id,
      createMasonryEquivalentFrameContributorDefinition({
        alignment,
        pier,
        topRotation,
      }),
    ]);
  }
  return Object.fromEntries(entries);
}

function normalizeDirectHingeEvent(event: JsonRecord, fromFem: UnitResolver): JsonRecord {
  const capacityKind = event.capacityKind ?? null;
  const plasticCapacity =
    isFiniteNumber(event.plasticCapacity) && capacityKind === "moment"
      ? round(fromFem.moment(event.plasticCapacity))
      : isFiniteNumber(event.plasticCapacity) && capacityKind === "force"
        ? round(fromFem.force(event.plasticCapacity))
        : null;

  return {
    id: event.id,
    type: event.type,
    pierId: event.pierId ?? null,
    wallId: event.wallId ?? null,
    position: event.position ?? null,
    sign: event.sign ?? null,
    elementId: event.elementId ?? null,
    sourceRingFrameId: event.sourceRingFrameId ?? null,
    sourceOpeningId: event.sourceOpeningId ?? null,
    role: event.role ?? null,
    capacityKind,
    plasticCapacity,
    plasticMoment: capacityKind === "moment" ? plasticCapacity : null,
    plasticShear: capacityKind === "force" ? plasticCapacity : null,
    failureMode: event.failureMode ?? null,
  };
}

function buildDirectPierResults({
  alignment,
  directFrame,
  directSolverResult,
  masonryPiers = [],
  fromFem,
}: {
  alignment: MasonryWallOpeningsModel;
  directFrame: DirectFrame;
  directSolverResult: PushoverSolveResult;
  masonryPiers: PierRecord[];
  fromFem: UnitResolver;
}): DirectPierResult[] {
  const points = directSolverResult.points ?? [];
  const elementIdByPierId: Record<string, string> = {};
  for (const element of directFrame.elements) {
    const sourcePierId = recordValue(element, "metadata")?.sourcePierId;
    if (typeof sourcePierId === "string" && typeof element.id === "string") {
      elementIdByPierId[sourcePierId] = element.id;
    }
  }
  const curvesByPierId: Record<string, CurvePoint[]> = Object.fromEntries(
    masonryPiers.map((pier) => [pier.id, []]),
  );

  points.forEach((point, pointIndex) => {
    const displacement = round(
      isFiniteNumber(point.controlDisplacement)
        ? fromFem.length(point.controlDisplacement)
        : Number.NaN,
    );

    for (const pier of masonryPiers) {
      const curve = curvesByPierId[pier.id];
      if (!curve) {
        continue;
      }
      const rawForce = recordValue(point, "pierBaseShearsById")?.[pier.id];
      curve.push({
        id: `${pier.id}-direct-point-${pointIndex + 1}`,
        displacement,
        baseShear: round(fromFem.force(isFiniteNumber(rawForce) ? rawForce : 0)),
      });
    }
  });

  return masonryPiers.map((pier) => {
    const capacityCurvePoints = curvesByPierId[pier.id] ?? [];
    const bilinearization = bilinearizeCapacityCurve({
      points: capacityCurvePoints,
    });
    const elementId = elementIdByPierId[pier.id];
    const states = isRecord(directSolverResult.hingeStatesByElementId)
      ? directSolverResult.hingeStatesByElementId
      : {};
    const rawState = elementId && isRecord(states[elementId]) ? states[elementId] : null;
    const rawHingeState = recordValue(rawState, "hingeState");
    const hingeEvents = (directSolverResult.hingeEvents ?? [])
      .filter((event) => event.pierId === pier.id)
      .map((event, index) =>
        normalizeDirectHingeEvent(
          {
            ...event,
            id: `${pier.id}-direct-event-${index + 1}`,
          },
          fromFem,
        ),
      );

    return {
      id: pier.id,
      wallId: pier.wallId ?? null,
      topRotation: pier.topRotation ?? "",
      governingFamily: pier.governingFamily,
      governingMode: pier.governingMode,
      contributorType: "pier",
      sourceModel: "direct-global-frame-pushover",
      performanceSummary: {
        ...performanceSummaryFromBilinearization(bilinearization, capacityCurvePoints),
        hingeCount:
          Number(rawHingeState?.start != null) +
          Number(rawHingeState?.end != null) +
          Number(rawHingeState?.shear != null),
        mechanismModel: DIRECT_MASONRY_MECHANISM_MODEL,
      },
      capacityCurve: {
        units: {
          displacement: alignment.units.length,
          baseShear: alignment.units.force,
        },
        points: capacityCurvePoints,
      },
      hingeEvents,
      finalState: {
        termination: directSolverResult.termination,
        failed: Boolean(rawState?.failed),
        hingeState: {
          start: rawHingeState?.start ?? null,
          end: rawHingeState?.end ?? null,
          shear: rawHingeState?.shear ?? null,
        },
      },
      reading: null,
      curvePoints: capacityCurvePoints,
    };
  });
}

function normalizeFallbackPierResult(
  result: { outputs: JsonRecord },
  alignment: MasonryWallOpeningsModel,
): DirectPierResult {
  const pier = recordValue(result.outputs, "pier") ?? {};
  const fem = recordValue(result.outputs, "fem") ?? {};
  const femCapacityCurve = recordValue(fem, "capacityCurve") ?? {};
  const femPoints = normalizeCurvePoints(
    femCapacityCurve.points,
    typeof pier.id === "string" ? pier.id : "pier",
  );
  return {
    id: typeof pier.id === "string" ? pier.id : "",
    wallId: typeof pier.wallId === "string" ? pier.wallId : null,
    topRotation: typeof pier.topRotation === "string" ? pier.topRotation : "",
    governingFamily: pier.governingFamily,
    governingMode: pier.governingMode,
    contributorType: "pier",
    sourceModel: "single-pier-fallback",
    performanceSummary: recordValue(fem, "performanceSummary") ?? {},
    capacityCurve: { ...femCapacityCurve, points: femPoints },
    hingeEvents: Array.isArray(fem.hingeEvents)
      ? fem.hingeEvents.filter((event): event is JsonRecord => isRecord(event))
      : [],
    finalState: recordValue(fem, "finalState") ?? {},
    reading: recordValue(result.outputs, "reading"),
    curvePoints: femPoints,
    units: {
      displacement: alignment.units.length,
      baseShear: alignment.units.force,
    },
  };
}

function fallbackHingeEvents(results: Array<{ outputs: JsonRecord }> = []): JsonRecord[] {
  return results.flatMap((result) =>
    (() => {
      const pier = recordValue(result.outputs, "pier") ?? {};
      const fem = recordValue(result.outputs, "fem") ?? {};
      const events = Array.isArray(fem.hingeEvents)
        ? fem.hingeEvents.filter((event): event is JsonRecord => isRecord(event))
        : [];
      return events.map((event, index) => ({
        id: `${typeof pier.id === "string" ? pier.id : "pier"}-fallback-event-${index + 1}`,
        pierId: typeof pier.id === "string" ? pier.id : null,
        wallId: typeof pier.wallId === "string" ? pier.wallId : null,
        ...event,
      }));
    })(),
  );
}

export class AlignmentEquivalentFramePushoverAnalysis {
  readonly aggregatedAnalysis: AlignmentSeismicAggregatedAnalysis;
  readonly frameBuilder: MasonryEquivalentFrameBuilder;
  readonly frameSolver: MasonryEquivalentFramePushoverSolver2D | null;
  readonly pierComparisonAnalysis: MasonryPierCapacityCurveComparisonAnalysis;

  constructor({
    aggregatedAnalysis = new AlignmentSeismicAggregatedAnalysis(),
    frameBuilder = new MasonryEquivalentFrameBuilder(),
    frameSolver = new MasonryEquivalentFramePushoverSolver2D(),
    flexuralFrameSolver = null,
    pierComparisonAnalysis = new MasonryPierCapacityCurveComparisonAnalysis(),
  }: {
    aggregatedAnalysis?: AlignmentSeismicAggregatedAnalysis;
    frameBuilder?: MasonryEquivalentFrameBuilder;
    frameSolver?: MasonryEquivalentFramePushoverSolver2D | null;
    flexuralFrameSolver?: MasonryEquivalentFramePushoverSolver2D | null;
    pierComparisonAnalysis?: MasonryPierCapacityCurveComparisonAnalysis;
  } = {}) {
    this.aggregatedAnalysis = aggregatedAnalysis;
    this.frameBuilder = frameBuilder;
    this.frameSolver = frameSolver ?? flexuralFrameSolver;
    this.pierComparisonAnalysis = pierComparisonAnalysis;
  }

  analyze({
    alignment,
    stage = "design",
    options = {},
    sanitizedOpenings = null,
    extractedMembers = null,
    resolvedAlignmentState = null,
  }: {
    alignment?: MasonryWallOpeningsModel | null;
    stage?: string;
    options?: AlignmentEquivalentFramePushoverAnalysisOptions;
    sanitizedOpenings?: readonly SanitizedAlignmentOpening[] | null;
    extractedMembers?: EquivalentFrameMembersResult | null;
    resolvedAlignmentState?: AlignmentMechanicalStateResolution | null;
  } = {}): AnalysisResult {
    if (!alignment) {
      throw new Error("AlignmentEquivalentFramePushoverAnalysis requires an alignment model.");
    }

    const topRotation = normalizeTopRotation(options.topRotation ?? DEFAULT_TOP_ROTATION);
    const includeSpandrels = Boolean(options.includeSpandrels);
    const frame = this.frameBuilder.build({
      alignment,
      stage,
      options: {
        ...options,
        topRotation,
        includeDiaphragm: true,
      },
      sanitizedOpenings,
      extractedMembers,
      resolvedAlignmentState,
    });
    const frameMetadata = recordValue(frame.snapshot, "metadata") ?? {};
    const aggregatedResultRaw = this.aggregatedAnalysis.analyze({
      alignment,
      stage,
      options: {
        ...options,
        topRotation,
        includeSpandrels: false,
      },
      sanitizedOpenings,
      extractedMembers,
      resolvedAlignmentState,
    });
    const aggregatedResult = normalizeAggregatedResultView(aggregatedResultRaw);
    const aggregatedCurvePoints = normalizeCurvePoints(
      aggregatedResult.outputs?.capacityCurve?.points ?? [],
      "aggregated",
    );
    const aggregatedPiers = aggregatedResult.outputs?.piers ?? [];
    const ringFrameContributions = (aggregatedResult.outputs?.ringFrames ?? [])
      .filter((contributor) => (contributor.curvePoints ?? []).length > 1)
      .map((contributor) => normalizeRingFrameContribution(contributor));
    const explicitRingFrameCount = isFiniteNumber(frameMetadata.ringFrameCount)
      ? frameMetadata.ringFrameCount
      : 0;
    const femRingFrameContributions = explicitRingFrameCount > 0 ? [] : ringFrameContributions;
    const activeRingFrameCount =
      explicitRingFrameCount > 0 ? explicitRingFrameCount : femRingFrameContributions.length;
    const warnings = [];
    const assumptions = [
      "The whole-alignment non-linear FEM workflow solves each masonry pier directly on the global equivalent frame, with a diaphragm master node tying the top ux DOFs through equal-DOF constraints.",
      "Each masonry pier is represented through a unified macroelement with concentrated end plastic hinges and an internal perfectly plastic shear mechanism, so flexural and shear-governed responses stay in the same non-linear state model.",
      includeSpandrels
        ? "Explicit masonry spandrels are included as linear elastic Timoshenko elements in the global frame; their non-linear limit states are intentionally deferred while declared steel ring frames are solved as explicit plastic-hinge frame elements."
        : "Masonry spandrels are excluded unless includeSpandrels is enabled; declared steel ring frames are solved explicitly in the global FEM model, with legacy aggregated steel curves used only when no explicit ring frame is assembled.",
    ];
    const toFem = createUnitResolver(alignment.units, FEM_UNITS);
    const fromFem = createUnitResolver(FEM_UNITS, alignment.units);
    const controlPointCount = Math.max(
      20,
      Math.round(options.controlPointCount ?? DEFAULT_CONTROL_POINT_COUNT),
    );
    let directFrame: DirectFrame | null = null;
    let directSolverResult: PushoverSolveResult | null = null;
    let directPierResults: DirectPierResult[] = [];
    let directMasonryFrameCurvePoints: CurvePoint[] = [];
    let directMasonryFrameBilinearization: BilinearizedCapacityCurve | null = null;

    if (aggregatedPiers.length > 0) {
      directFrame = buildDirectMasonryFrame({
        alignment,
        fullFrame: frame,
        aggregatedPiers,
        referenceHorizontalForce: Math.max(
          1,
          toFem.force(aggregatedPiers.reduce((sum, pier) => sum + pier.peakBaseShear, 0)),
        ),
      });

      if (directFrame) {
        const contributorConfigs = buildDirectContributorConfigs({
          alignment,
          directFrame,
          aggregatedPiers,
          topRotation,
        });
        const maxControlDisplacement = maxFinite(
          Object.values(contributorConfigs).map((config) => config.failureDisplacement),
        );

        if (
          isFiniteNumber(maxControlDisplacement) &&
          maxControlDisplacement > EPS &&
          this.frameSolver
        ) {
          directSolverResult = this.frameSolver.solve({
            frame: directFrame,
            contributorsByElementId: contributorConfigs,
            controlDisplacementIncrement: maxControlDisplacement / controlPointCount,
            maxControlDisplacement,
            tolerance: options.tolerance ?? DEFAULT_TOLERANCE,
            maxIterations: options.maxIterations ?? DEFAULT_MAX_ITERATIONS,
            maxSteps: controlPointCount + 2,
            yieldTolerance: options.yieldTolerance ?? DEFAULT_YIELD_TOLERANCE,
          });
        }
      }
    }

    const directMasonryAvailable =
      directSolverResult != null && (directSolverResult.points?.length ?? 0) > 1;

    if (aggregatedPiers.length > 0 && !directMasonryAvailable) {
      warnings.push(
        "The direct global frame pushover of the masonry alignment could not produce an active response, so this run falls back to the validated single-pier non-linear contributors only as an emergency surrogate.",
      );
    }

    if (directMasonryAvailable) {
      const solverResult = requirePushoverResult(directSolverResult);
      const solverFrame = directFrame;
      if (!solverFrame) {
        throw new Error("Equivalent-frame pushover did not produce a direct frame.");
      }
      directMasonryFrameCurvePoints = solverResult.points.map((point, index) => ({
        id: `direct-frame-point-${index + 1}`,
        displacement: round(
          isFiniteNumber(point.controlDisplacement)
            ? fromFem.length(point.controlDisplacement)
            : Number.NaN,
        ),
        baseShear: round(
          isFiniteNumber(point.baseShear) ? fromFem.force(point.baseShear) : Number.NaN,
        ),
      }));
      directMasonryFrameBilinearization = bilinearizeCapacityCurve({
        points: directMasonryFrameCurvePoints,
      });
      directPierResults = buildDirectPierResults({
        alignment,
        directFrame: solverFrame,
        directSolverResult: solverResult,
        masonryPiers: aggregatedPiers,
        fromFem,
      });
    }

    const fallbackPierResults = !directMasonryAvailable
      ? aggregatedPiers.map((pier) =>
          this.pierComparisonAnalysis.analyze({
            alignment,
            stage,
            aggregatedResult: aggregatedResultRaw,
            options: {
              ...options,
              topRotation,
              pierId: pier.id,
            },
          }),
        )
      : [];
    const normalizedFallbackPierResults = fallbackPierResults
      .filter((result) => {
        const fem = recordValue(result.outputs, "fem");
        const capacityCurve = recordValue(fem, "capacityCurve");
        return Array.isArray(capacityCurve?.points) && capacityCurve.points.length > 1;
      })
      .map((result) => normalizeFallbackPierResult(result, alignment));
    const activePierResults = (
      directMasonryAvailable ? directPierResults : normalizedFallbackPierResults
    ).sort((left, right) => left.id.localeCompare(right.id));
    const activeContributors = [
      ...(directMasonryAvailable
        ? [
            {
              id: `${alignment.id}-masonry-frame`,
              contributorType: "masonry-frame",
              curvePoints: directMasonryFrameCurvePoints,
            },
          ]
        : activePierResults.map((pier) => ({
            id: pier.id,
            contributorType: "pier",
            curvePoints: pier.curvePoints,
          }))),
      ...femRingFrameContributions,
    ];

    if (activeContributors.length === 0 || aggregatedCurvePoints.length === 0) {
      return new CalculationResult({
        applicationId: "masonry-wall-openings",
        status: RESULT_STATUS.NOT_VERIFIED,
        summary:
          "Equivalent-frame pushover could not assemble any active non-linear contributor for the wall alignment.",
        outputs: {
          stage,
          topRotation,
          equivalentFrame: frame.snapshot,
          controlModel: {
            strategy: directMasonryAvailable
              ? "direct-global-frame-pushover"
              : "single-pier-fallback-aggregate",
            explicitDiaphragmConstraint: Boolean(frameMetadata.diaphragmControlNodeId),
            controlNodeId: frameMetadata.diaphragmControlNodeId ?? null,
          },
        },
        warnings: uniqueStrings([
          ...warnings,
          ...frame.warnings,
          ...(aggregatedResult.warnings ?? []),
          ...fallbackPierResults.flatMap((result) => result.warnings ?? []),
        ]),
        assumptions: uniqueStrings([
          ...assumptions,
          ...frame.assumptions,
          ...(aggregatedResult.assumptions ?? []),
          ...fallbackPierResults.flatMap((result) => result.assumptions ?? []),
        ]),
        metadata: {
          analysisType: "equivalent-frame-pushover",
          stage,
          topRotation,
          contributorCount: activeContributors.length,
          activePierCount: activePierResults.length,
          activeRingFrameCount,
          directMasonryPierCount: directPierResults.length,
        },
      });
    }

    const femCurvePoints = buildAggregateCapacityCurve(activeContributors);
    const femBilinearization = bilinearizeCapacityCurve({
      points: femCurvePoints,
      ...(options.capacityDropRatio === undefined
        ? {}
        : { options: { dropRatio: options.capacityDropRatio } }),
    });
    const aggregatedPerformanceSummary = performanceSummaryFromBilinearization(
      aggregatedResult.outputs?.bilinearization,
      aggregatedCurvePoints,
    );
    const femPerformanceSummary = {
      ...performanceSummaryFromBilinearization(femBilinearization, femCurvePoints),
      contributorCount: activeContributors.length,
      activePierCount: activePierResults.length,
      activeRingFrameCount,
      directMasonryPierCount: directPierResults.length,
      hingeCount: round(
        directMasonryAvailable
          ? requirePushoverResult(directSolverResult).points.at(-1)?.hingeCount
          : activePierResults.reduce(
              (sum, result) => sum + (result.performanceSummary?.hingeCount ?? 0),
              0,
            ),
      ),
    };
    const metricDeltas = [
      metricDelta(
        "ks",
        "Rigidezza iniziale ks",
        aggregatedPerformanceSummary.ks,
        femPerformanceSummary.ks,
      ),
      metricDelta(
        "Vy",
        "Taglio equivalente Vy",
        aggregatedPerformanceSummary.Vy,
        femPerformanceSummary.Vy,
      ),
      metricDelta(
        "peakBaseShear",
        "Taglio massimo Vmax",
        aggregatedPerformanceSummary.peakBaseShear,
        femPerformanceSummary.peakBaseShear,
      ),
      metricDelta(
        "du",
        "Spostamento ultimo du",
        aggregatedPerformanceSummary.du,
        femPerformanceSummary.du,
      ),
    ];
    const sampledCurvePoints = sampleCurveComparison({
      aggregatedCurve: aggregatedCurvePoints,
      femCurve: femCurvePoints,
      yieldDisplacement: aggregatedPerformanceSummary.yieldDisplacement,
      ultimateDisplacement: aggregatedPerformanceSummary.du,
      sampleCount: options.sampleCount ?? DEFAULT_SAMPLE_COUNT,
    });
    const reading = buildReading(metricDeltas);
    const hingeEvents: JsonRecord[] = [
      ...(directSolverResult?.hingeEvents ?? []).map((event, index) =>
        normalizeDirectHingeEvent(
          {
            ...event,
            id: `direct-global-event-${index + 1}`,
          },
          fromFem,
        ),
      ),
      ...fallbackHingeEvents(fallbackPierResults).map((event) => ({
        ...event,
        plasticMoment: Number.isFinite(event.plasticMoment) ? round(event.plasticMoment) : null,
      })),
    ];
    const status =
      femBilinearization.status === RESULT_STATUS.OK && activePierResults.length > 0
        ? RESULT_STATUS.OK
        : RESULT_STATUS.NOT_VERIFIED;
    let directHingeStates: JsonRecord = {};
    if (directSolverResult && isRecord(directSolverResult.hingeStatesByElementId)) {
      directHingeStates = directSolverResult.hingeStatesByElementId;
    }

    return new CalculationResult({
      applicationId: "masonry-wall-openings",
      status,
      summary:
        "Whole-alignment equivalent-frame pushover completed by solving the masonry frame directly under a diaphragm master displacement, with each pier represented by the same unified hinge-plus-shear macroelement already validated at single-pier level.",
      outputs: {
        stage,
        topRotation,
        equivalentFrame: frame.snapshot,
        controlModel: {
          strategy: directMasonryAvailable
            ? "direct-global-frame-pushover"
            : "single-pier-fallback-aggregate",
          explicitDiaphragmConstraint: Boolean(frameMetadata.diaphragmControlNodeId),
          controlNodeId: frameMetadata.diaphragmControlNodeId ?? null,
          topNodeIds: Array.isArray(frameMetadata.topNodeIds) ? frameMetadata.topNodeIds : [],
          diaphragmNodeIds: Array.isArray(frameMetadata.diaphragmNodeIds)
            ? frameMetadata.diaphragmNodeIds
            : [],
        },
        aggregated: {
          performanceSummary: aggregatedPerformanceSummary,
          capacityCurve: {
            units: aggregatedResult.outputs?.capacityCurve?.units ?? {
              displacement: alignment.units.length,
              baseShear: alignment.units.force,
            },
            points: roundCurvePoints(aggregatedCurvePoints),
          },
          piers: aggregatedPiers,
          ringFrames: aggregatedResult.outputs?.ringFrames ?? [],
        },
        fem: {
          performanceSummary: femPerformanceSummary,
          masonryFrame: directMasonryAvailable
            ? {
                performanceSummary: performanceSummaryFromBilinearization(
                  directMasonryFrameBilinearization,
                  directMasonryFrameCurvePoints,
                ),
                capacityCurve: {
                  units: {
                    displacement: alignment.units.length,
                    baseShear: alignment.units.force,
                  },
                  points: directMasonryFrameCurvePoints,
                },
                hingeEvents: hingeEvents.filter(
                  (event) =>
                    typeof event.id === "string" && event.id.startsWith("direct-global-event-"),
                ),
                finalState: {
                  loadFactor: round(requirePushoverResult(directSolverResult).finalLoadFactor),
                  termination: requirePushoverResult(directSolverResult).termination,
                  hingeStatesByElementId: Object.fromEntries(
                    Object.entries(directHingeStates).map(([elementId, value]) => {
                      const state = isRecord(value) ? value : {};
                      const hingeState = recordValue(state, "hingeState") ?? {};
                      return [
                        elementId,
                        {
                          failed: Boolean(state.failed),
                          kind: typeof state.kind === "string" ? state.kind : "masonry-pier",
                          hingeState: {
                            start: hingeState.start ?? null,
                            end: hingeState.end ?? null,
                            shear: hingeState.shear ?? null,
                          },
                        },
                      ] as const;
                    }),
                  ),
                },
              }
            : null,
          capacityCurve: {
            units: {
              displacement: alignment.units.length,
              baseShear: alignment.units.force,
            },
            points: roundCurvePoints(femCurvePoints),
          },
          piers: activePierResults.map((pier) => ({
            id: pier.id,
            wallId: pier.wallId,
            topRotation: pier.topRotation,
            governingFamily: pier.governingFamily,
            governingMode: pier.governingMode,
            sourceModel: pier.sourceModel,
            performanceSummary: pier.performanceSummary,
            capacityCurve: pier.capacityCurve,
            hingeEvents: pier.hingeEvents,
            finalState: pier.finalState,
            reading: pier.reading,
          })),
          ringFrameModel:
            explicitRingFrameCount > 0 ? "explicit-global-frame" : "aggregated-steel-pushover",
          ringFrames:
            explicitRingFrameCount > 0 ? (frame.ringFrameFrames ?? []) : femRingFrameContributions,
          hingeEvents,
        },
        comparison: {
          metrics: metricDeltas,
          sampledCurvePoints,
        },
        reading,
      },
      warnings: uniqueStrings([
        ...warnings,
        ...frame.warnings,
        ...(aggregatedResult.warnings ?? []),
        ...(directSolverResult?.warnings ?? []),
        ...fallbackPierResults.flatMap((result) => result.warnings ?? []),
        ...femBilinearization.warnings,
      ]),
      assumptions: uniqueStrings([
        ...assumptions,
        ...frame.assumptions,
        ...(aggregatedResult.assumptions ?? []),
        ...(directSolverResult?.assumptions ?? []),
        ...fallbackPierResults.flatMap((result) => result.assumptions ?? []),
      ]),
      metadata: {
        analysisType: "equivalent-frame-pushover",
        stage,
        topRotation,
        controlPointCount,
        contributorCount: activeContributors.length,
        activePierCount: activePierResults.length,
        activeRingFrameCount,
        explicitRingFrameCount,
        directMasonryPierCount: directPierResults.length,
        fallbackPierCount: normalizedFallbackPierResults.length,
        generatedCurvePointCount: femCurvePoints.length,
      },
    });
  }
}
