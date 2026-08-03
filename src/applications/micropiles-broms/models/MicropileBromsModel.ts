export interface MicropileBromsModelOptions {
  id: unknown;
  pile?: Record<string, unknown> | null;
  soil?: Record<string, unknown> | null;
  boundaryConditions?: Record<string, unknown> | null;
  actions?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
}

export class MicropileBromsModel {
  readonly id: unknown;
  readonly pile: Record<string, unknown>;
  readonly soil: Record<string, unknown>;
  readonly boundaryConditions: Record<string, unknown>;
  readonly actions: Record<string, unknown>;
  readonly metadata: Record<string, unknown>;

  constructor({
    id,
    pile = {},
    soil = {},
    boundaryConditions = {},
    actions = {},
    metadata = {},
  }: MicropileBromsModelOptions) {
    if (!id) {
      throw new Error("A micropile Broms model id is required.");
    }

    this.id = id;
    this.pile = { ...pile };
    this.soil = { ...soil };
    this.boundaryConditions = { ...boundaryConditions };
    this.actions = { ...actions };
    this.metadata = { ...metadata };
  }
}
