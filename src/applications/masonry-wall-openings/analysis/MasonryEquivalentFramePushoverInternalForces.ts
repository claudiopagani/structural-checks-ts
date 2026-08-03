import { DenseLinearSolver } from "../../../domain/math/DenseLinearSolver.js";
import type { DofNodeLike, DofRegistry } from "../../../domain/fem/DofRegistry.js";
import {
  createZeroMatrix,
  createZeroVector,
  type NumericMatrix,
  type NumericVector,
} from "../../../domain/math/arrayLinearAlgebra.js";
import { createUnitResolver, type UnitSystemInput } from "../../../domain/units/UnitSystem.js";

type JsonRecord = Record<string, unknown>;
type HingePosition = "start" | "end" | "shear";
type CapacityKind = "moment" | "force";

interface HingeState {
  start: unknown;
  end: unknown;
  shear: unknown;
  history: unknown[];
}

interface SteelHingeState {
  start: unknown;
  end: unknown;
  history: unknown[];
}

interface ContributorState {
  kind?: string;
  failed?: boolean;
  hingeState: HingeState | SteelHingeState;
}

interface Capacity {
  kind: CapacityKind;
  value: number;
}

type CapacitiesByPosition = Record<HingePosition, Capacity | null>;

export interface MasonryEquivalentFrameContributorDefinition {
  pierId: string;
  wallId: string | null | undefined;
  topRotation: string;
  governingFamily: unknown;
  governingMode: unknown;
  failureDisplacement: number;
  capacitiesByPosition: CapacitiesByPosition;
}

interface ContributorMechanics {
  flexural?: { MRd?: number };
  bedJointSliding?: { V?: number };
  diagonalCracking?: { V?: number };
}

export interface MasonryEquivalentFrameContributorPier {
  id: string;
  wallId?: string | null;
  governingFamily?: unknown;
  governingMode?: unknown;
  ultimateDisplacement: number;
  mechanics?: ContributorMechanics;
}

export interface MasonryEquivalentFrameContributorAlignment {
  units?: UnitSystemInput | null;
}

export interface CreateMasonryEquivalentFrameContributorDefinitionInput {
  alignment: MasonryEquivalentFrameContributorAlignment;
  pier: MasonryEquivalentFrameContributorPier;
  topRotation?: string;
}

interface SteelEvaluationInput {
  globalDisplacements: NumericVector;
  dofRegistry: DofRegistry;
  hingeState: SteelHingeState;
  yieldTolerance: number;
}

interface SteelEvaluationResponse {
  globalEndForces: NumericVector;
  tangentGlobalStiffness: NumericMatrix;
  hingeState?: unknown;
  newActivations: JsonRecord[];
  localEndForces: NumericVector;
  plasticRotations: NumericVector;
}

interface FrameElement {
  id: string;
  type?: string;
  metadata?: JsonRecord;
  startNode: string | DofNodeLike;
  endNode: string | DofNodeLike;
  localStiffness: () => NumericMatrix;
  localDisplacements: (displacements: NumericVector, dofRegistry: DofRegistry) => NumericVector;
  transformationMatrix: () => NumericMatrix;
  getDofIds: (dofRegistry: DofRegistry) => string[];
  evaluate?: (input: SteelEvaluationInput) => SteelEvaluationResponse;
  plasticMomentCapacity?: (position: unknown) => number;
}

export interface MasonryEquivalentFramePushoverFrame {
  dofRegistry: DofRegistry;
  elements?: readonly FrameElement[];
}

export interface MasonryEquivalentFramePushoverInternalForcesOptions {
  contributorsByElementId?: Record<string, MasonryEquivalentFrameContributorDefinition>;
}

export interface MasonryEquivalentFramePushoverInternalForcesEvaluateInput {
  frame?: MasonryEquivalentFramePushoverFrame;
  model?: MasonryEquivalentFramePushoverFrame;
  displacements?: NumericVector;
  state?: unknown;
  yieldTolerance?: number;
}

export interface MasonryEquivalentFramePushoverInternalForcesEvaluation {
  internalForceVector: NumericVector;
  tangentStiffnessMatrix: NumericMatrix;
  state: Record<string, ContributorState>;
  events: JsonRecord[];
  responses: JsonRecord[];
  hingeStatesByElementId: Record<string, ContributorState>;
  hingeEvents: JsonRecord[];
  elementResponses: JsonRecord[];
  [key: string]: unknown;
}

interface ElementEvaluation {
  internalForceVector: NumericVector;
  tangentStiffnessMatrix: NumericMatrix;
  state: ContributorState | null;
  events: JsonRecord[];
  response: JsonRecord;
}

interface PlasticGeneralizedDofDefinition {
  id: HingePosition;
  hVector: NumericVector;
  capacityKind: CapacityKind;
  physicalForce: (localEndForces: NumericVector) => number;
  prescribedGeneralizedForce: (sign: unknown, capacity: number) => number;
}

type ActivationEvent = JsonRecord & {
  position: HingePosition;
  sign: unknown;
};

const FEM_UNITS: UnitSystemInput = Object.freeze({ force: "kN", length: "m" });
const EPS = 1e-9;
const NUMERICAL_RESIDUAL_STIFFNESS_RATIO = 1e-9;
const HINGE_POSITIONS: readonly HingePosition[] = ["start", "end", "shear"];

const PLASTIC_GENERALIZED_DOF_DEFINITIONS: Readonly<
  Record<HingePosition, PlasticGeneralizedDofDefinition>
> = Object.freeze({
  start: Object.freeze({
    id: "start",
    hVector: [0, 0, -1, 0, 0, 0],
    capacityKind: "moment",
    physicalForce(localEndForces: NumericVector): number {
      return localEndForces[2] ?? 0;
    },
    prescribedGeneralizedForce(sign: unknown, capacity: number): number {
      return sign === "negative" ? capacity : -capacity;
    },
  }),
  end: Object.freeze({
    id: "end",
    hVector: [0, 0, 0, 0, 0, -1],
    capacityKind: "moment",
    physicalForce(localEndForces: NumericVector): number {
      return localEndForces[5] ?? 0;
    },
    prescribedGeneralizedForce(sign: unknown, capacity: number): number {
      return sign === "negative" ? capacity : -capacity;
    },
  }),
  shear: Object.freeze({
    id: "shear",
    hVector: [0, -0.5, 0, 0, 0.5, 0],
    capacityKind: "force",
    physicalForce(localEndForces: NumericVector): number {
      return -0.5 * (localEndForces[1] ?? 0) + 0.5 * (localEndForces[4] ?? 0);
    },
    prescribedGeneralizedForce(sign: unknown, capacity: number): number {
      return sign === "negative" ? -capacity : capacity;
    },
  }),
});

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isUnknownArray(value: unknown): value is readonly unknown[] {
  return Array.isArray(value);
}

function cloneUnknownArray(value: unknown): unknown[] {
  return isUnknownArray(value) ? [...value] : [];
}

function toMetadataString(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
    return String(value);
  }

  return "";
}

function transpose(matrix: NumericMatrix): NumericMatrix {
  const firstRow = matrix[0] ?? [];
  return firstRow.map((_, column) => matrix.map((row) => row[column] ?? 0));
}

function multiplyMatrices(left: NumericMatrix, right: NumericMatrix): NumericMatrix {
  if (left.length === 0 || right.length === 0) {
    return createZeroMatrix(left.length);
  }

  return left.map(
    (leftRow) =>
      right[0]?.map((_, column) =>
        leftRow.reduce((sum, value, index) => sum + value * (right[index]?.[column] ?? 0), 0),
      ) ?? [],
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

function scalarMatrix(scalar: number, matrix: NumericMatrix): NumericMatrix {
  return matrix.map((row) => row.map((value) => scalar * value));
}

function addVectors(left: NumericVector, right: NumericVector): NumericVector {
  return left.map((value, index) => value + (right[index] ?? 0));
}

function subtractVectors(left: NumericVector, right: NumericVector): NumericVector {
  return left.map((value, index) => value - (right[index] ?? 0));
}

function invertDenseMatrix(matrix: NumericMatrix): NumericMatrix {
  if (!Array.isArray(matrix) || matrix.length === 0 || matrix.length !== matrix[0]?.length) {
    throw new Error("Masonry equivalent-frame pushover requires a square dense matrix.");
  }

  const solver = new DenseLinearSolver();
  const size = matrix.length;
  const inverse = createZeroMatrix(size);

  for (let column = 0; column < size; column += 1) {
    const unitVector = new Array<number>(size).fill(0);
    unitVector[column] = 1;
    const solution = solver.solve(matrix, unitVector);

    for (let row = 0; row < size; row += 1) {
      const inverseRow = inverse[row];
      if (inverseRow !== undefined) {
        inverseRow[column] = solution[row] ?? 0;
      }
    }
  }

  return inverse;
}

function signLabel(value: unknown): "positive" | "negative" {
  if (typeof value !== "number" || !Number.isFinite(value) || value >= 0) {
    return "positive";
  }

  return "negative";
}

function cloneHingeState(state: unknown = null): HingeState {
  const record = isRecord(state) ? state : null;
  return {
    start: record?.start ?? null,
    end: record?.end ?? null,
    shear: record?.shear ?? null,
    history: cloneUnknownArray(record?.history),
  };
}

function activeHingeCount(state: HingeState | null = null): number {
  return Number(state?.start != null) + Number(state?.end != null) + Number(state?.shear != null);
}

function cloneSteelHingeState(state: unknown = null): SteelHingeState {
  const record = isRecord(state) ? state : null;
  const hingeState = isRecord(record?.hingeState) ? record.hingeState : record;

  return {
    start: hingeState?.start ?? null,
    end: hingeState?.end ?? null,
    history: cloneUnknownArray(hingeState?.history),
  };
}

function activeSteelHingeCount(state: unknown = null): number {
  const record = isRecord(state) ? state : null;
  const hingeState = isRecord(record?.hingeState) ? record.hingeState : record;

  return Number(hingeState?.start != null) + Number(hingeState?.end != null);
}

function cloneContributorState(state: unknown = null): ContributorState {
  const record = isRecord(state) ? state : null;

  if (record?.kind === "steel-ring-frame") {
    return {
      kind: "steel-ring-frame",
      hingeState: cloneSteelHingeState(state),
    };
  }

  return {
    failed: Boolean(record?.failed),
    hingeState: cloneHingeState(record?.hingeState),
  };
}

function withActivation(
  state: HingeState | null,
  position: HingePosition,
  sign: "positive" | "negative",
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
): ActivationEvent[] {
  const events: ActivationEvent[] = [];

  for (const position of HINGE_POSITIONS) {
    if (previousState?.[position] == null && nextState[position] != null) {
      events.push({ position, sign: nextState[position] });
    }
  }

  return events;
}

function minPositive(values: readonly unknown[] = []): number | null {
  const finitePositiveValues = values.filter(
    (value): value is number => typeof value === "number" && Number.isFinite(value) && value > EPS,
  );

  return finitePositiveValues.length > 0 ? Math.min(...finitePositiveValues) : null;
}

function postFailureDisplacement(displacement: number): number {
  return displacement + Math.max(displacement * 1e-6, 1e-6);
}

function activePositions(
  state: HingeState,
  capacitiesByPosition: CapacitiesByPosition,
): HingePosition[] {
  return HINGE_POSITIONS.filter(
    (position) =>
      state[position] != null &&
      Number.isFinite(capacitiesByPosition[position]?.value) &&
      (capacitiesByPosition[position]?.value ?? 0) > EPS,
  );
}

function responseForState(
  element: FrameElement,
  localDisplacements: NumericVector,
  state: HingeState,
  capacitiesByPosition: CapacitiesByPosition,
): {
  localEndForces: NumericVector;
  tangentLocalStiffness: NumericMatrix;
  plasticGeneralizedDisplacements: NumericVector;
} {
  const localElasticStiffness = element.localStiffness();
  const positions = activePositions(state, capacitiesByPosition);

  if (positions.length === 0) {
    return {
      localEndForces: multiplyMatrixVector(localElasticStiffness, localDisplacements),
      tangentLocalStiffness: localElasticStiffness,
      plasticGeneralizedDisplacements: [],
    };
  }

  const h = Array.from({ length: 6 }, () => new Array<number>(positions.length).fill(0));

  positions.forEach((position, columnIndex) => {
    const vector = PLASTIC_GENERALIZED_DOF_DEFINITIONS[position].hVector;

    for (let rowIndex = 0; rowIndex < 6; rowIndex += 1) {
      const hRow = h[rowIndex];
      if (hRow !== undefined) {
        hRow[columnIndex] = vector[rowIndex] ?? 0;
      }
    }
  });

  const ht = transpose(h);
  const kaa = multiplyMatrices(ht, multiplyMatrices(localElasticStiffness, h));
  const inverseKaa = invertDenseMatrix(kaa);
  const elasticGeneralizedForces = multiplyMatrixVector(
    ht,
    multiplyMatrixVector(localElasticStiffness, localDisplacements),
  );
  const prescribedGeneralizedForces = positions.map((position) =>
    PLASTIC_GENERALIZED_DOF_DEFINITIONS[position].prescribedGeneralizedForce(
      state[position],
      capacitiesByPosition[position]?.value ?? 0,
    ),
  );
  const plasticGeneralizedDisplacements = multiplyMatrixVector(
    inverseKaa,
    subtractVectors(prescribedGeneralizedForces, elasticGeneralizedForces),
  );
  const localElasticDisplacements = addVectors(
    localDisplacements,
    multiplyMatrixVector(h, plasticGeneralizedDisplacements),
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
    plasticGeneralizedDisplacements,
  };
}

function activateMissingMechanisms(
  localEndForces: NumericVector,
  state: HingeState,
  capacitiesByPosition: CapacitiesByPosition,
  yieldTolerance: number,
  elementId: string,
  contributor: MasonryEquivalentFrameContributorDefinition,
): HingeState {
  let updatedState = cloneHingeState(state);

  for (const position of HINGE_POSITIONS) {
    if (updatedState[position] != null) {
      continue;
    }

    const capacity = capacitiesByPosition[position]?.value;

    if (typeof capacity !== "number" || !Number.isFinite(capacity) || capacity <= EPS) {
      continue;
    }

    const definition = PLASTIC_GENERALIZED_DOF_DEFINITIONS[position];
    const physicalForce = definition.physicalForce(localEndForces);
    const activationThreshold = capacity * (1 - Math.max(0, yieldTolerance ?? 1e-9));

    if (Math.abs(physicalForce) >= activationThreshold) {
      updatedState = withActivation(updatedState, position, signLabel(physicalForce), {
        elementId,
        pierId: contributor.pierId,
        wallId: contributor.wallId,
        capacityKind: definition.capacityKind,
        physicalCapacity: capacity,
        trialForce: physicalForce,
      });
    }
  }

  return updatedState;
}

function absolutePierTopDisplacement(
  frame: MasonryEquivalentFramePushoverFrame,
  element: FrameElement,
  displacements: NumericVector,
): number {
  const topIndex = frame.dofRegistry.getIndex(element.endNode, "ux");
  const baseIndex = frame.dofRegistry.getIndex(element.startNode, "ux");

  return Math.abs((displacements[topIndex] ?? 0) - (displacements[baseIndex] ?? 0));
}

function baseShearFromGlobalEndForces(
  frame: MasonryEquivalentFramePushoverFrame,
  element: FrameElement,
  globalEndForces: NumericVector,
): number {
  const dofIds = element.getDofIds(frame.dofRegistry);
  const baseUxIndex = dofIds.findIndex(
    (dofId) => dofId === frame.dofRegistry.getDofId(element.startNode, "ux"),
  );

  return baseUxIndex >= 0 ? Math.abs(globalEndForces[baseUxIndex] ?? 0) : 0;
}

function assembleElementResponse({
  frame,
  element,
  localEndForces,
  tangentLocalStiffness,
}: {
  frame: MasonryEquivalentFramePushoverFrame;
  element: FrameElement;
  localEndForces: NumericVector;
  tangentLocalStiffness: NumericMatrix;
}): {
  internalForceVector: NumericVector;
  tangentStiffnessMatrix: NumericMatrix;
  globalEndForces: NumericVector;
} {
  const transformation = element.transformationMatrix();
  const tangentGlobalStiffness = multiplyMatrices(
    transpose(transformation),
    multiplyMatrices(tangentLocalStiffness, transformation),
  );
  const globalEndForces = multiplyMatrixVector(transpose(transformation), localEndForces);
  const dofIds = element.getDofIds(frame.dofRegistry);
  const indices = dofIds.map((dofId) => frame.dofRegistry.getIndex(dofId));
  const internalForceVector = createZeroVector(frame.dofRegistry.size());
  const tangentStiffnessMatrix = createZeroMatrix(frame.dofRegistry.size());

  for (let localRow = 0; localRow < indices.length; localRow += 1) {
    const globalRow = indices[localRow] ?? 0;

    internalForceVector[globalRow] =
      (internalForceVector[globalRow] ?? 0) + (globalEndForces[localRow] ?? 0);

    for (let localColumn = 0; localColumn < indices.length; localColumn += 1) {
      const globalColumn = indices[localColumn] ?? 0;

      const tangentRow = tangentStiffnessMatrix[globalRow];
      if (tangentRow !== undefined) {
        tangentRow[globalColumn] =
          (tangentRow[globalColumn] ?? 0) + (tangentGlobalStiffness[localRow]?.[localColumn] ?? 0);
      }
    }
  }

  return {
    internalForceVector,
    tangentStiffnessMatrix,
    globalEndForces,
  };
}

function evaluateContributor({
  frame,
  element,
  displacements,
  contributor,
  state = null,
  yieldTolerance = 1e-9,
}: {
  frame: MasonryEquivalentFramePushoverFrame;
  element: FrameElement;
  displacements: NumericVector;
  contributor: MasonryEquivalentFrameContributorDefinition;
  state?: unknown;
  yieldTolerance?: number;
}): ElementEvaluation {
  const previous = cloneContributorState(state);
  const topDisplacement = absolutePierTopDisplacement(frame, element, displacements);

  if (previous.failed || topDisplacement >= contributor.failureDisplacement) {
    const nextState: ContributorState = {
      ...cloneContributorState(previous),
      failed: true,
    };
    const localDisplacements = element.localDisplacements(displacements, frame.dofRegistry);
    const residualLocalStiffness = scalarMatrix(
      NUMERICAL_RESIDUAL_STIFFNESS_RATIO,
      element.localStiffness(),
    );
    const residualLocalEndForces = multiplyMatrixVector(residualLocalStiffness, localDisplacements);
    const assembled = assembleElementResponse({
      frame,
      element,
      localEndForces: residualLocalEndForces,
      tangentLocalStiffness: residualLocalStiffness,
    });

    return {
      internalForceVector: assembled.internalForceVector,
      tangentStiffnessMatrix: assembled.tangentStiffnessMatrix,
      state: nextState,
      events: previous.failed
        ? []
        : [
            {
              type: "pier-failure",
              elementId: element.id,
              pierId: contributor.pierId,
              wallId: contributor.wallId,
              failureMode: contributor.governingMode,
            },
          ],
      response: {
        elementId: element.id,
        pierId: contributor.pierId,
        wallId: contributor.wallId,
        governingMode: contributor.governingMode,
        mechanismModel: "equivalent-frame-hinges-and-shear-plateau",
        baseShear: 0,
        failed: true,
        hingeCount: activeHingeCount(
          isRecord(previous.hingeState) ? cloneHingeState(previous.hingeState) : null,
        ),
        hingeState: cloneHingeState(previous.hingeState),
      },
    };
  }

  const localDisplacements = element.localDisplacements(displacements, frame.dofRegistry);
  let trialHingeState = cloneHingeState(previous.hingeState);
  let response: ReturnType<typeof responseForState> | null = null;

  for (let iteration = 0; iteration < 4; iteration += 1) {
    response = responseForState(
      element,
      localDisplacements,
      trialHingeState,
      contributor.capacitiesByPosition,
    );
    const updatedState = activateMissingMechanisms(
      response.localEndForces,
      trialHingeState,
      contributor.capacitiesByPosition,
      yieldTolerance,
      element.id,
      contributor,
    );

    if (
      updatedState.start === trialHingeState.start &&
      updatedState.end === trialHingeState.end &&
      updatedState.shear === trialHingeState.shear
    ) {
      break;
    }

    trialHingeState = updatedState;
  }

  if (response === null) {
    throw new Error("Masonry equivalent-frame pushover did not evaluate the contributor.");
  }

  const assembled = assembleElementResponse({
    frame,
    element,
    localEndForces: response.localEndForces,
    tangentLocalStiffness: response.tangentLocalStiffness,
  });

  const nextState: ContributorState = {
    failed: false,
    hingeState: cloneHingeState(trialHingeState),
  };

  return {
    internalForceVector: assembled.internalForceVector,
    tangentStiffnessMatrix: assembled.tangentStiffnessMatrix,
    state: nextState,
    events: activationDelta(
      isRecord(previous.hingeState) ? cloneHingeState(previous.hingeState) : null,
      trialHingeState,
    ).map((event) => ({
      ...event,
      type: "plastic-hinge-activation",
      elementId: element.id,
      pierId: contributor.pierId,
      wallId: contributor.wallId,
      capacityKind: PLASTIC_GENERALIZED_DOF_DEFINITIONS[event.position].capacityKind,
      plasticCapacity: contributor.capacitiesByPosition[event.position]?.value ?? null,
    })),
    response: {
      elementId: element.id,
      pierId: contributor.pierId,
      wallId: contributor.wallId,
      governingMode: contributor.governingMode,
      mechanismModel: "equivalent-frame-hinges-and-shear-plateau",
      baseShear: baseShearFromGlobalEndForces(frame, element, assembled.globalEndForces),
      failed: false,
      hingeCount: activeHingeCount(trialHingeState),
      hingeState: cloneHingeState(trialHingeState),
      localEndForces: [...response.localEndForces],
      globalEndForces: [...assembled.globalEndForces],
      plasticGeneralizedDisplacements: [...response.plasticGeneralizedDisplacements],
    },
  };
}

function isElasticFrameElement(element: FrameElement): boolean {
  return toMetadataString(element.metadata?.role).trim().toLowerCase() === "spandrel";
}

interface SteelPlasticHingeFrameElement extends FrameElement {
  evaluate: (input: SteelEvaluationInput) => SteelEvaluationResponse;
  plasticMomentCapacity: (position: unknown) => number;
}

function isSteelPlasticHingeFrameElement(
  element: FrameElement,
): element is SteelPlasticHingeFrameElement {
  return element.type === "steel-frame-2d-plastic-hinge" && typeof element.evaluate === "function";
}

function evaluateElasticElement({
  frame,
  element,
  displacements,
}: {
  frame: MasonryEquivalentFramePushoverFrame;
  element: FrameElement;
  displacements: NumericVector;
}): ElementEvaluation {
  const localDisplacements = element.localDisplacements(displacements, frame.dofRegistry);
  const localStiffness = element.localStiffness();
  const localEndForces = multiplyMatrixVector(localStiffness, localDisplacements);
  const assembled = assembleElementResponse({
    frame,
    element,
    localEndForces,
    tangentLocalStiffness: localStiffness,
  });

  return {
    internalForceVector: assembled.internalForceVector,
    tangentStiffnessMatrix: assembled.tangentStiffnessMatrix,
    state: null,
    events: [],
    response: {
      elementId: element.id,
      elementRole: element.metadata?.role ?? "elastic",
      sourceSpandrelId: element.metadata?.sourceSpandrelId ?? null,
      mechanismModel: "linear-elastic",
      failed: false,
      hingeCount: 0,
      localEndForces: [...localEndForces],
      globalEndForces: [...assembled.globalEndForces],
    },
  };
}

function hasToJSON(value: unknown): value is JsonRecord & { toJSON: () => unknown } {
  return isRecord(value) && typeof value.toJSON === "function";
}

function hingeStateJson(state: unknown): SteelHingeState {
  if (hasToJSON(state)) {
    const serialized = state.toJSON();
    return serialized == null ? cloneSteelHingeState(state) : cloneSteelHingeState(serialized);
  }

  return cloneSteelHingeState(state);
}

function evaluateSteelElement({
  frame,
  element,
  displacements,
  state = null,
  yieldTolerance = 1e-9,
}: {
  frame: MasonryEquivalentFramePushoverFrame;
  element: SteelPlasticHingeFrameElement;
  displacements: NumericVector;
  state?: unknown;
  yieldTolerance?: number;
}): ElementEvaluation {
  const previousState = cloneSteelHingeState(state);
  const response = element.evaluate({
    globalDisplacements: displacements,
    dofRegistry: frame.dofRegistry,
    hingeState: previousState,
    yieldTolerance,
  });
  const dofIds = element.getDofIds(frame.dofRegistry);
  const indices = dofIds.map((dofId) => frame.dofRegistry.getIndex(dofId));
  const internalForceVector = createZeroVector(frame.dofRegistry.size());
  const tangentStiffnessMatrix = createZeroMatrix(frame.dofRegistry.size());

  for (let localRow = 0; localRow < indices.length; localRow += 1) {
    const globalRow = indices[localRow] ?? 0;

    internalForceVector[globalRow] =
      (internalForceVector[globalRow] ?? 0) + (response.globalEndForces[localRow] ?? 0);

    for (let localColumn = 0; localColumn < indices.length; localColumn += 1) {
      const globalColumn = indices[localColumn] ?? 0;

      const tangentRow = tangentStiffnessMatrix[globalRow];
      if (tangentRow !== undefined) {
        tangentRow[globalColumn] =
          (tangentRow[globalColumn] ?? 0) +
          (response.tangentGlobalStiffness[localRow]?.[localColumn] ?? 0);
      }
    }
  }

  const nextHingeState = hingeStateJson(response.hingeState);

  return {
    internalForceVector,
    tangentStiffnessMatrix,
    state: {
      kind: "steel-ring-frame",
      hingeState: nextHingeState,
    },
    events: response.newActivations.map((event) => ({
      ...event,
      type: "plastic-hinge-activation",
      elementId: element.id,
      role: element.metadata?.role ?? null,
      sourceRingFrameId: element.metadata?.sourceRingFrameId ?? null,
      sourceOpeningId: element.metadata?.sourceOpeningId ?? null,
      capacityKind: "moment",
      plasticCapacity: element.plasticMomentCapacity(event.position),
      plasticMoment: element.plasticMomentCapacity(event.position),
    })),
    response: {
      elementId: element.id,
      elementRole: element.metadata?.role ?? "steel-ring-frame",
      sourceRingFrameId: element.metadata?.sourceRingFrameId ?? null,
      sourceOpeningId: element.metadata?.sourceOpeningId ?? null,
      mechanismModel: "steel-frame-plastic-hinges",
      failed: false,
      hingeCount: activeSteelHingeCount(nextHingeState),
      hingeState: cloneSteelHingeState(nextHingeState),
      localEndForces: [...response.localEndForces],
      globalEndForces: [...response.globalEndForces],
      plasticRotations: [...response.plasticRotations],
    },
  };
}

export function createMasonryEquivalentFrameContributorDefinition({
  alignment,
  pier,
  topRotation = "free",
}: CreateMasonryEquivalentFrameContributorDefinitionInput): MasonryEquivalentFrameContributorDefinition {
  const toFem = createUnitResolver(alignment.units, FEM_UNITS);
  const flexuralCapacity = pier.mechanics?.flexural?.MRd;
  const shearCapacity = minPositive([
    pier.mechanics?.bedJointSliding?.V,
    pier.mechanics?.diagonalCracking?.V,
  ]);
  const endFlexuralCapacity = topRotation === "fixed" ? flexuralCapacity : flexuralCapacity;

  return {
    pierId: pier.id,
    wallId: pier.wallId,
    topRotation,
    governingFamily: pier.governingFamily,
    governingMode: pier.governingMode,
    failureDisplacement: postFailureDisplacement(toFem.length(pier.ultimateDisplacement)),
    capacitiesByPosition: {
      start:
        typeof flexuralCapacity === "number" &&
        Number.isFinite(flexuralCapacity) &&
        flexuralCapacity > EPS
          ? { kind: "moment", value: toFem.moment(flexuralCapacity) }
          : null,
      end:
        typeof endFlexuralCapacity === "number" &&
        Number.isFinite(endFlexuralCapacity) &&
        endFlexuralCapacity > EPS
          ? { kind: "moment", value: toFem.moment(endFlexuralCapacity) }
          : null,
      shear: shearCapacity !== null ? { kind: "force", value: toFem.force(shearCapacity) } : null,
    },
  };
}

export class MasonryEquivalentFramePushoverInternalForces {
  readonly contributorsByElementId: Record<string, MasonryEquivalentFrameContributorDefinition>;

  constructor({
    contributorsByElementId = {},
  }: MasonryEquivalentFramePushoverInternalForcesOptions = {}) {
    this.contributorsByElementId = contributorsByElementId;
  }

  evaluate({
    frame,
    model,
    displacements,
    state = {},
    yieldTolerance = 1e-9,
  }: MasonryEquivalentFramePushoverInternalForcesEvaluateInput = {}): MasonryEquivalentFramePushoverInternalForcesEvaluation {
    const resolvedFrame = model ?? frame;
    const size = resolvedFrame?.dofRegistry?.size?.();

    if (typeof size !== "number" || !Number.isFinite(size) || size <= 0) {
      throw new Error(
        "MasonryEquivalentFramePushoverInternalForces requires a frame with a populated dofRegistry.",
      );
    }

    if (resolvedFrame === undefined) {
      throw new Error(
        "MasonryEquivalentFramePushoverInternalForces requires a frame with a populated dofRegistry.",
      );
    }

    if (!Array.isArray(displacements) || displacements.length !== size) {
      throw new Error(
        "MasonryEquivalentFramePushoverInternalForces requires a displacement vector matching the frame DOF count.",
      );
    }

    const internalForceVector = createZeroVector(size);
    const tangentStiffnessMatrix = createZeroMatrix(size);
    const updatedStates: Record<string, ContributorState> = {};
    const events: JsonRecord[] = [];
    const responses: JsonRecord[] = [];

    const stateByElementId = isRecord(state) ? state : {};

    for (const element of resolvedFrame.elements ?? []) {
      const contributor = this.contributorsByElementId[element.id];

      if (
        !contributor &&
        !isElasticFrameElement(element) &&
        !isSteelPlasticHingeFrameElement(element)
      ) {
        continue;
      }

      const evaluation = contributor
        ? evaluateContributor({
            frame: resolvedFrame,
            element,
            displacements,
            contributor,
            state: stateByElementId[element.id],
            yieldTolerance,
          })
        : isSteelPlasticHingeFrameElement(element)
          ? evaluateSteelElement({
              frame: resolvedFrame,
              element,
              displacements,
              state: stateByElementId[element.id],
              yieldTolerance,
            })
          : evaluateElasticElement({
              frame: resolvedFrame,
              element,
              displacements,
            });

      if (evaluation.state != null) {
        updatedStates[element.id] = evaluation.state;
      }
      events.push(...evaluation.events);
      responses.push(evaluation.response);

      for (let row = 0; row < size; row += 1) {
        internalForceVector[row] =
          (internalForceVector[row] ?? 0) + (evaluation.internalForceVector[row] ?? 0);

        for (let column = 0; column < size; column += 1) {
          const tangentRow = tangentStiffnessMatrix[row];
          if (tangentRow !== undefined) {
            tangentRow[column] =
              (tangentRow[column] ?? 0) + (evaluation.tangentStiffnessMatrix[row]?.[column] ?? 0);
          }
        }
      }
    }

    return {
      internalForceVector,
      tangentStiffnessMatrix,
      state: updatedStates,
      events,
      responses,
      hingeStatesByElementId: updatedStates,
      hingeEvents: events,
      elementResponses: responses,
    };
  }
}
