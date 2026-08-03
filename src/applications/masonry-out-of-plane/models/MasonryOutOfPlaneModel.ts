export interface MasonryOutOfPlaneModelOptions {
  id: string;
  wall?: Record<string, unknown>;
  restraints?: Record<string, unknown>;
  macroBlocks?: readonly unknown[];
  actions?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export class MasonryOutOfPlaneModel {
  public id: string;
  public wall: Record<string, unknown>;
  public restraints: Record<string, unknown>;
  public macroBlocks: unknown[];
  public actions: Record<string, unknown>;
  public metadata: Record<string, unknown>;

  public constructor({
    id,
    wall = {},
    restraints = {},
    macroBlocks = [],
    actions = {},
    metadata = {},
  }: MasonryOutOfPlaneModelOptions) {
    if (!id) {
      throw new Error("A masonry out-of-plane model id is required.");
    }

    this.id = id;
    this.wall = { ...wall };
    this.restraints = { ...restraints };
    this.macroBlocks = [...macroBlocks];
    this.actions = { ...actions };
    this.metadata = { ...metadata };
  }
}
