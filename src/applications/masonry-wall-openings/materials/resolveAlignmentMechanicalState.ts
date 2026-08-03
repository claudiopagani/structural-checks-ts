import { uniqueStrings } from "../../../core/results/checkUtils.js";
import {
  MasonryWallOpeningsModel,
  type MasonryWallOpeningsNormalizedOpening,
  type MasonryWallOpeningsNormalizedWall,
} from "../models/MasonryWallOpeningsModel.js";
import { resolveMasonryStageMaterial } from "./resolveMasonryStageMaterial.js";

type JsonRecord = Record<string, unknown>;

export interface AlignmentMechanicalStateOptions extends JsonRecord {
  normativePreset?: string;
  materialNormativePreset?: string;
  stiffnessSelection?: string;
  strengthSelection?: string;
  stiffnessState?: string;
  useCorrectiveModifiers?: boolean;
  divideByConfidenceFactor?: boolean;
  wallMaterialOverrides?: JsonRecord;
  materialOverridesByWallId?: JsonRecord;
  materialOverrides?: JsonRecord;
}

export interface ResolveAlignmentMechanicalStateInput {
  alignment?: unknown;
  stage?: string;
  options?: AlignmentMechanicalStateOptions;
}

export interface AlignmentMechanicalStateWall {
  wallId: string;
  material: JsonRecord | null;
  adoptedProperties: JsonRecord;
  metadata: JsonRecord;
}

export interface AlignmentMechanicalStateResolution {
  stage: string;
  settings: AlignmentMechanicalStateOptions;
  alignment: MasonryWallOpeningsModel;
  walls: AlignmentMechanicalStateWall[];
  warnings: string[];
  assumptions: string[];
  metadata: JsonRecord;
}

interface CompatibleAlignment {
  id: string;
  label: string;
  units: { force: "N"; length: "m" };
  walls: readonly MasonryWallOpeningsNormalizedWall[];
  openings: readonly MasonryWallOpeningsNormalizedOpening[];
  settings: JsonRecord;
  metadata: JsonRecord;
  totalLength: () => number;
}

interface ResolvedWall extends MasonryWallOpeningsNormalizedWall {
  material: JsonRecord | null;
  mechanicalState: JsonRecord;
  adoptedProperties: JsonRecord | null;
}

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && (typeof value === "object" || typeof value === "function");
}

function read(value: unknown, key: string): unknown {
  return isRecord(value) ? value[key] : undefined;
}

function isCompatibleAlignment(value: unknown): value is CompatibleAlignment {
  return isRecord(value) && typeof value.totalLength === "function";
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function optionalBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function resolveStageSettings(
  alignment: CompatibleAlignment,
  options: AlignmentMechanicalStateOptions = {},
): AlignmentMechanicalStateOptions {
  return {
    normativePreset:
      options.normativePreset ??
      options.materialNormativePreset ??
      optionalString(alignment.settings.normativePreset) ??
      "tuscany-openings-2022",
    stiffnessSelection:
      options.stiffnessSelection ?? optionalString(alignment.settings.stiffnessSelection) ?? "mean",
    strengthSelection:
      options.strengthSelection ?? optionalString(alignment.settings.strengthSelection) ?? "mean",
    stiffnessState:
      options.stiffnessState ?? optionalString(alignment.settings.stiffnessState) ?? "cracked",
    useCorrectiveModifiers:
      options.useCorrectiveModifiers ??
      optionalBoolean(alignment.settings.useCorrectiveModifiers) ??
      true,
    divideByConfidenceFactor:
      options.divideByConfidenceFactor ??
      optionalBoolean(alignment.settings.divideByConfidenceFactor) ??
      false,
  };
}

function resolveWallOverride(options: AlignmentMechanicalStateOptions, wallId: string): unknown {
  const sources = [
    options.wallMaterialOverrides,
    options.materialOverridesByWallId,
    options.materialOverrides,
  ];

  for (const source of sources) {
    const value = read(source, wallId);
    if (value != null) {
      return value;
    }
  }

  return null;
}

function createResolvedAlignmentModel(
  alignment: CompatibleAlignment,
  resolvedWalls: readonly ResolvedWall[],
  settings: AlignmentMechanicalStateOptions,
): MasonryWallOpeningsModel {
  return new MasonryWallOpeningsModel({
    id: alignment.id,
    label: alignment.label,
    units: alignment.units,
    walls: resolvedWalls.map((wall, index) => ({
      id: wall.id,
      length: wall.length,
      height: wall.height,
      thickness: wall.thickness,
      material: wall.material,
      verticalLineLoad: wall.verticalLineLoad,
      metadata: {
        ...(alignment.walls[index]?.metadata ?? {}),
      },
    })),
    openings: alignment.openings.map((opening) => ({
      id: opening.id,
      x: opening.x,
      y: opening.y,
      width: opening.width,
      height: opening.height,
      ringFrame: opening.ringFrame,
      lintel: opening.lintel,
      metadata: {
        ...(opening.metadata ?? {}),
      },
    })),
    settings: {
      ...alignment.settings,
      ...settings,
    },
    metadata: {
      ...alignment.metadata,
    },
  });
}

export function resolveAlignmentMechanicalState({
  alignment,
  stage = "design",
  options = {},
}: ResolveAlignmentMechanicalStateInput = {}): AlignmentMechanicalStateResolution {
  if (!isCompatibleAlignment(alignment)) {
    throw new Error(
      "resolveAlignmentMechanicalState requires a MasonryWallOpeningsModel-compatible alignment.",
    );
  }

  const settings = resolveStageSettings(alignment, options);
  const warnings: string[] = [];
  const assumptions: string[] = [
    "The first mechanical-state resolver distinguishes state-of-fact and design by selecting stage-specific masonry property sets when available, while preserving the original wall geometry and load definition.",
    "If no dedicated stage-specific property set exists, the resolver falls back to the best available base or direct masonry properties and traces that fallback in warnings.",
  ];
  const resolvedWalls: ResolvedWall[] = alignment.walls.map((wall) => {
    const resolution = resolveMasonryStageMaterial({
      material: wall.material,
      stage,
      settings,
      override: resolveWallOverride(options, wall.id),
      targetUnits: alignment.units,
      contextId: wall.id,
    });

    warnings.push(...resolution.warnings);
    assumptions.push(...resolution.assumptions);

    return {
      ...wall,
      material: resolution.material,
      mechanicalState: resolution.metadata,
      adoptedProperties: resolution.resolvedProperties,
    };
  });
  const resolvedAlignment = createResolvedAlignmentModel(alignment, resolvedWalls, settings);

  return {
    stage,
    settings,
    alignment: resolvedAlignment,
    walls: resolvedWalls.map((wall) => ({
      wallId: wall.id,
      material: wall.material,
      adoptedProperties: { ...(wall.adoptedProperties ?? {}) },
      metadata: { ...(wall.mechanicalState ?? {}) },
    })),
    warnings: uniqueStrings(warnings),
    assumptions: uniqueStrings(assumptions),
    metadata: {
      stage,
      normativePreset: settings.normativePreset,
      stiffnessSelection: settings.stiffnessSelection,
      strengthSelection: settings.strengthSelection,
      stiffnessState: settings.stiffnessState,
      useCorrectiveModifiers: settings.useCorrectiveModifiers,
      divideByConfidenceFactor: settings.divideByConfidenceFactor,
      wallCount: resolvedWalls.length,
    },
  };
}
