import { uniqueStrings } from "../../../core/results/checkUtils.js";
import type {
  MasonryWallOpeningsModel,
  MasonryWallOpeningsNormalizedOpening,
  MasonryWallOpeningsNormalizedWall,
} from "../models/MasonryWallOpeningsModel.js";

const EPS = 1e-9;

type Opening = MasonryWallOpeningsNormalizedOpening;
type Wall = MasonryWallOpeningsNormalizedWall;
type ComponentName = "ringFrame" | "lintel";

interface Rectangle {
  id: string;
  opening: Opening;
  xStart: number;
  xEnd: number;
  yStart: number;
  yEnd: number;
}

interface Cluster {
  id: string;
  sourceOpenings: Opening[];
  sourceOpeningIds: string[];
  sourceRects: Rectangle[];
  wallIds: string[];
  xStart: number;
  xEnd: number;
  yStart: number;
  yEnd: number;
}

interface CoordinateBounds {
  xStart: number;
  xEnd: number;
  yStart: number;
  yEnd: number;
}

export interface SanitizedAlignmentOpening {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  wallIds: string[];
  sourceOpeningIds: string[];
  ringFrame: unknown;
  lintel: unknown;
}

export interface SanitizeAlignmentOpeningsResult {
  openings: SanitizedAlignmentOpening[];
  warnings: string[];
  discardedOpeningIds: string[];
  metadata: {
    totalLength: number;
    maxHeight: number;
    mergedClusterCount: number;
  };
}

type CompatibleAlignment = Pick<MasonryWallOpeningsModel, "totalLength" | "maxHeight"> & {
  openings: readonly Opening[];
  walls: readonly Wall[];
  settings: Record<string, unknown>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}

function isCompatibleAlignment(value: unknown): value is CompatibleAlignment {
  return isRecord(value) && typeof value.totalLength === "function";
}

function intersectsOrTouches1D(
  startA: number,
  endA: number,
  startB: number,
  endB: number,
): boolean {
  return Math.min(endA, endB) >= Math.max(startA, startB) - EPS;
}

function overlapLength1D(startA: number, endA: number, startB: number, endB: number): number {
  return Math.max(0, Math.min(endA, endB) - Math.max(startA, startB));
}

function rectanglesShouldMerge(rectA: CoordinateBounds, rectB: CoordinateBounds): boolean {
  const xOverlap = overlapLength1D(rectA.xStart, rectA.xEnd, rectB.xStart, rectB.xEnd);
  const yOverlap = overlapLength1D(rectA.yStart, rectA.yEnd, rectB.yStart, rectB.yEnd);
  const xTouch = intersectsOrTouches1D(rectA.xStart, rectA.xEnd, rectB.xStart, rectB.xEnd);
  const yTouch = intersectsOrTouches1D(rectA.yStart, rectA.yEnd, rectB.yStart, rectB.yEnd);

  return (xOverlap > EPS && yTouch) || (yOverlap > EPS && xTouch);
}

function mergeRectangles(rectA: CoordinateBounds, rectB: CoordinateBounds): CoordinateBounds {
  return {
    xStart: Math.min(rectA.xStart, rectB.xStart),
    xEnd: Math.max(rectA.xEnd, rectB.xEnd),
    yStart: Math.min(rectA.yStart, rectB.yStart),
    yEnd: Math.max(rectA.yEnd, rectB.yEnd),
  };
}

function cloneCluster(cluster: Cluster): Cluster {
  return {
    ...cluster,
    sourceOpenings: [...cluster.sourceOpenings],
    sourceOpeningIds: [...cluster.sourceOpeningIds],
    sourceRects: cluster.sourceRects.map((rect) => ({ ...rect })),
    wallIds: [...cluster.wallIds],
  };
}

function clusterOpenings(rectangles: readonly Rectangle[] = []): Cluster[] {
  const pending: Cluster[] = rectangles.map((rectangle) => ({
    id: rectangle.id,
    sourceOpenings: [rectangle.opening],
    sourceOpeningIds: [rectangle.id],
    sourceRects: [rectangle],
    wallIds: [],
    xStart: rectangle.xStart,
    xEnd: rectangle.xEnd,
    yStart: rectangle.yStart,
    yEnd: rectangle.yEnd,
  }));
  const merged: Cluster[] = [];

  while (pending.length > 0) {
    const first = pending.shift();
    if (first === undefined) {
      break;
    }
    let active = cloneCluster(first);
    let mergedOnce = true;

    while (mergedOnce) {
      mergedOnce = false;

      for (let index = 0; index < pending.length; index += 1) {
        const candidate = pending[index];
        if (candidate === undefined || !rectanglesShouldMerge(active, candidate)) {
          continue;
        }

        active = {
          ...mergeRectangles(active, candidate),
          id: active.id,
          sourceOpenings: [...active.sourceOpenings, ...candidate.sourceOpenings],
          sourceOpeningIds: [...active.sourceOpeningIds, ...candidate.sourceOpeningIds],
          sourceRects: [...active.sourceRects, ...candidate.sourceRects],
          wallIds: [...active.wallIds, ...candidate.wallIds],
        };
        pending.splice(index, 1);
        mergedOnce = true;
        break;
      }
    }

    merged.push(active);
  }

  return merged;
}

function rectangleArea(rectangle: CoordinateBounds): number {
  return (rectangle.xEnd - rectangle.xStart) * (rectangle.yEnd - rectangle.yStart);
}

function intersectionArea(rectA: CoordinateBounds, rectB: CoordinateBounds): number {
  return (
    overlapLength1D(rectA.xStart, rectA.xEnd, rectB.xStart, rectB.xEnd) *
    overlapLength1D(rectA.yStart, rectA.yEnd, rectB.yStart, rectB.yEnd)
  );
}

function canRectangularlyMergeFragments(fragmentA: Cluster, fragmentB: Cluster): boolean {
  if (!rectanglesShouldMerge(fragmentA, fragmentB)) {
    return false;
  }

  const merged = mergeRectangles(fragmentA, fragmentB);
  const area =
    rectangleArea(fragmentA) + rectangleArea(fragmentB) - intersectionArea(fragmentA, fragmentB);

  return Math.abs(area - rectangleArea(merged)) <= EPS;
}

function clipClusterToWalls(cluster: Cluster, walls: readonly Wall[]): Cluster[] {
  const fragments: Cluster[] = [];

  for (const wall of walls) {
    const xStart = Math.max(cluster.xStart, wall.xStart);
    const xEnd = Math.min(cluster.xEnd, wall.xEnd);
    const yStart = Math.max(cluster.yStart, 0);
    const yEnd = Math.min(cluster.yEnd, wall.height);

    if (xEnd - xStart <= EPS || yEnd - yStart <= EPS) {
      continue;
    }

    fragments.push({
      ...cluster,
      xStart,
      xEnd,
      yStart,
      yEnd,
      wallIds: [wall.id],
    });
  }

  const mergedFragments: Cluster[] = [];

  while (fragments.length > 0) {
    const first = fragments.shift();
    if (first === undefined) {
      break;
    }
    let active = cloneCluster(first);
    let mergedOnce = true;

    while (mergedOnce) {
      mergedOnce = false;

      for (let index = 0; index < fragments.length; index += 1) {
        const candidate = fragments[index];
        if (candidate === undefined || !canRectangularlyMergeFragments(active, candidate)) {
          continue;
        }

        active = {
          ...mergeRectangles(active, candidate),
          id: active.id,
          sourceOpenings: [...active.sourceOpenings],
          sourceOpeningIds: [...active.sourceOpeningIds],
          sourceRects: active.sourceRects.map((rect) => ({ ...rect })),
          wallIds: [...new Set([...active.wallIds, ...candidate.wallIds])],
        };
        fragments.splice(index, 1);
        mergedOnce = true;
        break;
      }
    }

    mergedFragments.push(active);
  }

  return mergedFragments;
}

function serializeComparable(value: unknown): string {
  return JSON.stringify(value ?? null);
}

function resolveSharedComponent(
  sourceOpenings: readonly Opening[],
  componentName: ComponentName,
): unknown {
  if (sourceOpenings.length === 0) {
    return null;
  }

  const serialized = sourceOpenings.map((opening) => serializeComparable(opening[componentName]));
  const reference = serialized[0];

  if (serialized.every((value) => value === reference)) {
    return sourceOpenings[0]?.[componentName] ?? null;
  }

  return null;
}

function buildClusterWarnings(cluster: Cluster): string[] {
  if (cluster.sourceRects.length < 2) {
    return [];
  }

  const warnings: string[] = [];

  for (let index = 0; index < cluster.sourceRects.length; index += 1) {
    for (let inner = index + 1; inner < cluster.sourceRects.length; inner += 1) {
      const rectA = cluster.sourceRects[index];
      const rectB = cluster.sourceRects[inner];
      if (rectA === undefined || rectB === undefined) {
        continue;
      }
      const xOverlap = overlapLength1D(rectA.xStart, rectA.xEnd, rectB.xStart, rectB.xEnd);
      const yOverlap = overlapLength1D(rectA.yStart, rectA.yEnd, rectB.yStart, rectB.yEnd);

      if (xOverlap > EPS && yOverlap <= EPS) {
        warnings.push(
          `Openings ${rectA.id} and ${rectB.id} were merged into one equivalent opening because they are vertically stacked or touching.`,
        );
      }
    }
  }

  return warnings;
}

function buildResidualPierWarnings({
  alignment,
  sanitizedOpenings,
}: {
  alignment: CompatibleAlignment;
  sanitizedOpenings: readonly SanitizedAlignmentOpening[];
}): string[] {
  const thresholdValue = alignment.settings.residualPierWarningThreshold;
  const threshold = typeof thresholdValue === "number" ? thresholdValue : Number.NaN;

  if (!Number.isFinite(threshold) || threshold <= 0) {
    return [];
  }

  const warnings: string[] = [];

  for (const wall of alignment.walls) {
    const wallOpenings = sanitizedOpenings
      .filter((opening) => opening.wallIds.includes(wall.id))
      .map((opening) => ({
        id: opening.id,
        xStart: Math.max(opening.x, wall.xStart),
        xEnd: Math.min(opening.x + opening.width, wall.xEnd),
        yStart: opening.y,
        yEnd: opening.y + opening.height,
      }))
      .sort((left, right) => left.xStart - right.xStart);

    for (const opening of wallOpenings) {
      const leftGap = opening.xStart - wall.xStart;
      const rightGap = wall.xEnd - opening.xEnd;

      if (leftGap > EPS && leftGap < threshold - EPS) {
        warnings.push(
          `Opening ${opening.id} leaves a residual lateral pier of ${leftGap.toFixed(3)} m at the left edge of wall ${wall.id}.`,
        );
      }

      if (rightGap > EPS && rightGap < threshold - EPS) {
        warnings.push(
          `Opening ${opening.id} leaves a residual lateral pier of ${rightGap.toFixed(3)} m at the right edge of wall ${wall.id}.`,
        );
      }
    }

    for (let index = 0; index < wallOpenings.length - 1; index += 1) {
      const current = wallOpenings[index];
      const next = wallOpenings[index + 1];
      if (current === undefined || next === undefined) {
        continue;
      }
      const horizontalGap = next.xStart - current.xEnd;
      const verticalOverlap = overlapLength1D(current.yStart, current.yEnd, next.yStart, next.yEnd);

      if (horizontalGap > EPS && horizontalGap < threshold - EPS && verticalOverlap > EPS) {
        warnings.push(
          `Openings ${current.id} and ${next.id} leave a residual pier of ${horizontalGap.toFixed(3)} m in wall ${wall.id}.`,
        );
      }
    }
  }

  return warnings;
}

export function sanitizeAlignmentOpenings({
  alignment,
}: {
  alignment: unknown;
}): SanitizeAlignmentOpeningsResult {
  if (!isCompatibleAlignment(alignment)) {
    throw new Error(
      "sanitizeAlignmentOpenings requires a MasonryWallOpeningsModel-compatible alignment.",
    );
  }

  const totalLength = alignment.totalLength();
  const maxHeight = alignment.maxHeight();
  const warnings: string[] = [];
  const discardedOpeningIds: string[] = [];
  const rectangles: Rectangle[] = [];

  for (const opening of alignment.openings) {
    const xStart = opening.x;
    const xEnd = opening.x + opening.width;
    const yStart = opening.y;
    const yEnd = opening.y + opening.height;

    if (xEnd <= 0 || xStart >= totalLength || yEnd <= 0 || yStart >= maxHeight) {
      discardedOpeningIds.push(opening.id);
      continue;
    }

    rectangles.push({
      id: opening.id,
      opening,
      xStart: Math.max(0, xStart),
      xEnd: Math.min(totalLength, xEnd),
      yStart: Math.max(0, yStart),
      yEnd: Math.min(maxHeight, yEnd),
    });
  }

  const clusters = clusterOpenings(rectangles);
  const sanitizedOpenings: SanitizedAlignmentOpening[] = [];
  let generatedId = 1;

  for (const cluster of clusters) {
    warnings.push(...buildClusterWarnings(cluster));

    const clippedFragments = clipClusterToWalls(cluster, alignment.walls);

    for (const fragment of clippedFragments) {
      const width = fragment.xEnd - fragment.xStart;
      const height = fragment.yEnd - fragment.yStart;

      if (width <= EPS || height <= EPS) {
        continue;
      }

      const preservedRingFrame = resolveSharedComponent(fragment.sourceOpenings, "ringFrame");
      const preservedLintel = resolveSharedComponent(fragment.sourceOpenings, "lintel");

      sanitizedOpenings.push({
        id:
          fragment.sourceOpeningIds.length === 1 && clippedFragments.length === 1
            ? (fragment.sourceOpeningIds[0] ?? "")
            : `sanitized-opening-${generatedId++}`,
        x: fragment.xStart,
        y: fragment.yStart,
        width,
        height,
        wallIds: [...new Set(fragment.wallIds)],
        sourceOpeningIds: [...new Set(fragment.sourceOpeningIds)],
        ringFrame: preservedRingFrame,
        lintel: preservedLintel,
      });
    }
  }

  const residualWarnings = buildResidualPierWarnings({
    alignment,
    sanitizedOpenings,
  });

  return {
    openings: sanitizedOpenings.sort((left, right) => left.x - right.x || left.y - right.y),
    warnings: uniqueStrings([...warnings, ...residualWarnings]),
    discardedOpeningIds: [...discardedOpeningIds],
    metadata: {
      totalLength,
      maxHeight,
      mergedClusterCount: clusters.length,
    },
  };
}
