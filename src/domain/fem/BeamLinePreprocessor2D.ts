import { Node } from "../geometry/Node.js";
import { DistributedLoad } from "../loads/DistributedLoad.js";
import { NodalLoad } from "../loads/NodalLoad.js";
import type { PointLoadComponentsInput } from "../loads/PointLoad.js";
import { Support, type SupportInput } from "../supports/Support.js";
import {
  assertExplicitUnitSystem,
  createUnitResolver,
  type UnitResolver,
  type UnitSystem,
  type UnitSystemInput,
} from "../units/UnitSystem.js";
import {
  FrameElement2DEulerBernoulli,
  type FrameElement2DEulerBernoulliInput,
} from "./elements/FrameElement2DEulerBernoulli.js";

const FEM_INTERNAL_UNITS = Object.freeze({
  force: "kN",
  length: "m",
}) satisfies Readonly<UnitSystem>;
const DISTRIBUTED_LOAD_TYPES = ["distributed", "uniform", "line"];
const POINT_LOAD_TYPES = ["point", "nodal", "force", "moment"];

export interface BeamLineElementOptions
  extends Omit<FrameElement2DEulerBernoulliInput, "endNode" | "id" | "startNode"> {
  shearRigidity?: number | null;
  shearAreaAxis?: string;
  shearCorrectionFactor?: number | null;
}

export interface BeamLineSupportInput {
  id?: string | null;
  x: number;
  restraints?: SupportInput["restraints"];
  springStiffness?: SupportInput["springStiffness"];
  metadata?: Record<string, unknown>;
}

export interface BeamLineLoadInput {
  id?: string | null;
  type?: string | null;
  distribution?: string | null;
  from?: number | null;
  to?: number | null;
  start?: number | null;
  end?: number | null;
  x?: number | null;
  position?: number | null;
  value?: number | null;
  magnitude?: number | null;
  startValue?: number | null;
  endValue?: number | null;
  direction?: string | null;
  referenceSystem?: string | null;
  components?: PointLoadComponentsInput;
  metadata?: Record<string, unknown>;
}

export interface BeamLineDiscretizationInput {
  elementCount?: number | null;
  maxElementLength?: number | null;
}

export interface BeamLinePreprocessor2DInput {
  id?: string;
  span: number;
  units?: UnitSystemInput | null;
  element?: BeamLineElementOptions;
  supports?: BeamLineSupportInput[];
  loads?: BeamLineLoadInput[];
  discretization?: BeamLineDiscretizationInput;
  metadata?: Record<string, unknown>;
}

export interface BeamLinePreprocessor2DOptions {
  nodeIdPrefix?: string;
  elementIdPrefix?: string;
  tolerance?: number;
  elementClass?: FrameElement2DConstructor;
}

export interface FrameElement2DConstructor {
  new (
    input: FrameElement2DEulerBernoulliInput & {
      shearRigidity?: number | null;
    },
  ): FrameElement2DEulerBernoulli;
}

export interface BeamLinePreprocessor2DResult {
  id: string;
  units: UnitSystem;
  span: number;
  nodes: Node[];
  elements: FrameElement2DEulerBernoulli[];
  supports: Support[];
  nodalLoads: NodalLoad[];
  loads: DistributedLoad[];
  distributedLoads: DistributedLoad[];
  pointLoads: NodalLoad[];
  allLoads: (DistributedLoad | NodalLoad)[];
  stations: number[];
  metadata: Record<string, unknown> & {
    sourceUnits: UnitSystem | null;
    unitSystem: UnitSystem;
    generatedBy: "BeamLinePreprocessor2D";
  };
}

interface ResolvedDistributedLoad extends BeamLineLoadInput {
  from: number;
  to: number;
  value: number;
}

function assertFinite(value: number | null | undefined, label: string): asserts value is number {
  if (!Number.isFinite(value)) {
    throw new Error(`BeamLinePreprocessor2D requires a finite ${label}.`);
  }
}

function assertPositive(value: number | null | undefined, label: string): asserts value is number {
  if (!Number.isFinite(value) || (value as number) <= 0) {
    throw new Error(`BeamLinePreprocessor2D requires a positive ${label}.`);
  }
}

function normalizePosition(
  value: number | null | undefined,
  unitResolver: UnitResolver,
  label: string,
): number {
  assertFinite(value, label);
  return unitResolver.length(value);
}

function addPoint(points: number[], x: number, tolerance: number): void {
  if (!points.some((point) => Math.abs(point - x) <= tolerance)) {
    points.push(x);
  }
}

function sortPoints(points: readonly number[]): number[] {
  return [...points].sort((a, b) => a - b);
}

function resolvePointComponents(
  load: BeamLineLoadInput,
  unitResolver: UnitResolver,
): PointLoadComponentsInput {
  if (load.components) {
    return {
      fx: unitResolver.force(load.components.fx ?? 0),
      fy: unitResolver.force(load.components.fy ?? 0),
      fz: unitResolver.force(load.components.fz ?? 0),
      mx: unitResolver.moment(load.components.mx ?? 0),
      my: unitResolver.moment(load.components.my ?? 0),
      mz: unitResolver.moment(load.components.mz ?? 0),
    };
  }

  const value = load.value ?? load.magnitude;

  assertFinite(value, "point load value");

  const direction = load.direction ?? (load.type === "moment" ? "mz" : "fy");

  if (["x", "fx", "global-x"].includes(direction)) {
    return { fx: unitResolver.force(value) };
  }

  if (["y", "fy", "global-y", "vertical"].includes(direction)) {
    return { fy: unitResolver.force(value) };
  }

  if (["mz", "rz", "moment", "moment-z"].includes(direction)) {
    return { mz: unitResolver.moment(value) };
  }

  throw new Error(`Unsupported point load direction: ${direction}.`);
}

function resolveSpringStiffness(
  springStiffness: SupportInput["springStiffness"] = {},
  unitResolver: UnitResolver,
): Record<string, number> {
  return {
    ux: unitResolver.translationalStiffness(springStiffness?.ux ?? 0),
    uy: unitResolver.translationalStiffness(springStiffness?.uy ?? 0),
    uz: unitResolver.translationalStiffness(springStiffness?.uz ?? 0),
    rx: unitResolver.rotationalStiffness(springStiffness?.rx ?? 0),
    ry: unitResolver.rotationalStiffness(springStiffness?.ry ?? 0),
    rz: unitResolver.rotationalStiffness(springStiffness?.rz ?? 0),
  };
}

function validateDistributedLoad(
  load: BeamLineLoadInput,
  unitResolver: UnitResolver,
  span: number,
): ResolvedDistributedLoad {
  if (load.type === "trapezoidal" || load.distribution === "trapezoidal") {
    throw new Error(
      "BeamLinePreprocessor2D does not support trapezoidal loads; discretize them into uniform subloads.",
    );
  }

  const from =
    load.from == null && load.start == null
      ? 0
      : normalizePosition(load.from ?? load.start, unitResolver, "distributed load start");
  const to =
    load.to == null && load.end == null
      ? span
      : normalizePosition(load.to ?? load.end, unitResolver, "distributed load end");

  if (from < -1e-12 || to > span + 1e-12 || from >= to) {
    throw new Error("BeamLinePreprocessor2D distributed load range must lie within the beam span.");
  }

  const startValue = load.value ?? load.startValue;
  const endValue = load.endValue ?? startValue;

  assertFinite(startValue, "distributed load value");
  assertFinite(endValue, "distributed load end value");

  if (Math.abs(startValue - endValue) > 1e-12) {
    throw new Error(
      "BeamLinePreprocessor2D does not support tapered loads; discretize them into uniform subloads.",
    );
  }

  return {
    ...load,
    from,
    to,
    value: unitResolver.lineLoad(startValue),
  };
}

function convertElementOptions(
  elementOptions: BeamLineElementOptions,
  unitResolver: UnitResolver,
): BeamLineElementOptions {
  const resolved = { ...elementOptions };
  const axialRigidity = resolved.axialRigidity;
  const flexuralRigidity = resolved.flexuralRigidity;
  const shearRigidity = resolved.shearRigidity;

  if (typeof axialRigidity === "number" && Number.isFinite(axialRigidity)) {
    resolved.axialRigidity = unitResolver.force(axialRigidity);
  }

  if (typeof flexuralRigidity === "number" && Number.isFinite(flexuralRigidity)) {
    resolved.flexuralRigidity = unitResolver.convert(flexuralRigidity, {
      forceExponent: 1,
      lengthExponent: 2,
    });
  }

  if (typeof shearRigidity === "number" && Number.isFinite(shearRigidity)) {
    resolved.shearRigidity = unitResolver.force(shearRigidity);
  }

  return resolved;
}

export class BeamLinePreprocessor2D {
  readonly nodeIdPrefix: string;
  readonly elementIdPrefix: string;
  readonly tolerance: number;
  readonly elementClass: FrameElement2DConstructor;

  constructor({
    nodeIdPrefix = "beam-node",
    elementIdPrefix = "beam-element",
    tolerance = 1e-9,
    elementClass = FrameElement2DEulerBernoulli,
  }: BeamLinePreprocessor2DOptions = {}) {
    assertPositive(tolerance, "tolerance");

    this.nodeIdPrefix = nodeIdPrefix;
    this.elementIdPrefix = elementIdPrefix;
    this.tolerance = tolerance;
    this.elementClass = elementClass;
  }

  build({
    id = "beam",
    span,
    units,
    element = {},
    supports = [],
    loads = [],
    discretization = {},
    metadata = {},
  }: BeamLinePreprocessor2DInput): BeamLinePreprocessor2DResult {
    assertExplicitUnitSystem(units, "BeamLinePreprocessor2D");

    const unitResolver = createUnitResolver(units, FEM_INTERNAL_UNITS);
    const resolvedSpan = unitResolver.length(span);

    assertPositive(resolvedSpan, "span");

    for (const load of loads) {
      const type = load.type ?? "point";

      if (type === "trapezoidal" || load.distribution === "trapezoidal") {
        throw new Error(
          "BeamLinePreprocessor2D does not support trapezoidal loads; discretize them into uniform subloads.",
        );
      }

      if (!DISTRIBUTED_LOAD_TYPES.includes(type) && !POINT_LOAD_TYPES.includes(type)) {
        throw new Error(`BeamLinePreprocessor2D does not support load type: ${type}.`);
      }
    }

    const distributedLoadInputs = loads.filter((load) =>
      DISTRIBUTED_LOAD_TYPES.includes(load.type ?? "point"),
    );
    const pointLoadInputs = loads.filter((load) => POINT_LOAD_TYPES.includes(load.type ?? "point"));
    const distributedLoadDefinitions = distributedLoadInputs.map((load) =>
      validateDistributedLoad(load, unitResolver, resolvedSpan),
    );
    const points = [0, resolvedSpan];

    this.addDiscretizationPoints(points, resolvedSpan, unitResolver, discretization);

    for (const support of supports) {
      addPoint(
        points,
        normalizePosition(support.x, unitResolver, `support ${support.id ?? ""} position`),
        this.tolerance,
      );
    }

    for (const load of pointLoadInputs) {
      addPoint(
        points,
        normalizePosition(load.x ?? load.position, unitResolver, `load ${load.id ?? ""} position`),
        this.tolerance,
      );
    }

    for (const load of distributedLoadDefinitions) {
      addPoint(points, load.from, this.tolerance);
      addPoint(points, load.to, this.tolerance);
    }

    const sortedPoints = sortPoints(points);
    const nodes = sortedPoints.map(
      (x, index) =>
        new Node({
          id: `${id}-${this.nodeIdPrefix}-${index + 1}`,
          x,
          units: FEM_INTERNAL_UNITS,
        }),
    );
    const nodeAt = (x: number): Node => {
      const index = sortedPoints.findIndex((point) => Math.abs(point - x) <= this.tolerance);

      if (index < 0) {
        throw new Error(`BeamLinePreprocessor2D cannot find a node at x=${x}.`);
      }

      const node = nodes[index];
      if (node === undefined) {
        throw new Error(`BeamLinePreprocessor2D cannot find a node at x=${x}.`);
      }
      return node;
    };
    const resolvedElementOptions = convertElementOptions(element, unitResolver);
    const elements: FrameElement2DEulerBernoulli[] = [];

    for (let index = 0; index < nodes.length - 1; index += 1) {
      const startNode = nodes[index];
      const endNode = nodes[index + 1];
      if (!startNode || !endNode) {
        throw new Error("BeamLinePreprocessor2D cannot resolve element endpoint nodes.");
      }
      elements.push(
        new this.elementClass({
          id: `${id}-${this.elementIdPrefix}-${index + 1}`,
          startNode,
          endNode,
          ...resolvedElementOptions,
        }),
      );
    }

    const supportObjects = supports.map((support, index) => {
      const x = normalizePosition(
        support.x,
        unitResolver,
        `support ${support.id ?? index + 1} position`,
      );

      return new Support({
        id: support.id ?? `${id}-support-${index + 1}`,
        node: nodeAt(x),
        restraints: { ...support.restraints },
        springStiffness: resolveSpringStiffness(support.springStiffness, unitResolver),
        metadata: { ...support.metadata, x },
      });
    });
    const nodalLoads = pointLoadInputs.map((load, index) => {
      const x = normalizePosition(
        load.x ?? load.position,
        unitResolver,
        `load ${load.id ?? index + 1} position`,
      );

      return new NodalLoad({
        id: load.id ?? `${id}-nodal-load-${index + 1}`,
        node: nodeAt(x),
        components: resolvePointComponents(load, unitResolver),
        units: FEM_INTERNAL_UNITS,
        metadata: { ...load.metadata, x, sourceType: load.type ?? "point" },
      });
    });
    const distributedLoads: DistributedLoad[] = [];

    for (const load of distributedLoadDefinitions) {
      for (const currentElement of elements) {
        const startX = currentElement.startNode.x;
        const endX = currentElement.endNode.x;
        const isCovered = startX >= load.from - this.tolerance && endX <= load.to + this.tolerance;

        if (!isCovered) {
          continue;
        }

        distributedLoads.push(
          new DistributedLoad({
            id: `${load.id ?? `${id}-distributed-load`}-${currentElement.id}`,
            element: currentElement,
            startValue: load.value,
            direction: load.direction ?? "y",
            referenceSystem: load.referenceSystem ?? "local",
            distribution: "uniform",
            length: currentElement.length(),
            units: FEM_INTERNAL_UNITS,
            metadata: {
              ...load.metadata,
              sourceId: load.id ?? null,
              from: startX,
              to: endX,
            },
          }),
        );
      }
    }

    return {
      id,
      units: FEM_INTERNAL_UNITS,
      span: resolvedSpan,
      nodes,
      elements,
      supports: supportObjects,
      nodalLoads,
      loads: distributedLoads,
      distributedLoads,
      pointLoads: nodalLoads,
      allLoads: [...distributedLoads, ...nodalLoads],
      stations: sortedPoints,
      metadata: {
        ...metadata,
        sourceUnits: unitResolver.sourceUnitSystem,
        unitSystem: unitResolver.targetUnitSystem,
        generatedBy: "BeamLinePreprocessor2D",
      },
    };
  }

  addDiscretizationPoints(
    points: number[],
    span: number,
    unitResolver: UnitResolver,
    discretization: BeamLineDiscretizationInput = {},
  ): void {
    const elementCount = discretization.elementCount ?? null;
    const maxElementLength =
      discretization.maxElementLength == null
        ? null
        : unitResolver.length(discretization.maxElementLength);

    if (elementCount !== null) {
      if (!Number.isInteger(elementCount) || elementCount <= 0) {
        throw new Error(
          "BeamLinePreprocessor2D discretization.elementCount must be a positive integer.",
        );
      }

      for (let index = 1; index < elementCount; index += 1) {
        addPoint(points, (span * index) / elementCount, this.tolerance);
      }
    }

    if (maxElementLength !== null) {
      assertPositive(maxElementLength, "discretization.maxElementLength");

      const count = Math.ceil(span / maxElementLength);

      for (let index = 1; index < count; index += 1) {
        addPoint(points, (span * index) / count, this.tolerance);
      }
    }
  }
}
