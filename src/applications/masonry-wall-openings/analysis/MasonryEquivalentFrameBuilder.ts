import {
  DofRegistry,
  FrameElement2DTimoshenkoRigidOffsets,
  LinearStaticSolver2D,
} from "../../../domain/fem/index.js";
import type { KinematicConstraintLike } from "../../../domain/fem/KinematicConstraintReducer2D.js";
import { Node } from "../../../domain/geometry/Node.js";
import { SteelMaterial } from "../../../domain/materials/SteelMaterial.js";
import type { UnitSystem } from "../../../domain/units/UnitSystem.js";
import { Support } from "../../../domain/supports/Support.js";
import { createUnitResolver } from "../../../domain/units/UnitSystem.js";
import {
  MasonryPierModel,
  type MasonryPierEquivalentFrameRigidities,
} from "../../masonry-piers/models/MasonryPierModel.js";
import type { MasonryWallPierModel } from "../models/MasonryWallPierModel.js";
import type { MasonryWallSpandrelModel } from "../models/MasonryWallSpandrelModel.js";
import type { MasonryWallOpeningsModel } from "../models/MasonryWallOpeningsModel.js";
import {
  SteelRingFrame2DBuilder,
  type SteelRingFrame2DBuilderResult,
} from "../../steel-frames/analysis/SteelRingFrame2DBuilder.js";
import type {
  SteelRingFrameMemberOrientationsInput,
  SteelRingFrameMaterialInput,
  SteelRingFrameMemberSectionsInput,
  SteelRingFrameSectionInput,
} from "../../steel-frames/models/SteelRingFramePushoverModel.js";
import {
  SteelProfileSection,
  type SteelProfileSectionOptions,
} from "../../../domain/geometry/SteelProfileSection.js";
import {
  extractEquivalentFrameMembers,
  type EquivalentFrameMembersResult,
} from "../geometry/extractEquivalentFrameMembers.js";
import {
  sanitizeAlignmentOpenings,
  type SanitizedAlignmentOpening,
} from "../geometry/sanitizeAlignmentOpenings.js";
import {
  resolveAlignmentMechanicalState,
  type AlignmentMechanicalStateOptions,
  type AlignmentMechanicalStateResolution,
} from "../materials/resolveAlignmentMechanicalState.js";
import { resolveMasonryMaterialProperty } from "../materials/resolveMasonryMaterialProperty.js";

const FEM_UNITS = Object.freeze({ force: "kN", length: "m" }) satisfies UnitSystem;
const SHEAR_CORRECTION_FACTOR = 5 / 6;
const EPS = 1e-9;

type JsonRecord = Record<string, unknown>;
type TopRotation = "free" | "fixed";

interface FrameConstraint extends KinematicConstraintLike {
  id: string;
  type: "equal-dof";
  masterNodeId: string;
  slaveNodeId: string;
  dof: "ux";
  scale: number;
  offset: number;
  metadata: JsonRecord;
}

interface PierFrameSnapshot {
  id: string;
  wallId: string;
  topBoundaryMode: TopRotation;
  baseNodeId: string;
  topNodeId: string;
  elementId: string;
  effectiveLength: number;
  deformableHeight: number;
  rigidBottomLength: number;
  rigidTopLength: number;
}

interface PierFrame {
  pierModel: MasonryPierModel;
  pier: MasonryWallPierModel;
  nodes: Node[];
  element: FrameElement2DTimoshenkoRigidOffsets;
  supports: Support[];
  snapshot: PierFrameSnapshot;
}

interface SpandrelFrameSnapshot {
  id: string;
  sourceWallIds: string[];
  referenceOpeningId: unknown;
  startNodeId: string;
  endNodeId: string;
  elementId: string;
  xStart: number;
  xEnd: number;
  deformableLength: number;
  rigidLeftLength: number;
  rigidRightLength: number;
  deformableAxisY: number;
  height: number;
  thickness: number;
}

interface SpandrelFrame {
  spandrel: MasonryWallSpandrelModel;
  element: FrameElement2DTimoshenkoRigidOffsets;
  snapshot: SpandrelFrameSnapshot;
}

interface RingFrameSnapshot {
  id: string;
  openingId: string;
  frameCount: number;
  equivalentParallelFrames: number;
  topNodeIds: string[];
  nodeIds: string[];
  elementIds: unknown[];
  supportIds: string[];
  baseCondition: unknown;
  includeBottomBeam: unknown;
}

interface RingFrame {
  opening: SanitizedAlignmentOpening;
  frameCount: number;
  nodes: Node[];
  elements: SteelRingFrame2DBuilderResult["elements"];
  supports: Support[];
  topNodes: Node[];
  snapshot: RingFrameSnapshot;
  assumptions: string[];
  warnings: string[];
}

interface MasonryEquivalentFrameBuildOptions extends JsonRecord {
  topRotation?: unknown;
  includeSpandrels?: unknown;
  includeDiaphragm?: unknown;
  includeRingFrames?: unknown;
  materialResolution?: AlignmentMechanicalStateOptions;
}

export interface MasonryEquivalentFrameBuilderBuildInput {
  alignment?: MasonryWallOpeningsModel | null;
  stage?: string;
  options?: MasonryEquivalentFrameBuildOptions;
  sanitizedOpenings?: readonly SanitizedAlignmentOpening[] | null;
  extractedMembers?: EquivalentFrameMembersResult | null;
  resolvedAlignmentState?: AlignmentMechanicalStateResolution | null;
}

export interface MasonryEquivalentFrameBuilderResult {
  id: string;
  stage: string;
  topRotation: TopRotation;
  model: {
    id: string;
    units: UnitSystem;
    nodes: Node[];
    elements: Array<
      FrameElement2DTimoshenkoRigidOffsets | SteelRingFrame2DBuilderResult["elements"][number]
    >;
    supports: Support[];
    constraints: FrameConstraint[];
    loads: unknown[];
  };
  pierFrames: PierFrameSnapshot[];
  spandrelFrames: SpandrelFrameSnapshot[];
  ringFrameFrames: RingFrameSnapshot[];
  dofRegistry: DofRegistry;
  snapshot: JsonRecord;
  warnings: string[];
  assumptions: string[];
  createSolver(): LinearStaticSolver2D;
}

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === "object";
}

function read(value: unknown, key: string): unknown {
  return isRecord(value) ? value[key] : undefined;
}

function stringifySourceValue(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "object") return Object.prototype.toString.call(value);
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "bigint" ||
    typeof value === "symbol"
  ) {
    return value.toString();
  }
  return Object.prototype.toString.call(value);
}

function stringifyTemplateValue(value: unknown): string {
  if (typeof value === "symbol") {
    throw new TypeError("Cannot convert a Symbol value to a string");
  }
  return stringifySourceValue(value);
}

function normalizeTopRotation(value: unknown = "free"): TopRotation {
  const normalized = stringifySourceValue(value).trim().toLowerCase();
  const aliases = new Map<string, TopRotation>([
    ["free", "free"],
    ["libera", "free"],
    ["hinged", "free"],
    ["fixed", "fixed"],
    ["fissa", "fixed"],
    ["incastrata", "fixed"],
    ["clamped", "fixed"],
  ]);
  const resolved = aliases.get(normalized);

  if (!resolved) {
    throw new Error(
      `Unsupported equivalent-frame topRotation option: ${stringifyTemplateValue(value)}.`,
    );
  }

  return resolved;
}

function serializeFrame(
  nodes: readonly Node[],
  elements: ReadonlyArray<
    FrameElement2DTimoshenkoRigidOffsets | SteelRingFrame2DBuilderResult["elements"][number]
  >,
  supports: readonly Support[],
  constraints: readonly FrameConstraint[] = [],
  loads: readonly unknown[] = [],
): JsonRecord {
  return {
    nodes: nodes.map((node) => node.toJSON()),
    elements: elements.map((element) => element.toJSON()),
    supports: supports.map((support) => support.toJSON()),
    constraints: constraints.map((constraint) => ({ ...constraint })),
    loads: [...loads],
  };
}

function resolvePierCenterX(pier: MasonryWallPierModel): number {
  const effectiveLength =
    Number.isFinite(pier.effectiveLength) && pier.effectiveLength > EPS
      ? pier.effectiveLength
      : pier.length;
  const leftReduction =
    typeof pier.metadata.leftReduction === "number" ? pier.metadata.leftReduction : 0;

  return pier.x + leftReduction + effectiveLength / 2;
}

function average(values: readonly number[] = []): number {
  const finiteValues = values.filter((value) => Number.isFinite(value));

  if (finiteValues.length === 0) return 0;
  return finiteValues.reduce((sum, value) => sum + value, 0) / finiteValues.length;
}

function sameCoordinate(left: number, right: number): boolean {
  return Math.abs(left - right) <= EPS;
}

function createDiaphragmControlNode({
  alignment,
  topNodes = [],
}: {
  alignment: MasonryWallOpeningsModel;
  topNodes?: readonly Node[];
}): Node {
  return new Node({
    id: `${alignment.id}-diaphragm-control`,
    x: average(topNodes.map((node) => node.x)),
    y: Math.max(...topNodes.map((node) => node.y)),
    units: alignment.units,
    metadata: { role: "diaphragm-control", sourceAlignmentId: alignment.id },
  });
}

function buildPierFrameMember({
  alignment,
  pier,
  topRotation,
}: {
  alignment: MasonryWallOpeningsModel;
  pier: MasonryWallPierModel;
  topRotation: TopRotation;
}): PierFrame {
  const effectiveLength =
    Number.isFinite(pier.effectiveLength) && pier.effectiveLength > EPS
      ? pier.effectiveLength
      : pier.length;
  const pierModel = new MasonryPierModel({
    id: `${pier.id}-fem`,
    units: alignment.units,
    geometry: {
      baseX: resolvePierCenterX(pier),
      baseY: 0,
      height: pier.height,
      length: effectiveLength,
      thickness: pier.thickness,
    },
    material: pier.material,
    idealization: {
      rigidEndZoneBottom: pier.rigidBottomLength,
      rigidEndZoneTop: pier.rigidTopLength,
      elementClass: "frame-2d-timoshenko-rigid-offsets",
    },
    metadata: {
      sourcePierId: pier.id,
      alignmentId: pier.alignmentId,
      topBoundaryMode: topRotation,
    },
  });
  const rigidities: MasonryPierEquivalentFrameRigidities =
    pierModel.resolvedEquivalentFrameRigidities();
  const toFem = createUnitResolver(pierModel.units, FEM_UNITS);
  const femEffectiveLength = toFem.length(pierModel.geometry.length);
  const femDeformableHeight = toFem.length(pierModel.deformableHeight());
  const femRigidBottomLength = toFem.length(pierModel.idealization.rigidEndZoneBottom);
  const femRigidTopLength = toFem.length(pierModel.idealization.rigidEndZoneTop);
  const baseNode = new Node({
    id: `${pier.id}-base`,
    x: pierModel.geometry.baseX,
    y: pierModel.geometry.baseY,
    units: pierModel.units,
    metadata: { role: "base", sourcePierId: pier.id, alignmentId: pier.alignmentId },
  });
  const topNode = new Node({
    id: `${pier.id}-top`,
    x: pierModel.geometry.baseX,
    y: pierModel.geometry.baseY + pierModel.geometry.height,
    units: pierModel.units,
    metadata: { role: "top", sourcePierId: pier.id, alignmentId: pier.alignmentId },
  });
  const element = new FrameElement2DTimoshenkoRigidOffsets({
    id: `${pier.id}-element`,
    startNode: baseNode,
    endNode: topNode,
    axialRigidity: toFem.force(rigidities.axialRigidity),
    flexuralRigidity:
      rigidities.flexuralRigidity === null
        ? null
        : toFem.convert(rigidities.flexuralRigidity, {
            forceExponent: 1,
            lengthExponent: 2,
          }),
    shearRigidity: toFem.force(rigidities.shearRigidity),
    shearCorrectionFactor: rigidities.shearCorrectionFactor,
    rigidStartOffset: femRigidBottomLength,
    rigidEndOffset: femRigidTopLength,
    metadata: {
      role: "pier",
      sourcePierId: pier.id,
      wallId: pier.wallId,
      alignmentId: pier.alignmentId,
      topBoundaryMode: topRotation,
      deformableHeight: femDeformableHeight,
      effectiveLength: femEffectiveLength,
    },
  });
  const supports = [
    new Support({
      id: `${pier.id}-base-fix`,
      node: baseNode,
      restraints: { ux: true, uy: true, rz: true },
      metadata: { role: "base-fix", sourcePierId: pier.id, topBoundaryMode: topRotation },
    }),
  ];

  if (topRotation === "fixed") {
    supports.push(
      new Support({
        id: `${pier.id}-top-rot-fix`,
        node: topNode,
        restraints: { rz: true },
        metadata: { role: "top-rotation-fix", sourcePierId: pier.id, topBoundaryMode: topRotation },
      }),
    );
  }

  return {
    pierModel,
    pier,
    nodes: [baseNode, topNode],
    element,
    supports,
    snapshot: {
      id: pier.id,
      wallId: pier.wallId,
      topBoundaryMode: topRotation,
      baseNodeId: baseNode.id,
      topNodeId: topNode.id,
      elementId: element.id,
      effectiveLength: femEffectiveLength,
      deformableHeight: femDeformableHeight,
      rigidBottomLength: femRigidBottomLength,
      rigidTopLength: femRigidTopLength,
    },
  };
}

function resolveSpandrelRigidities({
  alignment,
  spandrel,
  warnings,
}: {
  alignment: MasonryWallOpeningsModel;
  spandrel: MasonryWallSpandrelModel;
  warnings: string[];
}): {
  axialRigidity: number;
  flexuralRigidity: number;
  shearRigidity: number;
  shearCorrectionFactor: number;
} | null {
  const elasticModulus = resolveMasonryMaterialProperty({
    material: spandrel.material,
    aliases: ["E", "elasticModulus"],
    targetUnits: alignment.units,
  });
  const shearModulus = resolveMasonryMaterialProperty({
    material: spandrel.material,
    aliases: ["G", "shearModulus"],
    targetUnits: alignment.units,
  });
  const area = spandrel.height * spandrel.thickness;
  const inertia = (spandrel.thickness * spandrel.height ** 3) / 12;

  if (
    typeof elasticModulus !== "number" ||
    !Number.isFinite(elasticModulus) ||
    elasticModulus <= EPS
  ) {
    warnings.push(
      `Spandrel ${spandrel.id} could not resolve a finite masonry elastic modulus and was skipped in the equivalent-frame assembly.`,
    );
    return null;
  }
  if (typeof shearModulus !== "number" || !Number.isFinite(shearModulus) || shearModulus <= EPS) {
    warnings.push(
      `Spandrel ${spandrel.id} could not resolve a finite masonry shear modulus and was skipped in the equivalent-frame assembly.`,
    );
    return null;
  }

  return {
    axialRigidity: elasticModulus * area,
    flexuralRigidity: elasticModulus * inertia,
    shearRigidity: shearModulus * area,
    shearCorrectionFactor: SHEAR_CORRECTION_FACTOR,
  };
}

function findAdjacentPierFrame({
  pierFrames,
  spandrel,
  side,
}: {
  pierFrames: readonly PierFrame[];
  spandrel: MasonryWallSpandrelModel;
  side: "left" | "right";
}): PierFrame | undefined {
  if (side === "left") {
    return pierFrames.find((frame) => {
      const xEnd = frame.pier.metadata.xEnd;
      return typeof xEnd === "number" && sameCoordinate(xEnd, spandrel.xStart);
    });
  }

  return pierFrames.find((frame) => sameCoordinate(frame.pier.x, spandrel.xEnd));
}

function findFrameNode(frame: PierFrame, nodeId: string): Node | null {
  return frame.nodes.find((node) => node.id === nodeId) ?? null;
}

function buildSpandrelFrameMember({
  alignment,
  spandrel,
  pierFrames,
  warnings,
}: {
  alignment: MasonryWallOpeningsModel;
  spandrel: MasonryWallSpandrelModel;
  pierFrames: readonly PierFrame[];
  warnings: string[];
}): SpandrelFrame | null {
  const leftPierFrame = findAdjacentPierFrame({ pierFrames, spandrel, side: "left" });
  const rightPierFrame = findAdjacentPierFrame({ pierFrames, spandrel, side: "right" });

  if (!leftPierFrame || !rightPierFrame) {
    warnings.push(
      `Spandrel ${spandrel.id} could not find both adjacent pier top nodes and was skipped in the equivalent-frame assembly.`,
    );
    return null;
  }

  const startNode = findFrameNode(leftPierFrame, leftPierFrame.snapshot.topNodeId);
  const endNode = findFrameNode(rightPierFrame, rightPierFrame.snapshot.topNodeId);

  if (!startNode || !endNode) {
    warnings.push(
      `Spandrel ${spandrel.id} could not resolve both adjacent pier top nodes and was skipped in the equivalent-frame assembly.`,
    );
    return null;
  }

  const toFem = createUnitResolver(alignment.units, FEM_UNITS);
  const physicalLength = endNode.x - startNode.x;
  const rigidLeftLength = Math.max(0, spandrel.xStart - startNode.x);
  const rigidRightLength = Math.max(0, endNode.x - spandrel.xEnd);
  const yStart = spandrel.metadata.yStart;
  const deformableAxisY =
    typeof yStart === "number" && Number.isFinite(yStart)
      ? yStart + spandrel.height / 2
      : startNode.y;
  const referenceStartNode = {
    id: `${spandrel.id}-deformable-start`,
    x: toFem.length(spandrel.xStart),
    y: toFem.length(deformableAxisY),
  };
  const referenceEndNode = {
    id: `${spandrel.id}-deformable-end`,
    x: toFem.length(spandrel.xEnd),
    y: toFem.length(deformableAxisY),
  };
  const deformableLength = referenceEndNode.x - referenceStartNode.x;

  if (
    physicalLength <= EPS ||
    deformableLength <= EPS ||
    Math.abs(deformableLength - spandrel.deformableLength) > 1e-6
  ) {
    warnings.push(
      `Spandrel ${spandrel.id} could not be assembled with a positive deformable length matching the underlying opening and was skipped.`,
    );
    return null;
  }

  const rigidities = resolveSpandrelRigidities({ alignment, spandrel, warnings });
  if (!rigidities) return null;

  const element = new FrameElement2DTimoshenkoRigidOffsets({
    id: `${spandrel.id}-element`,
    startNode,
    endNode,
    axialRigidity: toFem.force(rigidities.axialRigidity),
    flexuralRigidity: toFem.convert(rigidities.flexuralRigidity, {
      forceExponent: 1,
      lengthExponent: 2,
    }),
    shearRigidity: toFem.force(rigidities.shearRigidity),
    shearCorrectionFactor: rigidities.shearCorrectionFactor,
    rigidStartOffset: toFem.length(rigidLeftLength),
    rigidEndOffset: toFem.length(rigidRightLength),
    referenceStartNode,
    referenceEndNode,
    metadata: {
      role: "spandrel",
      sourceSpandrelId: spandrel.id,
      referenceOpeningId: spandrel.metadata.referenceOpeningId ?? null,
      sourceWallIds: [...spandrel.sourceWallIds],
      alignmentId: spandrel.alignmentId,
      deformableLength: toFem.length(spandrel.deformableLength),
      deformableAxisY: toFem.length(deformableAxisY),
      sectionHeight: toFem.length(spandrel.height),
      thickness: toFem.length(spandrel.thickness),
    },
  });

  return {
    spandrel,
    element,
    snapshot: {
      id: spandrel.id,
      sourceWallIds: [...spandrel.sourceWallIds],
      referenceOpeningId: spandrel.metadata.referenceOpeningId ?? null,
      startNodeId: startNode.id,
      endNodeId: endNode.id,
      elementId: element.id,
      xStart: toFem.length(spandrel.xStart),
      xEnd: toFem.length(spandrel.xEnd),
      deformableLength: toFem.length(spandrel.deformableLength),
      rigidLeftLength: toFem.length(rigidLeftLength),
      rigidRightLength: toFem.length(rigidRightLength),
      deformableAxisY: toFem.length(deformableAxisY),
      height: toFem.length(spandrel.height),
      thickness: toFem.length(spandrel.thickness),
    },
  };
}

function resolveRingFrameCount(ringFrame: unknown): number {
  const candidates = [
    read(ringFrame, "frameCount"),
    read(ringFrame, "parallelFrameCount"),
    read(ringFrame, "framesInThickness"),
    read(ringFrame, "parallelFrames"),
    read(ringFrame, "count"),
  ];
  const declared = candidates.find((value) => Number.isFinite(Number(value)));

  return Math.max(1, Math.round(Number(declared ?? 1)));
}

function sectionInput(value: unknown): SteelRingFrameSectionInput {
  if (value === null || value === undefined || typeof value === "string") return value;
  if (value instanceof SteelProfileSection) return value;
  if (isRecord(value)) {
    const profileName = value.profileName;
    const options: SteelProfileSectionOptions = {};
    if (typeof profileName === "string" || profileName === null) {
      options.profileName = profileName;
    }
    return options;
  }
  return null;
}

function materialInput(
  value: unknown,
): SteelRingFrameMaterialInput | SteelMaterial | string | null {
  if (value === null || value === undefined || typeof value === "string") return value ?? null;
  if (value instanceof SteelMaterial) return value;
  if (!isRecord(value)) return null;

  const result: SteelRingFrameMaterialInput = {};
  const id = value.id;
  const name = value.name;
  const category = value.category;
  const grade = value.grade;
  if (typeof id === "string" || id === null) result.id = id;
  if (typeof name === "string") result.name = name;
  if (typeof category === "string") result.category = category;
  if (typeof grade === "string") result.grade = grade;
  const numericKeys = [
    "fyMean",
    "ftMean",
    "fyk",
    "fyd",
    "ftk",
    "elongationCharacteristic",
    "ultimateStrain",
    "density",
    "elasticModulus",
    "shearModulus",
    "poissonRatio",
    "gammaM0",
  ] as const;
  for (const key of numericKeys) {
    const candidate = value[key];
    if (typeof candidate === "number" || candidate === null) result[key] = candidate;
  }
  if (isRecord(value.units)) {
    const units = value.units;
    if (
      (units.force === undefined ||
        units.force === "N" ||
        units.force === "kN" ||
        units.force === "MN") &&
      (units.length === undefined ||
        units.length === "m" ||
        units.length === "dm" ||
        units.length === "cm" ||
        units.length === "mm")
    ) {
      result.units = {
        ...(units.force === undefined ? {} : { force: units.force }),
        ...(units.length === undefined ? {} : { length: units.length }),
      };
    }
  }
  if (isRecord(value.metadata)) result.metadata = value.metadata;
  return result;
}

function resolveRingFrameSections(
  ringFrame: unknown = {},
): SteelRingFrameMemberSectionsInput | null {
  const memberSections = read(ringFrame, "memberSections");
  if (isRecord(memberSections)) {
    const columns =
      memberSections.columns ?? memberSections.column ?? memberSections.columnProfileName;
    const topBeam = memberSections.topBeam ?? memberSections.architrave;
    const bottomBeam = memberSections.bottomBeam ?? memberSections.bottomChord;
    return {
      leftColumn: sectionInput(memberSections.leftColumn ?? columns),
      rightColumn: sectionInput(memberSections.rightColumn ?? columns),
      topBeam: sectionInput(topBeam),
      bottomBeam: sectionInput(bottomBeam),
    };
  }

  const defaultProfile =
    read(ringFrame, "profileName") ??
    read(ringFrame, "profile") ??
    read(ringFrame, "sectionProfileName") ??
    read(ringFrame, "columnProfileName") ??
    read(ringFrame, "topBeamProfileName") ??
    null;
  const columns =
    read(ringFrame, "columns") ??
    read(ringFrame, "column") ??
    read(ringFrame, "columnProfileName") ??
    defaultProfile;
  const topBeam =
    read(ringFrame, "topBeam") ??
    read(ringFrame, "architrave") ??
    read(ringFrame, "topBeamProfileName") ??
    defaultProfile;
  const bottomBeam =
    read(ringFrame, "bottomBeam") ??
    read(ringFrame, "bottomChord") ??
    read(ringFrame, "bottomBeamProfileName") ??
    topBeam;

  if (!columns || !topBeam) return null;
  return {
    leftColumn: sectionInput(read(ringFrame, "leftColumn") ?? columns),
    rightColumn: sectionInput(read(ringFrame, "rightColumn") ?? columns),
    topBeam: sectionInput(topBeam),
    bottomBeam: sectionInput(bottomBeam),
  };
}

function orientationInput(value: unknown): string | JsonRecord | null | undefined {
  if (typeof value === "string" || value === null || value === undefined) return value;
  return isRecord(value) ? value : undefined;
}

function resolveRingFrameMemberOrientations(
  ringFrame: unknown = {},
): SteelRingFrameMemberOrientationsInput {
  const orientations =
    read(ringFrame, "memberOrientations") ??
    read(ringFrame, "memberOrientation") ??
    read(ringFrame, "sectionOrientations") ??
    read(ringFrame, "sectionOrientation") ??
    read(ringFrame, "orientations") ??
    read(ringFrame, "orientation") ??
    {};

  if (typeof orientations === "string") {
    return { columns: orientations, topBeam: orientations, bottomBeam: orientations };
  }

  return {
    leftColumn: orientationInput(
      read(orientations, "leftColumn") ??
        read(orientations, "leftPier") ??
        read(ringFrame, "leftColumnOrientation"),
    ),
    rightColumn: orientationInput(
      read(orientations, "rightColumn") ??
        read(orientations, "rightPier") ??
        read(ringFrame, "rightColumnOrientation"),
    ),
    columns: orientationInput(
      read(orientations, "columns") ??
        read(orientations, "column") ??
        read(ringFrame, "columnOrientation") ??
        read(ringFrame, "columnsOrientation"),
    ),
    topBeam: orientationInput(
      read(orientations, "topBeam") ??
        read(orientations, "architrave") ??
        read(ringFrame, "topBeamOrientation") ??
        read(ringFrame, "architraveOrientation"),
    ),
    bottomBeam: orientationInput(
      read(orientations, "bottomBeam") ??
        read(orientations, "bottomChord") ??
        read(ringFrame, "bottomBeamOrientation") ??
        read(ringFrame, "bottomChordOrientation"),
    ),
  };
}

function scaleRingFrameElement(
  element: SteelRingFrame2DBuilderResult["elements"][number],
  factor: number,
): void {
  if (!Number.isFinite(factor) || factor <= 1) return;
  element.axialRigidity *= factor;
  element.flexuralRigidity *= factor;
  element.plasticMomentStart *= factor;
  element.plasticMomentEnd *= factor;
  if (element.elasticElement) {
    Object.assign(element.elasticElement, {
      axialRigidity: element.axialRigidity,
      flexuralRigidity: element.flexuralRigidity,
    });
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function buildRingFrameMembers({
  alignment,
  openings = [],
  warnings,
}: {
  alignment: MasonryWallOpeningsModel;
  openings?: readonly SanitizedAlignmentOpening[];
  warnings: string[];
}): RingFrame[] {
  const ringFrameBuilder = new SteelRingFrame2DBuilder();
  const frames: Array<RingFrame | null> = openings.map((opening) => {
    const ringFrame = opening.ringFrame;
    if (!ringFrame) return null;
    const memberSections = resolveRingFrameSections(ringFrame);
    const frameCount = resolveRingFrameCount(ringFrame);

    if (!memberSections) {
      warnings.push(
        `Opening ${opening.id} has a ringFrame definition but no member sections/profile names, so the steel ring frame was skipped in the equivalent-frame FEM assembly.`,
      );
      return null;
    }

    const modelId = `${alignment.id}-ring-frame-${opening.id}`;
    try {
      const material =
        read(ringFrame, "material") ??
        read(ringFrame, "materialGrade") ??
        read(ringFrame, "grade") ??
        "S275";
      const baseCondition =
        read(ringFrame, "baseCondition") ??
        (read(ringFrame, "includeBottomBeam") ? "pinned-base-with-bottom-beam" : "fixed-base");
      const loading = {
        controlNode: read(ringFrame, "controlNode") ?? "top-left",
        referenceHorizontalForce:
          read(ringFrame, "referenceHorizontalForce") ??
          read(ringFrame, "horizontalForce") ??
          read(ringFrame, "Fh") ??
          1,
      };
      const frame = ringFrameBuilder.build({
        model: {
          id: modelId,
          units: alignment.units,
          geometry: {
            clearWidth: opening.width,
            clearHeight: opening.height,
            originX: opening.x,
            originY: opening.y,
          },
          memberSections,
          memberOrientations: resolveRingFrameMemberOrientations(ringFrame),
          material: materialInput(material),
          baseCondition: typeof baseCondition === "string" ? baseCondition : null,
          includeBottomBeam: Boolean(read(ringFrame, "includeBottomBeam")),
          loading: {
            controlNode: typeof loading.controlNode === "string" ? loading.controlNode : "top-left",
            referenceHorizontalForce:
              typeof loading.referenceHorizontalForce === "number"
                ? loading.referenceHorizontalForce
                : 1,
          },
        },
      });
      const topNodes = frame.nodes.filter((node) =>
        ["top-left", "top-right"].includes(
          typeof node.metadata.role === "string" ? node.metadata.role : "",
        ),
      );
      frame.nodes.forEach((node) => {
        Object.assign(node.metadata, {
          sourceOpeningId: opening.id,
          sourceRingFrameId: modelId,
          ringFrameCount: frameCount,
        });
      });
      frame.elements.forEach((element) => {
        scaleRingFrameElement(element, frameCount);
        Object.assign(element.metadata, {
          sourceOpeningId: opening.id,
          sourceRingFrameId: modelId,
          ringFrameCount: frameCount,
          equivalentParallelFrames: frameCount,
        });
      });
      frame.supports.forEach((support) => {
        Object.assign(support.metadata, {
          sourceOpeningId: opening.id,
          sourceRingFrameId: modelId,
          ringFrameCount: frameCount,
        });
      });

      return {
        opening,
        frameCount,
        nodes: frame.nodes,
        elements: frame.elements,
        supports: frame.supports,
        topNodes,
        snapshot: {
          id: modelId,
          openingId: opening.id,
          frameCount,
          equivalentParallelFrames: frameCount,
          topNodeIds: topNodes.map((node) => node.id),
          nodeIds: frame.nodes.map((node) => node.id),
          elementIds: frame.elements.map((element) => element.id),
          supportIds: frame.supports.map((support) => support.id),
          baseCondition: frame.snapshot.metadata.baseCondition,
          includeBottomBeam: frame.snapshot.metadata.includeBottomBeam,
        },
        assumptions: frame.assumptions,
        warnings: frame.warnings,
      };
    } catch (error: unknown) {
      warnings.push(
        `Opening ${opening.id} steel ring frame could not be assembled in the equivalent-frame FEM model: ${errorMessage(error)}`,
      );
      return null;
    }
  });

  return frames.filter((frame): frame is RingFrame => frame !== null);
}

export class MasonryEquivalentFrameBuilder {
  build({
    alignment,
    stage = "design",
    options = {},
    sanitizedOpenings = null,
    extractedMembers = null,
    resolvedAlignmentState = null,
  }: MasonryEquivalentFrameBuilderBuildInput = {}): MasonryEquivalentFrameBuilderResult {
    if (!alignment) {
      throw new Error("MasonryEquivalentFrameBuilder requires an alignment model.");
    }

    const warnings: string[] = [];
    const topRotation = normalizeTopRotation(options.topRotation ?? "free");
    const includeSpandrels = Boolean(options.includeSpandrels);
    const includeDiaphragm = Boolean(options.includeDiaphragm);
    const includeRingFrames = options.includeRingFrames !== false;
    const assumptions = [
      includeSpandrels
        ? "The wall-level FEM builder assembles one vertical 2D Timoshenko element with rigid end offsets for each extracted masonry pier and one linear elastic Timoshenko element for each assemblable masonry spandrel."
        : includeDiaphragm
          ? "The wall-level FEM builder assembles one vertical 2D Timoshenko element with rigid end offsets for each extracted masonry pier, without spandrels and with an optional top diaphragm master node that ties only the ux DOF of the pier heads."
          : "The wall-level FEM builder assembles one vertical 2D Timoshenko element with rigid end offsets for each extracted masonry pier, without spandrels or diaphragm coupling between top nodes.",
      "Each pier keeps a fully fixed base; the requested topRotation option is represented only through the rotational restraint at the corresponding top node.",
      "The resulting frame is intended as the validation scaffold for wall alignments before introducing non-linear masonry spandrel mechanisms.",
    ];
    const materialResolution = options.materialResolution;
    const mechanicalState =
      resolvedAlignmentState ??
      resolveAlignmentMechanicalState({
        alignment,
        stage,
        options: materialResolution ?? options,
      });
    const resolvedAlignment = mechanicalState.alignment;
    const resolvedSanitizedOpenings =
      sanitizedOpenings ?? sanitizeAlignmentOpenings({ alignment: resolvedAlignment }).openings;
    const extracted =
      extractedMembers ??
      extractEquivalentFrameMembers({
        alignment: resolvedAlignment,
        sanitizedOpenings: resolvedSanitizedOpenings,
      });

    if (!includeSpandrels && extracted.spandrels.length > 0) {
      warnings.push(
        `The equivalent-frame builder found ${extracted.spandrels.length} spandrel candidate(s), but they are intentionally ignored in this first pier-only FEM milestone.`,
      );
    }

    const pierFrames = extracted.piers.map((pier) =>
      buildPierFrameMember({ alignment: resolvedAlignment, pier, topRotation }),
    );
    const spandrelFrames = includeSpandrels
      ? extracted.spandrels
          .map((spandrel) =>
            buildSpandrelFrameMember({
              alignment: resolvedAlignment,
              spandrel,
              pierFrames,
              warnings,
            }),
          )
          .filter((frame): frame is SpandrelFrame => frame !== null)
      : [];
    const ringFrameFrames = includeRingFrames
      ? buildRingFrameMembers({
          alignment: resolvedAlignment,
          openings: resolvedSanitizedOpenings,
          warnings,
        })
      : [];

    if (
      !includeRingFrames &&
      resolvedSanitizedOpenings.some((opening) => Boolean(opening.ringFrame))
    ) {
      warnings.push(
        "The equivalent-frame builder found ringFrame definitions, but includeRingFrames is disabled and they were skipped in the FEM assembly.",
      );
    }

    const nodes = pierFrames.flatMap((frame) => frame.nodes);
    nodes.push(...ringFrameFrames.flatMap((frame) => frame.nodes));
    const elements: MasonryEquivalentFrameBuilderResult["model"]["elements"] = [
      ...pierFrames.map((frame) => frame.element),
      ...spandrelFrames.map((frame) => frame.element),
      ...ringFrameFrames.flatMap((frame) => frame.elements),
    ];
    const supports = [
      ...pierFrames.flatMap((frame) => frame.supports),
      ...ringFrameFrames.flatMap((frame) => frame.supports),
    ];
    const constraints: FrameConstraint[] = [];
    const loads: unknown[] = [];
    let diaphragmControlNode: Node | null = null;
    const pierTopNodes = pierFrames
      .map((frame) => frame.nodes.find((node) => node.id === frame.snapshot.topNodeId))
      .filter((node): node is Node => node !== undefined);
    const ringFrameTopNodes = ringFrameFrames.flatMap((frame) => frame.topNodes);
    const diaphragmNodes = [...pierTopNodes, ...ringFrameTopNodes];

    if (includeDiaphragm && diaphragmNodes.length > 0) {
      diaphragmControlNode = createDiaphragmControlNode({
        alignment: resolvedAlignment,
        topNodes: diaphragmNodes,
      });
      nodes.push(diaphragmControlNode);
      supports.push(
        new Support({
          id: `${resolvedAlignment.id}-diaphragm-guide`,
          node: diaphragmControlNode,
          restraints: { uy: true, rz: true },
          metadata: { role: "diaphragm-guide", sourceAlignmentId: resolvedAlignment.id },
        }),
      );
      constraints.push(
        ...diaphragmNodes.map(
          (node, index): FrameConstraint => ({
            id: `${resolvedAlignment.id}-diaphragm-ux-link-${index + 1}`,
            type: "equal-dof",
            masterNodeId: diaphragmControlNode?.id ?? "",
            slaveNodeId: node.id,
            dof: "ux",
            scale: 1,
            offset: 0,
            metadata: { role: "top-diaphragm-ux", sourceAlignmentId: resolvedAlignment.id },
          }),
        ),
      );
      assumptions.push(
        "When includeDiaphragm is enabled, the builder creates a master diaphragm control node and ties the horizontal ux DOF of each pier top node and steel ring-frame top node to that master through equal-DOF constraints; vertical translations and rotations remain local.",
      );
    }

    if (spandrelFrames.length > 0) {
      assumptions.push(
        "Each explicit spandrel connects the top nodes of the two adjacent piers; the deformable portion is the opening width, while the distances from pier axes to opening edges are represented as rigid end offsets.",
      );
    }
    if (ringFrameFrames.length > 0) {
      assumptions.push(
        "Each steel ring frame declared on an opening is assembled into the global FEM model with its own jamb and architrave elements; multiple identical parallel frames are condensed into one equivalent steel frame by scaling stiffness and plastic moments.",
      );
    }

    const frameType =
      ringFrameFrames.length > 0
        ? spandrelFrames.length > 0
          ? "pier-spandrel-ring-frame"
          : "pier-ring-frame"
        : spandrelFrames.length > 0
          ? "pier-spandrel"
          : "pier-only";
    const dofRegistry = new DofRegistry();
    dofRegistry.registerNodes(nodes);
    dofRegistry.registerElements(elements);
    dofRegistry.registerNodes(
      supports
        .map((support) => support.node)
        .filter((node): node is Pick<Node, "id"> => node !== null),
    );

    const id = `${resolvedAlignment.id}-equivalent-frame`;
    return {
      id,
      stage,
      topRotation,
      model: { id, units: FEM_UNITS, nodes, elements, supports, constraints, loads },
      pierFrames: pierFrames.map((frame) => frame.snapshot),
      spandrelFrames: spandrelFrames.map((frame) => frame.snapshot),
      ringFrameFrames: ringFrameFrames.map((frame) => frame.snapshot),
      dofRegistry,
      snapshot: {
        id,
        units: FEM_UNITS,
        ...serializeFrame(nodes, elements, supports, constraints, loads),
        metadata: {
          sourceAlignmentId: resolvedAlignment.id,
          stage,
          topRotation,
          includeSpandrels,
          includeRingFrames,
          includeDiaphragm,
          frameType,
          pierCount: pierFrames.length,
          spandrelCount: spandrelFrames.length,
          ringFrameCount: ringFrameFrames.length,
          ringFramePhysicalCount: ringFrameFrames.reduce(
            (sum, frame) => sum + (frame.snapshot.frameCount ?? 1),
            0,
          ),
          ringFrameOpeningCount: new Set(ringFrameFrames.map((frame) => frame.snapshot.openingId))
            .size,
          ignoredSpandrelCount: extracted.spandrels.length - spandrelFrames.length,
          topNodeIds: pierFrames.map((frame) => frame.snapshot.topNodeId),
          pierTopNodeIds: pierTopNodes.map((node) => node.id),
          ringFrameTopNodeIds: ringFrameTopNodes.map((node) => node.id),
          diaphragmNodeIds: diaphragmNodes.map((node) => node.id),
          diaphragmControlNodeId: diaphragmControlNode?.id ?? null,
        },
      },
      warnings: [
        ...warnings,
        ...ringFrameFrames.flatMap((frame) => frame.warnings ?? []),
        ...mechanicalState.warnings,
        ...extracted.warnings,
      ],
      assumptions: [...assumptions, ...mechanicalState.assumptions, ...extracted.assumptions],
      createSolver() {
        return new LinearStaticSolver2D();
      },
    };
  }
}
