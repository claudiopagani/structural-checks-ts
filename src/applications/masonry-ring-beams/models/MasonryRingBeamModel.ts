type JsonRecord = Record<string, unknown>;

export interface MasonryRingBeamModelInput {
  id: string;
  opening?: unknown;
  wall?: unknown;
  reinforcementScheme?: unknown;
  loadPath?: JsonRecord;
  metadata?: JsonRecord;
}

export class MasonryRingBeamModel {
  readonly id: string;
  readonly opening: unknown;
  readonly wall: unknown;
  readonly reinforcementScheme: unknown;
  readonly loadPath: JsonRecord;
  readonly metadata: JsonRecord;

  constructor({
    id,
    opening = null,
    wall = null,
    reinforcementScheme = null,
    loadPath = {},
    metadata = {},
  }: MasonryRingBeamModelInput) {
    if (!id) {
      throw new Error("A masonry ring beam model id is required.");
    }

    this.id = id;
    this.opening = opening;
    this.wall = wall;
    this.reinforcementScheme = reinforcementScheme;
    this.loadPath = { ...loadPath };
    this.metadata = { ...metadata };
  }
}
