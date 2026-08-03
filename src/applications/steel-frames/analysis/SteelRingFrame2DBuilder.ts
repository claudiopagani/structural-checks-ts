// Mechanical TypeScript migration from strutture-js 6f33baead8b88166c4b2cf94af41763412e3c751; source path: src/applications/steel-frames/analysis/SteelRingFrame2DBuilder.js.

import { DofRegistry } from "../../../domain/fem/DofRegistry.js";
import { Node, type NodeJson } from "../../../domain/geometry/Node.js";
import { Support, type SupportJson } from "../../../domain/supports/Support.js";
import { createUnitResolver, type UnitSystem } from "../../../domain/units/UnitSystem.js";
import {
  SteelRingFramePushoverModel,
  type SteelRingFramePushoverModelOptions,
} from "../models/SteelRingFramePushoverModel.js";
import {
  SteelPlasticHingeFrameElement2D,
  type SteelPlasticHingeSectionLike,
} from "./SteelPlasticHingeFrameElement2D.js";

const FEM_UNITS = Object.freeze({ force: "kN", length: "m" }) satisfies UnitSystem;

export interface SteelRingFrame2DSnapshot {
  id: string;
  units: UnitSystem;
  nodes: NodeJson[];
  elements: Array<Record<string, unknown>>;
  supports: SupportJson[];
  metadata: Record<string, unknown>;
}

export interface SteelRingFrame2DBuilderResult {
  id: string;
  model: SteelRingFramePushoverModel;
  nodes: Node[];
  elements: SteelPlasticHingeFrameElement2D[];
  supports: Support[];
  dofRegistry: DofRegistry;
  referenceLoadVector: number[];
  controlVector: number[];
  controlNode: Node;
  snapshot: SteelRingFrame2DSnapshot;
  warnings: string[];
  assumptions: string[];
}

export interface SteelRingFrame2DBuilderOptions {
  model?: SteelRingFramePushoverModel | SteelRingFramePushoverModelOptions | null;
}

function isModelOptions(value: unknown): value is SteelRingFramePushoverModelOptions {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function resolveModel(input: unknown): SteelRingFramePushoverModel {
  return input instanceof SteelRingFramePushoverModel
    ? input
    : new SteelRingFramePushoverModel(isModelOptions(input) ? input : { id: "" });
}

function coordinateOrZero(value: number | null | undefined): number {
  return value ?? 0;
}

function isSectionLike(value: unknown): value is SteelPlasticHingeSectionLike {
  return typeof value === "object" && value !== null;
}

function resolveSection(value: unknown): SteelPlasticHingeSectionLike | null {
  if (value == null) return null;
  return isSectionLike(value) ? value : null;
}

function serializeFrame(
  nodes: readonly Node[],
  elements: readonly SteelPlasticHingeFrameElement2D[],
  supports: readonly Support[],
): Pick<SteelRingFrame2DSnapshot, "nodes" | "elements" | "supports"> {
  return {
    nodes: nodes.map((node) => node.toJSON()),
    elements: elements.map((element) => element.toJSON()),
    supports: supports.map((support) => support.toJSON()),
  };
}

export class SteelRingFrame2DBuilder {
  build({ model }: SteelRingFrame2DBuilderOptions = {}): SteelRingFrame2DBuilderResult {
    const resolvedModel = resolveModel(model ?? {});
    const assumptions = [
      "The ring frame is modeled in 2D with Euler-Bernoulli frame members and three nodal DOFs per node: ux, uy, rz.",
      "Plasticity is concentrated at member ends; members remain elastic between hinges and no geometric non-linearity is included in the first MVP.",
      "The horizontal pushover load pattern is split equally between the two top nodes.",
    ];
    const warnings: string[] = [];
    const toFem = createUnitResolver(resolvedModel.units, FEM_UNITS);
    const { clearWidth, clearHeight, originX, originY } = resolvedModel.geometry;
    const nodeUnits = FEM_UNITS;
    const bottomLeftNode = new Node({
      id: `${resolvedModel.id}-bl`,
      x: toFem.length(coordinateOrZero(originX)),
      y: toFem.length(coordinateOrZero(originY)),
      units: nodeUnits,
      metadata: { role: "bottom-left" },
    });
    const topLeftNode = new Node({
      id: `${resolvedModel.id}-tl`,
      x: toFem.length(coordinateOrZero(originX)),
      y: toFem.length(coordinateOrZero(originY) + clearHeight),
      units: nodeUnits,
      metadata: { role: "top-left" },
    });
    const bottomRightNode = new Node({
      id: `${resolvedModel.id}-br`,
      x: toFem.length(coordinateOrZero(originX) + clearWidth),
      y: toFem.length(coordinateOrZero(originY)),
      units: nodeUnits,
      metadata: { role: "bottom-right" },
    });
    const topRightNode = new Node({
      id: `${resolvedModel.id}-tr`,
      x: toFem.length(coordinateOrZero(originX) + clearWidth),
      y: toFem.length(coordinateOrZero(originY) + clearHeight),
      units: nodeUnits,
      metadata: { role: "top-right" },
    });
    const nodes = [bottomLeftNode, topLeftNode, bottomRightNode, topRightNode];
    const elements = [
      new SteelPlasticHingeFrameElement2D({
        id: `${resolvedModel.id}-left-column`,
        startNode: bottomLeftNode,
        endNode: topLeftNode,
        section: resolveSection(resolvedModel.memberSections.leftColumn),
        material: resolvedModel.material,
        sectionOrientation: resolvedModel.memberOrientations.leftColumn,
        metadata: {
          role: "left-column",
          sourceModelId: resolvedModel.id,
          sectionOrientation: { ...resolvedModel.memberOrientations.leftColumn },
        },
      }),
      new SteelPlasticHingeFrameElement2D({
        id: `${resolvedModel.id}-right-column`,
        startNode: bottomRightNode,
        endNode: topRightNode,
        section: resolveSection(resolvedModel.memberSections.rightColumn),
        material: resolvedModel.material,
        sectionOrientation: resolvedModel.memberOrientations.rightColumn,
        metadata: {
          role: "right-column",
          sourceModelId: resolvedModel.id,
          sectionOrientation: { ...resolvedModel.memberOrientations.rightColumn },
        },
      }),
      new SteelPlasticHingeFrameElement2D({
        id: `${resolvedModel.id}-top-beam`,
        startNode: topLeftNode,
        endNode: topRightNode,
        section: resolveSection(resolvedModel.memberSections.topBeam),
        material: resolvedModel.material,
        sectionOrientation: resolvedModel.memberOrientations.topBeam,
        metadata: {
          role: "top-beam",
          sourceModelId: resolvedModel.id,
          sectionOrientation: { ...resolvedModel.memberOrientations.topBeam },
        },
      }),
    ];

    if (resolvedModel.includeBottomBeam) {
      elements.push(
        new SteelPlasticHingeFrameElement2D({
          id: `${resolvedModel.id}-bottom-beam`,
          startNode: bottomLeftNode,
          endNode: bottomRightNode,
          section: resolveSection(resolvedModel.memberSections.bottomBeam),
          material: resolvedModel.material,
          sectionOrientation: resolvedModel.memberOrientations.bottomBeam,
          metadata: {
            role: "bottom-beam",
            sourceModelId: resolvedModel.id,
            sectionOrientation: { ...resolvedModel.memberOrientations.bottomBeam },
          },
        }),
      );
    }

    const fixedRotations = resolvedModel.baseCondition === "fixed-base";
    const supports = [
      new Support({
        id: `${resolvedModel.id}-support-bl`,
        node: bottomLeftNode,
        restraints: { ux: true, uy: true, rz: fixedRotations },
        metadata: { role: "base-left", baseCondition: resolvedModel.baseCondition },
      }),
      new Support({
        id: `${resolvedModel.id}-support-br`,
        node: bottomRightNode,
        restraints: { ux: true, uy: true, rz: fixedRotations },
        metadata: { role: "base-right", baseCondition: resolvedModel.baseCondition },
      }),
    ];

    if (resolvedModel.baseCondition === "fixed-base" && resolvedModel.includeBottomBeam) {
      warnings.push(
        "The bottom beam is included in a fixed-base scenario; in the first-order lateral response its contribution is expected to be marginal because both base joints are fully restrained.",
      );
    }

    const dofRegistry = new DofRegistry();
    dofRegistry.registerNodes(nodes);
    dofRegistry.registerElements(elements);
    dofRegistry.registerNodes(
      supports
        .map((support) => support.node)
        .filter((node): node is Pick<Node, "id"> => node !== null),
    );

    const referenceLoadVector = new Array<number>(dofRegistry.size()).fill(0);
    const referenceHorizontalForce = toFem.force(resolvedModel.loading.referenceHorizontalForce);
    referenceLoadVector[dofRegistry.getIndex(topLeftNode, "ux")] = referenceHorizontalForce / 2;
    referenceLoadVector[dofRegistry.getIndex(topRightNode, "ux")] = referenceHorizontalForce / 2;

    const controlNode =
      resolvedModel.loading.controlNode === "top-right" ? topRightNode : topLeftNode;
    const controlVector = new Array<number>(dofRegistry.size()).fill(0);
    controlVector[dofRegistry.getIndex(controlNode, resolvedModel.loading.controlDof)] = 1;

    const id = `${resolvedModel.id}-frame`;
    const snapshot = {
      id,
      units: FEM_UNITS,
      ...serializeFrame(nodes, elements, supports),
      metadata: {
        sourceModelId: resolvedModel.id,
        baseCondition: resolvedModel.baseCondition,
        includeBottomBeam: resolvedModel.includeBottomBeam,
        memberOrientations: Object.fromEntries(
          Object.entries(resolvedModel.memberOrientations).map(([key, value]) => [
            key,
            { ...value },
          ]),
        ),
        controlNodeId: controlNode.id,
        controlDof: resolvedModel.loading.controlDof,
        referenceHorizontalForce,
      },
    } satisfies SteelRingFrame2DSnapshot;

    return {
      id,
      model: resolvedModel,
      nodes,
      elements,
      supports,
      dofRegistry,
      referenceLoadVector,
      controlVector,
      controlNode,
      snapshot,
      warnings,
      assumptions,
    };
  }
}
