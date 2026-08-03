const INTERNAL_UNITS = Object.freeze({ force: "N", length: "m" } as const);

type JsonRecord = Record<string, unknown>;

interface ToJsonCapable {
  toJSON(): unknown;
}

function isToJsonCapable(value: unknown): value is ToJsonCapable {
  return (
    value !== null &&
    (typeof value === "object" || typeof value === "function") &&
    "toJSON" in value &&
    typeof value.toJSON === "function"
  );
}

function serializeMaterial(material: unknown): unknown {
  return isToJsonCapable(material) ? material.toJSON() : material;
}

function assertFiniteNonNegative(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`MasonryWallSpandrelModel requires a finite non-negative ${label}.`);
  }
}

function assertFinitePositive(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`MasonryWallSpandrelModel requires a finite positive ${label}.`);
  }
}

export interface MasonryWallSpandrelModelInput {
  id: string;
  alignmentId: string;
  xStart: number;
  xEnd: number;
  height: number;
  thickness: number;
  material?: unknown;
  sourceWallIds?: readonly string[];
  deformableLength?: number | null;
  rigidLeftLength?: number;
  rigidRightLength?: number;
  mechanics?: JsonRecord;
  metadata?: JsonRecord;
}

export interface MasonryWallSpandrelModelJson {
  id: string;
  units: { force: "N"; length: "m" };
  alignmentId: string;
  xStart: number;
  xEnd: number;
  height: number;
  thickness: number;
  material: unknown;
  sourceWallIds: string[];
  deformableLength: number;
  rigidLeftLength: number;
  rigidRightLength: number;
  mechanics: JsonRecord;
  metadata: JsonRecord;
}

export class MasonryWallSpandrelModel {
  readonly id: string;
  readonly units = INTERNAL_UNITS;
  readonly alignmentId: string;
  readonly xStart: number;
  readonly xEnd: number;
  readonly height: number;
  readonly thickness: number;
  readonly material: unknown;
  readonly sourceWallIds: string[];
  readonly deformableLength: number;
  readonly rigidLeftLength: number;
  readonly rigidRightLength: number;
  readonly mechanics: JsonRecord;
  readonly metadata: JsonRecord;

  constructor({
    id,
    alignmentId,
    xStart,
    xEnd,
    height,
    thickness,
    material = null,
    sourceWallIds = [],
    deformableLength = null,
    rigidLeftLength = 0,
    rigidRightLength = 0,
    mechanics = {},
    metadata = {},
  }: MasonryWallSpandrelModelInput) {
    if (!id) {
      throw new Error("A masonry wall spandrel id is required.");
    }

    if (!alignmentId) {
      throw new Error("A masonry wall spandrel alignmentId is required.");
    }

    assertFiniteNonNegative(xStart, "xStart");
    assertFinitePositive(xEnd - xStart, "length");
    assertFinitePositive(height, "height");
    assertFinitePositive(thickness, "thickness");
    assertFiniteNonNegative(rigidLeftLength, "rigidLeftLength");
    assertFiniteNonNegative(rigidRightLength, "rigidRightLength");

    const resolvedDeformableLength = deformableLength ?? xEnd - xStart;

    assertFinitePositive(resolvedDeformableLength, "deformableLength");

    this.id = id;
    this.alignmentId = alignmentId;
    this.xStart = xStart;
    this.xEnd = xEnd;
    this.height = height;
    this.thickness = thickness;
    this.material = material;
    this.sourceWallIds = [...new Set(sourceWallIds)];
    this.deformableLength = resolvedDeformableLength;
    this.rigidLeftLength = rigidLeftLength;
    this.rigidRightLength = rigidRightLength;
    this.mechanics = { ...mechanics };
    this.metadata = { ...metadata };
  }

  length(): number {
    return this.xEnd - this.xStart;
  }

  toJSON(): MasonryWallSpandrelModelJson {
    return {
      id: this.id,
      units: { ...this.units },
      alignmentId: this.alignmentId,
      xStart: this.xStart,
      xEnd: this.xEnd,
      height: this.height,
      thickness: this.thickness,
      material: serializeMaterial(this.material),
      sourceWallIds: [...this.sourceWallIds],
      deformableLength: this.deformableLength,
      rigidLeftLength: this.rigidLeftLength,
      rigidRightLength: this.rigidRightLength,
      mechanics: { ...this.mechanics },
      metadata: { ...this.metadata },
    };
  }
}
