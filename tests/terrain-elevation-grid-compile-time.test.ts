import test from "node:test";

import {
  TERRAIN_ELEVATION_GRID_SCHEMA_VERSION,
  normalizeTerrainElevationGrid,
} from "../dist/index.js";
import type {
  TerrainElevationGrid,
  TerrainElevationGridCell,
  TerrainElevationGridInput,
} from "../dist/index.js";

type IsAny<T> = 0 extends 1 & T ? true : false;
type AssertFalse<T extends false> = T;

type PublicDeclarationsAreUseful = [
  AssertFalse<IsAny<typeof TERRAIN_ELEVATION_GRID_SCHEMA_VERSION>>,
  AssertFalse<IsAny<typeof normalizeTerrainElevationGrid>>,
];

const input: TerrainElevationGridInput = {
  gridSize: 2,
  spacingM: 10,
  center: { lat: 45.0, lon: 9.0 },
  points: [
    { row: 0, col: 0, elevationM: 100 },
    { row: 0, col: 1, elevationM: 101 },
    { row: 1, col: 0, elevationM: 102 },
    { row: 1, col: 1, elevationM: 103 },
  ],
  provenance: { provider: "compile-time" },
};
const grid: TerrainElevationGrid = normalizeTerrainElevationGrid(input);
const cells: TerrainElevationGridCell[] = grid.cells;
const schemaVersion: string = TERRAIN_ELEVATION_GRID_SCHEMA_VERSION;
const elevation: number | null = cells[0]?.elevationM ?? null;

void test("terrain elevation-grid normalization exposes a strict typed consumer contract", () => {
  void (null as unknown as PublicDeclarationsAreUseful);
  void schemaVersion;
  void elevation;
});
