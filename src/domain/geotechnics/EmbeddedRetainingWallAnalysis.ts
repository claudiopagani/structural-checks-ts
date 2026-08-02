import { DenseLinearSolver } from "../math/DenseLinearSolver.js";
import type { NumericMatrix, NumericVector } from "../math/arrayLinearAlgebra.js";
import { assertExplicitUnitSystem, type UnitSystemInput } from "../units/UnitSystem.js";
import {
  EmbeddedRetainingWallModel,
  type EmbeddedRetainingWallModelOptions,
} from "./EmbeddedRetainingWallModel.js";
import {
  EmbeddedRetainingWallScenario,
  type EmbeddedRetainingWallScenarioOptions,
} from "./EmbeddedRetainingWallScenario.js";
import {
  GeotechnicalDesignSituation,
  type GeotechnicalDesignSituationInput,
} from "./GeotechnicalDesignSituation.js";
import { GroundModel, type GroundModelInput } from "./GroundModel.js";

export const EMBEDDED_RETAINING_WALL_RESULT_SCHEMA_VERSION = "embedded-retaining-wall-result/v1";

export const EMBEDDED_RETAINING_WALL_REFERENCES = Object.freeze([
  "FHWA GEC 4, FHWA-IF-99-015 (1999), chapters 5 and 8",
  "FHWA-HRT-10-077 (2013), chapter 6 staged finite-element modeling features",
]);

const SOURCE_URLS = Object.freeze([
  "https://www.fhwa.dot.gov/engineering/geotech/pubs/if99015.pdf",
  "https://www.fhwa.dot.gov/publications/research/infrastructure/10077/006.cfm",
]);
const TOLERANCE = 1e-10;
const SIDES: readonly ("retained" | "excavation")[] = Object.freeze(["retained", "excavation"]);

interface WallScenarioStation {
  depth: number;
  law: {
    id: string;
    evaluate(closureDisplacement: number): {
      effectivePressure: number;
      tangentModulus: number;
      pressureAtZero: number;
      extrapolated: boolean;
    };
  };
}

interface WallScenarioCurve {
  reactionMultiplier: number;
  stations: WallScenarioStation[];
}

interface WallScenarioSide {
  profileId: string;
  xCoordinate: number;
  defaultPorePressureFieldId: string | null;
  curvesByLayer: Record<string, WallScenarioCurve>;
}

interface WallScenarioCapacity {
  maximumForce: number;
}

interface WallScenarioSupport {
  id: string;
  elevation: number;
  stiffness: number;
  prestress: number;
  actionDirection: string;
  behavior: string;
  capacity: WallScenarioCapacity | null;
}

interface WallScenarioPressureSegment {
  topElevation: number;
  bottomElevation: number;
  topPressure: number;
  bottomPressure: number;
}

interface WallScenarioPressureLoad {
  id: string;
  side: string;
  category: string;
  component: string;
  scale: number;
  segments: WallScenarioPressureSegment[];
  provenance: Record<string, unknown>;
}

interface WallScenarioNodalAction {
  id: string;
  elevation: number;
  force: number;
  moment: number;
}

interface WallScenarioStage {
  id: string;
  name: unknown;
  retainedGroundElevation: number;
  excavationGroundElevation: number;
  activeSupportIds: string[];
  porePressureFieldIdBySide: Record<string, string | null>;
  pressureLoads: WallScenarioPressureLoad[];
  nodalActions: WallScenarioNodalAction[];
}
type WallModel = EmbeddedRetainingWallModel;
type DesignSituation = GeotechnicalDesignSituation;

interface MeshNode {
  id: string;
  index: number;
  elevation: number;
  depthFromWallHead: number;
  isWallHead: boolean;
  isWallToe: boolean;
}

interface MeshElement {
  id: string;
  index: number;
  startNodeIndex: number;
  endNodeIndex: number;
  topElevation: number;
  bottomElevation: number;
  midpointElevation: number;
  length: number;
  sectionId: string;
  flexuralRigidity: number;
}

interface Mesh {
  nodes: MeshNode[];
  elements: MeshElement[];
}

interface NodeContribution {
  elementId: string;
  samplingElevation: number;
  tributaryLength: number;
}

interface LineLoad {
  top: number;
  bottom: number;
}

interface SectionForce {
  localDepth: number;
  depthFromWallHead: number;
  elevation: number;
  shearForce: number;
  bendingMoment: number;
}

interface ElementResponse extends MeshElement {
  localDisplacements: number[];
  equivalentAssignedPressureLoad: number[];
  assignedLineLoad: LineLoad;
  endForces: {
    startShear: number;
    startMoment: number;
    endShear: number;
    endMoment: number;
  };
  sectionForces: SectionForce[];
}

interface BeamAssembly {
  stiffness: NumericMatrix;
  elementStiffnesses: NumericMatrix[];
}

interface SoilContribution extends NodeContribution {
  layerId: string;
  materialId: string;
  depthBelowProfileSurface: number;
  closureDisplacement: number;
  effectivePressure: number;
  waterPressure: number;
  totalPressureMagnitude: number;
  effectiveForceOnWall: number;
  waterForceOnWall: number;
  totalForceOnWall: number;
  internalResistance: number;
  tangentStiffness: number;
  interpolation: Record<string, unknown>;
  extrapolated: boolean;
}

interface SoilSideResponse {
  side: string;
  displacement: number;
  closureDisplacement: number;
  activeTributaryLength: number;
  effectiveSoilForceOnWall: number;
  waterForceOnWall: number;
  totalForceOnWall: number;
  internalResistance: number;
  tangentStiffness: number;
  contributions: SoilContribution[];
  extrapolated: boolean;
}

interface SoilNodeResponse {
  nodeId: string;
  retained: SoilSideResponse;
  excavation: SoilSideResponse;
}

interface SoilConfiguration {
  internalForce: NumericVector;
  tangentDiagonal: NumericVector;
  nodeResponses: SoilNodeResponse[];
}

interface SupportResponse {
  supportId: string;
  nodeIndex: number;
  nodeId: string;
  elevation: number;
  status: string;
  scalarForce: number;
  actualForceOnWall: number;
  tangentStiffness: number;
  capacity: WallScenarioCapacity | null;
  utilizationRatio: number | null;
  referenceDisplacement?: number;
  displacement?: number;
  deformation?: number;
  trialScalarForce?: number;
  internalResistance?: number;
}

interface SupportConfiguration {
  internalForce: NumericVector;
  tangentDiagonal: NumericVector;
  responses: SupportResponse[];
}

interface ExternalConfiguration {
  vector: NumericVector;
  elementVectors: NumericVector[];
  elementLineLoads: LineLoad[];
  pressureLoadResults: Record<string, unknown>[];
  nodalActionResults: Record<string, unknown>[];
}

interface Configuration {
  soil: SoilConfiguration;
  supports: SupportConfiguration;
  external: ExternalConfiguration;
}

interface CombinedTransition {
  internalForce: NumericVector;
  tangentStiffness: NumericMatrix;
  externalLoad: NumericVector;
}

interface EvaluateConfigurationInput extends BuildMeshInput {
  stage: WallScenarioStage | null;
  mesh: Mesh;
  nodeContributions: NodeContribution[][];
  displacements: NumericVector;
  supportReferenceDisplacements: Map<string, number>;
}

interface CombineTransitionInput {
  transitionFactor: number;
  displacements: NumericVector;
  beamStiffness: NumericMatrix;
  previous: Configuration;
  current: Configuration;
}

interface ResidualMetricsInput {
  residual: NumericVector;
  evaluation: CombinedTransition;
  freeIndices: number[];
  wallLength: number;
}

interface SolveTransitionTargetInput {
  targetFactor: number;
  initialDisplacements: NumericVector;
  freeIndices: number[];
  wallLength: number;
  scenario: EmbeddedRetainingWallScenario;
  evaluate: (displacements: NumericVector, targetFactor: number) => TransitionEvaluation;
  linearSolver: DenseLinearSolver;
}

interface SolveStageTransitionInput {
  groundModel: GroundModel;
  wall: WallModel;
  scenario: EmbeddedRetainingWallScenario;
  previousStage: WallScenarioStage | null;
  currentStage: WallScenarioStage;
  mesh: Mesh;
  nodeContributions: NodeContribution[][];
  beamStiffness: NumericMatrix;
  fixedIndices: number[];
  initialDisplacements: NumericVector;
  supportReferenceDisplacements: Map<string, number>;
  linearSolver: DenseLinearSolver;
}

interface ElementResponsesInput {
  mesh: Mesh;
  elementStiffnesses: NumericMatrix[];
  displacements: NumericVector;
  elementExternalLoads: NumericVector[];
  elementLineLoads: LineLoad[];
}

interface BuildStageOutputInput {
  stage: WallScenarioStage;
  stageIndex: number;
  mesh: Mesh;
  wall: WallModel;
  scenario: EmbeddedRetainingWallScenario;
  solution: StageSolution;
  beam: BeamAssembly;
  finalConfiguration: Configuration;
}

interface ValidateInput {
  groundModel: GroundModel;
  designSituation: DesignSituation;
  wall: WallModel;
  scenario: EmbeddedRetainingWallScenario;
}

interface ActivateNewSupportsInput {
  previousStage: WallScenarioStage | null;
  currentStage: WallScenarioStage;
  scenario: EmbeddedRetainingWallScenario;
  mesh: Mesh;
  displacements: NumericVector;
  references: Map<string, number>;
}

interface BuildOutputsInput {
  groundModel: GroundModel;
  designSituation: DesignSituation;
  wall: WallModel;
  scenario: EmbeddedRetainingWallScenario;
  mesh: Mesh;
  stageOutputs: StageOutput[];
}

interface EmbeddedRetainingWallOutputs extends Record<string, unknown> {
  checks: SupportCheck[];
}

interface AcceptedTransition {
  displacements: NumericVector;
  evaluation: TransitionEvaluation;
  metrics: ResidualMetrics;
}

interface TransitionEvaluation {
  internalForce: NumericVector;
  tangentStiffness: NumericMatrix;
  externalLoad: NumericVector;
  previous: Configuration;
  current: Configuration;
}

interface ResidualMetrics {
  freeResidualInfNorm: number;
  relativeFreeResidualInfNorm: number;
  forceScale: number;
  momentScale: number;
}

interface TransitionSolution {
  converged: boolean;
  displacements: NumericVector;
  evaluation: TransitionEvaluation;
  iterations: number;
  lineSearchReductions: number;
  metrics: ResidualMetrics;
  reason?: string;
  error?: string;
}

interface StageSolution {
  converged: boolean;
  achievedFactor: number;
  displacements: NumericVector;
  evaluation: TransitionEvaluation;
  fixedIndices: number[];
  freeIndices: number[];
  cutbacks: number;
  totalIterations: number;
  totalLineSearchReductions: number;
  history: Record<string, unknown>[];
  failure: {
    reason?: string;
    error: string | null;
    iterations: number;
    metrics: ResidualMetrics;
  } | null;
}

interface OutputNode extends MeshNode {
  displacement: number;
  rotation: number;
  soil: SoilNodeResponse;
}

interface ExtremeValue {
  bendingMoment?: number;
  shearForce?: number;
  displacement?: number;
}

interface SupportCheck {
  id: string;
  supportId: string;
  status: string;
  demand: number;
  capacity: number | null;
  utilizationRatio: number | null;
  units: string;
}

interface StageOutput {
  id: string;
  name: unknown;
  index: number;
  status: string;
  stageDefinition: WallScenarioStage;
  response: {
    converged: boolean;
    achievedTransitionFactor: number;
    nodes: OutputNode[];
    elements: ElementResponse[];
    supports: SupportResponse[];
    pressureLoads: Record<string, unknown>[];
    nodalActions: Record<string, unknown>[];
    extrema: {
      maximumAbsoluteDisplacement: ExtremeValue | null;
      maximumAbsoluteBendingMoment: ExtremeValue | null;
      maximumAbsoluteShearForce: ExtremeValue | null;
    };
    extrapolatedCurveLocations: { nodeId: string; side: string }[];
  };
  equilibrium: Record<string, unknown>;
  convergence: Record<string, unknown>;
  checks: SupportCheck[];
  utilizationRatio: number | null;
}

interface ResultInput {
  status: string;
  summary: string;
  outputs?: Record<string, unknown>;
  warnings?: string[];
  assumptions?: string[];
  metadata?: Record<string, unknown>;
}

export interface EmbeddedRetainingWallAnalysisOptions {
  linearSolver?: DenseLinearSolver;
}

export interface EmbeddedRetainingWallAnalysisInput {
  groundModel?: GroundModel | GroundModelInput;
  designSituation?: DesignSituation | GeotechnicalDesignSituationInput;
  wall?: WallModel | EmbeddedRetainingWallModelOptions;
  scenario?: EmbeddedRetainingWallScenario | EmbeddedRetainingWallScenarioOptions;
  units?: UnitSystemInput | null;
}

export interface EmbeddedRetainingWallAnalysisResult {
  status: string;
  summary: string;
  outputs: Record<string, unknown>;
  warnings: string[];
  assumptions: string[];
  metadata: Record<string, unknown>;
}

interface BuildMeshInput {
  groundModel: GroundModel;
  wall: WallModel;
  scenario: EmbeddedRetainingWallScenario;
}

interface SoilConfigurationInput extends BuildMeshInput {
  stage: WallScenarioStage;
  mesh: Mesh;
  nodeContributions: NodeContribution[][];
  displacements: NumericVector;
}

class EmbeddedWallNotSupportedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EmbeddedWallNotSupportedError";
  }
}

function result({
  status,
  summary,
  outputs = {},
  warnings = [],
  assumptions = [],
  metadata = {},
}: ResultInput): EmbeddedRetainingWallAnalysisResult {
  return { status, summary, outputs, warnings, assumptions, metadata };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function normalizeGroundModel(
  value: GroundModel | GroundModelInput | null | undefined,
  units: UnitSystemInput | null,
): GroundModel {
  return value instanceof GroundModel
    ? value
    : new GroundModel({ ...value, units: value?.units ?? units });
}

function normalizeDesignSituation(
  value: DesignSituation | GeotechnicalDesignSituationInput | null | undefined,
  groundModel: GroundModel,
  units: UnitSystemInput | null,
): DesignSituation {
  return value instanceof GeotechnicalDesignSituation
    ? value
    : new GeotechnicalDesignSituation({
        ...value,
        groundModel,
        units: value?.units ?? units,
      });
}

function normalizeWall(
  value: WallModel | EmbeddedRetainingWallModelOptions | null | undefined,
  units: UnitSystemInput | null,
): WallModel {
  return value instanceof EmbeddedRetainingWallModel
    ? value
    : new EmbeddedRetainingWallModel({
        ...value,
        units: value?.units ?? units,
      });
}

function normalizeScenario(
  value: EmbeddedRetainingWallScenario | EmbeddedRetainingWallScenarioOptions | null | undefined,
  units: UnitSystemInput | null,
): EmbeddedRetainingWallScenario {
  return value instanceof EmbeddedRetainingWallScenario
    ? value
    : new EmbeddedRetainingWallScenario({
        ...value,
        units: value?.units ?? units,
      });
}

function zeroVector(size: number): NumericVector {
  return Array<number>(size).fill(0);
}

function zeroMatrix(size: number): NumericMatrix {
  return Array.from({ length: size }, () => zeroVector(size));
}

function cloneMatrix(matrix: NumericMatrix): NumericMatrix {
  return matrix.map((row) => [...row]);
}

function matrixVector(matrix: NumericMatrix, vector: NumericVector): NumericVector {
  return matrix.map((row) =>
    row.reduce((sum, value, index) => sum + value * (vector[index] ?? 0), 0),
  );
}

function maxAbs(values: NumericVector): number {
  return values.reduce((maximum, value) => Math.max(maximum, Math.abs(value)), 0);
}

function addUnique(values: NumericVector, candidate: number, tolerance = TOLERANCE): void {
  if (!values.some((value) => Math.abs(value - candidate) <= tolerance)) {
    values.push(candidate);
  }
}

function addBoundary(boundaries: NumericVector, value: number, wall: WallModel): void {
  if (value < wall.topElevation - TOLERANCE && value > wall.toeElevation + TOLERANCE) {
    addUnique(boundaries, value);
  }
}

function sideSign(side: string): number {
  return side === "retained" ? 1 : -1;
}

function buildMesh({ groundModel, wall, scenario }: BuildMeshInput): Mesh {
  const boundaries = [wall.topElevation, wall.toeElevation];
  for (const segment of wall.flexuralRigiditySegments) {
    addBoundary(boundaries, segment.topElevation, wall);
    addBoundary(boundaries, segment.bottomElevation, wall);
  }
  for (const side of SIDES) {
    const sideDefinition = scenario.soilResponse.sides[side];
    const profile = groundModel.getProfile(sideDefinition.profileId);
    if (profile == null)
      throw new Error(`Unknown GroundModel profile: ${sideDefinition.profileId}.`);
    for (const layer of profile.layers) {
      addBoundary(boundaries, layer.topElevation, wall);
      addBoundary(boundaries, layer.bottomElevation, wall);
    }
    for (const curve of Object.values(sideDefinition.curvesByLayer)) {
      for (const station of curve.stations) {
        addBoundary(boundaries, profile.groundSurfaceElevation - station.depth, wall);
      }
    }
  }
  for (const support of scenario.supports) {
    addBoundary(boundaries, support.elevation, wall);
  }
  for (const stage of scenario.stages) {
    addBoundary(boundaries, stage.retainedGroundElevation, wall);
    addBoundary(boundaries, stage.excavationGroundElevation, wall);
    for (const action of stage.nodalActions) {
      addBoundary(boundaries, action.elevation, wall);
    }
    for (const load of stage.pressureLoads) {
      for (const segment of load.segments) {
        addBoundary(boundaries, segment.topElevation, wall);
        addBoundary(boundaries, segment.bottomElevation, wall);
      }
    }
  }
  boundaries.sort((left, right) => right - left);

  const elevations: number[] = [];
  for (let interval = 0; interval < boundaries.length - 1; interval += 1) {
    const top = boundaries[interval]!;
    const bottom = boundaries[interval + 1]!;
    const length = top - bottom;
    const subdivisions = Math.max(1, Math.ceil(length / scenario.discretization.maxElementLength));
    if (interval === 0) elevations.push(top);
    for (let index = 1; index <= subdivisions; index += 1) {
      elevations.push(top - (length * index) / subdivisions);
    }
  }

  const nodes: MeshNode[] = elevations.map((elevation, index) => ({
    id: `embedded-wall-node-${index + 1}`,
    index,
    elevation,
    depthFromWallHead: wall.topElevation - elevation,
    isWallHead: index === 0,
    isWallToe: index === elevations.length - 1,
  }));
  const elements: MeshElement[] = [];
  for (let index = 0; index < nodes.length - 1; index += 1) {
    const start = nodes[index]!;
    const end = nodes[index + 1]!;
    const midpointElevation = (start.elevation + end.elevation) / 2;
    const section = wall.flexuralRigidityAtElevation(midpointElevation);
    elements.push({
      id: `embedded-wall-element-${index + 1}`,
      index,
      startNodeIndex: start.index,
      endNodeIndex: end.index,
      topElevation: start.elevation,
      bottomElevation: end.elevation,
      midpointElevation,
      length: start.elevation - end.elevation,
      sectionId: section.id,
      flexuralRigidity: section.flexuralRigidity,
    });
  }
  return { nodes, elements };
}

function beamElementStiffness(flexuralRigidity: number, length: number): NumericMatrix {
  const factor = flexuralRigidity / length ** 3;
  return [
    [12 * factor, 6 * length * factor, -12 * factor, 6 * length * factor],
    [6 * length * factor, 4 * length ** 2 * factor, -6 * length * factor, 2 * length ** 2 * factor],
    [-12 * factor, -6 * length * factor, 12 * factor, -6 * length * factor],
    [6 * length * factor, 2 * length ** 2 * factor, -6 * length * factor, 4 * length ** 2 * factor],
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

function assembleBeam(mesh: Mesh): BeamAssembly {
  const size = 2 * mesh.nodes.length;
  const stiffness = zeroMatrix(size);
  const elementStiffnesses: NumericMatrix[] = [];
  for (const element of mesh.elements) {
    const local = beamElementStiffness(element.flexuralRigidity, element.length);
    const indices = elementDofIndices(element);
    for (let row = 0; row < 4; row += 1) {
      const stiffnessRow = stiffness[indices[row]!];
      const localRow = local[row];
      if (stiffnessRow == null || localRow == null) {
        throw new Error("Embedded retaining-wall beam stiffness row is unavailable.");
      }
      for (let column = 0; column < 4; column += 1) {
        const columnIndex = indices[column]!;
        stiffnessRow[columnIndex] = (stiffnessRow[columnIndex] ?? 0) + (localRow[column] ?? 0);
      }
    }
    elementStiffnesses.push(local);
  }
  return { stiffness, elementStiffnesses };
}

function buildNodeContributions(mesh: Mesh): NodeContribution[][] {
  const contributions: NodeContribution[][] = mesh.nodes.map(() => []);
  for (const element of mesh.elements) {
    const contribution = {
      elementId: element.id,
      samplingElevation: element.midpointElevation,
      tributaryLength: element.length / 2,
    };
    const startContributions = contributions[element.startNodeIndex];
    const endContributions = contributions[element.endNodeIndex];
    if (startContributions == null || endContributions == null) {
      throw new Error("Embedded retaining-wall mesh node contribution is unavailable.");
    }
    startContributions.push({ ...contribution });
    endContributions.push({ ...contribution });
  }
  return contributions;
}

function findNodeIndexAtElevation(mesh: Mesh, elevation: number, label: string): number {
  const node = mesh.nodes.find(
    (candidate) => Math.abs(candidate.elevation - elevation) <= TOLERANCE,
  );
  if (!node) throw new Error(`${label} is not represented in the wall mesh.`);
  return node.index;
}

function bracketStations(
  stations: WallScenarioStation[],
  depth: number,
): { left: WallScenarioStation; right: WallScenarioStation; ratio: number } {
  const first = stations[0];
  const last = stations.at(-1);
  if (first == null || last == null) {
    throw new Error("Wall-soil response requires at least one station.");
  }
  if (stations.length === 1 || depth <= first.depth) {
    return { left: first, right: first, ratio: 0 };
  }
  if (depth >= last.depth) {
    return { left: last, right: last, ratio: 0 };
  }
  for (let index = 1; index < stations.length; index += 1) {
    const station = stations[index];
    if (station != null && depth <= station.depth) {
      const left = stations[index - 1]!;
      const right = station;
      return {
        left,
        right,
        ratio: (depth - left.depth) / (right.depth - left.depth),
      };
    }
  }
  return { left: last, right: last, ratio: 0 };
}

function evaluateLayerCurve(
  layerCurve: WallScenarioCurve,
  depth: number,
  closureDisplacement: number,
): {
  closureDisplacement: number;
  effectivePressure: number;
  tangentModulus: number;
  pressureAtZero: number;
  interpolation: Record<string, unknown>;
  extrapolated: boolean;
} {
  const bracket = bracketStations(layerCurve.stations, depth);
  const left = bracket.left.law.evaluate(closureDisplacement);
  const right =
    bracket.right === bracket.left ? left : bracket.right.law.evaluate(closureDisplacement);
  const interpolate = (leftValue: number, rightValue: number): number =>
    (leftValue + bracket.ratio * (rightValue - leftValue)) * layerCurve.reactionMultiplier;
  return {
    closureDisplacement,
    effectivePressure: interpolate(left.effectivePressure, right.effectivePressure),
    tangentModulus: interpolate(left.tangentModulus, right.tangentModulus),
    pressureAtZero: interpolate(left.pressureAtZero, right.pressureAtZero),
    interpolation: {
      leftStationDepth: bracket.left.depth,
      rightStationDepth: bracket.right.depth,
      ratio: bracket.ratio,
      leftLawId: bracket.left.law.id,
      rightLawId: bracket.right.law.id,
    },
    extrapolated: left.extrapolated || right.extrapolated,
  };
}

function groundElevation(stage: WallScenarioStage, side: string): number {
  return side === "retained" ? stage.retainedGroundElevation : stage.excavationGroundElevation;
}

interface PorePressureFieldLike {
  porePressureAt(input: { x: number; z: number }): number;
}

function isPorePressureField(value: unknown): value is PorePressureFieldLike {
  return (
    value !== null &&
    typeof value === "object" &&
    typeof Reflect.get(value, "porePressureAt") === "function"
  );
}

function resolveField(
  groundModel: GroundModel,
  stage: WallScenarioStage,
  side: string,
  sideDefinition: WallScenarioSide,
): PorePressureFieldLike | null {
  const stageSelection = stage.porePressureFieldIdBySide;
  const id = Object.hasOwn(stageSelection, side)
    ? stageSelection[side]
    : sideDefinition.defaultPorePressureFieldId;
  const field: unknown = id == null ? null : getPorePressureFieldById(groundModel, id);
  return isPorePressureField(field) ? field : null;
}

function getPorePressureFieldById(groundModel: GroundModel, id: string): unknown {
  const getter: unknown = Reflect.get(groundModel, "getPorePressureField");
  if (typeof getter !== "function") return null;
  return Reflect.apply(getter, groundModel, [id]);
}

function emptySideResponse(side: string, displacement: number): SoilSideResponse {
  return {
    side,
    displacement,
    closureDisplacement: -sideSign(side) * displacement,
    activeTributaryLength: 0,
    effectiveSoilForceOnWall: 0,
    waterForceOnWall: 0,
    totalForceOnWall: 0,
    internalResistance: 0,
    tangentStiffness: 0,
    contributions: [],
    extrapolated: false,
  };
}

function evaluateSoilConfiguration({
  groundModel,
  wall,
  scenario,
  stage,
  mesh,
  nodeContributions,
  displacements,
}: SoilConfigurationInput): SoilConfiguration {
  const size = displacements.length;
  const internalForce = zeroVector(size);
  const tangentDiagonal = zeroVector(size);
  const nodeResponses: SoilNodeResponse[] = mesh.nodes.map((node) => ({
    nodeId: node.id,
    retained: emptySideResponse("retained", displacements[2 * node.index] ?? 0),
    excavation: emptySideResponse("excavation", displacements[2 * node.index] ?? 0),
  }));

  for (const side of SIDES) {
    const sign = sideSign(side);
    const definition = scenario.soilResponse.sides[side];
    const profile = groundModel.getProfile(definition.profileId);
    if (profile == null) throw new Error(`Unknown GroundModel profile: ${definition.profileId}.`);
    const field = resolveField(groundModel, stage, side, definition);
    const contactTop = groundElevation(stage, side);
    for (const node of mesh.nodes) {
      const displacement = displacements[2 * node.index] ?? 0;
      const closureDisplacement = -sign * displacement;
      const evaluated: SoilContribution[] = [];
      for (const contribution of nodeContributions[node.index] ?? []) {
        const z = contribution.samplingElevation;
        if (
          z > contactTop + TOLERANCE ||
          z > profile.groundSurfaceElevation + TOLERANCE ||
          z < profile.bottomElevation - TOLERANCE
        ) {
          continue;
        }
        const layer = profile.getLayerAtElevation(z);
        const layerCurve = definition.curvesByLayer[layer.id];
        if (!layerCurve) {
          throw new Error(`No ${side}-side wall-soil curve exists for layer ${layer.id}.`);
        }
        const depth = profile.groundSurfaceElevation - z;
        const response = evaluateLayerCurve(layerCurve, depth, closureDisplacement);
        const waterPressure =
          field == null
            ? 0
            : Math.max(
                0,
                field.porePressureAt({
                  x: definition.xCoordinate,
                  z,
                }),
              );
        const effectiveForceOnWall =
          sign * response.effectivePressure * wall.analysisWidth * contribution.tributaryLength;
        const waterForceOnWall =
          sign * waterPressure * wall.analysisWidth * contribution.tributaryLength;
        const totalForceOnWall = effectiveForceOnWall + waterForceOnWall;
        const tangentStiffness =
          response.tangentModulus * wall.analysisWidth * contribution.tributaryLength;
        evaluated.push({
          ...contribution,
          layerId: layer.id,
          materialId: layer.materialId,
          depthBelowProfileSurface: depth,
          closureDisplacement,
          effectivePressure: response.effectivePressure,
          waterPressure,
          totalPressureMagnitude: response.effectivePressure + waterPressure,
          effectiveForceOnWall,
          waterForceOnWall,
          totalForceOnWall,
          internalResistance: -totalForceOnWall,
          tangentStiffness,
          interpolation: response.interpolation,
          extrapolated: response.extrapolated,
        });
      }
      const sideResponse = nodeResponses[node.index]![side];
      sideResponse.contributions = evaluated;
      sideResponse.activeTributaryLength = evaluated.reduce(
        (sum, item) => sum + item.tributaryLength,
        0,
      );
      for (const item of evaluated) {
        sideResponse.effectiveSoilForceOnWall += item.effectiveForceOnWall;
        sideResponse.waterForceOnWall += item.waterForceOnWall;
        sideResponse.totalForceOnWall += item.totalForceOnWall;
        sideResponse.internalResistance += item.internalResistance;
        sideResponse.tangentStiffness += item.tangentStiffness;
      }
      sideResponse.extrapolated = evaluated.some(({ extrapolated }) => extrapolated);
      const displacementIndex = 2 * node.index;
      internalForce[displacementIndex] =
        (internalForce[displacementIndex] ?? 0) + sideResponse.internalResistance;
      tangentDiagonal[displacementIndex] =
        (tangentDiagonal[displacementIndex] ?? 0) + sideResponse.tangentStiffness;
    }
  }
  return { internalForce, tangentDiagonal, nodeResponses };
}

function supportDirection(support: WallScenarioSupport): number {
  return support.actionDirection === "toward-retained-side" ? -1 : 1;
}

interface SupportConfigurationInput {
  scenario: EmbeddedRetainingWallScenario;
  stage: WallScenarioStage;
  mesh: Mesh;
  displacements: NumericVector;
  supportReferenceDisplacements: Map<string, number>;
}

function evaluateSupportConfiguration({
  scenario,
  stage,
  mesh,
  displacements,
  supportReferenceDisplacements,
}: SupportConfigurationInput): SupportConfiguration {
  const size = displacements.length;
  const internalForce = zeroVector(size);
  const tangentDiagonal = zeroVector(size);
  const active = new Set(stage.activeSupportIds);
  const responses: SupportResponse[] = [];
  for (const support of scenario.supports) {
    const nodeIndex = findNodeIndexAtElevation(mesh, support.elevation, `Support ${support.id}`);
    if (!active.has(support.id)) {
      responses.push({
        supportId: support.id,
        nodeIndex,
        nodeId: mesh.nodes[nodeIndex]!.id,
        elevation: support.elevation,
        status: "inactive",
        scalarForce: 0,
        actualForceOnWall: 0,
        tangentStiffness: 0,
        capacity: support.capacity,
        utilizationRatio: 0,
      });
      continue;
    }
    const direction = supportDirection(support);
    const referenceDisplacement = supportReferenceDisplacements.get(support.id) ?? 0;
    const displacement = displacements[2 * nodeIndex] ?? 0;
    const deformation = -direction * (displacement - referenceDisplacement);
    const trialScalarForce = support.prestress + support.stiffness * deformation;
    const scalarForce =
      support.behavior === "unilateral" ? Math.max(0, trialScalarForce) : trialScalarForce;
    const engaged = support.behavior === "bilateral" || trialScalarForce > 0;
    const actualForceOnWall = direction * scalarForce;
    const resistance = -actualForceOnWall;
    const tangentStiffness = engaged ? support.stiffness : 0;
    const displacementIndex = 2 * nodeIndex;
    internalForce[displacementIndex] = (internalForce[displacementIndex] ?? 0) + resistance;
    tangentDiagonal[displacementIndex] =
      (tangentDiagonal[displacementIndex] ?? 0) + tangentStiffness;
    responses.push({
      supportId: support.id,
      nodeIndex,
      nodeId: mesh.nodes[nodeIndex]!.id,
      elevation: support.elevation,
      status: engaged ? "active" : "slack",
      referenceDisplacement,
      displacement,
      deformation,
      trialScalarForce,
      scalarForce,
      actualForceOnWall,
      internalResistance: resistance,
      tangentStiffness,
      capacity: structuredClone(support.capacity),

      utilizationRatio:
        support.capacity == null ? null : Math.abs(scalarForce) / support.capacity.maximumForce,
    });
  }
  return { internalForce, tangentDiagonal, responses };
}

function pressureAtElevation(segment: WallScenarioPressureSegment, elevation: number): number {
  const ratio =
    (segment.topElevation - elevation) / (segment.topElevation - segment.bottomElevation);
  return segment.topPressure + ratio * (segment.bottomPressure - segment.topPressure);
}

function segmentAtElevation(
  segments: WallScenarioPressureSegment[],
  elevation: number,
): WallScenarioPressureSegment | null {
  return (
    segments.find(
      (segment: WallScenarioPressureSegment) =>
        elevation <= segment.topElevation + TOLERANCE &&
        elevation >= segment.bottomElevation - TOLERANCE,
    ) ?? null
  );
}

function consistentLinearLoad(topLoad: number, bottomLoad: number, length: number): NumericVector {
  return [
    (length * (7 * topLoad + 3 * bottomLoad)) / 20,
    (length ** 2 * (3 * topLoad + 2 * bottomLoad)) / 60,
    (length * (3 * topLoad + 7 * bottomLoad)) / 20,
    (-(length ** 2) * (2 * topLoad + 3 * bottomLoad)) / 60,
  ];
}

interface ExternalConfigurationInput {
  wall: WallModel;
  stage: WallScenarioStage;
  mesh: Mesh;
}

function externalConfiguration({
  wall,
  stage,
  mesh,
}: ExternalConfigurationInput): ExternalConfiguration {
  const size = 2 * mesh.nodes.length;
  const vector = zeroVector(size);
  const elementVectors: NumericVector[] = mesh.elements.map(() => [0, 0, 0, 0]);
  const elementLineLoads = mesh.elements.map(() => ({ top: 0, bottom: 0 }));
  const pressureLoadResults: Record<string, unknown>[] = [];
  for (const load of stage.pressureLoads) {
    const sign = sideSign(load.side);
    let totalForce = 0;
    let momentAboutWallHead = 0;
    for (const element of mesh.elements) {
      const segment = segmentAtElevation(load.segments, element.midpointElevation);
      if (!segment) continue;
      const topPressure = pressureAtElevation(segment, element.topElevation);
      const bottomPressure = pressureAtElevation(segment, element.bottomElevation);
      const topLoad = sign * load.scale * topPressure * wall.analysisWidth;
      const bottomLoad = sign * load.scale * bottomPressure * wall.analysisWidth;
      const local = consistentLinearLoad(topLoad, bottomLoad, element.length);
      const indices = elementDofIndices(element);
      for (let index = 0; index < 4; index += 1) {
        vector[indices[index]!]! += local[index]!;
        elementVectors[element.index]![index]! += local[index]!;
      }
      elementLineLoads[element.index]!.top += topLoad;
      elementLineLoads[element.index]!.bottom += bottomLoad;
      const elementForce = local[0]! + local[2]!;
      const elementMoment =
        local[0]! * mesh.nodes[element.startNodeIndex]!.depthFromWallHead +
        local[1]! +
        local[2]! * mesh.nodes[element.endNodeIndex]!.depthFromWallHead +
        local[3]!;
      totalForce += elementForce;
      momentAboutWallHead += elementMoment;
    }
    pressureLoadResults.push({
      id: load.id,
      side: load.side,
      category: load.category,
      component: load.component,
      totalForce,
      momentAboutWallHead,
      provenance: structuredClone(load.provenance),
    });
  }
  const nodalActionResults: Record<string, unknown>[] = [];
  for (const action of stage.nodalActions) {
    const nodeIndex = findNodeIndexAtElevation(mesh, action.elevation, `Nodal action ${action.id}`);
    vector[2 * nodeIndex] = (vector[2 * nodeIndex] ?? 0) + action.force;
    vector[2 * nodeIndex + 1] = (vector[2 * nodeIndex + 1] ?? 0) + action.moment;
    nodalActionResults.push({
      ...structuredClone(action),
      nodeIndex,
      nodeId: mesh.nodes[nodeIndex]!.id,
    });
  }
  return {
    vector,
    elementVectors,
    elementLineLoads,
    pressureLoadResults,
    nodalActionResults,
  };
}

function emptyConfiguration(size: number, mesh: Mesh): Configuration {
  return {
    soil: {
      internalForce: zeroVector(size),
      tangentDiagonal: zeroVector(size),
      nodeResponses: mesh.nodes.map((node) => ({
        nodeId: node.id,
        retained: emptySideResponse("retained", 0),
        excavation: emptySideResponse("excavation", 0),
      })),
    },
    supports: {
      internalForce: zeroVector(size),
      tangentDiagonal: zeroVector(size),
      responses: [],
    },
    external: {
      vector: zeroVector(size),
      elementVectors: mesh.elements.map(() => [0, 0, 0, 0]),
      elementLineLoads: mesh.elements.map(() => ({ top: 0, bottom: 0 })),
      pressureLoadResults: [],
      nodalActionResults: [],
    },
  };
}

function evaluateConfiguration({
  groundModel,
  wall,
  scenario,
  stage,
  mesh,
  nodeContributions,
  displacements,
  supportReferenceDisplacements,
}: EvaluateConfigurationInput): Configuration {
  if (stage == null) return emptyConfiguration(displacements.length, mesh);
  return {
    soil: evaluateSoilConfiguration({
      groundModel,
      wall,
      scenario,
      stage,
      mesh,
      nodeContributions,
      displacements,
    }),
    supports: evaluateSupportConfiguration({
      scenario,
      stage,
      mesh,
      displacements,
      supportReferenceDisplacements,
    }),
    external: externalConfiguration({ wall, stage, mesh }),
  };
}

function combineTransition({
  transitionFactor,
  displacements,
  beamStiffness,
  previous,
  current,
}: CombineTransitionInput): CombinedTransition {
  const previousFactor = 1 - transitionFactor;
  const internalForce = matrixVector(beamStiffness, displacements);
  const tangentStiffness = cloneMatrix(beamStiffness);
  const externalLoad = zeroVector(displacements.length);
  for (let index = 0; index < displacements.length; index += 1) {
    internalForce[index] =
      (internalForce[index] ?? 0) +
      previousFactor *
        ((previous.soil.internalForce[index] ?? 0) +
          (previous.supports.internalForce[index] ?? 0)) +
      transitionFactor *
        ((current.soil.internalForce[index] ?? 0) + (current.supports.internalForce[index] ?? 0));
    const tangentRow = tangentStiffness[index];
    if (tangentRow == null) {
      throw new Error("Embedded retaining-wall tangent stiffness row is unavailable.");
    }
    tangentRow[index] =
      (tangentRow[index] ?? 0) +
      previousFactor *
        ((previous.soil.tangentDiagonal[index] ?? 0) +
          (previous.supports.tangentDiagonal[index] ?? 0)) +
      transitionFactor *
        ((current.soil.tangentDiagonal[index] ?? 0) +
          (current.supports.tangentDiagonal[index] ?? 0));
    externalLoad[index] =
      previousFactor * (previous.external.vector[index] ?? 0) +
      transitionFactor * (current.external.vector[index] ?? 0);
  }
  return { internalForce, tangentStiffness, externalLoad };
}

function residualMetrics({
  residual,
  evaluation,
  freeIndices,
  wallLength,
}: ResidualMetricsInput): ResidualMetrics {
  const forceValues: number[] = [];
  const momentValues: number[] = [];
  for (let index = 0; index < residual.length; index += 1) {
    const collection = index % 2 === 0 ? forceValues : momentValues;
    collection.push(
      residual[index] ?? 0,
      evaluation.externalLoad[index] ?? 0,
      evaluation.internalForce[index] ?? 0,
    );
  }
  const forceScale = Math.max(1, maxAbs(forceValues));
  const momentScale = Math.max(1, maxAbs(momentValues), forceScale * Math.max(1, wallLength));
  const relative = freeIndices.map(
    (index: number) =>
      Math.abs(residual[index] ?? 0) / (index % 2 === 0 ? forceScale : momentScale),
  );
  return {
    freeResidualInfNorm: maxAbs(freeIndices.map((index) => residual[index] ?? 0)),
    relativeFreeResidualInfNorm: maxAbs(relative),
    forceScale,
    momentScale,
  };
}

function solveTransitionTarget({
  targetFactor,
  initialDisplacements,
  freeIndices,
  wallLength,
  scenario,
  evaluate,
  linearSolver,
}: SolveTransitionTargetInput): TransitionSolution {
  let displacements = [...initialDisplacements];
  let evaluation = evaluate(displacements, targetFactor);
  let lineSearchReductions = 0;
  let metrics: ResidualMetrics | null = null;
  if (freeIndices.length === 0) {
    const residual = evaluation.externalLoad.map(
      (value: number, index: number) => value - (evaluation.internalForce[index] ?? 0),
    );
    return {
      converged: true,
      displacements,
      evaluation,
      iterations: 0,
      lineSearchReductions,
      metrics: residualMetrics({
        residual,
        evaluation,
        freeIndices,
        wallLength,
      }),
    };
  }

  for (let iteration = 1; iteration <= scenario.solver.maxIterations; iteration += 1) {
    const residual = evaluation.externalLoad.map(
      (value: number, index: number) => value - (evaluation.internalForce[index] ?? 0),
    );
    metrics = residualMetrics({
      residual,
      evaluation,
      freeIndices,
      wallLength,
    });
    if (metrics.relativeFreeResidualInfNorm <= scenario.solver.relativeResidualTolerance) {
      return {
        converged: true,
        displacements,
        evaluation,
        iterations: iteration - 1,
        lineSearchReductions,
        metrics,
      };
    }
    const reducedTangent = freeIndices.map((row: number) =>
      freeIndices.map((column: number) => evaluation.tangentStiffness[row]?.[column] ?? 0),
    );
    const reducedResidual = freeIndices.map((index: number) => residual[index] ?? 0);
    let correction;
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
        evaluation,
        metrics,
      };
    }
    const correctionEquivalent = maxAbs(
      correction.map((value, index) =>
        freeIndices[index]! % 2 === 0 ? value : value * Math.max(1, wallLength),
      ),
    );
    if (correctionEquivalent <= scenario.solver.displacementTolerance) {
      return {
        converged: false,
        reason: "displacement-stagnation",
        iterations: iteration,
        lineSearchReductions,
        displacements,
        evaluation,
        metrics,
      };
    }

    let accepted: AcceptedTransition | null = null;
    for (let reduction = 0; reduction <= scenario.solver.maxLineSearchReductions; reduction += 1) {
      const factor = 0.5 ** reduction;
      const candidate = [...displacements];
      for (let index = 0; index < freeIndices.length; index += 1) {
        const candidateIndex = freeIndices[index]!;
        candidate[candidateIndex] =
          (candidate[candidateIndex] ?? 0) + factor * (correction[index] ?? 0);
      }
      const candidateEvaluation = evaluate(candidate, targetFactor);
      const candidateResidual = candidateEvaluation.externalLoad.map(
        (value: number, index: number) => value - (candidateEvaluation.internalForce[index] ?? 0),
      );
      const candidateMetrics = residualMetrics({
        residual: candidateResidual,
        evaluation: candidateEvaluation,
        freeIndices,
        wallLength,
      });
      if (
        candidateMetrics.relativeFreeResidualInfNorm <
          (metrics?.relativeFreeResidualInfNorm ?? Number.POSITIVE_INFINITY) ||
        candidateMetrics.relativeFreeResidualInfNorm <= scenario.solver.relativeResidualTolerance
      ) {
        accepted = {
          displacements: candidate,
          evaluation: candidateEvaluation,
          metrics: candidateMetrics,
        };
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
        evaluation,
        metrics,
      };
    }
    displacements = accepted.displacements;
    evaluation = accepted.evaluation;

    metrics = accepted.metrics;
  }
  const finalMetrics =
    metrics ??
    residualMetrics({
      residual: evaluation.externalLoad.map(
        (value: number, index: number) => value - (evaluation.internalForce[index] ?? 0),
      ),
      evaluation,
      freeIndices,
      wallLength,
    });
  return {
    converged: false,
    reason: "max-iterations",
    iterations: scenario.solver.maxIterations,
    lineSearchReductions,
    displacements,
    evaluation,
    metrics: finalMetrics,
  };
}

function solveStageTransition({
  groundModel,
  wall,
  scenario,
  previousStage,
  currentStage,
  mesh,
  nodeContributions,
  beamStiffness,
  fixedIndices,
  initialDisplacements,
  supportReferenceDisplacements,
  linearSolver,
}: SolveStageTransitionInput): StageSolution {
  const fixed = new Set(fixedIndices);
  const freeIndices = Array.from(
    { length: initialDisplacements.length },
    (_, index) => index,
  ).filter((index) => !fixed.has(index));
  const evaluate = (
    displacements: NumericVector,
    transitionFactor: number,
  ): TransitionEvaluation => {
    const previous = evaluateConfiguration({
      groundModel,
      wall,
      scenario,
      stage: previousStage,
      mesh,
      nodeContributions,
      displacements,
      supportReferenceDisplacements,
    });
    const current = evaluateConfiguration({
      groundModel,
      wall,
      scenario,
      stage: currentStage,
      mesh,
      nodeContributions,
      displacements,
      supportReferenceDisplacements,
    });
    return {
      ...combineTransition({
        transitionFactor,
        displacements,
        beamStiffness,
        previous,
        current,
      }),
      previous,
      current,
    };
  };
  const baseIncrement = 1 / scenario.solver.incrementsPerStage;
  let increment = baseIncrement;
  let achievedFactor = 0;
  let displacements = [...initialDisplacements];
  let finalEvaluation = evaluate(displacements, 0);
  let cutbacks = 0;
  let totalIterations = 0;
  let totalLineSearchReductions = 0;
  const history: Record<string, unknown>[] = [];
  let failure: TransitionSolution | null = null;

  while (achievedFactor < 1 - TOLERANCE) {
    const target = Math.min(1, achievedFactor + increment);
    const solved = solveTransitionTarget({
      targetFactor: target,
      initialDisplacements: displacements,
      freeIndices,
      wallLength: wall.topElevation - wall.toeElevation,
      scenario,
      evaluate,
      linearSolver,
    });
    totalIterations += solved.iterations;
    totalLineSearchReductions += solved.lineSearchReductions;
    if (!solved.converged) {
      if (increment / 2 < scenario.solver.minimumStageIncrement) {
        failure = solved;
        break;
      }
      increment /= 2;
      cutbacks += 1;
      continue;
    }
    achievedFactor = target;
    displacements = solved.displacements;
    finalEvaluation = solved.evaluation;
    history.push({
      transitionFactor: achievedFactor,
      increment,
      iterations: solved.iterations,
      lineSearchReductions: solved.lineSearchReductions,
      relativeResidualInfNorm: solved.metrics.relativeFreeResidualInfNorm,
      maximumAbsoluteDisplacement: maxAbs(
        mesh.nodes.map((node: MeshNode) => displacements[2 * node.index] ?? 0),
      ),
    });
    if (increment < baseIncrement) {
      increment = Math.min(baseIncrement, 2 * increment);
    }
  }
  return {
    converged: achievedFactor >= 1 - TOLERANCE,
    achievedFactor,
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
            ...(failure.reason == null ? {} : { reason: failure.reason }),
            error: failure.error ?? null,
            iterations: failure.iterations,
            metrics: failure.metrics,
          },
  };
}

function fixedDofIndices(mesh: Mesh, wall: WallModel): number[] {
  const fixed = new Set<number>();
  const headNode = mesh.nodes[0];
  const toeNode = mesh.nodes.at(-1);
  if (headNode == null || toeNode == null) {
    throw new Error("Embedded retaining-wall mesh requires head and toe nodes.");
  }
  const head = headNode.index;
  const toe = toeNode.index;
  if (wall.headCondition.translation === "fixed") fixed.add(2 * head);
  if (wall.headCondition.rotation === "fixed") fixed.add(2 * head + 1);
  if (wall.toeCondition.translation === "fixed") fixed.add(2 * toe);
  if (wall.toeCondition.rotation === "fixed") fixed.add(2 * toe + 1);
  return [...fixed].sort((left, right) => left - right);
}

function sectionSampleDepths(
  element: MeshElement,
  startShear: number,
  lineLoad: LineLoad,
): number[] {
  const length = element.length;
  const gradient = (lineLoad.bottom - lineLoad.top) / length;
  const depths = [0, length];
  if (Math.abs(gradient) <= TOLERANCE) {
    if (Math.abs(lineLoad.top) > TOLERANCE) {
      const shearRoot = -startShear / lineLoad.top;
      if (shearRoot > TOLERANCE && shearRoot < length - TOLERANCE) {
        depths.push(shearRoot);
      }
    }
  } else {
    const discriminant = lineLoad.top ** 2 - 2 * gradient * startShear;
    if (discriminant >= 0) {
      for (const root of [
        (-lineLoad.top - Math.sqrt(discriminant)) / gradient,
        (-lineLoad.top + Math.sqrt(discriminant)) / gradient,
      ]) {
        if (root > TOLERANCE && root < length - TOLERANCE) {
          depths.push(root);
        }
      }
    }
    const loadRoot = -lineLoad.top / gradient;
    if (loadRoot > TOLERANCE && loadRoot < length - TOLERANCE) {
      depths.push(loadRoot);
    }
  }
  return [...new Set(depths)].sort((left, right) => left - right);
}

function elementResponses({
  mesh,
  elementStiffnesses,
  displacements,
  elementExternalLoads,
  elementLineLoads,
}: ElementResponsesInput): ElementResponse[] {
  return mesh.elements.map((element: MeshElement, index: number) => {
    const indices = elementDofIndices(element);
    const localDisplacements = indices.map((dof: number) => displacements[dof] ?? 0);
    const elementStiffness = elementStiffnesses[index];
    const equivalentLoad = elementExternalLoads[index];
    const lineLoad = elementLineLoads[index];
    if (elementStiffness == null || equivalentLoad == null || lineLoad == null) {
      throw new Error(`Embedded retaining-wall element ${element.id} response is unavailable.`);
    }
    const elasticEndForces = matrixVector(elementStiffness, localDisplacements);
    const endForces = elasticEndForces.map(
      (value: number, forceIndex: number) => value - (equivalentLoad[forceIndex] ?? 0),
    );
    const loadGradient = (lineLoad.bottom - lineLoad.top) / element.length;
    const startShear = endForces[0] ?? 0;
    const startMoment = endForces[1] ?? 0;
    const endShear = endForces[2] ?? 0;
    const endMoment = endForces[3] ?? 0;
    const sectionForces = sectionSampleDepths(element, startShear, lineLoad).map((localDepth) => {
      const shearForce =
        startShear + lineLoad.top * localDepth + (loadGradient * localDepth ** 2) / 2;
      const bendingMoment =
        -startMoment +
        startShear * localDepth +
        (lineLoad.top * localDepth ** 2) / 2 +
        (loadGradient * localDepth ** 3) / 6;
      return {
        localDepth,
        depthFromWallHead: mesh.nodes[element.startNodeIndex]!.depthFromWallHead + localDepth,
        elevation: mesh.nodes[element.startNodeIndex]!.elevation - localDepth,
        shearForce,
        bendingMoment,
      };
    });
    return {
      ...element,
      localDisplacements,
      equivalentAssignedPressureLoad: [...equivalentLoad],
      assignedLineLoad: { ...lineLoad },
      endForces: {
        startShear,
        startMoment,
        endShear,
        endMoment,
      },
      sectionForces,
    };
  });
}

type ExtremeProperty = "bendingMoment" | "shearForce" | "displacement";

function selectAbsoluteExtreme(
  values: readonly ExtremeValue[],
  property: ExtremeProperty,
): ExtremeValue | null {
  return values.reduce<ExtremeValue | null>(
    (selected: ExtremeValue | null, value: ExtremeValue) =>
      selected == null || Math.abs(value[property] ?? 0) > Math.abs(selected[property] ?? 0)
        ? value
        : selected,
    null,
  );
}

function momentOfVectorAboutHead(vector: NumericVector, mesh: Mesh): number {
  return mesh.nodes.reduce(
    (sum: number, node: MeshNode) =>
      sum +
      (vector[2 * node.index] ?? 0) * node.depthFromWallHead +
      (vector[2 * node.index + 1] ?? 0),
    0,
  );
}

function translationalSum(vector: NumericVector): number {
  return vector.reduce(
    (sum: number, value: number, index: number) => (index % 2 === 0 ? sum + value : sum),
    0,
  );
}

function buildStageOutput({
  stage,
  stageIndex,
  mesh,
  wall,
  scenario,
  solution,
  beam,
  finalConfiguration,
}: BuildStageOutputInput): StageOutput {
  const nodes = mesh.nodes.map((node) => ({
    ...node,
    displacement: solution.displacements[2 * node.index] ?? 0,
    rotation: solution.displacements[2 * node.index + 1] ?? 0,
    soil: finalConfiguration.soil.nodeResponses[node.index]!,
  }));
  const elements = elementResponses({
    mesh,
    elementStiffnesses: beam.elementStiffnesses,
    displacements: solution.displacements,
    elementExternalLoads: finalConfiguration.external.elementVectors,
    elementLineLoads: finalConfiguration.external.elementLineLoads,
  });
  const sectionForces = elements.flatMap(({ sectionForces: values }) => values);
  const maximumMoment = selectAbsoluteExtreme(sectionForces, "bendingMoment");
  const maximumShear = selectAbsoluteExtreme(sectionForces, "shearForce");
  const maximumDisplacement = selectAbsoluteExtreme(nodes, "displacement");

  const fullInternalForce = matrixVector(beam.stiffness, solution.displacements).map(
    (value: number, index: number) =>
      value +
      (finalConfiguration.soil.internalForce[index] ?? 0) +
      (finalConfiguration.supports.internalForce[index] ?? 0),
  );
  const residualInternalMinusExternal = fullInternalForce.map(
    (value: number, index: number) => value - (finalConfiguration.external.vector[index] ?? 0),
  );
  const constraintReactions = solution.fixedIndices.map((dofIndex) => ({
    dofIndex,
    nodeIndex: Math.floor(dofIndex / 2),
    nodeId: mesh.nodes[Math.floor(dofIndex / 2)]!.id,
    degreeOfFreedom: dofIndex % 2 === 0 ? "translation" : "rotation",
    value: residualInternalMinusExternal[dofIndex] ?? 0,
  }));
  const constraintVector = zeroVector(2 * mesh.nodes.length);
  for (const reaction of constraintReactions) {
    constraintVector[reaction.dofIndex] = reaction.value;
  }
  const actualSoilVector = finalConfiguration.soil.internalForce.map((value) => -value);
  const actualSupportVector = finalConfiguration.supports.internalForce.map((value) => -value);
  const externalVector = finalConfiguration.external.vector;
  const totalExternalForce = translationalSum(externalVector);
  const totalSoilForce = translationalSum(actualSoilVector);
  const totalSupportForce = translationalSum(actualSupportVector);
  const totalConstraintForce = translationalSum(constraintVector);
  const forceResidual =
    totalExternalForce + totalSoilForce + totalSupportForce + totalConstraintForce;
  const externalMoment = momentOfVectorAboutHead(externalVector, mesh);
  const soilMoment = momentOfVectorAboutHead(actualSoilVector, mesh);
  const supportMoment = momentOfVectorAboutHead(actualSupportVector, mesh);
  const constraintMoment = momentOfVectorAboutHead(constraintVector, mesh);
  const momentResidual = externalMoment + soilMoment + supportMoment + constraintMoment;
  const forceScale = Math.max(
    1,
    Math.abs(totalExternalForce),
    Math.abs(totalSoilForce),
    Math.abs(totalSupportForce),
  );
  const momentScale = Math.max(
    1,
    Math.abs(externalMoment),
    Math.abs(soilMoment),
    forceScale * (wall.topElevation - wall.toeElevation),
  );
  const supportChecks: SupportCheck[] = finalConfiguration.supports.responses
    .filter(({ status }) => status !== "inactive")
    .map((response) => ({
      id: `support-${response.supportId}-capacity`,
      supportId: response.supportId,
      status:
        response.capacity == null
          ? "not-analyzed"
          : response.utilizationRatio != null && response.utilizationRatio <= 1 + 1e-10
            ? "ok"
            : "failed",
      demand: Math.abs(response.scalarForce),
      capacity: response.capacity?.maximumForce ?? null,
      utilizationRatio: response.utilizationRatio,
      units: "kN",
    }));
  const extrapolated = nodes.flatMap((node: OutputNode) =>
    SIDES.filter((side) => node.soil[side].extrapolated).map((side) => ({ nodeId: node.id, side })),
  );

  return {
    id: stage.id,
    name: stage.name,
    index: stageIndex,
    status: solution.converged ? "ok" : "failed",
    stageDefinition: structuredClone(stage),
    response: {
      converged: solution.converged,

      achievedTransitionFactor: solution.achievedFactor,
      nodes,
      elements,
      supports: finalConfiguration.supports.responses,
      pressureLoads: finalConfiguration.external.pressureLoadResults,
      nodalActions: finalConfiguration.external.nodalActionResults,
      extrema: {
        maximumAbsoluteDisplacement: maximumDisplacement,
        maximumAbsoluteBendingMoment: maximumMoment,
        maximumAbsoluteShearForce: maximumShear,
      },
      extrapolatedCurveLocations: extrapolated,
    },
    equilibrium: {
      totalExternalForce,
      totalSoilForce,
      totalSupportForce,
      totalConstraintForce,
      forceResidual,
      normalizedForceResidual: Math.abs(forceResidual) / forceScale,
      externalMomentAboutWallHead: externalMoment,
      soilMomentAboutWallHead: soilMoment,
      supportMomentAboutWallHead: supportMoment,
      constraintMomentAboutWallHead: constraintMoment,
      momentResidual,
      normalizedMomentResidual: Math.abs(momentResidual) / momentScale,
      maximumFreeDofResidual: maxAbs(
        solution.freeIndices.map((index) => residualInternalMinusExternal[index] ?? 0),
      ),
      constraintReactions,
    },
    convergence: {
      strategy: scenario.solver.strategy,
      converged: solution.converged,
      achievedTransitionFactor: solution.achievedFactor,
      acceptedIncrements: solution.history.length,
      cutbacks: solution.cutbacks,
      totalIterations: solution.totalIterations,
      totalLineSearchReductions: solution.totalLineSearchReductions,
      history: solution.history,
      failure: solution.failure,
    },
    checks: supportChecks,
    utilizationRatio: supportChecks.reduce<number | null>(
      (maximum: number | null, check: SupportCheck) =>
        check.utilizationRatio == null ? maximum : Math.max(maximum ?? 0, check.utilizationRatio),
      null,
    ),
  };
}

function validateInput({ groundModel, designSituation, wall, scenario }: ValidateInput): void {
  const isSeismicSituation =
    designSituation.seismic.model !== "none" || designSituation.situationType === "seismic";
  const isPseudostaticScenario = scenario.loadingCondition === "pseudostatic";
  if (isSeismicSituation !== isPseudostaticScenario) {
    throw new EmbeddedWallNotSupportedError(
      "Design situation and embedded-wall loading condition must both be static or both be pseudostatic.",
    );
  }
  for (const side of SIDES) {
    const definition = scenario.soilResponse.sides[side];
    const profile = groundModel.getProfile(definition.profileId);
    if (profile == null) {
      throw new Error(`Unknown GroundModel profile: ${definition.profileId}.`);
    }
    if (profile.bottomElevation >= wall.toeElevation - TOLERANCE) {
      throw new Error(`${side}-side GroundProfile must extend below the wall toe.`);
    }
    for (const [layerId, curve] of Object.entries(definition.curvesByLayer)) {
      const layer = profile.layers.find(({ id }) => id === layerId);
      if (!layer) {
        throw new Error(`${side}-side curves reference unknown layer ${layerId}.`);
      }
      const topDepth = profile.groundSurfaceElevation - layer.topElevation;
      const bottomDepth = profile.groundSurfaceElevation - layer.bottomElevation;
      for (const station of curve.stations) {
        if (station.depth < topDepth - TOLERANCE || station.depth > bottomDepth + TOLERANCE) {
          throw new Error(
            `${side}-side station depth ${station.depth} lies outside layer ${layerId}.`,
          );
        }
      }
    }
    if (definition.defaultPorePressureFieldId != null) {
      getPorePressureFieldById(groundModel, definition.defaultPorePressureFieldId);
    }
    for (const stage of scenario.stages) {
      const stageElevation = groundElevation(stage, side);
      if (
        stageElevation > profile.groundSurfaceElevation + TOLERANCE ||
        stageElevation < profile.bottomElevation - TOLERANCE
      ) {
        throw new Error(
          `${side}-side ground elevation in stage ${stage.id} lies outside profile ${profile.id}.`,
        );
      }
      if (
        Object.hasOwn(stage.porePressureFieldIdBySide, side) &&
        stage.porePressureFieldIdBySide[side] != null
      ) {
        getPorePressureFieldById(groundModel, stage.porePressureFieldIdBySide[side]);
      }
    }
  }
  for (const support of scenario.supports) {
    if (
      support.elevation > wall.topElevation + TOLERANCE ||
      support.elevation < wall.toeElevation - TOLERANCE
    ) {
      throw new Error(`Support ${support.id} lies outside the wall.`);
    }
  }
  for (const stage of scenario.stages) {
    for (const action of stage.nodalActions) {
      if (
        action.elevation > wall.topElevation + TOLERANCE ||
        action.elevation < wall.toeElevation - TOLERANCE
      ) {
        throw new Error(`Nodal action ${action.id} lies outside the wall.`);
      }
    }
  }
}

function activateNewSupports({
  previousStage,
  currentStage,
  scenario,
  mesh,
  displacements,
  references,
}: ActivateNewSupportsInput): void {
  const previouslyActive = new Set(previousStage?.activeSupportIds ?? []);
  const currentlyActive = new Set(currentStage.activeSupportIds);
  for (const support of scenario.supports) {
    if (currentlyActive.has(support.id) && !previouslyActive.has(support.id)) {
      const nodeIndex = findNodeIndexAtElevation(mesh, support.elevation, `Support ${support.id}`);
      references.set(support.id, displacements[2 * nodeIndex] ?? 0);
    }
  }
}

function buildOutputs({
  groundModel,
  designSituation,
  wall,
  scenario,
  mesh,
  stageOutputs,
}: BuildOutputsInput): EmbeddedRetainingWallOutputs {
  const finalStage = stageOutputs.at(-1);
  const allMoments = stageOutputs.map((stage) => ({
    stageId: stage.id,
    ...stage.response.extrema.maximumAbsoluteBendingMoment,
  }));
  const allShears = stageOutputs.map((stage) => ({
    stageId: stage.id,
    ...stage.response.extrema.maximumAbsoluteShearForce,
  }));
  const allDisplacements = stageOutputs.map((stage) => ({
    stageId: stage.id,
    ...stage.response.extrema.maximumAbsoluteDisplacement,
  }));
  const maximumMoment = selectAbsoluteExtreme(allMoments, "bendingMoment");
  const maximumShear = selectAbsoluteExtreme(allShears, "shearForce");
  const maximumDisplacement = selectAbsoluteExtreme(allDisplacements, "displacement");
  const checks = stageOutputs.flatMap((stage) =>
    stage.checks.map((check) => ({
      ...check,
      stageId: stage.id,
    })),
  );
  const utilizationRatio = checks.reduce<number | null>(
    (maximum: number | null, check: SupportCheck & { stageId: string }) =>
      check.utilizationRatio == null ? maximum : Math.max(maximum ?? 0, check.utilizationRatio),
    null,
  );
  return {
    schemaVersion: EMBEDDED_RETAINING_WALL_RESULT_SCHEMA_VERSION,
    groundModelId: groundModel.id,

    designSituationId: designSituation.id,
    wall: wall.toJSON(),
    scenario: scenario.toJSON(),
    mesh: {
      model: scenario.discretization.model,
      nodeCount: mesh.nodes.length,
      elementCount: mesh.elements.length,
      maxElementLength: scenario.discretization.maxElementLength,
      nodes: mesh.nodes.map((node) => ({ ...node })),
      elements: mesh.elements.map((element) => ({ ...element })),
    },
    stages: stageOutputs,
    finalStage,
    demand: {
      maximumAbsoluteDisplacement: maximumDisplacement,
      maximumAbsoluteBendingMoment: maximumMoment,
      maximumAbsoluteShearForce: maximumShear,
      supportForces: stageOutputs.flatMap((stage) =>
        stage.response.supports
          .filter(({ status }) => status !== "inactive")
          .map((support) => ({
            stageId: stage.id,
            supportId: support.supportId,
            force: support.scalarForce,
          })),
      ),
    },
    capacity: {
      wallStructuralResistance: null,
      supportCapacities: scenario.supports.map((support) => ({
        supportId: support.id,
        capacity: structuredClone(support.capacity),
      })),
    },
    checks,
    utilizationRatio,
    structuralCoupling: {
      level: "staged-reduced-order-soil-structure-interaction",
      responseMode: {
        status: stageOutputs.every(({ status }) => status === "ok") ? "available" : "failed",
        wallId: wall.id,
        analysisWidth: wall.analysisWidth,
        stages: stageOutputs.map((stage) => ({
          stageId: stage.id,
          nodalState: stage.response.nodes.map((node) => ({
            nodeId: node.id,
            elevation: node.elevation,
            displacement: node.displacement,
            rotation: node.rotation,
            retainedSoilForceOnWall: node.soil.retained.totalForceOnWall,
            excavationSoilForceOnWall: node.soil.excavation.totalForceOnWall,
            retainedTangentStiffness: node.soil.retained.tangentStiffness,
            excavationTangentStiffness: node.soil.excavation.tangentStiffness,
          })),
          supportState: stage.response.supports,
        })),
      },
      actionEffects: {
        maximumBendingMoment: maximumMoment,
        maximumShearForce: maximumShear,
      },
      structuralVerification: {
        status: "not-analyzed",
        reason:
          "Wall and support resistances require material-specific structural verifiers consuming these action effects.",
      },
      continuumBridge: {
        status: "reduced-order-model",
        wallElements: "Euler-Bernoulli-beam-strip",
        soilInterfaces: "independent-memoryless-effective-pressure-displacement-springs",
        constructionStages: "deterministic-sequence",
      },
    },
  };
}

export class EmbeddedRetainingWallAnalysis {
  readonly linearSolver: DenseLinearSolver;

  constructor({
    linearSolver = new DenseLinearSolver(),
  }: EmbeddedRetainingWallAnalysisOptions = {}) {
    this.linearSolver = linearSolver;
  }

  analyze({
    groundModel: groundModelInput,
    designSituation: designSituationInput,
    wall: wallInput,
    scenario: scenarioInput,
    units = null,
  }: EmbeddedRetainingWallAnalysisInput = {}): EmbeddedRetainingWallAnalysisResult {
    try {
      assertExplicitUnitSystem(units, "EmbeddedRetainingWallAnalysis");
      const groundModel = normalizeGroundModel(groundModelInput, units);
      const designSituation = normalizeDesignSituation(designSituationInput, groundModel, units);
      designSituation.validateAgainst(groundModel);
      const wall = normalizeWall(wallInput, units);
      const scenario = normalizeScenario(scenarioInput, units);
      validateInput({ groundModel, designSituation, wall, scenario });
      const mesh = buildMesh({ groundModel, wall, scenario });
      const beam = assembleBeam(mesh);
      const nodeContributions = buildNodeContributions(mesh);
      const fixedIndices = fixedDofIndices(mesh, wall);
      let displacements = zeroVector(2 * mesh.nodes.length);
      let previousStage: WallScenarioStage | null = null;
      const supportReferenceDisplacements = new Map<string, number>();
      const stageOutputs: StageOutput[] = [];
      for (let index = 0; index < scenario.stages.length; index += 1) {
        const currentStage = scenario.stages[index]!;
        activateNewSupports({
          previousStage,
          currentStage,
          scenario,
          mesh,
          displacements,
          references: supportReferenceDisplacements,
        });
        const solution = solveStageTransition({
          groundModel,
          wall,
          scenario,
          previousStage,
          currentStage,
          mesh,
          nodeContributions,
          beamStiffness: beam.stiffness,
          fixedIndices,
          initialDisplacements: displacements,
          supportReferenceDisplacements,
          linearSolver: this.linearSolver,
        });
        const finalConfiguration = evaluateConfiguration({
          groundModel,
          wall,
          scenario,
          stage: currentStage,
          mesh,
          nodeContributions,
          displacements: solution.displacements,
          supportReferenceDisplacements,
        });
        stageOutputs.push(
          buildStageOutput({
            stage: currentStage,
            stageIndex: index,
            mesh,
            wall,
            scenario,
            solution,
            beam,
            finalConfiguration,
          }),
        );
        displacements = solution.displacements;
        if (!solution.converged) break;
        previousStage = currentStage;
      }
      const outputs = buildOutputs({
        groundModel,
        designSituation,
        wall,
        scenario,
        mesh,
        stageOutputs,
      });
      const converged =
        stageOutputs.length === scenario.stages.length &&
        stageOutputs.every(({ status }) => status === "ok");
      const failedCheck = outputs.checks.some(({ status }) => status === "failed");
      const status = !converged ? "failed" : failedCheck ? "not-verified" : "ok";
      const extrapolationCount = stageOutputs.reduce(
        (sum, stage) => sum + stage.response.extrapolatedCurveLocations.length,
        0,
      );
      return result({
        status,

        summary: !converged
          ? "Embedded retaining-wall analysis stopped before the final construction stage."
          : failedCheck
            ? "Embedded retaining-wall response completed, but an assigned support capacity was exceeded."
            : "Staged embedded retaining-wall analysis completed.",
        outputs,
        warnings: [
          ...(extrapolationCount > 0
            ? [
                "One or more wall-soil laws were evaluated outside their assigned displacement range; inspect each stage extrapolatedCurveLocations.",
              ]
            : []),
          "Assigned pressure-displacement curves are project inputs; parameter selection, calibration and sensitivity remain the designer's responsibility.",
          "The analysis does not perform an automatic mesh-convergence study.",
          "Ground-anchor design is available through geotechnical-ground-anchors; wall/waler structural resistance and global stability remain separate consuming workflows.",
          "Basal heave, piping and hydraulic uplift are outside the selected embedded-wall application scope and are not analyzed.",
          ...(scenario.loadingCondition === "pseudostatic"
            ? [
                "Pseudostatic pressure diagrams are assigned loads; wall inertia and dynamic or cyclic soil response are not generated automatically.",
              ]
            : []),
        ],
        assumptions: [
          "The wall is vertical and represented by an Euler-Bernoulli beam strip with assigned piecewise-constant EI.",
          "Each side is represented by independent effective-pressure versus closure springs lumped by tributary element length.",
          "Pore pressure is evaluated independently from the selected PorePressureField2D and added to effective soil pressure.",
          "Stages interpolate deterministically between complete preceding and current configurations.",
          "New supports are installed at the displacement reached before their activation; assigned prestress is then applied during the stage transition.",
          "Soil reaction laws are memoryless envelopes without hysteresis, stress history or permanent deformation.",
        ],
        metadata: {
          references: [...EMBEDDED_RETAINING_WALL_REFERENCES],
          sourceUrls: [...SOURCE_URLS],
          designSituation: designSituation.toJSON(),
          units: {
            force: "kN",
            length: "m",
            pressure: "kN/m2",
            moment: "kN.m",
            flexuralRigidity: "kN.m2",
            supportStiffness: "kN/m",
            wallSoilTangentModulus: "kN/m3",
          },
        },
      });
    } catch (error: unknown) {
      const notSupported = error instanceof EmbeddedWallNotSupportedError;
      const message = errorMessage(error);
      return result({
        status: notSupported ? "not-supported" : "failed",
        summary: notSupported ? message : "Embedded retaining-wall analysis failed.",
        warnings: notSupported ? [] : [message],
        metadata: { errorName: error instanceof Error ? error.name : "Error" },
      });
    }
  }
}
