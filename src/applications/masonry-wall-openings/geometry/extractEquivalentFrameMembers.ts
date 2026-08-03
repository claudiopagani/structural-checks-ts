import { uniqueStrings } from "../../../core/results/checkUtils.js";
import {
  MasonryWallPierModel,
  type MasonryWallPierModelInput,
} from "../models/MasonryWallPierModel.js";
import { MasonryWallSpandrelModel } from "../models/MasonryWallSpandrelModel.js";
import {
  sanitizeAlignmentOpenings,
  type SanitizedAlignmentOpening,
} from "./sanitizeAlignmentOpenings.js";

const EPS = 1e-9;
const DOLCE_INCLINATION_RADIANS = Math.PI / 6;
type JsonRecord = Record<string, unknown>;

interface Wall {
  id: string;
  xStart: number;
  xEnd: number;
  height: number;
  thickness: number;
  material: unknown;
}

interface CompatibleAlignment {
  id: string;
  totalLength(): number;
  walls: readonly Wall[];
  openings: readonly {
    id: string;
    x: number;
    y: number;
    width: number;
    height: number;
    ringFrame: unknown;
    lintel: unknown;
  }[];
  maxHeight(): number;
  settings: JsonRecord;
}

export interface ExtractEquivalentFrameMembersInput {
  alignment?: unknown;
  sanitizedOpenings?: readonly SanitizedAlignmentOpening[] | null;
}

export interface EquivalentFrameMembersResult {
  piers: MasonryWallPierModel[];
  spandrels: MasonryWallSpandrelModel[];
  warnings: string[];
  assumptions: string[];
  metadata: {
    pierCount: number;
    spandrelCount: number;
    sanitizedOpeningCount: number;
  };
}

interface AdjacentOpeningInfluence {
  openingId: string;
  side: "left" | "right";
  horizontalDistance: number;
  rawYStart: number;
  rawYEnd: number;
  yStart: number;
  yEnd: number;
}

interface DolceDeformableZone {
  axisX: number;
  deformableHeight: number;
  rigidBottomLength: number;
  rigidTopLength: number;
  metadata: JsonRecord;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && (typeof value === "object" || typeof value === "function");
}

function isCompatibleAlignment(value: unknown): value is CompatibleAlignment {
  return isRecord(value) && typeof value.totalLength === "function";
}

function uniqueSorted(values: readonly number[] = []): number[] {
  return [...new Set(values.filter((value) => Number.isFinite(value)))].sort(
    (left, right) => left - right,
  );
}

function intervalsOverlap(startA: number, endA: number, startB: number, endB: number): boolean {
  return Math.min(endA, endB) - Math.max(startA, startB) > EPS;
}

function sameCoordinate(left: number, right: number): boolean {
  return Math.abs(left - right) <= EPS;
}

function serializeComparable(value: unknown): string {
  return JSON.stringify(value ?? null);
}

function numericProperty(value: unknown, property: string): number | null {
  if (!isRecord(value)) {
    return null;
  }
  const propertyValue = value[property];
  return typeof propertyValue === "number" && Number.isFinite(propertyValue) ? propertyValue : null;
}

function resolvePierReduction(
  openings: readonly SanitizedAlignmentOpening[],
  boundaryKey: "left" | "right",
  boundaryValue: number,
): number {
  const reductions = openings
    .filter((opening) =>
      boundaryKey === "left"
        ? sameCoordinate(opening.x + opening.width, boundaryValue)
        : sameCoordinate(opening.x, boundaryValue),
    )
    .map((opening) => numericProperty(opening.ringFrame, "profileWidthInPlane"))
    .filter((value): value is number => value !== null && value > 0);

  return reductions.length > 0 ? Math.max(...reductions) : 0;
}

function resolvePierAxisX({
  xStart,
  length,
  leftReduction = 0,
  rightReduction = 0,
}: {
  xStart: number;
  length: number;
  leftReduction?: number;
  rightReduction?: number;
}): number {
  const effectiveLength = Math.max(0, length - leftReduction - rightReduction);

  return xStart + leftReduction + effectiveLength / 2;
}

function adjacentOpeningInfluences({
  openings,
  xStart,
  xEnd,
  axisX,
  height,
}: {
  openings: readonly SanitizedAlignmentOpening[];
  xStart: number;
  xEnd: number;
  axisX: number;
  height: number;
}): AdjacentOpeningInfluence[] {
  const tangent = Math.tan(DOLCE_INCLINATION_RADIANS);

  return openings
    .map((opening): AdjacentOpeningInfluence | null => {
      const leftAdjacent = sameCoordinate(opening.x + opening.width, xStart);
      const rightAdjacent = sameCoordinate(opening.x, xEnd);

      if (!leftAdjacent && !rightAdjacent) {
        return null;
      }

      const edgeX = leftAdjacent ? xStart : xEnd;
      const horizontalDistance = Math.abs(axisX - edgeX);
      const yStart = opening.y - horizontalDistance * tangent;
      const yEnd = opening.y + opening.height + horizontalDistance * tangent;

      return {
        openingId: opening.id,
        side: leftAdjacent ? "left" : "right",
        horizontalDistance,
        rawYStart: yStart,
        rawYEnd: yEnd,
        yStart: Math.max(0, Math.min(height, yStart)),
        yEnd: Math.max(0, Math.min(height, yEnd)),
      };
    })
    .filter((influence): influence is AdjacentOpeningInfluence => influence !== null);
}

function resolveDolceDeformableZone({
  openings,
  xStart,
  xEnd,
  length,
  height,
  leftReduction = 0,
  rightReduction = 0,
}: {
  openings: readonly SanitizedAlignmentOpening[];
  xStart: number;
  xEnd: number;
  length: number;
  height: number;
  leftReduction?: number;
  rightReduction?: number;
}): DolceDeformableZone {
  const axisX = resolvePierAxisX({
    xStart,
    length,
    leftReduction,
    rightReduction,
  });
  const influences = adjacentOpeningInfluences({
    openings,
    xStart,
    xEnd,
    axisX,
    height,
  });

  if (influences.length === 0) {
    return {
      axisX,
      deformableHeight: height,
      rigidBottomLength: 0,
      rigidTopLength: 0,
      metadata: {
        dolceMethod: {
          applied: false,
          inclinationDegrees: 30,
          adjacentOpeningIds: [],
          influences: [],
        },
      },
    };
  }

  const yStart = Math.max(0, Math.min(...influences.map((influence) => influence.rawYStart)));
  const yEnd = Math.min(height, Math.max(...influences.map((influence) => influence.rawYEnd)));
  const deformableHeight = Math.max(EPS, yEnd - yStart);

  return {
    axisX,
    deformableHeight,
    rigidBottomLength: yStart,
    rigidTopLength: Math.max(0, height - yEnd),
    metadata: {
      dolceMethod: {
        applied: true,
        inclinationDegrees: 30,
        axisX,
        yStart,
        yEnd,
        adjacentOpeningIds: influences.map((influence) => influence.openingId),
        influences,
      },
    },
  };
}

function resolveSharedMaterial(walls: readonly Wall[]): unknown {
  if (walls.length === 0) {
    return null;
  }

  const serialized = walls.map((wall) => serializeComparable(wall.material));

  return serialized.every((value) => value === serialized[0]) ? (walls[0]?.material ?? null) : null;
}

function resolveSharedThickness(walls: readonly Wall[]): number | null {
  if (walls.length === 0) {
    return null;
  }

  const values = walls.map((wall) => wall.thickness);
  const reference = values[0];

  return reference !== undefined && values.every((value) => Math.abs(value - reference) <= EPS)
    ? reference
    : Math.min(...values);
}

function findOpeningsForWall(
  wall: Wall,
  sanitizedOpenings: readonly SanitizedAlignmentOpening[],
): SanitizedAlignmentOpening[] {
  return sanitizedOpenings.filter(
    (opening) =>
      opening.wallIds.includes(wall.id) &&
      intervalsOverlap(wall.xStart, wall.xEnd, opening.x, opening.x + opening.width),
  );
}

function buildPiers({
  alignment,
  sanitizedOpenings,
}: {
  alignment: CompatibleAlignment;
  sanitizedOpenings: readonly SanitizedAlignmentOpening[];
}): { piers: MasonryWallPierModel[]; warnings: string[] } {
  const warnings: string[] = [];
  const piers: MasonryWallPierModel[] = [];

  for (const wall of alignment.walls) {
    const wallOpenings = findOpeningsForWall(wall, sanitizedOpenings);
    const xBreaks = uniqueSorted([
      wall.xStart,
      wall.xEnd,
      ...wallOpenings.flatMap((opening) => [opening.x, opening.x + opening.width]),
    ]);

    for (let index = 0; index < xBreaks.length - 1; index += 1) {
      const xStart = xBreaks[index];
      const xEnd = xBreaks[index + 1];
      if (xStart === undefined || xEnd === undefined) {
        continue;
      }
      const length = xEnd - xStart;

      if (length <= EPS) {
        continue;
      }

      const midpoint = (xStart + xEnd) / 2;
      const occupiedByOpening = wallOpenings.some(
        (opening) => midpoint > opening.x + EPS && midpoint < opening.x + opening.width - EPS,
      );

      if (occupiedByOpening) {
        continue;
      }

      const leftReduction = resolvePierReduction(wallOpenings, "left", xStart);
      const rightReduction = resolvePierReduction(wallOpenings, "right", xEnd);
      const effectiveLength = Math.max(0, length - leftReduction - rightReduction);
      const dolceZone = resolveDolceDeformableZone({
        openings: wallOpenings,
        xStart,
        xEnd,
        length,
        height: wall.height,
        leftReduction,
        rightReduction,
      });

      if (effectiveLength <= EPS) {
        warnings.push(
          `Pier candidate in wall ${wall.id} between x=${xStart.toFixed(3)} m and x=${xEnd.toFixed(3)} m was reduced to zero effective length by adjacent ring-frame profile widths.`,
        );
      }

      const pierInput: MasonryWallPierModelInput = {
        id: `${alignment.id}-pier-${piers.length + 1}`,
        alignmentId: alignment.id,
        wallId: wall.id,
        sourceWallIds: [wall.id],
        x: xStart,
        length,
        effectiveLength,
        height: wall.height,
        thickness: wall.thickness,
        material: wall.material,
        tributaryVerticalLoad: 0,
        tributaryLoadByWall: {},
        deformableHeight: dolceZone.deformableHeight,
        rigidBottomLength: dolceZone.rigidBottomLength,
        rigidTopLength: dolceZone.rigidTopLength,
        topBoundaryMode: "not-resolved",
        mechanics: {},
        capacity: {},
        metadata: {
          xEnd,
          leftReduction,
          rightReduction,
          openingIdsLeft: wallOpenings
            .filter((opening) => sameCoordinate(opening.x + opening.width, xStart))
            .map((opening) => opening.id),
          openingIdsRight: wallOpenings
            .filter((opening) => sameCoordinate(opening.x, xEnd))
            .map((opening) => opening.id),
          ...dolceZone.metadata,
        },
      };
      piers.push(new MasonryWallPierModel(pierInput));
    }
  }

  return { piers, warnings };
}

function resolveSpandrelTopBoundary({
  opening,
  sanitizedOpenings,
  overlappingWalls,
}: {
  opening: SanitizedAlignmentOpening;
  sanitizedOpenings: readonly SanitizedAlignmentOpening[];
  overlappingWalls: readonly Wall[];
}): number {
  const openingTop = opening.y + opening.height;
  const roofBoundary = Math.min(...overlappingWalls.map((wall) => wall.height));
  const nextOpeningBottom = sanitizedOpenings
    .filter(
      (candidate) =>
        candidate.id !== opening.id &&
        candidate.y >= openingTop - EPS &&
        intervalsOverlap(
          opening.x,
          opening.x + opening.width,
          candidate.x,
          candidate.x + candidate.width,
        ),
    )
    .map((candidate) => candidate.y)
    .filter((value) => value > openingTop + EPS)
    .sort((left, right) => left - right)[0];

  return Math.min(roofBoundary, nextOpeningBottom ?? roofBoundary);
}

function buildSpandrels({
  alignment,
  sanitizedOpenings,
}: {
  alignment: CompatibleAlignment;
  sanitizedOpenings: readonly SanitizedAlignmentOpening[];
}): { spandrels: MasonryWallSpandrelModel[]; warnings: string[] } {
  const warnings: string[] = [];
  const spandrels: MasonryWallSpandrelModel[] = [];

  for (const opening of sanitizedOpenings) {
    const openingTop = opening.y + opening.height;
    const overlappingWalls = alignment.walls.filter(
      (wall) =>
        wall.height > openingTop + EPS &&
        intervalsOverlap(wall.xStart, wall.xEnd, opening.x, opening.x + opening.width),
    );

    if (overlappingWalls.length === 0) {
      continue;
    }

    const yEnd = resolveSpandrelTopBoundary({
      opening,
      sanitizedOpenings,
      overlappingWalls,
    });
    const height = yEnd - openingTop;

    if (height <= EPS) {
      continue;
    }

    const thickness = resolveSharedThickness(overlappingWalls);
    const material = resolveSharedMaterial(overlappingWalls);

    if (thickness === null || !Number.isFinite(thickness) || thickness <= 0) {
      warnings.push(
        `Spandrel above opening ${opening.id} could not resolve a positive thickness from the overlapping walls.`,
      );
      continue;
    }

    if (material == null && overlappingWalls.length > 1) {
      warnings.push(
        `Spandrel above opening ${opening.id} spans walls with non-uniform materials; the extracted member keeps sourceWallIds but leaves material unresolved for the next stage.`,
      );
    }

    spandrels.push(
      new MasonryWallSpandrelModel({
        id: `${alignment.id}-spandrel-${spandrels.length + 1}`,
        alignmentId: alignment.id,
        xStart: opening.x,
        xEnd: opening.x + opening.width,
        height,
        thickness,
        material,
        sourceWallIds: overlappingWalls.map((wall) => wall.id),
        deformableLength: opening.width,
        rigidLeftLength: 0,
        rigidRightLength: 0,
        mechanics: {},
        metadata: {
          referenceOpeningId: opening.id,
          yStart: openingTop,
          yEnd,
          wallIds: overlappingWalls.map((wall) => wall.id),
          thicknessByWall: Object.fromEntries(
            overlappingWalls.map((wall) => [wall.id, wall.thickness]),
          ),
        },
      }),
    );
  }

  return { spandrels, warnings };
}

export function extractEquivalentFrameMembers({
  alignment,
  sanitizedOpenings = null,
}: ExtractEquivalentFrameMembersInput = {}): EquivalentFrameMembersResult {
  if (!isCompatibleAlignment(alignment)) {
    throw new Error(
      "extractEquivalentFrameMembers requires a MasonryWallOpeningsModel-compatible alignment.",
    );
  }

  const resolvedSanitizedOpenings =
    sanitizedOpenings ?? sanitizeAlignmentOpenings({ alignment }).openings;
  const pierResult = buildPiers({
    alignment,
    sanitizedOpenings: resolvedSanitizedOpenings,
  });
  const spandrelResult = buildSpandrels({
    alignment,
    sanitizedOpenings: resolvedSanitizedOpenings,
  });

  return {
    piers: pierResult.piers,
    spandrels: spandrelResult.spandrels,
    warnings: uniqueStrings([...pierResult.warnings, ...spandrelResult.warnings]),
    assumptions: [
      "Piers are extracted as wall-bounded vertical strips whose x-interval is not occupied by sanitized opening projections; their deformable height is resolved with the Dolce 30-degree construction when adjacent openings exist.",
      "Spandrels are extracted as the masonry band directly above each sanitized opening, capped by the next overlapping opening above or by the local wall top.",
    ],
    metadata: {
      pierCount: pierResult.piers.length,
      spandrelCount: spandrelResult.spandrels.length,
      sanitizedOpeningCount: resolvedSanitizedOpenings.length,
    },
  };
}
