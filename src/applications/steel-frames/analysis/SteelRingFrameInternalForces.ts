// Mechanical TypeScript migration from strutture-js 6f33baead8b88166c4b2cf94af41763412e3c751; source path: src/applications/steel-frames/analysis/SteelRingFrameInternalForces.js.

import {
  createZeroMatrix,
  createZeroVector,
  type NumericMatrix,
  type NumericVector,
} from "../../../domain/math/arrayLinearAlgebra.js";
import {
  SteelPlasticHingeState,
  type SteelPlasticHingeActivationEvent,
  type SteelPlasticHingeStateJson,
} from "./SteelPlasticHingeState.js";

export interface SteelRingFrameInternalForcesDofRegistryLike {
  size(): number;
  getIndex(dofId: string): number;
}

export interface SteelRingFrameInternalForcesElementResponse {
  hingeState: SteelPlasticHingeState;
  newActivations: readonly SteelPlasticHingeActivationEvent[];
  localEndForces: readonly number[];
  globalEndForces: readonly number[];
  plasticRotations: readonly number[];
  tangentGlobalStiffness: NumericMatrix;
}

export interface SteelRingFrameInternalForcesElementLike {
  readonly id: string;
  readonly metadata?: Record<string, unknown> | null;
  evaluate(options: {
    globalDisplacements: NumericVector;
    dofRegistry: SteelRingFrameInternalForcesDofRegistryLike;
    hingeState: SteelPlasticHingeState;
    yieldTolerance: number;
  }): SteelRingFrameInternalForcesElementResponse;
  getDofIds(dofRegistry: SteelRingFrameInternalForcesDofRegistryLike): readonly string[];
  plasticMomentCapacity(position: string): number;
}

export interface SteelRingFrameInternalForcesFrameLike {
  readonly dofRegistry?: SteelRingFrameInternalForcesDofRegistryLike | null;
  readonly elements: readonly SteelRingFrameInternalForcesElementLike[];
}

export interface SteelRingFrameInternalForcesOptions {
  frame?: SteelRingFrameInternalForcesFrameLike | null;
  model?: SteelRingFrameInternalForcesFrameLike | null;
  displacements?: unknown;
  state?: Record<string, unknown> | null;
  hingeStatesByElementId?: Record<string, unknown>;
  yieldTolerance?: number;
}

export interface SteelRingFrameInternalForcesHingeEvent extends SteelPlasticHingeActivationEvent {
  elementId: string;
  role: unknown;
  plasticMoment: number;
}

export interface SteelRingFrameInternalForcesElementResult {
  elementId: string;
  role: unknown;
  localEndForces: number[];
  globalEndForces: number[];
  plasticRotations: number[];
  hingeState: SteelPlasticHingeStateJson;
}

export interface SteelRingFrameInternalForcesResult {
  internalForceVector: NumericVector;
  tangentStiffnessMatrix: NumericMatrix;
  state: Record<string, SteelPlasticHingeState>;
  events: SteelRingFrameInternalForcesHingeEvent[];
  responses: SteelRingFrameInternalForcesElementResult[];
  hingeStatesByElementId: Record<string, SteelPlasticHingeState>;
  hingeEvents: SteelRingFrameInternalForcesHingeEvent[];
  elementResponses: SteelRingFrameInternalForcesElementResult[];
}

function isNumericVector(value: unknown): value is NumericVector {
  return Array.isArray(value);
}

function normalizeState(stateLike: unknown): SteelPlasticHingeState {
  if (stateLike instanceof SteelPlasticHingeState) {
    return stateLike;
  }

  const candidate: unknown = Reflect.construct(SteelPlasticHingeState, [stateLike]);
  if (!(candidate instanceof SteelPlasticHingeState)) {
    throw new TypeError("SteelRingFrameInternalForces could not create a hinge state.");
  }
  return candidate;
}

export class SteelRingFrameInternalForces {
  evaluate({
    frame,
    model,
    displacements,
    state = undefined,
    hingeStatesByElementId = {},
    yieldTolerance = 1e-9,
  }: SteelRingFrameInternalForcesOptions = {}): SteelRingFrameInternalForcesResult {
    const resolvedFrame = model ?? frame;
    const dofRegistry = resolvedFrame?.dofRegistry;
    const size = dofRegistry?.size?.();

    if (
      resolvedFrame === null ||
      resolvedFrame === undefined ||
      dofRegistry === null ||
      dofRegistry === undefined ||
      size === undefined ||
      !Number.isFinite(size) ||
      size <= 0
    ) {
      throw new Error(
        "SteelRingFrameInternalForces requires a frame with a populated dofRegistry.",
      );
    }

    if (!isNumericVector(displacements) || displacements.length !== size) {
      throw new Error(
        "SteelRingFrameInternalForces requires a displacement vector matching the frame DOF count.",
      );
    }

    const internalForceVector = createZeroVector(size);
    const tangentStiffnessMatrix = createZeroMatrix(size);
    const updatedStates: Record<string, SteelPlasticHingeState> = {};
    const elementResponses: SteelRingFrameInternalForcesElementResult[] = [];
    const hingeEvents: SteelRingFrameInternalForcesHingeEvent[] = [];

    const currentStates =
      state !== null && typeof state === "object" ? state : hingeStatesByElementId;

    for (const element of resolvedFrame.elements) {
      const previousState = normalizeState(currentStates[element.id]);
      const response = element.evaluate({
        globalDisplacements: displacements,
        dofRegistry,
        hingeState: previousState,
        yieldTolerance,
      });
      const dofIds = element.getDofIds(dofRegistry);
      const indices = dofIds.map((dofId) => dofRegistry.getIndex(dofId));

      updatedStates[element.id] = response.hingeState;

      for (let localRow = 0; localRow < indices.length; localRow += 1) {
        const globalRow = indices[localRow];
        if (globalRow === undefined) {
          throw new Error("SteelRingFrameInternalForces received an invalid global DOF index.");
        }

        internalForceVector[globalRow] =
          (internalForceVector[globalRow] ?? 0) + (response.globalEndForces[localRow] ?? 0);

        const tangentRow = tangentStiffnessMatrix[globalRow];
        if (tangentRow === undefined) {
          throw new Error("SteelRingFrameInternalForces received an invalid global DOF index.");
        }

        for (let localColumn = 0; localColumn < indices.length; localColumn += 1) {
          const globalColumn = indices[localColumn];
          if (globalColumn === undefined) {
            throw new Error("SteelRingFrameInternalForces received an invalid global DOF index.");
          }

          tangentRow[globalColumn] =
            (tangentRow[globalColumn] ?? 0) +
            (response.tangentGlobalStiffness[localRow]?.[localColumn] ?? 0);
        }
      }

      hingeEvents.push(
        ...response.newActivations.map((event) => ({
          ...event,
          elementId: element.id,
          role: element.metadata?.role ?? null,
          plasticMoment: element.plasticMomentCapacity(event.position),
        })),
      );

      elementResponses.push({
        elementId: element.id,
        role: element.metadata?.role ?? null,
        localEndForces: [...response.localEndForces],
        globalEndForces: [...response.globalEndForces],
        plasticRotations: [...response.plasticRotations],
        hingeState: response.hingeState.toJSON(),
      });
    }

    return {
      internalForceVector,
      tangentStiffnessMatrix,
      state: updatedStates,
      events: hingeEvents,
      responses: elementResponses,
      hingeStatesByElementId: updatedStates,
      hingeEvents,
      elementResponses,
    };
  }
}
