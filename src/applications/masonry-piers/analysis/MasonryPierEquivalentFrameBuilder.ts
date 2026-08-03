import {
  FrameElement2DTimoshenkoRigidOffsets,
  LinearStaticSolver2D,
} from "../../../domain/fem/index.js";
import type { FrameElement2DTimoshenkoRigidOffsetsJson } from "../../../domain/fem/elements/FrameElement2DTimoshenkoRigidOffsets.js";
import { Node, type NodeJson } from "../../../domain/geometry/Node.js";
import { Support, type SupportJson } from "../../../domain/supports/Support.js";
import { createUnitResolver, type UnitSystemInput } from "../../../domain/units/UnitSystem.js";
import { MasonryPierModel, type MasonryPierModelOptions } from "../models/MasonryPierModel.js";

const FEM_UNITS: UnitSystemInput = { force: "kN", length: "m" };

interface MasonryPierEquivalentFrameInput {
  model?: MasonryPierModel | MasonryPierModelOptions | null;
}

export interface MasonryPierEquivalentFrameSnapshot {
  id: string;
  units: UnitSystemInput;
  nodes: NodeJson[];
  elements: FrameElement2DTimoshenkoRigidOffsetsJson[];
  supports: SupportJson[];
  constraints: unknown[];
  metadata: Record<string, unknown>;
}

export interface MasonryPierEquivalentFrameBuildResult {
  id: string;
  model: Record<string, unknown>;
  snapshot: MasonryPierEquivalentFrameSnapshot;
  warnings: string[];
  assumptions: string[];
  createSolver: () => LinearStaticSolver2D;
}

function serializeModel(
  nodes: readonly Node[],
  elements: readonly FrameElement2DTimoshenkoRigidOffsets[],
  supports: readonly Support[],
): Pick<MasonryPierEquivalentFrameSnapshot, "nodes" | "elements" | "supports"> {
  return {
    nodes: nodes.map((node) => node.toJSON()),
    elements: elements.map((element) => element.toJSON()),
    supports: supports.map((support) => support.toJSON()),
  };
}

function resolveModel(input: MasonryPierModel | MasonryPierModelOptions): MasonryPierModel {
  return input instanceof MasonryPierModel ? input : new MasonryPierModel(input);
}

export class MasonryPierEquivalentFrameBuilder {
  public build({
    model,
  }: MasonryPierEquivalentFrameInput = {}): MasonryPierEquivalentFrameBuildResult {
    const resolvedModel = resolveModel(model ?? {});
    const warnings: string[] = [];
    const assumptions = [
      "The equivalent-frame idealization uses one 2D Timoshenko element with rigid end zones embedded through a local kinematic transformation Q^T K Q, without additional internal nodes.",
      "The base node is always fully fixed in the equivalent-frame idealization, in line with the requested standalone cantilever scheme.",
    ];

    if (
      resolvedModel.idealization.elementClass !== "frame-2d-timoshenko" &&
      resolvedModel.idealization.elementClass !== "frame-2d-timoshenko-rigid-offsets"
    ) {
      throw new Error(
        `MasonryPierEquivalentFrameBuilder supports only frame-2d-timoshenko based idealizations. Received: ${resolvedModel.idealization.elementClass}.`,
      );
    }

    const rigidities = resolvedModel.resolvedEquivalentFrameRigidities();
    const axialRigidity = rigidities.axialRigidity;
    const flexuralRigidity = rigidities.flexuralRigidity;
    const shearRigidity = rigidities.shearRigidity;
    if (
      typeof axialRigidity !== "number" ||
      !Number.isFinite(axialRigidity) ||
      axialRigidity <= 0
    ) {
      throw new Error(
        "MasonryPierEquivalentFrameBuilder requires a positive axial rigidity or a masonry material with finite E.",
      );
    }
    if (
      typeof flexuralRigidity !== "number" ||
      !Number.isFinite(flexuralRigidity) ||
      flexuralRigidity <= 0
    ) {
      throw new Error(
        "MasonryPierEquivalentFrameBuilder requires a positive flexural rigidity or a masonry material with finite E.",
      );
    }
    if (
      typeof shearRigidity !== "number" ||
      !Number.isFinite(shearRigidity) ||
      shearRigidity <= 0
    ) {
      throw new Error(
        "MasonryPierEquivalentFrameBuilder requires a positive shear rigidity or a masonry material with finite G.",
      );
    }

    const geometryToFem = createUnitResolver(resolvedModel.units, FEM_UNITS);
    const baseNode = new Node({
      id: `${resolvedModel.id}-base`,
      x: resolvedModel.geometry.baseX,
      y: resolvedModel.geometry.baseY,
      units: resolvedModel.units,
      metadata: { role: "base" },
    });
    const topNode = new Node({
      id: `${resolvedModel.id}-top`,
      x: resolvedModel.geometry.baseX,
      y: resolvedModel.geometry.baseY + resolvedModel.geometry.height,
      units: resolvedModel.units,
      metadata: { role: "top" },
    });
    const nodes = [baseNode, topNode];
    const deformableElement = new FrameElement2DTimoshenkoRigidOffsets({
      id: `${resolvedModel.id}-element-1`,
      startNode: baseNode,
      endNode: topNode,
      axialRigidity: geometryToFem.force(axialRigidity),
      flexuralRigidity: geometryToFem.convert(flexuralRigidity, {
        forceExponent: 1,
        lengthExponent: 2,
      }),
      shearRigidity: geometryToFem.force(shearRigidity),
      shearCorrectionFactor: rigidities.shearCorrectionFactor,
      rigidStartOffset: geometryToFem.length(resolvedModel.idealization.rigidEndZoneBottom),
      rigidEndOffset: geometryToFem.length(resolvedModel.idealization.rigidEndZoneTop),
      metadata: {
        sourceModelId: resolvedModel.id,
        deformableHeight: geometryToFem.length(resolvedModel.deformableHeight()),
      },
    });
    const supports = [
      new Support({
        id: `${resolvedModel.id}-base-fix`,
        node: baseNode,
        restraints: { ux: true, uy: true, rz: true },
      }),
    ];
    const serializable = serializeModel(nodes, [deformableElement], supports);
    const id = `${resolvedModel.id}-equivalent-frame`;

    return {
      id,
      model: {
        id,
        units: FEM_UNITS,
        nodes,
        elements: [deformableElement],
        supports,
        constraints: [],
        loads: [],
      },
      snapshot: {
        id,
        units: FEM_UNITS,
        ...serializable,
        constraints: [],
        metadata: {
          sourceModelId: resolvedModel.id,
          baseNodeId: baseNode.id,
          topNodeId: topNode.id,
          elementId: deformableElement.id,
          rigidOffsetsEmbedded: true,
          rigidEndZoneBottom: geometryToFem.length(resolvedModel.idealization.rigidEndZoneBottom),
          rigidEndZoneTop: geometryToFem.length(resolvedModel.idealization.rigidEndZoneTop),
          deformableHeight: geometryToFem.length(resolvedModel.deformableHeight()),
          axialRigidity: geometryToFem.force(axialRigidity),
          flexuralRigidity: geometryToFem.convert(flexuralRigidity, {
            forceExponent: 1,
            lengthExponent: 2,
          }),
          shearRigidity: geometryToFem.force(shearRigidity),
          shearCorrectionFactor: rigidities.shearCorrectionFactor,
        },
      },
      warnings,
      assumptions,
      createSolver() {
        return new LinearStaticSolver2D();
      },
    };
  }
}
