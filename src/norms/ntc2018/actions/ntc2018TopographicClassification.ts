// Mechanical TypeScript migration from strutture-js 6f33baead8b88166c4b2cf94af41763412e3c751.
// source path: src/norms/ntc2018/actions/ntc2018TopographicClassification.js.

import { CalculationResult } from "../../../core/results/CalculationResult.js";
import {
  normalizeTerrainElevationGrid,
  type TerrainElevationGrid,
  type TerrainElevationGridInput,
} from "../../../domain/terrain/TerrainElevationGrid.js";
import classifyTopographyMascandola, {
  type TopographicClassificationResult,
  type TopographicModel,
} from "./topographicClassification.js";
import {
  DEFAULT_TOPOGRAPHIC_PREPROCESSING_MODE,
  TOPOGRAPHIC_AMPLIFICATION_FACTORS,
  TOPOGRAPHIC_CLASSIFICATION_MODES,
  TOPOGRAPHIC_PREPROCESSING_MODES,
} from "./topographicClassification.constants.js";

export interface Ntc2018TopographicClassificationReferences {
  ntc2018: string;
  method: string;
  terrainModel: string;
}

export const NTC2018_TOPOGRAPHIC_CLASSIFICATION_REFERENCES = Object.freeze({
  ntc2018: "D.M. 17 gennaio 2018, NTC 2018, §3.2.2, Table 3.2.III and Table 3.2.V",
  method:
    "Mascandola, Luzi, Felicetta, Pacor (2021), Soil Dynamics and Earthquake Engineering 148, 106848, DOI 10.1016/j.soildyn.2021.106848",
  terrainModel: "Tarquini et al. (2023), TINITALY v1.1, DOI 10.13127/tinitaly/1.1",
});

export interface Ntc2018TopographicClassificationMethod {
  id: string;
  rawCellSizeM: number;
  workingCellSizeM: number;
  fullScaleRadiusM: number;
  supportedGridSizes: readonly number[];
  defaultPreprocessingMode: string;
  amplificationFactors: Readonly<Record<string, number>>;
  references: Ntc2018TopographicClassificationReferences;
}

export const NTC2018_TOPOGRAPHIC_CLASSIFICATION_METHOD: Ntc2018TopographicClassificationMethod =
  Object.freeze({
    id: "mascandola-et-al-2021",
    rawCellSizeM: 10,
    workingCellSizeM: 40,
    fullScaleRadiusM: 500,
    supportedGridSizes: Object.freeze([51, 101]),
    defaultPreprocessingMode: DEFAULT_TOPOGRAPHIC_PREPROCESSING_MODE,
    amplificationFactors: Object.freeze({ ...TOPOGRAPHIC_AMPLIFICATION_FACTORS }),
    references: NTC2018_TOPOGRAPHIC_CLASSIFICATION_REFERENCES,
  });

interface ClassificationModelCell {
  row: number;
  col: number;
  x: number;
  y: number;
  rawElevation: number | null;
  isNoData: boolean;
  isInterpolated: boolean;
}

interface ClassificationSummary {
  schemaVersion: string;
  center: { latitudeDeg: number | null; longitudeDeg: number | null };
  radiusM: number;
  extentM: number;
  gridSize: number;
  spacingM: number;
  orientation: TerrainElevationGrid["orientation"];
  bounds: TerrainElevationGrid["bounds"];
  quality: TerrainElevationGrid["quality"];
  provenance: Record<string, unknown> | null;
  datasetSources: unknown[];
  sourceResolutionsM: number[];
  samplingMethods: unknown[];
}

export interface Ntc2018TopographicClassificationOptions {
  terrainGrid?: TerrainElevationGridInput | null;
  preprocessingMode?: unknown;
}

export interface Ntc2018TopographicClassificationOutputs extends Record<string, unknown> {
  schemaVersion: string;
  terrainGrid: ClassificationSummary;
  classification: TopographicClassificationResult;
}

function createClassificationModel(grid: TerrainElevationGrid): TopographicModel {
  const cells: ClassificationModelCell[] = grid.cells.map((cell) => ({
    row: cell.row,
    col: cell.column,
    x: cell.eastOffsetM,
    y: cell.northOffsetM,
    rawElevation: cell.elevationM,
    isNoData: cell.isNoData,
    isInterpolated: cell.isInterpolated,
  }));

  return {
    radiusM: grid.radiusM,
    halfExtentM: grid.extentM / 2,
    gridSize: grid.gridSize,
    spacingM: grid.spacingM,
    xMin: grid.bounds.westM,
    xMax: grid.bounds.eastM,
    yMin: grid.bounds.southM,
    yMax: grid.bounds.northM,
    cells,
    cellMap: new Map(cells.map((cell) => [`${cell.row}:${cell.col}`, cell])),
  };
}

function summarizeGrid(grid: TerrainElevationGrid): ClassificationSummary {
  const datasetSources = Array.from(new Set(grid.cells.map((cell) => cell.source).filter(Boolean)));
  const sourceResolutionsM = Array.from(
    new Set(
      grid.cells
        .map((cell) => cell.sourceResolutionM)
        .filter((value): value is number => Number.isFinite(value)),
    ),
  );
  const samplingMethods = Array.from(
    new Set(grid.cells.map((cell) => cell.samplingMethod).filter(Boolean)),
  );

  return {
    schemaVersion: grid.schemaVersion,
    center: { ...grid.center },
    radiusM: grid.radiusM,
    extentM: grid.extentM,
    gridSize: grid.gridSize,
    spacingM: grid.spacingM,
    orientation: { ...grid.orientation },
    bounds: { ...grid.bounds },
    quality: { ...grid.quality },
    provenance: grid.provenance == null ? null : { ...grid.provenance },
    datasetSources,
    sourceResolutionsM,
    samplingMethods,
  };
}

function resultStatus(
  classification: TopographicClassificationResult,
  grid: TerrainElevationGrid,
): "ok" | "not-supported" | "not-verified" {
  if (classification.isReliable && classification.class != null) {
    return "ok";
  }

  const mode = Object.values(TOPOGRAPHIC_CLASSIFICATION_MODES).find(
    (candidate) => candidate.gridSize === grid.gridSize,
  );

  if (!mode || grid.spacingM !== 10) {
    return "not-supported";
  }

  return "not-verified";
}

export function classifyNTC2018Topography({
  terrainGrid,
  preprocessingMode = DEFAULT_TOPOGRAPHIC_PREPROCESSING_MODE,
}: Ntc2018TopographicClassificationOptions = {}): CalculationResult<Ntc2018TopographicClassificationOutputs> {
  const grid = normalizeTerrainElevationGrid(terrainGrid);

  const preprocessingDefinition =
    typeof preprocessingMode === "string"
      ? TOPOGRAPHIC_PREPROCESSING_MODES[preprocessingMode]
      : undefined;
  if (!preprocessingDefinition) {
    throw new Error(`Unsupported topographic preprocessing mode: ${String(preprocessingMode)}.`);
  }

  const classification = classifyTopographyMascandola(createClassificationModel(grid), {
    preprocessingMode,
  });
  const status = resultStatus(classification, grid);

  return new CalculationResult<Ntc2018TopographicClassificationOutputs>({
    applicationId: "ntc2018-topographic-classification",
    status,
    summary:
      status === "ok"
        ? `Calculated NTC 2018 topographic category ${classification.class}.`
        : "The supplied terrain grid did not produce a reliable NTC 2018 topographic category.",
    outputs: {
      schemaVersion: "ntc2018-topographic-classification/v1",
      terrainGrid: summarizeGrid(grid),
      classification,
    },
    warnings: [...classification.warnings],
    assumptions: [
      "The supplied elevation grid represents the terrain surrounding the selected site.",
      "The calculation applies the validated Mascandola et al. (2021) raster procedure ported without changes to its numerical thresholds.",
      "The returned amplificationFactorST is the category value used by the source procedure; site-position requirements remain governed by NTC 2018 Table 3.2.V.",
    ],
    metadata: {
      method: NTC2018_TOPOGRAPHIC_CLASSIFICATION_METHOD.id,
      normativePreset: "NTC2018",
      references: { ...NTC2018_TOPOGRAPHIC_CLASSIFICATION_REFERENCES },
      inputSchemaVersion: grid.schemaVersion,
      outputSchemaVersion: "ntc2018-topographic-classification/v1",
      networkAccessPerformed: false,
    },
  });
}
