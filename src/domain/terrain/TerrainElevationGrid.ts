// Mechanical TypeScript migration from strutture-js 6f33baead8b88166c4b2cf94af41763412e3c751;
// source path: src/domain/terrain/TerrainElevationGrid.js.

export const TERRAIN_ELEVATION_GRID_SCHEMA_VERSION = "terrain-elevation-grid/v1";

export interface TerrainElevationGridInput {
  points?: readonly unknown[];
  gridSize?: unknown;
  spacingM?: unknown;
  extentM?: unknown;
  radiusM?: unknown;
  center?: unknown;
  provenance?: unknown;
  [key: string]: unknown;
}

export interface TerrainElevationGridCell {
  row: number;
  column: number;
  sourceRow: number;
  sourceColumn: number;
  eastOffsetM: number;
  northOffsetM: number;
  latitudeDeg: number | null;
  longitudeDeg: number | null;
  elevationM: number | null;
  isNoData: boolean;
  isInterpolated: boolean;
  isFallback: boolean;
  source: unknown;
  sourceResolutionM: number | null;
  samplingMethod: unknown;
}

export interface TerrainElevationGrid {
  schemaVersion: string;
  center: {
    latitudeDeg: number | null;
    longitudeDeg: number | null;
  };
  radiusM: number;
  extentM: number;
  gridSize: number;
  spacingM: number;
  orientation: {
    rowOrder: "north-to-south";
    columnOrder: "west-to-east";
  };
  bounds: {
    westM: number;
    eastM: number;
    southM: number;
    northM: number;
  };
  cells: TerrainElevationGridCell[];
  quality: {
    expectedPointCount: number;
    receivedPointCount: number;
    missingElevationCount: number;
    missingRatio: number;
    fallbackCount: number;
    interpolatedCount: number;
  };
  provenance: Record<string, unknown> | null;
}

function propertyValue(value: unknown, key: string): unknown {
  if (value === null || value === undefined) {
    return undefined;
  }

  if (typeof value === "object" || typeof value === "function") {
    return Reflect.get(value, key);
  }

  return undefined;
}

function stringValue(value: unknown): string {
  if (value == null) {
    return "";
  }

  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "bigint"
  ) {
    return String(value);
  }

  if (typeof value === "symbol" || typeof value === "function") {
    return value.toString();
  }

  return Array.isArray(value) ? value.toString() : Object.prototype.toString.call(value);
}

function toFiniteNumber(value: unknown): number | null {
  if (value == null || (typeof value === "string" && value.trim() === "")) {
    return null;
  }

  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : null;
}

function requirePositiveNumber(value: unknown, fieldName: string): number {
  const numericValue = toFiniteNumber(value);

  if (numericValue == null || numericValue <= 0) {
    throw new Error(`${fieldName} must be a finite positive number.`);
  }

  return numericValue;
}

function resolveGridSize(data: TerrainElevationGridInput, points: readonly unknown[]): number {
  const declaredSize = Number(data?.gridSize);

  if (Number.isInteger(declaredSize) && declaredSize >= 2) {
    return declaredSize;
  }

  const inferredSize = Math.sqrt(points.length);

  if (Number.isInteger(inferredSize) && inferredSize >= 2) {
    return inferredSize;
  }

  throw new Error(
    "gridSize must be an integer greater than one or inferable from a square points array.",
  );
}

function toGridIndex(value: unknown, fallback: number): number {
  const numericValue = Number(value);
  return Number.isInteger(numericValue) ? numericValue : fallback;
}

function getPointElevation(point: unknown): number | null {
  if (propertyValue(point, "nodata") === true || propertyValue(point, "isNoData") === true) {
    return null;
  }

  return toFiniteNumber(
    propertyValue(point, "elevationM") ??
      propertyValue(point, "elevation_m") ??
      propertyValue(point, "elevation"),
  );
}

function toPointMatrix(points: readonly unknown[], gridSize: number): unknown[][] {
  const matrix = Array.from({ length: gridSize }, () => Array<unknown>(gridSize).fill(null));

  points.forEach((point, index) => {
    const fallbackRow = Math.floor(index / gridSize);
    const fallbackColumn = index % gridSize;
    const row = toGridIndex(propertyValue(point, "row"), fallbackRow);
    const column = toGridIndex(
      propertyValue(point, "col") ?? propertyValue(point, "column"),
      fallbackColumn,
    );

    if (row >= 0 && row < gridSize && column >= 0 && column < gridSize) {
      const targetRow = matrix[row];
      if (targetRow !== undefined) {
        targetRow[column] = point;
      }
    }
  });

  return matrix;
}

function averageCoordinate(
  matrix: readonly (readonly unknown[])[],
  gridSize: number,
  fixedIndex: number,
  axis: "row" | "column",
  coordinate: string,
): number | null {
  const values: number[] = [];

  for (let index = 0; index < gridSize; index += 1) {
    const row = axis === "row" ? fixedIndex : index;
    const column = axis === "column" ? fixedIndex : index;
    const value = toFiniteNumber(propertyValue(matrix[row]?.[column], coordinate));

    if (value != null) {
      values.push(value);
    }
  }

  return values.length ? values.reduce((total, value) => total + value, 0) / values.length : null;
}

function shouldFlipRows(matrix: readonly (readonly unknown[])[], gridSize: number): boolean {
  const firstNorthOffset = averageCoordinate(matrix, gridSize, 0, "row", "northOffsetM");
  const lastNorthOffset = averageCoordinate(matrix, gridSize, gridSize - 1, "row", "northOffsetM");

  if (firstNorthOffset != null && lastNorthOffset != null) {
    return firstNorthOffset < lastNorthOffset;
  }

  const firstLatitude = averageCoordinate(matrix, gridSize, 0, "row", "lat");
  const lastLatitude = averageCoordinate(matrix, gridSize, gridSize - 1, "row", "lat");

  return firstLatitude != null && lastLatitude != null ? firstLatitude < lastLatitude : false;
}

function shouldFlipColumns(matrix: readonly (readonly unknown[])[], gridSize: number): boolean {
  const firstEastOffset = averageCoordinate(matrix, gridSize, 0, "column", "eastOffsetM");
  const lastEastOffset = averageCoordinate(matrix, gridSize, gridSize - 1, "column", "eastOffsetM");

  if (firstEastOffset != null && lastEastOffset != null) {
    return firstEastOffset > lastEastOffset;
  }

  const firstLongitude = averageCoordinate(matrix, gridSize, 0, "column", "lon");
  const lastLongitude = averageCoordinate(matrix, gridSize, gridSize - 1, "column", "lon");

  return firstLongitude != null && lastLongitude != null ? firstLongitude > lastLongitude : false;
}

function cloneSerializableObject(value: unknown): Record<string, unknown> | null {
  if (value == null) {
    return null;
  }

  if (typeof value !== "object" || Array.isArray(value)) {
    throw new Error("provenance must be a serializable object when provided.");
  }

  const clone: Record<string, unknown> = {};
  Object.entries(value).forEach(([key, entry]) => {
    clone[key] = entry;
  });
  return clone;
}

export function normalizeTerrainElevationGrid(
  data: TerrainElevationGridInput | null | undefined = {},
): TerrainElevationGrid {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("A terrain elevation grid object is required.");
  }

  if (!Array.isArray(data.points)) {
    throw new Error("points must be an array.");
  }

  const points: readonly unknown[] = data.points;
  const gridSize = resolveGridSize(data, points);
  const spacingM = requirePositiveNumber(data.spacingM, "spacingM");
  const halfIndex = (gridSize - 1) / 2;
  const sourceMatrix = toPointMatrix(points, gridSize);
  const flipRows = shouldFlipRows(sourceMatrix, gridSize);
  const flipColumns = shouldFlipColumns(sourceMatrix, gridSize);
  const cells: TerrainElevationGridCell[] = [];

  for (let row = 0; row < gridSize; row += 1) {
    for (let column = 0; column < gridSize; column += 1) {
      const point = sourceMatrix[row]?.[column] ?? {};
      const normalizedRow = flipRows ? gridSize - 1 - row : row;
      const normalizedColumn = flipColumns ? gridSize - 1 - column : column;
      const elevationM = getPointElevation(point);
      const isNoData =
        propertyValue(point, "nodata") === true ||
        propertyValue(point, "isNoData") === true ||
        elevationM == null;
      const source = propertyValue(point, "source");

      cells.push({
        row: normalizedRow,
        column: normalizedColumn,
        sourceRow: toGridIndex(propertyValue(point, "row"), row),
        sourceColumn: toGridIndex(
          propertyValue(point, "col") ?? propertyValue(point, "column"),
          column,
        ),
        eastOffsetM:
          toFiniteNumber(propertyValue(point, "eastOffsetM")) ??
          (normalizedColumn - halfIndex) * spacingM,
        northOffsetM:
          toFiniteNumber(propertyValue(point, "northOffsetM")) ??
          (halfIndex - normalizedRow) * spacingM,
        latitudeDeg: toFiniteNumber(
          propertyValue(point, "lat") ?? propertyValue(point, "latitudeDeg"),
        ),
        longitudeDeg: toFiniteNumber(
          propertyValue(point, "lon") ?? propertyValue(point, "longitudeDeg"),
        ),
        elevationM,
        isNoData,
        isInterpolated: propertyValue(point, "isInterpolated") === true,
        isFallback:
          propertyValue(point, "fallback") === true ||
          propertyValue(point, "isFallback") === true ||
          stringValue(source).toLowerCase() === "external",
        source: source ?? null,
        sourceResolutionM: toFiniteNumber(
          propertyValue(point, "resolution_m") ??
            propertyValue(point, "resolutionM") ??
            propertyValue(point, "sourceResolutionM"),
        ),
        samplingMethod:
          propertyValue(point, "method") ?? propertyValue(point, "samplingMethod") ?? null,
      });
    }
  }

  cells.sort((left, right) =>
    left.row === right.row ? left.column - right.column : left.row - right.row,
  );

  const eastOffsets = cells.map((cell) => cell.eastOffsetM);
  const northOffsets = cells.map((cell) => cell.northOffsetM);
  const extentFromData = toFiniteNumber(data.extentM);
  const derivedExtentM = spacingM * (gridSize - 1);
  const extentM = extentFromData && extentFromData > 0 ? extentFromData : derivedExtentM;
  const radiusFromData = toFiniteNumber(data.radiusM);
  const radiusM = radiusFromData && radiusFromData > 0 ? radiusFromData : extentM / 2;
  const missingElevationCount = cells.filter(
    (cell) => cell.elevationM == null || cell.isNoData,
  ).length;

  return {
    schemaVersion: TERRAIN_ELEVATION_GRID_SCHEMA_VERSION,
    center: {
      latitudeDeg: toFiniteNumber(
        propertyValue(data.center, "latitudeDeg") ?? propertyValue(data.center, "lat"),
      ),
      longitudeDeg: toFiniteNumber(
        propertyValue(data.center, "longitudeDeg") ?? propertyValue(data.center, "lon"),
      ),
    },
    radiusM,
    extentM,
    gridSize,
    spacingM,
    orientation: {
      rowOrder: "north-to-south",
      columnOrder: "west-to-east",
    },
    bounds: {
      westM: Math.min(...eastOffsets),
      eastM: Math.max(...eastOffsets),
      southM: Math.min(...northOffsets),
      northM: Math.max(...northOffsets),
    },
    cells,
    quality: {
      expectedPointCount: gridSize * gridSize,
      receivedPointCount: points.length,
      missingElevationCount,
      missingRatio: missingElevationCount / (gridSize * gridSize),
      fallbackCount: cells.filter((cell) => cell.isFallback).length,
      interpolatedCount: cells.filter((cell) => cell.isInterpolated).length,
    },
    provenance: cloneSerializableObject(data.provenance),
  };
}
