import {
  assertExplicitUnitSystem,
  createUnitResolver,
  type UnitResolver,
  type UnitSystemInput,
} from "../../../domain/units/UnitSystem.js";

const INTERNAL_UNITS = Object.freeze({ force: "N", length: "m" } as const);
type JsonRecord = Record<string, unknown>;

export interface MasonryWallOpeningsLineLoadPayload extends JsonRecord {
  value?: number;
  description?: string;
  metadata?: JsonRecord;
}

export interface MasonryWallOpeningsWallInput {
  id?: string;
  length: number;
  height: number;
  thickness: number;
  material?: unknown;
  verticalLineLoad?: unknown;
  metadata?: JsonRecord;
}

export interface MasonryWallOpeningInput {
  id?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  ringFrame?: unknown;
  lintel?: unknown;
  metadata?: JsonRecord;
}

export interface MasonryWallOpeningsSettingsInput extends JsonRecord {
  normativePreset?: string;
  stiffnessSelection?: string;
  strengthSelection?: string;
  stiffnessState?: string;
  useCorrectiveModifiers?: boolean;
  divideByConfidenceFactor?: boolean;
  residualPierWarningThreshold?: number;
}

export interface MasonryWallOpeningsModelInput {
  id: string;
  label?: string | null;
  units?: UnitSystemInput | null;
  walls?: readonly MasonryWallOpeningsWallInput[];
  openings?: readonly MasonryWallOpeningInput[];
  settings?: MasonryWallOpeningsSettingsInput;
  metadata?: JsonRecord;
}

export interface MasonryWallOpeningsNormalizedWall {
  id: string;
  index: number;
  xStart: number;
  xEnd: number;
  length: number;
  height: number;
  thickness: number;
  material: unknown;
  verticalLineLoad: unknown;
  metadata: JsonRecord;
}

export interface MasonryWallOpeningsNormalizedOpening {
  id: string;
  index: number;
  x: number;
  y: number;
  width: number;
  height: number;
  ringFrame: unknown;
  lintel: unknown;
  metadata: JsonRecord;
}

export interface MasonryWallOpeningsModelJson {
  id: string;
  label: string;
  units: { force: "N"; length: "m" };
  walls: MasonryWallOpeningsNormalizedWall[];
  openings: MasonryWallOpeningsNormalizedOpening[];
  settings: JsonRecord;
  metadata: JsonRecord;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return (
    value !== null && typeof value === "object" && Reflect.get(value, "constructor") === Object
  );
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}

function convertLineLoadPayload(payload: unknown, resolver: UnitResolver): unknown {
  if (typeof payload === "number" && Number.isFinite(payload)) {
    return resolver.lineLoad(payload);
  }

  if (!isPlainRecord(payload)) {
    return payload ?? null;
  }

  return Object.fromEntries(
    Object.entries(payload).map(([key, value]) => [
      key,
      typeof value === "number" && Number.isFinite(value)
        ? resolver.lineLoad(value)
        : isPlainRecord(value)
          ? {
              ...value,
              value:
                typeof value.value === "number" && Number.isFinite(value.value)
                  ? resolver.lineLoad(value.value)
                  : value.value,
            }
          : value,
    ]),
  );
}

function normalizeRingFrame(ringFrame: unknown, resolver: UnitResolver): unknown {
  if (!isObjectRecord(ringFrame)) {
    return ringFrame ?? null;
  }

  const profileWidthInPlane = ringFrame.profileWidthInPlane;
  return Object.assign({}, ringFrame, {
    profileWidthInPlane:
      typeof profileWidthInPlane === "number" && Number.isFinite(profileWidthInPlane)
        ? resolver.length(profileWidthInPlane)
        : (profileWidthInPlane ?? null),
  });
}

function normalizeLintel(lintel: unknown, resolver: UnitResolver): unknown {
  if (!isObjectRecord(lintel)) {
    return lintel ?? null;
  }

  const bearingLength = lintel.bearingLength;
  return Object.assign({}, lintel, {
    bearingLength:
      typeof bearingLength === "number" && Number.isFinite(bearingLength)
        ? resolver.length(bearingLength)
        : (bearingLength ?? null),
  });
}

function assertPositive(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`MasonryWallOpeningsModel requires a positive ${label}.`);
  }
}

export class MasonryWallOpeningsModel {
  readonly id: string;
  readonly label: string;
  readonly units = INTERNAL_UNITS;
  readonly walls: MasonryWallOpeningsNormalizedWall[];
  readonly openings: MasonryWallOpeningsNormalizedOpening[];
  readonly settings: JsonRecord;
  readonly metadata: JsonRecord;

  constructor({
    id,
    label = null,
    units = null,
    walls = [],
    openings = [],
    settings = {},
    metadata = {},
  }: MasonryWallOpeningsModelInput) {
    if (!id) {
      throw new Error("A masonry wall openings model id is required.");
    }

    assertExplicitUnitSystem(units, "MasonryWallOpeningsModel");
    const unitResolver = createUnitResolver(units, INTERNAL_UNITS);
    let cursor = 0;

    this.id = id;
    this.label = label ?? id;
    this.walls = walls.map((wall, index) => {
      const resolvedLength = unitResolver.length(wall.length);
      const resolvedHeight = unitResolver.length(wall.height);
      const resolvedThickness = unitResolver.length(wall.thickness);

      assertPositive(resolvedLength, `walls[${index}].length`);
      assertPositive(resolvedHeight, `walls[${index}].height`);
      assertPositive(resolvedThickness, `walls[${index}].thickness`);

      const normalizedWall: MasonryWallOpeningsNormalizedWall = {
        id: wall.id ?? `wall-${index + 1}`,
        index,
        xStart: cursor,
        xEnd: cursor + resolvedLength,
        length: resolvedLength,
        height: resolvedHeight,
        thickness: resolvedThickness,
        material: wall.material ?? null,
        verticalLineLoad: convertLineLoadPayload(wall.verticalLineLoad, unitResolver),
        metadata: { ...(wall.metadata ?? {}) },
      };

      cursor = normalizedWall.xEnd;
      return normalizedWall;
    });

    if (this.walls.length === 0) {
      throw new Error("MasonryWallOpeningsModel requires at least one wall.");
    }

    this.openings = openings.map((opening, index) => {
      const resolvedX = unitResolver.length(opening.x);
      const resolvedY = unitResolver.length(opening.y);
      const resolvedWidth = unitResolver.length(opening.width);
      const resolvedHeight = unitResolver.length(opening.height);

      if (!Number.isFinite(resolvedX)) {
        throw new Error(`MasonryWallOpeningsModel requires a finite openings[${index}].x.`);
      }

      if (!Number.isFinite(resolvedY)) {
        throw new Error(`MasonryWallOpeningsModel requires a finite openings[${index}].y.`);
      }

      assertPositive(resolvedWidth, `openings[${index}].width`);
      assertPositive(resolvedHeight, `openings[${index}].height`);

      return {
        id: opening.id ?? `opening-${index + 1}`,
        index,
        x: resolvedX,
        y: resolvedY,
        width: resolvedWidth,
        height: resolvedHeight,
        ringFrame: normalizeRingFrame(opening.ringFrame, unitResolver),
        lintel: normalizeLintel(opening.lintel, unitResolver),
        metadata: { ...(opening.metadata ?? {}) },
      };
    });

    const residualPierWarningThreshold =
      typeof settings.residualPierWarningThreshold === "number" &&
      Number.isFinite(settings.residualPierWarningThreshold)
        ? unitResolver.length(settings.residualPierWarningThreshold)
        : 0.5;

    this.settings = {
      normativePreset: settings.normativePreset ?? "tuscany-openings-2022",
      stiffnessSelection: settings.stiffnessSelection ?? "mean",
      strengthSelection: settings.strengthSelection ?? "mean",
      stiffnessState: settings.stiffnessState ?? "cracked",
      useCorrectiveModifiers: settings.useCorrectiveModifiers ?? true,
      divideByConfidenceFactor: settings.divideByConfidenceFactor ?? false,
      ...settings,
      residualPierWarningThreshold,
    };
    this.metadata = {
      ...metadata,
      unitSystem: INTERNAL_UNITS,
      sourceUnitSystem: unitResolver.sourceUnitSystem,
    };
  }

  totalLength(): number {
    return this.walls.at(-1)?.xEnd ?? 0;
  }

  maxHeight(): number {
    return this.walls.reduce((selected, wall) => Math.max(selected, wall.height), 0);
  }

  openingEnvelope(opening: { x: number; y: number; width: number; height: number }): {
    xStart: number;
    xEnd: number;
    yStart: number;
    yEnd: number;
  } {
    return {
      xStart: opening.x,
      xEnd: opening.x + opening.width,
      yStart: opening.y,
      yEnd: opening.y + opening.height,
    };
  }

  toJSON(): MasonryWallOpeningsModelJson {
    return {
      id: this.id,
      label: this.label,
      units: { ...this.units },
      walls: this.walls.map((wall) => ({ ...wall })),
      openings: this.openings.map((opening) => ({ ...opening })),
      settings: { ...this.settings },
      metadata: { ...this.metadata },
    };
  }
}
