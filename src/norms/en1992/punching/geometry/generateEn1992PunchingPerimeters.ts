import {
  PunchingControlPerimeter,
  type PunchingConnectionModel,
  type PunchingFootprint,
  type PunchingPerimeterComponentInput,
  type PunchingPlanPoint,
  type PunchingSegmentInput,
  type PunchingSupportPosition,
} from "../../../../domain/slabs/punching/index.js";
import type { UnitSystemInput } from "../../../../domain/units/UnitSystem.js";
import { withNormativeReferences } from "../../../normativeReference.js";
import { EN1992_RC_EXTERNAL_REFERENCES } from "../../normativeReferences.js";

const INTERNAL_UNITS = Object.freeze({
  force: "N",
  length: "mm",
}) satisfies UnitSystemInput;
const GEOMETRY_TOLERANCE = 1e-6;

type RectangularFootprint = Extract<PunchingFootprint, { shape: "rectangle" }>;
type CircularFootprint = Extract<PunchingFootprint, { shape: "circle" }>;

function line(start: PunchingPlanPoint, end: PunchingPlanPoint): PunchingSegmentInput {
  return { type: "line", start, end };
}

function arc(
  center: PunchingPlanPoint,
  radius: number,
  startAngle: number,
  sweepAngle: number,
): PunchingSegmentInput {
  return { type: "arc", center, radius, startAngle, sweepAngle };
}

function rectangleBounds(footprint: RectangularFootprint) {
  return {
    xMin: footprint.center.x - footprint.sizeX / 2,
    xMax: footprint.center.x + footprint.sizeX / 2,
    yMin: footprint.center.y - footprint.sizeY / 2,
    yMax: footprint.center.y + footprint.sizeY / 2,
  };
}

function slabRectangleBounds(boundary: readonly PunchingPlanPoint[]) {
  if (boundary.length !== 4) {
    throw new Error(
      "Generated edge and corner perimeters require a four-sided rectangular slab boundary.",
    );
  }
  const xValues = [...new Set(boundary.map((point) => point.x))];
  const yValues = [...new Set(boundary.map((point) => point.y))];
  if (xValues.length !== 2 || yValues.length !== 2) {
    throw new Error(
      "Generated edge and corner perimeters require an axis-aligned slab boundary in the connection local frame.",
    );
  }
  return {
    xMin: Math.min(...xValues),
    xMax: Math.max(...xValues),
    yMin: Math.min(...yValues),
    yMax: Math.max(...yValues),
  };
}

function pointInRing(point: PunchingPlanPoint, ring: readonly PunchingPlanPoint[]): boolean {
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) {
    const first = ring[index];
    const second = ring[previous];
    if (!first || !second) continue;
    const crosses =
      first.y > point.y !== second.y > point.y &&
      point.x < ((second.x - first.x) * (point.y - first.y)) / (second.y - first.y) + first.x;
    if (crosses) inside = !inside;
  }
  return inside;
}

function pointSegmentDistance(
  point: PunchingPlanPoint,
  first: PunchingPlanPoint,
  second: PunchingPlanPoint,
): number {
  const dx = second.x - first.x;
  const dy = second.y - first.y;
  const denominator = dx ** 2 + dy ** 2;
  const parameter =
    denominator === 0
      ? 0
      : Math.min(
          1,
          Math.max(0, ((point.x - first.x) * dx + (point.y - first.y) * dy) / denominator),
        );
  return Math.hypot(point.x - (first.x + parameter * dx), point.y - (first.y + parameter * dy));
}

function conservativeBoundaryClearance(connection: PunchingConnectionModel): number {
  const footprint = connection.support.footprint;
  const center = footprint.center;
  const boundary = connection.slab.boundary;
  if (!pointInRing(center, boundary)) return -Infinity;

  const centerDistance = boundary.reduce((minimum, point, index) => {
    const next = boundary[(index + 1) % boundary.length];
    return next ? Math.min(minimum, pointSegmentDistance(center, point, next)) : minimum;
  }, Infinity);
  const boundingRadius =
    footprint.shape === "circle"
      ? footprint.diameter / 2
      : footprint.shape === "rectangle"
        ? Math.hypot(footprint.sizeX / 2, footprint.sizeY / 2)
        : Infinity;
  return centerDistance - boundingRadius;
}

function close(first: number, second: number): boolean {
  return Math.abs(first - second) <= GEOMETRY_TOLERANCE;
}

interface CreatePerimeterOptions {
  id: string;
  codeId: string;
  role: string;
  position: PunchingSupportPosition;
  offset: number;
  segments: PunchingSegmentInput[];
  closed: boolean;
  clause: string;
  metadata?: Record<string, unknown>;
}

function createPerimeter({
  id,
  codeId,
  role,
  position,
  offset,
  segments,
  closed,
  clause,
  metadata = {},
}: CreatePerimeterOptions): PunchingControlPerimeter {
  const normativeReference = codeId.includes("2023")
    ? EN1992_RC_EXTERNAL_REFERENCES.punching2023
    : EN1992_RC_EXTERNAL_REFERENCES.punching2004;
  const components: PunchingPerimeterComponentInput[] = [{ closed, segments }];
  return new PunchingControlPerimeter({
    id,
    codeId,
    role,
    position,
    offset,
    units: INTERNAL_UNITS,
    components,
    source: { method: "generated", standard: codeId, clause },
    metadata: withNormativeReferences(metadata, [normativeReference]),
  });
}

function interiorRectangleSegments(
  footprint: RectangularFootprint,
  offset: number,
): PunchingSegmentInput[] {
  const { xMin, xMax, yMin, yMax } = rectangleBounds(footprint);
  const segments: PunchingSegmentInput[] = [
    line({ x: xMin, y: yMax + offset }, { x: xMax, y: yMax + offset }),
  ];
  if (offset > 0) {
    segments.push(arc({ x: xMax, y: yMax }, offset, Math.PI / 2, -Math.PI / 2));
  }
  segments.push(line({ x: xMax + offset, y: yMax }, { x: xMax + offset, y: yMin }));
  if (offset > 0) {
    segments.push(arc({ x: xMax, y: yMin }, offset, 0, -Math.PI / 2));
  }
  segments.push(line({ x: xMax, y: yMin - offset }, { x: xMin, y: yMin - offset }));
  if (offset > 0) {
    segments.push(arc({ x: xMin, y: yMin }, offset, -Math.PI / 2, -Math.PI / 2));
  }
  segments.push(line({ x: xMin - offset, y: yMin }, { x: xMin - offset, y: yMax }));
  if (offset > 0) {
    segments.push(arc({ x: xMin, y: yMax }, offset, Math.PI, -Math.PI / 2));
  }
  return segments;
}

function interiorCircleSegments(
  footprint: CircularFootprint,
  offset: number,
): PunchingSegmentInput[] {
  return [arc(footprint.center, footprint.diameter / 2 + offset, 0, 2 * Math.PI)];
}

function edgeRectangleSegments(
  footprint: RectangularFootprint,
  offset: number,
  activeNormalLength: number,
): PunchingSegmentInput[] {
  const { xMax, yMin, yMax } = rectangleBounds(footprint);
  const xStart = xMax - activeNormalLength;
  const segments: PunchingSegmentInput[] = [
    line({ x: xStart, y: yMax + offset }, { x: xMax, y: yMax + offset }),
  ];
  if (offset > 0) {
    segments.push(arc({ x: xMax, y: yMax }, offset, Math.PI / 2, -Math.PI / 2));
  }
  segments.push(line({ x: xMax + offset, y: yMax }, { x: xMax + offset, y: yMin }));
  if (offset > 0) {
    segments.push(arc({ x: xMax, y: yMin }, offset, 0, -Math.PI / 2));
  }
  segments.push(line({ x: xMax, y: yMin - offset }, { x: xStart, y: yMin - offset }));
  return segments;
}

function cornerRectangleSegments(
  footprint: RectangularFootprint,
  offset: number,
  activeX: number,
  activeY: number,
): PunchingSegmentInput[] {
  const { xMax, yMax } = rectangleBounds(footprint);
  const segments: PunchingSegmentInput[] = [
    line({ x: xMax - activeX, y: yMax + offset }, { x: xMax, y: yMax + offset }),
  ];
  if (offset > 0) {
    segments.push(arc({ x: xMax, y: yMax }, offset, Math.PI / 2, -Math.PI / 2));
  }
  segments.push(line({ x: xMax + offset, y: yMax }, { x: xMax + offset, y: yMax - activeY }));
  return segments;
}

function allocateCornerSupportFaceLengths(sizeX: number, sizeY: number, effectiveDepth: number) {
  const target = Math.min(3 * effectiveDepth, sizeX + sizeY);
  let activeX = Math.min(sizeX, 1.5 * effectiveDepth);
  let activeY = Math.min(sizeY, 1.5 * effectiveDepth);
  let remaining = target - activeX - activeY;
  if (remaining > 0) {
    const addX = Math.min(remaining, sizeX - activeX);
    activeX += addX;
    remaining -= addX;
    activeY += Math.min(remaining, sizeY - activeY);
  }
  return { activeX, activeY, target };
}

function assertRectangularFootprint(
  footprint: PunchingFootprint,
  message: string,
): asserts footprint is RectangularFootprint {
  if (footprint.shape !== "rectangle") {
    throw new Error(message);
  }
}

function validateCanonicalExternalGeometry(
  connection: PunchingConnectionModel,
  requiredOffset: number,
): void {
  const footprint = connection.support.footprint;
  assertRectangularFootprint(
    footprint,
    "Generated edge and corner perimeters require an axis-aligned rectangular support footprint.",
  );
  if (Math.abs(footprint.rotation) > GEOMETRY_TOLERANCE) {
    throw new Error(
      "Generated edge and corner perimeters require an axis-aligned rectangular support footprint.",
    );
  }
  const slab = slabRectangleBounds(connection.slab.boundary);
  const support = rectangleBounds(footprint);
  if (!close(support.xMin, slab.xMin)) {
    throw new Error(
      "Canonical external-support geometry requires the support negative-X face on the slab free edge.",
    );
  }
  if (connection.support.position === "corner" && !close(support.yMin, slab.yMin)) {
    throw new Error(
      "Canonical corner geometry requires the support negative-Y face on the second slab free edge.",
    );
  }
  if (
    connection.support.position === "edge" &&
    (support.yMin - requiredOffset < slab.yMin || support.yMax + requiredOffset > slab.yMax)
  ) {
    throw new Error("The generated edge-column control perimeter intersects another slab edge.");
  }
  if (
    support.xMax + requiredOffset > slab.xMax ||
    (connection.support.position === "corner" && support.yMax + requiredOffset > slab.yMax)
  ) {
    throw new Error("The generated control perimeter exceeds the available slab boundary.");
  }
}

function validateInteriorDimensions(
  connection: PunchingConnectionModel,
  effectiveDepth: number,
  requiredOffset: number,
): void {
  const footprint = connection.support.footprint;
  if (footprint.shape === "rectangle") {
    if (Math.abs(footprint.rotation) > GEOMETRY_TOLERANCE) {
      throw new Error(
        "Generated rectangular perimeters currently require support.footprint.rotation = 0.",
      );
    }
    if (footprint.sizeX > 3 * effectiveDepth || footprint.sizeY > 3 * effectiveDepth) {
      throw new Error(
        "Generated interior perimeters for elongated supports greater than 3d are not implemented.",
      );
    }
  }
  if (conservativeBoundaryClearance(connection) < requiredOffset) {
    throw new Error(
      "The generated interior control perimeter exceeds the conservatively evaluated slab boundary clearance.",
    );
  }
}

function interiorSegments(
  footprint: RectangularFootprint | CircularFootprint,
  offset: number,
): PunchingSegmentInput[] {
  return footprint.shape === "circle"
    ? interiorCircleSegments(footprint, offset)
    : interiorRectangleSegments(footprint, offset);
}

function generate2004(
  connection: PunchingConnectionModel,
  codeId: string,
  effectiveDepth: number,
): PunchingControlPerimeter[] {
  const position = connection.support.position as PunchingSupportPosition;
  const footprint = connection.support.footprint;
  const requiredOffset = 2 * effectiveDepth;

  if (position === "interior") {
    if (footprint.shape === "polygon") {
      throw new Error("Generated punching perimeters require a rectangular or circular footprint.");
    }
    validateInteriorDimensions(connection, effectiveDepth, requiredOffset);
    return [
      createPerimeter({
        id: "support-face-u0",
        codeId,
        role: "support-face",
        position,
        offset: 0,
        segments: interiorSegments(footprint, 0),
        closed: true,
        clause: "6.4.5(3)",
      }),
      createPerimeter({
        id: "basic-control-u1",
        codeId,
        role: "basic-control",
        position,
        offset: requiredOffset,
        segments: interiorSegments(footprint, requiredOffset),
        closed: true,
        clause: "6.4.2",
      }),
    ];
  }

  validateCanonicalExternalGeometry(connection, requiredOffset);
  assertRectangularFootprint(
    footprint,
    "Generated circular edge and corner support perimeters are not implemented.",
  );
  if (footprint.sizeX > 3 * effectiveDepth || footprint.sizeY > 3 * effectiveDepth) {
    throw new Error(
      "Generated 2004 perimeters for external supports with a side greater than 3d are not implemented.",
    );
  }

  if (position === "edge") {
    return [
      createPerimeter({
        id: "support-face-u0",
        codeId,
        role: "support-face",
        position,
        offset: 0,
        segments: edgeRectangleSegments(
          footprint,
          0,
          Math.min(footprint.sizeX, 1.5 * effectiveDepth),
        ),
        closed: false,
        clause: "6.4.5(3)",
      }),
      createPerimeter({
        id: "basic-control-u1",
        codeId,
        role: "basic-control",
        position,
        offset: requiredOffset,
        segments: edgeRectangleSegments(footprint, requiredOffset, footprint.sizeX),
        closed: false,
        clause: "6.4.2, Figure 6.15",
      }),
    ];
  }

  const supportLengths = allocateCornerSupportFaceLengths(
    footprint.sizeX,
    footprint.sizeY,
    effectiveDepth,
  );
  return [
    createPerimeter({
      id: "support-face-u0",
      codeId,
      role: "support-face",
      position,
      offset: 0,
      segments: cornerRectangleSegments(
        footprint,
        0,
        supportLengths.activeX,
        supportLengths.activeY,
      ),
      closed: false,
      clause: "6.4.5(3)",
      metadata: { targetLength: supportLengths.target },
    }),
    createPerimeter({
      id: "basic-control-u1",
      codeId,
      role: "basic-control",
      position,
      offset: requiredOffset,
      segments: cornerRectangleSegments(
        footprint,
        requiredOffset,
        footprint.sizeX,
        footprint.sizeY,
      ),
      closed: false,
      clause: "6.4.2, Figure 6.16",
    }),
  ];
}

function generate2023(
  connection: PunchingConnectionModel,
  codeId: string,
  effectiveDepth: number,
): PunchingControlPerimeter[] {
  const position = connection.support.position as PunchingSupportPosition;
  const footprint = connection.support.footprint;
  const requiredOffset = effectiveDepth / 2;

  if (position === "interior") {
    if (footprint.shape === "polygon") {
      throw new Error("Generated punching perimeters require a rectangular or circular footprint.");
    }
    validateInteriorDimensions(connection, effectiveDepth, requiredOffset);
    return [
      createPerimeter({
        id: "support-perimeter-b0",
        codeId,
        role: "support-face",
        position,
        offset: 0,
        segments: interiorSegments(footprint, 0),
        closed: true,
        clause: "8.4.2",
      }),
      createPerimeter({
        id: "basic-control-b0.5",
        codeId,
        role: "basic-control",
        position,
        offset: requiredOffset,
        segments: interiorSegments(footprint, requiredOffset),
        closed: true,
        clause: "8.4.2",
      }),
    ];
  }

  validateCanonicalExternalGeometry(connection, requiredOffset);
  assertRectangularFootprint(
    footprint,
    "Generated circular edge and corner support perimeters are not implemented.",
  );
  if (position === "edge" && footprint.sizeY > 3 * effectiveDepth) {
    throw new Error(
      "Generated 2023 edge perimeters with a column side parallel to the edge greater than 3dv are not implemented.",
    );
  }
  if (position === "edge") {
    const activeNormal = Math.min(footprint.sizeX, 1.5 * effectiveDepth);
    return [
      createPerimeter({
        id: "support-perimeter-b0",
        codeId,
        role: "support-face",
        position,
        offset: 0,
        segments: edgeRectangleSegments(footprint, 0, activeNormal),
        closed: false,
        clause: "8.4.2",
      }),
      createPerimeter({
        id: "basic-control-b0.5",
        codeId,
        role: "basic-control",
        position,
        offset: requiredOffset,
        segments: edgeRectangleSegments(footprint, requiredOffset, activeNormal),
        closed: false,
        clause: "8.4.2",
      }),
    ];
  }

  const activeX = Math.min(footprint.sizeX, 1.5 * effectiveDepth);
  const activeY = Math.min(footprint.sizeY, 1.5 * effectiveDepth);
  return [
    createPerimeter({
      id: "support-perimeter-b0",
      codeId,
      role: "support-face",
      position,
      offset: 0,
      segments: cornerRectangleSegments(footprint, 0, activeX, activeY),
      closed: false,
      clause: "8.4.2",
    }),
    createPerimeter({
      id: "basic-control-b0.5",
      codeId,
      role: "basic-control",
      position,
      offset: requiredOffset,
      segments: cornerRectangleSegments(footprint, requiredOffset, activeX, activeY),
      closed: false,
      clause: "8.4.2",
    }),
  ];
}

export interface GenerateEn1992PunchingPerimetersOptions {
  connection?: PunchingConnectionModel;
  codeId?: string;
  edition?: "2004" | "2023";
  effectiveDepth?: number;
}

export function generateEn1992PunchingPerimeters({
  connection,
  codeId,
  edition,
  effectiveDepth,
}: GenerateEn1992PunchingPerimetersOptions = {}): PunchingControlPerimeter[] {
  if (!connection?.support.position) {
    throw new Error("Generated punching perimeters require support.position.");
  }
  if (!["interior", "edge", "corner"].includes(connection.support.position)) {
    throw new Error(`Unsupported support position: ${connection.support.position}.`);
  }
  if (!Number.isFinite(effectiveDepth) || (effectiveDepth as number) <= 0) {
    throw new Error("Generated punching perimeters require a positive effectiveDepth.");
  }
  if (connection.slab.openings.length > 0) {
    throw new Error("Generated punching perimeters with slab openings are not implemented.");
  }
  if (!["rectangle", "circle"].includes(connection.support.footprint.shape)) {
    throw new Error("Generated punching perimeters require a rectangular or circular footprint.");
  }
  if (
    connection.support.position !== "interior" &&
    connection.support.footprint.shape === "circle"
  ) {
    throw new Error("Generated circular edge and corner support perimeters are not implemented.");
  }

  return edition === "2004"
    ? generate2004(connection, codeId ?? "", effectiveDepth as number)
    : generate2023(connection, codeId ?? "", effectiveDepth as number);
}

export interface GenerateEn1992PunchingPerimeterAtOffsetOptions
  extends GenerateEn1992PunchingPerimetersOptions {
  offset?: number;
  role?: string;
  id?: string;
}

export function generateEn1992PunchingPerimeterAtOffset({
  connection,
  codeId,
  edition,
  effectiveDepth,
  offset,
  role = "outer-control",
  id = `${role}-at-${String(offset)}`,
}: GenerateEn1992PunchingPerimeterAtOffsetOptions = {}): PunchingControlPerimeter {
  if (!connection) {
    throw new Error("An additional punching perimeter requires a connection.");
  }
  if (!Number.isFinite(offset) || (offset as number) <= 0) {
    throw new Error("An additional punching perimeter requires a positive offset.");
  }
  if (!Number.isFinite(effectiveDepth) || (effectiveDepth as number) <= 0) {
    throw new Error("An additional punching perimeter requires a positive effectiveDepth.");
  }
  if (connection.slab.openings.length > 0) {
    throw new Error("Generated additional perimeters with slab openings are not implemented.");
  }

  const position = connection.support.position;
  const footprint = connection.support.footprint;
  if (!position) {
    throw new Error("Generated additional perimeters require support.position.");
  }
  const finiteOffset = offset as number;
  const finiteDepth = effectiveDepth as number;

  if (position === "interior") {
    if (footprint.shape === "polygon") {
      throw new Error("Generated additional perimeters require a rectangular or circular support.");
    }
    validateInteriorDimensions(connection, finiteDepth, finiteOffset);
    return createPerimeter({
      id,
      codeId: codeId ?? "",
      role,
      position,
      offset: finiteOffset,
      segments: interiorSegments(footprint, finiteOffset),
      closed: true,
      clause: edition === "2004" ? "6.4.5(4)" : "8.4.4",
    });
  }

  validateCanonicalExternalGeometry(connection, finiteOffset);
  assertRectangularFootprint(
    footprint,
    "Generated additional external perimeters require a rectangular support.",
  );

  if (position === "edge") {
    const activeNormal =
      edition === "2004" ? footprint.sizeX : Math.min(footprint.sizeX, 1.5 * finiteDepth);
    return createPerimeter({
      id,
      codeId: codeId ?? "",
      role,
      position,
      offset: finiteOffset,
      segments: edgeRectangleSegments(footprint, finiteOffset, activeNormal),
      closed: false,
      clause: edition === "2004" ? "6.4.5(4)" : "8.4.4",
    });
  }

  const activeX =
    edition === "2004" ? footprint.sizeX : Math.min(footprint.sizeX, 1.5 * finiteDepth);
  const activeY =
    edition === "2004" ? footprint.sizeY : Math.min(footprint.sizeY, 1.5 * finiteDepth);
  return createPerimeter({
    id,
    codeId: codeId ?? "",
    role,
    position,
    offset: finiteOffset,
    segments: cornerRectangleSegments(footprint, finiteOffset, activeX, activeY),
    closed: false,
    clause: edition === "2004" ? "6.4.5(4)" : "8.4.4",
  });
}
