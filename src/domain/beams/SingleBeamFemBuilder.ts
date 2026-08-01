import { Node } from "../geometry/Node.js";
import { DistributedLoad } from "../loads/DistributedLoad.js";
import { NodalLoad } from "../loads/NodalLoad.js";
import { Support } from "../supports/Support.js";
import { createUnitResolver, type UnitSystem } from "../units/UnitSystem.js";
import {
  FrameElement2DEulerBernoulli,
  type FrameElement2DEulerBernoulliInput,
} from "../fem/elements/FrameElement2DEulerBernoulli.js";
import { FrameElement2DTimoshenko } from "../fem/elements/FrameElement2DTimoshenko.js";
import {
  DISTRIBUTED_LOAD_TYPES,
  POINT_LOAD_TYPES,
  SingleBeamModel,
  normalizeLoadDirection,
  normalizeProjection,
  projectedLineLoadValue,
  resolveBeamSupportPreset,
  type NormalizedBeamLoad,
} from "./SingleBeamInput.js";
import {
  collectBeamStations,
  coordinateAtStation,
  resolveGeometry,
  resolveStation,
  type ResolvedBeamGeometry,
} from "./SingleBeamStations.js";
import { convertBeamProperties } from "./SingleBeamResults.js";
import type { ElasticBeamSectionProperties } from "./ElasticBeamSectionProvider.js";

const FEM_UNITS = Object.freeze({ force: "kN", length: "m" }) satisfies UnitSystem;

export type BeamElementLike = FrameElement2DEulerBernoulli | FrameElement2DTimoshenko;

type BeamElementConstructor = new (
  options: FrameElement2DEulerBernoulliInput & {
    shearRigidity?: number;
    shearCorrectionFactor?: number;
  },
) => BeamElementLike;

export interface SingleBeamFemModel {
  id: string;
  units: UnitSystem;
  geometry: ResolvedBeamGeometry;
  outputGeometry: {
    start: { x: number; y: number };
    end: { x: number; y: number };
    length: number;
    horizontalSpan: number;
  };
  nodes: Node[];
  elements: BeamElementLike[];
  supports: Support[];
  loads: DistributedLoad[];
  nodalLoads: NodalLoad[];
  allLoads: Array<DistributedLoad | NodalLoad>;
  stations: number[];
  sectionProperties: ElasticBeamSectionProperties;
  metadata: Record<string, unknown>;
}

function assertFinite(value: unknown, label: string): asserts value is number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`SingleBeamAnalysis requires a finite ${label}.`);
  }
}

function assertPositive(value: unknown, label: string): asserts value is number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new Error(`SingleBeamAnalysis requires a positive ${label}.`);
  }
}

function resolveElementClass(
  analysisModel: string,
  overrideClass: unknown,
): BeamElementConstructor {
  if (typeof overrideClass === "function") {
    return overrideClass as BeamElementConstructor;
  }

  const normalized = String(analysisModel ?? "euler-bernoulli")
    .trim()
    .toLowerCase();

  if (["euler-bernoulli", "euler", "eb"].includes(normalized)) {
    return FrameElement2DEulerBernoulli;
  }

  if (["timoshenko", "timo"].includes(normalized)) {
    return FrameElement2DTimoshenko;
  }

  throw new Error(`Unsupported beam analysis model: ${analysisModel}.`);
}

function propertyResolverOptions(properties: ElasticBeamSectionProperties): Omit<
  FrameElement2DEulerBernoulliInput,
  "id" | "startNode" | "endNode"
> & {
  shearRigidity?: number;
  shearCorrectionFactor?: number;
} {
  return {
    axialRigidity: properties.axialRigidity,
    flexuralRigidity: properties.flexuralRigidity,
    metadata: {
      sectionProperties: properties.metadata,
    },
  };
}

export class SingleBeamFemBuilder {
  readonly nodeIdPrefix: string;
  readonly elementIdPrefix: string;
  readonly tolerance: number;

  constructor({
    nodeIdPrefix = "beam-node",
    elementIdPrefix = "beam-element",
    tolerance = 1e-9,
  }: {
    nodeIdPrefix?: string;
    elementIdPrefix?: string;
    tolerance?: number;
  } = {}) {
    assertPositive(tolerance, "tolerance");

    this.nodeIdPrefix = nodeIdPrefix;
    this.elementIdPrefix = elementIdPrefix;
    this.tolerance = tolerance;
  }

  build(
    modelOrInput: SingleBeamModel | ConstructorParameters<typeof SingleBeamModel>[0],
    {
      loads = null,
      context = {},
    }: { loads?: readonly NormalizedBeamLoad[] | null; context?: Record<string, unknown> } = {},
  ): SingleBeamFemModel {
    const model =
      modelOrInput instanceof SingleBeamModel ? modelOrInput : new SingleBeamModel(modelOrInput);
    const unitResolver = createUnitResolver(model.units, FEM_UNITS);
    const outputResolver = createUnitResolver(FEM_UNITS, model.units);
    const geometry = resolveGeometry(model.geometry, model.units, FEM_UNITS);
    const outputGeometry = {
      start: {
        x: outputResolver.length(geometry.start.x),
        y: outputResolver.length(geometry.start.y),
      },
      end: {
        x: outputResolver.length(geometry.end.x),
        y: outputResolver.length(geometry.end.y),
      },
      length: outputResolver.length(geometry.length),
      horizontalSpan: outputResolver.length(geometry.horizontalSpan),
    };
    const providerContext = {
      ...context,
      analysisModel: model.analysisModel,
      geometry: outputGeometry,
      span: outputGeometry.length,
      units: model.units,
      sectionRotation: model.sectionRotation,
    };
    const sectionProperties = model.sectionProvider.getElasticBeamProperties(
      providerContext,
    ) as ElasticBeamSectionProperties;
    const femProperties = convertBeamProperties(sectionProperties, FEM_UNITS);
    const ElementClass = resolveElementClass(model.analysisModel, model.elementClass);
    const baseElementOptions = propertyResolverOptions(femProperties);

    if (ElementClass === FrameElement2DTimoshenko) {
      if (femProperties.shearRigidity === null) {
        throw new Error(
          "Timoshenko beam analysis requires shearRigidity from the section provider.",
        );
      }

      baseElementOptions.shearRigidity = femProperties.shearRigidity;
      baseElementOptions.shearCorrectionFactor = femProperties.shearCorrectionFactor ?? 1;
    }

    const selectedLoads = [...(loads ?? model.loads)];
    const sortedStations = collectBeamStations({
      geometry,
      unitResolver,
      discretization: model.discretization,
      verificationStations: model.verificationStations,
      supports: model.supports,
      loads: selectedLoads,
      tolerance: this.tolerance,
    });
    const nodes = sortedStations.map((station, index) => {
      const coordinates = coordinateAtStation(geometry, station);

      return new Node({
        id: `${model.id}-${this.nodeIdPrefix}-${index + 1}`,
        x: coordinates.x,
        y: coordinates.y,
        units: FEM_UNITS,
        metadata: {
          station,
        },
      });
    });
    const nodeAt = (station: number | null): Node => {
      const index = sortedStations.findIndex(
        (candidate) => station !== null && Math.abs(candidate - station) <= this.tolerance,
      );

      if (index < 0) {
        throw new Error(`Cannot find a beam node at station ${String(station)}.`);
      }

      const node = nodes[index];
      if (!node) {
        throw new Error(`Cannot find a beam node at station ${String(station)}.`);
      }
      return node;
    };
    const elements: BeamElementLike[] = [];

    for (let index = 0; index < nodes.length - 1; index += 1) {
      const startNode = nodes[index];
      const endNode = nodes[index + 1];
      if (!startNode || !endNode) {
        throw new Error("SingleBeamFemBuilder could not resolve adjacent beam nodes.");
      }
      const metadata = {
        ...baseElementOptions.metadata,
        startStation: sortedStations[index],
        endStation: sortedStations[index + 1],
      };
      const elementOptions = {
        id: `${model.id}-${this.elementIdPrefix}-${index + 1}`,
        startNode,
        endNode,
        ...baseElementOptions,
        metadata,
      };

      elements.push(new ElementClass(elementOptions));
    }

    const supportObjects = model.supports
      .map((support) => {
        const station = resolveStation(
          support.position ?? support.x ?? support.station,
          geometry,
          unitResolver,
          `support ${support.id} position`,
          support.position === "end" ? geometry.length : 0,
        );
        const type = support.type ?? support.preset ?? "free";
        const restraints = support.restraints ?? resolveBeamSupportPreset(type);

        if (!Object.values(restraints).some(Boolean)) {
          return null;
        }

        return new Support({
          id: support.id,
          node: nodeAt(station),
          restraints,
          metadata: {
            ...support.metadata,
            station,
            type,
            referenceSystem: "global",
          },
        });
      })
      .filter((support): support is Support => support !== null);
    const distributedLoads: DistributedLoad[] = [];
    const nodalLoads: NodalLoad[] = [];

    for (const load of selectedLoads) {
      const type = load.type ?? "uniform";
      const factor = load.factor ?? 1;

      if (DISTRIBUTED_LOAD_TYPES.has(type)) {
        const from = resolveStation(
          load.from ?? load.start,
          geometry,
          unitResolver,
          `load ${load.id} start`,
          0,
        );
        const to = resolveStation(
          load.to ?? load.end,
          geometry,
          unitResolver,
          `load ${load.id} end`,
          geometry.length,
        );

        if (from === null || to === null || from >= to) {
          throw new Error(`Distributed load ${load.id} requires from < to.`);
        }

        const startValue = load.value ?? load.startValue;
        const endValue = load.endValue ?? startValue;

        assertFinite(startValue, `load ${load.id} value`);
        assertFinite(endValue, `load ${load.id} endValue`);

        if (Math.abs(startValue - endValue) > 1e-12) {
          throw new Error("SingleBeamAnalysis supports only uniform distributed loads.");
        }

        const lineLoad = unitResolver.lineLoad(startValue * factor);
        const axisLineLoad = projectedLineLoadValue(lineLoad, load, geometry);
        const { referenceSystem, direction } = normalizeLoadDirection(load);

        if (direction === "mz") {
          throw new Error("Distributed moment loads are not supported in SingleBeamAnalysis.");
        }

        for (const element of elements) {
          const startStation = element.metadata.startStation;
          const endStation = element.metadata.endStation;
          if (typeof startStation !== "number" || typeof endStation !== "number") {
            throw new Error("SingleBeamFemBuilder element stations are unavailable.");
          }
          const covered =
            startStation >= from - this.tolerance && endStation <= to + this.tolerance;

          if (!covered) {
            continue;
          }

          distributedLoads.push(
            new DistributedLoad({
              id: `${load.id}-${element.id}`,
              element,
              startValue: axisLineLoad,
              direction,
              referenceSystem,
              distribution: "uniform",
              length: element.length(),
              units: FEM_UNITS,
              metadata: {
                sourceId: load.id,
                actionType: load.actionType,
                loadCaseId: load.loadCaseId,
                from: startStation,
                to: endStation,
                loadProjection: normalizeProjection(load.loadProjection),
                sourceValue: startValue,
                appliedFactor: factor,
              },
            }),
          );
        }

        continue;
      }

      if (POINT_LOAD_TYPES.has(type)) {
        const station = resolveStation(
          load.x ?? load.position ?? load.station,
          geometry,
          unitResolver,
          `load ${load.id} position`,
          geometry.length / 2,
        );
        const { direction } = normalizeLoadDirection(load);
        let components: { fx?: number; fy?: number; mz?: number } = {};

        if (load.components) {
          components = {
            fx: unitResolver.force((load.components.fx ?? 0) * factor),
            fy: unitResolver.force((load.components.fy ?? 0) * factor),
            mz: unitResolver.moment((load.components.mz ?? 0) * factor),
          };
        } else {
          const value = load.value ?? load.magnitude;

          assertFinite(value, `load ${load.id} value`);

          if (direction === "x") {
            components.fx = unitResolver.force(value * factor);
          } else if (direction === "y") {
            components.fy = unitResolver.force(value * factor);
          } else {
            components.mz = unitResolver.moment(value * factor);
          }
        }

        nodalLoads.push(
          new NodalLoad({
            id: load.id,
            node: nodeAt(station),
            components,
            units: FEM_UNITS,
            metadata: {
              sourceId: load.id,
              actionType: load.actionType,
              loadCaseId: load.loadCaseId,
              station,
              appliedFactor: factor,
            },
          }),
        );
      }
    }

    return {
      id: model.id,
      units: FEM_UNITS,
      geometry,
      outputGeometry,
      nodes,
      elements,
      supports: supportObjects,
      loads: distributedLoads,
      nodalLoads,
      allLoads: [...distributedLoads, ...nodalLoads],
      stations: sortedStations,
      sectionProperties,
      metadata: {
        sourceUnits: model.units,
        analysisModel: model.analysisModel,
        sectionRotation: { ...model.sectionRotation },
        generatedBy: "SingleBeamFemBuilder",
      },
    };
  }
}
