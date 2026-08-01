import { NodalLoad } from "../loads/NodalLoad.js";
import { Support } from "../supports/Support.js";
import { createUnitResolver, type UnitSystem } from "../units/UnitSystem.js";
import { SingleBeamFemBuilder, type SingleBeamFemModel } from "../beams/SingleBeamFemBuilder.js";
import type { NormalizedBeamLoad } from "../beams/SingleBeamInput.js";
import { FoundationBeamModel, type FoundationBeamModelOptions } from "./FoundationBeamModel.js";

const FEM_UNITS = Object.freeze({ force: "kN", length: "m" }) satisfies UnitSystem;

interface FoundationNodeData {
  node: SingleBeamFemModel["nodes"][number];
  station: number;
  springStiffness: number;
  settlementLoad: number;
}

export interface FoundationBeamElementData {
  elementId: string;
  startNodeId: string;
  endNodeId: string;
  from: number;
  to: number;
  length: number;
  segmentId: string;
  subgradeModulus: number;
  lineStiffness: number;
  imposedSettlement: number;
}

export interface FoundationBeamFemFoundation {
  model: string;
  contactWidth: number;
  nodes: Array<{
    nodeId: string;
    station: number;
    springStiffness: number;
    active: boolean;
    imposedSettlement: number;
  }>;
  elements: FoundationBeamElementData[];
}

export interface FoundationBeamFemModel extends SingleBeamFemModel {
  foundation: FoundationBeamFemFoundation;
  metadata: Record<string, unknown>;
}

export interface FoundationBeamFemBuilderOptions {
  beamBuilder?: SingleBeamFemBuilder;
  tolerance?: number;
}

export interface FoundationBeamBuildContext extends Record<string, unknown> {
  activeFoundationNodeIds?: readonly string[] | null;
  elementFlexuralRigidities?: readonly unknown[] | null;
}

function segmentAt(model: FoundationBeamModel, station: number, tolerance: number) {
  return model.foundation.segments.find(
    (segment) => station >= segment.fromFem - tolerance && station <= segment.toFem + tolerance,
  );
}

function settlementAt(
  load: NormalizedBeamLoad,
  station: number,
  span: number,
  resolver: ReturnType<typeof createUnitResolver>,
  tolerance: number,
): number | null {
  const from = resolver.length((load.from ?? 0) as number);
  const to = resolver.length((load.to ?? span) as number);

  if (station < from - tolerance || station > to + tolerance) {
    return null;
  }

  const startValue = resolver.length(Number(load.value ?? load.startValue));
  const endValue = resolver.length(Number(load.endValue ?? load.value ?? load.startValue));

  if (!Number.isFinite(startValue) || !Number.isFinite(endValue)) {
    throw new Error(`Soil settlement load ${load.id} requires finite values.`);
  }

  const ratio = to - from <= tolerance ? 0 : (station - from) / (to - from);

  return (startValue + (endValue - startValue) * ratio) * (load.factor ?? 1);
}

function numericMetadata(metadata: Record<string, unknown>, key: string): number {
  const value = metadata[key];
  return typeof value === "number" ? value : 0;
}

function activeNodeIdSet(context: FoundationBeamBuildContext): Set<string> | null {
  const value = context.activeFoundationNodeIds;
  return value == null ? null : new Set(value);
}

export class FoundationBeamFemBuilder {
  readonly beamBuilder: SingleBeamFemBuilder;
  readonly tolerance: number;

  constructor({
    beamBuilder = new SingleBeamFemBuilder(),
    tolerance = 1e-9,
  }: FoundationBeamFemBuilderOptions = {}) {
    this.beamBuilder = beamBuilder;
    this.tolerance = tolerance;
  }

  build(
    modelOrInput: FoundationBeamModel | FoundationBeamModelOptions,
    {
      loads = null,
      context = {},
    }: {
      loads?: readonly NormalizedBeamLoad[] | null;
      context?: FoundationBeamBuildContext;
    } = {},
  ): FoundationBeamFemModel {
    const model =
      modelOrInput instanceof FoundationBeamModel
        ? modelOrInput
        : new FoundationBeamModel(modelOrInput);
    const selectedLoads = loads ?? model.loads;
    const structuralLoads = selectedLoads.filter((load) => load.type !== "soil-settlement");
    const femModel = this.beamBuilder.build(model, { loads: structuralLoads, context });
    const resolver = createUnitResolver(model.units, FEM_UNITS);
    const nodeData = new Map<string, FoundationNodeData>(
      femModel.nodes.map((node) => [
        node.id,
        {
          node,
          station: numericMetadata(node.metadata, "station"),
          springStiffness: 0,
          settlementLoad: 0,
        },
      ]),
    );
    const elementData: FoundationBeamElementData[] = [];
    const settlementLoads = selectedLoads.filter((load) => load.type === "soil-settlement");
    const activeNodeIds = activeNodeIdSet(context);

    for (const element of femModel.elements) {
      const from = numericMetadata(element.metadata, "startStation");
      const to = numericMetadata(element.metadata, "endStation");
      const midpoint = (from + to) / 2;
      const segment = segmentAt(model, midpoint, this.tolerance);

      if (!segment) {
        throw new Error(`No foundation segment covers FEM station ${midpoint}.`);
      }

      const length = to - from;
      const lineStiffness = segment.subgradeModulusFem * model.foundation.contactWidthFem;
      const tributaryStiffness = (lineStiffness * length) / 2;
      const midpointSettlement = settlementLoads.reduce((sum, load) => {
        const value = settlementAt(
          load,
          midpoint,
          femModel.outputGeometry.length,
          resolver,
          this.tolerance,
        );

        return sum + (value ?? 0);
      }, 0);

      for (const node of [element.startNode, element.endNode]) {
        const data = nodeData.get(node.id);
        if (!data) {
          throw new Error(`Foundation beam node ${node.id} is unavailable.`);
        }
        data.springStiffness += tributaryStiffness;
        data.settlementLoad += tributaryStiffness * midpointSettlement;
      }

      elementData.push({
        elementId: element.id,
        startNodeId: element.startNode.id,
        endNodeId: element.endNode.id,
        from,
        to,
        length,
        segmentId: segment.id,
        subgradeModulus: segment.subgradeModulusFem,
        lineStiffness,
        imposedSettlement: midpointSettlement,
      });
    }

    const foundationSupports: Support[] = [];
    const foundationLoads: NodalLoad[] = [];

    for (const data of nodeData.values()) {
      const imposedSettlement =
        data.springStiffness > 0 ? data.settlementLoad / data.springStiffness : 0;
      const active = activeNodeIds == null || activeNodeIds.has(data.node.id);

      if (active) {
        foundationSupports.push(
          new Support({
            id: `${model.id}-soil-spring-${data.node.id}`,
            node: data.node,
            springStiffness: { uy: data.springStiffness },
            metadata: {
              type: "winkler-soil-spring",
              station: data.station,
              imposedSettlement,
            },
          }),
        );
      }

      if (active && Math.abs(data.settlementLoad) > 0) {
        foundationLoads.push(
          new NodalLoad({
            id: `${model.id}-soil-settlement-${data.node.id}`,
            node: data.node,
            components: { fy: data.settlementLoad },
            units: FEM_UNITS,
            metadata: {
              type: "soil-settlement-equivalent-load",
              station: data.station,
              imposedSettlement,
            },
          }),
        );
      }
    }

    const hasHorizontalDatum = femModel.supports.some((support) => support.restraints.ux);
    const firstNode = femModel.nodes[0];
    const horizontalDatum =
      hasHorizontalDatum || !firstNode
        ? []
        : [
            new Support({
              id: `${model.id}-horizontal-datum`,
              node: firstNode,
              restraints: { ux: true },
              metadata: {
                type: "horizontal-datum",
                station: 0,
              },
            }),
          ];

    const result: FoundationBeamFemModel = {
      ...femModel,
      supports: [...femModel.supports, ...foundationSupports, ...horizontalDatum],
      nodalLoads: [...femModel.nodalLoads, ...foundationLoads],
      allLoads: [...femModel.allLoads, ...foundationLoads],
      foundation: {
        model: model.foundation.model,
        contactWidth: model.foundation.contactWidthFem,
        nodes: [...nodeData.values()].map((data) => ({
          nodeId: data.node.id,
          station: data.station,
          springStiffness: data.springStiffness,
          active: activeNodeIds == null || activeNodeIds.has(data.node.id),
          imposedSettlement:
            data.springStiffness > 0 ? data.settlementLoad / data.springStiffness : 0,
        })),
        elements: elementData,
      },
      metadata: {
        ...femModel.metadata,
        foundationModel: model.foundation.model,
        generatedBy: "FoundationBeamFemBuilder",
      },
    };

    if (Array.isArray(context.elementFlexuralRigidities)) {
      result.elements.forEach((element, index) => {
        const value = context.elementFlexuralRigidities?.[index];
        if (typeof value === "number" && Number.isFinite(value) && value > 0) {
          (element as unknown as { flexuralRigidity: number }).flexuralRigidity = value;
        }
      });
    }

    return result;
  }
}
