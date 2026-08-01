import type { CrossSection, SectionMetadata } from "../geometry/CrossSection.js";
import {
  createUnitResolver,
  type UnitResolver,
  type UnitSystem,
  type UnitSystemInput,
} from "../units/UnitSystem.js";
import { ReinforcementBar, type ReinforcementGrade } from "./ReinforcementBar.js";

const INTERNAL_UNITS = Object.freeze({ force: "N", length: "mm" }) satisfies UnitSystem;

export type ReinforcementFace = "bottom" | "top";

export interface LongitudinalReinforcementLayerInput {
  id?: string;
  name?: string;
  count?: number;
  number?: number;
  bars?: number;
  diameter?: number;
  cover?: number;
  zStart?: number | null;
  zEnd?: number | null;
  material?: unknown;
  grade?: ReinforcementGrade;
  metadata?: SectionMetadata;
}

export interface LongitudinalReinforcementGroup {
  id: string;
  name: string;
  face: ReinforcementFace;
  barIds: string[];
  diameter: number;
  count: number;
  cover: number;
  longitudinalReinforcementArea: number;
}

export interface LongitudinalReinforcementLayout {
  reinforcementBars: ReinforcementBar[];
  longitudinalReinforcementGroups: LongitudinalReinforcementGroup[];
  metadata: {
    generatedBy: "createLongitudinalReinforcementLayout";
    hasGeneratedTopLayer: boolean;
    hasGeneratedBottomLayer: boolean;
  };
}

export interface LongitudinalReinforcementLayoutOptions {
  section?: CrossSection & {
    flangeWidth?: number;
    webWidth?: number;
  };
  material?: unknown;
  units?: UnitSystemInput | null;
  top?: LongitudinalReinforcementLayerInput | null;
  bottom?: LongitudinalReinforcementLayerInput | null;
  additionalBars?: ReinforcementBar[];
  groups?: LongitudinalReinforcementGroup[];
}

interface ResolvedLayer {
  id: string;
  name: string;
  face: ReinforcementFace;
  count: number;
  diameter: number;
  cover: number;
  zStart: number | null;
  zEnd: number | null;
  material: unknown;
  grade: ReinforcementGrade;
  metadata: SectionMetadata;
}

interface BarPosition {
  y: number;
  z: number;
}

function isFinitePositive(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function resolveLayer(
  input: LongitudinalReinforcementLayerInput | null | undefined,
  face: ReinforcementFace,
): ResolvedLayer | null {
  if (!input) {
    return null;
  }

  const count = input.count ?? input.number ?? input.bars;

  if (!isFinitePositive(count) || !Number.isInteger(count)) {
    throw new Error(`Longitudinal ${face} reinforcement requires a positive integer count.`);
  }

  if (!isFinitePositive(input.diameter)) {
    throw new Error(`Longitudinal ${face} reinforcement requires a positive diameter.`);
  }

  if (!isFinitePositive(input.cover)) {
    throw new Error(`Longitudinal ${face} reinforcement requires a positive cover.`);
  }

  return {
    id: input.id ?? face,
    name: input.name ?? `${face} longitudinal reinforcement`,
    face,
    count,
    diameter: input.diameter,
    cover: input.cover,
    zStart: input.zStart ?? null,
    zEnd: input.zEnd ?? null,
    material: input.material ?? null,
    grade: input.grade ?? "B450C",
    metadata: input.metadata ?? {},
  };
}

function widthAtFace(
  section: NonNullable<LongitudinalReinforcementLayoutOptions["section"]>,
  face: ReinforcementFace,
): number | null | undefined {
  if (face === "top") {
    return section.flangeWidth ?? section.width;
  }

  if (face === "bottom") {
    return section.webWidth ?? section.width;
  }

  return section.width;
}

function zOffsetAtFace(
  section: NonNullable<LongitudinalReinforcementLayoutOptions["section"]>,
  face: ReinforcementFace,
  width: number,
): number {
  if (face === "bottom" && Number.isFinite(section.webWidth) && Number.isFinite(section.width)) {
    return (Number(section.width) - width) / 2;
  }

  return 0;
}

function barPositionsForLayer({
  section,
  layer,
  resolver,
}: {
  section: NonNullable<LongitudinalReinforcementLayoutOptions["section"]>;
  layer: ResolvedLayer;
  resolver: UnitResolver;
}): BarPosition[] {
  const width = widthAtFace(section, layer.face);

  if (!isFinitePositive(width)) {
    throw new Error(`Cannot derive ${layer.face} reinforcement width for this section.`);
  }

  const diameter = resolver.length(layer.diameter);
  const cover = resolver.length(layer.cover);
  const y =
    layer.face === "bottom" ? cover + diameter / 2 : Number(section.height) - cover - diameter / 2;
  const zStart =
    layer.zStart == null
      ? zOffsetAtFace(section, layer.face, width) + cover + diameter / 2
      : resolver.length(layer.zStart);
  const zEnd =
    layer.zEnd == null
      ? zOffsetAtFace(section, layer.face, width) + width - cover - diameter / 2
      : resolver.length(layer.zEnd);

  if (!Number.isFinite(y) || y < 0 || y > Number(section.height)) {
    throw new Error(`Computed ${layer.face} reinforcement y coordinate is outside the section.`);
  }

  if (!Number.isFinite(zStart) || !Number.isFinite(zEnd) || zStart > zEnd) {
    throw new Error(`Computed ${layer.face} reinforcement z coordinates are invalid.`);
  }

  if (layer.count === 1) {
    return [
      {
        y,
        z: (zStart + zEnd) / 2,
      },
    ];
  }

  const spacing = (zEnd - zStart) / (layer.count - 1);

  return Array.from({ length: layer.count }, (_, index) => ({
    y,
    z: zStart + index * spacing,
  }));
}

function createBarsForLayer({
  section,
  layer,
  material,
  units,
}: {
  section: NonNullable<LongitudinalReinforcementLayoutOptions["section"]>;
  layer: ResolvedLayer;
  material: unknown;
  units: UnitSystemInput | null;
}): { bars: ReinforcementBar[]; group: LongitudinalReinforcementGroup } {
  const resolver = createUnitResolver(units, INTERNAL_UNITS);
  const positions = barPositionsForLayer({ section, layer, resolver });
  const diameter = resolver.length(layer.diameter);
  const bars = positions.map(
    (position, index) =>
      new ReinforcementBar({
        id: `${layer.id}-${index + 1}`,
        name: `${layer.name} ${index + 1}`,
        diameter,
        grade: layer.grade,
        material: layer.material ?? material,
        y: position.y,
        z: position.z,
        units: INTERNAL_UNITS,
        metadata: {
          ...layer.metadata,
          face: layer.face,
          generatedBy: "createLongitudinalReinforcementLayout",
          layerId: layer.id,
        },
      }),
  );

  return {
    bars,
    group: {
      id: layer.id,
      name: layer.name,
      face: layer.face,
      barIds: bars.map((bar) => bar.id as string),
      diameter,
      count: layer.count,
      cover: resolver.length(layer.cover),
      longitudinalReinforcementArea: bars.reduce((sum, bar) => sum + bar.area, 0),
    },
  };
}

export function createLongitudinalReinforcementLayout({
  section,
  material = null,
  units,
  top = null,
  bottom = null,
  additionalBars = [],
  groups = [],
}: LongitudinalReinforcementLayoutOptions = {}): LongitudinalReinforcementLayout {
  if (!section) {
    throw new Error("createLongitudinalReinforcementLayout requires a concrete section.");
  }

  const resolvedUnits =
    units === undefined
      ? ((section.metadata.unitSystem as UnitSystemInput | null | undefined) ?? INTERNAL_UNITS)
      : units;
  const layers = [resolveLayer(bottom, "bottom"), resolveLayer(top, "top")].filter(
    (layer): layer is ResolvedLayer => layer !== null,
  );
  const generated = layers.map((layer) =>
    createBarsForLayer({
      section,
      layer,
      material,
      units: resolvedUnits,
    }),
  );
  const generatedBars = generated.flatMap((item) => item.bars);
  const generatedGroups = generated.map((item) => item.group);

  return {
    reinforcementBars: [...generatedBars, ...additionalBars],
    longitudinalReinforcementGroups: [...generatedGroups, ...groups],
    metadata: {
      generatedBy: "createLongitudinalReinforcementLayout",
      hasGeneratedTopLayer: Boolean(top),
      hasGeneratedBottomLayer: Boolean(bottom),
    },
  };
}
