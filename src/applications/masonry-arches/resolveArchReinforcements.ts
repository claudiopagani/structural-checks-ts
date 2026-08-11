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
import type {
  ArchAnchorForceResult,
  ArchContactForceResult,
  ArchReinforcementBoundaryForceResult,
  ArchReinforcementStateResult,
  MasonryArchBlockLoadResult,
  MasonryArchPrescribedConfigurationInput,
  MasonryArchReferenceCurve,
  NormalizedArchAnchorCapacity,
  NormalizedArchReinforcement,
  NormalizedArchReinforcementTermination,
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

interface ConnectorNode {
  readonly id: string;
  readonly side: "left" | "right";
  readonly index: number;
  readonly capacity: NormalizedArchAnchorCapacity;
}

interface MutablePathNode {
  sideArcStation: number;
  referenceStation: number;
  referencePoint: RigidBlockPoint2D;
  point: RigidBlockPoint2D;
  referenceChainTangent: RigidBlockVector2D;
  chainTangent: RigidBlockVector2D;
  attachments: readonly PathNodeAttachment[];
  deviatorIndex: number | null;
  connector: ConnectorNode | null;
  contact: boolean;
  /** Stable index after station sorting, retained when unilateral contact releases this sample. */
  pathIndex: number;
}

interface PathNodeAttachment {
  readonly blockIndex: number;
  readonly share: number;
  readonly referencePoint: RigidBlockPoint2D;
  point: RigidBlockPoint2D;
}

export interface NormalizedMasonryArchConfiguration {
  readonly displacementsByBlockId: ReadonlyMap<string, NormalizedMasonryArchBlockDisplacement>;
}

interface ConnectorStation {
  readonly sideArcStation: number;
  readonly weight: number;
  readonly node: ConnectorNode;
}

interface ResolvedSingleReinforcement {
  readonly state: ArchReinforcementStateResult;
  readonly anchorForces: readonly ArchAnchorForceResult[];
  readonly contactForces: readonly ArchContactForceResult[];
  readonly boundaryForces: readonly ArchReinforcementBoundaryForceResult[];
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
  readonly anchorForces: readonly ArchAnchorForceResult[];
  readonly contactForces: readonly ArchContactForceResult[];
  readonly boundaryForces: readonly ArchReinforcementBoundaryForceResult[];
  readonly blockWrenches: readonly MasonryArchBlockLoadResult[];
  readonly warnings: readonly string[];
  readonly hasAnchorFailure: boolean;
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
  side: MasonryArchReferenceCurve,
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
  const referenceStations = geometry.interfaces.map((item) => item.station);
  const cumulative = [0];
  for (let index = 0; index < referenceStations.length - 1; index += 1) {
    cumulative.push(
      cumulative[index]! +
        integrateSideArcLength(
          geometry,
          side,
          referenceStations[index]!,
          referenceStations[index + 1]!,
        ),
    );
  }
  const totalLength = cumulative.at(-1)!;
  const tolerance = 1e-12 * Math.max(1, totalLength);
  return {
    totalLength,
    referenceStationAtLength: (requestedLength: number): number => {
      if (requestedLength <= tolerance) return 0;
      if (requestedLength >= totalLength - tolerance) return geometry.totalReferenceArcLength;
      let panel = 0;
      while (cumulative[panel + 1]! < requestedLength) panel += 1;
      const panelStartLength = cumulative[panel]!;
      const panelStartStation = referenceStations[panel]!;
      const panelEndStation = referenceStations[panel + 1]!;
      let lower = panelStartStation;
      let upper = panelEndStation;
      for (let iteration = 0; iteration < 60; iteration += 1) {
        const trial = (lower + upper) / 2;
        const trialLength =
          panelStartLength + integrateSideArcLength(geometry, side, panelStartStation, trial);
        if (trialLength < requestedLength) lower = trial;
        else upper = trial;
      }
      return (lower + upper) / 2;
    },
  };
}

function terminalConnectorStations(
  reinforcement: NormalizedArchReinforcement,
  terminationSide: "left" | "right",
  termination: NormalizedArchReinforcementTermination,
  sideArcLength: number,
): ConnectorStation[] {
  if (termination.type === "continuous-external") return [];
  return Array.from({ length: termination.connectorCount }, (_, index) => {
    const distanceFromBoundary = index * termination.connectorSpacing;
    return {
      sideArcStation:
        terminationSide === "left" ? distanceFromBoundary : sideArcLength - distanceFromBoundary,
      weight: termination.loadShareWeights[index]!,
      node: {
        id: `${reinforcement.id}:${terminationSide}:C-${String(index).padStart(3, "0")}`,
        side: terminationSide,
        index,
        capacity: termination.capacity,
      },
    };
  });
}

function transferZoneLength(termination: NormalizedArchReinforcementTermination): number {
  return termination.type === "continuous-external"
    ? 0
    : (termination.connectorCount - 1) * termination.connectorSpacing;
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
  node.point = node.attachments.reduce(
    (sum, attachment) => ({
      x: sum.x + attachment.share * attachment.point.x,
      y: sum.y + attachment.share * attachment.point.y,
    }),
    { x: 0, y: 0 },
  );
  node.chainTangent = transformVectorByAttachments(
    geometry,
    node.attachments,
    node.referenceChainTangent,
    configuration,
  );
}

function addPathNode(
  nodes: MutablePathNode[],
  geometry: NormalizedMasonryArchGeometry,
  side: "intrados" | "extrados",
  stationing: SideArcStationing,
  sideArcStation: number,
  attributes: {
    readonly deviatorIndex?: number;
    readonly connector?: ConnectorNode;
    readonly contact?: boolean;
  },
): void {
  const tolerance = 1e-10 * Math.max(1, stationing.totalLength);
  const existing = nodes.find(
    (item) => Math.abs(item.sideArcStation - sideArcStation) <= tolerance,
  );
  if (existing !== undefined) {
    if (attributes.deviatorIndex !== undefined) existing.deviatorIndex = attributes.deviatorIndex;
    if (attributes.connector !== undefined) {
      if (existing.connector !== null) {
        throw new Error("Terminal connector transfer zones overlap at one reinforcement node.");
      }
      existing.connector = attributes.connector;
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
    referencePoint,
    point: referencePoint,
    referenceChainTangent: sample.chainTangent,
    chainTangent: sample.chainTangent,
    attachments: attachmentsAtStation(geometry, referenceStation, referencePoint),
    deviatorIndex: attributes.deviatorIndex ?? null,
    connector: attributes.connector ?? null,
    contact: attributes.contact ?? false,
    pathIndex: -1,
  });
}

function activeExtradosPathNodes(nodes: readonly MutablePathNode[]): {
  readonly active: readonly MutablePathNode[];
  readonly released: readonly MutablePathNode[];
} {
  if (nodes.length < 2) throw new Error("An extrados tendon requires at least two path nodes.");
  const mandatory = nodes
    .map((node, index) => ({ node, index }))
    .filter(
      ({ node, index }) => index === 0 || index === nodes.length - 1 || node.connector !== null,
    )
    .map(({ index }) => index);
  const activeIndices = new Set<number>();
  const scale = nodes.reduce(
    (maximum, node) => Math.max(maximum, Math.abs(node.point.x), Math.abs(node.point.y)),
    1,
  );
  const orientationTolerance = 128 * Number.EPSILON * scale * scale;

  for (let interval = 0; interval < mandatory.length - 1; interval += 1) {
    const start = mandatory[interval]!;
    const end = mandatory[interval + 1]!;
    const hull: number[] = [];
    for (let index = start; index <= end; index += 1) {
      while (hull.length >= 2) {
        const first = nodes[hull[hull.length - 2]!]!.point;
        const middle = nodes[hull[hull.length - 1]!]!.point;
        const last = nodes[index]!.point;
        const turn = cross2d(subtract2d(middle, first), subtract2d(last, middle));
        // A left turn or a collinear intermediate point lies below the taut upper envelope.
        if (turn < -orientationTolerance) break;
        hull.pop();
      }
      hull.push(index);
    }
    for (const index of hull) activeIndices.add(index);
  }

  const active = nodes.filter((_, index) => activeIndices.has(index));
  for (let index = 0; index < active.length - 1; index += 1) {
    const length = norm2d(subtract2d(active[index + 1]!.point, active[index]!.point));
    if (length <= 1e-12 * scale) {
      throw new Error("The moved extrados tendon path contains coincident active contact points.");
    }
  }
  return {
    active,
    released: nodes.filter((node, index) => node.contact && !activeIndices.has(index)),
  };
}

function tensionRatioAtSegment(
  reinforcement: NormalizedArchReinforcement,
  segmentMidpoint: number,
  leftConnectors: readonly ConnectorStation[],
  rightConnectors: readonly ConnectorStation[],
): number {
  if (reinforcement.terminations.left.type === "distributed-anchorage") {
    const zoneEnd = transferZoneLength(reinforcement.terminations.left);
    if (segmentMidpoint < zoneEnd) {
      return leftConnectors
        .filter((item) => item.sideArcStation < segmentMidpoint)
        .reduce((sum, item) => sum + item.weight, 0);
    }
  }
  if (reinforcement.terminations.right.type === "distributed-anchorage") {
    const zoneStart =
      rightConnectors[0]!.sideArcStation - transferZoneLength(reinforcement.terminations.right);
    if (segmentMidpoint > zoneStart) {
      const transferred = rightConnectors
        .filter((item) => item.sideArcStation < segmentMidpoint)
        .reduce((sum, item) => sum + item.weight, 0);
      return 1 - transferred;
    }
  }
  return 1;
}

function capacityUtilization(
  capacity: NormalizedArchAnchorCapacity,
  normalDemand: number,
  shearDemand: number,
  resultantDemand: number,
): {
  readonly utilizationRatio: number | null;
  readonly status: "pass" | "fail" | "not-verifiable";
} {
  const normalRatio =
    capacity.normalResistance === null ? null : normalDemand / capacity.normalResistance;
  const shearRatio =
    capacity.shearResistance === null ? null : shearDemand / capacity.shearResistance;
  const resultantRatio =
    capacity.resultantResistance === null ? null : resultantDemand / capacity.resultantResistance;
  const componentRatios = [normalRatio, shearRatio].filter(
    (value): value is number => value !== null,
  );
  let componentInteraction: number | null = null;
  if (componentRatios.length > 0) {
    if (capacity.interactionRule === "linear" && normalRatio !== null && shearRatio !== null) {
      componentInteraction = normalRatio + shearRatio;
    } else if (
      capacity.interactionRule === "elliptical" &&
      normalRatio !== null &&
      shearRatio !== null
    ) {
      componentInteraction = Math.hypot(normalRatio, shearRatio);
    } else {
      componentInteraction = Math.max(...componentRatios);
    }
  }
  const ratios = [componentInteraction, resultantRatio].filter(
    (value): value is number => value !== null,
  );
  if (ratios.length === 0) return { utilizationRatio: null, status: "not-verifiable" };
  const utilizationRatio = Math.max(...ratios);
  return { utilizationRatio, status: utilizationRatio <= 1 + 1e-12 ? "pass" : "fail" };
}

function resolveSingleReinforcement(
  geometry: NormalizedMasonryArchGeometry,
  reinforcement: NormalizedArchReinforcement,
  configuration: NormalizedMasonryArchConfiguration | null,
): ResolvedSingleReinforcement {
  const stationing = createSideArcStationing(geometry, reinforcement.side);
  const leftZoneLength = transferZoneLength(reinforcement.terminations.left);
  const rightZoneLength = transferZoneLength(reinforcement.terminations.right);
  if (leftZoneLength + rightZoneLength >= stationing.totalLength - 1e-10) {
    throw new Error(
      `Reinforcement ${reinforcement.id} terminal transfer zones overlap or leave no full-tension path.`,
    );
  }

  const nodes: MutablePathNode[] = [];
  if (reinforcement.interaction.type === "rigid-deviators") {
    for (let index = 0; index < reinforcement.interaction.count; index += 1) {
      addPathNode(
        nodes,
        geometry,
        reinforcement.side,
        stationing,
        (index * stationing.totalLength) / (reinforcement.interaction.count - 1),
        { deviatorIndex: index },
      );
    }
  } else {
    for (let index = 0; index <= reinforcement.interaction.segmentCount; index += 1) {
      addPathNode(
        nodes,
        geometry,
        reinforcement.side,
        stationing,
        (index * stationing.totalLength) / reinforcement.interaction.segmentCount,
        { contact: true },
      );
    }
  }

  const leftConnectors = terminalConnectorStations(
    reinforcement,
    "left",
    reinforcement.terminations.left,
    stationing.totalLength,
  );
  const rightConnectors = terminalConnectorStations(
    reinforcement,
    "right",
    reinforcement.terminations.right,
    stationing.totalLength,
  );
  for (const connector of [...leftConnectors, ...rightConnectors]) {
    addPathNode(nodes, geometry, reinforcement.side, stationing, connector.sideArcStation, {
      connector: connector.node,
    });
  }
  nodes.sort((left, right) => left.sideArcStation - right.sideArcStation);
  nodes.forEach((node, index) => {
    node.pathIndex = index;
    updatePathNodeConfiguration(node, geometry, configuration);
  });

  const completeReferenceSegmentLengths = nodes
    .slice(0, -1)
    .map((node, index) =>
      norm2d(subtract2d(nodes[index + 1]!.referencePoint, node.referencePoint)),
    );
  const completeReferenceCumulativeLengths = [0];
  for (const length of completeReferenceSegmentLengths) {
    completeReferenceCumulativeLengths.push(completeReferenceCumulativeLengths.at(-1)! + length);
  }
  const contactPath =
    reinforcement.interaction.type === "unilateral-contact"
      ? activeExtradosPathNodes(nodes)
      : { active: nodes, released: [] as readonly MutablePathNode[] };
  const pathNodes = contactPath.active;

  const segmentTangents: RigidBlockVector2D[] = [];
  const segmentTensionRatios: number[] = [];
  const segmentTensions: number[] = [];
  const referenceSegmentLengths: number[] = [];
  const currentSegmentLengths: number[] = [];
  for (let index = 0; index < pathNodes.length - 1; index += 1) {
    const start = pathNodes[index]!;
    const end = pathNodes[index + 1]!;
    referenceSegmentLengths.push(
      completeReferenceCumulativeLengths[end.pathIndex]! -
        completeReferenceCumulativeLengths[start.pathIndex]!,
    );
    currentSegmentLengths.push(norm2d(subtract2d(end.point, start.point)));
    segmentTensionRatios.push(
      tensionRatioAtSegment(
        reinforcement,
        (start.sideArcStation + end.sideArcStation) / 2,
        leftConnectors,
        rightConnectors,
      ),
    );
  }
  const referencePathLength = completeReferenceCumulativeLengths.at(-1)!;
  const currentPathLength = currentSegmentLengths.reduce((sum, length) => sum + length, 0);
  const elongation = currentPathLength - referencePathLength;
  const elongationTolerance =
    64 * Number.EPSILON * Math.max(1, referencePathLength, currentPathLength);
  const constitutiveElongation = Math.abs(elongation) <= elongationTolerance ? 0 : elongation;
  const compatibilityMode =
    reinforcement.terminations.left.type === "distributed-anchorage" &&
    reinforcement.terminations.right.type === "distributed-anchorage"
      ? ("anchored-length-compatible" as const)
      : ("externally-force-controlled" as const);
  const effectiveElasticLength =
    compatibilityMode === "anchored-length-compatible"
      ? referenceSegmentLengths.reduce(
          (sum, length, index) => sum + length * segmentTensionRatios[index]!,
          0,
        )
      : null;
  if (effectiveElasticLength !== null && effectiveElasticLength <= 0) {
    throw new Error(`Reinforcement ${reinforcement.id} has no positive effective elastic length.`);
  }
  const elasticForceIncrement =
    effectiveElasticLength === null
      ? 0
      : (reinforcement.elasticModulus * reinforcement.area * constitutiveElongation) /
        effectiveElasticLength;
  const trialForce = reinforcement.initialForce + elasticForceIncrement;
  const reinforcementForce = Math.max(0, trialForce);
  const elasticTangentStiffness =
    effectiveElasticLength !== null && trialForce > 0
      ? (reinforcement.elasticModulus * reinforcement.area) / effectiveElasticLength
      : 0;
  const segments: ArchReinforcementStateResult["segments"] extends readonly (infer T)[]
    ? T[]
    : never = [];
  for (let index = 0; index < pathNodes.length - 1; index += 1) {
    const start = pathNodes[index]!;
    const end = pathNodes[index + 1]!;
    const chord = subtract2d(end.point, start.point);
    const length = currentSegmentLengths[index]!;
    const tangent = normalize2d(chord, `Reinforcement ${reinforcement.id} segment ${index}`);
    const tensionRatio = segmentTensionRatios[index]!;
    const tension = reinforcementForce * tensionRatio;
    segmentTangents.push(tangent);
    segmentTensions.push(tension);
    segments.push({
      index,
      referenceStartPoint: start.referencePoint,
      referenceEndPoint: end.referencePoint,
      startPoint: start.point,
      endPoint: end.point,
      startStation: start.referenceStation,
      endStation: end.referenceStation,
      referenceLength: referenceSegmentLengths[index]!,
      length,
      tensionRatio,
      tension,
    });
  }

  const anchorForces: ArchAnchorForceResult[] = [];
  const contactForces: ArchContactForceResult[] = [];
  const nodalActions: ResolvedSingleReinforcement["nodalActions"] extends readonly (infer T)[]
    ? T[]
    : never = [];
  const warnings: string[] = [];
  for (let index = 0; index < pathNodes.length; index += 1) {
    const node = pathNodes[index]!;
    const leftTangent = index === 0 ? node.chainTangent : segmentTangents[index - 1]!;
    const rightTangent =
      index === pathNodes.length - 1 ? node.chainTangent : segmentTangents[index]!;
    const tensionLeft =
      index === 0
        ? reinforcement.terminations.left.type === "continuous-external"
          ? reinforcementForce
          : 0
        : segmentTensions[index - 1]!;
    const tensionRight =
      index === pathNodes.length - 1
        ? reinforcement.terminations.right.type === "continuous-external"
          ? reinforcementForce
          : 0
        : segmentTensions[index]!;
    const force = {
      x: tensionRight * rightTangent.x - tensionLeft * leftTangent.x,
      y: tensionRight * rightTangent.y - tensionLeft * leftTangent.y,
    };
    const frameTangent = normalize2d(
      {
        x: leftTangent.x + rightTangent.x,
        y: leftTangent.y + rightTangent.y,
      },
      `Reinforcement ${reinforcement.id} node ${index} tangent`,
    );
    const frameOutwardNormal = { x: -frameTangent.y, y: frameTangent.x };
    const normalComponent = -dot2d(force, frameOutwardNormal);
    const tangentialComponent = dot2d(force, frameTangent);
    const resultant = norm2d(force);
    if (resultant > 1e-14 * Math.max(1, reinforcementForce)) {
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

    if (node.connector !== null || node.deviatorIndex !== null) {
      const connector = node.connector;
      const capacity =
        connector?.capacity ??
        (reinforcement.interaction.type === "rigid-deviators"
          ? reinforcement.interaction.capacity
          : {
              normalResistance: null,
              shearResistance: null,
              resultantResistance: null,
              interactionRule: "independent" as const,
            });
      const capacityCheck = capacityUtilization(
        capacity,
        Math.abs(normalComponent),
        Math.abs(tangentialComponent),
        resultant,
      );
      const anchorId =
        connector?.id ?? `${reinforcement.id}:D-${String(node.deviatorIndex).padStart(3, "0")}`;
      const kind =
        connector === null
          ? ("deviator" as const)
          : node.deviatorIndex === null
            ? ("terminal-connector" as const)
            : ("terminal-connector-and-deviator" as const);
      anchorForces.push({
        anchorId,
        reinforcementId: reinforcement.id,
        kind,
        terminationSide: connector?.side ?? null,
        index: connector?.index ?? node.deviatorIndex!,
        station: node.referenceStation,
        normalizedSideArcStation: node.sideArcStation / stationing.totalLength,
        referencePoint: node.referencePoint,
        point: node.point,
        tensionLeft,
        tensionRight,
        resultantForce: force,
        normalComponent,
        tangentialComponent,
        resultant,
        direction: resultant > 0 ? scale2d(force, 1 / resultant) : null,
        demand: {
          normal: Math.abs(normalComponent),
          shear: Math.abs(tangentialComponent),
          resultant,
        },
        capacity: {
          normal: capacity.normalResistance,
          shear: capacity.shearResistance,
          resultant: capacity.resultantResistance,
        },
        interactionRule: capacity.interactionRule,
        ...capacityCheck,
      });
      if (capacityCheck.status === "fail") {
        warnings.push(`Anchor ${anchorId} exceeds its assigned resistance.`);
      }
    } else if (node.contact) {
      const contactState =
        normalComponent >= -1e-10 * Math.max(1, reinforcementForce)
          ? ("in-contact" as const)
          : ("contact-cannot-enforce-path" as const);
      contactForces.push({
        contactId: `${reinforcement.id}:contact-${String(node.pathIndex).padStart(3, "0")}`,
        reinforcementId: reinforcement.id,
        index: node.pathIndex,
        station: node.referenceStation,
        normalizedSideArcStation: node.sideArcStation / stationing.totalLength,
        referencePoint: node.referencePoint,
        point: node.point,
        tensionLeft,
        tensionRight,
        resultantForce: force,
        normalComponent,
        tangentialComponent,
        state: contactState,
      });
      if (contactState === "contact-cannot-enforce-path") {
        warnings.push(
          `Extrados contact ${reinforcement.id}:${index} would require tensile contact; an explicit guide is required.`,
        );
      }
    }
  }

  for (const node of contactPath.released) {
    contactForces.push({
      contactId: `${reinforcement.id}:contact-${String(node.pathIndex).padStart(3, "0")}`,
      reinforcementId: reinforcement.id,
      index: node.pathIndex,
      station: node.referenceStation,
      normalizedSideArcStation: node.sideArcStation / stationing.totalLength,
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

  const axialStress = reinforcementForce / reinforcement.area;
  const elasticStrain = axialStress / reinforcement.elasticModulus;
  const geometricStrain = elongation / referencePathLength;
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
        : reinforcementForce === 0
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

  const boundaryForces = (["left", "right"] as const).map((side) => {
    const node = side === "left" ? pathNodes[0]! : pathNodes.at(-1)!;
    const termination = reinforcement.terminations[side];
    const tension = termination.type === "continuous-external" ? reinforcementForce : 0;
    const sign = side === "left" ? 1 : -1;
    return {
      reinforcementId: reinforcement.id,
      side,
      terminationType: termination.type,
      referencePoint: node.referencePoint,
      point: node.point,
      tension,
      forceTransmittedToExternalSystem: scale2d(node.chainTangent, sign * tension),
    };
  });

  return {
    state: {
      reinforcementId: reinforcement.id,
      side: reinforcement.side,
      force: reinforcementForce,
      trialForce,
      initialForce: reinforcement.initialForce,
      elasticForceIncrement,
      axialStress,
      elasticStrain,
      geometricStrain,
      state: reinforcementState,
      compatibilityMode,
      referencePathLength,
      currentPathLength,
      pathLength: currentPathLength,
      elongation,
      elongationTolerance,
      effectiveElasticLength,
      elasticTangentStiffness,
      interactionType: reinforcement.interaction.type,
      referencePath: nodes.map((node) => node.referencePoint),
      path: pathNodes.map((node) => node.point),
      segments,
      deviators:
        reinforcement.interaction.type === "rigid-deviators"
          ? nodes
              .filter((node) => node.deviatorIndex !== null)
              .map((node) => ({
                id: `${reinforcement.id}:D-${String(node.deviatorIndex).padStart(3, "0")}`,
                index: node.deviatorIndex!,
                station: node.referenceStation,
                normalizedSideArcStation: node.sideArcStation / stationing.totalLength,
                referencePoint: node.referencePoint,
                point: node.point,
              }))
          : [],
      checks: {
        yielding: yieldingCheck,
        tensileFailure: tensileFailureCheck,
        ultimateStrain: ultimateStrainCheck,
      },
    },
    anchorForces,
    contactForces,
    boundaryForces,
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
): ResolvedArchReinforcements {
  const resolved = model.reinforcements.map((reinforcement) =>
    resolveSingleReinforcement(model.geometry, reinforcement, configuration),
  );
  const blockWrenches = emptyBlockWrenches(model.geometry, configuration);
  for (const item of resolved) {
    for (const action of item.nodalActions) {
      addNodalActionToBlocks(blockWrenches, action);
    }
  }
  const reinforcementState = resolved.map((item) => item.state);
  const anchorForces = resolved.flatMap((item) => item.anchorForces);
  const contactForces = resolved.flatMap((item) => item.contactForces);
  return {
    reinforcementState,
    anchorForces,
    contactForces,
    boundaryForces: resolved.flatMap((item) => item.boundaryForces),
    blockWrenches,
    warnings: resolved.flatMap((item) => item.warnings),
    hasAnchorFailure: anchorForces.some((item) => item.status === "fail"),
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
