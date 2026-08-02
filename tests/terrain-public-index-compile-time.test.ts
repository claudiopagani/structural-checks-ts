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
type PublicContracts = [TerrainElevationGrid, TerrainElevationGridCell, TerrainElevationGridInput];
type ConsumerContracts = PublicDeclarationsAreUseful & PublicContracts;

function useConsumerContracts(value: ConsumerContracts | undefined): void {
  void value;
}

void test("terrain public index exposes strict typed consumer contracts", () => {
  useConsumerContracts(undefined);
  void TERRAIN_ELEVATION_GRID_SCHEMA_VERSION;
  void normalizeTerrainElevationGrid;
});
