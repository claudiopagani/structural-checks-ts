// Mechanical TypeScript migration from strutture-js 6f33baead8b88166c4b2cf94af41763412e3c751.

import type {
  FemEntityMappingContract,
  FemJsonObject,
  FemLineElement,
  FemNode,
  FemShellElement,
  FemStructuralMember,
  FemStructuralSlab,
  FemStructuralWall,
  FemVector3,
  GlobalFemModelContract,
} from "../../domain/fem/contracts/FemContractTypes.js";
import {
  GLOBAL_FEM_CLASSIFICATION_PROPOSAL_VERSION,
  normalizeGlobalFemClassificationPolicy,
} from "./classificationPolicy.js";
import type {
  GlobalFemClassification,
  GlobalFemClassificationDiagnostic,
  GlobalFemClassificationPolicy,
  GlobalFemClassifiedDiaphragm,
  GlobalFemClassifiedJoint,
  GlobalFemClassifiedMember,
  GlobalFemClassifiedStorey,
  GlobalFemClassifiedSurface,
  GlobalFemClassificationRequest,
  GlobalFemStructuralClassificationProposal,
  GlobalFemStructuralRole,
} from "./GlobalFemPostProcessingTypes.js";

const DEGREES = 180 / Math.PI;

function isFemNodeArray(value: unknown): value is readonly FemNode[] {
  return Array.isArray(value);
}

function clone<T>(value: T): T {
  return value == null ? value : (JSON.parse(JSON.stringify(value)) as T);
}

function clamp(value: number, minimum = -1, maximum = 1): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function subtract(left: FemVector3, right: FemVector3): FemVector3 {
  return {
    x: left.x - right.x,
    y: left.y - right.y,
    z: left.z - right.z,
  };
}

function dot(left: FemVector3, right: FemVector3 | null): number {
  if (right === null) {
    throw new TypeError("Cannot read properties of null (reading 'x')");
  }
  return left.x * right.x + left.y * right.y + left.z * right.z;
}

function norm(vector: FemVector3 | null): number {
  if (vector === null) {
    throw new TypeError("Cannot read properties of null (reading 'x')");
  }
  return Math.hypot(vector.x, vector.y, vector.z);
}

function normalized(vector: FemVector3 | null): FemVector3 | null {
  if (vector === null) {
    throw new TypeError("Cannot read properties of null (reading 'x')");
  }
  const magnitude = norm(vector);
  if (!Number.isFinite(magnitude) || magnitude <= Number.EPSILON) return null;
  return {
    x: vector.x / magnitude,
    y: vector.y / magnitude,
    z: vector.z / magnitude,
  };
}

function scale(vector: FemVector3, factor: number): FemVector3 {
  return { x: vector.x * factor, y: vector.y * factor, z: vector.z * factor };
}

function add(left: FemVector3, right: FemVector3): FemVector3 {
  return { x: left.x + right.x, y: left.y + right.y, z: left.z + right.z };
}

function averagePoints(points: readonly FemVector3[]): FemVector3 {
  if (points.length === 0) return { x: 0, y: 0, z: 0 };
  return scale(
    points.reduce((sum, point) => add(sum, point), { x: 0, y: 0, z: 0 }),
    1 / points.length,
  );
}

function angleBetweenDirections(
  left: FemVector3 | null,
  right: FemVector3 | null,
  { unoriented = false }: { readonly unoriented?: boolean } = {},
): number | null {
  const normalizedLeft = normalized(left);
  const normalizedRight = normalized(right);
  if (!normalizedLeft || !normalizedRight) return null;
  const cosine = unoriented
    ? Math.abs(dot(normalizedLeft, normalizedRight))
    : dot(normalizedLeft, normalizedRight);
  return Math.acos(clamp(cosine)) * DEGREES;
}

function verticalCoordinate(point: FemVector3, origin: FemVector3, upward: FemVector3): number {
  return dot(subtract(point, origin), upward);
}

function classification({
  role,
  status,
  source,
  confidence,
  evidence,
  requiresConfirmation,
}: GlobalFemClassification): GlobalFemClassification {
  return {
    role,
    status,
    source,
    confidence,
    evidence: [...evidence],
    requiresConfirmation,
  };
}

function confirmedClassification(
  role: GlobalFemStructuralRole,
  evidence: readonly string[] = ["explicit-semantic-mapping"],
  source = "explicit-mapping",
): GlobalFemClassification {
  return classification({
    role,
    status: "confirmed",
    source,
    confidence: 1,
    evidence,
    requiresConfirmation: false,
  });
}

function confidenceFromAngle(angle: number): number {
  return Number(clamp(1 - angle / 90, 0, 1).toFixed(6));
}

function classifyLineDirection(
  direction: FemVector3 | null,
  gravityDirection: FemVector3,
  policy: GlobalFemClassificationPolicy["line"],
): GlobalFemClassification {
  const angleFromVertical = angleBetweenDirections(direction, gravityDirection, {
    unoriented: true,
  });
  if (angleFromVertical === null) {
    throw new TypeError("Cannot read properties of null (reading 'toFixed')");
  }
  const angleFromHorizontal = 90 - angleFromVertical;
  const evidence = [
    `angle-from-vertical:${angleFromVertical.toFixed(6)}deg`,
    `angle-from-horizontal:${angleFromHorizontal.toFixed(6)}deg`,
  ];

  if (angleFromVertical <= policy.verticalToleranceDegrees) {
    return classification({
      role: "column",
      status: "proposed",
      source: "geometric-inference",
      confidence: confidenceFromAngle(angleFromVertical),
      evidence: [...evidence, "axis-near-parallel-to-gravity"],
      requiresConfirmation: true,
    });
  }

  if (angleFromHorizontal <= policy.horizontalToleranceDegrees) {
    return classification({
      role: "beam",
      status: "proposed",
      source: "geometric-inference",
      confidence: confidenceFromAngle(angleFromHorizontal),
      evidence: [...evidence, "axis-near-orthogonal-to-gravity"],
      requiresConfirmation: true,
    });
  }

  if (
    policy.maximumBeamInclinationDegrees != null &&
    angleFromHorizontal <= policy.maximumBeamInclinationDegrees
  ) {
    return classification({
      role: "beam",
      status: "proposed",
      source: "configured-geometric-inference",
      confidence: confidenceFromAngle(angleFromHorizontal),
      evidence: [...evidence, "within-configured-sloped-beam-threshold"],
      requiresConfirmation: true,
    });
  }

  return classification({
    role: "other",
    status: "ambiguous",
    source: "geometric-inference",
    confidence: 0,
    evidence: [...evidence, "orientation-does-not-identify-structural-role"],
    requiresConfirmation: true,
  });
}

function classifyShellNormal(
  normal: FemVector3 | null,
  gravityDirection: FemVector3,
  policy: GlobalFemClassificationPolicy["shell"],
): GlobalFemClassification {
  const angleNormalToVertical = angleBetweenDirections(normal, gravityDirection, {
    unoriented: true,
  });
  if (angleNormalToVertical === null) {
    throw new TypeError("Cannot read properties of null (reading 'toFixed')");
  }
  const evidence = [`normal-angle-from-gravity:${angleNormalToVertical.toFixed(6)}deg`];

  if (angleNormalToVertical <= policy.horizontalPlaneToleranceDegrees) {
    return classification({
      role: "slab",
      status: "proposed",
      source: "geometric-inference",
      confidence: confidenceFromAngle(angleNormalToVertical),
      evidence: [...evidence, "surface-plane-near-horizontal"],
      requiresConfirmation: true,
    });
  }

  const angleFromVerticalPlane = 90 - angleNormalToVertical;
  if (angleFromVerticalPlane <= policy.verticalPlaneToleranceDegrees) {
    return classification({
      role: "wall",
      status: "proposed",
      source: "geometric-inference",
      confidence: confidenceFromAngle(angleFromVerticalPlane),
      evidence: [...evidence, "surface-plane-near-vertical"],
      requiresConfirmation: true,
    });
  }

  return classification({
    role: "generic-shell",
    status: "proposed",
    source: "geometric-routing",
    confidence: 1,
    evidence: [...evidence, "surface-routed-to-generic-shell-processing"],
    requiresConfirmation: true,
  });
}

function modelCharacteristicLength(model: GlobalFemModelContract): number {
  if (model.nodes.length === 0) return 1;
  const values = model.nodes.map((node) => node.coordinates);
  const minimum = {
    x: Math.min(...values.map((item) => item.x)),
    y: Math.min(...values.map((item) => item.y)),
    z: Math.min(...values.map((item) => item.z)),
  };
  const maximum = {
    x: Math.max(...values.map((item) => item.x)),
    y: Math.max(...values.map((item) => item.y)),
    z: Math.max(...values.map((item) => item.z)),
  };
  return Math.max(norm(subtract(maximum, minimum)), 1);
}

interface LineGeometry {
  readonly start: FemVector3;
  readonly end: FemVector3;
  readonly direction: FemVector3 | null;
}

function lineGeometry(
  element: FemLineElement,
  nodeIndex: ReadonlyMap<string, FemNode>,
): LineGeometry {
  const start = nodeAt(nodeIndex, element.nodeIds[0]).coordinates;
  const end = nodeAt(nodeIndex, element.nodeIds[1]).coordinates;
  const direction = normalized(subtract(end, start));
  return { start, end, direction };
}

interface ShellGeometry {
  readonly points: readonly FemVector3[];
  readonly normal: FemVector3 | null;
  readonly centroid: FemVector3;
}

function shellGeometry(
  element: FemShellElement,
  nodeIndex: ReadonlyMap<string, FemNode>,
): ShellGeometry {
  const points = element.nodeIds.map((nodeId) => nodeAt(nodeIndex, nodeId).coordinates);
  const normal = normalized(element.localAxes.z);
  return {
    points,
    normal,
    centroid: averagePoints(points),
  };
}

function nodeAt(nodeIndex: ReadonlyMap<string, FemNode>, nodeId: string): FemNode {
  const node = nodeIndex.get(nodeId);
  if (!node) throw new Error(`Global FEM model is missing node ${nodeId}.`);
  return node;
}

function lineGeometryAt(
  geometries: ReadonlyMap<string, LineGeometry>,
  elementId: string,
): LineGeometry {
  const geometry = geometries.get(elementId);
  if (!geometry) throw new Error(`Global FEM model is missing line geometry ${elementId}.`);
  return geometry;
}

function connectedLineComponents(
  elements: readonly FemLineElement[],
  geometries: ReadonlyMap<string, LineGeometry>,
  classificationById: ReadonlyMap<string, GlobalFemClassification>,
  policy: GlobalFemClassificationPolicy["line"],
): readonly string[][] {
  const byNode = new Map<string, FemLineElement[]>();
  for (const element of elements) {
    for (const nodeId of element.nodeIds) {
      if (!byNode.has(nodeId)) byNode.set(nodeId, []);
      byNode.get(nodeId)?.push(element);
    }
  }

  const adjacency = new Map<string, Set<string>>(
    elements.map((element) => [element.id, new Set<string>()]),
  );
  for (const incident of byNode.values()) {
    if (incident.length !== 2) continue;
    const [first, second] = incident;
    if (!first || !second) continue;
    const firstClassification = classificationById.get(first.id);
    const secondClassification = classificationById.get(second.id);
    if (!firstClassification || !secondClassification) continue;
    const angle = angleBetweenDirections(
      lineGeometryAt(geometries, first.id).direction,
      lineGeometryAt(geometries, second.id).direction,
      { unoriented: true },
    );
    if (angle === null) continue;
    if (
      first.sectionId === second.sectionId &&
      first.materialId === second.materialId &&
      firstClassification.role === secondClassification.role &&
      firstClassification.status === secondClassification.status &&
      angle <= policy.groupingAngleToleranceDegrees
    ) {
      adjacency.get(first.id)?.add(second.id);
      adjacency.get(second.id)?.add(first.id);
    }
  }

  return connectedComponents(
    elements.map((element) => element.id),
    adjacency,
  );
}

function shellPairIsCompatible(
  first: FemShellElement,
  second: FemShellElement,
  geometries: ReadonlyMap<string, ShellGeometry>,
  nodeIndex: ReadonlyMap<string, FemNode>,
  policy: GlobalFemClassificationPolicy["shell"],
  tolerance: number,
): boolean {
  if (first.sectionId !== second.sectionId || first.materialId !== second.materialId) {
    return false;
  }
  const firstGeometry = geometries.get(first.id);
  const secondGeometry = geometries.get(second.id);
  if (!firstGeometry || !secondGeometry) return false;
  const normalAngle = angleBetweenDirections(firstGeometry.normal, secondGeometry.normal);
  if (normalAngle === null || normalAngle > policy.groupingNormalToleranceDegrees) {
    return false;
  }

  const firstOrigin = nodeAt(nodeIndex, first.nodeIds[0]).coordinates;
  const secondOrigin = nodeAt(nodeIndex, second.nodeIds[0]).coordinates;
  return (
    secondGeometry.points.every(
      (point) => Math.abs(dot(subtract(point, firstOrigin), firstGeometry.normal)) <= tolerance,
    ) &&
    firstGeometry.points.every(
      (point) => Math.abs(dot(subtract(point, secondOrigin), secondGeometry.normal)) <= tolerance,
    )
  );
}

function connectedShellComponents(
  elements: readonly FemShellElement[],
  geometries: ReadonlyMap<string, ShellGeometry>,
  nodeIndex: ReadonlyMap<string, FemNode>,
  policy: GlobalFemClassificationPolicy["shell"],
  tolerance: number,
): readonly string[][] {
  const edgeOwners = new Map<string, FemShellElement[]>();
  for (const element of elements) {
    for (let index = 0; index < element.nodeIds.length; index += 1) {
      const first = element.nodeIds[index];
      const second = element.nodeIds[(index + 1) % element.nodeIds.length];
      const key = [first, second].sort().join("|");
      if (!edgeOwners.has(key)) edgeOwners.set(key, []);
      edgeOwners.get(key)?.push(element);
    }
  }

  const adjacency = new Map<string, Set<string>>(
    elements.map((element) => [element.id, new Set<string>()]),
  );
  for (const owners of edgeOwners.values()) {
    for (let firstIndex = 0; firstIndex < owners.length; firstIndex += 1) {
      for (let secondIndex = firstIndex + 1; secondIndex < owners.length; secondIndex += 1) {
        const first = owners[firstIndex];
        const second = owners[secondIndex];
        if (!first || !second) continue;
        if (shellPairIsCompatible(first, second, geometries, nodeIndex, policy, tolerance)) {
          adjacency.get(first.id)?.add(second.id);
          adjacency.get(second.id)?.add(first.id);
        }
      }
    }
  }
  return connectedComponents(
    elements.map((element) => element.id),
    adjacency,
  );
}

function connectedComponents(
  ids: readonly string[],
  adjacency: ReadonlyMap<string, ReadonlySet<string>>,
): readonly string[][] {
  const remaining = new Set(ids);
  const components: string[][] = [];
  for (const root of [...ids].sort()) {
    if (!remaining.has(root)) continue;
    const stack = [root];
    const component: string[] = [];
    remaining.delete(root);
    while (stack.length > 0) {
      const current = stack.pop();
      if (current === undefined) continue;
      component.push(current);
      for (const next of adjacency.get(current) ?? []) {
        if (!remaining.has(next)) continue;
        remaining.delete(next);
        stack.push(next);
      }
    }
    components.push(component.sort());
  }
  return components;
}

function confirmedMembers(
  mapping: FemEntityMappingContract | null | undefined,
  coveredLineElements: Set<string>,
  validLineElementIds: ReadonlySet<string>,
  diagnostics: GlobalFemClassificationDiagnostic[],
): GlobalFemClassifiedMember[] {
  type MappedMember = FemStructuralMember & { readonly metadata?: FemJsonObject };
  const members: GlobalFemClassifiedMember[] = [];
  for (const member of (mapping?.members ?? []) as readonly MappedMember[]) {
    const accepted: string[] = [];
    for (const lineElementId of member.lineElementIds ?? []) {
      if (!validLineElementIds.has(lineElementId)) {
        diagnostics.push({
          code: "FEM_CLASSIFICATION_UNKNOWN_REFERENCE",
          severity: "error",
          entityId: lineElementId,
          message: `Explicit member ${member.id} references unknown line element ${lineElementId}.`,
        });
      } else if (coveredLineElements.has(lineElementId)) {
        diagnostics.push({
          code: "FEM_CLASSIFICATION_EXPLICIT_CONFLICT",
          severity: "error",
          entityId: lineElementId,
          message: `Line element ${lineElementId} has more than one explicit member assignment.`,
        });
      } else {
        coveredLineElements.add(lineElementId);
        accepted.push(lineElementId);
      }
    }
    members.push({
      id: member.id,
      lineElementIds: accepted,
      classification: confirmedClassification(member.role),
      metadata: clone(member.metadata ?? {}),
    });
  }
  return members;
}

function confirmedSurfaces(
  mapping: FemEntityMappingContract | null | undefined,
  coveredShellElements: Set<string>,
  validShellElementIds: ReadonlySet<string>,
  diagnostics: GlobalFemClassificationDiagnostic[],
): GlobalFemClassifiedSurface[] {
  type MappedWall = FemStructuralWall & { readonly metadata?: FemJsonObject };
  type MappedSlab = FemStructuralSlab & { readonly metadata?: FemJsonObject };
  const surfaces: GlobalFemClassifiedSurface[] = [];
  const addSurface = (surface: MappedWall | MappedSlab, role: "wall" | "slab"): void => {
    const accepted: string[] = [];
    for (const shellElementId of surface.shellElementIds ?? []) {
      if (!validShellElementIds.has(shellElementId)) {
        diagnostics.push({
          code: "FEM_CLASSIFICATION_UNKNOWN_REFERENCE",
          severity: "error",
          entityId: shellElementId,
          message: `Explicit surface ${surface.id} references unknown shell element ${shellElementId}.`,
        });
      } else if (coveredShellElements.has(shellElementId)) {
        diagnostics.push({
          code: "FEM_CLASSIFICATION_EXPLICIT_CONFLICT",
          severity: "error",
          entityId: shellElementId,
          message: `Shell element ${shellElementId} has more than one explicit surface assignment.`,
        });
      } else {
        coveredShellElements.add(shellElementId);
        accepted.push(shellElementId);
      }
    }
    surfaces.push({
      id: surface.id,
      shellElementIds: accepted,
      classification: confirmedClassification(role),
      storeyIds:
        role === "wall"
          ? [...(surface as MappedWall).storeyIds]
          : [(surface as MappedSlab).storeyId].filter(Boolean),
      metadata: clone(surface.metadata ?? {}),
    });
  };
  for (const surface of mapping?.walls ?? []) addSurface(surface, "wall");
  for (const surface of mapping?.slabs ?? []) addSurface(surface, "slab");
  return surfaces;
}

function proposeMembers(
  model: GlobalFemModelContract,
  mapping: FemEntityMappingContract | null | undefined,
  nodeIndex: ReadonlyMap<string, FemNode>,
  gravityDirection: FemVector3,
  policy: GlobalFemClassificationPolicy,
  diagnostics: GlobalFemClassificationDiagnostic[],
): GlobalFemClassifiedMember[] {
  const covered = new Set<string>();
  const validIds = new Set(model.lineElements.map((element) => element.id));
  const members = confirmedMembers(mapping, covered, validIds, diagnostics);
  const elements = model.lineElements.filter((element) => !covered.has(element.id));
  const geometries = new Map<string, LineGeometry>(
    elements.map((element) => [element.id, lineGeometry(element, nodeIndex)]),
  );
  const classificationById = new Map<string, GlobalFemClassification>(
    elements.map((element) => [
      element.id,
      classifyLineDirection(
        lineGeometryAt(geometries, element.id).direction,
        gravityDirection,
        policy.line,
      ),
    ]),
  );
  const elementIndex = new Map<string, FemLineElement>(
    elements.map((element) => [element.id, element]),
  );

  for (const component of connectedLineComponents(
    elements,
    geometries,
    classificationById,
    policy.line,
  )) {
    const representativeId = component[0];
    if (!representativeId) continue;
    const representative = classificationById.get(representativeId);
    const representativeElement = elementIndex.get(representativeId);
    if (!representative || !representativeElement) continue;
    members.push({
      id: `proposed-member:${representativeId}`,
      lineElementIds: component,
      classification: {
        ...representative,
        confidence: Math.min(...component.map((id) => classificationById.get(id)?.confidence ?? 0)),
        evidence: [
          ...representative.evidence,
          component.length > 1
            ? "connected-collinear-elements-with-common-section-and-material"
            : "single-line-element",
        ],
      },
      metadata: {
        sectionIds: [...new Set(component.map((id) => elementIndex.get(id)?.sectionId))].filter(
          (id): id is string => id !== undefined,
        ),
        materialIds: [...new Set(component.map((id) => elementIndex.get(id)?.materialId))].filter(
          (id): id is string => id !== undefined,
        ),
      },
    });
  }
  return members;
}

function proposeSurfaces(
  model: GlobalFemModelContract,
  mapping: FemEntityMappingContract | null | undefined,
  nodeIndex: ReadonlyMap<string, FemNode>,
  gravityDirection: FemVector3,
  policy: GlobalFemClassificationPolicy,
  tolerance: number,
  diagnostics: GlobalFemClassificationDiagnostic[],
): GlobalFemClassifiedSurface[] {
  const covered = new Set<string>();
  const validIds = new Set(model.shellElements.map((element) => element.id));
  const surfaces = confirmedSurfaces(mapping, covered, validIds, diagnostics);
  const elements = model.shellElements.filter((element) => !covered.has(element.id));
  const geometries = new Map<string, ShellGeometry>(
    elements.map((element) => [element.id, shellGeometry(element, nodeIndex)]),
  );
  const elementIndex = new Map<string, FemShellElement>(
    elements.map((element) => [element.id, element]),
  );

  for (const component of connectedShellComponents(
    elements,
    geometries,
    nodeIndex,
    policy.shell,
    tolerance,
  )) {
    const representativeId = component[0];
    if (!representativeId) continue;
    const representativeGeometry = geometries.get(representativeId);
    if (!representativeGeometry) continue;
    const representativeNormal = representativeGeometry.normal;
    const surfaceClassification = classifyShellNormal(
      representativeNormal,
      gravityDirection,
      policy.shell,
    );
    const nodeIds = [...new Set(component.flatMap((id) => elementIndex.get(id)?.nodeIds ?? []))];
    if (!representativeNormal) continue;
    surfaces.push({
      id: `proposed-surface:${representativeId}`,
      shellElementIds: component,
      classification: {
        ...surfaceClassification,
        evidence: [
          ...surfaceClassification.evidence,
          component.length > 1 ? "connected-coplanar-shell-mesh" : "single-shell-element",
        ],
      },
      centroid: averagePoints(nodeIds.map((nodeId) => nodeAt(nodeIndex, nodeId).coordinates)),
      normal: clone(representativeNormal),
      metadata: {
        sectionIds: [...new Set(component.map((id) => elementIndex.get(id)?.sectionId))].filter(
          (id): id is string => id !== undefined,
        ),
        materialIds: [...new Set(component.map((id) => elementIndex.get(id)?.materialId))].filter(
          (id): id is string => id !== undefined,
        ),
      },
    });
  }
  return surfaces;
}

function clusterElevations(
  values: readonly number[],
  tolerance: number,
): { readonly values: readonly number[]; readonly mean: number }[] {
  const clusters: { values: number[]; mean: number }[] = [];
  for (const value of [...values].sort((left, right) => left - right)) {
    const last = clusters.at(-1);
    if (!last || Math.abs(value - last.mean) > tolerance) {
      clusters.push({ values: [value], mean: value });
    } else {
      last.values.push(value);
      last.mean = last.values.reduce((sum, item) => sum + item, 0) / last.values.length;
    }
  }
  return clusters;
}

function proposeDiaphragms(
  model: GlobalFemModelContract,
  nodeIndex: ReadonlyMap<string, FemNode>,
  origin: FemVector3,
  upward: FemVector3,
  elevationTolerance: number,
): {
  readonly diaphragms: GlobalFemClassifiedDiaphragm[];
  readonly coveredConstraints: Set<string>;
} {
  const diaphragms: GlobalFemClassifiedDiaphragm[] = model.diaphragms.map((diaphragm) => ({
    id: diaphragm.id,
    nodeIds: [...diaphragm.nodeIds],
    classification: confirmedClassification(
      "diaphragm",
      ["explicit-model-diaphragm"],
      "explicit-model",
    ),
    sourceEntityId: diaphragm.id,
  }));
  const coveredConstraints = new Set<string>();

  for (const constraint of model.constraints) {
    if (!/(diaphragm|rigid[-_ ]?floor|rigid[-_ ]?plane)/i.test(constraint.type)) continue;
    const nodeIds = [constraint.masterNodeId, ...(constraint.slaveNodeIds ?? [])];
    const elevations = nodeIds
      .map((nodeId) => nodeIndex.get(nodeId)?.coordinates)
      .filter((point): point is FemVector3 => point !== undefined)
      .map((point) => verticalCoordinate(point, origin, upward));
    if (
      elevations.length < 3 ||
      Math.max(...elevations) - Math.min(...elevations) > elevationTolerance
    ) {
      continue;
    }
    coveredConstraints.add(constraint.id);
    diaphragms.push({
      id: `proposed-diaphragm:${constraint.id}`,
      nodeIds,
      classification: classification({
        role: "diaphragm",
        status: "proposed",
        source: "constraint-inference",
        confidence: 1,
        evidence: ["constraint-type-declares-rigid-plane", "constraint-nodes-are-coplanar"],
        requiresConfirmation: true,
      }),
      sourceEntityId: constraint.id,
    });
  }

  return { diaphragms, coveredConstraints };
}

function proposeStoreys(
  model: GlobalFemModelContract,
  mapping: FemEntityMappingContract | null | undefined,
  nodeIndex: ReadonlyMap<string, FemNode>,
  surfaces: readonly GlobalFemClassifiedSurface[],
  diaphragms: readonly GlobalFemClassifiedDiaphragm[],
  origin: FemVector3,
  upward: FemVector3,
  tolerance: number,
): GlobalFemClassifiedStorey[] {
  const storeys: GlobalFemClassifiedStorey[] = [];
  const mappedIds = new Set<string>();
  for (const storey of mapping?.storeys ?? []) {
    mappedIds.add(storey.storeyId);
    const modelStorey = model.storeys.find((item) => item.id === storey.storeyId);
    storeys.push({
      id: storey.id,
      storeyId: storey.storeyId,
      elevation: modelStorey?.elevation ?? null,
      nodeIds: [...(storey.nodeIds ?? [])],
      diaphragmIds: [...(storey.diaphragmIds ?? [])],
      classification: confirmedClassification("storey"),
    });
  }

  for (const modelStorey of model.storeys) {
    if (mappedIds.has(modelStorey.id)) continue;
    storeys.push({
      id: `proposed-storey:${modelStorey.id}`,
      storeyId: modelStorey.id,
      elevation: modelStorey.elevation,
      nodeIds: model.nodes
        .filter(
          (node) =>
            Math.abs(
              verticalCoordinate(node.coordinates, origin, upward) - modelStorey.elevation,
            ) <= tolerance,
        )
        .map((node) => node.id),
      diaphragmIds: [...modelStorey.diaphragmIds],
      classification: classification({
        role: "storey",
        status: "proposed",
        source: "model-level-inference",
        confidence: 1,
        evidence: ["explicit-model-storey-without-confirmed-semantic-mapping"],
        requiresConfirmation: true,
      }),
    });
  }

  if (model.storeys.length > 0 || storeys.length > 0) return storeys;

  const candidateElevations: number[] = [];
  for (const diaphragm of diaphragms) {
    const points = diaphragm.nodeIds
      .map((nodeId) => nodeIndex.get(nodeId)?.coordinates)
      .filter((point): point is FemVector3 => point !== undefined);
    if (points.length > 0) {
      candidateElevations.push(verticalCoordinate(averagePoints(points), origin, upward));
    }
  }
  for (const surface of surfaces) {
    if (surface.classification.role === "slab" && surface.centroid) {
      candidateElevations.push(verticalCoordinate(surface.centroid, origin, upward));
    }
  }

  return clusterElevations(candidateElevations, tolerance).map((cluster, index) => {
    const elevation = cluster.mean;
    return {
      id: `proposed-storey:${index + 1}`,
      storeyId: `proposed-level:${index + 1}`,
      elevation,
      nodeIds: model.nodes
        .filter(
          (node) =>
            Math.abs(verticalCoordinate(node.coordinates, origin, upward) - elevation) <= tolerance,
        )
        .map((node) => node.id),
      diaphragmIds: diaphragms
        .filter((diaphragm) => {
          const points = diaphragm.nodeIds
            .map((nodeId) => nodeIndex.get(nodeId)?.coordinates)
            .filter((point): point is FemVector3 => point !== undefined);
          return (
            points.length > 0 &&
            Math.abs(verticalCoordinate(averagePoints(points), origin, upward) - elevation) <=
              tolerance
          );
        })
        .map((diaphragm) => diaphragm.id),
      classification: classification({
        role: "storey",
        status: "proposed",
        source: "elevation-clustering",
        confidence: 1,
        evidence: ["horizontal-surface-or-diaphragm-elevation-cluster"],
        requiresConfirmation: true,
      }),
    };
  });
}

interface IncidentLineElement {
  readonly element: FemLineElement;
  readonly end: "start" | "end";
}

function proposeJoints(
  model: GlobalFemModelContract,
  mapping: FemEntityMappingContract | null | undefined,
  members: readonly GlobalFemClassifiedMember[],
  policy: GlobalFemClassificationPolicy,
): GlobalFemClassifiedJoint[] {
  const joints: GlobalFemClassifiedJoint[] = (mapping?.joints ?? []).map((joint) => ({
    id: joint.id,
    nodeId: joint.nodeId,
    lineElementEnds: clone(joint.lineElementEnds ?? []),
    classification: confirmedClassification("beam-column-joint"),
  }));
  const mappedNodes = new Set(joints.map((joint) => joint.nodeId));
  const memberByElement = new Map<string, GlobalFemClassifiedMember>();
  for (const member of members) {
    for (const lineElementId of member.lineElementIds) {
      memberByElement.set(lineElementId, member);
    }
  }
  const incidentByNode = new Map<string, IncidentLineElement[]>(
    model.nodes.map((node) => [node.id, []]),
  );
  for (const element of model.lineElements) {
    incidentByNode.get(element.nodeIds[0])?.push({ element, end: "start" });
    incidentByNode.get(element.nodeIds[1])?.push({ element, end: "end" });
  }

  for (const [nodeId, incident] of incidentByNode) {
    if (mappedNodes.has(nodeId)) continue;
    if (incident.length < policy.joints.minimumIncidentLineElements) continue;
    const roles = new Set(
      incident.map(({ element }) => memberByElement.get(element.id)?.classification.role),
    );
    if (!roles.has("beam") || !roles.has("column")) continue;
    const ambiguous = incident.some(
      ({ element }) => memberByElement.get(element.id)?.classification.status === "ambiguous",
    );
    joints.push({
      id: `proposed-joint:${nodeId}`,
      nodeId,
      lineElementEnds: incident.map(({ element, end }) => ({
        lineElementId: element.id,
        end,
      })),
      classification: classification({
        role: "beam-column-joint",
        status: ambiguous ? "ambiguous" : "proposed",
        source: "connectivity-and-role-inference",
        confidence: ambiguous
          ? 0
          : Math.min(
              ...incident.map(
                ({ element }) => memberByElement.get(element.id)?.classification.confidence ?? 0,
              ),
            ),
        evidence: ["incident-beam-and-column-candidates-at-common-fem-node"],
        requiresConfirmation: true,
      }),
    });
  }
  return joints;
}

function proposalWarnings(
  proposal: Pick<
    GlobalFemStructuralClassificationProposal,
    "members" | "surfaces" | "storeys" | "diaphragms" | "joints"
  >,
): GlobalFemClassificationDiagnostic[] {
  const all = [
    ...proposal.members,
    ...proposal.surfaces,
    ...proposal.storeys,
    ...proposal.diaphragms,
    ...proposal.joints,
  ];
  const proposed = all.filter((item) => item.classification.status === "proposed").length;
  const ambiguous = all.filter((item) => item.classification.status === "ambiguous").length;
  const warnings: GlobalFemClassificationDiagnostic[] = [];
  if (proposed > 0) {
    warnings.push({
      code: "FEM_CLASSIFICATION_REQUIRES_CONFIRMATION",
      message: `${proposed} structural classifications are proposals and cannot authorize final normative verification.`,
    });
  }
  if (ambiguous > 0) {
    warnings.push({
      code: "FEM_CLASSIFICATION_AMBIGUOUS",
      message: `${ambiguous} structural classifications are ambiguous and block role-dependent checks.`,
    });
  }
  return warnings;
}

export function classifyGlobalFemStructuralEntities({
  model,
  mapping = null,
  policy: policyInput = {},
}: GlobalFemClassificationRequest = {}): GlobalFemStructuralClassificationProposal {
  if (!model || !isFemNodeArray(model.nodes)) {
    throw new Error("Global FEM structural classification requires a model contract.");
  }
  const policy = normalizeGlobalFemClassificationPolicy(policyInput);
  const nodeIndex = new Map<string, FemNode>(model.nodes.map((node) => [node.id, node]));
  const gravityDirection = normalized(model.globalCoordinateSystem.gravityDirection);
  if (!gravityDirection) {
    throw new Error(
      "Global FEM structural classification requires a non-degenerate gravity direction.",
    );
  }
  const upward = scale(gravityDirection, -1);
  const origin = model.globalCoordinateSystem.origin;
  const characteristicLength = modelCharacteristicLength(model);
  const coplanarityTolerance =
    policy.shell.coplanarityTolerance ??
    characteristicLength * policy.storeys.relativeElevationTolerance;
  const elevationTolerance =
    policy.storeys.elevationTolerance ??
    characteristicLength * policy.storeys.relativeElevationTolerance;
  const diagnostics: GlobalFemClassificationDiagnostic[] = [];

  const members = proposeMembers(model, mapping, nodeIndex, gravityDirection, policy, diagnostics);
  const surfaces = proposeSurfaces(
    model,
    mapping,
    nodeIndex,
    gravityDirection,
    policy,
    coplanarityTolerance,
    diagnostics,
  );
  const { diaphragms } = proposeDiaphragms(model, nodeIndex, origin, upward, elevationTolerance);
  const storeys = proposeStoreys(
    model,
    mapping,
    nodeIndex,
    surfaces,
    diaphragms,
    origin,
    upward,
    elevationTolerance,
  );
  const joints = proposeJoints(model, mapping, members, policy);

  const proposalEntities = { members, surfaces, storeys, diaphragms, joints };
  const allEntities = [members, surfaces, storeys, diaphragms, joints].flat();
  const summary = {
    confirmed: allEntities.filter((item) => item.classification.status === "confirmed").length,
    proposed: allEntities.filter((item) => item.classification.status === "proposed").length,
    ambiguous: allEntities.filter((item) => item.classification.status === "ambiguous").length,
  };
  const proposal = {
    schema: "strutture-js/fem-structural-classification-proposal" as const,
    version: GLOBAL_FEM_CLASSIFICATION_PROPOSAL_VERSION,
    modelId: model.id,
    modelHash: model.hash,
    policy: {
      ...clone(policy),
      resolved: {
        characteristicLength,
        coplanarityTolerance,
        elevationTolerance,
        modelLengthUnit: model.units.length,
      },
    },
    ...proposalEntities,
    diagnostics,
    warnings: proposalWarnings(proposalEntities),
    summary,
  };
  return proposal;
}
