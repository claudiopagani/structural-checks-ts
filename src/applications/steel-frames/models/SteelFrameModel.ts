// Mechanical TypeScript migration from strutture-js 6f33baead8b88166c4b2cf94af41763412e3c751; source path: src/applications/steel-frames/models/SteelFrameModel.js.

export interface SteelFrameModelOptions {
  id?: unknown;
  frameModel?: unknown;
  members?: readonly unknown[];
  loadCombinations?: readonly unknown[];
  serviceClass?: unknown;
  metadata?: Record<string, unknown>;
}

export class SteelFrameModel {
  id: unknown;
  frameModel: unknown;
  members: unknown[];
  loadCombinations: unknown[];
  serviceClass: unknown;
  metadata: Record<string, unknown>;

  constructor({
    id,
    frameModel = null,
    members = [],
    loadCombinations = [],
    serviceClass = null,
    metadata = {},
  }: SteelFrameModelOptions) {
    if (!id) {
      throw new Error("A steel frame model id is required.");
    }

    this.id = id;
    this.frameModel = frameModel;
    this.members = [...members];
    this.loadCombinations = [...loadCombinations];
    this.serviceClass = serviceClass;
    this.metadata = { ...metadata };
  }
}
