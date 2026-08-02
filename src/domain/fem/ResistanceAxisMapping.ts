// Mechanical TypeScript migration from strutture-js 6f33baead8b88166c4b2cf94af41763412e3c751.
/**
 * Explicit, solver-neutral transformations from FEM result axes to the
 * resistance axes used by a structural verification.
 *
 * A transformation is a proper orthogonal 3x3 matrix. Rows contain the
 * resistance axes expressed in the source FEM coordinate system. The same
 * transformation is applied to force and moment vectors; no component is
 * defaulted, enveloped or rescaled.
 */

import type {
  ConcurrentFemJointActionState,
  ResistanceAxisMappingBase,
  ResistanceAxisMatrix,
  ResistanceAxisSourceCoordinateSystem,
  ResistanceAxisValidationOptions,
  ResistanceJointActionState,
  ResistanceLineActionState,
  ResistanceLineActionStateInput,
  ResistanceMappedFoundation,
  ResistanceMappedMember,
  ResistanceMappedSlab,
  ResistanceMappedWall,
  ResistanceSectionCutState,
  ResistanceSectionCutStateInput,
  ResistanceShellResultantState,
  ResistanceShellResultantStateInput,
  ResistanceSupportReactionState,
  ResistanceSupportReactionStateInput,
  ResistanceSupportAxisMappingWithFoundation,
} from "./FemDemandStateTypes.js";
import type { FemAxes, FemVector3 } from "./contracts/FemContractTypes.js";

const MATRIX_TOLERANCE = 1e-9;

const IDENTITY_AXIS_X: ResistanceAxisMatrix[0] = Object.freeze([1, 0, 0]);
const IDENTITY_AXIS_Y: ResistanceAxisMatrix[1] = Object.freeze([0, 1, 0]);
const IDENTITY_AXIS_Z: ResistanceAxisMatrix[2] = Object.freeze([0, 0, 1]);
export const IDENTITY_RESISTANCE_AXIS_TRANSFORMATION: ResistanceAxisMatrix = Object.freeze([
  IDENTITY_AXIS_X,
  IDENTITY_AXIS_Y,
  IDENTITY_AXIS_Z,
]);

function clone<T>(value: T): T {
  return value == null ? value : (JSON.parse(JSON.stringify(value)) as T);
}

function isArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

function finiteVector(values: unknown, label: string): ResistanceAxisMatrix[0] {
  if (!isArray(values)) {
    throw new Error(`${label} must contain exactly three finite components.`);
  }
  if (values.length !== 3 || values.some((value) => !Number.isFinite(value))) {
    throw new Error(`${label} must contain exactly three finite components.`);
  }
  const [first, second, third] = values;
  if (typeof first !== "number" || typeof second !== "number" || typeof third !== "number") {
    throw new Error(`${label} must contain exactly three finite components.`);
  }
  return [first, second, third];
}

function dot(left: ResistanceAxisMatrix[0], right: ResistanceAxisMatrix[0]): number {
  return left[0] * right[0] + left[1] * right[1] + left[2] * right[2];
}

function determinant3(matrix: ResistanceAxisMatrix): number {
  return (
    matrix[0][0] * (matrix[1][1] * matrix[2][2] - matrix[1][2] * matrix[2][1]) -
    matrix[0][1] * (matrix[1][0] * matrix[2][2] - matrix[1][2] * matrix[2][0]) +
    matrix[0][2] * (matrix[1][0] * matrix[2][1] - matrix[1][1] * matrix[2][0])
  );
}

function multiply(
  matrix: ResistanceAxisMatrix,
  vector: ResistanceAxisMatrix[0],
): ResistanceAxisMatrix[0] {
  return [dot(matrix[0], vector), dot(matrix[1], vector), dot(matrix[2], vector)];
}

function globalAxis(localAxes: FemAxes, coefficients: ResistanceAxisMatrix[0]): FemVector3 {
  const axes = [localAxes.x, localAxes.y, localAxes.z] as const;
  if (
    axes.some(
      (axis) =>
        axis == null ||
        !Number.isFinite(axis.x) ||
        !Number.isFinite(axis.y) ||
        !Number.isFinite(axis.z),
    )
  ) {
    throw new Error("Source localAxes must contain finite x, y and z unit vectors.");
  }
  return {
    x: coefficients[0] * axes[0].x + coefficients[1] * axes[1].x + coefficients[2] * axes[2].x,
    y: coefficients[0] * axes[0].y + coefficients[1] * axes[1].y + coefficients[2] * axes[2].y,
    z: coefficients[0] * axes[0].z + coefficients[1] * axes[1].z + coefficients[2] * axes[2].z,
  };
}

export function validateResistanceAxisTransformation(
  sourceToResistance: unknown,
  { tolerance = MATRIX_TOLERANCE }: ResistanceAxisValidationOptions = {},
): ResistanceAxisMatrix {
  if (!Array.isArray(sourceToResistance) || sourceToResistance.length !== 3) {
    throw new Error("sourceToResistance must be a finite 3x3 transformation matrix.");
  }
  const matrix = sourceToResistance.map((row: unknown, index: number) =>
    finiteVector(row, `sourceToResistance[${index}]`),
  ) as unknown as ResistanceAxisMatrix;

  for (let row = 0; row < 3; row += 1) {
    for (let column = 0; column < 3; column += 1) {
      const expected = row === column ? 1 : 0;
      if (Math.abs(dot(matrix[row]!, matrix[column]!) - expected) > tolerance) {
        throw new Error("sourceToResistance must be orthonormal within the declared tolerance.");
      }
    }
  }
  const determinant = determinant3(matrix);
  if (Math.abs(determinant - 1) > tolerance) {
    throw new Error("sourceToResistance must be right-handed with determinant +1.");
  }
  return matrix;
}

type ResistanceAxisMappingIdKey =
  | "lineElementId"
  | "sectionCutId"
  | "shellElementId"
  | "supportNodeId";

type ValidatedResistanceAxisMapping<K extends ResistanceAxisMappingIdKey> = {
  readonly [key: string]: unknown;
  readonly sourceCoordinateSystem: ResistanceAxisSourceCoordinateSystem;
  readonly resistanceCoordinateSystemId: string;
  readonly localAxes?: FemAxes | null;
  sourceToResistance: ResistanceAxisMatrix;
} & Record<K, string>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function validatedMapping<K extends ResistanceAxisMappingIdKey>(
  mapping: unknown,
  expectedSource: ResistanceAxisSourceCoordinateSystem,
  sourceIdKey: K,
): ValidatedResistanceAxisMapping<K> {
  if (mapping == null || typeof mapping !== "object" || isArray(mapping)) {
    throw new Error("A resistance-axis mapping record is required.");
  }
  if (!isRecord(mapping)) {
    throw new Error("A resistance-axis mapping record is required.");
  }
  const sourceId = mapping[sourceIdKey];
  if (typeof sourceId !== "string" || sourceId.length === 0) {
    throw new Error(`${sourceIdKey} is required by the axis mapping.`);
  }
  if (mapping.sourceCoordinateSystem !== expectedSource) {
    throw new Error(`sourceCoordinateSystem must be "${expectedSource}".`);
  }
  if (
    typeof mapping.resistanceCoordinateSystemId !== "string" ||
    mapping.resistanceCoordinateSystemId.length === 0
  ) {
    throw new Error("resistanceCoordinateSystemId is required.");
  }
  return {
    ...clone(mapping),
    sourceToResistance: validateResistanceAxisTransformation(mapping.sourceToResistance),
  } as ValidatedResistanceAxisMapping<K>;
}

function assertCoordinateSystem(
  state: { readonly coordinateSystem?: string | null },
  mapping: ResistanceAxisMappingBase,
): void {
  if (state.coordinateSystem !== mapping.sourceCoordinateSystem) {
    throw new Error(
      `FEM state coordinateSystem "${state.coordinateSystem}" does not match ` +
        `the declared source "${mapping.sourceCoordinateSystem}".`,
    );
  }
}

function resistanceAxes(
  localAxes: FemAxes | null | undefined,
  matrix: ResistanceAxisMatrix,
): FemAxes | null {
  if (!localAxes) return null;
  return {
    x: globalAxis(localAxes, matrix[0]),
    y: globalAxis(localAxes, matrix[1]),
    z: globalAxis(localAxes, matrix[2]),
  };
}

export function validateSurfaceResistanceAxisTransformation(
  sourceToResistance: unknown,
  { tolerance = MATRIX_TOLERANCE }: ResistanceAxisValidationOptions = {},
): ResistanceAxisMatrix {
  const matrix = validateResistanceAxisTransformation(sourceToResistance, { tolerance });
  const outOfPlaneTerms = [
    matrix[0][2],
    matrix[1][2],
    matrix[2][0],
    matrix[2][1],
    matrix[2][2] - 1,
  ];
  if (outOfPlaneTerms.some((value) => Math.abs(value) > tolerance)) {
    throw new Error("A shell-resultant mapping must preserve the positive surface normal.");
  }
  return matrix;
}

interface PlaneTensor {
  readonly xx: number;
  readonly yy: number;
  readonly xy: number;
}

function rotatePlaneTensor(
  matrix: ResistanceAxisMatrix,
  xx: unknown,
  yy: unknown,
  xy: unknown,
  label: string,
): PlaneTensor {
  const q00 = matrix[0][0];
  const q01 = matrix[0][1];
  const q10 = matrix[1][0];
  const q11 = matrix[1][1];
  const [sourceXx, sourceYy, sourceXy] = finiteVector([xx, yy, xy], label);
  return {
    xx: q00 ** 2 * sourceXx + 2 * q00 * q01 * sourceXy + q01 ** 2 * sourceYy,
    yy: q10 ** 2 * sourceXx + 2 * q10 * q11 * sourceXy + q11 ** 2 * sourceYy,
    xy: q00 * q10 * sourceXx + (q00 * q11 + q01 * q10) * sourceXy + q01 * q11 * sourceYy,
  };
}

export function projectLineActionStateToResistanceAxes(input: {
  readonly state: ResistanceLineActionStateInput;
  readonly mapping: unknown;
}): ResistanceLineActionState {
  const { state, mapping } = input;
  if (state == null || typeof state !== "object") {
    throw new Error("A concurrent line-action state is required.");
  }
  const axisMapping = validatedMapping(mapping, "element-local", "lineElementId");
  if (state.lineElementId !== axisMapping.lineElementId) {
    throw new Error(
      `Axis mapping for ${axisMapping.lineElementId} cannot project state ` +
        `for ${state.lineElementId}.`,
    );
  }
  assertCoordinateSystem(state, axisMapping);
  const force = multiply(
    axisMapping.sourceToResistance,
    finiteVector(
      [state.actions?.N, state.actions?.Vy, state.actions?.Vz],
      "line action force vector",
    ),
  );
  const moment = multiply(
    axisMapping.sourceToResistance,
    finiteVector(
      [state.actions?.T, state.actions?.My, state.actions?.Mz],
      "line action moment vector",
    ),
  );

  return {
    ...clone(state),
    resistanceCoordinateSystem: {
      id: axisMapping.resistanceCoordinateSystemId,
      sourceCoordinateSystem: axisMapping.sourceCoordinateSystem,
      sourceToResistance: clone(axisMapping.sourceToResistance),
      axes: resistanceAxes(state.localAxes, axisMapping.sourceToResistance),
    },
    resistanceActions: {
      axialForce: force[0],
      shearY: force[1],
      shearZ: force[2],
      torsion: moment[0],
      momentY: moment[1],
      momentZ: moment[2],
    },
  };
}

function mappingIndex(
  mappings: unknown,
  idKey: ResistanceAxisMappingIdKey,
  label: string,
): Map<string, ResistanceAxisMappingBase> {
  if (!isArray(mappings)) {
    throw new Error(`${label} must be an array.`);
  }
  const index = new Map<string, ResistanceAxisMappingBase>();
  mappings.forEach((mapping: unknown, itemIndex: number) => {
    const record = isRecord(mapping) ? mapping : null;
    const id = record?.[idKey];
    if (record === null || typeof id !== "string" || id.length === 0) {
      throw new Error(`${label}[${itemIndex}].${idKey} is required.`);
    }
    if (index.has(id)) {
      throw new Error(`${label} maps ${id} more than once.`);
    }
    index.set(id, record as ResistanceAxisMappingBase);
  });
  return index;
}

export function projectMemberActionStatesToResistanceAxes(input: {
  readonly member: ResistanceMappedMember;
  readonly states: readonly ResistanceLineActionStateInput[];
}): ResistanceLineActionState[] {
  const { member, states } = input;
  if (!member || !isArray(member.lineElementIds)) {
    throw new Error("A mapped structural member is required.");
  }
  if (!isArray(states)) {
    throw new Error("Concurrent member action states must be an array.");
  }
  const mappings = mappingIndex(
    member.lineActionMappings,
    "lineElementId",
    "member.lineActionMappings",
  );
  for (const lineElementId of member.lineElementIds) {
    if (!mappings.has(lineElementId)) {
      throw new Error(`Member ${member.id} has no resistance-axis mapping for ${lineElementId}.`);
    }
  }
  for (const lineElementId of mappings.keys()) {
    if (!member.lineElementIds.includes(lineElementId)) {
      throw new Error(
        `Member ${member.id} axis mapping references unassigned element ${lineElementId}.`,
      );
    }
  }
  return states.map((state) =>
    projectLineActionStateToResistanceAxes({
      state,
      mapping: mappings.get(state.lineElementId),
    }),
  );
}

export function projectJointActionStatesToResistanceAxes(input: {
  readonly members: readonly ResistanceMappedMember[];
  readonly states: readonly ConcurrentFemJointActionState[];
}): ResistanceJointActionState[] {
  const { members, states } = input;
  if (!isArray(members) || !isArray(states)) {
    throw new Error("Mapped members and concurrent joint states are required.");
  }
  const allMappings = members.flatMap((member) => member.lineActionMappings ?? []);
  const mappings = mappingIndex(allMappings, "lineElementId", "members.lineActionMappings");

  return states.map((state) => ({
    ...clone(state),
    elementEnds: (state.elementEnds ?? []).map(
      (elementEnd: ConcurrentFemJointActionState["elementEnds"][number]) => {
        const mapping = mappings.get(elementEnd.lineElementId);
        if (!mapping) {
          throw new Error(
            `No resistance-axis mapping exists for joint element ` + `${elementEnd.lineElementId}.`,
          );
        }
        if (!elementEnd.station) {
          return { ...clone(elementEnd), resistanceActions: null };
        }
        const projected = projectLineActionStateToResistanceAxes({
          state: {
            lineElementId: elementEnd.lineElementId,
            coordinateSystem: elementEnd.coordinateSystem,
            localAxes: mapping.localAxes ?? null,
            actions: elementEnd.station.actions,
          },
          mapping,
        });
        return {
          ...clone(elementEnd),
          resistanceCoordinateSystem: projected.resistanceCoordinateSystem,
          resistanceActions: projected.resistanceActions,
        };
      },
    ),
  }));
}

export function projectSectionCutStateToResistanceAxes(input: {
  readonly state: ResistanceSectionCutStateInput;
  readonly mapping: unknown;
}): ResistanceSectionCutState {
  const { state, mapping } = input;
  if (state == null || typeof state !== "object") {
    throw new Error("A concurrent section-cut state is required.");
  }
  const axisMapping = validatedMapping(mapping, "section-cut-local", "sectionCutId");
  if (state.sectionCutId !== axisMapping.sectionCutId) {
    throw new Error(
      `Axis mapping for ${axisMapping.sectionCutId} cannot project state ` +
        `for ${state.sectionCutId}.`,
    );
  }
  assertCoordinateSystem(state, axisMapping);
  const force = multiply(
    axisMapping.sourceToResistance,
    finiteVector(
      [state.resultants?.Fx, state.resultants?.Fy, state.resultants?.Fz],
      "section-cut force vector",
    ),
  );
  const moment = multiply(
    axisMapping.sourceToResistance,
    finiteVector(
      [state.resultants?.Mx, state.resultants?.My, state.resultants?.Mz],
      "section-cut moment vector",
    ),
  );

  return {
    ...clone(state),
    resistanceCoordinateSystem: {
      id: axisMapping.resistanceCoordinateSystemId,
      sourceCoordinateSystem: axisMapping.sourceCoordinateSystem,
      sourceToResistance: clone(axisMapping.sourceToResistance),
    },
    resistanceResultants: {
      forceX: force[0],
      forceY: force[1],
      axialForce: force[2],
      momentX: moment[0],
      momentY: moment[1],
      torsion: moment[2],
    },
  };
}

export function projectWallSectionCutStatesToResistanceAxes(input: {
  readonly wall: ResistanceMappedWall;
  readonly states: readonly ResistanceSectionCutStateInput[];
}): ResistanceSectionCutState[] {
  const { wall, states } = input;
  if (!wall || !isArray(wall.sectionCutIds)) {
    throw new Error("A mapped structural wall is required.");
  }
  if (!isArray(states)) {
    throw new Error("Concurrent section-cut states must be an array.");
  }
  const mappings = mappingIndex(
    wall.sectionCutActionMappings,
    "sectionCutId",
    "wall.sectionCutActionMappings",
  );
  for (const sectionCutId of wall.sectionCutIds) {
    if (!mappings.has(sectionCutId)) {
      throw new Error(`Wall ${wall.id} has no resistance-axis mapping for ${sectionCutId}.`);
    }
  }
  for (const sectionCutId of mappings.keys()) {
    if (!wall.sectionCutIds.includes(sectionCutId)) {
      throw new Error(`Wall ${wall.id} axis mapping references unassigned cut ${sectionCutId}.`);
    }
  }
  return states.map((state) =>
    projectSectionCutStateToResistanceAxes({
      state,
      mapping: mappings.get(state.sectionCutId),
    }),
  );
}

export function projectShellResultantStateToResistanceAxes(input: {
  readonly state: ResistanceShellResultantStateInput;
  readonly mapping: unknown;
}): ResistanceShellResultantState {
  const { state, mapping } = input;
  if (state == null || typeof state !== "object") {
    throw new Error("A concurrent shell-resultant state is required.");
  }
  const axisMapping = validatedMapping(mapping, "element-local", "shellElementId");
  axisMapping.sourceToResistance = validateSurfaceResistanceAxisTransformation(
    axisMapping.sourceToResistance,
  );
  if (state.shellElementId !== axisMapping.shellElementId) {
    throw new Error(
      `Axis mapping for ${axisMapping.shellElementId} cannot project state ` +
        `for ${state.shellElementId}.`,
    );
  }
  assertCoordinateSystem(state, axisMapping);
  const membrane = rotatePlaneTensor(
    axisMapping.sourceToResistance,
    state.components?.Nx,
    state.components?.Ny,
    state.components?.Nxy,
    "shell membrane resultant tensor",
  );
  const bending = rotatePlaneTensor(
    axisMapping.sourceToResistance,
    state.components?.Mx,
    state.components?.My,
    state.components?.Mxy,
    "shell bending resultant tensor",
  );
  const shear = multiply(
    axisMapping.sourceToResistance,
    finiteVector([state.components?.Vx, state.components?.Vy, 0], "shell transverse shear vector"),
  );
  return {
    ...clone(state),
    resistanceCoordinateSystem: {
      id: axisMapping.resistanceCoordinateSystemId,
      sourceCoordinateSystem: axisMapping.sourceCoordinateSystem,
      sourceToResistance: clone(axisMapping.sourceToResistance),
      axes: resistanceAxes(state.localAxes, axisMapping.sourceToResistance),
    },
    resistanceResultants: {
      Nx: membrane.xx,
      Ny: membrane.yy,
      Nxy: membrane.xy,
      Mx: bending.xx,
      My: bending.yy,
      Mxy: bending.xy,
      Vx: shear[0],
      Vy: shear[1],
    },
  };
}

export function projectSlabResultantStatesToResistanceAxes(input: {
  readonly slab: ResistanceMappedSlab;
  readonly states: readonly ResistanceShellResultantStateInput[];
}): ResistanceShellResultantState[] {
  const { slab, states } = input;
  if (!slab || !isArray(slab.shellElementIds)) {
    throw new Error("A mapped structural slab is required.");
  }
  if (!isArray(states)) {
    throw new Error("Concurrent shell-resultant states must be an array.");
  }
  const mappings = mappingIndex(
    slab.shellResultantMappings,
    "shellElementId",
    "slab.shellResultantMappings",
  );
  for (const shellElementId of slab.shellElementIds) {
    if (!mappings.has(shellElementId)) {
      throw new Error(`Slab ${slab.id} has no resistance-axis mapping for ` + `${shellElementId}.`);
    }
  }
  return states.map((state) =>
    projectShellResultantStateToResistanceAxes({
      state,
      mapping: mappings.get(state.shellElementId),
    }),
  );
}

export function projectSupportReactionStateToResistanceAxes(input: {
  readonly state: ResistanceSupportReactionStateInput;
  readonly mapping: unknown;
}): ResistanceSupportReactionState {
  const { state, mapping } = input;
  if (state == null || typeof state !== "object") {
    throw new Error("A concurrent support-reaction state is required.");
  }
  const axisMapping = validatedMapping(mapping, "global", "supportNodeId");
  if (state.nodeId !== axisMapping.supportNodeId) {
    throw new Error(
      `Axis mapping for support node ${axisMapping.supportNodeId} cannot ` +
        `project reaction at ${state.nodeId}.`,
    );
  }
  assertCoordinateSystem(state, axisMapping);
  const force = multiply(
    axisMapping.sourceToResistance,
    finiteVector(
      [state.forces?.x, state.forces?.y, state.forces?.z],
      "support reaction force vector",
    ),
  );
  const moment = multiply(
    axisMapping.sourceToResistance,
    finiteVector(
      [state.moments?.x, state.moments?.y, state.moments?.z],
      "support reaction moment vector",
    ),
  );
  const supportMapping = mapping as ResistanceSupportAxisMappingWithFoundation;
  return {
    ...clone(state),
    foundationId: supportMapping.foundationId ?? null,
    resistanceCoordinateSystem: {
      id: axisMapping.resistanceCoordinateSystemId,
      sourceCoordinateSystem: axisMapping.sourceCoordinateSystem,
      sourceToResistance: clone(axisMapping.sourceToResistance),
    },
    resistanceReaction: {
      forceX: force[0],
      forceY: force[1],
      forceZ: force[2],
      momentX: moment[0],
      momentY: moment[1],
      momentZ: moment[2],
    },
  };
}

export function projectFoundationReactionStatesToResistanceAxes(input: {
  readonly foundation: ResistanceMappedFoundation;
  readonly states: readonly ResistanceSupportReactionStateInput[];
}): ResistanceSupportReactionState[] {
  const { foundation, states } = input;
  if (!foundation || !isArray(foundation.supportNodeIds)) {
    throw new Error("A mapped foundation is required.");
  }
  if (!isArray(states)) {
    throw new Error("Concurrent support-reaction states must be an array.");
  }
  const mappings = mappingIndex(
    foundation.supportReactionMappings,
    "supportNodeId",
    "foundation.supportReactionMappings",
  );
  for (const supportNodeId of foundation.supportNodeIds) {
    if (!mappings.has(supportNodeId)) {
      throw new Error(
        `Foundation ${foundation.id} has no resistance-axis mapping for ` + `${supportNodeId}.`,
      );
    }
  }
  return states.map((state) =>
    projectSupportReactionStateToResistanceAxes({
      state,
      mapping: {
        ...mappings.get(state.nodeId),
        foundationId: foundation.id,
      },
    }),
  );
}
