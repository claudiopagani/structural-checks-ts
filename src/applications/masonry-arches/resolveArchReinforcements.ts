import {
  cross2d,
  dot2d,
  norm2d,
  normalize2d,
  scale2d,
  subtract2d,
} from "../../domain/masonry/rigid-blocks/vector2d.js";
import type {
  RigidBlockPoint2D,
  RigidBlockVector2D,
} from "../../domain/masonry/rigid-blocks/types.js";
import { assertExplicitUnitSystem, createUnitResolver } from "../../domain/units/UnitSystem.js";
import { evaluateMasonryArchCurveAtStation } from "./geometry.js";
import {
  validateExtradosExternalAnchorGeometry,
  validateOpenTendonTerminalOrder,
} from "./validateExtradosAnchorGeometry.js";
import type {
  ArchContactForceResult,
  ArchDeviceForceResult,
  ArchExternalAnchorForceResult,
  ArchReinforcementDeviceGeometryResult,
  ArchReinforcementSegmentResult,
  ArchReinforcementSegmentRole,
  ArchReinforcementStateResult,
  MasonryArchBlockLoadResult,
  MasonryArchPrescribedConfigurationInput,
  NormalizedArchReinforcement,
  NormalizedMasonryArchGeometry,
  NormalizedMasonryArchBlockDisplacement,
  NormalizedMasonryArchModel,
} from "./types.js";

const GAUSS_NODES = [
  0.1834346424956498, 0.525532409916329, 0.7966664774136267, 0.9602898564975363,
] as const;
const GAUSS_WEIGHTS = [
  0.362683783378362, 0.3137066458778873, 0.2223810344533745, 0.1012285362903763,
] as const;

interface SideArcStationing {
  readonly totalLength: number;
  readonly referenceStationAtLength: (sideArcLength: number) => number;
}

export interface NormalizedMasonryArchConfiguration {
  readonly displacementsByBlockId: ReadonlyMap<string, NormalizedMasonryArchBlockDisplacement>;
}

interface PathNodeAttachment {
  readonly blockIndex: number;
  readonly share: number;
  readonly referencePoint: RigidBlockPoint2D;
  point: RigidBlockPoint2D;
}

interface DeviceDescriptor {
  readonly kind: ArchReinforcementDeviceGeometryResult["kind"];
  readonly terminationSide: "left" | "right" | null;
  readonly index: number | null;
}

interface MutablePathNode {
  /** Side arc length from the left springing; null for external anchors. */
  sideArcStation: number | null;
  /** Reference-curve station of the arch point; null for external anchors. */
  referenceStation: number | null;
  normalizedSideStation: number | null;
  referencePoint: RigidBlockPoint2D;
  point: RigidBlockPoint2D;
  referenceChainTangent: RigidBlockVector2D | null;
  chainTangent: RigidBlockVector2D | null;
  attachments: readonly PathNodeAttachment[];
  device: DeviceDescriptor | null;
  contact: boolean;
  /** Stable index after ordering, retained when unilateral contact releases this sample. */
  pathIndex: number;
}

interface ResolvedSingleReinforcement {
  readonly state: ArchReinforcementStateResult;
  readonly deviceForces: readonly ArchDeviceForceResult[];
  readonly contactForces: readonly ArchContactForceResult[];
  readonly externalAnchorForces: readonly ArchExternalAnchorForceResult[];
  readonly nodalActions: readonly {
    readonly sourceId: string;
    readonly force: RigidBlockVector2D;
    readonly applications: readonly {
      readonly blockIndex: number;
      readonly share: number;
      readonly point: RigidBlockPoint2D;
    }[];
  }[];
  readonly warnings: readonly string[];
}

export interface ResolvedArchReinforcements {
  readonly reinforcementState: readonly ArchReinforcementStateResult[];
  readonly deviceForces: readonly ArchDeviceForceResult[];
  readonly contactForces: readonly ArchContactForceResult[];
  readonly externalAnchorForces: readonly ArchExternalAnchorForceResult[];
  readonly blockWrenches: readonly MasonryArchBlockLoadResult[];
  readonly warnings: readonly string[];
  readonly hasReinforcementYield: boolean;
  readonly hasReinforcementFailure: boolean;
  readonly hasInvalidContact: boolean;
}

export interface EvaluatedArchReinforcementConfiguration extends ResolvedArchReinforcements {
  readonly blockDisplacements: readonly NormalizedMasonryArchBlockDisplacement[];
  readonly configuration: {
    readonly sourceUnits: NormalizedMasonryArchModel["units"];
    readonly units: NormalizedMasonryArchModel["units"];
    readonly solutionMeaning: "prescribed-configuration-not-equilibrated";
    readonly kinematics: "finite-rigid-block-transformations";
    readonly equilibriumSolved: false;
    readonly jointDeviceInterpolation: "work-conjugate-two-block-average";
  };
}

function integrateSideArcLength(
  geometry: NormalizedMasonryArchGeometry,
  side: "intrados" | "extrados",
  start: number,
  end: number,
): number {
  if (end <= start) return 0;
  const midpoint = (start + end) / 2;
  const halfLength = (end - start) / 2;
  let result = 0;
  for (let index = 0; index < GAUSS_NODES.length; index += 1) {
    const offset = halfLength * GAUSS_NODES[index]!;
    const weight = halfLength * GAUSS_WEIGHTS[index]!;
    result +=
      weight *
      (evaluateMasonryArchCurveAtStation(geometry, midpoint - offset).arcLengthJacobian[side] +
        evaluateMasonryArchCurveAtStation(geometry, midpoint + offset).arcLengthJacobian[side]);
  }
  return result;
}

function createSideArcStationing(
  geometry: NormalizedMasonryArchGeometry,
  side: "intrados" | "extrados",
): SideArcStationing {
  // Integrate and invert directly on the continuous reference curve. No block boundary enters
  // this transformation, so changing voussoirCount cannot move a physical side-arc station.
  const totalReferenceLength = geometry.totalReferenceArcLength;
  const totalLength = integrateSideArcLength(geometry, side, 0, totalReferenceLength);
  const tolerance = 1e-12 * Math.max(1, totalLength);
  return {
    totalLength,
    referenceStationAtLength: (requestedLength: number): number => {
      if (requestedLength <= tolerance) return 0;
      if (requestedLength >= totalLength - tolerance) return totalReferenceLength;
      let lower = 0;
      let upper = totalReferenceLength;
      for (let iteration = 0; iteration < 60; iteration += 1) {
        const trial = (lower + upper) / 2;
        const trialLength = integrateSideArcLength(geometry, side, 0, trial);
        if (trialLength < requestedLength) lower = trial;
        else upper = trial;
      }
      return (lower + upper) / 2;
    },
  };
}

function attachmentsAtStation(
  geometry: NormalizedMasonryArchGeometry,
  referenceStation: number,
  referencePoint: RigidBlockPoint2D,
): PathNodeAttachment[] {
  const tolerance = 1e-10 * Math.max(1, geometry.totalReferenceArcLength);
  const internalInterface = geometry.interfaces.find(
    (item) =>
      item.index > 0 &&
      item.index < geometry.interfaces.length - 1 &&
      Math.abs(item.station - referenceStation) <= tolerance,
  );
  if (internalInterface !== undefined) {
    return [
      {
        blockIndex: internalInterface.index - 1,
        share: 0.5,
        referencePoint,
        point: referencePoint,
      },
      {
        blockIndex: internalInterface.index,
        share: 0.5,
        referencePoint,
        point: referencePoint,
      },
    ];
  }
  if (referenceStation <= tolerance) {
    return [{ blockIndex: 0, share: 1, referencePoint, point: referencePoint }];
  }
  if (referenceStation >= geometry.totalReferenceArcLength - tolerance) {
    return [
      {
        blockIndex: geometry.voussoirs.length - 1,
        share: 1,
        referencePoint,
        point: referencePoint,
      },
    ];
  }
  const block = geometry.voussoirs.find(
    (item) => referenceStation > item.startStation && referenceStation < item.endStation,
  );
  if (block === undefined) {
    throw new Error("Reinforcement path node could not be attached to a masonry voussoir.");
  }
  return [{ blockIndex: block.index, share: 1, referencePoint, point: referencePoint }];
}

function transformPointByBlock(
  geometry: NormalizedMasonryArchGeometry,
  blockIndex: number,
  point: RigidBlockPoint2D,
  configuration: NormalizedMasonryArchConfiguration | null,
): RigidBlockPoint2D {
  const block = geometry.voussoirs[blockIndex]!;
  const displacement = configuration?.displacementsByBlockId.get(block.id);
  if (displacement === undefined) return point;
  const cosine = Math.cos(displacement.rotation);
  const sine = Math.sin(displacement.rotation);
  const relativeX = point.x - block.centroid.x;
  const relativeY = point.y - block.centroid.y;
  return {
    x: block.centroid.x + displacement.translation.x + cosine * relativeX - sine * relativeY,
    y: block.centroid.y + displacement.translation.y + sine * relativeX + cosine * relativeY,
  };
}

function transformVectorByAttachments(
  geometry: NormalizedMasonryArchGeometry,
  attachments: readonly PathNodeAttachment[],
  vector: RigidBlockVector2D,
  configuration: NormalizedMasonryArchConfiguration | null,
): RigidBlockVector2D {
  const transformed = attachments.reduce(
    (sum, attachment) => {
      const block = geometry.voussoirs[attachment.blockIndex]!;
      const rotation = configuration?.displacementsByBlockId.get(block.id)?.rotation ?? 0;
      const cosine = Math.cos(rotation);
      const sine = Math.sin(rotation);
      return {
        x: sum.x + attachment.share * (cosine * vector.x - sine * vector.y),
        y: sum.y + attachment.share * (sine * vector.x + cosine * vector.y),
      };
    },
    { x: 0, y: 0 },
  );
  return normalize2d(transformed, "Deformed reinforcement path frame");
}

function updatePathNodeConfiguration(
  node: MutablePathNode,
  geometry: NormalizedMasonryArchGeometry,
  configuration: NormalizedMasonryArchConfiguration | null,
): void {
  for (const attachment of node.attachments) {
    attachment.point = transformPointByBlock(
      geometry,
      attachment.blockIndex,
      attachment.referencePoint,
      configuration,
    );
  }
  // External anchors carry no block attachments: their point is the fixed global input point and
  // must never be recomputed from an empty attachment set.
  if (node.attachments.length > 0) {
    node.point = node.attachments.reduce(
      (sum, attachment) => ({
        x: sum.x + attachment.share * attachment.point.x,
        y: sum.y + attachment.share * attachment.point.y,
      }),
      { x: 0, y: 0 },
    );
  }
  if (node.referenceChainTangent !== null) {
    node.chainTangent = transformVectorByAttachments(
      geometry,
      node.attachments,
      node.referenceChainTangent,
      configuration,
    );
  }
}

function addArchPathNode(
  nodes: MutablePathNode[],
  geometry: NormalizedMasonryArchGeometry,
  side: "intrados" | "extrados",
  stationing: SideArcStationing,
  sideArcStation: number,
  attributes: {
    readonly device?: DeviceDescriptor;
    readonly contact?: boolean;
  },
): void {
  const tolerance = 1e-10 * Math.max(1, stationing.totalLength);
  const existing = nodes.find(
    (item) =>
      item.sideArcStation !== null && Math.abs(item.sideArcStation - sideArcStation) <= tolerance,
  );
  if (existing !== undefined) {
    if (attributes.device !== undefined) {
      if (existing.device !== null) {
        throw new Error("Two reinforcement devices overlap at one path node.");
      }
      existing.device = attributes.device;
    }
    existing.contact ||= attributes.contact ?? false;
    return;
  }
  const referenceStation = stationing.referenceStationAtLength(sideArcStation);
  const sample = evaluateMasonryArchCurveAtStation(geometry, referenceStation);
  const referencePoint = sample[side];
  nodes.push({
    sideArcStation,
    referenceStation,
    normalizedSideStation: sideArcStation / stationing.totalLength,
    referencePoint,
    point: referencePoint,
    referenceChainTangent: sample.chainTangent,
    chainTangent: sample.chainTangent,
    attachments: attachmentsAtStation(geometry, referenceStation, referencePoint),
    device: attributes.device ?? null,
    contact: attributes.contact ?? false,
    pathIndex: -1,
  });
}

function addExternalPathNode(
  nodes: MutablePathNode[],
  point: RigidBlockPoint2D,
  device: DeviceDescriptor,
): void {
  nodes.push({
    sideArcStation: null,
    referenceStation: null,
    normalizedSideStation: null,
    referencePoint: point,
    point,
    referenceChainTangent: null,
    chainTangent: null,
    attachments: [],
    device,
    contact: false,
    pathIndex: -1,
  });
}

/**
 * Taut-cable contact envelope of an extrados tendon: the cable runs between its two terminal
 * devices along the upper envelope of the whole x-monotone node set, so every released sample
 * lies strictly below the cable and every active contact can be delivered as compression.
 * Terminal devices are pinned on the envelope (they are never popped). Nodes sharing one
 * x-coordinate are ordered by y: a device below a contact sample precedes it (a vertical terminal
 * branch), while a device exactly coincident with a sample follows it and replaces it.
 */
function activeExtradosPathNodes(nodes: readonly MutablePathNode[]): {
  readonly active: readonly MutablePathNode[];
  readonly released: readonly MutablePathNode[];
} {
  if (nodes.length < 2) throw new Error("An extrados tendon requires at least two path nodes.");
  const scale = nodes.reduce(
    (maximum, node) => Math.max(maximum, Math.abs(node.point.x), Math.abs(node.point.y)),
    1,
  );
  const orientationTolerance = 128 * Number.EPSILON * scale * scale;
  const sorted = [...nodes].sort((left, right) => {
    const deltaX = left.point.x - right.point.x;
    if (Math.abs(deltaX) > 1e-12 * scale) return deltaX;
    const deltaY = left.point.y - right.point.y;
    const coincident = Math.abs(deltaY) <= 1e-12 * scale;
    // Exactly coincident: the device replaces the contact sample.
    if (coincident) return left.device === null ? -1 : 1;
    // A left terminal departs upward through its same-x contact sample; a right terminal arrives
    // downward from its same-x contact sample.
    const leftIsLeft = left.device?.terminationSide === "left";
    const rightIsLeft = right.device?.terminationSide === "left";
    if (leftIsLeft !== rightIsLeft) return leftIsLeft ? -1 : 1;
    const leftIsRight = left.device?.terminationSide === "right";
    const rightIsRight = right.device?.terminationSide === "right";
    if (leftIsRight !== rightIsRight) return leftIsRight ? 1 : -1;
    return deltaY;
  });
  const hull: MutablePathNode[] = [];
  for (const node of sorted) {
    while (hull.length >= 2) {
      const first = hull[hull.length - 2]!.point;
      const middle = hull[hull.length - 1]!.point;
      const last = node.point;
      const turn = cross2d(subtract2d(middle, first), subtract2d(last, middle));
      // A left turn or a collinear intermediate point lies below the taut upper envelope.
      if (turn < -orientationTolerance) break;
      if (hull[hull.length - 1]!.device !== null) break; // pin terminal devices
      hull.pop();
    }
    hull.push(node);
  }
  const firstMandatory = hull.findIndex((node) => node.device !== null);
  const lastMandatory = hull.findLastIndex((node) => node.device !== null);
  if (firstMandatory < 0 || lastMandatory <= firstMandatory) {
    throw new Error("An extrados tendon requires two terminal devices.");
  }
  const active = hull.slice(firstMandatory, lastMandatory + 1);
  for (let index = 0; index < active.length - 1; index += 1) {
    const length = norm2d(subtract2d(active[index + 1]!.point, active[index]!.point));
    if (length <= 1e-12 * scale) {
      throw new Error("The moved extrados tendon path contains coincident active contact points.");
    }
  }
  const activeSet = new Set(active);
  return {
    active,
    released: nodes.filter((node) => node.contact && !activeSet.has(node)),
  };
}

function archAnchorDevice(side: "left" | "right"): DeviceDescriptor {
  return {
    kind: "terminal-arch-anchor",
    terminationSide: side,
    index: null,
  };
}

function externalAnchorDevice(side: "left" | "right"): DeviceDescriptor {
  return {
    kind: "external-anchor",
    terminationSide: side,
    index: null,
  };
}

function archSideTerminalDevice(side: "left" | "right"): DeviceDescriptor {
  return {
    kind: "arch-side-terminal",
    terminationSide: side,
    index: null,
  };
}

function deviatorDevice(index: number): DeviceDescriptor {
  return {
    kind: "deviator",
    terminationSide: null,
    index,
  };
}

function returnDeviatorDevice(side: "left" | "right"): DeviceDescriptor {
  return {
    kind: "return-deviator",
    terminationSide: side,
    index: null,
  };
}

function deviceIdFor(
  reinforcementId: string,
  kind: ArchReinforcementDeviceGeometryResult["kind"],
  terminationSide: "left" | "right" | null,
  index: number | null,
): string {
  if (kind === "terminal-arch-anchor") return `${reinforcementId}:TA-${terminationSide}`;
  if (kind === "external-anchor") return `${reinforcementId}:EA-${terminationSide}`;
  if (kind === "arch-side-terminal") return `${reinforcementId}:ST-${terminationSide}`;
  if (kind === "return-deviator") return `${reinforcementId}:RD-${terminationSide}`;
  return `${reinforcementId}:D-${String(index).padStart(3, "0")}`;
}

/**
 * Builds the ordered path nodes of one reinforcement in the reference configuration and updates
 * them onto the evaluated configuration. Returns the complete ordered node list together with the
 * contact samples that unilateral contact released, and whether the path is a closed loop.
 */
function buildReinforcementNodes(
  geometry: NormalizedMasonryArchGeometry,
  reinforcement: NormalizedArchReinforcement,
  configuration: NormalizedMasonryArchConfiguration | null,
): {
  readonly nodes: readonly MutablePathNode[];
  readonly releasedContacts: readonly MutablePathNode[];
  readonly closedLoop: boolean;
  readonly stationing: SideArcStationing;
} {
  const side = reinforcement.side;
  const stationing = createSideArcStationing(geometry, side);
  const scale = Math.max(1, stationing.totalLength);
  const nodes: MutablePathNode[] = [];

  if (reinforcement.side === "intrados") {
    const topology = reinforcement.topology;
    if (topology.type === "closed-loop") {
      addArchPathNode(
        nodes,
        geometry,
        side,
        stationing,
        topology.leftReturnDeviator.station * stationing.totalLength,
        {
          device: returnDeviatorDevice("left"),
        },
      );
    } else if (topology.left.type === "arch-anchor") {
      addArchPathNode(
        nodes,
        geometry,
        side,
        stationing,
        topology.left.station * stationing.totalLength,
        {
          device: archAnchorDevice("left"),
        },
      );
    } else {
      addExternalPathNode(nodes, topology.left.point, externalAnchorDevice("left"));
      addArchPathNode(
        nodes,
        geometry,
        side,
        stationing,
        topology.left.station * stationing.totalLength,
        { device: archSideTerminalDevice("left") },
      );
    }

    topology.deviators.forEach((device, index) => {
      addArchPathNode(nodes, geometry, side, stationing, device.station * stationing.totalLength, {
        device: deviatorDevice(index + 1),
      });
    });

    if (topology.type === "closed-loop") {
      addArchPathNode(
        nodes,
        geometry,
        side,
        stationing,
        topology.rightReturnDeviator.station * stationing.totalLength,
        {
          device: returnDeviatorDevice("right"),
        },
      );
    } else if (topology.right.type === "arch-anchor") {
      addArchPathNode(
        nodes,
        geometry,
        side,
        stationing,
        topology.right.station * stationing.totalLength,
        {
          device: archAnchorDevice("right"),
        },
      );
    } else {
      addArchPathNode(
        nodes,
        geometry,
        side,
        stationing,
        topology.right.station * stationing.totalLength,
        { device: archSideTerminalDevice("right") },
      );
      addExternalPathNode(nodes, topology.right.point, externalAnchorDevice("right"));
    }

    if (topology.type === "open") {
      // The terminals are the first and last path nodes of the open tendon.
      validateOpenTendonTerminalOrder(
        geometry,
        reinforcement.id,
        nodes[0]!.point,
        nodes.at(-1)!.point,
      );
    }

    nodes.forEach((node, index) => {
      node.pathIndex = index;
      updatePathNodeConfiguration(node, geometry, configuration);
    });
    return {
      nodes,
      releasedContacts: [],
      closedLoop: topology.type === "closed-loop",
      stationing,
    };
  }

  const topology = reinforcement.topology;
  const leftBound = topology.left.station * stationing.totalLength;
  const rightBound = topology.right.station * stationing.totalLength;
  if (rightBound - leftBound <= 1e-12 * scale) {
    throw new Error(
      `Reinforcement ${reinforcement.id} has no positive extrados contact interval between its terminals.`,
    );
  }

  if (topology.left.type === "external-anchor") {
    addExternalPathNode(nodes, topology.left.point, externalAnchorDevice("left"));
  }
  addArchPathNode(nodes, geometry, side, stationing, leftBound, {
    device:
      topology.left.type === "external-anchor"
        ? archSideTerminalDevice("left")
        : archAnchorDevice("left"),
  });
  const segmentCount = topology.interaction.segmentCount;
  for (let index = 1; index < segmentCount; index += 1) {
    addArchPathNode(
      nodes,
      geometry,
      side,
      stationing,
      leftBound + ((rightBound - leftBound) * index) / segmentCount,
      { contact: true },
    );
  }
  if (topology.right.type === "external-anchor") {
    addArchPathNode(nodes, geometry, side, stationing, rightBound, {
      device: archSideTerminalDevice("right"),
    });
    addExternalPathNode(nodes, topology.right.point, externalAnchorDevice("right"));
  } else {
    addArchPathNode(nodes, geometry, side, stationing, rightBound, {
      device: archAnchorDevice("right"),
    });
  }

  // The terminals keep their geometric order before the envelope reorders the nodes by x.
  const leftTerminal = nodes.find((node) => node.device?.terminationSide === "left")!;
  const rightTerminal = nodes.find((node) => node.device?.terminationSide === "right")!;
  const leftOrderPoint =
    topology.left.type === "external-anchor" ? topology.left.point : leftTerminal.point;
  const rightOrderPoint =
    topology.right.type === "external-anchor" ? topology.right.point : rightTerminal.point;
  validateOpenTendonTerminalOrder(geometry, reinforcement.id, leftOrderPoint, rightOrderPoint);

  nodes.sort((left, right) => externalNodeOrder(left) - externalNodeOrder(right));
  nodes.forEach((node, index) => {
    node.pathIndex = index;
    updatePathNodeConfiguration(node, geometry, configuration);
  });
  // The fixed external branches terminate at explicit arch-side devices. They are physical path
  // segments but do not participate in finding the unilateral contact envelope between those
  // devices. This keeps the nominal contact interval station-based while allowing either free
  // branch to have arbitrary length and direction.
  const archNodes = nodes.filter((node) => node.sideArcStation !== null);
  const contactPath = activeExtradosPathNodes(archNodes);
  const leftExternal = nodes.find(
    (node) => node.device?.kind === "external-anchor" && node.device.terminationSide === "left",
  );
  const rightExternal = nodes.find(
    (node) => node.device?.kind === "external-anchor" && node.device.terminationSide === "right",
  );
  const completePath = [
    ...(leftExternal === undefined ? [] : [leftExternal]),
    ...contactPath.active,
    ...(rightExternal === undefined ? [] : [rightExternal]),
  ];
  completePath.forEach((node, index) => {
    node.pathIndex = index;
  });
  return {
    nodes: completePath,
    releasedContacts: contactPath.released,
    closedLoop: false,
    stationing,
  };
}

/**
 * Ordering key of an extrados node: the left external anchor precedes every arch node and the
 * right external anchor follows them; arch nodes are ordered by their side arc station.
 */
function externalNodeOrder(node: MutablePathNode): number {
  if (node.sideArcStation !== null) return node.sideArcStation;
  return node.device?.terminationSide === "left" ? -1 : Number.POSITIVE_INFINITY;
}

/** Resolves the cable force from complete-path compatibility: `max(0, T0 + EA * dL / L_ref)`. */
function resolveTendonForce(
  reinforcement: NormalizedArchReinforcement,
  referenceLength: number,
  currentLength: number,
): {
  readonly trialForce: number;
  readonly force: number;
  readonly elasticForceIncrement: number;
  readonly elasticTangentStiffness: number;
  readonly constitutiveElongation: number;
  readonly elongationTolerance: number;
} {
  const elongation = currentLength - referenceLength;
  const elongationTolerance = 64 * Number.EPSILON * Math.max(1, referenceLength, currentLength);
  const constitutiveElongation = Math.abs(elongation) <= elongationTolerance ? 0 : elongation;
  const elasticForceIncrement =
    (reinforcement.elasticModulus * reinforcement.area * constitutiveElongation) / referenceLength;
  const trialForce = reinforcement.initialForce + elasticForceIncrement;
  const force = Math.max(0, trialForce);
  const elasticTangentStiffness =
    trialForce > 0 ? (reinforcement.elasticModulus * reinforcement.area) / referenceLength : 0;
  return {
    trialForce,
    force,
    elasticForceIncrement,
    elasticTangentStiffness,
    constitutiveElongation,
    elongationTolerance,
  };
}

function segmentRole(
  closedLoop: boolean,
  isLastSegment: boolean,
  startExternal: boolean,
  endExternal: boolean,
  side: "intrados" | "extrados",
): ArchReinforcementSegmentRole {
  if (closedLoop) return isLastSegment ? "return-branch" : "along-side";
  if (startExternal || endExternal) return "free-terminal-branch";
  return side === "extrados" ? "contact-envelope" : "along-side";
}

function resolveSingleReinforcement(
  geometry: NormalizedMasonryArchGeometry,
  reinforcement: NormalizedArchReinforcement,
  configuration: NormalizedMasonryArchConfiguration | null,
  actionFactor: number,
): ResolvedSingleReinforcement {
  const built = buildReinforcementNodes(geometry, reinforcement, configuration);
  const stationing = built.stationing;
  const closedLoop = built.closedLoop;
  const nodes = [...built.nodes];
  const scale = Math.max(1, stationing.totalLength);

  // Extrados external anchors must lie outside the masonry and their resolved free branches
  // must not travel through it; the check runs before any force assembly or continuation.
  if (
    reinforcement.side === "extrados" &&
    reinforcement.topology.type === "open" &&
    (reinforcement.topology.left.type === "external-anchor" ||
      reinforcement.topology.right.type === "external-anchor")
  ) {
    for (const [terminationSide, adjacentIndex] of [
      ["left", 1],
      ["right", nodes.length - 2],
    ] as const) {
      const terminalNode = nodes.find(
        (node) =>
          node.device?.terminationSide === terminationSide &&
          node.device.kind === "external-anchor",
      );
      if (terminalNode === undefined) continue;
      const adjacent = nodes[adjacentIndex];
      if (adjacent === undefined) continue;
      validateExtradosExternalAnchorGeometry(
        geometry,
        reinforcement.id,
        terminationSide,
        terminalNode.point,
        adjacent.point,
        stationing.totalLength,
        reinforcement.topology.interaction.segmentCount,
      );
    }
  }

  // Complete cable polyline: for a closed loop the closing segment returns to the first node.
  const polylineNodes = closedLoop && nodes.length > 0 ? [...nodes, nodes[0]!] : nodes;
  const referenceSegmentLengths: number[] = [];
  for (let index = 0; index < polylineNodes.length - 1; index += 1) {
    const length = norm2d(
      subtract2d(polylineNodes[index + 1]!.referencePoint, polylineNodes[index]!.referencePoint),
    );
    if (length <= 1e-12 * scale) {
      throw new Error(
        `Reinforcement ${reinforcement.id} contains a degenerate zero-length reference segment.`,
      );
    }
    referenceSegmentLengths.push(length);
  }
  const referenceLength = referenceSegmentLengths.reduce((sum, length) => sum + length, 0);

  const currentSegmentLengths: number[] = [];
  for (let index = 0; index < polylineNodes.length - 1; index += 1) {
    const length = norm2d(subtract2d(polylineNodes[index + 1]!.point, polylineNodes[index]!.point));
    if (length <= 1e-12 * scale) {
      throw new Error(
        `Reinforcement ${reinforcement.id} contains a coincident current path segment; external anchors must not coincide with their adjacent cable point.`,
      );
    }
    currentSegmentLengths.push(length);
  }
  const currentLength = currentSegmentLengths.reduce((sum, length) => sum + length, 0);

  const tendon = resolveTendonForce(reinforcement, referenceLength, currentLength);
  // `actionFactor` scales the whole cable action (the path analysis uses it for its fixed-load
  // homotopy): every reported force, device demand, check, and diagnostic scales linearly.
  const tension = tendon.force * actionFactor;
  const trialForce = tendon.trialForce * actionFactor;
  const elasticForceIncrement = tendon.elasticForceIncrement * actionFactor;
  const elasticTangentStiffness = tendon.elasticTangentStiffness * actionFactor;

  const segmentTangents: RigidBlockVector2D[] = [];
  const segments: ArchReinforcementSegmentResult[] = [];
  for (let index = 0; index < polylineNodes.length - 1; index += 1) {
    const start = polylineNodes[index]!;
    const end = polylineNodes[index + 1]!;
    const tangent = normalize2d(
      subtract2d(end.point, start.point),
      `Reinforcement ${reinforcement.id} segment ${index}`,
    );
    segmentTangents.push(tangent);
    segments.push({
      index,
      referenceStartPoint: start.referencePoint,
      referenceEndPoint: end.referencePoint,
      startPoint: start.point,
      endPoint: end.point,
      startStation: start.normalizedSideStation,
      endStation: end.normalizedSideStation,
      referenceLength: referenceSegmentLengths[index]!,
      length: currentSegmentLengths[index]!,
      tension,
      role: segmentRole(
        closedLoop,
        index === polylineNodes.length - 2,
        start.sideArcStation === null,
        end.sideArcStation === null,
        reinforcement.side,
      ),
    });
  }

  const deviceForces: ArchDeviceForceResult[] = [];
  const contactForces: ArchContactForceResult[] = [];
  const externalAnchorForces: ArchExternalAnchorForceResult[] = [];
  const nodalActions: ResolvedSingleReinforcement["nodalActions"] extends readonly (infer T)[]
    ? T[]
    : never = [];
  const warnings: string[] = [];

  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index]!;
    const hasIncoming = index > 0 || closedLoop;
    const hasOutgoing = index < nodes.length - 1 || closedLoop;
    const incomingTangent = hasIncoming
      ? segmentTangents[index === 0 ? segmentTangents.length - 1 : index - 1]!
      : null;
    const outgoingTangent = hasOutgoing ? segmentTangents[index]! : null;
    const tensionIn = hasIncoming ? tension : 0;
    const tensionOut = hasOutgoing ? tension : 0;
    const force = {
      x: tensionOut * (outgoingTangent?.x ?? 0) - tensionIn * (incomingTangent?.x ?? 0),
      y: tensionOut * (outgoingTangent?.y ?? 0) - tensionIn * (incomingTangent?.y ?? 0),
    };

    const chainTangent = node.chainTangent;
    const leftFrameTangent = incomingTangent ?? chainTangent;
    const rightFrameTangent = outgoingTangent ?? chainTangent;
    let normalComponent: number | null = null;
    let tangentialComponent: number | null = null;
    if (leftFrameTangent !== null && rightFrameTangent !== null) {
      const frameTangent = normalize2d(
        {
          x: leftFrameTangent.x + rightFrameTangent.x,
          y: leftFrameTangent.y + rightFrameTangent.y,
        },
        `Reinforcement ${reinforcement.id} node ${index} tangent`,
      );
      const frameOutwardNormal = { x: -frameTangent.y, y: frameTangent.x };
      normalComponent = -dot2d(force, frameOutwardNormal);
      tangentialComponent = dot2d(force, frameTangent);
    }

    const resultant = norm2d(force);
    if (resultant > 1e-14 * Math.max(1, tension)) {
      nodalActions.push({
        sourceId: `reinforcement:${reinforcement.id}:node-${String(index).padStart(3, "0")}`,
        force,
        applications: node.attachments.map((attachment) => ({
          blockIndex: attachment.blockIndex,
          share: attachment.share,
          point: attachment.point,
        })),
      });
    }

    if (node.device !== null) {
      const device = node.device;
      const deviceId = deviceIdFor(
        reinforcement.id,
        device.kind,
        device.terminationSide,
        device.index,
      );
      const resultantDirection = resultant > 0 ? scale2d(force, 1 / resultant) : null;
      const resultantAngle = resultant > 0 ? Math.atan2(force.y, force.x) : null;
      deviceForces.push({
        deviceId,
        reinforcementId: reinforcement.id,
        kind: device.kind,
        terminationSide: device.terminationSide,
        index: device.index,
        station: node.normalizedSideStation,
        referencePoint: node.referencePoint,
        point: node.point,
        tensionIn,
        tensionOut,
        incomingDirection: incomingTangent,
        outgoingDirection: outgoingTangent,
        resultantForce: force,
        resultant,
        resultantDirection,
        resultantAngle,
        normalComponent,
        tangentialComponent,
      });
      if (device.kind === "external-anchor") {
        const termination =
          reinforcement.topology.type === "open"
            ? reinforcement.topology[device.terminationSide!]
            : null;
        if (termination === null || termination.type !== "external-anchor") {
          throw new Error(
            `Reinforcement ${reinforcement.id} has inconsistent external-anchor data.`,
          );
        }
        externalAnchorForces.push({
          deviceId,
          reinforcementId: reinforcement.id,
          terminationSide: device.terminationSide!,
          archSideStation: termination.station,
          referencePoint: node.referencePoint,
          point: node.point,
          tension: tensionIn + tensionOut,
          forceTransmittedToExternalSystem: force,
          resultant,
          resultantDirection,
          resultantAngle,
        });
      }
    } else if (node.contact) {
      const contactState =
        normalComponent !== null && normalComponent >= -1e-10 * Math.max(1, tension)
          ? ("in-contact" as const)
          : ("contact-cannot-enforce-path" as const);
      contactForces.push({
        contactId: `${reinforcement.id}:contact-${String(node.pathIndex).padStart(3, "0")}`,
        reinforcementId: reinforcement.id,
        index: node.pathIndex,
        station: node.referenceStation!,
        normalizedSideArcStation: node.normalizedSideStation!,
        referencePoint: node.referencePoint,
        point: node.point,
        tensionLeft: index > 0 ? tension : 0,
        tensionRight: index < nodes.length - 1 ? tension : 0,
        resultantForce: force,
        normalComponent: normalComponent ?? 0,
        tangentialComponent: tangentialComponent ?? 0,
        state: contactState,
      });
      if (contactState === "contact-cannot-enforce-path") {
        warnings.push(
          `Extrados contact ${reinforcement.id}:${node.pathIndex} would require tensile contact; an explicit guide is required.`,
        );
      }
    }
  }

  for (const node of built.releasedContacts) {
    contactForces.push({
      contactId: `${reinforcement.id}:contact-${String(node.pathIndex).padStart(3, "0")}`,
      reinforcementId: reinforcement.id,
      index: node.pathIndex,
      station: node.referenceStation!,
      normalizedSideArcStation: node.normalizedSideStation!,
      referencePoint: node.referencePoint,
      point: node.point,
      tensionLeft: 0,
      tensionRight: 0,
      resultantForce: { x: 0, y: 0 },
      normalComponent: 0,
      tangentialComponent: 0,
      state: "separated",
    });
  }
  contactForces.sort((left, right) => left.index - right.index);

  const axialStress = tension / reinforcement.area;
  const elasticStrain = axialStress / reinforcement.elasticModulus;
  const geometricStrain = (currentLength - referenceLength) / referenceLength;
  const yieldingCheck =
    reinforcement.yieldStrength === null
      ? null
      : {
          criterion: "reinforcement-yield-stress" as const,
          demand: axialStress,
          capacity: reinforcement.yieldStrength,
          utilizationRatio: axialStress / reinforcement.yieldStrength,
          status:
            axialStress <= reinforcement.yieldStrength * (1 + 1e-12)
              ? ("pass" as const)
              : ("fail" as const),
        };
  const tensileFailureCheck =
    reinforcement.tensileStrength === null
      ? null
      : {
          criterion: "reinforcement-tensile-strength" as const,
          demand: axialStress,
          capacity: reinforcement.tensileStrength,
          utilizationRatio: axialStress / reinforcement.tensileStrength,
          status:
            axialStress <= reinforcement.tensileStrength * (1 + 1e-12)
              ? ("pass" as const)
              : ("fail" as const),
        };
  const ultimateStrainCheck =
    reinforcement.ultimateStrain === null
      ? null
      : {
          criterion: "reinforcement-ultimate-strain" as const,
          demand: elasticStrain,
          capacity: reinforcement.ultimateStrain,
          utilizationRatio: elasticStrain / reinforcement.ultimateStrain,
          status:
            elasticStrain <= reinforcement.ultimateStrain * (1 + 1e-12)
              ? ("pass" as const)
              : ("fail" as const),
        };
  const reinforcementState =
    tensileFailureCheck?.status === "fail" || ultimateStrainCheck?.status === "fail"
      ? ("failed" as const)
      : yieldingCheck?.status === "fail"
        ? ("yielded" as const)
        : tension === 0
          ? ("slack" as const)
          : reinforcement.initialForce === 0
            ? ("active-passive" as const)
            : ("active-post-tensioned" as const);
  if (reinforcementState === "slack") {
    warnings.push(`Reinforcement ${reinforcement.id} is slack in the evaluated configuration.`);
  } else if (reinforcementState === "yielded") {
    warnings.push(`Reinforcement ${reinforcement.id} exceeds its assigned yield strength.`);
  } else if (reinforcementState === "failed") {
    warnings.push(
      `Reinforcement ${reinforcement.id} exceeds its assigned tensile strength or ultimate strain.`,
    );
  }

  // Reinforcement free-body diagnostic: arch-side actions (devices and contacts) plus external
  // anchor reactions must close; for a closed loop the arch-side actions self-equilibrate.
  const archDeviceForceSum = { x: 0, y: 0 };
  const externalAnchorForceSum = { x: 0, y: 0 };
  let residualMoment = 0;
  for (const device of deviceForces) {
    if (device.kind !== "external-anchor") {
      archDeviceForceSum.x += device.resultantForce.x;
      archDeviceForceSum.y += device.resultantForce.y;
    }
    residualMoment += cross2d(device.point, device.resultantForce);
  }
  for (const external of externalAnchorForces) {
    externalAnchorForceSum.x += external.forceTransmittedToExternalSystem.x;
    externalAnchorForceSum.y += external.forceTransmittedToExternalSystem.y;
  }
  for (const contact of contactForces) {
    archDeviceForceSum.x += contact.resultantForce.x;
    archDeviceForceSum.y += contact.resultantForce.y;
    residualMoment += cross2d(contact.point, contact.resultantForce);
  }
  const residualForce = {
    x: archDeviceForceSum.x + externalAnchorForceSum.x,
    y: archDeviceForceSum.y + externalAnchorForceSum.y,
  };
  const equilibriumTolerance = 1e-9;
  const normalizedForce =
    tension > 0
      ? norm2d(residualForce) / tension
      : norm2d(residualForce) <= equilibriumTolerance
        ? 0
        : Number.POSITIVE_INFINITY;
  const normalizedMoment =
    tension > 0
      ? Math.abs(residualMoment) / (tension * Math.max(1, referenceLength))
      : Math.abs(residualMoment) <= equilibriumTolerance * Math.max(1, referenceLength)
        ? 0
        : Number.POSITIVE_INFINITY;
  const equilibrium = {
    meaning: closedLoop
      ? ("closed-loop-self-equilibrium" as const)
      : ("open-tendon-free-body" as const),
    archDeviceForceSum,
    externalAnchorForceSum,
    residualForce,
    residualMoment,
    normalizedResidual: { force: normalizedForce, moment: normalizedMoment },
    tolerance: equilibriumTolerance,
    satisfied: normalizedForce <= equilibriumTolerance && normalizedMoment <= equilibriumTolerance,
  };

  const devices: ArchReinforcementDeviceGeometryResult[] = nodes
    .filter((node) => node.device !== null)
    .map((node) => ({
      deviceId: deviceIdFor(
        reinforcement.id,
        node.device!.kind,
        node.device!.terminationSide,
        node.device!.index,
      ),
      kind: node.device!.kind,
      terminationSide: node.device!.terminationSide,
      station: node.normalizedSideStation,
      referencePoint: node.referencePoint,
      point: node.point,
      attachedToArch: node.device!.kind !== "external-anchor",
    }));

  return {
    state: {
      reinforcementId: reinforcement.id,
      side: reinforcement.side,
      topology: closedLoop ? "closed-loop" : "open",
      force: tension,
      trialForce,
      initialForce: reinforcement.initialForce,
      elasticForceIncrement,
      axialStress,
      elasticStrain,
      geometricStrain,
      state: reinforcementState,
      referenceLength,
      currentLength,
      elongation: currentLength - referenceLength,
      elongationTolerance: tendon.elongationTolerance,
      effectiveElasticLength: referenceLength,
      elasticTangentStiffness,
      referencePath: polylineNodes.map((node) => node.referencePoint),
      path: polylineNodes.map((node) => node.point),
      segments,
      devices,
      equilibrium,
      checks: {
        yielding: yieldingCheck,
        tensileFailure: tensileFailureCheck,
        ultimateStrain: ultimateStrainCheck,
      },
    },
    deviceForces,
    contactForces,
    externalAnchorForces,
    nodalActions,
    warnings,
  };
}

function emptyBlockWrenches(
  geometry: NormalizedMasonryArchGeometry,
  configuration: NormalizedMasonryArchConfiguration | null = null,
): MasonryArchBlockLoadResult[] {
  return geometry.voussoirs.map((block) => ({
    blockId: block.id,
    force: { x: 0, y: 0 },
    moment: 0,
    applicationPoint: transformPointByBlock(geometry, block.index, block.centroid, configuration),
    sourceLoadIds: [],
  }));
}

function addNodalActionToBlocks(
  wrenches: MasonryArchBlockLoadResult[],
  action: ResolvedSingleReinforcement["nodalActions"][number],
): void {
  for (const application of action.applications) {
    const current = wrenches[application.blockIndex]!;
    const force = scale2d(action.force, application.share);
    const moment = cross2d(subtract2d(application.point, current.applicationPoint), force);
    wrenches[application.blockIndex] = {
      ...current,
      force: { x: current.force.x + force.x, y: current.force.y + force.y },
      moment: current.moment + moment,
      sourceLoadIds: current.sourceLoadIds.includes(action.sourceId)
        ? current.sourceLoadIds
        : [...current.sourceLoadIds, action.sourceId],
    };
  }
}

export function combineMasonryArchBlockWrenches(
  geometry: NormalizedMasonryArchGeometry,
  ...groups: readonly (readonly MasonryArchBlockLoadResult[])[]
): MasonryArchBlockLoadResult[] {
  const combined = emptyBlockWrenches(geometry);
  for (const group of groups) {
    for (const wrench of group) {
      const block = geometry.voussoirs.find((item) => item.id === wrench.blockId);
      if (block === undefined)
        throw new Error(`Unknown masonry arch block wrench: ${wrench.blockId}.`);
      const current = combined[block.index]!;
      const translatedMoment =
        wrench.moment + cross2d(subtract2d(wrench.applicationPoint, block.centroid), wrench.force);
      combined[block.index] = {
        blockId: block.id,
        force: {
          x: current.force.x + wrench.force.x,
          y: current.force.y + wrench.force.y,
        },
        moment: current.moment + translatedMoment,
        applicationPoint: block.centroid,
        sourceLoadIds: [...new Set([...current.sourceLoadIds, ...wrench.sourceLoadIds])],
      };
    }
  }
  return combined;
}

function resolveArchReinforcementsInConfiguration(
  model: NormalizedMasonryArchModel,
  configuration: NormalizedMasonryArchConfiguration | null,
  actionFactor = 1,
): ResolvedArchReinforcements {
  if (!Number.isFinite(actionFactor) || actionFactor < 0) {
    throw new Error("Reinforcement actionFactor must be finite and non-negative.");
  }
  const resolved = model.reinforcements.map((reinforcement) =>
    resolveSingleReinforcement(model.geometry, reinforcement, configuration, actionFactor),
  );
  const blockWrenches = emptyBlockWrenches(model.geometry, configuration);
  for (const item of resolved) {
    for (const action of item.nodalActions) {
      addNodalActionToBlocks(blockWrenches, action);
    }
  }
  const reinforcementState = resolved.map((item) => item.state);
  const deviceForces = resolved.flatMap((item) => item.deviceForces);
  const contactForces = resolved.flatMap((item) => item.contactForces);
  const externalAnchorForces = resolved.flatMap((item) => item.externalAnchorForces);
  return {
    reinforcementState,
    deviceForces,
    contactForces,
    externalAnchorForces,
    blockWrenches,
    warnings: resolved.flatMap((item) => item.warnings),
    hasReinforcementYield: reinforcementState.some((item) => item.state === "yielded"),
    hasReinforcementFailure: reinforcementState.some((item) => item.state === "failed"),
    hasInvalidContact: contactForces.some((item) => item.state === "contact-cannot-enforce-path"),
  };
}

export function resolveArchReinforcements(
  model: NormalizedMasonryArchModel,
): ResolvedArchReinforcements {
  return resolveArchReinforcementsInConfiguration(model, null);
}

export function normalizeMasonryArchPrescribedConfiguration(
  model: NormalizedMasonryArchModel,
  input: MasonryArchPrescribedConfigurationInput,
): {
  readonly configuration: NormalizedMasonryArchConfiguration;
  readonly blockDisplacements: readonly NormalizedMasonryArchBlockDisplacement[];
  readonly sourceUnits: NormalizedMasonryArchModel["units"];
} {
  const sourceUnits = assertExplicitUnitSystem(
    input.units,
    "MasonryArchPrescribedConfigurationInput",
  );
  const resolver = createUnitResolver(sourceUnits, model.units);
  const suppliedById = new Map<string, NormalizedMasonryArchBlockDisplacement>();
  for (const displacement of input.blockDisplacements) {
    const block = model.geometry.voussoirs.find((item) => item.id === displacement.blockId);
    if (block === undefined) {
      throw new Error(`Unknown prescribed-displacement block id: ${displacement.blockId}.`);
    }
    if (suppliedById.has(displacement.blockId)) {
      throw new Error(`Duplicate prescribed-displacement block id: ${displacement.blockId}.`);
    }
    const translation = {
      x: resolver.length(displacement.translation.x),
      y: resolver.length(displacement.translation.y),
    };
    if (
      !Number.isFinite(translation.x) ||
      !Number.isFinite(translation.y) ||
      !Number.isFinite(displacement.rotation)
    ) {
      throw new Error(`Prescribed displacement for ${displacement.blockId} must be finite.`);
    }
    suppliedById.set(displacement.blockId, {
      blockId: displacement.blockId,
      translation,
      rotation: displacement.rotation,
    });
  }
  const blockDisplacements = model.geometry.voussoirs.map(
    (block): NormalizedMasonryArchBlockDisplacement =>
      suppliedById.get(block.id) ?? {
        blockId: block.id,
        translation: { x: 0, y: 0 },
        rotation: 0,
      },
  );
  return {
    configuration: {
      displacementsByBlockId: new Map(
        blockDisplacements.map((displacement) => [displacement.blockId, displacement]),
      ),
    },
    blockDisplacements,
    sourceUnits,
  };
}

/**
 * Evaluates tendon compatibility and updated device/contact forces on a prescribed finite
 * rigid-block configuration. It does not solve structural equilibrium.
 */
export function evaluateArchReinforcementConfiguration(
  model: NormalizedMasonryArchModel,
  input: MasonryArchPrescribedConfigurationInput,
): EvaluatedArchReinforcementConfiguration {
  const normalized = normalizeMasonryArchPrescribedConfiguration(model, input);
  return {
    ...resolveArchReinforcementsInConfiguration(model, normalized.configuration),
    blockDisplacements: normalized.blockDisplacements,
    configuration: {
      sourceUnits: normalized.sourceUnits,
      units: model.units,
      solutionMeaning: "prescribed-configuration-not-equilibrated",
      kinematics: "finite-rigid-block-transformations",
      equilibriumSolved: false,
      jointDeviceInterpolation: "work-conjugate-two-block-average",
    },
  };
}

/**
 * Internal path-analysis entry: resolves the reinforcement actions of a prescribed configuration
 * under a fixed-load homotopy factor. The whole cable action (forces, device demands, checks, and
 * the free-body diagnostic) scales with the factor so the reported state stays coherent with the
 * equilibrium residual during the fixed preload.
 */
export function resolveArchReinforcementsAtActionFactor(
  model: NormalizedMasonryArchModel,
  input: MasonryArchPrescribedConfigurationInput,
  actionFactor: number,
): ResolvedArchReinforcements {
  const normalized = normalizeMasonryArchPrescribedConfiguration(model, input);
  return resolveArchReinforcementsInConfiguration(model, normalized.configuration, actionFactor);
}
