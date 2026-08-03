// Mechanical TypeScript migration from strutture-js 6f33baead8b88166c4b2cf94af41763412e3c751; source path: src/applications/steel-frames/analysis/SteelPlasticHingeFrameElement2D.js.

import {
  FrameElement2DEulerBernoulli,
  type ElasticFrameCrossSection,
  type ElasticFrameMaterial,
} from "../../../domain/fem/elements/FrameElement2DEulerBernoulli.js";
import {
  createZeroMatrix,
  createZeroVector,
  type NumericMatrix,
  type NumericVector,
} from "../../../domain/math/arrayLinearAlgebra.js";
import type { Node } from "../../../domain/geometry/Node.js";
import { createUnitResolver, type UnitSystem } from "../../../domain/units/UnitSystem.js";
import {
  SteelPlasticHingeState,
  type SteelPlasticHingeActivationEvent,
  type SteelPlasticHingeSign,
  type SteelPlasticHingeStateOptions,
} from "./SteelPlasticHingeState.js";
import type { DofRegistry } from "../../../domain/fem/DofRegistry.js";

type HingePosition = "start" | "end";
type SectionProperty =
  | "inertiaY"
  | "inertiaZ"
  | "elasticSectionModulusY"
  | "elasticSectionModulusZ"
  | "plasticSectionModulusY"
  | "plasticSectionModulusZ";

type FrameNodeLike = Pick<Node, "id" | "x" | "y" | "units">;

export interface SteelPlasticHingeSectionLike extends ElasticFrameCrossSection {
  profileName?: string | null;
  plasticSectionModulusY?: number | null;
  plasticSectionModulusZ?: number | null;
  elasticSectionModulusY?: number | null;
  elasticSectionModulusZ?: number | null;
  toJSON?: () => unknown;
}

export interface SteelPlasticHingeMaterialLike extends ElasticFrameMaterial {
  fyd?: number | null;
  fyk?: number | null;
  toJSON?: () => unknown;
}

export interface SteelPlasticHingeSectionOrientationInput {
  axis?: unknown;
  inPlaneAxis?: unknown;
  bendingAxis?: unknown;
  label?: unknown;
  rotationDegrees?: number;
  mounting?: unknown;
  openSide?: unknown;
  webSide?: unknown;
}

export interface SteelPlasticHingeSectionOrientation {
  axis: "y" | "z";
  label: unknown;
  rotationDegrees: number;
  mounting: unknown;
  inertiaProperty: "inertiaY" | "inertiaZ";
  elasticSectionModulusProperty: "elasticSectionModulusY" | "elasticSectionModulusZ";
  plasticSectionModulusProperty: "plasticSectionModulusY" | "plasticSectionModulusZ";
}

export interface SteelPlasticHingeFrameElement2DOptions {
  id?: unknown;
  startNode: FrameNodeLike;
  endNode: FrameNodeLike;
  section: SteelPlasticHingeSectionLike | null;
  material: SteelPlasticHingeMaterialLike | null;
  sectionOrientation?: string | SteelPlasticHingeSectionOrientationInput | null;
  axialRigidity?: number | null;
  flexuralRigidity?: number | null;
  plasticMomentStart?: number | null;
  plasticMomentEnd?: number | null;
  metadata?: Record<string, unknown>;
}

export interface SteelPlasticHingeCondensationOperators {
  positions: HingePosition[];
  h: NumericMatrix;
}

export interface SteelPlasticHingeStateResponse {
  hingeState: SteelPlasticHingeState;
  plasticRotations: NumericVector;
  localEndForces: NumericVector;
  localEquivalentForce: NumericVector;
  tangentLocalStiffness: NumericMatrix;
}

export interface SteelPlasticHingeFrameElement2DResponse extends SteelPlasticHingeStateResponse {
  newActivations: SteelPlasticHingeActivationEvent[];
  localDisplacements: NumericVector;
  globalEndForces: NumericVector;
  tangentGlobalStiffness: NumericMatrix;
}

export interface SteelPlasticHingeFrameElement2DEvaluateOptions {
  globalDisplacements?: unknown;
  dofRegistry?: DofRegistry | null;
  hingeState?: SteelPlasticHingeState | SteelPlasticHingeStateOptions;
  yieldTolerance?: number;
}

const ROTATION_INDEX_BY_POSITION: Record<HingePosition, number> = Object.freeze({
  start: 2,
  end: 5,
});
const SECTION_UNITS = Object.freeze({ force: "N", length: "mm" }) satisfies UnitSystem;
const DEFAULT_FEM_UNITS = Object.freeze({ force: "kN", length: "m" }) satisfies UnitSystem;

function stringifySourceValue(value: unknown): string {
  if (typeof value === "object" && value !== null) {
    return value.toString.bind(value)();
  }

  return String(value);
}

function assertPositive(value: unknown, label: string): asserts value is number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new Error(`SteelPlasticHingeFrameElement2D requires a positive ${label}.`);
  }
}

function isNumericVector(value: unknown): value is NumericVector {
  return Array.isArray(value);
}

function transpose(matrix: NumericMatrix): NumericMatrix {
  if (!Array.isArray(matrix) || matrix.length === 0) {
    return [];
  }

  const firstRow = matrix[0] ?? [];
  return firstRow.map((_, column) => matrix.map((row) => row[column] ?? 0));
}

function multiplyMatrices(left: NumericMatrix, right: NumericMatrix): NumericMatrix {
  if (left.length === 0 || right.length === 0) {
    return createZeroMatrix(left.length, right[0]?.length ?? 0);
  }

  const firstRow = right[0] ?? [];
  return left.map((leftRow) =>
    firstRow.map((_, column) =>
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

function matrixValue(matrix: NumericMatrix, row: number, column: number): number {
  const value = matrix[row]?.[column];
  if (value === undefined) {
    throw new Error(
      "SteelPlasticHingeFrameElement2D supports condensation of at most two plastic hinge rotations.",
    );
  }
  return value;
}

function invertSmallDenseMatrix(matrix: NumericMatrix): NumericMatrix {
  const firstRow = matrix[0];
  const secondRow = matrix[1];

  if (matrix.length === 1 && firstRow?.length === 1) {
    const pivot = matrixValue(matrix, 0, 0);
    assertPositive(Math.abs(pivot), "hinge condensation pivot");
    return [[1 / pivot]];
  }

  if (matrix.length !== 2 || firstRow?.length !== 2 || secondRow?.length !== 2) {
    throw new Error(
      "SteelPlasticHingeFrameElement2D supports condensation of at most two plastic hinge rotations.",
    );
  }

  const a = matrixValue(matrix, 0, 0);
  const b = matrixValue(matrix, 0, 1);
  const c = matrixValue(matrix, 1, 0);
  const d = matrixValue(matrix, 1, 1);
  const determinant = a * d - b * c;

  assertPositive(Math.abs(determinant), "hinge condensation determinant");

  return [
    [d / determinant, -b / determinant],
    [-c / determinant, a / determinant],
  ];
}

function signLabel(value: number): Exclude<SteelPlasticHingeSign, null> {
  if (!Number.isFinite(value) || value === 0) {
    return "positive";
  }

  return value >= 0 ? "positive" : "negative";
}

function plasticGeneralizedForce(sign: SteelPlasticHingeSign, plasticMoment: number): number {
  const factor = sign === "negative" ? 1 : -1;

  return factor * plasticMoment;
}

function sectionProperty(
  section: SteelPlasticHingeSectionLike | null,
  property: SectionProperty,
): number | null | undefined {
  if (section === null) {
    return undefined;
  }

  return section[property];
}

function normalizeSectionOrientation(
  sectionOrientation: string | SteelPlasticHingeSectionOrientationInput | null = {},
): SteelPlasticHingeSectionOrientation {
  const orientation = sectionOrientation ?? {};
  const rawAxis =
    typeof orientation === "string"
      ? orientation
      : (orientation.axis ?? orientation.inPlaneAxis ?? orientation.bendingAxis ?? "y");
  const axis = stringifySourceValue(rawAxis).trim().toLowerCase();
  const resolvedAxis = ["z", "weak", "minor", "weak-axis", "minor-axis", "asse-debole"].includes(
    axis,
  )
    ? "z"
    : "y";

  return {
    axis: resolvedAxis,
    label:
      typeof orientation === "string"
        ? resolvedAxis === "z"
          ? "weak-axis-in-plane"
          : "strong-axis-in-plane"
        : (orientation.label ??
          (resolvedAxis === "z" ? "weak-axis-in-plane" : "strong-axis-in-plane")),
    rotationDegrees:
      typeof orientation === "string"
        ? resolvedAxis === "z"
          ? 90
          : 0
        : orientation.rotationDegrees !== undefined && Number.isFinite(orientation.rotationDegrees)
          ? orientation.rotationDegrees
          : resolvedAxis === "z"
            ? 90
            : 0,
    mounting:
      typeof orientation === "string"
        ? null
        : (orientation.mounting ?? orientation.openSide ?? orientation.webSide ?? null),
    inertiaProperty: resolvedAxis === "z" ? "inertiaZ" : "inertiaY",
    elasticSectionModulusProperty:
      resolvedAxis === "z" ? "elasticSectionModulusZ" : "elasticSectionModulusY",
    plasticSectionModulusProperty:
      resolvedAxis === "z" ? "plasticSectionModulusZ" : "plasticSectionModulusY",
  };
}

export class SteelPlasticHingeFrameElement2D {
  id: unknown;
  type = "steel-frame-2d-plastic-hinge";
  startNode: FrameNodeLike;
  endNode: FrameNodeLike;
  nodes: [FrameNodeLike, FrameNodeLike];
  section: SteelPlasticHingeSectionLike | null;
  material: SteelPlasticHingeMaterialLike | null;
  analysisUnits: UnitSystem;
  sectionOrientation: SteelPlasticHingeSectionOrientation;
  metadata: Record<string, unknown>;
  axialRigidity: number;
  flexuralRigidity: number;
  elasticElement: FrameElement2DEulerBernoulli;
  plasticMomentStart: number;
  plasticMomentEnd: number;

  constructor({
    id,
    startNode,
    endNode,
    section,
    material,
    sectionOrientation = null,
    axialRigidity = null,
    flexuralRigidity = null,
    plasticMomentStart = null,
    plasticMomentEnd = null,
    metadata = {},
  }: SteelPlasticHingeFrameElement2DOptions) {
    if (!id) {
      throw new Error("A SteelPlasticHingeFrameElement2D id is required.");
    }

    this.id = id;
    this.startNode = startNode;
    this.endNode = endNode;
    this.nodes = [startNode, endNode];
    this.section = section;
    this.material = material;
    this.analysisUnits = startNode?.units ?? DEFAULT_FEM_UNITS;
    this.sectionOrientation = normalizeSectionOrientation(sectionOrientation);
    this.metadata = { ...metadata };
    this.axialRigidity = axialRigidity ?? this.defaultAxialRigidity();
    this.flexuralRigidity = flexuralRigidity ?? this.defaultFlexuralRigidity();
    this.elasticElement = new FrameElement2DEulerBernoulli({
      id: `${stringifySourceValue(id)}__elastic`,
      startNode,
      endNode,
      crossSection: section,
      material,
      axialRigidity: this.axialRigidity,
      flexuralRigidity: this.flexuralRigidity,
      bendingInertiaAxis: this.sectionOrientation.inertiaProperty,
      metadata,
    });
    this.plasticMomentStart = plasticMomentStart ?? this.defaultPlasticMomentCapacity();
    this.plasticMomentEnd = plasticMomentEnd ?? this.defaultPlasticMomentCapacity();

    assertPositive(this.plasticMomentStart, "plasticMomentStart");
    assertPositive(this.plasticMomentEnd, "plasticMomentEnd");
  }

  defaultPlasticMomentCapacity(): number {
    const property = this.sectionOrientation.plasticSectionModulusProperty;
    const sectionModulus = sectionProperty(this.section, property);
    const designStrength = this.material?.fyd ?? this.material?.fyk;
    const resolver = createUnitResolver(SECTION_UNITS, this.analysisUnits);

    assertPositive(sectionModulus, `section ${property}`);
    assertPositive(designStrength, "material fyd");

    return resolver.moment(sectionModulus * designStrength);
  }

  defaultAxialRigidity(): number {
    const elasticModulus = this.material?.elasticModulus;
    const area = this.section?.area;
    const resolver = createUnitResolver(SECTION_UNITS, this.analysisUnits);

    assertPositive(elasticModulus, "material elasticModulus");
    assertPositive(area, "section area");

    return resolver.force(elasticModulus * area);
  }

  defaultFlexuralRigidity(): number {
    const elasticModulus = this.material?.elasticModulus;
    const property = this.sectionOrientation.inertiaProperty;
    const inertia = sectionProperty(this.section, property);
    const resolver = createUnitResolver(SECTION_UNITS, this.analysisUnits);

    assertPositive(elasticModulus, "material elasticModulus");
    assertPositive(inertia, `section ${property}`);

    return resolver.convert(elasticModulus * inertia, {
      forceExponent: 1,
      lengthExponent: 2,
    });
  }

  plasticMomentCapacity(position: string): number {
    return position === "end" ? this.plasticMomentEnd : this.plasticMomentStart;
  }

  getDofIds(dofRegistry: DofRegistry): string[] {
    return this.elasticElement.getDofIds(dofRegistry);
  }

  transformationMatrix(): NumericMatrix {
    return this.elasticElement.transformationMatrix();
  }

  localElasticStiffness(): NumericMatrix {
    return this.elasticElement.localStiffness();
  }

  localDisplacements(globalDisplacements: NumericVector, dofRegistry: DofRegistry): NumericVector {
    return this.elasticElement.localDisplacements(globalDisplacements, dofRegistry);
  }

  globalElasticStiffness(): NumericMatrix {
    return this.elasticElement.globalStiffness();
  }

  releasedRotationPositions(hingeState?: SteelPlasticHingeState | null): HingePosition[] {
    const positions: HingePosition[] = [];

    if (hingeState?.isActiveAt("start")) {
      positions.push("start");
    }

    if (hingeState?.isActiveAt("end")) {
      positions.push("end");
    }

    return positions;
  }

  condensationOperators(
    hingeState?: SteelPlasticHingeState | null,
  ): SteelPlasticHingeCondensationOperators {
    const positions = this.releasedRotationPositions(hingeState);
    const h = createZeroMatrix(6, positions.length);

    positions.forEach((position, column) => {
      const row = h[ROTATION_INDEX_BY_POSITION[position]];
      if (row === undefined) {
        throw new Error("SteelPlasticHingeFrameElement2D condensation row is unavailable.");
      }
      row[column] = -1;
    });

    return {
      positions,
      h,
    };
  }

  responseForState(
    localDisplacements: NumericVector,
    hingeState: SteelPlasticHingeState,
  ): SteelPlasticHingeStateResponse {
    const k = this.localElasticStiffness();
    const { positions, h } = this.condensationOperators(hingeState);

    if (positions.length === 0) {
      const localEndForces = multiplyMatrixVector(k, localDisplacements);

      return {
        hingeState,
        plasticRotations: [],
        localEndForces,
        localEquivalentForce: createZeroVector(6),
        tangentLocalStiffness: k,
      };
    }

    const ht = transpose(h);
    const kaa = multiplyMatrices(ht, multiplyMatrices(k, h));
    const htkd = multiplyMatrixVector(ht, multiplyMatrixVector(k, localDisplacements));
    const prescribedGeneralizedForce = positions.map((position) =>
      plasticGeneralizedForce(hingeState.signAt(position), this.plasticMomentCapacity(position)),
    );
    const invKaa = invertSmallDenseMatrix(kaa);
    const plasticRotations = multiplyMatrixVector(
      invKaa,
      prescribedGeneralizedForce.map((value, index) => value - (htkd[index] ?? 0)),
    );
    const localElasticDisplacements = addVectors(
      localDisplacements,
      multiplyMatrixVector(h, plasticRotations),
    );
    const localEndForces = multiplyMatrixVector(k, localElasticDisplacements);
    const tangentLocalStiffness = subtractMatrices(
      k,
      multiplyMatrices(multiplyMatrices(k, h), multiplyMatrices(invKaa, multiplyMatrices(ht, k))),
    );
    const localEquivalentForce = multiplyMatrixVector(
      multiplyMatrices(multiplyMatrices(k, h), invKaa),
      prescribedGeneralizedForce,
    );

    return {
      hingeState,
      plasticRotations,
      localEndForces,
      localEquivalentForce,
      tangentLocalStiffness,
    };
  }

  activateMissingHinges(
    localEndForces: NumericVector,
    hingeState: SteelPlasticHingeState,
    yieldTolerance?: number,
  ): SteelPlasticHingeState {
    let updatedState = hingeState;

    const positions: HingePosition[] = ["start", "end"];
    for (const position of positions) {
      if (updatedState.isActiveAt(position)) {
        continue;
      }

      const localMoment = localEndForces[ROTATION_INDEX_BY_POSITION[position]] ?? 0;
      const plasticMoment = this.plasticMomentCapacity(position);
      const activationThreshold = plasticMoment * (1 - Math.max(0, yieldTolerance ?? 0));

      if (Math.abs(localMoment) >= activationThreshold) {
        updatedState = updatedState.withActivation(position, signLabel(localMoment), {
          elementId: this.id,
          plasticMoment,
          trialMoment: localMoment,
        });
      }
    }

    return updatedState;
  }

  evaluate({
    globalDisplacements,
    dofRegistry,
    hingeState = new SteelPlasticHingeState(),
    yieldTolerance = 1e-9,
  }: SteelPlasticHingeFrameElement2DEvaluateOptions = {}): SteelPlasticHingeFrameElement2DResponse {
    if (!isNumericVector(globalDisplacements)) {
      throw new Error(
        "FrameElement2DEulerBernoulli localDisplacements requires a displacement vector.",
      );
    }
    if (dofRegistry === null || dofRegistry === undefined) {
      const registryDescription = dofRegistry === null ? "null" : "undefined";
      throw new TypeError(`Cannot read properties of ${registryDescription} (reading 'getDofId')`);
    }

    const localDisplacements = this.localDisplacements(globalDisplacements, dofRegistry);
    let trialState =
      hingeState instanceof SteelPlasticHingeState
        ? hingeState.clone()
        : new SteelPlasticHingeState(hingeState);
    let response: SteelPlasticHingeStateResponse | null = null;

    for (let iteration = 0; iteration < 3; iteration += 1) {
      response = this.responseForState(localDisplacements, trialState);
      const updatedState = this.activateMissingHinges(
        response.localEndForces,
        trialState,
        yieldTolerance,
      );

      if (updatedState.start === trialState.start && updatedState.end === trialState.end) {
        break;
      }

      trialState = updatedState;
    }

    if (response === null) {
      throw new Error("SteelPlasticHingeFrameElement2D did not produce a response.");
    }

    const transformation = this.transformationMatrix();
    const tangentGlobalStiffness = multiplyMatrices(
      transpose(transformation),
      multiplyMatrices(response.tangentLocalStiffness, transformation),
    );
    const globalEndForces = multiplyMatrixVector(
      transpose(transformation),
      response.localEndForces,
    );

    return {
      ...response,
      hingeState: trialState,
      newActivations:
        hingeState instanceof SteelPlasticHingeState
          ? hingeState.activationDelta(trialState)
          : new SteelPlasticHingeState(hingeState).activationDelta(trialState),
      localDisplacements,
      globalEndForces,
      tangentGlobalStiffness,
    };
  }

  toJSON(): Record<string, unknown> {
    return {
      id: this.id,
      type: this.type,
      startNodeId: this.startNode.id,
      endNodeId: this.endNode.id,
      length: this.elasticElement.length(),
      profileName: this.section?.profileName ?? null,
      axialRigidity: this.axialRigidity,
      flexuralRigidity: this.flexuralRigidity,
      plasticMomentStart: this.plasticMomentStart,
      plasticMomentEnd: this.plasticMomentEnd,
      sectionOrientation: { ...this.sectionOrientation },
      bendingInertiaAxis: this.sectionOrientation.inertiaProperty,
      plasticSectionModulusAxis: this.sectionOrientation.plasticSectionModulusProperty,
      material: this.material?.toJSON?.() ?? this.material,
      section: this.section?.toJSON?.() ?? this.section,
      metadata: { ...this.metadata },
    };
  }
}
