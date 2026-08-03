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
    throw new Error(`MasonryWallPierModel requires a finite non-negative ${label}.`);
  }
}

function assertFinitePositive(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`MasonryWallPierModel requires a finite positive ${label}.`);
  }
}

export interface MasonryWallPierModelInput {
  id: string;
  wallId: string;
  sourceWallIds?: readonly string[];
  alignmentId: string;
  x: number;
  length: number;
  effectiveLength?: number | null;
  height: number;
  thickness: number;
  material?: unknown;
  tributaryVerticalLoad?: number;
  tributaryLoadByWall?: JsonRecord;
  deformableHeight?: number | null;
  rigidBottomLength?: number;
  rigidTopLength?: number;
  topBoundaryMode?: string;
  mechanics?: JsonRecord;
  capacity?: JsonRecord;
  metadata?: JsonRecord;
}

export interface MasonryWallPierModelJson {
  id: string;
  units: { force: "N"; length: "m" };
  wallId: string;
  sourceWallIds: string[];
  alignmentId: string;
  x: number;
  length: number;
  effectiveLength: number;
  height: number;
  thickness: number;
  material: unknown;
  tributaryVerticalLoad: number;
  tributaryLoadByWall: JsonRecord;
  deformableHeight: number;
  rigidBottomLength: number;
  rigidTopLength: number;
  topBoundaryMode: string;
  mechanics: JsonRecord;
  capacity: JsonRecord;
  metadata: JsonRecord;
}

export class MasonryWallPierModel {
  readonly id: string;
  readonly units = INTERNAL_UNITS;
  readonly wallId: string;
  readonly sourceWallIds: string[];
  readonly alignmentId: string;
  readonly x: number;
  readonly length: number;
  readonly effectiveLength: number;
  readonly height: number;
  readonly thickness: number;
  readonly material: unknown;
  readonly tributaryVerticalLoad: number;
  readonly tributaryLoadByWall: JsonRecord;
  readonly deformableHeight: number;
  readonly rigidBottomLength: number;
  readonly rigidTopLength: number;
  readonly topBoundaryMode: string;
  readonly mechanics: JsonRecord;
  readonly capacity: JsonRecord;
  readonly metadata: JsonRecord;

  constructor({
    id,
    wallId,
    sourceWallIds = [],
    alignmentId,
    x,
    length,
    effectiveLength = null,
    height,
    thickness,
    material = null,
    tributaryVerticalLoad = 0,
    tributaryLoadByWall = {},
    deformableHeight = null,
    rigidBottomLength = 0,
    rigidTopLength = 0,
    topBoundaryMode = "not-resolved",
    mechanics = {},
    capacity = {},
    metadata = {},
  }: MasonryWallPierModelInput) {
    if (!id) {
      throw new Error("A masonry wall pier id is required.");
    }

    if (!wallId) {
      throw new Error("A masonry wall pier wallId is required.");
    }

    if (!alignmentId) {
      throw new Error("A masonry wall pier alignmentId is required.");
    }

    assertFiniteNonNegative(x, "x");
    assertFinitePositive(length, "length");
    assertFinitePositive(height, "height");
    assertFinitePositive(thickness, "thickness");
    assertFiniteNonNegative(rigidBottomLength, "rigidBottomLength");
    assertFiniteNonNegative(rigidTopLength, "rigidTopLength");

    const resolvedEffectiveLength = effectiveLength ?? length;
    const resolvedDeformableHeight =
      deformableHeight ?? height - rigidBottomLength - rigidTopLength;

    assertFiniteNonNegative(resolvedEffectiveLength, "effectiveLength");
    assertFinitePositive(resolvedDeformableHeight, "deformableHeight");

    this.id = id;
    this.wallId = wallId;
    this.sourceWallIds = [...new Set(sourceWallIds.length > 0 ? sourceWallIds : [wallId])];
    this.alignmentId = alignmentId;
    this.x = x;
    this.length = length;
    this.effectiveLength = resolvedEffectiveLength;
    this.height = height;
    this.thickness = thickness;
    this.material = material;
    this.tributaryVerticalLoad = tributaryVerticalLoad;
    this.tributaryLoadByWall = { ...tributaryLoadByWall };
    this.deformableHeight = resolvedDeformableHeight;
    this.rigidBottomLength = rigidBottomLength;
    this.rigidTopLength = rigidTopLength;
    this.topBoundaryMode = topBoundaryMode;
    this.mechanics = { ...mechanics };
    this.capacity = { ...capacity };
    this.metadata = { ...metadata };
  }

  xEnd(): number {
    return this.x + this.length;
  }

  toJSON(): MasonryWallPierModelJson {
    return {
      id: this.id,
      units: { ...this.units },
      wallId: this.wallId,
      sourceWallIds: [...this.sourceWallIds],
      alignmentId: this.alignmentId,
      x: this.x,
      length: this.length,
      effectiveLength: this.effectiveLength,
      height: this.height,
      thickness: this.thickness,
      material: serializeMaterial(this.material),
      tributaryVerticalLoad: this.tributaryVerticalLoad,
      tributaryLoadByWall: { ...this.tributaryLoadByWall },
      deformableHeight: this.deformableHeight,
      rigidBottomLength: this.rigidBottomLength,
      rigidTopLength: this.rigidTopLength,
      topBoundaryMode: this.topBoundaryMode,
      mechanics: { ...this.mechanics },
      capacity: { ...this.capacity },
      metadata: { ...this.metadata },
    };
  }
}
