import { DenseLinearSolver } from "../math/DenseLinearSolver.js";
import type { NumericMatrix, NumericVector } from "../math/arrayLinearAlgebra.js";
import { assertExplicitUnitSystem, type UnitSystemInput } from "../units/UnitSystem.js";
import { DeepFoundationModel, type DeepFoundationModelInput } from "./DeepFoundationModel.js";
import {
  GeotechnicalDesignSituation,
  type GeotechnicalDesignSituationInput,
} from "./GeotechnicalDesignSituation.js";
import { GroundModel, type GroundModelInput } from "./GroundModel.js";
import {
  LateralPileResponseScenario,
  type LateralPileResponseScenarioOptions,
  type LateralPileCurveStation,
  type LateralPileLayerCurve,
} from "./LateralPileResponseScenario.js";
import { GEOTECHNICAL_INTERNAL_UNITS, type SoilRecord } from "./SoilMaterial.js";
import type { GroundProfile } from "./GroundProfile.js";

export const LATERAL_PILE_PY_RESULT_SCHEMA_VERSION = "lateral-pile-py-result/v1";

export const LATERAL_PILE_PY_REFERENCE =
  "FHWA GEC 9, FHWA-HIF-18-031 (2018), sections 6.3 and 6.3.1, equations 6-1 through 6-5";

const TOLERANCE = 1e-10;

export interface LateralPileLinearSolver {
  solve(matrix: NumericMatrix, rhs: NumericVector): NumericVector;
}

export interface LateralPileBeamOnSpringsAnalysisOptions {
  linearSolver?: LateralPileLinearSolver;
}

export interface LateralPileBeamOnSpringsAnalysisInput {
  groundModel?: GroundModel | GroundModelInput | null;
  designSituation?: GeotechnicalDesignSituation | GeotechnicalDesignSituationInput | null;
  pile?: DeepFoundationModel | DeepFoundationModelInput | null;
  scenario?: LateralPileResponseScenario | LateralPileResponseScenarioOptions | null;
  profileId?: string | null;
  units?: UnitSystemInput | null;
}

export interface LateralPileBeamOnSpringsResult {
  status: "ok" | "failed" | "not-supported";
  summary: string;
  outputs: Record<string, unknown>;
  warnings: string[];
  assumptions: string[];
  metadata: SoilRecord;
}

interface MeshNode {
  id: string;
  index: number;
  elevation: number;
  depthFromPileHead: number;
  depthBelowGround: number;
  inSoil: boolean;
  isPileHead: boolean;
  isGroundline: boolean;
  isPileToe: boolean;
}

interface MeshElement {
  id: string;
  index: number;
  startNodeIndex: number;
  endNodeIndex: number;
  length: number;
  midpointElevation: number;
  midpointDepthBelowGround: number;
  inSoil: boolean;
  layerId: string | null;
  materialId: string | null;
}

interface PileMesh {
  nodes: MeshNode[];
  elements: MeshElement[];
}

interface ElementContribution {
  elementId: string;
  layerId: string | null;
  materialId: string | null;
  samplingDepth: number;
  tributaryLength: number;
}

interface SpringContribution extends ElementContribution {
  mobilizedResistancePerLength: number;
  soilReactionOnPilePerLength: number;
  tangentModulus: number;
  secantModulus: number;
  interpolation: {
    leftStationDepth: number;
    rightStationDepth: number;
    ratio: number;
    leftLawId: string;
    rightLawId: string;
  };
  extrapolated: boolean;
  lumpedMobilizedResistance: number;
  lumpedSoilReactionOnPile: number;
  lumpedTangentStiffness: number;
}

interface NodeSpringResponse {
  displacement: number;
  tributaryLength: number;
  mobilizedResistance: number;
  soilReactionOnPile: number;
  tangentStiffness: number;
  secantStiffness: number;
  contributions: SpringContribution[];
  extrapolated: boolean;
}

interface SystemEvaluation {
  internalForce: NumericVector;
  tangentStiffness: NumericMatrix;
  springResponses: NodeSpringResponse[];
}

interface ResidualMetrics {
  freeResidualInfNorm: number;
  relativeFreeResidualInfNorm: number;
  forceScale: number;
  momentScale: number;
}

interface ElementResponse extends MeshElement {
  flexuralRigidity: number;
  localDisplacements: number[];
  endForces: {
    startShear: number;
    startMoment: number;
    endShear: number;
    endMoment: number;
  };
  sectionForces: SectionForce[];
}

interface SectionForce {
  localDepth: number;
  depthFromPileHead: number;
  elevation: number;
  shearForce: number;
  bendingMoment: number;
}

interface NodeResponse extends MeshNode {
  displacement: number;
  rotation: number;
  spring: NodeSpringResponse;
}

interface SupportReaction {
  dofIndex: number;
  nodeIndex: number;
  nodeId: string;
  degreeOfFreedom: "translation" | "rotation";
  value: number;
}

interface LoadTargetResult {
  converged: boolean;
  displacements: NumericVector;
  evaluation: SystemEvaluation;
  iterations: number;
  lineSearchReductions: number;
  metrics: ResidualMetrics;
  reason?: string;
  error?: string;
}

interface AcceptedStep {
  candidate: NumericVector;
  evaluation: SystemEvaluation;
  metrics: ResidualMetrics;
  factor: number;
}

interface IncrementalSolution {
  converged: boolean;
  achievedLoadFactor: number;
  displacements: NumericVector;
  evaluation: SystemEvaluation;
  fixedIndices: number[];
  freeIndices: number[];
  cutbacks: number;
  totalIterations: number;
  totalLineSearchReductions: number;
  history: Array<{
    loadFactor: number;
    increment: number;
    iterations: number;
    lineSearchReductions: number;
    relativeResidualInfNorm: number;
    headDisplacement: number;
    headRotation: number;
  }>;
  failure: {
    reason: string | undefined;
    error: string | null;
    iterations: number;
    metrics: ResidualMetrics;
  } | null;
}

class LateralPileResponseNotSupportedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LateralPileResponseNotSupportedError";
  }
}

function result({
  status,
  summary,
  outputs = {},
  warnings = [],
  assumptions = [],
  metadata = {},
}: {
  status: LateralPileBeamOnSpringsResult["status"];
  summary: string;
  outputs?: Record<string, unknown>;
  warnings?: string[];
  assumptions?: string[];
  metadata?: SoilRecord;
}): LateralPileBeamOnSpringsResult {
  return { status, summary, outputs, warnings, assumptions, metadata };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function errorName(error: unknown): string {
  return error instanceof Error ? error.name : Object.prototype.toString.call(error);
}

function normalizeGroundModel(
  value: GroundModel | GroundModelInput | null | undefined,
  units: UnitSystemInput,
): GroundModel {
  return value instanceof GroundModel
    ? value
    : new GroundModel({ ...(value ?? {}), units: value?.units ?? units });
}

function normalizeDesignSituation(
  value: GeotechnicalDesignSituation | GeotechnicalDesignSituationInput | null | undefined,
  groundModel: GroundModel,
  units: UnitSystemInput,
): GeotechnicalDesignSituation {
  return value instanceof GeotechnicalDesignSituation
    ? value
    : new GeotechnicalDesignSituation({
        ...(value ?? {}),
        groundModel,
        units: value?.units ?? units,
      });
}

function normalizePile(
  value: DeepFoundationModel | DeepFoundationModelInput | null | undefined,
  units: UnitSystemInput,
): DeepFoundationModel {
  return value instanceof DeepFoundationModel
    ? value
    : new DeepFoundationModel({ ...(value ?? {}), units: value?.units ?? units });
}

function normalizeScenario(
  value: LateralPileResponseScenario | LateralPileResponseScenarioOptions | null | undefined,
  units: UnitSystemInput,
): LateralPileResponseScenario {
  return value instanceof LateralPileResponseScenario
    ? value
    : new LateralPileResponseScenario({ ...(value ?? {}), units: value?.units ?? units });
}

function zeroVector(size: number): NumericVector {
  return new Array<number>(size).fill(0);
}

function zeroMatrix(size: number): NumericMatrix {
  return Array.from({ length: size }, () => zeroVector(size));
}

function matrixVector(matrix: NumericMatrix, vector: NumericVector): NumericVector {
  return matrix.map((row) =>
    row.reduce((sum, value, index) => sum + value * (vector[index] ?? 0), 0),
  );
}

function maxAbs(values: NumericVector): number {
  return values.reduce((maximum, value) => Math.max(maximum, Math.abs(value)), 0);
}

function addUnique(values: number[], candidate: number, tolerance = TOLERANCE): void {
  if (!values.some((value) => Math.abs(value - candidate) <= tolerance)) {
    values.push(candidate);
  }
}

function buildMesh({
  profile,
  pile,
  maxElementLength,
}: {
  profile: GroundProfile;
  pile: DeepFoundationModel;
  maxElementLength: number;
}): PileMesh {
  const headElevation = pile.placement.headElevation;
  const soilTop = pile.placement.soilContactTopElevation;
  const toeElevation = pile.placement.toeElevation;
  const boundaries: number[] = [];
  addUnique(boundaries, headElevation);
  addUnique(boundaries, soilTop);
  addUnique(boundaries, toeElevation);

  for (const layer of profile.layers) {
    for (const elevation of [layer.topElevation, layer.bottomElevation]) {
      if (elevation < soilTop - TOLERANCE && elevation > toeElevation + TOLERANCE) {
        addUnique(boundaries, elevation);
      }
    }
  }
  boundaries.sort((left, right) => right - left);

  const elevations: number[] = [];
  for (let interval = 0; interval < boundaries.length - 1; interval += 1) {
    const top = boundaries[interval] ?? 0;
    const bottom = boundaries[interval + 1] ?? 0;
    const length = top - bottom;
    const count = Math.max(1, Math.ceil(length / maxElementLength));
    if (interval === 0) elevations.push(top);
    for (let index = 1; index <= count; index += 1) {
      elevations.push(top - (length * index) / count);
    }
  }

  const nodes: MeshNode[] = elevations.map((elevation, index) => ({
    id: `py-node-${index + 1}`,
    index,
    elevation,
    depthFromPileHead: headElevation - elevation,
    depthBelowGround: profile.groundSurfaceElevation - elevation,
    inSoil: elevation <= soilTop + TOLERANCE,
    isPileHead: index === 0,
    isGroundline: Math.abs(elevation - soilTop) <= TOLERANCE,
    isPileToe: index === elevations.length - 1,
  }));
  const elements: MeshElement[] = [];
  for (let index = 0; index < nodes.length - 1; index += 1) {
    const start = nodes[index];
    const end = nodes[index + 1];
    if (!start || !end) throw new Error("The p-y mesh contains an incomplete element.");
    const midpointElevation = (start.elevation + end.elevation) / 2;
    const inSoil = midpointElevation <= soilTop + TOLERANCE;
    const layer = inSoil ? profile.getLayerAtElevation(midpointElevation) : null;
    elements.push({
      id: `py-element-${index + 1}`,
      index,
      startNodeIndex: start.index,
      endNodeIndex: end.index,
      length: start.elevation - end.elevation,
      midpointElevation,
      midpointDepthBelowGround: profile.groundSurfaceElevation - midpointElevation,
      inSoil,
      layerId: layer?.id ?? null,
      materialId: layer?.materialId ?? null,
    });
  }
  return { nodes, elements };
}

function beamElementStiffness(flexuralRigidity: number, length: number): NumericMatrix {
  const factor = flexuralRigidity / length ** 3;
  const l = length;
  return [
    [12 * factor, 6 * l * factor, -12 * factor, 6 * l * factor],
    [6 * l * factor, 4 * l ** 2 * factor, -6 * l * factor, 2 * l ** 2 * factor],
    [-12 * factor, -6 * l * factor, 12 * factor, -6 * l * factor],
    [6 * l * factor, 2 * l ** 2 * factor, -6 * l * factor, 4 * l ** 2 * factor],
  ];
}

function elementDofIndices(element: MeshElement): number[] {
  return [
    2 * element.startNodeIndex,
    2 * element.startNodeIndex + 1,
    2 * element.endNodeIndex,
    2 * element.endNodeIndex + 1,
  ];
}

function assembleBeamStiffness(
  mesh: PileMesh,
  flexuralRigidity: number,
): { stiffness: NumericMatrix; elementStiffnesses: NumericMatrix[] } {
  const size = 2 * mesh.nodes.length;
  const stiffness = zeroMatrix(size);
  const elementStiffnesses: NumericMatrix[] = [];
  for (const element of mesh.elements) {
    const local = beamElementStiffness(flexuralRigidity, element.length);
    const indices = elementDofIndices(element);
    for (let row = 0; row < 4; row += 1) {
      for (let column = 0; column < 4; column += 1) {
        const rowIndex = indices[row];
        const columnIndex = indices[column];
        if (rowIndex === undefined || columnIndex === undefined) continue;
        stiffness[rowIndex]![columnIndex]! += local[row]![column] ?? 0;
      }
    }
    elementStiffnesses.push(local);
  }
  return { stiffness, elementStiffnesses };
}

function springContributions(mesh: PileMesh): ElementContribution[][] {
  const contributions: ElementContribution[][] = mesh.nodes.map(() => []);
  for (const element of mesh.elements) {
    if (!element.inSoil) continue;
    const item: ElementContribution = {
      elementId: element.id,
      layerId: element.layerId,
      materialId: element.materialId,
      samplingDepth: element.midpointDepthBelowGround,
      tributaryLength: element.length / 2,
    };
    contributions[element.startNodeIndex]?.push({ ...item });
    contributions[element.endNodeIndex]?.push({ ...item });
  }
  return contributions;
}

function stationAt(stations: LateralPileCurveStation[], index: number): LateralPileCurveStation {
  const station = stations[index];
  if (!station) throw new Error("The p-y response requires a curve station.");
  return station;
}

function bracketStations(
  stations: LateralPileCurveStation[],
  depth: number,
): { left: LateralPileCurveStation; right: LateralPileCurveStation; ratio: number } {
  if (stations.length === 1 || depth <= stationAt(stations, 0).depth) {
    const station = stationAt(stations, 0);
    return { left: station, right: station, ratio: 0 };
  }
  const last = stationAt(stations, stations.length - 1);
  if (depth >= last.depth) {
    return { left: last, right: last, ratio: 0 };
  }
  for (let index = 1; index < stations.length; index += 1) {
    const right = stationAt(stations, index);
    if (depth <= right.depth) {
      const left = stationAt(stations, index - 1);
      return {
        left,
        right,
        ratio: (depth - left.depth) / (right.depth - left.depth),
      };
    }
  }
  return { left: last, right: last, ratio: 0 };
}

function evaluateLayerLaw(
  layerCurve: LateralPileLayerCurve,
  depth: number,
  displacement: number,
): Omit<
  SpringContribution,
  | keyof ElementContribution
  | "lumpedMobilizedResistance"
  | "lumpedSoilReactionOnPile"
  | "lumpedTangentStiffness"
> {
  const { left, right, ratio } = bracketStations(layerCurve.stations, depth);
  const leftResponse = left.law.evaluate(displacement);
  const rightResponse = right === left ? leftResponse : right.law.evaluate(displacement);
  const interpolate = (leftValue: number, rightValue: number): number =>
    (leftValue + ratio * (rightValue - leftValue)) * layerCurve.reactionMultiplier;
  const mobilizedResistancePerLength = interpolate(
    leftResponse.mobilizedResistancePerLength,
    rightResponse.mobilizedResistancePerLength,
  );
  return {
    mobilizedResistancePerLength,
    soilReactionOnPilePerLength: -mobilizedResistancePerLength,
    tangentModulus: interpolate(leftResponse.tangentModulus, rightResponse.tangentModulus),
    secantModulus: interpolate(leftResponse.secantModulus, rightResponse.secantModulus),
    interpolation: {
      leftStationDepth: left.depth,
      rightStationDepth: right.depth,
      ratio,
      leftLawId: left.law.id,
      rightLawId: right.law.id,
    },
    extrapolated: leftResponse.extrapolated || rightResponse.extrapolated,
  };
}

function evaluateSystem({
  displacements,
  beamStiffness,
  nodeContributions,
  curvesByLayer,
}: {
  displacements: NumericVector;
  beamStiffness: NumericMatrix;
  nodeContributions: ElementContribution[][];
  curvesByLayer: Record<string, LateralPileLayerCurve>;
}): SystemEvaluation {
  const tangentStiffness = beamStiffness.map((row) => [...row]);
  const internalForce = matrixVector(beamStiffness, displacements);
  const springResponses = nodeContributions.map((contributions, nodeIndex) => {
    const displacement = displacements[2 * nodeIndex] ?? 0;
    const evaluated = contributions.map((contribution) => {
      const layerCurve = curvesByLayer[contribution.layerId ?? ""];
      if (!layerCurve) {
        throw new Error(`No assigned p-y curve exists for soil layer ${contribution.layerId}.`);
      }
      const response = evaluateLayerLaw(layerCurve, contribution.samplingDepth, displacement);
      return {
        ...contribution,
        ...response,
        lumpedMobilizedResistance:
          response.mobilizedResistancePerLength * contribution.tributaryLength,
        lumpedSoilReactionOnPile:
          response.soilReactionOnPilePerLength * contribution.tributaryLength,
        lumpedTangentStiffness: response.tangentModulus * contribution.tributaryLength,
      };
    });
    const mobilizedResistance = evaluated.reduce(
      (sum, response) => sum + response.lumpedMobilizedResistance,
      0,
    );
    const tangentStiffnessValue = evaluated.reduce(
      (sum, response) => sum + response.lumpedTangentStiffness,
      0,
    );
    internalForce[2 * nodeIndex] = (internalForce[2 * nodeIndex] ?? 0) + mobilizedResistance;
    tangentStiffness[2 * nodeIndex]![2 * nodeIndex]! += tangentStiffnessValue;
    return {
      displacement,
      tributaryLength: contributions.reduce(
        (sum, contribution) => sum + contribution.tributaryLength,
        0,
      ),
      mobilizedResistance,
      soilReactionOnPile: -mobilizedResistance,
      tangentStiffness: tangentStiffnessValue,
      secantStiffness:
        Math.abs(displacement) > 0 ? mobilizedResistance / displacement : tangentStiffnessValue,
      contributions: evaluated,
      extrapolated: evaluated.some((response) => response.extrapolated),
    };
  });
  return { internalForce, tangentStiffness, springResponses };
}

function fixedDofIndices(mesh: PileMesh, scenario: LateralPileResponseScenario): number[] {
  const fixed = new Set<number>();
  const headNode = mesh.nodes[0];
  if (!headNode) throw new Error("The p-y mesh contains no pile head.");
  const head = headNode.index;
  const toe = (mesh.nodes.at(-1) ?? mesh.nodes[mesh.nodes.length - 1])?.index;
  if (toe === undefined) throw new Error("The p-y mesh contains no pile toe.");
  if (scenario.headCondition.translation === "fixed") fixed.add(2 * head);
  if (scenario.headCondition.rotation === "fixed") fixed.add(2 * head + 1);
  if (scenario.tipCondition.translation === "fixed") fixed.add(2 * toe);
  if (scenario.tipCondition.rotation === "fixed") fixed.add(2 * toe + 1);
  return [...fixed].sort((left, right) => left - right);
}

function externalLoadVector(
  mesh: PileMesh,
  scenario: LateralPileResponseScenario,
): { vector: NumericVector; nodeIndex: number } {
  const vector = zeroVector(2 * mesh.nodes.length);
  const node =
    scenario.action.referencePoint === "pile-head"
      ? mesh.nodes[0]
      : mesh.nodes.find(({ isGroundline }) => isGroundline);
  if (!node) throw new Error("The p-y mesh contains no action reference node.");
  vector[2 * node.index] = scenario.action.lateralShear;
  vector[2 * node.index + 1] = scenario.action.overturningMoment;
  return { vector, nodeIndex: node.index };
}

function residualMetrics({
  residual,
  freeIndices,
  scenario,
  pileLength,
}: {
  residual: NumericVector;
  freeIndices: number[];
  scenario: LateralPileResponseScenario;
  pileLength: number;
}): ResidualMetrics {
  const forceScale = Math.max(
    1,
    Math.abs(scenario.action.lateralShear),
    Math.abs(scenario.action.overturningMoment) / Math.max(pileLength, 1),
  );
  const momentScale = Math.max(
    1,
    Math.abs(scenario.action.overturningMoment),
    Math.abs(scenario.action.lateralShear) * Math.max(pileLength, 1),
  );
  const relativeValues = freeIndices.map(
    (index) => Math.abs(residual[index] ?? 0) / (index % 2 === 0 ? forceScale : momentScale),
  );
  return {
    freeResidualInfNorm: maxAbs(freeIndices.map((index) => residual[index] ?? 0)),
    relativeFreeResidualInfNorm: maxAbs(relativeValues),
    forceScale,
    momentScale,
  };
}

function solveLoadTarget({
  targetLoadFactor,
  initialDisplacements,
  externalLoad,
  freeIndices,
  scenario,
  pileLength,
  evaluate,
  linearSolver,
}: {
  targetLoadFactor: number;
  initialDisplacements: NumericVector;
  externalLoad: NumericVector;
  freeIndices: number[];
  scenario: LateralPileResponseScenario;
  pileLength: number;
  evaluate: (displacements: NumericVector) => SystemEvaluation;
  linearSolver: LateralPileLinearSolver;
}): LoadTargetResult {
  let displacements = [...initialDisplacements];
  let lineSearchReductions = 0;
  let lastEvaluation = evaluate(displacements);
  let lastMetrics: ResidualMetrics | null = null;

  if (freeIndices.length === 0) {
    return {
      converged: true,
      displacements,
      evaluation: lastEvaluation,
      iterations: 0,
      lineSearchReductions,
      metrics: residualMetrics({
        residual: externalLoad.map(
          (value, index) => targetLoadFactor * value - (lastEvaluation.internalForce[index] ?? 0),
        ),
        freeIndices,
        scenario,
        pileLength,
      }),
    };
  }

  for (let iteration = 1; iteration <= scenario.solver.maxIterations; iteration += 1) {
    const residual = externalLoad.map(
      (value, index) => targetLoadFactor * value - (lastEvaluation.internalForce[index] ?? 0),
    );
    const metrics = residualMetrics({ residual, freeIndices, scenario, pileLength });
    lastMetrics = metrics;
    if (metrics.relativeFreeResidualInfNorm <= scenario.solver.relativeResidualTolerance) {
      return {
        converged: true,
        displacements,
        evaluation: lastEvaluation,
        iterations: iteration - 1,
        lineSearchReductions,
        metrics,
      };
    }

    const reducedTangent = freeIndices.map((row) =>
      freeIndices.map((column) => lastEvaluation.tangentStiffness[row]?.[column] ?? 0),
    );
    const reducedResidual = freeIndices.map((index) => residual[index] ?? 0);
    let correction: NumericVector;
    try {
      correction = linearSolver.solve(reducedTangent, reducedResidual);
    } catch (error) {
      return {
        converged: false,
        reason: "singular-tangent",
        error: errorMessage(error),
        iterations: iteration,
        lineSearchReductions,
        displacements,
        evaluation: lastEvaluation,
        metrics,
      };
    }
    const correctionEquivalent = maxAbs(
      correction.map((value, index) =>
        (freeIndices[index] ?? 0) % 2 === 0 ? value : value * Math.max(pileLength, 1),
      ),
    );
    if (correctionEquivalent <= scenario.solver.displacementTolerance) {
      return {
        converged: false,
        reason: "displacement-stagnation",
        iterations: iteration,
        lineSearchReductions,
        displacements,
        evaluation: lastEvaluation,
        metrics,
      };
    }

    let accepted: AcceptedStep | null = null;
    for (let reduction = 0; reduction <= scenario.solver.maxLineSearchReductions; reduction += 1) {
      const factor = 0.5 ** reduction;
      const candidate = [...displacements];
      for (let index = 0; index < freeIndices.length; index += 1) {
        const dof = freeIndices[index];
        const correctionValue = correction[index];
        if (dof === undefined || correctionValue === undefined) continue;
        candidate[dof] = (candidate[dof] ?? 0) + factor * correctionValue;
      }
      const evaluation = evaluate(candidate);
      const candidateResidual = externalLoad.map(
        (value, index) => targetLoadFactor * value - (evaluation.internalForce[index] ?? 0),
      );
      const candidateMetrics = residualMetrics({
        residual: candidateResidual,
        freeIndices,
        scenario,
        pileLength,
      });
      if (
        candidateMetrics.relativeFreeResidualInfNorm < metrics.relativeFreeResidualInfNorm ||
        candidateMetrics.relativeFreeResidualInfNorm <= scenario.solver.relativeResidualTolerance
      ) {
        accepted = { candidate, evaluation, metrics: candidateMetrics, factor };
        lineSearchReductions += reduction;
        break;
      }
    }
    if (!accepted) {
      return {
        converged: false,
        reason: "line-search-failed",
        iterations: iteration,
        lineSearchReductions,
        displacements,
        evaluation: lastEvaluation,
        metrics,
      };
    }
    displacements = accepted.candidate;
    lastEvaluation = accepted.evaluation;
  }

  if (!lastMetrics) throw new Error("The p-y solver did not evaluate a load target.");
  return {
    converged: false,
    reason: "max-iterations",
    iterations: scenario.solver.maxIterations,
    lineSearchReductions,
    displacements,
    evaluation: lastEvaluation,
    metrics: lastMetrics,
  };
}

function solveIncrementally({
  mesh,
  scenario,
  beamStiffness,
  nodeContributions,
  externalLoad,
  fixedIndices,
  linearSolver,
}: {
  mesh: PileMesh;
  scenario: LateralPileResponseScenario;
  beamStiffness: NumericMatrix;
  nodeContributions: ElementContribution[][];
  externalLoad: NumericVector;
  fixedIndices: number[];
  linearSolver: LateralPileLinearSolver;
}): IncrementalSolution {
  const size = 2 * mesh.nodes.length;
  const fixed = new Set(fixedIndices);
  const freeIndices = Array.from({ length: size }, (_, index) => index).filter(
    (index) => !fixed.has(index),
  );
  const evaluate = (displacements: NumericVector): SystemEvaluation =>
    evaluateSystem({
      displacements,
      beamStiffness,
      nodeContributions,
      curvesByLayer: scenario.soilResponse.curvesByLayer,
    });
  const baseIncrement = 1 / scenario.solver.loadSteps;
  let increment = baseIncrement;
  let loadFactor = 0;
  let displacements = zeroVector(size);
  let finalEvaluation = evaluate(displacements);
  let cutbacks = 0;
  let totalIterations = 0;
  let totalLineSearchReductions = 0;
  const history: IncrementalSolution["history"] = [];
  let failure: LoadTargetResult | null = null;
  const lastNode = mesh.nodes.at(-1);
  if (!lastNode) throw new Error("The p-y mesh contains no pile toe.");

  while (loadFactor < 1 - TOLERANCE) {
    const target = Math.min(1, loadFactor + increment);
    const step = solveLoadTarget({
      targetLoadFactor: target,
      initialDisplacements: displacements,
      externalLoad,
      freeIndices,
      scenario,
      pileLength: lastNode.depthFromPileHead,
      evaluate,
      linearSolver,
    });
    totalIterations += step.iterations;
    totalLineSearchReductions += step.lineSearchReductions;
    if (!step.converged) {
      if (increment / 2 < scenario.solver.minimumLoadIncrement) {
        failure = step;
        break;
      }
      increment /= 2;
      cutbacks += 1;
      continue;
    }
    loadFactor = target;
    displacements = step.displacements;
    finalEvaluation = step.evaluation;
    history.push({
      loadFactor,
      increment,
      iterations: step.iterations,
      lineSearchReductions: step.lineSearchReductions,
      relativeResidualInfNorm: step.metrics.relativeFreeResidualInfNorm,
      headDisplacement: displacements[0] ?? 0,
      headRotation: displacements[1] ?? 0,
    });
    if (increment < baseIncrement) {
      increment = Math.min(baseIncrement, 2 * increment);
    }
  }

  return {
    converged: loadFactor >= 1 - TOLERANCE,
    achievedLoadFactor: loadFactor,
    displacements,
    evaluation: finalEvaluation,
    fixedIndices,
    freeIndices,
    cutbacks,
    totalIterations,
    totalLineSearchReductions,
    history,
    failure:
      failure == null
        ? null
        : {
            reason: failure.reason,
            error: failure.error ?? null,
            iterations: failure.iterations,
            metrics: failure.metrics,
          },
  };
}

function validateLayerCurves({
  profile,
  pile,
  scenario,
  mesh,
}: {
  profile: GroundProfile;
  pile: DeepFoundationModel;
  scenario: LateralPileResponseScenario;
  mesh: PileMesh;
}): void {
  const usedLayerIds = new Set<string | null>(
    mesh.elements.filter(({ inSoil }) => inSoil).map(({ layerId }) => layerId),
  );
  for (const layerId of usedLayerIds) {
    if (!scenario.soilResponse.curvesByLayer[layerId ?? ""]) {
      throw new Error(`No assigned p-y curve exists for soil layer ${layerId}.`);
    }
  }
  const groundSurface = profile.groundSurfaceElevation;
  for (const [layerId, layerCurve] of Object.entries(scenario.soilResponse.curvesByLayer)) {
    const layer = profile.layers.find(({ id }) => id === layerId);
    if (!layer) {
      throw new Error(`Assigned p-y curves reference unknown layer ${layerId}.`);
    }
    const topDepth = groundSurface - layer.topElevation;
    const bottomDepth = groundSurface - layer.bottomElevation;
    for (const station of layerCurve.stations) {
      if (station.depth < topDepth - TOLERANCE || station.depth > bottomDepth + TOLERANCE) {
        throw new Error(`P-y station depth ${station.depth} lies outside layer ${layerId}.`);
      }
    }
  }
  if (pile.placement.soilContactTopElevation > profile.groundSurfaceElevation + TOLERANCE) {
    throw new Error("Pile soil contact cannot begin above ground surface.");
  }
}

function elementResponses({
  mesh,
  elementStiffnesses,
  displacements,
  flexuralRigidity,
}: {
  mesh: PileMesh;
  elementStiffnesses: NumericMatrix[];
  displacements: NumericVector;
  flexuralRigidity: number;
}): ElementResponse[] {
  return mesh.elements.map((element, index) => {
    const indices = elementDofIndices(element);
    const localDisplacements = indices.map((dof) => displacements[dof] ?? 0);
    const localStiffness = elementStiffnesses[index];
    if (!localStiffness) throw new Error("The p-y mesh contains an incomplete element stiffness.");
    const endForces = matrixVector(localStiffness, localDisplacements);
    const startNode = mesh.nodes[element.startNodeIndex];
    if (!startNode) throw new Error("The p-y element references an unknown start node.");
    const sectionForces = [0, element.length].map(
      (localDepth): SectionForce => ({
        localDepth,
        depthFromPileHead: startNode.depthFromPileHead + localDepth,
        elevation: startNode.elevation - localDepth,
        shearForce: endForces[0] ?? 0,
        bendingMoment: -(endForces[1] ?? 0) + (endForces[0] ?? 0) * localDepth,
      }),
    );
    return {
      ...element,
      flexuralRigidity,
      localDisplacements,
      endForces: {
        startShear: endForces[0] ?? 0,
        startMoment: endForces[1] ?? 0,
        endShear: endForces[2] ?? 0,
        endMoment: endForces[3] ?? 0,
      },
      sectionForces,
    };
  });
}

function numericProperty(value: unknown, property: PropertyKey): number {
  if (value === null || (typeof value !== "object" && typeof value !== "function")) {
    throw new Error(`Expected numeric ${String(property)} values.`);
  }
  const current: unknown = Reflect.get(value, property);
  if (typeof current !== "number") {
    throw new Error(`Expected numeric ${String(property)} values.`);
  }
  return current;
}

function selectAbsoluteExtreme<T>(values: T[], property: keyof T): T | null {
  return values.reduce<T | null>((selected, value) => {
    const current = numericProperty(value, property);
    if (selected == null) return value;
    const previous = numericProperty(selected, property);
    return Math.abs(current) > Math.abs(previous) ? value : selected;
  }, null);
}

function buildOutputs({
  groundModel,
  designSituation,
  profile,
  pile,
  scenario,
  mesh,
  solution,
  externalLoad,
  actionNodeIndex,
  elementStiffnesses,
}: {
  groundModel: GroundModel;
  designSituation: GeotechnicalDesignSituation;
  profile: GroundProfile;
  pile: DeepFoundationModel;
  scenario: LateralPileResponseScenario;
  mesh: PileMesh;
  solution: IncrementalSolution;
  externalLoad: NumericVector;
  actionNodeIndex: number;
  elementStiffnesses: NumericMatrix[];
}): Record<string, unknown> {
  const elements = elementResponses({
    mesh,
    elementStiffnesses,
    displacements: solution.displacements,
    flexuralRigidity: scenario.flexuralRigidity.value,
  });
  const sectionForces = elements.flatMap(({ sectionForces: samples }) => samples);
  const maximumMoment = selectAbsoluteExtreme(sectionForces, "bendingMoment");
  const maximumShear = selectAbsoluteExtreme(sectionForces, "shearForce");
  const nodes: NodeResponse[] = mesh.nodes.map((node) => ({
    ...node,
    displacement: solution.displacements[2 * node.index] ?? 0,
    rotation: solution.displacements[2 * node.index + 1] ?? 0,
    spring: solution.evaluation.springResponses[node.index] ?? {
      displacement: 0,
      tributaryLength: 0,
      mobilizedResistance: 0,
      soilReactionOnPile: 0,
      tangentStiffness: 0,
      secantStiffness: 0,
      contributions: [],
      extrapolated: false,
    },
  }));
  const appliedAtAchievedFactor = externalLoad.map((value) => solution.achievedLoadFactor * value);
  const algebraicResidual = appliedAtAchievedFactor.map(
    (value, index) => value - (solution.evaluation.internalForce[index] ?? 0),
  );
  const supportReactions: SupportReaction[] = solution.fixedIndices.map((dofIndex) => {
    const nodeIndex = Math.floor(dofIndex / 2);
    const node = mesh.nodes[nodeIndex];
    if (!node) throw new Error("The p-y support references an unknown node.");
    return {
      dofIndex,
      nodeIndex,
      nodeId: node.id,
      degreeOfFreedom: dofIndex % 2 === 0 ? "translation" : "rotation",
      value:
        (solution.evaluation.internalForce[dofIndex] ?? 0) -
        (appliedAtAchievedFactor[dofIndex] ?? 0),
    };
  });
  const totalSoilReaction = nodes.reduce((sum, node) => sum + node.spring.soilReactionOnPile, 0);
  const totalTranslationSupportReaction = supportReactions
    .filter(({ degreeOfFreedom }) => degreeOfFreedom === "translation")
    .reduce((sum, reaction) => sum + reaction.value, 0);
  const appliedShear = appliedAtAchievedFactor[2 * actionNodeIndex] ?? 0;
  const appliedNodalMoment = appliedAtAchievedFactor[2 * actionNodeIndex + 1] ?? 0;
  const forceEquilibriumResidual =
    appliedShear + totalSoilReaction + totalTranslationSupportReaction;
  const forceScale = Math.max(1, Math.abs(appliedShear));
  const actionNode = nodes[actionNodeIndex];
  if (!actionNode) throw new Error("The p-y action references an unknown node.");
  const appliedMomentAboutPileHead =
    appliedNodalMoment + appliedShear * actionNode.depthFromPileHead;
  const soilReactionMomentAboutPileHead = nodes.reduce(
    (sum, node) => sum + node.spring.soilReactionOnPile * node.depthFromPileHead,
    0,
  );
  const supportReactionMomentAboutPileHead = supportReactions.reduce(
    (sum, reaction) =>
      sum +
      (reaction.degreeOfFreedom === "translation"
        ? reaction.value * (nodes[reaction.nodeIndex]?.depthFromPileHead ?? 0)
        : reaction.value),
    0,
  );
  const momentEquilibriumResidual =
    appliedMomentAboutPileHead +
    soilReactionMomentAboutPileHead +
    supportReactionMomentAboutPileHead;
  const lastNode = mesh.nodes.at(-1);
  if (!lastNode) throw new Error("The p-y mesh contains no pile toe.");
  const momentScale = Math.max(
    1,
    Math.abs(appliedMomentAboutPileHead),
    Math.abs(appliedShear) * lastNode.depthFromPileHead,
  );
  const extrapolatedNodes = nodes.filter(({ spring }) => spring.extrapolated).map(({ id }) => id);

  return {
    schemaVersion: LATERAL_PILE_PY_RESULT_SCHEMA_VERSION,
    groundModelId: groundModel.id,
    designSituationId: designSituation.id,
    profileId: profile.id,
    pile: pile.toJSON(),
    scenario: scenario.toJSON(),
    mesh: {
      model: scenario.discretization.model,
      nodeCount: mesh.nodes.length,
      elementCount: mesh.elements.length,
      maxElementLength: scenario.discretization.maxElementLength,
      nodes: mesh.nodes.map((node) => ({ ...node })),
      elements: mesh.elements.map((element) => ({ ...element })),
    },
    response: {
      achievedLoadFactor: solution.achievedLoadFactor,
      converged: solution.converged,
      actionPoint: {
        nodeId: actionNode.id,
        nodeIndex: actionNode.index,
        elevation: actionNode.elevation,
        displacement: actionNode.displacement,
        rotation: actionNode.rotation,
      },
      pileHead: {
        nodeId: nodes[0]?.id,
        displacement: nodes[0]?.displacement,
        rotation: nodes[0]?.rotation,
      },
      nodes,
      elements,
      extrema: {
        maximumAbsoluteBendingMoment: maximumMoment,
        maximumAbsoluteShearForce: maximumShear,
        maximumAbsoluteDisplacement: selectAbsoluteExtreme(nodes, "displacement"),
      },
      extrapolatedCurveNodeIds: extrapolatedNodes,
    },
    equilibrium: {
      appliedShear,
      totalSoilReaction,
      totalTranslationSupportReaction,
      forceEquilibriumResidual,
      normalizedForceEquilibriumResidual: Math.abs(forceEquilibriumResidual) / forceScale,
      appliedMomentAboutPileHead,
      soilReactionMomentAboutPileHead,
      supportReactionMomentAboutPileHead,
      momentEquilibriumResidual,
      normalizedMomentEquilibriumResidual: Math.abs(momentEquilibriumResidual) / momentScale,
      maximumFreeDofResidual: maxAbs(
        solution.freeIndices.map((index) => algebraicResidual[index] ?? 0),
      ),
      supportReactions,
    },
    convergence: {
      strategy: scenario.solver.strategy,
      converged: solution.converged,
      achievedLoadFactor: solution.achievedLoadFactor,
      acceptedSteps: solution.history.length,
      cutbacks: solution.cutbacks,
      totalIterations: solution.totalIterations,
      totalLineSearchReductions: solution.totalLineSearchReductions,
      history: solution.history,
      failure: solution.failure,
    },
    demand: {
      lateralShear: scenario.action.lateralShear,
      overturningMoment: scenario.action.overturningMoment,
      referencePoint: scenario.action.referencePoint,
      basis: scenario.action.basis,
    },
    capacity: null,
    checks: [],
    utilizationRatio: null,
    structuralCoupling: {
      level: "single-pile-nonlinear-py-response",
      pileId: pile.id,
      responseMode: {
        status: solution.converged ? "available" : "failed",
        meshNodeCount: mesh.nodes.length,
        flexuralRigidity: scenario.flexuralRigidity.value,
        nodalState: nodes.map((node) => ({
          nodeId: node.id,
          elevation: node.elevation,
          displacement: node.displacement,
          rotation: node.rotation,
          soilReactionOnPile: node.spring.soilReactionOnPile,
          tangentStiffness: node.spring.tangentStiffness,
        })),
      },
      actionEffects: {
        maximumBendingMoment: maximumMoment,
        maximumShearForce: maximumShear,
      },
      structuralVerification: {
        status: "not-analyzed",
        reason:
          "The response supplies pile actions; section resistance and axial-force interaction require a separate structural verifier.",
      },
      continuumBridge: {
        model: "one-dimensional-independent-p-y-springs",
        status: "reduced-order-model",
        excludedEffects: [
          "three-dimensional soil continuum interaction",
          "installation effects",
          "pile-group interaction",
        ],
      },
    },
  };
}

function hasExtrapolatedCurveNodeIds(
  value: unknown,
): value is { extrapolatedCurveNodeIds: string[] } {
  return (
    value !== null &&
    typeof value === "object" &&
    Array.isArray(Reflect.get(value, "extrapolatedCurveNodeIds"))
  );
}

export class LateralPileBeamOnSpringsAnalysis {
  linearSolver: LateralPileLinearSolver;

  constructor({
    linearSolver = new DenseLinearSolver(),
  }: LateralPileBeamOnSpringsAnalysisOptions = {}) {
    this.linearSolver = linearSolver;
  }

  analyze({
    groundModel: groundModelInput,
    designSituation: designSituationInput,
    pile: pileInput,
    scenario: scenarioInput,
    profileId = null,
    units = null,
  }: LateralPileBeamOnSpringsAnalysisInput = {}): LateralPileBeamOnSpringsResult {
    try {
      const explicitUnits = assertExplicitUnitSystem(units, "LateralPileBeamOnSpringsAnalysis");
      const sourceUnits: UnitSystemInput = units ?? explicitUnits;
      const groundModel = normalizeGroundModel(groundModelInput, sourceUnits);
      const designSituation = normalizeDesignSituation(
        designSituationInput,
        groundModel,
        sourceUnits,
      );
      designSituation.validateAgainst(groundModel);
      if (designSituation.seismic.model !== "none") {
        throw new LateralPileResponseNotSupportedError(
          "The current p-y solver is static monotonic and does not support seismic or cyclic response.",
        );
      }
      const pile = normalizePile(pileInput, sourceUnits);
      const scenario = normalizeScenario(scenarioInput, sourceUnits);
      const profile = groundModel.getProfile(
        profileId ?? designSituation.spatialSelection.profileId,
      );
      if (!profile) {
        throw new LateralPileResponseNotSupportedError(
          "A GroundProfile is required for the p-y beam-on-springs analysis.",
        );
      }
      if (
        Math.abs(pile.placement.soilContactTopElevation - profile.groundSurfaceElevation) >
        TOLERANCE
      ) {
        throw new LateralPileResponseNotSupportedError(
          "The current p-y mesh requires pile soil contact to start at the GroundProfile surface.",
        );
      }
      if (pile.placement.toeElevation <= profile.bottomElevation + TOLERANCE) {
        throw new Error("GroundProfile must extend below the pile toe.");
      }

      const mesh = buildMesh({
        profile,
        pile,
        maxElementLength: scenario.discretization.maxElementLength,
      });
      validateLayerCurves({ profile, pile, scenario, mesh });
      const beam = assembleBeamStiffness(mesh, scenario.flexuralRigidity.value);
      const nodeContributions = springContributions(mesh);
      const external = externalLoadVector(mesh, scenario);
      const fixedIndices = fixedDofIndices(mesh, scenario);
      const solution = solveIncrementally({
        mesh,
        scenario,
        beamStiffness: beam.stiffness,
        nodeContributions,
        externalLoad: external.vector,
        fixedIndices,
        linearSolver: this.linearSolver,
      });
      const outputs = buildOutputs({
        groundModel,
        designSituation,
        profile,
        pile,
        scenario,
        mesh,
        solution,
        externalLoad: external.vector,
        actionNodeIndex: external.nodeIndex,
        elementStiffnesses: beam.elementStiffnesses,
      });
      const status = solution.converged ? "ok" : "failed";
      const responseOutput = outputs.response;
      const extrapolationWarning =
        hasExtrapolatedCurveNodeIds(responseOutput) &&
        responseOutput.extrapolatedCurveNodeIds.length > 0
          ? [
              "One or more p-y laws were evaluated beyond their last displacement point; inspect response.extrapolatedCurveNodeIds and the assigned extrapolation rule.",
            ]
          : [];

      return result({
        status,
        summary: solution.converged
          ? "Static nonlinear beam-on-p-y-springs analysis completed."
          : "The nonlinear p-y analysis did not reach the full requested load.",
        outputs,
        warnings: [
          ...extrapolationWarning,
          "P-y curves are assigned empirical inputs; their suitability, parameter provenance and sensitivity remain a project responsibility.",
          "No automatic mesh-convergence study is performed; repeat the analysis with a finer maxElementLength.",
          "Pile axial load, geometric stiffness, shear deformation and nonlinear flexural rigidity are not included in this increment.",
          "Cyclic degradation, gapping, permanent deformation, group effects and lateral ground movement are excluded.",
        ],
        assumptions: [
          "The pile is a vertical Euler-Bernoulli beam with constant assigned flexural rigidity.",
          "Soil is represented by independent, symmetric, static-monotonic p-y springs lumped by tributary element length.",
          "Layer interfaces are mesh boundaries; a node on an interface receives separate half-element contributions from the adjacent layers.",
          "The initial relative displacement between pile and soil is zero.",
          "Head and tip restraints are ideal translational or rotational constraints.",
        ],
        metadata: {
          references: [LATERAL_PILE_PY_REFERENCE],
          sourceUrl: "https://www.fhwa.dot.gov/engineering/geotech/pubs/hif18031.pdf",
          designSituation: designSituation.toJSON(),
          units: {
            force: GEOTECHNICAL_INTERNAL_UNITS.force,
            length: GEOTECHNICAL_INTERNAL_UNITS.length,
            moment: "kN.m",
            flexuralRigidity: "kN.m2",
            soilReactionPerLength: "kN/m",
            pYModulus: "kN/m2",
          },
        },
      });
    } catch (error) {
      const notSupported = error instanceof LateralPileResponseNotSupportedError;
      return result({
        status: notSupported ? "not-supported" : "failed",
        summary: notSupported
          ? errorMessage(error)
          : "Lateral pile beam-on-springs analysis failed.",
        warnings: notSupported ? [] : [errorMessage(error)],
        metadata: { errorName: errorName(error) },
      });
    }
  }
}
